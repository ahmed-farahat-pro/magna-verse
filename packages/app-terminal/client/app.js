/* Terminal — shell access, through the agent.
 *
 * This is deliberately NOT a PTY wired to a shell. Commands are asked of the
 * agent, which runs them with its `bash` tool — so every command travels the
 * tool pipeline, hits the same approval gate as everything else, and lands in
 * the session log where the Ledger and the Trajectory can see it.
 *
 * A direct PTY would be faster to type in and would bypass all three. On a
 * sovereign deployment whose entire claim is that nothing happens unobserved,
 * the slower path is the correct one — and the honest one, since the
 * alternative would quietly create an unlogged channel next to a logged UI.
 */

export const manifest = { id: "terminal", name: "Terminal" };

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
[data-mv-app="terminal"]{height:100%;display:flex;flex-direction:column;font-family:var(--mono);font-size:12.5px;overflow:hidden}
    .tm-note{flex:none;padding:8px 13px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));font-family:var(--sans);
      font-size:11.5px;color:var(--tx-3)}
    .tm-out{flex:1;overflow:auto;padding:11px 13px;white-space:pre-wrap;word-break:break-word;color:var(--tx-2)}
    .tm-out .cmd{color:var(--tx);display:block;margin:10px 0 3px}
    .tm-out .cmd::before{content:"$ ";opacity:.5}
    .tm-out .res{display:block;color:var(--tx-3)}
    .tm-out .err{display:block;color:var(--accent,#FF5A60)}
    .tm-out .wait{display:block;color:var(--tx-4);font-style:italic}
    .tm-in{flex:none;display:flex;gap:8px;padding:9px 13px;border-top:1px solid var(--glass-line, rgba(255,255,255,.11))}
    .tm-in input{flex:1;font:inherit;font-size:12.5px;padding:7px 10px;border-radius:8px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx)}
    .tm-in button{min-height:32px;padding:0 13px;border-radius:8px;font-family:var(--sans);font-size:12.5px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx);cursor:pointer}
  `;
  root.appendChild(style);

  const note = document.createElement("div");
  note.className = "tm-note";
  note.textContent =
    "Commands run through the agent's shell tool, so each one is approvable and appears in the Ledger. " +
    "This is not a raw terminal — that is the point.";
  const out = document.createElement("div");
  out.className = "tm-out";
  const inp = document.createElement("div");
  inp.className = "tm-in";
  inp.innerHTML = '<input id="tmQ" placeholder="ls -la" aria-label="Command" autocomplete="off">' +
                  '<button id="tmRun" type="button">Run</button>';
  root.appendChild(note);
  root.appendChild(out);
  root.appendChild(inp);

  const $ = (id) => root.querySelector("#" + id);
  const rpc = (m, p) => window.MVDsh.rpc(m, p || {});
  const line = (cls, txt) => { const s = document.createElement("span"); s.className = cls; s.textContent = txt; out.appendChild(s); out.scrollTop = out.scrollHeight; return s; };

  let sessionId = null;
  let busy = false;

  async function session() {
    if (sessionId) return sessionId;
    const v = await rpc("session.create", {});
    sessionId = v.sessionId;
    /* Pinned to whatever the desktop is using, so the Terminal does not quietly
       run on a different model from the rest of the OS. */
    if (window.MVDsh.model && window.MVDsh.model.provider) {
      await rpc("session.selectModel", {
        sessionId, provider: window.MVDsh.model.provider, model: window.MVDsh.model.model,
      });
    }
    return sessionId;
  }

  async function run() {
    const cmd = $("tmQ").value.trim();
    if (!cmd || busy) return;
    $("tmQ").value = "";
    busy = true;
    line("cmd", cmd);
    const waiting = line("wait", "running…");

    try {
      const sid = await session();
      host.observe({ verb: "run", target: cmd.slice(0, 60), summary: "ran a shell command" });
      await rpc("session.prompt", {
        sessionId: sid, mode: "queue",
        content: [{ type: "text", text:
          "Run exactly this shell command with your bash tool and show me its raw output. " +
          "Do not explain, do not summarise, do not run anything else.\n\n" + cmd }],
      });

      /* Poll the log rather than the answer text: the tool RESULT is the real
         output, and the model's prose around it is not. */
      const t0 = Date.now();
      let shown = false;
      while (Date.now() - t0 < 180000) {
        await new Promise((r) => setTimeout(r, 1500));
        const evs = ((await rpc("session.history", { sessionId: sid })).events || []).map((w) => w.event || w);
        const fresh = evs.filter((e) => e.time > t0 - 1000);
        for (const e of fresh) {
          if (e.type !== "tool/result") continue;
          const c = e.data && e.data.message && e.data.message.content;
          const txt = Array.isArray(c)
            ? c.flatMap((x) => x.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n")
            : "";
          if (txt) { waiting.remove(); line("res", txt.slice(0, 8000)); shown = true; }
        }
        const end = fresh.find((e) => e.type === "turn/end");
        if (end) {
          waiting.remove();
          if (!shown) {
            const r = end.data && end.data.reason;
            line(r && r.kind === "error" ? "err" : "res",
              r && r.kind === "error" ? (r.error && r.error.message) || "the turn failed"
                : "(no output — the command may have been refused, or produced nothing)");
          }
          break;
        }
      }
    } catch (e) {
      waiting.remove();
      line("err", e.message);
    }
    busy = false;
    $("tmQ").focus();
  }

  $("tmRun").addEventListener("click", run);
  $("tmQ").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

  line("res", "Ready. Every command here is logged and approvable.");
  return function unmount() {};
}
