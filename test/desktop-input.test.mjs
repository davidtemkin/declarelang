// test/desktop-input.test.mjs — the carved-sink contract, driven by a REAL
// browser on the desktop app. A window's resize halo is the canonical carved
// sink: a Shape-clipped view WITH handlers. The runtime's promise (dom-backend
// CARVED): such a view is CSS-inert — so the browser's native wheel scrolling
// and text selection under its box keep working — while its clipped band still
// takes every hit, resolved by the runtime's own isPointInPath walk. The same
// gestures are then re-proven under ?render=canvas, whose walk owns hit-testing
// natively — one behavioral contract, two renderers. These are exactly the
// regressions that shipped once (dead wheel, dead selection) and must not again.

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

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, args: ["--no-sandbox"],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

/** Boot the desktop and open the Markdown reader (its window carries the halo). */
async function openReader(url) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => globalThis.__declare?.find?.("app.wins") != null, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200)); // boot animations settle
  const icon = await page.evaluate(() => {
    let found = null;
    const walk = (v) => { for (const c of v.children ?? []) { if (c.constructor.name === "DockIcon" && c.name === "Markdown") found = c; walk(c); } };
    walk(globalThis.__declare.find("app"));
    // canvas surfaces have no element; locate by model geometry either way
    let x = 0, y = 0, v = found;
    while (v && v.x !== undefined) { x += v.x; y += v.y; v = v.parent; }
    return { x: Math.round(x + found.width / 2), y: Math.round(y + found.height / 2) };
  });
  await page.mouse.click(icon.x, icon.y);
  await page.waitForFunction(
    () => globalThis.__declare.find("app.wins").children.some((c) => c.constructor.name === "ViewerWindow"),
    { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500)); // open animation + content fetch
}

/** The reader window's geometry in viewport coordinates (model-driven; the
 *  wins layer sits below the 32px menu bar). */
function readerGeo() {
  return page.evaluate(() => {
    const w = globalThis.__declare.find("app.wins").children.find((c) => c.constructor.name === "ViewerWindow");
    globalThis.__w = w;
    const walk = (v) => { if (v.scrolls) return v; for (const c of v.children ?? []) { const r = walk(c); if (r) return r; } return null; };
    globalThis.__body = walk(w);
    return { x: w.x, y: w.y + 32, w: w.width, h: w.height, scrollY: globalThis.__body?.scrollY ?? null };
  });
}

const drag = async (x1, y1, x2, y2) => {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  const steps = 5;
  for (let i = 1; i <= steps; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 250));
};

try {
  // ── DOM renderer ─────────────────────────────────────────────────────────
  await openReader(`${B}/apps/desktop/desktop.declare`);
  let g = await readerGeo();

  await test("DOM: the halo realizes CSS-inert with no authored pointerEvents (the carved-sink rule)", async () => {
    const r = await page.evaluate(() => {
      const halo = globalThis.__w.children.find((c) => c.ignoreclip);
      return { attr: halo.pointerEvents, css: getComputedStyle(halo.surface.element).pointerEvents };
    });
    assert.equal(r.attr, "", "the app must not need the workaround");
    assert.equal(r.css, "none", "the runtime must apply it");
  });

  await test("DOM: native wheel scrolling works under the halo", async () => {
    await page.mouse.move(g.x + Math.round(g.w / 2), g.y + 200);
    await page.mouse.wheel({ deltaY: 250 });
    await new Promise((r) => setTimeout(r, 350));
    assert.ok((await readerGeo()).scrollY > 0, "the reader pane should scroll");
  });

  await test("DOM: native text selection works under the halo", async () => {
    // Drag across an actual RENDERED TEXT RUN, located live. This test is about
    // input mechanics — that the carved halo above the pane does not eat the
    // selection gesture — so it must not depend on what the document happens to
    // say. Locating a real run (rather than dragging at a fixed offset into the
    // doc box, which lands wherever the current prose puts it) is what makes it
    // independent of `docs/declare.md`'s content: the file it renders is edited
    // often, and a geometric guess silently became a drag across blank space.
    const d = await page.evaluate((top, bottom) => {
      const root = globalThis.__w.body.pad.doc.surface.element;
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const runs = [];
      for (let n = walk.nextNode(); n && runs.length < 2; n = walk.nextNode()) {
        if (!n.nodeValue || n.nodeValue.trim().length < 20) continue;
        const r = n.parentElement.getBoundingClientRect();
        if (r.width < 80 || r.height < 6) continue;      // a real line, not an artifact
        if (r.top < top || r.bottom > bottom) continue;  // fully inside the visible band
        runs.push({ x: r.left, y: r.top + r.height / 2, w: r.width });
      }
      return runs.length === 2 ? runs : null;
    }, g.y + 8, g.y + g.h - 8);
    assert.ok(d, "the reader should render two visible text runs to drag across");
    // across and DOWN, so the selection spans runs rather than part of one line
    await drag(d[0].x + 2, d[0].y, d[1].x + Math.min(d[1].w - 4, 240), d[1].y);
    const n = await page.evaluate(() => String(getSelection()).length);
    await page.evaluate(() => getSelection().removeAllRanges());
    assert.ok(n > 0, "dragging across the reader's text should select");
  });

  await test("DOM: the band resizes from outside the frame (+3) — the runtime resolves the carved hit", async () => {
    await drag(g.x + g.w + 3, g.y + 200, g.x + g.w + 63, g.y + 200);
    const g2 = await readerGeo();
    assert.ok(g2.w > g.w + 40, `width should grow (${g.w} → ${g2.w})`);
    g = g2;
  });

  await test("DOM: the band resizes from inside the frame (−2) — chrome above content (the macOS rule)", async () => {
    await drag(g.x + g.w - 2, g.y + 200, g.x + g.w - 42, g.y + 200);
    const g2 = await readerGeo();
    assert.ok(g2.w < g.w - 25, `width should shrink (${g.w} → ${g2.w})`);
    g = g2;
  });

  await test("DOM: the ring's interior is hit-transparent (a drag there neither resizes nor moves)", async () => {
    await drag(g.x + Math.round(g.w / 2), g.y + 200, g.x + Math.round(g.w / 2) + 40, g.y + 200);
    const g2 = await readerGeo();
    assert.equal(g2.w, g.w, "no resize");
    assert.equal(g2.x, g.x, "no move");
  });

  // ── canvas renderer: the same contract through the canvas walk ───────────
  await openReader(`${B}/apps/desktop/desktop.declare?render=canvas`);
  g = await readerGeo();

  await test("canvas: wheel scrolling works (the compositor's own scroll path)", async () => {
    await page.mouse.move(g.x + Math.round(g.w / 2), g.y + 200);
    await page.mouse.wheel({ deltaY: 250 });
    await new Promise((r) => setTimeout(r, 350));
    assert.ok((await readerGeo()).scrollY > 0, "the reader pane should scroll");
  });

  await test("canvas: the band resizes from outside (+3) and inside (−2)", async () => {
    await drag(g.x + g.w + 3, g.y + 200, g.x + g.w + 63, g.y + 200);
    let g2 = await readerGeo();
    assert.ok(g2.w > g.w + 40, `outside+3 should grow (${g.w} → ${g2.w})`);
    await drag(g2.x + g2.w - 2, g2.y + 200, g2.x + g2.w - 42, g2.y + 200);
    const g3 = await readerGeo();
    assert.ok(g3.w < g2.w - 25, `inside−2 should shrink (${g2.w} → ${g3.w})`);
    g = g3;
  });

  await test("canvas: the ring's interior is hit-transparent", async () => {
    await drag(g.x + Math.round(g.w / 2), g.y + 200, g.x + Math.round(g.w / 2) + 40, g.y + 200);
    const g2 = await readerGeo();
    assert.equal(g2.w, g.w, "no resize");
    assert.equal(g2.x, g.x, "no move");
  });
} finally {
  await browser.close();
  httpServer.close();
}

summarize("desktop-input");
