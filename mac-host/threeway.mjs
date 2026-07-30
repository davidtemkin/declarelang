// The same action, the same metric, all three renderers.
//
// ACTION: grab the Jot window's east resize strip and narrow it 400 → 200 over
// 2s (60 steps at 30Hz). The Jot is the only window that exists on all three —
// the canvas backend's `setEmbed` is a no-op, so the Viewer never mounts there —
// and it carries a Markdown body, so narrowing it past its measure forces a real
// re-wrap rather than a no-op.
//
// METRIC: identical rAF recorder in every environment. The native host furnishes
// requestAnimationFrame over CVDisplayLink, so the same three lines run in JSC
// as in the page, and the gaps mean the same thing: how long the main thread went
// between frames while the gesture was live.
//
// The native pump normally only runs a frame when the model asked for one, which
// would have made its gaps track the input rate rather than the display. The
// recorder removes that asymmetry by construction: because it re-requests every
// frame, it holds the pump open at vsync exactly as a browser does. Measured
// idle, native ticks ~126Hz under the recorder; headless Chrome ~120Hz. So both
// sides are reporting the same thing — how long the main thread went dark.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = process.env.DECLARE_ORIGIN ?? "http://127.0.0.1:8260";
const IN = "/tmp/declare-ctl.in", OUT = "/tmp/declare-ctl.out";
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const RECORDER = `globalThis.__fr = []; globalThis.__rec = function t(x){ globalThis.__fr.push(x); globalThis.__raf = requestAnimationFrame(t); }; globalThis.__raf = requestAnimationFrame(globalThis.__rec);`;
// `lost` is the only cross-renderer cost number that needs no engine-specific
// instrumentation: the time the gesture spent beyond a steady frame, summed.
const REPORT = `(function(){ var f = globalThis.__fr || []; var g = []; for (var i=1;i<f.length;i++) g.push(f[i]-f[i-1]); g.sort(function(a,b){return a-b}); var p=function(q){ return g.length ? g[Math.min(g.length-1, Math.floor(q*(g.length-1)))] : 0 }; var med=p(0.5); var over=g.filter(function(x){return x > med*2}).length; var lost=0; for (var k=0;k<g.length;k++) if (g[k] > med*1.25) lost += g[k]-med; return JSON.stringify({n:g.length, p50:+med.toFixed(1), p95:+p(0.95).toFixed(1), max:+(g[g.length-1]||0).toFixed(1), over:over, lost:+lost.toFixed(0)}); })()`;

// --doc measures the case that actually matters: a REAL document in the Markdown
// app (headings, prose, lists, code, tables) rather than the Jot's one short
// note. The two are not the same workload — a doc is many separate rich flows,
// and the native host rebuilds every one of them per frame.
const DOC = process.argv.includes("--doc");
const TARGET = DOC ? "ViewerWindow" : "JotWindow";
const STEPS = 60, HZ = 30, DX = DOC ? -280 : -200;
// Opened by the harness, not by clicking, so all three start from an identical
// window at an identical size with an identical document.
const OPEN = `(function(){ var a = window.__declare.find('app'); var c = a.wins.children||[]; for (var i=0;i<c.length;i++) if (c[i].constructor.name==='ViewerWindow') return 'already'; var w = a.createView('ViewerWindow', a.wins, ({path:'../../docs/declare.md', wx:120, wy:60, bornX:-1, bornY:-1, bornFrom:null})); a.frontOpen(w); return 'opened'; })()`;

// The east strip is +2 OUTSIDE the box (the halo); 2px inside is the `veil` and
// grabbing that does not resize. Mid-height, not the corner, so ONLY width moves
// and the measurement is of horizontal re-wrap alone.
const FINDJOT = `(function(){ var c=(window.__declare||globalThis.__declare).find('app.wins').children||[]; for (var i=0;i<c.length;i++){ var w=c[i]; if (w.constructor.name==='${TARGET}') return JSON.stringify([Math.round(w.x+w.width+2), Math.round(w.y+w.height/2), Math.round(w.width)]); } return 'null'; })()`;
const JOTW = `(function(){ var c=(window.__declare||globalThis.__declare).find('app.wins').children||[]; for (var i=0;i<c.length;i++){ if (c[i].constructor.name==='${TARGET}') return String(Math.round(c[i].width)); } return '0'; })()`;

// --headed runs a REAL Chrome window on the real display, so the browser numbers
// are not a headless floor: a live compositor, real vsync, real rasterization.
const HEADED = process.argv.includes("--headed");
const ONLY = process.argv.find((a) => /^--only=/.test(a))?.slice(7).split(",");

// ── native, through the control channel ─────────────────────────────────────
async function ctl(cmd) {
  if (existsSync(OUT)) unlinkSync(OUT);
  writeFileSync(IN, cmd + "\n");
  for (let i = 0; i < 300; i++) { await sleep(0.02); if (existsSync(OUT)) return readFileSync(OUT, "utf8").trim(); }
  throw new Error("native app did not answer");
}

async function runNative() {
  if (DOC) { await ctl(`eval ${OPEN}`); await sleep(4); }
  const j = JSON.parse(await ctl(`eval ${FINDJOT}`));
  if (j === null) return { mode: "native", error: TARGET + " not found" };
  const [x, y, w0] = j;
  await ctl("statsreset");
  await ctl(`eval ${RECORDER}; 'ok'`);
  await ctl(`dragsweep ${x} ${y} ${DX} ${STEPS} ${HZ}`);
  await sleep(STEPS / HZ + 3);
  const r = JSON.parse(await ctl(`eval ${REPORT}`));
  await ctl(`eval cancelAnimationFrame(globalThis.__raf); 'ok'`);
  const s = await ctl("stats");
  const w1 = Number(await ctl(`eval ${JOTW}`));
  // attribute the busy time the way the host counts it
  const num = (re) => { const m = s.match(re); return m ? Number(m[1]) : 0; };
  const costs = [
    ["Core Text re-wrap (richLayout)", num(/richLayout n=\d+ ([\d.]+)ms/)],
    ["overlay redraw + raster", num(/RichOverlay\.redraw n=\d+ [\d.]+ Mpx ([\d.]+)ms/) + num(/rasterMs total=([\d.]+)/)],
    ["op apply + CATransaction", num(/CATransaction\.commit total=([\d.]+)ms/)
      + [...s.matchAll(/opMs: (.*)/g)].flatMap((m) => [...m[1].matchAll(/=(\d+)ms/g)]).reduce((a, b) => a + Number(b[1]), 0)],
  ];
  return { mode: "native", ...r, w0, w1, costs };
}

// ── the browser renderers ───────────────────────────────────────────────────
async function runWeb(mode) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: !HEADED,
    args: ["--no-sandbox", "--force-device-scale-factor=2",
           ...(HEADED ? ["--window-size=1300,960", "--window-position=0,0"] : [])],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
  const p = await b.newPage();
  if (HEADED) await p.bringToFront();
  await p.goto(`${ORIGIN}/apps/desktop/desktop.declare?render=${mode}`, { waitUntil: "networkidle0" });
  await sleep(3.5);
  if (DOC) { await p.evaluate(OPEN); await sleep(4); }
  const j = JSON.parse(await p.evaluate(FINDJOT));
  if (j === null) { await b.close(); return { mode, error: TARGET + " not found" }; }
  const [x, y, w0] = j;
  await p.evaluate(RECORDER);
  // Chrome's own accounting, so the browsers get the same attribution the host
  // reports for itself: script / layout+style / paint, in that order.
  const m0 = await p.metrics();
  await p.mouse.move(x, y);            // a real mouse always hovers before pressing
  await p.mouse.down();
  for (let i = 1; i <= STEPS; i++) { await p.mouse.move(x + (DX * i) / STEPS, y); await sleep(1 / HZ); }
  await p.mouse.up();
  await sleep(1.5);
  const m1 = await p.metrics();
  const d = (k) => ((m1[k] ?? 0) - (m0[k] ?? 0)) * 1000;   // seconds → ms
  const r = JSON.parse(await p.evaluate(REPORT));
  const w1 = Number(await p.evaluate(JOTW));
  await b.close();
  // ⚠ the two browsers wrap text in DIFFERENT phases: the DOM backend hands the
  // text to the engine, so its wrap lands in Layout; the canvas backend wraps in
  // measureText from `flowRichCanvas`, so its wrap lands in Script.
  const costs = [
    ["script (runtime + canvas wrap)", d("ScriptDuration")],
    ["layout + style (DOM wrap)", d("LayoutDuration") + d("RecalcStyleDuration")],
    ["everything else on the task", d("TaskDuration") - d("ScriptDuration") - d("LayoutDuration") - d("RecalcStyleDuration")],
  ];
  return { mode, ...r, w0, w1, costs, task: d("TaskDuration") };
}

const want = (m) => !ONLY || ONLY.includes(m);
const rows = [];
if (want("native")) rows.push(await runNative());
if (want("dom")) rows.push(await runWeb("dom"));
if (want("canvas")) rows.push(await runWeb("canvas"));
const ms = (v) => v.toFixed(1) + "ms";
console.log(`\n  ${TARGET} narrowed ${-DX}px, ${STEPS} steps @ ${HZ}Hz — identical rAF recorder in all three\n`);
console.log("  renderer    frames    p50      p95      max     long*    lost†   resize");
console.log("  " + "─".repeat(74));
for (const r of rows) {
  if (r.error) { console.log(`  ${r.mode.padEnd(11)} ${r.error}`); continue; }
  console.log(`  ${r.mode.padEnd(11)} ${String(r.n).padStart(5)}  ${ms(r.p50).padStart(7)} ${ms(r.p95).padStart(8)} ${ms(r.max).padStart(8)} ${String(r.over).padStart(6)} ${String(r.lost + "ms").padStart(8)}   ${r.w0}→${r.w1}`);
}
console.log("\n  * frames whose gap exceeded 2x that renderer's own median");
console.log("  † total time beyond a steady frame, summed over the gesture\n");
console.log("  where the time went (each engine's own accounting, whole gesture)");
console.log("  " + "─".repeat(74));
for (const r of rows) {
  if (r.error) continue;
  console.log(`  ${r.mode}`);
  for (const [label, v] of r.costs) console.log(`      ${label.padEnd(34)} ${ms(v).padStart(9)}`);
}
console.log();
