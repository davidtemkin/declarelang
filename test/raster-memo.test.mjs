// The raster memo (adaptive draw cache, canvas half) — a PURE MEMO over
// draw() replay: identical pixels with the cache on or off (the semantic
// contract), a stable expensive drawing promotes to a raster, and a list
// change re-derives. Pinned at integer alignment, where exact-scale raster
// and vector replay agree bit-for-bit.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 600, height: 400, deviceScaleFactor: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// an EXPENSIVE drawing (blur → filter classifies it) at integer position
await page.goto(`${B}/test/probe/raster-memo.declare?render=canvas`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(`window.__app != null`, { timeout: 30000 });
await sleep(600);

const shot = () => page.evaluate(`(() => {
  const c = document.querySelector("canvas");
  return c.toDataURL();
})()`);

// PROMOTE: the drawing reads `app.tick`, so a tick RE-RECORDS it (a new list —
// never a stable key). A repaint that touches nothing the draw reads keeps the
// list, and the second paint of the same key promotes it — off the main thread
// where the engine can (raster-worker.ts), the bitmap landing a frame or two
// later and the frame that shows it booked by its arrival.
await page.evaluate(`window.__app.cap.x = 41`);
await sleep(500);

await test("the raster is made OFF the main thread — the memo's entry is the worker's bitmap", async () => {
  // adaptive-draw-cache.md §3.1, the worker raster (2026-09-10): where the
  // engine has Worker + OffscreenCanvas (headless Chrome does), a promoted
  // recording's pixels come back from raster-worker.ts as an ImageBitmap
  const stats = await page.evaluate(`globalThis.__declareRasterStats()`);
  assert.ok(stats.entries > 0, `the stable drawing promoted (entries=${stats.entries}, attempts=${stats.attempts}, err=${await page.evaluate("globalThis.__declareRasterErr")})`);
  assert.equal(stats.workerEntries, stats.entries, `every entry is the worker's bitmap (${stats.workerEntries} of ${stats.entries})`);
});

// the whole canvas as pixels, and a channel-wise diff
const px = () => page.evaluate(`(() => { const c = document.querySelector("canvas"); return Array.from(c.getContext("2d").getImageData(0, 0, c.width, c.height).data); })()`);
const diff = (a, b) => { let n = 0, max = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) { n++; if (d > max) max = d; } } return { n, max }; };

await test("the worker's bitmap IS the main thread's raster — realm-independent pixels", async () => {
  // the same recording, the same density, the same anchor: what the worker
  // sends back must equal what a synchronous raster on the main thread makes
  // (measured 2026-09-10: 0 differing channels). This is the worker raster's
  // whole correctness claim — it changes WHEN pixels are made, never WHICH.
  const worker = await px();
  await page.evaluate(`globalThis.__declareNoRasterWorker = true; window.__app.hue = 121`);   // re-record → a fresh promotion, on the main thread
  await sleep(300);
  await page.evaluate(`window.__app.cap.x = 42`);                                            // the stable second paint promotes
  await sleep(400);
  const stats = await page.evaluate(`globalThis.__declareRasterStats()`);
  assert.equal(stats.workerEntries, 0, "the sync path made this one");
  await page.evaluate(`window.__app.hue = 120; window.__app.cap.x = 41`);                    // …and back to the worker's picture, re-recorded
  await sleep(300);
  await page.evaluate(`window.__app.cap.x = 42`);
  await sleep(300);
  await page.evaluate(`window.__app.cap.x = 41`);
  await sleep(400);
  const sync = await px();
  assert.deepEqual(diff(worker, sync), { n: 0, max: 0 }, "bit-identical to the synchronous raster");
  await page.evaluate(`globalThis.__declareNoRasterWorker = false`);
});

await test("the memo vs vectors: the blur residual is the KNOWN hole, pinned so it cannot grow", async () => {
  // The memo's contract is "the same pixels the vectors would paint, modulo
  // sub-pixel phase" — and for an un-filtered recording that holds. A BLUR
  // filter does not: rastered into its own padded canvas, the blur samples a
  // different neighbourhood at the raster's edges than a direct replay does on
  // the composite. MEASURED 2026-09-10 (this probe, Chrome, dpr 1): 35 514
  // differing channels, max 52 — the sync path and the worker path alike (it
  // is the memo's, not the worker's). Pinned at that size: re-blessing a
  // larger residual is a deliberate act, and closing the hole is the follow-up
  // (adaptive-draw-cache.md §8).
  const raster = await px();
  await page.evaluate(`globalThis.__declareNoRasterMemo = true; window.__app.tick = (window.__app.tick ?? 0) + 1`);
  await sleep(300);
  const vector = await px();
  const d = diff(raster, vector);
  assert.ok(d.n <= 36000 && d.max <= 56, `the blur residual stayed within the recorded hole (got n=${d.n}, max=${d.max})`);
  await page.evaluate(`globalThis.__declareNoRasterMemo = false; window.__app.tick = window.__app.tick + 1`);
  await sleep(300);
});

await test("a list change re-derives — the memo never pins stale content", async () => {
  const before = await shot();
  await page.evaluate(`window.__app.hue = 200`);
  await sleep(400);
  const after = await shot();
  assert.notEqual(before, after, "the recording changed and the pixels followed");
});

await test("DOM per-view canvas covers the shadow bleed — a resting glow never clips to a hard box", async () => {
  // finding 3 (field report 2026-09-01): bounds exclude blur/shadow bleed by
  // design (draw.ts), and the canvas backend's memo already overscans by
  // rasterPad — the DOM backend's retained canvas must too. Ink is a 40×40
  // rect at (30,30) with shadowBlur 28 → pad ceil(2.5·28) = 70: the box
  // starts at −40 and spans 180, and the glow is PAINTED outside the ink box.
  await page.goto(`${B}/test/probe/shadow-pad.declare`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(`window.__app != null`, { timeout: 30000 });
  await sleep(500);
  const probe = await page.evaluate(`(() => {
    const c = document.querySelector("canvas");
    if (c == null) return { missing: true };
    const st = c.style;
    // recording coords (25, 50): 5px LEFT of the ink box — glow, not ink
    const kk = c.width / parseFloat(st.width);
    const x = Math.round((25 - parseFloat(st.left)) * kk);
    const y = Math.round((50 - parseFloat(st.top)) * kk);
    const a = c.getContext("2d").getImageData(x, y, 1, 1).data[3];
    return { left: st.left, top: st.top, w: st.width, h: st.height, alpha: a };
  })()`);
  assert.equal(probe.missing, undefined, "the drawn view's canvas exists");
  assert.equal(probe.left, "-40px", "box starts pad left of the ink");
  assert.equal(probe.top, "-40px", "…and pad above");
  assert.equal(probe.w, "180px", "…and spans ink + 2·pad");
  assert.ok(probe.alpha > 0, "the glow outside the ink box is painted, not clipped (alpha " + probe.alpha + ")");
});

await browser.close();
httpServer.close();
summarize("raster-memo");
