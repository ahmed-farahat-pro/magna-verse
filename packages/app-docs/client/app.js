/* Docs — the browser half of @magna/app-docs.
 *
 * Served by the OS from this package's own directory at
 * /desktop/plugins/docs/app.js. Nothing is copied or bundled, so removing the
 * plugin removes the route too.
 *
 * Note what is absent: no fetch to /api, no knowledge of sessions, no direct
 * storage. Everything goes through the host API it is handed, which is what
 * makes an app replaceable and what makes its activity visible to the brain.
 */

export const manifest = { id: "docs", name: "Docs" };

export function mount(host, root, win) {
  root.innerHTML = "";
  /* Never assign root.className: this element is the Console's own window
     body and its class is what positions it below the title bar. Assigning
     wipes it and the app draws over the titlebar. Styling is scoped by the
     data-mv-app attribute the OS stamps here, so no class is needed. */

  const style = document.createElement("style");
  style.textContent = `
    /* The root rule targets the attribute, not a class: this element is the
   Console's own window body and assigning className to it wipes win-body. */
[data-mv-app="docs"]{display:flex;height:100%;font-size:14px}
    .docs-list{width:200px;flex:none;border-right:1px solid var(--glass-line, rgba(255,255,255,.11));overflow-y:auto}
    .docs-list button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));
      background:transparent;color:var(--tx-2);padding:10px 12px;font:inherit;font-size:13px;cursor:pointer;min-height:auto;border-radius:0}
    .docs-list button:hover{background:var(--glass-3, rgba(255,255,255,.09))}
    .docs-list button[aria-current="true"]{background:var(--glass-3, rgba(255,255,255,.09));color:var(--tx)}
    .docs-main{flex:1;display:flex;flex-direction:column;min-width:0}
    .docs-head{display:flex;gap:8px;padding:9px 12px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));align-items:center}
    .docs-head input{flex:1;font:inherit;font-size:14px;font-weight:600;background:transparent;border:0;color:var(--tx);padding:4px}
    .docs-head button{min-height:32px;padding:0 11px;font-size:12.5px;border-radius:8px}
    .docs-body{flex:1;width:100%;border:0;background:transparent;color:var(--tx-2);font:inherit;
      font-size:14px;line-height:1.65;padding:14px;resize:none}
    .docs-body:focus,.docs-head input:focus{outline:0}
    .docs-empty{padding:20px;color:var(--tx-4)}
  `;
  root.appendChild(style);

  const list = document.createElement("div");
  list.className = "docs-list";
  const main = document.createElement("div");
  main.className = "docs-main";
  root.appendChild(list);
  root.appendChild(main);

  const head = document.createElement("div");
  head.className = "docs-head";
  const title = document.createElement("input");
  title.setAttribute("aria-label", "Document title");
  const newb = document.createElement("button");
  newb.type = "button";
  newb.textContent = "New";
  head.appendChild(title);
  head.appendChild(newb);

  const body = document.createElement("textarea");
  body.className = "docs-body";
  body.setAttribute("aria-label", "Document body");

  main.appendChild(head);
  main.appendChild(body);

  let current = null;
  let dirty = false;

  async function refresh(selectId) {
    const { docs } = await host.invoke("list");
    list.innerHTML = "";
    if (!docs.length) {
      const p = document.createElement("p");
      p.className = "docs-empty";
      p.textContent = "No documents yet.";
      list.appendChild(p);
    }
    for (const d of docs) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.title;
      b.dataset.id = d.id;
      b.setAttribute("aria-current", String(d.id === (selectId || current)));
      b.addEventListener("click", () => open(d.id));
      list.appendChild(b);
    }
    const want = selectId || current || (docs[0] && docs[0].id);
    if (want && want !== current) await open(want);
    else if (!want) { current = null; title.value = ""; body.value = ""; }
  }

  async function open(id) {
    const d = await host.invoke("read", { id });
    current = d.id;
    title.value = d.title;
    body.value = d.body;
    dirty = false;
    for (const b of list.querySelectorAll("button")) {
      b.setAttribute("aria-current", String(b.dataset.id === id));
    }
    /* The OS stamps the appId; this call only says what happened. */
    host.observe({ verb: "open", target: d.id, summary: 'opened "' + d.title + '"' });
  }

  async function save() {
    if (!current || !dirty) return;
    dirty = false;
    await host.invoke("write", { id: current, title: title.value, body: body.value });
    host.observe({ verb: "write", target: current, summary: 'edited "' + title.value + '"' });
    await refresh(current);
  }

  newb.addEventListener("click", async () => {
    const r = await host.invoke("create", { title: "Untitled", body: "" });
    host.observe({ verb: "create", target: r.id, summary: "created a document" });
    await refresh(r.id);
    title.focus();
    title.select();
  });

  body.addEventListener("input", () => { dirty = true; });
  title.addEventListener("input", () => { dirty = true; });
  body.addEventListener("blur", save);
  title.addEventListener("blur", save);

  /* Poll rather than subscribe, for now. The store is on the host, so an agent
     writing through docs_create must show up here without the user reloading.
     A projection push replaces this in the brain stage; until then a 2 s poll
     is honest and cheap, and stops itself when the window goes away. */
  const timer = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    if (!dirty && document.activeElement !== body && document.activeElement !== title) {
      refresh().catch(() => {});
    }
  }, 2000);

  /* A file handed over by the Console's Files app. Document files used to open
     in the Console's own built-in editor, which meant removing this plugin
     changed nothing about opening a .docx — the whole point of an app being a
     plugin. They now route here, and arrive as params. */
  async function adopt(params) {
    const name = String(params.fileName || "Untitled");
    const raw = String(params.content || "");
    /* VFS files hold HTML from the old rich editor. Documents here are plain
       text, so the markup is unwrapped rather than stored and shown literally. */
    const text = /<[a-z][\s\S]*>/i.test(raw)
      ? raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
           .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
           .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim()
      : raw;
    const { docs } = await host.invoke("list");
    /* Opening the same file twice must not make a second copy. */
    const existing = docs.filter((d) => d.title === name)[0];
    if (existing) { await refresh(existing.id); return; }
    const made = await host.invoke("create", { title: name, body: text });
    await refresh(made.id);
  }

  const params = (win && win.params) || {};
  const boot = params.fileName ? adopt(params) : refresh();
  boot.catch((e) => {
    main.innerHTML = '<p class="docs-empty">Docs could not load: ' + e.message + "</p>";
  });

  /* Returned to the OS and called when the window closes. The interval above
     also self-checks, but an explicit teardown is the contract. */
  return function unmount() {
    clearInterval(timer);
  };
}
