/* Ledger — the audit trail.
 *
 * Two sources, deliberately merged and deliberately labelled: the session log
 * (what the agent did) and the OS activity journal (what you did). A trail that
 * only recorded one of the two would be misleading in the specific way that
 * matters most in an audit — it would attribute your work to the agent, or
 * leave it out entirely.
 */

export const manifest = { id: "ledger", name: "Ledger" };

const KIND = {
  "tool/call":        { label: "tool", tone: "cyan" },
  "approval/asked":   { label: "asked", tone: "amber" },
  "approval/decided": { label: "decided", tone: "amber" },
  "user/message":     { label: "you asked", tone: "green" },
  "turn/end":         { label: "turn end", tone: "grey" },
  "session/title":    { label: "titled", tone: "grey" },
};

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
[data-mv-app="ledger"]{height:100%;display:flex;flex-direction:column;font-size:13px;overflow:hidden}
    .lg-bar{flex:none;padding:9px 14px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));display:flex;gap:10px;
      align-items:center;flex-wrap:wrap}
    .lg-bar input{flex:1;min-width:150px;font:inherit;font-size:12.5px;padding:6px 10px;border-radius:8px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx)}
    .lg-bar label{font-size:11.5px;color:var(--tx-3);display:flex;gap:5px;align-items:center;cursor:pointer}
    .lg-body{flex:1;overflow:auto}
    table.lg-t{border-collapse:collapse;width:100%;font-size:12.5px}
    table.lg-t th{position:sticky;top:0;background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx-4);font-size:10.5px;
      letter-spacing:.05em;text-align:left;padding:7px 12px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));font-weight:650}
    table.lg-t td{padding:7px 12px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));color:var(--tx-3);vertical-align:top}
    table.lg-t td.w{font-family:var(--mono);white-space:nowrap;color:var(--tx-4)}
    table.lg-t td.act{font-family:var(--mono);color:var(--tx-2)}
    .tone{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid;white-space:nowrap}
    .tone[data-t="cyan"]{color:var(--cyan,#4FD1C5);border-color:currentColor}
    .tone[data-t="amber"]{color:var(--public,#E0A33C);border-color:currentColor}
    .tone[data-t="green"]{color:var(--private,#3FCF95);border-color:currentColor}
    .tone[data-t="violet"]{color:var(--signal,#8B7CFF);border-color:currentColor}
    .tone[data-t="grey"]{color:var(--tx-4);border-color:var(--glass-line, rgba(255,255,255,.11))}
    .lg-empty{color:var(--tx-4);padding:24px 14px;max-width:58ch;line-height:1.65}
  `;
  root.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "lg-bar";
  bar.innerHTML =
    '<input id="lgQ" type="search" placeholder="Filter the trail" aria-label="Filter">' +
    '<label><input type="checkbox" id="lgHuman" checked> yours</label>' +
    '<label><input type="checkbox" id="lgAgent" checked> the agent\'s</label>' +
    '<span id="lgCount" style="font-size:11.5px;color:var(--tx-4)"></span>';
  const body = document.createElement("div");
  body.className = "lg-body";
  root.appendChild(bar);
  root.appendChild(body);

  const $ = (id) => root.querySelector("#" + id);
  const rpc = (m, p) => window.MVDsh.rpc(m, p || {});
  const stamp = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  let rows = [];
  for (const id of ["lgQ", "lgHuman", "lgAgent"]) {
    setTimeout(() => $(id).addEventListener("input", paint), 0);
  }

  async function load() {
    const out = [];

    /* Yours. */
    try {
      const acts = (await host.invoke("activity")).actions || [];
      for (const a of acts) {
        out.push({ at: a.at, who: "you", tone: "violet", kind: a.verb,
                   what: (a.summary || a.target || a.appId), where: a.appId });
      }
    } catch (e) {}

    /* The agent's. */
    const sess = (await rpc("session.list", {})).items || [];
    for (const s of sess.slice(0, 12)) {
      const sid = s.id || s.sessionId;
      let evs = [];
      try { evs = ((await rpc("session.history", { sessionId: sid })).events || []).map((w) => w.event || w); }
      catch (e) { continue; }
      for (const e of evs) {
        const k = KIND[e.type];
        if (!k) continue;
        let what = "";
        if (e.type === "tool/call") what = e.data.name;
        else if (e.type === "approval/asked") what = (e.data.toolName || "a tool") + " — " + (e.data.reason || "");
        else if (e.type === "approval/decided") what = e.data.outcome || "";
        else if (e.type === "user/message") {
          what = (e.data.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ").slice(0, 130);
        } else if (e.type === "turn/end") what = (e.data.reason && e.data.reason.kind) || "";
        else if (e.type === "session/title") what = e.data.title || "";
        out.push({ at: e.time, who: "agent", tone: k.tone, kind: k.label, what,
                   where: s.title || String(sid).slice(8, 16) });
      }
    }
    rows = out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  function paint() {
    const q = ($("lgQ").value || "").trim().toLowerCase();
    const wantHuman = $("lgHuman").checked, wantAgent = $("lgAgent").checked;
    const shown = rows.filter((r) => {
      if (r.who === "you" && !wantHuman) return false;
      if (r.who === "agent" && !wantAgent) return false;
      if (!q) return true;
      return (r.kind + " " + r.what + " " + r.where).toLowerCase().indexOf(q) >= 0;
    });
    $("lgCount").textContent = shown.length + " of " + rows.length;

    if (!shown.length) {
      body.innerHTML = '<p class="lg-empty">Nothing matches. The trail fills as you and the agent work.</p>';
      return;
    }
    const t = document.createElement("table");
    t.className = "lg-t";
    t.innerHTML = "<tr><th>Time</th><th>Who</th><th>What</th><th>Detail</th><th>Where</th></tr>";
    for (const r of shown.slice(0, 400)) {
      const tr = document.createElement("tr");
      const td = (cls, txt) => { const d = document.createElement("td"); if (cls) d.className = cls; d.textContent = txt; return d; };
      tr.appendChild(td("w", r.at ? stamp(r.at) : ""));
      const who = document.createElement("td");
      const sp = document.createElement("span");
      sp.className = "tone";
      sp.setAttribute("data-t", r.tone);
      sp.textContent = r.who;
      who.appendChild(sp);
      tr.appendChild(who);
      tr.appendChild(td("act", r.kind));
      tr.appendChild(td(null, r.what || ""));
      tr.appendChild(td("w", r.where || ""));
      t.appendChild(tr);
    }
    body.innerHTML = "";
    body.appendChild(t);
  }

  async function refresh() { await load(); paint(); }

  const timer = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    refresh().catch(() => {});
  }, 7000);

  refresh().catch((e) => { body.innerHTML = '<p class="lg-empty">Could not load: ' + e.message + "</p>"; });
  return function unmount() { clearInterval(timer); };
}
