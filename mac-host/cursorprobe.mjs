// What cursor does the DOM renderer show along a horizontal sweep?
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8260/apps/desktop/desktop.declare?render=dom", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));
const y = Number(process.argv[2] ?? 250);
for (const x of [660, 668, 672, 674, 676, 678, 680, 684, 690]) {
  const info = await p.evaluate((x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return `${x}: none`;
    let cur = "auto", n = el;
    while (n && cur === "auto") { cur = getComputedStyle(n).cursor; n = n.parentElement; }
    return `${x}: cursor=${cur} tag=${el.tagName}${el.className ? "." + String(el.className).slice(0, 24) : ""}`;
  }, x, y);
  console.log("  " + info);
}
await b.close();
