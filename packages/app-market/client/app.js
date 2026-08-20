/* Marketplace — the browser half.
 *
 * Five tabs, and every one shows what the harness actually has. Where a
 * capability is not mounted the tab says so, rather than showing an empty grid
 * that reads as "you have none" — those are different statements and only one
 * of them is true.
 *
 * One deliberate exception to the layer rule: the three read-only listings
 * below call the harness API directly rather than going through the OS command
 * bus. Data apps must not do that — the boundary is what makes them replaceable
 * and their activity observable — but the marketplace is a systems app whose
 * whole job is showing what the harness contains, and routing verified RPC
 * methods through a hand-written service wrapper only adds a layer that can be
 * wrong. It was: the first version guessed at the service shapes and returned
 * zeroes for skills and models that the API returns correctly.
 *
 * Two things this UI is careful about, because both are places a store can
 * quietly mislead:
 *   - Scopes are shown BEFORE the confirm. You agree to what you read.
 *   - Install says "restart to load", because a profile row decides what the
 *     next boot composes. Removal says the app is gone now, because it is.
 */

export const manifest = { id: "market", name: "Marketplace" };

const TABS = [
  { id: "apps", label: "Apps", hint: "Installable desktop apps from this workspace" },
  { id: "skills", label: "Skills", hint: "Instruction packs the agent can load on demand" },
  { id: "agents", label: "Agents", hint: "Subagents this session can delegate to" },
  { id: "models", label: "Models", hint: "Every model route configured in the harness" },
  { id: "automations", label: "Automations", hint: "Scheduled and recurring work" },
];

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
[data-mv-app="market"]{height:100%;display:flex;flex-direction:column;font-size:13.5px;overflow:hidden}
    .mk-top{flex:none;padding:14px 16px 0}
    .mk-title{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 10px}
    .mk-title h3{margin:0;font-size:16px}
    .mk-title .cnt{font-size:12px;color:var(--tx-4)}
    .mk-search{width:100%;font:inherit;font-size:13.5px;padding:8px 12px;border-radius:9px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx);margin:0 0 10px}
    .mk-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11))}
    .mk-tabs button{border:0;background:transparent;color:var(--tx-3);font:inherit;font-size:13px;
      padding:8px 12px;cursor:pointer;border-bottom:2px solid transparent;border-radius:0;min-height:auto}
    .mk-tabs button[aria-selected="true"]{color:var(--tx);border-bottom-color:var(--accent)}
    .mk-tabs button:hover{color:var(--tx)}
    .mk-hint{font-size:12px;color:var(--tx-4);padding:9px 16px 0}
    .mk-body{flex:1;overflow:auto;padding:12px 16px 18px}
    .mk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:11px}

    /* --- the Shelf --- */
    .mk-hero{border:1px solid var(--glass-line, rgba(255,255,255,.11));border-radius:14px;padding:16px 18px;margin:0 0 4px;
      background:linear-gradient(180deg,var(--glass-2, rgba(255,255,255,.06)),var(--glass, rgba(255,255,255,.04)))}
    .mk-hero .k{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--tx-4);font-weight:650}
    .mk-hero h4{margin:6px 0 5px;font-size:19px;letter-spacing:-.01em}
    .mk-hero p{margin:0 0 10px;color:var(--tx-3);font-size:13.5px;max-width:56ch;line-height:1.5}
    .mk-hero .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    /* The hero button sits outside .mk-foot, so it needs the button styling
       spelled out — otherwise the primary action on the page renders as plain
       text, which is how it looked before this line existed. */
    .mk-hero .row button{min-height:32px;padding:0 15px;border-radius:9px;font:inherit;font-size:13px;
      cursor:pointer;background:transparent;border:1px solid currentColor}
    .mk-hero .row button.go{color:var(--private,#3FCF95)}
    .mk-hero .row button.rm{color:var(--public,#E0A33C)}
    .mk-hero .mk-scopes{font-size:11.5px}
    .mk-why{font-size:11.5px;color:var(--tx-4);margin:9px 0 0;flex-basis:100%}
    .mk-shelf-h{display:flex;align-items:baseline;gap:9px;margin:16px 0 8px}
    .mk-shelf-h h5{margin:0;font-size:13.5px}
    .mk-shelf-h span{font-size:11.5px;color:var(--tx-4)}
    .mk-shelf{display:flex;gap:11px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:thin}
    .mk-tile{flex:none;width:198px;border:1px solid var(--glass-line, rgba(255,255,255,.11));border-radius:12px;padding:12px;
      background:var(--glass, rgba(255,255,255,.04));display:flex;flex-direction:column;gap:4px}
    .mk-tile .ic{width:34px;height:34px;border-radius:9px;background:var(--glass-2, rgba(255,255,255,.06));display:flex;
      align-items:center;justify-content:center;font-size:15px;color:var(--tx-2)}
    .mk-tile h6{margin:2px 0 0;font-size:13.5px}
    .mk-tile .pub{font-size:10.5px;color:var(--tx-4);font-family:var(--mono)}
    .mk-tile p{margin:2px 0 0;font-size:12px;color:var(--tx-3);flex:1;min-height:34px;line-height:1.45}
    .mk-tile .sc{font-family:var(--mono);font-size:10px;color:var(--tx-4);line-height:1.45}
    .mk-tile .sc b{color:var(--private,#3FCF95);font-weight:600}
    .mk-tile .foot{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:3px}
    .mk-card{border:1px solid var(--glass-line, rgba(255,255,255,.11));border-radius:12px;padding:13px 14px;background:var(--glass, rgba(255,255,255,.04));
      display:flex;flex-direction:column;gap:7px}
    .mk-card h4{margin:0;font-size:14px;display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
    .mk-card h4 .pub{font-size:11px;color:var(--tx-4);font-weight:400}
    .mk-d{color:var(--tx-3);font-size:12.5px;margin:0;flex:1}
    .mk-meta{font-family:var(--mono);font-size:10.5px;color:var(--tx-4)}
    .mk-scopes{font-size:11px;color:var(--tx-3);line-height:1.5}
    .mk-scopes b{color:var(--tx-2);font-weight:600}
    .mk-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px}
    .mk-foot button{min-height:30px;padding:0 12px;border-radius:8px;font:inherit;font-size:12.5px;
      border:1px solid var(--glass-line, rgba(255,255,255,.11));background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx);cursor:pointer}
    .mk-foot .go{color:var(--private,#3FCF95);border-color:currentColor}
    .mk-foot .rm{color:var(--public,#E0A33C);border-color:currentColor}
    .mk-st{font-size:10.5px;padding:2px 8px;border-radius:999px;border:1px solid;margin-left:auto}
    .mk-st[data-in="true"]{color:var(--private,#3FCF95);border-color:currentColor}
    .mk-st[data-in="false"]{color:var(--tx-4);border-color:var(--glass-line, rgba(255,255,255,.11))}
    .mk-note{font-size:11.5px;color:var(--tx-3)}
    .mk-note[data-kind="err"]{color:var(--accent,#FF5A60)}
    .mk-empty{color:var(--tx-4);padding:22px 2px;font-size:13px;max-width:60ch;line-height:1.6}
  `;
  root.appendChild(style);

  const top = document.createElement("div");
  top.className = "mk-top";
  top.innerHTML =
    '<div class="mk-title"><h3>Marketplace</h3><span class="cnt" id="mkCount"></span></div>' +
    '<input class="mk-search" id="mkQ" type="search" placeholder="Search" aria-label="Search the marketplace">' +
    '<div class="mk-tabs" id="mkTabs" role="tablist"></div>';
  root.appendChild(top);

  const hint = document.createElement("p");
  hint.className = "mk-hint";
  root.appendChild(hint);

  const body = document.createElement("div");
  body.className = "mk-body";
  root.appendChild(body);

  let tab = "apps";
  let query = "";
  let sessionId = null;

  const tabsEl = top.querySelector("#mkTabs");
  for (const t of TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t.label;
    b.dataset.tab = t.id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(t.id === tab));
    b.addEventListener("click", () => { tab = t.id; paintTabs(); render(); });
    tabsEl.appendChild(b);
  }
  function paintTabs() {
    for (const b of tabsEl.querySelectorAll("button")) {
      b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    }
    hint.textContent = (TABS.find((t) => t.id === tab) || {}).hint || "";
  }
  top.querySelector("#mkQ").addEventListener("input", (e) => {
    query = e.target.value.trim().toLowerCase();
    render();
  });

  const match = (...parts) => !query || parts.join(" ").toLowerCase().indexOf(query) >= 0;

  function card(opts) {
    const c = document.createElement("div");
    c.className = "mk-card";
    const h = document.createElement("h4");
    h.textContent = opts.name;
    if (opts.publisher) {
      const p = document.createElement("span");
      p.className = "pub";
      p.textContent = opts.publisher;
      h.appendChild(p);
    }
    if (opts.status) {
      const st = document.createElement("span");
      st.className = "mk-st";
      st.setAttribute("data-in", String(!!opts.installed));
      st.textContent = opts.status;
      h.appendChild(st);
    }
    c.appendChild(h);
    if (opts.meta) {
      const m = document.createElement("p");
      m.className = "mk-meta";
      m.textContent = opts.meta;
      c.appendChild(m);
    }
    const d = document.createElement("p");
    d.className = "mk-d";
    d.textContent = opts.description || "";
    c.appendChild(d);
    if (opts.scopes) {
      const s = document.createElement("p");
      s.className = "mk-scopes";
      s.innerHTML = opts.scopes;
      c.appendChild(s);
    }
    if (opts.action) c.appendChild(opts.action);
    return c;
  }

  function empty(text) {
    const p = document.createElement("p");
    p.className = "mk-empty";
    p.textContent = text;
    return p;
  }

  async function act(item, action, note, btn) {
    const verb = action === "install" ? "Install" : "Remove";
    /* The OS's own sheet, not window.confirm. A permission decision rendered in
       Chrome's dialog arrives with the wrong typeface, the origin as a header,
       and the scopes flattened into one paragraph — the details that should
       decide the answer end up hardest to read. */
    const ok = await host.confirm({
      title: verb + " " + item.name + "?",
      detail: action === "install"
        ? "This links the package into your profile and adds it to the composition. It loads on the next restart."
        : "This removes it from the composition. The app leaves your desktop straight away; its agent tools clear on the next restart.",
      rows: [
        { k: "Package", v: item.pkg + " " + item.version },
        { k: "Publisher", v: item.publisher },
        { k: "Grants", v: (item.permissions.grant || []).join(", ") || "nothing", tone: "grant" },
        { k: "Refuses", v: (item.permissions.deny || []).join(", ") || "nothing", tone: "deny" },
      ],
      confirm: verb,
      danger: action !== "install",
    });
    if (!ok) return;
    btn.disabled = true;
    note.textContent = verb + "ing…";
    note.removeAttribute("data-kind");
    try {
      const r = await host.invoke(action, { target: action === "install" ? item.dir : item.pkg });
      note.textContent = r.message || (r.ok ? "Done." : "Failed.");
      if (!r.ok) note.setAttribute("data-kind", "err");
      /* Without this the desktop's app list stays stale: a removed app keeps its
         icon and its window still tries to import assets that now 404, and a
         freshly installed one has no icon at all. */
      if (window.MVApps) await window.MVApps.refresh();
      host.observe({
        verb: action === "install" ? "install" : "delete",
        target: item.pkg,
        summary: (action === "install" ? "installed " : "removed ") + item.name,
      });
      setTimeout(render, 900);
    } catch (e) {
      note.textContent = e.message;
      note.setAttribute("data-kind", "err");
      btn.disabled = false;
    }
  }

  /* ---- the Shelf ---------------------------------------------------------
     One featured slot, then rows by category.

     The featured app is DERIVED, never hand-picked. A curated hero needs
     somebody to re-curate it every week or it quietly goes stale, and with a
     first-party catalogue it mostly flatters whatever was shipped last. So the
     rule is explicit and the reason is printed under it: anything not installed
     comes first (that is the only card that can change your setup), then
     anything awaiting a restart (that is a job half-done), then the app giving
     the agent the most capability. */
  function feature(items) {
    const notInstalled = items.filter((i) => i.state === "available");
    if (notInstalled.length) {
      return { item: notInstalled[0], why: "Not installed — the one card here that can change what your desktop can do." };
    }
    const pending = items.filter((i) => i.state === "needs-restart");
    if (pending.length) {
      return { item: pending[0], why: "Installed but not loaded. Restart the harness to finish the job." };
    }
    const byTools = items.slice().sort((a, b) => (b.toolCount || 0) - (a.toolCount || 0));
    return {
      item: byTools[0],
      why: byTools[0] && byTools[0].toolCount
        ? "Gives your agent the most capability of anything installed — " + byTools[0].toolCount + " tools."
        : "Everything is installed and running.",
    };
  }

  function tile(item) {
    const c = document.createElement("div");
    c.className = "mk-tile";

    const ic = document.createElement("div");
    ic.className = "ic";
    ic.textContent = item.glyph || "▢";
    c.appendChild(ic);

    const h = document.createElement("h6");
    h.textContent = item.name;
    c.appendChild(h);

    const pub = document.createElement("p");
    pub.className = "pub";
    pub.textContent = item.publisher + " · " + item.version;
    c.appendChild(pub);

    const p = document.createElement("p");
    p.textContent = item.tagline || item.description;
    c.appendChild(p);

    /* Scopes on the tile, not only in the dialog. The Shelf's known weakness is
       that a pretty card hides what it is asking for; printing the grants here
       costs two lines and removes the objection. */
    const sc = document.createElement("p");
    sc.className = "sc";
    sc.innerHTML = "<b>" + ((item.permissions.grant || []).join(", ") || "no grants") + "</b>";
    c.appendChild(sc);

    const foot = document.createElement("div");
    foot.className = "foot";
    const st = document.createElement("span");
    st.className = "mk-st";
    st.setAttribute("data-in", String(item.state === "running"));
    st.textContent = item.state === "running" ? "installed"
                   : item.state === "needs-restart" ? "restart" : "available";
    const note = document.createElement("span");
    note.className = "mk-note";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = item.inProfile ? "rm" : "go";
    btn.textContent = item.inProfile ? "Remove" : "Install";
    btn.addEventListener("click", () => act(item, item.inProfile ? "remove" : "install", note, btn));
    foot.appendChild(btn);
    foot.appendChild(st);
    c.appendChild(foot);
    c.appendChild(note);
    return c;
  }

  async function renderApps(grid) {
    /* The shelf is not a grid; drop the class the other tabs use. */
    grid.className = "";
    const { items } = await host.invoke("list");
    const shown = items.filter((i) => match(i.name, i.pkg, i.description, i.category));

    const running = items.filter((i) => i.state === "running").length;
    const pending = items.filter((i) => i.state === "needs-restart").length;
    setCount(running + " running" + (pending ? " · " + pending + " awaiting restart" : "") +
             " · " + items.length + " in this workspace");

    if (!shown.length) { grid.appendChild(empty("No apps match that search.")); return; }

    /* Only feature when browsing. A hero over search results is noise. */
    if (!query) {
      const f = feature(items);
      if (f.item) {
        const hero = document.createElement("div");
        hero.className = "mk-hero";
        const k = document.createElement("p");
        k.className = "k";
        k.textContent = f.item.state === "available" ? "Available to install"
                      : f.item.state === "needs-restart" ? "Waiting on a restart" : "Most capable";
        const h = document.createElement("h4");
        h.textContent = f.item.name;
        const d = document.createElement("p");
        d.textContent = f.item.description || f.item.tagline;
        hero.appendChild(k);
        hero.appendChild(h);
        hero.appendChild(d);

        const row = document.createElement("div");
        row.className = "row";
        const note = document.createElement("span");
        note.className = "mk-note";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = f.item.inProfile ? "rm" : "go";
        btn.textContent = f.item.inProfile ? "Remove" : "Install";
        btn.addEventListener("click", () => act(f.item, f.item.inProfile ? "remove" : "install", note, btn));
        const sc = document.createElement("span");
        sc.className = "mk-scopes";
        sc.innerHTML = "<b>Grants</b> " + ((f.item.permissions.grant || []).join(", ") || "nothing") +
                       " · <b>Refuses</b> " + ((f.item.permissions.deny || []).join(", ") || "nothing");
        row.appendChild(btn);
        row.appendChild(sc);
        row.appendChild(note);
        hero.appendChild(row);

        const why = document.createElement("p");
        why.className = "mk-why";
        why.textContent = "Featured because: " + f.why;
        hero.appendChild(why);
        grid.appendChild(hero);
      }
    }

    /* Rows by category, ordered so the shelf a person is most likely to act on
       sits first rather than wherever the alphabet put it. */
    const ORDER = ["Work with the agent", "See what happened", "System", "Other"];
    const byCat = new Map();
    for (const i of shown) {
      if (!byCat.has(i.category)) byCat.set(i.category, []);
      byCat.get(i.category).push(i);
    }
    const cats = [...byCat.keys()].sort((a, b) => {
      const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    for (const cat of cats) {
      const list = byCat.get(cat).sort((a, b) => a.name.localeCompare(b.name));
      const head = document.createElement("div");
      head.className = "mk-shelf-h";
      const h5 = document.createElement("h5");
      h5.textContent = cat;
      const n = document.createElement("span");
      n.textContent = list.length + (list.length === 1 ? " app" : " apps");
      head.appendChild(h5);
      head.appendChild(n);
      grid.appendChild(head);

      const shelf = document.createElement("div");
      shelf.className = "mk-shelf";
      for (const i of list) shelf.appendChild(tile(i));
      grid.appendChild(shelf);
    }
  }

  async function renderSkills(grid) {
    if (!sessionId) { grid.appendChild(empty("Connecting to the harness…")); return; }
    const v = await window.MVDsh.rpc("skill.list", { sessionId });
    const shown = (v.skills || []).filter((s) => match(s.name, s.description));
    setCount(shown.length + " skills");
    if (!shown.length) { grid.appendChild(empty("No skills are registered. Skills come from the filesystem skill provider — add a SKILL.md under a skills directory the harness scans.")); return; }
    for (const s of shown) {
      grid.appendChild(card({ name: s.name, meta: "skill", description: s.description || "", status: "loaded", installed: true }));
    }
  }

  async function renderAgents(grid) {
    if (!sessionId) { grid.appendChild(empty("Connecting to the harness…")); return; }
    const v = await window.MVDsh.rpc("subagent.list", { parentSessionId: sessionId });
    const shown = (v.entries || []).filter((e) => match(e.name || e.id || "", e.status || ""));
    setCount(shown.length + " agents");
    if (!shown.length) {
      grid.appendChild(empty("No subagents are running. The agent spawns them when a task needs delegating — they appear here while they work, and this list is live rather than a catalogue."));
      return;
    }
    for (const e of shown) {
      grid.appendChild(card({ name: e.name || e.id, meta: e.id, description: e.status || "", status: "running", installed: true }));
    }
  }

  async function renderModels(grid) {
    const v = await window.MVDsh.rpc("llm.models", {});
    const groups = v.groups || [];
    let n = 0;
    for (const g of groups) {
      const shown = (g.models || []).filter((m) => match(m.name || m.id, g.name || g.id));
      n += shown.length;
      for (const m of shown) {
        grid.appendChild(card({
          name: m.name || m.id,
          publisher: g.name || g.id,
          meta: m.id,
          description: g.id === "ollama" ? "Runs on this machine. Nothing leaves." : "Routed through " + (g.name || g.id) + ".",
          status: g.id === "ollama" ? "local" : "remote",
          installed: g.id === "ollama",
        }));
      }
    }
    setCount(n + " models");
    if (!n) grid.appendChild(empty("No models matched."));
  }

  async function renderAutomations(grid) {
    const r = await host.invoke("automations");
    setCount("");
    if (!r.available) {
      grid.appendChild(empty(
        "The scheduler is not mounted in this profile, so there are no automations to list — which is not the same as having none. " +
        "Adding @deepseek-ai/dsh-schedule to the composition gives the agent durable after / at / every-N reminders over the session log, " +
        "and this tab will list them.",
      ));
      return;
    }
    if (!(r.entries || []).length) grid.appendChild(empty("No automations scheduled yet."));
  }

  function setCount(t) { top.querySelector("#mkCount").textContent = t; }

  async function render() {
    body.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "mk-grid";   /* renderApps clears this; the shelf is not a grid */
    body.appendChild(grid);
    try {
      if (tab === "apps") await renderApps(grid);
      else if (tab === "skills") await renderSkills(grid);
      else if (tab === "agents") await renderAgents(grid);
      else if (tab === "models") await renderModels(grid);
      else await renderAutomations(grid);
    } catch (e) {
      grid.appendChild(empty("Could not load: " + e.message));
    }
  }

  /* Skills and subagents are session-scoped in the harness, so this needs a
     session id. Borrow the one the desktop bridge already has rather than
     creating another. */
  try {
    if (window.MVDsh) {
      window.MVDsh.rpc("session.create", {}).then((v) => {
        sessionId = v.sessionId;
        if (tab === "skills" || tab === "agents") render();
      });
    }
  } catch (e) {}

  paintTabs();
  render();

  return function unmount() {};
}
