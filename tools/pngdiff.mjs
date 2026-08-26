// pngdiff — how different are two screenshots?
//
//   node tools/pngdiff.mjs a.png b.png
//
// The deviation test: the raster memo's contract is that cached and uncached
// frames are the same picture, and the pin proves it on Chrome. This is the
// same comparison for a pair of shots from ANY engine — Safari, Firefox, the
// Simulator — so the contract is checked where it was never pinned. Decodes in
// a browser (the one PNG decoder on hand) and reports differing pixels with
// the fidelity rig's thresholds: > 24 summed channel delta differs, > 120 is
// structural.
import { readFileSync, existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error("usage: node tools/pngdiff.mjs a.png b.png"); process.exit(2); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const r = await page.evaluate(async (A, B) => {
  const load = (d) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + d; });
  const [ia, ib] = await Promise.all([load(A), load(B)]);
  const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, w, h).data;
  g.clearRect(0, 0, w, h); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, w, h).data;
  let diff = 0, big = 0, sum = 0;
  for (let i = 0; i < w * h * 4; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    sum += d; if (d > 24) { diff++; if (d > 120) big++; }
  }
  return { size: `${w}x${h}`, sizeA: `${ia.width}x${ia.height}`, sizeB: `${ib.width}x${ib.height}`,
    diffPct: +(100 * diff / (w * h)).toFixed(3), bigPct: +(100 * big / (w * h)).toFixed(3), meanD: +(sum / (w * h) / 3).toFixed(3) };
}, readFileSync(a).toString("base64"), readFileSync(b).toString("base64"));
await browser.close();
console.log(`${a} vs ${b}: ${r.size} · differing ${r.diffPct}% · structural ${r.bigPct}% · meanΔ ${r.meanD}` + (r.sizeA !== r.sizeB ? `  ⚠ sizes differ (${r.sizeA} vs ${r.sizeB})` : ""));
