import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { openStore, parseWorkflow } from "./store.js";
import { buildPalette } from "./palette.js";
import { Run } from "./run.js";
import { parseCron, newToken, startScheduler, webhookAllowed } from "./triggers.js";
import { timingSafeEqual, createHash } from "node:crypto";

/**
 * Workflow — a layer-3 app plugin.
 *
 * The Console's Workflow app drew a real graph and ran a fake. Its `runGraph`
 * was an animation: `dur` was a displayed latency nobody measured, and the item
 * counts came from a `base` constant multiplied by a per-node `ratio`. The only
 * honest thing in it was the approval gate on writes, which is kept and made
 * load-bearing.
 *
 * Execution lives on the host rather than in the browser because a workflow has
 * to be able to run when no browser is open — a schedule that only fires while
 * a tab is focused is not a schedule.
 *
 * @module @magna/app-workflow
 */

export const name = "magna-app-workflow";

/**
 * `magnaOS` for registration, `tools` for the palette and tool dispatch,
 * `storageDomain` for durable definitions.
 *
 * All three are hard requirements. Without the tool registry there is no
 * palette, and a palette that guessed would be exactly the dummy data this
 * replaces. Without durable storage a scheduled workflow would not survive the
 * restart between being written and being due.
 *
 * Cordis enforces this list — reading `ctx.storageDomain` without declaring it
 * throws "cannot get property without inject", which is how the first version
 * of this plugin silently fell back to memory. Declaring a service that is NOT
 * mounted is the opposite failure (the plugin waits forever and never
 * activates, the way `workflowEngine` would), so each was checked against the
 * web profile's composition first: `storage-domain` is inserted at the root
 * plane with `backend: json` and is not disabled.
 *
 * `llm` and `codeRuntime` are deliberately NOT injected. Both are optional
 * capabilities — a composition without them should still get a working
 * workflow app with everything else — so they are resolved defensively at call
 * time and their nodes report honestly when they are absent.
 */
export const inject = ["magnaOS", "tools", "storageDomain"];

const HERE = dirname(fileURLToPath(import.meta.url));

/** How long an unanswered approval waits before the run gives up. */
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

/* U+2028 and U+2029 are legal inside a JSON string but are LINE TERMINATORS in
   JavaScript source, so a value carrying one breaks any program it is spliced
   into. They are built from their code points rather than written literally
   because a raw U+2028 in a regex literal is itself a syntax error — this file
   would not parse. */
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

let seq = 0;
const nextId = (p) => p + Date.now().toString(36) + "-" + (++seq).toString(36);

export async function apply(ctx) {
  const os = ctx.magnaOS;
  const store = await openStore(ctx);

  ctx.effect(() => () => { store.close().catch(() => {}); }, "app-workflow: close storage domain");

  /* Live runs, by run id. A run is in memory while it executes and in the
     store once it finishes; the browser reads both through `runStatus`. */
  const live = new Map();

  /* ---- optional services ------------------------------------------------
     Resolved through ctx.get rather than inject, so their absence degrades one
     node type instead of preventing the whole app from activating. */
  function optional(key) {
    try { return ctx.get ? ctx.get(key) : null; } catch { return null; }
  }

  /* ---- palette ---------------------------------------------------------- */

  function palette() {
    let schemas = [];
    try {
      schemas = ctx.tools.schemas();
    } catch (e) {
      console.error("[app-workflow] could not read the tool registry:", e.message);
    }
    return buildPalette(schemas, os.apps());
  }

  /** Providers and models that actually exist, for the AI node's selectors. */
  async function modelChoices() {
    const llm = optional("llm");
    if (!llm) return [];
    const out = [];
    try {
      for (const p of llm.listProviders()) {
        /* `LlmProviderInfo` is {id, name} where `id` is the ROUTE KEY and
           `name` is the human label. Passing the label to listModels() meant
           every provider with a display name — Ollama ("Ollama (local)"),
           DeepSeek — threw, was swallowed by the catch, and silently vanished
           from the picker. Only the two providers whose label happens to equal
           their id survived, which is why the list looked plausible.

           The id is also what `llm.stream({provider})` routes on, so the
           choice string has to carry the id, not the label. */
        const route = p.id || p.provider || p.name;
        let models = [];
        try { models = await llm.listModels(route); }
        catch (e) { console.error("[app-workflow] " + route + ": " + e.message); models = []; }
        for (const m of models.slice(0, 60)) {
          out.push(route + " / " + (m.id || m.name));
        }
      }
    } catch (e) {
      console.error("[app-workflow] could not list models:", e.message);
    }
    return out;
  }

  /**
   * Resolve a `pick` field into real options.
   *
   * The field says which command to call and which properties are the value and
   * the label; this calls it. Options therefore reflect what exists at the
   * moment the palette is read — pick a document in a workflow, delete it, and
   * reopening the workflow shows the id with no label rather than a stale name
   * that suggests it is still there.
   */
  async function resolvePick(appId, field) {
    const from = field.from || {};
    try {
      const res = await os.invoke(appId, from.command, {}, { actor: "system" });
      const list = from.list ? res[from.list] : res;
      if (!Array.isArray(list)) return { ...field, t: "sel", o: [], hint: field.hint || "" };
      const opts = list.map((row) => ({
        v: String(row[from.value || "id"] ?? ""),
        l: String(row[from.label || "name"] ?? row[from.value || "id"] ?? ""),
      })).filter((o) => o.v);
      return {
        ...field, t: "pick", o: opts,
        /* `empty` turns the blank option into a real choice — "+ New document"
           rather than "Choose…". A picker whose only entries are things that
           already exist forces the user out to another node just to make one. */
        empty: from.empty || null,
        hint: opts.length
          ? field.hint || ""
          : (from.empty ? field.hint || "" : "Nothing to choose yet — create one first."),
      };
    } catch (e) {
      return { ...field, t: "sel", o: [], hint: "Could not list options: " + e.message };
    }
  }

  async function paletteWire() {
    const cat = palette();
    const choices = await modelChoices();
    const out = {};
    for (const key of Object.keys(cat)) {
      const n = cat[key];
      let params = n.params || [];
      if (key === "ai.prompt") {
        /* The model list is generated too. An empty list means no provider is
           configured, and the node says so rather than offering a picker that
           cannot resolve to anything. */
        params = choices.length
          ? [{ k: "model", l: "Model", t: "sel", o: choices, d: choices[0] }, ...params]
          : params;
      }
      if (n.appId && params.some((f) => f.t === "pick")) {
        params = await Promise.all(params.map((f) => (f.t === "pick" ? resolvePick(n.appId, f) : f)));
      }
      out[key] = {
        g: n.g, name: n.name, icon: n.icon, tile: n.tile,
        ins: n.ins, outs: n.outs,
        access: n.access, egress: !!n.egress, why: n.why || "",
        certain: n.certain !== false,
        desc: n.desc || "",
        declaredParams: !!n.declaredParams,
        appId: n.appId || null, command: n.command || null,
        unavailable: key === "ai.prompt" && !choices.length
          ? "No model provider is configured, so this node cannot run yet."
          : (key === "code.transform" && !optional("codeRuntime")
            ? "The code runtime is not mounted in this composition."
            : null),
        params,
      };
    }
    return out;
  }

  /* ---- dispatchers ------------------------------------------------------ */

  /** Run a registered tool through the harness registry. */
  async function callTool(name, args) {
    const ac = new AbortController();
    const res = await ctx.tools.execute({
      callId: randomUUID(),
      name,
      arguments: args || {},
      signal: ac.signal,
    });
    /* The registry reports a failed tool as a field, not a rejection. Turning
       that back into a throw is what lets one `catch` in the executor handle
       every failure mode the same way. */
    if (res && res.error) throw new Error(String(res.error.message || res.error));
    return res && res.value !== undefined ? res.value : res;
  }

  /** Run an app command through the same bus a click goes through. */
  function callCommand(appId, command, args) {
    return os.invoke(appId, command, args || {}, { actor: "system" });
  }

  /** One model turn, accumulated from the stream. */
  async function callModel(prompt, opts) {
    const llm = optional("llm");
    if (!llm) throw new Error("No LLM runtime is mounted in this composition.");
    const choice = String((opts && opts.model) || "");
    const slash = choice.indexOf(" / ");
    if (slash < 0) throw new Error("Pick a model for this node first.");
    const provider = choice.slice(0, slash);
    const model = choice.slice(slash + 3);
    let text = "";
    for await (const chunk of llm.stream({
      provider, model,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      system: opts && opts.format === "json"
        ? "Reply with valid JSON only. No prose, no code fences."
        : undefined,
    })) {
      /* The chunk type is `text-delta`, not `text`. Guessing it produced a run
         that completed cleanly in 587 ms and returned an empty string — a
         success with nothing in it, which is worse than an error because
         nothing reports it.

         `reasoning-delta` is deliberately NOT accumulated: it is the model's
         scratchpad, not its answer, and folding it into the output would put
         thinking text into whatever the next node does with the value. */
      if (chunk && chunk.type === "text-delta" && chunk.text) text += chunk.text;
    }
    /* An empty completion is a failure, not a success with nothing in it.
       Without this the node went green in 410 ms having produced "", and every
       downstream node quietly received an empty string — the kind of result
       that is far harder to notice than an error. */
    if (!text.trim()) {
      throw new Error(
        "The model returned nothing. Check that " + provider + " has a working API key " +
        "(Settings → Models), or pick a locally-hosted model.",
      );
    }
    return text;
  }

  /** User JavaScript, in the harness's code runtime. */
  async function callCode(program, input) {
    const rt = optional("codeRuntime");
    if (!rt) throw new Error("The code runtime is not mounted in this composition.");
    /* `input` is injected as a literal rather than as a binding, because a
       binding is a function and the documented contract for this node is a
       plain `input` value. U+2028/2029 are escaped: both are valid inside a
       JSON string and both terminate a line in JavaScript source. */
    const lit = JSON.stringify(input === undefined ? null : input)
      .split(LINE_SEP).join("\\u2028").split(PARA_SEP).join("\\u2029");
    const res = await rt.run({
      program: "const input = " + lit + ";\n" + program,
      bindings: [],
    });
    if (res && res.error) throw new Error(res.error.message || res.error.kind || "The transform failed.");
    return res ? res.value : null;
  }

  /* ---- the approval gate ------------------------------------------------ */

  /**
   * Decide whether one node may run.
   *
   * For a manual run there is a person present, so this raises a pending
   * approval and waits for them. For a scheduled or webhook run there is
   * nobody, so it consults the capability grant that a person approved when the
   * trigger was saved — and denies if the node is not in it. It never blocks an
   * unattended run waiting for an answer that cannot come.
   */
  function makeGate(runState, workflow) {
    return async (req) => {
      if (req.trigger !== "manual") {
        const grant = workflow.grant;
        if (!grant) {
          return { allow: false, reason: "This workflow has no approved capability grant, so it cannot run unattended." };
        }
        const ok = (grant.capabilities || []).some((c) => c.nodeId === req.nodeId && c.type === req.type);
        if (!ok) {
          return {
            allow: false,
            reason: '"' + req.name + '" is not in the capability grant you approved for this trigger. ' +
                    "Open the workflow and approve it again to include this step.",
          };
        }
        return { allow: true, reason: "covered by the grant approved on " + new Date(grant.at).toISOString().slice(0, 10) };
      }

      /* Attended: ask, and wait. */
      return new Promise((res) => {
        const pending = {
          nodeId: req.nodeId, type: req.type, name: req.name,
          access: req.access, egress: req.egress, why: req.why,
          params: redact(req.params),
          asked: Date.now(),
        };
        const timer = setTimeout(() => {
          runState.pending = null;
          res({ allow: false, reason: "Nobody answered within 10 minutes, so the run stopped." });
        }, APPROVAL_TIMEOUT_MS);
        pending.resolve = (allow, reason) => {
          clearTimeout(timer);
          runState.pending = null;
          res({ allow, reason });
        };
        runState.pending = pending;
      });
    };
  }

  /* ---- running ---------------------------------------------------------- */

  async function startRun(workflow, trigger, payload) {
    const runId = nextId("run");
    const cat = palette();
    const state = {
      id: runId, workflowId: workflow.id, name: workflow.name,
      status: "running", startedAt: Date.now(), endedAt: null,
      trigger, steps: [], events: [], pending: null, error: null,
    };
    live.set(runId, state);

    const run = new Run({
      id: runId,
      workflow, palette: cat, trigger,
      gate: makeGate(state, workflow),
      exec: { tool: callTool, command: callCommand },
      model: callModel,
      code: callCode,
      onEvent: (ev) => {
        state.events.push(ev);
        if (state.events.length > 400) state.events.shift();
        if (ev.type === "node") {
          const s = state.steps.find((x) => x.nodeId === ev.nodeId);
          if (s) Object.assign(s, { status: ev.status, summary: ev.summary, error: ev.error });
          else state.steps.push({ nodeId: ev.nodeId, status: ev.status, summary: ev.summary, error: ev.error, startedAt: ev.at, endedAt: null });
        }
      },
    });
    run.triggerPayload = payload === undefined ? null : payload;
    state.cancel = () => run.cancel();

    os.observe({
      appId: "workflow", verb: "run", target: workflow.id,
      summary: 'ran workflow "' + workflow.name + '" (' + trigger + ")",
      entities: ["workflow:" + workflow.id],
      actor: trigger === "manual" ? "human" : "system",
    });

    /* Not awaited: the browser gets the run id immediately and polls. An
       awaited run would hold the HTTP request open for the whole workflow,
       which for a scheduled job could be minutes. */
    run.start().then(
      (out) => finishRun(state, out.status, out.error, out.steps),
      (e) => finishRun(state, "failed", e.message, run.steps),
    );

    return { runId };
  }

  async function finishRun(state, status, error, steps) {
    state.status = status;
    state.error = error || null;
    state.endedAt = Date.now();
    if (steps) state.steps = steps;
    try {
      await store.putRun({
        id: state.id, workflowId: state.workflowId,
        startedAt: state.startedAt, endedAt: state.endedAt,
        status, trigger: state.trigger,
        steps: state.steps.map((s) => ({
          nodeId: s.nodeId, type: s.type || "", status: s.status,
          startedAt: s.startedAt || state.startedAt, endedAt: s.endedAt || state.endedAt,
          summary: s.summary || "", error: s.error || null,
        })),
        error: error || null,
      });
    } catch (e) {
      console.error("[app-workflow] could not record the run:", e.message);
    }
    /* Kept in memory briefly so a poll after completion still sees the final
       state, then dropped — the store is the durable record. */
    setTimeout(() => live.delete(state.id), 60000);
  }

  /* ---- commands --------------------------------------------------------- */

  async function invoke(command, args) {
    switch (command) {
      case "palette":
        return { nodes: await paletteWire(), durable: store.durable };

      case "list":
        return {
          workflows: store.list().map((w) => ({
            id: w.id, name: w.name,
            nodes: w.nodes.length, edges: w.edges.length,
            trigger: w.trigger ? w.trigger.kind : null,
            triggerOn: !!(w.trigger && w.trigger.enabled),
            granted: !!w.grant,
            quarantined: !!w.quarantined,
            modified: w.modified,
          })),
          durable: store.durable,
        };

      case "read": {
        const w = store.get(args.id);
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        return w;
      }

      case "save": {
        const now = Date.now();
        const prev = args.id ? store.get(args.id) : null;
        const wf = parseWorkflow({
          id: args.id || nextId("wf"),
          name: (args.name || "Untitled workflow").slice(0, 120),
          nodes: args.nodes || [],
          edges: args.edges || [],
          /* Triggers and grants are set through their own commands, never as a
             side effect of saving the canvas — letting a plain save carry a
             grant would be a way to widen permissions without being asked. */
          trigger: prev ? prev.trigger : null,
          grant: prev ? prev.grant : null,
          quarantined: prev ? prev.quarantined : false,
          created: prev ? prev.created : now,
          modified: now,
        });
        /* Editing the graph invalidates any grant whose fingerprint no longer
           matches. This is the rule that stops "approve a harmless workflow,
           then add a bash node" from working. */
        if (wf.grant && wf.grant.fingerprint !== fingerprint(wf, palette())) {
          wf.grant = null;
          if (wf.trigger) wf.trigger.enabled = false;
        }
        await store.put(wf);
        os.observe({
          appId: "workflow", verb: prev ? "write" : "create", target: wf.id,
          summary: (prev ? "saved" : "created") + ' workflow "' + wf.name + '"',
          entities: ["workflow:" + wf.id],
        });
        return { id: wf.id, name: wf.name, modified: wf.modified, grantCleared: !!(prev && prev.grant && !wf.grant) };
      }

      case "remove": {
        const w = store.get(args.id);
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        await store.delete(args.id);
        os.observe({
          appId: "workflow", verb: "delete", target: args.id,
          summary: 'deleted workflow "' + w.name + '"',
        });
        return { deleted: args.id };
      }

      case "rename": {
        const w = store.get(args.id);
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        w.name = String(args.name || w.name).slice(0, 120);
        w.modified = Date.now();
        await store.put(w);
        return { id: w.id, name: w.name };
      }

      /* What a run of this workflow would be allowed to do — the list a person
         sees before approving a trigger, and the same list the inspector shows
         so nothing is a surprise at approval time. */
      case "capabilities": {
        const w = args.id ? store.get(args.id) : { nodes: args.nodes || [], edges: args.edges || [] };
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        return { capabilities: capabilitiesOf(w, palette()) };
      }

      case "run": {
        const w = store.get(args.id);
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        if (w.quarantined) {
          throw new Error("This workflow was imported and has not been reviewed yet, so it cannot run.");
        }
        return startRun(w, "manual", args.payload);
      }

      case "runStatus": {
        const s = live.get(args.runId);
        if (s) {
          return {
            id: s.id, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt,
            trigger: s.trigger, error: s.error,
            steps: s.steps,
            pending: s.pending
              ? { nodeId: s.pending.nodeId, name: s.pending.name, access: s.pending.access,
                  egress: s.pending.egress, why: s.pending.why, params: s.pending.params, asked: s.pending.asked }
              : null,
          };
        }
        const rec = store.getRun(args.runId);
        if (!rec) throw new Error("workflow: no run " + args.runId);
        return { ...rec, pending: null };
      }

      case "decide": {
        const s = live.get(args.runId);
        if (!s || !s.pending) throw new Error("workflow: nothing is waiting for approval on that run");
        if (s.pending.nodeId !== args.nodeId) throw new Error("workflow: that is not the step being asked about");
        s.pending.resolve(!!args.allow, args.allow ? "approved" : "You did not approve this step.");
        os.observe({
          appId: "workflow", verb: "run", target: args.nodeId,
          summary: (args.allow ? "approved" : "rejected") + " a workflow step",
          actor: "human",
        });
        return { ok: true };
      }

      case "cancel": {
        const s = live.get(args.runId);
        if (!s) throw new Error("workflow: no live run " + args.runId);
        if (s.pending) s.pending.resolve(false, "The run was cancelled.");
        if (s.cancel) s.cancel();
        return { ok: true };
      }

      case "runs":
        return { runs: store.runsFor(args && args.id, args && args.limit) };

      /* ---- triggers and grants ------------------------------------------ */

      case "setTrigger": {
        const w = store.get(args.id);
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        const kind = args.kind === "schedule" || args.kind === "webhook" ? args.kind : "manual";
        if (kind === "schedule") {
          /* Validated now, at the moment someone can fix it — not at 06:00 when
             a bad expression would just silently never fire. */
          parseCron(args.cron);
        }
        w.trigger = {
          kind,
          enabled: false,                 /* enabling requires a grant; see `grant` */
          cron: kind === "schedule" ? String(args.cron || "") : undefined,
          tz: kind === "schedule" ? String(args.tz || "UTC") : undefined,
          token: kind === "webhook" ? (w.trigger && w.trigger.token) || newToken() : undefined,
          loopbackOnly: kind === "webhook" ? args.loopbackOnly !== false : true,
        };
        /* Changing the trigger drops any existing grant. A grant is an answer to
           "may this run unattended, this way" — change the way, ask again. */
        w.grant = null;
        w.modified = Date.now();
        await store.put(w);
        return { trigger: w.trigger, capabilities: capabilitiesOf(w, palette()) };
      }

      /**
       * Approve the capability envelope for this workflow's trigger.
       *
       * This is the moment that makes unattended execution defensible: a person
       * is present, sees every node that can write, execute or leave the
       * machine, and says yes to that exact list. The grant is pinned to a
       * fingerprint of the graph, so it stops meaning anything the moment the
       * graph changes.
       */
      case "grant": {
        const w = store.get(args.id);
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        if (!w.trigger) throw new Error("workflow: set a trigger before granting capabilities");
        const cat = palette();
        const caps = capabilitiesOf(w, cat);
        const unknown = caps.filter((c) => c.access === "unknown");
        if (unknown.length) {
          throw new Error(
            "This workflow uses " + unknown.length + " node(s) that are not installed, so what it would do " +
            "cannot be established. Install them or remove them before granting.",
          );
        }
        w.grant = {
          fingerprint: fingerprint(w, cat),
          capabilities: caps,
          at: Date.now(),
          by: "human",
        };
        w.trigger.enabled = true;
        w.modified = Date.now();
        await store.put(w);
        os.observe({
          appId: "workflow", verb: "write", target: w.id,
          summary: 'approved ' + caps.length + ' capability(ies) for "' + w.name + '" (' + w.trigger.kind + ")",
          entities: ["workflow:" + w.id], actor: "human",
        });
        return { granted: true, capabilities: caps, trigger: w.trigger };
      }

      case "revoke": {
        const w = store.get(args.id);
        if (!w) throw new Error('workflow: no workflow "' + args.id + '"');
        w.grant = null;
        if (w.trigger) w.trigger.enabled = false;
        w.modified = Date.now();
        await store.put(w);
        os.observe({
          appId: "workflow", verb: "write", target: w.id,
          summary: 'revoked the capability grant for "' + w.name + '"', actor: "human",
        });
        return { revoked: true };
      }

      /**
       * The webhook endpoint, reached through the OS at
       * `/desktop/hook/workflow/<workflowId>?token=…`.
       *
       * Returns `{status, body}` — the OS uses those verbatim, so this command
       * owns its own status codes. It is the only command that answers a caller
       * from outside the same-origin fence, so every check that matters is
       * here: the trigger must exist and be enabled, the token must match, the
       * origin must be permitted, and there must be a grant.
       */
      case "__ingress": {
        const id = String(args.path || "").split("/")[0];
        const w = id ? store.get(id) : null;
        /* Same 404 for "no such workflow" and "no webhook enabled": a caller
           without the token learns nothing about which ids exist. */
        if (!w || !w.trigger) return { status: 404, body: { ok: false, error: "not found" } };

        const check = webhookAllowed(w.trigger, args.remote);
        if (!check.ok) return { status: check.code, body: { ok: false, error: check.reason } };

        const supplied = (args.query && args.query.token) ||
          (args.headers && (args.headers["x-webhook-token"] || args.headers["X-Webhook-Token"])) || "";
        if (!w.trigger.token || !timingSafeEqualStr(String(supplied), w.trigger.token)) {
          return { status: 404, body: { ok: false, error: "not found" } };
        }
        if (w.quarantined) {
          return { status: 403, body: { ok: false, error: "This workflow was imported and has not been reviewed." } };
        }
        if (!w.grant) {
          return {
            status: 403,
            body: { ok: false, error: "No capability grant has been approved for this workflow, so it cannot run unattended." },
          };
        }
        const r = await startRun(w, "webhook", args.body);
        return { status: 202, body: { ok: true, runId: r.runId } };
      }

      default:
        throw new Error('workflow: unknown command "' + command + '"');
    }
  }

  const dispose = os.registerApp({
    id: "workflow",
    name: "Workflow",
    publisher: "Magna",
    version: "0.1.0",
    pkg: "@magna/app-workflow",
    icon: "i-flow",
    tile: "g-auto",
    window: { w: 1080, h: 680, minW: 620, minH: 420, multi: false },
    placement: { dock: true, desktop: true, order: 40 },
    aliases: ["workflow", "workflows", "flow", "automation", "pipeline"],
    /* The app itself only reads and writes its own definitions. What a RUNNING
       workflow may do is decided per node by the palette's access
       classification and the approval gate — not by a blanket grant here. */
    permissions: { grant: ["workflow:read", "workflow:write"], deny: [] },
    contributes: {
      tools: [],
      commands: ["palette", "list", "read", "save", "remove", "rename",
                 "capabilities", "run", "runStatus", "decide", "cancel", "runs",
                 "setTrigger", "grant", "revoke"],
      /* Opts this app into /desktop/hook/workflow/* so a webhook can reach it
         from outside the desktop. The secret is checked in `__ingress`. */
      ingress: true,
      /* Polling `runStatus` must not enter the activity journal. The Brain app
         once filled 492 of 500 entries by reading itself. */
      readOnly: ["palette", "list", "read", "runs", "runStatus", "capabilities"],
    },
    clientRoot: resolve(HERE, "..", "client"),
    clientEntry: "app.js",
  }, invoke);

  /* The scheduler. One tick a minute, aligned to the minute boundary, over
     every workflow with an enabled schedule AND a grant — the grant check is
     in the scheduler as well as in the gate, so a workflow whose grant was
     revoked stops being considered rather than starting and then failing. */
  ctx.effect(() => startScheduler({
    list: () => store.list(),
    fire: (wf, trigger, payload) => startRun(wf, trigger, payload),
    log: (m) => console.log("[app-workflow] " + m),
  }), "app-workflow: scheduler");

  void dispose;

  const cat = palette();
  console.log(
    "[app-workflow] layer 3 registered - 12 commands, " + Object.keys(cat).length + " node types" +
    (store.durable ? "" : " (IN-MEMORY: definitions will not survive a restart)"),
  );
}

/* ---- capability accounting ---------------------------------------------- */

/**
 * Every node in a workflow that can write, execute or leave the machine.
 *
 * This is what a person reads before approving a trigger, so it is deliberately
 * one row per node rather than a deduplicated summary: three `sys.bash` nodes
 * are three separate things that will run, and collapsing them into "runs
 * shell commands" would hide two of them.
 */
export function capabilitiesOf(workflow, cat) {
  const out = [];
  for (const n of workflow.nodes || []) {
    const def = cat[n.type];
    if (!def) {
      out.push({ nodeId: n.id, type: n.type, access: "unknown", egress: false,
                 summary: "Not installed — this workflow cannot run until it is." });
      continue;
    }
    if (def.access === "write" || def.access === "exec" || def.egress) {
      out.push({
        nodeId: n.id, type: n.type, access: def.access, egress: !!def.egress,
        summary: def.name + " — " + (def.why || ""),
      });
    }
  }
  return out;
}

/**
 * A stable fingerprint of a workflow's executable shape.
 *
 * Moving a node does not change it; adding a node, changing a node's type, or
 * changing a parameter that decides what a node touches does. That is the line
 * a capability grant is pinned to: rearranging the canvas keeps the grant,
 * changing what runs revokes it.
 */
export function fingerprint(workflow, cat) {
  const parts = (workflow.nodes || [])
    .map((n) => {
      const def = cat[n.type];
      const gated = def && (def.access === "write" || def.access === "exec" || def.egress);
      /* Parameters are only part of the identity for nodes that can do
         something consequential. A prompt edit on an AI node should not force
         re-approval; a path change on a file-write node must. */
      return n.id + ":" + n.type + (gated ? ":" + stableJson(n.data || {}) : "");
    })
    .sort();
  const edges = (workflow.edges || [])
    .map((e) => e.from + ">" + (e.fromPort || "main") + ">" + e.to + ">" + (e.toPort || "main"))
    .sort();
  return hash(parts.join("|") + "#" + edges.join("|"));
}

function stableJson(o) {
  if (o == null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(stableJson).join(",") + "]";
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableJson(o[k])).join(",") + "}";
}

/** FNV-1a. Not a security hash — this detects edits, it does not resist them. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself be a
 * signal, so both sides are hashed to a fixed width first.
 */
function timingSafeEqualStr(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** Trim what the approval bar shows, so a long script does not bury the ask. */
function redact(params) {
  const out = {};
  for (const k of Object.keys(params || {})) {
    const v = params[k];
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s == null) continue;
    out[k] = s.length > 400 ? s.slice(0, 400) + "…" : s;
  }
  return out;
}
