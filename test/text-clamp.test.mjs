// Text.maxLines (2026-09-12): a line clamp with an ellipsis on the last kept
// line, measured by the one rule every renderer paints by (measure.ts
// clampLines). Pinned on the measurer and on the Text height derive.
import assert from "node:assert";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { clampLines, wrapLines, textWidth, fontString, provideMeasurer } from "../runtime/dist/measure.js";
// Node has no canvas: a fixed-advance fake measurer, the same one unit.test uses.
provideMeasurer({ set font(_) {}, set letterSpacing(_) {}, measureText: (t) => ({ width: t.length * 7, fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 3, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }) });
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
console.log("Text.maxLines — the line clamp");
const FONT = "14px sans-serif";
const LONG = "the quick brown fox jumps over the lazy dog and keeps going well past the edge of any box you give it";

test("clampLines keeps the first N lines and ends the last with an ellipsis that fits", () => {
  const lines = wrapLines(LONG, FONT, 120);
  assert.ok(lines.length > 2, "the fixture wraps past two lines");
  const c = clampLines(lines, 2, FONT, 120);
  assert.equal(c.length, 2);
  assert.equal(c[0], lines[0], "the first line is untouched");
  assert.ok(c[1].endsWith("…"), "the last kept line ends in an ellipsis");
  assert.ok(textWidth(c[1], FONT) <= 120, "and it fits the width");
});
test("clampLines is inert when the text fits", () => {
  const lines = wrapLines("short", FONT, 120);
  assert.deepEqual(clampLines(lines, 2, FONT, 120), lines);
  assert.deepEqual(clampLines(lines, 0, FONT, 120), lines, "0 = no clamp");
});
test("an over-long single word is cut by characters, not dropped whole", () => {
  const c = clampLines(["supercalifragilisticexpialidocious"], 1, FONT, 60);
  assert.ok(c[0].length > 1 && c[0].endsWith("…"), "some of the word survives: " + c[0]);
  assert.ok(textWidth(c[0], FONT) <= 60);
});

await (async () => {
  // a headless boot: the deterministic stub measurer the ladder's R4 uses
  const r = await compile(`App [ width = 400, height = 400,
    free: Text [ width = 120, fontSize = 14, fontFamily = "sans-serif", text = "${LONG}" ],
    two:  Text [ width = 120, fontSize = 14, fontFamily = "sans-serif", maxLines = 2, text = "${LONG}" ],
    one:  Text [ width = 120, fontSize = 14, fontFamily = "sans-serif", wrap = false, maxLines = 1, text = "${LONG}" ] ]`);
  assert.deepEqual(r.errors ?? [], [], "compiles");
  const app = settleHeadless(r.source, { deps: r.deps });
  const nFree = wrapLines(LONG, fontString(app.free), 120).length;
  const lineH = app.free.height / nFree;
  test("Text.height follows the clamp: two lines high under maxLines = 2", () => {
    assert.ok(nFree > 2, "the free run wraps past two lines (" + nFree + ")");
    assert.ok(app.free.height > app.two.height, `the free run is taller (${app.free.height} vs ${app.two.height})`);
    assert.equal(Math.round(app.two.height / lineH), 2);
  });
  test("a non-wrapping run under a clamp is one line", () => {
    assert.equal(Math.round(app.one.height / lineH), 1);
  });
})();
console.log(`text-clamp: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
