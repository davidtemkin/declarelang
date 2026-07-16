// Phase B (@name reveal) — live chromium on BOTH backends (design/location.md §6).
// A tall scrolling Markdown fixture; a fragment `@slug` must bring that heading into
// view. Asserts the scroll offset (app.body.scrollY, updated by the reveal on both
// backends) moves to the target and returns to the top for the first heading.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const PROG = "http://localhost:8364/test/fixtures/anchortest.declare";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"} — ${label}${cond ? "" : "\n       " + detail}`);
}
const b = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const scrollY = (pg) => pg.evaluate(() => (window.__app && window.__app.body ? window.__app.body.scrollY : -1));
const setLoc = async (pg, v) => { await pg.evaluate((s) => { window.__app.location = s; }, v); await wait(500); };

for (const backend of ["DomBackend", "CanvasBackend"]) {
  const render = backend === "CanvasBackend" ? "?render=canvas" : "";
  console.log(`\n── ${backend} ──`);
  const page = await b.newPage();
  await page.setViewport({ width: 900, height: 700 });

  // 1) COLD DEEP LINK: /…#@fine-details → the target heading is revealed (scrolled down).
  await page.goto(`${PROG}${render}#@fine-details`, { waitUntil: "networkidle0", timeout: 30000 });
  await wait(1800);
  const fd = await scrollY(page);
  check(`${backend}: cold deep link #@fine-details reveals (scrolled down)`, fd > 150, `scrollY=${fd}`);

  // 2) nav to a HIGHER heading → a smaller, distinct offset (still below the top).
  await setLoc(page, "@getting-started");
  const gs = await scrollY(page);
  check(`${backend}: nav @getting-started lands above fine-details, below top`, gs > 20 && gs < fd - 40, `getting-started=${gs} vs fine-details=${fd}`);

  // 3) nav to the FIRST heading → returns near the top.
  await setLoc(page, "@introduction");
  const intro = await scrollY(page);
  check(`${backend}: nav @introduction returns near the top`, intro < 80, `scrollY=${intro}`);

  // 4) HELD intent: an unknown anchor does not move the scroll.
  await setLoc(page, "@does-not-exist");
  const held = await scrollY(page);
  check(`${backend}: unknown anchor is held (no jump)`, Math.abs(held - intro) < 5, `held=${held} vs intro=${intro}`);

  await page.close();
}

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILED"}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);
