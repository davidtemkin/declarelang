// filesprobe — DT (2026-09-17): clicking a folder in Desktop's Files window
// does strange things. Observed: clicking "Operational" selects and opens
// VOCABULARY, the row directly above it.
//
// This measures the hit test rather than eyeballing it: it reads each row's
// label and box from the rendered page, clicks the exact CENTRE of one row, and
// reports which row the app actually selected — plus the window title and the
// first file in the next column, so a stale column shows up too.
//
//   node mac-host/profile/filesprobe.mjs --url http://127.0.0.1:8215/apps/desktop/
import puppeteer from "puppeteer-core";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const URL_ = flag("url", "http://127.0.0.1:8215/apps/desktop/");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
await page.goto(URL_, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction("window.__app != null", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate("__app.launcher.newFiles()");
await new Promise((r) => setTimeout(r, 1800));

/** The Files window's own state, straight from the program: which window, what
 *  it is rooted at, and what it thinks is selected. */
const state = () => page.evaluate(() => {
  const wins = (globalThis.__app?.wm?.wins ?? []).map((w) => ({
    title: String(w.title ?? ""),
    root: String(w.rootPath ?? ""),
    sel: String(w.selPath ?? ""),
  }));
  return { wins, count: wins.length };
});

/** Every folder row on screen with its box, nearest window first. */
const rows = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length > 0) continue;
    const t = (el.textContent ?? "").trim();
    if (!/^(Language|Guide|Reference|Vocabulary|Operational|Background)$/.test(t)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    out.push({ t, x: Math.round(r.left), y: Math.round(r.top), h: Math.round(r.height), cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
  }
  return out.sort((a, b) => a.y - b.y);
});

console.log(`desktop Files — ${URL_}\n`);
const before = await state();
console.log(`  windows open: ${before.count} — ${before.wins.map((w) => `${w.title || "(untitled)"} root=${w.root} sel=${w.sel}`).join(" | ")}`);

const all = await rows();
console.log(`  folder rows on screen: ${all.map((r) => `${r.t}@y${r.y}h${r.h}`).join(", ")}\n`);

// click the CENTRE of one row, then report what the app selected
const target = all.find((r) => r.t === "Operational");
if (!target) { console.log("  no Operational row found"); await browser.close(); process.exit(0); }
console.log(`  clicking "${target.t}" at its centre (${Math.round(target.cx)}, ${Math.round(target.cy)}) — row spans y ${target.y}..${target.y + target.h}`);
const t0 = Date.now();
await page.mouse.click(target.cx, target.cy);
await new Promise((r) => setTimeout(r, 1500));
const after = await state();
console.log(`  ${Date.now() - t0} ms later: ${after.count} window(s) — ${after.wins.map((w) => `${w.title || "(untitled)"} root=${w.root} sel=${w.sel}`).join(" | ")}`);

// where does the boundary actually sit? walk down the column a few pixels at a
// time and record which row each y selects
console.log("\n  hit test, pixel by pixel (y → what the app selected):");
for (const r of all) {
  for (const dy of [2, Math.round(r.h / 2), r.h - 2]) {
    const y = r.y + dy;
    await page.mouse.click(r.cx, y);
    await new Promise((s) => setTimeout(s, 350));
    const st = await state();
    const sel = st.wins[st.wins.length - 1]?.sel ?? "";
    console.log(`    row ${r.t.padEnd(12)} y=${String(y).padStart(4)} (row top ${r.y}) → selected ${sel.split("/").pop() || "(none)"}`);
  }
}
await browser.close();
