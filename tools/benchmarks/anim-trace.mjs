// anim-trace.mjs — WHERE-TIME-GOES profiler for the calendar-stress year<->month expand transition.
//
//   node anim-trace.mjs <url> <label> [dpr]
//
// Drives the transition deterministically via the app's benchExpand(5)/benchCollapse() (NOT a mouse
// click, so it is jitter-free and reproducible), while capturing:
//   • a Chrome trace with the FULL rendering category set (devtools.timeline + .frame + cc + gpu +
//     v8.execute) → per-window main-thread task breakdown into style/layout/paint/composite AND the
//     off-main-thread compositor/raster/gpu work (cc,gpu).
//   • a continuous requestAnimationFrame cadence recorder → real per-frame interval, dropped-frame
//     count (an interval ≥ 1.5 vsync = ≥1 missed frame) over the ~750 ms transition.
//   • MEASUREMENT-ONLY runtime hooks (canvas kernel only): wrap LzSprite.__repaint to time each
//     full-scene repaint (perf.now before/after) and wrap LzSprite.__paintNode to COUNT the sprites
//     walked per repaint — ground truth for "the whole scene repaints every frame". The hooks call
//     the originals unchanged (like the app's own __olmark); they do not alter render behavior.
//   • DHTML: enumerate which DOM elements carry the animated inline transform/opacity (the 12 month
//     containers) so we can name exactly what moves.
//
// Prints one JSON blob. Written for headless SwiftShader — the gpu/cc numbers UNDERSTATE a real
// headed GPU (see the report's caveat).

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, label] = [process.argv[2], process.argv[3]];
const DPR = +(process.argv[4] || 2) || 2;
const VSYNC = 1000 / 60; // 16.67 ms

async function launch() { for (let i = 0; i < 8; i++) { try {
  return await pp.launch({ executablePath: CHROME, headless: "new", userDataDir: "/tmp/animtr-" + Date.now() + "-" + i,
    args: ["--no-sandbox", "--force-device-scale-factor=" + DPR, "--window-size=920,660"] });
} catch (e) { await sleep(1200); } } throw new Error("launch failed x8"); }

// ── trace category buckets ───────────────────────────────────────────────────────────────────
const STYLE = new Set(["UpdateLayoutTree", "RecalculateStyles", "ScheduleStyleRecalculation", "InvalidateLayout"]);
const LAYOUT = new Set(["Layout", "LayoutShift", "UpdateLayoutTree.Layout"]);
const PAINT = new Set(["Paint", "PaintImage", "DecodeImage", "Decode Image", "GPUTask"]);
const COMPOSITE = new Set(["CompositeLayers", "Commit", "UpdateLayer", "UpdateLayerTree", "Layerize", "PrePaint", "PaintImage"]);
function bucket(name) {
  if (name === "Layout") return "layout";
  if (STYLE.has(name)) return "style";
  if (name === "Paint" || name === "PaintImage") return "paint";
  if (COMPOSITE.has(name)) return "composite";
  return null;
}

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width: 920, height: 660, deviceScaleFactor: DPR });
await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
for (let i = 0; i < 400; i++) { const ok = await p.evaluate(() => typeof canvas !== "undefined" && canvas && canvas.isinited && canvas.yearview).catch(() => 0); if (ok) break; await sleep(50); }
await sleep(500);

// install measurement hooks + rAF cadence recorder BEFORE tracing
await p.evaluate((VSYNC) => {
  window.__ts = [];
  (function loop(t){ window.__ts.push(t); requestAnimationFrame(loop); })(performance.now());
  window.__mark = {};
  window.__markit = (n) => { window.__mark[n] = performance.now(); try { performance.mark("OL:" + n); } catch(e){} };
  // canvas kernel: time each full-scene repaint + count sprites walked per repaint (measurement only)
  window.__isCanvas = (typeof LzSprite !== "undefined" && !!LzSprite.__repaint);
  if (window.__isCanvas) {
    window.__repaints = [];            // {t, ms, nodes}
    window.__paintNodeCount = 0;
    const origPaintNode = LzSprite.__paintNode;
    LzSprite.__paintNode = function() { window.__paintNodeCount++; return origPaintNode.apply(this, arguments); };
    const origRepaint = LzSprite.__repaint;
    LzSprite.__repaint = function() {
      window.__paintNodeCount = 0;
      const a = performance.now();
      const r = origRepaint.apply(this, arguments);
      const z = performance.now();
      window.__repaints.push({ t: a, ms: +(z - a).toFixed(3), nodes: window.__paintNodeCount });
      return r;
    };
  }
}, VSYNC);

// ── start trace with the FULL rendering category set (incl cc / gpu off-main-thread) ─────────
await p.tracing.start({ categories: [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing", "toplevel", "v8.execute",
  "cc", "gpu", "viz",
  "disabled-by-default-cc.debug",
], screenshots: false });

// ── PHASE 1: EXPAND (June, idx 5) ────────────────────────────────────────────────────────────
await p.evaluate(() => window.__markit("expand-start"));
const t0 = await p.evaluate(() => { canvas.benchExpand(5); return performance.now(); });
await sleep(820);
await p.evaluate(() => window.__markit("expand-end"));
const t1 = await p.evaluate(() => performance.now());
const expandedOK = await p.evaluate(() => canvas.yearview.expandedGrid != null);

// snapshot which DOM elements carry animated transform/opacity (mid-collapse we re-check)
await sleep(150);

// ── PHASE 2: COLLAPSE (Year) ─────────────────────────────────────────────────────────────────
await p.evaluate(() => window.__markit("collapse-start"));
const t2 = await p.evaluate(() => { canvas.benchCollapse(); return performance.now(); });
await sleep(820);
await p.evaluate(() => window.__markit("collapse-end"));
const t3 = await p.evaluate(() => performance.now());
const collapsedOK = await p.evaluate(() => canvas.yearview.expandedGrid == null);

// DHTML: find the animated DOM elements (inline transform/opacity that changed during anim).
const dom = await p.evaluate(() => {
  if (window.__isCanvas) return { kernel: "canvas" };
  // The Declare/DHTML kernel renders each view as a positioned div. Count elements whose inline style
  // carries a transform (scale/translate) or a non-trivial opacity — the animated month containers.
  const all = Array.from(document.querySelectorAll("#appcontainer *"));
  let withTransform = 0, withOpacity = 0, totalDivs = 0;
  const samples = [];
  for (const el of all) {
    if (el.tagName === "DIV") totalDivs++;
    const s = el.style;
    const tr = s.transform || s.webkitTransform || "";
    if (/scale|matrix|translate/.test(tr)) { withTransform++; if (samples.length < 14) samples.push({ id: el.id || null, cls: el.className || null, transform: tr.slice(0, 60), opacity: s.opacity }); }
    if (s.opacity && s.opacity !== "" && s.opacity !== "1") withOpacity++;
  }
  return { kernel: "dhtml", totalDivs, withTransform, withOpacity, samples };
});

const marks = await p.evaluate(() => window.__mark);
const ts = await p.evaluate(() => window.__ts);
const repaints = await p.evaluate(() => window.__repaints || null);
const traceBuf = await p.tracing.stop();
await b.close();

// ── align trace clock to perf.now via OL: user_timing marks ──────────────────────────────────
const trace = JSON.parse(Buffer.from(traceBuf).toString("utf8"));
const evs = trace.traceEvents || [];
let offs = [];
for (const e of evs) { if (e.name && e.name.startsWith("OL:")) { const nm = e.name.slice(3); if (marks[nm] != null) offs.push(e.ts / 1000 - marks[nm]); } }
const offset = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
const toNav = (ts) => ts / 1000 - offset;

// gather main-thread RunTask (busy) + render sub-events + off-thread cc/gpu on the perf clock
const tasks = [], render = [], offthread = []; // offthread: {a,b,cat}
const OFF_CAT = { }; // name -> bucket for cc/gpu style events
for (const e of evs) {
  if (e.ph !== "X" || e.dur == null) continue;
  const a = toNav(e.ts), z = a + e.dur / 1000;
  if (e.name === "ThreadControllerImpl::RunTask") { tasks.push({ a, b: z }); continue; }
  const c = bucket(e.name); if (c) render.push({ a, b: z, cat: c });
  // off-main-thread compositor / raster / gpu work: events on cc/gpu/viz threads.
  const cat = e.cat || "";
  if (/(^|,)(cc|gpu|viz)(,|$)/.test(cat) || /RasterTask|ImageDecodeTask|GPUTask|SwapBuffers|Draw(Frame)?|Compositor|TileManager/.test(e.name)) {
    offthread.push({ a, b: z, name: e.name });
  }
}
const overlap = (s, e, a, z) => Math.max(0, Math.min(e, z) - Math.max(s, a));
tasks.sort((x, y) => x.a - y.a);
const busyIv = [];
for (const t of tasks) { const last = busyIv[busyIv.length - 1]; if (last && t.a <= last.b) last.b = Math.max(last.b, t.b); else busyIv.push({ a: t.a, b: t.b }); }
const sumBusy = (s, e) => busyIv.reduce((t, x) => t + overlap(s, e, x.a, x.b), 0);
const sumRender = (s, e) => { const o = { style: 0, layout: 0, paint: 0, composite: 0 }; for (const r of render) o[r.cat] += overlap(s, e, r.a, r.b); return o; };

// DrawFrame / BeginFrame markers as an independent frame counter within the trace
const drawFrames = evs.filter(e => /DrawFrame|BeginFrame|ActivateLayerTree|NeedsBeginFrameChanged/.test(e.name) && e.ph !== "M").map(e => toNav(e.ts));

function frameStats(a, b, label) {
  const f = ts.filter(t => t >= a && t <= b);
  const iv = [];
  for (let i = 1; i < f.length; i++) iv.push(f[i] - f[i - 1]);
  const s = iv.slice().sort((x, y) => x - y);
  const sum = s.reduce((x, y) => x + y, 0);
  const dropped = iv.filter(x => x >= VSYNC * 1.5).length;      // ≥1 missed vsync
  const droppedFrames = iv.reduce((n, x) => n + Math.max(0, Math.round(x / VSYNC) - 1), 0); // total missed vsyncs
  const r = sumRender(a, b), busy = sumBusy(a, b);
  const renderTot = r.style + r.layout + r.paint + r.composite;
  const js = Math.max(0, busy - renderTot);
  const dur = b - a;
  // per-frame breakdown (÷ frames rendered)
  const nf = Math.max(1, s.length);
  const rp = (repaints || []).filter(x => x.t >= a && x.t <= b);
  const rpMs = rp.map(x => x.ms).sort((x, y) => x - y);
  const rpNodes = rp.length ? rp[Math.floor(rp.length / 2)].nodes : null;
  return {
    phase: label, durMs: +dur.toFixed(0),
    framesRendered: s.length + 1,
    meanIntervalMs: s.length ? +(sum / s.length).toFixed(2) : null,
    medianIntervalMs: s.length ? +s[s.length >> 1].toFixed(2) : null,
    p95IntervalMs: s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(2) : null,
    longestIntervalMs: s.length ? +s[s.length - 1].toFixed(2) : null,
    effectiveFps: s.length ? +(1000 / (sum / s.length)).toFixed(1) : null,
    droppedIntervals: dropped, droppedFramesTotal: droppedFrames,
    mainThread: {
      busyMs: +busy.toFixed(1), jsMs: +js.toFixed(1),
      styleMs: +r.style.toFixed(1), layoutMs: +r.layout.toFixed(1),
      paintMs: +r.paint.toFixed(1), compositeMs: +r.composite.toFixed(1),
      idleMs: +Math.max(0, dur - busy).toFixed(1),
      busyPctOfWindow: +(100 * busy / dur).toFixed(1),
    },
    perFrameMainThread: {
      jsMs: +(js / nf).toFixed(2), styleMs: +(r.style / nf).toFixed(2),
      layoutMs: +(r.layout / nf).toFixed(2), paintMs: +(r.paint / nf).toFixed(2),
      compositeMs: +(r.composite / nf).toFixed(2),
      totalBusyMs: +(busy / nf).toFixed(2),
    },
    canvasRepaint: rp.length ? {
      count: rp.length,
      meanMs: +(rpMs.reduce((x, y) => x + y, 0) / rpMs.length).toFixed(2),
      medianMs: +rpMs[rpMs.length >> 1].toFixed(2),
      p95Ms: +rpMs[Math.min(rpMs.length - 1, Math.floor(rpMs.length * 0.95))].toFixed(2),
      maxMs: +rpMs[rpMs.length - 1].toFixed(2),
      spritesWalkedMedian: rpNodes,
    } : null,
  };
}

const out = {
  label, url, dpr: DPR, offsetMs: +offset.toFixed(0),
  expandedOK, collapsedOK,
  expandWindowMs: +(t1 - t0).toFixed(0), collapseWindowMs: +(t3 - t2).toFixed(0),
  expand: frameStats(t0, t1, "expand"),
  collapse: frameStats(t2, t3, "collapse"),
  dom,
  offthreadEventCount: offthread.length,
  drawFrameEvents: drawFrames.length,
};
const outPath = `/tmp/animtr-${label}.json`;
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
console.error("→ " + outPath);
