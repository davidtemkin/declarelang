// rasterbench — what a drawing actually costs, per engine.
//
//   node tools/rasterbench.mjs                              # every probe, Chrome, both renderers
//   node tools/rasterbench.mjs --probe size --engines chrome,safari
//   node tools/rasterbench.mjs --renderers canvas --json out.json
//
// NOT A GATE. Nothing here has a baseline, a verdict, or a pass/fail — it
// produces curves, and a curve is read by a person. It is committed because the
// alternative is re-deriving the rig every time the question comes back, which
// is what happened to the last Safari measurement.
//
// ── why the metrics are what they are ─────────────────────────────────────
//
// The three engines do not present pixels the same way, so no single number is
// comparable across them and the tool refuses to pretend otherwise:
//
//   WebKit, SOFTWARE-backed — the 2D canvas is DEFERRED. Draw calls only
//             record; rasterization is forced lazily at the first pixel read,
//             so `flushMs` (a ONE-PIXEL readback) is the real rendering cost
//             and a 1x1 read costs the same as a full one.
//   WebKit, GPU-backed — ⚠ THE READBACK DOES NOT FORCE ANYTHING. Measured
//             2026-08-23: real Safari returns flushMs 0-5ms flat across an 89x
//             range of painted pixels, and 0ms on a 395MB canvas, where the
//             off-screen WKWebView harness on the SAME probe read 113-178ms.
//             The harness is getting a software backing; Safari.app is not.
//             So flushMs measures software raster only, and a flat flushMs is
//             NOT evidence that a scene is cheap — see `ink` below.
//   Blink   — eager GPU raster, presented without a readback. `flushMs` is ~0
//             there and means nothing; the cost shows up as frame cadence, or
//             nowhere at all because the GPU absorbed it.
//   Mac     — not driven from here (no WebDriver). Its own instruments are
//             `ctl statsreset` / `stats`, plus describedN / rasterizedN /
//             rasterPxNodes in LayerTree.swift.
//
// So every sample reports BOTH `flushMs` and the frame cadence, and each
// engine's own median is its baseline. Read down a column, never across.
//
// `bytes` — the total backing store of every <canvas> on the page — is the one
// number that IS comparable, because it is an allocation rather than a timing.
// It is the whole answer to the extent probe.
//
// ⚠ STANDING CAVEAT, 2026-08-23: flushMs DOES NOT MEASURE RASTERIZATION WORK.
// The coverage probe's own calibration point says so — one full-surface
// translucent fill reads 5ms and 4096 of them read 259ms, which is 52x the time
// for 4096x the work, on marks that must be composited and cannot legally be
// dropped. Whatever the readback forces, it is not proportional to painting.
// So no cost MODEL may be drawn from these columns yet. What the rig does
// measure honestly: `bytes` and `maxDim` (allocations), `ink` (did it paint at
// all), `filter` (a capability), `drive` (is the sweep live), and cadence on an
// engine that has a display. Fixing this needs a different instrument for
// raster, not a wider sweep of this one.
//
// `ink` — the share of sampled points that are not transparent. The one metric
// that catches a failure NO timing can see: past its total canvas budget Safari
// draws TRANSPARENT canvases, and a scene that painted nothing is fast and
// wrong. A 0% ink reading beside a 0ms flush is not a fast frame, it is a blank
// one, and the two are indistinguishable by every other column here.
//
// ── two traps this rig has to dodge ───────────────────────────────────────
//
// HEADLESS CHROME RASTERIZES ON SWIFTSHADER, not the GPU. Every raster number
// it produces is a software number wearing Blink's name. So this launches
// HEADED by default; `--headless` exists for structural runs only and says so
// loudly. (Mesa learned this the expensive way — a shadow-semantics bug that
// every headless pixel harness waved through.)
//
// READBACK CAN CHANGE THE THING IT MEASURES: repeated getImageData can move a
// canvas to a software backing in some engines. So each sample point navigates
// FRESH rather than re-driving a warm page.
import http from "node:http";
import path from "node:path";
import { writeFileSync, existsSync, unlinkSync, statSync, readFileSync, mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the sweeps ────────────────────────────────────────────────────────────
//
// Each probe states one authored shape; each sweep drives ONE knob across it
// and holds the rest still, so a curve has a single independent variable.

const PROBES = {
  coverage: {
    file: "test/probe/raster-coverage.declare",
    drive: "static",
    // The two sweeps run the SAME op counts and differ only in what each mark
    // covers — 0.05 of the view against all of it, a 400x separation in painted
    // pixels at identical list length. Span stays <= 1 deliberately: a mark
    // larger than its view grows the RECORDING's bounds, which grows the canvas,
    // which would put an allocation change inside a coverage experiment.
    sweeps: [
      // ops = 1 is the CALIBRATION point: one full-surface fill is a known
      // quantity, so the marginal cost per added cover is readable off the
      // curve. A 4096-cover row that does not cost ~4096x the 1-cover row is
      // not painting what it claims to, whatever the ratio between sweeps says.
      { name: "span 0.05 — marks tile", hold: { span: 0.05 }, axis: "ops", values: [1, 64, 256, 1024, 4096] },
      { name: "span 1.00 — marks cover", hold: { span: 1.0 }, axis: "ops", values: [1, 64, 256, 1024, 4096] },
    ],
  },
  // THE OP-KIND SWEEP — the cost model has two constants per kind (per-op and
  // per-pixel) and both were placeholders. Same span, same alpha, same op
  // counts; only WHAT each mark is changes. Under Chrome tracing the paint
  // column is the calibrated cost; on the other engines the cadence column is.
  kinds: {
    file: "test/probe/raster-coverage.declare",
    drive: "static",
    sweeps: ["fill", "gradient", "stroke", "text", "shadow"].map((kind) => (
      { name: `kind ${kind}`, hold: { kind, span: 0.25 }, axis: "ops", values: [1, 256, 1024] }
    )),
  },
  // the same kinds at a SMALL mark (span 0.06 → ~8k device px per op against
  // ~135k at 0.25): two spans separate a kind's per-op term from its per-pixel
  // term, which one span bundles into a single slope
  "kinds-small": {
    file: "test/probe/raster-coverage.declare",
    drive: "static",
    sweeps: ["fill", "gradient", "stroke", "text", "shadow"].map((kind) => (
      { name: `kind ${kind} (small)`, hold: { kind, span: 0.06 }, axis: "ops", values: [1, 256, 1024] }
    )),
  },
  // the size probe on the WEIGHT axis — the one that loads an engine that
  // ignores ctx.filter (Safari), where the blur axis is inert; weight 16 is
  // wallpaper class (five full-surface washes over a 1920x1200 box measured
  // ~24 ms per flush on Safari in 2026-08)
  "size-weight": {
    file: "test/probe/raster-size.declare",
    drive: "resize",
    sweeps: [
      { name: "resize, live — weight", hold: { mode: "live", blur: 0 }, axis: "weight", values: [3, 8, 16, 32] },
      { name: "resize, ref  — weight", hold: { mode: "ref", blur: 0 }, axis: "weight", values: [3, 8, 16, 32] },
    ],
  },
  size: {
    file: "test/probe/raster-size.declare",
    drive: "resize",
    sweeps: [
      { name: "resize, live (reads its own size)", hold: { mode: "live", weight: 3 }, axis: "blur", values: [0, 8, 24, 48] },
      { name: "resize, ref  (fixed box + scale)", hold: { mode: "ref", weight: 3 }, axis: "blur", values: [0, 8, 24, 48] },
      // the store, isolated: identical content, identical resize, only the
      // reference box's size changes — the recording never re-records in ref
      // mode, so any cost that scales with this is the cost of holding and
      // presenting a bigger texture under a changing transform, nothing else
      { name: "resize, ref  — backing size", hold: { mode: "ref", weight: 3, blur: 0 }, axis: "refScale", values: [0.5, 1, 2] },
    ],
  },
  extent: {
    file: "test/probe/raster-extent.declare",
    drive: "scroll",
    sweeps: [
      { name: "extent, document-tall", hold: { pinned: false }, axis: "k", values: [1, 4, 16, 48] },
      { name: "extent, pinned", hold: { pinned: true }, axis: "k", values: [1, 4, 16, 48] },
    ],
  },
};

// ── the in-page half ──────────────────────────────────────────────────────
//
// One expression, evaluated the same way in both engines. Kept as a string
// because Safari's WebDriver takes a script body, not a function reference.

const AGENT = `(async () => {
  const PHASE = "__PHASE__";
  const app = window.__app;
  // An off-screen view never gets a frame callback, so the agent cannot depend
  // on one: this is a frame request where there is a display, and a task turn
  // where there is not — enough for the runtime to settle and for the DOM
  // backend to re-rasterize, which it does synchronously on setDrawing rather
  // than on a frame.
  const raf = () => __TICK__;
  const canvases = () => Array.from(document.querySelectorAll("canvas"));
  const bump = () => { app.tick = (app.tick || 0) + 1; };
  // one pixel from each canvas. On a deferred rasterizer this forces the whole
  // flush and IS the render cost; on an eager one it is a GPU sync and noise.
  const flush = () => {
    const t = performance.now();
    for (const c of canvases()) {
      try { const g = c.getContext("2d"); if (g) g.getImageData(0, 0, 1, 1); } catch (e) { /* tainted or lost */ }
    }
    return performance.now() - t;
  };

  if (PHASE === "drive") { for (const [k, v] of Object.entries(KNOBS)) app[k] = v; await raf(); await raf(); }

  // TWO PASSES, because the two metrics corrupt each other. A readback is a GPU
  // sync on Blink, so taking one every step would poison the very cadence it is
  // sitting next to; and a single flush at the END cannot see a cost that is
  // paid per frame (a resize re-records every step — that is the whole point of
  // the size probe). So: cadence with no readback, then flush with one per step.

  const gaps = [];
  if (PHASE === "drive" && !NOCADENCE) {
    let last = performance.now();
    for (let i = 0; i < STEPS; i++) {
      DRIVE_STEP;
      await raf();
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }
  }

  let flushTotal = 0, flushMax = 0;
  if (PHASE === "drive" && !NOFLUSH) {
    for (let i = 0; i < STEPS; i++) {
      DRIVE_STEP;
      bump();
      await raf();
      const f = flush();
      flushTotal += f;
      if (f > flushMax) flushMax = f;
    }
  }

  // Does this engine honour ctx.filter at all? WebKit was measured ACCEPTING
  // the assignment (it reads back verbatim, as a plain expando) and then
  // painting unfiltered — so the only honest test is whether a blurred rect
  // bleeds past its own edge. Free to carry here, and it means no result can
  // quietly assume a filter cost that was never incurred.
  if (PHASE === "drive") {
    const sorted0 = gaps.slice().sort((a, b) => a - b);
    const at0 = (q) => sorted0.length ? sorted0[Math.min(sorted0.length - 1, Math.floor(sorted0.length * q))] : 0;
    const r20 = (x) => Math.round(x * 100) / 100;
    return { flushMs: r20(flushTotal), flushMax: r20(flushMax),
             p50: NOCADENCE ? null : r20(at0(0.5)), p95: NOCADENCE ? null : r20(at0(0.95)) };
  }
  // ── the CHECKS phase: everything below reads the canvas back ──
  // DOES THE DRIVE ACTUALLY DRIVE? Every timing here assumes each step causes a
  // fresh recording and a fresh raster. Nothing verified that, and a probe whose
  // knob is inert reports flat numbers that read exactly like "this engine is
  // fast". So: sample a pixel, perturb, sample again. If the two agree, the
  // sweep measured an unchanging scene and every column below is meaningless.
  let driveWorks = null;
  try {
    // a spread of points, not one: a sparse scene leaves the centre empty, and
    // a single sample there reports INERT for a drive that is working fine
    const px = () => {
      const out = [];
      for (const c of canvases()) {
        const g = c.getContext("2d");
        if (!g) continue;
        // BLOCKS at irregular offsets. A regular grid of point samples ALIASES
        // against a regular scene: measured 2026-08-23, a 64-mark lattice on a
        // 122px pitch fell entirely between 4 evenly spaced probes and reported
        // INERT for a drive that was working. Blocks cannot fall between marks,
        // and the offsets are chosen not to share a factor with the scene.
        const B = 37;
        for (const [fx, fy] of [[0.13, 0.17], [0.41, 0.63], [0.71, 0.29], [0.89, 0.83]]) {
          const x = Math.min(Math.max(0, c.width - B), Math.floor(fx * c.width));
          const y = Math.min(Math.max(0, c.height - B), Math.floor(fy * c.height));
          const w = Math.min(B, c.width), h = Math.min(B, c.height);
          if (w < 1 || h < 1) continue;
          const d = g.getImageData(x, y, w, h).data;
          let acc = 0;
          for (let i = 0; i < d.length; i += 4) acc = (acc + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + d[i + 3] * 11) | 0;
          out.push(acc);
        }
      }
      return out.join("|");
    };
    const before = px();
    if ("__DRIVE__" === "scroll-app") { app.scrollY = 0; await raf(); await raf(); app.scrollY = Math.max(0, app.height - (app.hostHeight || window.innerHeight)) * 0.5; }
    else bump();
    await raf(); await raf();
    driveWorks = px() !== before;
  } catch (e) { driveWorks = null; }

  // Did anything actually get painted? Sampled on a coarse grid rather than
  // read whole — a 1800x57602 canvas cannot be pulled into a typed array, and
  // the question is only "is there content", not "which content".
  let inkPct = null;
  try {
    let seen = 0, lit = 0;
    for (const c of canvases()) {
      const g = c.getContext("2d");
      if (!g) continue;
      // BLOCKS, not points: a hairline lattice on a 32px pitch is almost never
      // under a point sample, and "0% ink" would then mean "I sampled between
      // the lines", not "nothing painted". A block asks the question the metric
      // is actually for — is there content in this neighbourhood.
      // the block scales with dpr: a lattice on a 32-CSS-px pitch is 96 device
      // px apart at dpr 3, and a fixed 40 px block then sits between the lines
      // on a scene that painted — measured on the iOS Simulator, ink 0% on
      // pinned rows the extent metric showed as fully allocated and drawn
      const B = Math.round(40 * (window.devicePixelRatio || 1));
      for (let gx = 0; gx < 4; gx++) {
        for (let gy = 0; gy < 4; gy++) {
          const x = Math.min(Math.max(0, c.width - B), Math.floor((gx + 0.5) * c.width / 4 - B / 2));
          const y = Math.min(Math.max(0, c.height - B), Math.floor((gy + 0.5) * c.height / 4 - B / 2));
          const w = Math.min(B, c.width), h = Math.min(B, c.height);
          if (w < 1 || h < 1) continue;
          seen++;
          const d = g.getImageData(x, y, w, h).data;
          for (let i = 3; i < d.length; i += 4) { if (d[i] !== 0) { lit++; break; } }
        }
      }
    }
    inkPct = seen ? Math.round((lit / seen) * 100) : null;
  } catch (e) { inkPct = null; }

  let filterWorks = null;
  try {
    const fc = document.createElement("canvas"); fc.width = 200; fc.height = 200;
    const fg = fc.getContext("2d");
    fg.filter = "blur(20px)";
    fg.fillStyle = "#fff";
    fg.fillRect(80, 80, 40, 40);
    filterWorks = fg.getImageData(60, 100, 1, 1).data[3] > 0;
  } catch (e) { filterWorks = null; }

  const cs = canvases();
  const sorted = gaps.slice().sort((a, b) => a - b);
  const at = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    // the whole gesture's rasterization, and its worst single frame
    flushMs: r2(flushTotal),
    flushMax: r2(flushMax),
    p50: NOCADENCE ? null : r2(at(0.5)),
    p95: NOCADENCE ? null : r2(at(0.95)),
    canvases: cs.length,
    bytes: cs.reduce((a, c) => a + c.width * c.height * 4, 0),
    maxDim: cs.reduce((a, c) => Math.max(a, c.width, c.height), 0),
    // reported, never assumed: an engine driven without a screen may be at 1x,
    // and a 1x measurement is not comparable with a 2x one
    dpr: window.devicePixelRatio || 1,
    filterWorks: filterWorks,
    ink: inkPct,
    drive: driveWorks,
    memo: (globalThis.__declareRasterStats ? globalThis.__declareRasterStats() : null),
  };
})()`;

const DRIVES = {
  // a static shape: perturb the recording so each frame really re-paints
  static: "bump()",
  // resize is driven from OUTSIDE the page (the viewport is the driver's), and
  // the step here is NOTHING — the resize is the whole stimulus. ⚠ It used to
  // be bump(), and that defeated the probe: `ref` mode's draw body reads
  // app.tick, so every step re-recorded and re-rasterized the fixed reference
  // box, which is precisely what the workaround exists to avoid. Measured that
  // way, ref "lost" to live by 2x on Chrome DOM, and will-change: transform
  // changed nothing — because the cost was our own per-frame re-raster of a
  // 14.6 MB canvas, not the compositor. A finding was committed on it and had
  // to be withdrawn (2026-08-25). A drive that touches what it measures is not
  // a drive.
  resize: "",
  // scroll the page's own declared offset — a settable attribute, so this is
  // the same gesture on every renderer rather than a per-backend wheel event
  scroll: "app.scrollY = (i / STEPS) * (app.height * (app.k - 1))",
  // a real app: sweep the root's scroll range as a person would, top to bottom
  // and back, so both directions and both ends are in the window
  "scroll-app": "app.scrollY = Math.max(0, (app.height - (app.hostHeight || window.innerHeight))) * (0.5 - 0.5 * Math.cos((i / STEPS) * 2 * Math.PI))",
};

function agentFor(drive, knobs, steps, noCadence = false, phase = "drive") {
  return AGENT
    .replace("__PHASE__", phase)
    .replace(/DRIVE_STEP;/g, DRIVES[drive] + ";")
    .replace(/__DRIVE__/g, drive)
    .replace("__TICK__", noCadence
      ? "new Promise((r) => setTimeout(r, 0))"
      : "new Promise((r) => requestAnimationFrame(r))")
    .replace(/NOCADENCE/g, String(noCadence))
    // a resize probe measures whether the recording re-records under the
    // gesture; a flush pass that bumps the recording per step would answer
    // "yes" for every mode and pollute the trace with its own re-rasters
    .replace(/NOFLUSH/g, String(drive === "resize"))
    .replace(/STEPS/g, String(steps))
    .replace("KNOBS", JSON.stringify(knobs));
}

// ── engines ───────────────────────────────────────────────────────────────

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// Chrome's own tracing — the only instrument here that watches the RASTERIZER
// rather than asking the page. Every in-page signal is either absorbed by the
// GPU or decoupled from painting (see the standing caveat above); the raster
// threads and the GPU process, by contrast, report what they actually did.
//
// Categories are the DevTools timeline set plus cc/gpu, because 2D canvas work
// on Blink happens in the GPU process and never appears on the renderer's main
// thread at all. Names are NOT filtered to a guessed allow-list: the totals are
// grouped by event name and the biggest are reported, so the meter can tell us
// which event matters instead of us telling it.
const TRACE_CATEGORIES = [
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "cc", "gpu", "benchmark", "viz",
  "disabled-by-default-gpu.service",
];

function summarizeTrace(json) {
  const evs = json.traceEvents ?? [];
  // process/thread names arrive as metadata events, so a duration can be
  // attributed to "the GPU process" rather than to a bare tid
  const procName = new Map();
  for (const e of evs) {
    if (e.ph === "M" && e.name === "process_name") procName.set(e.pid, e.args?.name ?? "");
  }
  const byName = new Map();
  let gpuUs = 0, rasterUs = 0, paintUs = 0;
  for (const e of evs) {
    if (e.ph !== "X" || typeof e.dur !== "number") continue;
    byName.set(e.name, (byName.get(e.name) ?? 0) + e.dur);
    if ((procName.get(e.pid) ?? "").includes("GPU")) gpuUs += e.dur;
    if (e.name === "RasterTask" || e.name === "RasterizerTaskImpl::RunOnWorkerThread") rasterUs += e.dur;
    // Measured 2026-08-24: for a DOM <canvas> this is where the drawing's cost
    // actually lands — the renderer main thread updating layers at commit, NOT
    // cc's RasterTask (which reads 0-1ms no matter how much is painted).
    if (e.name === "LayerTreeHost::DoUpdateLayers") paintUs += e.dur;
  }
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([n, us]) => `${n}:${(us / 1000).toFixed(0)}`);
  return { paintMs: Math.round(paintUs / 1000), gpuMs: Math.round(gpuUs / 1000),
           rasterMs: Math.round(rasterUs / 1000), top };
}

async function chromeEngine({ headless }) {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless,
    args: ["--no-sandbox"],
    defaultViewport: { width: 900, height: 600, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  if (willChange) {
    await page.evaluateOnNewDocument(`(() => {
      const st = document.createElement("style");
      // BOTH the transformed view and the drawing canvas inside it: promoting
      // only the view leaves the canvas as content rasterized INTO that layer's
      // tiles at every new scale (measured: no change). The canvas as its own
      // layer is what makes a transform a pure compositor scale of a texture.
      st.textContent = '[style*="scale("], [style*="rotate("], canvas { will-change: transform; }';
      (document.head || document.documentElement).appendChild(st);
    })()`);
  }
  return {
    name: (headless ? "chrome (HEADLESS — SwiftShader, not the GPU)" : "chrome") + (willChange ? " + will-change" : ""),
    async goto(url) {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
      await page.waitForFunction("window.__app != null", { timeout: 30000 });
      await sleep(350);
    },
    async resize(w, h) { await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); },
    async runUntraced(src) { return await page.evaluate(src); },
    async run(src) {
      if (!trace) return await page.evaluate(src);
      const out = path.join(TRACE_DIR, `t-${traceN++}.json`);
      await page.tracing.start({ path: out, screenshots: false, categories: TRACE_CATEGORIES });
      const r = await page.evaluate(src);
      await page.tracing.stop();
      try { return { ...r, ...summarizeTrace(JSON.parse(readFileSync(out, "utf8"))) }; }
      finally { try { unlinkSync(out); } catch { /* keep going */ } }
    },
    async close() { await browser.close(); },
  };
}

// iOS Simulator Safari, through the same safaridriver, with the capabilities
// that boot a simulator and attach to its Safari. Its WebKit is iOS WebKit —
// the feature flags, the per-canvas area cap (16.7 MP on the iOS 18 tier, the
// safe floor the caps in draw.ts keep to), the memory policy, and the failure
// past budget (transparent canvases) are all the device's. Its TIMINGS are not:
// the simulator runs on the Mac's GPU and CPU, so cadence there is indicative
// only. Right rig for correctness and ceilings; not for numbers.
async function simulatorEngine() {
  // Boot the device FIRST. safaridriver will boot one itself, but its session
  // timeout is shorter than a cold simulator boot — measured 2026-08-25: "The
  // session timed out while waiting" on the first attempt, every time. A
  // booted device attaches in seconds.
  const list = spawnSync("xcrun", ["simctl", "list", "devices", "available", "-j"], { encoding: "utf8" });
  const devices = Object.values(JSON.parse(list.stdout || "{}").devices ?? {}).flat();
  const pick = devices.find((d) => /iPhone 16 Pro$/.test(d.name)) ?? devices.find((d) => /iPhone/.test(d.name));
  if (pick) {
    if (pick.state !== "Booted") {
      console.log(`  booting ${pick.name} …`);
      spawnSync("xcrun", ["simctl", "boot", pick.udid], { stdio: "ignore" });
      for (let i = 0; i < 90; i++) {
        await sleep(2000);
        const st = spawnSync("xcrun", ["simctl", "list", "devices", "-j"], { encoding: "utf8" });
        const d = Object.values(JSON.parse(st.stdout || "{}").devices ?? {}).flat().find((x) => x.udid === pick.udid);
        if (d?.state === "Booted") break;
      }
      await sleep(8000);   // SpringBoard needs a beat after "Booted" before Safari can be driven
    }
  }
  // platformName is REQUIRED alongside the simulator flag — without it
  // safaridriver answers "The 'macOS' platform is not supported" (2026-08-25)
  return await safariEngine({ platformName: "iOS", "safari:useSimulator": true, "safari:deviceType": "iPhone" }, "ios-simulator (Safari on iOS WebKit — caps and capability; timings are Mac-hosted)");
}

// safaridriver speaks plain W3C WebDriver over HTTP — no client library, and
// none is wanted: the whole protocol surface used here is five calls.
async function safariEngine(extraCaps = {}, label = "safari") {
  const port = 4680 + Math.floor(process.pid % 200);
  const proc = spawn("safaridriver", ["--port", String(port)], { stdio: "ignore" });
  await sleep(1200);
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await res.json();
    if (j.value && j.value.error) throw new Error(`${j.value.error}: ${j.value.message}`);
    return j.value;
  };
  let session;
  try {
    session = await call("POST", "/session", { capabilities: { alwaysMatch: extraCaps } });
  } catch (err) {
    proc.kill();
    throw new Error(
      `safaridriver refused a session (${err.message}).\n` +
      `  Enable Safari ▸ Settings ▸ Advanced ▸ "Show features for web developers",\n` +
      `  then Develop ▸ Allow Remote Automation, and run 'safaridriver --enable' once.`);
  }
  const sid = session.sessionId;
  await call("POST", `/session/${sid}/timeouts`, { script: 120000 });
  if (yieldFocus) {
    // Safari is up; give the front back. Whether the numbers survive that is
    // the experiment — an OCCLUDED window is throttled, and a throttled window
    // reports cadence that looks like a finding and is an artifact.
    spawn("osascript", ["-e", 'tell application "Finder" to activate'], { stdio: "ignore" });
    await sleep(600);
  }
  const simulator = extraCaps["safari:useSimulator"] === true;
  return {
    name: label,
    // a simulator has no resizable window; the resize probe cannot be driven there
    noResize: simulator,
    async goto(url) {
      await call("POST", `/session/${sid}/url`, { url });
      // no networkidle in W3C — poll for the app the same way the page would
      for (let i = 0; i < 120; i++) {
        const ok = await call("POST", `/session/${sid}/execute/sync`, { script: "return window.__app != null", args: [] });
        if (ok) break;
        await sleep(250);
      }
      await sleep(350);
    },
    async resize(w, h) { if (!simulator) await call("POST", `/session/${sid}/window/rect`, { width: w, height: h + 80 }); },
    async run(src) {
      const wrapped =
        `var done = arguments[arguments.length - 1];` +
        `(${src}).then(function (v) { done(v); }, function (e) { done({ error: String(e) }); });`;
      const out = await call("POST", `/session/${sid}/execute/async`, { script: wrapped, args: [] });
      if (out && out.error) throw new Error(out.error);
      return out;
    },
    async close() {
      try { await call("DELETE", `/session/${sid}`); } catch { /* already gone */ }
      proc.kill();
    },
  };
}

// Firefox, through puppeteer's WebDriver BiDi support. In-page metrics only —
// there is no CDP trace, so the raster meter is absent; Gecko rasterizes
// eagerly on the CPU (Mesa's finding), so its cost shows up in CADENCE, and
// that column is honest here. The Gecko Profiler (MOZ_PROFILER_STARTUP) is the
// raster meter for a later adapter.
async function firefoxEngine() {
  const bin = ["/Applications/Firefox.app/Contents/MacOS/firefox"].find(existsSync);
  if (!bin) throw new Error("no Firefox at /Applications/Firefox.app");
  const browser = await puppeteer.launch({
    browser: "firefox", executablePath: bin, headless: false,
    defaultViewport: { width: 900, height: 600, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  return {
    name: "firefox (no trace — cadence and in-page only)",
    async goto(url) {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
      await page.waitForFunction("window.__app != null", { timeout: 30000 });
      await sleep(350);
    },
    async resize(w, h) { await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); },
    async run(src) { return await page.evaluate(src); },
    async close() { await browser.close(); },
  };
}

// WebKit with no browser on screen — mac-host/webkitprobe, a WKWebView that
// never activates. Sound because WebKit's flush is forced by the readback and
// not by presentation, so an off-screen view rasterizes identically. What it
// cannot give is frame cadence (no display to pace it), so those fields are
// blanked rather than reported as zeros.
async function webkitEngine() {
  // Build when missing OR older than its source. A stale native binary that
  // still runs is this repo's most reliable way to measure last week's code and
  // believe it was this week's.
  const bin = path.join(ROOT, "mac-host", "webkitprobe");
  const src = bin + ".swift";
  const stale = !existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs;
  if (stale) {
    console.log("  building mac-host/webkitprobe …");
    const r = spawnSync("swiftc", ["-O", src, "-o", bin], { stdio: ["ignore", "ignore", "pipe"] });
    if (r.status !== 0) throw new Error("swiftc failed: " + String(r.stderr).trim().split("\n").slice(-3).join(" "));
  }
  const scratch = path.join(ROOT, "mac-host", ".webkitprobe-agent.js");
  let pending = null;         // the URL the next run() should load
  let viewport = { w: 900, h: 600 };
  let sweepResize = false;    // set by the caller for a resize-driven probe
  return {
    name: "webkit (WKWebView, off-screen — flush only, no cadence)",
    noCadence: true,
    async goto(url) { pending = url; },
    async resize(w, h) { viewport = { w, h }; },
    // the resize GESTURE cannot be driven from out here: the probe is a
    // one-shot process, so it has to sweep its own frame while the agent runs
    setResizeDrive(on) { sweepResize = on; },
    async run(src) {
      writeFileSync(scratch, src);
      const out = await new Promise((resolve, reject) => {
        const spawnArgs = [pending, scratch, `${viewport.w}x${viewport.h}`];
        if (sweepResize) spawnArgs.push("resize");
        const p = spawn(bin, spawnArgs, { stdio: ["ignore", "pipe", "pipe"] });
        let so = "", se = "";
        p.stdout.on("data", (d) => (so += d));
        p.stderr.on("data", (d) => (se += d));
        p.on("close", (code) => (code === 0 ? resolve(so.trim()) : reject(new Error(se.trim() || `exit ${code}`))));
      });
      return JSON.parse(out);
    },
    async close() { try { unlinkSync(scratch); } catch { /* never written */ } },
  };
}

// ── the run ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes("--" + name);

const engines = flag("engines", "chrome").split(",");
const renderers = flag("renderers", "dom,canvas").split(",");
// --app <path.declare>: benchmark a REAL program instead of a probe. The drive
// is a scroll of the root (app.scrollY over its range), which is what a person
// does to weather; the report is the same columns, and on Chrome --trace gives
// the paint breakdown. No knobs, one row per renderer.
const appPath = flag("app", null);
if (appPath) {
  PROBES.app = {
    file: appPath,
    drive: "scroll-app",
    sweeps: [{ name: `scroll ${appPath.replace(/^.*\//, "")}`, hold: {}, axis: "pass", values: [1] }],
  };
}
const probes = flag("probe", appPath ? "app" : Object.keys(PROBES).join(",")).split(",");
const steps = Number(flag("steps", "40"));
const headless = has("headless");
// --brief keeps only each sweep's endpoints. The curve's SHAPE is lost; its
// span is not — which is the trade worth making when the run is holding
// someone's screen.
const brief = has("brief");
// --trace: ask Chrome what its rasterizer actually did. Headed only — a
// SwiftShader trace describes software work under Blink's name.
const trace = has("trace");
const TRACE_DIR = path.join(ROOT, "mac-host", ".rasterbench-traces");
let traceN = 0;
if (trace) {
  mkdirSync(TRACE_DIR, { recursive: true });
  if (headless) console.log("⚠ --trace with --headless traces SwiftShader, not the GPU. These are software numbers.\n");
}
// --yield-focus hands the front back to another app right after the session
// opens, so a run can answer whether this engine needs to be frontmost at all
const yieldFocus = has("yield-focus");
// --will-change: inject `will-change: transform` on every transformed element
// before the program boots. An EXPERIMENT lever, not a setting: it asks whether a
// per-frame cost under a changing transform is the compositor re-rasterizing an
// unpromoted layer (promotion makes the transform compositor-only, and the cost
// collapses) or something else (it does not).
const willChange = has("will-change");
// --pre <js>: evaluated in the page after it boots and before the drive, on
// every engine (the Safari engine has no document-start hook, so this is how a
// lever reaches it). An A/B is two runs differing only in this.
const pre = flag("pre", null);
const jsonOut = flag("json", null);

if (headless) console.log("⚠ --headless: Chrome rasterizes on SwiftShader here. Structural runs only — these are not GPU numbers.\n");

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${httpServer.address().port}`;

const rows = [];

for (const engineName of engines) {
  let engine;
  try {
    engine = engineName === "safari" ? await safariEngine()
      : engineName === "ios" ? await simulatorEngine()
      : engineName === "webkit" ? await webkitEngine()
      : engineName === "firefox" ? await firefoxEngine()
      : await chromeEngine({ headless });
  } catch (err) {
    console.log(`${engineName}: SKIPPED — ${err.message}\n`);
    continue;
  }
  console.log(`\n════ ${engine.name} ════`);

  for (const probeName of probes) {
    const probe = PROBES[probeName];
    if (!probe) { console.log(`  unknown probe '${probeName}'`); continue; }

    if (engine.noResize && probe.drive === "resize") {
      console.log(`\n  ${probeName} — SKIPPED (this engine has no resizable window)`);
      continue;
    }
    for (const renderer of renderers) {
      if (engine.noCadence && renderer === "canvas") {
        // the canvas backend's compositor is a dirty-bit + rAF scheduler, and an
        // off-screen view never gets a frame — it would paint nothing and report
        // a confident zero. Refuse rather than measure a blank.
        console.log(`\n  ${probeName} · canvas — SKIPPED (needs a frame callback; use --engines chrome or safari)`);
        continue;
      }
      console.log(`\n  ${probeName} · ${renderer}`);
      console.log(`  ${"sweep".padEnd(34)}${"axis".padStart(7)}${"flushSum".padStart(10)}${"flushMax".padStart(10)}${"p50".padStart(8)}${"p95".padStart(8)}${"cvs".padStart(6)}${"MB".padStart(9)}${"maxDim".padStart(8)}${"dpr".padStart(5)}${"ink%".padStart(6)}${"drive".padStart(7)}${"filter".padStart(8)}`);

      for (const sweep of probe.sweeps) {
        const values = brief && sweep.values.length > 2
          ? [sweep.values[0], sweep.values[sweep.values.length - 1]]
          : sweep.values;
        for (const v of values) {
          const knobs = { ...sweep.hold, [sweep.axis]: v };
          // fresh navigation per point — a warm page has already been read back
          await engine.goto(`${BASE}/${probe.file}?render=${renderer}`);
          if (pre) await (engine.runUntraced ?? engine.run).call(engine, `(async () => { ${pre}; return true; })()`);
          engine.setResizeDrive?.(probe.drive === "resize");
          let out;
          if (probe.drive === "resize" && !engine.setResizeDrive) {
            // the resize gesture itself: a sweep of viewport widths, with the
            // in-page recorder running across it
            const run = engine.run(agentFor(probe.drive, knobs, steps, engine.noCadence === true, "drive"));
            for (let i = 0; i < steps; i++) {
              await engine.resize(700 + Math.round(300 * Math.sin((i / steps) * Math.PI)), 600);
              await sleep(16);
            }
            out = await run;
          } else {
            out = await engine.run(agentFor(probe.drive, knobs, steps, engine.noCadence === true, "drive"));
          }
          // the checks read the canvas back; they run in their own evaluate so
          // a trace of the drive never contains their readbacks
          const checks = await (engine.runUntraced ?? engine.run).call(engine, agentFor(probe.drive, knobs, steps, engine.noCadence === true, "checks"));
          out = { ...checks, ...out };
          const mb = (out.bytes / (1 << 20)).toFixed(1);
          const cad = (x) => (engine.noCadence ? "—" : String(x));
          console.log(
            `  ${sweep.name.padEnd(34)}${String(v).padStart(7)}${String(out.flushMs).padStart(10)}${String(out.flushMax).padStart(10)}` +
            `${cad(out.p50).padStart(8)}${cad(out.p95).padStart(8)}` +
            `${String(out.canvases).padStart(6)}${mb.padStart(9)}${String(out.maxDim).padStart(8)}${String(out.dpr).padStart(5)}${String(out.ink === null ? "?" : out.ink).padStart(6)}${(out.drive === null ? "?" : out.drive ? "ok" : "INERT").padStart(7)}${(out.filterWorks === null ? "?" : out.filterWorks ? "yes" : "NO").padStart(8)}`);
          if (trace && out.gpuMs !== undefined) {
            console.log(`      ↳ trace: paint ${out.paintMs}ms · gpu ${out.gpuMs}ms · cc-raster ${out.rasterMs}ms · top ${out.top.join(" ")}`);
          }
          if (out.memo) console.log(`      ↳ memo: ${out.memo.entries} entries · ${(out.memo.bytes / 1048576).toFixed(1)} MB · ${out.memo.paints} paints · budget×${out.memo.budgetScale}`);
          rows.push({ engine: engine.name, probe: probeName, renderer, sweep: sweep.name, axis: sweep.axis, value: v, ...out });
        }
      }
    }
  }
  await engine.close();
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${rows.length} rows to ${jsonOut}`);
}
httpServer.close();
console.log("\nRead down a column, never across: the engines do not share a present mechanism or a refresh cap.");
