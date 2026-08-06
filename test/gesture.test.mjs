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
//   - a scroller DELEGATES both axes (`manipulation`) with per-axis
//     containment: it declares which axis IT scrolls, never that the other
//     is forbidden — the cross axis belongs to the enclosing regime;
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
    sawX: number = -1,
    sawY: number = -1,
    drag: View [ x = 20, y = 20, width = 160, height = 100, fill = #334455,
        onPointerDown() { app.sawX = app.pointerX; app.sawY = app.pointerY },
        onPointerMove(e: PointerEvent) { },
        ],
    xdrag: View [ x = 200, y = 140, width = 160, height = 100, fill = #38495A, claim = x,
        onPointerMove(e: PointerEvent) { },
        ],
    mesa: View [ x = 200, y = 20, width = 160, height = 100, fill = #445566,
        onTouchStart(e: TouchEvent) { },
        ],
    holddrag: View [ x = 20, y = 140, width = 160, height = 100, fill = #405060,
        onHold(e: PointerEvent) { },
        onPointerMove(e: PointerEvent) { },
        ],
    zoomer: View [ x = 380, y = 20, width = 200, height = 300, fill = #2E3A45,
        onWheel(e: WheelEvent) { app.wdx = e.deltaX; app.wdy = e.deltaY; app.wpinch = e.pinch },
        pane: View [ x = 20, y = 120, width = 160, height = 120, fill = #3A4855, scrolls = y,
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

// THE PAGE SHAPE (ruled 2026-07-29): an App scrolls by default and its
// scroller is the page — chrome opts out with ignoreScroll; a pane inside
// carries its own regime with its own sticky frame; a child parked beyond the
// cross axis is out of frame and adds nothing.
const PAGE_RAW = `App [ fill = #202830,
    bar: View [ ignoreScroll = true, width = { app.width }, height = 56, fill = #10202C ],
    column: View [ y = 56, width = { app.width }, height = 3000, fill = #223344,
        pane: View [ x = 40, y = 300, width = 300, height = 200, fill = #3A4855, scrolls = y,
            tall: View [ x = 0, y = 0, width = 300, height = 900, fill = #46586A ],
            tool: View [ ignoreScroll = true, x = 8, y = 8, width = 80, height = 24, fill = #FFAA00 ],
            ],
        ],
    parked: View [ x = { app.width + 40 }, y = 100, width = 200, height = 200, fill = #FF0000 ],
    ]`;

const claimsCompiled = compile(CLAIMS_RAW);
assert.deepEqual(claimsCompiled.errors, [], "claims fixture compiles clean");
const lockCompiled = compile(LOCK_RAW);
assert.deepEqual(lockCompiled.errors, [], "lock fixture compiles clean");

const pageHtml = (backendClass, source, { embedded = false } = {}) => `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
${embedded ? '<div data-declare-app="1"><div id="host"></div></div>' : '<div id="host"></div>'}
<script type="module">
  import { render, ${backendClass} } from "/dist/index.js";
  window.__app = render(${JSON.stringify(source)}, document.getElementById("host"), new ${backendClass}());
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__rendered = true; }));
</script>`;

const pageCompiled = compile(PAGE_RAW);
assert.deepEqual(pageCompiled.errors, [], "page fixture compiles clean");

// Selection realization on a COARSE pointer (claim-surface.md): explicit
// `user-select: text` islands inside a `none` page feed iOS's pan-stealing
// text gesture, so on touch devices selection stays at web defaults.
const COARSE_RAW = `App [ width = 640, height = 400, fill = #202830,
    label: Text [ x = 20, y = 20, text = "selectable prose", selectable = true ],
    ]`;
const coarseCompiled = compile(COARSE_RAW);
assert.deepEqual(coarseCompiled.errors, [], "coarse fixture compiles clean");

// THE SUBTRACTIVE SELECTION REALIZATION (ruled 2026-07-30): `none` on exactly
// the text leaves whose effective `selectable` is false, platform defaults +
// the stamp on the rest, `text` never written on painted content — one
// realization for both pointer kinds. Markdown carries the flow-species
// default (a document is selectable unless somebody says otherwise).
const SEL_RAW = `App [ width = 640, height = 700, fill = #202830,
    prose: Text [ x = 20, y = 20, text = "selectable prose", selectable = true ],
    label: Text [ x = 20, y = 60, text = "plain label" ],
    doc: Markdown [ x = 20, y = 100, width = 300, text = "a **document** paragraph" ],
    card: View [ x = 20, y = 300, width = 300, height = 120, fill = #334455, selectable = false,
        vetoed: Markdown [ width = 280, text = "a vetoed document" ],
        onClick() { },
        ],
    ]`;
const selCompiled = compile(SEL_RAW);
assert.deepEqual(selCompiled.errors, [], "selection fixture compiles clean");

// THE SCROLL-AWARE WALK (ruled 2026-07-30): hovered/pressed hit where things
// PAINT, at any page or pane scroll; ignoreScroll chrome hits at its frame.
const WALK_RAW = `App [ fill = #202830,
    hd: boolean = { this.deep.hovered },
    pd: boolean = { this.deep.pressed },
    hbar: boolean = { this.bar.hovered },
    hi: boolean = { this.column.pane.inner.hovered },
    bar: View [ ignoreScroll = true, width = { app.width }, height = 40, fill = #10202C ],
    column: View [ y = 40, width = { app.width }, height = 3000, fill = #223344,
        pane: View [ x = 40, y = 1200, width = 300, height = 200, fill = #445566, scrolls = y, scrollY = 240,
            inner: View [ x = 0, y = 400, width = 300, height = 60, fill = #66AA88 ],
            tail: View [ x = 0, y = 800, width = 300, height = 40, fill = #223344 ] ],
        ],
    deep: View [ x = 40, y = 900, width = 200, height = 60, fill = #3A4855,
        onClick() { } ],
    ]`;
const walkCompiled = compile(WALK_RAW);
assert.deepEqual(walkCompiled.errors, [], "walk fixture compiles clean");

// ── The iOS missing-cancel takeover (input.ts scroll-takeover detector) ─────
// Measured on the simulator (iOS 18.2, tools/internal/sim + ?probe): when an
// interior pane takes a live finger's gesture, iOS Safari sends NO
// pointercancel and NO touchcancel — scroll events simply begin mid-press,
// and the finger later lifts with a CLEAN pointerup. The router synthesizes
// the documented `e.canceled` release from the scroll itself; these pins
// hold the synthesis, the trailing-up swallow, the mouse immunity, and the
// containment guard — in Chrome, by hand-dispatching iOS's event order
// (Chrome's own gesture engine would have said pointercancel).
const TAKEOVER_RAW = `App [ width = 640, height = 400, fill = #202830,
    upClean: number = 0,
    upCanceled: number = 0,
    tEnds: number = 0,
    tCancels: number = 0,
    pane: View [ x = 20, y = 20, width = 300, height = 300, fill = #3A4855, scrolls = y,
        chip: View [ x = 10, y = 10, width = 120, height = 40, fill = #607080,
            onHold(e: PointerEvent) { },
            onPointerMove(e: PointerEvent) { },
            onPointerUp(e: PointerUpEvent) {
                if (e.canceled) app.upCanceled = app.upCanceled + 1;
                else app.upClean = app.upClean + 1;
            },
            ],
        tall: View [ x = 0, y = 60, width = 300, height = 900, fill = #46586A ],
        ],
    mesa: View [ x = 360, y = 20, width = 200, height = 200, fill = #445566,
        onTouchStart(e: TouchEvent) { },
        onTouchEnd(e: TouchEvent) { app.tEnds = app.tEnds + 1 },
        onTouchCancel(e: TouchEvent) { app.tCancels = app.tCancels + 1 },
        ],
    ]`;
const takeoverCompiled = compile(TAKEOVER_RAW);
assert.deepEqual(takeoverCompiled.errors, [], "takeover fixture compiles clean");

const pages = {
  "/dom-claims": pageHtml("DomBackend", claimsCompiled.source),
  "/dom-takeover": pageHtml("DomBackend", takeoverCompiled.source),
  "/canvas-claims": pageHtml("CanvasBackend", claimsCompiled.source),
  "/dom-lock": pageHtml("DomBackend", lockCompiled.source),
  "/dom-page": pageHtml("DomBackend", pageCompiled.source),
  "/canvas-page": pageHtml("CanvasBackend", pageCompiled.source),
  // the CLAIMS app (fits its box) mounted INSIDE a marked host app — the
  // embedded-island root default, both backends
  "/dom-embedded": pageHtml("DomBackend", claimsCompiled.source, { embedded: true }),
  "/canvas-embedded": pageHtml("CanvasBackend", claimsCompiled.source, { embedded: true }),
  "/dom-coarse": pageHtml("DomBackend", coarseCompiled.source),
  "/dom-selection": pageHtml("DomBackend", selCompiled.source),
  "/dom-walk": pageHtml("DomBackend", walkCompiled.source),
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

await test("dom: the root default keys on page-scrollability — a fits-the-host app retires pan, keeps pinch", async () => {
  // 640×400 in an 800×600 viewport: the page has nowhere to go, so pan
  // retires (stilling the rubber-band) and pinch stays the user's. The old
  // unconditional root `none` stays repealed either way.
  const ta = await page.evaluate(() => getComputedStyle(document.querySelector("[data-declare-app]")).touchAction);
  assert.equal(ta, "pinch-zoom");
});

await test("dom: geometry, never an attribute, drives the root default — grow the app and pan returns", async () => {
  await page.evaluate(() => { window.__app.height = 2000; });
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("[data-declare-app]")).touchAction === "manipulation",
    { timeout: 5000 });
  await page.evaluate(() => { window.__app.height = 400; });
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("[data-declare-app]")).touchAction === "pinch-zoom",
    { timeout: 5000 });
});

await test("dom+canvas: an EMBEDDED island's root default never retires pan — `manipulation`", async () => {
  // The same fits-its-box app that reads `pinch-zoom` top-level (above): as
  // an island inside a host app, the finger belongs to the HOST page's
  // regime — pan and pinch chain to it; only double-tap zoom retires.
  await open("/dom-embedded");
  const domTa = await page.evaluate(() => getComputedStyle(document.querySelector("#host [data-declare-app]")).touchAction);
  assert.equal(domTa, "manipulation");
  await open("/canvas-embedded");
  const cvTa = await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).touchAction);
  assert.equal(cvTa, "manipulation");
  await open("/dom-claims"); // restore the suite's working page
});

await test("dom: a coarse pointer keeps selection at web defaults — no explicit user-select anywhere", async () => {
  // The iOS pan-theft (claim-surface.md): explicit `text` islands inside a
  // `none` page make drags select instead of pan. On a touch device the root
  // never writes `none` and `selectable` writes no explicit `text`.
  const tp = await browser.newPage();
  await tp.setViewport({ width: 800, height: 600, hasTouch: true, isMobile: true });
  await tp.goto(`${B}/dom-coarse`, { waitUntil: "networkidle2", timeout: 30000 });
  await tp.waitForFunction(() => window.__rendered === true, { timeout: 15000 });
  const r = await tp.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches,
    rootUS: document.querySelector("[data-declare-app]").style.userSelect || "(unset)",
    explicit: [...document.querySelectorAll("*")].some(
      (el) => el.style.userSelect === "text" && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA"),
  }));
  await tp.close();
  assert.equal(r.coarse, true, "fixture page must emulate a coarse pointer");
  assert.notEqual(r.rootUS, "none");
  assert.equal(r.explicit, false);
});

await test("dom: the subtractive selection realization — `none` on unselectable leaves, defaults + stamp elsewhere, `text` never", async () => {
  const tp = await browser.newPage();
  await tp.goto(`${B}/dom-selection`, { waitUntil: "networkidle2", timeout: 30000 });
  await tp.waitForFunction(() => window.__rendered === true, { timeout: 15000 });
  const r = await tp.evaluate(() => {
    const root = document.querySelector("[data-declare-app]");
    const runs = [...root.querySelectorAll("span")].filter((el) => el.textContent.trim().length > 0);
    const prose = runs.find((el) => el.textContent === "selectable prose");
    const label = runs.find((el) => el.textContent === "plain label");
    // The rich HOST is the flow's own element — the <p>'s direct parent (an
    // ancestor div would match a textContent probe and read unstamped).
    const hosts = [...root.querySelectorAll("p")].map((p) => p.parentElement);
    const doc = hosts.find((el) => el.textContent.includes("document paragraph"));
    const vetoed = hosts.find((el) => el.textContent.includes("vetoed document"));
    return {
      rootUS: root.style.userSelect || "(unset)",
      tapFlash: root.style.webkitTapHighlightColor,
      textWrittenAnywhere: [...root.querySelectorAll("*")].some(
        (el) => el.style.userSelect === "text" && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA"),
      prose: { us: prose.style.userSelect || "(unset)", stamped: prose.dataset.declareSelectable === "1", pe: getComputedStyle(prose).pointerEvents },
      label: { us: label.style.userSelect, stamped: "declareSelectable" in label.dataset },
      doc: { us: doc.style.userSelect || "(unset)", stamped: doc.dataset.declareSelectable === "1" },
      vetoed: { us: vetoed.style.userSelect, stamped: "declareSelectable" in vetoed.dataset },
    };
  });
  await tp.close();
  assert.equal(r.rootUS, "(unset)", "the root writes no user-select at all");
  assert.equal(r.tapFlash, "transparent", "the tap flash retires at the root — a painted UI draws its own feedback");
  assert.equal(r.textWrittenAnywhere, false, "`text` is never written on painted content");
  assert.deepEqual(r.prose, { us: "(unset)", stamped: true, pe: "auto" }, "selectable Text: platform default + the stamp + a pointer target");
  assert.deepEqual(r.label, { us: "none", stamped: false }, "unselectable Text: leaf `none`, no stamp");
  assert.deepEqual(r.doc, { us: "(unset)", stamped: true }, "Markdown with no declaration: the flow-species default — a document selects");
  assert.deepEqual(r.vetoed, { us: "none", stamped: false }, "…and one `selectable = false` provision on the card vetoes it");
});

await test("dom: hovered/pressed hit where things PAINT — page scroll, pane scroll, ignoreScroll chrome", async () => {
  const tp = await browser.newPage();
  await tp.goto(`${B}/dom-walk`, { waitUntil: "networkidle2", timeout: 30000 });
  await tp.waitForFunction(() => window.__rendered === true, { timeout: 15000 });
  const flags = () => tp.evaluate(() => ({
    hd: window.__app.hd, pd: window.__app.pd, hbar: window.__app.hbar, hi: window.__app.hi,
    scrollY: window.scrollY,
  }));
  // Page scrolled: the deep button paints near the viewport top — hover and press it there.
  await tp.evaluate(() => window.scrollTo(0, 800));
  const rect = await tp.evaluate(() => {
    const r = window.__app.deep.surface.element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await tp.mouse.move(rect.x, rect.y);
  let f = await flags();
  assert.equal(f.hd, true, `deep hovers at its painted position (scrollY=${f.scrollY})`);
  await tp.mouse.down();
  f = await flags();
  assert.equal(f.pd, true, "and presses there");
  await tp.mouse.up();
  // The fixed bar, same scroll.
  await tp.mouse.move(100, 20);
  f = await flags();
  assert.equal(f.hbar, true, "ignoreScroll chrome hovers at its frame position");
  assert.equal(f.hd, false, "the content view a scroll away does not");
  // A pane-interior view, pane scrolled while the page is too.
  await tp.evaluate(() => {
    window.__app.column.pane.surface.element.scrollTop = 390;
  });
  const irect = await tp.evaluate(() => {
    const r = window.__app.column.pane.inner.surface.element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await tp.mouse.move(irect.x, irect.y);
  f = await flags();
  assert.equal(f.hi, true, "a scrolled pane's content hovers where it paints");
  // viewAt keeps the CONTENT-space contract (the drag pairing) at any scroll.
  const va = await tp.evaluate(() => {
    const app = window.__app;
    return { deep: app.viewAt(140, 930) === app.deep, chrome: app.viewAt(140, 930 - window.scrollY) !== app.deep };
  });
  assert.equal(va.deep, true, "viewAt(contentX, contentY) answers the painted view");
  await tp.close();
});

await test("dom: onPointerMove claims the drag, keeps pinch — `pinch-zoom`", async () => {
  assert.equal((await styleAt(100, 70)).touchAction, "pinch-zoom");
});

await test("dom: the AXIS-SCOPED claim (claim = x) keeps vertical pan — `pan-y pinch-zoom` (D8, claim-surface.md)", async () => {
  // The datagrid forcing case: a horizontal drag owns x while the page keeps
  // vertical pan — the browser's own arbitration runs the cross axis.
  assert.equal((await styleAt(280, 190)).touchAction, "pan-y pinch-zoom");
});

await test("dom: a TOUCH press lands app.pointerX/Y before onPointerDown fires", async () => {
  // A touch arrives with no prior move (a mouse always moves first, masking
  // the order): if the environment's coordinate write bubbled instead of
  // capturing, every delta-based drag would launch from the PREVIOUS
  // gesture's coordinates — the window-teleport bug (simulator 2026-07-29).
  await page.evaluate(() => { window.__app.sawX = -1; window.__app.sawY = -1; });
  const cdp = await page.createCDPSession();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 130, y: 60 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  const saw = await page.evaluate(() => [window.__app.sawX, window.__app.sawY]);
  assert.deepEqual(saw, [130, 60]);
});

await test("dom: a drag view suppresses the platform's long-press defaults on itself", async () => {
  // Selection and the iOS callout fire on the same stationary press as a
  // hold — a drag view (immediate or hold-gated) must not lose that race
  // (claim-surface.md; measured on the simulator: a title-bar hold-drag
  // became a text selection). Per-element: the page around it stays native.
  const r = await page.evaluate(() => {
    const drag = document.elementFromPoint(100, 70);   // the immediate-drag view
    const hold = document.elementFromPoint(100, 190);  // the hold-gated view
    const s1 = drag.style, s2 = hold.style;
    return { drag: [s1.userSelect, s1.webkitTouchCallout], hold: [s2.userSelect, s2.webkitTouchCallout] };
  });
  assert.deepEqual(r.drag, ["none", "none"]);
  assert.deepEqual(r.hold, ["none", "none"]);
});

await test("dom: the raw touch family claims every finger — `none`", async () => {
  assert.equal((await styleAt(280, 70)).touchAction, "none");
});

await test("dom: onWheel is not a touch claim — no touch-action of its own", async () => {
  // The zoomer inherits the root's effective policy; its own computed value is
  // the CSS initial `auto` (touch suppression rides the ancestor chain).
  assert.equal((await styleAt(470, 60)).touchAction, "auto");
});

await test("dom: a scroller delegates BOTH axes — the cross axis belongs to the enclosing regime", async () => {
  // A pane declares which axis IT scrolls; it never declares that the other
  // axis is forbidden. `pan-y pinch-zoom` did exactly that — measured on the
  // desktop (2026-07-31): a `scrolls = y` Files column inside an 800px stage
  // on a 402px phone forbade the horizontal pan that was the only way to
  // reach the rest of the stage. `manipulation` permits both pans (plus
  // pinch), so the browser routes each axis to the nearest ancestor that
  // scrolls it — which is what scroll chaining IS.
  assert.equal((await styleAt(460, 200)).touchAction, "manipulation");
});

await test("dom: overscroll containment is PER-AXIS — the undeclared axis chains out", async () => {
  // `contain` keeps a pane's own rubber-band off the page (the
  // keeps-to-its-frame ruling) — but only on an axis the pane actually
  // scrolls. On the other axis it has no scroll of its own to contain, and
  // containment only severed the outer regime.
  const r = await page.evaluate(() => {
    const el = document.elementFromPoint(460, 200).closest("[data-declare-scroll]");
    const s = getComputedStyle(el);
    return { x: s.overscrollBehaviorX, y: s.overscrollBehaviorY, scrolls: el.style.overflowY };
  });
  assert.equal(r.scrolls, "auto", "fixture pane scrolls y");
  assert.equal(r.y, "contain", "the declared axis keeps to its frame");
  assert.equal(r.x, "auto", "the undeclared axis chains to whatever encloses it");
});

await test("dom: onHold + drag handlers = the HOLD-GATED claim — nothing at touchdown", async () => {
  // The pair claims the finger at the hold, so the element carries NO
  // touch-action of its own (the quick swipe stays the browser's pan).
  assert.equal((await styleAt(100, 190)).touchAction, "auto");
});

await test("dom: the hold-gated claim engages at the hold — post-hold touchmoves are suppressed", async () => {
  await page.evaluate(() => {
    window.__tmPrevented = null;
    window.addEventListener("touchmove", (e) => { window.__tmPrevented = e.defaultPrevented; }, { passive: true });
  });
  // Press and WAIT past the hold window (500ms), then move: the claim is live
  // and the browser's pan is kept out.
  await page.touchscreen.touchStart(100, 190);
  await new Promise((r) => setTimeout(r, 800));
  await page.touchscreen.touchMove(140, 240);  // well past every slop, so the move dispatches
  await new Promise((r) => setTimeout(r, 100));
  const held = await page.evaluate(() => window.__tmPrevented);
  await page.touchscreen.touchEnd();
  assert.equal(held, true, "post-hold move belongs to the app");
  // Control: press and move IMMEDIATELY — no hold, no claim, the browser keeps it.
  await page.evaluate(() => { window.__tmPrevented = null; });
  await page.touchscreen.touchStart(100, 190);
  await page.touchscreen.touchMove(120, 220);
  await new Promise((r) => setTimeout(r, 100));
  const quick = await page.evaluate(() => window.__tmPrevented);
  await page.touchscreen.touchEnd();
  assert.equal(quick, false, "a quick swipe stays the browser's");
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
  assert.equal(back.ob, "contain", "containment restored at scale 1 (on the axis it scrolls)");
  assert.equal(back.ta, "manipulation", "delegation value restored at scale 1");
  await cdp.detach();
});

// ── Canvas: the same contract at one shared element ─────────────────────────

await open("/canvas-claims");

await test("canvas: the shared element carries the same size-keyed root default", async () => {
  const ta = await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).touchAction);
  assert.equal(ta, "pinch-zoom");
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

// ── The page shape: App scrolls as the document; ignoreScroll rides frames ──

await open("/dom-page");

await test("dom: the App's content scrolls as the PAGE — the document owns the extent", async () => {
  const r = await page.evaluate(() => {
    const rootEl = document.querySelector("[data-declare-app]");
    return {
      docH: document.documentElement.scrollHeight,
      docW: document.documentElement.scrollWidth,
      rootOv: getComputedStyle(rootEl).overflow,
      elH: rootEl.getBoundingClientRect().height,
      rootTA: getComputedStyle(rootEl).touchAction,
    };
  });
  // v3 realization (the WebKit-safe one): the root ELEMENT is sized to the
  // content extent on the declared axis — the box itself is the scroll range —
  // and `overflow: clip` holds exact frame containment on every other axis
  assert.ok(r.elH >= 3000, `the root element realizes the extent (got ${r.elH})`);
  assert.ok(r.docH >= 3000, `so the content extends the document (got ${r.docH})`);
  assert.equal(r.rootOv, "clip", "containment is uniform overflow:clip — no per-axis pair");
  assert.equal(r.docW, 800, "the cross axis is out of frame — the parked child adds no width");
  assert.equal(r.rootTA, "manipulation", "a scrollable page keeps pan with the user");
});

await test("dom: ignoreScroll chrome rides the window — fixed through a real page scroll, no extent added", async () => {
  const r = await page.evaluate(async () => {
    const bar = [...document.querySelectorAll("[data-declare-ignorescroll]")]
      .find((el) => el.getBoundingClientRect().height === 56);
    const before = bar.getBoundingClientRect().top;
    window.scrollTo({ top: 500 });
    await new Promise((res) => setTimeout(res, 300));
    return { pos: bar.style.position, before, after: bar.getBoundingClientRect().top, scrollY: window.__app.scrollY };
  });
  assert.equal(r.pos, "fixed");
  assert.equal(r.before, 0);
  assert.equal(r.after, 0, "the bar held still while the page moved");
  assert.equal(r.scrollY, 500, "app.scrollY mirrors the page scroll");
  await page.evaluate(() => window.scrollTo({ top: 0 }));
});

await test("dom: a DECLARED initial scroll offset actually lands", async () => {
  // `attach` builds the tree DETACHED and attachRoot inserts it afterwards, so
  // during attach a scroller has no layout and nothing to scroll: the push that
  // rode `scrollY`'s own attribute write clamped to zero, and the write's
  // equality gate then made the value permanently unreachable — the attribute
  // read 120 while the surface sat at 0, and no later assignment of 120 could
  // ever reconcile them. Found 2026-07-31 writing a native probe that needed a
  // scrolled pane to mean anything and silently got an unscrolled one.
  const tp = await browser.newPage();
  await tp.goto(`${B}/dom-walk`, { waitUntil: "networkidle2", timeout: 30000 });
  await tp.waitForFunction(() => window.__rendered === true, { timeout: 15000 });
  const r = await tp.evaluate(() => {
    const pane = window.__app.column.pane;
    const el = pane.surface.element;
    return { attr: pane.scrollY, dom: el.scrollTop,
             innerTop: Math.round(pane.inner.surface.element.getBoundingClientRect().top),
             paneTop: Math.round(el.getBoundingClientRect().top) };
  });
  await tp.close();
  assert.equal(r.attr, 240, "the fixture declares scrollY = 240");
  assert.equal(r.dom, 240, "…and the surface is actually scrolled there, not clamped to 0");
  assert.equal(r.innerTop - r.paneTop, 400 - 240, "content sits at its declared offset minus the scroll");
});

await test("dom: page-regime chrome is never STRANDED in a pane's sticky frame", async () => {
  // Adoption into a sticky frame is a DOM move, and it used to be one-way. At
  // attach the app root is not yet stamped `data-declare-app`, so
  // applyScrollStyle takes its PANE branch and marks it `data-declare-scroll`
  // — every ignoreScroll child was adopted into a frame, and nothing moved
  // them back once attachRoot re-resolved them to the page regime. The result
  // was `position: fixed` chrome painting inside a `position: sticky`
  // stacking context clipped by the root's `overflow: clip`: it composites
  // correctly most of the time, and on an iPad in landscape the homepage's
  // header intermittently vanished or painted below a gap (2026-07-31).
  const r = await page.evaluate(() => {
    const root = document.querySelector("[data-declare-app]");
    const chrome = [...root.querySelectorAll("[data-declare-ignorescroll]")];
    const inFrame = (el) => el.parentElement?.dataset.declareScrollframe !== undefined;
    const pane = root.querySelector("[data-declare-scroll]");
    const paneChrome = [...pane.querySelectorAll("[data-declare-ignorescroll]")];
    return {
      pageChrome: chrome.filter((el) => !paneChrome.includes(el))
        .map((el) => ({ stranded: inFrame(el), pos: el.style.position })),
      paneChrome: paneChrome.map((el) => ({ inFrame: inFrame(el), pos: el.style.position })),
      emptyFramesLeftBehind: [...root.querySelectorAll("[data-declare-scrollframe]")]
        .filter((f) => f.childElementCount === 0).length,
    };
  });
  for (const c of r.pageChrome) {
    assert.equal(c.stranded, false, "page chrome sits under its own parent, not a frame");
    assert.equal(c.pos, "fixed", "…and is viewport-fixed");
  }
  assert.ok(r.paneChrome.length > 0, "fixture has pane chrome too");
  for (const c of r.paneChrome) assert.equal(c.inFrame, true, "pane chrome DOES ride its pane's frame");
  assert.equal(r.emptyFramesLeftBehind, 0, "an adopt-nobody frame is cleaned up");
});

await test("dom: a pane's ignoreScroll toolbar rides the pane's frame (the sticky frame)", async () => {
  const r = await page.evaluate(async () => {
    const pane = [...document.querySelectorAll("[data-declare-scroll]")][0];
    const frame = pane.querySelector("[data-declare-scrollframe]");
    const tool = frame === null ? null : frame.querySelector("[data-declare-ignorescroll]");
    const before = tool.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    pane.scrollTop = 400;
    await new Promise((res) => setTimeout(res, 250));
    const after = tool.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    return { hasFrame: frame !== null, inFrame: tool !== null, before, after,
      sticky: frame !== null ? getComputedStyle(frame).position : null,
      sh: pane.scrollHeight };
  });
  assert.equal(r.hasFrame, true, "the pane grew its sticky frame");
  assert.equal(r.inFrame, true, "the toolbar moved into it");
  assert.equal(r.sticky, "sticky");
  assert.equal(r.before, 8, "at the frame origin before scrolling");
  assert.equal(r.after, 8, "…and still there after — it rides the frame");
  assert.ok(r.sh >= 900, "the pane still scrolls its tall content");
});

await open("/canvas-page");

await test("canvas: the same page shape — fixed canvas, strut-carried extent, same root default", async () => {
  const r = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const strut = [...document.getElementById("host").children].find((c) => c.tagName === "DIV");
    return { pos: canvas.style.position, ta: getComputedStyle(canvas).touchAction,
      strutH: strut !== undefined ? parseInt(strut.style.height, 10) : -1,
      docH: document.documentElement.scrollHeight };
  });
  assert.equal(r.pos, "fixed", "the canvas rides the viewport");
  assert.equal(r.ta, "manipulation");
  assert.ok(r.strutH >= 3000, `the strut carries the content extent (got ${r.strutH})`);
  assert.ok(r.docH >= 3000, "so the document scrolls");
});

await test("canvas: scrolling the page moves the content but not the ignoreScroll chrome", async () => {
  const r = await page.evaluate(async () => {
    window.scrollTo({ top: 500 });
    await new Promise((res) => setTimeout(res, 350));
    const app = window.__app;
    // the root surface mirrors the window scroll as its pane offset
    return { offset: app.surface.scrollOffset, scrollY: app.scrollY };
  });
  assert.equal(r.offset, 500, "the root pane offset mirrors the window");
  assert.equal(r.scrollY, 500);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
});

await test("dom: hovered/pressed hit where things PAINT — page scroll, pane scroll, ignoreScroll chrome", async () => {
  const tp = await browser.newPage();
  await tp.goto(`${B}/dom-walk`, { waitUntil: "networkidle2", timeout: 30000 });
  await tp.waitForFunction(() => window.__rendered === true, { timeout: 15000 });
  const flags = () => tp.evaluate(() => ({
    hd: window.__app.hd, pd: window.__app.pd, hbar: window.__app.hbar, hi: window.__app.hi,
    scrollY: window.scrollY,
  }));
  // Page scrolled: the deep button paints near the viewport top — hover and press it there.
  await tp.evaluate(() => window.scrollTo(0, 800));
  const rect = await tp.evaluate(() => {
    const r = window.__app.deep.surface.element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await tp.mouse.move(rect.x, rect.y);
  let f = await flags();
  assert.equal(f.hd, true, `deep hovers at its painted position (scrollY=${f.scrollY})`);
  await tp.mouse.down();
  f = await flags();
  assert.equal(f.pd, true, "and presses there");
  await tp.mouse.up();
  // The fixed bar, same scroll.
  await tp.mouse.move(100, 20);
  f = await flags();
  assert.equal(f.hbar, true, "ignoreScroll chrome hovers at its frame position");
  assert.equal(f.hd, false, "the content view a scroll away does not");
  // A pane-interior view, pane scrolled while the page is too.
  await tp.evaluate(() => {
    window.__app.column.pane.surface.element.scrollTop = 390;
  });
  const irect = await tp.evaluate(() => {
    const r = window.__app.column.pane.inner.surface.element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await tp.mouse.move(irect.x, irect.y);
  f = await flags();
  assert.equal(f.hi, true, "a scrolled pane's content hovers where it paints");
  // viewAt keeps the CONTENT-space contract (the drag pairing) at any scroll.
  const va = await tp.evaluate(() => {
    const app = window.__app;
    return { deep: app.viewAt(140, 930) === app.deep, chrome: app.viewAt(140, 930 - window.scrollY) !== app.deep };
  });
  assert.equal(va.deep, true, "viewAt(contentX, contentY) answers the painted view");
  await tp.close();
});

// ── The scroll-takeover detector: iOS's missing cancel, synthesized ─────────

await open("/dom-takeover");

// The suite's shorthand: press with a given pointer on the element at a
// point (dispatching ON the element, so the router's containment guard sees
// a real pressed target), and scroll the pane by writing scrollTop (Chrome
// then fires the same async scroll event iOS emits during a pan takeover).
const press = (x, y, id, type) => page.evaluate(([px, py, pid, pt]) => {
  const el = document.elementFromPoint(px, py);
  el.dispatchEvent(new PointerEvent("pointerdown", {
    pointerId: pid, pointerType: pt, isPrimary: true,
    clientX: px, clientY: py, button: 0, buttons: 1, bubbles: true,
  }));
}, [x, y, id, type]);
const lift = (x, y, id, type) => page.evaluate(([px, py, pid, pt]) => {
  window.dispatchEvent(new PointerEvent("pointerup", {
    pointerId: pid, pointerType: pt, isPrimary: true,
    clientX: px, clientY: py, bubbles: true,
  }));
}, [x, y, id, type]);
const scrollPane = (top) => page.evaluate((t) => {
  const pane = [...document.querySelectorAll("div")]
    .find((d) => d.clientHeight > 0 && d.scrollHeight > d.clientHeight + 10);
  pane.scrollTop = t;
}, top);
const counters = () => page.evaluate(() => ({
  u: window.__app.upClean, c: window.__app.upCanceled,
  te: window.__app.tEnds, tc: window.__app.tCancels,
}));

await test("takeover: a scroll under a live finger press resolves it as canceled — no pointercancel needed", async () => {
  await press(60, 45, 7, "touch"); // the chip, inside the pane
  await scrollPane(40);
  await page.waitForFunction(() => window.__app.upCanceled === 1, { timeout: 5000 });
  const r = await counters();
  assert.equal(r.c, 1, "the press resolved as the canceled release");
  assert.equal(r.u, 0, "and not as a clean one");
});

await test("takeover: the trailing clean pointerup is swallowed — and only that one", async () => {
  await lift(60, 85, 7, "touch"); // the browser closing its books
  let r = await counters();
  assert.equal(r.u, 0, "no second release from the browser's own up");
  // the swallow is per-gesture: a full tap afterwards delivers normally
  // (pane back to top first — the takeover left the chip scrolled away)
  await scrollPane(0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await press(60, 45, 8, "touch");
  await lift(60, 45, 8, "touch");
  r = await counters();
  assert.equal(r.u, 1, "the next gesture's release arrives clean");
  assert.equal(r.c, 1, "and cancels nothing");
});

await test("takeover: a mouse drag never competes with scrolling — a mid-drag scroll keeps the capture", async () => {
  await scrollPane(0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await press(60, 45, 9, "mouse");
  await scrollPane(80);
  await page.waitForFunction(() => {
    const pane = [...document.querySelectorAll("div")].find((d) => d.clientHeight > 0 && d.scrollHeight > d.clientHeight + 10);
    return pane.scrollTop === 80;
  }, { timeout: 5000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  let r = await counters();
  assert.equal(r.c, 1, "the mouse press was not canceled");
  await lift(200, 300, 9, "mouse");
  r = await counters();
  assert.equal(r.u, 2, "the drag's release reached its captor");
});

await test("takeover: containment — another pane's scroll is not this press's takeover", async () => {
  await press(400, 100, 10, "touch"); // mesa, OUTSIDE the pane
  await scrollPane(120);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  let r = await counters();
  assert.equal(r.tc, 0, "the unrelated scroll canceled nothing");
  await lift(400, 100, 10, "touch");
  r = await counters();
  assert.equal(r.te, 1, "the finger's own end arrived");
});

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
