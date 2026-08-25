// Recording bounds, per-op extents, the area cost model, and culling — the
// batch that came out of asking "is the size of a drawing always known?"
//
// It was not. `fillText` marked only its anchor point, so a draw() whose only
// ink was text bounded to a degenerate box and the DOM backend — which sizes a
// per-view canvas to the bounds — allocated 1x1 and rendered NOTHING. The first
// pin here is that bug; the rest pin what was built on the way to fixing it.
//
// CULLING MUST BE BYTE-IDENTICAL. It skips paint ops entirely outside the
// visible region, and the assertion is not "close" but EQUAL: the same scene
// with `__declareNoCull` on and off must produce the same data URL. Any
// difference at all is a bug in the skip test, not a tolerance question.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";
import { Draw, replayArea } from "../runtime/dist/draw.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// ── the pure half: in Node, no browser ──────────────────────────────────

await test("per-op extents ride parallel to ops, null for anything that paints nothing", () => {
  const d = new Draw(() => 200, () => 100);
  d.fillStyle = "#fff";            // state → null
  d.fillRect(10, 10, 20, 30);      // paint → its box
  d.beginPath();                   // path → null
  d.rect(50, 50, 10, 10);
  d.fill();                        // paint → the path's box
  const l = d.list();
  assert.equal(l.extents.length, l.ops.length);
  assert.equal(l.extents[0], null);
  assert.deepEqual(l.extents[1], { x: 10, y: 10, w: 20, h: 30 });
  assert.equal(l.extents[2], null);
  assert.equal(l.extents[3], null);
  assert.deepEqual(l.extents[4], { x: 50, y: 50, w: 10, h: 10 });
});

await test("extents follow the recorder's own transform, like bounds do", () => {
  const d = new Draw(() => 200, () => 100);
  d.translate(100, 0);
  d.scale(2, 2);
  d.fillStyle = "#fff";
  d.fillRect(0, 0, 10, 10);
  const l = d.list();
  assert.deepEqual(l.extents[3], { x: 100, y: 0, w: 20, h: 20 });
  assert.deepEqual(l.bounds, { x: 100, y: 0, w: 20, h: 20 });
});

await test("replayArea sums covered area — overdraw counts, gradients weigh more, a filter is unbounded", () => {
  const one = new Draw(); one.fillStyle = "#fff"; one.fillRect(0, 0, 10, 10);
  const two = new Draw(); two.fillStyle = "#fff"; two.fillRect(0, 0, 10, 10); two.fillRect(0, 0, 10, 10);
  const grad = new Draw();
  const g = grad.createLinearGradient(0, 0, 10, 0); g.addColorStop(0, "#000"); g.addColorStop(1, "#fff");
  grad.fillStyle = g; grad.fillRect(0, 0, 10, 10);
  const blur = new Draw(); blur.filter = "blur(4px)"; blur.fillStyle = "#fff"; blur.fillRect(0, 0, 10, 10);
  assert.equal(replayArea(one.list()), 100);
  assert.equal(replayArea(two.list()), 200, "two identical fills are twice the area — overdraw is what costs");
  assert.equal(replayArea(grad.list()) > replayArea(one.list()), true);
  assert.equal(replayArea(blur.list()), Infinity);
  // and it is a memo over the list: the same list answers the same number
  const l = two.list();
  assert.equal(replayArea(l), replayArea(l));
});

await test("with no measurer at all, text falls back to its anchor rather than throwing", () => {
  // bare Node: no document, so measure.ts cannot create a context
  const d = new Draw();
  d.fillStyle = "#fff";
  d.font = "20px sans-serif";
  d.fillText("hello", 30, 40);
  const l = d.list();
  assert.deepEqual(l.bounds, { x: 30, y: 40, w: 0, h: 0 });
  assert.equal(l.exact, false);
});

// ── the rendered half ────────────────────────────────────────────────────

const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(url, pre) {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 600, height: 400, deviceScaleFactor: 2 });
  if (pre) await pg.evaluateOnNewDocument(pre);
  await pg.goto(`${B}/${url}`, { waitUntil: "networkidle0", timeout: 60000 });
  await pg.waitForFunction("window.__app != null", { timeout: 30000 });
  await sleep(500);
  return pg;
}

await test("a text-only draw() renders on the DOM backend (it allocated a 1x1 canvas and drew nothing)", async () => {
  const pg = await open("test/probe/textbounds.declare?render=dom");
  const sizes = await pg.evaluate(`Array.from(document.querySelectorAll("canvas")).map(c => [c.width, c.height])`);
  assert.equal(sizes.some(([w, h]) => w <= 2 && h <= 2), false, `a degenerate canvas is still allocated: ${JSON.stringify(sizes)}`);
  const png = await pg.screenshot({ encoding: "base64" });
  const white = await pg.evaluate((b64) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      // the top band is the text-only view; the lower band has a rect behind its text
      const band = (y0, y1) => { let n = 0; const d = g.getImageData(0, y0, im.width, y1 - y0).data;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 150 && d[i + 2] > 150) n++; return n; };
      res({ lone: band(20, 200), withBox: band(230, 410) });
    };
    im.src = "data:image/png;base64," + b64;
  }), png);
  assert.equal(white.lone > 500, true, `text-only view painted ${white.lone} white pixels (with-box control: ${white.withBox})`);
  await pg.close();
});

await test("culling is byte-identical: the scrolled extent probe renders the same with it off", async () => {
  // the canvas backend, with the memo OFF so the vector path (the one that
  // culls) is what paints; scrolled into the middle so most of the paper is
  // off-screen and culling actually fires
  const grab = async (noCull) => {
    const pg = await open("test/probe/raster-extent.declare?render=canvas",
      `globalThis.__declareNoRasterMemo = true; globalThis.__declareNoCull = ${noCull};`);
    await pg.evaluate(`window.__app.k = 4; window.__app.scrollY = window.__app.height * 1.5`);
    await sleep(400);
    const url = await pg.evaluate(`document.querySelector("canvas").toDataURL()`);
    await pg.close();
    return url;
  };
  const culled = await grab(false);
  const full = await grab(true);
  assert.equal(culled.length > 1000, true, "the scene rendered something");
  assert.equal(culled === full, true, "culled and unculled frames differ — the skip test is wrong");
});

await test("culling is byte-identical on every drawing feature (drawops, canvas backend)", async () => {
  const grab = async (noCull) => {
    const pg = await open("test/probe/drawops.declare?render=canvas",
      `globalThis.__declareNoRasterMemo = true; globalThis.__declareNoCull = ${noCull};`);
    const url = await pg.evaluate(`document.querySelector("canvas").toDataURL()`);
    await pg.close();
    return url;
  };
  assert.equal(await grab(false) === await grab(true), true, "culled and unculled drawops frames differ");
});

await browser.close();
httpServer.close();
summarize("draw-bounds");
