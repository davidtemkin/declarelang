// touch-workout — what a finger does, done the way a finger does it, and checked
// twice: once through the driver (drive.*, as an agent's script presses) and once
// as RAW touch events at the same point (page.touchscreen, past the driver). The
// program's own record must agree with both. Where the two paths disagree the
// tool is wrong; where both disagree with what a finger should do, the runtime is.
//
// Two programs, so each boots once: a page of SCREENS (a tap that swaps screens
// onto a field, a pinned bar, a row whose box covers its controls, a menu picked
// by finger, a smooth reveal and a tap on what it revealed, typing, select-all)
// and a page of GESTURES (a pane dragged, a strip swiped a page at a time, a
// hold, a pinch, a slider dragged, a switch and a segmented control tapped).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-touch-workout-");

function verify(file, script) {
  const asserts = join(DIR, `${script.name}.mjs`);
  writeFileSync(asserts, script.src);
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--assert", asserts], { cwd: ROOT, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

// What both scripts share: a phone, a raw finger at a view's centre (or a point
// in it), and the view under a piece of text, found as a press there finds it.
const COMMON = `
export const device = { width: 390, height: 844, touch: true };
const at = (page, path, fx = 0.5, fy = 0.5) => page.evaluate((p, a, b) => {
  const d = window.__declare, n = d.inspect(p);
  return d.rootPoint(p, n.width * a, n.height * b);
}, path, fx, fy);
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
const rawTap = async (page, path, fx, fy) => { const c = await at(page, path, fx, fy); await page.touchscreen.tap(c.x, c.y); await frames(page); };
const rawDrag = async (page, path, dx, dy) => {
  const c = await at(page, path);
  const t = await page.touchscreen.touchStart(c.x, c.y);
  for (let i = 1; i <= 10; i++) { await t.move(c.x + dx * i / 10, c.y + dy * i / 10); await frames(page); }
  await t.end();
  await frames(page);
};
const read = (page, path, attr) => page.evaluate((p, a) => window.__declare.find(p)[a], path, attr);
const pathOfText = (page, words) => page.evaluate((w) => {
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length === 0 && el.textContent.trim() === w) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) return window.__declare.pressAt(r.x + r.width / 2, r.y + r.height / 2)?.path ?? null;
    }
  }
  return null;
}, words);
`;

const SCREENS = join(DIR, "screens.declare");
writeFileSync(SCREENS, `App [ width = 390, height = 844, theme = { SanFrancisco },
    stage: string = "a", pays: number = 0, rowHits: number = 0, picked: string = "",
    layout: SimpleLayout [ axis = y, spacing = 0 ],
    one: View [ visible = { app.stage == "a" }, width = 100%, height = 420,
        go: Button [ x = 20, y = 300, width = 350, height = 50, label = "Continue", onClick() { app.stage = "b" } ],
        // pinned, but its parent does not scroll: the boot check names it
        stray: View [ ignoreScroll = true, ignoreLayout = true, x = 0, y = 0, width = 40, height = 40 ]
        ],
    two: View [ visible = { app.stage == "b" }, width = 100%, height = 420,
        field: TextInput [ x = 20, y = 290, width = 350, height = 60, accessibilityLabel = "Name" ],
        back: Button [ x = 20, y = 380, width = 350, height = 44, label = "Back", onClick() { app.stage = "a" } ]
        ],
    rows: View [ width = 100%, height = 80,
        row: View [ x = 20, y = 10, width = 350, height = 60,
            del: Button [ x = 230, y = 8, width = 110, height = 44, label = "Delete", onClick() { app.rowHits = app.rowHits + 1 } ],
            // the row's own box, laid over what it holds and taking no presses
            veil: View [ width = 350, height = 60 ]
            ]
        ],
    sizeBtn: Button [ x = 20, width = 200, height = 44, label = "Size", menu = { app.sizes } ],
    sizes: Menu [ items = { [ ({ id: "s", label: "Small" }), ({ id: "l", label: "Large" }) ] },
        picked(id: string) { app.picked = id } ],
    room: View [ width = 100%, height = 1400 ],
    form: View [ x = 20, width = 350,
        layout: SimpleLayout [ axis = y, spacing = 20 ],
        f1: TextInput [ width = 350, height = 48, accessibilityLabel = "First" ],
        f2: TextInput [ width = 350, height = 48, accessibilityLabel = "Second" ]
        ],
    tail: View [ width = 100%, height = 600 ],
    bar: View [ ignoreScroll = true, ignoreLayout = true, y = end, width = 390, height = 64, fill = #DDE6F0,
        pay: Button [ x = 20, y = 10, width = 350, height = 44, label = "Pay", onClick() { app.pays = app.pays + 1 } ]
        ]
    ]`);

const GESTURES = join(DIR, "gestures.declare");
writeFileSync(GESTURES, `App [ width = 390, height = 844, theme = { SanFrancisco },
    page: number = 0, holds: number = 0, zoom: number = 1, base: number = 1,
    level: number = 50, on: boolean = false, mode: string = "a",
    layout: SimpleLayout [ axis = y, spacing = 12 ],
    pane: View [ width = 390, height = 200, scrolls = y,
        View [ width = 390, height = 1600, fill = #EEF1F4 ] ],
    // a strip that pages sideways under the finger: a horizontal claim, so a
    // vertical drag on it is still the page's
    strip: View [ width = 390, height = 140, claim = x, fill = #E4E8EE,
        grab: number = 0,
        onPointerDown(e: PointerEvent) { grab = app.page },
        onPointerUp(e: PointerUpEvent) { if (Math.abs(e.deltaX) > 60) app.page = Math.max(0, Math.min(3, grab + (e.deltaX < 0 ? 1 : -1))) } ],
    pad: View [ width = 390, height = 160, fill = #DDE6F0,
        onHold(e: PointerEvent) { app.holds = app.holds + 1 },
        onPinchStart(e: PinchEvent) { app.base = app.zoom },
        onPinch(e: PinchEvent) { app.zoom = app.base * e.scale } ],
    slider: Slider [ x = 20, width = 350, min = 0, max = 100, value = { app.level }, input(v: number) { app.level = v } ],
    sw: Switch [ x = 20, checked = { app.on }, input(v: boolean) { app.on = v }, accessibilityLabel = "On" ],
    seg: Segmented [ x = 20, width = 300, value = { app.mode },
        choices = { [ ({ id: "a", label: "First" }), ({ id: "b", label: "Second" }) ] },
        input(v: string) { app.mode = v } ],
    room: View [ width = 100%, height = 1200 ]
    ]`);

await test("screens: a tap that swaps screens, a pinned bar, a veiled row, a menu, a reveal, typing — by driver and by raw finger", () => {
  const r = verify(SCREENS, { name: "screens", src: COMMON + `
export default async ({ drive, expect, page }) => {
  // 1. a tap that opens a screen with a field under the finger focuses nothing
  await drive.click("app.one.go");
  await expect.attr("app", "stage", "b");
  await expect.attr("app.two.field", "focused", false);
  await drive.click("app.two.back");
  await rawTap(page, "app.one.go");
  expect.equal(await read(page, "app", "stage"), "b", "raw tap: the screen");
  expect.equal(await read(page, "app.two.field", "focused"), false, "raw tap: the new screen's field takes no focus");
  await rawTap(page, "app.two.back");

  // 2. a row's own box over its controls is not in a press's way — and a quick
  // tap shows the control pressed for a moment, then lets go
  await drive.click("app.rows.row.del");
  await expect.attr("app", "rowHits", 1);
  await expect.attr("app.rows.row.del", "pressed", true);
  await drive.wait(200);
  await expect.attr("app.rows.row.del", "pressed", false);
  await rawTap(page, "app.rows.row.del");
  expect.equal(await read(page, "app", "rowHits"), 2, "raw tap through the row's box");
  await expect.text("app.rows.row", "Delete");

  // 3. a menu picked by finger hands on its choice before the next step
  await drive.click("app.sizeBtn");
  const large = await pathOfText(page, "Large");
  if (large === null) expect.fail("the open menu shows no 'Large' item");
  await drive.click(large);
  await expect.attr("app", "picked", "l");
  await rawTap(page, "app.sizeBtn");
  const small = await pathOfText(page, "Small");
  await rawTap(page, small);
  expect.equal(await read(page, "app", "picked"), "s", "raw tap on a menu item");

  // 4. a smooth reveal, then a tap on what it revealed: the tap lands on it
  await page.evaluate(() => window.__declare.find("app.form.f2").scrollIntoView("start", true));
  await drive.click("app.form.f2");
  await expect.attr("app.form.f2", "focused", true);

  // 5. typing, a chord, and select-all over a value
  await drive.type("hello");
  await expect.attr("app.form.f2", "text", "hello");
  await drive.selectAll("app.form.f2");
  await drive.type("x");
  await expect.attr("app.form.f2", "text", "x");

  // 6. a bar at the window's foot is held there by the browser, not by script
  const anchored = await page.evaluate(() => { const el = window.__declare.find("app.bar").$surface.element; return [el.style.position, el.style.top, el.style.bottom].join(" "); });
  expect.equal(anchored, "fixed auto 0px", "the bar's own anchoring");

  // 7. a bar pinned to the window takes its presses wherever the page is
  await page.evaluate(() => window.scrollTo(0, 900));
  await drive.wait(100);
  await drive.click("app.bar.pay");
  await expect.attr("app", "pays", 1);
  await rawTap(page, "app.bar.pay");
  expect.equal(await read(page, "app", "pays"), 2, "raw tap on the pinned bar");
};
` });
  assert.ok(r.ok, r.out);
  assert.match(r.out, /app\.one\.stray has ignoreScroll, but its parent app\.one does not scroll/, "the boot check names a pin with nothing to pin against");
});

await test("gestures: a pane dragged, a strip paged, hold, pinch, slider, switch, segmented — by driver and by raw finger", () => {
  const r = verify(GESTURES, { name: "gestures", src: COMMON + `
export default async ({ drive, expect, page }) => {
  // a finger's drag in a pane scrolls it
  await drive.drag("app.pane", 0, -150);
  const s1 = await read(page, "app.pane", "scrollY");
  if (!(s1 > 80)) expect.fail("driver drag: the pane scrolled " + s1);
  await rawDrag(page, "app.pane", 0, -150);
  const s2 = await read(page, "app.pane", "scrollY");
  if (!(s2 > s1 + 80)) expect.fail("raw drag: the pane scrolled " + s1 + " → " + s2);

  // a sideways swipe pages the strip; the claim keeps it out of the page's scroll
  await drive.drag("app.strip", -150, 0);
  await expect.attr("app", "page", 1);
  await rawDrag(page, "app.strip", -150, 0);
  expect.equal(await read(page, "app", "page"), 2, "raw swipe pages the strip");

  // a hold, and a pinch
  await drive.hold("app.pad", 700);
  await expect.attr("app", "holds", 1);
  await drive.pinch("app.pad", 2);
  await expect.approx("app", "zoom", 2, 0.1);

  // a slider dragged, by driver and by finger
  const v0 = await read(page, "app", "level");
  await drive.drag("app.slider", 80, 0);
  const v1 = await read(page, "app", "level");
  if (!(v1 > v0 + 10)) expect.fail("driver drag on the slider: " + v0 + " → " + v1);
  await rawDrag(page, "app.slider", -120, 0);
  const v2 = await read(page, "app", "level");
  if (!(v2 < v1 - 10)) expect.fail("raw drag on the slider: " + v1 + " → " + v2);

  // a switch and a segmented control, tapped
  await drive.click("app.sw");
  await expect.attr("app", "on", true);
  await rawTap(page, "app.sw");
  expect.equal(await read(page, "app", "on"), false, "raw tap on the switch");
  await drive.clickAt("app.seg", 225, 16);
  await expect.attr("app", "mode", "b");
  await rawTap(page, "app.seg", 0.25, 0.5);
  expect.equal(await read(page, "app", "mode"), "a", "raw tap on the first segment");
};
` });
  assert.ok(r.ok, r.out);
});

summarize("touch-workout");
