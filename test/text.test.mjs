// text — the few text regressions worth pinning, each one a failure that is
// SILENT when it happens: nothing throws, and one renderer just draws the wrong
// thing. Headless, one stub measurer, no browser — it runs in about a second.
// Everything else from the 2026-09-13/14 text round is covered by the Mac gate's
// single text probe or by the perceptual suite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, HeadlessBackend } from "../runtime/dist/index.js";
import { featureFamily, cssFamilyName } from "../runtime/dist/font-features.js";
import { fontString } from "../runtime/dist/measure.js";
import { familyChanged } from "../runtime/dist/face-table.js";
import { setFontHost } from "../runtime/dist/font.js";
import { measureText } from "../runtime/dist/text-measure.js";
import { record } from "../runtime/dist/draw.js";

// One measurer for every case: 8px a character, 10 in a monospace face, and a
// per-family override table a case can assign to — the "font" changing.
const FACES = {};
const familyOf = (font) => {
  const m = /\d+(?:\.\d+)?px\s+(.+)$/.exec(font);
  return (m ? m[1].split(",")[0] : "").trim().replace(/^["']|["']$/g, "").toLowerCase();
};
provideMeasurer({
  font: "10px sans-serif", letterSpacing: "0px",
  measureText(s) {
    const per = FACES[familyOf(this.font)] ?? (/mono|menlo|courier/i.test(this.font) ? 10 : 8);
    return { width: [...String(s)].length * per, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4,
      actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 0 };
  },
});

async function boot(body) {
  const b = await compileProgram(`App [ width = 1400, height = 800, ${body} ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  app.attach(new HeadlessBackend(), null);
  settle();
  return app;
}

// Every visible run of text drawn beneath a view (canvas's manual flow, headless).
function drawn(root) {
  const out = [];
  const walk = (v) => {
    for (const c of v.children ?? []) {
      if (c.visible === false) continue;
      if (typeof c.text === "string" && c.text !== "") out.push(c.text);
      walk(c);
    }
  };
  walk(root);
  return out;
}

// ── fonts ─────────────────────────────────────────────────────────────────────

await test("the Mac host reads the derived family name this side writes", () => {
  // OpenType features ride inside the family name (font-features.ts writes it,
  // TextEngine.swift parses it). Nothing at compile time holds the two halves
  // together: drift renders every figure plain on the Mac, with no error.
  const swift = readFileSync(new URL("../mac-host/Sources/DeclareMac/TextEngine.swift", import.meta.url), "utf8");
  assert.equal(featureFamily("Hoefler Text, Georgia", ["lnum", "tnum"]),
    "Hoefler_Text--ot--lnum-tnum, Hoefler Text, Georgia--ot--lnum-tnum, Georgia");
  assert.ok(swift.includes('OT_MARK = "--ot--"'), "the marker matches");
  assert.ok(swift.includes('replacingOccurrences(of: "_", with: " ")'), "the host undoes the space substitution");
  assert.ok(/split\(separator: "-"\)/.test(swift), "the host splits tags on the same separator");
});

await test("a family name that is not a CSS identifier is quoted, and no other name changes", () => {
  // `400 17px Source Serif 4` is not a font shorthand; canvas ctx.font drops it
  // silently and measures and paints in whatever font it had before.
  assert.equal(cssFamilyName("Source Serif 4"), '"Source Serif 4"');
  assert.equal(fontString({ fontFamily: "Source Serif 4", fontSize: 17, fontWeight: "normal" }), '400 17px "Source Serif 4"');
  for (const ok of ["Hoefler Text, Georgia", "-apple-system, system-ui, sans-serif", '"Already Quoted 2"'])
    assert.equal(featureFamily(ok, []), ok);
});

await test("a face that lands late re-measures its text — even a Text with both dimensions set", async () => {
  // Driven by ASSIGNMENT to the face table, not a load race: the race hides the bug.
  const app = await boot(`auto: Text [ fontFamily = ["Probe"], text = "abcd" ],
    fixed: Text [ y = 40, width = 45, height = 60, fontFamily = ["Probe"], text = "ab ab" ]`);
  assert.equal(app.auto.width, 32);
  const before = app.fixed.surface.textStyle;
  FACES.probe = 16;
  familyChanged("Probe");
  settle();
  delete FACES.probe;
  assert.equal(app.auto.width, 64, "the auto-sized Text re-measured");
  assert.notEqual(app.fixed.surface.textStyle, before, "the fixed-size Text re-pushed its style, so a backend re-wraps it");
});

// ── fonts as objects ──────────────────────────────────────────────────────────
// A manual face loader: each load waits to be landed (or failed) by hand, and the
// wait timers fire only when a case fires them — no race decides anything.
const loads = [];
const timers = [];
setFontHost({
  load: (family, src) => new Promise((resolve, reject) => loads.push({ family, src, resolve, reject })),
  add: () => {}, remove: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; },
  clearTimeout: (h) => { timers[h] = null; },
});
const turn = () => new Promise((r) => setTimeout(r, 0));
const landing = async (family, per) => {
  FACES[family.toLowerCase()] = per;
  for (const l of loads.filter((x) => x.family === family)) l.resolve({ family });
  await turn();
  settle();
};

await test("a Text in a Font measures in that font, and re-measures when its faces land", async () => {
  const app = await boot(`brand: Font [ Face [ src = "brand.woff2" ] ],
    t: Text [ fontFamily = { app.brand }, text = "abcd" ]`);
  app.brand.start();
  settle();
  const name = loads.at(-1).family;
  assert.equal(app.brand.loaded, false, "loading");
  assert.equal(app.t.width, 32, "measured in the fallback while the face is on its way");
  await landing(name, 16);
  assert.equal(app.brand.loaded, true);
  assert.equal(app.t.width, 64, "re-measured in the face that landed");
});

await test("switching to a font still inside its wait keeps the old family until it settles", async () => {
  FACES.alpha = 10;
  const app = await boot(`alpha: Font [ family = "Alpha" ],
    beta: Font [ wait = 800, Face [ src = "beta.woff2" ] ],
    choice: Font = { app.alpha },
    t: Text [ fontFamily = { app.choice }, text = "abcd" ]`);
  app.alpha.start(); app.beta.start();
  settle();
  const name = loads.at(-1).family;
  assert.equal(app.t.width, 40, "in Alpha");
  app.choice = app.beta;
  settle();
  assert.equal(app.t.width, 40, "held in Alpha while Beta loads");
  await landing(name, 16);
  assert.equal(app.t.width, 64, "changed once, when Beta landed");
  app.choice = app.alpha;
  settle();
  assert.equal(app.t.width, 40, "a loaded font switches at once");
});

await test("late = keep: a face that arrives after the wait is never used this run", async () => {
  const app = await boot(`slow: Font [ wait = 300, late = keep, Face [ src = "slow.woff2" ] ],
    t: Text [ fontFamily = { app.slow }, text = "abcd" ]`);
  app.slow.start();
  settle();
  const name = loads.at(-1).family;
  timers.filter((t) => t !== null && t.ms === 300).at(-1).fn();   // the wait runs out
  settle();
  await landing(name, 16);
  assert.equal(app.slow.loaded, false, "never loaded, as far as this run is concerned");
  assert.equal(app.slow.failed, false);
});

await test("a font NAME where a family goes names the object form", async () => {
  const top = await compileProgram(`font Serif [ family = "Georgia" ] App [ Text [ text = "x" ] ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.ok(top.errors.some((e) => /serif: Font \[/.test(e.message)), top.errors.map((e) => e.message).join("; "));
  const bare = await compileProgram(`App [ Text [ fontFamily = Serif, text = "x" ] ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.ok(bare.errors.some((e) => /fontFamily = \{ app\.serif \}/.test(e.message)), bare.errors.map((e) => e.message).join("; "));
});

// ── measuring and drawing text in a style ───────────────────────────────────

await test("measureText agrees with a Text of the same style and width", async () => {
  const app = await boot(`t: Text [ width = 100, fontSize = 20, text = "aaaa bbbb cccc dddd" ]`);
  const m = measureText("aaaa bbbb cccc dddd", { fontSize: 20 }, 100);
  assert.equal(m.height, app.t.height, "wrapped at the same width, as tall");
  assert.equal(m.lines, 2);
  assert.equal(measureText("abc").width, 24, "one line, plain defaults");
});

await test("a constraint that measures text in a Font re-runs when the font's faces land", async () => {
  const app = await boot(`brand: Font [ Face [ src = "m.woff2" ] ],
    pill: View [ height = 20, width = { measureText("abcd", { fontFamily: app.brand }).width + 10 } ]`);
  app.brand.start();
  settle();
  assert.equal(app.pill.width, 42);
  await landing(loads.at(-1).family, 16);
  assert.equal(app.pill.width, 74, "re-measured: the body tracks the font it measured in");
});

await test("fillText in a style draws the face as text state for that run, and re-records when its faces land", async () => {
  const app = await boot(`brand: Font [ Face [ src = "d.woff2" ] ],
    plate: View [ width = 100, height = 40,
      draw(d: Draw) { d.fillText("plate", 0, 20, { fontFamily: app.brand, fontSize: 13, smallCaps: true, textColor: 0xff0000, textTransform: "uppercase" }) } ]`);
  app.brand.start();
  settle();
  const list = record((d) => app.plate.draw(d), () => 100, () => 40);
  const ops = list.ops.map((o) => o.op === "set" ? `set ${o.k}=${o.v}` : o.op === "fillText" ? `fillText ${o.text}` : o.op === "fillStyle" ? `fillStyle ${o.v}` : o.op);
  assert.deepEqual(ops.filter((o) => !o.startsWith("set letterSpacing")),
    ["save", `set font=small-caps 400 13px ${loads.at(-1).family}`, "fillStyle #ff0000", "fillText PLATE", "restore"], JSON.stringify(ops));
  let draws = 0;
  const own = app.plate.draw;
  app.plate.draw = function (d) { draws++; return own.call(this, d); };
  await landing(loads.at(-1).family, 16);
  assert.ok(draws > 0, "the drawing recorded again");
});

await test("a style is a record of literals, named as a value in bodies; a { } field says where the value goes instead", async () => {
  const ok = await compileProgram(`style Caption [ fontSize = 13, smallCaps = true ]
App [ t: Text [ text = "x", fontSize = { Caption.fontSize }, smallCaps = { Caption.smallCaps } ] ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(ok.errors.length, 0, ok.errors.map((e) => e.message).join("; "));
  const app = instantiate(ok.program);
  app.attach(new HeadlessBackend(), null);
  settle();
  assert.equal(app.t.fontSize, 13);
  assert.equal(app.t.smallCaps, true);
  const bad = await compileProgram(`style Kw [ textColor = { provided("theme").accent } ] App [ ]`, { originDir: process.cwd() + "/library", stripPos: false });
  assert.ok(bad.errors.some((e) => /a style holds literal values only/.test(e.message)), bad.errors.map((e) => e.message).join("; "));
});

// ── rich text ─────────────────────────────────────────────────────────────────

const DOC = ["## Note", "", "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn", "",
  "- first item", "- second item", "", "Final paragraph."].join("\n");

await test("maxLines: a list bullet spends no lines, and a width change re-spends the budget", async () => {
  // heading 1 + paragraph 2 (at 400px, 50 chars a line) + first item 1 = 4
  const app = await boot(`md: Markdown [ width = 400, maxLines = 4, text = ${JSON.stringify(DOC)} ]`);
  let t = drawn(app.md), all = t.join(" | ");
  assert.ok(all.includes("first item") && !all.includes("second item") && !all.includes("Final"), all);
  assert.equal(t.filter((s) => s === "•").length, 1, "one bullet, beside its text: " + all);
  assert.equal(app.md.truncated, true);
  app.md.width = 1200; settle();                 // the paragraph is one line now: both items fit
  t = drawn(app.md); all = t.join(" | ");
  assert.ok(all.includes("second item") && !all.includes("Final"), all);
  assert.equal(t.filter((s) => s === "•").length, 2, all);
});

await test("a non-wrapping Text with newlines is as tall as its lines and as wide as its widest", async () => {
  const app = await boot(`t: Text [ wrap = false, text = "a\\nbbbbb\\ncc" ]`);
  assert.equal(app.t.height, 3 * 16);
  assert.equal(app.t.width, 5 * 8);
});

await test("a paragraph that opens with inline code still joins its body words into line runs", async () => {
  // Its spaces used to be priced in the code face, so every word was placed alone.
  const app = await boot("md: Markdown [ width = 800, text = \"`code` is a plain sentence of ordinary words\" ]");
  const runs = drawn(app.md);
  assert.ok(runs.some((r) => r.includes("plain sentence of")), JSON.stringify(runs));
});

summarize("text");
