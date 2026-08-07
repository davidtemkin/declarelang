// test/diagnostics-hints.test.mjs — the miss NAMES THE FIX.
//
// Every case here came from a cold-read round: an agent given the tree and no
// context wrote the wrong name, and the compiler answered with the rule instead
// of the rewrite. `findings-2026-08-03.md` §B collects them. The value of these
// diagnostics is highest for a reader who cannot ask a follow-up question — a
// model mid-generation — so the negatives matter as much as the positives: a
// confident wrong suggestion is worse than none.
import assert from "node:assert/strict";
import { compile } from "../compiler/dist/compile-node.js";
import { test, summarize } from "./harness.mjs";

const errText = (src) => {
  const r = compile(src, { originDir: process.cwd() });
  return (r.errors ?? []).map((e) => e.message).join("\n");
};
const says = (src, needle) => assert.ok(errText(src).includes(needle),
  `expected the diagnostic to contain ${JSON.stringify(needle)}, got:\n  ${errText(src) || "(no error)"}`);
const silent = (src, needle) => assert.ok(!errText(src).includes(needle),
  `expected NO ${JSON.stringify(needle)}, got:\n  ${errText(src)}`);

// ── unknown component: the near-miss must see the auto-includable LIBRARY ────
// A misspelled tag never matches the manifest, so it is never pulled and never
// reaches `schemas`. Before this, `Tex` found `Text` (a runtime schema, always
// present) and `Buton` found nothing — and every control lives in the library.
await test("unknown component: a misspelled runtime tag names its fix", async () => {
  says(`App [ Tex [ text = "x" ] ]`, "did you mean 'Text'?");
});

await test("unknown component: a misspelled LIBRARY tag names its fix", async () => {
  says(`App [ Buton [ label = "x" ] ]`, "did you mean 'Button'?");
  says(`App [ Slidr [ value = 1 ] ]`, "did you mean 'Slider'?");
  says(`App [ Checkbo [ ] ]`, "did you mean 'Checkbox'?");
});

await test("unknown component: a name that is a typo for nothing gets no guess", async () => {
  silent(`App [ Zork [ ] ]`, "did you mean");
  silent(`App [ Widget [ ] ]`, "did you mean");
});

// ── unknown attribute: near-miss, including handlers ─────────────────────────
await test("unknown attribute: a near-miss names the spelling", async () => {
  says(`App [ Text [ fontsize = 20, text = "x" ] ]`, "did you mean 'fontSize'?");
  says(`App [ Button [ labl = "x" ] ]`, "did you mean 'label'?");
});

await test("unknown attribute: HANDLERS are in the pool", async () => {
  // handlers are declared as events, not attrs, but are written in the same
  // position and fumbled the same way
  says(`App [ View [ onclick = 1 ] ]`, "did you mean 'onClick'?");
  says(`App [ View [ ondblclick = 1 ] ]`, "did you mean 'onDblClick'?");
});

await test("unknown attribute: a typo for nothing gets no guess", async () => {
  silent(`App [ View [ wibble = 1 ] ]`, "did you mean");
  silent(`App [ zap = 1 ]`, "did you mean");
});

// ── the hint tables outrank edit distance ────────────────────────────────────
// They know INTENT; edit distance only knows letters. `padding` is not a typo
// for anything — it is a concept that does not exist here.
await test("an exact CSS name gets the concept, not a spelling", async () => {
  says(`App [ View [ padding = 4 ] ]`, "there is no padding");
  says(`App [ View [ backgroundColor = red ] ]`, "the paint slot is 'fill'");
  says(`App [ View [ zIndex = 1 ] ]`, "stacking is source order");
});

await test("a MISSPELLED CSS name still reaches its hint", async () => {
  // `colour` is one edit from `color`; the reader needs "text color is
  // 'textColor'", not "did you mean 'color'?" — which names nothing real
  says(`App [ Text [ colour = red, text = "x" ] ]`, "text color is 'textColor'");
});

await test("hint-routing does not fire on a short string", async () => {
  // `zap` is one edit from `gap`, and a typo for nothing. Routing to a hint
  // asserts what the author was THINKING — a longer reach than naming a
  // spelling, so it wants more evidence than three characters can carry.
  silent(`App [ zap = 1 ]`, "spacing rides the layout");
});

// REMOVED: "a retired spelling names its exact rewrite". Suggestions key on
// PRE-EXISTING priors — the CSS and React instincts a newcomer actually arrives
// with — never on our own rolling deprecations. A table of former Declare
// spellings serves a population that does not exist (nothing is written in this
// language yet, and no model has it in training data) while leaking history into
// a surface that should read as one current design. `materialize` now reports
// plainly that View has no such attribute.

await test("rotate/blur/transform point at the real doors, not into a wall", async () => {
  // `rotation` itself GRADUATED (2026-08-06, compositing.md Part II): it is a
  // View attribute now, so `rotation = 45` compiles instead of hinting — the
  // CSS-prior spellings around it still route to their true equivalents.
  says(`App [ View [ rotate = 45 ] ]`, "rotation = 45");
  says(`App [ View [ blur = 4 ] ]`, "d.filter");
  says(`App [ View [ transform = 1 ] ]`, "draw(d: Draw)");
  says(`App [ View [ mixBlendMode = 1 ] ]`, "blend = multiply");
  says(`App [ View [ backdropFilter = 1 ] ]`, "frost(radius, saturation)");
});

// ── a CSS percentage inside { } ──────────────────────────────────────────────
await test("a percentage names the arithmetic that replaces it", async () => {
  says(`App [ View [ width = { 100% } ] ]`, "there are no percentages");
  says(`App [ View [ width = { 50% } ] ]`, "{ parent.width * 0.5 }");
  // trimmed — 33.3 arrives as 0.33299999999999996 unless it is rounded, and a
  // fix that reads worse than the error is not a fix
  says(`App [ View [ height = { 33.3% } ] ]`, "{ parent.width * 0.333 }");
});

await test("a real modulo is not mistaken for a percentage", async () => {
  silent(`App [ n: number = 7, View [ width = { app.n % 2 } ] ]`, "no percentages");
  silent(`App [ n: number = 7, View [ width = { 100 % app.n } ] ]`, "no percentages");
});

summarize("diagnostics-hints");
