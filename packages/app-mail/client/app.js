/* Mail — the browser half. Served at /desktop/plugins/mail/app.js.

   The first thing this app does is ask the host whether anything is connected.
   If nothing is, it shows the Connect screen — not a sample inbox, not a demo
   mode. The Console's version shipped five invented messages from invented
   people, which is exactly the kind of thing that looks like a working product
   in a screenshot and is worthless the moment anyone clicks it. */

export const manifest = { id: "mail", name: "Mail" };

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ico = (id, cls) => '<svg class="ico ' + (cls || "") + '"><use href="#' + id + '"/></svg>';

/** Common IMAP hosts, so the usual case is two fields rather than five. */
const PRESETS = {
  "Gmail": { host: "imap.gmail.com", port: 993, secure: true, smtpHost: "smtp.gmail.com", smtpPort: 587,
             note: "Gmail requires an app password, not your account password." },
  "Outlook / Microsoft 365": { host: "outlook.office365.com", port: 993, secure: true,
             smtpHost: "smtp.office365.com", smtpPort: 587,
             note: "Many tenants disable IMAP. If it refuses, use the Microsoft 365 option." },
  "iCloud": { host: "imap.mail.me.com", port: 993, secure: true, smtpHost: "smtp.mail.me.com", smtpPort: 587,
             note: "iCloud requires an app-specific password." },
  "Fastmail": { host: "imap.fastmail.com", port: 993, secure: true, smtpHost: "smtp.fastmail.com", smtpPort: 465 },
  "Other": { host: "", port: 993, secure: true, smtpHost: "", smtpPort: 587 },
};

const fmtDate = (ms) => {
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { day: "numeric", month: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};

export function mount(host, root) {
  root.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);

  const view = document.createElement("div");
  view.className = "ml-view";
  root.appendChild(view);

  let selected = null;

  /* ---- Connect ---------------------------------------------------------- */

  function drawConnect(err) {
    view.innerHTML = `
      <div class="ml-connect">
        <div class="ml-c-card">
          <h3>Connect a mailbox</h3>
          <p class="sub">Nothing is connected yet, so there is nothing to show. Mail is read directly
             from your server — none of it is stored anywhere but this machine.</p>

          <div class="ml-tabs">
            <button class="ml-tab on" data-tab="imap">IMAP / SMTP</button>
            <button class="ml-tab" data-tab="graph">Microsoft 365</button>
          </div>

          ${err ? '<div class="ml-err">' + ico("i-warn") + "<span>" + esc(err) + "</span></div>" : ""}

          <div data-pane="imap">
            <div class="ml-f"><label for="ml-preset">Provider</label>
              <select id="ml-preset" data-preset>${Object.keys(PRESETS).map((k) => "<option>" + esc(k) + "</option>").join("")}</select>
              <span class="hint" data-note></span></div>
            <div class="ml-row">
              <div class="ml-f" style="flex:2"><label for="ml-host">IMAP server</label>
                <input id="ml-host" type="text" data-host placeholder="imap.example.com"></div>
              <div class="ml-f" style="flex:1"><label for="ml-port">Port</label>
                <input id="ml-port" type="number" data-port value="993"></div>
            </div>
            <div class="ml-f"><label for="ml-user">Username</label>
              <input id="ml-user" type="text" data-user placeholder="you@example.com" autocomplete="username"></div>
            <div class="ml-f"><label for="ml-pass">Password</label>
              <input id="ml-pass" type="password" data-pass autocomplete="current-password">
              <span class="hint">Stored in the harness credential store, never in a settings file.</span></div>
            <div class="ml-f chk"><input type="checkbox" id="ml-tls" data-secure checked>
              <label for="ml-tls">Use TLS</label></div>
            <div class="ml-acts">
              <button class="ml-btn" data-test>Test connection</button>
              <button class="ml-btn pri" data-go>${ico("i-plug")}<span>Connect</span></button>
            </div>
            <p class="ml-status" data-status></p>
          </div>

          <div data-pane="graph" hidden>
            <p class="sub">Sign in with your Microsoft account. This needs an app registration in your
               tenant — a client id with the <code>Mail.Read</code> and <code>Mail.Send</code> delegated
               permissions, and "Allow public client flows" turned on. No password is typed here:
               Microsoft shows you a code and you sign in on their own page.</p>
            <div class="ml-f"><label for="ml-tenant">Tenant ID</label>
              <input id="ml-tenant" type="text" data-tenant placeholder="contoso.onmicrosoft.com, a GUID, or common"></div>
            <div class="ml-f"><label for="ml-client">Client ID</label>
              <input id="ml-client" type="text" data-client placeholder="Application (client) ID"></div>
            <div class="ml-acts">
              <button class="ml-btn pri" data-m365>${ico("i-shield")}<span>Sign in with Microsoft</span></button>
            </div>
            <div data-code hidden></div>
            <p class="ml-status" data-gstatus></p>
          </div>
        </div>
      </div>`;

    const $ = (s) => view.querySelector(s);
    const applyPreset = () => {
      const p = PRESETS[$("[data-preset]").value] || PRESETS.Other;
      $("[data-host]").value = p.host;
      $("[data-port]").value = p.port;
      $("[data-secure]").checked = p.secure !== false;
      $("[data-note]").textContent = p.note || "";
    };
    $("[data-preset]").addEventListener("change", applyPreset);
    applyPreset();

    view.querySelectorAll(".ml-tab").forEach((t) => t.addEventListener("click", () => {
      view.querySelectorAll(".ml-tab").forEach((x) => x.classList.toggle("on", x === t));
      view.querySelector('[data-pane="imap"]').hidden = t.dataset.tab !== "imap";
      view.querySelector('[data-pane="graph"]').hidden = t.dataset.tab !== "graph";
    }));

    const fields = () => ({
      kind: "imap",
      host: $("[data-host]").value.trim(),
      port: Number($("[data-port]").value) || 993,
      secure: $("[data-secure]").checked,
      user: $("[data-user]").value.trim(),
      password: $("[data-pass]").value,
      address: $("[data-user]").value.trim(),
      label: $("[data-preset]").value,
      smtpHost: (PRESETS[$("[data-preset]").value] || {}).smtpHost || "",
      smtpPort: (PRESETS[$("[data-preset]").value] || {}).smtpPort || 587,
    });

    const status = (msg, bad) => {
      const el = $("[data-status]");
      el.textContent = msg;
      el.setAttribute("data-tone", bad ? "bad" : "ok");
    };

    $("[data-test]").addEventListener("click", async () => {
      status("Connecting…");
      try {
        const r = await host.invoke("test", fields());
        status("Connected. " + r.folders.length + " folders, inbox is " + r.inbox + ".");
      } catch (e) {
        status(e.message, true);
      }
    });

    $("[data-m365]").addEventListener("click", async () => {
      const btn = $("[data-m365]");
      const gs = $("[data-gstatus]");
      const codeBox = $("[data-code]");
      const set = (m, bad) => { gs.textContent = m; gs.setAttribute("data-tone", bad ? "bad" : "ok"); };
      btn.disabled = true;
      set("Asking Microsoft for a sign-in code…");
      let start;
      try {
        start = await host.invoke("m365Start", {
          tenant: $("[data-tenant]").value.trim() || "common",
          clientId: $("[data-client]").value.trim(),
        });
      } catch (e) { set(e.message, true); btn.disabled = false; return; }

      /* The code and the URL, large and copyable. Everything else on this
         screen is secondary while a sign-in is in flight. */
      codeBox.hidden = false;
      codeBox.innerHTML =
        '<div class="ml-code"><p>Go to <b>' + esc(start.verificationUri) + '</b> and enter this code:</p>' +
        '<code class="big">' + esc(start.userCode) + '</code>' +
        '<p class="sub">Waiting for you to finish signing in…</p></div>';
      set("");

      try {
        const r = await host.invoke("m365Poll", { key: start.key });
        set("Connected as " + r.address + ". Synced " + r.synced + " messages.");
        await boot();
      } catch (e) {
        set(e.message, true);
        codeBox.hidden = true;
        btn.disabled = false;
      }
    });

    $("[data-go]").addEventListener("click", async () => {
      status("Connecting…");
      try {
        const r = await host.invoke("connect", fields());
        status("Connected. Synced " + r.synced + " messages.");
        await boot();
      } catch (e) {
        status(e.message, true);
      }
    });
  }

  /* ---- Inbox ------------------------------------------------------------ */

  async function drawInbox(state) {
    const { messages } = await host.invoke("list", { limit: 100 });
    view.innerHTML = `
      <div class="ml-top">
        <div class="ml-who"><b>${esc(state.account.address || state.account.user)}</b>
          <span>${state.account.lastSync ? "synced " + fmtDate(state.account.lastSync) : "never synced"}</span></div>
        <input class="ml-q" data-q placeholder="Search the whole mailbox…" aria-label="Search mail">
        <button class="ml-btn pri" data-compose>${ico("i-send")}<span>Write</span></button>
        <button class="ml-btn" data-sync>${ico("i-reload")}<span>Sync</span></button>
        <button class="ml-btn" data-disconnect title="Disconnect this mailbox">${ico("i-x")}</button>
      </div>
      ${state.account.lastError ? '<div class="ml-err">' + ico("i-warn") + "<span>" + esc(state.account.lastError) + "</span></div>" : ""}
      <div class="ml-main">
        <div class="ml-list" data-list></div>
        <div class="ml-read" data-read></div>
      </div>`;

    paintList(messages);
    paintRead(null);

    view.querySelector("[data-sync]").addEventListener("click", async () => {
      const b = view.querySelector("[data-sync]");
      b.disabled = true;
      try { await host.invoke("sync", {}); await boot(); }
      catch (e) { if (window.toast) window.toast("Sync failed: " + e.message); }
      finally { b.disabled = false; }
    });

    view.querySelector("[data-disconnect]").addEventListener("click", async () => {
      const ok = await host.confirm({
        title: "Disconnect this mailbox?",
        detail: "The stored password and every cached message are removed from this machine. " +
                "Nothing on the mail server changes.",
        danger: true, confirm: "Disconnect",
      });
      if (!ok) return;
      await host.invoke("disconnect", {});
      await boot();
    });

    view.querySelector("[data-compose]").addEventListener("click", () => compose(state));

    const q = view.querySelector("[data-q]");
    q.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      const term = q.value.trim();
      if (!term) { paintList(messages); return; }
      paintList(null, "Searching the server…");
      try {
        const r = await host.invoke("search", { q: term });
        paintList(r.hits, r.hits.length ? null : 'Nothing on the server matches "' + term + '".');
      } catch (err) {
        paintList(null, err.message);
      }
    });

    view.querySelector("[data-list]").addEventListener("click", async (e) => {
      const row = e.target.closest("[data-mid]");
      if (!row) return;
      selected = row.getAttribute("data-mid");
      view.querySelectorAll(".ml-item").forEach((x) => x.classList.toggle("on", x === row));
      paintRead(null, "Loading…");
      try { paintRead(await host.invoke("read", { id: selected })); }
      catch (err) { paintRead(null, err.message); }
    });
  }

  /**
   * The composer.
   *
   * Sending is the only thing in this system that reaches another person, so it
   * is the only thing that always asks — through the OS's own approval sheet,
   * showing the RESOLVED recipient list rather than the text that was typed.
   * "ahmed@" and "ahmed@magna.sa" look alike in an input box and are not the
   * same decision.
   */
  function compose(state) {
    const panel = document.createElement("div");
    panel.className = "ml-compose";
    panel.innerHTML =
      '<div class="ml-c-head"><b>New message</b>' +
      '<span class="from">from ' + esc(state.account.address || state.account.user) + "</span>" +
      '<button class="ml-btn" data-cancel>' + ico("i-x") + "</button></div>" +
      '<div class="ml-f"><label for="c-to">To</label><input id="c-to" type="text" data-to placeholder="someone@example.com"></div>' +
      '<div class="ml-f"><label for="c-cc">Cc</label><input id="c-cc" type="text" data-cc></div>' +
      '<div class="ml-f"><label for="c-su">Subject</label><input id="c-su" type="text" data-subject></div>' +
      '<textarea class="ml-c-body" data-body placeholder="Write your message…"></textarea>' +
      '<div class="ml-acts"><button class="ml-btn" data-testsend>Test the send server</button>' +
      '<button class="ml-btn pri" data-send>' + ico("i-send") + "<span>Send</span></button></div>" +
      '<p class="ml-status" data-cstatus></p>';
    view.appendChild(panel);

    const $ = (sel) => panel.querySelector(sel);
    const set = (m, bad) => { $("[data-cstatus]").textContent = m; $("[data-cstatus]").setAttribute("data-tone", bad ? "bad" : "ok"); };

    $("[data-cancel]").addEventListener("click", () => panel.remove());

    $("[data-testsend]").addEventListener("click", async () => {
      set("Checking…");
      try { const r = await host.invoke("testSend", {}); set("Send server reachable" + (r.host ? " (" + r.host + ":" + r.port + ")" : "") + "."); }
      catch (e) { set(e.message, true); }
    });

    $("[data-send]").addEventListener("click", async () => {
      const draft = {
        to: $("[data-to]").value, cc: $("[data-cc]").value,
        subject: $("[data-subject]").value, body: $("[data-body]").value,
      };
      let preview;
      try { preview = await host.invoke("sendPreview", draft); }
      catch (e) { set(e.message, true); return; }

      const ok = await host.confirm({
        title: "Send this message?",
        detail: "It leaves this machine immediately and cannot be recalled.",
        rows: [
          { k: "from", v: preview.from },
          { k: "to", v: preview.to.join(", ") },
          ...(preview.cc.length ? [{ k: "cc", v: preview.cc.join(", ") }] : []),
          { k: "subject", v: preview.subject || "(no subject)" },
          { k: "via", v: preview.via, tone: "bad" },
        ],
        danger: true, confirm: "Send",
      });
      if (!ok) { set("Not sent."); return; }

      set("Sending…");
      try {
        const r = await host.invoke("send", draft);
        set("Sent to " + (r.accepted || []).join(", ") + ".");
        setTimeout(() => panel.remove(), 1400);
      } catch (e) { set(e.message, true); }
    });
  }

  function paintList(messages, note) {
    const el = view.querySelector("[data-list]");
    if (!el) return;
    if (!messages) { el.innerHTML = '<p class="ml-empty">' + esc(note || "") + "</p>"; return; }
    if (!messages.length) {
      el.innerHTML = '<p class="ml-empty">' + esc(note || "Nothing here.") + "</p>";
      return;
    }
    el.innerHTML = messages.map((m) =>
      '<div class="ml-item' + (m.seen ? "" : " unread") + (m.id === selected ? " on" : "") +
        '" data-mid="' + esc(m.id) + '">' +
        '<div class="hd"><span class="who">' + esc(m.from.name || m.from.address || "(unknown)") + "</span>" +
        '<span class="when">' + esc(fmtDate(m.date)) + "</span></div>" +
        '<div class="subj">' + esc(m.subject || "(no subject)") + "</div>" +
        (m.preview ? '<div class="prev">' + esc(m.preview.slice(0, 90)) + "</div>" : "") +
        (m.hasAttachments ? '<div class="att">' + ico("i-file") + "attachment</div>" : "") +
      "</div>",
    ).join("");
  }

  function paintRead(m, note) {
    const el = view.querySelector("[data-read]");
    if (!el) return;
    if (!m) { el.innerHTML = '<p class="ml-empty">' + esc(note || "Pick a message.") + "</p>"; return; }
    el.innerHTML =
      '<div class="ml-hd"><h3>' + esc(m.subject || "(no subject)") + "</h3>" +
      '<div class="meta"><b>' + esc(m.from.name || m.from.address) + "</b>" +
      (m.from.name ? ' <span class="addr">&lt;' + esc(m.from.address) + "&gt;</span>" : "") +
      '<span class="when">' + esc(new Date(m.date).toLocaleString()) + "</span></div>" +
      (m.to && m.to.length
        ? '<div class="meta to">to ' + m.to.map((t) => esc(t.address)).join(", ") + "</div>"
        : "") +
      "</div>" +
      /* Text only. The body is inserted as a text node via esc() and never as
         markup — rendering a stranger's HTML inside the desktop would hand any
         sender a foothold in the page. */
      '<pre class="ml-body">' + esc(m.body || "(no text body)") + "</pre>";
  }

  /* ---- boot ------------------------------------------------------------- */

  async function boot() {
    let state;
    try {
      state = await host.invoke("state", {});
    } catch (e) {
      view.innerHTML = '<p class="ml-empty">Mail could not start: ' + esc(e.message) + "</p>";
      return;
    }
    if (!state.connected) { drawConnect(); return; }
    await drawInbox(state);
  }

  boot();
}

const STYLE = `
[data-mv-app="mail"]{height:100%;display:flex;flex-direction:column;font-size:13px;overflow:hidden}
[data-mv-app="mail"] .ml-view{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}

[data-mv-app="mail"] .ml-connect{flex:1;min-height:0;overflow-y:auto;display:flex;justify-content:center;padding:26px 18px}
[data-mv-app="mail"] .ml-c-card{width:100%;max-width:440px}
[data-mv-app="mail"] .ml-c-card h3{margin:0 0 6px;font-size:16px;font-weight:660}
[data-mv-app="mail"] .sub{margin:0 0 16px;font-size:11.5px;color:var(--tx-3);line-height:1.6}
[data-mv-app="mail"] .ml-tabs{display:flex;gap:6px;margin-bottom:16px}
[data-mv-app="mail"] .ml-tab{flex:1;height:30px;border-radius:8px;font:inherit;font-size:12px;font-weight:600;
  cursor:pointer;background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx-3)}
[data-mv-app="mail"] .ml-tab.on{background:var(--accent);border-color:transparent;color:#fff}
[data-mv-app="mail"] .ml-row{display:flex;gap:9px}
[data-mv-app="mail"] .ml-f{margin-bottom:11px;display:flex;flex-direction:column;gap:4px}
[data-mv-app="mail"] .ml-f label{font-size:10.5px;font-weight:600;color:var(--tx-3)}
[data-mv-app="mail"] .ml-f input,[data-mv-app="mail"] .ml-f select{width:100%;padding:7px 9px;border-radius:7px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:12px;
  outline:none;box-sizing:border-box}
[data-mv-app="mail"] .ml-f input:focus,[data-mv-app="mail"] .ml-f select:focus{border-color:var(--cyan)}
[data-mv-app="mail"] .ml-f input:disabled{opacity:.45}
[data-mv-app="mail"] .ml-f .hint{font-size:10px;color:var(--tx-4);line-height:1.45}
[data-mv-app="mail"] .ml-f.chk{flex-direction:row;align-items:center;gap:8px}
[data-mv-app="mail"] .ml-f.chk input{width:15px;height:15px;flex:none;margin:0;accent-color:var(--accent)}
[data-mv-app="mail"] .ml-f.chk label{font-size:11.5px;color:var(--tx-2)}
[data-mv-app="mail"] .ml-acts{display:flex;gap:8px;margin-top:14px}
[data-mv-app="mail"] .ml-btn{height:30px;padding:0 12px;border-radius:8px;display:inline-flex;align-items:center;
  gap:6px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;background:var(--glass-3);
  border:1px solid var(--glass-line-2);color:var(--tx-2)}
[data-mv-app="mail"] .ml-btn:hover{background:var(--glass-2);color:var(--tx)}
[data-mv-app="mail"] .ml-btn.pri{background:var(--accent);border-color:transparent;color:#fff}
[data-mv-app="mail"] .ml-btn[disabled]{opacity:.5;cursor:default}
[data-mv-app="mail"] .ml-btn .ico{width:14px;height:14px}
[data-mv-app="mail"] .ml-status{margin:10px 0 0;font-size:11.5px;line-height:1.5;min-height:16px}
[data-mv-app="mail"] .ml-status[data-tone="ok"]{color:var(--private)}
[data-mv-app="mail"] .ml-status[data-tone="bad"]{color:var(--signal)}
[data-mv-app="mail"] .ml-note,[data-mv-app="mail"] .ml-err{display:flex;gap:7px;align-items:flex-start;
  padding:9px 10px;border-radius:8px;font-size:11px;line-height:1.5;color:var(--tx-2);margin:0 0 12px;
  background:color-mix(in srgb,var(--signal) 12%,transparent);border:1px solid var(--signal-dim)}
[data-mv-app="mail"] .ml-note .ico,[data-mv-app="mail"] .ml-err .ico{width:14px;height:14px;flex:none;
  margin-top:1px;color:var(--signal)}
[data-mv-app="mail"] code{font-family:var(--mono);font-size:10.5px;background:var(--glass-3);
  padding:1px 4px;border-radius:4px}

[data-mv-app="mail"] .ml-top{flex:none;display:flex;align-items:center;gap:9px;padding:8px 11px;
  border-bottom:1px solid var(--glass-line);background:rgba(0,0,0,.10)}
[data-mv-app="mail"] .ml-who{min-width:0;display:flex;flex-direction:column}
[data-mv-app="mail"] .ml-who b{font-size:12px;font-weight:640;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="mail"] .ml-who span{font-size:10px;color:var(--tx-4)}
[data-mv-app="mail"] .ml-q{flex:1;min-width:0;height:30px;padding:0 11px;border-radius:8px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:12px;outline:none}
[data-mv-app="mail"] .ml-q:focus{border-color:var(--cyan)}

[data-mv-app="mail"] .ml-main{flex:1;min-height:0;display:flex;overflow:hidden}
[data-mv-app="mail"] .ml-list{width:290px;flex:none;border-right:1px solid var(--glass-line);overflow-y:auto}
[data-mv-app="mail"] .ml-item{padding:9px 11px;border-bottom:1px solid var(--glass-line);cursor:pointer}
[data-mv-app="mail"] .ml-item:hover{background:var(--glass-2)}
[data-mv-app="mail"] .ml-item.on{background:var(--accent-dim);box-shadow:inset 2px 0 0 var(--accent)}
[data-mv-app="mail"] .ml-item .hd{display:flex;gap:8px;align-items:baseline}
[data-mv-app="mail"] .ml-item .who{flex:1;min-width:0;font-size:11.5px;color:var(--tx-2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="mail"] .ml-item.unread .who{font-weight:680;color:var(--tx)}
[data-mv-app="mail"] .ml-item .when{flex:none;font-size:10px;color:var(--tx-4)}
[data-mv-app="mail"] .ml-item .subj{font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;color:var(--tx-2)}
[data-mv-app="mail"] .ml-item.unread .subj{font-weight:640;color:var(--tx)}
[data-mv-app="mail"] .ml-item .prev{font-size:10.5px;color:var(--tx-4);margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="mail"] .ml-item .att{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--tx-4);margin-top:3px}
[data-mv-app="mail"] .ml-item .att .ico{width:11px;height:11px}

[data-mv-app="mail"] .ml-read{flex:1;min-width:0;overflow-y:auto;padding:16px 18px}
[data-mv-app="mail"] .ml-hd{border-bottom:1px solid var(--glass-line);padding-bottom:11px;margin-bottom:13px}
[data-mv-app="mail"] .ml-hd h3{margin:0 0 7px;font-size:15px;font-weight:660;line-height:1.35}
[data-mv-app="mail"] .ml-hd .meta{font-size:11.5px;color:var(--tx-2);display:flex;gap:8px;
  align-items:baseline;flex-wrap:wrap}
[data-mv-app="mail"] .ml-hd .meta.to{color:var(--tx-4);font-size:10.5px;margin-top:3px}
[data-mv-app="mail"] .ml-hd .addr{color:var(--tx-4);font-family:var(--mono);font-size:10.5px}
[data-mv-app="mail"] .ml-hd .when{margin-left:auto;color:var(--tx-4);font-size:10.5px}
[data-mv-app="mail"] .ml-body{margin:0;font:inherit;font-size:12.5px;line-height:1.65;color:var(--tx-2);
  white-space:pre-wrap;word-break:break-word}
[data-mv-app="mail"] .ml-empty{padding:24px;text-align:center;font-size:12px;color:var(--tx-4);line-height:1.6}
[data-mv-app="mail"] .ml-code{margin:14px 0;padding:14px;border-radius:10px;background:var(--glass-3);
  border:1px solid var(--glass-line-2);text-align:center}
[data-mv-app="mail"] .ml-code p{margin:0 0 8px;font-size:12px;color:var(--tx-2)}
[data-mv-app="mail"] .ml-code p.sub{margin:8px 0 0;font-size:11px;color:var(--tx-4)}
[data-mv-app="mail"] code.big{display:inline-block;font-family:var(--mono);font-size:22px;font-weight:700;
  letter-spacing:.14em;padding:8px 14px;border-radius:8px;background:var(--accent-dim);color:var(--tx);
  user-select:all}
[data-mv-app="mail"] .ml-compose{position:absolute;right:14px;bottom:14px;width:min(460px,calc(100% - 28px));
  max-height:calc(100% - 28px);overflow-y:auto;background:var(--bg,#05070C);border:1px solid var(--glass-line-2);
  border-radius:12px;box-shadow:var(--shadow-pop);padding:13px;z-index:9;display:flex;flex-direction:column}
[data-mv-app="mail"] .ml-c-head{display:flex;align-items:center;gap:9px;margin-bottom:11px}
[data-mv-app="mail"] .ml-c-head b{font-size:13px}
[data-mv-app="mail"] .ml-c-head .from{flex:1;min-width:0;font-size:10.5px;color:var(--tx-4);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="mail"] .ml-c-body{width:100%;min-height:150px;resize:vertical;padding:9px;border-radius:8px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:12.5px;
  line-height:1.6;outline:none;box-sizing:border-box}
[data-mv-app="mail"] .ml-c-body:focus{border-color:var(--cyan)}
[data-mv-app="mail"] .ml-view{position:relative}
`;
