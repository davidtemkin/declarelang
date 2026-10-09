// A drawing's shadow and filter lengths are the drawing's own units.
//
// Canvas2D measures shadow blur, shadow offsets and the lengths inside a filter in
// DEVICE pixels and puts no transform through them. Declare resolves them through
// the transform in force at each mark, like a line's width, so a drawing is the
// same picture at any size, density or magnification — a glow grows with the icon
// it surrounds as the dock magnifies it. test/probe/draw-lengths.declare draws one
// picture at its own size, at half size under a drawing's own scale(2), and at half
// size in a view scaled by two; the three must agree on both renderers, at density
// 1 and 2, and through the filter path WebKit takes (forced here on Chrome).
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

// The three cells' pixels, at the page's density, decoded in the page itself.
async function cells(render, dpr, fallback) {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 420, height: 140, deviceScaleFactor: dpr });
  if (fallback) await pg.evaluateOnNewDocument("window.__declareForceFilterFallback = true");
  await pg.goto(`${B}/test/probe/draw-lengths.declare${render === "canvas" ? "?render=canvas" : ""}`, { waitUntil: "networkidle0", timeout: 60000 });
  await pg.waitForFunction("window.__app != null", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  const out = [];
  for (const x of [10, 150, 290]) {
    const shot = await pg.screenshot({ clip: { x, y: 10, width: 120, height: 120 }, encoding: "base64" });
    out.push(await pg.evaluate(async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      return Array.from(g.getImageData(0, 0, c.width, c.height).data);
    }, shot));
  }
  await pg.close();
  return out;
}

// how far apart two cells are: the share of channel values off by more than 24
function apart(p, q) {
  let off = 0;
  for (let i = 0; i < p.length; i++) if (Math.abs(p[i] - q[i]) > 24) off++;
  return off / p.length;
}
const lit = (p) => p.filter((v, i) => i % 4 !== 3 && v > 40).length / p.length;

for (const [render, dpr, fallback] of [["dom", 1, false], ["dom", 2, false], ["canvas", 1, false], ["canvas", 2, false], ["canvas", 2, true]]) {
  await test(`${render} at density ${dpr}${fallback ? ", filters interpreted" : ""}: the glow and the filter scale with the drawing`, async () => {
    const [a, b, c] = await cells(render, dpr, fallback);
    assert.ok(lit(a) > 0.04, `the reference cell drew too little (${lit(a)})`);
    assert.ok(apart(a, b) < 0.01, `a drawing's own scale(2) changed the picture (${(apart(a, b) * 100).toFixed(2)}% off)`);
    assert.ok(apart(a, c) < 0.02, `a view scaled by two changed the picture (${(apart(a, c) * 100).toFixed(2)}% off)`);
  });
}

await browser.close();
httpServer.close();
summarize("draw-lengths");
