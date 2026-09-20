// filescount — how many Files windows does ONE newFiles() open?
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 3000));
// one "Language" row per Files window on screen
const count = () => p.evaluate(() => {
  let n = 0;
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    if ((el.textContent ?? "").trim() === "Language") { const r = el.getBoundingClientRect(); if (r.width) n++; }
  }
  return n;
});
console.log(URL_);
console.log("  at boot:            ", await count(), "Files window(s)");
await p.evaluate("__app.launcher.newFiles()"); await new Promise(r => setTimeout(r, 1800));
console.log("  after 1 newFiles(): ", await count());
await p.evaluate("__app.launcher.newFiles()"); await new Promise(r => setTimeout(r, 1800));
console.log("  after 2 newFiles(): ", await count());
await b.close();
