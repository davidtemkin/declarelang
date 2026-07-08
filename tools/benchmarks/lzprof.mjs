// lzprof.mjs — LZX-runtime profiler (the `?profile` build) with PHASE segmentation.
//
// The profile build meters every LFC/app function (call/return → $lzprofiler buffers). We
// trap those writes with a Proxy and stamp performance.now(), reconstruct self-time per
// function, and split it by category AND by timeline phase. Phases are delimited by marks
// the benchmark app emits via window.__olmark('name'), plus the auto-marks 'canvas-init'
// and 'first-paint'. Output: per-phase × per-category self-ms + exact call counts.
//
//   node lzprof.mjs <app-url-with-?profile> <label> [outJson]
//
// All performance.now() values are relative to the page time origin (≈ navigationStart),
// so app marks, paint timing, and the meter stream share one clock.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";
import { categoryOf, ORDER } from "./categories.mjs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function L(o){ for(let i=0;i<8;i++){ try{ return await pp.launch(o);}catch(e){ await sleep(1200);} } throw new Error("launch x8"); }

const [url, label, outJson] = [process.argv[2], process.argv[3], process.argv[4]];

const HOOK = `(function(){
  window.__olmarks = {};
  window.__olmark = function(n){ if(!(n in window.__olmarks)) window.__olmarks[n] = performance.now(); };  // app timeline marks
  window.__ev = [];                                                       // flat [t,e,n,...]  e:0=call 1=return
  function wrap(b,key,kind){ var f='__hw_'+key; if(b[f])return; var a=b[key]; if(!a)return;
    var px=new Proxy(a,{set:function(t,p,v){ t[p]=v;
      if(typeof p==='string'&&p.charCodeAt(0)>=48&&p.charCodeAt(0)<=57){ var now=performance.now();
        if(kind==='c'){window.__ev.push(now,0,v);} else if(kind==='r'){window.__ev.push(now,1,v);}
        else{ var s=''+v, tok=s.slice(s.lastIndexOf(',')+1);
          if(tok.charCodeAt(0)===99)window.__ev.push(now,0,tok.slice(6)); else window.__ev.push(now,1,tok.slice(8)); } }
      return true; }});
    Object.defineProperty(b,f,{value:true,enumerable:false,configurable:true}); b[key]=px; }
  function h(){ var P=window.Profiler,b=P&&P.buffers; if(b){ wrap(b,'calls','c');wrap(b,'returns','r');wrap(b,'events','v');
    wrap(b,'callBuffer','c');wrap(b,'returnBuffer','r');wrap(b,'eventBuffer','v'); } }
  setInterval(h,1); h();
  window.__stopped=function(){return window.$lzprofiler===null;};
  window.__cinit=function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){ window.__olmark('canvas-init'); return true; } }catch(e){} return false; };
  window.__analyze=function(){
    // phase boundaries are the app's __olmark()s + canvas-init only. First paint is a
    // BROWSER event (and the first one is the splash) — it belongs to browserprof, not here.
    var ev=window.__ev, marks=Object.assign({},window.__olmarks);
    var names=Object.keys(marks).sort(function(a,b){return marks[a]-marks[b];});
    var bounds=names.map(function(n){return marks[n];});
    var nph=bounds.length+1, self=[], cnt=[];
    for(var i=0;i<nph;i++){ self.push(Object.create(null)); cnt.push(Object.create(null)); }
    function phaseOf(t){ var i=0; while(i<bounds.length && t>=bounds[i]) i++; return i; }
    var st=[], pt=ev.length?ev[0]:0;
    for(var i=0;i<ev.length;i+=3){ var t=ev[i],e=ev[i+1],nm=ev[i+2];
      if(st.length){ var top=st[st.length-1], ph=phaseOf(pt); self[ph][top]=(self[ph][top]||0)+(t-pt); } pt=t;
      if(e===0){ var p2=phaseOf(t); cnt[p2][nm]=(cnt[p2][nm]||0)+1; st.push(nm); } else { if(st.length)st.pop(); } }
    return { marks:marks, phaseNames:names, self:self, cnt:cnt, events:ev.length/3 };
  };
})();`;

const b = await L({ executablePath: CHROME, headless: "new", userDataDir: "/tmp/lzp-" + label + "-" + Date.now(), args: ["--no-sandbox","--window-size=1000,700"] });
const p = await b.newPage(); await p.setViewport({ width: 1000, height: 700 });
await p.evaluateOnNewDocument(HOOK);
await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
// run until the profiler has stopped (canvas.init) AND given a moment for late marks + paint
for (let i = 0; i < 200; i++) {
  const s = await p.evaluate(() => ({ n: window.__ev ? window.__ev.length/3 : 0, stop: window.__stopped && window.__stopped(), ci: window.__cinit && window.__cinit() })).catch(() => ({ n:0 }));
  if (s.n > 2000 && (s.stop || s.ci)) break;
  await sleep(100);
}
await sleep(500);
const raw = await p.evaluate(() => window.__analyze());
await b.close();

// ── reduce to per-phase × per-category (node side, using the shared classifier) ──────────
const phases = raw.self.map((selfMap, i) => {
  const cntMap = raw.cnt[i];
  const C = {}, N = {};
  for (const k of Object.keys(selfMap)) { const c = categoryOf(k); C[c] = (C[c]||0) + selfMap[k]; }
  for (const k of Object.keys(cntMap))  { const c = categoryOf(k); N[c] = (N[c]||0) + cntMap[k]; }
  // phase i runs up to boundary i (phaseNames[i]); the last is "after <last mark>"
  const end = raw.phaseNames[i] || "(end)";
  const start = i === 0 ? "start" : raw.phaseNames[i-1];
  return { label: `${start} → ${end}`, end, self: C, calls: N,
           selfMs: Object.values(C).reduce((a,b)=>a+b,0), callTotal: Object.values(N).reduce((a,b)=>a+b,0) };
});
const out = { label, marks: raw.marks, events: raw.events, phases };
const dest = outJson || `/tmp/lzprof-${label}.json`;
fs.writeFileSync(dest, JSON.stringify(out, null, 1));

// ── print ────────────────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padStart(n);
console.log(`\n### ${label} — LZX runtime, segmented by timeline phase   (marks at ms: ${Object.entries(raw.marks).map(([k,v])=>k+"="+v.toFixed(0)).join("  ")})`);
for (const ph of phases) {
  if (ph.callTotal === 0) continue;
  console.log(`\n  PHASE  ${ph.label}   (${ph.callTotal.toLocaleString()} calls, ${ph.selfMs.toFixed(1)} ms instrumented)`);
  console.log("    category      self-ms   %time    calls   %calls");
  for (const c of ORDER) { if (!ph.calls[c] && !ph.self[c]) continue;
    console.log("    " + c.padEnd(12), pad((ph.self[c]||0).toFixed(1),8), pad(((ph.self[c]||0)/ph.selfMs*100).toFixed(1)+"%",7),
      pad(ph.calls[c]||0,8), pad(((ph.calls[c]||0)/ph.callTotal*100).toFixed(1)+"%",7)); }
}
console.log(`\n  → ${dest}`);
