/* Models — model routes as UI rather than YAML.
 *
 * Writes through settings.mutate and credentials.set, which is what the
 * harness's own settings UI does. Editing the file directly would work too, but
 * only until the next boot: the running process holds its own resolved
 * settings, so a file edit and a live process disagree until you restart. The
 * API keeps both in step.
 *
 * Credentials never pass through here as values you can read back. The schema
 * accepts only a reference, and the value goes to the credentials seam.
 */

export const manifest = { id: "models", name: "Models" };

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
[data-mv-app="models"]{height:100%;display:flex;flex-direction:column;font-size:13px;overflow:hidden}
    .md-bar{flex:none;padding:10px 14px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));display:flex;gap:10px;
      align-items:center;flex-wrap:wrap}
    .md-bar .st{font-size:11.5px;color:var(--tx-3)}
    .md-bar .st b{color:var(--tx);font-weight:600}
    .md-bar button{min-height:30px;padding:0 12px;border-radius:8px;font:inherit;font-size:12.5px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx);cursor:pointer;margin-left:auto}
    .md-body{flex:1;overflow:auto;padding:12px 14px}
    .md-card{border:1px solid var(--glass-line, rgba(255,255,255,.11));border-radius:11px;padding:12px 14px;margin:0 0 10px;background:var(--glass, rgba(255,255,255,.04))}
    .md-h{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
    .md-h .nm{font-weight:650;font-size:14px}
    .md-h .rt{font-family:var(--mono);font-size:11px;color:var(--tx-4)}
    .md-h .st{margin-left:auto;font-size:10.5px;padding:2px 9px;border-radius:999px;border:1px solid}
    .md-h .st[data-a="true"]{color:var(--private,#3FCF95);border-color:currentColor}
    .md-h .st[data-a="false"]{color:var(--tx-4);border-color:var(--glass-line, rgba(255,255,255,.11))}
    .md-meta{font-family:var(--mono);font-size:11px;color:var(--tx-3);margin:7px 0 0}
    .md-models{margin:8px 0 0;display:flex;gap:6px;flex-wrap:wrap}
    .md-models span{font-family:var(--mono);font-size:10.5px;padding:2px 8px;border-radius:6px;
      background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx-3)}
    .md-form{border:1px solid var(--glass-line, rgba(255,255,255,.11));border-radius:11px;padding:13px 15px;margin:0 0 12px;background:var(--glass-2, rgba(255,255,255,.06))}
    .md-form h4{margin:0 0 4px;font-size:13.5px}
    .md-form p{margin:0 0 10px;font-size:12px;color:var(--tx-3)}
    .md-form label{display:block;font-size:11.5px;color:var(--tx-3);margin:0 0 8px}
    .md-form input{width:100%;font:inherit;font-size:12.5px;padding:6px 9px;border-radius:7px;margin-top:3px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass, rgba(255,255,255,.04));color:var(--tx)}
    .md-form .row{display:flex;gap:9px;align-items:center;margin-top:4px}
    .md-form button{min-height:32px;padding:0 14px;border-radius:8px;font:inherit;font-size:12.5px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass, rgba(255,255,255,.04));color:var(--tx);cursor:pointer}
    .md-note{font-size:11.5px;color:var(--tx-3)}
    .md-note[data-k="err"]{color:var(--accent,#FF5A60)}
    .md-empty{color:var(--tx-4);padding:20px 2px;line-height:1.6}
  `;
  root.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "md-bar";
  bar.innerHTML = '<span class="st" id="mdStat">Loading…</span><button id="mdAdd" type="button">Add a route</button>';
  const body = document.createElement("div");
  body.className = "md-body";
  root.appendChild(bar);
  root.appendChild(body);

  const $ = (id) => root.querySelector("#" + id);
  const rpc = (m, p) => window.MVDsh.rpc(m, p || {});
  const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

  let showForm = false;
  setTimeout(() => $("mdAdd").addEventListener("click", () => { showForm = !showForm; render(); }), 0);

  function form() {
    const f = el("div", "md-form");
    f.innerHTML =
      "<h4>Add an OpenAI-compatible route</h4>" +
      "<p>Any endpoint speaking the OpenAI completions protocol — Ollama, vLLM, a gateway — is " +
      "configuration rather than code. The key is stored as a reference; its value never comes back here.</p>" +
      '<label>Route id<input id="fId" placeholder="ollama-2"></label>' +
      '<label>Display name<input id="fName" placeholder="Ollama (second box)"></label>' +
      '<label>Base URL<input id="fUrl" placeholder="http://127.0.0.1:11434/v1"></label>' +
      '<label>Models, comma separated<input id="fModels" placeholder="qwen2.5-coder:14b, llama3.1:8b"></label>' +
      '<label>API key (stored as a reference; use any value for a local endpoint that ignores it)' +
      '<input id="fKey" type="password" placeholder="local-no-auth"></label>' +
      '<div class="row"><button id="fSave" type="button">Save route</button><span class="md-note" id="fNote"></span></div>';

    f.querySelector("#fSave").addEventListener("click", async () => {
      const id = f.querySelector("#fId").value.trim();
      const url = f.querySelector("#fUrl").value.trim();
      const note = f.querySelector("#fNote");
      note.removeAttribute("data-k");
      if (!/^[a-z0-9][\w-]*$/i.test(id)) { note.textContent = "Route id must be a plain word."; note.setAttribute("data-k", "err"); return; }
      if (!/^https?:\/\//.test(url)) { note.textContent = "Base URL must start with http:// or https://"; note.setAttribute("data-k", "err"); return; }

      const models = f.querySelector("#fModels").value.split(",").map((s) => s.trim()).filter(Boolean)
        .map((m) => ({ id: m, name: m, contextWindow: 32768 }));
      if (!models.length) { note.textContent = "List at least one model id."; note.setAttribute("data-k", "err"); return; }

      const ref = (id.toUpperCase().replace(/[^A-Z0-9]/g, "_")) + "_API_KEY";
      note.textContent = "Saving…";
      try {
        /* A hand-declared route still needs a credential: pi-ai fails the
           request with "No API key for provider" even where the endpoint
           ignores it, and the schema takes only a reference. */
        await rpc("credentials.set", { ref, value: f.querySelector("#fKey").value || "local-no-auth" });
        await rpc("settings.mutate", {
          ns: "llm-pi-ai",
          ops: [{ op: "set", path: ["providers", id], value: {
            displayName: f.querySelector("#fName").value.trim() || id,
            api: "openai-completions",
            baseURL: url,
            apiKeyEnv: ref,
            models,
          } }],
        });
        note.textContent = "Saved. The route is live now — no restart needed.";
        host.observe({ verb: "create", target: id, summary: "added model route " + id });
        showForm = false;
        setTimeout(render, 700);
      } catch (e) {
        note.textContent = e.message;
        note.setAttribute("data-k", "err");
      }
    });
    return f;
  }

  async function render() {
    body.innerHTML = "";
    if (showForm) body.appendChild(form());

    const provs = (await rpc("llm.providers", {})).providers || [];
    const groups = (await rpc("llm.models", {})).groups || [];
    const byId = new Map(groups.map((g) => [g.id, g]));
    const active = provs.filter((p) => p.active);
    const total = groups.reduce((n, g) => n + g.models.length, 0);
    $("mdStat").innerHTML = "<b>" + active.length + "</b> active routes · <b>" + total + "</b> models · " +
      (provs.length - active.length) + " available but unconfigured";

    for (const p of active) {
      const g = byId.get(p.provider);
      const c = el("div", "md-card");
      const h = el("div", "md-h");
      h.appendChild(el("span", "nm", p.displayName || p.provider));
      h.appendChild(el("span", "rt", p.provider));
      const st = el("span", "st", p.provider === "ollama" ? "local" : "remote");
      st.setAttribute("data-a", String(p.provider === "ollama"));
      h.appendChild(st);
      c.appendChild(h);
      c.appendChild(el("p", "md-meta", p.settingsNs + " · " + (p.settingsPath || []).join(".")));
      if (g) {
        const list = el("div", "md-models");
        for (const m of g.models.slice(0, 14)) list.appendChild(el("span", null, m.id));
        if (g.models.length > 14) list.appendChild(el("span", null, "+" + (g.models.length - 14) + " more"));
        c.appendChild(list);
      }
      body.appendChild(c);
    }
    if (!active.length) body.appendChild(el("p", "md-empty", "No routes are configured."));
  }

  render().catch((e) => { body.appendChild(el("p", "md-empty", "Could not load: " + e.message)); });
  return function unmount() {};
}
