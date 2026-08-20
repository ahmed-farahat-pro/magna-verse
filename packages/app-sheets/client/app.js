/* Sheets — the browser half. Served from this package at
   /desktop/plugins/sheets/app.js. Reaches the OS host API and nothing else. */

export const manifest = { id: "sheets", name: "Sheets" };

export function mount(host, root) {
  root.innerHTML = "";
  /* Never assign root.className: this element is the Console's own window
     body and its class is what positions it below the title bar. Assigning
     wipes it and the app draws over the titlebar. Styling is scoped by the
     data-mv-app attribute the OS stamps here, so no class is needed. */

  const style = document.createElement("style");
  style.textContent = `
/* The mount root itself carries the attribute, so its own rules target the
   attribute directly — a descendant selector would never match it. */
[data-mv-app="sheets"] {height:100%;display:flex;flex-direction:column;font-size:13px;overflow:auto}
[data-mv-app="sheets"] .sh-bar {display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--glass-line, rgba(255,255,255,.11));flex:none}
[data-mv-app="sheets"] .sh-bar .ref {font-family:var(--mono);font-weight:600;min-width:38px}
[data-mv-app="sheets"] .sh-bar input {flex:1;font:inherit;padding:5px 9px;border-radius:7px;border:1px solid var(--glass-line, rgba(255,255,255,.11));
      background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx)}
[data-mv-app="sheets"] .sh-wrap {flex:1;overflow:auto}
[data-mv-app="sheets"] table.sh {border-collapse:collapse;width:100%}
[data-mv-app="sheets"] table.sh th, [data-mv-app="sheets"] table.sh td {border:1px solid var(--glass-line, rgba(255,255,255,.11));padding:0;height:26px;min-width:78px}
[data-mv-app="sheets"] table.sh th {background:var(--glass-2, rgba(255,255,255,.06));color:var(--tx-4);font-size:11px;font-weight:600;
      position:sticky;top:0;z-index:1;min-width:34px;width:34px}
[data-mv-app="sheets"] table.sh td {position:relative}
[data-mv-app="sheets"] table.sh td input {width:100%;height:100%;border:0;background:transparent;color:var(--tx-2);
      font:inherit;padding:3px 6px;outline:0}
[data-mv-app="sheets"] table.sh td input:focus {background:var(--glass-3, rgba(255,255,255,.09));color:var(--tx);box-shadow:inset 0 0 0 2px var(--accent)}
[data-mv-app="sheets"] table.sh td.filled input {color:var(--tx)}
  `;
  root.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "sh-bar";
  const refLbl = document.createElement("span");
  refLbl.className = "ref";
  refLbl.textContent = "A1";
  const formula = document.createElement("input");
  formula.setAttribute("aria-label", "Cell value");
  bar.appendChild(refLbl);
  bar.appendChild(formula);

  const wrap = document.createElement("div");
  wrap.className = "sh-wrap";
  root.appendChild(bar);
  root.appendChild(wrap);

  let active = { c: 0, r: 0 };
  let cols = [];
  let editing = false;

  function refOf(c, r) { return cols[c] + (r + 1); }

  async function render() {
    const g = await host.invoke("grid");
    cols = g.colNames;
    const t = document.createElement("table");
    t.className = "sh";
    const head = document.createElement("tr");
    head.appendChild(document.createElement("th"));
    for (const c of g.colNames) {
      const th = document.createElement("th");
      th.textContent = c;
      head.appendChild(th);
    }
    t.appendChild(head);

    for (let r = 0; r < g.rows; r++) {
      const tr = document.createElement("tr");
      const rh = document.createElement("th");
      rh.textContent = String(r + 1);
      tr.appendChild(rh);
      for (let c = 0; c < g.cols; c++) {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.value = g.data[r][c];
        inp.dataset.c = c;
        inp.dataset.r = r;
        inp.setAttribute("aria-label", refOf(c, r));
        if (inp.value) td.className = "filled";
        inp.addEventListener("focus", () => {
          active = { c, r };
          refLbl.textContent = refOf(c, r);
          formula.value = inp.value;
        });
        inp.addEventListener("input", () => { editing = true; });
        inp.addEventListener("blur", async () => {
          if (!editing) return;
          editing = false;
          await host.invoke("set", { ref: refOf(c, r), value: inp.value });
          host.observe({ verb: "write", target: refOf(c, r), summary: "edited " + refOf(c, r) });
          td.className = inp.value ? "filled" : "";
        });
        td.appendChild(inp);
        tr.appendChild(td);
      }
      t.appendChild(tr);
    }
    wrap.innerHTML = "";
    wrap.appendChild(t);
  }

  formula.addEventListener("change", async () => {
    const ref = refOf(active.c, active.r);
    await host.invoke("set", { ref, value: formula.value });
    host.observe({ verb: "write", target: ref, summary: "edited " + ref });
    await render();
  });

  /* The store is on the host, so a model writing cells must show up here
     without a reload. Stops itself when the window goes away. */
  const timer = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    if (!editing && document.activeElement !== formula &&
        !(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.c)) {
      render().catch(() => {});
    }
  }, 2000);

  render().catch((e) => { wrap.textContent = "Sheets could not load: " + e.message; });

  return function unmount() { clearInterval(timer); };
}
