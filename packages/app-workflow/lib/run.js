import { SYS } from "./sys.js";

/**
 * The executor.
 *
 * A topological walk over the graph. Each node resolves its inputs from the
 * edges feeding it, interpolates its parameters against those inputs, passes
 * the approval gate if it needs to, executes, and writes its result to its
 * output ports.
 *
 * What makes this different from the animation it replaces: every number here
 * is measured. `ms` is the wall clock around the actual call. An item count is
 * the length of a real array. A node reaches `ok` because something returned,
 * and `failed` because something threw. The Console's version computed its
 * counts from a `base` constant multiplied by a per-type `ratio`, and its
 * durations were the argument to setTimeout.
 *
 * @module @magna/app-workflow/run
 */

/** Node states, mirrored in the canvas via G.setState. */
const IDLE = "idle", QUEUED = "queued", RUNNING = "running", OK = "ok", FAILED = "failed", SKIPPED = "warning";

/** Access classes that stop and ask. */
const GATED = { write: 1, exec: 1 };

/**
 * Order the nodes so every node runs after everything feeding it.
 *
 * Kahn's algorithm. Nodes left over after the queue drains are in a cycle;
 * they are returned at the end rather than dropped, so a cyclic graph fails
 * loudly at the node that could not resolve rather than silently running a
 * subset. This mirrors `topo()` in the Console, which had the same
 * cycle-tolerant tail.
 */
export function topo(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!indeg.has(e.to) || !out.has(e.from)) continue;
    indeg.set(e.to, indeg.get(e.to) + 1);
    out.get(e.from).push(e.to);
  }
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  const seen = new Set();
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const nxt of out.get(id) || []) {
      indeg.set(nxt, indeg.get(nxt) - 1);
      if (indeg.get(nxt) === 0) q.push(nxt);
    }
  }
  const cyclic = nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
  return { order, cyclic };
}

/* ---- parameter interpolation --------------------------------------------
   `{{main}}` is the value arriving on the main input. `{{main.a.b}}` walks it.
   `{{nodeId.a}}` reaches any completed upstream node by id, which is what makes
   a diamond usable — a node can read a branch it is not directly wired to, as
   long as that branch already ran.

   A reference that resolves to nothing becomes an empty string rather than the
   text "undefined", because the latter silently ends up inside file contents
   and shell commands. */

function walk(value, path) {
  let cur = value;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function interpolate(template, scope) {
  if (typeof template !== "string") return template;
  if (template.indexOf("{{") < 0) return template;
  return template.replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (whole, expr) => {
    const parts = expr.split(".");
    const head = parts[0];
    const rest = parts.slice(1);
    let base;
    if (Object.prototype.hasOwnProperty.call(scope.inputs, head)) base = scope.inputs[head];
    else if (Object.prototype.hasOwnProperty.call(scope.results, head)) base = scope.results[head];
    else return "";
    const v = rest.length ? walk(base, rest) : base;
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

function interpolateAll(data, scope) {
  const out = {};
  for (const k of Object.keys(data || {})) out[k] = interpolate(data[k], scope);
  return out;
}

/* ---- comparison, shared by If and Filter -------------------------------- */
function compare(left, op, right) {
  const l = left == null ? "" : left;
  const r = right == null ? "" : right;
  switch (op) {
    case "equals": return String(l) === String(r);
    case "not equals": return String(l) !== String(r);
    case "contains": return String(l).indexOf(String(r)) >= 0;
    case "greater than": return Number(l) > Number(r);
    case "less than": return Number(l) < Number(r);
    case "is empty": return l === "" || l == null || (Array.isArray(l) && !l.length);
    case "is not empty": return !(l === "" || l == null || (Array.isArray(l) && !l.length));
    default: return false;
  }
}

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/**
 * One run.
 *
 * `gate` is supplied by the caller and is the whole safety story: for an
 * attended run it raises the approval bar and waits for a person; for a
 * scheduled or webhook run it checks the stored capability grant and never
 * blocks, because there is nobody to unblock it.
 */
export class Run {
  constructor(opts) {
    this.workflow = opts.workflow;
    this.palette = opts.palette;
    this.gate = opts.gate;
    this.exec = opts.exec;              /* tool / app-command dispatcher */
    this.model = opts.model;            /* ai.prompt dispatcher, may be null */
    this.code = opts.code;              /* codeRuntime dispatcher, may be null */
    this.onEvent = opts.onEvent || (() => {});
    this.trigger = opts.trigger || "manual";
    this.id = opts.id;
    this.cancelled = false;
    this.steps = [];
    this.results = {};
  }

  cancel() { this.cancelled = true; }

  emit(type, payload) {
    this.onEvent({ type, at: Date.now(), ...payload });
  }

  step(nodeId, type, status, extra) {
    const at = Date.now();
    let s = this.steps.find((x) => x.nodeId === nodeId);
    if (!s) {
      s = { nodeId, type, status, startedAt: at, endedAt: null, summary: "", error: null };
      this.steps.push(s);
    }
    s.status = status;
    if (extra && extra.summary != null) s.summary = extra.summary;
    if (extra && extra.error != null) s.error = extra.error;
    if (status !== RUNNING && status !== QUEUED) s.endedAt = at;
    this.emit("node", { nodeId, status, summary: s.summary, error: s.error });
    return s;
  }

  async start() {
    const wf = this.workflow;
    const { order, cyclic } = topo(wf.nodes, wf.edges);
    this.emit("run", { status: "running", total: order.length });

    for (const n of wf.nodes) this.step(n.id, n.type, QUEUED);

    /* Nodes downstream of a false branch, or of a failure, are never started.
       They are marked skipped rather than left queued, so that every node in a
       finished run has reached a terminal state — a run history with rows stuck
       on `queued` cannot be reasoned about later. */
    const skip = new Set();

    for (const id of order) {
      if (this.cancelled) break;
      const node = wf.nodes.find((x) => x.id === id);
      if (!node) continue;
      if (skip.has(id)) {
        this.step(id, node.type, SKIPPED, { summary: "not reached" });
        this.propagateSkip(id, skip);
        continue;
      }

      const def = this.palette[node.type];
      if (!def) {
        this.step(id, node.type, FAILED, { error: "Nothing installed provides this node any more." });
        this.propagateSkip(id, skip);
        return this.finish("failed", 'Node "' + node.type + '" is not installed.');
      }

      const inputs = this.inputsFor(id, wf.edges);
      const scope = { inputs, results: this.results };
      const params = interpolateAll(node.data, scope);

      /* The gate. Placed before execution and after interpolation, so that what
         a person approves is the command that will actually run, not the
         template with the placeholders still in it. */
      if (GATED[def.access] || def.egress) {
        const verdict = await this.gate({
          runId: this.id, nodeId: id, type: node.type,
          name: def.name, access: def.access, egress: !!def.egress,
          why: def.why || "", params, trigger: this.trigger,
        });
        if (this.cancelled) break;
        if (!verdict || !verdict.allow) {
          this.step(id, node.type, FAILED, { error: verdict && verdict.reason ? verdict.reason : "Not approved." });
          this.propagateSkip(id, skip);
          return this.finish("denied", verdict && verdict.reason ? verdict.reason : "Not approved.");
        }
      }

      this.step(id, node.type, RUNNING);
      const t0 = Date.now();
      try {
        const res = await this.execute(node, def, params, inputs, skip);
        const ms = Date.now() - t0;
        this.results[id] = res && res.value !== undefined ? res.value : res;
        /* A node may supply its own summary when the generic one would hide
           something that matters — a filter reporting "0 items" is very
           different from "0 of 11", and only the node knows the denominator. */
        const own = res && res.note ? res.note : null;
        this.step(id, node.type, OK, {
          summary: own ? own + " · " + (ms < 1000 ? ms + "ms" : (ms / 1000).toFixed(1) + "s")
                       : summarise(this.results[id], ms),
        });
      } catch (e) {
        this.step(id, node.type, FAILED, { error: e.message });
        this.propagateSkip(id, skip);
        return this.finish("failed", e.message);
      }
    }

    if (this.cancelled) {
      /* Cancellation is a stop path like any other, so anything still queued or
         running is closed out. A run that leaves nodes mid-flight is the bug
         that makes a history unreadable. */
      for (const s of this.steps) {
        if (s.status === QUEUED || s.status === RUNNING) {
          s.status = SKIPPED;
          s.endedAt = Date.now();
          s.summary = "cancelled";
        }
      }
      return this.finish("cancelled", null);
    }
    if (cyclic.length) return this.finish("failed", "The graph has a cycle: " + cyclic.join(", "));
    return this.finish("ok", null);
  }

  /** Mark everything downstream of a node as unreachable. */
  propagateSkip(fromId, skip) {
    const stack = [fromId];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of this.workflow.edges) {
        if (e.from === cur && !skip.has(e.to)) { skip.add(e.to); stack.push(e.to); }
      }
    }
  }

  /** Everything arriving on this node's input ports, keyed by port id. */
  inputsFor(id, edges) {
    const inputs = {};
    for (const e of edges) {
      if (e.to !== id) continue;
      const upstream = this.results[e.from];
      const port = e.toPort || "main";
      /* Two edges into one port: the second does not silently win. They are
         collected, because a merge that dropped data would be invisible. */
      if (Object.prototype.hasOwnProperty.call(inputs, port)) {
        inputs[port] = asArray(inputs[port]).concat(asArray(upstream));
      } else {
        inputs[port] = upstream;
      }
    }
    return inputs;
  }

  async execute(node, def, params, inputs, skip) {
    const type = node.type;
    const main = inputs.main;

    /* Built-in control flow. */
    if (type === "logic.if") {
      const pass = compare(params.left, params.op, params.right);
      /* The branch not taken is pruned, which is what makes If mean anything —
         otherwise both sides would run and the node would be decorative. */
      const dead = pass ? "false" : "true";
      for (const e of this.workflow.edges) {
        if (e.from === node.id && (e.fromPort || "main") === dead) {
          skip.add(e.to);
          this.propagateSkip(e.to, skip);
        }
      }
      return { value: main, branch: pass ? "true" : "false" };
    }
    if (type === "logic.filter") {
      const src = params.from ? walk(main, String(params.from).split(".")) : main;
      const list = asArray(src);
      const kept = list.filter((it) => {
        const v = params.path ? walk(it, String(params.path).split(".")) : it;
        return compare(v, params.op, params.value);
      });
      /* `of` is reported so a filter that matched nothing is distinguishable
         from a filter that was pointed at the wrong field — both produce an
         empty list, and only one of them is what the user meant. */
      return { value: kept, note: kept.length + " of " + list.length + " kept" };
    }
    if (type === "logic.merge") {
      const a = inputs.a, b = inputs.b;
      if (params.mode === "pick first") return { value: a !== undefined ? a : b };
      if (params.mode === "combine object") return { value: Object.assign({}, a || {}, b || {}) };
      return { value: asArray(a).concat(asArray(b)) };
    }
    if (type === "logic.each") {
      const src = params.path ? walk(main, String(params.path).split(".")) : main;
      const list = asArray(src).slice(0, Math.max(1, Number(params.max) || 50));
      /* The bound is real and reported. A silent cap would make a workflow
         quietly process 50 of 5000 rows and call it done. */
      return { value: list, note: list.length + (asArray(src).length > list.length ? " of " + asArray(src).length + " (capped)" : "") + " items" };
    }
    if (type === "logic.wait") {
      const ms = Math.max(0, Math.min(3600, Number(params.seconds) || 0)) * 1000;
      await new Promise((r) => setTimeout(r, ms));
      return { value: main };
    }
    if (type.startsWith("trig.")) {
      /* A trigger node is the entry point; at run time it just passes the
         payload that started the run into the graph. */
      return { value: this.triggerPayload === undefined ? null : this.triggerPayload };
    }

    /* Shell, filesystem, HTTP — implemented in this package. */
    if (SYS[type]) return { value: await SYS[type].run(params, { input: main }) };

    /* User JavaScript. */
    if (type === "code.transform") {
      if (!this.code) throw new Error("The code runtime is not available in this composition.");
      return { value: await this.code(String(params.code || "return input;"), main) };
    }

    /* A real model turn. */
    if (type === "ai.prompt") {
      if (!this.model) throw new Error("No model is available to this composition.");
      /* `model` has to be forwarded. Passing only `format` here meant the
         dispatcher never saw the user's choice and reported "Pick a model for
         this node first" against a node whose picker was correctly set — the
         error blamed the person for the executor's omission. */
      const text = await this.model(String(params.prompt || ""), {
        model: params.model,
        format: params.format,
      });
      if (params.format === "json") {
        try { return { value: JSON.parse(text) }; }
        catch { throw new Error("The model did not return valid JSON."); }
      }
      return { value: text };
    }

    /* A registered harness or app tool. */
    if (type.startsWith("tool.")) {
      return { value: await this.exec.tool(def.tool || type.slice(5), coerce(params, def.params)) };
    }
    /* An app command, through the same bus a click goes through. */
    if (type.startsWith("app.")) {
      /* A command with a declared form is called with its fields by name; only
         the undeclared fallback still parses a JSON blob. */
      if (def.declaredParams) {
        return { value: await this.exec.command(def.appId, def.command, coerce(params, def.params)) };
      }
      let args = {};
      try { args = params.args ? (typeof params.args === "string" ? JSON.parse(params.args) : params.args) : {}; }
      catch { throw new Error("Arguments are not valid JSON."); }
      return { value: await this.exec.command(def.appId, def.command, args) };
    }

    throw new Error('No executor for node type "' + type + '".');
  }

  finish(status, error) {
    this.emit("run", { status, error });
    return { status, error, steps: this.steps, results: this.results };
  }
}

/**
 * Coerce interpolated strings back to the types a tool's schema declares.
 *
 * Interpolation is textual, so a number field that went through `{{...}}`
 * arrives as a string, and a tool validating its own schema would reject it.
 */
function coerce(params, fields) {
  const byKey = new Map((fields || []).map((f) => [f.k, f]));
  const out = {};
  for (const k of Object.keys(params || {})) {
    const f = byKey.get(k);
    const v = params[k];
    if (!f) { out[k] = v; continue; }
    if (v === "" && !f.req) continue;      /* omit rather than send empty */
    if (f.t === "num") { const n = Number(v); out[k] = Number.isFinite(n) ? n : v; }
    else if (f.t === "check") out[k] = v === true || v === "true" || v === "on";
    else if (f.t === "json") { try { out[k] = typeof v === "string" ? JSON.parse(v) : v; } catch { out[k] = v; } }
    else out[k] = v;
  }
  return out;
}

/** A one-line, honest summary of what a node produced. */
function summarise(value, ms) {
  const t = ms < 1000 ? ms + "ms" : (ms / 1000).toFixed(1) + "s";
  if (value == null) return t;
  if (Array.isArray(value)) return value.length + " item" + (value.length === 1 ? "" : "s") + " · " + t;
  if (typeof value === "object") {
    if (typeof value.exitCode === "number") return "exit " + value.exitCode + " · " + t;
    if (typeof value.status === "number") return "HTTP " + value.status + " · " + t;
    if (typeof value.bytes === "number") return value.bytes + " bytes · " + t;
    if (Array.isArray(value.items)) return value.items.length + " entries · " + t;
    if (Array.isArray(value.hits)) return value.hits.length + " hits · " + t;
    return t;
  }
  const s = String(value);
  return (s.length > 28 ? s.slice(0, 28) + "…" : s) + " · " + t;
}

export { IDLE, QUEUED, RUNNING, OK, FAILED, SKIPPED, GATED };
