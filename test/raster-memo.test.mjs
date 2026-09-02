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

await test("the memo is invisible: cached and uncached frames are identical", async () => {
  // several settled frames have passed — the stable drawing is promoted
  const cached = await shot();
  await page.evaluate(`globalThis.__declareNoRasterMemo = true; window.__app.tick = (window.__app.tick ?? 0) + 1`);
  await sleep(300);
  const vector = await shot();
  assert.equal(cached === vector, true, "pixel-identical with the memo disabled");
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
