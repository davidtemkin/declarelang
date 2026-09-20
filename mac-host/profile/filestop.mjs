// filestop — what is actually ON TOP at each point of the Files column: the
// element the user sees and the one a click hits (elementFromPoint), versus the
// labels merely present in the DOM (which may be clipped out of view).
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 2500));
await p.evaluate("__app.launcher.newFiles()"); await new Promise(r => setTimeout(r, 1800));
const out = await p.evaluate(() => {
  const NAMES = /^(Language|Guide|Reference|Vocabulary|Operational|Background)$/;
  const labels = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    const t = (el.textContent ?? "").trim(); if (!NAMES.test(t)) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    // is it actually visible? walk up for a clipping ancestor that excludes it
    let vis = true;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflow !== "visible") {
        const ar = a.getBoundingClientRect();
        if (r.bottom <= ar.top + 0.5 || r.top >= ar.bottom - 0.5) { vis = false; break; }
      }
      if (cs.opacity === "0" || cs.visibility === "hidden" || cs.display === "none") { vis = false; break; }
    }
    labels.push({ t, y: Math.round(r.top), x: Math.round(r.left), vis });
  }
  labels.sort((a, b) => a.y - b.y);
  // and what a click at each row centre would hit
  const probes = [];
  for (let y = 145; y < 320; y += 5) {
    const el = document.elementFromPoint(200, y);
    probes.push({ y, text: (el?.textContent ?? "").trim().slice(0, 24) });
  }
  return { labels, probes };
});
console.log(URL_);
console.log("  labels in the DOM (vis = actually visible):");
for (const l of out.labels) console.log(`    ${l.t.padEnd(12)} x=${l.x} y=${l.y}  ${l.vis ? "VISIBLE" : "clipped"}`);
console.log("  what a click at x=200 would hit:");
for (const q of out.probes) if (q.text) console.log(`    y=${q.y}  ${q.text}`);
await b.close();
