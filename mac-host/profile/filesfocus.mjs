// filesfocus — after a folder window opens, WHICH window is focused, and where
// does a click on the new window's row actually land?
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 3000));
const dump = () => p.evaluate(() => {
  const wm = globalThis.__app.wm;
  const raw = typeof wm.windows === "function" ? wm.windows() : wm.windows;
  const list = Array.isArray(raw) ? raw : Array.from(raw?.children ?? raw?.value ?? raw ?? []);
  return {
    shape: Array.isArray(raw) ? "array" : typeof raw,
    n: Array.isArray(raw) ? raw.length : -1,
    keys: Object.keys(wm).filter((k) => /focus|front|active|order|top/i.test(k)),
    wins: list.map((w) => ({
      type: w?.constructor?.name ?? "?",
      title: String(w?.title ?? ""),
      root: String(w?.rootPath ?? ""),
      sel: String(w?.selPath ?? ""),
      x: Math.round(Number(w?.x ?? -1)), y: Math.round(Number(w?.y ?? -1)),
      active: w?.active ?? w?.focused ?? w?.isFront ?? null,
    })),
  };
});
const front = (want) => p.evaluate((w) => {
  const hits = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    if ((el.textContent ?? "").trim() !== w) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    hits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  for (const h of hits.sort((a, b) => b.y - a.y)) {
    const el = document.elementFromPoint(h.x, h.y);
    if ((el?.textContent ?? "").trim() === w) return h;
  }
  return hits[0] ?? null;
}, want);

console.log(URL_);
console.log("  at boot:", JSON.stringify(await dump(), null, 0).slice(0, 400));
const at = await front("Background");
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 90));
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 2500));
console.log("\n  after double-clicking Background:", JSON.stringify(await dump(), null, 0).slice(0, 700));
const at2 = await front("Operational");
await p.mouse.click(at2.x, at2.y); await new Promise(r => setTimeout(r, 2000));
console.log(`\n  after clicking Operational at (${Math.round(at2.x)}, ${Math.round(at2.y)}):`, JSON.stringify(await dump(), null, 0).slice(0, 700));
await b.close();
