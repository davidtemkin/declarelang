// drag-edge-scroll — a drag resting in a scroller's edge band scrolls it, under a
// finger as under a mouse (drag-autoscroll.ts). Under a finger the scroll watcher
// took the edge scrolling for the user's scroll (a finger was down), and from then
// held every scroll request — the edge scrolling's own — until the drag ended; a
// drag claimed at touchdown was also cancelled by the takeover detector, which
// took the scroll for the browser taking the finger (riff-habits run 2). Real
// input, through the browser's own pipeline: declare-verify's driver.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-drag-edge-");

const rows = Array.from({ length: 11 }, (_, i) => i === 9
  ? `            handle: View [ width = 100%, height = 80, fill = #88a, HOLD onDrag(e: PointerEvent) { } ],`
  : `            View [ width = 100%, height = 80, fill = ${i % 2 ? "#ccc" : "#ddd"} ],`).join("\n");
const program = (hold) => `App [ width = 390, height = 600,
    pane: View [ width = 100%, height = 100%, scrolls = y,
        col: View [ width = 100%, layout: SimpleLayout [ axis = y, spacing = 8 ],
${rows.replace("HOLD", hold ? "onHold() { }," : "")}
            ] ] ]`;
writeFileSync(join(DIR, "hold.declare"), program(true));
writeFileSync(join(DIR, "nohold.declare"), program(false));
writeFileSync(join(DIR, "probe.mjs"), `export const device = { width: 390, height: 600, touch: process.env.TOUCH === "1" };
export default async ({ drive }) => {
  const st = () => drive.page.evaluate(() => { const p = window.__declare.find("app.pane"); return { y: Math.round(p.scrollY), user: p.userScrolling }; });
  const to = (y) => drive.page.evaluate((y) => { window.__declare.find("app.pane").scrollTo(y); return null; }, y);
  await to(400); await drive.wait(400);
  await drive.press("app.pane.col.handle");
  await drive.wait(700);
  for (let i = 0; i < 12; i++) { await drive.moveBy(0, -40); await drive.wait(16); }
  await drive.wait(600);
  const band = await st();
  await to(200); await drive.wait(150);
  const asked = await st();
  await drive.release(); await drive.wait(300);
  const after = await st();
  console.log("RESULT " + JSON.stringify({ band, asked, after }));
};
`);

function run(file, touch) {
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), join(DIR, file), "--assert", join(DIR, "probe.mjs")],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, TOUCH: touch ? "1" : "0" } });
  const m = (r.stdout ?? "").match(/RESULT (.*)/);
  assert.ok(m, (r.stdout ?? "") + (r.stderr ?? ""));
  return JSON.parse(m[1]);
}

for (const [file, what] of [["hold.declare", "a drag picked up by a hold"], ["nohold.declare", "a drag claimed at touchdown"]]) {
  // the finger is where this broke, so both drags are tried under one; a mouse's
  // edge scrolling is the same code past the claim, tried once
  for (const touch of file === "hold.declare" ? [true] : [true, false]) {
    await test(`${what}, by ${touch ? "a finger" : "a mouse"}: resting in the top band scrolls to the start; it is never the user's scroll, and a request mid-drag lands`, () => {
      const r = run(file, touch);
      assert.deepEqual(r.band, { y: 0, user: false }, "the edge scrolling reached the start, as the program's motion");
      assert.deepEqual(r.asked, { y: 200, user: false }, "a scroll the program asks for mid-drag lands");
      assert.deepEqual(r.after, { y: 200, user: false }, "and nothing is left held after the release");
    });
  }
}

// The contrast that makes the above mean something: a quick swipe over the same
// hold-gated card is the platform's scroll — the browser's compositor handles it,
// on its own thread — while the held drag's edge scrolling is the program's.
writeFileSync(join(DIR, "platform.mjs"), `export const device = { width: 390, height: 600, touch: true };
export default async ({ drive }) => {
  await drive.page.evaluate(() => { window.__declare.find("app.pane").scrollTo(400); return null; });
  await drive.wait(400);
  const swipe = await drive.traceInput(async () => { await drive.drag("app.pane.col.handle", 0, 300); await drive.waitReal(600); });
  const y = await drive.page.evaluate(() => Math.round(window.__declare.find("app.pane").scrollY));
  // the swipe's fling is the platform's too, and coasts on past the user's scroll
  // as the program hears it: wait until the offset itself is still
  const at = () => drive.page.evaluate(() => window.__declare.find("app.pane").scrollY);
  for (let i = 0, was = NaN; i < 50; i++) { await drive.waitReal(150); const now = await at(); if (now === was) break; was = now; }
  // (the press swipes the card back into sight first, as a person would: that is
  // the platform's scroll, so the trace starts once the card is held)
  await drive.press("app.pane.col.handle"); await drive.wait(700);
  const held = await drive.traceInput(async () => {
    for (let i = 0; i < 12; i++) { await drive.moveBy(0, -40); await drive.wait(16); }
    await drive.wait(400); await drive.release();
  });
  console.log("RESULT " + JSON.stringify({ swipe, y, held }));
};
`);

await test("a quick swipe over a hold-gated card is the platform's scroll; the held drag's edge scrolling is the program's", () => {
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), join(DIR, "hold.declare"), "--assert", join(DIR, "platform.mjs")], { cwd: ROOT, encoding: "utf8" });
  const m = (r.stdout ?? "").match(/RESULT (.*)/);
  assert.ok(m, (r.stdout ?? "") + (r.stderr ?? ""));
  const { swipe, y, held } = JSON.parse(m[1]);
  assert.ok(swipe.platformScrollUpdates > 0, `the swipe was scrolled by the browser's compositor (${JSON.stringify(swipe)})`);
  assert.ok(y < 400, `and it moved the pane (scrollY ${y})`);
  assert.equal(held.platformScrollUpdates, 0, `the held drag's scrolling was none of the platform's (${JSON.stringify(held)})`);
});

// Which scroller, and when (docs/system-design/drag.md R9). A drag that began
// inside an edge's band has not travelled there: a slider low in a pane, dragged
// sideways, once scrolled the pane away from under itself. And a pane at the end
// of its range hands the scrolling to the one around it.
const look = (file, ...args) => spawnSync("node", [join(ROOT, "tools/look.mjs"), join(DIR, file), "--size", "400x300", ...args], { cwd: ROOT, encoding: "utf8" });
writeFileSync(join(DIR, "sideways.declare"), `App [ width = 400, height = 300,
    pane: View [ width = 400, height = 300, scrolls = y,
        Slider [ x = 40, y = 270, width = 300, value = 50, min = 0, max = 100, accessibilityLabel = "Level" ],
        View [ width = 10, height = 1200 ] ] ]`);
writeFileSync(join(DIR, "nested.declare"), `App [ width = 400, height = 300,
    outer: View [ width = 400, height = 300, scrolls = y,
        inner: View [ y = 20, width = 400, height = 200, scrolls = y, scrollStartY = 200,
            card: View [ x = 40, y = 220, width = 100, height = 40, fill = #888888, onDrag(e: PointerEvent) { } ],
            View [ width = 10, height = 400 ] ],
        View [ width = 10, height = 1200 ] ] ]`);

await test("a drag that began in an edge's band does not scroll that edge: a slider dragged sideways stays put", () => {
  const r = look("sideways.declare", "--press", "app.pane.0", "20,10", "--move", "30,0", "--wait-real", "400",
    "--move", "30,0", "--wait-real", "400", "--read", "app.pane.scrollY", "--release");
  assert.match(r.stdout, /app\.pane\.scrollY = 0\b/, r.stdout + r.stderr);
});

writeFileSync(join(DIR, "low.declare"), `App [ width = 400, height = 300,
    pane: View [ width = 400, height = 300, scrolls = y,
        card: View [ x = 40, y = 255, width = 100, height = 30, fill = #888888, onDrag(e: PointerEvent) { } ],
        View [ width = 10, height = 1200 ] ] ]`);

await test("a drag that began near an edge and travels toward it scrolls that edge", () => {
  const r = look("low.declare", "--press", "app.pane.card", "50,10", "--move", "0,20", "--wait-real", "500", "--read", "app.pane.scrollY", "--release");
  const y = Number(/app\.pane\.scrollY = (\d+)/.exec(r.stdout)?.[1] ?? 0);
  assert.ok(y > 50, `the pane scrolled (${y})`);
});

await test("a pane at the end of its range hands the edge scrolling to the one around it", () => {
  const r = look("nested.declare", "--press", "app.outer.inner.card", "50,20", "--move", "0,215", "--wait-real", "500",
    "--read", "app.outer.inner.scrollY", "--read", "app.outer.scrollY", "--release");
  assert.match(r.stdout, /app\.outer\.inner\.scrollY = 200\b/, r.stdout + r.stderr);
  const outer = Number(/app\.outer\.scrollY = (\d+)/.exec(r.stdout)?.[1] ?? 0);
  assert.ok(outer > 50, `the outer pane scrolled (${outer})`);
});

summarize("drag-edge-scroll");
