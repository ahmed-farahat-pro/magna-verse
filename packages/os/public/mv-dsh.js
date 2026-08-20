/* MVDsh — the Console's bridge to the DeepSeek Harness.
 *
 * Loaded as a separate script BEFORE the Console's IIFE, so the Console needs
 * exactly one edit — the canned setTimeout in MOUNT.chat becomes a call to
 * MVDsh.send. The 976 KB file stays otherwise untouched, which matters: it has
 * no build step and no tests, so every line not edited is a line that cannot
 * regress.
 *
 * Shapes verified against a live harness, not read from a document:
 *   - a mux frame is a `server-request` envelope; the kind is in `.method`
 *   - `session.prompt` returns a receipt, not a completion
 *   - `session.create` ignores a `model` field; use `session.selectModel`
 *   - a token is `chunk.text`, not `chunk.delta`
 */
(function () {
  "use strict";

  var seq = 0;

  function rpc(method, payload) {
    return fetch("/api/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: "mv-" + (++seq) + "-" + Date.now().toString(36),
        method: method,
        payload: payload || {},
      }),
    }).then(function (r) {
      if (!r.ok) throw new Error(method + " -> HTTP " + r.status);
      return r.json();
    }).then(function (body) {
      var res = body.result;
      if (!res || !res.ok) throw new Error((res && res.error && res.error.message) || (method + " failed"));
      return res.value;
    });
  }

  /* One socket for the whole desktop. Several Chat windows can be open, and
     reconnect has to outlive any one of them. */
  var handlers = [];
  var backoff = 500;
  var linkState = "connecting";

  function connect() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var ws = new WebSocket(proto + "//" + location.host + "/api/events.mux");
    ws.addEventListener("open", function () {
      backoff = 500;
      setLink("live");
    });
    ws.addEventListener("message", function (ev) {
      var f;
      try { f = JSON.parse(ev.data); } catch (e) { return; }
      var kind = f.method || f.type;
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](kind, f.payload || {}, f); } catch (e) { /* one bad handler must not stop the rest */ }
      }
    });
    var retry = function () {
      setLink("reconnecting");
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 10000);
    };
    ws.addEventListener("close", retry);
    ws.addEventListener("error", function () { try { ws.close(); } catch (e) {} });
  }

  function setLink(s) {
    linkState = s;
    try {
      document.dispatchEvent(new CustomEvent("mv:link", { detail: s }));
    } catch (e) {}
  }

  /* Per-window session state, keyed by the Chat window's own id. One dsh
     session per window: sharing one would interleave the mux frames and both
     windows would render both threads. */
  var sessions = {};

  var MVDsh = {
    model: { provider: null, model: null, label: "" },
    ready: false,

    link: function () { return linkState; },

    on: function (fn) {
      handlers.push(fn);
      return function () {
        var i = handlers.indexOf(fn);
        if (i >= 0) handlers.splice(i, 1);
      };
    },

    rpc: rpc,

    /** Load the model catalogue and pick a sensible default. */
    init: function () {
      return rpc("llm.models").then(function (v) {
        var groups = v.groups || [];
        MVDsh.groups = groups;
        var pick = null;
        /* Prefer a local model — a sovereign deployment should answer without
           leaving the machine unless the user asks it to. Fall back to the
           deployment default otherwise. */
        for (var i = 0; i < groups.length && !pick; i++) {
          if (groups[i].id !== "ollama") continue;
          for (var j = 0; j < groups[i].models.length; j++) {
            var m = groups[i].models[j];
            if (m.id.indexOf("14b") >= 0) { pick = { provider: "ollama", model: m.id, label: m.name || m.id }; break; }
          }
          if (!pick && groups[i].models[0]) {
            pick = { provider: "ollama", model: groups[i].models[0].id, label: groups[i].models[0].name };
          }
        }
        if (!pick && groups[0] && groups[0].models[0]) {
          pick = { provider: groups[0].id, model: groups[0].models[0].id, label: groups[0].models[0].name };
        }
        if (pick) MVDsh.model = pick;
        MVDsh.ready = true;
        document.dispatchEvent(new CustomEvent("mv:models", { detail: groups }));
        return groups;
      });
    },

    setModel: function (provider, model, label) {
      MVDsh.model = { provider: provider, model: model, label: label || model };
      /* Re-point every open session, so switching applies to the conversation
         already on screen rather than only to the next one. */
      var ids = Object.keys(sessions);
      return Promise.all(ids.map(function (k) {
        return rpc("session.selectModel", {
          sessionId: sessions[k].id, provider: provider, model: model,
        }).catch(function () {});
      })).then(function () {
        document.dispatchEvent(new CustomEvent("mv:model", { detail: MVDsh.model }));
      });
    },

    session: function (winKey) {
      if (sessions[winKey] && sessions[winKey].id) return Promise.resolve(sessions[winKey].id);
      sessions[winKey] = sessions[winKey] || {};
      if (sessions[winKey].pending) return sessions[winKey].pending;
      var p = rpc("session.create", {}).then(function (v) {
        sessions[winKey].id = v.sessionId;
        /* create ignores a model field, so select explicitly or the session
           quietly runs on the deployment default. */
        return rpc("session.selectModel", {
          sessionId: v.sessionId,
          provider: MVDsh.model.provider,
          model: MVDsh.model.model,
        }).then(function () { return v.sessionId; });
      });
      sessions[winKey].pending = p;
      return p;
    },

    cancel: function (winKey) {
      var s = sessions[winKey];
      if (!s || !s.id) return Promise.resolve();
      return rpc("session.cancel", { sessionId: s.id }).catch(function () {});
    },

    /**
     * Stream one turn into `node`.
     *
     * @param winKey  stable key for the calling window
     * @param text    the prompt
     * @param node    element to stream into; its .think child is removed on the
     *                first token
     * @param onDone  called with (reason, ms)
     * @param onTick  called after each token, for scroll-following
     */
    send: function (winKey, text, node, onDone, onTick) {
      var t0 = Date.now();
      var out = document.createElement("div");
      out.className = "mv-stream";
      out.setAttribute("dir", "auto");
      node.appendChild(out);

      var off = MVDsh.on(function (kind, p) {
        if (kind !== "session/event") return;
        var s = sessions[winKey];
        if (!s || p.sessionId !== s.id) return;
        var e = p.event;
        if (!e) return;

        if (e.type === "assistant/chunk") {
          var c = (e.data || {}).chunk || {};
          if (c.type === "text-delta" && c.text) {
            var think = node.querySelector(".think");
            if (think) think.parentNode.removeChild(think);
            /* Append a text node per token. Re-setting innerHTML per chunk
               would rebuild the subtree every time, destroying selection and
               scroll anchoring and turning one answer into thousands of
               reparses. */
            out.appendChild(document.createTextNode(c.text));
            if (onTick) onTick();
          }
        }

        if (e.type === "turn/end") {
          off();
          var reason = (e.data || {}).reason || {};
          var think2 = node.querySelector(".think");
          if (think2) think2.parentNode.removeChild(think2);
          if (reason.kind === "error") {
            var msg = (reason.error && reason.error.message) || "the turn failed";
            var err = document.createElement("div");
            err.className = "mv-err";
            err.textContent = msg;
            node.appendChild(err);
          } else if (!out.textContent) {
            /* A completed turn with no text is not success. Small local models
               with a large tool catalogue do this — say so rather than leaving
               an empty bubble that looks like the UI broke. */
            var empty = document.createElement("div");
            empty.className = "mv-err";
            empty.textContent =
              "The model returned no text. " + MVDsh.model.label +
              " may be too small for this tool catalogue — try a larger or cloud model.";
            node.appendChild(empty);
          }
          if (onDone) onDone(reason, Date.now() - t0);
        }
      });

      return MVDsh.session(winKey).then(function (sid) {
        /* Resolves on acceptance, not completion. Everything arrives on the
           mux above. */
        return rpc("session.prompt", {
          sessionId: sid, mode: "queue",
          content: [{ type: "text", text: text }],
        });
      }).catch(function (e) {
        off();
        var err = document.createElement("div");
        err.className = "mv-err";
        err.textContent = "Could not send: " + e.message;
        node.appendChild(err);
        if (onDone) onDone({ kind: "error" }, Date.now() - t0);
      });
    },
  };

  /* ---- the model picker --------------------------------------------------
     Injected into the Console's own menubar rather than shipped inside the
     976 KB file, so the Console keeps its single chat edit and the harness
     surface stays with the harness bridge. It styles itself from the active
     theme's own custom properties, so it follows every theme without knowing
     any of them. */
  function injectPicker(groups) {
    var bar = document.getElementById("menubar");
    if (!bar || document.getElementById("mvModelWrap")) return;

    var css = document.createElement("style");
    css.textContent =
      "#mvModelWrap{display:inline-flex;align-items:center;gap:7px;margin:0 8px}" +
      "#mvModel{font:inherit;font-size:11.5px;max-width:190px;padding:3px 7px;border-radius:7px;" +
        "border:1px solid var(--glass-line, rgba(255,255,255,.16));background:var(--glass-2, rgba(255,255,255,.05));" +
        "color:var(--tx,inherit);cursor:pointer}" +
      "#mvLoc{font-size:10px;letter-spacing:.02em;padding:2px 7px;border-radius:999px;border:1px solid;white-space:nowrap}" +
      "#mvLoc[data-local='true']{color:var(--private,#3FCF95);border-color:currentColor}" +
      "#mvLoc[data-local='false']{color:var(--public,#E0A33C);border-color:currentColor}" +
      "#mvLink{width:7px;height:7px;border-radius:50%;background:var(--tx-4,#888);flex:none}" +
      "#mvLink[data-s='live']{background:var(--private,#3FCF95)}" +
      "#mvLink[data-s='reconnecting']{background:var(--public,#E0A33C)}";
    document.head.appendChild(css);

    var wrap = document.createElement("span");
    wrap.id = "mvModelWrap";
    var dot = document.createElement("i");
    dot.id = "mvLink";
    dot.setAttribute("data-s", linkState);
    dot.title = "Harness connection";

    var sel = document.createElement("select");
    sel.id = "mvModel";
    sel.setAttribute("aria-label", "Model");
    for (var i = 0; i < groups.length; i++) {
      var og = document.createElement("optgroup");
      og.label = groups[i].name || groups[i].id;
      for (var j = 0; j < groups[i].models.length; j++) {
        var m = groups[i].models[j];
        var o = document.createElement("option");
        o.value = groups[i].id + " " + m.id;
        o.textContent = m.name || m.id;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }

    var loc = document.createElement("span");
    loc.id = "mvLoc";

    function paint() {
      var local = MVDsh.model.provider === "ollama";
      loc.textContent = local ? "on this machine" : "leaves machine";
      loc.setAttribute("data-local", String(local));
      sel.value = MVDsh.model.provider + " " + MVDsh.model.model;
    }

    sel.addEventListener("change", function () {
      var sp = sel.value.split(" ");
      var label = sel.options[sel.selectedIndex].textContent;
      MVDsh.setModel(sp[0], sp.slice(1).join(" "), label).then(paint);
    });

    wrap.appendChild(dot);
    wrap.appendChild(sel);
    wrap.appendChild(loc);

    /* Before the spacer, so it sits with the app name rather than crowding the
       clock and sovereignty pill on the right. */
    var sp = bar.querySelector(".sp");
    if (sp) bar.insertBefore(wrap, sp); else bar.appendChild(wrap);
    paint();

    document.addEventListener("mv:link", function (e) { dot.setAttribute("data-s", e.detail); });
    document.addEventListener("mv:model", paint);
  }

  /* ---- MVApps: layer-3 apps inside Console windows ------------------------
     The Console calls MVApps.mount(appId, body, w) before its own MOUNT table.
     Returning true means a plugin owns this window; returning false lets the
     built-in demo render, so an app is replaced only once a real plugin for it
     is installed. */
  var installed = [];
  var catalogue = [];
  var mods = {};
  /* Bumped on every refresh so a reinstalled app's module is re-fetched rather
     than served from the browser's module cache. */
  var gen = 0;
  var live = {};                       /* console window id -> unmount fn */

  var MVApps = {
    list: function () { return installed; },

    refresh: function () {
      gen++;
      return fetch("/desktop/__os/apps", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          installed = j.apps || [];
          /* Give the Console an icon for anything it does not already know
             about. A plugin that loads correctly but has nowhere to appear
             looks exactly like a plugin that failed to load. */
          if (window.MVHost) {
            var added = false;
            for (var i = 0; i < installed.length; i++) {
              if (window.MVHost.addApp(installed[i])) added = true;
            }
            if (added) window.MVHost.refresh();
          }
          document.dispatchEvent(new CustomEvent("mv:apps", { detail: installed }));
          /* The catalogue is what makes "not installed" answerable rather than
             just empty: an app the workspace ships but the user removed should
             offer to come back, not fall through to a stale built-in. */
          fetch("/desktop/__os/market", { cache: "no-store" })
            .then(function (r) { return r.json(); })
            .then(function (j) { catalogue = j.items || []; })
            .catch(function () {});
          return installed;
        })
        .catch(function () { return []; });
    },

    has: function (appId) {
      for (var i = 0; i < installed.length; i++) if (installed[i].id === appId) return true;
      return false;
    },

    hostFor: function (appId) {
      return {
        appId: appId,
        invoke: function (command, args) {
          return fetch("/desktop/__os/invoke", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ appId: appId, command: command, args: args || {} }),
          }).then(function (r) { return r.json(); }).then(function (b) {
            if (!b.ok) throw new Error(b.error || "invoke failed");
            return b.result;
          });
        },
        /* Cross-app calls. An app may drive another app, but only through the
           OS — never by reaching into its DOM or its store. The OS stamps the
           CALLER's id on the resulting action, so "Brain read a document" is
           attributable even though Docs owns the document. */
        invokeApp: function (otherAppId, command, args) {
          return fetch("/desktop/__os/invoke", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ appId: otherAppId, command: command, args: args || {} }),
          }).then(function (r) { return r.json(); }).then(function (b) {
            if (!b.ok) throw new Error(b.error || "invoke failed");
            return b.result;
          });
        },
        confirm: function (o) { return confirmSheet(o); },
        observe: function (action) {
          /* appId comes from the closure, and the OS stamps it again server
             side. An app cannot log activity in another app's name. */
          return fetch("/desktop/__os/invoke", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ appId: appId, command: "__observe", args: action || {} }),
          }).catch(function () {});
        },
      };
    },

    mount: function (appId, body, w) {
      if (!MVApps.has(appId)) {
        /* Known to the workspace but not installed: claim the window and offer
           to install it. Falling through to a built-in demo here would show
           fake data for an app the user deliberately removed. */
        var pkgItem = null;
        for (var q = 0; q < catalogue.length; q++) {
          if (catalogue[q].appId === appId) pkgItem = catalogue[q];
        }
        if (!pkgItem) return false;
        MVApps.renderMissing(body, pkgItem);
        return true;
      }
      var app = null;
      for (var i = 0; i < installed.length; i++) if (installed[i].id === appId) app = installed[i];
      var url = "/desktop/plugins/" + appId + "/" + (app.clientEntry || "app.js");

      /* Every plugin gets a unique attribute on its mount root so its CSS can
         be scoped to it. Plugin styles otherwise land in the same global sheet
         as the Console's, and a shared prefix silently wins or loses depending
         on load order — the Brain plugin's layout collapsed exactly this way
         because the Console already owns .br-canvas and .br-main. */
      body.setAttribute("data-mv-app", appId);
      body.innerHTML = '<div class="empty-msg">Loading ' + appId + '…</div>';
      var p = mods[url] || (mods[url] = import(url));
      p.then(function (mod) {
        body.innerHTML = "";
        var un = mod.mount(MVApps.hostFor(appId), body, w);
        if (typeof un === "function") live[w.id] = un;
      }).catch(function (e) {
        body.innerHTML = '<div class="empty-msg">' + appId + " could not load: " + e.message + "</div>";
      });
      return true;                     /* claimed, even while still loading */
    },

    /* The "this needs installing" panel. */
    renderMissing: function (body, item) {
      body.setAttribute("data-mv-app", "missing");
      body.innerHTML = "";
      var wrap = document.createElement("div");
      wrap.className = "mv-missing";
      var h = document.createElement("h3");
      h.textContent = item.name + " is not installed";
      var p = document.createElement("p");
      p.textContent = item.state === "needs-restart"
        ? "It is installed but the harness has not loaded it yet. Restart the harness and it will open here."
        : (item.description || "This app is available in your workspace.");
      wrap.appendChild(h);
      wrap.appendChild(p);

      var scopes = document.createElement("p");
      scopes.className = "sc";
      scopes.textContent = "Grants " + ((item.permissions.grant || []).join(", ") || "nothing") +
                           " · Refuses " + ((item.permissions.deny || []).join(", ") || "nothing");
      wrap.appendChild(scopes);

      if (item.state !== "needs-restart") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mv-missing-go";
        btn.textContent = "Install " + item.name;
        var note = document.createElement("span");
        note.className = "mv-missing-note";
        btn.addEventListener("click", function () {
          MVApps.confirm({
            title: "Install " + item.name + "?",
            detail: "This links the package into your profile and adds it to the composition.",
            rows: [
              { k: "Package", v: item.pkg + " " + item.version },
              { k: "Publisher", v: item.publisher },
              { k: "Grants", v: (item.permissions.grant || []).join(", ") || "nothing", tone: "grant" },
              { k: "Refuses", v: (item.permissions.deny || []).join(", ") || "nothing", tone: "deny" },
            ],
            confirm: "Install",
          }).then(function (ok) {
            if (!ok) return;
            btn.disabled = true;
            note.textContent = "Installing…";
            marketCall("install", item.dir).then(function (res) {
              note.textContent = res.message || (res.ok ? "Installed." : "Failed.");
              if (!res.ok) btn.disabled = false;
              return MVApps.refresh();
            }).catch(function (e) { note.textContent = e.message; btn.disabled = false; });
          });
        });
        var row = document.createElement("div");
        row.className = "mv-missing-row";
        row.appendChild(btn);
        row.appendChild(note);
        wrap.appendChild(row);
      }
      body.appendChild(wrap);
    },

    unmount: function (w) {
      var un = live[w.id];
      if (!un) return;
      delete live[w.id];
      try { un(); } catch (e) {}
    },
  };

  /**
   * Call one of the marketplace's mutating endpoints, and fail in words.
   *
   * A bare `fetch` rejects with TypeError("Failed to fetch") for every
   * network-level failure — the harness restarting, the port closing, the
   * process dying mid-install — and the UI printed that verbatim. It names the
   * API that failed rather than the thing that went wrong, which is the least
   * useful sentence available at exactly the moment someone needs to know
   * whether to retry.
   *
   * Installing genuinely does restart parts of the composition, so a single
   * retry after a short pause is the right behaviour rather than a workaround.
   */
  function marketCall(action, target) {
    var url = "/desktop/__os/market/" + action;
    function once() {
      return fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: target }),
      }).then(function (r) {
        if (!r.ok && r.status >= 500) throw new Error("The harness returned " + r.status + ".");
        return r.json();
      });
    }
    return once().catch(function (first) {
      /* Only a network-level failure is worth retrying; a JSON error response
         already arrived and means something definite. */
      if (!(first instanceof TypeError)) throw first;
      return new Promise(function (r) { setTimeout(r, 1200); }).then(once).catch(function () {
        throw new Error(
          "Could not reach the harness. It may be restarting — wait a moment and try again. " +
          "If it keeps failing, check the terminal running 'dsh web'.",
        );
      });
    });
  }

  /* ---- the OS confirm sheet ----------------------------------------------
     window.confirm draws Chrome's own dialog: wrong typeface, wrong colours,
     the origin printed as a header, and no room for the detail that makes a
     permission decision informed. It also blocks the whole page. This is the
     same decision rendered in the OS's own language, with the scopes readable
     before the button rather than after it. */
  function confirmSheet(opts) {
    return new Promise(function (resolve) {
      var prev = document.activeElement;
      var back = document.createElement("div");
      back.className = "mv-sheet-back";
      back.setAttribute("role", "dialog");
      back.setAttribute("aria-modal", "true");
      back.setAttribute("aria-label", opts.title || "Confirm");

      var card = document.createElement("div");
      card.className = "mv-sheet";

      var h = document.createElement("h3");
      h.textContent = opts.title || "Are you sure?";
      card.appendChild(h);

      if (opts.detail) {
        var p = document.createElement("p");
        p.className = "mv-sheet-d";
        p.textContent = opts.detail;
        card.appendChild(p);
      }

      (opts.rows || []).forEach(function (r) {
        var row = document.createElement("div");
        row.className = "mv-sheet-row";
        var k = document.createElement("span");
        k.className = "k";
        k.textContent = r.k;
        var v = document.createElement("span");
        v.className = "v";
        if (r.tone) v.setAttribute("data-tone", r.tone);
        v.textContent = r.v;
        row.appendChild(k);
        row.appendChild(v);
        card.appendChild(row);
      });

      var acts = document.createElement("div");
      acts.className = "mv-sheet-acts";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "mv-sheet-cancel";
      cancel.textContent = opts.cancel || "Cancel";
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "mv-sheet-ok";
      if (opts.danger) ok.setAttribute("data-danger", "true");
      ok.textContent = opts.confirm || "Confirm";
      acts.appendChild(cancel);
      acts.appendChild(ok);
      card.appendChild(acts);
      back.appendChild(card);
      document.body.appendChild(back);

      function close(v) {
        document.removeEventListener("keydown", onKey, true);
        back.remove();
        if (prev && prev.focus) prev.focus();
        resolve(v);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(false); }
        if (e.key === "Tab") {
          /* Keep focus inside: a permission dialog you can tab out of is a
             permission dialog you can answer by accident. */
          var f = [cancel, ok];
          var i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      }
      cancel.addEventListener("click", function () { close(false); });
      ok.addEventListener("click", function () { close(true); });
      back.addEventListener("click", function (e) { if (e.target === back) close(false); });
      document.addEventListener("keydown", onKey, true);
      /* Cancel takes focus, not Confirm — a stray Enter should decline. */
      cancel.focus();
    });
  }

  var sheetCss = document.createElement("style");
  sheetCss.textContent =
    ".mv-sheet-back{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);" +
      "backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px}" +
    ".mv-sheet{width:min(460px,94vw);background:var(--glass, #111);color:var(--tx,#fff);" +
      "border:1px solid var(--glass-line, rgba(255,255,255,.14));border-radius:16px;padding:20px 22px;" +
      "box-shadow:0 24px 70px rgba(0,0,0,.55);font-size:13.5px}" +
    ".mv-sheet h3{margin:0 0 7px;font-size:16px;letter-spacing:-.01em}" +
    ".mv-sheet-d{margin:0 0 14px;color:var(--tx-3,#9a9aa2);font-size:13px;line-height:1.55}" +
    ".mv-sheet-row{display:flex;gap:12px;padding:6px 0;border-top:1px solid var(--glass-line, rgba(255,255,255,.09))}" +
    ".mv-sheet-row .k{color:var(--tx-4,#75757d);font-size:11.5px;min-width:82px;padding-top:1px}" +
    ".mv-sheet-row .v{flex:1;font-family:var(--mono,monospace);font-size:12px;color:var(--tx-2,#c7c7cc);" +
      "word-break:break-word}" +
    ".mv-sheet-row .v[data-tone='grant']{color:var(--private,#3FCF95)}" +
    ".mv-sheet-row .v[data-tone='deny']{color:var(--public,#E0A33C)}" +
    ".mv-sheet-acts{display:flex;gap:9px;justify-content:flex-end;margin-top:18px}" +
    ".mv-sheet-acts button{min-height:38px;padding:0 18px;border-radius:10px;font:inherit;font-size:13px;" +
      "cursor:pointer;border:1px solid var(--glass-line-2, rgba(255,255,255,.22));background:var(--glass-2, #1a1a1e);" +
      "color:var(--tx,#fff)}" +
    ".mv-sheet-acts button:hover{border-color:var(--tx-4,#75757d)}" +
    ".mv-sheet-ok{border-color:var(--private,#3FCF95)!important;color:var(--private,#3FCF95)!important}" +
    ".mv-sheet-ok[data-danger='true']{border-color:var(--accent,#FF5A60)!important;color:var(--accent,#FF5A60)!important}" +
    ".mv-sheet-acts button:focus-visible{outline:2px solid var(--signal,#8B7CFF);outline-offset:2px}" +
    ".mv-missing{padding:30px 32px;max-width:52ch}" +
    ".mv-missing h3{margin:0 0 8px;font-size:16px}" +
    ".mv-missing p{margin:0 0 12px;color:var(--tx-3,#9a9aa2);font-size:13.5px;line-height:1.6}" +
    ".mv-missing .sc{font-family:var(--mono,monospace);font-size:11.5px;color:var(--tx-4,#75757d)}" +
    ".mv-missing-row{display:flex;gap:11px;align-items:center;margin-top:16px;flex-wrap:wrap}" +
    ".mv-missing-go{min-height:36px;padding:0 16px;border-radius:9px;font:inherit;font-size:13px;cursor:pointer;" +
      "background:transparent;color:var(--private,#3FCF95);border:1px solid currentColor}" +
    ".mv-missing-note{font-size:12.5px;color:var(--tx-3,#9a9aa2)}";
  document.head.appendChild(sheetCss);

  MVApps.confirm = confirmSheet;
  window.MVConfirm = confirmSheet;

  window.MVApps = MVApps;
  window.MVDsh = MVDsh;
  connect();
  MVApps.refresh();
  /* MVHost is defined inside the Console closure, which runs after this file.
     Re-scan once it exists so newly installed apps get their icons. */
  (function waitForHost() {
    var tries = 0;
    var t = setInterval(function () {
      if (window.MVHost) { clearInterval(t); MVApps.refresh(); }
      else if (++tries > 100) clearInterval(t);
    }, 200);
  })();
  MVDsh.init().then(function (groups) {
    /* The Console builds its menubar inside its own closure after boot, so
       wait for it to exist rather than racing it. */
    var tries = 0;
    var t = setInterval(function () {
      if (document.getElementById("menubar")) { injectPicker(groups); clearInterval(t); }
      else if (++tries > 100) clearInterval(t);
    }, 200);
  }).catch(function (e) { console.error("MVDsh.init", e); });
})();
