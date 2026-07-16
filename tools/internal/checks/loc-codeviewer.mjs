import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const BASE = "http://localhost:8364/apps/bench/bench.declare";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(label, got, want) {
  const ok = Object.keys(want).every(k => got[k] === want[k]);
  if (!ok) failures++;
  console.log(`${ok?"ok  ":"FAIL"} — ${label}\n       got  ${JSON.stringify(got)}${ok?"":"\n       want "+JSON.stringify(want)}`);
}
const b = await puppeteer.launch({ executablePath: chrome, headless: true, args:["--no-sandbox"] });
const page = await b.newPage(); await page.setViewport({ width: 1200, height: 900 });
const state = (pg=page) => pg.evaluate(() => ({ loc: window.__app?.location, mode: window.__app?.mode, hash: location.hash }));
async function clickText(t, pg=page) {
  const box = await pg.evaluate((txt) => {
    const el = [...document.querySelectorAll("*")].find(e => e.children.length===0 && e.textContent.trim()===txt);
    if (!el) return null; const r = el.getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2, w:r.width };
  }, t);
  if (!box || box.w===0) throw new Error("no hittable text "+JSON.stringify(t));
  await pg.mouse.click(box.x, box.y); await wait(600);
}

// 1) ?view=reader → opens on reader (seeded from the request), clean URL
await page.goto(BASE + "?view=reader", { waitUntil: "networkidle0", timeout: 30000 }); await wait(2000);
check("?view=reader → reader tab, no fragment", await state(), { mode: "reader", hash: "" });

// 2) click "Live edit" → edit mode + #edit fragment
await clickText("Live edit");
check("click Live edit → edit + #edit", await state(), { mode: "edit", loc: "edit", hash: "#edit" });

// 3) click "Source text" → source mode + #source
await clickText("Source text");
check("click Source text → source + #source", await state(), { mode: "source", loc: "source", hash: "#source" });

// 4) browser BACK → edit again (walks the tab history)
await page.evaluate(() => history.back()); await wait(700);
check("back → edit tab", await state(), { mode: "edit", hash: "#edit" });

// 5) fresh ?view=edit → opens directly on the edit tab (the request → initial location)
const p2 = await b.newPage(); await p2.setViewport({ width: 1200, height: 900 });
await p2.goto(BASE + "?view=edit", { waitUntil: "networkidle0", timeout: 30000 }); await wait(2000);
check("?view=edit → edit tab on load", await state(p2), { mode: "edit" });

console.log(`\n${failures===0?"ALL GREEN":failures+" FAILED"}`);
await b.close();
process.exit(failures===0?0:1);
