// filesrows — is the Files window's folder list rendered TWICE? Prints every
// folder label on screen with its box, for whichever tree a server serves.
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null", { timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));
await p.evaluate("__app.launcher.newFiles()");
await new Promise(r => setTimeout(r, 1800));
const rows = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    const t = (el.textContent ?? "").trim();
    if (!/^(Language|Guide|Reference|Vocabulary|Operational|Background)$/.test(t)) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    out.push(`${t}@y${Math.round(r.top)}`);
  }
  return out.sort((a, b) => Number(a.split("@y")[1]) - Number(b.split("@y")[1]));
});
const counts = new Map();
for (const r of rows) { const n = r.split("@")[0]; counts.set(n, (counts.get(n) ?? 0) + 1); }
console.log(`${URL_}\n  ${rows.length} folder labels: ${rows.join(", ")}`);
console.log(`  duplicated: ${[...counts].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`).join(", ") || "none"}`);
await b.close();
