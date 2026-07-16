// Docs-app location integration (design/location.md) — live chromium. The docs app
// is a transparent rewiring: same tabs/panels/memory, now with a URL, deep links,
// back/forward. Also the Phase-B gate's cold-deep-link-while-DataSource-fetching race:
// a fragment `@heading` reveals a chapter heading once the model has been fetched.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const DOCS = "http://localhost:8364/examples/docs/docs.declare";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, got, want) {
  const ok = Object.keys(want).every((k) => got[k] === want[k]);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} — ${label}\n       got  ${JSON.stringify(got)}${ok ? "" : "\n       want " + JSON.stringify(want)}`);
}
const b = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1200, height: 820 });
const state = (pg = page) => pg.evaluate(() => ({
  loc: window.__app?.location, mode: window.__app?.mode, chapter: window.__app?.chapter,
  selected: window.__app?.selected, hash: location.hash,
}));
// Click a leaf element with exact text; `railOnly` restricts to the left rail (x<248)
// so a class name that also appears in prose doesn't steal the click.
async function clickText(t, railOnly = false) {
  const box = await page.evaluate((txt, rail) => {
    const els = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.textContent.trim() === txt);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (rail && r.x + r.width / 2 > 248) continue;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  }, t, railOnly);
  if (!box) throw new Error("no hittable text " + JSON.stringify(t) + (railOnly ? " (rail)" : ""));
  await page.mouse.click(box.x, box.y);
  await wait(650);
}

// 1) cold load, no fragment → the declared initial, clean URL (§3).
await page.goto(DOCS, { waitUntil: "networkidle0", timeout: 30000 });
await wait(2200);   // let the DataSource land + render
check("cold docs → guide/00-shape, clean URL", await state(), { mode: "guide", chapter: "00-shape", hash: "" });

// 2) Reference mode → reference/<remembered View>, pushes the fragment.
await clickText("Reference", true);
check("click Reference → reference view + #reference/View", await state(), { mode: "reference", selected: "View", hash: "#reference/View" });

// 3) pick a class in the rail → reference/Image.
await clickText("Image", true);
check("click Image (rail) → #reference/Image", await state(), { mode: "reference", selected: "Image", hash: "#reference/Image" });

// 4) back to Guide → guide/00-shape is the DEFAULT, so a CLEAN URL (§3), not #guide/00-shape.
await clickText("Guide", true);
check("click Guide → guide default, clean URL", await state(), { mode: "guide", chapter: "00-shape", hash: "" });

// 5) Reference again → the reference cursor is REMEMBERED (Image), cross-mode memory intact.
await clickText("Reference", true);
check("Reference again → remembered Image (#reference/Image)", await state(), { mode: "reference", selected: "Image", hash: "#reference/Image" });

// 6) browser BACK → the previous entry (guide default, clean URL).
await page.evaluate(() => history.back()); await wait(800);
check("back → guide default", await state(), { mode: "guide", hash: "" });

// 7) DATA-SOURCE RACE: fresh cold deep link with an @anchor into a chapter whose prose
//    is fetched. The heading must be revealed once the model lands (held until then).
const p2 = await b.newPage();
await p2.setViewport({ width: 1200, height: 820 });
await p2.goto(`${DOCS}#guide/20-tree@components-are-classes`, { waitUntil: "networkidle0", timeout: 30000 });
await wait(2600);   // model fetch + chapter render + reveal
const race = await p2.evaluate(() => ({
  mode: window.__app?.mode, chapter: window.__app?.chapter, hash: location.hash,
  detailScrollY: window.__app?.detail?.scrollY ?? -1,
  anchorPresent: !!document.querySelector('[data-anchor="components-are-classes"]'),
}));
check("cold #guide/20-tree@... → chapter shown, heading present", { mode: race.mode, chapter: race.chapter, anchorPresent: race.anchorPresent }, { mode: "guide", chapter: "20-tree", anchorPresent: true });
const revealed = race.detailScrollY > 50;
if (!revealed) failures++;
console.log(`${revealed ? "ok  " : "FAIL"} — cold deep link reveals the chapter heading (DataSource race)\n       detail.scrollY=${race.detailScrollY}`);

console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILED"}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);
