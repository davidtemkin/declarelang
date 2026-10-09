// A drawing that changes and keeps its size repaints in place on the DOM renderer: the same
// canvas and backing store, cleared, with the context's settings back at their defaults. test/probe/draw-redraw.declare
// changes one view's picture and compares it with a view that only ever drew the new one.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { createDeclareServer } from "../server/create.mjs";
import { launchChrome } from "../tools/internal/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = createDeclareServer({
  mountSpecs: [{ prefix: "/", dir: ROOT }, { prefix: "/declare/", dir: ROOT, platform: true }],
  mode: "distro",
});
const httpServer = http.createServer(server.handler).on("upgrade", server.upgrade);
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${httpServer.address().port}`;
const browser = await launchChrome({ args: ["--no-sandbox"] });

async function pixels(pg, x) {
  const shot = await pg.screenshot({ clip: { x, y: 10, width: 120, height: 120 }, encoding: "base64" });
  return pg.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, c.width, c.height).data);
  }, shot);
}
const apart = (p, q) => p.filter((v, i) => Math.abs(v - q[i]) > 24).length / p.length;

for (const dpr of [1, 2]) {
  await test(`density ${dpr}: a changed drawing of the same size repaints its own canvas, cleanly`, async () => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 280, height: 140, deviceScaleFactor: dpr });
    await pg.goto(`${B}/test/probe/draw-redraw.declare`, { waitUntil: "networkidle0", timeout: 60000 });
    await pg.waitForFunction("window.__app != null", { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 500));
    const before = await pg.evaluate(() => { const c = document.querySelector("canvas"); window.__first = c; return [c.width, c.height]; });
    assert.ok(apart(await pixels(pg, 10), await pixels(pg, 150)) > 0.02, "the two pictures should differ before the change");
    await pg.evaluate(() => {
      // count assignments to a canvas's size: each one allocates a new backing store
      window.__sized = 0;
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width");
      Object.defineProperty(HTMLCanvasElement.prototype, "width", { get: d.get, set(v) { window.__sized++; d.set.call(this, v); }, configurable: true });
      window.__declare.find("app.a").second = true;
    });
    await new Promise((r) => setTimeout(r, 500));
    const after = await pg.evaluate(() => { const c = document.querySelector("canvas"); return { same: c === window.__first, size: [c.width, c.height], sized: window.__sized }; });
    assert.ok(after.same, "the view kept its canvas");
    assert.deepEqual(after.size, before, "the canvas kept its size");
    assert.equal(after.sized, 0, "the repaint reallocated the canvas");
    const off = apart(await pixels(pg, 10), await pixels(pg, 150));
    assert.ok(off < 0.005, `the repainted picture differs from a fresh one (${(off * 100).toFixed(2)}% off)`);
    await pg.close();
  });
}

await browser.close();
httpServer.close();
summarize("draw-redraw");
