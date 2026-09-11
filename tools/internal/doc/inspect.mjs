// Run against a dev server: node tools/internal/doc/inspect.mjs [--base http://localhost:8200] [all|reference|language|<page>]
// Outputs land under .derive/inspect/ (ignored). Needs Chrome at the path below.
// the docs inspection pass: every reference and language page — find each live island,
// screenshot it, click it, and record whether it rendered, whether it responded, and
// any errors. Writes inspect/<page>.<n>.png per island and inspect/report.json.
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const model = JSON.parse(readFileSync("docs/declare-model.json", "utf8"));
const which = process.argv.find((a, i) => i >= 2 && !a.startsWith("--") && process.argv[i - 1] !== "--base") ?? "all";                // all | reference | language | <name>
let pages = [];
if (which === "all" || which === "reference") pages.push(...model.tree.filter((x) => x.attributes).map((x) => "reference/" + x.id));
if (which === "all" || which === "language") pages.push("language/", ...model.forms.order.map((s) => "language/" + s));
if (!pages.length) pages = [which];
const OUT = ".derive/inspect"; mkdirSync(OUT, { recursive: true });
const BASE = (() => { const i = process.argv.indexOf("--base"); return i >= 0 ? process.argv[i + 1] : "http://localhost:8200"; })();
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const report = [];
for (const loc of pages) {
  errors.length = 0;
  await page.goto(`${BASE}/apps/docs/docs.declare#${loc}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 4500));
  // the island hosts on this page
  const n = await page.evaluate(() => document.querySelectorAll('[data-declare-slot^="run:"]').length);
  const islands = [];
  for (let i = 0; i < n; i++) {
    const info = await page.evaluate((i) => {
      const el = document.querySelectorAll('[data-declare-slot^="run:"]')[i];
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const nodes = el.querySelectorAll("*").length;
      const text = (el.textContent || "").trim().length;
      const painted = [...el.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); return (s.backgroundColor && s.backgroundColor !== "rgba(0, 0, 0, 0)") || e.tagName === "IMG" || e.tagName === "VIDEO" || e.tagName === "CANVAS"; }).length;
      return { slot: el.getAttribute("data-declare-slot"), x: r.left, y: r.top, w: r.width, h: r.height, nodes, text, painted };
    }, i);
    await new Promise((r) => setTimeout(r, 400));
    const box = await page.evaluate((i) => { const r = document.querySelectorAll('[data-declare-slot^="run:"]')[i].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, i);
    const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(1, Math.min(box.w, 1280 - box.x)), height: Math.max(1, Math.min(box.h, 900 - box.y)) };
    const before = await page.screenshot({ clip });
    // click the island's first pointer-cursor element (a button, a switch, a chip) if it
    // has one; else a little inside its top-left — where most demos put their control
    const errBefore = errors.length;
    const target = await page.evaluate((i) => {
      const el = document.querySelectorAll('[data-declare-slot^="run:"]')[i];
      const hit = [...el.querySelectorAll("*")].find((e) => getComputedStyle(e).cursor === "pointer" && e.getBoundingClientRect().width > 0);
      if (!hit) return null; const r = hit.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, i);
    await page.mouse.click(target ? target.x : clip.x + Math.min(60, clip.width / 2), target ? target.y : clip.y + Math.min(40, clip.height / 2));
    await new Promise((r) => setTimeout(r, 700));
    const after = await page.screenshot({ clip });
    const changed = Buffer.compare(before, after) !== 0;
    const name = `${loc.replace(/[^a-zA-Z0-9]+/g, "_")}.${i}`;
    writeFileSync(`${OUT}/${name}.png`, after);
    islands.push({ slot: info.slot, nodes: info.nodes, text: info.text, painted: info.painted, changedOnClick: changed, errorsOnClick: errors.slice(errBefore), shot: `${OUT}/${name}.png`, h: Math.round(box.h) });
    // close anything the click opened (a menu, a dialog) before the next island
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 200));
  }
  report.push({ page: loc, islands, errors: [...errors] });
  const flags = islands.filter((x) => x.painted === 0 || x.errorsOnClick.length).length;
  console.log(`${loc}: ${n} island(s)${flags ? ` · ${flags} FLAGGED` : ""}${errors.length ? ` · ${errors.length} error(s)` : ""}`);
}
writeFileSync(OUT + "/report.json", JSON.stringify(report, null, 1));
await browser.close();
console.log("inspect done:", report.length, "pages");
