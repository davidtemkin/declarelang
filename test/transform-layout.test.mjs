// test/transform-layout.test.mjs — a transformed box's POSITION rides its own
// transform, and that must be invisible to everything else.
//
// dom-backend used to write `left`/`top` for position and `transform` for scale
// and rotation. That splits one pose across two pipelines — a layout property
// the compositor cannot animate, and a composited one — with nothing pinning
// the two to the same presented frame. A box translating while it scales
// therefore jittered. The fix folds position into the transform whenever a box
// is already transformed (`translate(x,y) scale(k) rotate(d)`, `left`/`top`
// pinned to 0), leaving untransformed boxes on the plain layout path.
//
// The composition is EQUIVALENT, not merely similar: with transform-origin at
// pivot O, `translate(t) scale(k)` maps P to O + k(P − O) + t, which is exactly
// the old `left + O + k(P − O)` when t = left. This file is that claim as a
// test, because "equivalent" is the kind of thing that stays true only while
// someone is checking:
//
//   • the painted rect of a scaled box is unchanged, and so is every other
//     box's — a scaled sibling must not shift the plain ones;
//   • a scroller's extent is unchanged. Declare's scroller content is
//     ABSOLUTELY positioned, so a child's layout position is what establishes
//     the scroll range. Zeroing `left`/`top` could have silently shortened it;
//     Chrome counts a transformed box's overflow, so it does not, and this
//     pins that.
//
// The other half of the same change — that the INVERSE (hit testing) undoes the
// new translate — is held by desktop-input.test.mjs's island-coordinate test,
// which caught it failing by exactly posX/k when the translate was added
// without a matching inverse.

import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { test, summarize } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

const MIME = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8",
  ".mjs": "text/javascript;charset=utf-8", ".json": "application/json", ".css": "text/css;charset=utf-8" };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }
  let fp = path.join(ROOT, pathname);
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) { res.writeHead(200, { "content-type": MIME[".html"] }); return res.end("<!doctype html><meta charset=utf-8><body>"); }
    res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream" });
    res.end(fs.readFileSync(fp));
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });

/** Mount one program on the DOM backend and report the geometry that matters:
 *  every element's client rect, and the extent of every real scroller. */
async function measure(program) {
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 400 });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const out = await page.evaluate(async (base, src) => {
    const { build, mountApp, DomBackend } = await import(base + "/runtime/dist/index.js");
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:600px;height:400px";
    document.body.appendChild(host);
    mountApp(build(src), host, new DomBackend());
    await new Promise((r) => setTimeout(r, 60));
    const all = [...host.querySelectorAll("*")];
    const r = (e) => { const b = e.getBoundingClientRect();
      return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return {
      rects: all.map(r),
      scrollers: all
        .filter((e) => { const o = getComputedStyle(e);
          return ["auto", "scroll"].includes(o.overflowY) || ["auto", "scroll"].includes(o.overflowX); })
        .map((e) => e.scrollHeight - e.clientHeight),
    };
  }, BASE, program);
  await page.close();
  return out;
}

// One scene, twice: the far box SCALED, and the same tree with the scale absent.
// A scaled box is half-size, so its own rect legitimately differs — everything
// else in the scene, and the scroll range, must not.
const scene = (scaled) => `App [ width = 600, height = 400,
    pane: View [ width = 600, height = 400, scrolls = y, clip = true,
        near: View [ x = 0, y = 0, width = 100, height = 100, fill = red ],
        far: View [ x = 0, y = 1200, width = 100, height = 100, fill = blue${scaled ? ", scale = 0.5" : ""} ],
        plain: View [ x = 200, y = 1400, width = 100, height = 100, fill = green ]
    ] ]`;

await test("a scaled box carries its position in the transform, and nothing else moves", async () => {
  const withScale = await measure(scene(true));
  const noScale = await measure(scene(false));

  // the scaled box sits where it was authored — the translate replaces the
  // layout offset exactly, rather than adding to it (that mistake reads as the
  // box landing at 2× its y, or at 0)
  assert.deepEqual(withScale.rects[3], [0, 1200, 50, 50],
    "the scaled box paints at its authored position, at half size");

  // its siblings are untouched: same rects with and without the transform
  assert.deepEqual(withScale.rects[2], noScale.rects[2], "the box above a scaled sibling does not move");
  assert.deepEqual(withScale.rects[4], noScale.rects[4], "the box below a scaled sibling does not move");
});

await test("a scroller's extent survives a transformed child (its content is absolutely positioned)", async () => {
  const withScale = await measure(scene(true));
  const noScale = await measure(scene(false));
  assert.ok(withScale.scrollers.length > 0, "the scene really does have a scroller (else this test proves nothing)");
  assert.ok(withScale.scrollers[0] > 0, `the scroller really scrolls (extent ${withScale.scrollers[0]})`);
  assert.deepEqual(withScale.scrollers, noScale.scrollers,
    "pinning left/top to 0 must not shorten the scroll range — Chrome counts transformed overflow");
});

await browser.close();
server.close();
summarize("transform-layout");
