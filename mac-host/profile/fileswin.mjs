// fileswin — one Files window, clicked precisely inside it: does the title, the
// selected row and the file column agree?
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 3000));
console.log(URL_);
await p.evaluate("__app.launcher.newFiles()"); await new Promise(r => setTimeout(r, 1800));
const model = () => p.evaluate(() => {
  const w = globalThis.__app.wm.windows;
  const list = Array.isArray(w) ? w : (typeof w?.length === "number" ? Array.from(w) : (w?.children ?? w?.value ?? []));
  return Array.from(list ?? []).map((x) => ({ type: x?.constructor?.name ?? "?", title: String(x?.title ?? ""), root: String(x?.rootPath ?? ""), sel: String(x?.selPath ?? "") }));
});
console.log("  windows:", JSON.stringify(await model()));
// the windows already on screen at boot
const wins = async () => p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const t = (el.getAttribute?.("data-declare-type") ?? "");
    if (/FilesWindow/.test(t)) { const r = el.getBoundingClientRect(); out.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); }
  }
  return out;
});
console.log("  Files windows at boot:", JSON.stringify(await wins()));
// click a row INSIDE the frontmost window only
const rowIn = async (name) => p.evaluate((want) => {
  const hits = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    if ((el.textContent ?? "").trim() !== want) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    hits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  // the frontmost copy is the one elementFromPoint returns at that point
  for (const h of hits.sort((a, b) => b.x - a.x)) {
    const el = document.elementFromPoint(h.x, h.y);
    if ((el?.textContent ?? "").trim() === want) return h;
  }
  return null;
}, name);
const read = () => p.evaluate(() => {
  const texts = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    const t = (el.textContent ?? "").trim(); if (!t) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    texts.push({ t, x: Math.round(r.left), y: Math.round(r.top), color: getComputedStyle(el).color });
  }
  return texts;
});
for (const name of ["Operational", "Background"]) {
  const at = await rowIn(name);
  if (!at) { console.log(`  no frontmost "${name}" row`); continue; }
  const t0 = Date.now();
  await p.mouse.click(at.x, at.y);
  await new Promise(r => setTimeout(r, 1800));
  const texts = await read();
  console.log(`      model: ${JSON.stringify(await model())}`);
  // the title: the topmost centred text in a window's title bar band
  const title = texts.filter(t => t.y > 100 && t.y < 160 && t.x > 300).map(t => t.t);
  const files = texts.filter(t => t.x > 400 && t.y > 160).slice(0, 3).map(t => t.t);
  console.log(`  clicked ${name} at (${Math.round(at.x)},${Math.round(at.y)}) — ${Date.now() - t0} ms`);
  console.log(`      titles on screen: ${JSON.stringify(title)}`);
  console.log(`      first files:      ${JSON.stringify(files)}`);
}
await b.close();
