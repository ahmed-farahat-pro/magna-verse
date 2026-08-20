/* Brain — the browser half.
 *
 * Builds a provenance graph from what the harness recorded. Every edge is a
 * fact, not a similarity: session S called tool T at time t; that call named
 * document D. Click any node to see the evidence behind its edges.
 *
 * The layout is deterministic (columns by kind, ordered within), not a force
 * simulation. A graph that rearranges itself every time you open it is a graph
 * you cannot learn, and for an audit surface stability matters more than
 * prettiness.
 */

export const manifest = { id: "brain", name: "Brain" };

const KIND = {
  session: { color: "#8B5CF6", label: "Session", col: 0 },
  tool:    { color: "#0EA5B7", label: "Tool",    col: 1 },
  doc:     { color: "#3FCF95", label: "Document", col: 2 },
  app:     { color: "#F0B44E", label: "App",     col: 2 },
};

/* Lenses over the same graph. Each is a filter, not a separate dataset — the
   provenance is one graph, and showing it four ways beats maintaining four
   stores that can disagree. A lens with nothing behind it says so rather than
   drawing an empty canvas. */
const VIEWS = [
  { id: "all", label: "Everything", keep: null,
    empty: "Nothing recorded yet. Use Chat or an app and the graph fills in." },
  { id: "knowledge", label: "Knowledge", keep: (n) => n.kind === "doc" || n.kind === "app",
    empty: "No documents yet. Create one in Docs, or ask the agent to." },
  { id: "work", label: "Sessions and tools", keep: (n) => n.kind === "session" || n.kind === "tool",
    empty: "No sessions yet." },
  { id: "retrieval", label: "Retrieval", keep: (n) => n.kind === "doc" || (n.kind === "tool" && /_search|_find|^grep$|^glob$|^web_search$/.test(n.label)),
    empty: "No searches recorded. This lens shows what the agent looked for and what it found — it fills the first time it searches." },
  { id: "email", label: "Email", keep: (n) => n.kind === "email",
    empty: "No mail connector is installed, so there is nothing to draw. Mail needs an MCP server speaking IMAP or Graph; once one is mounted its messages become nodes here like any other entity." },
];

/* Tool arguments that name a document or a cell, so an edge can be drawn to
   the thing itself rather than only to the tool. */
const IDKEYS = ["id", "ref", "target", "sessionId", "q"];

export function mount(host, root) {
  root.innerHTML = "";
  /* Scoped by the data-mv-app attribute the OS stamps on this root, not by
     class prefix. The Console already owns .br-* names in its global sheet, and
     a plugin sharing a prefix loses silently. */
  /* Never assign root.className: this element is the Console's own window
     body and its class is what positions it below the title bar. Assigning
     wipes it and the app draws over the titlebar. Styling is scoped by the
     data-mv-app attribute the OS stamps here, so no class is needed. */

  const style = document.createElement("style");
  style.textContent = `
/* Two things, both learned the hard way:
   - The mount root carries the attribute, so its own rules target the attribute
     directly; a descendant selector would never match it.
   - height:100% is correct here. An earlier version used position:absolute to
     work around a zero height, but the real cause was assigning root.className,
     which wiped win-body and left the element unsized AND unpositioned. Fixing
     the clobber fixed both; the absolute positioning then became the bug,
     overriding win-body's own relative positioning so the app drew under the
     title bar.
   Class names are also prefixed mvb-, not br-: the Console owns .mvb-canvas and
   .mvb-main in its global sheet and sets position:absolute and flex-direction on
   them. Scoping raises specificity but cannot un-set a property you never
   declared, so the only reliable answer is names it does not use. */
[data-mv-app="brain"] {height:100%;display:flex;flex-direction:column;font-size:13px;overflow:hidden}
[data-mv-app="brain"] .mvb-bar {flex:none;display:flex;gap:12px;align-items:center;padding:9px 14px;
      border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));flex-wrap:wrap}
[data-mv-app="brain"] .mvb-bar .st {font-size:11.5px;color:var(--tx-3)}
[data-mv-app="brain"] .mvb-bar .st b {color:var(--tx);font-weight:600}
[data-mv-app="brain"] .mvb-views {display:flex;gap:3px;flex-wrap:wrap}
[data-mv-app="brain"] .mvb-views button {border:0;background:transparent;color:var(--tx-3);font:inherit;
  font-size:12px;padding:4px 9px;border-radius:7px;cursor:pointer;min-height:auto}
[data-mv-app="brain"] .mvb-views button[aria-selected="true"] {background:var(--glass-3, rgba(255,255,255,.09));color:var(--tx)}
[data-mv-app="brain"] .mvb-legend {display:flex;gap:11px;margin-left:auto;flex-wrap:wrap}
[data-mv-app="brain"] .mvb-legend span {display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--tx-3)}
[data-mv-app="brain"] .mvb-legend i {width:9px;height:9px;border-radius:50%;display:inline-block}
[data-mv-app="brain"] .mvb-main {flex:1;display:flex;min-height:0}
[data-mv-app="brain"] .mvb-canvas {flex:1;overflow:auto;min-width:0}
[data-mv-app="brain"] .mvb-side {width:266px;flex:none;border-left:1px solid var(--glass-line, rgba(255,255,255,.11));overflow:auto;padding:12px 14px}
[data-mv-app="brain"] .mvb-side h4 {margin:0 0 3px;font-size:14px}
[data-mv-app="brain"] .mvb-side .kind {font-size:11px;color:var(--tx-4);font-family:var(--mono);margin:0 0 10px}
[data-mv-app="brain"] .mvb-side h5 {margin:14px 0 5px;font-size:11px;letter-spacing:.05em;color:var(--tx-4);font-weight:650}
[data-mv-app="brain"] .mvb-side ul {margin:0;padding:0 0 0 15px;color:var(--tx-3);font-size:12px;line-height:1.65}
[data-mv-app="brain"] .mvb-side .empty {color:var(--tx-4);font-size:12.5px;line-height:1.6}
[data-mv-app="brain"] circle.n {cursor:pointer}
[data-mv-app="brain"] circle.n:hover {stroke:var(--tx)!important;stroke-width:2.5}
[data-mv-app="brain"] circle.n[data-sel="true"] {stroke:var(--tx)!important;stroke-width:3}
[data-mv-app="brain"] text.lbl {font-family:var(--sans);font-size:11px;fill:var(--tx-2);pointer-events:none}
[data-mv-app="brain"] text.sub {font-family:var(--mono);font-size:9.5px;fill:var(--tx-4);pointer-events:none}
[data-mv-app="brain"] line.e {stroke:var(--glass-line-2, rgba(128,128,128,.35));stroke-width:1}
[data-mv-app="brain"] line.e[data-hot="true"] {stroke:var(--tx-3);stroke-width:1.8}
[data-mv-app="brain"] .mvb-empty {padding:26px;color:var(--tx-4);max-width:56ch;line-height:1.65}
  `;
  root.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "mvb-bar";
  bar.innerHTML =
    '<span class="mvb-views" id="brViews" role="tablist"></span>' +
    '<span class="st" id="brStat">Building the graph…</span>' +
    '<span class="mvb-legend">' +
    Object.keys(KIND).map((k) => '<span><i style="background:' + KIND[k].color + '"></i>' + KIND[k].label + "</span>").join("") +
    "</span>";
  root.appendChild(bar);

  const main = document.createElement("div");
  main.className = "mvb-main";
  const canvas = document.createElement("div");
  canvas.className = "mvb-canvas";
  const side = document.createElement("div");
  side.className = "mvb-side";
  side.innerHTML = '<p class="empty">Select a node to see the evidence behind its edges.</p>';
  main.appendChild(canvas);
  main.appendChild(side);
  root.appendChild(main);

  const rpc = (m, p) => window.MVDsh.rpc(m, p || {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return Math.round(s / 86400) + "d ago";
  };

  let nodes = [], edges = [], selected = null, view = "all";

  function addNode(map, id, kind, label, extra) {
    if (map.has(id)) return map.get(id);
    const n = Object.assign({ id, kind, label, edges: [], evidence: [] }, extra || {});
    map.set(id, n);
    return n;
  }

  async function build() {
    const map = new Map();
    const es = [];

    /* Apps and their documents — the things work happens to. */
    let apps = [];
    try { apps = (await host.invoke("apps")).apps || []; } catch (e) {}
    for (const a of apps) addNode(map, "app:" + a.id, "app", a.name, { sub: a.pkg || a.id });

    try {
      const docs = (await host.invokeApp("docs", "list")).docs || [];
      for (const d of docs) addNode(map, "doc:" + d.id, "doc", d.title, { sub: d.id });
    } catch (e) { /* Docs may not be installed; the graph is still valid without it */ }

    try {
      const cells = (await host.invokeApp("sheets", "used")).cells || [];
      if (cells.length) {
        addNode(map, "app:sheets-data", "doc", "Sheet (" + cells.length + " cells)", { sub: "sheets" });
      }
    } catch (e) { /* Sheets may not be installed */ }

    /* Sessions and everything they did. */
    const sess = (await rpc("session.list", {})).items || [];
    const recent = sess.slice(0, 12);
    for (const s of recent) {
      const sid = s.id || s.sessionId;
      const sn = addNode(map, "sess:" + sid, "session", s.title || "Untitled session", { sub: String(sid).slice(8, 16) });

      let evs = [];
      try {
        evs = ((await rpc("session.history", { sessionId: sid })).events || []).map((w) => w.event || w);
      } catch (e) { continue; }

      for (const e of evs) {
        if (e.type !== "tool/call") continue;
        const tool = e.data && e.data.name;
        if (!tool) continue;

        const tn = addNode(map, "tool:" + tool, "tool", tool, { sub: "tool" });
        es.push({ a: sn.id, b: tn.id, why: sn.label + " called " + tool, at: e.time });
        sn.evidence.push({ text: "called " + tool, at: e.time });
        tn.evidence.push({ text: "called by " + sn.label, at: e.time });

        /* If the call named something the graph already knows, join them.
           This is where the edge stops being "these co-occur" and becomes
           "this call referenced that document". */
        const args = (e.data && (e.data.args || e.data.input)) || {};
        for (const k of IDKEYS) {
          const v = args[k];
          if (typeof v !== "string") continue;
          const hit = map.get("doc:" + v);
          if (!hit) continue;
          es.push({ a: tn.id, b: hit.id, why: tool + " referenced " + hit.label, at: e.time });
          hit.evidence.push({ text: tool + " in " + sn.label, at: e.time });
        }
      }
    }

    /* The human half: work done in apps with no session open. Without this the
       graph only shows what the agent did, which is half the story. */
    try {
      const acts = (await host.invoke("activity")).actions || [];
      for (const a of acts) {
        if (a.appId === "os") continue;
        const an = map.get("app:" + a.appId);
        if (!an) continue;
        an.evidence.push({ text: "you " + a.verb + " " + (a.target || ""), at: a.at, human: true });
        const dn = a.target && map.get("doc:" + a.target);
        if (dn) {
          es.push({ a: an.id, b: dn.id, why: "you " + a.verb + " " + dn.label, at: a.at, human: true });
          dn.evidence.push({ text: "you " + a.verb + " it", at: a.at, human: true });
        }
      }
    } catch (e) {}

    nodes = [...map.values()];
    /* Drop tools nobody used and apps with nothing attached, so the graph shows
       what happened rather than what exists. */
    const used = new Set(es.flatMap((e) => [e.a, e.b]));
    nodes = nodes.filter((n) => used.has(n.id) || n.kind === "doc" || n.kind === "app");
    edges = es.filter((e) => used.has(e.a) && used.has(e.b));
    for (const e of edges) {
      const A = map.get(e.a), B = map.get(e.b);
      if (A) A.edges.push(e);
      if (B) B.edges.push(e);
    }
  }

  function visible() {
    const v = VIEWS.find((x) => x.id === view) || VIEWS[0];
    if (!v.keep) return { nodes, edges, spec: v };
    const keep = nodes.filter(v.keep);
    const ids = new Set(keep.map((n) => n.id));
    return { nodes: keep, edges: edges.filter((e) => ids.has(e.a) && ids.has(e.b)), spec: v };
  }

  function drawTabs() {
    const box = bar.querySelector("#brViews");
    box.innerHTML = "";
    for (const v of VIEWS) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.textContent = v.label;
      b.setAttribute("aria-selected", String(v.id === view));
      b.addEventListener("click", () => { view = v.id; selected = null; drawTabs(); draw(); });
      box.appendChild(b);
    }
  }

  function draw() {
    canvas.innerHTML = "";
    const V = visible();
    const nodes = V.nodes, edges = V.edges;
    /* The count belongs to the lens, not the whole graph. Leaving it on the
       total made every view claim 17 nodes while showing two. */
    bar.querySelector("#brStat").innerHTML =
      "<b>" + nodes.length + "</b> nodes · <b>" + edges.length + "</b> edges, all from recorded events";
    if (!nodes.length) {
      const p = document.createElement("p");
      p.className = "mvb-empty";
      p.textContent = V.spec.empty;
      canvas.appendChild(p);
      return;
    }

    const cols = [[], [], []];
    for (const n of nodes) cols[KIND[n.kind].col].push(n);
    for (const c of cols) c.sort((a, b) => a.label.localeCompare(b.label));

    const ROW = 40, PADY = 30, COLW = 250;
    const height = Math.max(340, PADY * 2 + Math.max(...cols.map((c) => c.length)) * ROW);
    const width = 60 + COLW * 3;

    const pos = new Map();
    cols.forEach((c, ci) => c.forEach((n, i) => {
      pos.set(n.id, { x: 60 + ci * COLW, y: PADY + i * ROW + 10 });
    }));

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.display = "block";

    for (const e of edges) {
      const A = pos.get(e.a), B = pos.get(e.b);
      if (!A || !B) continue;
      const l = document.createElementNS(ns, "line");
      l.setAttribute("class", "e");
      l.setAttribute("x1", A.x); l.setAttribute("y1", A.y);
      l.setAttribute("x2", B.x); l.setAttribute("y2", B.y);
      if (selected && (e.a === selected || e.b === selected)) l.setAttribute("data-hot", "true");
      svg.appendChild(l);
    }

    for (const n of nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("class", "n");
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
      c.setAttribute("r", n.kind === "session" ? 8 : 6);
      c.setAttribute("fill", KIND[n.kind].color);
      c.setAttribute("stroke", "transparent");
      if (selected === n.id) c.setAttribute("data-sel", "true");
      c.addEventListener("click", () => { selected = n.id; draw(); detail(n); });
      svg.appendChild(c);

      const t = document.createElementNS(ns, "text");
      t.setAttribute("class", "lbl");
      t.setAttribute("x", p.x + 13); t.setAttribute("y", p.y + 1);
      t.textContent = n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label;
      svg.appendChild(t);

      if (n.sub) {
        const s = document.createElementNS(ns, "text");
        s.setAttribute("class", "sub");
        s.setAttribute("x", p.x + 13); s.setAttribute("y", p.y + 13);
        s.textContent = n.sub.length > 30 ? n.sub.slice(0, 29) + "…" : n.sub;
        svg.appendChild(s);
      }
    }
    canvas.appendChild(svg);
  }

  function detail(n) {
    const ev = n.evidence.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 14);
    side.innerHTML =
      "<h4>" + esc(n.label) + "</h4>" +
      '<p class="kind">' + KIND[n.kind].label + (n.sub ? " · " + esc(n.sub) : "") + "</p>" +
      "<h5>Connections</h5>" +
      (n.edges.length
        ? "<ul>" + n.edges.slice(0, 12).map((e) => "<li>" + esc(e.why) + "</li>").join("") + "</ul>"
        : '<p class="empty">None recorded.</p>') +
      "<h5>Evidence</h5>" +
      (ev.length
        ? "<ul>" + ev.map((e) => "<li>" + esc(e.text) + (e.at ? " — " + when(e.at) : "") + "</li>").join("") + "</ul>"
        : '<p class="empty">Nothing recorded for this node yet.</p>') +
      '<h5>Why this edge exists</h5><p class="empty">Every line above comes from the session log — ' +
      "a call that happened, at a time, in a session. None of it is inferred from similarity.</p>";
  }

  async function refresh() {
    try {
      await build();
      document.getElementById && null;
      drawTabs();
      draw();
      if (selected) {
        const n = nodes.find((x) => x.id === selected);
        if (n) detail(n);
      }
    } catch (e) {
      bar.querySelector("#brStat").textContent = "Could not build the graph: " + e.message;
    }
  }

  const timer = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    refresh();
  }, 8000);

  refresh();
  return function unmount() { clearInterval(timer); };
}
