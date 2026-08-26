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

// THE HIDDEN-RASTER SKIP. Four views drawing full-surface washes, one shown.
// The DOM backend used to allocate and rasterize all four (weather's WSky
// comment designs around exactly that); the canvas backend never paints a
// hidden surface and the Mac host skips it. Now a hidden view's canvas holds no
// pixels, the raster is OWED, and showing pays it — with the shown view's pixels
// identical to a fresh load, which is what makes the skip an optimization and
// not a semantic.
await test("hidden drawings hold no backing store; showing one rasterizes it, identically", async () => {
  const backing = `Array.from(document.querySelectorAll("canvas")).map((c) => c.width * c.height * 4)`;
  const shot = `document.querySelectorAll("canvas")[0] && (() => {
    const cs = Array.from(document.querySelectorAll("canvas")).filter((c) => c.width > 0);
    return cs.length === 1 ? cs[0].toDataURL() : "MULTIPLE:" + cs.length;
  })()`;
  const pg = await open("test/probe/raster-hidden.declare?render=dom");
  const before = await pg.evaluate(backing);
  assert.equal(before.filter((b) => b > 0).length, 1, `expected exactly one rasterized canvas, got ${JSON.stringify(before)}`);
  const one = Math.max(...before);
  assert.equal(before.reduce((a, b) => a + b, 0), one, "hidden views hold no backing store");
  // show the third: it rasterizes, the first releases
  await pg.evaluate(`window.__app.shown = 2`);
  await sleep(400);
  const after = await pg.evaluate(backing);
  assert.equal(after.filter((b) => b > 0).length, 1, `after a switch, exactly one rasterized canvas: ${JSON.stringify(after)}`);
  assert.equal(after[2] > 0 && after[0] === 0, true, "the shown view is the rasterized one and the hidden one released");
  const switched = await pg.evaluate(shot);
  // byte-identical across a hide → re-show round trip: the raster owed while
  // hidden and paid on show is the same raster a view shown from the start
  // had — so the first view, shown at boot, must match itself after 0→1→0
  await pg.evaluate(`window.__app.shown = 0`);
  await sleep(300);
  const backAtStart = await pg.evaluate(shot);
  await pg.evaluate(`window.__app.shown = 1`);
  await sleep(300);
  await pg.evaluate(`window.__app.shown = 0`);
  await sleep(400);
  const reShown = await pg.evaluate(shot);
  await pg.close();
  assert.equal(switched.startsWith("data:"), true, `expected one rasterized canvas after the switch, got ${switched.slice(0, 12)}`);
  assert.equal(backAtStart === reShown, true, "a view re-shown after being hidden renders exactly as it did when shown from the start");
});

// EXACT AT REST UNDER TRANSFORM — the DOM half of the adaptive draw cache.
// A hairline ring drawn at 1px under scale = 4: the canvas backend replays
// under the transform and is exact; the DOM backend used to hold pixels at
// bounds × dpr and let CSS stretch them, so the same ring arrived 4× as wide.
// Now the view's at-rest visibility feed hands the composed scale to the
// surface and it re-rasters at that density. The measure is the ring's edge
// RAMP — how many device pixels a hard edge takes to go from ground to ink —
// on DOM against canvas. Stretched: ~4× canvas's. Exact: about the same.
await test("a drawing under a large scale is exact at rest on the DOM backend (not CSS-stretched)", async () => {
  const ramp = async (render) => {
    const pg = await open(`test/probe/raster-scaled.declare?render=${render}`);
    await sleep(700);                                      // past the at-rest beat, and the feed's flush
    const png = await pg.screenshot({ encoding: "base64" });
    const r = await pg.evaluate((b64) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        // the ring's centre is at view (60,40) → app (40+240, 40+160) = (280,200); its
        // left edge is 28·4 = 112 app px to the left → x ≈ 168. Scan the row through
        // the centre from x=150 to 190 (device 2×) and count transitional pixels.
        const y = 200 * 2;
        let mid = 0;
        for (let x = 150 * 2; x < 190 * 2; x++) {
          const v = g.getImageData(x, y, 1, 1).data[0];
          if (v > 40 && v < 215) mid++;
        }
        res(mid);
      };
      im.src = "data:image/png;base64," + b64;
    }), png);
    await pg.close();
    return r;
  };
  const dom = await ramp("dom");
  const canvas = await ramp("canvas");
  assert.equal(canvas > 0, true, `the canvas render should show an edge (got ${canvas} transitional px)`);
  assert.equal(dom <= canvas * 1.5 + 2, true, `DOM ring edge ramps over ${dom} device px against canvas's ${canvas} — still CSS-stretched`);
});

// THE DISCOVERED CEILING ON DOM. Past its canvas budget the platform draws a
// TRANSPARENT canvas and nothing else says so (measured: a 395 MB canvas that
// allocated, cost time, and painted nothing). The DOM backend's bytes are
// obligatory, so its recovery is DENSITY: a large raster that samples blank is
// remade at half the density, down to a quarter of dpr, and counted. The
// failure cannot be provoked on Chrome, so the lever forces the detector for
// the first N checks and the pin watches the recovery happen.
await test("a DOM raster that comes back blank is remade at a lower density, and counted", async () => {
  // the extent probe at k=4 is a ~33 MB canvas — past the 8 MB bar the check
  // runs at. The lever is armed AFTER boot: the boot raster is already past the
  // bar at 900x600 @2x, and arming it earlier spent the forced blank there
  const pg = await open("test/probe/raster-extent.declare?render=dom");
  await pg.evaluate(`globalThis.__declareForceBlank = 1; window.__app.k = 4`);
  await sleep(600);
  const st = await pg.evaluate(`globalThis.__declareDomRasterStats()`);
  const cv = await pg.evaluate(`(() => { const c = document.querySelector("canvas"); return { w: c.width, cssW: parseFloat(c.style.width) }; })()`);
  await pg.close();
  assert.equal(st.blank >= 1, true, `expected the blank to be counted, stats ${JSON.stringify(st)}`);
  // the raster at dpr 2 read blank (forced); the retry at density 1 is what stands
  assert.equal(Math.abs(cv.w / cv.cssW - 1) < 0.05, true, `expected the raster remade at half density (1 px per unit), got ${cv.w}/${cv.cssW}`);
  // and the ceiling is STICKY: a further re-record stays at the density that painted
  const pg2 = await open("test/probe/raster-extent.declare?render=dom");
  await pg2.evaluate(`globalThis.__declareForceBlank = 1; window.__app.k = 4`);
  await sleep(500);
  await pg2.evaluate(`window.__app.tick = 5`);          // re-record, no lever armed
  await sleep(500);
  const again = await pg2.evaluate(`(() => { const c = document.querySelector("canvas"); return c.width / parseFloat(c.style.width); })()`);
  await pg2.close();
  assert.equal(Math.abs(again - 1) < 0.05, true, `a later re-record went back to the refused density: ${again}`);
});

// BOX SHADOW UNDER ROTATION. The canvas backend painted a box's drop shadow by
// filling the shape 1e5 px off-canvas and bringing only its shadow back with a
// compensating x-offset — but the y-offset was not compensated, so under any
// rotation the shadow's source landed off-canvas vertically and the shadow
// vanished (and the huge off-canvas fill occasionally swept across the view as
// a dark rectangle). test/probe/boxshadow.declare has a card rotated 12°; the
// shadow must exist below-right of it.
await test("a rotated box keeps its drop shadow on the canvas backend", async () => {
  const pg = await open("test/probe/boxshadow.declare?render=canvas");
  const dark = await pg.evaluate(`(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d");
    // the rotated card 'b' is around app (340..540, 60..180) rotated 12° about
    // its centre; sample a band just OUTSIDE its lower-right, where an outset
    // shadow lands, and count pixels darker than the #6A6A72 ground
    let shadow = 0, seen = 0;
    for (let x = 440; x < 560; x += 2) for (let y = 190; y < 230; y += 2) {
      const d = g.getImageData(x * 2, y * 2, 1, 1).data; seen++;
      if (d[0] < 90 && d[1] < 90 && d[2] < 95) shadow++;   // darker than ground (~106)
    }
    return { shadow, seen };
  })()`);
  await pg.close();
  assert.equal(dark.shadow > 20, true, `the rotated card's shadow is missing: ${dark.shadow}/${dark.seen} shadow pixels below-right`);
});

await browser.close();
httpServer.close();
summarize("draw-bounds");
