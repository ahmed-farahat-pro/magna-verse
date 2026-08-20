/* Connections — the browser half.

   Every card on this screen corresponds to something the harness can actually
   observe. The version this replaces showed six enterprise systems with green
   "linked" ticks and repository counts, then admitted in small type at the
   bottom that no OAuth handshake ever happened and no token was ever stored.

   The thing that makes this screen worth having is the residency column, so it
   is the loudest thing on it: local, external, or unknown. Unknown is shown as
   its own state rather than being rounded down to local, because rounding in
   that direction is how a sovereignty claim becomes false. */

export const manifest = { id: "conn", name: "Connections" };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ico = (id, cls) => '<svg class="ico ' + (cls || "") + '"><use href="#' + id + '"/></svg>';

const ICON = { model: "i-model", mail: "i-mail", app: "i-cube" };

const RESIDENCY = {
  local: { label: "on this machine", tone: "priv" },
  external: { label: "leaves this machine", tone: "pub" },
  unknown: { label: "residency unknown", tone: "warn" },
};

export function mount(host, root) {
  root.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  const view = document.createElement("div");
  view.className = "cn-view";
  root.appendChild(view);

  let tab = "connectors";

  function shell(inner) {
    return '<div class="cn-tabs">' +
      [["connectors", "Connections"], ["providers", "Models & egress"]].map(([k, l]) =>
        '<button class="cn-tab' + (tab === k ? " on" : "") + '" data-tab="' + k + '">' + l + "</button>").join("") +
      "</div>" + inner;
  }

  /* ---- the Connections tab --------------------------------------------- */

  const TIER = {
    verified: { l: "tested against the live service", tone: "good" },
    untested: { l: "real protocol, never run here", tone: "warn" },
    elsewhere: { l: "connected in another app", tone: "info" },
  };

  async function drawConnectors() {
    let r;
    try { r = await host.invoke("connectors"); }
    catch (e) { view.innerHTML = shell('<p class="cn-empty">' + esc(e.message) + "</p>"); return; }

    const cards = r.connectors.map((c) => {
      const tier = TIER[c.tier] || TIER.untested;
      const on = c.state === "connected";
      const bad = c.state === "error";
      const action = c.connectIn
        ? '<button class="cn-btn" data-goto="' + esc(c.connectIn.appId) + '">' + esc(c.connectIn.label) + "</button>"
        : on || bad
          ? '<button class="cn-btn" data-edit="' + esc(c.id) + '">Manage</button>' +
            '<button class="cn-btn danger" data-off="' + esc(c.id) + '">Disconnect</button>'
          : '<button class="cn-btn pri" data-edit="' + esc(c.id) + '">Connect</button>';
      return (
        '<div class="cn-card" data-state="' + esc(c.state) + '">' +
          '<div class="cn-top">' +
            '<span class="cn-ab" style="background:' + esc(c.brand) + '">' + esc(c.ab) + "</span>" +
            '<span class="cn-nm">' + esc(c.name) + "</span>" +
            '<span class="cn-state">' + esc(on ? "linked" : bad ? "error" : "available") + "</span>" +
          "</div>" +
          '<p class="cn-detail">' + esc(c.detail || "") + "</p>" +
          (c.account ? '<p class="cn-ep">' + esc(c.account) + "</p>" : "") +
          '<div class="cn-foot2">' +
            '<span class="cn-res" data-tone="' + tier.tone + '">' + esc(tier.l) + "</span>" +
            '<span class="cn-eg">' + esc(c.egress || "") + "</span>" +
          "</div>" +
          '<div class="cn-acts">' + action + "</div>" +
        "</div>"
      );
    }).join("");

    view.innerHTML = shell(
      '<p class="sub">Every card is a real integration. Connecting calls the service and stores the ' +
      'credential in the harness credential store — a card only says <b>linked</b> because the service ' +
      'answered, never because a form was filled in.</p>' +
      '<div class="cn-grid">' + cards + "</div>");
  }

  /* The connect sheet for one connector. */
  async function openConnect(id) {
    const r = await host.invoke("connectors");
    const c = r.connectors.find((x) => x.id === id);
    if (!c) return;
    const panel = document.createElement("div");
    panel.className = "cn-sheet";
    panel.innerHTML =
      '<div class="cn-sheet-in">' +
        '<div class="cn-top"><span class="cn-ab" style="background:' + esc(c.brand) + '">' + esc(c.ab) + "</span>" +
          '<span class="cn-nm">' + esc(c.name) + "</span>" +
          '<button class="cn-btn" data-close>' + ico("i-x") + "</button></div>" +
        '<p class="sub">' + esc(c.blurb || "") + "</p>" +
        (c.tier === "untested"
          ? '<div class="cn-warn">' + ico("i-warn") + "<span>This connector has never been run against a " +
            "real server — there is no public instance to test it on. The protocol is standard; if it " +
            "fails, the error it prints is the service's own.</span></div>"
          : "") +
        (c.fields || []).map((f) =>
          '<div class="cn-f"><label for="cf-' + esc(f.k) + '">' + esc(f.l) + "</label>" +
          '<input id="cf-' + esc(f.k) + '" type="' + (f.secret ? "password" : "text") + '" data-f="' + esc(f.k) + '"' +
          ' value="' + esc((c.config && c.config[f.k]) || f.d || "") + '"' +
          (f.secret ? ' placeholder="' + (c.state === "connected" ? "unchanged" : "") + '"' : "") + ">" +
          (f.hint ? '<span class="hint">' + esc(f.hint) + "</span>" : "") + "</div>").join("") +
        '<div class="cn-acts">' +
          '<button class="cn-btn" data-test>Test</button>' +
          '<button class="cn-btn pri" data-save>' + ico("i-plug") + "<span>Connect</span></button>" +
        "</div>" +
        '<p class="cn-status" data-st></p>' +
      "</div>";
    root.appendChild(panel);

    const fields = () => {
      const out = {};
      panel.querySelectorAll("[data-f]").forEach((i) => { out[i.dataset.f] = i.value; });
      return out;
    };
    const set = (m, bad) => {
      const el = panel.querySelector("[data-st]");
      el.textContent = m; el.setAttribute("data-tone", bad ? "bad" : "ok");
    };

    panel.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]") || e.target === panel) { panel.remove(); return; }
      if (e.target.closest("[data-test]")) {
        set("Contacting " + c.name + "…");
        try { const w = await host.invoke("testConnector", { id, fields: fields() });
              set("Reached " + c.name + " as " + (w.name || w.account) + "."); }
        catch (err) { set(err.message, true); }
        return;
      }
      if (!e.target.closest("[data-save]")) return;
      set("Connecting…");
      try {
        const w = await host.invoke("connect", { id, fields: fields() });
        set("Connected as " + (w.name || w.account) + ".");
        setTimeout(() => { panel.remove(); draw(); }, 700);
      } catch (err) { set(err.message, true); }
    });
  }

  async function draw() {
    if (tab === "connectors") return drawConnectors();
    let s;
    try {
      s = await host.invoke("state");
    } catch (e) {
      view.innerHTML = shell('<p class="cn-empty">Connections could not load: ' + esc(e.message) + "</p>");
      return;
    }

    const { rows, notConnected, summary } = s;

    view.innerHTML = shell(
      '<div class="cn-head">' +
        "<h3>Connections</h3>" +
        '<p class="sub">' + esc(sentence(summary)) + "</p>" +
      "</div>" +

      (rows.length
        ? '<div class="cn-grid">' + rows.map(card).join("") + "</div>"
        : '<p class="cn-empty">Nothing on this machine reaches outside it.</p>') +

      /* The absent list is part of the answer, not a footnote. */
      '<div class="cn-not">' +
        '<h4>' + ico("i-shield") + "Not connected</h4>" +
        notConnected.map((n) =>
          '<div class="cn-nrow"><b>' + esc(n.title) + "</b><span>" + esc(n.why) + "</span></div>",
        ).join("") +
      "</div>" +

      '<p class="cn-foot">Every card above is derived from what the harness can observe right now — ' +
      'a configured model provider, a connected mailbox, or an app whose manifest declares egress. ' +
      'Nothing here is a placeholder.</p>');
  }

  function sentence(sm) {
    const bits = [];
    bits.push(sm.total + " connector" + (sm.total === 1 ? "" : "s"));
    if (sm.local) bits.push(sm.local + " on this machine");
    if (sm.external) bits.push(sm.external + " reaching outside it");
    if (sm.unknown) bits.push(sm.unknown + " of unknown residency");
    let out = bits.join(" · ") + ".";
    if (!sm.llmAvailable) out += " No model runtime is mounted in this profile.";
    else if (sm.llmError) out += " The model runtime could not be read: " + sm.llmError;
    return out;
  }

  function card(r) {
    const res = RESIDENCY[r.residency] || RESIDENCY.unknown;
    return (
      '<div class="cn-card" data-state="' + esc(r.state) + '">' +
        '<div class="cn-top">' +
          '<span class="cn-ico">' + ico(ICON[r.kind] || "i-cube") + "</span>" +
          '<span class="cn-nm">' + esc(r.title) + "</span>" +
          '<span class="cn-state">' + esc(stateLabel(r.state)) + "</span>" +
        "</div>" +
        '<p class="cn-detail">' + esc(r.detail) + "</p>" +
        (r.endpoint ? '<p class="cn-ep">' + esc(r.endpoint) + "</p>" : "") +
        '<span class="cn-res" data-tone="' + res.tone + '">' + esc(res.label) + "</span>" +
      "</div>"
    );
  }

  function stateLabel(s) {
    return { connected: "connected", configured: "configured", available: "not connected",
             absent: "not installed", error: "error" }[s] || s;
  }

  view.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; draw(); return; }
    const edit = e.target.closest("[data-edit]");
    if (edit) { openConnect(edit.dataset.edit); return; }
    const goto = e.target.closest("[data-goto]");
    if (goto) {
      /* Cross-app, through the OS. The Mail app owns the Microsoft sign-in, so
         this points at it rather than keeping a second token store. */
      try { await host.invokeApp("market", "list", {}); } catch { /* best effort */ }
      const b = document.querySelector('[data-open="' + goto.dataset.goto + '"]');
      if (b) b.click();
      return;
    }
    const off = e.target.closest("[data-off]");
    if (off) {
      const ok = await host.confirm({
        title: "Disconnect this service?",
        detail: "The stored credential is removed from this machine. Nothing at the service changes.",
        danger: true, confirm: "Disconnect",
      });
      if (!ok) return;
      await host.invoke("disconnect", { id: off.dataset.off });
      draw();
    }
  });

  draw();

  /* Connections change when a mailbox is connected or a plugin installed, so a
     slow refresh keeps it honest without polling hard at anything. `state` is
     declared read-only on the host, so this never enters the journal. */
  const timer = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    draw().catch?.(() => {});
  }, 8000);

  return function unmount() { clearInterval(timer); };
}

const STYLE = `
[data-mv-app="conn"]{height:100%;overflow-y:auto;font-size:13px}
[data-mv-app="conn"] .cn-view{padding:18px 20px 24px}
[data-mv-app="conn"] .cn-head h3{margin:0 0 5px;font-size:16px;font-weight:660}
[data-mv-app="conn"] .cn-head .sub{margin:0 0 18px;font-size:11.5px;color:var(--tx-3);line-height:1.6}
[data-mv-app="conn"] .cn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:11px}
[data-mv-app="conn"] .cn-card{border:1px solid var(--glass-line);background:var(--glass-3);border-radius:11px;
  padding:12px 13px;display:flex;flex-direction:column;gap:7px}
[data-mv-app="conn"] .cn-card[data-state="error"]{border-color:var(--signal-dim)}
[data-mv-app="conn"] .cn-card[data-state="absent"],[data-mv-app="conn"] .cn-card[data-state="available"]{opacity:.62}
[data-mv-app="conn"] .cn-top{display:flex;align-items:center;gap:8px}
[data-mv-app="conn"] .cn-ico{width:26px;height:26px;flex:none;border-radius:7px;display:grid;place-items:center;
  background:var(--glass-2);border:1px solid var(--glass-line-2)}
[data-mv-app="conn"] .cn-ico .ico{width:15px;height:15px;color:var(--tx-2)}
[data-mv-app="conn"] .cn-nm{flex:1;min-width:0;font-size:12.5px;font-weight:640;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="conn"] .cn-state{flex:none;font-family:var(--mono);font-size:9px;text-transform:uppercase;
  letter-spacing:.05em;color:var(--tx-4);border:1px solid var(--glass-line-2);border-radius:5px;padding:1px 5px}
[data-mv-app="conn"] .cn-card[data-state="connected"] .cn-state{color:var(--private);border-color:var(--private-dim)}
[data-mv-app="conn"] .cn-card[data-state="error"] .cn-state{color:var(--signal);border-color:var(--signal-dim)}
[data-mv-app="conn"] .cn-detail{margin:0;font-size:11px;color:var(--tx-2);line-height:1.55;word-break:break-word}
[data-mv-app="conn"] .cn-ep{margin:0;font-family:var(--mono);font-size:10px;color:var(--tx-4);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="conn"] .cn-res{align-self:flex-start;font-size:10px;font-weight:600;border-radius:5px;padding:2px 6px}
[data-mv-app="conn"] .cn-res[data-tone="priv"]{color:var(--private);background:var(--private-dim)}
[data-mv-app="conn"] .cn-res[data-tone="pub"]{color:var(--public);background:var(--public-dim)}
[data-mv-app="conn"] .cn-res[data-tone="warn"]{color:var(--signal);background:var(--signal-dim)}
[data-mv-app="conn"] .cn-not{margin-top:20px;border:1px solid var(--glass-line);border-radius:11px;padding:13px 14px;
  background:rgba(0,0,0,.14)}
:root[data-theme="light"] [data-mv-app="conn"] .cn-not{background:rgba(0,0,0,.04)}
[data-mv-app="conn"] .cn-not h4{margin:0 0 9px;font-size:12px;font-weight:640;display:flex;align-items:center;gap:7px}
[data-mv-app="conn"] .cn-not h4 .ico{width:14px;height:14px;color:var(--tx-3)}
[data-mv-app="conn"] .cn-nrow{display:flex;flex-direction:column;gap:2px;padding:7px 0;
  border-top:1px solid var(--glass-line)}
[data-mv-app="conn"] .cn-nrow b{font-size:11.5px;font-weight:620;color:var(--tx-2)}
[data-mv-app="conn"] .cn-nrow span{font-size:11px;color:var(--tx-4);line-height:1.55}
[data-mv-app="conn"] .cn-foot{margin:16px 0 0;font-size:11px;color:var(--tx-4);line-height:1.6}
[data-mv-app="conn"] .cn-empty{padding:30px;text-align:center;font-size:12px;color:var(--tx-4)}

/* ---- tabs ---- */
[data-mv-app="conn"] .cn-tabs{display:flex;gap:2px;margin:0 0 16px;border-bottom:1px solid var(--glass-line)}
[data-mv-app="conn"] .cn-tab{height:30px;padding:0 13px;border:0;background:transparent;color:var(--tx-3);
  font:inherit;font-size:12.5px;font-weight:620;cursor:pointer;border-bottom:2px solid transparent}
[data-mv-app="conn"] .cn-tab.on{color:var(--tx);border-bottom-color:var(--accent)}

/* ---- connector cards ---- */
[data-mv-app="conn"] .cn-ab{width:28px;height:28px;flex:none;border-radius:7px;display:grid;place-items:center;
  font-family:var(--mono);font-size:10.5px;font-weight:800;color:#fff;letter-spacing:.02em}
[data-mv-app="conn"] .cn-card[data-state="available"]{opacity:1}
[data-mv-app="conn"] .cn-card[data-state="connected"]{border-color:var(--private-dim)}
[data-mv-app="conn"] .cn-card[data-state="connected"] .cn-state{color:var(--private);border-color:var(--private-dim)}
[data-mv-app="conn"] .cn-foot2{display:flex;flex-direction:column;gap:3px;margin-top:auto}
[data-mv-app="conn"] .cn-eg{font-family:var(--mono);font-size:9.5px;color:var(--tx-4);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="conn"] .cn-res[data-tone="good"]{color:var(--private);background:var(--private-dim)}
[data-mv-app="conn"] .cn-res[data-tone="info"]{color:var(--cyan);background:var(--accent-dim)}
[data-mv-app="conn"] .cn-acts{display:flex;gap:6px;margin-top:9px}
[data-mv-app="conn"] .cn-btn{height:27px;padding:0 10px;border-radius:7px;display:inline-flex;align-items:center;
  gap:5px;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;background:var(--glass-3);
  border:1px solid var(--glass-line-2);color:var(--tx-2)}
[data-mv-app="conn"] .cn-btn:hover{background:var(--glass-2);color:var(--tx)}
[data-mv-app="conn"] .cn-btn.pri{background:var(--accent);border-color:transparent;color:#fff}
[data-mv-app="conn"] .cn-btn.danger{color:var(--signal);border-color:var(--signal-dim)}
[data-mv-app="conn"] .cn-btn .ico{width:12px;height:12px}

/* ---- the connect sheet ---- */
[data-mv-app="conn"] .cn-sheet{position:absolute;inset:0;background:rgba(0,0,0,.55);z-index:12;
  display:grid;place-items:center;padding:20px;backdrop-filter:blur(3px)}
[data-mv-app="conn"] .cn-sheet-in{width:min(430px,100%);max-height:100%;overflow-y:auto;
  background:var(--bg,#05070C);border:1px solid var(--glass-line-2);border-radius:14px;
  box-shadow:var(--shadow-pop);padding:17px}
[data-mv-app="conn"] .cn-sheet-in .cn-top{margin-bottom:9px}
[data-mv-app="conn"] .cn-sheet-in .cn-top .cn-btn{margin-left:auto}
[data-mv-app="conn"] .cn-f{display:flex;flex-direction:column;gap:4px;margin-bottom:11px}
[data-mv-app="conn"] .cn-f label{font-size:10.5px;font-weight:600;color:var(--tx-3)}
[data-mv-app="conn"] .cn-f input{height:29px;padding:0 9px;border-radius:7px;background:var(--glass-3);
  border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:11.5px;outline:none}
[data-mv-app="conn"] .cn-f input:focus{border-color:var(--cyan)}
[data-mv-app="conn"] .cn-f .hint{font-size:10px;color:var(--tx-4);line-height:1.45}
[data-mv-app="conn"] .cn-warn{display:flex;gap:7px;align-items:flex-start;padding:9px 10px;border-radius:8px;
  background:color-mix(in srgb,var(--signal) 12%,transparent);border:1px solid var(--signal-dim);
  font-size:10.5px;line-height:1.5;color:var(--tx-2);margin:0 0 12px}
[data-mv-app="conn"] .cn-warn .ico{width:13px;height:13px;flex:none;margin-top:1px;color:var(--signal)}
[data-mv-app="conn"] .cn-status{margin:10px 0 0;font-size:11.5px;line-height:1.5;min-height:16px}
[data-mv-app="conn"] .cn-status[data-tone="ok"]{color:var(--private)}
[data-mv-app="conn"] .cn-status[data-tone="bad"]{color:var(--signal)}
[data-mv-app="conn"] .cn-view{position:relative}
`;
