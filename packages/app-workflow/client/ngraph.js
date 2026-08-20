/* The node-graph engine, lifted from the Console.
   =================================================================
   Provenance: apps/app-7-console.html lines 14548-15221, verbatim
   apart from one mechanical rename — every `ng-` class prefix became
   `wfg-`. The rename is what makes this a plugin rather than a copy:
   the Console still owns `.ng-*` for its Agents and Automations
   diagrams, and two independent copies of those rules on one page
   would fight. Renaming means this file's styles cannot reach the
   Console's diagrams and the Console's cannot reach these nodes.

   The engine reached seven helpers from the Console's module scope.
   Six were one-liners and are reproduced below; `toast` is the only
   one with a real implementation behind it, so it defers to the
   Console's when the app is running inside it and degrades to the
   console log when it is not.

   Nothing else was changed. The engine has no idea what a workflow
   is — it draws nodes and edges and reports gestures, which is why
   it could serve three different consumers in the Console and can
   serve this plugin unmodified.
   ================================================================= */

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

/* The Console's sprite sheet lives in its own document, and this plugin renders
   inside that document — so `#id` references resolve. An id the sheet does not
   carry renders an empty <use> rather than throwing, so the palette maps every
   node type onto a symbol that exists (see lib/palette.js). */
const ico = (id, cls) => '<svg class="ico ' + (cls || "") + '"><use href="#' + id + '"/></svg>';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* setPointerCapture throws NotFoundError if the pointer is already gone, which
   would abort the rest of the handler — never let it break a gesture. */
function grab(node, id) { try { if (node.setPointerCapture) node.setPointerCapture(id); } catch (e) { /* pointer already released */ } }

function toast(msg, ms, opt) {
  if (typeof window !== "undefined" && typeof window.toast === "function") return window.toast(msg, ms, opt);
  console.log("[workflow] " + msg);
  return null;
}

var NG_SEQ = 1;
function ngId(p){ return (p || "n") + (NG_SEQ++) + Math.random().toString(36).slice(2,5); }

function NGraph(host, opts){
  opts = opts || {};
  var SV = 4000;                      /* svg layer offset, content(0,0) → svg(SV,SV) */
  var MINK = .28, MAXK = 2.4;
  var G = {
    host:host, nodes:[], edges:[], sel:[], selEdge:null,
    tx:40, ty:40, k:1, undo:[], redo:[], opts:opts, ro:!!opts.readOnly
  };

  host.classList.add("wfg");
  if(!host.hasAttribute("tabindex")) host.setAttribute("tabindex","0");
  host.setAttribute("role","application");
  host.setAttribute("aria-label", opts.label || "Node graph canvas");
  host.innerHTML =
    '<div class="wfg-vp" data-vp>'+
      '<svg class="wfg-edges" data-edges></svg>'+
      '<div data-nodes style="position:absolute;left:0;top:0;width:0;height:0"></div>'+
    '</div>'+
    '<div class="wfg-marq" data-marq></div>'+
    '<div class="wfg-empty" data-empty></div>'+
    (opts.quickAdd ? '<div class="wfg-qa" data-qa>'+
      '<input type="text" data-qain placeholder="Add a node…" aria-label="Search nodes to add" spellcheck="false">'+
      '<div class="list" data-qalist role="listbox"></div></div>' : '')+
    '<div class="wfg-hud">'+
      '<button type="button" data-ngz="-" aria-label="Zoom out" title="Zoom out">'+ico("i-x","xs")+'</button>'+
      '<span class="zr" data-zr aria-live="polite">100%</span>'+
      '<button type="button" data-ngz="+" aria-label="Zoom in" title="Zoom in">'+ico("i-plus","xs")+'</button>'+
      '<button type="button" class="wide" data-ngfit aria-label="Fit graph to view">'+ico("i-grid","xs")+'Fit</button>'+
      (opts.readOnly ? '' : '<button type="button" class="wide" data-nglay aria-label="Tidy layout">'+ico("i-layers","xs")+'Tidy</button>')+
    '</div>'+
    '<div class="wfg-mini" data-mini role="button" tabindex="0" aria-label="Minimap — click to recentre"><svg viewBox="0 0 158 100" preserveAspectRatio="none" data-minisvg></svg></div>';

  var vp    = host.querySelector("[data-vp]");
  var svg   = host.querySelector("[data-edges]");
  var nlay  = host.querySelector("[data-nodes]");
  var marq  = host.querySelector("[data-marq]");
  var zr    = host.querySelector("[data-zr]");
  var mini  = host.querySelector("[data-minisvg]");
  var emptyN= host.querySelector("[data-empty]");
  var qa    = host.querySelector("[data-qa]");

  /* ---------- geometry helpers ---------- */
  function estH(n){ return 40 + Math.max(n.ins.length, n.outs.length, 1) * 18 + ((n.chips && n.chips.length) ? 26 : 10); }
  function nodeById(id){ for(var i=0;i<G.nodes.length;i++) if(G.nodes[i].id === id) return G.nodes[i]; return null; }
  function toContent(clientX, clientY){
    var r = host.getBoundingClientRect();
    return [ (clientX - r.left - G.tx) / G.k, (clientY - r.top - G.ty) / G.k ];
  }
  G.nodeById = nodeById;
  G.toContent = toContent;

  /* ---------- camera ---------- */
  function apply(){
    vp.style.transform = "translate("+G.tx.toFixed(2)+"px,"+G.ty.toFixed(2)+"px) scale("+G.k.toFixed(4)+")";
    host.style.backgroundSize = (24*G.k).toFixed(2)+"px "+(24*G.k).toFixed(2)+"px";
    host.style.backgroundPosition = G.tx.toFixed(1)+"px "+G.ty.toFixed(1)+"px";
    if(zr) zr.textContent = Math.round(G.k*100) + "%";
    drawMini();
  }
  function zoomAt(px, py, nk){
    nk = clamp(nk, MINK, MAXK);
    G._touched = true;
    var cx = (px - G.tx) / G.k, cy = (py - G.ty) / G.k;
    G.k = nk; G.tx = px - cx*nk; G.ty = py - cy*nk;
    apply();
  }
  G.zoomBy = function(f){
    var r = host.getBoundingClientRect();
    zoomAt(r.width/2, r.height/2, G.k * f);
  };
  G.bounds = function(){
    if(!G.nodes.length) return {x:0,y:0,w:400,h:260};
    var x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
    G.nodes.forEach(function(n){
      var h = n.h || estH(n);
      x1=Math.min(x1,n.x); y1=Math.min(y1,n.y); x2=Math.max(x2,n.x+n.w); y2=Math.max(y2,n.y+h);
    });
    return {x:x1,y:y1,w:Math.max(1,x2-x1),h:Math.max(1,y2-y1)};
  };
  G.fit = function(pad){
    pad = pad == null ? 34 : pad;
    var r = host.getBoundingClientRect();
    if(!r.width || !r.height){ G._needFit = true; return; }   /* window not laid out yet */
    G._needFit = false; G._fitAt = r.width; G._touched = false;
    var b = G.bounds();
    var k = clamp(Math.min((r.width-pad*2)/b.w, (r.height-pad*2)/b.h), MINK, 1.15);
    G.k = k;
    G.tx = (r.width - b.w*k)/2 - b.x*k;
    G.ty = (r.height - b.h*k)/2 - b.y*k;
    apply();
  };
  G.centreOn = function(n){
    var r = host.getBoundingClientRect();
    G.tx = r.width/2 - (n.x + n.w/2) * G.k;
    G.ty = r.height/2 - (n.y + (n.h||estH(n))/2) * G.k;
    apply();
  };

  /* ---------- undo ---------- */
  function ser(){
    return {
      nodes: G.nodes.map(function(n){
        return { id:n.id, type:n.type, x:Math.round(n.x), y:Math.round(n.y), w:n.w, title:n.title, sub:n.sub,
                 icon:n.icon, tile:n.tile, ins:n.ins, outs:n.outs, data:n.data, meta:n.meta, chips:n.chips };
      }),
      edges: G.edges.map(function(e){ return { id:e.id, a:e.a, ap:e.ap, b:e.b, bp:e.bp, label:e.label||"" }; })
    };
  }
  G.serialize = function(){ return JSON.parse(JSON.stringify(ser())); };
  G.load = function(o, keepCam){
    var d = JSON.parse(JSON.stringify(o || {nodes:[],edges:[]}));
    G.nodes = (d.nodes||[]).map(function(n){ n.state = "idle"; n._a = {}; return n; });
    G.edges = d.edges || [];
    G.sel = []; G.selEdge = null;
    G.render();
    if(!keepCam) G.fit();
    fire("change");
  };
  G.push = function(){
    if(G.ro) return;
    G.undo.push(JSON.stringify(ser()));
    if(G.undo.length > 40) G.undo.shift();
    G.redo.length = 0;
  };
  G.undoStep = function(){
    if(!G.undo.length) return false;
    G.redo.push(JSON.stringify(ser()));
    var s = JSON.parse(G.undo.pop());
    G.nodes = s.nodes.map(function(n){ n.state="idle"; n._a={}; return n; });
    G.edges = s.edges; G.sel = []; G.selEdge = null;
    G.render(); fire("change"); return true;
  };
  G.redoStep = function(){
    if(!G.redo.length) return false;
    G.undo.push(JSON.stringify(ser()));
    var s = JSON.parse(G.redo.pop());
    G.nodes = s.nodes.map(function(n){ n.state="idle"; n._a={}; return n; });
    G.edges = s.edges; G.sel = []; G.selEdge = null;
    G.render(); fire("change"); return true;
  };

  function fire(evt, arg){ if(opts["on"+evt.charAt(0).toUpperCase()+evt.slice(1)]) opts["on"+evt.charAt(0).toUpperCase()+evt.slice(1)](arg, G); }

  /* ---------- mutation ---------- */
  G.addNode = function(n, silent){
    if(!silent) G.push();
    n.id   = n.id || ngId("n");
    n.w    = n.w || 208;
    n.ins  = n.ins || [];
    n.outs = n.outs || [];
    n.data = n.data || {};
    n.state= "idle"; n._a = {};
    G.nodes.push(n);
    if(!silent){ G.render(); fire("change"); }
    return n;
  };
  G.removeNode = function(id){
    G.push();
    G.nodes = G.nodes.filter(function(n){ return n.id !== id; });
    G.edges = G.edges.filter(function(e){ return e.a !== id && e.b !== id; });
    G.sel = G.sel.filter(function(s){ return s !== id; });
    G.render(); fire("change"); fire("select", null);
  };
  G.connect = function(a, ap, b, bp, silent, label){
    if(a === b) return null;
    var dup = G.edges.filter(function(e){ return e.a===a && e.ap===ap && e.b===b && e.bp===bp; })[0];
    if(dup) return null;
    if(!silent) G.push();
    var e = { id:ngId("e"), a:a, ap:ap, b:b, bp:bp, label:label||"" };
    G.edges.push(e);
    if(!silent){ G.render(); fire("change"); }
    return e;
  };
  G.clear = function(){ G.push(); G.nodes = []; G.edges = []; G.sel = []; G.selEdge = null; G.render(); fire("change"); fire("select", null); };
  G.deleteSelection = function(){
    if(G.ro) return;
    if(G.selEdge){ G.push(); G.edges = G.edges.filter(function(e){ return e.id !== G.selEdge; }); G.selEdge = null; G.render(); fire("change"); return; }
    if(!G.sel.length) return;
    G.push();
    var kill = {}; G.sel.forEach(function(id){ kill[id] = 1; });
    G.nodes = G.nodes.filter(function(n){ return !kill[n.id]; });
    G.edges = G.edges.filter(function(e){ return !kill[e.a] && !kill[e.b]; });
    G.sel = []; G.render(); fire("change"); fire("select", null);
  };
  G.select = function(id, additive){
    G.selEdge = null;
    if(id == null) G.sel = [];
    else if(additive){ var i = G.sel.indexOf(id); if(i>-1) G.sel.splice(i,1); else G.sel.push(id); }
    else G.sel = [id];
    paintSel();
    fire("select", G.sel.length === 1 ? nodeById(G.sel[0]) : null);
  };
  function paintSel(){
    $$(".wfg-node", nlay).forEach(function(el){
      el.classList.toggle("sel", G.sel.indexOf(el.getAttribute("data-nid")) > -1);
    });
    $$(".wfg-edge", svg).forEach(function(p){
      p.classList.toggle("sel", !p.classList.contains("hit") && p.getAttribute("data-eid") === G.selEdge);
    });
    drawMini();
  }

  /* ---------- run state ---------- */
  G.setState = function(id, st){
    var n = nodeById(id); if(!n) return;
    n.state = st;
    if(n.el) n.el.setAttribute("data-st", st);
  };
  G.setBadge = function(id, txt){
    var n = nodeById(id); if(!n) return;
    n.badge = txt;
    if(n.el){ var b = n.el.querySelector("[data-nbadge]"); if(b) b.textContent = txt || ""; }
  };
  G.resetStates = function(){
    G.nodes.forEach(function(n){ n.state = "idle"; n.badge = ""; if(n.el){ n.el.setAttribute("data-st","idle");
      var b = n.el.querySelector("[data-nbadge]"); if(b) b.textContent = ""; } });
    $$(".wfg-edge.flow", svg).forEach(function(p){ p.classList.remove("flow"); });
  };
  G.flowEdge = function(id, on){
    $$('.wfg-edge[data-eid="'+id+'"]', svg).forEach(function(p){
      if(!p.classList.contains("hit")) p.classList.toggle("flow", !!on);
    });
  };
  G.edgesInto = function(id){ return G.edges.filter(function(e){ return e.b === id; }); };
  G.edgesFrom = function(id){ return G.edges.filter(function(e){ return e.a === id; }); };

  /* ---------- render ---------- */
  function portsHTML(n, side){
    var list = side === "in" ? n.ins : n.outs;
    return list.map(function(p){
      var wired = G.edges.some(function(e){
        return side === "in" ? (e.b === n.id && e.bp === p.id) : (e.a === n.id && e.ap === p.id);
      });
      var dot = '<i class="dot"></i>';
      var lbl = '<span>'+esc(p.label || p.id)+'</span>';
      return '<button type="button" class="wfg-port '+side+(wired?" wired":"")+'" data-pt="'+side+'" data-pid="'+esc(p.id)+'" '+
             'aria-label="'+esc((side==="in"?"Input ":"Output ")+(p.label||p.id)+" on "+n.title)+'">'+
             (side === "in" ? dot + lbl : lbl + dot) + '</button>';
    }).join("");
  }
  G.render = function(){
    nlay.innerHTML = G.nodes.map(function(n){
      var chips = (n.chips||[]).map(function(c){ return '<span class="wfg-chip '+(c.cls||"")+'">'+esc(c.t)+'</span>'; }).join("");
      return '<div class="wfg-node" data-nid="'+esc(n.id)+'" data-st="'+esc(n.state||"idle")+'" tabindex="0" '+
        'style="left:'+Math.round(n.x)+'px;top:'+Math.round(n.y)+'px;width:'+n.w+'px" '+
        'aria-label="'+esc(n.title + " — " + (n.sub||""))+'">'+
        '<div class="wfg-n-hd"><span class="wfg-n-ic '+esc(n.tile||"g-conn")+'">'+ico(n.icon||"i-cube")+'</span>'+
          '<span class="wfg-n-tt"><b>'+esc(n.title)+'</b><i>'+esc(n.sub||"")+'</i></span>'+
          '<span class="wfg-n-st"></span></div>'+
        '<div class="wfg-n-io"><div class="wfg-col in">'+portsHTML(n,"in")+'</div>'+
          '<div class="wfg-col out">'+portsHTML(n,"out")+'</div></div>'+
        '<div class="wfg-n-ft">'+chips+
          '<span class="wfg-chip t" data-nbadge>'+esc(n.badge||"")+'</span></div>'+
      '</div>';
    }).join("");
    /* measure — ports are laid out by CSS, so the anchors come from the DOM */
    G.nodes.forEach(function(n){
      var el = nlay.querySelector('.wfg-node[data-nid="'+n.id+'"]');
      n.el = el; if(!el) return;
      n.h = el.offsetHeight;
      n._a = {};
      $$(".wfg-port", el).forEach(function(pb){
        var d = pb.querySelector(".dot");
        var oy = d.offsetTop + d.offsetHeight/2;
        var side = pb.getAttribute("data-pt");
        n._a[side + "|" + pb.getAttribute("data-pid")] = { x: n.x + (side === "in" ? 0 : n.w), y: n.y + oy };
      });
    });
    drawEdges();
    paintSel();
    if(emptyN){
      emptyN.style.display = G.nodes.length ? "none" : "grid";
      if(!G.nodes.length) emptyN.innerHTML = opts.emptyHTML || "";
    }
    drawMini();
  };
  function anchor(nid, side, pid){
    var n = nodeById(nid); if(!n) return null;
    var a = n._a[side + "|" + pid];
    if(a) return a;
    /* port vanished (type changed) — fall back to the node's mid edge */
    return { x: n.x + (side === "in" ? 0 : n.w), y: n.y + (n.h || estH(n))/2 };
  }
  function bez(p1, p2){
    var dx = Math.max(42, Math.min(170, Math.abs(p2.x - p1.x) * .55));
    return "M"+(p1.x+SV)+","+(p1.y+SV)+" C"+(p1.x+dx+SV)+","+(p1.y+SV)+" "+(p2.x-dx+SV)+","+(p2.y+SV)+" "+(p2.x+SV)+","+(p2.y+SV);
  }
  G.edgePath = bez;
  function drawEdges(){
    var h = "";
    G.edges.forEach(function(e){
      var p1 = anchor(e.a, "out", e.ap), p2 = anchor(e.b, "in", e.bp);
      if(!p1 || !p2) return;
      var d = bez(p1, p2);
      h += '<path class="wfg-edge hit" data-eid="'+esc(e.id)+'" d="'+d+'"></path>';
      h += '<path class="wfg-edge" data-eid="'+esc(e.id)+'" d="'+d+'"></path>';
      if(e.label) h += '<text class="wfg-elbl" x="'+((p1.x+p2.x)/2+SV)+'" y="'+((p1.y+p2.y)/2+SV-5)+'" text-anchor="middle">'+esc(e.label)+'</text>';
    });
    h += '<path class="wfg-edge ghost" data-ghost style="display:none"></path>';
    svg.innerHTML = h;
  }
  /* live re-route while a node is dragged — no full re-render */
  function reroute(ids){
    var touch = {}; ids.forEach(function(i){ touch[i] = 1; });
    G.nodes.forEach(function(n){
      if(!touch[n.id] || !n.el) return;
      Object.keys(n._a).forEach(function(k){
        var side = k.split("|")[0];
        var pb = n.el.querySelector('.wfg-port[data-pt="'+side+'"][data-pid="'+k.split("|")[1]+'"]');
        if(!pb) return;
        var d = pb.querySelector(".dot");
        n._a[k] = { x: n.x + (side === "in" ? 0 : n.w), y: n.y + d.offsetTop + d.offsetHeight/2 };
      });
    });
    G.edges.forEach(function(e){
      if(!touch[e.a] && !touch[e.b]) return;
      var p1 = anchor(e.a,"out",e.ap), p2 = anchor(e.b,"in",e.bp);
      if(!p1 || !p2) return;
      var d = bez(p1, p2);
      $$('.wfg-edge[data-eid="'+e.id+'"]', svg).forEach(function(p){ p.setAttribute("d", d); });
    });
    drawMini();
  }

  /* ---------- minimap ---------- */
  function drawMini(){
    if(!mini) return;
    var b = G.bounds(), r = host.getBoundingClientRect();
    var pad = 14;
    var bw = b.w + pad*2, bh = b.h + pad*2;
    var s = Math.min(158/bw, 100/bh);
    var ox = (158 - bw*s)/2 - (b.x-pad)*s, oy = (100 - bh*s)/2 - (b.y-pad)*s;
    var h = G.nodes.map(function(n){
      var sel = G.sel.indexOf(n.id) > -1;
      return '<rect class="mn'+(sel?" sel":"")+'" x="'+(n.x*s+ox).toFixed(1)+'" y="'+(n.y*s+oy).toFixed(1)+
        '" width="'+Math.max(2,n.w*s).toFixed(1)+'" height="'+Math.max(2,(n.h||estH(n))*s).toFixed(1)+'" rx="1"></rect>';
    }).join("");
    if(r.width){
      var vx = (-G.tx/G.k)*s+ox, vy = (-G.ty/G.k)*s+oy, vw = (r.width/G.k)*s, vh = (r.height/G.k)*s;
      h += '<rect class="mv" x="'+vx.toFixed(1)+'" y="'+vy.toFixed(1)+'" width="'+vw.toFixed(1)+'" height="'+vh.toFixed(1)+'" rx="2"></rect>';
    }
    mini.innerHTML = h;
    mini._s = s; mini._ox = ox; mini._oy = oy;
  }

  /* ---------- auto layout: layered left-to-right by topological depth ---------- */
  G.layout = function(startX, startY, colGap, rowGap){
    if(!G.nodes.length) return;
    colGap = colGap || 92; rowGap = rowGap || 24;
    var byId = {}; G.nodes.forEach(function(n){ byId[n.id] = n; });
    var depth = {}; G.nodes.forEach(function(n){ depth[n.id] = 0; });
    var lim = G.nodes.length;
    /* longest-path relaxation with a hard cap — cycles (agent↔agent
       delegation) settle instead of spinning */
    for(var it = 0; it < lim + 1; it++){
      var moved = false;
      for(var i = 0; i < G.edges.length; i++){
        var e = G.edges[i];
        if(!byId[e.a] || !byId[e.b] || e.a === e.b) continue;
        if(depth[e.b] < depth[e.a] + 1 && depth[e.a] + 1 <= lim){ depth[e.b] = depth[e.a] + 1; moved = true; }
      }
      if(!moved) break;
    }
    var cols = {};
    G.nodes.forEach(function(n){ (cols[depth[n.id]] = cols[depth[n.id]] || []).push(n); });
    var keys = Object.keys(cols).map(Number).sort(function(a,b){ return a-b; });
    var x = startX == null ? 46 : startX;
    var mid = startY == null ? 260 : startY;
    keys.forEach(function(d){
      var col = cols[d], maxW = 0, total = -rowGap;
      col.forEach(function(n){ maxW = Math.max(maxW, n.w); total += (n.h || estH(n)) + rowGap; });
      var y = Math.max(24, mid - total/2);
      col.forEach(function(n){ n.x = x; n.y = y; y += (n.h || estH(n)) + rowGap; });
      x += maxW + colGap;
    });
  };
  G.autoLayout = function(fit){
    G.layout(); G.render();          /* pass 1 uses estimates */
    G.layout(); G.render();          /* pass 2 uses measured heights */
    if(fit !== false) G.fit();
  };

  /* ---------- pointer interaction ---------- */
  var P = { mode:null, id:0, sx:0, sy:0, ox:0, oy:0, moved:false, drag:[], link:null, pts:{}, pinch:0, pk:1 };
  var ghost = null;

  function ghostPath(){ return svg.querySelector("[data-ghost]"); }

  host.addEventListener("pointerdown", function(e){
    if(e.button === 2) return;
    host.focus({preventScroll:true});
    if(qa) qa.classList.remove("on");
    P.pts[e.pointerId] = {x:e.clientX, y:e.clientY};
    if(Object.keys(P.pts).length === 2){                    /* pinch to zoom, touch */
      var ids = Object.keys(P.pts), a = P.pts[ids[0]], b = P.pts[ids[1]];
      P.pinch = Math.hypot(a.x-b.x, a.y-b.y); P.pk = G.k; P.mode = "pinch"; return;
    }
    var port = e.target.closest(".wfg-port");
    var node = e.target.closest(".wfg-node");
    var edge = e.target.closest(".wfg-edge");

    if(port && node && !G.ro){
      var side = port.getAttribute("data-pt");
      if(side === "out"){
        e.preventDefault(); e.stopPropagation();
        P.mode = "link"; P.id = e.pointerId;
        P.link = { a:node.getAttribute("data-nid"), ap:port.getAttribute("data-pid"), ok:false, to:null };
        host.classList.add("linking");
        grab(host, e.pointerId);
        return;
      }
      /* dragging from an input disconnects it — a real editor affordance */
      if(side === "in"){
        var nid = node.getAttribute("data-nid"), pid = port.getAttribute("data-pid");
        var hit = G.edges.filter(function(x){ return x.b === nid && x.bp === pid; });
        if(hit.length){ e.preventDefault(); e.stopPropagation(); G.push();
          G.edges = G.edges.filter(function(x){ return !(x.b === nid && x.bp === pid); });
          G.render(); fire("change"); return; }
      }
    }
    if(node){
      var id = node.getAttribute("data-nid");
      if(G.sel.indexOf(id) === -1) G.select(id, e.shiftKey);
      else if(e.shiftKey) G.select(id, true);
      else { G.selEdge = null; paintSel(); fire("select", nodeById(id)); }
      if(G.ro){ P.mode = "pan"; P.sx = e.clientX; P.sy = e.clientY; P.ox = G.tx; P.oy = G.ty; P.id = e.pointerId; grab(host, e.pointerId); return; }
      P.mode = "node"; P.id = e.pointerId; P.moved = false;
      P.sx = e.clientX; P.sy = e.clientY;
      P.drag = (G.sel.indexOf(id) > -1 ? G.sel.slice() : [id]).map(function(nid){
        var n = nodeById(nid); return { id:nid, x:n.x, y:n.y };
      });
      node.classList.add("dragging");
      grab(host, e.pointerId);
      return;
    }
    if(edge && edge.classList.contains("hit")){
      G.sel = []; G.selEdge = edge.getAttribute("data-eid"); paintSel(); fire("select", null);
      return;
    }
    /* empty canvas */
    if(e.shiftKey && !G.ro){
      P.mode = "marq"; P.id = e.pointerId;
      var r = host.getBoundingClientRect();
      P.sx = e.clientX - r.left; P.sy = e.clientY - r.top;
      marq.style.display = "block"; marq.style.left = P.sx+"px"; marq.style.top = P.sy+"px";
      marq.style.width = "0px"; marq.style.height = "0px";
      grab(host, e.pointerId);
      return;
    }
    G.select(null);
    P.mode = "pan"; P.id = e.pointerId; P.sx = e.clientX; P.sy = e.clientY; P.ox = G.tx; P.oy = G.ty;
    host.classList.add("panning");
    grab(host, e.pointerId);
  });

  host.addEventListener("pointermove", function(e){
    if(P.pts[e.pointerId]) P.pts[e.pointerId] = {x:e.clientX, y:e.clientY};
    if(P.mode === "pinch"){
      var ids = Object.keys(P.pts); if(ids.length < 2) return;
      var a = P.pts[ids[0]], b = P.pts[ids[1]];
      var d = Math.hypot(a.x-b.x, a.y-b.y);
      if(P.pinch > 8){
        var r = host.getBoundingClientRect();
        zoomAt((a.x+b.x)/2 - r.left, (a.y+b.y)/2 - r.top, P.pk * (d / P.pinch));
      }
      return;
    }
    if(P.id !== e.pointerId || !P.mode) return;
    if(P.mode === "pan"){
      G._touched = true;
      G.tx = P.ox + (e.clientX - P.sx); G.ty = P.oy + (e.clientY - P.sy); apply(); return;
    }
    if(P.mode === "node"){
      var dx = (e.clientX - P.sx)/G.k, dy = (e.clientY - P.sy)/G.k;
      if(!P.moved && Math.hypot(dx*G.k, dy*G.k) > 3){ P.moved = true; G.push(); }
      if(!P.moved) return;
      P.drag.forEach(function(d){
        var n = nodeById(d.id); if(!n) return;
        n.x = Math.round(d.x + dx); n.y = Math.round(d.y + dy);
        if(n.el){ n.el.style.left = n.x+"px"; n.el.style.top = n.y+"px"; }
      });
      reroute(P.drag.map(function(d){ return d.id; }));
      return;
    }
    if(P.mode === "marq"){
      var r2 = host.getBoundingClientRect();
      var cx = e.clientX - r2.left, cy = e.clientY - r2.top;
      marq.style.left = Math.min(cx,P.sx)+"px"; marq.style.top = Math.min(cy,P.sy)+"px";
      marq.style.width = Math.abs(cx-P.sx)+"px"; marq.style.height = Math.abs(cy-P.sy)+"px";
      return;
    }
    if(P.mode === "link"){
      var p1 = anchor(P.link.a, "out", P.link.ap);
      var c  = toContent(e.clientX, e.clientY);
      var gp = ghostPath(); if(!gp) return;
      gp.style.display = "";
      var tgt = document.elementFromPoint(e.clientX, e.clientY);
      var pb  = tgt && tgt.closest ? tgt.closest('.wfg-port[data-pt="in"]') : null;
      $$(".wfg-port.drop-ok, .wfg-port.drop-bad", nlay).forEach(function(x){ x.classList.remove("drop-ok","drop-bad"); });
      P.link.to = null; P.link.ok = false;
      var end = {x:c[0], y:c[1]};
      if(pb){
        var tn = pb.closest(".wfg-node").getAttribute("data-nid");
        var tp = pb.getAttribute("data-pid");
        var same = tn === P.link.a;
        var dup = G.edges.some(function(x){ return x.a===P.link.a && x.ap===P.link.ap && x.b===tn && x.bp===tp; });
        P.link.ok = !same && !dup;
        pb.classList.add(P.link.ok ? "drop-ok" : "drop-bad");
        if(P.link.ok){ P.link.to = {b:tn, bp:tp}; var ta = anchor(tn,"in",tp); if(ta) end = ta; }
      }
      gp.setAttribute("d", bez(p1, end));
      gp.classList.toggle("bad", !!pb && !P.link.ok);
      return;
    }
  });

  function endPointer(e){
    delete P.pts[e.pointerId];
    if(P.mode === "pinch"){ if(!Object.keys(P.pts).length) P.mode = null; return; }
    if(P.id !== e.pointerId) return;
    if(P.mode === "node"){
      $$(".wfg-node.dragging", nlay).forEach(function(x){ x.classList.remove("dragging"); });
      if(P.moved) fire("change");
    }
    if(P.mode === "marq"){
      var r = host.getBoundingClientRect();
      var x1 = Math.min(P.sx, e.clientX - r.left), x2 = Math.max(P.sx, e.clientX - r.left);
      var y1 = Math.min(P.sy, e.clientY - r.top),  y2 = Math.max(P.sy, e.clientY - r.top);
      var c1 = [ (x1 - G.tx)/G.k, (y1 - G.ty)/G.k ], c2 = [ (x2 - G.tx)/G.k, (y2 - G.ty)/G.k ];
      G.sel = G.nodes.filter(function(n){
        return n.x + n.w > c1[0] && n.x < c2[0] && n.y + (n.h||estH(n)) > c1[1] && n.y < c2[1];
      }).map(function(n){ return n.id; });
      marq.style.display = "none";
      paintSel();
      fire("select", G.sel.length === 1 ? nodeById(G.sel[0]) : null);
    }
    if(P.mode === "link"){
      var gp = ghostPath(); if(gp){ gp.style.display = "none"; gp.classList.remove("bad"); }
      $$(".wfg-port.drop-ok, .wfg-port.drop-bad", nlay).forEach(function(x){ x.classList.remove("drop-ok","drop-bad"); });
      if(P.link && P.link.to) G.connect(P.link.a, P.link.ap, P.link.to.b, P.link.to.bp);
      P.link = null;
      host.classList.remove("linking");
    }
    host.classList.remove("panning");
    P.mode = null; P.drag = [];
  }
  host.addEventListener("pointerup", endPointer);
  host.addEventListener("pointercancel", endPointer);

  /* Wheel: zoom, and never let the gesture reach the OS space switcher —
     the same contract #deskSwitch honours. */
  host.addEventListener("wheel", function(e){
    e.preventDefault(); e.stopPropagation();
    /* a sideways trackpad swipe pans instead of zooming — and either way the
       event stops here, so the OS never sees it as a space change */
    if(e.shiftKey){ G.tx -= (e.deltaX || e.deltaY); apply(); return; }
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)){ G.tx -= e.deltaX; apply(); return; }
    var r = host.getBoundingClientRect();
    var f = Math.exp(-e.deltaY * (e.ctrlKey ? .010 : .0022));
    zoomAt(e.clientX - r.left, e.clientY - r.top, G.k * clamp(f, .8, 1.25));
  }, {passive:false});
  host.addEventListener("touchstart", function(e){ e.stopPropagation(); }, {passive:true});
  host.addEventListener("touchmove",  function(e){ e.stopPropagation(); }, {passive:true});
  host.addEventListener("touchend",   function(e){ e.stopPropagation(); }, {passive:true});
  host.addEventListener("contextmenu", function(e){ e.preventDefault(); });

  /* ---------- keyboard ---------- */
  host.addEventListener("keydown", function(e){
    if(e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    var mod = e.metaKey || e.ctrlKey;
    if(mod && e.key.toLowerCase() === "z"){
      e.preventDefault(); e.stopPropagation();
      if(e.shiftKey) G.redoStep(); else G.undoStep();
      return;
    }
    if(e.key === "Escape"){
      if(qa && qa.classList.contains("on")){ e.stopPropagation(); qa.classList.remove("on"); host.focus(); return; }
      if(G.sel.length || G.selEdge){ e.stopPropagation(); G.select(null); return; }
      return;
    }
    if((e.key === "Delete" || e.key === "Backspace") && (G.sel.length || G.selEdge)){
      e.preventDefault(); e.stopPropagation(); G.deleteSelection(); return;
    }
    if(mod && e.key.toLowerCase() === "a"){
      e.preventDefault(); e.stopPropagation();
      G.sel = G.nodes.map(function(n){ return n.id; }); paintSel(); return;
    }
    /* Ctrl+arrow is the OS space switcher — never swallow it here */
    if(e.key.indexOf("Arrow") === 0 && G.sel.length && !G.ro && !e.ctrlKey && !e.metaKey && !e.altKey){
      e.preventDefault(); e.stopPropagation();
      var step = e.shiftKey ? 40 : 8;
      var dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      var dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      G.push();
      G.sel.forEach(function(id){ var n = nodeById(id); if(!n) return; n.x += dx; n.y += dy;
        if(n.el){ n.el.style.left = n.x+"px"; n.el.style.top = n.y+"px"; } });
      reroute(G.sel); fire("change"); return;
    }
    if(e.key === "0" && mod){ e.preventDefault(); e.stopPropagation(); G.fit(); return; }
  });
  /* keyboard wiring: Enter on an output arms it, Enter on an input lands it */
  var armed = null;
  host.addEventListener("keydown", function(e){
    if(e.key !== "Enter" && e.key !== " ") return;
    var pb = e.target.closest ? e.target.closest(".wfg-port") : null;
    if(!pb || G.ro) return;
    e.preventDefault(); e.stopPropagation();
    var nid = pb.closest(".wfg-node").getAttribute("data-nid"), pid = pb.getAttribute("data-pid");
    if(pb.getAttribute("data-pt") === "out"){ armed = {a:nid, ap:pid}; toast("Output armed — focus an input port and press Enter to connect."); return; }
    if(armed){ var made = G.connect(armed.a, armed.ap, nid, pid); armed = null;
      toast(made ? "Connected." : "Those ports are already connected."); }
    else toast("Focus an output port first, then this input.");
  });

  /* ---------- HUD + minimap ---------- */
  host.addEventListener("click", function(e){
    var z = e.target.closest("[data-ngz]");
    if(z){ e.stopPropagation(); G.zoomBy(z.getAttribute("data-ngz") === "+" ? 1.22 : 1/1.22); return; }
    if(e.target.closest("[data-ngfit]")){ e.stopPropagation(); G.fit(); return; }
    if(e.target.closest("[data-nglay]")){ e.stopPropagation(); G.push(); G.autoLayout(); fire("change"); return; }
  });
  var miniHost = host.querySelector("[data-mini]");
  if(miniHost){
    miniHost.addEventListener("pointerdown", function(e){ e.stopPropagation(); });
    miniHost.addEventListener("click", function(e){
      e.stopPropagation();
      var r = miniHost.getBoundingClientRect(), hr = host.getBoundingClientRect();
      var mx = (e.clientX - r.left) / r.width * 158, my = (e.clientY - r.top) / r.height * 100;
      var cx = (mx - mini._ox) / mini._s, cy = (my - mini._oy) / mini._s;
      G.tx = hr.width/2 - cx*G.k; G.ty = hr.height/2 - cy*G.k; apply();
    });
    miniHost.addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.stopPropagation(); G.fit(); } });
  }
  host.addEventListener("dblclick", function(e){
    if(e.target.closest(".wfg-node")){
      var n = nodeById(e.target.closest(".wfg-node").getAttribute("data-nid"));
      if(n) fire("openNode", n);
      return;
    }
    if(qa && !G.ro){
      var r = host.getBoundingClientRect();
      qa._at = toContent(e.clientX, e.clientY);
      qa.style.left = Math.min(r.width - 260, Math.max(6, e.clientX - r.left)) + "px";
      qa.style.top  = Math.min(r.height - 300, Math.max(6, e.clientY - r.top)) + "px";
      qa.classList.add("on");
      fire("quickAdd", qa);
      var inp = qa.querySelector("[data-qain]"); if(inp){ inp.value = ""; inp.focus(); }
    }
  });
  /* The window this canvas lives in can be maximised, restored or resized long
     after the graph was laid out. Re-frame it — but only while the view is
     still the one Fit produced, so a deliberate zoom is never yanked away. */
  if(window.ResizeObserver){
    var rzT = 0;
    new ResizeObserver(function(){
      clearTimeout(rzT);
      rzT = setTimeout(function(){
        var r = host.getBoundingClientRect();
        if(!r.width || !r.height) return;
        if(G._needFit){ G.fit(); return; }
        if(!G._touched && G._fitAt && Math.abs(r.width - G._fitAt) > G._fitAt * 0.18){ G.fit(); return; }
        drawMini();
      }, 90);
    }).observe(host);
  }
  G.qa = qa;
  G.apply = apply;
  G.reroute = reroute;
  apply();
  return G;
}
export { NGraph, ngId };
