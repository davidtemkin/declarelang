import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
function findChrome(){for(const c of [process.env.PUPPETEER_EXECUTABLE_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium"].filter(Boolean)) if(existsSync(c)) return c; throw new Error("no chrome");}
const BASE = "http://localhost:8364";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} — ${label}\n       got  ${JSON.stringify(got)}${ok?"":"\n       want "+JSON.stringify(want)}`);
}
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args:["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });

const state = (pg=page) => pg.evaluate(() => ({
  loc: window.__app ? window.__app.location : "<no app>",
  hash: location.hash,
  home: document.body.innerText.includes("is the UI language for the AI era"),
  why: document.body.innerText.includes("The studies:"),
}));
async function clickText(t, pg=page) {
  const box = await pg.evaluate((txt) => {
    const el = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && e.textContent.trim() === txt);
    if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height };
  }, t);
  if (!box || box.w === 0) throw new Error("no hittable element with text " + JSON.stringify(t));
  await pg.mouse.click(box.x, box.y);
  await wait(700);
}

// 1) cold "/" — home view, clean URL (default rule §3)
await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
await wait(2500);
check("cold / → home view, clean URL", await state(), { loc: "home", hash: "", home: true, why: false });

// 2) click the hero link "Why a new language, now? →" (a location WRITE) → why + #why
await clickText("Why a new language, now? →");
check("hero link → why view + #why (one push)", await state(), { loc: "why", hash: "#why", home: false, why: true });

// 3) browser BACK → home, clean URL restored (§3: back past nav restores the initial)
await page.evaluate(() => history.back()); await wait(800);
check("back → home + clean URL", await state(), { loc: "home", hash: "", home: true, why: false });

// 4) browser FORWARD → why, #why
await page.evaluate(() => history.forward()); await wait(800);
check("forward → why + #why", await state(), { loc: "why", hash: "#why", home: false, why: true });

// 5) on the WHY view the header is opaque — click the "Why Declare" pill (exemplar pill, a no-op re-nav
//    to "why": same location, so NO new history push) then the wordmark home. First verify the pill exists+hittable.
await page.evaluate(() => history.back()); await wait(800);   // back to home
// scroll home down so the sticky header fades in (fadeIn spring keys on scrollY > 80), then click the pill
await page.evaluate(() => window.__app.scroller && (window.__app.scroller.scrollY = 400));
await wait(700);
await clickText("Why Declare");
check("scroll+click Why Declare pill → why + #why", await state(), { loc: "why", hash: "#why", home: false, why: true });

// 6) COLD DEEP LINK: fresh load of /#why → why view immediately (seed before first paint, no flash)
const p2 = await browser.newPage();
await p2.setViewport({ width: 1200, height: 900 });
await p2.goto(BASE + "/#why", { waitUntil: "networkidle0", timeout: 30000 });
await wait(2500);
check("cold /#why → why view (deep-link seed)", await state(p2), { loc: "why", hash: "#why", home: false, why: true });

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILED"}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
