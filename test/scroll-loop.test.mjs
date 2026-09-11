// The runtime scroll provider (canvas-backend's ScrollLoop; scrolling.md "The
// scroll process", ruled 2026-09-10). An interior scrolling pane on canvas has
// no platform scroller — the runtime IS the process. These pin its contract:
//   • a wheel delta is applied NEXT FRAME, painted, then reported as the fact;
//     `scrolling` rises with the stream and settles after it goes quiet
//   • a request with a glide tweens on the loop and lands exactly on target
//   • a touch drag follows the finger, momentum continues after the lift, and
//     the FACT never leaves the range even while the visual rubber-bands
//   • a request during a touch session is dropped (arbitration rule 1)
//   • a tap — a finger that never moves past the slop — scrolls nothing
//   • the pane CONTAINS its wheel: consumed at the limit, never chained
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

// A pane with 2000px of content in a 300px frame: 1700px of range. The App
// fits its host, so the page itself has nowhere to go — every delta is the
// pane's, or nobody's.
const RAW = `App [ width = 600, height = 500, fill = #202830,
    pane: View [ x = 50, y = 50, width = 300, height = 300, fill = #334455, scrolls = y,
        tall: View [ x = 0, y = 0, width = 300, height = 2000, fill = #445566 ],
        ],
    ]`;
const compiled = await compile(RAW);
assert.deepEqual(compiled.errors, [], "scroll-loop fixture compiles clean");

const html = `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, CanvasBackend } from "/dist/index.js";
  window.__app = render(${JSON.stringify(compiled.source)}, document.getElementById("host"), new CanvasBackend());
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

const server = http.createServer(async (req, res) => {
  if (req.url === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(html); return; }
  const rel = req.url.startsWith("/dist/") ? path.join("runtime", req.url) : req.url;
  try {
    const body = await readFile(path.join(root, rel));
    res.writeHead(200, { "content-type": rel.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
  defaultViewport: { width: 800, height: 600, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${B}/`, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => window.__rendered === true, { timeout: 15000 });

const frames = (n) => page.evaluate((k) => new Promise((r) => {
  const tick = () => (k-- > 0 ? requestAnimationFrame(tick) : r());
  requestAnimationFrame(tick);
}), n);
const facts = () => page.evaluate(() => ({ y: Math.round(window.__app.pane.scrollY), scrolling: window.__app.pane.scrolling }));
const wheel = (dy, x = 200, y = 200) => page.evaluate(([dy, x, y]) => {
  const c = document.querySelector("canvas");
  return !c.dispatchEvent(new WheelEvent("wheel", { deltaX: 0, deltaY: dy, clientX: x, clientY: y, bubbles: true, cancelable: true }));
}, [dy, x, y]);
const settled = () => page.waitForFunction(() => window.__app.pane.scrolling === false, { timeout: 5000 });

await test("canvas: a wheel delta lands on the NEXT frame — consumed at once, the fact after the paint", async () => {
  // consumed and the fact read in ONE evaluate — a round trip spans a frame
  const r = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const consumed = !c.dispatchEvent(new WheelEvent("wheel", { deltaX: 0, deltaY: 120, clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
    return { consumed, y: window.__app.pane.scrollY };
  });
  assert.equal(r.consumed, true, "the pane takes the wheel (preventDefault)");
  assert.equal(r.y, 0, "the fact is not written synchronously in the event");
  await frames(2);
  const after = await facts();
  assert.equal(after.y, 120, "one frame later the fact carries the delta");
  assert.equal(after.scrolling, true, "`scrolling` is up while the wheel stream lives");
  await settled();
  assert.equal((await facts()).y, 120, "settling changes nothing");
});

await test("canvas: a stream of deltas within one frame is BATCHED — one write, one fact", async () => {
  await wheel(10); await wheel(20); await wheel(30);
  await frames(2);
  assert.equal((await facts()).y, 180);
  await settled();
});

await test("canvas: the pane CONTAINS — a wheel past its limit is consumed and the fact clamps", async () => {
  const consumed = await wheel(99999);
  await frames(2);
  assert.equal((await facts()).y, 1700, "clamped to the range (2000 − 300)");
  assert.equal(await wheel(500), true, "at the limit the pane still takes the wheel — no chain to the page");
  assert.equal(consumed, true);
  await frames(2);
  assert.equal((await facts()).y, 1700);
  await settled();
});

await test("canvas: a request with a glide tweens on the loop and lands exactly on target", async () => {
  await page.evaluate(() => window.__app.pane.scrollTo(400, { duration: 160, motion: "cubicOut" }));
  await frames(3);
  const mid = await facts();
  assert.ok(mid.y < 1700 && mid.y > 400, `mid-glide the offset is between (got ${mid.y})`);
  assert.equal(mid.scrolling, true, "`scrolling` is up through a glide");
  await settled();
  assert.equal((await facts()).y, 400, "the glide ends on its target");
});

await test("canvas: a plain request is immediate and cancels a glide in flight", async () => {
  await page.evaluate(() => {
    window.__app.pane.scrollTo(1500, { duration: 800 });
    window.__app.pane.scrollTo(100);
  });
  await frames(3);
  assert.equal((await facts()).y, 100);
  await settled();
});

const touch = (type, x, y, t, { lift = false } = {}) => page.evaluate(([type, x, y, t, lift]) => {
  const c = document.querySelector("canvas");
  const tc = new Touch({ identifier: 7, target: c, clientX: x, clientY: y });
  const ev = new TouchEvent(type, { touches: lift ? [] : [tc], changedTouches: [tc], bubbles: true, cancelable: true });
  Object.defineProperty(ev, "timeStamp", { value: t });
  return !c.dispatchEvent(ev);
}, [type, x, y, t, lift]);

await test("canvas: a touch drag follows the finger, momentum continues after the lift, the fact stays in range", async () => {
  const t0 = await page.evaluate(() => performance.now());
  assert.equal(await touch("touchstart", 200, 300, t0), false, "touchdown is never claimed (a tap stays cheap)");
  assert.equal(await touch("touchmove", 200, 298, t0 + 8), false, "inside the slop the finger is still the platform's");
  assert.equal(await touch("touchmove", 200, 280, t0 + 16), true, "past the slop the session owns the move");
  await touch("touchmove", 200, 240, t0 + 32);
  await touch("touchmove", 200, 200, t0 + 48);
  await frames(1);
  const dragging = await facts();
  assert.ok(dragging.y > 100, `dragging up scrolls down (got ${dragging.y})`);
  assert.equal(dragging.scrolling, true);
  await touch("touchend", 200, 180, t0 + 56, { lift: true });
  await frames(4);
  const coasting = await facts();
  assert.ok(coasting.y > dragging.y, `momentum carries on after the lift (${dragging.y} → ${coasting.y})`);
  await settled();
  const rest = await facts();
  assert.ok(rest.y >= 0 && rest.y <= 1700, `the fact never leaves the range (got ${rest.y})`);
});

await test("canvas: a request during a touch session is dropped — the gesture owns the offset", async () => {
  const t0 = await page.evaluate(() => performance.now());
  const before = (await facts()).y;
  await touch("touchstart", 200, 300, t0);
  await touch("touchmove", 200, 260, t0 + 16);
  await page.evaluate(() => window.__app.pane.scrollTo(0));
  await frames(1);
  assert.ok((await facts()).y >= before, "the request did not move the pane");
  await touch("touchcancel", 200, 260, t0 + 32, { lift: true });
  await settled();
});

await test("canvas: a tap scrolls nothing and leaves `scrolling` down", async () => {
  const t0 = await page.evaluate(() => performance.now());
  const before = await facts();
  await touch("touchstart", 200, 300, t0);
  await touch("touchend", 200, 301, t0 + 40, { lift: true });
  await frames(3);
  const after = await facts();
  assert.equal(after.y, before.y);
  assert.equal(after.scrolling, false);
});

await test("canvas: overscroll is presentation — dragging past the top rubber-bands the paint, the fact clamps at 0", async () => {
  await page.evaluate(() => window.__app.pane.scrollTo(0));
  await frames(2);
  const t0 = await page.evaluate(() => performance.now());
  await touch("touchstart", 200, 200, t0);
  await touch("touchmove", 200, 240, t0 + 16);
  await touch("touchmove", 200, 320, t0 + 32);
  await frames(1);
  const r = await page.evaluate(() => {
    const s = window.__app.pane.surface;
    return { fact: window.__app.pane.scrollY, visual: s.scrollVisualY };
  });
  assert.equal(r.fact, 0, "the fact is clamped");
  assert.ok(r.visual !== null && r.visual < 0, `the visual offset is past the top (got ${r.visual})`);
  await touch("touchend", 200, 320, t0 + 48, { lift: true });
  await settled();
  const back = await page.evaluate(() => window.__app.pane.surface.scrollVisualY);
  assert.equal(back, null, "at rest the visual offset retires to the fact");
});

await test("no page errors through the run", () => assert.deepEqual(errors, []));

await browser.close();
server.close();
summarize("scroll-loop");
