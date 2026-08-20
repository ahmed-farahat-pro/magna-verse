/* API Studio — the browser half.

   Every number on this screen is measured. The version it replaces looked up a
   canned body by request id and printed "200 OK · 142 ms · 1.9 KB" without
   sending anything, for three collections of endpoints that do not exist. */

export const manifest = { id: "api", name: "API Studio" };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ico = (id, cls) => '<svg class="ico ' + (cls || "") + '"><use href="#' + id + '"/></svg>';

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const fmtBytes = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");

export function mount(host, root) {
  root.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  /** The request being edited. Never persisted until Save is pressed. */
  let cur = blank();
  let tab = "params";

  function blank() {
    return {
      id: null, name: "", collection: "Saved", method: "GET", url: "",
      params: [], headers: [], auth: { kind: "none", token: "", user: "", pass: "", headerName: "X-API-Key" },
      body: "", bodyType: "none",
    };
  }

  root.insertAdjacentHTML("beforeend", `
    <div class="ap-side">
      <div class="ap-side-top"><b>Saved</b><button class="ap-btn sm" data-new>${ico("i-plus")}</button></div>
      <div class="ap-list" data-list></div>
    </div>
    <div class="ap-main">
      <div class="ap-bar">
        <select class="ap-method" data-method>${METHODS.map((m) => "<option>" + m + "</option>").join("")}</select>
        <input class="ap-url" data-url placeholder="api.example.com/v1/things" aria-label="URL">
        <button class="ap-btn" data-save>${ico("i-check")}</button>
        <button class="ap-btn pri" data-send>${ico("i-play")}<span>Send</span></button>
      </div>
      <div class="ap-tabs" data-tabs>
        ${["params", "headers", "auth", "body"].map((t) =>
          '<button class="ap-tab' + (t === "params" ? " on" : "") + '" data-tab="' + t + '">' +
          t[0].toUpperCase() + t.slice(1) + "</button>").join("")}
      </div>
      <div class="ap-pane" data-pane></div>
      <div class="ap-resp" data-resp><p class="ap-empty">No response yet. Press Send.</p></div>
    </div>
  `);

  const $ = (s) => root.querySelector(s);
  const pane = $("[data-pane]");

  /* ---- editor panes ----------------------------------------------------- */

  function kvRows(list, kind) {
    const rows = (list || []).map((r, i) =>
      '<div class="ap-kv" data-i="' + i + '">' +
        '<input type="checkbox" data-on ' + (r.on === false ? "" : "checked") + ' aria-label="Enabled">' +
        '<input type="text" data-k value="' + esc(r.k) + '" placeholder="name">' +
        '<input type="text" data-v value="' + esc(r.v) + '" placeholder="value">' +
        '<button class="ap-btn sm" data-del>' + ico("i-x") + "</button>" +
      "</div>").join("");
    return rows + '<button class="ap-add" data-add="' + kind + '">' + ico("i-plus") + " Add " + kind.slice(0, -1) + "</button>";
  }

  function drawPane() {
    if (tab === "params") pane.innerHTML = kvRows(cur.params, "params");
    else if (tab === "headers") pane.innerHTML = kvRows(cur.headers, "headers");
    else if (tab === "auth") {
      const a = cur.auth;
      pane.innerHTML =
        '<div class="ap-f"><label>Type</label><select data-authkind>' +
          ["none", "bearer", "basic", "header"].map((k) =>
            '<option value="' + k + '"' + (a.kind === k ? " selected" : "") + ">" +
            ({ none: "None", bearer: "Bearer token", basic: "Basic", header: "API key header" })[k] + "</option>").join("") +
        "</select></div>" +
        (a.kind === "bearer" ? '<div class="ap-f"><label>Token</label><input type="password" data-token value="' + esc(a.token) + '"></div>' : "") +
        (a.kind === "basic"
          ? '<div class="ap-f"><label>User</label><input type="text" data-user value="' + esc(a.user) + '"></div>' +
            '<div class="ap-f"><label>Password</label><input type="password" data-pass value="' + esc(a.pass) + '"></div>'
          : "") +
        (a.kind === "header"
          ? '<div class="ap-f"><label>Header name</label><input type="text" data-hname value="' + esc(a.headerName) + '"></div>' +
            '<div class="ap-f"><label>Value</label><input type="password" data-token value="' + esc(a.token) + '"></div>'
          : "") +
        /* Said plainly: this is stored with the request, unencrypted. The mail
           app puts secrets in the credential store; a saved API request is a
           different thing and pretending otherwise would be worse. */
        (a.kind !== "none"
          ? '<p class="ap-note">' + ico("i-warn") + " Saved with the request, in plain text. Do not save a production secret here.</p>"
          : "");
    } else {
      pane.innerHTML =
        '<div class="ap-f"><label>Body type</label><select data-bodytype>' +
          ["none", "json", "text", "form"].map((k) =>
            '<option value="' + k + '"' + (cur.bodyType === k ? " selected" : "") + ">" + k + "</option>").join("") +
        "</select></div>" +
        (cur.bodyType === "none" ? "" : '<textarea class="ap-body" data-body placeholder="Request body">' + esc(cur.body) + "</textarea>");
    }
  }

  pane.addEventListener("input", (e) => {
    const kv = e.target.closest(".ap-kv");
    if (kv) {
      const list = tab === "params" ? cur.params : cur.headers;
      const r = list[Number(kv.dataset.i)];
      if (e.target.matches("[data-k]")) r.k = e.target.value;
      if (e.target.matches("[data-v]")) r.v = e.target.value;
      return;
    }
    if (e.target.matches("[data-body]")) cur.body = e.target.value;
    if (e.target.matches("[data-token]")) cur.auth.token = e.target.value;
    if (e.target.matches("[data-user]")) cur.auth.user = e.target.value;
    if (e.target.matches("[data-pass]")) cur.auth.pass = e.target.value;
    if (e.target.matches("[data-hname]")) cur.auth.headerName = e.target.value;
  });

  pane.addEventListener("change", (e) => {
    const kv = e.target.closest(".ap-kv");
    if (kv && e.target.matches("[data-on]")) {
      const list = tab === "params" ? cur.params : cur.headers;
      list[Number(kv.dataset.i)].on = e.target.checked;
      return;
    }
    if (e.target.matches("[data-authkind]")) { cur.auth.kind = e.target.value; drawPane(); }
    if (e.target.matches("[data-bodytype]")) { cur.bodyType = e.target.value; drawPane(); }
  });

  pane.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      (add.dataset.add === "params" ? cur.params : cur.headers).push({ k: "", v: "", on: true });
      drawPane();
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      const i = Number(del.closest(".ap-kv").dataset.i);
      (tab === "params" ? cur.params : cur.headers).splice(i, 1);
      drawPane();
    }
  });

  $("[data-tabs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    root.querySelectorAll(".ap-tab").forEach((x) => x.classList.toggle("on", x === b));
    drawPane();
  });

  /* ---- send ------------------------------------------------------------- */

  async function send() {
    const btn = $("[data-send]");
    const resp = $("[data-resp]");
    cur.method = $("[data-method]").value;
    cur.url = $("[data-url]").value;
    btn.disabled = true;
    resp.innerHTML = '<p class="ap-empty">Sending…</p>';
    try {
      const r = await host.invoke("send", cur);
      drawResponse(r);
    } catch (e) {
      /* A transport failure is an outcome, shown in the response area where the
         user is already looking — not a toast that disappears. */
      resp.innerHTML =
        '<div class="ap-status"><span class="ap-code bad">failed</span></div>' +
        '<pre class="ap-out">' + esc(e.message) + "</pre>";
    } finally {
      btn.disabled = false;
    }
  }

  function drawResponse(r) {
    const cls = r.status < 300 ? "ok" : r.status < 400 ? "warn" : "bad";
    const pretty = r.json != null ? JSON.stringify(r.json, null, 2) : r.body;
    $("[data-resp]").innerHTML =
      '<div class="ap-status">' +
        '<span class="ap-code ' + cls + '">' + r.status + " " + esc(r.statusText) + "</span>" +
        "<span>" + r.ms + " ms</span><span>" + fmtBytes(r.bytes) + "</span>" +
        (r.truncated ? '<span class="warn">truncated</span>' : "") +
        '<span class="ap-final">' + esc(r.url) + "</span>" +
      "</div>" +
      '<div class="ap-rtabs"><button class="on" data-rt="body">Body</button>' +
        '<button data-rt="headers">Headers (' + Object.keys(r.headers).length + ")</button></div>" +
      '<pre class="ap-out" data-out>' + esc(pretty || "(empty body)") + "</pre>";

    const out = $("[data-out]");
    $("[data-resp]").querySelector(".ap-rtabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-rt]");
      if (!b) return;
      $("[data-resp]").querySelectorAll(".ap-rtabs button").forEach((x) => x.classList.toggle("on", x === b));
      out.textContent = b.dataset.rt === "headers"
        ? Object.keys(r.headers).map((k) => k + ": " + r.headers[k]).join("\n")
        : (pretty || "(empty body)");
    });
  }

  /* ---- saved requests --------------------------------------------------- */

  async function refresh() {
    const { requests, durable } = await host.invoke("list");
    const list = $("[data-list]");
    if (!requests.length) {
      list.innerHTML = '<p class="ap-empty">Nothing saved yet.</p>' +
        (durable ? "" : '<p class="ap-empty">Storage is unavailable — saves will not survive a restart.</p>');
      return;
    }
    const groups = new Map();
    for (const r of requests) {
      if (!groups.has(r.collection)) groups.set(r.collection, []);
      groups.get(r.collection).push(r);
    }
    list.innerHTML = [...groups.keys()].map((g) =>
      '<div class="ap-grp">' + esc(g) + "</div>" +
      groups.get(g).map((r) =>
        '<div class="ap-item" data-id="' + esc(r.id) + '">' +
          '<span class="m ' + r.method.toLowerCase() + '">' + r.method + "</span>" +
          '<span class="u">' + esc(r.name || r.url) + "</span>" +
          '<button class="ap-btn sm" data-rm="' + esc(r.id) + '">' + ico("i-x") + "</button>" +
        "</div>").join(""),
    ).join("");
  }

  $("[data-list]").addEventListener("click", async (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      e.stopPropagation();
      const ok = await host.confirm({ title: "Delete this request?", danger: true, confirm: "Delete" });
      if (!ok) return;
      await host.invoke("remove", { id: rm.dataset.rm });
      refresh();
      return;
    }
    const item = e.target.closest("[data-id]");
    if (!item) return;
    cur = await host.invoke("read", { id: item.dataset.id });
    load();
  });

  function load() {
    $("[data-method]").value = cur.method;
    $("[data-url]").value = cur.url;
    drawPane();
  }

  $("[data-save]").addEventListener("click", async () => {
    cur.method = $("[data-method]").value;
    cur.url = $("[data-url]").value;
    if (!cur.url.trim()) { if (window.toast) window.toast("Give it a URL first."); return; }
    if (!cur.name) cur.name = cur.url.replace(/^https?:\/\//, "").slice(0, 60);
    const r = await host.invoke("save", cur);
    cur.id = r.id;
    refresh();
    if (window.toast) window.toast("Saved.");
  });

  $("[data-new]").addEventListener("click", () => { cur = blank(); load(); $("[data-resp]").innerHTML = '<p class="ap-empty">No response yet. Press Send.</p>'; });
  $("[data-send]").addEventListener("click", send);
  $("[data-url]").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  load();
  refresh().catch((e) => { $("[data-list]").innerHTML = '<p class="ap-empty">' + esc(e.message) + "</p>"; });
}

const STYLE = `
[data-mv-app="api"]{height:100%;display:flex;font-size:13px;overflow:hidden}
[data-mv-app="api"] .ap-side{width:210px;flex:none;border-right:1px solid var(--glass-line);
  background:rgba(0,0,0,.14);display:flex;flex-direction:column;overflow:hidden}
:root[data-theme="light"] [data-mv-app="api"] .ap-side{background:rgba(0,0,0,.04)}
[data-mv-app="api"] .ap-side-top{display:flex;align-items:center;gap:8px;padding:9px 10px;
  border-bottom:1px solid var(--glass-line)}
[data-mv-app="api"] .ap-side-top b{flex:1;font-size:12px}
[data-mv-app="api"] .ap-list{flex:1;overflow-y:auto;padding:6px}
[data-mv-app="api"] .ap-grp{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--tx-4);padding:9px 5px 4px}
[data-mv-app="api"] .ap-item{display:flex;align-items:center;gap:7px;padding:6px 7px;border-radius:7px;cursor:pointer}
[data-mv-app="api"] .ap-item:hover{background:var(--glass-2)}
[data-mv-app="api"] .ap-item .m{flex:none;font-family:var(--mono);font-size:9px;font-weight:700;
  padding:1px 4px;border-radius:4px;background:var(--glass-3);color:var(--tx-3)}
[data-mv-app="api"] .ap-item .m.get{color:var(--private)}
[data-mv-app="api"] .ap-item .m.post{color:var(--public)}
[data-mv-app="api"] .ap-item .m.delete{color:var(--signal)}
[data-mv-app="api"] .ap-item .u{flex:1;min-width:0;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="api"] .ap-item .ap-btn{opacity:0}
[data-mv-app="api"] .ap-item:hover .ap-btn{opacity:1}

[data-mv-app="api"] .ap-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
[data-mv-app="api"] .ap-bar{flex:none;display:flex;gap:7px;padding:9px 11px;border-bottom:1px solid var(--glass-line)}
[data-mv-app="api"] .ap-method{flex:none;height:31px;padding:0 7px;border-radius:8px;background:var(--glass-3);
  border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:11.5px;font-weight:640;font-family:var(--mono)}
[data-mv-app="api"] .ap-url{flex:1;min-width:0;height:31px;padding:0 11px;border-radius:8px;background:var(--glass-3);
  border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:12px;font-family:var(--mono);outline:none}
[data-mv-app="api"] .ap-url:focus{border-color:var(--cyan)}
[data-mv-app="api"] .ap-btn{flex:none;height:31px;padding:0 10px;border-radius:8px;display:inline-flex;
  align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx-2)}
[data-mv-app="api"] .ap-btn:hover{background:var(--glass-2);color:var(--tx)}
[data-mv-app="api"] .ap-btn.pri{background:var(--accent);border-color:transparent;color:#fff}
[data-mv-app="api"] .ap-btn.sm{height:22px;padding:0 5px}
[data-mv-app="api"] .ap-btn .ico{width:13px;height:13px}
[data-mv-app="api"] .ap-btn[disabled]{opacity:.5;cursor:default}

[data-mv-app="api"] .ap-tabs{flex:none;display:flex;gap:2px;padding:7px 11px 0;border-bottom:1px solid var(--glass-line)}
[data-mv-app="api"] .ap-tab{height:27px;padding:0 11px;border:0;background:transparent;color:var(--tx-3);
  font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent}
[data-mv-app="api"] .ap-tab.on{color:var(--tx);border-bottom-color:var(--accent)}
[data-mv-app="api"] .ap-pane{flex:none;max-height:190px;overflow-y:auto;padding:10px 11px}
[data-mv-app="api"] .ap-kv{display:flex;gap:6px;align-items:center;margin-bottom:5px}
[data-mv-app="api"] .ap-kv input[type=checkbox]{width:14px;height:14px;flex:none;margin:0;accent-color:var(--accent)}
[data-mv-app="api"] .ap-kv input[type=text]{flex:1;min-width:0;height:26px;padding:0 8px;border-radius:6px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:11.5px;
  font-family:var(--mono);outline:none}
[data-mv-app="api"] .ap-add{display:inline-flex;align-items:center;gap:5px;margin-top:4px;padding:4px 8px;
  border-radius:6px;border:1px dashed var(--glass-line-2);background:transparent;color:var(--tx-4);
  font:inherit;font-size:11px;cursor:pointer}
[data-mv-app="api"] .ap-add:hover{color:var(--tx-2)}
[data-mv-app="api"] .ap-add .ico{width:11px;height:11px}
[data-mv-app="api"] .ap-f{display:flex;flex-direction:column;gap:4px;margin-bottom:9px;max-width:340px}
[data-mv-app="api"] .ap-f label{font-size:10.5px;font-weight:600;color:var(--tx-3)}
[data-mv-app="api"] .ap-f input,[data-mv-app="api"] .ap-f select{height:28px;padding:0 8px;border-radius:7px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:11.5px;outline:none}
[data-mv-app="api"] .ap-body{width:100%;min-height:110px;resize:vertical;padding:9px;border-radius:7px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font-family:var(--mono);
  font-size:11.5px;line-height:1.55;outline:none;box-sizing:border-box}
[data-mv-app="api"] .ap-note{display:flex;gap:6px;align-items:flex-start;margin:4px 0 0;font-size:10.5px;
  color:var(--tx-3);line-height:1.5}
[data-mv-app="api"] .ap-note .ico{width:12px;height:12px;flex:none;margin-top:1px;color:var(--signal)}

[data-mv-app="api"] .ap-resp{flex:1;min-height:0;display:flex;flex-direction:column;
  border-top:1px solid var(--glass-line);overflow:hidden}
[data-mv-app="api"] .ap-status{flex:none;display:flex;align-items:center;gap:11px;padding:8px 11px;
  font-size:11px;color:var(--tx-3);font-family:var(--mono)}
[data-mv-app="api"] .ap-code{font-weight:700;padding:1px 6px;border-radius:5px}
[data-mv-app="api"] .ap-code.ok{color:var(--private);background:var(--private-dim)}
[data-mv-app="api"] .ap-code.warn{color:var(--public);background:var(--public-dim)}
[data-mv-app="api"] .ap-code.bad{color:var(--signal);background:var(--signal-dim)}
[data-mv-app="api"] .ap-final{margin-left:auto;color:var(--tx-4);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;max-width:44%}
[data-mv-app="api"] .ap-rtabs{flex:none;display:flex;gap:2px;padding:0 11px}
[data-mv-app="api"] .ap-rtabs button{height:24px;padding:0 9px;border:0;background:transparent;color:var(--tx-4);
  font:inherit;font-size:11px;cursor:pointer;border-bottom:2px solid transparent}
[data-mv-app="api"] .ap-rtabs button.on{color:var(--tx-2);border-bottom-color:var(--accent)}
[data-mv-app="api"] .ap-out{flex:1;min-height:0;overflow:auto;margin:0;padding:10px 11px;font-family:var(--mono);
  font-size:11.5px;line-height:1.55;color:var(--tx-2);white-space:pre-wrap;word-break:break-word}
[data-mv-app="api"] .ap-empty{padding:22px;text-align:center;font-size:11.5px;color:var(--tx-4);line-height:1.6}
`;
