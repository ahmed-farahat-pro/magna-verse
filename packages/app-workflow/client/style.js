/* Styles for the lifted engine plus this app's own shell.
   =================================================================
   The engine block below is the Console's `.ng-*` rules with the same
   mechanical rename applied to them as to the JavaScript. It is NOT
   scoped under [data-mv-app] and does not need to be: `wfg-` appears
   nowhere else in the document, so these rules can only ever match
   nodes this plugin created. The Console keeps its `.ng-*` copy for
   the Agents and Automations diagrams, untouched.

   The shell block IS scoped, because its names (`wf-*`) are generic
   enough to collide and the Console already owns some of them.

   Every custom property used here is one the Console defines on
   :root — `--glass-*`, `--tx-*`, `--accent*`, `--cyan`, `--signal`,
   `--tile`, `--mono`, `--shadow-*`. An undefined custom property
   invalidates the whole declaration rather than falling back, which
   once erased every border in nine plugins at a stroke, so the list
   was checked against the Console rather than assumed.
   ================================================================= */

export const STYLE = `
/* ---- engine (lifted, renamed) ---- */
.wfg.panning{cursor:grabbing}
.wfg.linking{cursor:crosshair}
.wfg:focus-visible{outline:2px solid var(--accent-2);outline-offset:-2px}
.wfg-vp{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0}
.wfg-edges{position:absolute;left:-4000px;top:-4000px;width:12000px;height:9000px;overflow:visible}
.wfg-edge{fill:none;stroke:var(--tx-4);stroke-width:1.8;stroke-linecap:round;transition:stroke .18s}
.wfg-edge.hit{stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer}
.wfg-edge.sel{stroke:var(--accent-2);stroke-width:2.4}
.wfg-edge.flow{stroke:var(--cyan);stroke-width:2.4;stroke-dasharray:7 9}
@media (prefers-reduced-motion: no-preference){ .wfg-edge.flow{animation:wfgFlow .55s linear infinite} }
@keyframes wfgFlow{to{stroke-dashoffset:-32}}
.wfg-edge.ghost{stroke:var(--cyan);stroke-dasharray:5 6;stroke-width:2}
.wfg-edge.ghost.bad{stroke:var(--accent-2)}
.wfg-elbl{font-family:var(--mono);font-size:9px;fill:var(--tx-4)}

.wfg-node{position:absolute;border-radius:12px;background:var(--glass-2);border:1px solid var(--glass-line-2);
  box-shadow:var(--shadow-sm);cursor:grab;overflow:hidden;
  transition:box-shadow .18s,border-color .18s,transform .12s}
.wfg-node:hover{border-color:var(--tx-4)}
.wfg-node.dragging{cursor:grabbing;box-shadow:var(--shadow-pop);z-index:6}
.wfg-node.sel{border-color:var(--accent-2);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-2) 34%,transparent)}
.wfg-node:focus-visible{outline:2px solid var(--accent-2);outline-offset:2px}
.wfg-n-hd{display:flex;align-items:center;gap:8px;padding:8px 10px 7px;border-bottom:1px solid var(--glass-line)}
.wfg-n-ic{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;flex:none}
.wfg-n-ic .ico{width:15px;height:15px;stroke:var(--tile,var(--tx))}
.wfg-n-tt{flex:1;min-width:0;line-height:1.25}
.wfg-n-tt b{display:block;font-size:11.8px;font-weight:660;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfg-n-tt i{display:block;font-style:normal;font-family:var(--mono);font-size:9.5px;color:var(--tx-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfg-n-st{flex:none;width:9px;height:9px;border-radius:99px;background:var(--tx-4);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--tx-4) 20%,transparent)}
.wfg-n-io{display:flex;justify-content:space-between;gap:6px;padding:7px 0}
.wfg-col{display:flex;flex-direction:column;gap:5px;min-width:0}
.wfg-col.in{align-items:flex-start;padding-left:10px}
.wfg-col.out{align-items:flex-end;padding-right:10px;margin-left:auto}
.wfg-port{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:9.5px;color:var(--tx-3);
  padding:1px 0;border-radius:6px;max-width:100%}
.wfg-port span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfg-port .dot{width:11px;height:11px;border-radius:99px;flex:none;display:block;
  border:2px solid var(--tx-4);background:var(--glass-3);transition:all .15s;cursor:crosshair}
.wfg-port.in .dot{margin-left:-15px}
.wfg-port.out .dot{margin-right:-15px}
.wfg-port:hover .dot{border-color:var(--cyan);transform:scale(1.25)}
.wfg-port.wired .dot{background:var(--tx-4);border-color:var(--tx-4)}
.wfg-port.drop-ok .dot{border-color:var(--private);background:var(--private);transform:scale(1.4)}
.wfg-port.drop-bad .dot{border-color:var(--accent-2)}
.wfg-port:focus-visible{outline:2px solid var(--accent-2);outline-offset:1px}
.wfg-n-ft{display:flex;flex-wrap:wrap;gap:4px;padding:0 10px 8px;align-items:center}
.wfg-chip{font-family:var(--mono);font-size:8.6px;letter-spacing:.02em;padding:1.5px 5px;border-radius:4px;
  border:1px solid var(--glass-line);color:var(--tx-3);background:var(--glass-3);white-space:nowrap}
.wfg-chip.r{color:var(--private);border-color:color-mix(in srgb,var(--private) 34%,transparent);background:var(--private-dim)}
.wfg-chip.w{color:var(--public);border-color:color-mix(in srgb,var(--public) 36%,transparent);background:var(--public-dim)}
.wfg-chip.eg{color:var(--accent-2);border-color:color-mix(in srgb,var(--accent) 34%,transparent);background:var(--accent-dim)}
.wfg-chip.m{color:#A99BFF;border-color:color-mix(in srgb,var(--signal) 36%,transparent);background:var(--signal-dim)}
.wfg-chip.t{margin-left:auto;color:var(--cyan)}
/* per-node run state */
.wfg-node[data-st="queued"]{border-color:var(--tx-4)}
.wfg-node[data-st="queued"] .wfg-n-st{background:var(--tx-3);box-shadow:0 0 0 3px color-mix(in srgb,var(--tx-3) 22%,transparent)}
.wfg-node[data-st="running"]{border-color:var(--cyan);box-shadow:0 0 0 2px color-mix(in srgb,var(--cyan) 30%,transparent),0 8px 24px var(--glow-cyan)}
.wfg-node[data-st="running"] .wfg-n-st{background:var(--cyan);box-shadow:0 0 0 3px color-mix(in srgb,var(--cyan) 26%,transparent)}
.wfg-node[data-st="ok"]{border-color:color-mix(in srgb,var(--private) 60%,transparent)}
.wfg-node[data-st="ok"] .wfg-n-st{background:var(--private);box-shadow:0 0 0 3px var(--private-dim)}
.wfg-node[data-st="warning"]{border-color:color-mix(in srgb,var(--public) 62%,transparent)}
.wfg-node[data-st="warning"] .wfg-n-st{background:var(--public);box-shadow:0 0 0 3px var(--public-dim)}
.wfg-node[data-st="failed"]{border-color:color-mix(in srgb,var(--accent) 62%,transparent)}
.wfg-node[data-st="failed"] .wfg-n-st{background:var(--accent-2);box-shadow:0 0 0 3px var(--accent-dim)}
@media (prefers-reduced-motion: no-preference){
  .wfg-node[data-st="running"] .wfg-n-st{animation:sovPulse 1.1s infinite}
}
.wfg-marq{position:absolute;border:1px solid var(--cyan);background:color-mix(in srgb,var(--cyan) 14%,transparent);
  border-radius:4px;pointer-events:none;display:none;z-index:8}
.wfg-hud{position:absolute;left:10px;bottom:10px;z-index:9;display:flex;gap:5px;align-items:center;
  padding:4px;border-radius:10px;background:var(--chrome);border:1px solid var(--glass-line);
  backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur)}
.wfg-hud button{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--tx-2);
  border:1px solid transparent}
.wfg-hud button:hover{background:var(--glass-3);color:var(--tx)}
.wfg-hud .zr{font-family:var(--mono);font-size:10.5px;color:var(--tx-3);min-width:42px;text-align:center}
.wfg-hud .wide{width:auto;padding:0 9px;font-size:11px;font-weight:600;gap:5px}
.wfg-mini{position:absolute;right:10px;bottom:10px;z-index:9;width:158px;height:100px;border-radius:9px;
  background:var(--chrome);border:1px solid var(--glass-line);overflow:hidden;cursor:pointer;
  backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur)}
.wfg-mini svg{width:100%;height:100%;display:block}
.wfg-mini .mn{fill:var(--tx-4);opacity:.75}
.wfg-mini .mn.sel{fill:var(--accent-2);opacity:1}
.wfg-mini .mv{fill:color-mix(in srgb,var(--cyan) 16%,transparent);stroke:var(--cyan);stroke-width:1.5}
.wfg-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;pointer-events:none;
  color:var(--tx-4);font-size:12px;line-height:1.7;padding:24px}
/* quick-add — double-click the canvas */
.wfg-qa{position:absolute;z-index:12;width:250px;max-height:290px;display:none;flex-direction:column;
  border-radius:12px;background:var(--glass-3);border:1px solid var(--glass-line-2);box-shadow:var(--shadow-pop);
  backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);overflow:hidden}
.wfg-qa.on{display:flex}
.wfg-qa input{width:100%;height:34px;padding:0 11px;background:transparent;border:0;
  border-bottom:1px solid var(--glass-line);font-size:12.5px;outline:none}
.wfg-qa .list{overflow-y:auto;padding:5px}
.wfg-qa .qi{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 8px;border-radius:7px;
  font-size:12px;color:var(--tx-2)}
.wfg-qa .qi:hover,.wfg-qa .qi[aria-selected="true"]{background:var(--glass-2);color:var(--tx)}
.wfg-qa .qi .g{margin-left:auto;font-family:var(--mono);font-size:9px;color:var(--tx-4)}

/* Responsive: on a phone the OS parks its Ask AI pill bottom-left, so the
   canvas HUD moves to the free corner rather than sitting under it. */
@media (max-width:760px){
  .wfg-mini{display:none}
  .wfg-hud{left:auto;right:8px;bottom:8px}
  .wfg-hud button{width:34px;height:34px}
}

/* ---- app shell (scoped) ---- */
[data-mv-app="workflow"]{height:100%;display:flex;flex-direction:column;font-size:13px;overflow:hidden}
[data-mv-app="workflow"] .wf-top{flex:none;display:flex;align-items:center;gap:8px;padding:8px 11px;
  border-bottom:1px solid var(--glass-line);background:rgba(0,0,0,.10)}
:root[data-theme="light"] [data-mv-app="workflow"] .wf-top{background:rgba(255,255,255,.34)}
[data-mv-app="workflow"] .wf-nm{flex:1;min-width:0;height:30px;padding:0 10px;border-radius:8px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-weight:620;outline:none}
[data-mv-app="workflow"] .wf-nm:focus{border-color:var(--cyan)}
[data-mv-app="workflow"] .wf-btn{flex:none;height:30px;padding:0 11px;border-radius:8px;display:inline-flex;
  align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx-2)}
[data-mv-app="workflow"] .wf-btn:hover{background:var(--glass-2);color:var(--tx)}
[data-mv-app="workflow"] .wf-btn .ico{width:14px;height:14px}
[data-mv-app="workflow"] .wf-btn.pri{background:var(--accent);border-color:transparent;color:#fff}
[data-mv-app="workflow"] .wf-btn.pri:hover{filter:brightness(1.08)}
[data-mv-app="workflow"] .wf-btn[disabled]{opacity:.45;cursor:default}

[data-mv-app="workflow"] .wf-main{flex:1;min-height:0;display:flex;overflow:hidden}
[data-mv-app="workflow"] .wf-pal{width:216px;flex:none;border-right:1px solid var(--glass-line);
  background:rgba(0,0,0,.14);display:flex;flex-direction:column;overflow:hidden}
:root[data-theme="light"] [data-mv-app="workflow"] .wf-pal{background:rgba(0,0,0,.04)}
[data-mv-app="workflow"] .wf-pal input{flex:none;margin:8px;height:28px;padding:0 9px;border-radius:7px;
  background:var(--glass-3);border:1px solid var(--glass-line-2);color:var(--tx);font:inherit;font-size:12px;outline:none}
[data-mv-app="workflow"] .wf-pal .list{flex:1;overflow-y:auto;padding:0 7px 10px}
[data-mv-app="workflow"] .wf-grp{font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--tx-4);padding:9px 5px 4px}
[data-mv-app="workflow"] .wf-pi{display:flex;align-items:center;gap:7px;width:100%;text-align:left;
  padding:6px 7px;border-radius:7px;font:inherit;font-size:11.5px;color:var(--tx-2);cursor:grab;
  background:transparent;border:0}
[data-mv-app="workflow"] .wf-pi:hover{background:var(--glass-2);color:var(--tx)}
[data-mv-app="workflow"] .wf-pi .ico{width:14px;height:14px;flex:none;color:var(--tx-3)}
[data-mv-app="workflow"] .wf-pi .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="workflow"] .wf-pi .acc{flex:none;font-family:var(--mono);font-size:8.5px;padding:1px 4px;border-radius:4px;
  border:1px solid var(--glass-line-2);color:var(--tx-4)}
[data-mv-app="workflow"] .wf-pi .acc.write,[data-mv-app="workflow"] .wf-pi .acc.exec{color:var(--signal);border-color:var(--signal-dim)}
[data-mv-app="workflow"] .wf-pi .acc.eg{color:var(--public);border-color:var(--public-dim)}

[data-mv-app="workflow"] .wf-canvas{flex:1;min-width:0;position:relative;display:flex;flex-direction:column}
[data-mv-app="workflow"] .wf-cv{flex:1;min-height:0;position:relative;overflow:hidden}

[data-mv-app="workflow"] .wf-insp{width:264px;flex:none;border-left:1px solid var(--glass-line);
  background:rgba(0,0,0,.14);display:flex;flex-direction:column;overflow-y:auto;padding:11px}
:root[data-theme="light"] [data-mv-app="workflow"] .wf-insp{background:rgba(0,0,0,.04)}
[data-mv-app="workflow"] .wf-insp h4{margin:0 0 3px;font-size:12.5px;font-weight:660}
[data-mv-app="workflow"] .wf-insp .why{margin:0 0 11px;font-size:11px;color:var(--tx-3);line-height:1.5}
[data-mv-app="workflow"] .wf-f{margin-bottom:9px;display:flex;flex-direction:column;gap:4px}
[data-mv-app="workflow"] .wf-f label{font-size:10.5px;font-weight:600;color:var(--tx-3)}
[data-mv-app="workflow"] .wf-f input[type=text],[data-mv-app="workflow"] .wf-f input[type=number],
[data-mv-app="workflow"] .wf-f select,[data-mv-app="workflow"] .wf-f textarea{
  width:100%;padding:6px 8px;border-radius:7px;background:var(--glass-3);border:1px solid var(--glass-line-2);
  color:var(--tx);font:inherit;font-size:11.5px;outline:none;box-sizing:border-box}
[data-mv-app="workflow"] .wf-f textarea{min-height:74px;resize:vertical;font-family:var(--mono);font-size:11px;line-height:1.5}
[data-mv-app="workflow"] .wf-f input:focus,[data-mv-app="workflow"] .wf-f textarea:focus,
[data-mv-app="workflow"] .wf-f select:focus{border-color:var(--cyan)}
[data-mv-app="workflow"] .wf-f .hint{font-size:10px;color:var(--tx-4);line-height:1.45}
[data-mv-app="workflow"] .wf-f input[readonly]{font-family:var(--mono);font-size:10.5px;color:var(--tx-2);
  background:var(--glass-2);cursor:text}
[data-mv-app="workflow"] .wf-f.chk{flex-direction:row;align-items:center;gap:8px;justify-content:flex-start}
[data-mv-app="workflow"] .wf-f.chk input[type=checkbox]{flex:none;width:15px;height:15px;margin:0;accent-color:var(--accent)}
[data-mv-app="workflow"] .wf-f.chk label{flex:1;min-width:0;font-size:11.5px;color:var(--tx-2);line-height:1.4}

[data-mv-app="workflow"] .wf-warn{display:flex;gap:7px;align-items:flex-start;padding:8px 9px;border-radius:8px;
  background:color-mix(in srgb,var(--signal) 12%,transparent);border:1px solid var(--signal-dim);
  font-size:11px;line-height:1.5;color:var(--tx-2);margin-bottom:10px}
[data-mv-app="workflow"] .wf-warn .ico{width:14px;height:14px;flex:none;margin-top:1px;color:var(--signal)}

[data-mv-app="workflow"] .wf-empty{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;
  font-size:12px;color:var(--tx-4);text-align:center;line-height:1.7;padding:24px}

[data-mv-app="workflow"] .wf-list{position:absolute;inset:0;background:var(--bg,#05070C);z-index:8;
  display:flex;flex-direction:column;overflow-y:auto;padding:14px}
[data-mv-app="workflow"] .wf-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;
  border:1px solid var(--glass-line);background:var(--glass-3);margin-bottom:7px;cursor:pointer}
[data-mv-app="workflow"] .wf-row:hover{background:var(--glass-2)}
[data-mv-app="workflow"] .wf-row .mid{flex:1;min-width:0}
[data-mv-app="workflow"] .wf-row .nm{font-size:12.5px;font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-mv-app="workflow"] .wf-row .sub{font-size:10.5px;color:var(--tx-4);font-family:var(--mono);margin-top:2px}

/* The run bar. It sits under the canvas rather than over it, because the
   canvas IS the progress display — every node paints its own state — and the
   bar carries only what a node cannot show: the approval question. */
[data-mv-app="workflow"] .wf-run{flex:none;border-top:1px solid var(--glass-line);background:rgba(0,0,0,.20);
  padding:10px 12px;display:flex;align-items:center;gap:10px}
:root[data-theme="light"] [data-mv-app="workflow"] .wf-run{background:rgba(0,0,0,.05)}
[data-mv-app="workflow"] .wf-run .mid{flex:1;min-width:0}
[data-mv-app="workflow"] .wf-run b{font-size:12.5px;font-weight:640}
[data-mv-app="workflow"] .wf-run b[data-tone="ok"]{color:var(--private)}
[data-mv-app="workflow"] .wf-run b[data-tone="bad"]{color:var(--signal)}
[data-mv-app="workflow"] .wf-run .sub{display:block;font-size:11px;color:var(--tx-3);margin-top:2px}
[data-mv-app="workflow"] .wf-run .ask{flex:1;min-width:0}
[data-mv-app="workflow"] .wf-run .ask .hd{display:flex;align-items:center;gap:7px;font-size:12.5px}
[data-mv-app="workflow"] .wf-run .ask .hd .ico{width:15px;height:15px;color:var(--signal)}
[data-mv-app="workflow"] .wf-run .ask .why{margin:4px 0 7px;font-size:11px;color:var(--tx-2);line-height:1.5}
[data-mv-app="workflow"] .wf-run .prs{display:flex;flex-direction:column;gap:3px;max-height:118px;overflow-y:auto}
[data-mv-app="workflow"] .wf-run .pr{display:flex;gap:8px;font-family:var(--mono);font-size:10.5px;line-height:1.5}
[data-mv-app="workflow"] .wf-run .pr .k{flex:none;min-width:64px;color:var(--tx-4)}
[data-mv-app="workflow"] .wf-run .pr .v{flex:1;min-width:0;color:var(--tx);white-space:pre-wrap;word-break:break-word}
[data-mv-app="workflow"] .wf-run .acts{flex:none;display:flex;gap:7px;align-self:flex-end}
`;
