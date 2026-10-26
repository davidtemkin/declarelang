// The reader's segments may not overlap — the RichText scale/geometry rule
// (task #26, 2026-08-20). RichText's `scale` is a font-size multiplier baked
// into the runs, so to the geometry system the view is UNTRANSFORMED
// (rich-text.ts footprint override, the twin of the flush() paint mask).
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
import { launchChrome } from "../tools/internal/chrome.mjs";
import { settled } from "./settle.mjs";

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

const browser = await launchChrome({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });

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
  await settled(page);                     // segments fetch + flow measures settle
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
  // resolved against /library/platform-apps/viewer/ and 404'd — "no code in the viewer" on
  // ?render=canvas (found live 2026-08-21). Data resolves through the HOST's
  // space; only assets are child-relative.
  await page.goto(`${B}/apps/desktop/desktop.declare?render=canvas`, { waitUntil: "networkidle0", timeout: 60000 });
  await settled(page);
  // instances era: openSource takes the application NODE (launcher.desk);
  // the string spelling stays as the older trees' fallback
  await page.evaluate(`(() => { const L = window.__app.launcher ?? window.__app; L.openSource(L.desk ?? "desktop"); })()`);
  await page.waitForFunction(`(() => {
    const isl = window.__declare.find("app.wins").childViews.map((w) => w.island).filter(Boolean).find((i) => i.__childApp);
    return isl && (isl.__childApp.segSrc.loaded || isl.__childApp.segSrc.failed);
  })()`, { timeout: 30000 });
  const st = await page.evaluate(`(() => {
    const isl = window.__declare.find("app.wins").childViews.map((w) => w.island).filter(Boolean).find((i) => i.__childApp);
    const t = isl.__childApp;
    return { seg: t.segSrc.loaded ? "loaded" : t.segSrc.failed ? "failed" : "pending", len: String(t.segSrc.value || "").length };
  })()`);
  assert.equal(st.seg, "loaded", "segments resolved host-relative");
  assert.ok(st.len > 100000, `the whole source arrived (got ${st.len})`);
});

// ── include links: a program's `include [ "…" ]` paths and bare library tags are
// in-app links; following one views THAT file in place (the location names it),
// arms ‹ ›, and an include's Edit tab says which program to edit instead.
await test("viewer: an include path is a link that views the included file in place; Edit on it points back at the program", async () => {
  await page.goto(`${B}/apps/weather/weather.declare?viewer=reader`, { waitUntil: "networkidle0", timeout: 60000 });
  await settled(page);
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")));
  assert.ok(hrefs.includes("#reader/apps/weather/weather-art.declare"), `the include is a link, got ${JSON.stringify(hrefs.slice(0, 4))}`);
  // a class the program declares in the include links to its declaration;
  // a platform class links to its reference page
  assert.ok(hrefs.includes("#reader/apps/weather/weather-art.declare@WindDial"), "a class declared in the include links to its line");
  assert.ok(hrefs.includes("apps/docs/#reference/SimpleLayout"), "a platform class links to its reference page");
  const st = () => page.evaluate(() => { const a = window.__declare.find("app"); return { loc: a.location, file: a.filePath(), isInclude: a.isInclude }; });
  await page.evaluate(() => window.__declare.find("app").followLink("#reader/apps/weather/weather-art.declare"));
  await settled(page);
  let s = await st();
  assert.equal(s.file, "apps/weather/weather-art.declare", "the included file is viewed in place");
  assert.equal(s.isInclude, true);
  assert.equal(await page.evaluate(() => location.hash), "#reader/apps/weather/weather-art.declare", "the fragment names the file");
  // the REAL tab path: pick "Edit" through the switch — it must keep the viewed file
  await page.evaluate(() => window.__declare.find("app.bar.modeSwitch").input("edit"));
  await settled(page);
  const edit = await page.evaluate(() => { const a = window.__declare.find("app"); return { noRun: a.noRun.visible, live: a.live.visible, l1: a.noRun.l1.text, rowOn: a.noRun.row.visible, name: a.noRun.row.name.text, altOn: a.noRun.alt.visible }; });
  assert.equal(edit.noRun, true); assert.equal(edit.live, false);
  assert.equal(edit.l1, "This file declares classes — there is no App to run.");
  assert.equal(edit.rowOn, true); assert.equal(edit.name, "weather.declare"); assert.equal(edit.altOn, false);
  assert.equal((await st()).loc, "edit/apps/weather/weather-art.declare", "the tab kept the viewed file");
  // the walk is the HOST's: one browser Back returns to the program (the tab
  // switch REPLACED its entry, so it is not a stop on the way)
  await page.goBack(); await settled(page);
  s = await st();
  assert.equal(s.file, "apps/weather/weather.declare", "browser Back walks files, never tabs");
});

await test("viewer: a class link lands on its declaration's line", async () => {
  await page.goto(`${B}/apps/weather/weather.declare?viewer=reader`, { waitUntil: "networkidle0", timeout: 60000 });
  await settled(page);
  await page.evaluate(() => window.__declare.find("app").followLink("#reader/apps/weather/weather-art.declare@WindDial"));
  await settled(page);
  const at = await page.evaluate(() => {
    const a = window.__declare.find("app");
    let mark = null;
    const walk = (n) => { if (n.anchor === "WindDial") mark = n; for (const c of n.children || []) walk(c); };
    walk(a);
    const top = mark.$surface.element.getBoundingClientRect().top - a.content.$surface.element.getBoundingClientRect().top;
    return { file: a.filePath(), top, scrollY: a.content.scrollY, inset: a.revealInset };
  });
  assert.equal(at.file, "apps/weather/weather-art.declare");
  assert.ok(at.scrollY > 0, "the reader scrolled");
  assert.ok(Math.abs(at.top - at.inset) <= 4, `the declaration sits at the top of the reader, below the inset (it is ${at.top}px down)`);
});

await test("viewer: a page opened DIRECTLY on an include points at no program — it cannot know one", async () => {
  await page.goto(`${B}/apps/weather/weather-art.declare?viewer=edit`, { waitUntil: "load", timeout: 60000 });
  await settled(page);
  const st = await page.evaluate(() => { const a = window.__declare.find("app"); return { noRun: a.noRun.visible, rowOn: a.noRun.row.visible, altOn: a.noRun.alt.visible, alt: a.noRun.alt.text }; });
  assert.equal(st.noRun, true);
  assert.equal(st.rowOn, false, "no program named — the page opened on the include itself");
  assert.equal(st.altOn, true);
  assert.equal(st.alt, "Open a program that includes it to edit live.");
});

// THE SIZES TAB — the program's production build, weighed by the dev server
// (?sizes) and shown file by file: each file says how it came in and links to
// the reader, and a file with no App says it has no build to weigh.
await test("viewer: the Sizes tab weighs the program's build, file by file, and links each file to the reader", async () => {
  await page.goto(`${B}/apps/weather/weather.declare?viewer=sizes`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.__declare?.find("app")?.sizes?.loaded === true, { timeout: 90000, polling: 200 });
  await settled(page);
  const st = await page.evaluate(() => {
    const a = window.__declare.find("app");
    const v = a.sizeView.value;
    return { mode: a.mode, total: a.sizes.value.total.gzip, parts: v.parts.reduce((t, p) => t + p.gzip, 0),
      files: [...v.program, ...v.library].map((f) => ({ label: f.label, note: f.note, href: f.href })), modules: v.modules.length,
      program: v.program.map((f) => f.label), library: v.library.every((f) => f.label.startsWith("library/")), heads: v.heads,
      open: ["program", "library", "runtime"].map((k) => a.content.weigh[k].open),
      runtimeLine: a.content.weigh.runtime.line.more.text,
      hrefs: [...document.querySelectorAll("a")].map((e) => e.getAttribute("href")) };
  });
  assert.equal(st.mode, "sizes");
  assert.ok(Math.abs(st.parts - st.total) <= 4, `the parts sum to the total (${st.parts} vs ${st.total})`);
  const art = st.files.find((f) => f.label === "weather-art.declare");
  assert.deepEqual([art.note, art.href], ["included by the program", "#reader/apps/weather/weather-art.declare"]);
  assert.equal(st.files.find((f) => f.label === "weather.declare").href, "#reader");
  assert.ok(st.files.some((f) => f.label === "library/focusring.declare" && f.note === "provided by the library"));
  assert.ok(st.hrefs.some((h) => h?.endsWith("#reader/apps/weather/weather-art.declare")), "a file is a real link");
  // a library file opens in the reader, from where the library is served
  const ring = st.files.find((f) => f.label === "library/focusring.declare").href;
  assert.ok(/^#reader\/(declare\/)?library\/focusring\.declare$/.test(ring), ring);
  await page.evaluate((h) => window.__declare.find("app").followLink(h), ring);
  await page.waitForFunction(() => window.__declare.find("app").segSrc.loaded === true, { timeout: 30000, polling: 100 });
  await settled(page);
  assert.equal(await page.evaluate(() => window.__declare.find("app").baseName()), "focusring.declare");
  assert.ok(await page.evaluate(() => window.__declare.find("app").doc.value.segments.some((g) => g.kind == "code")), "the library file reads");
  await page.goBack(); await settled(page);
  assert.ok(st.modules > 20, "the runtime's modules are listed");
  // the program's own files, the library's, the runtime: each a fold whose line
  // sums it; the runtime starts shut
  assert.deepEqual(st.program, ["weather.declare", "weather-art.declare"]);
  assert.ok(st.library, "the library's files are the library's");
  assert.deepEqual(st.open, [true, true, false]);
  assert.match(st.heads.program, /^2 files · \d+\.\d KB$/);
  assert.equal(st.runtimeLine, st.heads.runtime, "a shut fold still says what it holds");
  await page.evaluate(() => window.__declare.find("app").content.weigh.runtime.toggle());
  await settled(page);
  assert.equal(await page.evaluate(() => window.__declare.find("app").content.weigh.runtime.open), true, "the runtime opens");
  // a followed include keeps the tab, and has no App to build
  await page.evaluate(() => window.__declare.find("app").followLink("#sizes/apps/weather/weather-art.declare"));
  await settled(page);
  const inc = await page.evaluate(() => { const a = window.__declare.find("app"); return { url: a.sizesUrl(), status: a.content.weigh.status.text }; });
  assert.equal(inc.url, "", "nothing is built for an include");
  assert.equal(inc.status, "This file declares classes — there is no App, so no build to weigh.");
  // and the switch's Sizes tab keeps the viewed file, as the others do
  await page.evaluate(() => window.__declare.find("app.bar.modeSwitch").input("reader"));
  await settled(page);
  assert.equal(await page.evaluate(() => window.__declare.find("app").location), "reader/apps/weather/weather-art.declare");
});

// ON A PHONE the tab switch is a menu, opened from a button naming the tab; the
// header's counts wrap beneath the filename instead of running off the edge.
await test("viewer: on a phone the tabs are a menu, and the header wraps within the window", async () => {
  await page.setViewport({ width: 390, height: 800 });
  try {
    await page.goto(`${B}/apps/tracker/tracker.declare?viewer=reader`, { waitUntil: "networkidle0", timeout: 60000 });
    await settled(page);
    const st = await page.evaluate(() => {
      const a = window.__declare.find("app");
      const head = a.content.head;
      return { seg: a.bar.modeSwitch.visible, btn: a.bar.tabBtn.visible, label: a.bar.tabBtn.t.text,
        rows: head.title.height > head.title.path.height * 1.5,
        overflow: Math.max(...head.title.children.filter((c) => c.visible).map((c) => c.x + c.width)) - head.title.width };
    });
    assert.deepEqual([st.seg, st.btn, st.label], [false, true, "Reader"]);
    assert.ok(st.rows, "the counts wrapped to rows of their own");
    assert.ok(st.overflow <= 0.5, `nothing runs past the header's edge (by ${st.overflow}px)`);
    await page.evaluate(() => window.__declare.find("app.bar.tabBtn").press());
    await settled(page);
    const items = await page.evaluate(() => window.__declare.find("app.tabMenu").items.map((i) => [i.label, i.checked]));
    assert.deepEqual(items, [["Reader", true], ["Source", false], ["Edit", false], ["Sizes", false]]);
    await page.evaluate(() => window.__declare.find("app.tabMenu").pick("source"));
    await settled(page);
    assert.deepEqual(await page.evaluate(() => [window.__declare.find("app").mode, window.__declare.find("app.bar.tabBtn").t.text]), ["source", "Source"]);
  } finally { await page.setViewport({ width: 1200, height: 900 }); }
});

await browser.close();
httpServer.close();
summarize("reader-flow");
