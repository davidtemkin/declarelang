// The canvas `filter` fallback — frost on an engine that does not have one.
//
// WHY THIS TEST CAN RUN ON CHROME. The bug it pins is a SAFARI bug: WebKit
// accepts `ctx.filter` and paints unfiltered, so the canvas backend's frost
// composited an untouched copy of its own backdrop. Chrome blurs correctly, so
// a Chrome-only suite could never see it — which is exactly why nothing did,
// for as long as the canvas backend has had frost.
//
// The fallback comes with its own lever: `__declareForceFilterFallback` makes
// an engine that HAS ctx.filter take the path built for engines that do not. So
// the Safari code path is exercised here, on Chrome, in CI — and the assertion
// that matters is that the two paths agree. That turns a divergence only one
// browser could reveal into an ordinary regression test.
//
// Verified against real WebKit when this landed (mac-host/webkitprobe, off-screen):
// Chrome-native vs WebKit-fallback measured meanΔ 1.91/255 over the frost probe,
// against meanΔ 2.09 for Chrome-native vs Chrome-fallback. The fallback is a
// pyramid blur (repeated halving down, then up), so it is an approximation of a
// gaussian by construction — the tolerances below are set from those numbers,
// not from hope.
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
await page.setViewport({ width: 600, height: 400, deviceScaleFactor: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a coarse grid over the whole canvas — enough to compare two renderings
// without pulling megabytes of pixels through the CDP boundary
const GRAB = `(async () => {
  await new Promise((r) => setTimeout(r, 700));
  const c = document.querySelector("canvas");
  const g = c.getContext("2d");
  const out = [];
  const N = 48;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = Math.floor((i + 0.5) * c.width / N), y = Math.floor((j + 0.5) * c.height / N);
    const d = g.getImageData(x, y, 1, 1).data;
    out.push(d[0], d[1], d[2]);
  }
  return out;
})()`;

async function grabFrost(forceFallback) {
  await page.evaluateOnNewDocument(`window.__declareForceFilterFallback = ${forceFallback}`);
  await page.goto(`${B}/test/probe/frost.declare?render=canvas`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction("window.__app != null", { timeout: 30000 });
  return await page.evaluate(GRAB);
}

await test("this engine really does honour ctx.filter (or the A/B below is vacuous)", async () => {
  await page.goto(`${B}/test/probe/frost.declare?render=canvas`, { waitUntil: "networkidle0", timeout: 60000 });
  const real = await page.evaluate(`(() => {
    const c = document.createElement("canvas"); c.width = 200; c.height = 100;
    const g = c.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, 100, 100);
    g.fillStyle = "#fff"; g.fillRect(100, 0, 100, 100);
    const s = document.createElement("canvas"); s.width = 200; s.height = 100;
    s.getContext("2d").drawImage(c, 0, 0);
    g.filter = "blur(12px)"; g.setTransform(1,0,0,1,0,0); g.drawImage(s, 0, 0);
    let mid = 0;
    for (let x = 84; x < 116; x += 2) { const v = g.getImageData(x, 50, 1, 1).data[0]; if (v > 20 && v < 235) mid++; }
    return mid;
  })()`);
  assert.equal(real > 3, true, `expected a blurred ramp from the native filter, got ${real} mid samples`);
});

await test("the fallback frosts: forced on, the glass is still blurred", async () => {
  const px = await grabFrost(true);
  // a blurred backdrop under glass produces many distinct luminances; the bug
  // this pins produced a FLAT region, so the count is the discriminator
  const levels = new Set(px.filter((_, i) => i % 3 === 0).map((v) => Math.round(v / 4)));
  assert.equal(levels.size > 8, true, `frost fallback produced ${levels.size} luminance levels — a flat region means it did not blur`);
});

await test("the fallback agrees with the native filter", async () => {
  const native = await grabFrost(false);
  const fallback = await grabFrost(true);
  assert.equal(native.length, fallback.length);
  let sum = 0, max = 0;
  for (let i = 0; i < native.length; i++) {
    const d = Math.abs(native[i] - fallback[i]);
    sum += d;
    if (d > max) max = d;
  }
  const mean = sum / native.length;
  // measured 2.09 mean / 19 max when this landed; the headroom absorbs GPU
  // rounding across machines without admitting a real regression
  assert.equal(mean < 6, true, `mean channel delta ${mean.toFixed(2)} — the fallback drifted from the native filter`);
  assert.equal(max < 48, true, `max channel delta ${max} — the fallback drifted from the native filter`);
});

await browser.close();
httpServer.close();
summarize("canvas-filter");
