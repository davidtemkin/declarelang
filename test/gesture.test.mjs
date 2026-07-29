// test/gesture.test.mjs — the gesture-claim contract, driven by a REAL browser
// on both backends. The language rule (declare.md §8): the browser owns every
// gesture until a view claims one, and declaring the handler IS the claim — a
// claim takes exactly what the handler needs to fire, nothing more. The DOM
// backend realizes claims as per-element `touch-action` (dom-backend
// refreshTouchAction); the canvas backend arbitrates per gesture at its one
// shared element (claimAt / wheelTo). These pins hold the realization table
// (docs/system-design/gestures.md) against both:
//   - the app-root DEFAULTS: `manipulation` unclipped (pan + pinch stay the
//     user's), `pinch-zoom` clipped (a fixed window has no pan to keep), and
//     the repeal this rung IS — no more unconditional root `none`;
//   - per-view claims: onPointerMove → pinch-zoom, onTouch* → none, onWheel →
//     no touch-action at all (a wheel is not a touch gesture);
//   - a scroller DELEGATES: `pan-y pinch-zoom` (pinch was never claimed);
//   - onWheel delivery: deltas + the `pinch` flag (ctrlKey wheels are
//     trackpad pinches), nearest-claim-wins, and an intervening scroller
//     keeping its wheel;
//   - the focus-zoom lock (viewport-lock.ts): an app that claimed every
//     finger rewrites the viewport meta while a field holds focus, and
//     restores it on blur.

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

// One view per claim rung, plus a scroller INSIDE the wheel claimant (the
// delegation-beats-claim arbitration case). The App itself claims nothing, so
// the root shows the default.
const CLAIMS_RAW = `App [ width = 640, height = 400, fill = #202830,
    wdx: number = 0,
    wdy: number = 0,
    wpinch: boolean = false,
    drag: View [ x = 20, y = 20, width = 160, height = 100, fill = #334455,
        onPointerMove(e: PointerEvent) { },
        ],
    mesa: View [ x = 200, y = 20, width = 160, height = 100, fill = #445566,
        onTouchStart(e: TouchEvent) { },
        ],
    zoomer: View [ x = 380, y = 20, width = 200, height = 300, fill = #2E3A45,
        onWheel(e: WheelEvent) { app.wdx = e.deltaX; app.wdy = e.deltaY; app.wpinch = e.pinch },
        pane: View [ x = 20, y = 120, width = 160, height = 120, fill = #3A4855, scrolls = true,
            tall: View [ x = 0, y = 0, width = 160, height = 400, fill = #46586A ],
            ],
        ],
    ]`;

// An app with FULL GESTURE CONTROL (the raw touch family on the App) holding
// a native field — the focus-zoom lock's subject.
const LOCK_RAW = `App [ width = 640, height = 400, fill = #202830,
    onTouchStart(e: TouchEvent) { },
    field: TextInput [ x = 20, y = 20, width = 200, height = 30, fill = #3A4855 ],
    ]`;

const claimsCompiled = compile(CLAIMS_RAW);
assert.deepEqual(claimsCompiled.errors, [], "claims fixture compiles clean");
const lockCompiled = compile(LOCK_RAW);
assert.deepEqual(lockCompiled.errors, [], "lock fixture compiles clean");

const pageHtml = (backendClass, source) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<div id="host"></div>
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  window.__app = render(${JSON.stringify(source)}, document.getElementById("host"), new ${backendClass}());
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

const pages = {
  "/dom-claims": pageHtml("DomBackend", claimsCompiled.source),
  "/canvas-claims": pageHtml("CanvasBackend", claimsCompiled.source),
  "/dom-lock": pageHtml("DomBackend", lockCompiled.source),
};

const server = http.createServer(async (req, res) => {
  const page = pages[req.url];
  if (page) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(page);
    return;
  }
  const rel = req.url.startsWith("/dist/") ? path.join("runtime", req.url) : req.url;
  try {
    const body = await readFile(path.join(root, rel));
    res.writeHead(200, { "content-type": rel.endsWith(".js") ? "text/javascript" : "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
  defaultViewport: { width: 800, height: 600, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

async function open(route) {
  await page.goto(`${B}${route}`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(() => window.__rendered === true, { timeout: 15000 });
}

const styleAt = (x, y) => page.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  return { touchAction: getComputedStyle(el).touchAction, tag: el.tagName };
}, [x, y]);

// ── DOM: the touch-action realization table ─────────────────────────────────

await open("/dom-claims");

await test("dom: the root default is `manipulation` — the root `none` policy is repealed", async () => {
  const ta = await page.evaluate(() => getComputedStyle(document.querySelector("[data-declare-app]")).touchAction);
  assert.equal(ta, "manipulation");
});

await test("dom: `clip = true` retires pan with the scroll — root goes `pinch-zoom`", async () => {
  await page.evaluate(() => { window.__app.clip = true; });
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("[data-declare-app]")).touchAction === "pinch-zoom",
    { timeout: 5000 });
  await page.evaluate(() => { window.__app.clip = false; });
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("[data-declare-app]")).touchAction === "manipulation",
    { timeout: 5000 });
});

await test("dom: onPointerMove claims the drag, keeps pinch — `pinch-zoom`", async () => {
  assert.equal((await styleAt(100, 70)).touchAction, "pinch-zoom");
});

await test("dom: the raw touch family claims every finger — `none`", async () => {
  assert.equal((await styleAt(280, 70)).touchAction, "none");
});

await test("dom: onWheel is not a touch claim — no touch-action of its own", async () => {
  // The zoomer inherits the root's effective policy; its own computed value is
  // the CSS initial `auto` (touch suppression rides the ancestor chain).
  assert.equal((await styleAt(470, 60)).touchAction, "auto");
});

await test("dom: a scroller delegates pan AND keeps pinch delegated — `pan-y pinch-zoom`", async () => {
  const ta = (await styleAt(460, 200)).touchAction;
  assert.ok(ta.includes("pan-y") && ta.includes("pinch-zoom"), `got '${ta}'`);
});

// ── DOM: wheel delivery ─────────────────────────────────────────────────────

await test("dom: onWheel hears the wheel over its view, with the deltas", async () => {
  await page.mouse.move(470, 60);
  await page.mouse.wheel({ deltaY: 40 });
  await page.waitForFunction(() => window.__app.wdy === 40, { timeout: 5000 });
});

await test("dom: a trackpad pinch arrives on the wheel stream with `pinch` set", async () => {
  await page.evaluate(() => {
    document.elementFromPoint(470, 60).dispatchEvent(new WheelEvent("wheel", {
      deltaY: -20, ctrlKey: true, bubbles: true, cancelable: true, clientX: 470, clientY: 60,
    }));
  });
  await page.waitForFunction(() => window.__app.wpinch === true && window.__app.wdy === -20, { timeout: 5000 });
});

await test("dom: an intervening scroller keeps its wheel — delegation beats the claim", async () => {
  const before = await page.evaluate(() => window.__app.wdy);
  await page.mouse.move(460, 200);
  await page.mouse.wheel({ deltaY: 60 });
  await page.waitForFunction(() => window.__app.zoomer.pane.scrollY > 0, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__app.wdy), before, "the claimant never heard it");
});

await test("dom: while pinch-zoomed, scroller containment yields to viewport panning", async () => {
  // The measured iOS trap (2026-07-28): zoomed panning is scroll chaining, so
  // a full-height pane's `overscroll-behavior: contain` makes the app's bottom
  // band unreachable at any zoom > 1. The runtime relaxes scrollers exactly
  // while zoomed, via a document class driven by the visualViewport scale.
  const cdp = await page.createCDPSession();
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await page.waitForFunction(() => document.documentElement.classList.contains("declare-zoomed"), { timeout: 5000 });
  const zoomed = await page.evaluate(() => {
    const sc = document.querySelector("[data-declare-scroll]");
    const cs = getComputedStyle(sc);
    return { ob: cs.overscrollBehaviorY ?? cs.overscrollBehavior, ta: cs.touchAction };
  });
  assert.equal(zoomed.ob, "auto", "containment relaxed while zoomed");
  assert.equal(zoomed.ta, "auto", "panning unrestricted while zoomed");
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("declare-zoomed"), { timeout: 5000 });
  const back = await page.evaluate(() => {
    const sc = document.querySelector("[data-declare-scroll]");
    const cs = getComputedStyle(sc);
    return { ob: cs.overscrollBehaviorY ?? cs.overscrollBehavior, ta: cs.touchAction };
  });
  assert.equal(back.ob, "contain", "containment restored at scale 1");
  assert.ok(back.ta.includes("pan-y"), "delegation value restored at scale 1");
  await cdp.detach();
});

// ── Canvas: the same contract at one shared element ─────────────────────────

await open("/canvas-claims");

await test("canvas: the shared element carries the root default `manipulation`", async () => {
  const ta = await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).touchAction);
  assert.equal(ta, "manipulation");
});

await test("canvas: a touch landing on the raw-touch view is claimed at touchstart", async () => {
  const prevented = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const touch = new Touch({ identifier: 1, target: canvas, clientX: 280, clientY: 70 });
    const p = !canvas.dispatchEvent(new TouchEvent("touchstart", {
      touches: [touch], changedTouches: [touch], bubbles: true, cancelable: true,
    }));
    // lift the finger — a claim lives exactly as long as its gesture
    canvas.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [touch], bubbles: true }));
    return p;
  });
  assert.equal(prevented, true);
});

await test("canvas: a single-finger move over the drag claimant is suppressed; a landing elsewhere is not", async () => {
  const r = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const fire = (type, x, y, cancelable) => {
      const touch = new Touch({ identifier: 9, target: canvas, clientX: x, clientY: y });
      return !canvas.dispatchEvent(new TouchEvent(type, {
        touches: [touch], changedTouches: [touch], bubbles: true, cancelable,
      }));
    };
    const end = () => canvas.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [], bubbles: true }));
    // over the drag view: start unclaimed (a tap must stay cheap), move claimed
    const startedOnDrag = fire("touchstart", 100, 70, true);
    const movedOnDrag = fire("touchmove", 104, 74, true);
    end();
    // over dead background: neither
    const startedOnBg = fire("touchstart", 320, 380, true);
    const movedOnBg = fire("touchmove", 324, 384, true);
    end();
    return { startedOnDrag, movedOnDrag, startedOnBg, movedOnBg };
  });
  assert.deepEqual(r, { startedOnDrag: false, movedOnDrag: true, startedOnBg: false, movedOnBg: false });
});

await test("canvas: onWheel hears the wheel; an intervening scroller keeps its own", async () => {
  const wheel = (x, y, deltaY, ctrlKey = false) => page.evaluate(([px, py, dy, ck]) => {
    document.querySelector("canvas").dispatchEvent(new WheelEvent("wheel", {
      deltaY: dy, ctrlKey: ck, bubbles: true, cancelable: true, clientX: px, clientY: py,
    }));
  }, [x, y, deltaY, ctrlKey]);
  await wheel(470, 60, 40);
  await page.waitForFunction(() => window.__app.wdy === 40, { timeout: 5000 });
  await wheel(470, 60, -20, true); // a trackpad pinch is a ctrlKey wheel
  await page.waitForFunction(() => window.__app.wpinch === true && window.__app.wdy === -20, { timeout: 5000 });
  const before = await page.evaluate(() => window.__app.wdy);
  await wheel(460, 200, 60);
  await page.waitForFunction(() => window.__app.zoomer.pane.scrollY > 0, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__app.wdy), before, "the claimant never heard it");
});

// ── The focus-zoom lock ─────────────────────────────────────────────────────

await open("/dom-lock");

await test("full gesture control: the App's touch claim reaches the root — `none`", async () => {
  const ta = await page.evaluate(() => getComputedStyle(document.querySelector("[data-declare-app]")).touchAction);
  assert.equal(ta, "none");
});

await test("full gesture control: focus locks the viewport, blur releases it", async () => {
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="viewport"]')), null, "no meta before focus");
  await page.mouse.click(120, 35); // into the field
  await page.waitForFunction(
    () => (document.querySelector('meta[name="viewport"]')?.content ?? "").includes("maximum-scale=1"),
    { timeout: 5000 });
  await page.mouse.click(500, 300); // outside — tap-to-dismiss blurs
  await page.waitForFunction(() => document.querySelector('meta[name="viewport"]') === null, { timeout: 5000 });
});

await browser.close();
server.close();
summarize("gesture");
