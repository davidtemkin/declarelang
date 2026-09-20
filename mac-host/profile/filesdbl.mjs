// filesdbl — the gesture DT used: clicking a folder in the Files window. A
// SECOND click within the double-click window opens a new window rooted there
// (desktop.declare secondClick → openFolderWindow). Reports what that window
// says its title is, which row is highlighted, and how long it took.
import puppeteer from "puppeteer-core";
const URL_ = process.argv[2] ?? "http://127.0.0.1:8215/apps/desktop/";
const OUT = "/private/tmp/claude-503/-Users-temkin-Code-Declare/c4b17870-b7f5-4138-a938-c0fe32a94c4c/scratchpad";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 950 });
await p.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction("window.__app != null"); await new Promise(r => setTimeout(r, 3000));

// the frontmost copy of a label: the one elementFromPoint agrees with
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

// what the user sees: every text run, plus whichever row sits on a blue fill
const seen = () => p.evaluate(() => {
  const out = { titles: [], highlighted: [], files: [] };
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length) continue;
    const t = (el.textContent ?? "").trim(); if (!t) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    // a row is highlighted when something behind it is painted with a strong blue
    let blue = false;
    for (let a = el.parentElement, i = 0; a && i < 4; a = a.parentElement, i++) {
      const bg = getComputedStyle(a).backgroundColor;
      const m = /rgba?\((\d+), (\d+), (\d+)/.exec(bg);
      if (m && Number(m[3]) > 150 && Number(m[3]) - Number(m[1]) > 60) { blue = true; break; }
    }
    if (blue) out.highlighted.push(t);
    if (r.top < 165 && r.left > 300) out.titles.push(t);
    if (r.left > 400 && r.top > 165 && out.files.length < 4) out.files.push(t);
  }
  return out;
});

const label = process.argv[3] ?? "Background";
const at = await front(label);
console.log(`${URL_}\n  double-clicking "${label}" at (${Math.round(at.x)}, ${Math.round(at.y)})`);
const t0 = Date.now();
await p.mouse.click(at.x, at.y);
await new Promise(r => setTimeout(r, 90));         // inside the double-click window
await p.mouse.click(at.x, at.y);
await new Promise(r => setTimeout(r, 2500));
const s = await seen();
console.log(`  ${Date.now() - t0} ms later`);
console.log(`    titles:      ${JSON.stringify(s.titles)}`);
console.log(`    highlighted: ${JSON.stringify(s.highlighted)}`);
console.log(`    first files: ${JSON.stringify(s.files)}`);
await p.screenshot({ path: `${OUT}/files-dbl-${label}.png` });

// NOW THE STEP DT'S SCREENSHOT SHOWS: inside that window, single-click a
// DIFFERENT folder. The band should move AND the column beside it should become
// that folder's contents.
const other = process.argv[4] ?? "Operational";
const at2 = await front(other);
console.log(`\n  single-clicking "${other}" in that window at (${Math.round(at2.x)}, ${Math.round(at2.y)})`);
const t1 = Date.now();
await p.mouse.click(at2.x, at2.y);
await new Promise(r => setTimeout(r, 2500));
const s2 = await seen();
console.log(`  ${Date.now() - t1} ms later`);
console.log(`    titles:      ${JSON.stringify(s2.titles)}`);
console.log(`    highlighted: ${JSON.stringify(s2.highlighted)}`);
console.log(`    first files: ${JSON.stringify(s2.files)}`);
await p.screenshot({ path: `${OUT}/files-then-${other}.png` });
await b.close();
