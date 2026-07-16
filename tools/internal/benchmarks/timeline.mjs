// timeline.mjs — ONE wall-clock startup timeline for a bench app.
//
// Rows are sequential milestones on the road to "fully rendered & ready for input"; each row
// carries t=<ms from navigation start> and the step's duration, decomposed into the work done
// in that interval: the Laszlo/runtime/app layer (JS) AND the browser pipeline
// (style/layout/paint/composite), plus idle/network-wait so the columns sum to the duration.
//
//   node timeline.mjs <url> <label> [outJson] [lzprofJson]
//
// Driven by a SINGLE production (un-instrumented) run so everything shares one clock:
//   • milestones come from navigation/resource timing + the app's window.__olmark()s + a
//     harness-marked canvas-init + trace-derived first-paint / fully-rendered / ready-for-input.
//   • per interval, main-thread BUSY = Σ RunTask; RENDERING = Σ(style,layout,paint,composite)
//     sub-events; JS (= the Laszlo/app/runtime layer) = busy − rendering; idle = duration − busy.
//   • if a matching lzprof-<label>.json is passed, the row's "LZX detail" borrows that phase's
//     category MIX (instantiate/constraint/…) — proportions only, applied as a hint.
//
// Off-main-thread rasterization is not counted (it doesn't block); that matches METHODOLOGY.md.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, label, outJson, lzprofJson] = process.argv.slice(2);
// HiDPI timeline: CAP_DPR=2 forces deviceScaleFactor 2 (Retina) via
// --force-device-scale-factor + setViewport.deviceScaleFactor, matching capture.mjs/interact.mjs.
// DEFAULT 1 keeps the deterministic dpr=1 path used by the original baseline.
const DPR = +(process.env.CAP_DPR || 1) || 1;

// classify a trace event into a pipeline bucket (or null = not a rendering sub-event)
const STYLE = new Set(["UpdateLayoutTree", "RecalculateStyles", "ParseAuthorStyleSheet", "ScheduleStyleRecalculation"]);
const LAYOUT = new Set(["Layout", "UpdateLayoutTree.Layout", "LayoutShift"]);
const PAINT = new Set(["Paint", "PaintImage", "DecodeImage", "Decode Image"]);
const COMPOSITE = new Set(["CompositeLayers", "Commit", "UpdateLayer", "UpdateLayerTree", "Layerize", "PrePaint"]);
function bucket(name) {
  if (name === "Layout") return "layout";
  if (STYLE.has(name)) return "style";
  if (PAINT.has(name)) return "paint";
  if (COMPOSITE.has(name)) return "composite";
  return null;
}

const HOOK = `(function(){
  window.__olmarks={};
  window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now();
    try{performance.mark('OL:'+n);}catch(e){} } };
  // poll for canvas.isinited → mark canvas-init exactly once (the logical-tree-complete milestone)
  var iv=setInterval(function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){
    window.__olmark('canvas-init'); clearInterval(iv); } }catch(e){} },2);
})();`;

const b = await (async()=>{ for(let i=0;i<8;i++){ try{ return await pp.launch({ executablePath: CHROME,
  headless:"new", userDataDir:"/tmp/tl-"+label+"-"+Date.now(), args:["--no-sandbox","--force-device-scale-factor="+DPR,"--window-size=1000,700"] }); }
  catch(e){ await sleep(1200); } } throw new Error("launch x8"); })();
const p = await b.newPage(); await p.setViewport({ width:1000, height:700, deviceScaleFactor:DPR });
await p.evaluateOnNewDocument(HOOK);
await p.tracing.start({ categories:["devtools.timeline","disabled-by-default-devtools.timeline.frame",
  "blink.user_timing","loading","toplevel","v8.execute"], screenshots:false });
await p.goto(url, { waitUntil:"domcontentloaded" }).catch(()=>{});
// run until canvas-init AND a quiet tail (so "fully rendered / ready for input" are real)
for (let i=0;i<200;i++){ const ci = await p.evaluate(()=>!!(window.__olmarks&&window.__olmarks['canvas-init'])).catch(()=>false);
  if (ci && i>6) break; await sleep(100); }
await sleep(1500);  // let late paints + the idle tail land in the trace
const marks = await p.evaluate(()=>window.__olmarks);
const restiming = await p.evaluate(()=>{
  const out={}; const nav=performance.getEntriesByType('navigation')[0];
  if(nav){ out.__nav={responseEnd:nav.responseEnd, domContentLoaded:nav.domContentLoadedEventEnd}; }
  for(const r of performance.getEntriesByType('resource')){ const n=r.name.split('/').pop().split('?')[0];
    if(/lfc\.js$/.test(n)) out['runtime lfc.js fetched']=r.responseEnd;
    if(/\.lzx\.js$/.test(n)) out['app JS fetched']=r.responseEnd; }
  return out;
});
const paintEntries = await p.evaluate(()=>performance.getEntriesByType('paint').map(e=>({n:e.name,t:e.startTime})));
const traceBuf = await p.tracing.stop();
await b.close();

// ── parse trace, align its clock to perf.now via the OL: user_timing marks ───────────────────
const trace = JSON.parse(Buffer.from(traceBuf).toString("utf8"));
const evs = trace.traceEvents || [];
let offsets = [];   // traceTsMs - perfNowMs
for (const e of evs) {
  if (e.name && e.name.startsWith("OL:")) { const nm=e.name.slice(3);
    if (marks[nm]!=null) offsets.push(e.ts/1000 - marks[nm]); }
}
const offset = offsets.length ? offsets.reduce((a,b)=>a+b,0)/offsets.length : 0;  // ms
const toNav = (tsMicros) => tsMicros/1000 - offset;   // → ms from navigationStart (perf.now clock)

// gather RunTask (busy) + rendering sub-events on the nav clock
const tasks = [], render = [];   // {a,b} / {a,b,cat}
let lastPaintEnd = 0;
for (const e of evs) {
  if (e.ph !== "X" || e.dur == null) continue;
  const a = toNav(e.ts), z = a + e.dur/1000;
  // main-thread busy = the run-loop task wrapper (ThreadControllerImpl::RunTask). NOT
  // ThreadPool_RunTask (that's the off-main-thread pool — it must not count as blocking).
  if (e.name === "ThreadControllerImpl::RunTask") { tasks.push({a,b:z}); continue; }
  const c = bucket(e.name); if (c){ render.push({a,b:z,cat:c}); if (c==="paint") lastPaintEnd=Math.max(lastPaintEnd,z); }
}
const overlap = (s,e,a,z) => Math.max(0, Math.min(e,z) - Math.max(s,a));
// nested run-loops produce overlapping RunTask events; union-merge into disjoint busy intervals
// so per-step busy can never exceed the step duration.
tasks.sort((x,y)=>x.a-y.a);
const busyIv = [];
for (const t of tasks){ const last=busyIv[busyIv.length-1];
  if (last && t.a<=last.b){ last.b=Math.max(last.b,t.b); } else busyIv.push({a:t.a,b:t.b}); }
const sumBusy = (s,e) => busyIv.reduce((t,x)=>t+overlap(s,e,x.a,x.b),0);
const sumRender = (s,e) => { const o={style:0,layout:0,paint:0,composite:0};
  for(const r of render) o[r.cat]+=overlap(s,e,r.a,r.b); return o; };

// ready-for-input ≈ end of the last HEAVY (≥4 ms) main-thread task in the startup burst near
// canvas-init. (A running framerate timer keeps firing tiny tasks forever, so "main thread fully
// quiet" never happens — heavy-task-end is the real "build/paint done, now interactive" point.)
const ciT = marks['canvas-init'] ?? 0;
const heavyEnds = tasks.filter(t=>(t.b-t.a)>=4 && t.b>=ciT-80 && t.b<=ciT+800).map(t=>t.b);
let ready = Math.max(lastPaintEnd, ciT, heavyEnds.length?Math.max(...heavyEnds):0);

// first paint (the splash) from the paint-timing API
const firstPaint = (paintEntries.find(e=>e.n==="first-paint")||paintEntries[0]||{}).t;

// ── assemble ordered milestone list ─────────────────────────────────────────────────────────
const M = [];
const add = (name, t, note) => { if (t!=null && isFinite(t)) M.push({name, t, note}); };
add("navigation start", 0, "request issued");
if (restiming['runtime lfc.js fetched']) add("runtime fetched", restiming['runtime lfc.js fetched'], "lfc.js downloaded");
if (restiming['app JS fetched']) add("app JS fetched", restiming['app JS fetched'], "compiled app downloaded → parse/exec begins");
add("first paint (splash)", firstPaint, "spinner/splash pixels; app not built");
// app __olmark()s (app-oninit, data-loaded, events-hydrated, dashboard-shown, canvas-init, …)
const known = {
  'app-oninit':'static view tree built; canvas oninit ran',
  'data-loaded':'event data arrived (async fetch)',
  'events-hydrated':'data merged → event views built',
  'dashboard-shown':'showdashboard() ran — windows revealed',
  'canvas-init':'logical view tree finalized (first logical render)',
};
for (const [k,v] of Object.entries(marks)) if (k!=='canvas-init') add(k, v, known[k]||'app milestone');
add("canvas-init", marks['canvas-init'], known['canvas-init']);
add("fully rendered", lastPaintEnd, "last paint — all pixels on screen");
add("ready for input", ready, "startup build/paint burst done — interactive");
M.sort((x,y)=>x.t-y.t);
// de-dupe near-identical timestamps (keep the more specific later name)
const Mu = []; for (const m of M){ const prev=Mu[Mu.length-1];
  if (prev && Math.abs(prev.t-m.t)<0.5 && prev.name!=="navigation start"){ prev.name=prev.name+" / "+m.name; prev.note=m.note; }
  else Mu.push(m); }

// optional: category mix per phase from a matching lzprof json (proportions only)
let mix = null;
if (lzprofJson && fs.existsSync(lzprofJson)) { try {
  const lz = JSON.parse(fs.readFileSync(lzprofJson,"utf8"));
  mix = lz.phases.map(ph=>({ end: ph.end, calls: ph.calls, total: ph.callTotal }));
} catch(e){} }
function lzxDetail(prevName, name) {
  if (!mix) return "";
  // exact match only — the ?profile meter stops at canvas-init, so don't attach LZX category
  // hints to post-canvas-init intervals (they'd be misleading; the JS column is the truth there)
  const ph = mix.find(m=>m.end===name);
  if (!ph || !ph.total) return "";
  const top = Object.entries(ph.calls).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([c,n])=>`${c} ${Math.round(n/ph.total*100)}%`).join(", ");
  return `${ph.total.toLocaleString()} calls — ${top}`;
}

// ── compute per-interval breakdown ───────────────────────────────────────────────────────────
const rows = [];
for (let i=0;i<Mu.length;i++){ const m=Mu[i], prev=i?Mu[i-1]:null;
  const s = prev?prev.t:0, e=m.t, dur=e-s;
  const r = sumRender(s,e), busy=sumBusy(s,e);
  const renderTot = r.style+r.layout+r.paint+r.composite;
  const js = Math.max(0, busy - renderTot), idle = Math.max(0, dur - busy);
  rows.push({ t:e, name:m.name, note:m.note, dur, js, ...r, idle,
              lzx: prev?lzxDetail(prev.name,m.name):"" });
}
const out = { label, url, offsetMs:offset, marks, milestones:Mu, rows };
fs.writeFileSync(outJson||`/tmp/timeline-${label}.json`, JSON.stringify(out,null,1));

// ── print: markdown timeline table ───────────────────────────────────────────────────────────
const f = (x)=> x>=0.05 ? x.toFixed(1) : (x>0?"·":"");
console.log(`\n### ${label} — wall-clock startup timeline   (one production run; clock-offset ${offset.toFixed(0)} ms)\n`);
console.log("| t (ms) | milestone | step | JS (Laszlo/app) | style | layout | paint | composite | idle/wait | what happened |");
console.log("|--:|---|--:|--:|--:|--:|--:|--:|--:|---|");
for (const r of rows){
  const what = r.note + (r.lzx?` · _${r.lzx}_`:"");
  console.log(`| **${r.t.toFixed(0)}** | ${r.name} | ${r.dur.toFixed(0)} | ${f(r.js)} | ${f(r.style)} | ${f(r.layout)} | ${f(r.paint)} | ${f(r.composite)} | ${f(r.idle)} | ${what} |`);
}
// totals
const T = rows.reduce((a,r)=>({js:a.js+r.js,style:a.style+r.style,layout:a.layout+r.layout,paint:a.paint+r.paint,composite:a.composite+r.composite,idle:a.idle+r.idle}),{js:0,style:0,layout:0,paint:0,composite:0,idle:0});
const total = rows.length?rows[rows.length-1].t:0;
console.log(`| **${total.toFixed(0)}** | **TOTAL** | ${total.toFixed(0)} | **${T.js.toFixed(1)}** | ${T.style.toFixed(1)} | ${T.layout.toFixed(1)} | ${T.paint.toFixed(1)} | ${T.composite.toFixed(1)} | ${T.idle.toFixed(1)} | JS+browser=${(T.js+T.style+T.layout+T.paint+T.composite).toFixed(0)} ms main-thread |`);
console.log(`\n  → ${outJson||`/tmp/timeline-${label}.json`}`);
