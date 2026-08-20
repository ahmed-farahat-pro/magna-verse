/* Approvals — every permission the harness asked for, and what was decided.
 *
 * Read from the session log rather than kept in a table of its own. That is the
 * point: the log is already the record, so this view cannot drift from what
 * actually happened, and there is no second store to keep in sync.
 */

export const manifest = { id: "approvals", name: "Approvals" };

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
[data-mv-app="approvals"]{height:100%;display:flex;flex-direction:column;font-size:13px;overflow:hidden}
    .ap-bar{flex:none;padding:10px 14px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));display:flex;gap:14px;
      align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--tx-3)}
    .ap-bar b{color:var(--tx);font-weight:600}
    .ap-body{flex:1;overflow:auto;padding:12px 14px}
    .ap-row{border:1px solid var(--glass-line, rgba(255,255,255,.11));border-radius:10px;padding:11px 13px;margin:0 0 9px;
      background:var(--glass, rgba(255,255,255,.04));display:flex;gap:11px;align-items:flex-start}
    .ap-row .pip{width:9px;height:9px;border-radius:50%;flex:none;margin-top:5px;background:var(--tx-4)}
    .ap-row[data-o="allowed-once"] .pip{background:var(--private,#3FCF95)}
    .ap-row[data-o="rejected"] .pip{background:var(--accent,#FF5A60)}
    .ap-row[data-o="pending"] .pip{background:var(--public,#E0A33C)}
    .ap-row .b{flex:1;min-width:0}
    .ap-row .tool{font-family:var(--mono);font-size:12.5px;color:var(--tx)}
    .ap-row .why{color:var(--tx-3);font-size:12.5px;margin:4px 0 0}
    .ap-row .meta{font-family:var(--mono);font-size:10.5px;color:var(--tx-4);margin:5px 0 0}
    .ap-row .out{font-size:10.5px;padding:2px 9px;border-radius:999px;border:1px solid;flex:none}
    .ap-row[data-o="allowed-once"] .out{color:var(--private,#3FCF95);border-color:currentColor}
    .ap-row[data-o="rejected"] .out{color:var(--accent,#FF5A60);border-color:currentColor}
    .ap-row[data-o="pending"] .out{color:var(--public,#E0A33C);border-color:currentColor}
    .ap-empty{color:var(--tx-4);padding:24px 4px;max-width:58ch;line-height:1.65}
  `;
  root.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "ap-bar";
  bar.id = "apBar";
  const body = document.createElement("div");
  body.className = "ap-body";
  root.appendChild(bar);
  root.appendChild(body);

  const rpc = (m, p) => window.MVDsh.rpc(m, p || {});
  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
  const ago = (ms) => {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return Math.round(s / 86400) + "d ago";
  };

  async function render() {
    const sess = (await rpc("session.list", {})).items || [];
    const rows = [];
    for (const s of sess.slice(0, 20)) {
      const sid = s.id || s.sessionId;
      let evs = [];
      try { evs = ((await rpc("session.history", { sessionId: sid })).events || []).map((w) => w.event || w); }
      catch (e) { continue; }

      /* asked and decided are separate events; join them by id so a row shows
         the question and the answer together rather than as two entries. */
      const asked = new Map();
      for (const e of evs) {
        if (e.type === "approval/asked") {
          asked.set(e.data.id, { id: e.data.id, tool: e.data.toolName || e.data.tool || "a tool",
                                 reason: e.data.reason || "", at: e.time,
                                 session: s.title || String(sid).slice(8, 16), outcome: "pending" });
        }
        if (e.type === "approval/decided") {
          const a = asked.get(e.data.id);
          if (a) { a.outcome = e.data.outcome || "decided"; a.decidedAt = e.time; }
        }
      }
      rows.push(...asked.values());
    }
    rows.sort((a, b) => (b.at || 0) - (a.at || 0));

    const allowed = rows.filter((r) => r.outcome === "allowed-once").length;
    const rejected = rows.filter((r) => r.outcome === "rejected").length;
    const pending = rows.filter((r) => r.outcome === "pending").length;
    bar.innerHTML = "<span><b>" + rows.length + "</b> asked</span><span><b>" + allowed +
      "</b> allowed</span><span><b>" + rejected + "</b> rejected</span><span><b>" +
      pending + "</b> still pending</span>";

    body.innerHTML = "";
    if (!rows.length) {
      body.appendChild(el("p", "ap-empty",
        "No approvals recorded. Your permission preset may be danger-full-access, which allows " +
        "everything without asking — in that case the agent is acting without ever stopping, " +
        "which is worth knowing rather than reading as 'nothing has happened'."));
      return;
    }
    for (const r of rows.slice(0, 120)) {
      const row = el("div", "ap-row");
      row.setAttribute("data-o", r.outcome);
      row.appendChild(el("span", "pip"));
      const b = el("div", "b");
      b.appendChild(el("div", "tool", r.tool));
      if (r.reason) b.appendChild(el("p", "why", r.reason));
      b.appendChild(el("p", "meta", r.session + " · asked " + ago(r.at) +
        (r.decidedAt ? " · decided " + ago(r.decidedAt) : "")));
      row.appendChild(b);
      row.appendChild(el("span", "out", r.outcome === "pending" ? "waiting" : r.outcome));
      body.appendChild(row);
    }
  }

  const timer = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    render().catch(() => {});
  }, 6000);

  render().catch((e) => { body.appendChild(el("p", "ap-empty", "Could not load: " + e.message)); });
  return function unmount() { clearInterval(timer); };
}
