// Deferred DOM (docs/system-design/deferred-dom.md): on the DOM renderer a view
// not shown gets no elements until it is first shown — a view hidden when it
// attaches, and a view attached inside a settle that is not shown when the
// settle closes. Everything the program can observe stays the same: what is
// drawn once shown, its order among siblings, a scroll offset given while
// hidden, an image's natural size, a list row's place, a mask, focus, hits.
// Real Chrome, the real DOM backend; programs compiled in Node.

import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";
import { launchChrome } from "../tools/internal/chrome.mjs";
import { compile } from "../compiler/dist/compile-node.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findChrome() {
  for (const c of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean))
    if (existsSync(c)) return c;
  throw new Error("no Chrome found — set PUPPETEER_EXECUTABLE_PATH");
}

const MIME = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }
  const fp = path.join(ROOT, pathname);
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) { res.writeHead(200, { "content-type": MIME[".html"] }); return res.end("<!doctype html><meta charset=utf-8><body style=margin:0>"); }
    res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream" });
    res.end(fs.readFileSync(fp));
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChrome({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });

/** Mount `source` on the DOM backend in a fresh page and run `steps` there:
 *  an async function body given `app`, `host`, `settle` and `frame()`, whose
 *  return value comes back. */
async function inPage(source, steps) {
  const r = await compile(source);
  assert.deepEqual(r.errors.map((e) => e.message), [], "the program compiles");
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 400 });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const out = await page.evaluate(async (base, json, body) => {
    const rt = await import(base + "/runtime/dist/index.js");
    await rt.kernelReady?.();
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;width:600px;height:400px";
    document.body.appendChild(host);
    const app = rt.buildProgram(JSON.parse(json));
    rt.mountApp(app, host, new rt.DomBackend());
    rt.settle();
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    await frame();
    return await new (Object.getPrototypeOf(async function () {}).constructor)("app", "host", "settle", "frame", body)(app, host, rt.settle, frame);
  }, BASE, JSON.stringify(r.program), steps);
  await page.close();
  assert.deepEqual(errors, [], "no page errors");
  return out;
}

const bg = `(e) => getComputedStyle(e).backgroundColor`;

await test("a view hidden at attach makes no elements; shown, it lands in its place among siblings still waiting", async () => {
  const out = await inPage(`App [ width = 300, height = 200,
    a: View [ visible = false, width = 10, height = 10, fill = #FF0000 ],
    b: View [ visible = false, width = 10, height = 10, fill = #00FF00 ],
    c: View [ width = 10, height = 10, fill = #0000FF ] ]`, `
    const bg = ${bg};
    const count = () => host.querySelectorAll("*").length;
    const before = count();
    app.b.visible = true; settle(); await frame();
    const afterB = count();
    app.a.visible = true; settle(); await frame();
    const root = host.firstElementChild;
    return { before, afterB, after: count(), order: [...root.children].map(bg) };`);
  assert.equal(out.before, 2, "only the root and the shown view have elements");
  assert.equal(out.afterB, 3, "showing one makes its element");
  assert.equal(out.after, 4);
  assert.deepEqual(out.order, ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)"], "in the tree's order");
});

await test("a row its own binding hides, built inside a settle, makes no elements", async () => {
  const out = await inPage(`App [ width = 300, height = 300,
    d: Dataset { { "rows": [ { "n": 0 }, { "n": 1 }, { "n": 2 }, { "n": 3 } ] } },
    list: View [ datapath = { d.value }, layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], width = 50, height = 10, fill = #808080, visible = { :n % 2 == 0 } ] ] ]`, `
    const rows = [...host.firstElementChild.querySelectorAll("*")].filter((e) => getComputedStyle(e).backgroundColor === "rgb(128, 128, 128)");
    return { shown: rows.length, rows: app.list.childViews.length };`);
  assert.equal(out.rows, 4, "every record has its row");
  assert.equal(out.shown, 2, "only the shown rows have elements");
});

await test("a scroll offset given to a never-shown scroller lands when it is first shown", async () => {
  const out = await inPage(`App [ width = 300, height = 200,
    pane: View [ visible = false, width = 300, height = 100, scrolls = y,
      View [ width = 300, height = 1000, fill = #EEEEEE ] ] ]`, `
    app.pane.scrollTo(300); settle(); await frame();
    app.pane.visible = true; settle(); await frame(); await frame();
    const el = [...host.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 10);
    return { model: app.pane.scrollY, dom: el ? el.scrollTop : null };`);
  assert.equal(out.dom, 300, `the element scrolled where it was sent (model ${out.model})`);
});

await test("a hidden image's natural size reaches the program, and shown it paints the image", async () => {
  const svg = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="12"><rect width="20" height="12" fill="red"/></svg>`);
  const out = await inPage(`App [ width = 300, height = 200,
    pic: Image [ visible = false, source = "${svg}" ],
    w: number = { pic.naturalWidth } ]`, `
    for (let i = 0; i < 50 && !app.pic.loaded; i++) await frame();
    settle();
    const hiddenImgs = host.querySelectorAll("img").length;
    app.pic.visible = true; settle(); await frame();
    return { w: app.w, hiddenImgs, shownImgs: host.querySelectorAll("img").length };`);
  assert.equal(out.w, 20, "the natural size arrived while hidden");
  assert.equal(out.hiddenImgs, 0, "no element while hidden");
  assert.equal(out.shownImgs, 1, "shown, the image is there");
});

await test("a list's rows carry their place once their pane is first shown", async () => {
  const out = await inPage(`App [ width = 300, height = 300,
    d: Dataset { { "rows": [ { "n": 0 }, { "n": 1 }, { "n": 2 } ] } },
    pane: View [ visible = false, width = 300, height = 200, scrolls = y,
      list: View [ width = 300, datapath = { d.value }, layout: SimpleLayout [ axis = y ],
        View [ datapath = :rows[], virtualize = true, width = 300, height = 20 ] ] ] ]`, `
    app.pane.visible = true; settle(); await frame(); await frame();
    return [...host.querySelectorAll("[aria-rowindex]")].map((e) => e.getAttribute("aria-rowindex"));`);
  assert.deepEqual(out, ["1", "2", "3"], "each shown row says its place");
});

await test("a hidden stencil still masks the view that uses it", async () => {
  const svg = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="10"/></svg>`);
  const out = await inPage(`App [ width = 300, height = 200,
    stencil: Image [ visible = false, source = "${svg}", width = 20, height = 20 ],
    box: View [ width = 20, height = 20, fill = #FF0000, mask = { stencil } ] ]`, `
    for (let i = 0; i < 50 && !app.stencil.loaded; i++) await frame();
    settle(); await frame();
    const el = [...host.querySelectorAll("*")].find((e) => getComputedStyle(e).backgroundColor === "rgb(255, 0, 0)");
    const s = el ? getComputedStyle(el) : null;
    return s ? (s.maskImage || s.webkitMaskImage || "") : null;`);
  assert.ok(out && out !== "none" && out !== "", `the masked box wears the stencil (mask-image: ${out})`);
});

await test("a hidden parent brought in by a child that needs its surface takes every child, before and after it", async () => {
  const out = await inPage(`App [ width = 300, height = 200,
    panel: View [ visible = false, width = 300, height = 100, layout: SimpleLayout [ axis = y ],
      View [ width = 20, height = 10, fill = #FF0000 ],
      TextInput [ width = 100, height = 20 ],
      View [ width = 20, height = 10, fill = #0000FF ] ] ]`, `
    app.panel.visible = true; settle(); await frame();
    const fills = [...host.querySelectorAll("*")].map((e) => getComputedStyle(e).backgroundColor);
    return { red: fills.includes("rgb(255, 0, 0)"), blue: fills.includes("rgb(0, 0, 255)") };`);
  assert.equal(out.red, true, "the child before the field is drawn");
  assert.equal(out.blue, true, "the child after the field is drawn");
});

await test("a field brings in a hidden parent whose own parent is hidden too: every element lands once, in its place", async () => {
  const out = await inPage(`App [ width = 300, height = 300,
    outer: View [ visible = false, width = 300, height = 200,
      panel: View [ width = 300, height = 100,
        a: View [ width = 20, height = 10, fill = #FF0000 ],
        b: View [ y = 20, width = 20, height = 10, fill = #00FF00 ],
        f: TextInput [ y = 40, width = 100, height = 20 ] ] ] ]`, `
    app.outer.visible = true; settle(); await frame();
    const panelEl = app.outer.panel.$surface.element;
    const inPanel = [...panelEl.children].map((e) => getComputedStyle(e).backgroundColor);
    const outerKids = app.outer.$surface.element.children.length;
    return { inPanel, outerKids };`);
  assert.ok(out.inPanel.includes("rgb(255, 0, 0)") && out.inPanel.includes("rgb(0, 255, 0)"), "the panel's children are in the panel's element");
  assert.equal(out.outerKids, 1, "the panel has one element, not a stray second");
});

await test("travelling with a scroller not yet shown answers as it would shown: both surfaces come in, and the rider rides it", async () => {
  const out = await inPage(`App [ width = 300, height = 300,
    pane: View [ visible = false, width = 300, height = 200, scrolls = y,
      View [ width = 300, height = 800, fill = #EEEEEE ] ],
    rider: View [ width = 20, height = 20, fill = #FF0000 ] ]`, `
    const rode = app.rider.travelWith(app.pane);
    settle(); await frame();
    const paneEl = app.pane.$surface.element, riderEl = app.rider.$surface.element;
    return { rode, inside: paneEl !== undefined && paneEl.contains(riderEl) };`);
  assert.equal(out.rode, true, "travelWith answers true: the scroller's surface exists now");
  assert.equal(out.inside, true, "the rider's element rides inside the scroller's");
});

await test("focus and hits on a view never shown are as for any hidden view", async () => {
  const out = await inPage(`App [ width = 300, height = 200,
    focusOver() { Focus.focus(over) },
    under: View [ width = 100, height = 100, fill = #0000FF, onClick() { } ],
    over: View [ visible = false, width = 100, height = 100, fill = #FF0000, focusable = true, onClick() { } ] ]`, `
    let threw = null;
    try { app.focusOver(); settle(); } catch (e) { threw = String(e); }
    const hit = app.viewAt(50, 50);
    return { threw, hit: hit === app.under };`);
  assert.equal(out.threw, null, "focusing it does not throw");
  assert.equal(out.hit, true, "a point over a hidden view hits what is under it");
});

await browser.close();
server.close();
summarize("deferred-dom");
