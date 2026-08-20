/* Trajectory — the browser half.
 *
 * Reads sessions through the harness API directly, like the marketplace: this
 * is a systems app whose whole purpose is showing what the harness recorded,
 * and the session log is exactly the verified surface to read it from.
 *
 * The point of the view: agentic retrieval is only better than one-shot RAG if
 * you can see the decisions. So searches are called out separately from other
 * tool calls, with the query the agent chose and what came back — that is the
 * difference between "the model found it somehow" and "the model searched for
 * ZATCA, got three hits, and read the second one".
 */

export const manifest = { id: "trajectory", name: "Trajectory" };

const SEARCH_TOOLS = /(_search|_find|^grep$|^glob$|^web_search$|^session_)/;

export function mount(host, root) {
  root.innerHTML = "";
  /* Never assign root.className: this element is the Console's own window
     body and its class is what positions it below the title bar. Assigning
     wipes it and the app draws over the titlebar. Styling is scoped by the
     data-mv-app attribute the OS stamps here, so no class is needed. */

  const style = document.createElement("style");
  style.textContent = `
    /* The root rule targets the attribute, not a class: this element is the
   Console's own window body and assigning className to it wipes win-body. */
[data-mv-app="trajectory"]{height:100%;display:flex;font-size:13px;overflow:hidden}
    .tj-side{width:230px;flex:none;border-right:1px solid var(--glass-line, rgba(255,255,255,.11));display:flex;flex-direction:column}
    .tj-side h4{margin:0;padding:10px 12px;font-size:11px;letter-spacing:.05em;color:var(--tx-4);
      border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));font-weight:650}
    .tj-list{overflow:auto;flex:1}
    .tj-list button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));
      background:transparent;color:var(--tx-2);padding:9px 12px;font:inherit;font-size:12.5px;cursor:pointer;
      border-radius:0;min-height:auto}
    .tj-list button:hover{background:var(--glass-3, rgba(255,255,255,.09))}
    .tj-list button[aria-current="true"]{background:var(--glass-3, rgba(255,255,255,.09));color:var(--tx)}
    .tj-list .ttl{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tj-list .sub{display:block;font-family:var(--mono);font-size:10.5px;color:var(--tx-4);margin-top:2px}
    .tj-main{flex:1;display:flex;flex-direction:column;min-width:0}
    .tj-head{padding:10px 14px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));display:flex;gap:10px;
      align-items:center;flex-wrap:wrap}
    .tj-head .stat{font-size:11.5px;color:var(--tx-3)}
    .tj-head .stat b{color:var(--tx);font-weight:600}
    .tj-head label{font-size:11.5px;color:var(--tx-3);display:flex;gap:5px;align-items:center;cursor:pointer}
    .tj-body{flex:1;overflow:auto;padding:12px 14px}
    .ev{border-left:2px solid var(--glass-line, rgba(255,255,255,.11));padding:0 0 12px 12px;margin:0 0 2px;position:relative}
    .ev::before{content:"";position:absolute;left:-5px;top:4px;width:8px;height:8px;border-radius:50%;
      background:var(--tx-4)}
    .ev[data-k="search"]::before{background:var(--signal,#8B7CFF)}
    .ev[data-k="tool"]::before{background:var(--cyan,#4FD1C5)}
    .ev[data-k="approval"]::before{background:var(--public,#E0A33C)}
    .ev[data-k="user"]::before{background:var(--private,#3FCF95)}
    .ev[data-k="turn"]::before{background:var(--accent,#FF5A60)}
    .ev .h{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
    .ev .nm{font-family:var(--mono);font-size:12px;color:var(--tx)}
    .ev[data-k="search"] .nm{color:var(--signal,#8B7CFF)}
    .ev .tag{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--glass-line, rgba(255,255,255,.11));color:var(--tx-4)}
    .ev .t{font-family:var(--mono);font-size:10.5px;color:var(--tx-4);margin-left:auto}
    .ev pre{margin:5px 0 0;font-family:var(--mono);font-size:11.5px;color:var(--tx-3);white-space:pre-wrap;
      word-break:break-word;max-height:190px;overflow:auto;background:var(--glass-2, rgba(255,255,255,.06));padding:7px 9px;
      border-radius:7px}
    .tj-empty{color:var(--tx-4);padding:24px 4px;max-width:56ch;line-height:1.6}
  `;
  root.appendChild(style);

  const side = document.createElement("div");
  side.className = "tj-side";
  side.innerHTML = '<h4>Sessions</h4><div class="tj-list" id="tjList"></div>';
  const main = document.createElement("div");
  main.className = "tj-main";
  main.innerHTML =
    '<div class="tj-head">' +
    '<span class="stat" id="tjStat">Pick a session</span>' +
    '<label style="margin-left:auto"><input type="checkbox" id="tjOnlySearch"> searches and tools only</label>' +
    "</div>" +
    '<div class="tj-body" id="tjBody"></div>';
  root.appendChild(side);
  root.appendChild(main);

  const $ = (id) => root.querySelector("#" + id);
  let current = null;
  let onlyKey = false;

  $("tjOnlySearch").addEventListener("change", (e) => { onlyKey = e.target.checked; if (current) open(current); });

  const rpc = (m, p) => window.MVDsh.rpc(m, p || {});
  const ago = (ms) => {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return s + "s";
    if (s < 3600) return Math.round(s / 60) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    return Math.round(s / 86400) + "d";
  };
  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

  async function loadSessions() {
    const v = await rpc("session.list", {});
    const items = v.items || [];
    const list = $("tjList");
    list.innerHTML = "";
    if (!items.length) {
      list.appendChild(el("p", "tj-empty", "No sessions yet."));
      return;
    }
    for (const s of items.slice(0, 60)) {
      const id = s.id || s.sessionId;
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.id = id;
      b.appendChild(el("span", "ttl", s.title || "Untitled session"));
      b.appendChild(el("span", "sub", String(id).slice(8, 16)));
      b.addEventListener("click", () => open(id));
      list.appendChild(b);
    }
    if (!current) open(items[0].id || items[0].sessionId);
  }

  function classify(e) {
    if (e.type === "tool/call") {
      const n = e.data && e.data.name;
      return SEARCH_TOOLS.test(n || "") ? "search" : "tool";
    }
    if (e.type === "tool/result") return "tool";
    if (e.type.startsWith("approval/")) return "approval";
    if (e.type === "user/message") return "user";
    if (e.type === "turn/start" || e.type === "turn/end") return "turn";
    return "other";
  }

  function body(e, kind) {
    const d = e.data || {};
    if (e.type === "tool/call") return JSON.stringify(d.args ?? d.input ?? {}, null, 1);
    if (e.type === "tool/result") {
      const c = d.message && d.message.content;
      if (Array.isArray(c)) {
        const t = c.flatMap((x) => (x.content || [])).filter((x) => x.type === "text").map((x) => x.text);
        if (t.length) return t.join("\n");
      }
      return JSON.stringify(d).slice(0, 900);
    }
    if (e.type === "user/message") {
      const c = d.content || [];
      return c.filter((x) => x.type === "text").map((x) => x.text).join("\n").slice(0, 900);
    }
    if (e.type.startsWith("approval/")) return JSON.stringify(d, null, 1).slice(0, 500);
    return "";
  }

  async function open(id) {
    current = id;
    for (const b of $("tjList").querySelectorAll("button")) {
      b.setAttribute("aria-current", String(b.dataset.id === id));
    }
    const out = $("tjBody");
    out.innerHTML = "";
    $("tjStat").textContent = "Loading…";

    const v = await rpc("session.history", { sessionId: id });
    const evs = (v.events || []).map((w) => w.event || w);

    let tools = 0, searches = 0, approvals = 0;
    for (const e of evs) {
      const k = classify(e);
      if (k === "search") searches++;
      else if (e.type === "tool/call") tools++;
      if (e.type === "approval/asked") approvals++;
    }
    $("tjStat").innerHTML =
      "<b>" + evs.length + "</b> events · <b>" + searches + "</b> searches · <b>" +
      tools + "</b> other tool calls · <b>" + approvals + "</b> approvals";

    const shown = evs.filter((e) => {
      const k = classify(e);
      if (onlyKey) return k === "search" || k === "tool" || k === "approval";
      return k !== "other" || e.type === "assistant/message";
    });

    if (!shown.length) { out.appendChild(el("p", "tj-empty", "Nothing recorded in this session yet.")); return; }

    for (const e of shown) {
      const k = classify(e);
      const row = el("div", "ev");
      row.setAttribute("data-k", k);
      const h = el("div", "h");
      const label = e.type === "tool/call" ? (e.data && e.data.name) || "tool" : e.type;
      h.appendChild(el("span", "nm", label));
      if (k === "search") h.appendChild(el("span", "tag", "retrieval"));
      if (e.time) h.appendChild(el("span", "t", ago(e.time) + " ago"));
      row.appendChild(h);
      const txt = body(e, k);
      if (txt && txt.trim() && txt !== "{}") row.appendChild(el("pre", null, txt.slice(0, 1600)));
      out.appendChild(row);
    }
  }

  /* Sessions grow while you watch. Refresh the open one rather than making the
     user reopen it, and stop when the window goes away. */
  const timer = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    if (current) open(current).catch(() => {});
  }, 4000);

  loadSessions().catch((e) => {
    main.querySelector("#tjBody").appendChild(el("p", "tj-empty", "Could not load sessions: " + e.message));
  });

  return function unmount() { clearInterval(timer); };
}
