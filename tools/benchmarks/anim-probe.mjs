// anim-probe.mjs — drive the calendar-stress year<->month animated transition on ONE kernel via a
// scripted real mouse click, sampling requestAnimationFrame frame-times to get a rough fps read, and
// capturing a mid-transition frame + the settled month + the settled year-again frame.
//
//   node anim-probe.mjs <url> <outPrefix> [gridClickX gridClickY yearBtnX yearBtnY]
//
// Prints one JSON line: per-phase {frames, mean/median/p95 interval ms, fps, longest ms}.

import pp from "/Users/temkin/Code/OpenLaszlo/openlaszlo-5.0/compiler/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

const CHROME = "/Users/temkin/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [url, outPrefix] = [process.argv[2], process.argv[3]];
// default click points: June grid (idx5, gcol1/grow1) centre ~ (340,353); "Year" header button ~ (767,36)
const GX = +(process.argv[4] || 340), GY = +(process.argv[5] || 353);
const YX = +(process.argv[6] || 767), YY = +(process.argv[7] || 36);

async function launch() { for (let i = 0; i < 8; i++) { try {
  return await pp.launch({ executablePath: CHROME, headless: "new", userDataDir: "/tmp/anim-" + Date.now() + "-" + i,
    args: ["--no-sandbox", "--force-device-scale-factor=1", "--window-size=900,640"] });
} catch (e) { await sleep(1200); } } throw new Error("launch failed x8"); }

function stats(intervals) {
  if (!intervals.length) return { frames: 0 };
  const s = intervals.slice().sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const mean = sum / s.length;
  const median = s[s.length >> 1];
  const p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  const longest = s[s.length - 1];
  return { frames: s.length + 1, meanMs: +mean.toFixed(1), medianMs: +median.toFixed(1),
    p95Ms: +p95.toFixed(1), longestMs: +longest.toFixed(1), fps: +(1000 / mean).toFixed(1) };
}

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
for (let i = 0; i < 300; i++) { const ok = await p.evaluate(() => typeof canvas !== "undefined" && canvas && canvas.isinited).catch(() => 0); if (ok) break; await sleep(50); }
await sleep(400);

// install a continuous rAF timestamp recorder
await p.evaluate(() => { window.__ts = []; (function loop(t){ window.__ts.push(t); requestAnimationFrame(loop); })(performance.now()); });

// ---- PHASE 1: expand (click a month) ----
const t0 = await p.evaluate(() => performance.now());
await p.mouse.click(GX, GY);
await sleep(160);
await p.screenshot({ type: "png" }).then((buf) => fs.writeFileSync(outPrefix + "-expand-mid.png", buf));
await sleep(500);
const expandedOK = await p.evaluate(() => canvas.yearview.expandedGrid != null);
const t1 = await p.evaluate(() => performance.now());
// settle: capture the month view
{ let prev = null; for (let i = 0; i < 20; i++) { const buf = await p.screenshot({ type: "png" });
  if (prev && Buffer.compare(prev, buf) === 0) { fs.writeFileSync(outPrefix + "-month.png", buf); break; } prev = buf; await sleep(100); }
  if (prev) fs.writeFileSync(outPrefix + "-month.png", prev); }

// ---- PHASE 2: collapse (click Year) ----
const t2 = await p.evaluate(() => performance.now());
await p.mouse.click(YX, YY);
await sleep(160);
await p.screenshot({ type: "png" }).then((buf) => fs.writeFileSync(outPrefix + "-collapse-mid.png", buf));
await sleep(500);
const collapsedOK = await p.evaluate(() => canvas.yearview.expandedGrid == null);
const t3 = await p.evaluate(() => performance.now());
{ let prev = null; for (let i = 0; i < 20; i++) { const buf = await p.screenshot({ type: "png" });
  if (prev && Buffer.compare(prev, buf) === 0) { fs.writeFileSync(outPrefix + "-year2.png", buf); break; } prev = buf; await sleep(100); }
  if (prev) fs.writeFileSync(outPrefix + "-year2.png", prev); }

const ts = await p.evaluate(() => window.__ts);
function phase(a, bb) { const f = ts.filter((t) => t >= a && t <= bb); const iv = [];
  for (let i = 1; i < f.length; i++) iv.push(f[i] - f[i - 1]); return stats(iv); }

const res = { expand: phase(t0, t1), collapse: phase(t2, t3), expandedOK, collapsedOK,
  expandMs: +(t1 - t0).toFixed(0), collapseMs: +(t3 - t2).toFixed(0) };
console.log(JSON.stringify(res));
await b.close();
