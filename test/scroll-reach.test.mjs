// scroll-reach — the `userScrolling` fact is the user's hand, and the driver reaches
// views by scrolling as a hand does.
//
// Two things this holds:
// - The runtime marks `userScrolling` only while a hand can be scrolling: a finger
//   down (or one that just travelled), a wheel, a scrolling key outside a text
//   field, the scrollbar. The page clamping under its offset after a tap, or a
//   keystroke into a field, is not the user's scroll — either used to turn the
//   fact on and hold every scroll request (3 s on a phone; for good under the
//   driver's virtual clock). Venue runs 3–5 each lost 6–7 minutes to it.
// - The driver reaches a view off the window, under a pane's fold or under a bar
//   pinned to the window's foot by SWIPING (Chrome's gesture synthesizer: native,
//   async scrolling), waiting for the platform to say the scroll is over, and
//   looking again — never by moving an offset or asking the program to.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-scroll-reach-");
const FILE = join(DIR, "probe.declare");
writeFileSync(FILE, `App [
    open: boolean = true, taps: number = 0, footTaps: number = 0, paneTaps: number = 0,
    col: View [ width = 390,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        top: Button [ label = "Top", x = 20, onClick() { app.taps = app.taps + 1 } ],
        name: TextInput [ x = 20, width = 300 ],
        tall: View [ width = 390, height = { app.open ? 1600 : 0 }, fill = #DDE4EE ],
        pane: View [ x = 20, width = 350, height = 300, scrolls = y, fill = #EEF1F4,
            inner: View [ width = 350, height = 900,
                deep: Button [ label = "Deep", x = 20, y = 800, onClick() { app.paneTaps = app.paneTaps + 1 } ] ] ],
        spacer: View [ width = 390, height = 300 ],
        collapse: Button [ label = "Collapse", x = 20, onClick() { app.open = false } ],
        nearFoot: Button [ label = "Near the foot", x = 20, onClick() { app.footTaps = app.footTaps + 1 } ],
        foot: View [ width = 390, height = 120 ]
        ],
    bar: View [ ignoreScroll = true, width = 390, height = 72, y = { app.height - 72 }, fill = #20262E ]
    ]`);

function run(name, body) {
  const script = join(DIR, `${name}.mjs`);
  writeFileSync(script, `export const device = { width: 390, height: 844, touch: true };
export default async ({ drive, expect, page }) => {
  const state = () => page.evaluate(() => window.__declare.find("app").userScrolling);
${body}
};`);
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), FILE, "--assert", script, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

await test("a tap whose change shrinks the page: the clamp that follows is not the user's scroll", () => {
  const r = run("clamp", `
  await drive.click("app.col.collapse");
  await drive.wait(50);
  await expect.attr("app", "userScrolling", false);
  await drive.click("app.col.top");          // reached by swiping back up
  await expect.attr("app", "taps", 1);`);
  assert.ok(r.ok, r.out);
});

await test("typing into a field is not a hand on the scroller: a clamp right after still is not the user's", () => {
  const r = run("typing", `
  await drive.click("app.col.name");
  await drive.type("a name typed just now");
  await drive.click("app.col.collapse");
  await drive.wait(50);
  await expect.attr("app", "userScrolling", false);`);
  assert.ok(r.ok, r.out);
});

await test("a finger's drag is the user's scroll while it lasts, and over once it lifts", () => {
  const r = run("drag", `
  await drive.press("app.col.top");
  await drive.moveBy(0, -200);
  if (await state() !== true) await expect.fail("scrolling should be true mid-drag");
  await drive.release();
  await drive.wait(400);
  await expect.attr("app", "userScrolling", false);`);
  assert.ok(r.ok, r.out);
});

await test("the driver swipes a view clear of a bar pinned to the window's foot, then taps it", () => {
  const r = run("foot", `
  await drive.click("app.col.nearFoot");
  await expect.attr("app", "footTaps", 1);`);
  assert.ok(r.ok, r.out);
});

await test("the driver swipes the page, then the pane, to reach a view below the pane's fold", () => {
  const r = run("pane", `
  await drive.click("app.col.pane.inner.deep");
  await expect.attr("app", "paneTaps", 1);`);
  assert.ok(r.ok, r.out);
});

await test("a view no swipe can bring in is said with what the swipes did", () => {
  const r = run("stuck", `
  await page.evaluate(() => { document.documentElement.style.overflow = "hidden"; document.body.style.overflow = "hidden"; });
  await drive.click("app.col.collapse");`);
  assert.ok(!r.ok, "the press could not be reached");
  assert.match(r.out, /swip/, r.out);
});

summarize("scroll-reach");
