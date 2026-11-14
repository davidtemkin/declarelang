import puppeteer from "~/Code/Declare/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const [w, h, touch] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-first-run"] });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, isMobile: touch === "1", hasTouch: touch === "1" });
const t0 = Date.now();
await p.goto("http://127.0.0.1:8290/evals/reports/2026-11-12-cadence-run32-local/app/cadence.declare", { waitUntil: "domcontentloaded" });
const seen = [];
for (let i = 0; i < 40; i++) {
  const v = await p.evaluate(() => { const a = window.__declare?.find?.("app"); return a ? [a.ready, a.shownCount, a.shownTime, a.shownStreak, Math.round(a.shownPCount), Math.round(a.shownPTime)] : null; }).catch(() => null);
  seen.push(`${Date.now() - t0}ms ${JSON.stringify(v)}`);
  await new Promise((r) => setTimeout(r, 60));
}
console.log(seen.filter((s, i) => i === 0 || s.split(" ")[1] !== seen[i - 1].split(" ")[1]).join("\n"));
await p.screenshot({ path: process.argv[5] });
await b.close();
