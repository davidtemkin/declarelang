// browserprof.mjs — the BROWSER-side cost (Chrome's own work, invisible to the LZX
// profiler), segmented by the same timeline phases. Captures a DevTools trace and sums the
// rendering-pipeline events (Recalculate Style, Layout, Paint, Composite) per phase, plus
// page.metrics() totals (RecalcStyle/Layout/Script durations) and paint timing.
//
//   node browserprof.mjs <app-url-NO-?profile> <label> [outJson]
//
// Phase alignment: the benchmark app calls window.__olmark(n) which also emits
// performance.mark('OL:'+n). Those marks appear in the trace (blink.user_timing) with a
// trace-clock ts; matching them to the perf.now() values in window.__olmarks gives the
// offset to convert every trace event onto the app's timeline.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function L(o){ for(let i=0;i<8;i++){ try{ return await pp.launch(o);}catch(e){ await sleep(1200);} } throw new Error("launch x8"); }

const [url, label, outJson] = [process.argv[2], process.argv[3], process.argv[4]];
// HiDPI: CAP_DPR=2 forces deviceScaleFactor 2 (Retina), matching capture.mjs/interact.mjs/timeline.mjs.
const DPR = +(process.env.CAP_DPR || 1) || 1;
const HOOK = `(function(){ window.__olmarks={}; window.__olmark=function(n){ if(!(n in window.__olmarks)){ window.__olmarks[n]=performance.now(); try{performance.mark('OL:'+n);}catch(e){} } };
  window.__cinit=function(){ try{ if(typeof canvas!=='undefined'&&canvas&&canvas.isinited){ window.__olmark('canvas-init'); return true; } }catch(e){} return false; }; })();`;

// trace event name → rendering category
const CAT = { UpdateLayoutTree:"style", RecalculateStyles:"style", Layout:"layout",
  Paint:"paint", PaintImage:"paint", Rasterize:"paint", CompositeLayers:"composite", Commit:"composite",
  UpdateLayer:"composite", UpdateLayerTree:"composite" };
const ORDER = ["style","layout","paint","composite"];

const b = await L({ executablePath: CHROME, headless: "new", userDataDir: "/tmp/bp-" + label + "-" + Date.now(), args: ["--no-sandbox","--force-device-scale-factor=" + DPR,"--window-size=1000,700"] });
const p = await b.newPage(); await p.setViewport({ width: 1000, height: 700, deviceScaleFactor: DPR });
await p.evaluateOnNewDocument(HOOK);
const tracePath = "/tmp/bptrace-" + label + ".json";
await p.tracing.start({ path: tracePath, screenshots: false,
  categories: ["devtools.timeline","disabled-by-default-devtools.timeline","blink","blink.user_timing","cc","gpu","v8.execute"] });
await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
for (let i = 0; i < 200; i++) { const ci = await p.evaluate(() => window.__cinit && window.__cinit()).catch(() => false); if (ci) break; await sleep(50); }
await sleep(2500);                                                        // let it fully paint/settle
const marks = await p.evaluate(() => { const m = Object.assign({}, window.__olmarks);
  const fp = performance.getEntriesByType("paint").filter(x=>x.name==="first-paint")[0]; if (fp) m["first-paint"] = fp.startTime; return m; });
const metrics = await p.metrics();
await p.tracing.stop();

// ── align trace clock → perf.now() via the OL: user-timing marks ──────────────────────────
const trace = JSON.parse(fs.readFileSync(tracePath, "utf8")).traceEvents;
const offsets = [];
for (const e of trace) {
  const nm = (e.name||"").replace(/^OL:/, "");
  if (e.name && e.name.startsWith("OL:") && nm in marks) offsets.push(e.ts/1000 - marks[nm]);
}
const offset = offsets.length ? offsets.reduce((a,b)=>a+b,0)/offsets.length : 0;   // trace-ms − perf.now-ms
const toPerf = (ts) => ts/1000 - offset;

// phase boundaries (sorted marks)
const bnames = Object.keys(marks).sort((a,b)=>marks[a]-marks[b]);
const bounds = bnames.map(n=>marks[n]);
const phaseOf = (t) => { let i=0; while(i<bounds.length && t>=bounds[i]) i++; return i; };
const phases = []; for (let i=0;i<=bounds.length;i++) phases.push({});

let total = {};
for (const e of trace) {
  if (!e.dur || !CAT[e.name]) continue;
  const c = CAT[e.name], ph = phaseOf(toPerf(e.ts)), ms = e.dur/1000;
  phases[ph][c] = (phases[ph][c]||0) + ms; total[c] = (total[c]||0) + ms;
}

const out = { label, marks, metricsMs: { Script:+(metrics.ScriptDuration*1000).toFixed(1), RecalcStyle:+(metrics.RecalcStyleDuration*1000).toFixed(1),
  Layout:+(metrics.LayoutDuration*1000).toFixed(1), Task:+(metrics.TaskDuration*1000).toFixed(1), LayoutCount: metrics.LayoutCount, RecalcStyleCount: metrics.RecalcStyleCount },
  total, phases: phases.map((ph,i)=>({ label: (i===0?"start":bnames[i-1]) + " → " + (bnames[i]||"(end)"), render: ph })) };
fs.writeFileSync(outJson || `/tmp/browserprof-${label}.json`, JSON.stringify(out,null,1));
await b.close();

const pad=(s,n)=>String(s).padStart(n);
console.log(`\n### ${label} — browser pipeline (trace), segmented by phase   offset=${offset.toFixed(1)}ms, ${offsets.length} mark-anchors`);
console.log(`  totals(ms): style ${(total.style||0).toFixed(1)}  layout ${(total.layout||0).toFixed(1)}  paint ${(total.paint||0).toFixed(1)}  composite ${(total.composite||0).toFixed(1)}   |  first-paint @${(marks["first-paint"]||0).toFixed(0)}ms`);
console.log(`  page.metrics: Script ${out.metricsMs.Script}  RecalcStyle ${out.metricsMs.RecalcStyle} (${out.metricsMs.RecalcStyleCount}×)  Layout ${out.metricsMs.Layout} (${out.metricsMs.LayoutCount}×)`);
for (const ph of out.phases) { const sum=ORDER.reduce((a,c)=>a+(ph.render[c]||0),0); if(sum<0.05) continue;
  console.log(`  ${ph.label.padEnd(34)} ` + ORDER.map(c=>c+" "+(ph.render[c]||0).toFixed(1)).join("  ")); }
console.log(`  → ${outJson || `/tmp/browserprof-${label}.json`}`);
