/* MagnaVERSE desktop - the dsh client.
 *
 * Every shape in here was read off a live harness rather than a document, and
 * three of them are not what you would guess:
 *
 *   1. A mux frame is a `server-request` envelope. The frame kind lives in
 *      `.method`, the body in `.payload`. Matching on `.type` sees only the
 *      literal string "server-request" and silently receives nothing.
 *   2. `session.prompt` returns a RECEIPT, not a completion. All output arrives
 *      on the mux. Awaiting the POST looks like a hang and then times out - the
 *      UI appears broken for exactly the reason it is working.
 *   3. `session.create` accepts a `model` field and ignores it. The model is set
 *      by `session.selectModel` afterwards, or the session silently runs on the
 *      deployment default.
 *
 * A text delta is `chunk.text`, not `chunk.delta`.
 */
"use strict";

/* ---- transport ---------------------------------------------------------- */

const Dsh = {
  seq: 0,

  async rpc(method, payload = {}) {
    const res = await fetch("/api/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: "ui-" + (++Dsh.seq) + "-" + Date.now().toString(36),
        method,
        payload,
      }),
    });
    if (!res.ok) throw new Error(method + " -> HTTP " + res.status);
    const body = await res.json();
    const r = body.result;
    if (!r || !r.ok) {
      const e = r && r.error;
      throw new Error((e && e.message) || (method + " failed"));
    }
    return r.value;
  },
};

/* One socket for the whole page. Several chat surfaces can want the same
   stream, and reconnect has to outlive any one of them. */
const Mux = {
  ws: null,
  backoff: 500,
  handlers: new Set(),
  onStatus: null,

  on(fn) { Mux.handlers.add(fn); return () => Mux.handlers.delete(fn); },

  connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(proto + "//" + location.host + "/api/events.mux");
    Mux.ws = ws;

    ws.addEventListener("open", () => {
      Mux.backoff = 500;
      if (Mux.onStatus) Mux.onStatus("live");
    });
    ws.addEventListener("message", (ev) => {
      let f;
      try { f = JSON.parse(ev.data); } catch { return; }
      const kind = f.method || f.type;       /* see note 1 at the top */
      for (const h of Mux.handlers) {
        try { h(kind, f.payload || {}, f); } catch (err) { console.error(err); }
      }
    });
    const retry = () => {
      if (Mux.onStatus) Mux.onStatus("reconnecting");
      setTimeout(Mux.connect, Mux.backoff);
      Mux.backoff = Math.min(Mux.backoff * 2, 10000);
    };
    ws.addEventListener("close", retry);
    ws.addEventListener("error", () => { try { ws.close(); } catch (e) {} });
  },
};

/* ---- helpers ------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* ---- state -------------------------------------------------------------- */

const S = {
  sessionId: null,
  provider: null,
  model: null,
  preferred: null,
  running: false,
  streamNode: null,
  turnStarted: 0,
};

/* ---- models ------------------------------------------------------------- */

async function loadModels() {
  const sel = $("model");
  const value = await Dsh.rpc("llm.models");
  const groups = value.groups || [];
  sel.innerHTML = "";
  let first = null;
  for (const g of groups) {
    const og = document.createElement("optgroup");
    og.label = g.name || g.id;
    for (const m of g.models) {
      const o = document.createElement("option");
      o.value = g.id + " " + m.id;
      o.textContent = m.name || m.id;
      og.appendChild(o);
      if (!first) first = o.value;
      /* Local models win the default. The whole point of this deployment is
         that the first answer never has to leave the machine. */
      if (g.id === "ollama" && !S.preferred) S.preferred = o.value;
    }
    sel.appendChild(og);
  }
  sel.value = S.preferred || first;
  applyModelChoice(sel.value);
  return groups;
}

function applyModelChoice(value) {
  const sp = value.split(" ");
  S.provider = sp[0];
  S.model = sp.slice(1).join(" ");
  const local = S.provider === "ollama";
  const tag = $("locality");
  tag.textContent = local ? "stays on this machine" : "leaves the machine";
  tag.dataset.local = String(local);
}

/* ---- session ------------------------------------------------------------ */

async function ensureSession() {
  if (S.sessionId) return S.sessionId;
  const v = await Dsh.rpc("session.create", {});
  S.sessionId = v.sessionId;
  /* Note 3: create ignores a model, so it must be selected explicitly. */
  await Dsh.rpc("session.selectModel", {
    sessionId: S.sessionId, provider: S.provider, model: S.model,
  });
  $("sid").textContent = S.sessionId.slice(8, 16);
  return S.sessionId;
}

/* ---- chat --------------------------------------------------------------- */

function addMessage(role, text) {
  const wrap = el("div", "msg " + role);
  wrap.appendChild(el("div", "who", role === "u" ? "You" : "MagnaVERSE"));
  const bub = el("div", "bub");
  if (text != null) bub.textContent = text;
  wrap.appendChild(bub);
  $("thread").appendChild(wrap);
  $("thread").scrollTop = $("thread").scrollHeight;
  return bub;
}

async function send() {
  const input = $("q");
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  if (S.running) return;

  input.value = "";
  addMessage("u", text);

  const bub = addMessage("a", null);
  bub.appendChild(el("span", "think", "thinking"));
  S.streamNode = bub;
  setRunning(true);
  S.turnStarted = performance.now();

  try {
    await ensureSession();
    /* Note 2: this resolves as soon as the harness accepts the prompt. The
       answer arrives on the mux - do not await anything here for output. */
    await Dsh.rpc("session.prompt", {
      sessionId: S.sessionId,
      mode: "queue",
      content: [{ type: "text", text: text }],
    });
  } catch (e) {
    bub.textContent = "Could not send: " + e.message;
    S.streamNode = null;
    setRunning(false);
  }
}

async function stop() {
  if (!S.running || !S.sessionId) return;
  try { await Dsh.rpc("session.cancel", { sessionId: S.sessionId }); }
  catch (e) { console.error(e); }
}

function setRunning(on) {
  S.running = on;
  $("send").hidden = on;
  $("stopb").hidden = !on;
}

/* ---- the stream --------------------------------------------------------- */

Mux.on((kind, p) => {
  if (kind !== "session/event") return;
  if (!S.sessionId || p.sessionId !== S.sessionId) return;
  const e = p.event;
  if (!e) return;

  if (e.type === "assistant/chunk") {
    const c = (e.data || {}).chunk || {};
    if (c.type === "text-delta" && c.text) {
      if (S.streamNode) {
        const t = S.streamNode.querySelector(".think");
        if (t) t.remove();
        /* Append a text node per delta. Re-setting innerHTML per chunk would
           rebuild the subtree on every token - destroying selection and scroll
           anchoring, and turning one answer into thousands of reparses. */
        S.streamNode.appendChild(document.createTextNode(c.text));
        $("thread").scrollTop = $("thread").scrollHeight;
      }
    }
  }

  if (e.type === "turn/end") {
    const reason = (e.data || {}).reason || {};
    if (S.streamNode) {
      if (reason.kind === "error") {
        const msg = (reason.error && reason.error.message) || "the turn failed";
        S.streamNode.textContent = "";
        S.streamNode.appendChild(el("span", "err", msg));
      } else {
        const ms = Math.round(performance.now() - S.turnStarted);
        S.streamNode.appendChild(el("div", "meta", S.model + " - " + ms + " ms"));
      }
    }
    S.streamNode = null;
    setRunning(false);
  }
});

/* ---- approvals ----------------------------------------------------------
 *
 * Four things here were established against a live harness, and each one is a
 * bug if assumed the other way:
 *
 *   - The answer goes to `/api/respond`, not to a method endpoint, and it is a
 *     client-RESPONSE echoing the server's rpcId verbatim.
 *   - The POST returns a DELIVERY RECEIPT (`{accepted:true}`), not the outcome.
 *     The outcome is a separate `approval/resolved` frame.
 *   - Those two race, and in testing the resolved frame consistently arrived
 *     FIRST. So the bar must settle on whichever lands first and treat the
 *     other as confirmation, never as the trigger.
 *   - On mux reopen the host replays still-pending approvals with the same
 *     approvalId. Without a dedupe the bar is torn down and rebuilt on every
 *     reconnect, duplicating listeners. With it, reloading mid-approval brings
 *     the bar back by itself.
 */

const Approvals = {
  live: new Map(),   /* approvalId -> {rpcId, node, settled} */

  async answer(approvalId, outcome) {
    const entry = Approvals.live.get(approvalId);
    if (!entry || entry.settled) return;
    entry.node.querySelector(".ap-actions").textContent = "sending…";
    try {
      await fetch("/api/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "client-response",
          rpcId: entry.rpcId,
          result: { ok: true, value: { sessionId: entry.sessionId, approvalId, outcome } },
        }),
      }).then((r) => r.json());
      /* Deliberately not settling here. If the resolved frame has not arrived
         yet it will, and if it already has, this is a no-op. A receipt of
         {accepted:false, reason:'not-pending'} means someone else answered —
         also handled by the resolved frame. */
    } catch (e) {
      Approvals.settle(approvalId, "failed: " + e.message);
    }
  },

  show(rpcId, p) {
    if (Approvals.live.has(p.approvalId)) return;   /* replay dedupe */
    const bar = el("div", "ap");
    const head = el("div", "ap-h");
    head.appendChild(el("span", "ap-tool", p.toolName || "a tool"));
    head.appendChild(el("span", "ap-lab", "wants to run"));
    bar.appendChild(head);
    if (p.reason) bar.appendChild(el("div", "ap-why", p.reason));

    const actions = el("div", "ap-actions");
    const allow = el("button", "ap-ok", "Allow once");
    const deny = el("button", "ap-no", "Reject");
    allow.addEventListener("click", () => Approvals.answer(p.approvalId, "allowed-once"));
    deny.addEventListener("click", () => Approvals.answer(p.approvalId, "rejected"));
    actions.appendChild(allow);
    actions.appendChild(deny);
    bar.appendChild(actions);

    $("approvals").appendChild(bar);
    Approvals.live.set(p.approvalId, { rpcId, node: bar, sessionId: p.sessionId, settled: false });
  },

  settle(approvalId, outcome) {
    const entry = Approvals.live.get(approvalId);
    if (!entry || entry.settled) return;
    entry.settled = true;
    entry.node.dataset.outcome = outcome;
    entry.node.querySelector(".ap-actions").textContent =
      outcome === "allowed-once" ? "allowed" : outcome === "rejected" ? "rejected" : outcome;
    setTimeout(() => {
      entry.node.remove();
      Approvals.live.delete(approvalId);
    }, 2200);
  },
};

Mux.on((kind, p, frame) => {
  if (kind === "approval/requested") Approvals.show(frame.rpcId, p);
  if (kind === "approval/resolved") Approvals.settle(p.approvalId, p.outcome);
});

/* ---- the brain feed ----------------------------------------------------- */

let brainSeen = 0;
Mux.on((kind, p) => {
  if (kind !== "session/event") return;
  const e = p.event;
  if (!e) return;
  brainSeen++;
  $("bCount").textContent = brainSeen;
  const li = el("li");
  li.appendChild(el("span", "sid", String(p.sessionId || "").slice(8, 14)));
  li.appendChild(el("span", "ty", e.type));
  const feed = $("bFeed");
  const empty = feed.querySelector(".empty");
  if (empty) empty.remove();
  feed.insertBefore(li, feed.firstChild);
  while (feed.children.length > 60) feed.removeChild(feed.lastChild);
});

/* ---- layer 3: app plugins ------------------------------------------------
 *
 * The desktop asks the OS what is installed, then imports each app's browser
 * half from that app's own package directory. It knows nothing else about
 * them — no bundling, no build step, no registry of its own — so an app that
 * was uninstalled server-side simply stops appearing here.
 *
 * Each app is handed a `host` object and can reach nothing beyond it. The
 * `appId` on every observation is filled in here rather than accepted from the
 * app, matching what the OS does on the server: attribution a caller can set is
 * attribution a plugin can forge.
 */

const Apps = {
  installed: [],
  mounted: null,      /* {appId, unmount} */

  hostFor(appId) {
    return {
      appId,
      async invoke(command, args) {
        const res = await fetch("/desktop/__os/invoke", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ appId, command, args: args || {} }),
        });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error || "invoke failed");
        return body.result;
      },
      observe(action) {
        return fetch("/desktop/__os/invoke", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ appId, command: "__observe", args: action || {} }),
        }).catch(() => {});
      },
      html: { el },
    };
  },

  async load() {
    const res = await fetch("/desktop/__os/apps", { cache: "no-store" });
    const { apps } = await res.json();
    Apps.installed = apps;
    Apps.renderLauncher();
    return apps;
  },

  renderLauncher() {
    const dock = $("dock");
    dock.innerHTML = "";
    if (!Apps.installed.length) {
      dock.appendChild(el("span", "dock-empty", "no apps installed"));
      return;
    }
    for (const a of Apps.installed) {
      const b = el("button", "dock-b", a.name);
      b.type = "button";
      b.dataset.app = a.id;
      b.addEventListener("click", () => Apps.open(a.id));
      dock.appendChild(b);
    }
  },

  async open(appId) {
    await Apps.close();
    const app = Apps.installed.find((a) => a.id === appId);
    if (!app) return;
    const panel = $("appPanel");
    $("appName").textContent = app.name;
    panel.hidden = false;
    $("chatCol").hidden = true;

    const surface = $("appSurface");
    surface.innerHTML = "";
    try {
      const mod = await import("/desktop/plugins/" + appId + "/" + (app.clientEntry || "app.js"));
      const unmount = await mod.mount(Apps.hostFor(appId), surface);
      Apps.mounted = { appId, unmount: typeof unmount === "function" ? unmount : null };
    } catch (e) {
      surface.textContent = "Could not load " + appId + ": " + e.message;
      console.error(e);
    }
  },

  async close() {
    if (Apps.mounted && Apps.mounted.unmount) {
      try { Apps.mounted.unmount(); } catch (e) { console.error(e); }
    }
    Apps.mounted = null;
    $("appSurface").innerHTML = "";
    $("appPanel").hidden = true;
    $("chatCol").hidden = false;
  },
};

/* ---- boot --------------------------------------------------------------- */

async function boot() {
  Mux.onStatus = (s) => {
    const n = $("link");
    n.textContent = s === "live" ? "connected" : "reconnecting";
    n.dataset.s = s;
  };
  Mux.connect();

  try {
    const info = await Dsh.rpc("host.describe");
    $("host").textContent = info.provider + " / " + info.model;
  } catch (e) {
    $("host").textContent = "harness unreachable";
  }

  try {
    const groups = await loadModels();
    let n = 0;
    for (const g of groups) n += g.models.length;
    $("mCount").textContent = n;
  } catch (e) {
    console.error(e);
    $("mCount").textContent = "0";
  }

  $("model").addEventListener("change", async (ev) => {
    applyModelChoice(ev.target.value);
    if (S.sessionId) {
      try {
        await Dsh.rpc("session.selectModel", {
          sessionId: S.sessionId, provider: S.provider, model: S.model,
        });
      } catch (e) { console.error(e); }
    }
  });
  try {
    const apps = await Apps.load();
    console.log("[desktop] " + apps.length + " app plugin(s) installed");
  } catch (e) { console.error(e); }

  $("appBack").addEventListener("click", () => Apps.close());
  $("send").addEventListener("click", send);
  $("stopb").addEventListener("click", stop);
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

boot();
