/* Workflow — the browser half. Served from this package at
   /desktop/plugins/workflow/app.js.

   The split that matters here is between a workflow's DEFINITION and its
   PICTURE. What is stored is only the definition: node id, type, position, and
   the user's parameters. Everything needed to draw a node — its label, icon,
   ports, and the access class that decides whether running it needs approval —
   is resolved from the live palette every time a workflow is opened.

   That is deliberate, and it is what stops a stale graph from lying. Save a
   workflow that calls `mail_search`, remove the Mail plugin, and reopen it: the
   node cannot be hydrated, so it renders as a missing node rather than as a
   normal one that would fail at run time. The Console's version stored the
   picture, which meant a saved graph kept looking runnable forever. */

import { NGraph } from "./ngraph.js";
import { STYLE } from "./style.js";

export const manifest = { id: "workflow", name: "Workflow" };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ico = (id, cls) => '<svg class="ico ' + (cls || "") + '"><use href="#' + id + '"/></svg>';

/** Access classes that must not run without someone saying yes. */
const NEEDS_OK = { write: 1, exec: 1 };

export function mount(host, root) {
  root.innerHTML = "";
  /* Never assign root.className — this element is the Console's own window body
     and its class is what positions it below the title bar. Styling is scoped
     by the data-mv-app attribute the OS stamps here. */

  const style = document.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  root.insertAdjacentHTML("beforeend", `
    <div class="wf-top">
      <button class="wf-btn" data-open title="Open a saved workflow">${ico("i-folder")}<span>Open</span></button>
      <input class="wf-nm" data-name value="Untitled workflow" aria-label="Workflow name">
      <button class="wf-btn" data-new title="New workflow">${ico("i-plus")}</button>
      <button class="wf-btn" data-save>${ico("i-check")}<span>Save</span></button>
      <button class="wf-btn" data-trigger title="Trigger and permissions">${ico("i-clock")}<span>Trigger</span></button>
      <button class="wf-btn pri" data-run>${ico("i-play")}<span>Run</span></button>
    </div>
    <div class="wf-main">
      <div class="wf-pal">
        <input data-pq placeholder="Search nodes…" aria-label="Search nodes">
        <div class="list" data-plist></div>
      </div>
      <div class="wf-canvas">
        <div class="wf-cv" data-cv></div>
        <div class="wf-run" data-runbar hidden></div>
      </div>
      <div class="wf-insp" data-insp></div>
    </div>
  `);

  const $ = (s) => root.querySelector(s);
  const nameEl = $("[data-name]");
  const plist = $("[data-plist]");
  const insp = $("[data-insp]");
  const cv = $("[data-cv]");

  /** The live palette. Refetched on every mount, never cached across them. */
  let PAL = {};
  let durable = true;
  let currentId = null;
  let dirty = false;

  const G = NGraph(cv, {
    quickAdd: true,
    emptyHTML: "Drag a node from the left to start.<br>Every node here is something this machine can actually do.",
    onChange: () => { dirty = true; },
    onSelect: (n) => drawInspector(n),
  });

  /* ---- definition <-> picture ------------------------------------------ */

  /** Short line under a node's title. Derived, never stored. */
  function subOf(type, data) {
    const p = PAL[type];
    if (!p) return "not installed";
    const first = (p.params || []).find((f) => data && data[f.k] !== undefined && data[f.k] !== "");
    if (first) return String(data[first.k]).replace(/\s+/g, " ").slice(0, 30);
    if (p.desc) return p.desc.replace(/\s+/g, " ").slice(0, 30);
    return type.split(".").slice(1).join(".") || type;
  }

  function chipsOf(p) {
    if (!p) return [{ t: "missing", cls: "warn" }];
    const out = [];
    if (NEEDS_OK[p.access]) out.push({ t: p.access === "exec" ? "exec" : "writes", cls: "warn" });
    if (p.egress) out.push({ t: "egress", cls: "pub" });
    if (p.certain === false) out.push({ t: "unclassified", cls: "warn" });
    return out;
  }

  /** Definition node -> render-ready node. */
  function hydrate(d) {
    const p = PAL[d.type];
    if (!p) {
      /* A node whose type no longer exists. It is shown, because silently
         dropping it would quietly change what the workflow does, and it is
         shown as broken, because pretending it still works is worse. */
      return {
        id: d.id, type: d.type, x: d.x, y: d.y, w: 208,
        title: d.type, sub: "not installed",
        icon: "i-warn", tile: "g-conn",
        ins: [{ id: "main", label: "in" }], outs: [{ id: "main", label: "out" }],
        data: d.data || {}, chips: [{ t: "missing", cls: "warn" }],
      };
    }
    return {
      id: d.id, type: d.type, x: d.x, y: d.y, w: 208,
      title: p.name, sub: subOf(d.type, d.data || {}),
      icon: p.icon, tile: p.tile,
      ins: p.ins, outs: p.outs,
      data: d.data || {}, chips: chipsOf(p),
    };
  }

  /** Render-ready graph -> lean definition, for the store. */
  function definition() {
    const g = G.serialize();
    return {
      nodes: g.nodes.map((n) => ({
        id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), data: n.data || {},
      })),
      edges: g.edges.map((e) => ({
        id: e.id, from: e.a, fromPort: e.ap, to: e.b, toPort: e.bp,
      })),
    };
  }

  function loadDefinition(wf) {
    G.load({
      nodes: (wf.nodes || []).map(hydrate),
      edges: (wf.edges || []).map((e) => ({
        id: e.id, a: e.from, ap: e.fromPort || "main", b: e.to, bp: e.toPort || "main", label: "",
      })),
    });
  }

  /* ---- palette sidebar -------------------------------------------------- */

  function drawPalette(filter) {
    const q = String(filter || "").trim().toLowerCase();
    const groups = new Map();
    for (const type of Object.keys(PAL)) {
      const p = PAL[type];
      if (q && (p.name + " " + type + " " + (p.desc || "")).toLowerCase().indexOf(q) < 0) continue;
      if (!groups.has(p.g)) groups.set(p.g, []);
      groups.get(p.g).push([type, p]);
    }
    if (!groups.size) {
      plist.innerHTML = '<div class="wf-grp">No match</div>';
      return;
    }
    /* Triggers first, then Logic and AI, then everything the harness and the
       installed apps contribute, alphabetically. */
    /* Docs sits with the built-ins rather than alphabetically among the app
       groups: writing the model's answer into a document is the commonest thing
       anyone builds here, and it was below the fold. */
    const order = ["Triggers", "Logic", "AI", "Docs", "System"];
    const keys = [...groups.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.localeCompare(b);
    });
    plist.innerHTML = keys.map((g) =>
      '<div class="wf-grp">' + esc(g) + "</div>" +
      groups.get(g).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([type, p]) => {
        const acc = NEEDS_OK[p.access]
          ? '<span class="acc ' + esc(p.access) + '">' + esc(p.access === "exec" ? "exec" : "write") + "</span>"
          : (p.egress ? '<span class="acc eg">net</span>' : "");
        return '<button class="wf-pi" draggable="true" data-type="' + esc(type) + '" title="' + esc(p.why || p.desc || "") + '">' +
          ico(p.icon || "i-cube") + '<span class="nm">' + esc(p.name) + "</span>" + acc + "</button>";
      }).join(""),
    ).join("");
  }

  function addNodeAt(type, x, y) {
    const p = PAL[type];
    if (!p) return;
    const data = {};
    for (const f of p.params || []) if (f.d !== undefined && f.d !== "") data[f.k] = f.d;
    const n = G.addNode(hydrate({ id: null, type, x, y, data }));
    G.select(n.id);
  }

  plist.addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    /* Click adds at the middle of the visible canvas rather than at 0,0, so a
       node never lands off-screen when the canvas is panned. */
    const r = cv.getBoundingClientRect();
    const [x, y] = G.toContent(r.left + r.width / 2, r.top + r.height / 3);
    addNodeAt(b.getAttribute("data-type"), Math.round(x) - 104, Math.round(y));
  });
  plist.addEventListener("dragstart", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    e.dataTransfer.setData("text/mv-node", b.getAttribute("data-type"));
    e.dataTransfer.effectAllowed = "copy";
  });
  cv.addEventListener("dragover", (e) => {
    if ([...e.dataTransfer.types].indexOf("text/mv-node") < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  cv.addEventListener("drop", (e) => {
    const type = e.dataTransfer.getData("text/mv-node");
    if (!type) return;
    e.preventDefault();
    const [x, y] = G.toContent(e.clientX, e.clientY);
    addNodeAt(type, Math.round(x) - 104, Math.round(y) - 24);
  });

  $("[data-pq]").addEventListener("input", (e) => drawPalette(e.target.value));

  /* ---- inspector -------------------------------------------------------- */

  function drawInspector(n) {
    if (!n) {
      insp.innerHTML =
        '<h4>Nothing selected</h4><p class="why">Pick a node to see what it does and set its parameters.</p>' +
        (durable ? "" : '<div class="wf-warn">' + ico("i-warn") +
          "<span>Durable storage is unavailable, so workflows are held in memory and will be lost on restart.</span></div>");
      return;
    }
    const p = PAL[n.type];
    if (!p) {
      insp.innerHTML =
        "<h4>" + esc(n.type) + "</h4>" +
        '<div class="wf-warn">' + ico("i-warn") +
        "<span>Nothing installed provides this node any more, so it cannot run. Install the plugin that " +
        "owned it, or delete the node.</span></div>";
      return;
    }

    const warn = [];
    if (NEEDS_OK[p.access]) {
      warn.push('<div class="wf-warn">' + ico("i-warn") + "<span><b>Asks before it runs.</b> " + esc(p.why || "") + "</span></div>");
    }
    if (p.egress) {
      warn.push('<div class="wf-warn">' + ico("i-globe") + "<span><b>Leaves this machine.</b> " + esc(p.why || "") + "</span></div>");
    }
    if (p.certain === false) {
      warn.push('<div class="wf-warn">' + ico("i-shield") +
        "<span>Nobody has classified this tool, so it is treated as a write and will always ask first.</span></div>");
    }

    insp.innerHTML =
      "<h4>" + esc(p.name) + "</h4>" +
      '<p class="why">' + esc(p.desc || p.why || "") + "</p>" +
      warn.join("") +
      (p.params || []).map((f) => field(f, n.data ? n.data[f.k] : undefined)).join("") ||
      '<p class="why">This node takes no parameters.</p>';

    insp.querySelectorAll("[data-k]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const k = inp.getAttribute("data-k");
        n.data = n.data || {};
        n.data[k] = inp.type === "checkbox" ? inp.checked : inp.value;
        n.sub = subOf(n.type, n.data);
        const tt = n.el && n.el.querySelector(".wfg-n-tt i");
        if (tt) tt.textContent = n.sub;
        dirty = true;
      });
    });
  }

  function field(f, value) {
    const v = value !== undefined ? value : f.d;
    const id = "wf-f-" + f.k;
    const hint = f.hint ? '<span class="hint">' + esc(f.hint) + "</span>" : "";
    if (f.t === "check") {
      return '<div class="wf-f chk"><input type="checkbox" id="' + esc(id) + '" data-k="' + esc(f.k) + '"' +
        (v ? " checked" : "") + '><label for="' + esc(id) + '">' + esc(f.l) + "</label></div>";
    }
    let control;
    if (f.t === "pick") {
      /* Value and label differ here: the value is an opaque id and the label is
         the thing a person recognises. A plain "sel" would put the id on
         screen. */
      const opts = f.o || [];
      const emptyLabel = f.empty || (opts.length ? "Choose…" : "Nothing available");
      control = '<select id="' + esc(id) + '" data-k="' + esc(f.k) + '">' +
        '<option value="">' + esc(emptyLabel) + "</option>" +
        opts.map((o) => '<option value="' + esc(o.v) + '"' +
          (String(v) === String(o.v) ? " selected" : "") + ">" + esc(o.l) + "</option>").join("") +
        "</select>";
    } else if (f.t === "sel") {
      control = '<select id="' + esc(id) + '" data-k="' + esc(f.k) + '">' +
        (f.o || []).map((o) => '<option' + (String(v) === String(o) ? " selected" : "") + ">" + esc(o) + "</option>").join("") +
        "</select>";
    } else if (f.t === "area" || f.t === "json") {
      control = '<textarea id="' + esc(id) + '" data-k="' + esc(f.k) + '">' + esc(v == null ? "" : v) + "</textarea>";
    } else if (f.t === "num") {
      control = '<input type="number" id="' + esc(id) + '" data-k="' + esc(f.k) + '" value="' + esc(v == null ? "" : v) + '">';
    } else {
      control = '<input type="text" id="' + esc(id) + '" data-k="' + esc(f.k) + '" value="' + esc(v == null ? "" : v) + '">';
    }
    return '<div class="wf-f"><label for="' + esc(id) + '">' + esc(f.l) + (f.req ? " *" : "") + "</label>" + control + hint + "</div>";
  }

  /* ---- open / save ------------------------------------------------------ */

  async function save() {
    const def = definition();
    const r = await host.invoke("save", {
      id: currentId,
      name: nameEl.value || "Untitled workflow",
      nodes: def.nodes,
      edges: def.edges,
    });
    currentId = r.id;
    dirty = false;
    host.observe({ verb: "write", target: r.id, summary: 'saved workflow "' + r.name + '"' });
    if (typeof window.toast === "function") window.toast("Saved " + r.name);
  }

  async function openList() {
    const { workflows } = await host.invoke("list");
    const panel = document.createElement("div");
    panel.className = "wf-list";
    panel.innerHTML =
      '<div class="wf-top" style="border:0;padding:0 0 12px;background:none">' +
      '<div style="flex:1;font-weight:660">Saved workflows</div>' +
      '<button class="wf-btn" data-close>' + ico("i-x") + "</button></div>" +
      (workflows.length
        ? workflows.map((w) =>
            '<div class="wf-row" data-id="' + esc(w.id) + '"><div class="mid">' +
            '<div class="nm">' + esc(w.name) + "</div>" +
            '<div class="sub">' + w.nodes + " nodes · " + w.edges + " edges" +
            (w.trigger ? " · " + esc(w.trigger) + (w.triggerOn ? " on" : " off") : "") +
            "</div></div>" +
            '<button class="wf-btn" data-del="' + esc(w.id) + '" title="Delete">' + ico("i-x") + "</button></div>",
          ).join("")
        : '<p class="why" style="color:var(--tx-4)">Nothing saved yet.</p>');
    root.querySelector(".wf-canvas").appendChild(panel);

    panel.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]")) { panel.remove(); return; }
      const del = e.target.closest("[data-del]");
      if (del) {
        e.stopPropagation();
        const id = del.getAttribute("data-del");
        const ok = await host.confirm({
          title: "Delete this workflow?",
          detail: "The definition and its run history are removed. This cannot be undone.",
          danger: true, confirm: "Delete",
        });
        if (!ok) return;
        await host.invoke("remove", { id });
        if (currentId === id) { currentId = null; G.clear(); nameEl.value = "Untitled workflow"; }
        panel.remove();
        openList();
        return;
      }
      const row = e.target.closest("[data-id]");
      if (!row) return;
      const wf = await host.invoke("read", { id: row.getAttribute("data-id") });
      currentId = wf.id;
      nameEl.value = wf.name;
      loadDefinition(wf);
      dirty = false;
      panel.remove();
    });
  }

  /* ---- running ----------------------------------------------------------
     The canvas is the progress display: each node carries its own state, so
     there is no separate list to keep in step with it. The bar underneath
     carries the one thing a node cannot show — the approval question. */

  const runbar = $("[data-runbar]");
  let poll = null;
  let runId = null;

  /* The engine's state vocabulary, which its CSS already styles. */
  const CANVAS_STATE = { queued: "queued", running: "running", ok: "ok", failed: "failed", warning: "warning" };

  async function startRun() {
    if (!currentId || dirty) {
      /* Running an unsaved graph would run something different from what is
         stored, and the run history would then point at a definition that
         never existed. Save first, always. */
      await save();
    }
    G.resetStates();
    const r = await host.invoke("run", { id: currentId });
    runId = r.runId;
    paintRunning();
    poll = setInterval(tick, 600);
    tick();
  }

  function paintRunning() {
    runbar.hidden = false;
    runbar.innerHTML = '<div class="mid"><b>Running…</b></div>' +
      '<button class="wf-btn" data-cancel>' + ico("i-x") + "<span>Cancel</span></button>";
  }

  async function tick() {
    if (!runId) return;
    let s;
    try {
      s = await host.invoke("runStatus", { runId });
    } catch {
      stopPoll();
      return;
    }

    for (const st of s.steps || []) {
      G.setState(st.nodeId, CANVAS_STATE[st.status] || "idle");
      if (st.summary || st.error) G.setBadge(st.nodeId, st.error ? "✕" : st.summary);
    }

    if (s.pending) {
      drawApproval(s.pending);
      return;
    }
    if (s.status === "running") {
      paintRunning();
      return;
    }

    stopPoll();
    const tone = s.status === "ok" ? "ok" : "bad";
    runbar.innerHTML =
      '<div class="mid"><b data-tone="' + tone + '">' + esc(label(s.status)) + "</b>" +
      (s.error ? '<span class="sub">' + esc(s.error) + "</span>" : "") + "</div>" +
      '<button class="wf-btn" data-close-run>' + ico("i-x") + "</button>";
  }

  function label(status) {
    return { ok: "Finished", failed: "Failed", denied: "Stopped — not approved", cancelled: "Cancelled" }[status] || status;
  }

  function drawApproval(p) {
    const params = Object.keys(p.params || {})
      .map((k) => '<div class="pr"><span class="k">' + esc(k) + '</span><span class="v">' + esc(p.params[k]) + "</span></div>")
      .join("");
    runbar.innerHTML =
      '<div class="ask">' +
        '<div class="hd">' + ico("i-shield") + "<b>" + esc(p.name) + " needs your approval</b></div>" +
        '<p class="why">' + esc(p.why || "") + (p.egress ? " This also leaves the machine." : "") + "</p>" +
        /* The parameters shown are the interpolated ones — what will actually
           run, not the template with {{...}} still in it. Approving a command
           you cannot see is not approval. */
        '<div class="prs">' + params + "</div>" +
      "</div>" +
      '<div class="acts">' +
        '<button class="wf-btn" data-deny>Reject</button>' +
        '<button class="wf-btn pri" data-allow>' + ico("i-check") + "<span>Approve</span></button>" +
      "</div>";
  }

  function stopPoll() {
    if (poll) clearInterval(poll);
    poll = null;
  }

  runbar.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close-run]")) { runbar.hidden = true; runId = null; return; }
    if (e.target.closest("[data-cancel]")) { await host.invoke("cancel", { runId }); return; }
    const allow = e.target.closest("[data-allow]");
    const deny = e.target.closest("[data-deny]");
    if (!allow && !deny) return;
    const s = await host.invoke("runStatus", { runId });
    if (!s.pending) return;
    await host.invoke("decide", { runId, nodeId: s.pending.nodeId, allow: !!allow });
    paintRunning();
  });

  /* ---- triggers and the capability grant --------------------------------
     This is the screen that makes unattended execution defensible. It does not
     let you enable a schedule or a webhook without first showing you every node
     that can write, execute or leave the machine, and having you approve that
     exact list. */

  async function openTrigger() {
    if (!currentId || dirty) await save();
    const wf = await host.invoke("read", { id: currentId });
    const { capabilities } = await host.invoke("capabilities", { id: currentId });
    const t = wf.trigger || { kind: "manual", enabled: false, loopbackOnly: true };

    const panel = document.createElement("div");
    panel.className = "wf-list";
    panel.innerHTML =
      '<div class="wf-top" style="border:0;padding:0 0 12px;background:none">' +
        '<div style="flex:1;font-weight:660">Trigger &amp; permissions</div>' +
        '<button class="wf-btn" data-close>' + ico("i-x") + '</button></div>' +

      '<div class="wf-f"><label>How it starts</label>' +
        '<select data-tkind>' +
          ['manual', 'schedule', 'webhook'].map((k) =>
            '<option value="' + k + '"' + (t.kind === k ? ' selected' : '') + '>' +
            ({ manual: 'Manually — you press Run', schedule: 'On a schedule', webhook: 'When a URL is called' })[k] +
            '</option>').join('') +
        '</select></div>' +

      '<div data-schedule ' + (t.kind === 'schedule' ? '' : 'hidden') + '>' +
        '<div class="wf-f"><label>Cron expression</label>' +
          '<input type="text" data-cron value="' + esc(t.cron || '0 6 * * 1-5') + '">' +
          '<span class="hint">minute hour day-of-month month day-of-week</span></div>' +
        '<div class="wf-f"><label>Timezone</label>' +
          '<select data-tz>' + ['Asia/Riyadh', 'UTC', 'Europe/London', 'America/New_York']
            .map((z) => '<option' + (t.tz === z ? ' selected' : '') + '>' + z + '</option>').join('') +
          '</select></div>' +
      '</div>' +

      '<div data-webhook ' + (t.kind === 'webhook' ? '' : 'hidden') + '>' +
        (t.token
          ? '<div class="wf-f"><label>Endpoint</label>' +
              '<input type="text" readonly value="' +
              esc(location.origin + '/desktop/hook/workflow/' + wf.id + '?token=' + t.token) + '">' +
              '<span class="hint">Anyone with this URL can start the workflow. Treat it as a password.</span></div>'
          : '<p class="why">A secret URL is generated when you save this trigger.</p>') +
        '<div class="wf-f chk"><input type="checkbox" data-loop' + (t.loopbackOnly !== false ? ' checked' : '') + '>' +
          '<label>Only accept calls from this machine</label></div>' +
        (t.loopbackOnly === false
          ? '<div class="wf-warn">' + ico("i-warn") +
            '<span>This endpoint is reachable from the network. The token is the only thing between a stranger ' +
            'and everything this workflow can do.</span></div>'
          : '') +
      '</div>' +

      /* The list a person actually approves. One row per node, never
         deduplicated: three shell nodes are three things that will run. */
      '<div class="wf-grp">What it will be allowed to do</div>' +
      (capabilities.length
        ? capabilities.map((c) =>
            '<div class="wf-row" style="cursor:default"><div class="mid">' +
            '<div class="nm">' + esc(c.summary || c.type) + '</div>' +
            '<div class="sub">' + esc(c.access) + (c.egress ? ' · leaves this machine' : '') + '</div>' +
            '</div></div>').join('')
        : '<p class="why">Nothing in this workflow writes, executes or leaves the machine. ' +
          'It can run unattended without a grant.</p>') +

      (wf.grant
        ? '<p class="why" style="margin-top:10px">Approved ' + new Date(wf.grant.at).toLocaleString() + '. ' +
          'Editing the graph revokes this automatically.</p>'
        : '') +

      '<div style="display:flex;gap:8px;margin-top:14px">' +
        (wf.grant
          ? '<button class="wf-btn" data-revoke>Revoke and disable</button>'
          : '') +
        '<button class="wf-btn pri" data-approve>' + ico("i-shield") +
        '<span>' + (capabilities.length ? 'Approve and enable' : 'Enable') + '</span></button>' +
      '</div>';

    root.querySelector(".wf-canvas").appendChild(panel);

    const kindSel = panel.querySelector("[data-tkind]");
    kindSel.addEventListener("change", () => {
      panel.querySelector("[data-schedule]").hidden = kindSel.value !== "schedule";
      panel.querySelector("[data-webhook]").hidden = kindSel.value !== "webhook";
    });

    panel.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]")) { panel.remove(); return; }
      if (e.target.closest("[data-revoke]")) {
        await host.invoke("revoke", { id: currentId });
        panel.remove();
        openTrigger();
        return;
      }
      if (!e.target.closest("[data-approve]")) return;
      try {
        await host.invoke("setTrigger", {
          id: currentId,
          kind: kindSel.value,
          cron: panel.querySelector("[data-cron]") && panel.querySelector("[data-cron]").value,
          tz: panel.querySelector("[data-tz]") && panel.querySelector("[data-tz]").value,
          loopbackOnly: panel.querySelector("[data-loop]") ? panel.querySelector("[data-loop]").checked : true,
        });
      } catch (err) {
        if (typeof window.toast === "function") window.toast(err.message);
        return;
      }
      if (kindSel.value !== "manual") {
        /* The OS's own sheet, not window.confirm — the same one the marketplace
           uses for plugin scopes, so a permission decision always looks the
           same wherever it is made. */
        const ok = await host.confirm({
          title: "Let this run without you?",
          detail: capabilities.length
            ? "It will run on its own, and these steps will not ask again."
            : "This workflow does not write, execute or leave the machine.",
          rows: capabilities.map((c) => ({
            k: c.access + (c.egress ? " · net" : ""),
            v: c.summary || c.type,
            tone: c.access === "exec" ? "bad" : undefined,
          })),
          danger: capabilities.some((c) => c.access === "exec"),
          confirm: "Approve",
        });
        if (!ok) return;
      }
      try {
        await host.invoke("grant", { id: currentId });
        if (typeof window.toast === "function") window.toast("Trigger enabled.");
        panel.remove();
      } catch (err) {
        if (typeof window.toast === "function") window.toast(err.message);
      }
    });
  }

  $("[data-trigger]").addEventListener("click", () => openTrigger().catch((e) => {
    if (typeof window.toast === "function") window.toast("Could not open: " + e.message);
    else console.error(e);
  }));

  $("[data-run]").addEventListener("click", () => startRun().catch((e) => {
    if (typeof window.toast === "function") window.toast("Could not run: " + e.message);
    else console.error(e);
  }));

  $("[data-save]").addEventListener("click", () => save().catch((e) => {
    if (typeof window.toast === "function") window.toast("Could not save: " + e.message);
    else console.error(e);
  }));
  $("[data-open]").addEventListener("click", () => openList());
  $("[data-new]").addEventListener("click", async () => {
    if (dirty && !(await host.confirm({
      title: "Discard unsaved changes?",
      detail: "This workflow has changes that have not been saved.",
      danger: true, confirm: "Discard",
    }))) return;
    currentId = null;
    nameEl.value = "Untitled workflow";
    G.clear();
    dirty = false;
  });
  nameEl.addEventListener("input", () => { dirty = true; });

  /* ---- boot ------------------------------------------------------------- */

  (async () => {
    try {
      const p = await host.invoke("palette");
      PAL = p.nodes;
      durable = p.durable;
    } catch (e) {
      plist.innerHTML = '<div class="wf-grp">Palette unavailable</div>';
      console.error("[workflow] could not load the palette:", e);
      return;
    }
    drawPalette("");
    drawInspector(null);

    /* Quick-add (double-click on the canvas) draws from the same palette, so
       it can never offer a node the sidebar does not have. */
    G.qa && wireQuickAdd();
  })();

  function wireQuickAdd() {
    const list = G.qa.querySelector("[data-qalist]") || G.qa.querySelector(".list");
    const input = G.qa.querySelector("[data-qain]") || G.qa.querySelector("input");
    if (!list || !input) return;
    function paint() {
      const q = input.value.trim().toLowerCase();
      const hits = Object.keys(PAL)
        .filter((t) => !q || (PAL[t].name + " " + t).toLowerCase().indexOf(q) >= 0)
        .slice(0, 40);
      list.innerHTML = hits.map((t) =>
        '<button class="qi" data-qtype="' + esc(t) + '">' + ico(PAL[t].icon || "i-cube") +
        "<span>" + esc(PAL[t].name) + '</span><span class="g">' + esc(PAL[t].g) + "</span></button>",
      ).join("");
    }
    input.addEventListener("input", paint);
    list.addEventListener("click", (e) => {
      const b = e.target.closest("[data-qtype]");
      if (!b) return;
      const at = G.qa._at || [0, 0];
      addNodeAt(b.getAttribute("data-qtype"), Math.round(at[0]), Math.round(at[1]));
      G.qa.classList.remove("on");
    });
    paint();
  }

  /* Returned to the OS as this window's disposer: mv-dsh.js keeps whatever
     mount() returns in `live[w.id]` and calls it from closeWin. Without it,
     closing the window mid-run leaves a 600ms poll hitting the host forever. */
  return function unmount() {
    stopPoll();
    runId = null;
  };
}
