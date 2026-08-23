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
//   WebKit  — the 2D canvas is DEFERRED. Draw calls only record; rasterization
//             is forced lazily at the first pixel read. So `flushMs` below — a
//             ONE-PIXEL readback — is the real rendering cost, and a 1x1 read
//             costs the same as a full one (a one-pixel copy cannot be a buffer
//             transfer). This is the only way to see WebKit's raster at all.
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
import { writeFileSync, existsSync, unlinkSync, statSync } from "node:fs";
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
      { name: "span 0.05 — marks tile", hold: { span: 0.05 }, axis: "ops", values: [64, 256, 1024, 4096] },
      { name: "span 1.00 — marks cover", hold: { span: 1.0 }, axis: "ops", values: [64, 256, 1024, 4096] },
    ],
  },
  size: {
    file: "test/probe/raster-size.declare",
    drive: "resize",
    sweeps: [
      { name: "resize, live (reads its own size)", hold: { mode: "live", weight: 3 }, axis: "blur", values: [0, 8, 24, 48] },
      { name: "resize, ref  (fixed box + scale)", hold: { mode: "ref", weight: 3 }, axis: "blur", values: [0, 8, 24, 48] },
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

  for (const [k, v] of Object.entries(KNOBS)) app[k] = v;
  await raf(); await raf();

  // TWO PASSES, because the two metrics corrupt each other. A readback is a GPU
  // sync on Blink, so taking one every step would poison the very cadence it is
  // sitting next to; and a single flush at the END cannot see a cost that is
  // paid per frame (a resize re-records every step — that is the whole point of
  // the size probe). So: cadence with no readback, then flush with one per step.

  const gaps = [];
  if (!NOCADENCE) {
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
  for (let i = 0; i < STEPS; i++) {
    DRIVE_STEP;
    bump();
    await raf();
    const f = flush();
    flushTotal += f;
    if (f > flushMax) flushMax = f;
  }

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
  };
})()`;

const DRIVES = {
  // a static shape: perturb the recording so each frame really re-paints
  static: "bump()",
  // resize is driven from OUTSIDE the page (the viewport is the driver's), so
  // in here the step is only the repaint the resize will have caused
  resize: "bump()",
  // scroll the page's own declared offset — a settable attribute, so this is
  // the same gesture on every renderer rather than a per-backend wheel event
  scroll: "app.scrollY = (i / STEPS) * (app.height * (app.k - 1))",
};

function agentFor(drive, knobs, steps, noCadence = false) {
  return AGENT
    .replace(/DRIVE_STEP;/g, DRIVES[drive] + ";")
    .replace("__TICK__", noCadence
      ? "new Promise((r) => setTimeout(r, 0))"
      : "new Promise((r) => requestAnimationFrame(r))")
    .replace(/NOCADENCE/g, String(noCadence))
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

async function chromeEngine({ headless }) {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless,
    args: ["--no-sandbox"],
    defaultViewport: { width: 900, height: 600, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  return {
    name: headless ? "chrome (HEADLESS — SwiftShader, not the GPU)" : "chrome",
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

// safaridriver speaks plain W3C WebDriver over HTTP — no client library, and
// none is wanted: the whole protocol surface used here is five calls.
async function safariEngine() {
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
    session = await call("POST", "/session", { capabilities: { alwaysMatch: {} } });
  } catch (err) {
    proc.kill();
    throw new Error(
      `safaridriver refused a session (${err.message}).\n` +
      `  Enable Safari ▸ Settings ▸ Advanced ▸ "Show features for web developers",\n` +
      `  then Develop ▸ Allow Remote Automation, and run 'safaridriver --enable' once.`);
  }
  const sid = session.sessionId;
  await call("POST", `/session/${sid}/timeouts`, { script: 120000 });
  return {
    name: "safari",
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
    async resize(w, h) { await call("POST", `/session/${sid}/window/rect`, { width: w, height: h + 80 }); },
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
const probes = flag("probe", Object.keys(PROBES).join(",")).split(",");
const steps = Number(flag("steps", "40"));
const headless = has("headless");
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
      : engineName === "webkit" ? await webkitEngine()
      : await chromeEngine({ headless });
  } catch (err) {
    console.log(`${engineName}: SKIPPED — ${err.message}\n`);
    continue;
  }
  console.log(`\n════ ${engine.name} ════`);

  for (const probeName of probes) {
    const probe = PROBES[probeName];
    if (!probe) { console.log(`  unknown probe '${probeName}'`); continue; }

    for (const renderer of renderers) {
      if (engine.noCadence && renderer === "canvas") {
        // the canvas backend's compositor is a dirty-bit + rAF scheduler, and an
        // off-screen view never gets a frame — it would paint nothing and report
        // a confident zero. Refuse rather than measure a blank.
        console.log(`\n  ${probeName} · canvas — SKIPPED (needs a frame callback; use --engines chrome or safari)`);
        continue;
      }
      console.log(`\n  ${probeName} · ${renderer}`);
      console.log(`  ${"sweep".padEnd(34)}${"axis".padStart(7)}${"flushSum".padStart(10)}${"flushMax".padStart(10)}${"p50".padStart(8)}${"p95".padStart(8)}${"cvs".padStart(6)}${"MB".padStart(9)}${"maxDim".padStart(8)}${"dpr".padStart(5)}`);

      for (const sweep of probe.sweeps) {
        for (const v of sweep.values) {
          const knobs = { ...sweep.hold, [sweep.axis]: v };
          // fresh navigation per point — a warm page has already been read back
          await engine.goto(`${BASE}/${probe.file}?render=${renderer}`);
          engine.setResizeDrive?.(probe.drive === "resize");
          if (probe.drive === "resize" && !engine.setResizeDrive) {
            // the resize gesture itself: a sweep of viewport widths, with the
            // in-page recorder running across it
            const run = engine.run(agentFor(probe.drive, knobs, steps, engine.noCadence === true));
            for (let i = 0; i < steps; i++) {
              await engine.resize(700 + Math.round(300 * Math.sin((i / steps) * Math.PI)), 600);
              await sleep(16);
            }
            var out = await run;
          } else {
            var out = await engine.run(agentFor(probe.drive, knobs, steps, engine.noCadence === true));
          }
          const mb = (out.bytes / (1 << 20)).toFixed(1);
          const cad = (x) => (engine.noCadence ? "—" : String(x));
          console.log(
            `  ${sweep.name.padEnd(34)}${String(v).padStart(7)}${String(out.flushMs).padStart(10)}${String(out.flushMax).padStart(10)}` +
            `${cad(out.p50).padStart(8)}${cad(out.p95).padStart(8)}` +
            `${String(out.canvases).padStart(6)}${mb.padStart(9)}${String(out.maxDim).padStart(8)}${String(out.dpr).padStart(5)}`);
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
