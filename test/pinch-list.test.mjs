// A pinch on a drawing beside a virtualized list (runtime dom-backend.ts
// watchScrolling, virtualize.ts match): the reported case was Cadence's year
// chart, whose pinch rebuilt the period's list beneath it. A trackpad pinch
// arrives as ctrl+wheel events; a view that claims them is not the user
// scrolling the page, and records arriving above a list whose top is below the
// viewport's top move nothing — no row is placed above the list, and the page
// does not jump.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-pinch-list-");
const FILE = join(DIR, "probe.declare");
// rows run from (60 - span) to 59, oldest first: zooming out (span grows)
// brings records in ABOVE the first row, as Cadence's newest-first list did
writeFileSync(FILE, `App [ width = 900, height = 700, scrolls = y,
    span: number = 30,
    rows: Dataset [ contents = { { rows: Array.from({ length: Math.round(app.span) }, (_, i) => ({ id: "d" + (60 - Math.round(app.span) + i), n: 60 - Math.round(app.span) + i })) } } ],
    col: View [ width = 900,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        chart: View [ width = 900, height = 320, fill = #DDE4EE,
            onWheel(e: WheelEvent) { if (e.pinch) app.span = Math.max(4, Math.min(56, app.span * Math.exp(e.deltaY * 0.02))) } ],
        list: View [ width = 900, datapath = { app.rows.value },
            layout: SimpleLayout [ axis = y ],
            View [ datapath = :rows[], virtualize = true, width = 900, height = 40, fill = #FFFFFF,
                Text [ x = 10, y = 10, text = { "day " + (:n ?? 0) } ] ] ] ] ]`);

function run(name, body) {
  const script = join(DIR, `${name}.mjs`);
  writeFileSync(script, `export const device = { width: 900, height: 700 };
export default async ({ drive, expect, page }) => {
  const cdp = await page.target().createCDPSession();
  const pinch = async (dir, n) => {
    for (let i = 0; i < n; i++) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 450, y: 160, deltaX: 0, deltaY: dir * 6, modifiers: 2 });
      await drive.wait(16);
    }
  };
  const state = () => page.evaluate(() => {
    const app = window.__declare.find("app");
    const rows = window.__declare.find("app.col.list").childViews;
    return { scrolling: app.userScrolling, scrollY: Math.round(app.scrollY), above: rows.filter((r) => r.visible && r.y < 0).length, span: Math.round(app.span) };
  });
${body}
};`);
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), FILE, "--assert", script, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

await test("a pinch claimed by a view is not the user scrolling the page", () => {
  const r = run("claimed", `
  await pinch(-1, 12);
  const s = await state();
  if (s.scrolling !== false) throw new Error("the page reads as user-scrolled during a claimed pinch: " + JSON.stringify(s));
  if (s.scrollY !== 0) throw new Error("the page scrolled under a claimed pinch: " + JSON.stringify(s));`);
  assert.ok(r.ok, r.out);
});

await test("records arriving above a list below the viewport's top move nothing: no row above the list, no jump", () => {
  const r = run("arrivals", `
  await pinch(-1, 14);          // zoom in: the list shrinks
  const small = await state();
  await pinch(1, 18);           // zoom out: records arrive above the first row
  await drive.wait(400);
  const s = await state();
  if (!(s.span > small.span)) throw new Error("the pinch did not reach the chart: " + JSON.stringify([small, s]));
  if (s.above !== 0) throw new Error(s.above + " row(s) placed above the list: " + JSON.stringify(s));
  if (s.scrollY !== 0) throw new Error("the page jumped: " + JSON.stringify(s));`);
  assert.ok(r.ok, r.out);
});

summarize("pinch-list");
