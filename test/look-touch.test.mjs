// look-touch — declare-look (and the verify driver under it) presses as the device
// does: under --touch every press, drag, hold and pinch is a finger (touch events);
// without it, a mouse, and a pinch is a trackpad's (ctrl-wheel). A mouse in a
// phone-sized window hovers, never claims a gesture, and passed checks a finger
// failed — the gap this holds closed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-look-touch-");
const FILE = join(DIR, "probe.declare");
writeFileSync(FILE, `App [ width = 390, height = 844,
    taps: number = 0, holds: number = 0, starts: number = 0, wheelPinches: number = 0,
    zoom: number = 1, base: number = 1,
    pad: View [ x = 20, y = 20, width = 350, height = 200, fill = #DDE6F0,
        onClick() { app.taps = app.taps + 1 },
        onHold(e: PointerEvent) { app.holds = app.holds + 1 },
        onPinchStart(e: PinchEvent) { app.starts = app.starts + 1; app.base = app.zoom },
        onPinch(e: PinchEvent) { app.zoom = app.base * e.scale },
        onWheel(e: WheelEvent) { if (e.pinch) { app.wheelPinches = app.wheelPinches + 1; app.zoom = app.zoom * Math.exp(-e.deltaY / 100) } } ],
    pane: View [ x = 20, y = 240, width = 350, height = 300, scrolls = y,
        View [ width = 350, height = 2000, fill = #EEF1F4, onClick() { } ] ],
    // a surface that pans under one finger and zooms under two (10-touch.md)
    lens: View [ x = 20, y = 560, width = 350, height = 200, fill = #E4EDE6, trail: string = "",
        onPointerDown(e: PointerEvent) { this.trail = this.trail + "d" },
        onPointerMove(e: PointerEvent) { if (!this.trail.endsWith("m")) this.trail = this.trail + "m" },
        onPinchStart(e: PinchEvent) { this.trail = this.trail + "P" },
        onPinchEnd(e: PinchEvent) { this.trail = this.trail + "E" } ] ]`);

function look(...args) {
  const r = spawnSync("node", [join(ROOT, "tools/look.mjs"), FILE, ...args], { cwd: ROOT, encoding: "utf8" });
  const out = {};
  for (const m of (r.stdout ?? "").matchAll(/^(\S+) = (.*)$/gm)) (out[m[1]] ??= []).push(JSON.parse(m[2]));
  assert.equal(r.status, 0, (r.stdout ?? "") + (r.stderr ?? ""));
  return out;
}

await test("--touch: a tap leaves nothing hovered; a finger's drag scrolls a pane; a hold fires onHold", () => {
  const r = look("--touch", "--size", "390x844",
    "--click", "app.pad", "--read", "app.taps", "--read", "app.pad.hovered",
    "--drag", "app.pane", "0,-200", "--read", "app.pane.scrollY",
    "--hold", "app.pad", "--read", "app.holds");
  assert.deepEqual(r["app.taps"], [1], "the tap is a click");
  assert.deepEqual(r["app.pad.hovered"], [false], "a lifted finger hovers nothing");
  assert.ok(r["app.pane.scrollY"][0] > 100, `a finger's drag scrolls the pane (scrollY ${r["app.pane.scrollY"][0]})`);
  assert.deepEqual(r["app.holds"], [1], "a press held fires onHold");
});

await test("--pinch: two fingers under --touch (onPinch), a trackpad pinch without (onWheel, e.pinch)", () => {
  const t = look("--touch", "--size", "390x844", "--pinch", "app.pad", "2",
    "--read", "app.starts", "--read", "app.wheelPinches", "--read", "app.zoom");
  assert.deepEqual([t["app.starts"][0], t["app.wheelPinches"][0]], [1, 0], "fingers: the pinch family, no wheel");
  assert.ok(Math.abs(t["app.zoom"][0] - 2) < 0.05, `fingers spread to 2 (zoom ${t["app.zoom"][0]})`);
  const d = look("--size", "1024x768", "--pinch", "app.pad", "2",
    "--read", "app.starts", "--read", "app.wheelPinches", "--read", "app.zoom");
  assert.equal(d["app.starts"][0], 0, "a trackpad starts no finger pinch");
  assert.ok(d["app.wheelPinches"][0] > 0, "a trackpad pinch arrives as onWheel with e.pinch");
  assert.ok(Math.abs(d["app.zoom"][0] - 2) < 0.05, `the wheel deltas add up to 2 (zoom ${d["app.zoom"][0]})`);
});

await test("a pinch takes its press: each finger's onPointerDown comes before onPinchStart, and no onPointerMove follows until every finger lifts", () => {
  const t = look("--touch", "--size", "390x844", "--pinch", "app.lens", "2", "--read", "app.lens.trail");
  assert.equal(t["app.lens.trail"][0], "ddPE", `the press's trail: ${t["app.lens.trail"][0]}`);
});

// A finger is not a point: a browser moves a tap onto a control within reach
// of it, so a tap on a chart 4 px above a pinned button is the button's. The
// driver checks the ring a finger covers and says so, rather than tapping the
// button in silence while the script believes it tapped the chart.
await test("--click-at under --touch: a point a finger's width from another control is said, not tapped", () => {
  const near = join(DIR, "near.declare");
  writeFileSync(near, `App [ width = 390, height = 844,
    picks: number = 0, saves: number = 0,
    chart: View [ x = 20, y = 20, width = 350, height = 200, fill = #DDE6F0,
        onClick(e: PointerEvent) { app.picks = app.picks + 1 } ],
    save: Button [ x = 20, y = 224, width = 350, height = 44, label = "Save",
        press() { app.saves = app.saves + 1 } ] ]`);
  const run = (...args) => spawnSync("node", [join(ROOT, "tools/look.mjs"), near, ...args], { cwd: ROOT, encoding: "utf8" });
  const close = run("--touch", "--size", "390x844", "--click-at", "app.chart", "175,196");
  assert.notEqual(close.status, 0, "a tap that would land on the button is refused");
  assert.match(close.stdout + close.stderr, /lands within \d+ px of 'app\.save', and a finger there is taken by it/);
  const clear = run("--touch", "--size", "390x844", "--click-at", "app.chart", "175,100", "--read", "app.picks", "--read", "app.saves");
  assert.equal(clear.status, 0, clear.stdout + clear.stderr);
  assert.match(clear.stdout, /app\.picks = 1/);
  assert.match(clear.stdout, /app\.saves = 0/);
  const mouse = run("--size", "390x844", "--click-at", "app.chart", "175,196", "--read", "app.picks");
  assert.match(mouse.stdout, /app\.picks = 1/, "a mouse is a point: the same spot is the chart's");
});

// A drag a step at a time: what a drag shows while it is held (the ghost, the
// target lit) is only seen between the press and the release.
await test("--press / --move / --release: a drag held open is read mid-gesture, with a finger or a mouse", () => {
  const held = join(DIR, "held.declare");
  writeFileSync(held, `App [ width = 400, height = 300,
    dragging: boolean = false, dx: number = 0, drops: number = 0,
    card: View [ x = 20, y = 20, width = 100, height = 40, fill = #CCCCCC,
        onPointerDown(e: PointerEvent) { app.dragging = true },
        onPointerMove(e: PointerEvent) { app.dx = e.deltaX },
        onPointerUp(e: PointerUpEvent) { app.dragging = false; app.drops = app.drops + 1 } ] ]`);
  for (const touch of [["--touch"], []]) {
    const r = spawnSync("node", [join(ROOT, "tools/look.mjs"), held, ...touch, "--press", "app.card", "--move", "60,0",
      "--read", "app.dragging", "--read", "app.dx", "--release", "--read", "app.dragging", "--read", "app.drops"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /app\.dragging = true\napp\.dx = 60\napp\.dragging = false\napp\.drops = 1/, `${touch.join("") || "mouse"}: ${r.stdout}`);
  }
});

await test("without --touch a click is a mouse's: the view stays hovered", () => {
  const r = look("--size", "1024x768", "--click", "app.pad", "--read", "app.pad.hovered");
  assert.deepEqual(r["app.pad.hovered"], [true]);
});

summarize("look-touch");
