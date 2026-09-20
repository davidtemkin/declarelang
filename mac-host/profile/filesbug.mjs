// filesbug — DT's report (2026-09-17): in Desktop's Files window, clicking the
// "Operational" or "Background" folder gives doubled file icons, a folder label
// that goes white, a long pause, and a window title that names a DIFFERENT
// folder than the selected one.
//
//   node mac-host/profile/filesbug.mjs [--url http://127.0.0.1:8215/apps/desktop/]
//
// Reports, per click: how long the page took to go quiet, how many file rows
// appeared, how many of those rows are DUPLICATE names, what the window title
// says, and what the selected row's label color is.
import path from "node:path";
import puppeteer from "puppeteer-core";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const URL_ = flag("url", "http://127.0.0.1:8215/apps/desktop/");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: flag("headful", "") ? false : true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
await page.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction("window.__app != null", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));

// open a Files window the way the desktop's own stimulus does
await page.evaluate("__app.launcher.newFiles()");
await new Promise((r) => setTimeout(r, 1500));

/** Every text run on screen, with its box and color — the report is about what
 *  is VISIBLE, so read the rendered text rather than the model. */
const shot = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length > 0) continue;
    const t = (el.textContent ?? "").trim();
    if (t === "") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.push({ t, x: Math.round(r.left), y: Math.round(r.top), color: getComputedStyle(el).color });
  }
  return out;
});

/** Click the first visible text that reads exactly `label`. */
const clickLabel = async (label) => {
  const box = await page.evaluate((want) => {
    for (const el of document.querySelectorAll("p, span, div")) {
      if (el.children.length > 0) continue;
      if ((el.textContent ?? "").trim() !== want) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, label);
  if (box === null) return null;
  const t0 = Date.now();
  await page.mouse.click(box.x, box.y);
  // wait for the page to go quiet: two consecutive frames with no settle work
  await page.evaluate(() => new Promise((r) => {
    let quiet = 0;
    const tick = () => { quiet = document.querySelectorAll("*").length === globalThis.__lastN ? quiet + 1 : 0; globalThis.__lastN = document.querySelectorAll("*").length; quiet >= 6 ? r() : requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })).catch(() => {});
  return Date.now() - t0;
};

const dup = (rows) => {
  const seen = new Map();
  for (const r of rows) seen.set(r.t, (seen.get(r.t) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1);
};

console.log(`desktop Files — ${URL_}\n`);
for (const folder of ["Language", "Operational", "Background", "Operational"]) {
  const ms = await clickLabel(folder);
  if (ms === null) { console.log(`  ${folder.padEnd(12)} (no such label on screen)`); continue; }
  await new Promise((r) => setTimeout(r, 600));
  const rows = await shot();
  const titles = rows.filter((r) => r.y < 120 && r.x > 400 && r.x < 1100).map((r) => r.t);
  const selected = rows.find((r) => r.t === folder);
  const dups = dup(rows).filter(([t]) => t !== "" && t.length > 3);
  console.log(`  ${folder.padEnd(12)} settled in ${String(ms).padStart(5)} ms · ${rows.length} text runs · title: ${JSON.stringify(titles.slice(0, 2))}`);
  console.log(`  ${"".padEnd(12)} selected label color: ${selected?.color ?? "(gone)"} · duplicated: ${dups.length === 0 ? "none" : dups.slice(0, 6).map(([t, n]) => `${JSON.stringify(t)}×${n}`).join(", ")}`);
}
if (errors.length) console.log("\npage errors:\n  " + errors.slice(0, 4).join("\n  "));
await browser.close();
