// frontwin — `active = { app.wm.frontWin == this }` is false for EVERY window
// after a folder window opens, although frontWin is a FilesWindow. Is it the
// same instance as one in windows()?
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 3000));
const dump = (tag) => p.evaluate((t) => {
  const wm = globalThis.__app.wm, wins = wm.windows();
  const id = (w) => w == null ? "null" : `${w.constructor?.name}#${w.recId ?? "?"}@${Math.round(w.x)},${Math.round(w.y)}`;
  return {
    tag: t, frontId: String(wm.frontId ?? ""), frontWin: id(wm.frontWin),
    inList: wins.some((w) => w === wm.frontWin),
    wins: wins.map((w) => `${id(w)} active=${w.active} parented=${w.parent != null}`),
  };
}, tag);
const front = (want) => p.evaluate((w) => {
  const hits = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    if ((el.textContent ?? "").trim() !== w) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    hits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  return hits.sort((a, b) => b.y - a.y)[0] ?? null;
}, want);
console.log(URL_);
console.log(" ", JSON.stringify(await dump("boot")));
const at = await front("Background");
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 90));
await p.mouse.click(at.x, at.y); await new Promise(r => setTimeout(r, 2500));
console.log(" ", JSON.stringify(await dump("after open")));
await b.close();
