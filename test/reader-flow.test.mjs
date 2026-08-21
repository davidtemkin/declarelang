// The reader's segments may not overlap — the RichText scale/geometry rule
// (task #26, 2026-08-20). RichText's `scale` is a font-size multiplier baked
// into the runs, so to the geometry system the view is UNTRANSFORMED
// (markdown.ts footprint override, the twin of the flush() paint mask).
// Before the fix, auto-extent multiplied every flow's measured height by
// scale a second time: at the reader's default 0.9 each code block stood
// 1/0.9 taller on screen than in the model, and the desktop's 7,000px
// Window block bled ~760px of pixels over the segments laid after it.
// Pinned in BOTH geometries: the model's block boxes and the DOM's pre rects.
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
await page.setViewport({ width: 1200, height: 900 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODEL = `(() => {
  const walk = (v) => {
    for (const c of v.children ?? []) {
      if (c.constructor?.name === "Block") return v;
      const r = walk(c); if (r) return r;
    }
    return null;
  };
  const col = walk(window.__app);
  if (!col) return { blocks: 0, overlaps: -1 };
  const bs = col.children.filter((c) => c.constructor?.name === "Block")
    .map((c) => ({ y: c.y, h: c.height })).sort((a, b) => a.y - b.y);
  let overlaps = 0;
  for (let i = 1; i < bs.length; i++) if (bs[i].y < bs[i - 1].y + bs[i - 1].h - 2) overlaps++;
  return { blocks: bs.length, overlaps };
})()`;
const DOM = `(() => {
  const pres = [...document.querySelectorAll("pre")].map((e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top + scrollY, bot: r.bottom + scrollY };
  }).filter((r) => r.bot > r.top).sort((a, b) => a.top - b.top);
  let n = 0;
  for (let i = 1; i < pres.length; i++) if (pres[i].top < pres[i - 1].bot - 2) n++;
  return n;
})()`;

async function census(url) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(4500);                       // segments fetch + flow measures settle
  return { model: await page.evaluate(MODEL), dom: await page.evaluate(DOM) };
}

await test("reader (dom): the desktop's segments never overlap — model and pixels agree", async () => {
  const c = await census(`${B}/apps/desktop/desktop.declare?viewer=reader`);
  assert.ok(c.model.blocks > 20, `the reader realized its segments (got ${c.model.blocks})`);
  assert.equal(c.model.overlaps, 0, "model boxes tile cleanly");
  assert.equal(c.dom, 0, "rendered pre rects tile cleanly (the 1/scale bleed)");
});

await test("reader (canvas): same invariant, sealed surface", async () => {
  const c = await census(`${B}/apps/desktop/desktop.declare?viewer=reader&render=canvas`);
  assert.ok(c.model.blocks > 20, `segments realized (got ${c.model.blocks})`);
  assert.equal(c.model.overlaps, 0, "model boxes tile cleanly");
});

await test("the viewer inside the CANVAS desktop gets its host's data", async () => {
  // the twin of ad796537: the canvas island mount coupled the child's DATA
  // base to its asset base, so the viewer tenant's `desktop.declare?segments`
  // resolved against /apps/viewer/ and 404'd — "no code in the viewer" on
  // ?render=canvas (found live 2026-08-21). Data resolves through the HOST's
  // space; only assets are child-relative.
  await page.goto(`${B}/apps/desktop/desktop.declare?render=canvas`, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(3000);
  await page.evaluate(`(window.__app.launcher ?? window.__app).openSource("desktop")`);
  await page.waitForFunction(`(() => {
    const isl = window.__declare.find("app.wins").children.map((w) => w.island).filter(Boolean).find((i) => i.__childApp);
    return isl && isl.__childApp.segSrc.status !== "idle" && isl.__childApp.segSrc.status !== "loading";
  })()`, { timeout: 30000 });
  const st = await page.evaluate(`(() => {
    const isl = window.__declare.find("app.wins").children.map((w) => w.island).filter(Boolean).find((i) => i.__childApp);
    const t = isl.__childApp;
    return { seg: t.segSrc.status, len: String(t.segSrc.value || "").length };
  })()`);
  assert.equal(st.seg, "loaded", "segments resolved host-relative");
  assert.ok(st.len > 100000, `the whole source arrived (got ${st.len})`);
});

await browser.close();
httpServer.close();
summarize("reader-flow");
