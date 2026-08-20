// The visibility facts under a MOVING ANCESTOR, on the DOM host — the
// spring-bug report (2026-08-20). The DOM feed's IntersectionObserver is an
// edge sensor: it reports crossings, not levels, so before the fix a fully
// visible box under a scaling ancestor reported nothing at all (a direct
// write left it frozen at the old scale), and a sprung glide left every box
// frozen at a sample from whatever instant IT last crossed a threshold.
// The fix: the model's tracked ancestor walk WAKES the feed, which re-asks
// the observer for current truth at rest (view.ts visWake +
// Surface.refreshVisibility). These pins hold the resting truth on both
// write paths, for every box at once.
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
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.setViewport({ width: 1440, height: 900 });
const cdp = await page.createCDPSession();
await cdp.send("Network.setBypassServiceWorker", { bypass: true });
await page.goto(`${B}/test/probe/vis-camera.declare`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(`window.__app != null && window.__app.world != null`, { timeout: 30000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boxes = () => page.evaluate(`window.__app.world.row.children.map((b) => ({ res: b.res, seen: b.seen }))`);
// prime the feed (the facts arm on first tracked read) and let it settle
await boxes();
await sleep(400);

await test("a DIRECT ancestor-scale write reaches every box — the fully visible ones included", async () => {
  await page.evaluate(`window.__app.camScale = 2.5`);
  await sleep(500);
  const b = await boxes();
  // the fully visible boxes are the regression: they cross no observer
  // threshold, so only the runtime's own wake can update them
  for (const [i, box] of b.entries())
    assert.equal(box.res, 2.5, `box ${i} reports the written scale (got ${box.res})`);
});

await test("a SPRUNG ancestor scale settles every box to the resting value — no mid-flight samples survive", async () => {
  await page.evaluate(`window.__app.camTarget = 0.5`);
  await sleep(2000);                       // the glide (~500ms) plus the at-rest flush
  const b = await boxes();
  for (const [i, box] of b.entries())
    assert.equal(box.res, 0.5, `box ${i} rests at the spring's target (got ${box.res})`);
  // at 0.5 the whole 6-box row (920px of world, scaled about x=400) sits
  // inside the 900px root — every box on screen, none stuck at a stale false
  for (const [i, box] of b.entries())
    assert.equal(box.seen, true, `box ${i} knows it is on screen`);
});

await test("no page errors through the run", async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
httpServer.close();
summarize("vis-camera");
