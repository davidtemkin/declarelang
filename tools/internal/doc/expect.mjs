// Run against a dev server: node tools/internal/doc/expect.mjs [--base http://localhost:8200] 
// Outputs land under .derive/inspect/ (ignored). Needs Chrome at the path below.
// interactive expectations: for each island, an ACTION and what must be OBSERVABLE
// afterwards — text that appears inside the island, or a change in its pixels.
import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = ".derive/inspect"; mkdirSync(OUT, { recursive: true });
const BASE = (() => { const i = process.argv.indexOf("--base"); return i >= 0 ? process.argv[i + 1] : "http://localhost:8200"; })();
const CHECKS = [
  // page, slot, action, expect
  { page: "reference/Button", slot: "run:Button.1-pair", action: { click: "Save" }, expect: { text: "saved 1 time" } },
  { page: "reference/Button", slot: "run:Button.3-menu", action: { click: "Edit" }, expect: { text: "Copy" } },
  { page: "reference/Switch", slot: "run:Switch", action: { clickAt: [40, 30] }, expect: { text: "Dark mode on" } },
  { page: "reference/Checkbox", slot: "run:seg_Checkbox_0", action: { click: "Mute" }, expect: { pixels: true } },
  { page: "reference/Accordion", slot: "run:seg_Accordion_0", action: { click: "Privacy" }, expect: { pixels: true } },
  { page: "reference/MenuBar", slot: "run:seg_MenuBar_0", action: { click: "File" }, expect: { text: "Open…" } },
  { page: "reference/Menu", slot: "run:seg_Menu_0", action: { click: "Edit" }, expect: { text: "Paste" } },
  { page: "reference/Dialog", slot: "run:seg_Dialog_0", action: { click: "Delete…" }, expect: { text: "Delete this file?" } },
  { page: "reference/TweenLayout", slot: "run:TweenLayout", action: { clickAt: [300, 100] }, expect: { pixels: true } },
  { page: "reference/Segmented", slot: "run:seg_Segmented_0", action: { click: "Three" }, expect: { text: "showing: three" } },
  { page: "reference/SegmentedItem", slot: "run:SegmentedItem", action: { click: "Month" }, expect: { text: "showing the month" } },
  { page: "reference/Node", slot: "run:Node", action: { click: "+" }, expect: { text: "15" } },
  { page: "reference/Focus", slot: "run:Focus", action: { click: "next →" }, expect: { text: "focus:" } },
  { page: "reference/TextInput", slot: "run:TextInput", action: { type: "hello" }, expect: { text: "hello" } },
  { page: "reference/Video", slot: "run:seg_Video_0", action: { none: true }, expect: { text: "playing" } },
  { page: "reference/DataSource", slot: "run:DataSource", action: { none: true }, expect: { text: "Lisbon" } },
  { page: "reference/Image", slot: "run:Image", action: { none: true }, expect: { text: "none ·" } },
  { page: "reference/Audio", slot: "run:Audio", action: { click: "Play" }, expect: { pixels: true } },
  { page: "reference/Animator", slot: "run:Animator", action: { click: "click" }, expect: { pixels: true } },
  { page: "reference/AnimatorGroup", slot: "run:seg_AnimatorGroup_0", action: { none: true }, expect: { text: "fade in" } },
  { page: "reference/Spring", slot: "run:seg_Spring_0", action: { hoverAt: [400, 40] }, expect: { pixels: true } },
  { page: "reference/State", slot: "run:State", action: { clickAt: [60, 40] }, expect: { pixels: true } },
  { page: "reference/Slider", slot: "run:seg_Slider_0", action: { clickAt: [200, 30] }, expect: { pixels: true } },
  { page: "reference/ProgressBar", slot: "run:ProgressBar", action: { clickAt: [200, 60] }, expect: { pixels: true } },
  { page: "reference/ResponsiveLayout", slot: "run:ResponsiveLayout", action: { clickAt: [40, 20] }, expect: { text: "stack" } },
  { page: "reference/Tooltip", slot: "run:seg_Tooltip_0", action: { hoverAt: [40, 22] }, expect: { text: "Save" } },
  { page: "reference/Tip", slot: "run:Tip", action: { hoverAt: [40, 40] }, expect: { text: "tip requested" } },
  { page: "reference/Keys", slot: "run:seg_Keys_0", action: { key: "ArrowUp" }, expect: { text: "n = 1" } },
  { page: "reference/Combobox", slot: "run:seg_Combobox_0", action: { type: "a" }, expect: { pixels: true } },
  { page: "reference/ContextMenu", slot: "run:seg_ContextMenu_0", action: { rightClickAt: [60, 40] }, expect: { pixels: true } },
  { page: "reference/DOMIsland", slot: "run:DOMIsland", action: { none: true }, expect: { text: "Cancel" } },
  { page: "reference/AppIsland", slot: "run:AppIsland", action: { none: true }, expect: { text: "Cancel" } },
  { page: "reference/RadioGroup", slot: "run:seg_RadioGroup_0", action: { click: "Large" }, expect: { pixels: true } },
  { page: "reference/Table", slot: "run:seg_Table_0", action: { click: "Grace" }, expect: { pixels: true } },
  { page: "reference/DataGrid", slot: "run:seg_DataGrid_0", action: { click: "Draft the chapter" }, expect: { pixels: true } },
  { page: "language/class", slot: "run:form-class", action: { click: "one" }, expect: { text: "one ×1" } },
  { page: "language/class", slot: "run:form-classroot", action: { click: "Sent" }, expect: { pixels: true } },
  { page: "language/app", slot: "run:form-app", action: { clickAt: [200, 100] }, expect: { text: "fact: 1" } },
  { page: "language/instance", slot: "run:form-instance", action: { clickAt: [60, 60] }, expect: { text: "card: 1" } },
  { page: "language/declare", slot: "run:form-declare", action: { clickAt: [60, 40] }, expect: { text: "1 clicks" } },
  { page: "language/child", slot: "run:form-child", action: { clickAt: [200, 60] }, expect: { text: "260px" } },
  { page: "language/method", slot: "run:form-method", action: { click: "+" }, expect: { text: "3 × 12.5" } },
  { page: "language/handler", slot: "run:form-handler", action: { hoverAt: [100, 80] }, expect: { text: "pointer at" } },
  { page: "language/arrow", slot: "run:form-arrow", action: { click: "whole" }, expect: { text: "total: 1235" } },
  { page: "language/constraint", slot: "run:form-constraint-deps", action: { click: "rate + 1" }, expect: { text: "method: 33" } },
  { page: "language/datapath", slot: "run:form-datapath", action: { click: "add a record" }, expect: { text: "Person 3" } },
  { page: "language/twoway", slot: "run:form-twoway", action: { click: "rename from the data side" }, expect: { text: "Set by a handler" } },
  { page: "language/include", slot: "run:form-include", action: { none: true }, expect: { text: "included" } },
  { page: "language/use", slot: "run:form-use", action: { click: "createView(\"Badge\")" }, expect: { text: "1 constructed" } },
  { page: "language/style", slot: "run:form-style", action: { clickAt: [300, 20] }, expect: { pixels: true } },
  { page: "language/stylesheet", slot: "run:form-stylesheet", action: { clickAt: [40, 28] }, expect: { text: "Night sheet" } },
  { page: "language/schema", slot: "run:form-schema", action: { clickAt: [30, 58] }, expect: { pixels: true } },
  { page: "language/scope", slot: "run:form-scope", action: { none: true }, expect: { text: "classroot: 260" } },
];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const results = [];
let lastPage = "";
for (const c of CHECKS) {
  if (c.page !== lastPage) {
    errors.length = 0;
    await page.goto(`${BASE}/apps/docs/docs.declare#${c.page}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 4500));
    lastPage = c.page;
  }
  const sel = `[data-declare-slot="${c.slot}"]`;
  const found = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: "center" }); return true; }, sel);
  if (!found) { results.push({ ...c, ok: false, why: "island not found" }); console.log("MISSING", c.page, c.slot); continue; }
  await new Promise((r) => setTimeout(r, 400));
  const box = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(1, Math.min(box.w, 1280 - box.x)), height: Math.max(1, Math.min(box.h, 900 - box.y)) };
  const before = await page.screenshot({ clip });
  const a = c.action;
  const at = (xy) => ({ x: box.x + xy[0], y: box.y + xy[1] });
  const leaf = async (txt) => page.evaluate((sel, txt) => {
    const el = [...document.querySelector(sel).querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === txt);
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel, txt);
  const pointer = async (i) => page.evaluate((sel, i) => {
    const hits = [...document.querySelector(sel).querySelectorAll("*")].filter((e) => getComputedStyle(e).cursor === "pointer" && e.getBoundingClientRect().width > 0);
    const el = i < 0 ? hits[hits.length + i] : hits[i]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel, i);
  let acted = "";
  try {
    if (a.click !== undefined) { const p = await leaf(a.click); if (!p) throw new Error(`no leaf '${a.click}'`); await page.mouse.click(p.x, p.y); acted = "click " + a.click; }
    else if (a.clickPointer !== undefined) { const p = await pointer(a.clickPointer); if (!p) throw new Error("no pointer element"); await page.mouse.click(p.x, p.y); acted = "click pointer"; }
    else if (a.clickAt) { const p = at(a.clickAt); await page.mouse.click(p.x, p.y); acted = "click at"; }
    else if (a.rightClickAt) { const p = at(a.rightClickAt); await page.mouse.click(p.x, p.y, { button: "right" }); acted = "right-click"; }
    else if (a.hoverAt) { const p0 = at([10, 10]); await page.mouse.move(p0.x, p0.y); const p = at(a.hoverAt); await page.mouse.move(p.x, p.y, { steps: 8 }); acted = "hover"; }
    else if (a.hoverPointer !== undefined) { const p = await pointer(a.hoverPointer); if (!p) throw new Error("no pointer element"); await page.mouse.move(p.x, p.y); acted = "hover pointer"; await new Promise((r) => setTimeout(r, 900)); }
    else if (a.type) { const p = await pointer(0) ?? at([60, 30]); await page.mouse.click(p.x, p.y); await page.keyboard.type(a.type); acted = "type"; }
    else if (a.key) { const p = at([60, 30]); await page.mouse.click(p.x, p.y); await page.keyboard.press(a.key); acted = "key " + a.key; }
    else acted = "none";
  } catch (e) { results.push({ ...c, ok: false, why: e.message }); console.log("FAIL", c.page, c.slot, "—", e.message); continue; }
  await new Promise((r) => setTimeout(r, 900));
  const after = await page.screenshot({ clip });
  const text = await page.evaluate((sel) => document.querySelector(sel).textContent, sel);
  const ok = c.expect.text ? text.includes(c.expect.text) : Buffer.compare(before, after) !== 0;
  writeFileSync(`${OUT}/expect-${c.page.replace(/[^a-zA-Z0-9]+/g, "_")}-${c.slot.replace(/[^a-zA-Z0-9]+/g, "_")}.png`, after);
  results.push({ ...c, ok, acted, why: ok ? "" : (c.expect.text ? `text '${c.expect.text}' not found` : "pixels unchanged") });
  console.log(ok ? "ok  " : "FAIL", c.page, c.slot, "—", acted, ok ? "" : "— " + results.at(-1).why);
  await page.keyboard.press("Escape");
}
writeFileSync(OUT + "/expect.json", JSON.stringify(results, null, 1));
console.log(`expect: ${results.filter((r) => r.ok).length} ok, ${results.filter((r) => !r.ok).length} failed of ${results.length}`);
await browser.close();
