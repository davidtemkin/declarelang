// Unit tests: parser + typecheck + instantiate + error quality (R0–R2), the
// backends' Node-safe surface (R1), R3's Text/Image/Shape typing plus the
// draw recorder (ops + bounds math + write-only enforcement — all pure, so
// fully unit-testable), R6's user classes + compile-time scope
// resolution (the compile layer is Node-side by design, so it is fully
// unit-testable too), and R7's layout (strategies are model machinery —
// constraints over children geometry — so the whole surface tests in Node).
// Runs against the built dist/ (npm test builds first)
// so it exercises exactly what ships, not a ts-node shim. No DOM here —
// rendering and text/image measurement need a real browser, which is
// perceptual.test.mjs's job.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile, compileTracked, isUpToDate, diskProbe, extractStatic, settleHeadless } from "../compiler/dist/compile-node.js";
import { KeysService } from "../runtime/dist/keys.js";
import { Focus, FocusService, deliverKeys } from "../runtime/dist/focus.js";
import { routeInput } from "../runtime/dist/input.js";
import {
  parse,
  parseProgram,
  programSchemas,
  check,
  checkAttr,
  checkMethod,
  instantiate,
  build,
  DOMIsland,
  Node,
  View,
  App,
  Text,
  Image,
  Layout,
  record,
  validatePathData,
  DeclareError,
  DeclareErrors,
  settle,
  coerce,
  enumType,
  attrType,
  colorToCss,
  colorWithAlpha,
  SCHEMAS,
  CSS_COLORS,
  DomBackend,
  CanvasBackend,
  Dataset,
  DataSource,
  toCursor,
  resolveIncludes,
  parseLibrary,
  fontFacesOf,
  headingSlug,
} from "../runtime/dist/index.js";
import { scanDatapaths, rewriteDatapaths, fillDatapaths } from "../runtime/dist/datapath.js";
import { provideTransport } from "../runtime/dist/data.js";
import { explain } from "../runtime/dist/inspect.js";
import { sample, motionToken, MOTION_TOKENS, Clock, setClock } from "../runtime/dist/animate.js";
import { Animator, AnimatorGroup } from "../runtime/dist/animator.js";

const SAMPLE = `App [ width=240, height=160, fill=#1E3A49,
  View [ x=20, y=20, width=80, height=60, fill=#FFFFFF ] ]`;

// Parse a one-attribute element and hand back that Attr — the convenient way
// to feed checkAttr/coerce a positioned literal exactly as the parser makes it.
const attrOf = (src) => parse(src).attrs[0];

// ── Node / View tree primitives ─────────────────────────────────────────────

await test("Node.appendChild links parent and child", () => {
  const a = new Node();
  const b = new Node();
  a.appendChild(b);
  assert.equal(b.parent, a);
  assert.deepEqual(a.children, [b]);
});

await test("View and App are Nodes with visual defaults", () => {
  const v = new View();
  assert.ok(v instanceof Node);
  assert.equal(v.x, 0);
  assert.equal(v.fill, null);
  assert.equal(v.visible, true);
  assert.equal(v.opacity, 1);
  assert.ok(new App() instanceof View);
});

// ── Parser ──────────────────────────────────────────────────────────────────

await test("parse() reads the R0 sample into an Element tree", () => {
  const el = parse(SAMPLE);
  assert.equal(el.tag, "App");
  assert.equal(el.attrs.length, 3);
  assert.equal(el.children.length, 1);
  assert.equal(el.children[0].tag, "View");
  assert.equal(el.children[0].attrs.length, 5);
});

await test("parse() accepts an optional trailing comma", () => {
  const el = parse("App [ width=1, height=1, ]");
  assert.equal(el.attrs.length, 2);
});

await test("parse(): the member separator is REQUIRED; the trailing comma is optional (ruled 2026-07-28)", () => {
  // The grammar COULD delimit by idents alone — that was the rule until
  // 2026-07-28 — but a missing comma is nearly always an editing accident, and
  // the formatter always refused the comma-free form. The parser now agrees.
  for (const src of [
    "App [ View [], View [] ]",          // separated — house style
    "App [ View [], View [], ]",         // …plus a trailing comma, still legal
    "App [ View [],\n  View []\n  ]",     // separated across lines
  ]) assert.equal(parse(src).children.length, 2, src);

  // …and a MISSING separator is a positioned error, one per omission (the
  // parser recovers and keeps going rather than cascading)
  const errs = (src) => { const r = compile(src); return (r.errors ?? []).map((e) => e.message); };
  assert.match(errs("App [ width = 1 height = 2 ]")[0], /members are separated by commas — add ',' before 'height'/);
  assert.equal(errs("App [ width = 1 height = 2 fill = white ]").length, 2, "one error per missing comma");
});

await test("parse() reports a source position on syntax errors", () => {
  assert.throws(() => parse("App [ x= ]"), /line 1, col 10/);
});

await test("parse() reads percent literals and marks hex-written numbers", () => {
  const pct = attrOf("App [ width=50% ]").value;
  assert.deepEqual({ kind: pct.kind, value: pct.value }, { kind: "percent", value: 50 });
  assert.equal(attrOf("App [ width=0xFF ]").value.hex, true);
  assert.equal(attrOf("App [ width=255 ]").value.hex, false);
});

// ── check(): the typecheck pass ─────────────────────────────────────────────

await test("check() passes a well-typed tree (empty error list)", () => {
  assert.deepEqual(check(parse(SAMPLE)), []);
});

await test("check() accepts every literal value type in one program", () => {
  const src = `App [ width=240, height=50%, opacity=0.5, visible=true,
    fill=navy,
    View [ fill=#1E3A49 ],
    View [ fill=0x663399 ],
    View [ fill=null ] ]`;
  assert.deepEqual(check(parse(src)), []);
});

await test("check() reports an unknown component, with its position", () => {
  const errors = check(parse("Widget [ x=1 ]"));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unknown component 'Widget' \(line 1, col 1\)/);
});

await test("check() suggests a near-miss component — calibrated (diagnostics.md §4)", () => {
  // A model applies a "did you mean" LITERALLY, so suggestions come only at
  // high confidence: 1 edit (incl. a transposition or a pure casing miss),
  // never for a far name like 'Widget' (asserted suggestion-free above).
  assert.match(check(parse("Txet [ ]"))[0].message, /did you mean 'Text'\?/, "transposition");
  assert.match(check(parse("text [ ]"))[0].message, /did you mean 'Text'\?/, "casing");
  assert.match(check(parse("Vew [ ]"))[0].message, /did you mean 'View'\?/, "one edit");
  assert.doesNotMatch(check(parse("Widget [ ]"))[0].message, /did you mean/, "far names get no guess");
});

await test("check() keeps checking beneath an unknown component", () => {
  const errors = check(parse("Widget [ View [ zap=1 ] ]"));
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /unknown component 'Widget'/);
  assert.match(errors[1].message, /View has no attribute 'zap'/);
});

await test("check() names the component on an unknown attribute", () => {
  const [err] = check(parse("View [ frobnicate=1 ]"));
  assert.match(err.message, /View has no attribute 'frobnicate'/);
});

await test("check(): App inherits View's schema (and says 'App' in messages)", () => {
  assert.deepEqual(check(parse("App [ width=1, fill=navy ]")), []);
  const [err] = check(parse("App [ zap=1 ]"));
  assert.match(err.message, /App has no attribute 'zap'/);
});

await test("check() names attribute, expected type, and found value per type", () => {
  const cases = [
    ["View [ width=\"wide\" ]", /View\.width expects a Length \(a number of pixels, a percent like 50%, or the position literals center \| end on x\/y\), got the string "wide"/],
    ["View [ visible=1 ]", /View\.visible expects a boolean \(true or false\), got the number 1/],
    ["View [ opacity=50% ]", /View\.opacity expects a number, got the percent 50%/],
    ["View [ fill=whit ]", /View\.fill expects a Fill \(a Color, gradient\(#F8F8F8, #D8D8D8\), gradient\(angle, …stops\), or null\), got 'whit' \(not a CSS color name\)/],
    ["View [ fill=#12 ]", /got '#12' \(a hex color is 3, 4, 6, or 8 hex digits\)/],
    ["View [ fill=255 ]", /got the number 255 \(write a color in hex: 0x… or #…\)/],
    ["View [ fill=0x1000000 ]", /got the number 0x1000000 \(outside 0x000000–0xFFFFFF\)/],
  ];
  for (const [src, want] of cases) {
    const errors = check(parse(src));
    assert.equal(errors.length, 1, src);
    assert.match(errors[0].message, want);
  }
});

await test("check() reports EVERY error, in source order, each positioned", () => {
  const src = `App [ width="wide", zap=1,
  Widget [ x=1 ],
  View [ fill=whit, visible=maybe ] ]`;
  const errors = check(parse(src));
  assert.equal(errors.length, 5);
  assert.match(errors[0].message, /App\.width expects a Length/);
  assert.match(errors[1].message, /App has no attribute 'zap'/);
  assert.match(errors[2].message, /unknown component 'Widget'/);
  assert.match(errors[3].message, /not a CSS color name/);
  assert.match(errors[4].message, /View\.visible expects a boolean \(true or false\), got 'maybe'/);
  assert.deepEqual(errors.map((e) => e.pos.line), [1, 1, 2, 3, 3]);
  assert.equal(errors[2].pos.col, 3);
});

await test("check() flags a duplicate attribute, pointing at both sets", () => {
  const [err] = check(parse("View [ width=1, width=2 ]"));
  assert.match(err.message, /View\.width is set twice \(first set at line 1, col 8\)/);
  assert.equal(err.pos.col, 17);
});

await test("check() is immune to Object.prototype name collisions", () => {
  // `toString`/`constructor` must not resolve through the schema/table
  // prototypes — a latent R0 bug, pinned here.
  const [attrErr] = check(parse("View [ toString=1 ]"));
  assert.match(attrErr.message, /View has no attribute 'toString'/);
  const [tagErr] = check(parse("constructor [ ]"));
  assert.match(tagErr.message, /unknown component 'constructor'/);
  const [colorErr] = check(parse("View [ fill=constructor ]"));
  assert.match(colorErr.message, /'constructor' \(not a CSS color name\)/);
});

// ── schemas: inheritance + the R6 plug-in shape ─────────────────────────────

// A hand-built two-level schema — schemas are pure data, so a user class at
// R6 is exactly this: a new record whose `base` points at its parent's.
const BaseSchema = {
  name: "Base",
  base: null,
  attrs: { title: { kind: "string" }, align: enumType("Align", "left", "center", "right") },
};
const DerivedSchema = { name: "Derived", base: BaseSchema, attrs: { pad: { kind: "number" } } };

await test("attrType() walks the inheritance chain", () => {
  assert.equal(attrType(DerivedSchema, "pad").kind, "number");
  assert.equal(attrType(DerivedSchema, "title").kind, "string");
  assert.equal(attrType(DerivedSchema, "align").kind, "enum");
  assert.equal(attrType(DerivedSchema, "nope"), null);
});

await test("checkAttr() covers string and enum types through a schema", () => {
  const ok = checkAttr(DerivedSchema, attrOf('X [ align=center ]'));
  assert.deepEqual(ok, { ok: true, value: "center" });
  const str = checkAttr(DerivedSchema, attrOf('X [ title="hi" ]'));
  assert.deepEqual(str, { ok: true, value: "hi" });

  const bad = checkAttr(DerivedSchema, attrOf("X [ align=middle ]"));
  assert.match(bad.error.message, /Derived\.align expects an? Align \(one of left \| center \| right\), got 'middle'/);
  const badStr = checkAttr(DerivedSchema, attrOf("X [ title=42 ]"));
  assert.match(badStr.error.message, /Derived\.title expects a string, got the number 42/);
});

await test("coerce() maps each literal to its typed value", () => {
  const lit = (src) => attrOf(`X [ a=${src} ]`).value;
  assert.deepEqual(coerce({ kind: "length" }, lit("80")), { ok: true, value: 80 });
  assert.deepEqual(coerce({ kind: "length" }, lit("50%")), { ok: true, value: { percent: 50 } });
  assert.deepEqual(coerce({ kind: "number" }, lit("0.5")), { ok: true, value: 0.5 });
  assert.deepEqual(coerce({ kind: "boolean" }, lit("false")), { ok: true, value: false });
  assert.deepEqual(coerce({ kind: "string" }, lit('"hi"')), { ok: true, value: "hi" });
  assert.deepEqual(coerce({ kind: "color" }, lit("#0f0")), { ok: true, value: 0x00ff00 });
  assert.deepEqual(coerce({ kind: "color" }, lit("0xFF0000")), { ok: true, value: 0xff0000 });
  assert.deepEqual(coerce({ kind: "color" }, lit("null")), { ok: true, value: null });
});

// ── build(): parse + check + instantiate, end to end ───────────────────────

await test("build() makes a typed tree with coerced attributes", () => {
  const app = build(SAMPLE);
  assert.ok(app instanceof App);
  assert.equal(app.width, 240);
  assert.equal(app.height, 160);
  assert.equal(app.fill, 0x1e3a49);
  assert.equal(app.children.length, 1);

  const child = app.children[0];
  assert.ok(child instanceof View);
  assert.equal(child.x, 20);
  assert.equal(child.y, 20);
  assert.equal(child.width, 80);
  assert.equal(child.height, 60);
  assert.equal(child.fill, 0xffffff);
  assert.equal(child.parent, app);
});

await test("DOMIsland — a foreign-content island: a View sized by constraints, carrying a slot", () => {
  const app = build(`App [ w: number = 200,
    island: DOMIsland [ x = 20, y = 10, width = { parent.w }, height = 120, slot = "edit:reactivity" ] ]`);
  const island = app.children[0];
  assert.ok(island instanceof DOMIsland);
  assert.ok(island instanceof View);          // it lays out and constrains like any view
  assert.equal(island.slot, "edit:reactivity");
  assert.equal(island.width, 200);            // driven by the constraint on parent.w
  assert.equal(island.height, 120);
  app.w = 340;                                 // the box follows Declare's constraints
  settle();
  assert.equal(island.width, 340);
});

await test("App fills its host by default: unset width/height follow hostWidth/hostHeight, reactively", () => {
  // A child would make a plain view auto-size to CONTENT (40+10); the App
  // retargets auto-extent to its host instead. (hostWidth is the runtime-fed
  // enclosing extent — read-only to user code, but the runtime writes it here
  // exactly as index.ts does.)
  const app = build(`App [ View [ x = 10, y = 10, width = 40, height = 20 ] ]`);
  app.attach(mockBackend([]), null);           // installs App.bindExtent (host-tracking derive)
  app.hostWidth = 500; app.hostHeight = 360;
  settle();
  assert.equal(app.width, 500, "unset width follows hostWidth, not content (50)");
  assert.equal(app.height, 360, "unset height follows hostHeight");
  app.hostWidth = 720;                          // reactive: a resize moves it
  settle();
  assert.equal(app.width, 720, "width tracks hostWidth on resize");

  // An explicit size still wins — the derive is skipped for a set slot.
  const fixed = build(`App [ width = 480, height = 320, View [ width = 40 ] ]`);
  fixed.attach(mockBackend([]), null);
  fixed.hostWidth = 500; fixed.hostHeight = 500;
  settle();
  assert.equal(fixed.width, 480, "an explicit width overrides the host default");
  assert.equal(fixed.height, 320, "an explicit height overrides the host default");
});

await test("App minWidth/minHeight floor the auto-extent; the host can go narrower, the app holds", () => {
  const app = build(`App [ minWidth = 600, minHeight = 400 ]`);
  app.attach(mockBackend([]), null);
  app.hostWidth = 900; app.hostHeight = 700;    // roomy host: floors are moot
  settle();
  assert.equal(app.width, 900, "above the floor, width follows the host");
  assert.equal(app.height, 700, "above the floor, height follows the host");
  app.hostWidth = 420; app.hostHeight = 300;    // narrow host: the app holds its floor
  settle();
  assert.equal(app.width, 600, "below the floor, width holds minWidth");
  assert.equal(app.height, 400, "below the floor, height holds minHeight");
  app.hostWidth = 800;                          // back out: follows the host again
  settle();
  assert.equal(app.width, 800, "the floor releases as the host widens");
  assert.equal(app.height, 400, "the other axis stays floored independently");
});

await test("build() coerces every color literal form (case-insensitive names)", () => {
  const app = build(`App [ fill=Navy,
    View [ fill=#0f0 ], View [ fill=0xff0000 ], View [ fill=null ] ]`);
  assert.equal(app.fill, 0x000080);
  assert.deepEqual(app.children.map((c) => c.fill), [0x00ff00, 0xff0000, null]);
});

await test("build() raises every check error as one DeclareErrors", () => {
  assert.throws(() => build('App [ width="wide", View [ visible=1 ] ]'), (e) => {
    assert.ok(e instanceof DeclareErrors);
    assert.ok(e instanceof DeclareError); // catchable as the base type
    assert.equal(e.errors.length, 2);
    assert.match(e.message, /^2 errors:\n/);
    assert.match(e.message, /App\.width expects a Length/);
    assert.match(e.message, /View\.visible expects a boolean/);
    return true;
  });
});

await test("build() with a single error reads as that error", () => {
  assert.throws(() => build("App [ zap=1 ]"), (e) => {
    assert.ok(e instanceof DeclareErrors);
    assert.match(e.message, /^App has no attribute 'zap' \(line 1, col 7\)$/);
    return true;
  });
});

await test("build() requires the root to be App", () => {
  assert.throws(() => build("View [ width=1 ]"), /root must be 'App/);
});

await test("a percent resolves against the parent; the root has none (R4)", () => {
  assert.deepEqual(check(parse("App [ width=50% ]")), []); // valid *source* — rootness is context
  assert.throws(
    () => build("App [ width=50% ]"),
    /App\.width = 50%: the root has no parent for a percent to resolve against \(line 1, col 13\)/
  );
  const app = build("App [ width=200, height=80, View [ width=50%, height=25%, x=10% ] ]");
  const child = app.children[0];
  assert.equal(child.width, 100, "50% of parent width");
  assert.equal(child.height, 20, "25% of parent height");
  assert.equal(child.x, 20, "x resolves against the parent's width axis");
});

await test("instantiate() on an unchecked tree still fails soundly (first error)", () => {
  assert.throws(() => instantiate(parse("Widget [ ]")), /unknown component 'Widget'/);
  assert.throws(() => instantiate(parse("View [ visible=1 ]")), /View\.visible expects a boolean/);
});

// ── the Color vocabulary ────────────────────────────────────────────────────

await test("CSS_COLORS is the full 148-keyword CSS named-color set", () => {
  assert.equal(Object.keys(CSS_COLORS).length, 148);
  assert.equal(CSS_COLORS.aliceblue, 0xf0f8ff);
  assert.equal(CSS_COLORS.rebeccapurple, 0x663399);
  assert.equal(CSS_COLORS.yellowgreen, 0x9acd32);
  assert.equal(CSS_COLORS.grey, CSS_COLORS.gray);
  assert.equal(CSS_COLORS.transparent, undefined); // "no color" is `null`
});

await test("colorToCss renders a Color as CSS", () => {
  assert.equal(colorToCss(0x1e3a49), "#1e3a49");
  assert.equal(colorToCss(null), "transparent");
});

// ── R3: Text and Image, typed and instantiated ──────────────────────────────

await test("check() accepts Text and Image with all their attributes", () => {
  const src = `App [ width=240, height=160,
    Text [ x=10, y=10, text="hi", textColor=navy, fontSize=20, fontFamily="Arial", fontWeight=bold ],
    Image [ x=10, y=40, width=40, height=24, source="a.png", stretches=both ] ]`;
  assert.deepEqual(check(parse(src)), []);
});

await test("Text and Image inherit View's schema (x/y/clip/…)", () => {
  assert.deepEqual(check(parse('Text [ x=1, opacity=0.5, clip="M0 0 L9 0 L9 9 Z" ]')), []);
  assert.deepEqual(check(parse("Image [ visible=false, fill=teal ]")), []);
});

await test("Image: cover/contain accepted, natural dimensions read-only (assessment 1.1, 2026-08-06)", () => {
  const r = compile(`App [ width = 200, height = 200,
    pic: Image [ width = 100, height = 60, stretches = cover, source = "x.png" ],
    ratio: number = { app.pic.naturalWidth > 0 ? app.pic.naturalHeight / app.pic.naturalWidth : 0 },
  ]`, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const app = settleHeadless(r.source, { deps: r.deps });
  try {
    assert.equal(app.pic.stretches, "cover");
    assert.equal(app.pic.naturalWidth, 0, "0 until loaded (headless never loads)");
    assert.equal(app.ratio, 0, "derives read the honest zero");
  } finally {
    app.discard();
  }
  const bad = compile("App [ width = 10, p: Image [ naturalWidth = 5 ] ]", {});
  assert.match(bad.errors.map((e) => e.message).join("; "), /naturalWidth.*read-only|read-only.*naturalWidth/i);
});

await test("check() rejects bad Text/Image values with pointed messages", () => {
  const cases = [
    ["Text [ fontWeight=heavy ]", /Text\.fontWeight expects a FontWeight \(one of .*\bmedium\b.*\bbold\b.*\), got 'heavy'/],
    ["Text [ text=42 ]", /Text\.text expects a string, got the number 42/],
    ['Text [ fontSize="big" ]', /Text\.fontSize expects a number, got the string "big"/],
    ["Image [ stretches=sideways ]", /Image\.stretches expects a Stretch \(one of none \| width \| height \| both \| cover \| contain\), got 'sideways'/],
    ["Image [ source=7 ]", /Image\.source expects a string, got the number 7/],
  ];
  for (const [src, want] of cases) {
    const errors = check(parse(src));
    assert.equal(errors.length, 1, src);
    assert.match(errors[0].message, want);
  }
});

await test("build() instantiates Text/Image with coerced fields and defaults", () => {
  const app = build(`App [ width=10, height=10,
    Text [ text="hello", textColor=#FFE28A, fontSize=20, fontWeight=bold, fontFamily="Arial" ],
    Image [ source="a.png", stretches=width ],
    Text [ ], Image [ ] ]`);
  const [t, i, t2, i2] = app.children;
  assert.ok(t instanceof Text && t instanceof View);
  assert.equal(t.text, "hello");
  assert.equal(t.textColor, 0xffe28a);
  assert.equal(t.fontSize, 20);
  assert.equal(t.fontWeight, "bold");
  assert.ok(i instanceof Image && i instanceof View);
  assert.equal(i.source, "a.png");
  assert.equal(i.stretches, "width");
  assert.equal(i.loaded, false);
  // Defaults: browser-native text (16px sans-serif, black), unstretched image.
  assert.deepEqual(
    [t2.text, t2.textColor, t2.fontSize, t2.fontFamily, t2.fontWeight],
    ["", 0x000000, 16, "sans-serif", "normal"]
  );
  assert.deepEqual([i2.source, i2.stretches], ["", "none"]);
});

// ── R3: the Shape value type (clip) ─────────────────────────────────────────

await test("check() accepts clip path data on any view, and null", () => {
  assert.deepEqual(check(parse('View [ clip="M0 0 L80 0 L40 60 Z" ]')), []);
  assert.deepEqual(check(parse('App [ clip="m 10,5 h60 v50 c1 2 3 4 5 6 z" ]')), []);
  assert.deepEqual(check(parse("View [ clip=null ]")), []);
});

await test("check() rejects malformed path data, saying what is wrong", () => {
  const cases = [
    ["View [ clip=42 ]", /View\.clip expects a Shape \(SVG path data in a string, like "M0 0 L80 0 L40 60 Z", or null\), got the number 42/],
    ['View [ clip="" ]', /got the string "" \(an empty path\)/],
    ['View [ clip="L10 10" ]', /\(a path starts with M or m, not 'L'\)/],
    ['View [ clip="M0 0 L10" ]', /\('L' expects 2 numbers per segment \(character 9\)\)/],
    ['View [ clip="M0 0 X10 10" ]', /\('X' is not a path command \(character 6\)\)/],
  ];
  for (const [src, want] of cases) {
    const errors = check(parse(src));
    assert.equal(errors.length, 1, src);
    assert.match(errors[0].message, want);
  }
});

await test("validatePathData handles repeats, signs, decimals, exponents", () => {
  assert.equal(validatePathData("M0 0 L10 0 20 10 30 0 Z"), null); // implicit repeat
  assert.equal(validatePathData("M-1.5,.5 a25,25 -30 0,1 50,-25"), null);
  assert.equal(validatePathData("M1e2 1E-2 L3 4"), null);
  assert.match(validatePathData("M0 0 Z 5"), /'5' is not a path command/);
});

await test("build() lands clip on the view; null clip stays null", () => {
  const app = build('App [ width=1, height=1, View [ clip="M0 0 L9 0 L9 9 Z" ], View [ ] ]');
  assert.equal(app.children[0].clip, "M0 0 L9 0 L9 9 Z");
  assert.equal(app.children[1].clip, null);
});

// ── R3: the draw recorder — ops, bounds math, write-only ───────────────────

await test("record() captures ops as plain, structured-cloneable data", () => {
  const list = record((d) => {
    d.fillStyle = "#ff0000";
    d.fillRect(10, 20, 30, 40);
  });
  assert.deepEqual(list.ops, [
    { op: "fillStyle", v: "#ff0000" },
    { op: "fillRect", x: 10, y: 20, w: 30, h: 40 },
  ]);
  // The rendering model requires recordings to cross a worker boundary.
  assert.deepEqual(structuredClone(list), list);
});

await test("fillStyle/strokeStyle accept a Declare Color, recorded as a css string", () => {
  const list = record((d) => {
    d.fillStyle = 0xbcc4e2;        // an opaque Color (number), not a string
    d.fillRect(0, 0, 1, 1);
    d.strokeStyle = "#123456";     // strings still pass through unchanged
  });
  assert.deepEqual(list.ops, [
    { op: "fillStyle", v: "#bcc4e2" },
    { op: "fillRect", x: 0, y: 0, w: 1, h: 1 },
    { op: "strokeStyle", v: "#123456" },
  ]);
});

await test("bounds: fillRect is exact", () => {
  const { bounds } = record((d) => d.fillRect(10, 20, 30, 40));
  assert.deepEqual(bounds, { x: 10, y: 20, w: 30, h: 40 });
});

await test("bounds: a filled path is its point extent", () => {
  const { bounds } = record((d) => {
    d.beginPath();
    d.moveTo(0, 30);
    d.lineTo(30, 0);
    d.lineTo(60, 30);
    d.closePath();
    d.fill();
  });
  assert.deepEqual(bounds, { x: 0, y: 0, w: 60, h: 30 });
});

await test("bounds: a stroke expands by half the line width", () => {
  const { bounds } = record((d) => {
    d.lineWidth = 4;
    d.beginPath();
    d.moveTo(5, 25);
    d.lineTo(55, 25);
    d.stroke();
  });
  assert.deepEqual(bounds, { x: 3, y: 23, w: 54, h: 4 });
});

await test("bounds: an arc takes the full circle's box; ops union", () => {
  const { bounds } = record((d) => {
    d.beginPath();
    d.arc(50, 50, 10, 0, Math.PI); // half arc, conservative full box
    d.fill();
    d.fillRect(0, 0, 5, 5);
  });
  assert.deepEqual(bounds, { x: 0, y: 0, w: 60, h: 60 });
});

await test("bounds: an unpainted path contributes nothing; empty list is null", () => {
  const traced = record((d) => {
    d.beginPath();
    d.moveTo(0, 0);
    d.lineTo(100, 100); // never filled or stroked
  });
  assert.equal(traced.bounds, null);
  assert.equal(record(() => {}).bounds, null);
});

await test("the draw context is write-only: style reads throw", () => {
  record((d) => {
    d.fillStyle = "#123456";
    for (const prop of ["fillStyle", "strokeStyle", "lineWidth"]) {
      assert.throws(() => d[prop], (e) => {
        assert.ok(e instanceof DeclareError);
        assert.match(e.message, /write-only/);
        return true;
      }, prop);
    }
  });
});

// ── R3: the seam, exercised through a mock backend (no browser needed) ─────

/** A Surface that logs every call — enough to pin what View.attach pushes. */
function mockBackend(log) {
  const methods = [
    "setX", "setY", "setWidth", "setHeight", "setFill", "setCornerRadius",
    "setStroke", "setShadow", "setVisible",
    "setOpacity", "setClip", "setBoxClip", "setDrawing", "setText", "setTextStyle",
    "setImage", "setImageStretch", "setInput", "setEditable", "activateEditable",
    "insertChild", "destroy",
  ];
  const surface = () => {
    const s = {};
    for (const m of methods) s[m] = (...args) => log.push([m, ...args]);
    return s;
  };
  return { createSurface: surface, attachRoot: () => {} };
}

await test("a view without a draw method never records (pay-per-use)", () => {
  const log = [];
  const v = new View();
  v.attach(mockBackend(log), null);
  assert.ok(log.some(([m]) => m === "setClip"), "clip state is part of the flush");
  assert.ok(!log.some(([m]) => m === "setDrawing"), "no draw method → no recording");
  assert.ok(!log.some(([m]) => m === "setText"), "no text on a plain view");
});

await test("a draw method records at attach; invalidateDraw re-records", () => {
  const log = [];
  const v = new View();
  let runs = 0;
  v.draw = (d) => {
    runs++;
    d.fillStyle = "#0f0";
    d.fillRect(0, 0, 8, 4);
  };
  v.attach(mockBackend(log), null);
  const pushes = () => log.filter(([m]) => m === "setDrawing");
  assert.equal(runs, 1, "draw runs on attach (invalidation), not per frame");
  assert.equal(pushes().length, 1);
  assert.deepEqual(pushes()[0][1].bounds, { x: 0, y: 0, w: 8, h: 4 });
  v.invalidateDraw();
  assert.equal(runs, 2);
  assert.equal(pushes().length, 2);
});

// ── render backends: what can be checked without a browser ─────────────────

await test("both backends are exported and are Node-import-safe until attach", () => {
  // Neither module may touch the DOM at import time or before attachRoot —
  // surfaces retain state and invalidation is a no-op with no canvas yet.
  assert.equal(typeof DomBackend, "function");
  assert.equal(typeof CanvasBackend, "function");
  const backend = new CanvasBackend();
  const parent = backend.createSurface();
  const child = backend.createSurface();
  parent.setWidth(240);
  parent.setFill(0x1e3a49);
  parent.insertChild(child, null);
  child.destroy(); // unlinks and requests a repaint — still no DOM needed
});

// ── R4: `{ }` grammar — the balanced body scan ─────────────────────────────

await test("parse() captures a { } body as raw source, positioned", () => {
  const attr = attrOf("View [ x={ (parent.width - this.width) / 2 } ]");
  assert.equal(attr.value.kind, "code");
  assert.equal(attr.value.src, " (parent.width - this.width) / 2 ");
  assert.deepEqual({ line: attr.value.pos.line, col: attr.value.pos.col }, { line: 1, col: 10 });
});

await test("the body scan respects TS lexical islands (nesting, strings, templates, comments)", () => {
  const cases = [
    ["{ { a: 1 }.a + [1, 2].length }", " { a: 1 }.a + [1, 2].length "],
    ['{ "}" + \'{\' }', ' "}" + \'{\' '],
    ["{ `w ${ { n: 1 }.n } }` }", " `w ${ { n: 1 }.n } }` "], // ${ } nests; `}` in text is text
    ["{ 1 /* } */ + 2 // }\n }", " 1 /* } */ + 2 // }\n "],
  ];
  for (const [body, want] of cases) {
    assert.equal(attrOf(`View [ x=${body} ]`).value.src, want, body);
  }
});

await test("an unterminated { } is a positioned syntax error", () => {
  assert.throws(() => parse("View [ x={ 1 + ]"), /unterminated \{ \} expression \(line 1, col 10\)/);
  assert.throws(() => parse('View [ x={ "a ]'), /unterminated string in \{ \} expression/);
});

// ── R4: check() over constraints ────────────────────────────────────────────

await test("check() accepts a { } on any attribute type; unknown attrs still fail", () => {
  const src = `App [ width=100, height=100,
    View [ x={ parent.width / 2 }, visible={ parent.width > 50 }, clip={ null } ],
    Text [ text={ "n=" + parent.width } ] ]`;
  assert.deepEqual(check(parse(src)), []);
  const [err] = check(parse("View [ zap={ 1 } ]"));
  assert.match(err.message, /View has no attribute 'zap'/);
});

await test("check() reports { } syntax errors with the slot and position", () => {
  const errors = check(parse("View [ x={ 1 +++ * 2 } ]"));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /View\.x = \{ … \} is not a valid expression — /);
  assert.match(errors[0].message, /line 1, col 10/);
});

// ── R4: the reactive core, driven through real views ───────────────────────

await test("build() evaluates constraints once the tree is linked", () => {
  const app = build("App [ width=100, height=60, View [ x={ parent.width - 10 }, y={ this.x / 2 } ] ]");
  const v = app.children[0];
  assert.equal(v.x, 90);
  assert.equal(v.y, 45);
});

await test("precision: a write re-evaluates only what actually read it", () => {
  globalThis.__rw = 0;
  globalThis.__rh = 0;
  const app = build(`App [ width=100, height=60,
    View [ width={ (globalThis.__rw++, parent.width - 10) } ],
    View [ height={ (globalThis.__rh++, parent.height - 10) } ] ]`);
  settle();
  assert.deepEqual([globalThis.__rw, globalThis.__rh], [1, 1], "one initial evaluation each");
  app.width = 200;
  settle();
  assert.deepEqual([globalThis.__rw, globalThis.__rh], [2, 1], "only the width reader re-ran");
  assert.equal(app.children[0].width, 190);
});

await test("batching: a burst of writes settles into one re-evaluation", () => {
  globalThis.__rb = 0;
  const app = build("App [ width=100, height=60, View [ width={ (globalThis.__rb++, parent.width - 10) } ] ]");
  settle();
  app.width = 120;
  app.width = 140;
  app.width = 160;
  assert.equal(globalThis.__rb, 1, "the value updates immediately; dependents wait for the settle");
  assert.equal(app.width, 160);
  settle();
  assert.equal(globalThis.__rb, 2, "N writes, one cascade");
  assert.equal(app.children[0].width, 150);
});

await test("a diamond evaluates its join once per settle", () => {
  globalThis.__rj = 0;
  // width feeds both mids; the join reads both mids' outputs.
  const app = build(`App [ width=100, height=60,
    View [ width={ parent.width - 10 } ],
    View [ width={ parent.width - 20 } ],
    View [ x={ (globalThis.__rj++, parent.children[0].width + parent.children[1].width) } ] ]`);
  settle();
  assert.equal(globalThis.__rj, 1);
  app.width = 200;
  settle();
  assert.equal(globalThis.__rj, 2, "both inputs changed, the join ran once");
  assert.equal(app.children[2].x, 190 + 180);
});

await test("writes are equality-gated: re-producing a value stops the cascade", () => {
  globalThis.__re = 0;
  const app = build(`App [ width=100, height=60,
    View [ height=40, width={ (globalThis.__re++, this.height * 2) } ] ]`);
  const log = [];
  app.attach(mockBackend(log), null);
  settle();
  const evals = globalThis.__re;
  log.length = 0;
  app.children[0].height = 40; // unchanged value
  settle();
  assert.equal(globalThis.__re, evals, "no dependent woke");
  assert.deepEqual(log, [], "no Surface call was pushed");
});

await test("a live attribute pushes exactly its own Surface call", () => {
  const app = build("App [ width=100, height=60, View [ x=1, y=2 ] ]");
  const log = [];
  app.attach(mockBackend(log), null);
  settle();
  log.length = 0;
  app.children[0].x = 33;
  settle();
  assert.deepEqual(log, [["setX", 33]], "one write, one Surface mutation — nothing re-flushed");
});

await test("a direct write to a constrained attribute is an error", () => {
  const app = build("App [ width=100, height=60, View [ width={ parent.width / 2 } ] ]");
  assert.throws(
    () => { app.children[0].width = 7; },
    (e) => {
      assert.ok(e instanceof DeclareError);
      assert.match(e.message, /View\.width is bound by a constraint/);
      return true;
    }
  );
  assert.equal(app.children[0].width, 50, "the binding still owns the slot");
});

await test("a constraint cycle is detected and named, not spun forever", () => {
  build("App [ width=100, height=60, View [ x={ this.y + 1 }, y={ this.x + 1 } ] ]");
  assert.throws(() => settle(), /constraint cycle: View\.[xy] .*depends on its own output/);
  settle(); // the aborted queue was cleared; the scheduler is reusable
});

await test("percent lengths re-resolve reactively when the parent resizes", () => {
  const app = build("App [ width=200, height=80, View [ width=50%, height=25% ] ]");
  const log = [];
  app.attach(mockBackend(log), null);
  settle();
  log.length = 0;
  app.width = 300;
  settle();
  assert.equal(app.children[0].width, 150, "50% re-resolved");
  assert.ok(log.some(([m, v]) => m === "setWidth" && v === 150), "and pushed to the surface");
  assert.ok(!log.some(([m]) => m === "setHeight"), "the height axis did not stir");
});

await test("a draw body re-records when an attribute it read changes — after values settle", () => {
  const app = build("App [ width=100, height=60, View [ width={ parent.width - 40 }, height=10 ] ]");
  const v = app.children[0];
  v.draw = function (d) { d.fillRect(0, 0, this.width, this.height); };
  const log = [];
  app.attach(mockBackend(log), null);
  settle();
  log.length = 0;
  app.width = 140; // → v.width 100 → the recording is stale
  settle();
  const widthAt = log.findIndex(([m, x]) => m === "setWidth" && x === 100);
  const drawAt = log.findIndex(([m]) => m === "setDrawing");
  assert.ok(widthAt !== -1 && drawAt !== -1, "both the value and the recording were pushed");
  assert.ok(drawAt > widthAt, "draw re-records in phase 2, after values settle");
  assert.deepEqual(log[drawAt][1].bounds, { x: 0, y: 0, w: 100, h: 10 }, "recorded against the settled width");
});

await test("attribute declaration order is inert (ruled): permuted members, identical results", () => {
  // In A the width binding evaluates before x is even bound; in B the other
  // way round. Quiescence must erase the difference — and keep erasing it
  // through a mutation cascade.
  const a = build("App [ width=100, height=50, View [ width={ parent.width - this.x }, x={ parent.height / 5 } ] ]");
  const b = build("App [ width=100, height=50, View [ x={ parent.height / 5 }, width={ parent.width - this.x } ] ]");
  settle();
  const shape = (app) => [app.children[0].x, app.children[0].width];
  assert.deepEqual(shape(a), shape(b));
  assert.deepEqual(shape(a), [10, 90]);
  a.width = 220; a.height = 100;
  b.height = 100; b.width = 220; // permuted writes, too
  settle();
  assert.deepEqual(shape(a), shape(b));
  assert.deepEqual(shape(a), [20, 200]);
});

await test("settle() with nothing pending is a no-op", () => {
  settle();
  settle();
});

// ── R5: method members — grammar ───────────────────────────────────────────

await test("parse() reads a method member: name, params, raw body, positions", () => {
  const el = parse("View [ onClick() { this.x = 1 } ]");
  assert.equal(el.methods.length, 1);
  const m = el.methods[0];
  assert.equal(m.name, "onClick");
  assert.deepEqual(m.params, []);
  assert.equal(m.body, " this.x = 1 ");
  assert.deepEqual({ line: m.pos.line, col: m.pos.col }, { line: 1, col: 8 });
  assert.equal(m.bodyPos.col, 18, "bodyPos points at the opening brace");
});

await test("parse() reads parameter lists (incl. a trailing comma)", () => {
  const el = parse("View [ f(a, b,) { a + b }, draw(d) { d.fill() }, g() { } ]");
  assert.deepEqual(el.methods.map((m) => [m.name, m.params]), [
    ["f", [{ name: "a" }, { name: "b" }]],
    ["draw", [{ name: "d" }]],
    ["g", []],
  ]);
});

await test("a customized instance is a SINGLETON SUBCLASS — add freely, override compatibly", () => {
  // The OpenLaszlo property this preserves: an instance declaration may define
  // its own attributes, methods and children with no new class — "no need for
  // thousands of tiny subclasses, just tweak the instance". The compiler models
  // that as `declare class _E7 extends B`, so it IS a subclass, and the
  // ordinary subclass rule follows: adding is free, REPLACING must stay
  // compatible or a caller holding the class type is wrong.
  //
  // That check existed in tsc all along (TS2416) and was being DISCARDED: it
  // lands on a synthesized line, outside any body unit, and the mapper dropped
  // anything it could not place. Synthesized members now carry the author's
  // position.
  const ok = (src) => { const r = compile(src, {}); assert.ok(r.source, (r.errors?.[0]?.rawMessage) ?? "expected it to compile"); };
  const errs = (src) => {
    try { const r = compile(src); return (r.errors ?? []).map((e) => e.message ?? String(e)).join("\n"); }
    catch (e) { return String(e?.message ?? e); }
  };

  // ADDING stays completely free — this is the property, not a concession
  ok(`App [ width=1, height=1, a: View [ alpha: number = 1, ping() { } ], b: View [ beta: string = "s" ] ]`);
  ok(`class B extends View [ say(a: number) { } ]\nApp [ width=1, height=1, btn: B [ zap(k: string) { }, extra: number = 1 ] ]`);
  ok(`App [ width=1, height=1, v: View [ bump(by: number) -> number { return by } ] ]`);
  // one instance's members do not leak to another of the same tag
  assert.match(errs(`App [ width=1, height=1, a: View [ alpha: number = 1 ], b: View [ ], t: Text [ text = { "" + app.b.alpha } ] ]`),
    /'alpha' is not a member of/);

  // OVERRIDING is bound by the base's signature…
  assert.match(errs(`class B extends View [ say(a: number) { } ]\nApp [ width=1, height=1, btn: B [ say(a: string) { } ] ]`),
    /'say' overrides B's 'say' with an incompatible signature/);
  // …unless the base has no contract to break, and a matching one is fine
  ok(`class B extends View [ say(a: number) { } ]\nApp [ width=1, height=1, btn: B [ say(a: number) { } ] ]`);
  ok(`class B extends View [ say(a: object) { } ]\nApp [ width=1, height=1, btn: B [ say(a: string) { } ] ]`);
});

await test("a quoted string ends at its line — multi-line text is a \"\"\" block (H)", () => {
  const errs = (src) => { const r = compile(src); return (r.errors ?? []).map((e) => e.message).join("\n"); };
  assert.match(errs('App [ width=1, height=1, t: Text [ text = "line one\nline two" ] ]'),
    /a quoted string ends at its line — for multi-line text use a """…""" block/);
  const r = compile('App [ width=1, height=1, t: Text [ text = """\na\nb\n""" ] ]');
  assert.ok(r.source, "the text block is the sanctioned form");
});

await test(":path truncation is a positioned error, never a silent prefix (data-paths.md §2)", () => {
  // The scanner used to consume the longest identifier run and hand the rest
  // to TypeScript: ':my-key' COMPILED — as `$data("my") - key`, a subtraction.
  // Every refusal names the rewrite that works today.
  const errs = (src) => { const r = compile(`App [ width=1, height=1, t: Text [ text = { "" + ${src} } ] ]`); return (r.errors ?? []).map((e) => e.message).join("\n"); };
  assert.match(errs(":my-key"),      /ambiguous — for subtraction write ':my - …' \(spaced\); for a dashed KEY write a quoted-name selector/);
  assert.match(errs(":$.store.book"),/no JSONPath root/);
  assert.match(errs(":rows.2"),      /a numeric segment is written as an index selector: ':rows\[2…\]'/);
  assert.match(errs(":a..b"),        /descendant search \('\.\.'\) is not in the path subset/);
  // The B3 gates refuse with the feature and the idiom named (jsonpath-spelling.md §5).
  assert.match(errs(":rows[?(@.n>1)]"), /filter selectors \(\[\?…\]\) are not in the path subset yet/);
  assert.match(errs(":rows[0,2]"),      /union selectors \(\[a, b\]\) are not in the path subset/);
  assert.match(errs(":rows[zap]"),      /a path selector is \[index\], \[start:end:step\], \[\*\], or \['name'\]/);
  // the legitimate neighbors stay legal — including the B3 selector subset
  const ok = (src) => { const r = compile(`App [ width=1, height=1, d: Dataset { {"rows":[{"n":1}]} }, v: View [ datapath = { d.value }, t: Text [ text = { "" + ${src} } ] ] ]`); assert.ok(r.source, (r.errors?.[0]?.rawMessage) ?? "expected ok"); };
  ok("(:n - 1)");
  ok(":location.city");
  ok(":rows[0]");
  ok(":rows[-1].n");
  ok(":rows[1:3]");
  ok(":rows[*].n");
  ok(':rows[0]["my-key"]');
});

await test("the State verbs are reachable from source — gate XOR verbs", () => {
  // Implemented in state.ts and advertised by the model since the start, but
  // unreachable from a { } body until 2026-07-28: the scaffold's LANGUAGE_API
  // table simply lacked the State entry, so member resolution refused them.
  // ("The lack of State.apply is a language gap, not a docs gap.")
  const app = build(`App [ width=100, height=60,
    v: View [ width = 10, big: State [ width = 99 ] ],
    go() { this.v.big.toggle() },
    gated: State [ applied = { this.root.width > 50 } ],   // raw build(): 'app' is compile's rewrite
    bad() { this.gated.apply() } ]`);
  assert.equal(app.v.width, 10);
  app.go(); assert.equal(app.v.width, 99, "toggle applies the override");
  app.go(); assert.equal(app.v.width, 10, "toggle removes it");
  // the other half of the rule: a GATED state refuses the verbs, with the rule named
  assert.throws(() => app.bad(), /gated by \{ \} OR driven by the verbs/);
  // and a typo still gets the near-miss
  const errs = (() => { try { const r = compile("App [ width=1, height=1, s: State [ x = 1 ], go() { this.s.togle() } ]"); return (r.errors ?? []).map((e) => e.message).join("\n"); } catch (e) { return String(e); } })();
  assert.match(errs, /did you mean 'toggle'/);
});

await test("element-typed arrays (`Window[]`) and the literal-tag createView", () => {
  // Both were mislabeled "gaps needing a ruling". TS has element-typed arrays;
  // only the WRITTEN-type grammar had to admit the spelling (same story as
  // function types). And createView's tag is a string literal at nearly every
  // call site, with the class table in the scaffold's hands — so the return is
  // the class the tag names, and `child = createView("Menu", …)` needs no cast.
  const ok = (src) => { const r = compile(src, {}); assert.ok(r.source, (r.errors?.[0]?.rawMessage) ?? "expected it to compile"); };
  const errs = (src) => {
    try { const r = compile(src); return (r.errors ?? []).map((e) => e.message ?? String(e)).join("\n"); }
    catch (e) { return String(e?.message ?? e); }
  };
  const W = `class Window extends View [ dockSlot: number = -1 ]\n`;

  ok(W + `App [ width=1, height=1, n: number = 0, f(ws: Window[]) { for (const w of ws) this.n = w.dockSlot } ]`);
  ok(W + `App [ width=1, height=1, mk() -> Window[] { return [] } ]`);
  ok(`App [ width=1, height=1, xs: number[] = null, grid: number[][] = null ]`);
  assert.match(errs(W + `App [ width=1, height=1, n: number = 0, f(ws: Window[]) { for (const w of ws) this.n = w.dockSlott } ]`),
    /did you mean 'dockSlot'/);
  assert.match(errs(`App [ width=1, height=1, f(xs: Nonsense[]) { } ]`), /unknown type 'Nonsense'/);
  // adjacency is the grammar: `Menu[]` glued is a type; `Menu [ ]` spaced is a
  // named CHILD with an empty body — both must keep working
  ok(`class Menu extends View [ n: number = 0 ]\nApp [ width=1, height=1, m: Menu [ ] ]`);

  // createView: a literal tag returns that class; a dynamic tag honestly View
  ok(`class Menu extends View [ shown: boolean = false ]\nApp [ width=1, height=1, n: number = 0, go() { const m = app.createView("Menu", app, ({ })); this.n = m.shown ? 1 : 0 } ]`);
  assert.match(errs(`class Menu extends View [ shown: boolean = false ]\nApp [ width=1, height=1, n: number = 0, go() { const m = app.createView("Menu", app, ({ })); this.n = m.showwn ? 1 : 0 } ]`),
    /did you mean 'shown'/);
  ok(`App [ width=1, height=1, k: string = "Text", go() { const v = app.createView(this.k, app, ({ })); v.x = 1 } ]`);
});

await test("function types — `(id: string) -> void`, the type a method IS", () => {
  // language §4: "A method is a named field of function type — `name: (params)
  // -> Ret { body }`". Only the SUGAR (`f(v: object) { }`) had been implemented, so a
  // callback could not be typed at all: library/dialog.declare wrote
  // `cb: object = null` because `object` was the closest thing sayable.
  const ok = (src) => { const r = compile(src, {}); assert.ok(r.source, (r.errors?.[0]?.rawMessage) ?? "expected it to compile"); };
  const errs = (src) => {
    try { const r = compile(src); return (r.errors ?? []).map((e) => e.message ?? String(e)).join("\n"); }
    catch (e) { return String(e?.message ?? e); }
  };
  // as a parameter, a return, an attribute — the three type positions
  ok(`App [ width=1, height=1, callCb(f: (id: string) -> void, id: string) { f(id) } ]`);
  ok(`App [ width=1, height=1, mk() -> (id: string) -> void { return (s) => { } } ]`);
  ok(`App [ width=1, height=1, cb: (id: string) -> void = null ]`);
  ok(`App [ width=1, height=1, g(h: (k: (x: number) -> void) -> void) { } ]`);   // nested
  ok(`App [ width=1, height=1, callCb(f: (id: string), id: string) { f(id) } ]`); // `-> void` implied

  // it CHECKS, through the callback and into the slot
  assert.match(errs(`App [ width=1, height=1, callCb(f: (id: string) -> void, id: string) { f(7) } ]`),
    /Argument of type 'number' is not assignable to parameter of type 'string'/);
  assert.match(errs(`App [ width=1, height=1, cb: (id: string) -> void = null, arm(f: (n: number) -> void) { this.cb = f } ]`),
    /not assignable/);
  // a nullable function type parenthesises, or `=> void | null` would read as
  // a function RETURNING `void | null`
  ok(`App [ width=1, height=1, cb: (id: string) -> void? = null,
    fire(id: string) { if (this.cb != null) this.cb(id) },
    arm(f: (id: string) -> void?) { this.cb = f } ]`);
  // an unknown name INSIDE the type is named, not the whole type
  assert.match(errs(`App [ width=1, height=1, callCb(f: (id: Nonsense) -> void) { } ]`),
    /unknown type 'Nonsense' for parameter 'f'/);
  // only `null` is a literal for a function slot
  assert.match(errs(`App [ width=1, height=1, cb: (id: string) -> void = 5 ]`),
    /expects a function \(id: string\) -> void, or null for none/);
});

await test("a signature type may be NULLABLE — `c: Menu?` — and TS narrowing does the rest", () => {
  // The measured problem this solves: a component SLOT is null-defaulted, so a
  // non-null parameter rejects it, and making every parameter nullable makes
  // every unchecked body read an error. Neither is right for all methods —
  // which method wants which depends on who holds the knowledge. The `?` lets
  // each say so, and TypeScript's narrowing then makes a checking body clean.
  const ok = (src) => { const r = compile(src, {}); assert.ok(r.source, (r.errors?.[0]?.rawMessage) ?? "expected it to compile"); };
  const errs = (src) => {
    try { const r = compile(src); return (r.errors ?? []).map((e) => e.message ?? String(e)).join("\n"); }
    catch (e) { return String(e?.message ?? e); }
  };
  const M = `class Menu extends View [ shown: boolean = false, child: Menu = null, closeSelf() { } ]\n`;

  ok(M + `App [ width=1, height=1, m: Menu [ ], f(c: Menu?) -> boolean { return c != null && c.shown } ]`);
  ok(M + `App [ width=1, height=1, m: Menu [ ], f(c: Menu?) { if (c != null) c.closeSelf() } ]`);
  ok(M + `App [ width=1, height=1, m: Menu [ ], f() -> Menu? { return null } ]`);
  // a nullable slot reaches a nullable parameter…
  ok(M + `App [ width=1, height=1, m: Menu [ ], f(c: Menu?) { if (c != null) c.closeSelf() }, go() { this.f(this.m.child) } ]`);
  // …but not a non-null one: the caller must guarantee it
  assert.match(errs(M + `App [ width=1, height=1, m: Menu [ ], f(c: Menu) { c.closeSelf() }, go() { this.f(this.m.child) } ]`),
    /not assignable/);
  // an unchecked read of a nullable value names BOTH repairs
  assert.match(errs(M + `App [ width=1, height=1, m: Menu [ ], f(c: Menu?) { c.closeSelf() } ]`),
    /'c' may be absent here — check it .*or drop the '\?' from its type/);
});

await test("a declared attribute may be typed by a COMPONENT CLASS", () => {
  // The irregularity this closes: the `component` AttrType and its coercion
  // already existed for built-in slots (`layout: Layout`), but a DECLARATION
  // could name only `View`. A slot could therefore never say what it held, and
  // no parameter could be typed more precisely than the slot feeding it.
  const ok = (src) => { const r = compile(src, {}); assert.ok(r.source, (r.errors?.[0]?.rawMessage) ?? "expected it to compile"); };
  const errs = (src) => {
    try { const r = compile(src); return (r.errors ?? []).map((e) => e.message ?? String(e)).join("\n"); }
    catch (e) { return String(e?.message ?? e); }
  };
  const no = (src, re) => assert.match(errs(src), re);

  ok(`class W extends View [ tag: string = "" ]\nApp [ width=1, height=1, w: W = null ]`);
  ok(`App [ width=1, height=1, m: Text = null ]`);                       // built-in class too
  // self- and forward references: a component AttrType stores only the NAME,
  // so no schema need exist yet (the submenu-chain shape).
  ok(`class Menu extends View [ child: Menu = null, n: number = 0 ]\nApp [ width=1, height=1, m: Menu [ ] ]`);
  ok(`class A extends View [ b: B = null ]\nclass B extends View [ n: number = 0 ]\nApp [ width=1, height=1, a: A [ ] ]`);
  // it maps to the SAME TS class every other reference does — members resolve,
  // typos are caught, and a foreign class is rejected.
  ok(`class W extends View [ tag: string = "" ]\nApp [ width=1, height=1, w: W = null, t: Text [ text = { app.w != null ? app.w.tag : "" } ] ]`);
  no(`class W extends View [ tag: string = "" ]\nApp [ width=1, height=1, w: W = null, t: Text [ text = { app.w != null ? app.w.tagg : "" } ] ]`,
     /'tagg' is not a member of W/);
  no(`class W extends View [ tag: string = "" ]\nclass Z extends View [ zed: number = 0 ]\nApp [ width=1, height=1, w: W = null, z: Z = null, go() { this.w = this.z } ]`,
     /not assignable/);
  no(`App [ width=1, height=1, w: Nonsense = null ]`, /unknown type 'Nonsense'/);
});

await test("scaffold: the Draw surface mirrors draw.ts — every member, no drift", async () => {
  // `draw(d: Draw)` is only as good as this mirror. The prelude is a hand-written
  // string (the scaffold runs in the browser and cannot read the filesystem), so
  // it can drift from the runtime in EITHER direction, and the two fail differently:
  //
  //   draw.ts has it, the scaffold does not  → a correct program is a type error.
  //     Loud, and what this test originally checked.
  //   the scaffold has it, draw.ts does not  → the program COMPILES, reads
  //     `undefined` at runtime, and the arithmetic goes NaN. Silent.
  //
  // Only the first was asserted, which is exactly how `d.x`/`d.y`/`d.w`/`d.h` came
  // to be typed here and absent from the runtime for as long as draw() has been
  // typed: `d.w - 20` compiled, went NaN, bounded the recording to nothing, and the
  // drawing vanished with no error at any rung (found by a cold agent run,
  // 2026-08-05). The silent direction is the one worth gating; both are gated now.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../runtime/src/draw.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export class Draw {"));
  const real = new Set();
  for (const m of body.matchAll(/^  (?:get|set) ([a-zA-Z]\w*)\(/gm)) real.add(m[1]);
  for (const m of body.matchAll(/^  ([a-z]\w*)\(/gm)) real.add(m[1]);
  // Internal to the recording, not author surface. Applied to BOTH sides: these
  // are excluded from the comparison, not absent from the runtime, so the reverse
  // check must not read them as phantoms.
  const INTERNAL = ["constructor", "readOnly", "extend", "fn", "list"];
  for (const skip of INTERNAL) real.delete(skip);

  const { generateScaffold } = await import("../compiler/dist/scaffold.js");
  const { parseProgram } = await import("../runtime/dist/parser.js");
  const { programSchemas } = await import("../runtime/dist/check.js");
  const prog = parseProgram("App [ ]");
  const scaffold = generateScaffold(programSchemas(prog.classes).schemas, prog.classes, "App");
  const iface = scaffold.slice(scaffold.indexOf("interface Draw {"));
  const declared = new Set([...iface.slice(0, iface.indexOf("\n}")).matchAll(/^  ([a-zA-Z]\w*)[(:]/gm)].map((m) => m[1]));

  const missing = [...real].filter((n) => !declared.has(n));
  assert.deepEqual(missing, [], `draw.ts members absent from the scaffold prelude: ${missing.join(", ")}`);

  // …and the silent direction. A scaffold member the runtime does not supply reads
  // `undefined` in every program that touches it.
  const phantom = [...declared].filter((n) => !real.has(n) && !INTERNAL.includes(n));
  assert.deepEqual(phantom, [],
    `the scaffold prelude declares Draw members the runtime does not supply: ${phantom.join(", ")}\n` +
    `      A program can reference these, typecheck, and read undefined at runtime.\n` +
    `      Either implement them on class Draw (runtime/src/draw.ts) or delete them from the prelude.`);
});

await test("parse() reads a TYPED signature — language §4's canonical form", () => {
  // Both annotations were parsed and thrown away until 2026-07-28 (with an
  // error insisting they were illegal); they are the spec, and the type is
  // now carried on the AST. `-> Ret` is house style; `: Ret` also parses.
  const el = parse("View [ f(w: Window, n: number) -> string { return \"\" }, g(v): number { return v }, h(x) { } ]");
  const shape = (m) => [m.name, m.params.map((p) => [p.name, p.type]), m.returns];
  assert.deepEqual(el.methods.map(shape), [
    ["f", [["w", "Window"], ["n", "number"]], "string"],
    ["g", [["v", undefined]], "number"],
    ["h", [["x", undefined]], undefined],
  ]);
});

await test("parse() positions a signature type, for a positioned unknown-type error", () => {
  const el = parse("View [ f(w: Window) { } ]");
  assert.equal(el.methods[0].params[0].typePos.offset > 0, true);
  assert.equal(el.methods[0].params[0].type, "Window");
});

await test("methods mix with attributes and children", () => {
  const el = parse("App [ width=1, onInit() { }, View [ x=2, m() { } ] ]");
  assert.equal(el.attrs.length, 1);
  assert.equal(el.methods.length, 1);
  assert.equal(el.children[0].methods.length, 1);
  // a method body needs its separator too — nothing about `}` ends a member
  const sep = parse("App [ onInit() { }, View [] ]");
  assert.equal(sep.methods.length, 1);
  assert.equal(sep.children.length, 1);
});

await test("a method body is the same lexical-island scan as a { } value", () => {
  const m = parse('View [ m() { "}" + `${ { a: 1 } }` } ]').methods[0];
  assert.equal(m.body, ' "}" + `${ { a: 1 } }` ');
});

await test("method syntax errors are positioned", () => {
  assert.throws(() => parse("View [ m( ]"), /expected '\)'/);
  assert.throws(() => parse("View [ m() 5 ]"), /expected the method body '\{ … \}', got '5'/);
  assert.throws(() => parse("View [ m() { ]"), /unterminated \{ \} expression/);
});

// ── R5: check() over methods ────────────────────────────────────────────────

await test("check() accepts handlers for View's declared events, incl. inherited", () => {
  const src = `App [ width=1, height=1, onInit() { },
    View [ onClick() { this.x = 1 }, onPointerDown() { }, onPointerUp() { } ],
    Text [ onClick() { } ], Image [ onPointerUp() { } ] ]`;
  assert.deepEqual(check(parse(src)), []);
});

await test("check() rejects a typo'd handler, naming the handlers it knows", () => {
  const [err] = check(parse("View [ onClik() { } ]"));
  // names the typo and lists the handlers it knows (the set grows with the
  // schema — pin the stable leading pointer handlers, not the whole tail)
  assert.match(err.message, /View has no 'onClik' event — its handlers: onClick, onDblClick, onHold, onPointerDown, onPointerUp, onPointerMove/);
  assert.equal(err.pos.col, 8);
});

await test("check(): plain methods take any free name; attribute names are taken", () => {
  assert.deepEqual(check(parse("View [ nudge(dx: number) { this.x = this.x + dx } ]")), []);
  assert.deepEqual(check(parse("View [ once() { } ]")), [], "'once' is not handler-shaped");
  const [err] = check(parse("View [ width() { } ]"));
  assert.match(err.message, /View\.width is an attribute — a method may not take an attribute's name/);
});

await test("check() flags a method declared twice", () => {
  const [err] = check(parse("View [ m() { }, m() { } ]"));
  assert.match(err.message, /View\.m is declared twice \(first at line 1, col 8\)/);
});

await test("check() reports method-body syntax errors at the body, one per method", () => {
  const errors = check(parse("View [ m() { 1 +++ * 2 } ]"));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /View\.m\(…\) is not a valid method body — /);
  assert.equal(errors[0].pos.col, 12);
});

await test("check(): a parameter may not shadow the 'parent' scope noun", () => {
  const [err] = check(parse("View [ m(parent) { } ]"));
  assert.match(err.message, /a parameter may not be named 'parent'/);
});

await test("check() on a schema with no events says so", () => {
  const bad = checkMethod(BaseSchema, parse("X [ onZap() { } ]").methods[0]);
  assert.match(bad.error.message, /Base declares no events, so 'onZap' can answer nothing/);
  const ok = checkMethod(BaseSchema, parse("X [ zap() { } ]").methods[0]);
  assert.equal(ok.ok, true, "a plain method needs no event declaration");
});

await test("check() errors come out in source order across member kinds", () => {
  const errors = check(parse("View [ onClik() { }, zap=1 ]"));
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /onClik/);
  assert.match(errors[1].message, /zap/);
});

// ── R5: instantiate — methods, scope, init ──────────────────────────────────

await test("build() installs methods: callable, this/parent scope, extraction-safe", () => {
  const app = build("App [ width=100, height=60, View [ nudge(dx: number) { this.x = this.x + dx }, center() { this.x = (parent.width - this.width) / 2 } ] ]");
  const v = app.children[0];
  v.nudge(5);
  assert.equal(v.x, 5, "writes are immediate (the R4 write path)");
  v.width = 20;
  v.center();
  assert.equal(v.x, 40, "parent resolves to the view-tree parent");
  const f = v.nudge;
  f(3);
  assert.equal(v.x, 43, "methods close over their instance");
});

await test("a method may return a value (statement body, not an expression wrap)", () => {
  const app = build("App [ width=100, height=60, View [ twice(n: number) -> number { return n * 2 } ] ]");
  assert.equal(app.children[0].twice(21), 42);
});

await test("a method may not shadow a runtime built-in (instantiation-context fact)", () => {
  // check() passes it — the checker is runtime-free by design — and the
  // runtime bridge refuses it, like percent-on-root.
  assert.deepEqual(check(parse("View [ attach() { } ]")), []);
  assert.throws(
    () => build("App [ width=1, height=1, View [ attach() { } ] ]"),
    /View\.attach: 'attach' is a built-in member of the runtime View/
  );
  assert.throws(
    () => build("App [ width=1, height=1, View [ toString() { } ] ]"),
    /built-in member/
  );
});

await test("onInit fires once construction completes, children before parents", () => {
  globalThis.__init = [];
  build(`App [ width=100, height=60,
    onInit() { globalThis.__init.push(["app", this.children[0].width]) },
    View [ onInit() { globalThis.__init.push(["outer", this.width]) },
      View [ onInit() { globalThis.__init.push(["inner", 0]) } ] ],
    View [ width={ parent.width / 2 }, onInit() { globalThis.__init.push(["bound", this.width]) } ] ]`);
  assert.deepEqual(globalThis.__init.map(([n]) => n), ["inner", "outer", "bound", "app"]);
  assert.equal(globalThis.__init[2][1], 50, "bindings evaluated before init");
  assert.equal(globalThis.__init[3][1], 0, "init sees the settled tree (app reads its child)");
});

await test("a view with a pointer handler gets an input sink; one without gets none", () => {
  const app = build(`App [ width=100, height=60,
    View [ onPointerUp() { } ],
    View [ x=1 ],
    View [ onInit() { } ] ]`);
  const logs = [[], [], [], []];
  const backend = {
    createSurface: (() => {
      let i = 0;
      return () => mockBackend(logs[i++]).createSurface();
    })(),
    attachRoot: () => {},
  };
  app.attach(backend, null);
  const sinks = logs.map((log) => log.some(([m]) => m === "setInput"));
  assert.deepEqual(sinks, [false, true, false, false],
    "only the pointer-handling view is wired (init alone does not make a view interactive)");
});

await test("dispatch: the sink calls the right handler with view-local {x,y}", () => {
  globalThis.__ev = [];
  const app = build(`App [ width=100, height=60,
    View [ onClick(e: PointerEvent) { globalThis.__ev.push(["click", e.x, e.y]); this.x = e.x },
           onPointerDown(e: PointerEvent) { globalThis.__ev.push(["down", e.x, e.y]) } ] ]`);
  const log = [];
  app.attach(mockBackend(log), null);
  const childSink = log.filter(([m]) => m === "setInput")[0][1];
  childSink("pointerDown", 7, 8);
  childSink("pointerUp", 7, 8); // no handler — must be silently ignored
  childSink("click", 3, 4);
  assert.deepEqual(globalThis.__ev, [["down", 7, 8], ["click", 3, 4]]);
  assert.equal(app.children[0].x, 3, "handler writes land through the reactive setter");
  assert.ok(log.some(([m, v]) => m === "setX" && v === 3), "and push their Surface call");
});

await test("routeInput: POINTER events drive the sink protocol (down/up/click; cancel = no click)", () => {
  // Mock window so the router's listeners can be driven with synthetic pointer
  // events — this locks the touch-capable wire (a tap is pointerdown+pointerup,
  // not a synthesized mouse pair) without a browser.
  const handlers = {};
  const realWindow = globalThis.window;
  globalThis.window = {
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter((h) => h !== fn); },
  };
  try {
    const log = [];
    const mk = (name) => ({ key: { name }, sink: (type) => log.push([name, type]), x: 1, y: 2 });
    const targets = { A: mk("A"), B: mk("B") };
    routeInput(() => true, (e) => targets[e.k] ?? null, (e) => ({ x: e.clientX, y: e.clientY }));
    const fire = (type, k, pointerType = "touch") =>
      (handlers[type] ?? []).forEach((h) => h({ k, clientX: 10, clientY: 20, pointerType }));

    fire("pointerdown", "A"); fire("pointerup", "A");
    assert.deepEqual(log.map((e) => e[1]), ["pointerDown", "pointerUp", "click"], "a tap fires down, up, then click");
    assert.equal(log[2][0], "A", "click resolves to the pressed view");

    log.length = 0;
    fire("pointerdown", "A"); fire("pointerup", "B");
    assert.deepEqual(log.map((e) => e[1]), ["pointerDown", "pointerUp"], "release over another view clicks nothing");

    log.length = 0;
    fire("pointerdown", "A"); fire("pointercancel", "A");
    assert.deepEqual(log.map((e) => e[1]), ["pointerDown", "pointerUp"], "a canceled press releases without a click (drag can finalize)");
  } finally {
    globalThis.window = realWindow;
  }
});

// ── the click RULE: slop, cancellation, and double-click arbitration ─────────
// The router decides what a gesture MEANT; these lock the decision, backend-free.

/** Drive routeInput with synthetic pointer events over a mock window. */
function inputHarness(targets) {
  const handlers = {};
  const realWindow = globalThis.window;
  globalThis.window = {
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter((h) => h !== fn); },
  };
  const log = [];
  const mk = (name, wants = {}) => ({
    key: { name }, x: 1, y: 2, ...wants,
    sink: (type, x, y, extra) => log.push([name, type, extra]),
  });
  const T = {};
  for (const [name, wants] of Object.entries(targets)) T[name] = mk(name, wants);
  routeInput(() => true, (e) => T[e.k] ?? null, (e) => ({ x: e.clientX, y: e.clientY }));
  return {
    log,
    types: () => log.map((e) => e[1]),
    fire: (type, k, { x = 10, y = 20, pointerType = "touch" } = {}) =>
      (handlers[type] ?? []).forEach((h) => h({ k, clientX: x, clientY: y, pointerType, pointerId: 1 })),
    done: () => { globalThis.window = realWindow; },
  };
}

await test("click slop: a moved FINGER does not click (it was swiping), a still one does", () => {
  const h = inputHarness({ A: {} });
  try {
    h.fire("pointerdown", "A", { x: 100, y: 100 });
    h.fire("pointermove", "A", { x: 100, y: 130 });   // 30px — past the 10px touch slop
    h.fire("pointerup", "A", { x: 100, y: 130 });
    assert.ok(!h.types().includes("click"), "a swipe that began on a view clicks nothing");

    h.log.length = 0;
    h.fire("pointerdown", "A", { x: 100, y: 100 });
    h.fire("pointermove", "A", { x: 103, y: 100 });   // 3px — finger jitter
    h.fire("pointerup", "A", { x: 103, y: 100 });
    assert.ok(h.types().includes("click"), "jitter inside slop still taps");
  } finally { h.done(); }
});

await test("click slop: a MOUSE tracks inside its target (4px), unlike a finger", () => {
  const h = inputHarness({ A: {} });
  try {
    h.fire("pointerdown", "A", { x: 100, y: 100, pointerType: "mouse" });
    h.fire("pointermove", "A", { x: 106, y: 100, pointerType: "mouse" });  // 6px — past mouse slop
    h.fire("pointerup", "A", { x: 106, y: 100, pointerType: "mouse" });
    assert.ok(!h.types().includes("click"), "a 6px mouse drag is a drag, not a click");

    h.log.length = 0;
    h.fire("pointerdown", "A", { x: 100, y: 100, pointerType: "mouse" });
    h.fire("pointermove", "A", { x: 102, y: 100, pointerType: "mouse" });  // 2px — hand tremor
    h.fire("pointerup", "A", { x: 102, y: 100, pointerType: "mouse" });
    assert.ok(h.types().includes("click"), "2px of tremor still clicks");
  } finally { h.done(); }
});

await test("a canceled gesture says so: the release carries canceled: true", () => {
  const h = inputHarness({ A: {} });
  try {
    h.fire("pointerdown", "A");
    h.fire("pointercancel", "A");
    const up = h.log.find((e) => e[1] === "pointerUp");
    assert.equal(up[2].canceled, true, "an interrupted gesture is distinguishable from a drop");

    h.log.length = 0;
    h.fire("pointerdown", "A");
    h.fire("pointerup", "A");
    assert.equal(h.log.find((e) => e[1] === "pointerUp")[2].canceled, false, "a real release is not canceled");
  } finally { h.done(); }
});

await test("dblClick: two taps pair; a view declaring onDblClick HOLDS its single click", async () => {
  const h = inputHarness({ A: {}, D: { wantsDbl: true } });
  try {
    // a plain view: click fires immediately, the pair adds dblClick
    h.fire("pointerdown", "A"); h.fire("pointerup", "A");
    h.fire("pointerdown", "A"); h.fire("pointerup", "A");
    assert.deepEqual(h.types().filter((t) => t === "click" || t === "dblClick"),
      ["click", "click", "dblClick"], "no arbitration where none was asked for");

    // a view that answers double-clicks: the FIRST click waits out the window
    h.log.length = 0;
    h.fire("pointerdown", "D"); h.fire("pointerup", "D");
    assert.deepEqual(h.types().filter((t) => t === "click"), [], "single click withheld pending the double window");
    h.fire("pointerdown", "D"); h.fire("pointerup", "D");
    assert.deepEqual(h.types().filter((t) => t === "click" || t === "dblClick"),
      ["dblClick"], "the pair fires dblClick ONLY — the single action never ran");

    // and a lone tap on that view still clicks, once the window passes
    h.log.length = 0;
    h.fire("pointerdown", "D"); h.fire("pointerup", "D");
    await new Promise((r) => setTimeout(r, 450));
    assert.deepEqual(h.types().filter((t) => t === "click"), ["click"], "the withheld click arrives when no pair comes");
  } finally { h.done(); }
});

await test("dblClick proximity: two taps far apart on one big view are not a pair", () => {
  const h = inputHarness({ A: {} });
  try {
    h.fire("pointerdown", "A", { x: 10, y: 10 }); h.fire("pointerup", "A", { x: 10, y: 10 });
    h.fire("pointerdown", "A", { x: 200, y: 200 }); h.fire("pointerup", "A", { x: 200, y: 200 });
    assert.ok(!h.types().includes("dblClick"), "opposite corners of a large view are two singles");
  } finally { h.done(); }
});

await test("onHold: a press held in place fires hold, and does not consume the gesture", async () => {
  const h = inputHarness({ H: { wantsHold: true } });
  try {
    h.fire("pointerdown", "H");
    await new Promise((r) => setTimeout(r, 560));
    assert.ok(h.types().includes("hold"), "held in place → hold");
    h.fire("pointerup", "H");
    assert.ok(h.types().includes("click"), "the gesture continues: a still release still clicks");

    // a press that WANDERS is a drag, never a hold
    h.log.length = 0;
    h.fire("pointerdown", "H", { x: 100, y: 100 });
    h.fire("pointermove", "H", { x: 100, y: 140 });
    await new Promise((r) => setTimeout(r, 560));
    h.fire("pointerup", "H", { x: 100, y: 140 });
    assert.ok(!h.types().includes("hold"), "a moved press is a drag, not a hold");
  } finally { h.done(); }
});

await test("the hit test: app.viewAt answers with the SAME walk the pointer is routed by", () => {
  const app = build(`App [ width = 200, height = 200,
    a: View [ x = 10, y = 10, width = 80, height = 80,
        inner: View [ x = 10, y = 10, width = 20, height = 20 ] ],
    glass: View [ x = 100, y = 10, width = 60, height = 60, pointerEvents = "none" ],
    ]`);
  settle();
  assert.equal(app.viewAt(25, 25), app.a.inner, "topmost (deepest) view wins");
  assert.equal(app.viewAt(80, 80), app.a, "a point in the parent only");
  assert.equal(app.viewAt(5, 5), app, "the root itself");
  assert.equal(app.viewAt(120, 30), app, "pointer-transparent views are skipped, exactly as a press would");
  assert.equal(app.viewAt(500, 500), null, "outside everything");
  // and the view-local companion
  assert.ok(app.a.containsPoint(50, 50), "containsPoint: root-space point inside a's box");
  assert.ok(!app.a.containsPoint(150, 50), "…and outside it");
});

await test("the hit test honours CLIP, which the old inspector walk did not", () => {
  const app = build(`App [ width = 200, height = 200,
    box: View [ x = 10, y = 10, width = 50, height = 50, clip = true,
        over: View [ x = 40, y = 40, width = 60, height = 60 ] ],
    ]`);
  settle();
  assert.equal(app.viewAt(55, 55), app.box.over, "inside the clip, the child is hit");
  assert.equal(app.viewAt(90, 90), app, "the overflowing part is clipped away — not hit");
});

await test("raw touch: a view declaring the family gets the finger list, ids stable", () => {
  const h = inputHarness({ T: { wantsTouch: true } });
  try {
    h.fire("pointerdown", "T", { x: 30, y: 40 });
    const start = h.log.find((e) => e[1] === "touchStart");
    assert.deepEqual(start[2].touches, [{ id: 1, x: 30, y: 40 }], "the live finger list rides the event");
    h.fire("pointermove", "T", { x: 35, y: 44 });
    const move = h.log.find((e) => e[1] === "touchMove");
    assert.equal(move[2].touches[0].id, 1, "the same finger keeps its id across the gesture");
    assert.equal(move[2].touches[0].y, 44);
    h.fire("pointerup", "T", { x: 35, y: 44 });
    assert.ok(h.types().includes("touchEnd"), "and the lift is reported");
    assert.deepEqual(h.log.find((e) => e[1] === "touchEnd")[2].touches, [], "with the finger gone from the list");
  } finally { h.done(); }
});

await test("draw(d) { … } — the language surface — rides the recorded-draw machinery", () => {
  const app = build("App [ width=100, height=60, View [ width=8, height=10, draw(d: Draw) { d.fillRect(0, 0, this.width, 5) } ] ]");
  const log = [];
  app.attach(mockBackend(log), null);
  settle();
  const pushes = () => log.filter(([m]) => m === "setDrawing");
  assert.equal(pushes().length, 1, "recorded once at attach");
  assert.deepEqual(pushes()[0][1].bounds, { x: 0, y: 0, w: 8, h: 5 });
  app.children[0].width = 30; // the body read this.width — the recording is stale
  settle();
  assert.deepEqual(pushes()[1][1].bounds, { x: 0, y: 0, w: 30, h: 5 }, "re-recorded against the new width");
});

// ── R5: the canvas hit walk (pure geometry — no browser needed) ────────────

await test("canvas hit walk: topmost wins, transparency falls through, pruning", () => {
  const backend = new CanvasBackend();
  const surf = (x, y, w, h, sink = null) => {
    const s = backend.createSurface();
    s.setX(x); s.setY(y); s.setWidth(w); s.setHeight(h);
    if (sink) s.setInput(sink);
    return s;
  };
  const sink = (name) => (type, x, y) => name; // identity is what the walk returns
  const root = surf(0, 0, 200, 100);
  const a = surf(10, 10, 80, 60, sink("a"));
  const b = surf(50, 10, 80, 60, sink("b")); // later sibling — paints (and hits) on top
  const deco = surf(5, 5, 40, 20); // sink-less child of b: transparent to input
  root.insertChild(a, null);
  root.insertChild(b, null);
  b.insertChild(deco, null);

  assert.equal(root.hit(20, 20).key, a, "point only over a");
  assert.equal(root.hit(60, 20).key, b, "overlap: the topmost (later) sibling wins");
  const local = root.hit(60, 20);
  assert.deepEqual([local.x, local.y], [10, 10], "coordinates arrive in the hit view's space");
  assert.equal(root.hit(58, 18).key, b, "a sink-less child is transparent — falls through to b");
  assert.equal(root.hit(150, 90), null, "background: nothing interactive under the point");

  b.setVisible(false);
  assert.equal(root.hit(60, 20).key, a, "invisible prunes the subtree");
  b.setVisible(true);
  // OPACITY IS PAINT, NOT PRESENCE (canvas-backend.ts `hit`): a fully
  // transparent view is still hittable. The DOM inherits this from CSS, where
  // only visibility/display/pointer-events remove an element from hit testing —
  // so pruning here would make the two renderers disagree on input routing, and
  // would put `viewAt()` at odds with the `hovered` intrinsic, which consults
  // `visible` alone. The transparent press-catcher (the activation-glass idiom)
  // depends on it. An author who wants a fade to become absence writes
  // `visible = { opacity > 0 }`.
  b.setOpacity(0);
  assert.equal(root.hit(60, 20).key, b, "opacity 0 still hits — opacity is paint, not presence");
  b.setOpacity(0.5);
  assert.equal(root.hit(60, 20).key, b, "translucent still hits");
  // The WHEEL arm obeys the same rule: a wheel is input, routed by position, so
  // it reaches a transparent scroller exactly as a click reaches a transparent
  // sink. (scrollBy used to prune on opacity, which left the two input paths
  // disagreeing with each other inside the SAME renderer.)
  b.scrolls = true;
  b.setOpacity(0);
  assert.equal(root.scrollBy(60, 20, 10), true, "a transparent scroller still takes the wheel");
  b.setVisible(false);
  assert.equal(root.scrollBy(60, 20, 10), false, "but `visible = false` does prune the wheel");
  b.setVisible(true);
  b.scrolls = false;
  b.setOpacity(0.5);

  // a child outside its parent's box is still hittable (no implicit clip)
  const out = surf(150, 80, 30, 30, sink("out"));
  a.insertChild(out, null); // abs 160..190 × 90..120
  assert.equal(root.hit(170, 95).key, out);
});

// ── R6: grammar — classes, attribute declarations, named children ───────────

await test("parseProgram() reads class declarations and the root", () => {
  const p = parseProgram(`class Tally extends View [
    count: number = 0,
    label: string,
    bump(n: object) { },
    hit: View [ x = 1 ],
    View [ ],
    ]
  App [ width = 1 ]`);
  assert.equal(p.classes.length, 1);
  const c = p.classes[0];
  assert.equal(c.name, "Tally");
  assert.equal(c.base, "View");
  assert.equal(c.body.tag, "Tally", "the body is an Element tagged with the class's own name");
  assert.deepEqual(c.body.decls.map((d) => [d.name, d.type, d.def?.value ?? null]), [
    ["count", "number", 0],
    ["label", "string", null], // no default — starts undefined until set
  ]);
  assert.deepEqual(c.body.methods.map((m) => m.name), ["bump"]);
  assert.deepEqual(c.body.children.map((ch) => [ch.name, ch.tag]), [["hit", "View"], [null, "View"]]);
  assert.equal(p.root.tag, "App");
});

await test("parseProgram(): `name: Type` without brackets is a declaration, with them a named child", () => {
  const el = parseProgram("App [ lay: Grid, box: View [ ] ]").root;
  assert.deepEqual(el.decls.map((d) => [d.name, d.type]), [["lay", "Grid"]]);
  assert.deepEqual(el.children.map((c) => [c.name, c.tag]), [["box", "View"]]);
});

await test("comments are trivia: `//` lines and `/* */` blocks (literate Markdown)", () => {
  // Block comments are valid anywhere a line comment is — they carry the literate
  // Markdown the code viewer renders (highlight.ts). Both are skipped by the lexer.
  const p = parseProgram(`/* # Title\nsome **markdown** */\n// a line comment\nApp [ /* inline */ width = 40 ]`);
  assert.equal(p.root.tag, "App");
  assert.deepEqual(p.root.attrs.map((a) => a.name), ["width"]);
  assert.throws(() => parseProgram("/* never closed\nApp [ ]"), /unterminated block comment/);
});

await test("parseProgram() positions class syntax errors", () => {
  // `extends` is optional — a bare `class X [ ]` IS a Node (a non-visual
  // controller/service). But writing `extends` commits you to naming the base.
  assert.throws(() => parseProgram("class Tally extends [ ]"), /base component's name.*line 1, col 21/s);
  assert.throws(() => parseProgram("class Tally extends View [ ]"), /expected a component name/, "a program still needs its root");
});

await test("a bare class is a Node — a non-visual reactive node reached from a view", () => {
  // No `extends` → a Node: reactive state + methods in the object graph, never
  // drawn. A view reaches it by name (App.store) and binds to it, reactively.
  const r = compile(`
class Store [ n: number = 0, tag: string = "a", bump() { this.n = this.n + 1; this.tag = "b" } ]
App [ store: Store [ ], out: Text [ text = { App.store.tag + App.store.n } ] ]`);
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error"), []);
  const app = build(r.source);
  assert.ok(app.store instanceof Node && !(app.store instanceof View), "the model is a Node, not a View");
  assert.ok(!app.children.some((c) => c === app.store && c instanceof View), "excluded from the visual child set");
  assert.equal(app.out.text, "a0", "a view reads the model's reactive state");
  app.store.bump();
  settle();
  assert.equal(app.out.text, "b1", "the view reacts to the model — no rebuild");
});

await test("a Node subclass owns a Dataset — a view reads it by datapath, reactively", () => {
  // The controller pattern: a node owns its data (like the calendar's `cal`),
  // and a view binds through it. `App.store.items.value…` resolves App→node→
  // dataset, and a node attribute change re-selects the record, live.
  const r = compile(`
class Store [
    items: Dataset { { "rows": [ { "label": "alpha" }, { "label": "beta" } ] } },
    pick: number = 0,
    next() { this.pick = 1 }
]
App [ store: Store [ ],
    row: View [ datapath = { App.store.items.value.rows[App.store.pick] },
        out: Text [ text = :label ] ] ]`);
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error"), []);
  const app = build(r.source);
  assert.ok(app.store.items instanceof Dataset, "the model owns the Dataset node");
  assert.equal(app.row.out.text, "alpha", "a view reads through the model's dataset");
  app.store.next();
  settle();
  assert.equal(app.row.out.text, "beta", "a model attr change re-selects the record, live");
});

// ── R6: registration in both twin tables ────────────────────────────────────

await test("programSchemas() registers the schema twin; inheritance chains through user classes", () => {
  const p = parseProgram(`class A extends Text [ tone: number = 3 ]
class B extends A [ deep: boolean = true ]
App [ width = 1 ]`);
  const { infos, schemas, errors } = programSchemas(p.classes);
  assert.deepEqual(errors, []);
  assert.equal(schemas.B.base, schemas.A, "B chains to A's schema, A to Text's");
  assert.equal(schemas.A.base.name, "Text");
  assert.deepEqual(attrType(schemas.B, "deep"), { kind: "boolean" }, "own declaration");
  assert.deepEqual(attrType(schemas.B, "tone"), { kind: "number" }, "inherited user declaration");
  assert.deepEqual(attrType(schemas.B, "fontSize"), { kind: "number" }, "inherited built-in (Text)");
  assert.deepEqual(attrType(schemas.B, "width"), { kind: "length" }, "inherited built-in (View)");
  assert.deepEqual(infos.map((i) => i.defaults), [{ tone: 3 }, { deep: true }]);
});

await test("build() registers the runtime twin: real subclasses, named after the class", () => {
  const app = build(`class A extends Text [ tone: number = 3 ]
class B extends A [ ]
App [ width = 1, height = 1, B [ ] ]`);
  const b = app.children[0];
  assert.equal(b.constructor.name, "B");
  assert.ok(b instanceof Text, "a user class IS its base at runtime");
  assert.equal(b.tone, 3, "declared default through the prototype chain");
  assert.equal(b.fontSize, 16, "built-in defaults still chain beneath");
});

// ── R6: check() over classes and declarations ────────────────────────────────

await test("3.2: settleMotion waits for transitions, not for life (perpetual tickers — ruled 2026-08-06)", () => {
  const clock = new Clock({ now: () => tNow, request: (cb) => { pending = cb; return 1; }, cancel: () => { pending = null; } });
  let tNow = 0; let pending = null;
  setClock(clock);
  try {
    const app = build(`App [ width = 100, height = 100,
      v: number = 0,
      beat: Heartbeat [ onFrame(dt: number) { this.parent.v = this.parent.v + dt } ],
      box: View [ x = 0, width = 10, height = 10,
        s: Spring [ attribute = x, to = 50 ] ],
    ]`);
    try {
      assert.equal(clock.busy, true, "the heartbeat ticks (life paints)");
      // drive frames until the spring rests: settling must FALL even though
      // the heartbeat never stops
      let steps = 0;
      while (clock.settling && steps < 600) { tNow += 16.7; const cb = pending; pending = null; if (cb) cb(tNow); steps++; }
      assert.equal(clock.settling, false, "the spring's transition settled");
      assert.equal(clock.busy, true, "…while the heartbeat keeps the clock alive");
      assert.ok(steps < 600, "settled by convergence, not by cap");
    } finally { app.discard(); }
  } finally { setClock(new Clock()); }
});

await test("P1-2: set-then-fetch in one handler requests the NEW address (settle-at-fetch)", async () => {
  const r12 = compile(`App [ width = 10,
    q: string = "a",
    d: DataSource [ url = { "https://x.test/" + app.q } ],
  ]`, {});
  assert.equal(r12.errors.length, 0, r12.errors.map((e) => e.message).join("; "));
  const app = build(r12.source, { deps: r12.deps });
  const seen = [];
  const prev = provideTransport((url) => { seen.push(url); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }); });
  try {
    app.q = "b";           // same-breath write…
    await app.d.fetch();   // …then fetch: must see the settled url
    assert.equal(seen[0], "https://x.test/b", "fetch read the settled address, not the stale one");
  } finally {
    provideTransport(prev);
    app.discard();
  }
});

await test("P2-2: explain() names the layout that owns a child's geometry", () => {
  const r22 = compile(`App [ width = 200, height = 200,
    col: View [ width = 100,
      layout: SimpleLayout [ axis = y, spacing = 4 ],
      a: View [ width = 10, height = 10 ],
      b: View [ width = 10, height = 10 ],
    ],
  ]`, {});
  assert.equal(r22.errors.length, 0, r22.errors.map((e) => e.message).join("; "));
  const app = build(r22.source, { deps: r22.deps });
  try {
    const p = explain(app.col.b, "y");
    assert.ok(p.constraint !== null, "layout ownership reports as a constraint");
    assert.equal(p.constraint.writer, "SimpleLayout", "…and the WRITER is named");
    const own = explain(app.col, "width");
    assert.ok(own.constraint === null || own.constraint.writer === null, "authored slots name no machinery writer");
  } finally {
    app.discard();
  }
});

await test("declaration order is the author's business — decls after the App, forward extends, and the two unbuildable shapes (ruled 2026-08-06)", () => {
  // The parser accepts declarations on either side of the root instance, and
  // programSchemas builds in dependency order regardless of source order —
  // the natural writing motion (a class extracted and pasted at the bottom)
  // compiles. What still refuses, loudly: an inheritance cycle, and a second
  // root instance.
  const errs = (src) => check(parseProgram(src)).map((e) => e.message);
  assert.deepEqual(errs("App [ width = 10, height = 10, k: K [ ] ]\nclass K extends View [ f: number = 7 ]"), [],
    "a class after the App compiles");
  assert.deepEqual(errs("class A extends B [ g: number = 2 ]\nclass B extends View [ f: number = 1 ]\nApp [ width = 10, a: A [ ] ]"), [],
    "extends reaches a class declared below");
  assert.deepEqual(errs("App [ width = 10 ]\nstylesheet S [ ]"), [], "a stylesheet after the App compiles");
  assert.match(errs("class A extends B [ ]\nclass B extends A [ ]\nApp [ width = 10 ]").join("; "),
    /extend each other \(an inheritance cycle\).*break the loop/s);
  assert.equal(errs("class A extends B [ ]\nclass B extends A [ ]\nApp [ width = 10 ]").length, 1,
    "the cycle reports ONCE — no unknown-base echo for the partner");
  assert.throws(() => parseProgram("App [ width = 10 ]\nApp [ width = 5 ]"), /expected end of input/,
    "one root instance, still");
  // and the late class is a full citizen at runtime
  const app = build("App [ width = 10, height = 10, k: K [ ] ]\nclass K extends View [ f: number = 7 ]");
  assert.equal(app.k.f, 7, "a class declared below the App instantiates");
});

await test("check() validates class declarations, every error positioned", () => {
  const errs = (src) => check(parseProgram(src)).map((e) => e.message);
  assert.match(errs("class A extends Widget [ ]\nApp [ width=1 ]")[0], /unknown base 'Widget'.*line 1, col 17/s);
  assert.match(errs("class View extends View [ ]\nApp [ width=1 ]")[0], /already a component named 'View'/);
  assert.match(errs("class A extends View [ x: number = 1 ]\nApp [ width=1 ]")[0],
    /View already has an attribute 'x' — a declaration introduces a new one/);
  assert.match(errs("class A extends View [ k: Widget ]\nApp [ width=1 ]")[0],
    /unknown type 'Widget' — a declared attribute's type is one of number, string, boolean, Color, Length, Shape/);
  assert.match(errs("class A extends View [ k: string = 5 ]\nApp [ width=1 ]")[0],
    /A\.k's default expects a string, got the number 5/);
  assert.match(errs("class A extends View [ k: Length = 50% ]\nApp [ width=1 ]")[0],
    /percent default would resolve against each instance's parent/);
  // The styling rung's ruled R6 unlock: a declaration default MAY be a
  // binding (`labelColor: Color = { theme.buttonText }` — the live rank-1
  // fallback below every provision); its syntax still checks, positioned.
  assert.equal(errs("class A extends View [ k: number = { 1 } ]\nApp [ width=1 ]").length, 0,
    "a declaration default may be a { } binding (ruled)");
  assert.match(errs("class A extends View [ k: number = { 1 + } ]\nApp [ width=1 ]")[0],
    /A\.k's default = \{ … \} is not a valid expression/);
});

await test("check(): a class body checks as an instance of the class itself", () => {
  const errs = check(parseProgram(`class A extends View [ zap = 1, onClik() { } ]\nApp [ width=1 ]`));
  assert.equal(errs.length, 2);
  assert.match(errs[0].message, /A has no attribute 'zap'/);
  assert.match(errs[1].message, /A has no 'onClik' event — its handlers: onClick/);
});

await test("check() flags a class that contains itself, directly or transitively", () => {
  const direct = check(parseProgram("class A extends View [ A [ ] ]\nApp [ width=1 ]"));
  assert.match(direct[0].message, /class A contains itself/);
  const mutual = check(parseProgram("class A extends View [ B [ ] ]\nclass B extends View [ A [ ] ]\nApp [ width=1 ]"));
  assert.equal(mutual.filter((e) => /contains itself/.test(e.message)).length, 2);
});

await test("check(): declarations, methods, and named children share one member namespace", () => {
  const msgs = check(parseProgram("App [ width=1, n: number = 1, n() { }, k: View [ ], k: number = 2 ]"))
    .map((e) => e.message);
  assert.ok(msgs.some((m) => /App\.n: 'n' is already declared .* members share one namespace/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some((m) => /App\.k: 'k' is already a child/.test(m)));
});

await test("check(): scope nouns cannot be declared, named, or shadowed by parameters", () => {
  const msgs = check(parseProgram("App [ width=1, parent: number = 1, classroot: View [ ], m(classroot) { } ]"))
    .map((e) => e.message);
  assert.match(msgs[0], /'parent' is a scope noun .* cannot be declared/);
  assert.match(msgs[1], /'classroot' is a scope noun .* a child cannot take its name/);
  assert.match(msgs[2], /a parameter may not be named 'classroot'/);
});

await test("compile(): 'classroot' is valid only inside a class body — App / stylesheet / bundle reject it", () => {
  // classroot names the root of the component you are defining — meaningful only
  // inside a class body. Every other { } context rejects it (DECLARE4003).
  const inApp = compile(`App [ count: number = 0, Text [ text = { "" + classroot.count } ] ]`, {});
  assert.equal(inApp.source, null, "classroot in the App body must not compile");
  assert.match(inApp.errors[0].message, /'classroot' is the root of a component you define — valid only inside a class body.*in the App/);
  // a use-site classroot inside the App is equally rejected
  const useSite = compile(`class Chip extends View [ n: number = 0 ]\nApp [ v: number = 1, Chip [ n = { classroot.v } ] ]`, {});
  assert.equal(useSite.source, null, "classroot at an App use-site must not compile");
  // a stylesheet body is not a class definition either
  const inSheet = compile(`stylesheet Dark [ View: [ opacity = { classroot.foo } ] ]\nApp [ width = 10, height = 10, stylesheet = { this.lookupStylesheet("Dark") }, View [ ] ]`, {});
  assert.equal(inSheet.source, null, "classroot in a stylesheet must not compile");
  assert.match(inSheet.errors.find((e) => /classroot/.test(e.message)).message, /valid only inside a class body.*a stylesheet/);
  // nor a style bundle
  const inBundle = compile(`style B [ opacity = { classroot.y } ]\nApp [ width = 10, height = 10, View [ styles = [B] ] ]`, {});
  assert.equal(inBundle.source, null, "classroot in a style bundle must not compile");
  // inside a class body it is fine, at any depth
  const inClass = compile(`class Row extends View [ label: string = "", sel: boolean = false,\n  hdr: View [ onClick() { classroot.sel = true }, Text [ text = { classroot.label } ] ] ]\nApp [ Row [ label = "hi" ] ]`, {});
  assert.deepEqual(inClass.errors, [], "classroot in a class body compiles");
  // bare names and app. reach App attributes without classroot
  assert.deepEqual(compile(`App [ count: number = 0, Text [ text = { "" + count } ] ]`, {}).errors, []);
  assert.deepEqual(compile(`App [ count: number = 0, Text [ text = { "" + app.count } ] ]`, {}).errors, []);
  // and a bare App-name rewrite stays idempotent (no classroot leaks into App output)
  const out = compile(`App [ zip: number = 2, Text [ text = { "" + zip } ] ]`, {});
  assert.ok(out.source.includes("this.root.zip") && !out.source.includes("classroot"),
    "App bodies resolve to this.root, never classroot");
  assert.equal(compile(out.source, {}).source, out.source, "resolve twice = resolve once");
});

await test("compile(): bare-slot forms inside { } name their fix — colors and statements (field report A3/A4)", () => {
  // A3 — a `#`-hex color inside { }: the generic "Invalid character" becomes the 0x form.
  const hex = compile(`App [ Text [ text = "hi", textColor = { #334455 } ] ]`, {});
  assert.equal(hex.source, null);
  assert.match(hex.errors[0].message, /inside \{ \} a color is written 0x334455, not #334455/);
  // shorthand is expanded so the suggestion is exact
  assert.match(compile(`App [ Text [ textColor = { #f00 } ] ]`, {}).errors[0].message, /0xff0000/);
  // 8-hex (alpha) passes straight through
  assert.match(compile(`App [ Text [ textColor = { #33445566 } ] ]`, {}).errors[0].message, /0x33445566/);
  // A3c — a NAMED color inside { } resolves to a targeted diagnostic, not flat "unresolved"
  const named = compile(`App [ Text [ textColor = { navy } ] ]`, {});
  assert.equal(named.source, null);
  assert.match(named.errors[0].message, /'navy' is a named color .* write it as 0x000080/);
  assert.equal(named.diagnostics.find((d) => d.message.includes("named color")).code, "DECLARE4004");
  // a DECLARED attribute that happens to share a color's name still resolves normally
  assert.deepEqual(compile(`App [ teal: number = 1, Text [ text = { "" + teal } ] ]`, {}).errors, []);
  // A4 — statements where an attribute value must be one expression
  const stmts = compile(`App [ n: number = { let x = 1; x + 2 } ]`, {});
  assert.equal(stmts.source, null);
  assert.match(stmts.errors[0].message, /an attribute value is one expression, not statements; move the logic into a method/);
  // a valid single expression is untouched
  assert.deepEqual(compile(`App [ n: number = { 1 + 2 } ]`, {}).errors, []);
});

await test("check(): 'app' is a scope noun — not declarable, nameable, or a parameter", () => {
  const msgs = check(parseProgram("App [ width=1, app: number = 1, k: View [ ], m(app) { } ]"))
    .map((e) => e.message);
  assert.match(msgs[0], /'app' is a scope noun .* cannot be declared/);
  assert.match(msgs[1], /a parameter may not be named 'app'/);
});

await test("check(): a named child may not take an attribute's name", () => {
  const [err] = check(parse("View [ clip: View [ ] ]"));
  assert.match(err.message, /View\.clip is an attribute — a child may not take an attribute's name/);
});

// ── R6: instantiate — user components, classroot, named children ────────────

await test("a user component instantiates many times with per-instance state", () => {
  const app = build(`class Box extends View [ tone: number = 7, width = 100, height = { this.width / 2 } ]
App [ width=500, height=100, Box [ ], Box [ tone = 9, width = 200 ], Box [ height = 33 ] ]`);
  settle();
  const [b0, b1, b2] = app.children;
  assert.deepEqual([b0.tone, b0.width, b0.height], [7, 100, 50], "class-body defaults + constraint");
  assert.deepEqual([b1.tone, b1.width, b1.height], [9, 200, 100], "instance values; the class constraint re-ran");
  assert.equal(b2.height, 33, "an instance literal overrides the class-body constraint (nearest wins, no ownership fight)");
  b0.tone = 8;
  assert.deepEqual([b0.tone, b1.tone], [8, 9], "declared attributes are per-instance state");
  assert.equal(b0.constructor, b1.constructor, "instances share one synthesized class");
});

await test("declared attributes are fully reactive: constraints re-run, writes are equality-gated", () => {
  const app = build(`class Box extends View [ n: number = 2, width = { this.n * 10 } ]
App [ width=1, height=1, Box [ ] ]`);
  settle();
  const box = app.children[0];
  assert.equal(box.width, 20);
  box.n = 5;
  settle();
  assert.equal(box.width, 50, "a constraint reading a declared attribute re-runs on its write");
});

await test("classroot wires per member origin: body children point at the instance, the instance outward", () => {
  const app = build(`class W extends View [ inner: View [ deep: View [ ] ] ]
App [ width=1, height=1, w: W [ site: View [ ] ] ]`);
  const w = app.w;
  assert.equal(w.classroot, app, "the instance is written in App's body");
  assert.equal(w.inner.classroot, w, "a class-body child belongs to the class instance");
  assert.equal(w.inner.children[0].classroot, w, "…at any depth");
  assert.equal(w.site.classroot, app, "a use-site child is written in App's body");
  assert.equal(app.classroot, null, "nothing encloses the root");
});

await test("named children are members: real properties, on the parent, collision-guarded", () => {
  const app = build("App [ width=1, height=1, box: View [ cap: Text [ ] ] ]");
  assert.equal(app.box, app.children[0]);
  assert.equal(app.box.cap, app.box.children[0], "the name lives on the child's parent");
  assert.equal(app.cap, undefined);
  assert.throws(
    () => build("App [ width=1, height=1, surface: View [ ] ]"),
    /'surface' is already a member of the running App/
  );
});

await test("a declared attribute may not shadow a runtime built-in (instantiation-context fact)", () => {
  const src = "class Bad extends View [ surface: number = 1 ]\nApp [ width=1, height=1, Bad [ ] ]";
  assert.deepEqual(check(parseProgram(src)), [], "the checker is runtime-free by design");
  assert.throws(() => build(src), /Bad\.surface: 'surface' is a built-in member of the runtime View/);
});

await test("class methods and handlers: per-instance, extraction-safe, overridable at the use site", () => {
  const app = build(`class Box extends View [ n: number = 1, twice() { return this.n * 2 } ]
App [ width=1, height=1, Box [ n = 21 ], Box [ twice() { return -1 } ] ]`);
  const f = app.children[0].twice;
  assert.equal(f(), 42, "extraction-safe (the R5 rule holds for class members)");
  assert.equal(app.children[1].twice(), -1, "a use-site method overrides the class's");
});

await test("onInit fires on user classes; a direct instantiate of a self-containing class still dies soundly", () => {
  globalThis.__r6init = [];
  build(`class W extends View [ onInit() { globalThis.__r6init.push(this.constructor.name) }, View [ ] ]
App [ width=1, height=1, W [ ] ]`);
  assert.deepEqual(globalThis.__r6init, ["W"]);
  // instantiate(parseProgram(...)) without check: programSchemas throws its first error.
  assert.throws(
    () => instantiate(parseProgram("class A extends View [ A [ ] ]\nApp [ width=1 ]")),
    /class A contains itself/
  );
});

// ── R6: compile() — bare-name scope resolution ──────────────────────────────

const resolved = (src) => {
  const r = compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), [], "compile expected clean");
  return r.source;
};

await test("compile() rewrites bare names to explicit reads: this / classroot / parent chains", () => {
  const out = resolved(`class W extends View [
    count: number = 1,
    grow() { count = count + 1 },
    clock: View [ now: number = 2,
      Text [ text = { \`\${now}/\${count}\` } ] ] ]
App [ width=1, height=1, W [ ] ]`);
  assert.match(out, /grow\(\) \{ this\.count = this\.count \+ 1 \}/, "level 0 (the class root's own member) is this");
  assert.match(out, /\$\{parent\.now\}/, "an intermediate member-carrying ancestor is a parent chain");
  assert.match(out, /\$\{classroot\.count\}/, "the body root is classroot, depth-independent");
});

await test("compile(): the 'app' noun rewrites to this.root anywhere in the tree", () => {
  // hostWidth is a built-in App attribute and `editing` is one the root declares
  // — `app` reaches both from any depth without a parent chain or a classroot
  // that happens to be the App.
  const out = resolved(`App [ width=1, height=1, editing: boolean = false,
    deep: View [ mid: View [ leaf: View [
      width = { app.hostWidth / 2 },
      onClick() { app.editing = true } ] ] ] ]`);
  assert.match(out, /width = \{ this\.root\.hostWidth \/ 2 \}/, "app.X → this.root.X regardless of depth");
  assert.match(out, /this\.root\.editing = true/, "app in a handler resolves too");
  assert.doesNotMatch(out, /\bapp\./, "no bare 'app' survives the rewrite");
});

await test("compile(): the anonymous-App top level — bare names in app-level bodies, App.zip lexically", () => {
  const out = resolved(`App [ width=1, height=1, zip: number = 9,
    total() { return zip },
    box: View [ zip: number = 2, Text [ text = { "" + zip + "/" + App.zip } ] ] ]`);
  assert.match(out, /total\(\) \{ return this\.zip \}/, "on the App root itself, bare = this (App IS the anonymous class)");
  assert.match(out, /parent\.zip/, "the nearer declaration wins");
  assert.match(out, /this\.root\.zip/, "App.zip resolves lexically to the App (this.root, i.e. app) — the �11 qualified form; classroot is component-only");
});

await test("compile(): locals, parameters, and TS globals are never rewritten; shorthand stays an object literal", () => {
  const out = resolved(`App [ width=1, height=1, n: number = 3,
    m(n: number) { return n + Math.min(1, 2) },
    agg() { const k = [1].map(n => n * 2); return k[0] + n },
    obj() { return { n } } ]`);
  assert.match(out, /m\(n: number\) \{ return n \+ Math\.min\(1, 2\) \}/, "a parameter shadows the member; Math is a global");
  assert.match(out, /return k\[0\] \+ this\.n/, "an arrow's parameter shadows only inside it");
  assert.match(out, /return \{ n: this\.n \}/, "shorthand rewrites to a full property");
});

await test("compile(): an unresolvable bare name is a positioned error naming the scope chain", () => {
  const r = compile(`App [ width=1, height=1, count: number = 0,\n  Text [ text = { "" + coutn } ] ]`);
  assert.equal(r.source, null);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /cannot resolve 'coutn' — not a member of Text → App, a parameter, or a global \(line 2, col 24\)/);
});

await test("compile(): shadowing a user-declared outer member warns, with the qualified spelling", () => {
  const r = compile(`class W extends View [ tone: number = 1,
    box: View [ tone: number = 2, Text [ text = { "" + tone } ] ] ]
App [ width=1, height=1, W [ ] ]`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].message,
    /bare 'tone' means box: View's here, shadowing W's 'tone' — write classroot\.tone to reach the outer one \(line 2, col \d+\)/);
  assert.match(r.source, /"" \+ parent\.tone/, "a warning never blocks — the nearer resolution stands");
});

await test("compile(): a sub-16px text field warns with the 16px rule and the fix named (DECLARE3005)", () => {
  const r = compile(`App [ width=400, height=300,\n  TextInput [ width=200, height=30, fontSize = 12 ] ]`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].message, /a text field at 12px: iOS zooms the whole page toward any focused field smaller than 16px/);
  assert.match(r.warnings[0].message, /set fontSize = 16/, "the fix is named (AREPO-5)");
  const d = r.diagnostics.find((d) => d.code === "DECLARE3005");
  assert.equal(d?.severity, "warning", "a small field never blocks");
  assert.ok(r.source !== null, "the program still compiles");
});

await test("compile(): the 16px warning follows the nearest written size — inherited literals count, { } sizes stay silent", () => {
  const inherited = compile(`App [ width=400, height=300, fontSize = 12,\n  TextInput [ width=200, height=30 ] ]`);
  assert.equal(inherited.warnings.length, 1, "a field inheriting a written 12px warns");
  const computed = compile(`App [ width=400, height=300,\n  TextInput [ width=200, height=30, fontSize = { app.width > 500 ? 12 : 16 } ] ]`);
  assert.deepEqual(computed.warnings, [], "a computed size is unknowable — no guess, no warning");
  const fine = compile(`App [ width=400, height=300, fontSize = 12,\n  TextInput [ width=200, height=30, fontSize = 16 ] ]`);
  assert.deepEqual(fine.warnings, [], "the field's own 16 overrides the inherited 12");
});

await test("compile(): full gesture control (raw touch on the App) exempts the 16px warning — the runtime locks the zoom instead", () => {
  const r = compile(`App [ width=400, height=300, onTouchStart(e: TouchEvent) { },\n  TextInput [ width=200, height=30, fontSize = 12 ] ]`);
  assert.deepEqual([r.errors, r.warnings], [[], []]);
});

// `scrollsX` was removed with the rename tables: a suggestion keys on the priors
// a newcomer ARRIVES with — CSS and React instincts — never on our own rolling
// deprecations, which serve a population that does not exist and leak history
// into a surface that should read as one current design. What remains is not
// deprecation: an inner-cap miss is an ordinary typo, and `scrolls = true` is a
// wrong VALUE for a live enum.
await test("compile(): a miss names its exact rewrite (the camelCase ruling + the scrolls axis enum)", () => {
  const cases = [
    [`App [ width=100, height=100, View [ ignorelayout = true ] ]`, /ignoreLayout/],
    [`App [ width=100, height=100, View [ ignoreclip = true ] ]`, /ignoreClip/],
    [`App [ width=100, height=100, View [ focustrap = true ] ]`, /focusTrap/],
    [`App [ width=100, height=100, View [ scrolls = true ] ]`, /scrolls = y/],
    [`App [ width=100, height=100, View [ scrolls = false ] ]`, /scrolls = none/],
  ];
  for (const [src, rx] of cases) {
    const r = compile(src);
    assert.ok(r.errors.length >= 1, `should refuse: ${src}`);
    assert.match(r.errors[0].message, rx, `the rewrite is named for: ${src}`);
  }
  const ok = compile(`App [ width=100, height=100, View [ scrolls = both, width=50, height=50 ] ]`);
  assert.deepEqual(ok.errors, [], "the axis tokens themselves are legal");
});

await test("compile(): an App is clipped by definition — clip = false is refused with the rule named", () => {
  const r = compile(`App [ width=100, height=100, clip = false ]`);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /clipped by definition/);
  const ok = compile(`App [ width=100, height=100, clip = true ]`); // legal, redundant
  assert.deepEqual(ok.errors, []);
});

await test("compile(): bare built-ins resolve to this (never a silent outer hop); no shadow noise", () => {
  const r = compile(`class Screen extends View [ shown: boolean = false,
    opacity = { shown ? 1 : 0 },
    visible = { opacity > 0 } ]
App [ width=1, height=1, Screen [ ] ]`);
  assert.deepEqual([r.errors, r.warnings], [[], []], "built-in-over-built-in shadowing must not warn");
  assert.match(r.source, /opacity = \{ this\.shown \? 1 : 0 \}/);
  assert.match(r.source, /visible = \{ this\.opacity > 0 \}/, "the Appendix-A Screen idiom");
});

await test("compile() phases diagnostics: check errors first (with null source), resolution after", () => {
  const bad = compile("App [ width=1, zap=1, Text [ text = { mystery } ] ]");
  assert.equal(bad.source, null);
  assert.deepEqual(bad.errors.map((e) => /zap/.test(e.message)), [true], "resolution waits for a check-clean tree");
  const syntax = compile("App [ width=1, x= ]");
  assert.equal(syntax.errors.length, 1);
  assert.match(syntax.errors[0].message, /expected a value/);
});

await test("compile() output is a fixpoint: resolving resolved source changes nothing", () => {
  const src = `class W extends View [ count: number = 0,
    hit: View [ onClick() { count = count + 1 } ],
    cap: Text [ text = { "n" + count } ] ]
App [ width=1, height=1, W [ ] ]`;
  const once = resolved(src);
  assert.equal(resolved(once), once, "explicit paths resolve to themselves");
});

await test("the resolved counter idiom runs: a class handler mutates classroot state", () => {
  const app = build(resolved(`class Tally extends View [ count: number = 0,
    hit: View [ onClick() { count = count + 1 } ],
    cap: Text [ text = { "n" + count } ] ]
App [ width=1, height=1, a: Tally [ ], b: Tally [ count = 5 ] ]`));
  settle();
  app.a.hit.onClick({ x: 1, y: 1 });
  app.a.hit.onClick({ x: 1, y: 1 });
  app.b.hit.onClick({ x: 1, y: 1 });
  settle();
  assert.deepEqual([app.a.count, app.b.count], [2, 6], "each handler reached its own classroot");
  assert.deepEqual([app.a.cap.text, app.b.cap.text], ["n2", "n6"], "and the bound Text followed");
});

// ── auto-include: a bare component tag pulls its library (composition.md §1a) ─

await test("compile(): a bare component tag auto-includes its library — no include, no inline class", () => {
  const r = compile(`App [ width = 360, height = 80, Bar [ x = 20, y = 20, width = 300, value = 62 ] ]`);
  assert.equal(r.errors.length, 0, "Bar resolves from the bundled library (library/autoincludes.json)");
  assert.ok(r.source, "compiled to a self-contained source");
  assert.match(r.source, /class Bar extends View/, "the library's source is spliced into the merged program");
  assert.doesNotThrow(() => { const app = build(r.source); settle(); void app; }, "the merged source is hostless and instantiates");
});

await test("compile(): a tag absent from the manifest stays a genuine unknown-component error", () => {
  const r = compile(`App [ width = 8, height = 8, Nonesuch [ ] ]`);
  assert.equal(r.source, null, "auto-include leaves real unknowns to the checker");
  assert.match(r.errors.map((e) => e.message).join(" "), /Nonesuch/);
});

await test("compile(): a program with no magic tags splices nothing (auto-include is a no-op)", () => {
  const out = compile(`App [ width = 8, height = 8, Text [ text = "hi" ] ]`).source;
  assert.ok(out);
  assert.doesNotMatch(out, /class Bar/, "nothing is auto-included when nothing references a magic tag");
});

await test("compileTracked(): the closure captures the auto-included library + manifest; isUpToDate detects change", () => {
  const r = compileTracked(`App [ width = 40, height = 40, Bar [ width = 30, value = 50 ] ]`, { props: { render: "dom" } });
  assert.ok(r.source, "compiled");
  const ids = r.closure.entries.map((e) => e.id);
  assert.ok(ids.some((i) => i.endsWith("/library/bar.declare")), "the auto-included Bar library is a tracked dependency");
  assert.ok(ids.some((i) => i.endsWith("/library/autoincludes.json")), "the manifest is a tracked dependency");
  assert.equal(isUpToDate(r.closure, { render: "dom" }, diskProbe), true, "unchanged → fresh");
  assert.equal(isUpToDate(r.closure, { render: "canvas" }, diskProbe), false, "a compiler-prop change → stale");
  const bumped = (e) => ({ ...diskProbe(e), mtime: (diskProbe(e).mtime || 0) + 1 });
  assert.equal(isUpToDate(r.closure, { render: "dom" }, bumped), false, "a dependency change → stale");
});

// ── R7: layout — the attribute, the stacking strategy, ownership, precision ─

// The whole R7 surface is Node-testable: strategies are model machinery
// (constraints over children geometry), no browser measurement involved.


// ── Layout strategies live in the LIBRARY now (library/simplelayout.declare,
// wrappinglayout.declare, responsive.declare, spacer.declare) — these tests
// compile through the Node host (auto-include pulls the library classes in),
// then boot the self-contained output on the runtime, exactly as every real
// caller does. checkL surfaces the same post-merge check errors.
const checkL = (src) => compile(src, {}).errors;
const buildL = (src) => {
  const r = compile(src, {});
  if (r.errors.length > 0) throw new DeclareErrors(r.errors);
  return build(r.source, { deps: r.deps, links: r.links });
};

await test("the layout member checks: axis is an enum, spacing a number, null legal", () => {
  assert.deepEqual(checkL((
    "App [ width=1, height=1, layout: SimpleLayout [ axis = x, spacing = -10 ] ]")), []);
  assert.deepEqual(checkL(("App [ width=1, height=1, layout = null ]")), []);
  const errs = checkL((
    "App [ width=1, height=1, layout: SimpleLayout [ axis = up, spacing = \"wide\" ] ]"));
  assert.equal(errs.length, 2);
  assert.match(errs[0].message, /SimpleLayout\.axis expects an Axis \(one of x \| y\), got 'up'/);
  assert.match(errs[1].message, /SimpleLayout\.spacing expects a number/);
  assert.ok(errs[0].pos, "layout-attr errors are positioned");
});

await test("a layout is an attribute, not a child — every misplacement is a pointed error", () => {
  // Anonymous child, mis-named child, the root, a non-Layout value, a literal.
  const cases = [
    ["App [ width=1, height=1, SimpleLayout [ axis = y ] ]",
      /'SimpleLayout' is a layout — a layout is an attribute, not a child: write 'layout: SimpleLayout \[ … \]'/],
    ["App [ width=1, height=1, lay: SimpleLayout [ ] ]",
      /'SimpleLayout' is a layout — a layout is an attribute, not a child/],
    ["App [ width=1, height=1, layout: View [ ] ]",
      /App\.layout expects a Layout — 'View' is not one/],
    ["App [ width=1, height=1, layout = 5 ]",
      /App\.layout expects a Layout component \(a member like 'layout: SimpleLayout \[ … \]'\), or null for none, got the number 5/],
    ["App [ width=1, height=1, layout = { pick() } ]",
      /App\.layout = \{ … \}: a component slot takes a member .* constraining it is not yet surface/],
  ];
  for (const [src, re] of cases) {
    const errs = checkL((src));
    assert.ok(errs.length >= 1, src);
    assert.match(errs[0].message, re, src);
  }
  // The root itself cannot be a layout.
  assert.match(checkL("SimpleLayout [ ]")[0].message, /a layout is an attribute, not a child/);
});

await test("a layout element takes no decls, methods, or children; { } constraints ARE legal", () => {
  const errs = checkL((`App [ width=1, height=1,
    layout: SimpleLayout [ gap: number = 2, poke() { 1 }, View [ ], spacing = { g } ] ]`));
  assert.equal(errs.length, 3);
  assert.match(errs[0].message, /SimpleLayout\.gap: a layout declares no new attributes/);
  assert.match(errs[1].message, /SimpleLayout\.poke: a layout has no methods/);
  assert.match(errs[2].message, /a layout has no children — it arranges its view's/);
  // A layout attribute is reactive like any other: `{ }` binds a constraint
  // (the responsive stacking idiom), `:path` alone is refused.
  const ok = checkL((`App [ width=1, height=1,
    layout: SimpleLayout [ axis = { parent.width < 500 ? "y" : "x" }, spacing = { parent.width < 500 ? 6 : 12 } ] ]`));
  assert.deepEqual(ok, [], "axis/spacing take { } constraints");
  const path = checkL((`App [ width=1, height=1,
    layout: SimpleLayout [ spacing = :gap ] ]`));
  assert.equal(path.length, 1);
  assert.match(path[0].message, /a layout attribute takes a literal or \{ \}/);
});

await test("a class may extend a layout strategy — custom layouts (class X extends TweenLayout)", () => {
  const ok = check(parseProgram(
    "class Grid extends TweenLayout [\n" +
    "    place() { return this.view.children.map(c => ({ x: 0, y: 0, w: 10, h: 10, vis: true })) },\n" +
    "]\nApp [ width=1, height=1, layout: Grid [ ] ]"));
  assert.deepEqual(ok, [], "a custom TweenLayout subclass checks clean");
  // The other non-visual families are still not subclassable surface.
  const bad = check(parseProgram("class D extends Dataset [ ]\nApp [ width=1, height=1 ]"));
  assert.equal(bad.length, 1);
  assert.match(bad[0].message, /subclassing 'Dataset' is not wired yet/);
});

await test("SimpleLayout stacks visible children in child order — the sanctioned semantic order", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y, spacing = 4 ],
    View [ width=10, height=10 ],
    View [ width=10, height=20 ],
    View [ width=10, height=30 ] ]`);
  assert.deepEqual(app.children.map((c) => c.y), [0, 14, 38], "cursor = prev y + prev height + spacing");
  assert.deepEqual(app.children.map((c) => c.x), [0, 0, 0], "the cross axis is untouched");
  assert.equal(app.layout.constructor.name, "SimpleLayout", "the strategy IS the attribute's value");
  assert.ok(app.layout instanceof Layout);
  assert.equal(app.children.length, 3, "the layout member is not a child");
});

await test("axis = x stacks horizontally; negative spacing overlaps (the weather app's -10)", () => {
  const app = buildL(`App [ width=200, height=100,
    layout: SimpleLayout [ axis = x, spacing = -10 ],
    View [ width=50, height=10 ], View [ width=50, height=10 ] ]`);
  assert.deepEqual(app.children.map((c) => c.x), [0, 40]);
  assert.deepEqual(app.children.map((c) => c.y), [0, 0]);
});

await test("a child's size change re-flows exactly the children after it", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y ],
    View [ width=10, height=10 ], View [ width=10, height=20 ], View [ width=10, height=30 ] ]`);
  app.children[0].height = 15;
  settle();
  assert.deepEqual(app.children.map((c) => c.y), [0, 15, 35], "successors moved");
});

await test("re-layout: ONE pass per change, equality-gated fan-out; a no-op write wakes nothing", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y, spacing = 2 ],
    View [ width=10, height=10 ], View [ width=10, height=10 ],
    View [ width=10, height=10 ], View [ width=10, height=10 ] ]`);
  settle();
  // Count place() passes through the tracked `spacing` reads: the ONE
  // pass-constraint reads spacing once per visible child per run (4 here) —
  // so reads / 4 = passes. The kernel model: any relevant change re-runs the
  // pass once; the equality gate at each slot write keeps downstream wakes
  // (pushes, paints) to exactly the children that moved.
  const strategy = app.layout;
  const proto = Object.getPrototypeOf(strategy);
  const desc = Object.getOwnPropertyDescriptor(proto, "spacing");
  let reads = 0;
  Object.defineProperty(strategy, "spacing", {
    get() { reads++; return desc.get.call(this); },
    set(v) { desc.set.call(this, v); },
  });
  app.children[1].height = 25; // arrange pass + shape watcher; [2] and [3] move
  settle();
  assert.equal(reads, 8, "two place() runs — the arrange pass and the shape watcher");
  assert.deepEqual(app.children.map((c) => c.y), [0, 12, 39, 51]);
  reads = 0;
  app.children[0].height = 10; // unchanged value: equality-gated at the slot
  settle();
  assert.equal(reads, 0, "a no-op write wakes nothing — not even the pass");
});

await test("invisible children are skipped and their space reclaimed; re-showing restores it", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y ],
    View [ width=10, height=10 ], View [ width=10, height=20 ], View [ width=10, height=30 ] ]`);
  app.children[1].visible = false;
  settle();
  assert.equal(app.children[2].y, 10, "the hidden child's space is reclaimed");
  assert.equal(app.children[1].y, 10, "its own in-flow slot still computes (no special case)");
  app.children[1].visible = true;
  settle();
  assert.deepEqual(app.children.map((c) => c.y), [0, 10, 30]);
});

await test("spacing is live: a write re-flows the stack through the ordinary wake", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y ],
    View [ width=10, height=10 ], View [ width=10, height=10 ] ]`);
  app.layout.spacing = 8;
  settle();
  assert.equal(app.children[1].y, 18);
});

await test("axis is structural: changing it re-installs, releasing the old axis", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y ],
    View [ width=10, height=20 ], View [ width=30, height=20 ] ]`);
  app.layout.axis = "x";
  settle();
  assert.deepEqual(app.children.map((c) => c.x), [0, 10], "now stacked on x");
  app.children[1].y = 77; // y is no longer owned…
  assert.equal(app.children[1].y, 77);
  assert.throws(() => { app.children[1].x = 0; }, /View\.x is bound by a constraint \(App's SimpleLayout\[x\]\)/);
});

await test("the layout owns laid positions: a direct write errors naming it; a literal is overridden", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y ],
    View [ width=10, height=10 ], View [ width=10, height=10, y=99 ] ]`);
  // The Appendix-A-compatible rule: a laid-axis literal simply loses to the
  // arrangement (it was applied in pass one; the layout owns from pass two).
  assert.equal(app.children[1].y, 10, "the literal y=99 yielded to the arrangement");
  assert.throws(
    () => { app.children[1].y = 99; },
    (e) => {
      assert.ok(e instanceof DeclareError);
      assert.match(e.message, /View\.y is bound by a constraint \(App's SimpleLayout\[y\]\)/);
      return true;
    }
  );
  app.children[1].x = 5; // the cross axis stays the author's
  assert.equal(app.children[1].x, 5);
});

await test("a laid axis with its own author binding is a hard conflict — two owners, one slot", () => {
  for (const bound of ["y={ parent.height - 10 }", "y=50%"]) {
    assert.throws(
      () => buildL(`App [ width=100, height=200,
        layout: SimpleLayout [ axis = y ],
        View [ width=10, height=10, ${bound} ] ]`),
      /View\.y is already bound \(by App's SimpleLayout\[y\]\)/,
      bound
    );
  }
});

await test("the layout slot is swappable and cancellable at runtime (the doc's reactive slot)", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y ],
    View [ width=10, height=10 ], View [ width=10, height=10 ] ]`);
  // an imperative swap uses a runtime-side strategy (the library SimpleLayout
  // is a compiled class; the kernel seam is the same either way)
  class TestStack extends Layout {
    spacing = 0;
    place() { let y = 0; return this.laid().map((c) => { const b = { y }; if (c.visible) y += c.height + this.spacing; return b; }); }
  }
  const swap = new TestStack();
  swap.spacing = 5;
  app.layout = swap; // uninstall old, install new — one write
  settle();
  assert.equal(app.children[1].y, 15, "the new arrangement took over");
  app.layout = null;
  settle();
  assert.equal(app.children[1].y, 15, "positions keep their last values");
  app.children[1].y = 3; // …and the slots are the author's again
  assert.equal(app.children[1].y, 3);
});

await test("one strategy arranges one view", () => {
  const a = build("App [ width=1, height=1, View [ width=1, height=1 ] ]");
  class TestStack2 extends Layout {
    place() { return this.laid().map(() => ({ y: 0 })); }
  }
  const s = new TestStack2();
  a.layout = s;
  const b = build("App [ width=1, height=1 ]");
  assert.throws(() => { b.layout = s; }, /already arranges a App — one strategy per view/);
});

await test("a class-body layout expands per instance; the use site overrides or cancels it", () => {
  const src = (use) => `class Stack extends View [
      layout: SimpleLayout [ axis = y, spacing = 2 ],
      View [ width=10, height=10 ], View [ width=10, height=10 ] ]
    App [ width=100, height=100, s: Stack [ ${use} ] ]`;
  const plain = buildL(src(""));
  assert.equal(plain.s.children[1].y, 12, "the class body's arrangement runs on the instance");
  const overridden = buildL(src("layout: SimpleLayout [ axis = y, spacing = 9 ]"));
  assert.equal(overridden.s.children[1].y, 19, "nearest provider wins — the use site's layout");
  const cancelled = buildL(src("layout = null"));
  assert.equal(cancelled.s.children[1].y, 0, "layout = null turns the inherited arrangement off");
  assert.equal(cancelled.s.layout, null);
});

await test("two instances of one class stack independently", () => {
  const app = buildL(`class Stack extends View [
      layout: SimpleLayout [ axis = y ],
      View [ width=10, height=10 ], View [ width=10, height=10 ] ]
    App [ width=100, height=100, a: Stack [ ], b: Stack [ ] ]`);
  app.a.children[0].height = 25;
  settle();
  assert.equal(app.a.children[1].y, 25, "a re-flowed");
  assert.equal(app.b.children[1].y, 10, "b did not stir");
});

await test("the layout member's position among members is inert; CHILD order is semantic", () => {
  const first = buildL(`App [ width=100, height=100, layout: SimpleLayout [ axis = y ],
    View [ width=10, height=10 ], View [ width=10, height=20 ] ]`);
  const last = buildL(`App [ width=100, height=100,
    View [ width=10, height=10 ], View [ width=10, height=20 ],
    layout: SimpleLayout [ axis = y ] ]`);
  assert.deepEqual(first.children.map((c) => c.y), last.children.map((c) => c.y),
    "an attribute's position never matters — even this one's");
  const swapped = buildL(`App [ width=100, height=100, layout: SimpleLayout [ axis = y ],
    View [ width=10, height=20 ], View [ width=10, height=10 ] ]`);
  assert.deepEqual(swapped.children.map((c) => c.y), [0, 20],
    "reordering children reorders the stack — tree order is the meaning");
});

await test("onInit sees laid positions (arrangement is part of construction)", () => {
  globalThis.__laidY = null;
  buildL(`App [ width=100, height=100,
    onInit() { globalThis.__laidY = this.children[1].y },
    layout: SimpleLayout [ axis = y, spacing = 1 ],
    View [ width=10, height=10 ], View [ width=10, height=10 ] ]`);
  assert.equal(globalThis.__laidY, 11);
});

await test("a laid tree pushes positions across the seam like any other write", () => {
  const app = buildL(`App [ width=100, height=200,
    layout: SimpleLayout [ axis = y ],
    View [ width=10, height=10 ], View [ width=10, height=10 ] ]`);
  const log = [];
  app.attach(mockBackend(log), null);
  settle();
  log.length = 0;
  app.children[0].height = 30;
  settle();
  assert.ok(log.some(([m, v]) => m === "setHeight" && v === 30), "the size write itself");
  assert.ok(log.some(([m, v]) => m === "setY" && v === 30), "…and exactly the successor's move");
  assert.ok(!log.some(([m]) => m === "setX"), "nothing else stirred");
});

// ── R8: JSON data — `:path` grammar, the region store, cursors ─────────────

await test("parse(): the :path literal — single, dotted, and the many form", () => {
  const single = attrOf(`Text [ text = :title ]`);
  assert.deepEqual(
    { kind: single.value.kind, path: single.value.path, many: single.value.many },
    { kind: "path", path: "title", many: false }
  );
  const dotted = attrOf(`Text [ text = :item.condition.temp ]`);
  assert.equal(dotted.value.path, "item.condition.temp");
  const many = attrOf(`View [ datapath = :item.forecast[] ]`);
  assert.deepEqual({ path: many.value.path, many: many.value.many }, { path: "item.forecast", many: true });
  assert.throws(() => parse(`Text [ text = : ]`), /a field name after ':'/);
  assert.throws(() => parse(`Text [ text = :a. ]`), /a field name after '\.'/);
});

await test("parse(): `[]` binds to the path only when glued (like `%`)", () => {
  // Spaced, `[ ]` is not part of the value. The member ends at the literal, and
  // the next member must begin with a name — so the parser points at the stray
  // bracket. (Glued, `:rows[]` is one many-path literal; see below.)
  assert.throws(() => parse(`View [ datapath = :rows [ ] ]`), /expected a member name, got '\['/);
  assert.equal(parse(`View [ datapath = :rows[] ]`).attrs[0].value.many, true);
});

await test("parse(): the embedded Dataset body is captured raw", () => {
  const el = parse(`App [ events: Dataset { [ { "time": "9:00" } ] } ]`);
  const d = el.children[0];
  assert.deepEqual([d.tag, d.name], ["Dataset", "events"]);
  assert.equal(d.raw.src, ` [ { "time": "9:00" } ] `);
  assert.equal(typeof d.raw.pos.offset, "number");
});

await test("scanDatapaths: islands vs ternaries, keys, strings, templates", () => {
  const paths = (src) => scanDatapaths(src).map((p) => p.path + (p.many ? "[]" : ""));
  assert.deepEqual(paths(` :a + :b.c `), ["a", "b.c"]);
  assert.deepEqual(paths(` x ? y : z `), [], "a ternary colon is not a datapath");
  assert.deepEqual(paths(` x ? :hi : :lo `), ["hi", "lo"], "datapaths as ternary branches");
  assert.deepEqual(paths(` ({ time: "9:00" }) `), [], "object keys and string colons are not datapaths");
  assert.deepEqual(paths(" `zip ${ :zip }` "), ["zip"], "islands live inside template substitutions");
  assert.deepEqual(paths(` ":not.one" + ':nor' `), [], "string content is opaque");
  assert.deepEqual(paths(` f(:rows[]) `), ["rows[]"], "the many form scans");
  assert.deepEqual(paths(` return :x `), ["x"], "after a non-ending keyword, an expression is expected");
  assert.deepEqual(paths(` let t: number = 1 `), [], "a type annotation colon follows a name");
});

await test("rewriteDatapaths: islands become this.$data(…); many is refused", () => {
  const r = rewriteDatapaths(` "Hi " + :high `); // islands rewrite to the PLAN form (pre-parsed segments)
  assert.equal(r.src, ` "Hi " + this.$data(["high"]) `);
  const bad = rewriteDatapaths(` :rows[] `);
  assert.match(bad.error, /many-path replicates/);
});

await test("fillDatapaths: same length, no identifiers left behind", () => {
  const src = ` weatherIcon(:item.condition.code) + :t `;
  const filled = fillDatapaths(src);
  assert.equal(filled.length, src.length, "offsets must survive");
  assert.ok(!filled.includes(":"), "no island text remains");
  assert.equal(filled, ` weatherIcon(0` + " ".repeat(19) + `) + 0  `);
});

await test("check: a :path binds any value slot; a many-path only a datapath", () => {
  assert.deepEqual(check(parse(`Text [ text = :title, width = :w ]`)), []);
  const errs = check(parse(`Text [ text = :rows[] ]`));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /many-path replicates/);
});

await test("check: datapath takes :path, { }, or null — and says so otherwise", () => {
  assert.deepEqual(check(parse(`View [ datapath = :item ]`)), []);
  assert.deepEqual(check(parse(`View [ datapath = { this.parent } ]`)), []);
  assert.deepEqual(check(parse(`View [ datapath = null ]`)), []);
  const errs = check(parse(`View [ datapath = 5 ]`));
  assert.match(errs[0].message, /a datapath \(':field\.path'/);
});

await test("check: replication legality — named children and body roots refuse", () => {
  const named = check(parse(`App [ row: View [ datapath = :rows[] ] ]`));
  assert.match(named[0].message, /replicated child cannot be named/);
  const root = check(parseProgram(`App [ datapath = :rows[] ]`));
  assert.match(root[0].message, /the program root cannot replicate/);
  const cls = check(parseProgram(`class Row extends View [ datapath = :rows[] ]\nApp [ Row [ ] ]`));
  assert.match(cls[0].message, /class Row's own body cannot replicate/);
});

await test("check: data nodes — named, attribute-only, JSON-validated", () => {
  const anon = check(parse(`App [ Dataset { [1] } ]`));
  assert.match(anon[0].message, /a Dataset needs a name/);
  const badJson = check(parse(`App [ d: Dataset { [1,] } ]`));
  assert.match(badJson[0].message, /not valid JSON/);
  const noBody = check(parse(`App [ d: Dataset [ ] ]`));
  assert.match(noBody[0].message, /a Dataset needs data/);
  const srcRaw = check(parse(`App [ s: DataSource { [1] } ]`));
  assert.match(srcRaw[0].message, /data arrives from its url/);
  const members = check(parse(`App [ s: DataSource [ url = "/d.json", n: number, go() { 1 }, View [ ] ] ]`));
  assert.deepEqual(
    members.map((e) => e.message.split(" (line")[0]),
    [
      "DataSource.n: a data node declares no new attributes",
      "DataSource.go: a data node has no method members — its lifecycle (fetch, clear, set, …) is built in",
      "a data node has no children — its structure is its data",
    ]
  );
  const unknown = check(parse(`App [ d: Dataset { [1] }, e: Dataset [ url = "x" ] ]`));
  assert.ok(unknown.some((e) => /Dataset has no attribute 'url'/.test(e.message)));
  const rawElsewhere = check(parse(`App [ v: View { [1] } ]`));
  assert.match(rawElsewhere[0].message, /only a Dataset carries a { } body/);
});

await test("check: a derived Dataset takes `contents = { }` INSTEAD of a body", () => {
  // valid: a derived dataset, no body
  assert.deepEqual(check(parse(`App [ d: Dataset [ contents = { this.parent.width } ] ]`)), []);
  // contents must be a { } — not a literal, not a :path
  const lit = check(parse(`App [ d: Dataset [ contents = 5 ] ]`));
  assert.match(lit[0].message, /contents is a derived value — write 'contents = \{/);
  const path = check(parse(`App [ d: Dataset [ contents = :items ] ]`));
  assert.match(path[0].message, /contents is a derived value/);
});

await test("check: `key = :field` is replication metadata, refused off a template", () => {
  // valid on a replicated child (has a many datapath)
  assert.deepEqual(
    check(parse(`App [ d: Dataset { {"rows":[]} }, list: View [ datapath = { classroot.d.value }, View [ datapath = :rows[], key = :id ] ] ]`)),
    []
  );
  // key that is not a single :path
  const many = check(parse(`App [ d: Dataset { {"rows":[]} }, list: View [ datapath = { classroot.d.value }, View [ datapath = :rows[], key = :id[] ] ] ]`));
  assert.match(many.find((e) => /key/.test(e.message)).message, /names each record's identity field/);
  // `key` on a NON-replicated element is refused BY NAME. It used to fall out
  // as an unknown attribute; since 2026-08-03 `key` is a real View attribute
  // (so it documents itself in the reference and a `{ }` body has a declared
  // type to check against), which means schema membership alone would have made
  // it silently legal here — hence the explicit refusal, naming where it goes.
  const plain = check(parse(`App [ v: View [ key = :id ] ]`));
  assert.ok(plain.some((e) => /replication metadata/.test(e.message)),
    `expected a replication-metadata refusal, got: ${plain.map((e) => e.message).join(" | ")}`);
});

await test("check: `virtualize` is replication metadata too — same gate as `key`", () => {
  // legal on a replicated child, as a literal and as a constraint
  assert.deepEqual(
    check(parse(`App [ d: Dataset { {"rows":[]} }, list: View [ datapath = { classroot.d.value }, View [ datapath = :rows[], virtualize = true ] ] ]`)),
    []
  );
  assert.deepEqual(
    check(parse(`App [ big: boolean = false, d: Dataset { {"rows":[]} }, list: View [ datapath = { classroot.d.value }, View [ datapath = :rows[], virtualize = { app.big } ] ] ]`)),
    []
  );
  // the retired enum spellings are refused by name
  const old = check(parse(`App [ d: Dataset { {"rows":[]} }, list: View [ datapath = { classroot.d.value }, View [ datapath = :rows[], virtualize = always ] ] ]`));
  assert.ok(old.some((e) => /virtualize = true \| false/.test(e.message)),
    `expected the boolean vocabulary named, got: ${old.map((e) => e.message).join(" | ")}`);
  // and off a template it is refused BY NAME, not silently accepted because it
  // is in View's schema
  const plain = check(parse(`App [ v: View [ virtualize = true ] ]`));
  assert.ok(plain.some((e) => /replication metadata/.test(e.message)),
    `expected a replication-metadata refusal, got: ${plain.map((e) => e.message).join(" | ")}`);
});

await test("run: a derived Dataset recomputes, keyed replication reuses instances", () => {
  const app = build(`App [ width = 10, height = 10,
    n: number = 1,
    src: Dataset { {"rows": [{"id":"a"},{"id":"b"}]} },
    grid: Dataset [ contents = { classroot.make() } ],
    list: View [ datapath = { classroot.grid.value },
      View [ datapath = :rows[], key = :id ] ],
    make() { const r = this.src.read(["rows"]) ?? []; return { rows: r.map((x) => ({ id: x.id, v: this.n })) }; },
  ]`);
  const rows = () => app.list.children.filter((c) => c.constructor.name === "View");
  assert.equal(rows().length, 2, "derived collection produced two instances");
  const before = rows();
  app.n = 2;
  assert.deepEqual(rows(), before, "keyed reconcile reused the SAME instances across a recompute");
  // a granular in-place edit to the source retriggers the derivation
  app.src.set(["rows", 0, "id"], "a2");
  assert.equal(rows().length, 2, "still two instances after a keyed edit");
});

await test("check: a data node may bind url with { } — and a class may not extend one", () => {
  assert.deepEqual(check(parse(`App [ s: DataSource [ url = { "/d/" + this.parent.width } ] ]`)), []);
  const errs = check(parseProgram(`class Feed extends DataSource [ ]\nApp [ ]`));
  assert.match(errs[0].message, /subclassing 'DataSource' is not wired yet/);
});

// A small data-backed tree, without the compile layer: scope nouns are written
// explicitly (classroot = the App for use-site members), exactly what
// compile() would emit.
const dataApp = (extra = "") => build(`App [ width=10, height=10,
  d: Dataset { {"a": {"x": 1, "y": 2}, "user": {"name": "Ada", "age": 36}, "rows": [1, 2]} },
  box: View [ datapath = { classroot.d.value }, width = 4, height = 4${extra} ],
  ]`);

await test("a :path value binding reads through the inherited cursor (and coerces)", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"user": {"name": "Ada", "age": 36}} },
    box: View [ datapath = { classroot.d.value },
      t: Text [ text = :user.name ],
      age: Text [ text = :user.age ],
      w: View [ width = :user.age ],
    ],
  ]`);
  assert.equal(app.box.t.text, "Ada");
  assert.equal(app.box.age.text, "36", "a number renders into a string slot");
  assert.equal(app.box.w.width, 36);
});

await test("an unresolved :path lands the slot's default (the doc's rule)", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"a": 1} },
    box: View [ datapath = { classroot.d.value },
      t: Text [ text = :missing.field ],
      v: View [ width = :nope ],
    ],
    lost: Text [ text = :anything ],
  ]`);
  assert.equal(app.box.t.text, "", "missing region → the default");
  assert.equal(app.box.v.width, 0);
  assert.equal(app.lost.text, "", "no cursor anywhere → null → the default");
});

await test("$data is the runtime form; islands in bodies read it", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"user": {"name": "Ada"}, "hi": 5} },
    box: View [ datapath = { classroot.d.value },
      t: Text [ text = { "Hi " + :user.name } ],
      v: View [ width = { :hi * 2 } ],
    ],
  ]`);
  assert.equal(app.box.t.text, "Hi Ada");
  assert.equal(app.box.v.width, 10);
  assert.equal(app.box.$data("user.name"), "Ada");
  assert.equal(app.box.$data("user.zip"), null, "unresolved yields null");
  assert.equal(app.$data("user.name"), null, "no cursor above the App");
});

await test("datapath = :rel.path extends the INHERITED cursor", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"a": {"deep": {"x": 7}}} },
    box: View [ datapath = { classroot.d.value },
      inner: View [ datapath = :a.deep,
        t: Text [ text = { "" + :x } ],
      ],
    ],
  ]`);
  assert.equal(app.box.inner.t.text, "7");
});

await test("wake precision: a one-field set wakes exactly that region's readers", () => {
  globalThis.__wx = 0; globalThis.__wy = 0; globalThis.__wa = 0;
  const app = dataApp(`,
      wx: View [ width = { (globalThis.__wx++, :a.x) } ],
      wy: View [ width = { (globalThis.__wy++, :a.y) } ],
      wa: View [ opacity = { globalThis.__wa++, (:a ? 1 : 1) } ]`);
  settle();
  const [x0, y0, a0] = [globalThis.__wx, globalThis.__wy, globalThis.__wa];
  app.d.set(["a", "x"], 5);
  settle();
  assert.equal(app.box.wx.width, 5);
  assert.equal(globalThis.__wx, x0 + 1, "the x reader re-ran");
  assert.equal(globalThis.__wy, y0, "the sibling-field reader did NOT");
  assert.equal(globalThis.__wa, a0 + 1, "the ancestor-object reader did (it can observe the deep change)");
  app.d.set(["a", "x"], 5); // equal write
  settle();
  assert.equal(globalThis.__wx, x0 + 1, "an equal write wakes nothing");
  app.d.set(["user", "name"], "Lin"); // a sibling region entirely
  settle();
  assert.equal(globalThis.__wx, x0 + 1);
  assert.equal(globalThis.__wy, y0);
});

await test("replacing a container wakes the readers inside the old region", () => {
  globalThis.__wx = 0;
  const app = dataApp(`,
      wx: View [ width = { (globalThis.__wx++, :a.x) } ]`);
  const before = globalThis.__wx;
  app.d.set(["a"], { x: 9, y: 9 });
  settle();
  assert.equal(app.box.wx.width, 9);
  assert.equal(globalThis.__wx, before + 1);
});

await test("replacing the whole value wakes every reader; a cursor gained later re-anchors", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"n": 1} },
    box: View [ t: Text [ text = { "" + (:n ?? "none") } ] ],
  ]`);
  assert.equal(app.box.t.text, "none", "no cursor yet");
  app.box.datapath = app.d.cursorAt([]);
  settle();
  assert.equal(app.box.t.text, "1", "an ancestor gaining a datapath re-anchors the reads below");
  app.d.value = { n: 42 };
  settle();
  assert.equal(app.box.t.text, "42", "whole-value replacement rides the value slot");
});

await test("mutation API errors are pointed; paths address strictly", () => {
  const d = new Dataset();
  d.value = { a: { b: 1 }, list: [1] };
  assert.throws(() => d.set("", 1), /assign \.value to replace it/);
  assert.throws(() => d.set(["a", "zip", "deep"], 1), /'\/a\/zip\/deep' addresses nothing — '\/a\/zip' is missing/);
  assert.throws(() => d.insert(["a"], 0, 1), /'\/a' is not an array/);
  d.set(["a", "c"], 3); // the FINAL field may be new
  assert.equal(d.read(["a", "c"]), 3);
});

await test("RFC 6901: the spec's own document reads through pointer strings (B2, data-paths.md §11)", () => {
  // RFC 6901 §5 — the example document and every pointer it defines, verbatim.
  const d = new Dataset();
  d.value = {
    "foo": ["bar", "baz"], "": 0, "a/b": 1, "c%d": 2, "e^f": 3,
    "g|h": 4, "i\\j": 5, "k\"l": 6, " ": 7, "m~n": 8,
  };
  assert.deepEqual(d.read("/foo"), ["bar", "baz"]);
  assert.equal(d.read("/foo/0"), "bar");
  assert.equal(d.read("/"), 0, "the pointer '/' addresses the empty key");
  assert.equal(d.read("/a~1b"), 1, "~1 unescapes to '/'");
  assert.equal(d.read("/c%d"), 2);
  assert.equal(d.read("/e^f"), 3);
  assert.equal(d.read("/g|h"), 4);
  assert.equal(d.read("/i\\j"), 5);
  assert.equal(d.read('/k"l'), 6);
  assert.equal(d.read("/ "), 7);
  assert.equal(d.read("/m~0n"), 8, "~0 unescapes to '~'");
  assert.equal(d.read("/m~01"), undefined, "'~01' is the key '~1', not '/' — unescape order per §4");
  assert.throws(() => d.read("/bad~2"), /escapes only as ~0 .* or ~1/);
  // Segments are the no-escaping twin: every key addressable verbatim.
  assert.equal(d.read(["a/b"]), 1);
  assert.equal(d.read(["m~n"]), 8);
  assert.equal(d.read([""]), 0);
});

await test("B2 writes: pointer + segments intake, /- append, dot-strings refused with the rewrite named", () => {
  const d = new Dataset();
  d.value = { rows: [{ n: 1 }], "a.b": { deep: true }, obj: {} };
  // The two living spellings write identically; numbers are segments.
  d.set("/rows/0/n", 2);
  assert.equal(d.read(["rows", 0, "n"]), 2);
  d.set(["rows", 0, "n"], 3);
  assert.equal(d.read("/rows/0/n"), 3);
  // `/-` appends against an array (RFC 6901's after-last, given meaning by 6902 add)…
  d.set("/rows/-", { n: 99 });
  assert.equal(d.read(["rows", 1, "n"]), 99, "append landed at the real index");
  d.set(["rows", "-"], { n: 100 });
  assert.equal(d.read(["rows", 2, "n"]), 100, "segments spell append too");
  // …and is just the key "-" against an object.
  d.set(["obj", "-"], 7);
  assert.equal(d.read(["obj", "-"]), 7);
  // The dotted-key hole is closed: segments address it verbatim, pointers by escape-freedom.
  d.set(["a.b", "deep"], false);
  assert.equal(d.read(["a.b", "deep"]), false);
  // The retired dot-string form refuses, naming both replacements.
  assert.throws(() => d.set("rows.0.n", 5), /paths are segments \(\["rows", "0", "n"\]\) or an RFC 6901 pointer \("\/rows\/0\/n"\); the dot-string form retired/);
  assert.throws(() => d.insert("rows", 0, {}), /the dot-string form retired/);
  assert.equal(d.read(["rows", 0, "n"]), 3, "the refused write wrote nothing");
});

await test("B2 reactivity: an append wakes order readers; a pointer write wakes the region (replication end to end)", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"rows": [ {"n": "a"}, {"n": "b"} ]} },
    list: View [ datapath = { parent.d.value },   // raw build(): no bare-name resolution
      View [ datapath = :rows[], t: Text [ text = :n ] ],
    ],
    go() { this.d.set("/rows/-", { n: "c" }) },
    fix() { this.d.set(["rows", 0, "n"], "A") },
  ]`);
  const texts = () => app.list.children.filter((c) => c.t).map((c) => c.t.text);
  assert.deepEqual(texts(), ["a", "b"]);
  app.go(); settle();
  assert.deepEqual(texts(), ["a", "b", "c"], "the append replicated one instance in the settle");
  app.fix(); settle();
  assert.deepEqual(texts(), ["A", "b", "c"], "the pointer write woke exactly its region");
});

await test("RFC 9535 semantics: the strict evaluator over the v1 subset (B3, jsonpath-spelling.md)", async () => {
  const { evaluatePlan } = await import("../runtime/dist/select.js");
  const vals = (value, plan) => evaluatePlan(value, plan).map((n) => n.value);
  const paths = (value, plan) => evaluatePlan(value, plan).map((n) => n.path.join("/"));
  const doc = { rows: [1, 2, 3, 4, 5], rec: { a: 1, b: 2 }, "my-key": 9 };
  // index — negative from the end, out-of-bounds selects nothing
  assert.deepEqual(vals(doc, ["rows", { i: 2 }]), [3]);
  assert.deepEqual(vals(doc, ["rows", { i: -1 }]), [5]);
  assert.deepEqual(vals(doc, ["rows", { i: 9 }]), []);
  assert.deepEqual(vals(doc, ["rec", { i: 0 }]), [], "an index selects from arrays only");
  // slice — RFC bounds: defaults, negatives, step, step 0, negative step
  assert.deepEqual(vals(doc, ["rows", { s: [1, 3, null] }]), [2, 3]);
  assert.deepEqual(vals(doc, ["rows", { s: [null, null, 2] }]), [1, 3, 5]);
  assert.deepEqual(vals(doc, ["rows", { s: [-2, null, null] }]), [4, 5]);
  assert.deepEqual(vals(doc, ["rows", { s: [null, null, 0] }]), [], "step 0 selects nothing (RFC)");
  assert.deepEqual(vals(doc, ["rows", { s: [null, null, -1] }]), [5, 4, 3, 2, 1], "negative step reverses");
  assert.deepEqual(vals(doc, ["rows", { s: [3, 0, -1] }]), [4, 3, 2]);
  // wildcard — array elements; object member values; nothing on scalars
  assert.deepEqual(vals(doc, ["rows", { w: 1 }]), [1, 2, 3, 4, 5]);
  assert.deepEqual(vals(doc, ["rec", { w: 1 }]), [1, 2]);
  assert.deepEqual(vals(doc, ["my-key", { w: 1 }]), []);
  // names select object members only (strict past the currency seam); quoted names are plain strings
  assert.deepEqual(vals(doc, ["my-key"]), [9]);
  assert.deepEqual(vals(doc, ["rows", "length"]), [], "a name selects nothing on an array (RFC)");
  // locations are REAL — the replication contract
  assert.deepEqual(paths(doc, ["rows", { s: [2, 4, null] }]), ["rows/2", "rows/3"]);
  assert.deepEqual(paths(doc, ["rec", { w: 1 }]), ["rec/a", "rec/b"]);
  // nested selection flattens in document order (RFC nodelist semantics)
  const deep = { g: [{ t: [1, 2] }, { t: [3] }] };
  assert.deepEqual(vals(deep, ["g", { w: 1 }, "t", { w: 1 }]), [1, 2, 3]);
});

await test("selector plans evaluate and TRACK end to end: $data slices/wildcards re-derive on edits (§9)", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"rows": [ {"n": 1}, {"n": 2}, {"n": 3}, {"n": 4} ]} },
    box: View [ datapath = { parent.d.value },
      mid: Text [ text = { (:rows[1:3]).map(r => r.n).join("+") } ],
      all: Text [ text = { (:rows[*].n).join(",") } ],
      last: Text [ text = { "" + (:rows[-1].n) } ],
    ],
    bump() { this.d.set(["rows", 1, "n"], 20) },
    grow() { this.d.set("/rows/-", { n: 5 }) },
    cut() { this.d.removeAt(["rows"], 0) },
  ]`);
  assert.equal(app.box.mid.text, "2+3");
  assert.equal(app.box.all.text, "1,2,3,4");
  assert.equal(app.box.last.text, "4");
  app.bump(); settle();
  assert.equal(app.box.mid.text, "20+3", "a member edit inside the slice re-derives");
  app.grow(); settle();
  assert.equal(app.box.all.text, "1,20,3,4,5", "an append re-derives the wildcard");
  assert.equal(app.box.last.text, "5", "a negative index follows the new end");
  app.cut(); settle();
  assert.equal(app.box.mid.text, "3+4", "membership shifts re-derive the slice");
});

await test("slice replication: datapath = :rows[2:5][] instances the selection at its TRUE indices", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"rows": [ {"n": "a"}, {"n": "b"}, {"n": "c"}, {"n": "d"}, {"n": "e"}, {"n": "f"} ]} },
    list: View [ datapath = { parent.d.value },
      View [ datapath = :rows[2:5][], t: Text [ text = :n ] ],
    ],
    fix() { this.d.set(["rows", 3, "n"], "D") },
    cut() { this.d.removeAt(["rows"], 0) },
  ]`);
  const texts = () => app.list.children.filter((c) => c.t).map((c) => c.t.text);
  assert.deepEqual(texts(), ["c", "d", "e"], "the window is rows 2..4");
  // The cursors point at the REAL places — the materialization contract (§3.1).
  const cursors = app.list.children.filter((c) => c.t).map((c) => c.datapath.path.join("/"));
  assert.deepEqual(cursors, ["rows/2", "rows/3", "rows/4"]);
  app.fix(); settle();
  assert.deepEqual(texts(), ["c", "D", "e"], "an in-window edit lands in the right instance");
  app.cut(); settle();
  assert.deepEqual(texts(), ["D", "e", "f"], "membership shift slides the window");
});

await test("compiled selector plans round-trip: emitted program instantiates and evaluates", () => {
  const src = `App [ width=10, height=10,
    d: Dataset { {"rows": [ {"n": 1}, {"n": 2}, {"n": 3} ]} },
    box: View [ datapath = { d.value },
      t: Text [ text = { (:rows[0:2].map(r => r.n)).join("|") } ],
    ],
  ]`;
  const compiled = compile(src);
  assert.deepEqual(compiled.errors, []);
  assert.ok(compiled.source.includes(`this.$data(["rows",{"s":[0,2,null]}])`), "the plan is emitted pre-parsed");
  const again = compile(compiled.source);
  assert.deepEqual(again.errors, []);
  assert.equal(again.source, compiled.source, "resolve twice = resolve once, selectors included");
  assert.ok(compiled.deps.some((d) => d.some((rp) => rp.startsWith(":rows["))), "the dep currency carries the selective read");
  const app = build(compiled.source);
  assert.equal(app.box.t.text, "1|2");
});

await test("toCursor: tagged values come back as places; foreign values refuse", () => {
  const d = new Dataset();
  d.value = { rss: { channel: { city: "SF" } } };
  const cur = toCursor(d.value.rss.channel, "test");
  assert.deepEqual([...cur.path], ["rss", "channel"]);
  assert.equal(toCursor(d.value.rss.channel, "test"), cur, "cursors intern");
  assert.equal(toCursor(null, "test"), null);
  assert.throws(() => toCursor(5, "test"), /a place in a dataset/);
  assert.throws(() => toCursor({ loose: true }, "test"), /belongs to no Dataset/);
});

await test("toCursor heals a place whose structure shifted underneath it", () => {
  const d = new Dataset();
  d.value = { list: [{ n: "a" }, { n: "b" }] };
  const b = d.value.list[1];
  toCursor(b, "test");
  d.move(["list"], 1, 0); // b is now at index 0; its tag says 1
  assert.deepEqual([...toCursor(b, "test").path], ["list", "0"]);
});

await test("DataSource lifecycle: loading → loaded, one arrival burst", async () => {
  const realFetch = globalThis.fetch;
  try {
    let release;
    globalThis.fetch = () =>
      new Promise((res) => { release = () => res({ ok: true, json: async () => ({ rows: [1, 2, 3] }) }); });
    const src = new DataSource();
    src.url = "/data/rows.json";
    globalThis.__st = 0;
    const app = build(`App [ width=10, height=10, t: Text [ ] ]`);
    // A constraint over the lifecycle: all four booleans derive from status.
    const { Constraint } = await import("../runtime/dist/reactive.js");
    const seen = [];
    const k = new Constraint("test", () => (globalThis.__st++, src.loading ? "loading" : src.loaded ? "loaded" : src.failed ? "failed" : "idle"), (v) => seen.push(v));
    k.run();
    assert.deepEqual(seen, ["idle"]);
    const done = src.fetch();
    settle();
    assert.deepEqual(seen, ["idle", "loading"]);
    release();
    await done;
    settle();
    assert.deepEqual(seen, ["idle", "loading", "loaded"]);
    assert.deepEqual(src.value, { rows: [1, 2, 3] });
    assert.equal(toCursor(src.value.rows, "test").data, src, "arrived data is tagged to its source");
    src.clear();
    settle();
    assert.equal(seen[seen.length - 1], "idle");
    assert.equal(src.value, null);
    void app;
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test('DataSource format = "text": the raw string lands in value (an .md fetched directly)', async () => {
  const realFetch = globalThis.fetch;
  try {
    const md = "# Title\n\n<!-- generated:x -->\nbody\n<!-- /generated:x -->\n";
    globalThis.fetch = async () => ({ ok: true, text: async () => md, json: async () => { throw new Error("json() must not be called for text"); } });
    const src = new DataSource();
    src.url = "article.md";
    src.format = "text";
    await src.fetch();
    assert.equal(src.status, "loaded");
    assert.equal(src.value, md, "the bytes, as one string — no parsing, no wrapping");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("DataSource A9: a non-GET method sends body (object→JSON, string verbatim); GET sends none", async () => {
  const realFetch = globalThis.fetch;
  try {
    let captured;
    globalThis.fetch = async (url, init) => { captured = { url, init }; return { ok: true, json: async () => ({ ok: 1 }) }; };
    // POST with an object body → JSON-encoded + a JSON Content-Type
    const post = new DataSource();
    post.url = "/api/intent"; post.method = "POST"; post.body = { q: "night", size: 3 };
    await post.fetch();
    assert.equal(captured.url, "/api/intent");
    assert.equal(captured.init.method, "POST");
    assert.equal(captured.init.body, JSON.stringify({ q: "night", size: 3 }));
    assert.equal(captured.init.headers["Content-Type"], "application/json");
    // a string body is sent verbatim — the caller owns the encoding, no header imposed
    const put = new DataSource();
    put.url = "/api/raw"; put.method = "PUT"; put.body = "already-encoded";
    await put.fetch();
    assert.equal(captured.init.method, "PUT");
    assert.equal(captured.init.body, "already-encoded");
    assert.equal(captured.init.headers, undefined);
    // the default GET sends no RequestInit — a bare url, unchanged
    const get = new DataSource();
    get.url = "/data.json";
    await get.fetch();
    assert.equal(captured.init, undefined, "GET passes no RequestInit");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("Image.loaded/.failed are readable surface, and read-only (ruled 2026-07-30)", () => {
  assert.deepEqual(
    compile(`App [ pic: Image [ source = "a.png" ],
      t: Text [ text = { pic.loaded ? "y" : pic.failed ? "x" : "n" } ] ]`, {}).errors,
    [], "constraints may read both lifecycle facts");
  for (const attr of [`loaded = true`, `failed = true`]) {
    const errs = compile(`App [ pic: Image [ source = "a.png", ${attr} ] ]`, {}).errors;
    assert.notEqual(errs.length, 0);
    assert.match(errs[0].message, /read-only/, attr);
  }
});

await test("DataSource A9: the compiler accepts method/body attributes", () => {
  assert.deepEqual(
    compile(`App [ s: DataSource [ url = "/x", method = "POST", body = { ({ a: 1 }) } ] ]`, {}).errors,
    [],
    "method and body are schema'd attributes");
});

await test("DataSource failure surfaces as .failed + .error; stale arrivals are discarded", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const src = new DataSource();
    src.url = "/gone.json";
    await src.fetch();
    assert.equal(src.status, "failed");
    assert.match(src.error, /HTTP 404 for \/gone\.json/);

    // A slow first fetch superseded by clear(): its arrival must not land.
    let releaseSlow;
    globalThis.fetch = () => new Promise((res) => { releaseSlow = () => res({ ok: true, json: async () => ({ stale: true }) }); });
    const p = src.fetch();
    src.clear();
    releaseSlow();
    await p;
    assert.equal(src.status, "idle", "the superseded arrival was discarded");
    assert.equal(src.value, null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("DataSource auto: fetches once per distinct address, never for a re-derive", async () => {
  const realFetch = globalThis.fetch;
  try {
    const hits = [];
    globalThis.fetch = async (url) => { hits.push(url); return { ok: true, json: async () => ({ from: url }) }; };
    const app = build(`App [ width=10, height=10,
      zip: string = "",
      s: DataSource [ url = { parent.zip != "" ? "/w/" + parent.zip : "" }, auto = true ],
      ]`);
    settle();
    assert.deepEqual(hits, [], "an empty url is not an address — nothing fetches");
    app.zip = "94110";
    settle();
    assert.deepEqual(hits, ["/w/94110"], "the address arriving fetches, without a handler");
    app.zip = "94110"; // same address re-derived
    settle();
    assert.deepEqual(hits, ["/w/94110"], "a re-derive to the SAME address never refetches");
    app.zip = "10014";
    settle();
    assert.deepEqual(hits, ["/w/94110", "/w/10014"], "a new address fetches exactly once");
    app.discard();
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("DataSource onLoad fires after value+status settle (the declared handler path)", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ msg: "hi" }) });
    const app = build(`App [ width=10, height=10,
      seen: string = "",
      s: DataSource [ url = "/d.json",
        onLoad() { parent.seen = \`\${this.status}:\${this.value.msg}\` },
        ],
      ]`);
    await app.s.fetch();
    settle();
    assert.equal(app.seen, "loaded:hi", "the handler observes the settled arrival, not a half-state");
    app.discard();
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── R8: replication — instances per record, in data order, full citizens ───

const listApp = () => build(`App [ width=100, height=100,
  d: Dataset { {"rows": [ {"n": "a", "w": 10}, {"n": "b", "w": 20}, {"n": "c", "w": 30} ]} },
  list: View [ width = 100, height = 90, datapath = { classroot.d.value },
    View [ datapath = :rows[], height = 5, width = { (globalThis.__runs++, :w) },
      onInit() { globalThis.__inits++; globalThis.__names.push("" + :n) },
    ],
    foot: View [ width = 1, height = 1 ],
  ],
]`);

const resetCounters = () => { globalThis.__runs = 0; globalThis.__inits = 0; globalThis.__names = []; };

await test("replication: one instance per record, in data order, before static siblings", () => {
  resetCounters();
  const app = listApp();
  const kids = app.list.children;
  assert.equal(kids.length, 4, "3 instances + the static foot");
  assert.deepEqual(kids.slice(0, 3).map((v) => v.width), [10, 20, 30]);
  assert.equal(kids[3], app.list.foot, "the block occupies the template's slot");
  assert.equal(globalThis.__inits, 3, "onInit fired once per instance");
  assert.deepEqual(globalThis.__names, ["a", "b", "c"], "instance bodies read their own record");
});

await test("replication: insert makes exactly one instance; existing ones are reused", () => {
  resetCounters();
  const app = listApp();
  const [i0, i1, i2] = app.list.children;
  app.d.insert(["rows"], 1, { n: "x", w: 15 });
  settle();
  const kids = app.list.children;
  assert.equal(kids.length, 5);
  assert.deepEqual(kids.slice(0, 4).map((v) => v.width), [10, 15, 20, 30]);
  assert.equal(kids[0], i0, "kept instances are the same objects");
  assert.equal(kids[2], i1);
  assert.equal(kids[3], i2);
  assert.equal(globalThis.__inits, 4, "exactly one new init");
  assert.equal(globalThis.__names[3], "x");
});

await test("replication: removal discards the instance and retires its machinery", () => {
  resetCounters();
  const app = listApp();
  const removed = app.list.children[1]; // "b"
  const record = app.d.value.rows[1];
  app.d.removeAt(["rows"], 1);
  settle();
  assert.equal(app.list.children.length, 3);
  assert.deepEqual(app.list.children.slice(0, 2).map((v) => v.width), [10, 30]);
  assert.equal(removed.parent, null);
  const runsAfter = globalThis.__runs;
  // The removed record's region can still be written (it is gone from the
  // tree, not the heap) — nothing may wake for the dead instance.
  record.w = 99; // a raw edit; and through the API on live data:
  app.d.set(["rows", 0, "w"], 11);
  settle();
  assert.equal(removed.width, 20, "the discarded instance's binding is dead");
  assert.equal(app.list.children[0].width, 11);
  assert.equal(globalThis.__runs, runsAfter + 1, "exactly the live reader re-ran");
});

await test("replication: a move reorders the SAME instances to data order", () => {
  resetCounters();
  const app = listApp();
  const [a, b, c] = app.list.children;
  app.d.move(["rows"], 0, 2); // a b c → b c a
  settle();
  const kids = app.list.children;
  assert.deepEqual(kids.slice(0, 3), [b, c, a], "instances moved, none rebuilt");
  assert.deepEqual(kids.slice(0, 3).map((v) => v.width), [20, 30, 10]);
  assert.equal(globalThis.__inits, 3, "no lifecycle re-fired");
});

await test("replication: a field write re-runs exactly that instance's binding", () => {
  resetCounters();
  const app = listApp();
  settle();
  const before = globalThis.__runs;
  app.d.set(["rows", 2, "w"], 33);
  settle();
  assert.equal(app.list.children[2].width, 33);
  assert.equal(globalThis.__runs, before + 1, "one region, one reader, one run");
});

await test("replication: an unresolved match is zero instances — until the region becomes an array", () => {
  const app = build(`App [ width=10, height=10,
    d: Dataset { {"other": 1} },
    list: View [ datapath = { classroot.d.value },
      View [ width = 1, height = 1, datapath = :rows[] ],
    ],
  ]`);
  assert.equal(app.list.children.length, 0);
  app.d.set(["rows"], [1, 2]);
  settle();
  assert.equal(app.list.children.length, 2, "the match re-resolved when the region appeared");
  app.d.value = null;
  settle();
  assert.equal(app.list.children.length, 0, "clearing the data clears the block");
});

await test("replication: a burst of edits reconciles once, to the final data", () => {
  resetCounters();
  const app = listApp();
  app.d.set(["rows", 0, "w"], 12);
  app.d.insert(["rows"], 3, { n: "z", w: 40 });
  app.d.removeAt(["rows"], 1);
  settle();
  assert.deepEqual(app.list.children.slice(0, 3).map((v) => v.width), [12, 30, 40]);
  assert.equal(globalThis.__inits, 4, "one new instance across the whole burst");
});

await test("replication + layout: the arrangement re-arms on tree mutation", () => {
  const app = buildL(`App [ width=100, height=100,
    d: Dataset { {"rows": [ {"h": 10}, {"h": 20}, {"h": 30} ]} },
    list: View [ width = 50, height = 90, datapath = { app.d.value },
      layout: SimpleLayout [ axis = y, spacing = 2 ],
      View [ width = 5, height = :h, datapath = :rows[] ],
      foot: View [ width = 5, height = 5 ],
    ],
  ]`);
  const ys = () => app.list.children.map((v) => v.y);
  assert.deepEqual(ys(), [0, 12, 34, 66], "initial stack includes the replicated block + foot");
  app.d.insert(["rows"], 1, { h: 4 });
  settle();
  assert.deepEqual(ys(), [0, 12, 18, 40, 72], "insertion re-arms the arrangement");
  app.d.removeAt(["rows"], 0);
  settle();
  assert.deepEqual(ys(), [0, 6, 28, 60], "removal reclaims the space");
  app.d.move(["rows"], 0, 2);
  settle();
  assert.deepEqual(app.list.children.map((v) => v.height), [20, 30, 4, 5], "order follows the data");
  assert.deepEqual(ys(), [0, 22, 54, 60], "…and the stack follows the order");
  app.d.set(["rows", 0, "h"], 8);
  settle();
  assert.deepEqual(ys(), [0, 10, 42, 48], "a field write re-flows through the ordinary wave");
});

await test("ignoreLayout: a marked child keeps its own position; the arrangement skips it", () => {
  const app = buildL(`App [ width=200, height=200,
    row: View [ width = 200, height = 40,
      layout: SimpleLayout [ axis = x, spacing = 4 ],
      View [ width = 30, height = 10 ],
      badge: View [ ignoreLayout = true, x = 150, y = 5, width = 12, height = 12 ],
      View [ width = 30, height = 10 ],
      ],
  ]`);
  settle();
  assert.equal(app.row.children[1].x, 150, "the opted-out child holds its authored x");
  assert.deepEqual([app.row.children[0].x, app.row.children[2].x], [0, 34], "the flow strings the others as if it were absent");
});

await test("replication: surfaces mirror the reconciled order (canvas, Node-safe)", () => {
  const app = build(`App [ width=100, height=100,
    d: Dataset { {"rows": [ {"w": 1}, {"w": 2}, {"w": 3} ]} },
    list: View [ width = 50, height = 90, datapath = { classroot.d.value },
      View [ height = 5, width = :w, datapath = :rows[] ],
      foot: View [ width = 9, height = 9 ],
    ],
  ]`);
  const backend = new CanvasBackend();
  app.attach(backend, null);
  const order = () => app.list.surface.children.map((s) => s.width);
  assert.deepEqual(order(), [1, 2, 3, 9]);
  app.d.move(["rows"], 2, 0);
  settle();
  assert.deepEqual(app.list.children.slice(0, 3).map((v) => v.width), [3, 1, 2]);
  assert.deepEqual(order(), [3, 1, 2, 9], "the surface tree reordered with the model");
  app.d.insert(["rows"], 1, { w: 7 });
  settle();
  assert.deepEqual(order(), [3, 7, 1, 2, 9], "a post-attach instance attached mid-list");
  app.d.removeAt(["rows"], 3);
  settle();
  assert.deepEqual(order(), [3, 7, 1, 9], "a removed instance's surface is gone");
});

await test("replication: two blocks under one parent keep their slots", () => {
  const app = build(`App [ width=100, height=100,
    d: Dataset { {"xs": [1, 2], "ys": [{"w": 5}]} },
    head: View [ width = 1, height = 1 ],
    list: View [ width = 50, height = 90, datapath = { classroot.d.value },
      lead: View [ width = 2, height = 2 ],
      View [ height = 1, width = :w, datapath = :ys[] ],
      View [ height = 2, width = { 40 + (:w ?? 0) }, datapath = :ys[] ],
      tail: View [ width = 3, height = 3 ],
    ],
  ]`);
  const widths = () => app.list.children.map((v) => v.width);
  assert.deepEqual(widths(), [2, 5, 45, 3]);
  app.d.insert(["ys"], 0, { w: 6 });
  settle();
  assert.deepEqual(widths(), [2, 6, 5, 46, 45, 3], "each block grew in ITS slot");
  app.d.removeAt(["ys"], 1);
  settle();
  assert.deepEqual(widths(), [2, 6, 46, 3]);
});

await test("replicated instances are full citizens: methods, classroot, user classes", () => {
  const src = `class Row extends View [
    tag: string = "?",
    hits: number = 0,
    height = 5,
    poke() { hits = hits + 1 },
    t: Text [ text = { tag + "/" + :n } ],
    ]
  App [ width=100, height=100,
    d: Dataset { {"rows": [ {"n": "a"}, {"n": "b"} ]} },
    list: View [ width = 50, height = 50, datapath = { app.d.value },
      Row [ tag = "row", datapath = :rows[] ],
    ],
  ]`;
  const compiled = compile(src);
  assert.deepEqual(compiled.errors, []);
  const app = build(compiled.source);
  const rows = app.list.children;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.t.text), ["row/a", "row/b"]);
  assert.equal(rows[0].classroot, app, "classroot is the use-site scope");
  rows[0].poke();
  rows[0].poke();
  rows[1].poke();
  assert.deepEqual(rows.map((r) => r.hits), [2, 1], "methods act on per-instance class state");
  app.d.set(["rows", 1, "n"], "B");
  settle();
  assert.equal(rows[1].t.text, "row/B");
});

await test("compile(): :paths lower to emitted plans (data-paths.md §5); resolution stays a fixpoint", () => {
  const src = `App [ width=10, height=10,
    d: Dataset { {"n": 4} },
    zip: number = 2,
    box: View [ datapath = { d.value },
      t: Text [ text = { zip + ":" + :n } ],
    ],
  ]`;
  const compiled = compile(src);
  assert.deepEqual(compiled.errors, []);
  assert.ok(compiled.source.includes("this.root.d.value"), "bare names in the App body resolve to this.root (app), never classroot");
  assert.ok(compiled.source.includes(`this.root.zip + ":" +`), "…even beside an island");
  assert.ok(compiled.source.includes(`this.$data(["n"])`), "the island lowers to its pre-parsed plan — the emitted program carries no ':' value mode");
  assert.ok(!/[+] :n \}/.test(compiled.source), "the raw island does not ship through");
  const again = compile(compiled.source);
  assert.deepEqual(again.errors, []);
  assert.equal(again.source, compiled.source, "resolve twice = resolve once");
  const app = build(compiled.source);
  assert.equal(app.box.t.text, "2:4");
  // The dep currency is unchanged: the region read still serializes as `:n`
  // (bind.ts keeps region reads on the tracking path by that spelling).
  assert.ok(compiled.deps.some((d) => d.includes(":n")), "deps keep the :path read currency");
});

// ── Auto-extent (the weather rung): unset sizes derive from children ────
//
// The R7-checkpoint ruling, landed: a never-set, unowned width/height derives
// from the children's extents (visible only; percent-bound slots excluded on
// their axis) as a yielding derive — installed at attach, like every
// intrinsic sizing.

const attachedExtent = (source) => {
  const app = buildL(source);
  app.attach(mockBackend([]), null);
  settle(); // the microtask wave that runs ahead of first paint
  return app;
};

await test("auto-extent: a never-sized view sizes to its children's extents", () => {
  const app = attachedExtent(`App [ width=240, height=160,
    box: View [ x=10, y=10,
      a: View [ x=8, y=8, width=60, height=20 ],
      b: View [ x=8, y=36, width=90, height=16 ] ] ]`);
  assert.equal(app.box.width, 98, "width = max(x + width)");
  assert.equal(app.box.height, 52, "height = max(y + height)");
});

await test("auto-extent: explicit sizes stay — including an explicit zero", () => {
  const app = attachedExtent(`App [ width=240, height=160,
    box: View [ width=0, height=30,
      a: View [ width=60, height=80 ] ] ]`);
  assert.equal(app.box.width, 0, "width=0 means zero, not 'measure me'");
  assert.equal(app.box.height, 30, "an author height is never overwritten");
});

await test("auto-extent: a bound size slot is the binding's, untouched", () => {
  const app = attachedExtent(`App [ width=240, height=160,
    box: View [ width={ parent.width - 40 },
      a: View [ width=10, height=12 ] ] ]`);
  assert.equal(app.box.width, 200, "the { } binding owns width");
  assert.equal(app.box.height, 12, "the free axis still derives");
});

await test("auto-extent: reacts to child geometry, and yields to a direct write", () => {
  const app = attachedExtent(`App [ width=240, height=160,
    box: View [ a: View [ x=5, width=20, height=10 ] ] ]`);
  assert.equal(app.box.width, 25);
  app.box.a.width = 50;
  settle();
  assert.equal(app.box.width, 55, "a child growing re-derives the parent");
  app.box.a.x = 10;
  settle();
  assert.equal(app.box.width, 60, "a child moving re-derives the parent");
  app.box.width = 7; // the derive yields — author takes the slot over
  app.box.a.width = 90;
  settle();
  assert.equal(app.box.width, 7, "a direct write displaces the derive for good");
  assert.equal(app.box.height, 10, "the other axis's derive is untouched");
});

await test("auto-extent: invisible children occupy no space", () => {
  const app = attachedExtent(`App [ width=240, height=160,
    box: View [
      a: View [ width=30, height=10 ],
      b: View [ y=20, width=80, height=10 ] ] ]`);
  assert.equal(app.box.width, 80);
  app.box.b.visible = false;
  settle();
  assert.equal(app.box.width, 30, "hiding reclaims the extent");
  assert.equal(app.box.height, 10);
  app.box.b.visible = true;
  settle();
  assert.equal(app.box.width, 80, "re-showing restores it");
});

await test("auto-extent: a percent-bound child is excluded on that axis only", () => {
  const app = attachedExtent(`App [ width=240, height=160,
    box: View [ x=10, y=10,
      a: View [ x=8, y=8, width=60, height=20 ],
      pc: View [ y=40, width=50%, height=12 ] ] ]`);
  assert.equal(app.box.width, 68, "the percent-width child does not feed width (cycle guard)");
  assert.equal(app.box.height, 52, "…but still feeds height — exclusion is per axis");
  assert.equal(app.box.pc.width, 34, "the percent resolves against the derived extent");
  app.box.a.width = 100;
  settle();
  assert.equal(app.box.width, 108, "the derive stays live");
  assert.equal(app.box.pc.width, 54, "…and the percent follows it, cycle-free");
});

await test("auto-extent: a laid stack drives its parent's height", () => {
  const app = attachedExtent(`App [ width=240, height=160,
    stack: View [
      layout: SimpleLayout [ axis=y, spacing=4 ],
      s1: View [ width=70, height=14 ],
      s2: View [ width=50, height=10 ] ] ]`);
  assert.equal(app.stack.height, 28, "layout positions + auto-extent compose");
  assert.equal(app.stack.width, 70);
  app.stack.s1.height = 30;
  settle();
  assert.equal(app.stack.height, 44, "a laid child growing re-flows AND re-sizes");
});

await test("ignoreClip: exempt from the parent's auto-extent (frame chrome never defines the bounds)", () => {
  const app = attachedExtent(`App [ width=300, height=300,
    card: View [ x = 10, y = 10, clip = true,
      halo: View [ ignoreClip = true, x = -6, y = -6, width = 112, height = 112 ],
      body: View [ width = 100, height = 80 ],
    ],
  ]`);
  // auto-extent counts body (100x80) only — the straddling halo would otherwise
  // run the divergent parent-grows-halo-grows feedback the rule exists to kill.
  // (The paint/hit exemption itself is exercised in-browser — the desktop's
  // resize halo rides it; a canvas Path2D walk is not Node-constructible here.)
  assert.equal(app.card.width, 100, "width from the clipped content only");
  assert.equal(app.card.height, 80, "height from the clipped content only");
});

await test("auto-extent: contentExtent folds intrinsic content into the max", () => {
  // The hook Image uses for its natural bitmap size (max(resource, subviews),
  // LZX's measureSize) — pinned via a hand subclass, browser-free.
  class Boxy extends View {
    contentExtent(size) {
      return size === "width" ? 100 : 0;
    }
  }
  const v = new Boxy();
  const child = new View();
  child.width = 30;
  child.height = 40;
  v.appendChild(child);
  v.attach(mockBackend([]), null);
  assert.equal(v.width, 100, "intrinsic content wins where wider");
  assert.equal(v.height, 40, "children win where taller");
});

await test("auto-extent: childrenMutated re-derives — and installs lazily", () => {
  const p = new View();
  p.attach(mockBackend([]), null);
  assert.equal(p.width, 0, "a childless view carries no derive (pay-per-use)");
  const kid = new View();
  kid.width = 42;
  kid.height = 6;
  p.insertChild(kid, 0);
  p.childrenMutated(); // the replicator's lifecycle call
  assert.equal(p.width, 42, "a slot can become derivable when children arrive");
  const kid2 = new View();
  kid2.x = 50;
  kid2.width = 30;
  kid2.height = 4;
  p.insertChild(kid2, 1);
  p.childrenMutated();
  assert.equal(p.width, 80, "each mutation burst re-derives once");
});

// ── contentWidth/contentHeight + the `readonly` modifier ───────────────────
// The auto-extent computation, surfaced as read-only reactive attributes so a
// constraint can CLAMP a size — and the general `readonly` modifier a user
// class declares with (contentWidth/Height are the framework's first users).

await test("contentHeight: read-only intrinsic, clampable via a constraint", () => {
  const app = attachedExtent(`
    class Panel extends View [
      height = { Math.min(classroot.contentHeight, 60) } ]
    App [ width=200, height=400,
      p: Panel [ width=100,
        a: View [ y=0,  width=10, height=30 ],
        b: View [ y=30, width=10, height=90 ] ] ]`);
  assert.equal(app.p.contentHeight, 120, "contentHeight is the raw child bounding-box extent");
  assert.equal(app.p.height, 60, "height clamps to the cap — grow-to-a-limit-then-stop");
  assert.equal(app.p.contentWidth, 10, "contentWidth is live, independent of the set width");
  app.p.b.height = 20;
  settle();
  assert.equal(app.p.contentHeight, 50, "contentHeight tracks child geometry");
  assert.equal(app.p.height, 50, "…and the clamp follows it once below the cap");
});

await test("readonly: setting a computed intrinsic is a compile error", () => {
  const errs = check(parse(`App [ v: View [ contentHeight = 40 ] ]`));
  assert.ok(errs.some((e) => /read-only/.test(e.message)), "contentHeight cannot be assigned");
});

await test("readonly: a user-declared computed attribute reads, and refuses writes", () => {
  const app = attachedExtent(`
    class Gauge extends View [ value: number = 30, max: number = 100,
      readonly percent: number = { classroot.value / classroot.max } ]
    App [ width=200, height=100, g: Gauge [ value = 40 ] ]`);
  assert.equal(app.g.percent, 0.4, "percent computes from its declaration");
  app.g.value = 80;
  settle();
  assert.equal(app.g.percent, 0.8, "…and re-computes when its inputs change");
  assert.throws(() => { app.g.percent = 0.5; }, /read-only/, "an imperative write throws");
});

await test("readonly: assigning a user readonly attribute is a compile error", () => {
  const errs = check(parseProgram(`
    class Gauge extends View [ value: number = 30, max: number = 100,
      readonly percent: number = { classroot.value / classroot.max } ]
    App [ g: Gauge [ percent = 0.5 ] ]`));
  assert.ok(errs.some((e) => /read-only/.test(e.message)), "setting percent is refused");
});

await test("Node.insertChild / removeChild keep links straight", () => {
  const p = new Node();
  const a = new Node();
  const b = new Node();
  const c = new Node();
  p.appendChild(a);
  p.appendChild(c);
  p.insertChild(b, 1);
  assert.deepEqual(p.children, [a, b, c]);
  p.removeChild(b);
  assert.deepEqual(p.children, [a, c]);
  assert.equal(b.parent, null);
});

// ── Styling rung: prevailing attributes ─────────────────────────────────────

await test("parse: the prevailing declaration modifier", () => {
  const el = parse("View [ prevailing labelWidth: number = 80, plain: number = 1 ]");
  assert.equal(el.decls[0].name, "labelWidth");
  assert.equal(el.decls[0].prevailing, true);
  assert.equal(el.decls[1].prevailing, false);
  // Contextual: a member actually named `prevailing` still parses.
  const el2 = parse("View [ prevailing = 5 ]");
  assert.equal(el2.attrs[0].name, "prevailing");
  // The modifier marks declarations only.
  assert.throws(() => parse("View [ prevailing bg: View [ ] ]"), /attribute declaration/);
});

await test("prevailing follow: an unset slot reads the nearest providing ancestor, live", () => {
  const app = build(`App [ fontSize = 9, fontFamily = "Tahoma",
    box: View [ fontFamily = "Helvetica",
      leaf: Text [ text = "t" ] ] ]`);
  const leaf = app.box.leaf;
  // Per-attribute independence: two providers, one view.
  assert.equal(leaf.fontSize, 9, "follows App");
  assert.equal(leaf.fontFamily, "Helvetica", "follows the nearer provider");
  assert.equal(leaf.fontWeight, "normal", "no provider anywhere → the declaration default");
  // Providing is live: the provider's write re-roots what descendants read.
  app.fontSize = 11;
  assert.equal(leaf.fontSize, 11);
  // A local set wins and displaces the follow.
  leaf.fontSize = 60;
  assert.equal(leaf.fontSize, 60);
  app.fontSize = 12;
  assert.equal(leaf.fontSize, 60, "a local set no longer follows");
});

await test("prevailing: provider-vs-following is visible only to isSet-style introspection", async () => {
  const { isSet } = await import("../runtime/dist/attributes.js");
  const app = build(`App [ fontSize = 9, mid: View [ leaf: Text [ text = "t" ] ] ]`);
  assert.equal(app.mid.fontSize, 9, "reading always yields the effective value");
  assert.equal(isSet(app, "fontSize"), true, "the provider set it");
  assert.equal(isSet(app.mid, "fontSize"), false, "the follower did not");
});

await test("prevailing: a mid-tree provide re-roots followers in one settle (tracked precisely)", () => {
  globalThis.__evals = 0;
  const counted = build(`App [ fontSize = 9,
    mid: View [
      leaf: View [ width = { (globalThis.__evals++, this.fontSize * 2) } ] ] ]`);
  assert.equal(counted.mid.leaf.width, 18, "the constraint read the followed value");
  const evalsAfterBuild = globalThis.__evals;
  // A mid-tree provision wakes exactly the reads below it.
  counted.mid.fontSize = 20;
  settle();
  assert.equal(counted.mid.leaf.width, 40, "re-rooted to the new provider");
  assert.equal(globalThis.__evals, evalsAfterBuild + 1, "exactly one re-evaluation");
  // A write ABOVE the new provider no longer wakes the re-rooted reader.
  counted.fontSize = 50;
  settle();
  assert.equal(globalThis.__evals, evalsAfterBuild + 1, "the outer provider is no longer tracked");
  assert.equal(counted.mid.leaf.width, 40);
  delete globalThis.__evals;
});

await test("prevailing: providing with a value equal to the stored default still re-roots", () => {
  // fontSize's declaration default is 16; App provides 9; mid then provides
  // 16 — equal to the DEFAULT, so the equality gate alone would go silent,
  // but the slot's MEANING changed (following → providing).
  const app = build(`App [ fontSize = 9,
    mid: View [ leaf: View [ width = { this.fontSize } ] ] ]`);
  assert.equal(app.mid.leaf.width, 9);
  app.mid.fontSize = 16;
  settle();
  assert.equal(app.mid.leaf.width, 16, "the transition wake re-ran the follower");
});

await test("prevailing: a { } binding on a prevailing slot owns AND provides", () => {
  const app = build(`App [ width = 100,
    mid: View [ fontSize = { parent.width / 10 },
      leaf: View [ height = { this.fontSize } ] ] ]`);
  assert.equal(app.mid.leaf.height, 10, "followers read through the bound provider");
  app.width = 200;
  settle();
  assert.equal(app.mid.leaf.height, 20, "the provider's binding is live for followers");
  assert.throws(() => { app.mid.fontSize = 5; }, /bound by a constraint/);
});

await test("prevailing: same-named attributes on unrelated classes do NOT unify (the ruled lean)", () => {
  const app = build(`
    class Pane extends View [ prevailing labelWidth: number = 80 ]
    class Row extends Pane [ w: View [ width = { classroot.labelWidth } ] ]
    class Alien extends View [ prevailing labelWidth: number = 30 ]
    App [
      form: Pane [ labelWidth = 100,
        row: Row [ ] ],
      alien: Alien [ labelWidth = 55,
        stray: Pane [
          row: Row [ ] ] ] ]`);
  // Shared base: Row's labelWidth IS Pane's slot — it follows the Pane above.
  assert.equal(app.form.row.labelWidth, 100, "travels through the shared base");
  assert.equal(app.form.row.w.width, 100);
  // No shared base: Alien's same-spelled slot is a DIFFERENT attribute; the
  // Pane inside it falls through to its own declaration default.
  assert.equal(app.alien.stray.labelWidth, 80, "an unrelated provider is transparent");
  assert.equal(app.alien.labelWidth, 55, "the Alien's own slot is its own");
});

await test("prevailing: theme is a token record — wholesale-swapped, followed like any slot", () => {
  const app = build(`App [ theme = { ({ accent: 0xFF3B30, radius: 6 }) },
    panel: View [
      chip: View [ width = { this.theme.radius * 2 } ] ] ]`);
  assert.equal(app.panel.chip.width, 12, "tokens read through the prevailing chain");
  // The default theme is the HOUSE record (docs/system-design/components-baseline.md
  // Contract 2, ruled 2026-07-13): `theme.role` always resolves — no provider
  // means the house look, so library components carry no fallback expressions.
  assert.equal(build("App [ ]").theme.control, 0xE7EBF1, "the default theme is the HOUSE record — a role always resolves");
  assert.equal(build("App [ ]").theme.depth, 1, "the treatment dial rides the theme like any token");
  assert.throws(() => build("App [ theme = null ]"), /a Theme \(a token record/);
});

await test("prevailing: an unresolved :path on a prevailing slot lands the FOLLOWED value (ruled)", () => {
  const app = build(`App [ fontSize = 9,
    d: Dataset { { "row": { "size": 24 } } },
    box: View [ datapath = { parent.d.value },
      leaf: Text [ fontSize = :row.missing, text = "t" ] ] ]`);
  assert.equal(app.box.leaf.fontSize, 9, "unresolved → the followed value, not the declaration default");
  // And live: the provider is tracked while unresolved.
  app.fontSize = 13;
  settle();
  assert.equal(app.box.leaf.fontSize, 13);
  // The moment the path resolves, the data wins and the chain is let go.
  app.d.set(["row", "missing"], 24);
  settle();
  assert.equal(app.box.leaf.fontSize, 24);
});

await test("Text renders through the effective style: the style derive follows providers", () => {
  const log = [];
  const app = build(`App [ fontSize = 9, textColor = #FFFFFF,
    t: Text [ text = "hi", width = 10, height = 10 ] ]`);
  app.attach(mockBackend(log), null);
  const styles = () => log.filter(([m]) => m === "setTextStyle").map(([, v]) => v);
  assert.equal(styles().at(-1).fontSize, 9, "the initial push carries the effective value");
  assert.equal(styles().at(-1).color, 0xffffff);
  app.fontSize = 14;
  settle();
  assert.equal(styles().at(-1).fontSize, 14, "a provider write re-styles the run");
  assert.equal(log.filter(([m]) => m === "setText").length, 1, "the hot path did not re-send");
});

// ── Styling rung: decoration values ─────────────────────────────────────────

await test("Color: the #RGBA / #RRGGBBAA and 0xRRGGBBAA alpha forms (one representation)", () => {
  const c = (src) => checkAttr(SCHEMAS.View, attrOf(`View [ textColor=${src} ]`));
  assert.equal(colorToCss(c("#00000044").value), "#00000044", "alpha rides the value");
  assert.equal(colorToCss(c("#000000FF").value), "#000000", "…FF normalizes to opaque");
  assert.equal(colorToCss(c("#123A").value), "#112233aa", "short form doubles digits");
  assert.equal(c("0x354D5B").value, 0x354d5b, "0x 6-digit stays opaque");
  // B: 0xRRGGBBAA is the 0x twin of #RRGGBBAA — the SAME encoded value (one
  // representation), and an 8-hex 0x now carries alpha rather than erroring.
  assert.equal(c("0x00000044").value, c("#00000044").value, "0xRRGGBBAA === #RRGGBBAA");
  assert.equal(c("0x00000044").value, colorWithAlpha(0x000000, 0x44));
  assert.equal(colorToCss(c("0x000000FF").value), "#000000", "0x…FF normalizes to opaque");
  const bad = checkAttr(SCHEMAS.View, attrOf("View [ textColor=#12345 ]"));
  assert.match(bad.error.message, /3, 4, 6, or 8 hex digits/);
  // The misuse is an 8-hex 0x in a NUMERIC slot — a real error naming the fix.
  const num = checkAttr(SCHEMAS.View, attrOf("View [ width=0x00000044 ]"));
  assert.match(num.error.message, /8-digit 0x is an alpha color/, "8-hex 0x is a color, not a number");
});

await test("decoration literals: gradient / stroke / shadow constructor forms", () => {
  const v = (src) => checkAttr(SCHEMAS.View, attrOf(`View [ ${src} ]`));
  assert.deepEqual(v("fill=gradient(#F8F8F8, #D8D8D8)").value, {
    angle: 180,
    stops: [{ offset: null, color: 0xf8f8f8 }, { offset: null, color: 0xd8d8d8 }],
  });
  assert.equal(v("fill=gradient(90, #000000, stop(0.3, #FFFFFF), #808080)").value.angle, 90);
  assert.deepEqual(v("fill=gradient(90, #000, stop(0.3, #FFF), #888)").value.stops[1], { offset: 0.3, color: 0xffffff });
  assert.equal(v("fill=navy").value, 0x000080, "a bare Color coerces into the fill slot");
  assert.equal(v("fill=null").value, null);
  assert.deepEqual(v("stroke=stroke(2, #1A1A1A)").value, { width: 2, color: 0x1a1a1a });
  assert.deepEqual(v("shadow=shadow(3, 3, 0, #00000054)").value, { dx: 3, dy: 3, blur: 0, color: colorWithAlpha(0x000000, 0x54) });
  assert.match(v("fill=gradient(#111111)").error.message, /at least two stops/);
  assert.match(v("stroke=stroke(2)").error.message, /a Stroke/);
  assert.match(v("shadow=shadow(1, 2, #000000)").error.message, /a Shadow/);
  assert.match(v("width=stroke(1, #000000)").error.message, /expects a Length/);
  const t = checkAttr(SCHEMAS.Text, attrOf("Text [ textShadow=shadow(1, 0, 0, #222222) ]"));
  assert.deepEqual(t.value, { dx: 1, dy: 0, blur: 0, color: 0x222222 });
});

await test("decoration values gate on structural equality (a re-produced equal record stops the cascade)", () => {
  globalThis.__evals = 0;
  const counted = build(`App [ width = 100,
    box: View [ shadow = { shadow(0, 1, 2, 0x222222 + (parent.width - parent.width)) },
      dep: View [ height = { (globalThis.__evals++, parent.shadow ? parent.shadow.blur : 0) } ] ] ]`);
  assert.equal(counted.box.dep.height, 2);
  const base = globalThis.__evals;
  counted.width = 200; // re-runs the shadow binding → a FRESH but equal record
  settle();
  assert.equal(globalThis.__evals, base, "the equal record never woke the dependent");
  delete globalThis.__evals;
});

await test("constructors are in scope inside { } bodies; bare `stroke` is still the slot", () => {
  const app = build(`App [ stroke = stroke(2, #101010),
    box: View [ width = { this.stroke ? this.stroke.width * 10 : 0 },
                fill = { gradient(0xFFFFFF, 0xF0F0F0) } ] ]`);
  assert.equal(app.box.width, 0, "this.stroke is the slot (unset on box)");
  assert.equal(app.box.fill.stops.length, 2, "gradient(…) constructs in TS position");
  assert.equal(app.box.fill.angle, 180);
});

await test("compile(): constructor names resolve as constructors in call position only", () => {
  const r = compile(`App [
    box: View [ fill = { gradient(0xFFFFFF, 0xF0F0F0) },
                width = { stroke ? stroke.width : 10 } ] ]`);
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  assert.match(r.source, /gradient\(0xFFFFFF/, "callee position: left for the runtime constructor");
  assert.match(r.source, /this\.stroke \? this\.stroke\.width : 10/, "bare stroke is the slot");
});

await test("gradient/stop are reserved member names (unreachable in call position otherwise)", () => {
  const errs = check(parseProgram(`class X extends View [ gradient: number = 1 ] App [ ]`));
  assert.match(errs[0].message, /value constructor/);
  const errs2 = check(parseProgram(`App [ stop() { } ]`));
  assert.match(errs2[0].message, /value constructor/);
});

await test("flush pushes decoration pay-per-use; pushers carry post-attach changes", () => {
  const log = [];
  const plain = build("App [ width=10, height=10, fill=#EAEAEA ]");
  plain.attach(mockBackend(log), null);
  assert.ok(log.some(([m, v]) => m === "setFill" && v === 0xeaeaea), "fill crossed the seam");
  assert.ok(!log.some(([m]) => m === "setCornerRadius" || m === "setStroke" || m === "setShadow"),
    "an undecorated box pushes nothing extra");
  plain.cornerRadius = 4;
  assert.deepEqual(log.at(-1), ["setCornerRadius", 4], "the pusher carries a late set");
  const log2 = [];
  const fancy = build("App [ width=10, height=10, cornerRadius=6, stroke=stroke(1, #E2E2E2), shadow=shadow(0,1,2,#00000044) ]");
  fancy.attach(mockBackend(log2), null);
  assert.ok(log2.some(([m, v]) => m === "setCornerRadius" && v === 6));
  assert.ok(log2.some(([m, v]) => m === "setStroke" && v.width === 1));
  assert.ok(log2.some(([m, v]) => m === "setShadow" && v.blur === 2));
});

// ── Styling: the external channel (stylesheets), bundles, binding defaults ──

await test("parse: stylesheet / style top-level declarations, entries, and the list literal", () => {
  const p = parseProgram(`stylesheet Dark [ theme: Theme [ a = 1 ], Button: [ fill = #333333 ] ]
style card [ cornerRadius = 6 ]
App [ styles = [card] ]`);
  assert.equal(p.stylesheets.length, 1);
  assert.equal(p.stylesheets[0].name, "Dark");
  const [theme, entry] = p.stylesheets[0].body.children;
  assert.equal(theme.name, "theme");
  assert.equal(entry.tag, "Button");
  assert.equal(entry.entry, true, "a class-keyed entry is marked");
  assert.equal(p.styles[0].name, "card");
  assert.deepEqual(p.root.attrs[0].value.items.map((i) => i.name), ["card"]);
});

await test("check: stylesheet entries validate against the named class — loud, positioned", () => {
  const errs = (src) => check(parseProgram(src)).map((e) => e.message);
  assert.match(errs(`stylesheet S [ Wat: [ fill = navy ] ] App [ ]`)[0],
    /stylesheet S: unknown component 'Wat' — an entry is keyed by a class name/);
  assert.match(errs(`stylesheet S [ Text: [ colr = navy ] ] App [ ]`)[0],
    /stylesheet S: Text has no attribute 'colr'/);
  assert.match(errs(`stylesheet S [ View: [ fill = "red" ] ] App [ ]`)[0],
    /View\.fill expects a Fill/);
  assert.match(errs(`stylesheet S [ View: [ layout = null ] ] App [ ]`)[0],
    /a component slot \(layout\) is structure/);
  assert.match(errs(`stylesheet S [ View: [ fill = navy ], View: [ fill = red ] ] App [ ]`)[0],
    /'View' has two entries/);
  assert.match(errs(`stylesheet S [ theme: Theme [ t = card(1) ] ] App [ ]`)[0],
    /theme\.t: a token is a number, string, boolean, color, or a value constructor/);
  assert.match(errs(`stylesheet S [ ] stylesheet S [ ] App [ ]`)[0],
    /already a component, stylesheet, style, or font named 'S'/);
  // An entry is a stylesheet member — nowhere else.
  assert.match(errs(`App [ Button: [ fill = navy ] ]`)[0],
    /'Button: \[ … \]' is a class-keyed entry — it belongs in a stylesheet/);
});

await test("check: the channel slots — unknown names, the static-list rule", () => {
  const errs = (src) => check(parseProgram(src)).map((e) => e.message);
  assert.match(errs(`App [ stylesheet = Dark ]`)[0],
    /no stylesheet named 'Dark' — this program declares no stylesheets/);
  assert.match(errs(`style card [ ] App [ styles = [cart] ]`)[0],
    /no style named 'cart' — declared styles: card/);
  assert.match(errs(`App [ styles = { hot ? [a] : [b] } ]`)[0],
    /the bundle list is static \(ruled v1\)/);
  // A bundle types against the class it lands on.
  assert.match(errs(`style card [ text = "x" ] App [ styles = [card] ]`)[0],
    /style card sets 'text', which App .* does not declare/);
  assert.deepEqual(errs(`style card [ text = "x" ] App [ t: Text [ styles = [card] ] ]`), [],
    "the same bundle is fine on a class that declares the attribute");
  // A bundle is a look, not a component.
  assert.match(errs(`style card [ inner: View [ ] ] App [ ]`)[0],
    /style card: a bundle has no children — attribute sets only/);
});

await test("font: a declaration resolves fontFamily — system to its family, web font to its name, a list to a chain", () => {
  const app = build(`font Body [ family = "Helvetica, Arial, sans-serif" ]
font Title [ Face [ src = "https://example.com/arimo-700.woff2", weight = bold ] ]
App [ fontFamily = Body, t: Text [ text = "hi", fontFamily = Title ] ]`);
  assert.equal(app.fontFamily, "Helvetica, Arial, sans-serif", "a system font (no faces) resolves to its family string");
  assert.equal(app.t.fontFamily, "Title", "a web font resolves to its declaration name (the registered family)");
  // A fallback list resolves to an ordered CSS chain: a name → its family, a string verbatim.
  assert.equal(build(`font UI [ family = "Helvetica Neue" ]
font Brand [ Face [ src = "b.woff2", weight = bold ] ]
App [ fontFamily = [Brand, UI, "sans-serif"] ]`).fontFamily, "Brand, Helvetica Neue, sans-serif");
  // The raw family string still works (the literal form, no declaration).
  assert.equal(build(`App [ fontFamily = "Tahoma, sans-serif" ]`).fontFamily, "Tahoma, sans-serif");
});

await test("font: web faces are collected for the runtime to load, with url()/local() sources", () => {
  const app = build(`font Title [
    Face [ src = "a.woff2", weight = regular ],
    Face [ src = "b.woff2", weight = bold ],
    Face [ src = "c.woff2", weight = bold, italic = true ],
  ]
App [ fontFamily = Title ]`);
  const faces = fontFacesOf(app);
  assert.deepEqual(
    faces.map((f) => `${f.family}/${f.weight}/${f.style}`).sort(),
    ["Title/400/normal", "Title/700/italic", "Title/700/normal"]);
  assert.equal(faces.find((f) => f.weight === "700" && f.style === "normal").src, `url("b.woff2")`, "a bare string is a url() source");
  // local() names an installed face; a list source is prefer-local-else-download.
  const brand = fontFacesOf(build(`font Brand [ Face [ src = [local("Work Sans Bold"), "ws.woff2"], weight = bold ] ] App [ fontFamily = Brand ]`));
  assert.equal(brand[0].src, `local("Work Sans Bold"), url("ws.woff2")`);
  // A system font (no faces) loads nothing.
  assert.deepEqual(fontFacesOf(build(`font Body [ family = "Helvetica" ] App [ fontFamily = Body ]`)), []);
});

await test("font: declarations are checked — unknown ref, non-Face child, bad weight, missing src, collisions", () => {
  const errs = (src) => check(parseProgram(src)).map((e) => e.message);
  assert.match(errs(`App [ fontFamily = Nope ]`)[0], /no font named 'Nope' — this program declares no fonts/);
  assert.match(errs(`font Body [ family = "Helvetica" ] App [ fontFamily = Ttl ]`)[0], /no font named 'Ttl' — declared fonts: Body/);
  assert.match(errs(`font F [ Face [ src = "x.woff2", weight = heavy ] ] App [ ]`)[0], /font F: a Face weight is a token/);
  assert.match(errs(`font F [ Face [ weight = bold ] ] App [ ]`)[0], /font F: a Face needs a src/);
  assert.match(errs(`font F [ family = "X", Weight [ src = "x.woff2" ] ] App [ ]`)[0], /font F: 'Weight' is not a Face/);
  assert.match(errs(`font F [ ] App [ ]`)[0], /font F: declare a family .* or at least one Face/);
  assert.match(errs(`font F [ Face [ src = 12 ] ] App [ ]`)[0], /a face source is a URL string/);
  assert.match(errs(`font S [ family = "a" ] style S [ ] App [ ]`)[0], /already a component, stylesheet, style, or font named 'S'/);
});

await test("font: a fallback list validates each name — an undeclared item is a positioned error", () => {
  const errs = check(parseProgram(`font Body [ family = "Helvetica" ]
App [ fontFamily = [Body, Ghost, "sans-serif"] ]`)).map((e) => e.message);
  assert.match(errs[0], /no font named 'Ghost' — declared fonts: Body/);
});

await test("letterSpacing: a prevailing text slot (px tracking), coerced as a number", () => {
  const app = build(`App [ letterSpacing = 2, t: Text [ text = "hi" ] ]`);
  assert.equal(app.letterSpacing, 2, "set on the container");
  assert.equal(app.t.letterSpacing, 2, "prevails to the Text leaf");
  assert.equal(build(`App [ t: Text [ text = "hi" ] ]`).t.letterSpacing, 0, "default 0 = natural advances");
  assert.match(check(parseProgram(`App [ letterSpacing = "wide" ]`)).map((e) => e.message)[0], /letterSpacing/);
});

await test("stylesheet: entries land per the ruled chain — default < entry < class-body set < bundle < instance", () => {
  const app = build(resolved(`class Chip extends View [ fill = #111111 ]
style ring [ stroke = stroke(2, #00FF00) ]
stylesheet S [
    Chip: [ fill = #999999, cornerRadius = 5, stroke = stroke(1, #FF0000) ],
    View: [ opacity = 0.5 ],
  ]
App [ stylesheet = S,
    a: Chip [ ],
    b: Chip [ cornerRadius = 8, styles = [ring] ],
    c: View [ ],
  ]`));
  assert.equal(app.a.fill, 0x111111, "a class-body set outranks the entry (the encapsulation ruling)");
  assert.equal(app.a.cornerRadius, 5, "an unpinned slot is the skin's to color");
  assert.deepEqual(app.a.stroke, { width: 1, color: 0xff0000 });
  assert.equal(app.b.cornerRadius, 8, "an instance literal outranks the entry");
  assert.deepEqual(app.b.stroke, { width: 2, color: 0x00ff00 }, "a bundle outranks the entry");
  assert.equal(app.c.opacity, 0.5, "a base-class entry (blunt but legal) reaches plain views");
  assert.equal(app.a.opacity, 0.5, "…and every subclass instance (field-wise chain-merge)");
});

await test("stylesheet: field-wise chain-merge — a subclass entry's fields win, the rest fall through", () => {
  const app = build(resolved(`class Big extends Text [ ]
stylesheet S [
    Text: [ fontSize = 11, textColor = #333333 ],
    Big:  [ fontSize = 20 ],
  ]
App [ stylesheet = S, t: Text [ text = "t" ], b: Big [ text = "b" ] ]`));
  assert.equal(app.t.fontSize, 11);
  assert.equal(app.b.fontSize, 20, "the nearer class's field wins");
  assert.equal(app.b.textColor, 0x333333, "the unmentioned field falls through per field");
});

await test("stylesheet: the theme record travels with the stylesheet; a swap re-skins in one settle", () => {
  const app = build(resolved(`stylesheet Dark [ theme: Theme [ accent = #4F8EF7, radius = 6 ] ]
stylesheet Light [ theme: Theme [ accent = #B00020, radius = 2 ] ]
App [ stylesheet = Dark,
    box: View [ fill = { theme.accent }, cornerRadius = { theme.radius } ] ]`));
  assert.equal(app.box.fill, 0x4f8ef7, "a follower reads the stylesheet's tokens through the ordinary theme chain");
  assert.equal(app.box.cornerRadius, 6);
  app.stylesheet = app.lookupStylesheet("Light");
  settle();
  assert.equal(app.box.fill, 0xb00020, "one write, one settle — the subtree reskins");
  assert.equal(app.box.cornerRadius, 2);
  assert.throws(() => app.lookupStylesheet("Nope"), /no stylesheet named 'Nope'/);
});

await test("stylesheet: bare name is DECLARATIVE sugar only — inside a { } body it is honest TS", () => {
  const cerrs = (src) => compile(src).errors.map((e) => e.message);
  // Declarative attribute position: a bare stylesheet name resolves, and is
  // compile-checked there (a typo is caught before the program runs).
  assert.equal(cerrs(`stylesheet Dark [ ] App [ stylesheet = Dark ]`).length, 0);
  assert.match(cerrs(`stylesheet Dark [ ] App [ stylesheet = Drak ]`)[0], /no stylesheet named 'Drak'/);
  // Inside a { } body you are in real TS: `Dark` is an ordinary identifier,
  // NOT sugar for a stylesheet, so it is (correctly) unresolved. We never rewrite
  // identifiers inside blocks — the honest spelling is a real method call.
  assert.match(
    cerrs(`stylesheet Dark [ ] stylesheet Light [ ]
App [ night: boolean = false, stylesheet = { night ? Dark : Light } ]`)[0],
    /cannot resolve 'Dark'/);
  // That honest form compiles clean and re-skins reactively.
  const app = build(resolved(`stylesheet Dark  [ View: [ opacity = 0.5 ] ]
stylesheet Light [ View: [ opacity = 1 ] ]
App [ night: boolean = true,
    stylesheet = { night ? this.lookupStylesheet("Dark") : this.lookupStylesheet("Light") },
    v: View [ ] ]`));
  assert.equal(app.v.opacity, 0.5, "the body's lookupStylesheet drives the prevailing stylesheet");
  app.night = false;
  settle();
  assert.equal(app.v.opacity, 1, "flipping the flag re-skins in one settle");
});

await test("stylesheet: a swap withdraws fields the new stylesheet no longer offers", () => {
  const app = build(resolved(`stylesheet A [ View: [ cornerRadius = 9, opacity = 0.5 ] ]
stylesheet B [ View: [ opacity = 0.8 ] ]
App [ stylesheet = A, v: View [ ] ]`));
  assert.equal(app.v.cornerRadius, 9);
  app.stylesheet = app.lookupStylesheet("B");
  settle();
  assert.equal(app.v.cornerRadius, 0, "the withdrawn field falls back to the declaration default");
  assert.equal(app.v.opacity, 0.8);
  app.stylesheet = null;
  settle();
  assert.equal(app.v.opacity, 1, "cancelling the stylesheet withdraws everything");
});

await test("stylesheet: `stylesheet` is prevailing — a mid-tree provision re-roots its subtree only", () => {
  const app = build(resolved(`stylesheet Dark [ View: [ opacity = 0.5 ] ]
stylesheet Red [ View: [ opacity = 0.25 ], theme: Theme [ hot = 1 ] ]
App [ stylesheet = Dark,
    zone: View [ stylesheet = Red, inner: View [ ] ],
    other: View [ ] ]`));
  assert.equal(app.other.opacity, 0.5, "follows the App's stylesheet");
  assert.equal(app.zone.inner.opacity, 0.25, "the zone's stylesheet re-roots beneath it");
  // A mid-tree theme provision still re-roots BENEATH the sheeted zone.
  app.zone.inner.theme = { hot: 2 };
  assert.equal(app.zone.inner.theme.hot, 2, "a local theme write wins over the stylesheet's record");
});

await test("stylesheet: a stylesheet provided AFTER attach walks appliers into the live subtree", () => {
  const app = build(resolved(`stylesheet S [ View: [ cornerRadius = 7 ] ]
App [ v: View [ ] ]`));
  const log = [];
  app.attach(mockBackend(log), null);
  assert.equal(app.v.cornerRadius, 0, "no effective stylesheet, no applier, no offers");
  app.stylesheet = app.lookupStylesheet("S");
  settle();
  assert.equal(app.v.cornerRadius, 7, "the pusher's walk armed the subtree");
  assert.ok(log.some(([m, v]) => m === "setCornerRadius" && v === 7), "the offer crossed the seam");
  app.stylesheet = null;
  settle();
  assert.equal(app.v.cornerRadius, 0);
  assert.ok(log.some(([m, v]) => m === "setCornerRadius" && v === 0),
    "the withdrawal re-pushed the effective value");
});

await test("bundles: written order — a later bundle wins; the slot holds the names", () => {
  const app = build(resolved(`style card [ cornerRadius = 6, opacity = 0.9 ]
style danger [ cornerRadius = 2 ]
App [ v: View [ styles = [card, danger] ] ]`));
  assert.equal(app.v.cornerRadius, 2, "later wins on conflicts");
  assert.equal(app.v.opacity, 0.9, "non-conflicting fields merge");
  assert.deepEqual([...app.v.styles], ["card", "danger"], "the slot is introspection");
});

await test("bundles: a { } field evaluates with `this` = the styled view (theme-aware)", () => {
  const app = build(resolved(`style card [ cornerRadius = { theme.radius } ]
App [ theme = { ({ radius: 4 }) },
    a: View [ styles = [card] ],
    b: View [ theme = { ({ radius: 9 }) }, styles = [card] ] ]`));
  settle(); // b's theme binding installs after its bundle field first read it
  assert.equal(app.a.cornerRadius, 4, "resolved through a's prevailing chain");
  assert.equal(app.b.cornerRadius, 9, "resolved through b's own provision");
});

await test("bundles: a class-body styles list applies to every instance; the use site overrides", () => {
  const app = build(resolved(`style card [ cornerRadius = 6 ]
class Panel extends View [ styles = [card] ]
App [ a: Panel [ ], b: Panel [ styles = null ] ]`));
  assert.equal(app.a.cornerRadius, 6);
  assert.equal(app.b.cornerRadius, 0, "styles = null cancels the inherited list");
});

await test("binding defaults: a declared attribute may default to { theme.token } — live, per instance", () => {
  const app = build(resolved(`class Button extends View [
    labelColor: Color = { theme.buttonText },
  ]
App [ a: Button [ ],
    b: Button [ labelColor = #123456 ] ]`));
  app.theme = { buttonText: 0xEEEEEE }; // provide via the ordinary author write
  assert.equal(app.a.labelColor, 0xeeeeee, "the default binding reads the prevailing theme");
  assert.equal(app.b.labelColor, 0x123456, "an instance set displaces the default entirely");
  app.theme = { buttonText: 0x111111 };
  assert.equal(app.a.labelColor, 0x111111, "the default is live — a theme swap re-reads it");
  assert.equal(app.b.labelColor, 0x123456);
  // A direct write is an ordinary author set (the default never owned the slot).
  app.a.labelColor = 0xabcdef;
  assert.equal(app.a.labelColor, 0xabcdef);
});

await test("binding defaults: a stylesheet entry outranks the default binding; a self-reading default errors", () => {
  const app = build(resolved(`class Button extends View [
    labelColor: Color = { theme.buttonText },
  ]
stylesheet S [ theme: Theme [ buttonText = #EEEEEE ], Button: [ labelColor = #00FF00 ] ]
App [ stylesheet = S, a: Button [ ] ]`));
  assert.equal(app.a.labelColor, 0x00ff00, "the entry provides; the default never installs");
  const cyc = build(resolved(`class W extends View [ k: number = { this.k + 1 } ] App [ w: W [ ] ]`));
  assert.throws(() => cyc.w.k, /W\.k's default binding \(transitively\) reads itself/);
});

// ── Animation v1: the motion substrate — ease curves + the shared clock ─────
// (docs/system-design/animation.md §1–§4; the author-invisible kernel-tier services
// of §3's magic ledger, unit-testable with an injected scheduler — no browser.)

// Motion values for the animator tests (the schema default + a few named).
const LINEAR = motionToken("linear");
const EASEBOTH = motionToken("easeBoth");
const EASEIN = motionToken("easeIn");

/** A hand-cranked FrameScheduler: `frame(now)` fires exactly the frame the
 *  clock currently has pending (rAF is one-shot — the clock re-requests if it
 *  wants another), so a test drives time deterministically. */
function fakeScheduler() {
  let cb = null; // the pending frame callback, or null when nothing is scheduled
  let handle = 0;
  let last = 0;
  return {
    now: () => last,
    request(fn) { cb = fn; return ++handle; },
    cancel() { cb = null; },
    /** Fire the scheduled frame with `now`; the callback may re-request. */
    frame(now) {
      const fn = cb;
      cb = null; // consumed (one-shot), like a real rAF handle
      if (fn) { last = now; fn(now); }
    },
    get scheduled() { return cb !== null; },
  };
}

await test("sample: every named curve lands exactly on its endpoints, clamped past them", () => {
  for (const name of MOTION_TOKENS) {
    const m = motionToken(name);
    assert.equal(sample(m, 0, 100), 0, `${name} at 0`);
    assert.equal(sample(m, 1, 100), 1, `${name} at 1`);
    assert.equal(sample(m, -0.5, 100), 0, `${name} clamps below 0`);
    assert.equal(sample(m, 1.5, 100), 1, `${name} clamps above 1`);
  }
});

await test("sample: monotone families are monotone and shaped as named", () => {
  const monotone = ["linear", "ease", "easeIn", "easeOut", "easeBoth",
    "sineBoth", "cubicIn", "quartOut", "quintBoth", "expoIn", "circOut", "laszloBoth"];
  for (const name of monotone) {
    const m = motionToken(name);
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = sample(m, i / 20, 100);
      assert.ok(v >= prev - 1e-9, `${name} is monotone (t=${i / 20})`);
      prev = v;
    }
  }
  assert.equal(sample(LINEAR, 0.5), 0.5);
  assert.equal(sample(EASEBOTH, 0.5), 0.5, "the symmetric curve is half-way at the midpoint");
  assert.ok(sample(EASEIN, 0.5) < 0.5, "easeIn lags at the midpoint");
  assert.ok(sample(motionToken("easeOut"), 0.5) > 0.5, "easeOut leads at the midpoint");
  // steeper families lag further at the midpoint: quad > quart > expo
  assert.ok(sample(motionToken("quartIn"), 0.5) < sample(motionToken("quadIn"), 0.5), "quart steeper than quad");
  assert.ok(sample(motionToken("expoIn"), 0.5) < sample(motionToken("quartIn"), 0.5), "expo steepest");
});

await test("sample: cubicBezier / steps / back / laszlo", () => {
  // the CSS default `ease` bézier is front-loaded (leads at the midpoint)
  assert.ok(sample(motionToken("ease"), 0.5) > 0.6, "CSS ease leads at the midpoint");
  // steps: a 4-step staircase (jumpEnd)
  const st = { k: "steps", n: 4, jump: "end" };
  assert.equal(sample(st, 0.1), 0, "steps floors to 0 in the first quarter");
  assert.equal(sample(st, 0.3), 0.25, "…0.25 in the second");
  assert.equal(sample(st, 0.6), 0.5, "…0.5 in the third");
  // back overshoots BOTH ends
  assert.ok(sample(motionToken("backOut"), 0.7) > 1, "backOut overshoots past 1");
  assert.ok(sample(motionToken("backIn"), 0.2) < 0, "backIn anticipates below 0");
  // laszlo reproduces OpenLaszlo's SCALE-DEPENDENT easeboth (vs the ported
  // reference: at t=0.25, a 2000px travel eases to ~1.1%, a 25px travel ~8.2%)
  const lz = motionToken("laszloBoth");
  assert.ok(Math.abs(sample(lz, 0.25, 2000) - 0.011) < 0.004, "laszlo big-travel ≈ 1.1%");
  assert.ok(Math.abs(sample(lz, 0.25, 25) - 0.082) < 0.01, "laszlo small-travel ≈ 8.2%");
  assert.ok(Math.abs(sample(lz, 0.5, 2000) - 0.5) < 1e-6, "laszlo symmetric at the midpoint");
  assert.equal(sample(lz, 0.25, 0), 0.25, "laszlo with zero travel degrades to linear (no 0/0)");
});

await test("build(): motion accepts family tokens and the four constructors", () => {
  const app = build(`App [ width=1, height=1, View [
    a: Animator [ attribute=x, to=1, motion=quartOut ],
    b: Animator [ attribute=x, to=1, motion=cubicBezier(0.42, 0, 0.58, 1) ],
    c: Animator [ attribute=x, to=1, motion=laszloBoth ],
    d: Animator [ attribute=x, to=1, motion=steps(4, jumpStart) ],
    e: Animator [ attribute=x, to=1, motion=back(2) ] ] ]`);
  const v = app.children[0];
  assert.deepEqual(v.a.motion, { k: "poly", fam: "quart", dir: "out" }, "family token");
  assert.equal(v.b.motion.k, "bezier", "cubicBezier constructor");
  assert.deepEqual(v.c.motion, { k: "laszlo", beginPole: 0.25, endPole: 0.25 }, "laszlo alias = OL easeboth");
  assert.deepEqual(v.d.motion, { k: "steps", n: 4, jump: "start" }, "steps with jumpStart");
  assert.deepEqual(v.e.motion, { k: "back", dir: "both", overshoot: 2 }, "back with overshoot");
});

await test("check(): a bogus motion token / out-of-range bézier is rejected, naming Motion", () => {
  const e1 = check(parseProgram(`App [ width=1, height=1, View [ Animator [ attribute=x, motion=swoosh ] ] ]`));
  assert.ok(e1.some((e) => /Motion/.test(e.message)), `unknown token names Motion: ${e1.map((e) => e.message).join(" | ")}`);
  const e2 = check(parseProgram(`App [ width=1, height=1, View [ Animator [ attribute=x, motion=cubicBezier(2, 0, 0.5, 1) ] ] ]`));
  assert.ok(e2.some((e) => /Motion|\[0, 1\]/.test(e.message)), `bézier x out of range: ${e2.map((e) => e.message).join(" | ")}`);
});

await test("Clock: idle until a ticker is added, live while one runs (idle-zero)", () => {
  const sched = fakeScheduler();
  const clock = new Clock(sched);
  assert.equal(clock.running, false, "no ticker → no frame loop");
  let ticks = 0;
  clock.add({ tick: () => (ticks++, true) });
  assert.equal(clock.running, true, "adding the first ticker starts the loop");
  sched.frame(16);
  assert.equal(ticks, 1, "the frame ticked the registrant");
  assert.equal(clock.running, true, "a still-running ticker keeps the loop live");
});

await test("Clock: one frame hands every ticker the SAME now (synched motion)", () => {
  const sched = fakeScheduler();
  const clock = new Clock(sched);
  const seen = [];
  clock.add({ tick: (now) => (seen.push(["a", now]), true) });
  clock.add({ tick: (now) => (seen.push(["b", now]), true) });
  sched.frame(1234);
  assert.deepEqual(seen, [["a", 1234], ["b", 1234]], "both synched to one time value");
});

await test("Clock: a finishing ticker is dropped; remove() and the last finish both go idle", () => {
  const sched = fakeScheduler();
  const clock = new Clock(sched);
  let done = false;
  const a = { tick: () => !done }; // finishes when `done` flips
  const b = { tick: () => true };
  clock.add(a);
  clock.add(b);
  sched.frame(1);
  assert.equal(clock.running, true, "both still running");
  done = true;
  sched.frame(2);
  assert.equal(clock.running, true, "a dropped, but b keeps the loop live");
  clock.remove(b);
  assert.equal(clock.running, false, "removing the last live ticker goes idle (idle-zero)");
});

await test("Clock: a ticker added DURING a frame runs the next frame, not the current", () => {
  const sched = fakeScheduler();
  const clock = new Clock(sched);
  const order = [];
  const late = { tick: () => (order.push("late"), true) };
  let added = false;
  clock.add({ tick: () => {
    order.push("early");
    if (!added) { added = true; clock.add(late); }
    return true;
  } });
  sched.frame(1);
  assert.deepEqual(order, ["early"], "the newcomer does not tick in the frame it was added");
  sched.frame(2);
  assert.deepEqual(order, ["early", "early", "late"], "it joins from the next frame");
});

// ── Animation v1: the Animator motion core (start/stop/tick, driven through
// the fake clock via setClock — the displace/resume and repeat/pause rules of
// animation.md §1–§2, unit-testable with no browser). ───────────────────────

await test("Animator: start() drives a plain target slot to `to`, then goes idle", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 25;
  const anim = new Animator();
  view.appendChild(anim); // parent = view = target
  anim.attribute = "height";
  anim.to = 225;
  anim.duration = 100;
  anim.motion = LINEAR;
  anim.start();
  assert.equal(sched.scheduled, true, "starting registers a live frame loop");
  sched.frame(1000);
  assert.equal(view.height, 25, "the first frame anchors at `from` (t = 0)");
  sched.frame(1050); // +50ms → t = 0.5 → linear → 125
  assert.equal(view.height, 125, "half-way through, linearly");
  sched.frame(1100); // +100ms → t = 1 → exact landing
  assert.equal(view.height, 225, "lands exactly on `to`");
  assert.equal(sched.scheduled, false, "the last animator finishing goes idle (idle-zero)");
});

await test("Animator: `from` defaults to the slot's current value; an explicit `from` overrides", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 40;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 140;
  a.from = 100; // explicit — start here regardless of the slot's 40
  a.duration = 100;
  a.motion = LINEAR;
  a.start();
  sched.frame(0);
  assert.equal(view.height, 100, "an explicit `from` wins over the current value");
  sched.frame(50);
  assert.equal(view.height, 120);
});

await test("Animator: relative — `to` is a delta from `from`", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 25;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.relative = true;
  a.to = 10; // +10 from the sampled from (25) → 35
  a.duration = 100;
  a.motion = LINEAR;
  a.start();
  sched.frame(0);
  assert.equal(view.height, 25);
  sched.frame(100);
  assert.equal(view.height, 35, "landed at from + to");
});

await test("Animator: start() while running is a no-op (LZX doStart guard)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 100;
  a.duration = 100;
  a.motion = LINEAR;
  a.start();
  sched.frame(0);
  sched.frame(50); // → 50
  a.to = 999; // sampled-once: re-starting is refused, and `to` cannot retarget live
  a.start(); // no-op while running
  sched.frame(75); // → 75, NOT reset to 0 and NOT retargeted toward 999
  assert.equal(view.height, 75, "the running animator kept its samples and its clock");
});

await test("Animator: stop() halts in place — no snap to either end", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 100;
  a.duration = 100;
  a.motion = LINEAR;
  a.start();
  sched.frame(0);
  sched.frame(50); // → 50
  a.stop();
  assert.equal(view.height, 50, "stopped at the current value, no snap");
  assert.equal(sched.scheduled, false, "stop() takes it off the clock (idle)");
});

await test("Animator: paused freezes in place; unpausing resumes where it left off", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 100;
  a.duration = 100;
  a.motion = LINEAR;
  a.start();
  sched.frame(0);
  sched.frame(50); // → 50
  a.paused = true;
  sched.frame(60);
  sched.frame(70); // 20ms elapse while paused — must not count
  assert.equal(view.height, 50, "frozen in place while paused");
  a.paused = false;
  sched.frame(80); // +10ms of live time → t = 0.6
  assert.equal(view.height, 60, "resumes from where it froze");
});

await test("Animator: repeat replays from→to the given number of times, then lands exactly", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.from = 0;
  a.to = 100;
  a.duration = 100;
  a.repeat = 2;
  a.motion = LINEAR;
  a.start();
  sched.frame(0); // cycle 1, t = 0 → 0
  sched.frame(50); // cycle 1, t = 0.5 → 50
  sched.frame(100); // cycle 1 done → wraps into cycle 2 at t = 0 → 0
  assert.equal(view.height, 0, "the second cycle restarts at from");
  assert.equal(sched.scheduled, true, "still running (one repeat left)");
  sched.frame(150); // cycle 2, t = 0.5 → 50
  assert.equal(view.height, 50);
  sched.frame(200); // cycle 2 done (last) → exact landing
  assert.equal(view.height, 100, "the final cycle lands exactly on `to`");
  assert.equal(sched.scheduled, false, "then idle");
});

await test("Animator: autoStart honors `started` — default false stays put, true starts", () => {
  const s1 = fakeScheduler();
  setClock(new Clock(s1));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 100;
  a.autoStart();
  assert.equal(s1.scheduled, false, "started defaults to false → does not auto-start (opt-in)");
  const s2 = fakeScheduler();
  setClock(new Clock(s2));
  const b = new Animator();
  view.appendChild(b);
  b.attribute = "height";
  b.to = 100;
  b.started = true;
  b.autoStart();
  assert.equal(s2.scheduled, true, "started = true → auto-starts");
  b.autoStart(); // once per lifetime — idempotent
});

await test("Animator: displaces a constraint owner, then resumes it re-evaluated on completion", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build("App [ width=100, height=100, View [ y=10, x={ parent.width - 40 } ] ]");
  settle();
  const v = app.children[0];
  assert.equal(v.x, 60, "the constraint drives x initially");
  const anim = new Animator();
  v.appendChild(anim);
  anim.attribute = "x";
  anim.from = 60;
  anim.to = 0;
  anim.duration = 100;
  anim.motion = LINEAR;
  anim.start();
  sched.frame(0);
  assert.equal(v.x, 60);
  sched.frame(50); // → 30
  assert.equal(v.x, 30, "the animator drives x while the constraint is displaced");
  app.width = 140; // the displaced constraint would compute 100 — but it is suspended
  settle();
  assert.equal(v.x, 30, "a displaced constraint does not fight during the run");
  sched.frame(100); // animator lands 0, then the constraint resumes and re-evaluates
  assert.equal(v.x, 100, "on completion the driver resumes, re-evaluated against current state");
  assert.equal(sched.scheduled, false, "and the clock goes idle");
  app.width = 90; // proof the resumed constraint is live again (not stale, not dead)
  settle();
  assert.equal(v.x, 50, "the resumed constraint wakes on later changes");
});

// ── Animation v1: the pipeline — schema, twin-table, and the ONE compiler
// check (parse → check → instantiate → build, animation.md §1–§3). ───────────

await test("Animator: check() accepts named and anonymous animators (LZX's member shape)", () => {
  assert.deepEqual(check(parseProgram(`App [ width=100, height=100,
    View [ height=25,
      slide: Animator [ attribute=height, to=255, duration=300, motion=easeBoth ],
      Animator [ attribute=x, to=100, started=true, paused=false, relative=false, repeat=3 ] ] ]`)), []);
});

await test("Animator: the ONE check — `attribute` must name a NUMERIC slot on the target", () => {
  assert.deepEqual(check(parseProgram(`App [ width=1, height=1, View [
    Animator [ attribute=x, to=10 ], Animator [ attribute=opacity, to=0.5 ] ] ]`)), [],
    "a length slot and a number slot both animate");

  const typo = check(parseProgram(`App [ width=1, height=1, View [ Animator [ attribute=heigth, to=1 ] ] ]`));
  assert.equal(typo.length, 1);
  assert.match(typo[0].message, /Animator\.attribute = heigth: View has no slot 'heigth' to animate/);
  assert.equal(typo[0].pos.line, 1);

  const boolean = check(parseProgram(`App [ width=1, height=1, View [ Animator [ attribute=visible, to=1 ] ] ]`));
  assert.equal(boolean.length, 1);
  assert.match(boolean[0].message, /only numeric slots animate — View\.visible is not a number/);

  const fill = check(parseProgram(`App [ width=1, height=1, View [ Animator [ attribute=fill, to=1 ] ] ]`));
  assert.match(fill[0].message, /only numeric slots animate — View\.fill is not a number/);
});

await test("Animator: `attribute` is a bare token — a { }, a :path, or a value is refused", () => {
  const cases = [
    [`attribute={ x }, to=1`, /attribute names the target slot to drive as a bare token .*not a \{ … \} expression/],
    [`attribute=:height, to=1`, /attribute names the target slot .*not the datapath :height/],
    [`attribute=5, to=1`, /attribute names the target slot .*not the number 5/],
  ];
  for (const [frag, want] of cases) {
    const errs = check(parseProgram(`App [ width=1, height=1, View [ height=9, Animator [ ${frag} ] ] ]`));
    assert.ok(errs.some((e) => want.test(e.message)), `${frag} → ${errs.map((e) => e.message).join(" | ")}`);
  }
});

await test("Animator: a missing `attribute` is a compile error", () => {
  const errs = check(parseProgram(`App [ width=1, height=1, View [ Animator [ to=100 ] ] ]`));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /an Animator needs 'attribute = <slot>' — the target slot it drives/);
});

await test("Animator: handlers are allowed (declared events); decls, children, typo'd handlers are not", () => {
  assert.deepEqual(check(parseProgram(`App [ width=1, height=1, View [ height=25,
    Animator [ attribute=height, to=255, onStart() { }, onStop() { }, onRepeat() { } ] ] ]`)), [],
    "onStart/onStop/onRepeat answer the animator's declared events");
  const errs = check(parseProgram(`App [ width=1, height=1, View [
    Animator [ attribute=x, to=1, foo: number = 1, onWiggle() { }, View [ ] ] ] ]`));
  const msgs = errs.map((e) => e.message).join("\n");
  assert.match(msgs, /an animator declares no new attributes/);
  assert.match(msgs, /Animator has no 'onWiggle' event — its handlers: onStart, onStop, onRepeat/);
  assert.match(msgs, /an animator drives a slot — it has no children/);
});

await test("build(): a named animator is a reachable member with coerced attrs; target = parent", () => {
  setClock(new Clock(fakeScheduler())); // isolate any auto-start onto a throwaway clock
  const app = build(`App [ width=100, height=100,
    View [ height=25,
      slide: Animator [ attribute=height, to=255, from=25, duration=300, motion=easeBoth, repeat=2, started=false ] ] ]`);
  const v = app.children[0];
  assert.ok(v.slide instanceof Animator, "named animator is reachable as a member");
  assert.equal(v.slide.attribute, "height");
  assert.equal(v.slide.to, 255);
  assert.equal(v.slide.from, 25);
  assert.equal(v.slide.duration, 300);
  assert.deepEqual(v.slide.motion, EASEBOTH);
  assert.equal(v.slide.repeat, 2);
  assert.equal(v.slide.parent, v, "the target defaults to the parent node");
});

await test("build(): slide.start() from the pipeline drives the parent's slot to `to`", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=100, height=100,
    View [ height=25,
      slide: Animator [ attribute=height, to=225, duration=100, motion=linear, started=false ] ] ]`);
  const v = app.children[0];
  assert.equal(v.height, 25);
  v.slide.start();
  sched.frame(0);
  assert.equal(v.height, 25, "anchors at from (the current 25)");
  sched.frame(50);
  assert.equal(v.height, 125);
  sched.frame(100);
  assert.equal(v.height, 225, "lands on to");
  assert.equal(sched.scheduled, false, "idle after completion");
});

await test("build(): started=true auto-starts the animator at init (opt-in)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=100, height=100,
    View [ Animator [ attribute=x, to=80, duration=100, motion=linear, started=true ] ] ]`);
  assert.equal(sched.scheduled, true, "started=true → auto-started during build's init");
  const v = app.children[0];
  sched.frame(0);
  assert.equal(v.x, 0, "anchors at from (default x = 0)");
  sched.frame(50);
  assert.equal(v.x, 40);
  sched.frame(100);
  assert.equal(v.x, 80);
  assert.equal(sched.scheduled, false, "idle after completion");
});

await test("build(): the target is the parent — a user-declared numeric slot animates too", () => {
  const src = `class WeatherTab extends View [
      openHeight: number = 255,
      height = 25,
      slide: Animator [ attribute = height, to = 255, duration = 300, started = false ],
      grow:  Animator [ attribute = openHeight, to = 300, started = false ],
    ]
    App [ width=100, height=100, tab: WeatherTab [ ] ]`;
  assert.deepEqual(check(parseProgram(src)), [], "height (View) and openHeight (user) both animate");
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(src);
  const tab = app.tab;
  assert.ok(tab.slide instanceof Animator && tab.grow instanceof Animator);
  assert.equal(tab.grow.parent, tab, "target = parent (the user class instance)");
  assert.equal(tab.openHeight, 255);
  tab.grow.motion = LINEAR;
  tab.grow.duration = 100; // sampled at start
  tab.grow.start();
  sched.frame(0);
  sched.frame(50);
  assert.equal(tab.openHeight, 277.5, "a user-declared numeric slot animates (255 → 300, half)");
});

// ── Animation v1 (events tail): onStart / onStop / onRepeat (animation.md §1 —
// onStop fires on BOTH stop() and natural completion; the Node dispatch). ────

await test("Animator: onStart at start, onStop at natural completion (fired once each)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 100;
  a.duration = 100;
  a.motion = LINEAR;
  const log = [];
  a.onStart = () => log.push("start");
  a.onStop = () => log.push("stop");
  a.start();
  assert.deepEqual(log, ["start"], "onStart fires at start()");
  sched.frame(0);
  sched.frame(50);
  assert.deepEqual(log, ["start"], "no onStop mid-flight");
  sched.frame(100);
  assert.deepEqual(log, ["start", "stop"], "onStop fires once at natural completion");
});

await test("Animator: onStop fires on imperative stop() too (no finished-vs-stopped split)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 100;
  a.duration = 100;
  const log = [];
  a.onStop = () => log.push("stop");
  a.start();
  sched.frame(0);
  sched.frame(50);
  a.stop();
  assert.deepEqual(log, ["stop"], "stop() fires onStop");
  a.stop(); // idempotent — no second onStop
  assert.deepEqual(log, ["stop"]);
});

await test("Animator: on* handlers fire through the pipeline (build) with repeat", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  globalThis.__aev = [];
  const app = build(`App [ width=100, height=100, View [
    Animator [ attribute=x, to=100, duration=100, motion=linear, repeat=2, started=false,
      onStart() { globalThis.__aev.push("start") },
      onRepeat() { globalThis.__aev.push("repeat") },
      onStop() { globalThis.__aev.push("stop") } ] ] ]`);
  const anim = app.children[0].children[0];
  assert.ok(anim instanceof Animator);
  anim.start();
  assert.deepEqual(globalThis.__aev, ["start"], "onStart at start()");
  sched.frame(0);
  sched.frame(100); // cycle 1 → cycle 2 boundary
  assert.deepEqual(globalThis.__aev, ["start", "repeat"], "onRepeat at the cycle boundary");
  sched.frame(150);
  sched.frame(200); // cycle 2 (final) completes
  assert.deepEqual(globalThis.__aev, ["start", "repeat", "stop"], "onStop at natural completion");
});

await test("Animator: an onStop that start()s again restarts cleanly (re-entrant), then idles", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.height = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "height";
  a.to = 100;
  a.duration = 100;
  a.motion = LINEAR;
  let runs = 0;
  a.onStop = () => {
    runs++;
    if (runs === 1) {
      a.from = 0;
      a.to = 50;
      a.start(); // restart from within onStop — the re-entrant case
    }
  };
  a.start();
  sched.frame(0);
  sched.frame(100); // run 1 completes → onStop restarts (run 2), ticker must SURVIVE
  assert.equal(runs, 1);
  assert.equal(view.height, 100, "run 1 landed on its to");
  assert.equal(sched.scheduled, true, "restarted — the clock stays live");
  sched.frame(150); // run 2 first tick: t = 0 → anchors at the new from (0)
  assert.equal(view.height, 0);
  sched.frame(200); // run 2 half-way (no double-ticking would put it here, not further)
  assert.equal(view.height, 25);
  sched.frame(250); // run 2 completes
  assert.equal(view.height, 50, "run 2 landed on its new to");
  assert.equal(runs, 2, "onStop fired for run 2 as well (no restart this time)");
  assert.equal(sched.scheduled, false, "and then the clock goes idle");
});

// ── Animation v1 (A1b — displace/resume hardening): §2 rule 2 across the
// OTHER owner kinds — a layout-laid axis and a percent binding, each displaced
// for the run and resumed re-evaluated on completion. ───────────────────────

await test("Animator: displaces a LAYOUT-laid axis; the layout re-lays on completion", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = buildL(`App [ width=100, height=100,
    layout: SimpleLayout [ axis=y, spacing=10 ],
    View [ height=20 ], View [ height=20 ] ]`);
  settle();
  const [a, b] = app.children;
  assert.equal(a.y, 0);
  assert.equal(b.y, 30, "the layout stacks b at a.y + a.height + spacing");
  const anim = new Animator();
  b.appendChild(anim);
  anim.attribute = "y";
  anim.from = 30;
  anim.to = 80;
  anim.duration = 100;
  anim.motion = LINEAR;
  anim.start();
  sched.frame(0);
  assert.equal(b.y, 30);
  sched.frame(50);
  assert.equal(b.y, 55, "the animator drives b.y; the layout is displaced");
  a.height = 40; // would normally re-lay b (b.y reads a.height), but that constraint is suspended
  settle();
  assert.equal(b.y, 55, "the displaced layout does not re-lay b during the run");
  sched.frame(100); // animator lands 80, then the layout resumes → b.y = 0 + 40 + 10
  assert.equal(b.y, 50, "on completion the layout resumes and re-lays against current state");
  assert.equal(sched.scheduled, false);
});

await test("Animator: displaces a percent binding; it re-resolves against the new parent on completion", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=200, height=100, View [ width=50%, height=20 ] ]`);
  settle();
  const v = app.children[0];
  assert.equal(v.width, 100, "50% of 200");
  const anim = new Animator();
  v.appendChild(anim);
  anim.attribute = "width";
  anim.from = 100;
  anim.to = 0;
  anim.duration = 100;
  anim.motion = LINEAR;
  anim.start();
  sched.frame(0);
  assert.equal(v.width, 100);
  sched.frame(50);
  assert.equal(v.width, 50, "the animator drives width; the percent is displaced");
  app.width = 300; // percent would be 150, but it is suspended
  settle();
  assert.equal(v.width, 50, "the displaced percent does not re-resolve during the run");
  sched.frame(100); // lands 0, then the percent resumes → 50% of 300
  assert.equal(v.width, 150, "the percent resumes and re-resolves against the new parent width");
  assert.equal(sched.scheduled, false);
});

// ── Animation v1 (A2): the additive core + exact-landing ledger (animation.md
// §4) — two animators on ONE slot COMPOSE by summing deltas rather than
// clobbering, and the slot lands its exact expected end value (no float drift
// from accumulated increments). ─────────────────────────────────────────────

await test("A2 additive: two animators on one slot COMPOSE (their deltas sum)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.x = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "x";
  a.relative = true;
  a.to = 100; // +100
  a.duration = 100;
  a.motion = LINEAR;
  const b = new Animator();
  view.appendChild(b);
  b.attribute = "x";
  b.relative = true;
  b.to = 40; // +40 — composes on top of a, not displacing it
  b.duration = 100;
  b.motion = LINEAR;
  a.start();
  b.start();
  sched.frame(0);
  assert.equal(view.x, 0, "both anchor at t = 0");
  sched.frame(50); // a: +50, b: +20 → 70 (composed, not 50 or 20 alone)
  assert.equal(view.x, 70, "the two increments SUM each frame (50 + 20), not last-write-wins");
  sched.frame(100); // both land → +100 and +40 → exactly 140
  assert.equal(view.x, 140, "both full deltas landed and composed");
  assert.equal(sched.scheduled, false, "both finished → idle");
});

await test("A2 additive ledger: composing animators land the EXACT expected sum (no float drift)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.x = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "x";
  a.relative = true;
  a.to = 10;
  a.duration = 100;
  a.motion = EASEBOTH; // curves whose summed increments would NOT be exact
  const b = new Animator();
  view.appendChild(b);
  b.attribute = "x";
  b.relative = true;
  b.to = 3;
  b.duration = 100;
  b.motion = EASEIN;
  a.start();
  b.start();
  sched.frame(0); // anchor elapsed at 0 (the first frame's dt is 0)
  for (let now = 3; now < 100; now += 3) sched.frame(now); // many small eased steps
  sched.frame(100);
  assert.equal(view.x, 13, "exact-landing assigns the ledger's expected end (10 + 3), not a summed approximation");
  assert.equal(sched.scheduled, false);
});

await test("A2 additive: a later ABSOLUTE `to` measures its delta against the EXPECTED value", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const view = new View();
  view.x = 0;
  const a = new Animator();
  view.appendChild(a);
  a.attribute = "x";
  a.to = 100; // absolute → expected becomes 100
  a.duration = 100;
  a.motion = LINEAR;
  const b = new Animator();
  view.appendChild(b);
  b.attribute = "x";
  b.to = 40; // absolute, started while a is in flight → delta = 40 − expected(100) = −60
  b.duration = 100;
  b.motion = LINEAR;
  a.start();
  b.start();
  sched.frame(0);
  sched.frame(100); // a: +100, b: −60 → composed end = 40 (b's absolute intent, accounting for a)
  assert.equal(view.x, 40, "the later absolute `to` lands where its author said, composing with what was in flight");
});

await test("A2 additive: a lone animator still displaces a constraint ONCE and resumes it (ledger-held displaced)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build("App [ width=100, height=100, View [ y=10, x={ parent.width - 40 } ] ]");
  settle();
  const v = app.children[0];
  assert.equal(v.x, 60);
  // Two animators arrive on the SAME constrained slot: the FIRST displaces the
  // constraint (one-deep, in the ledger), the SECOND composes without touching
  // it; the constraint resumes only when the LAST animator finishes.
  const a = new Animator();
  v.appendChild(a);
  a.attribute = "x";
  a.relative = true;
  a.to = 10;
  a.duration = 100;
  a.motion = LINEAR;
  const b = new Animator();
  v.appendChild(b);
  b.attribute = "x";
  b.relative = true;
  b.to = 20;
  b.duration = 200; // outlives a — the constraint must NOT resume when a finishes
  b.motion = LINEAR;
  a.start();
  b.start();
  sched.frame(0);
  assert.equal(v.x, 60, "both anchor at the constraint's value");
  app.width = 140; // the displaced constraint would compute 100 — but it is suspended for the whole run
  settle();
  assert.equal(v.x, 60, "the displaced constraint does not fight while ANY animator runs");
  sched.frame(100); // a finishes (+10 applied); b still running → constraint stays displaced
  assert.equal(sched.scheduled, true, "b still running");
  app.width = 200;
  settle();
  assert.ok(v.x !== 160, "the constraint is STILL displaced after a finished (b holds it)");
  sched.frame(200); // b finishes → last animator leaves → constraint resumes, re-evaluated (200 − 40)
  assert.equal(v.x, 160, "on the LAST animator's completion the one displaced constraint resumes, re-evaluated");
  assert.equal(sched.scheduled, false);
});

// ── Animation v1 (A2): AnimatorGroup — process = sequential | simultaneous,
// the same started/paused/start()/stop()/repeat surface as Animator, the LZX
// default-cascade of animatable attrs to members, driving them off one shared
// clock (animation.md §1, §4). ──────────────────────────────────────────────

/** Reach a built view's sole AnimatorGroup child. */
function groupOf(view) {
  return view.children.find((c) => c instanceof AnimatorGroup);
}

await test("A2 AnimatorGroup simultaneous: members animate together off one clock", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=200, height=200, View [ x=0, y=0,
    grp: AnimatorGroup [ process=simultaneous, duration=100, motion=linear, started=false,
      Animator [ attribute=x, to=100 ],
      Animator [ attribute=y, to=50 ] ] ] ]`);
  const v = app.children[0];
  const grp = v.grp;
  assert.ok(grp instanceof AnimatorGroup, "the named group is reachable as a member");
  grp.start();
  assert.equal(sched.scheduled, true, "ONE ticker (the group) drives the members");
  sched.frame(0);
  assert.equal(v.x, 0);
  assert.equal(v.y, 0);
  sched.frame(50);
  assert.equal(v.x, 50, "x half-way");
  assert.equal(v.y, 25, "y half-way AT THE SAME TIME (simultaneous)");
  sched.frame(100);
  assert.equal(v.x, 100);
  assert.equal(v.y, 50);
  assert.equal(sched.scheduled, false, "the group goes idle when its last member finishes");
});

await test("A2 AnimatorGroup sequential: members animate one after another", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=200, height=200, View [ x=0, y=0,
    grp: AnimatorGroup [ process=sequential, duration=100, motion=linear, started=false,
      Animator [ attribute=x, to=100 ],
      Animator [ attribute=y, to=50 ] ] ] ]`);
  const v = app.children[0];
  const grp = v.grp;
  grp.start();
  sched.frame(0);
  assert.equal(v.x, 0);
  assert.equal(v.y, 0);
  sched.frame(50);
  assert.equal(v.x, 50);
  assert.equal(v.y, 0, "y has NOT started yet — sequential runs the head member first");
  sched.frame(100); // x finishes; sequential hands off to y next frame
  assert.equal(v.x, 100, "x landed");
  assert.equal(v.y, 0, "y still waiting");
  sched.frame(150); // y starts now (samples from the current 0)
  assert.equal(v.y, 0);
  sched.frame(200);
  assert.equal(v.y, 25, "y now animating");
  sched.frame(250);
  assert.equal(v.y, 50, "y landed — the whole group done");
  assert.equal(sched.scheduled, false);
});

await test("A2 AnimatorGroup: stop() cascades — halts every running member in place, then idles", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=200, height=200, View [ x=0, y=0,
    grp: AnimatorGroup [ process=simultaneous, duration=100, motion=linear, started=false,
      Animator [ attribute=x, to=100 ],
      Animator [ attribute=y, to=50 ] ] ] ]`);
  const v = app.children[0];
  const grp = v.grp;
  grp.start();
  sched.frame(0);
  sched.frame(50);
  assert.equal(v.x, 50);
  assert.equal(v.y, 25);
  grp.stop();
  assert.equal(v.x, 50, "member x halted in place (no snap)");
  assert.equal(v.y, 25, "member y halted in place");
  assert.equal(sched.scheduled, false, "the group's stop() takes it (and its members) off the clock");
  const [mx, my] = grp.children;
  assert.equal(mx.isRunning(), false, "member x is stopped");
  assert.equal(my.isRunning(), false, "member y is stopped");
});

await test("A2 AnimatorGroup: started=true auto-starts the group at init (members are group-driven)", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=200, height=200, View [ x=0, y=0,
    AnimatorGroup [ process=simultaneous, duration=100, motion=linear, started=true,
      Animator [ attribute=x, to=100 ],
      Animator [ attribute=y, to=50 ] ] ] ]`);
  assert.equal(sched.scheduled, true, "started=true → the group auto-started at build's init");
  const v = app.children[0];
  const grp = groupOf(v);
  assert.equal(grp.isRunning(), true, "the group is running");
  sched.frame(0);
  sched.frame(100);
  assert.equal(v.x, 100);
  assert.equal(v.y, 50);
  assert.equal(sched.scheduled, false);
});

await test("A2 AnimatorGroup: repeat replays the WHOLE group, landing exactly", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=200, height=200, View [ x=0,
    grp: AnimatorGroup [ process=simultaneous, duration=100, motion=linear, repeat=2, started=false,
      Animator [ attribute=x, from=0, to=100 ] ] ] ]`);
  const v = app.children[0];
  v.grp.start();
  sched.frame(0);
  sched.frame(50);
  assert.equal(v.x, 50, "cycle 1 half-way");
  sched.frame(100); // cycle 1 lands; the group replays its members fresh next frame
  assert.equal(v.x, 100, "cycle 1 landed");
  assert.equal(sched.scheduled, true, "one repeat left → still running");
  sched.frame(150); // cycle 2 re-runs the member from its start (replay the whole group)
  assert.equal(v.x, 0, "cycle 2 replays from the start");
  sched.frame(200);
  assert.equal(v.x, 50, "cycle 2 half-way");
  sched.frame(250);
  assert.equal(v.x, 100, "final cycle lands exactly");
  assert.equal(sched.scheduled, false);
});

await test("A2 AnimatorGroup: check accepts groups + member cascade; rejects non-animator children and a member with no slot", () => {
  assert.deepEqual(check(parseProgram(`App [ width=100, height=100, View [ x=0, y=0,
    AnimatorGroup [ process=simultaneous,
      Animator [ attribute=x, to=100, duration=100 ],
      Animator [ attribute=y, to=50, duration=100 ] ] ] ]`)), [], "a group of two animators checks clean");
  assert.deepEqual(check(parseProgram(`App [ width=100, height=100, View [ height=10,
    grp: AnimatorGroup [ attribute=height, process=sequential, duration=100,
      Animator [ to=100 ],
      Animator [ to=10 ] ] ] ]`)), [], "members inherit the group's `attribute` (the LZX default-cascade)");

  const typo = check(parseProgram(`App [ width=1, height=1, View [ AnimatorGroup [ attribute=heigth, Animator [ to=1 ] ] ] ]`));
  assert.ok(typo.some((e) => /attribute = heigth: View has no slot 'heigth'/.test(e.message)),
    `group attribute checked against target: ${typo.map((e) => e.message).join(" | ")}`);

  const nonAnim = check(parseProgram(`App [ width=1, height=1, View [
    AnimatorGroup [ Animator [ attribute=x, to=1 ], View [ ] ] ] ]`));
  assert.ok(nonAnim.some((e) => /coordinates animators — 'View' is not an Animator or AnimatorGroup/.test(e.message)),
    `non-animator child rejected: ${nonAnim.map((e) => e.message).join(" | ")}`);

  const noSlot = check(parseProgram(`App [ width=1, height=1, View [ AnimatorGroup [ Animator [ to=1 ] ] ] ]`));
  assert.ok(noSlot.some((e) => /needs 'attribute = <slot>'/.test(e.message)),
    `a member with no slot and no cascade is an error: ${noSlot.map((e) => e.message).join(" | ")}`);
});

await test("A2 AnimatorGroup: nested groups run in order and inherit cascade transitively", () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width=200, height=200, View [ x=0, y=0,
    outer: AnimatorGroup [ process=sequential, duration=100, motion=linear, started=false,
      Animator [ attribute=x, to=100 ],
      AnimatorGroup [ process=simultaneous,
        Animator [ attribute=y, to=50 ] ] ] ] ]`);
  const v = app.children[0];
  // the nested group's member inherited duration=100 / motion=linear from the
  // OUTER group (it set neither) — transitive cascade
  const nested = v.outer.children[1];
  assert.ok(nested instanceof AnimatorGroup, "the nested group is a member of the outer group");
  assert.equal(nested.children[0].duration, 100, "cascade threaded through the nested group to its member");
  assert.deepEqual(nested.children[0].motion, LINEAR);
  v.outer.start();
  sched.frame(0);
  sched.frame(50);
  assert.equal(v.x, 50, "sequential: the first member (x) runs first");
  assert.equal(v.y, 0, "the nested group waits its turn");
  sched.frame(100); // x lands; nested group is next
  assert.equal(v.x, 100);
  sched.frame(150); // nested group's member anchors
  sched.frame(200);
  assert.equal(v.y, 25, "the nested group now runs, at the cascaded duration");
  sched.frame(250);
  assert.equal(v.y, 50, "nested member lands — the whole outer group done");
  assert.equal(sched.scheduled, false);
});

await test("A2 AnimatorGroup: build cascades duration/motion to members; members keep their own attribute", () => {
  setClock(new Clock(fakeScheduler())); // isolate any auto-start
  const app = build(`App [ width=200, height=200, View [ x=0, y=0,
    grp: AnimatorGroup [ process=simultaneous, duration=250, motion=easeIn, started=false,
      Animator [ attribute=x, to=100 ],
      Animator [ attribute=y, to=50, duration=99 ] ] ] ]`);
  const grp = app.children[0].grp;
  const [mx, my] = grp.children;
  assert.ok(mx instanceof Animator && my instanceof Animator, "members are Animators under the group");
  assert.equal(mx.attribute, "x", "member keeps its own attribute");
  assert.equal(mx.duration, 250, "duration cascaded from the group");
  assert.deepEqual(mx.motion, EASEIN, "motion cascaded from the group");
  assert.equal(my.duration, 99, "a member's OWN duration is not overwritten by the cascade");
});

// ── include: the source-merge resolve phase (composition.md §1) ────────────
//
// An in-memory IncludeHost — a { dir → { file → source } } tree — drives every
// case with no real disk. resolve() joins fromDir + path (POSIX-ish), so a
// relative include from a subdir resolves against that subdir.

const memHost = (files) => ({
  resolve(fromDir, p) {
    // normalize fromDir/p into a canonical "/"-rooted path
    const parts = (fromDir + "/" + p).split("/").filter((s) => s && s !== ".");
    const stack = [];
    for (const s of parts) {
      if (s === "..") stack.pop();
      else stack.push(s);
    }
    const canonical = "/" + stack.join("/");
    if (!(canonical in files)) return null;
    const slash = canonical.lastIndexOf("/");
    return { canonical, dir: canonical.slice(0, slash) || "/", source: files[canonical] };
  },
});

await test("include resolves a class declared in another file", () => {
  const host = memHost({
    "/components.declare": "class Card extends View [ ]",
  });
  const app = build(
    'include [ "components.declare" ]\nApp [ width=10, height=10, Card [ ] ]',
    { host, originDir: "/" }
  );
  assert.equal(app.children.length, 1, "the included class instantiated as a child");
  assert.ok(app.children[0] instanceof View, "Card instance is a View");
  assert.equal(app.children[0].constructor.name, "Card", "instantiated as the included class Card");
});

await test("include is a flat namespace: an included class extends another included class", () => {
  const host = memHost({
    "/base.declare": "class Card extends View [ ]",
    "/derived.declare": 'include [ "base.declare" ]\nclass Fancy extends Card [ ]',
  });
  const { program, errors } = resolveIncludes(
    parseProgram('include [ "derived.declare" ]\nApp [ ]'),
    host,
    "/"
  );
  assert.equal(errors.length, 0, "no errors merging a two-file chain");
  assert.deepEqual(program.classes.map((c) => c.name).sort(), ["Card", "Fancy"]);
  assert.equal(program.includes.length, 0, "the merged program's includes are emptied");
});

await test("include diamond loads the shared file once (no false collision)", () => {
  const host = memHost({
    "/d.declare": "class Shared extends View [ ]",
    "/b.declare": 'include [ "d.declare" ]\nclass B extends View [ ]',
    "/c.declare": 'include [ "d.declare" ]\nclass C extends View [ ]',
    "/a.declare": 'include [ "b.declare", "c.declare" ]',
  });
  const { program, errors } = resolveIncludes(
    parseProgram('include [ "a.declare" ]\nApp [ ]'),
    host,
    "/"
  );
  assert.equal(errors.length, 0, "diamond: D merged once, no duplicate-name error");
  assert.equal(program.classes.filter((c) => c.name === "Shared").length, 1, "Shared folded exactly once");
  assert.deepEqual(program.classes.map((c) => c.name).sort(), ["B", "C", "Shared"]);
});

await test("include cycle (A↔B) terminates", () => {
  const host = memHost({
    "/a.declare": 'include [ "b.declare" ]\nclass A extends View [ ]',
    "/b.declare": 'include [ "a.declare" ]\nclass B extends View [ ]',
  });
  const { program, errors } = resolveIncludes(
    parseProgram('include [ "a.declare" ]\nApp [ ]'),
    host,
    "/"
  );
  assert.equal(errors.length, 0, "a cycle between two libraries terminates with no error");
  assert.deepEqual(program.classes.map((c) => c.name).sort(), ["A", "B"]);
});

await test("include collision: two files defining Foo is a positioned error naming both", () => {
  const host = memHost({
    "/a.declare": "class Foo extends View [ ]",
    "/b.declare": "class Foo extends View [ ]",
  });
  const { errors } = resolveIncludes(
    parseProgram('include [ "a.declare", "b.declare" ]\nApp [ ]'),
    host,
    "/"
  );
  assert.equal(errors.length, 1, "exactly one collision reported");
  assert.match(errors[0].message, /'Foo' is declared twice/);
  assert.match(errors[0].message, /"b\.declare"/, "names the later file");
  assert.match(errors[0].message, /"a\.declare"/, "names the earlier file");
  assert.ok(errors[0].pos, "the collision is positioned");
});

await test("include collision against the main program names 'the app'", () => {
  const host = memHost({ "/lib.declare": "class Foo extends View [ ]" });
  const { errors } = resolveIncludes(
    parseProgram('include [ "lib.declare" ]\nclass Foo extends View [ ]\nApp [ ]'),
    host,
    "/"
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /'Foo' is declared twice — in "lib\.declare" and "the app"/);
});

await test("an included file with a root is an error (library, not App)", () => {
  const host = memHost({ "/bad.declare": "class Card extends View [ ]\nApp [ ]" });
  const { errors } = resolveIncludes(
    parseProgram('include [ "bad.declare" ]\nApp [ ]'),
    host,
    "/"
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /an included file is a library of definitions/);
  assert.ok(errors[0].pos, "the stray-root error is positioned");
});

await test("a missing include is a positioned error naming the path", () => {
  const { errors } = resolveIncludes(
    parseProgram('include [ "nope.declare" ]\nApp [ ]'),
    memHost({}),
    "/"
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /cannot find include "nope\.declare"/);
  assert.ok(errors[0].pos, "positioned at the include string");
});

await test("include resolves relative to the including file's directory (subdir)", () => {
  const host = memHost({
    "/app/main.declare": 'include [ "lib/parts.declare" ]',
    "/app/lib/parts.declare": 'include [ "shared.declare" ]\nclass Part extends View [ ]',
    "/app/lib/shared.declare": "class Shared extends View [ ]",
  });
  // main.declare (in /app) includes lib/parts.declare; parts (in /app/lib)
  // includes "shared.declare", which must resolve against /app/lib.
  const { program, errors } = resolveIncludes(
    parseProgram('include [ "main.declare" ]\nApp [ ]'),
    host,
    "/app"
  );
  assert.equal(errors.length, 0, "the nested relative include resolved against the subdir");
  assert.deepEqual(program.classes.map((c) => c.name).sort(), ["Part", "Shared"]);
});

await test("parseLibrary rejects a non-string include entry", () => {
  assert.throws(() => parseLibrary("include [ foo ]"), /an include path is a quoted string/);
});

await test("a source with no includes behaves exactly as before (no host needed)", () => {
  const app = build("App [ width=10, height=10, View [ ] ]");
  assert.equal(app.children.length, 1, "zero-include build is unchanged and needs no host");
});

// ── compile() emits a SELF-CONTAINED source (composition.md §1) ─────────────
//
// The hard requirement: a program that USES an include compiles to ONE source
// with every included class spliced in, no `include` directive left, and every
// body bare-name-resolved — so build()/render() run it with NO host.

await test("compile() emits a self-contained source: no include directive, includes the class, builds hostless", () => {
  const host = memHost({
    // an included class whose method body uses a bare name — it must be
    // resolved in the emitted source, not left for a host that won't exist.
    "/lib.declare": "class Card extends View [ w: Length = 5, tint(other: number) { w = other } ]",
  });
  const r = compile('include [ "lib.declare" ]\nApp [ width=10, height=10, Card [ ] ]', { host, originDir: "/" });
  assert.equal(r.errors.length, 0, "compiles clean");
  assert.ok(!/include\s*\[/.test(r.source), "(2) the include directive is gone");
  assert.match(r.source, /class Card extends View/, "(1) the included class is present");
  assert.match(r.source, /this\.w = other/, "(3) the included body's bare name resolved");
  // (c) the emitted source builds with NO host and instantiates the component.
  const app = build(r.source);
  assert.equal(app.children.length, 1, "hostless build instantiates the app tree");
  assert.equal(app.children[0].constructor.name, "Card", "…as the included class Card");
});

await test("compile() emit: a diamond splices the shared file's class exactly once", () => {
  const host = memHost({
    "/d.declare": "class Shared extends View [ ]",
    "/b.declare": 'include [ "d.declare" ]\nclass B extends Shared [ ]',
    "/c.declare": 'include [ "d.declare" ]\nclass C extends Shared [ ]',
    "/a.declare": 'include [ "b.declare", "c.declare" ]',
  });
  const r = compile('include [ "a.declare" ]\nApp [ width=1, height=1, B [ ], C [ ] ]', { host, originDir: "/" });
  assert.equal(r.errors.length, 0, "diamond compiles clean");
  assert.equal((r.source.match(/class Shared extends View/g) ?? []).length, 1, "Shared appears exactly once");
  // dependency-first order: the base Shared precedes its subclasses B and C.
  assert.ok(r.source.indexOf("class Shared") < r.source.indexOf("class B"), "base above subclass");
  const app = build(r.source);
  assert.deepEqual(app.children.map((c) => c.constructor.name), ["B", "C"], "both included subclasses instantiate hostless");
});

await test("compile() emit: an included body's bare name is fully resolved (nothing unresolved reaches output)", () => {
  // ("" + gap): a bare number into the string-typed `text` slot is rejected on
  // BOTH sides of the brackets — declaratively (`text = 3` errors) and by the
  // typecheck phase — so the fixture converts explicitly, as an app would.
  const host = memHost({
    "/lib.declare": 'class Box extends View [ gap: number = 3,\n  Text [ text = { "" + gap } ] ]',
  });
  const r = compile('include [ "lib.declare" ]\nApp [ width=1, height=1, Box [ ] ]', { host, originDir: "/" });
  assert.equal(r.errors.length, 0, "compiles clean: " + r.report);
  // `gap` inside the named child's body means the enclosing class root's gap.
  assert.match(r.source, /text = \{ "" \+ classroot\.gap \}/, "the included nested body resolved to classroot.gap");
  assert.doesNotThrow(() => build(r.source), "the emitted source is self-contained");
});

await test("compile() emit: collision across included files still reports (file-named)", () => {
  const host = memHost({
    "/a.declare": "class Foo extends View [ ]",
    "/b.declare": "class Foo extends View [ ]",
  });
  const r = compile('include [ "a.declare", "b.declare" ]\nApp [ ]', { host, originDir: "/" });
  assert.equal(r.source, null, "a collision blocks emission");
  assert.equal(r.errors.length, 1, "one collision reported");
  assert.match(r.errors[0].message, /'Foo' is declared twice/);
  assert.match(r.errors[0].message, /"a\.declare"/, "names both files");
  assert.match(r.errors[0].message, /"b\.declare"/);
});

await test("compile() emit: a missing include still reports (file-named), no source", () => {
  const r = compile('include [ "nope.declare" ]\nApp [ ]', { host: memHost({}), originDir: "/" });
  assert.equal(r.source, null, "a missing include blocks emission");
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /cannot find include "nope\.declare"/);
});

// ── States (docs/system-design/states.md): overrides, precedence, child subtree ───

await test("state: a gated override applies and reverts to the base value", () => {
  const app = build(`class Card extends View [ width = 80, height = 40, fill = #111111,
      editing: boolean = false,
      grow: State [ applied = { parent.editing }, height = 200, fill = #222222 ],
    ]
    App [ width = 100, height = 100, card: Card [] ]`);
  const card = app.card;
  assert.equal(card.height, 40, "base height before apply");
  assert.equal(card.fill, 0x111111, "base fill before apply");
  card.editing = true;
  settle();
  assert.equal(card.height, 200, "override height while applied");
  assert.equal(card.fill, 0x222222, "override fill while applied");
  card.editing = false;
  settle();
  assert.equal(card.height, 40, "height reverts to base on remove");
  assert.equal(card.fill, 0x111111, "fill reverts to base on remove");
});

await test("state: declaration order is precedence — later-declared wins, both insert orders", () => {
  const app = build(`class Btn extends View [ width = 50, height = 20, fill = #000000,
      hot: boolean = false, disabled: boolean = false,
      hover: State [ applied = { parent.hot }, fill = #00FF00 ],
      off:   State [ applied = { parent.disabled }, fill = #FF0000 ],
    ]
    App [ width = 100, height = 100, b: Btn [] ]`);
  const b = app.b;
  assert.equal(b.fill, 0x000000, "base");
  // lower (hover) first, then higher (off) displaces it on top
  b.hot = true; settle();
  assert.equal(b.fill, 0x00ff00, "hover applied");
  b.disabled = true; settle();
  assert.equal(b.fill, 0xff0000, "off declared last wins over hover");
  b.disabled = false; settle();
  assert.equal(b.fill, 0x00ff00, "off removed — hover resumes as top");
  b.hot = false; settle();
  assert.equal(b.fill, 0x000000, "both removed — base restored");
  // higher (off) first, then lower (hover) inserts BELOW it and stays dormant
  b.disabled = true; settle();
  assert.equal(b.fill, 0xff0000, "off applied");
  b.hot = true; settle();
  assert.equal(b.fill, 0xff0000, "hover is lower — dormant under off, no change");
  b.disabled = false; settle();
  assert.equal(b.fill, 0x00ff00, "off removed — the dormant hover becomes top");
  b.hot = false; settle();
  assert.equal(b.fill, 0x000000, "base restored");
});

await test("state: a structural state adds and tears down a child subtree", () => {
  const app = build(`class Disc extends View [ width = 100, height = 20, fill = #EEEEEE,
      open: boolean = false,
      opened: State [ applied = { parent.open },
        detail: View [ width = 90, height = 10, fill = #123456 ],
      ],
    ]
    App [ width = 100, height = 100, d: Disc [] ]`);
  const d = app.d;
  const viewKids = () => d.children.filter((c) => c instanceof View);
  assert.equal(viewKids().length, 0, "no detail before apply (the state node is non-View)");
  assert.equal(d.detail, undefined, "no named member before apply");
  d.open = true; settle();
  assert.equal(viewKids().length, 1, "detail instantiated on apply");
  assert.ok(d.detail instanceof View, "detail reachable by name while applied");
  assert.equal(d.detail.fill, 0x123456, "detail built with its attributes");
  d.open = false; settle();
  assert.equal(viewKids().length, 0, "detail torn down on remove");
  assert.equal(d.detail, undefined, "named member dropped on remove");
});

await test("state: the verbs apply/remove/toggle drive an ungated state imperatively", () => {
  const app = build(`class Panel extends View [ width = 80, height = 40,
      edit: State [ height = 200 ],
    ]
    App [ width = 100, height = 100, p: Panel [] ]`);
  const p = app.p;
  assert.equal(p.height, 40, "base");
  p.edit.apply();
  assert.equal(p.height, 200, "apply() installs the override synchronously");
  assert.equal(p.edit.applied, true, "applied reflects the verb");
  p.edit.remove();
  assert.equal(p.height, 40, "remove() reverts");
  p.edit.toggle();
  assert.equal(p.height, 200, "toggle() on");
  p.edit.toggle();
  assert.equal(p.height, 40, "toggle() off");
});

await test("state: a structural state attaches and destroys the child's SURFACE on a live tree", () => {
  // The build()-based tests above prove model linkage; this proves the render
  // path — buildChildren attaches the child's surface when the target is live,
  // and discard destroys it on remove. A mock RenderBackend counts surfaces
  // (every Surface method is a no-op except destroy, which decrements the live
  // count) so the attach/detach is checked without a browser.
  const mockSurface = (backend) => {
    const s = { __dead: false };
    return new Proxy(s, {
      get(t, k) {
        if (k === "destroy") return () => { if (!t.__dead) { t.__dead = true; backend.live--; } };
        if (k in t) return t[k];
        return () => {}; // setX/setFill/insertChild/… — no-ops
      },
    });
  };
  class MockBackend {
    live = 0;
    createSurface() { this.live++; return mockSurface(this); }
    attachRoot() {}
  }
  const app = build(`class Disc extends View [ width = 100, height = 20, fill = #EEEEEE,
      open: boolean = false,
      opened: State [ applied = { parent.open },
        detail: View [ width = 90, height = 10, fill = #123456 ],
      ],
    ]
    App [ width = 100, height = 100, d: Disc [] ]`);
  const backend = new MockBackend();
  app.attach(backend, null);
  const base = backend.live;
  assert.ok(base >= 2, "app + Disc surfaces live after attach");
  app.d.open = true; settle();
  assert.equal(backend.live, base + 1, "the detail view's surface is created + attached on apply");
  assert.ok(app.d.detail.surface !== null, "detail carries a live surface");
  app.d.open = false; settle();
  assert.equal(backend.live, base, "the detail surface is destroyed on remove");
});

await test("state: a gated state rejects the verbs (gate XOR verbs)", () => {
  const app = build(`class Gated extends View [ width = 80, height = 40, on: boolean = false,
      s: State [ applied = { parent.on }, height = 200 ],
    ]
    App [ width = 100, height = 100, g: Gated [] ]`);
  assert.throws(() => app.g.s.apply(), /bound by a constraint/, "apply() on a gated state errors");
  assert.throws(() => app.g.s.toggle(), /bound by a constraint/, "toggle() too");
});

// ── Typecheck (tsc over { } bodies) + unified diagnostics ──────────────────

await test("typecheck: a cross-boundary type error is caught, mapped to its .declare line", () => {
  const src = [
    "class Card extends View [ width = 80,", // line 1
    "  flag: boolean = false,", //             line 2
    "  height = { flag },", //                 line 3 — boolean → Length: TS2322
    "]", //                                    line 4
    "App [ width = 100, height = 100, Card [] ]", // line 5
  ].join("\n");
  const r = compile(src, { typecheck: true });
  assert.equal(r.source, null, "a type error blocks emission");
  const type = r.diagnostics.filter((d) => d.phase === "typecheck");
  assert.equal(type.length, 1, `exactly one type diagnostic, got ${JSON.stringify(r.diagnostics)}`);
  assert.equal(type[0].code, "DECLARE6001");
  assert.equal(type[0].pos.line, 3, "mapped to the offending body's line");
  // The message layer re-says tsc's "Type 'boolean' is not assignable to type
  // 'Length'" in the diagnostic contract's voice (diagnostics.md §4): it names
  // the slot, the computed type, and the canonical rewrite.
  assert.match(type[0].message, /'height' computes a boolean.*typed Length/);
  assert.match(type[0].message, /ternary that yields numbers/, "the canonical fix is named");
});

await test("typecheck: a valid program passes and still emits source", () => {
  const src = `class Card extends View [ width = 80, flag: boolean = false,
  height = { flag ? 200 : 25 },
]
App [ width = 100, height = 100, Card [] ]`;
  const r = compile(src, { typecheck: true });
  assert.equal(r.errors.length, 0, `no errors, got ${JSON.stringify(r.errors)}`);
  assert.ok(r.source !== null, "valid program emits source");
  assert.equal(r.diagnostics.filter((d) => d.phase === "typecheck").length, 0);
});

await test("diagnostics: every phase's error carries a coded, phase-classified Diagnostic", () => {
  // syntax
  let d = compile("App [ x= ]").diagnostics;
  assert.equal(d[0].phase, "syntax");
  assert.match(d[0].code, /^DECLARE1/);
  // structure (unknown component) — a coded catalog entry
  d = compile("App [ Bogus [] ]").diagnostics;
  const unknown = d.find((x) => x.message.includes("unknown component"));
  assert.equal(unknown.code, "DECLARE2001", "unknownComponent is DECLARE2001");
  assert.equal(unknown.phase, "structure");
  // name resolution
  d = compile("App [ width = 100, height = 100, View [ x = { nope } ] ]").diagnostics;
  const unresolved = d.find((x) => x.message.includes("cannot resolve"));
  assert.equal(unresolved.code, "DECLARE4001");
  assert.equal(unresolved.phase, "name");
});

// ── Keys service (docs/system-design/input.md, Layer 1) ───────────────────────────

const kev = (code, over = {}) => ({ code, key: code, shift: false, ctrl: false, alt: false, meta: false, repeat: false, ...over });

await test("keys: listen is IDEMPOTENT per target — a re-mount replaces the wire, never stacks it", () => {
  // The native-host N² bug (2026-08-01): wireInput runs per mount, and a
  // long-lived host mounts app after app into one process. Un-guarded, each
  // mount stacked another listener trio whose alive() never went false, so a
  // single Tab advanced focus once per mount ever made, squared — measured as
  // nextCalls 9/16/25/36 across four boots, its parity alternating, presenting
  // for two days as a focus coin toss. A browser can never exhibit this (one
  // document, one mount), so the pin lives here, where no host is needed.
  const registered = [];
  const target = {
    addEventListener: (type, fn) => registered.push([type, fn]),
    removeEventListener: (type, fn) => {
      const i = registered.findIndex(([t, f]) => t === type && f === fn);
      if (i >= 0) registered.splice(i, 1);
    },
  };
  const keys = new KeysService();
  keys.listen(() => true, target);
  const after1 = registered.length;
  keys.listen(() => true, target);  // the second mount
  keys.listen(() => true, target);  // and a third
  assert.equal(after1, 3, "one wire = the keydown/keyup/blur trio");
  assert.equal(registered.length, 3, "re-mounting replaces the liveness probe — it adds NOTHING");
});

await test("keys: a replaced liveness probe governs — the newest app owns the wire", () => {
  const handlers = {};
  const target = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    removeEventListener: (type) => { delete handlers[type]; },
  };
  const keys = new KeysService();
  let firstAlive = true;
  keys.listen(() => firstAlive, target);
  keys.listen(() => true, target);   // the re-mount installs an always-live probe
  firstAlive = false;                // the FIRST app dies
  const seen = [];
  keys.onKeyDown((e) => seen.push(e.code));
  // were the first probe still governing, this event would retire the wire
  handlers.keyup({ code: "KeyA", key: "a", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false });
  assert.ok(handlers.keyup !== undefined, "the wire survives the old app's death — the new probe governs");
});

await test("focus: deliverKeys is once per service pair; off() re-arms it", () => {
  // The other half of the N² bug: deliverKeys per mount stacked delivery
  // handlers with no liveness at all. Now: same pair → the same off, one
  // handler; off() genuinely unhooks and a later call wires fresh.
  const keys = new KeysService();
  const focus = new FocusService();
  let advances = 0;
  const origNext = focus.next.bind(focus);
  focus.next = () => { advances++; origNext(); };
  const off1 = deliverKeys(keys, focus);
  const off2 = deliverKeys(keys, focus);
  const off3 = deliverKeys(keys, focus);
  assert.equal(off2, off1, "a repeat delivery on the same pair is the SAME wiring");
  assert.equal(off3, off1, "…however many times");
  const tab = { code: "Tab", key: "Tab", shift: false, ctrl: false, alt: false, meta: false, repeat: false };
  keys.keyDown(tab);
  assert.equal(advances, 1, "one Tab, one advance — never one per mount");
  off1();
  keys.keyDown(tab);
  assert.equal(advances, 1, "off() unhooks for real");
  deliverKeys(keys, focus);
  keys.keyDown(tab);
  assert.equal(advances, 2, "and a fresh delivery after off() wires again");
});

await test("keys: the held-set tracks pressed keys (isDown / held)", () => {
  const K = new KeysService();
  assert.equal(K.isDown("KeyA"), false);
  K.keyDown(kev("KeyA"));
  K.keyDown(kev("ShiftLeft"));
  assert.equal(K.isDown("KeyA"), true);
  assert.deepEqual(K.held().sort(), ["KeyA", "ShiftLeft"]);
  K.keyUp(kev("KeyA"));
  assert.equal(K.isDown("KeyA"), false);
  assert.deepEqual(K.held(), ["ShiftLeft"]);
});

await test("keys: onKeyDown / onKeyUp streams fire with the event; unsubscribe stops them", () => {
  const K = new KeysService();
  const downs = [];
  const ups = [];
  const off = K.onKeyDown((e) => downs.push(e.code));
  K.onKeyUp((e) => ups.push(e.code));
  K.keyDown(kev("KeyX", { ctrl: true }));
  K.keyUp(kev("KeyX"));
  assert.deepEqual(downs, ["KeyX"]);
  assert.deepEqual(ups, ["KeyX"]);
  off();
  K.keyDown(kev("KeyY"));
  assert.deepEqual(downs, ["KeyX"], "an unsubscribed handler no longer fires");
});

await test("keys: a chord fires once when complete, not on partial, and re-arms", () => {
  const K = new KeysService();
  let n = 0;
  K.onChord(["ControlLeft", "KeyS"], () => n++);
  K.keyDown(kev("ControlLeft"));
  assert.equal(n, 0, "a partial chord does not fire");
  K.keyDown(kev("KeyS"));
  assert.equal(n, 1, "the completed chord fires");
  K.keyDown(kev("KeyS", { repeat: true }));
  assert.equal(n, 1, "a held/repeat does not re-fire");
  K.keyUp(kev("KeyS"));
  K.keyDown(kev("KeyS"));
  assert.equal(n, 2, "re-arms after release, fires again");
});

await test("keys: clearHeld releases everything and disarms chords", () => {
  const K = new KeysService();
  let n = 0;
  K.onChord(["KeyA", "KeyB"], () => n++);
  K.keyDown(kev("KeyA"));
  K.keyDown(kev("KeyB"));
  assert.equal(n, 1);
  K.clearHeld();
  assert.equal(K.isDown("KeyA"), false);
  assert.deepEqual(K.held(), []);
  K.keyDown(kev("KeyA"));
  K.keyDown(kev("KeyB"));
  assert.equal(n, 2, "the chord re-fires after a clear disarmed it");
});

// ── Focus service (docs/system-design/input.md, Layer 2) ──────────────────────────

await test("focus: the default sequence is tree preorder of focusable+visible views", () => {
  Focus.reset();
  const app = build(`App [ width = 100, height = 100,
    a: View [ focusable = true ],
    group: View [ b: View [ focusable = true ], c: View [ focusable = true ] ],
    d: View [ focusable = true ],
  ]`);
  Focus.setRoot(app);
  assert.deepEqual(Focus.sequenceFor(null), [app.a, app.group.b, app.group.c, app.d],
    "non-focusable container descended, focusables in source order");
});

await test("focus: next / prev step through the sequence and cycle", () => {
  Focus.reset();
  const app = build(`App [ width = 100, height = 100,
    a: View [ focusable = true ], b: View [ focusable = true ], c: View [ focusable = true ],
  ]`);
  Focus.setRoot(app);
  Focus.focus(app.a);
  assert.equal(Focus.getFocus(), app.a);
  Focus.next(); assert.equal(Focus.getFocus(), app.b);
  Focus.next(); assert.equal(Focus.getFocus(), app.c);
  Focus.next(); assert.equal(Focus.getFocus(), app.a, "cycles past the end");
  Focus.prev(); assert.equal(Focus.getFocus(), app.c, "prev wraps back");
});

await test("focus: a tabOrder() override reorders a container's members", () => {
  Focus.reset();
  const app = build(`class Rev extends View [ width = 50, height = 50,
      tabOrder() { return [this.c, this.b] },
      b: View [ focusable = true ], c: View [ focusable = true ],
    ]
    App [ width = 100, height = 100, r: Rev [] ]`);
  Focus.setRoot(app);
  assert.deepEqual(Focus.sequenceFor(null), [app.r.c, app.r.b], "override reverses b/c");
});

await test("focus: a focusTrap bounds the group, cycles within, and escapes at the edge", () => {
  Focus.reset();
  globalThis.__esc = 0;
  const app = build(`App [ width = 100, height = 100,
    a: View [ focusable = true ],
    dialog: View [ focusTrap = true, onEscapeFocus() { globalThis.__esc = globalThis.__esc + 1 },
      p: View [ focusable = true ], q: View [ focusable = true ] ],
    b: View [ focusable = true ],
  ]`);
  Focus.setRoot(app);
  assert.deepEqual(Focus.sequenceFor(app.a), [app.a, app.b], "the trap's contents are excluded from the outer group");
  Focus.focus(app.dialog.p);
  Focus.next(); assert.equal(Focus.getFocus(), app.dialog.q, "moves within the trap");
  Focus.next(); assert.equal(Focus.getFocus(), app.dialog.p, "cycles within the trap");
  assert.equal(globalThis.__esc, 1, "onEscapeFocus fired at the boundary");
});

await test("focus: byKeyboard() — the focus-visible modality: Tab sets it, a direct focus clears it", () => {
  Focus.reset();
  const app = build(`App [ width = 100, height = 100,
    a: View [ focusable = true ], b: View [ focusable = true ],
  ]`);
  Focus.setRoot(app);
  Focus.focus(app.a);
  assert.equal(Focus.byKeyboard(), false, "a pointer/programmatic focus is not keyboard modality");
  Focus.next();
  assert.equal(Focus.byKeyboard(), true, "Tab traversal is keyboard modality — the ring's gate");
  Focus.focus(app.b);
  assert.equal(Focus.byKeyboard(), false, "clicking after tabbing clears it again");
});

await test("contentHeight over a replication-populated container re-derives on ARRIVAL (the structure cell)", () => {
  // The COMPILED path (static dep wiring — the real-world path): the panel
  // constraint reads body.contentHeight while replicated rows arrive later;
  // extentOf tracks the child-LIST (the structure cell), so arrival and
  // removal re-derive — the menu-panel freeze, fixed at the root. Rows are
  // driven by a real reactive input (app.n), per the write-displaces rule.
  const r = compile(`App [ width = 200, height = 300,
    n: number = 1,
    d: Dataset [ contents = { ({ rows: Array.from({ length: app.n }, (_, i) => ({ h: 20 + i * 30 })) }) } ],
    panel: View [ width = 100, height = { this.body.contentHeight + 10 },
      body: View [ width = 100, datapath = { app.d.value },
        View [ datapath = :rows[], width = 10, height = { 0 + :h } ],
      ],
    ],
    t: Text [ text = "x" ],
  ]`, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const app = build(r.source, { deps: r.deps });
  settle();
  assert.equal(app.panel.height, 30, "one row of 20 -> 30");
  app.n = 2;
  settle();
  // no layout in the test body: rows overlap at y=0, so the extent is the
  // MAX child (50), not the sum — what matters is that it re-derived at all
  assert.equal(app.panel.height, 60, "arrival re-derives: max(20, 50) + 10");
  app.n = 1;
  settle();
  assert.equal(app.panel.height, 30, "removal re-derives too");
  app.createView("View", app.panel.body, { width: 5, height: 90 });
  settle();
  assert.equal(app.panel.height, 100, "imperative arrival (createView) re-derives too");
  // the RE-WIRE half: the arrival refreshed the constraint's edges, so an
  // ATTRIBUTE change on the newly-arrived child propagates (without re-wiring,
  // the wired path's fixed edges predate this child and would stay silent)
  const made = app.panel.body.children[app.panel.body.children.length - 1];
  made.height = 130;
  settle();
  assert.equal(app.panel.height, 140, "post-arrival attr change re-derives (structural re-wire)");
});

await test("a Text's contentWidth measures its glyphs and re-measures on a bound-text change (field report A2)", () => {
  // A container auto-sizing to a Text's contentWidth — a pill/badge. Before the
  // fix a Text reported the base contentExtent (0), so the box never fit the
  // glyphs and never grew when the bound text changed. Text.contentExtent now
  // folds in the measured extent, read under tracking, so it re-derives on a
  // text change the way a data-driven width should.
  const r = compile(`App [ width = 400, height = 100,
    label: string = "Hi",
    pill: View [ height = 30, width = { 20 + this.t.contentWidth },
      t: Text [ text = { app.label } ] ],
  ]`, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const app = settleHeadless(r.source, { deps: r.deps });
  try {
    assert.ok(app.pill.t.contentWidth > 0, `Text.contentWidth reflects glyphs (was the base 0), got ${app.pill.t.contentWidth}`);
    const narrow = app.pill.width;
    assert.ok(narrow > 20, `the box fits the short text (> 20 padding), got ${narrow}`);
    app.label = "A much longer label than before";
    settle();
    assert.ok(app.pill.width > narrow + 40, `re-measured to the longer bound text: ${narrow} -> ${app.pill.width}`);
  } finally {
    app.discard();
  }
});

await test("Text.lineHeight: a fontSize multiplier drives wrapped height, contentHeight, and the auto-height derive", () => {
  // The leading knob (assessment 1.2, landed 2026-08-06): 0 keeps the font's
  // natural line box; a multiplier makes each line advance
  // round(fontSize × lineHeight), in the measurer and both backends alike.
  const r = compile(`App [ width = 400, height = 400,
    a: Text [ width = 120, fontSize = 16, text = "a paragraph long enough to wrap onto several lines for the measure" ],
    b: Text [ width = 120, fontSize = 16, lineHeight = 1.5, text = "a paragraph long enough to wrap onto several lines for the measure" ],
  ]`, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const app = settleHeadless(r.source, { deps: r.deps });
  try {
    assert.ok(app.a.height > 16, `the natural paragraph wrapped (${app.a.height})`);
    assert.ok(app.b.height > app.a.height * 1.1,
      `1.5 leading is taller than natural: ${app.a.height} -> ${app.b.height}`);
    assert.ok(app.b.contentHeight > app.a.contentHeight, "contentHeight follows the leading");
    // reactive: widen the leading and the auto height re-derives
    app.b.lineHeight = 2.0;
    settle();
    assert.ok(app.b.height > app.a.height * 1.4, `leading is live (${app.b.height})`);
  } finally {
    app.discard();
  }
});

await test("createView: imperative creation by name — a full citizen, loudly-checked names", () => {
  const app = build(`class Chip extends View [ width = 30, height = 10,
    label: string = "",
    t: Text [ text = { classroot.label } ],
  ]
App [ width = 200, height = 100,
  slot: View [ x = 10, y = 10, width = 100, height = 60 ],
]`);
  const made = app.createView("Chip", app.slot, { label: "made", x: 5 });
  assert.equal(made.constructor.name, "Chip");
  assert.equal(app.slot.children[app.slot.children.length - 1], made, "inserted LAST among the parent's children");
  assert.equal(made.parent, app.slot);
  assert.equal(made.x, 5, "props are ordinary writes");
  settle();
  assert.equal(made.t.text, "made", "bindings installed and settled — a full citizen");
  const before = app.slot.children.length;
  app.slot.removeChild(made);   // removal and teardown are two verbs (the replicator's own order)
  made.discard();
  assert.equal(app.slot.children.length, before - 1, "removeChild + discard — the imperative lifecycle's exit");
  const builtin = app.createView("Text", app, { text: "raw" });
  assert.equal(builtin.constructor.name, "Text", "built-in tags resolve too");
  assert.throws(() => app.createView("Nope", app), /no component named 'Nope'.*use \[ Nope \]/s,
    "an unknown name throws and NAMES the fix");
});

await test("tip: the attribute auto-provides the Tooltip singleton (the FocusRing mechanism)", () => {
  const r = compile(`App [ width=100, height=100, b: View [ tip = "hello", onClick() { } ] ]`);
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  assert.ok(r.source.includes("class Tooltip"), "the library file was auto-included");
  assert.ok(r.source.includes("Tooltip [ ],"), "the singleton was spliced as the LAST App child (source order stacks)");
  const none = compile(`App [ width=100, height=100, b: View [ onClick() { } ] ]`);
  assert.ok(!none.source.includes("class Tooltip"), "no tip anywhere -> no Tooltip");
  const own = compile(`App [ width=100, height=100, b: View [ tip = "x", onClick() { } ], t: Tooltip [ ] ]`);
  assert.equal(own.errors.length, 0, "an app-declared Tooltip compiles (bare-tag auto-include)");
  assert.ok(!own.source.includes("// the tooltip singleton — provided"), "an app-declared Tooltip suppresses the auto splice");
  // The trigger is SCOPED to View descendants (the manifest's onBase): a
  // Node-descended class owns its own attribute names — an attr named `tip`
  // there is the author's slot (a gratuity, a pen tip), never a tooltip.
  const node = compile(`class Meter extends Node [ tip: number = 15 ]
App [ width=100, height=100, m: Meter [ tip = 20 ], t: Text [ text = "x" ] ]`);
  assert.equal(node.errors.length, 0, node.errors.map((e) => e.message).join("; "));
  assert.ok(!node.source.includes("class Tooltip"), "tip on a NON-View node does not summon the Tooltip");
});

await test("tip: the service's platform conventions — delay, warm retarget, press cools", async () => {
  const { Tip } = await import("../runtime/dist/tip.js");
  const a = { tip: "A", x: 5, y: 6, width: 10, height: 10, parent: null };
  const b = { tip: "B", x: 50, y: 6, width: 10, height: 10, parent: null };
  const seen = [];
  const un = Tip.onTip((e) => seen.push(e === null ? null : e.text));
  try {
    Tip.over(a);
    assert.deepEqual(seen, [], "nothing before the delay");
    await new Promise((r) => setTimeout(r, 620));
    assert.deepEqual(seen, ["A"], "shown after the delay");
    Tip.out(a);
    assert.deepEqual(seen, ["A", null], "departure hides");
    Tip.over(b);
    assert.deepEqual(seen, ["A", null, "B"], "warm retarget shows the next tip INSTANTLY");
    Tip.hide();
    assert.deepEqual(seen, ["A", null, "B", null], "a press dismisses");
    Tip.over(a);
    assert.deepEqual(seen, ["A", null, "B", null], "and COOLS - the next hover earns the delay again");
  } finally {
    un(); Tip.hide();
  }
});

await test("focus: byKeyboard() is a TRACKED read — a styling constraint follows the modality", async () => {
  // The component channel's gate (a Tab header's focus edge): the constraint
  // reads Focus.byKeyboard(), so a modality flip re-derives it — including a
  // pointer press on an already-keyboard-focused control (edge must vanish).
  Focus.reset();
  const app = build(`App [ width = 100, height = 100,
    a: View [ focusable = true ], b: View [ focusable = true ],
  ]`);
  Focus.setRoot(app);
  const { Constraint } = await import("../runtime/dist/reactive.js");
  const seen = [];
  const k = new Constraint("test", () => Focus.byKeyboard(), (v) => seen.push(v));
  k.run();
  assert.deepEqual(seen, [false]);
  Focus.focus(app.a);
  Focus.next();               // keyboard modality on
  settle();
  assert.deepEqual(seen, [false, true], "Tab flipped the constraint on");
  Focus.focus(app.a);         // a press on the focused control — modality clears
  settle();
  assert.deepEqual(seen, [false, true, false], "the press re-derived the edge away");
});

await test("focus: two apps on one page — Tab cycles within the focused view's OWN tree", () => {
  // The embedded-preview case: the page's rootView is the HOST app, but focus
  // sits in a second tree (the child app). Tab must cycle within the child,
  // never jump to the host's first stop (the docs editor bug).
  Focus.reset();
  const host = build(`App [ width = 100, height = 100,
    editor: View [ focusable = true ], other: View [ focusable = true ],
  ]`);
  const child = build(`App [ width = 50, height = 50,
    p: View [ focusable = true ], q: View [ focusable = true ],
  ]`);
  Focus.setRoot(host); // the top-level app owns the page's focus root
  Focus.focus(child.p);
  Focus.next(); assert.equal(Focus.getFocus(), child.q, "Tab stays in the child app");
  Focus.next(); assert.equal(Focus.getFocus(), child.p, "and cycles within it");
  // tearing the child down drops focus rather than re-anchoring into the host
  child.discard();
  assert.equal(Focus.getFocus(), null, "a discarded child's focus is dropped, not moved to the host's editor");
});

await test("focus: keyboard delivery — Tab traverses, other keys reach the focused view", () => {
  Focus.reset();
  globalThis.__k = [];
  const app = build(`App [ width = 100, height = 100,
    a: View [ focusable = true, onKeyDown(e: KeyEvent) { globalThis.__k.push("a:" + e.code) } ],
    b: View [ focusable = true, onKeyDown(e: KeyEvent) { globalThis.__k.push("b:" + e.code) } ],
  ]`);
  Focus.setRoot(app);
  Focus.focus(app.a);
  const K = new KeysService();
  deliverKeys(K, Focus);
  K.keyDown(kev("KeyH"));
  assert.deepEqual(globalThis.__k, ["a:KeyH"], "a key reaches the focused view");
  K.keyDown(kev("Tab"));
  assert.equal(Focus.getFocus(), app.b, "Tab is consumed by traversal, not delivered");
  K.keyDown(kev("KeyJ"));
  assert.deepEqual(globalThis.__k, ["a:KeyH", "b:KeyJ"], "keys follow focus");
});

await test("focus: discarding the focused subtree moves focus to a live neighbor", () => {
  Focus.reset();
  const app = build(`App [ width = 100, height = 100,
    a: View [ focusable = true ], b: View [ focusable = true ],
  ]`);
  Focus.setRoot(app);
  Focus.focus(app.b);
  assert.equal(Focus.getFocus(), app.b);
  app.b.discard();
  assert.equal(Focus.getFocus(), app.a, "focus moved off the discarded view to the survivor");
});

// ── TextInput (docs/system-design/input.md, Layer 3) ──────────────────────────────

const lastSpec = (log) => log.filter((e) => e[0] === "setEditable").at(-1)?.[1];
const activations = (log) => log.filter((e) => e[0] === "activateEditable").map((e) => e[1]);

await test("textinput: installs a native editable spec and is focusable by default", () => {
  const log = [];
  const app = build(`App [ width = 100, height = 100,
    inp: TextInput [ text = "hi", placeholder = "name" ],
  ]`);
  app.attach(mockBackend(log), null);
  const spec = lastSpec(log);
  assert.equal(spec.value, "hi");
  assert.equal(spec.placeholder, "name");
  assert.equal(spec.multiline, false);
  assert.equal(spec.spellcheck, true, "spellcheck defaults on (prose field)");
  assert.equal(app.inp.focusable, true, "a TextInput is a tab stop by default");
});

await test("textinput: spellcheck = false carries to the editable spec (code field)", () => {
  const log = [];
  const app = build(`App [ width = 100, height = 100,
    code: TextInput [ text = "x", multiline = true, spellcheck = false ],
  ]`);
  app.attach(mockBackend(log), null);
  const spec = lastSpec(log);
  assert.equal(spec.multiline, true);
  assert.equal(spec.spellcheck, false, "a code field turns native squiggles off");
});

await test("textinput: a native edit updates the model text and fires input", () => {
  const log = [];
  globalThis.__inp = [];
  const app = build(`App [ width = 100, height = 100,
    inp: TextInput [ text = "hi", onInput(v: string) { globalThis.__inp.push(v) } ],
  ]`);
  app.attach(mockBackend(log), null);
  lastSpec(log).onInput("hello");
  assert.equal(app.inp.text, "hello", "the native value flows to the model");
  assert.deepEqual(globalThis.__inp, ["hello"], "the input event fired with the value");
});

await test("textinput: Declare focus activates the native caret, blur deactivates", () => {
  Focus.reset();
  const log = [];
  const app = build(`App [ width = 100, height = 100, inp: TextInput [ text = "x" ] ]`);
  app.attach(mockBackend(log), null);
  Focus.setRoot(app);
  Focus.focus(app.inp);
  assert.equal(activations(log).at(-1), true, "focus gives the element the caret");
  Focus.blur();
  assert.equal(activations(log).at(-1), false, "blur takes it away");
});

await test("textinput: a native focus routes back to Declare focus", () => {
  Focus.reset();
  const log = [];
  const app = build(`App [ width = 100, height = 100, inp: TextInput [ text = "x" ] ]`);
  app.attach(mockBackend(log), null);
  Focus.setRoot(app);
  const spec = lastSpec(log);
  spec.onFocus();
  assert.equal(Focus.getFocus(), app.inp, "clicking into the field focuses it in Declare");
  spec.onBlur();
  assert.equal(Focus.getFocus(), null, "native blur clears Declare focus");
});

// ── Uniform compiler API: dual-form diagnostics + the browser mirror ─────────
// The contract every consumer rides (docs/system-design/diagnostics.md): each Diagnostic
// carries its `rendered` form (computed ONCE by the producer = the one
// formatter), the result carries `report` (the whole compile rendered), and
// the browser bundle produces BYTE-IDENTICAL results to the Node compiler —
// including the rendered text, so a CLI, the dev server, and a worker all
// print the same bytes.

await test("diagnostics: every diagnostic carries its rendered form; report renders the whole compile", () => {
  const r = compile("App [ v: Txet [ ] ]");
  assert.equal(r.diagnostics.length, 1);
  const d = r.diagnostics[0];
  assert.ok(d.rendered.includes("[DECLARE2001]") && d.rendered.includes("(line 1, col 7)"), d.rendered);
  assert.ok(d.hint && d.rendered.includes("hint: " + d.hint), "the hint rides the rendered form");
  assert.equal(r.report, "1 error\n" + d.rendered, "report = count summary + each diagnostic's rendered");
  assert.equal(compile("App [ width = 100, height = 100 ]").report, "", "a clean compile has nothing to say");
  // A warning renders MARKED — an unmarked diagnostic reads as an error (the
  // compiler convention), so severity never exists only in the structure.
  const w = compile("App [ n: number = 1, v: View [ n: number = 2, o: View [ width = { n } ] ] ]");
  const warn = w.diagnostics.find((x) => x.severity === "warning");
  assert.ok(warn && warn.rendered.startsWith("warning: "), warn?.rendered);
  assert.ok(w.report.includes("1 warning"), w.report);
});

await test("uniform: the browser compiler's result is byte-identical to Node's (source, deps, diagnostics, report)", async () => {
  const browser = await import("../bundles/declare-compiler.js");
  const pick = (r) => JSON.stringify({ source: r.source, deps: r.deps ?? null, diagnostics: r.diagnostics, report: r.report });
  for (const src of [
    "App [ width = 100, height = 100, n: number = 3, v: View [ width = { app.n * 2 } ] ]", // clean, with deps
    "App [ v: Txet [ ] ]",                                                                  // error + suggestion
    "App [ v: View [ width = { app.mysteryLib() } ] ]",                                     // constraint residue (DECLARE7001)
  ]) {
    assert.equal(pick(browser.compile(src, {})), pick(compile(src)), "identical for: " + src.slice(0, 40));
  }
});

await test("browser compileTracked: includes AND resolved components enter the closure; trackLibrary:false opts a component out", async () => {
  const browser = await import("../bundles/declare-compiler.js");
  // A multi-file app: the include must enter the closure with a content-hash
  // validator, so an edit to the INCLUDED file invalidates like a main edit.
  const files = { "apps/part.declare": "class Part extends View [ width = 40 ]" };
  const out = browser.compileTracked('include [ "part.declare" ]\nApp [ width = 100, height = 100, Part [ ] ]', {
    files, originDir: "apps", mainId: "apps/main.declare", props: { render: "dom" },
  });
  assert.ok(out.source !== null, out.report);
  assert.deepEqual(out.closure.entries.map((e) => e.id).sort(), ["apps/main.declare", "apps/part.declare"]);
  assert.ok(out.closure.entries.every((e) => typeof e.v.hash === "string"), "content-hash validators");
  assert.deepEqual(out.closure.props, { render: "dom" });
  // A resolved LIBRARY component is a compile-time SOURCE dependency — its text
  // shapes the output like any include — so by default it enters the closure and
  // is modification-checked by the same isUpToDate + probe (the referenced set
  // only; the runtime BUNDLE stays out, gated by BUILD_ID).
  const lib = { manifest: { Bar9: "bar9.declare" }, files: { "library/bar9.declare": "class Bar9 extends View [ width = 10 ]" } };
  const out2 = browser.compileTracked("App [ width = 100, height = 100, Bar9 [ ] ]", { ...lib, mainId: "x.declare" });
  assert.ok(out2.source !== null, out2.report);
  assert.deepEqual(out2.closure.entries.map((e) => e.id).sort(), ["library/bar9.declare", "x.declare"], "a resolved component is recorded");
  // trackLibrary:false opts library entries back out (a lightweight buffer compile).
  const out3 = browser.compileTracked("App [ width = 100, height = 100, Bar9 [ ] ]", { ...lib, mainId: "x.declare", trackLibrary: false });
  assert.ok(out3.source !== null, out3.report);
  assert.deepEqual(out3.closure.entries.map((e) => e.id), ["x.declare"], "trackLibrary:false excludes the component");
});

await test("browser default library: setDefaultLibrary removes the per-call obligation", async () => {
  const browser = await import("../bundles/declare-compiler.js");
  // Without a registered library, a bare library tag fails to resolve …
  assert.equal(browser.compile("App [ width = 100, height = 100, Zed9 [ ] ]").source, null);
  // … after ONE registration, the same call — no files/manifest riding it — compiles.
  browser.setDefaultLibrary({ manifest: { Zed9: "zed9.declare" }, files: { "library/zed9.declare": "class Zed9 extends View [ width = 30 ]" } });
  const r = browser.compile("App [ width = 100, height = 100, Zed9 [ ] ]");
  assert.ok(r.source !== null, r.report);
  // An EXPLICIT files/manifest still wins over the default.
  const explicit = browser.compile("App [ width = 100, height = 100, Zed9 [ ] ]", { files: {}, manifest: {} });
  assert.equal(explicit.source, null, "explicit (empty) library overrides the default");
});

// ── subscriptions: `member(params) <- Source { body }` (language §8) ────────

const KEY_DOWN_ARROW = { code: "ArrowDown", key: "ArrowDown", shift: false, ctrl: false, alt: false, meta: false, repeat: false };

// Subscription bodies use `app` — a COMPILE-time resolution (R6) — so these
// route through the full pipeline, not the runtime-only build() helper.
function compileAndBoot(src) {
  const r = compile(src, {});
  assert.notEqual(r.source, null, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const app = instantiate(parseProgram(r.source));
  settle();
  return app;
}

await test("sources: a Keys member wires at init and unsubscribes at discard", async () => {
  const { Keys } = await import("../runtime/dist/index.js");
  const app = compileAndBoot(`App [ width = 100, height = 100, n: number = 0,
    nav: Keys [ onKeyUp(e: KeyEvent) { if (e.key == "ArrowDown") app.n = app.n + 1 } ],
    ]`);
  Keys.keyUp(KEY_DOWN_ARROW);
  assert.equal(app.n, 1, "the handler ran with the KeyEvent payload");
  app.discard();
  Keys.keyUp(KEY_DOWN_ARROW);
  assert.equal(app.n, 1, "discard unsubscribed — a torn-down subtree hears nothing");
});

await test("sources: fan-out is by INSTANCE — two Keys members both hear the keyboard", async () => {
  const { Keys } = await import("../runtime/dist/index.js");
  const app = compileAndBoot(`App [ width = 100, height = 100, a: number = 0, b: number = 0,
    k1: Keys [ onKeyDown(e: KeyEvent) { app.a = app.a + 1 } ],
    k2: Keys [ onKeyDown(e: KeyEvent) { app.b = app.b + 1 } ],
    ]`);
  Keys.keyDown(KEY_DOWN_ARROW);
  assert.equal(app.a, 1, "first listener");
  assert.equal(app.b, 1, "second — which is why a menu, a dialog, and a menubar can all listen");
});

await test("sources: nothing subscribes for a handler nobody declared", async () => {
  const { Keys } = await import("../runtime/dist/index.js");
  const app = compileAndBoot(`App [ width = 100, height = 100, n: number = 0,
    quiet: Keys [ ],
    ]`);
  Keys.keyDown(KEY_DOWN_ARROW);   // must not throw: an empty source is inert
  assert.equal(app.n, 0, "pay-per-use, like every other member");
});

await test("sources: the `<-` operator is GONE, and the error names the rewrite", () => {
  const bad = compile(`App [ v: Node [ onKeyUp(e) <- Keys { } ] ]`, {});
  assert.equal(bad.source, null);
  assert.match(bad.errors[0].message, /'<-' subscriptions were removed/);
  assert.match(bad.errors[0].message, /Keys \[ onKeyUp\(e\) \{ … \} \]/, "names the exact replacement");
});

await test("sources: a handler the source does not call is the ordinary typo error", () => {
  const bad = compile(`App [ width = 100, height = 100, k: Keys [ onWheel(e: WheelEvent) { } ] ]`, {});
  assert.equal(bad.source, null);
  assert.match(bad.errors[0].message, /Keys has no 'onWheel' event — its handlers: onKeyDown, onKeyUp/);
});

await test("sources: `Keys` is both a component and a callable service, under one name", () => {
  const r = compile(`App [ width = 100, height = 100,
    down: boolean = false,
    k: Keys [ onKeyDown(e: KeyEvent) { app.down = Keys.isDown("Space") } ],
    ]`, {});
  assert.notEqual(r.source, null, "ask AND listen in one program: " + r.errors.map((e) => e.message).join("; "));
});

await test("sources: a source member does not collide with `<->` lexing", () => {
  const r = compile(`App [ width = 100, height = 100,
    d: Dataset { { "title": "x" } },
    card: View [ datapath = { app.d.value }, f: TextInput [ text <-> :title ] ],
    nav: Keys [ onKeyUp(e: KeyEvent) { app.d.set(["title"], e.key) } ],
    ]`, {});
  assert.notEqual(r.source, null, "the two-way arrow still lexes: " + r.errors.map((e) => e.message).join("; "));
});

// ── typed bodies: TS syntax is checked, then STRIPPED for emission ───────────

// ── interaction intrinsics: hovered/pressed (interaction.ts) ─────────────────

await test("hovered: the hit chain — leaf and ancestors, updated by pointer writes", () => {
  const app = build(`App [ width = 200, height = 200,
    hb: boolean = { this.b.hovered },
    b: View [ x = 50, y = 50, width = 60, height = 40,
        t: Text [ x = 10, y = 10, text = "hi" ] ],
    ]`);
  app.hovering = true; settle();
  assert.equal(app.hb, false, "no pointer yet");
  app.pointerX = 60; app.pointerY = 60; settle();
  assert.equal(app.hb, true, "chain includes b (leaf is the Text inside)");
  app.pointerX = 5; app.pointerY = 5; settle();
  assert.equal(app.hb, false, "moved off");
});

await test("hovered: occlusion — a covering view suppresses the chain; pointerEvents none falls through", () => {
  const app = build(`App [ width = 200, height = 200,
    hb: boolean = { this.b.hovered },
    glassOn: boolean = true,
    b: View [ x = 50, y = 50, width = 60, height = 40 ],
    glass: View [ width = 200, height = 200, visible = { parent.glassOn } ],
    ]`);
  app.hovering = true; app.pointerX = 60; app.pointerY = 60; settle();
  assert.equal(app.hb, false, "glass over b: b is not on the chain");
  app.glass.pointerEvents = "none"; settle();
  assert.equal(app.hb, true, "pointer-transparent glass: the walk falls through");
  app.glass.pointerEvents = ""; app.glassOn = false; settle();
  assert.equal(app.hb, true, "invisible glass never hits");
});

await test("pressed: down arms the chain snapshot; drag-off releases; drag-back re-arms; up clears", () => {
  const app = build(`App [ width = 200, height = 200,
    pb: boolean = { this.b.pressed },
    b: View [ x = 50, y = 50, width = 60, height = 40 ],
    ]`);
  app.hovering = true; app.pointerX = 60; app.pointerY = 60; settle();
  app.pointerDown = true; settle();
  assert.equal(app.pb, true, "pressed on down over b");
  app.pointerX = 5; settle();
  assert.equal(app.pb, false, "dragged off — releases (platform rule)");
  app.pointerX = 60; settle();
  assert.equal(app.pb, true, "dragged back — re-arms");
  app.pointerDown = false; settle();
  assert.equal(app.pb, false, "up clears");
});

await test("hovered: geometry moving under a STATIONARY pointer re-fires (the walk's reads are deps)", () => {
  const app = build(`App [ width = 200, height = 200,
    hb: boolean = { this.b.hovered },
    b: View [ x = 50, y = 50, width = 60, height = 40 ],
    ]`);
  app.hovering = true; app.pointerX = 60; app.pointerY = 60; settle();
  assert.equal(app.hb, true);
  app.b.x = 150; settle();                       // the view leaves; the pointer never moved
  assert.equal(app.hb, false, "the chain re-derived from the geometry change alone");
  app.b.x = 50; settle();
  assert.equal(app.hb, true, "and back");
});

await test("interaction on touch: no hover, but pressed works while down", () => {
  const app = build(`App [ width = 200, height = 200,
    hb: boolean = { this.b.hovered },
    pb: boolean = { this.b.pressed },
    b: View [ x = 50, y = 50, width = 60, height = 40 ],
    ]`);
  app.hovering = false;                           // a touch has no hover
  app.pointerX = 60; app.pointerY = 60; settle();
  assert.equal(app.hb, false, "no hover on touch");
  app.pointerDown = true; settle();
  assert.equal(app.pb, true, "touch press holds");
  app.pointerDown = false; settle();
  assert.equal(app.pb, false);
});

await test("hovered: an ignoreClip child hits OUTSIDE its clipping parent's box (the resize-halo shape)", () => {
  const app = build(`App [ width = 200, height = 200,
    hh: boolean = { this.win.halo.hovered },
    hw: boolean = { this.win.hovered },
    win: View [ x = 50, y = 50, width = 60, height = 40, clip = true,
        halo: View [ ignoreClip = true, x = -10, y = -10, width = 80, height = 60 ] ],
    ]`);
  app.hovering = true;
  app.pointerX = 45; app.pointerY = 45; settle();   // outside win's box, inside the halo's reach
  assert.equal(app.hh, true, "the opted-out chrome still hits beyond the clip");
  assert.equal(app.hw, true, "its parent is on the chain");
  app.pointerX = 30; app.pointerY = 30; settle();   // outside both
  assert.equal(app.hh, false);
});

await test("hovered/pressed under the PAGE scroll — the walk's transform carries the scroll term", () => {
  // The scroll-blind-walk bug (measured 2026-07-30): app.pointerX/Y are
  // viewport coordinates — the root's FRAME — while children sit in content
  // coordinates. The transform adds the scroll back per level; every view
  // below the fold presses where it PAINTS, and ignoreScroll chrome (which
  // rides the frame) keeps hitting at its unshifted place.
  const app = build(`App [ width = 200, height = 200,
    hd: boolean = { this.deep.hovered },
    pd: boolean = { this.deep.pressed },
    hbar: boolean = { this.bar.hovered },
    bar: View [ ignoreScroll = true, width = 200, height = 20 ],
    deep: View [ x = 50, y = 900, width = 60, height = 40 ],
    ]`);
  app.hovering = true; app.scrollY = 880; settle();
  app.pointerX = 60; app.pointerY = 40; settle();       // viewport 40 = content 920 → inside deep
  assert.equal(app.hd, true, "a below-the-fold view hovers at its painted position");
  app.pointerDown = true; settle();
  assert.equal(app.pd, true, "and presses there");
  app.pointerDown = false; settle();
  app.pointerX = 60; app.pointerY = 10; settle();       // on the fixed bar, page still scrolled
  assert.equal(app.hbar, true, "ignoreScroll chrome hits at its frame position");
  assert.equal(app.hd, false, "content a scroll away does not");
  app.scrollY = 0; settle();                            // scroll home under a stationary pointer
  assert.equal(app.hbar, true, "chrome unmoved");
});

await test("hovered: scrolling under a STATIONARY pointer re-fires (the offset is a dependency)", () => {
  const app = build(`App [ width = 200, height = 200,
    hd: boolean = { this.deep.hovered },
    deep: View [ x = 50, y = 250, width = 60, height = 40 ],
    ]`);
  app.hovering = true; app.pointerX = 60; app.pointerY = 100; settle();
  assert.equal(app.hd, false, "below the fold, unscrolled");
  app.scrollY = 170; settle();                          // content 270 slides under the pointer
  assert.equal(app.hd, true, "the scroll alone re-derived the chain");
});

await test("hovered in a scrolled PANE — frame-space at every level, and the pane bounds its subtree", () => {
  const app = build(`App [ width = 200, height = 200,
    hi: boolean = { this.pane.inner.hovered },
    pane: View [ x = 20, y = 20, width = 100, height = 100, scrolls = y,
        inner: View [ x = 0, y = 400, width = 100, height = 40 ],
        tall: View [ x = 0, y = 800, width = 100, height = 10 ] ],
    ]`);
  app.hovering = true;
  app.pointerX = 60; app.pointerY = 50; settle();       // pane-frame (40,30); content 30 → nothing
  assert.equal(app.hi, false, "unscrolled: inner is 400px down the pane's content");
  app.pane.scrollY = 390; settle();                     // content 30+390 = 420 → inside inner
  assert.equal(app.hi, true, "scrolled: inner hovers where it paints, inside the pane's frame");
  app.pointerX = 60; app.pointerY = 140; settle();      // below the pane's frame (h=100)
  assert.equal(app.hi, false, "the pane bounds its subtree at its frame — no hits past the edge");
});

await test("viewAt/containsPoint keep the CONTENT-space contract at any scroll (the drag pairing)", () => {
  const app = build(`App [ width = 200, height = 200,
    deep: View [ x = 50, y = 900, width = 60, height = 40 ],
    ]`);
  app.scrollY = 880; settle();
  // Drag events carry root-CONTENT coordinates; viewAt takes exactly those.
  assert.equal(app.viewAt(60, 920), app.deep, "viewAt answers in content space, scrolled");
  assert.equal(app.deep.containsPoint(60, 920), true, "containsPoint agrees");
  assert.equal(app.viewAt(60, 40), null, "the content point 40 is above the fold's content — not the view");
});

await test("explainHit narrates WHY a point resolved — the walk's own decisions, not a second walk", async () => {
  // `viewAt` answers WHAT, which is enough when the answer is right and useless
  // when it is wrong. Every interaction bug of the 2026-07 run was a
  // disagreement between where a view PAINTS and where the walk THINKS it is,
  // and each was diagnosed by inference from outside because nothing could be
  // asked directly. The narration instruments THE walk, so it can never drift
  // from the router's real answer — and being backend-neutral, it is the same
  // answer over the DOM bridge, the canvas host, and the native `eval`.
  const { explainHit } = await import("../runtime/dist/inspect.js");
  const app = build(`App [ width = 200, height = 200,
    box:  View [ x = 20, y = 20, width = 100, height = 100 ],
    gone: View [ x = 40, y = 40, width = 40, height = 40, visible = false ],
    dot:  View [ x = 40, y = 40, width = 40, height = 40, pointerEvents = "none" ],
    ]`);
  settle();
  const r = explainHit(app, 50, 50);
  // the pointer-transparent dot and the invisible sibling are both SKIPPED, each
  // saying which rule did it — that is the homepage cursor-dot bug, askable
  assert.match(r.steps.map((s) => `${s.path} ${s.why}`).join("\n"), /dot.*pointerEvents/);
  assert.match(r.steps.map((s) => `${s.path} ${s.why}`).join("\n"), /gone.*visible = false/);
  assert.equal(r.hit, "app.box", "…and the point lands on the box beneath them");
  // and it agrees with the router's own answer, always
  assert.equal(r.hit, "app." + (app.viewAt(50, 50) === app.box ? "box" : "?"),
    "the narration and viewAt cannot disagree — they are one walk");
});

await test("rootOrigin + the focus follower: geometry is scroll-true (ONE WALK, everywhere)", () => {
  // The scroll-blind focus ring (found 2026-07-31): the follower hand-summed
  // ancestor x/y, so a control inside a scrolled pane wore its ring a full
  // scrollY away. Both now ride interaction.ts's walk: an intermediate pane's
  // scroll subtracts (the control moved on screen), the root's own scroll adds
  // back (ring and control share the root's content space) — and the scroll
  // read is a DEPENDENCY, so scrolling re-fires the follower live.
  const app = build(`App [ width = 200, height = 300,
    pane: View [ x = 20, y = 30, width = 160, height = 200, scrolls = y,
        deep: View [ x = 10, y = 400, width = 60, height = 24 ] ],
    ]`);
  settle();
  assert.deepEqual(app.pane.deep.rootOrigin(), { x: 30, y: 430 }, "unscrolled: plain accumulation");
  app.pane.scrollY = 380; settle();
  assert.deepEqual(app.pane.deep.rootOrigin(), { x: 30, y: 50 }, "the pane's scroll moved it on screen");
  const seen = [];
  const off = Focus.onGeometry((g) => seen.push({ x: g.x, y: g.y, scroller: g.scroller, homeX: g.homeX, homeY: g.homeY }));
  app.pane.deep.focusable = true;
  Focus.focus(app.pane.deep);
  settle();
  assert.deepEqual({ x: seen.at(-1).x, y: seen.at(-1).y }, { x: 30, y: 50 }, "the ring lands where the control is SEEN");
  app.pane.scrollY = 300; settle();
  assert.deepEqual({ x: seen.at(-1).x, y: seen.at(-1).y }, { x: 30, y: 130 }, "…and follows the scroll live (tracked read)");
  // the TRAVEL facts: the nearest scroller is the home; home coords are the
  // scroller's CONTENT space — independent of its own scroll offset, so a
  // traveled (platform-carried) indicator needs no re-derive per scroll tick
  assert.equal(seen.at(-1).scroller, app.pane, "the travel home is the nearest scroller");
  assert.deepEqual({ x: seen.at(-1).homeX, y: seen.at(-1).homeY }, { x: 10, y: 400 }, "home coords are content-space");
  assert.equal(app.pane.deep.travelWith(app.pane), false, "no surface headless — callers keep the reactive fallback");
  off();
  Focus.blur();
});

await test("hovered/pressed are read-only intrinsics: declaring or setting one is refused", () => {
  const decl = compile(`App [ width = 1, height = 1, v: View [ hovered: boolean = false ] ]`, {});
  assert.equal(decl.source, null);
  assert.match(decl.errors.map((e) => e.message).join("\n"), /built-in read-only intrinsic/);
  const set = compile(`App [ width = 1, height = 1, v: View [ pressed = true ] ]`, {});
  assert.equal(set.source, null, "a set is refused too");
});

await test("typed bodies: `as` casts typecheck, are stripped from the emitted source, and run", () => {
  const src = `class G extends View [ value: string = "", pick(v: object) { this.value = v } ]
class R extends View [ choice: string = "",
    on: boolean = { (parent as G).value == choice },
    onClick() { (parent as G).pick(choice) },
    width = 20, height = 20,
    ]
App [ width = 200, height = 200,
    g: G [ value = "a", R [ choice = "a" ], R [ choice = "b" ] ],
    ]`;
  const r = compile(src, { typecheck: true });
  assert.notEqual(r.source, null, "compiles + typechecks: " + r.errors.map((e) => e.message).join("; "));
  assert.ok(!r.source.includes(" as G"), "the cast is stripped from the emitted source");
  const app = instantiate(parseProgram(r.source));
  settle();
  assert.equal(app.g.children[0].on, true, "the stripped constraint evaluates against the real parent");
  assert.equal(app.g.children[1].on, false);
  app.g.children[1].onClick();
  settle();
  assert.equal(app.g.children[1].on, true, "the stripped handler call reaches the parent's method");
  assert.equal(app.g.children[0].on, false);
});

await test("typed bodies: a cast against a WRONG type is still a type error (the point of keeping types)", () => {
  const src = `class G extends View [ value: string = "" ]
App [ width = 100, height = 100,
    g: G [ v: View [ width = { (parent as G).nope * 2 } ] ],
    ]`;
  const r = compile(src, { typecheck: true });
  assert.equal(r.source, null);
  assert.match(r.errors.map((e) => e.message).join("\n"), /nope/);
});

await test("typed bodies: a cast SHARING a body with a :path island strips and runs (island-aware slice)", () => {
  const src = `App [ width = 200, height = 200,
    d: Dataset { { "tags": ["a", "b"], "n": "5", "meta": { "kind": "pin" } } },
    card: View [ datapath = { app.d.value },
        t: Text [ text = { (:tags as string[]).join(" · ") } ],
        u: Text [ text = { (:n as string) + "!" } ],
        m: Text [ text = { (:meta as { kind: string }).kind } ],
        ],
    ]`;
  const r = compile(src, { typecheck: true });
  assert.notEqual(r.source, null, "compiles + typechecks: " + r.errors.map((e) => e.message).join("; "));
  assert.ok(!r.source.includes(" as string"), "the casts are stripped from the emitted source");
  assert.ok(!r.source.includes(" as {"), "the object-type cast is stripped too");
  assert.ok(r.source.includes(`this.$data(["tags"])`), "the datapath island lowers to its emitted plan");
  const app = instantiate(parseProgram(r.source));
  settle();
  assert.equal(app.card.t.text, "a · b", "array cast beside an island evaluates");
  assert.equal(app.card.u.text, "5!", "primitive cast beside an island evaluates");
  assert.equal(app.card.m.text, "pin", "a cast TYPE containing a colon does not confuse the island scan");
});

await test("typed bodies: TS-only forms that CANNOT run are rejected at check with the rule named", () => {
  const cases = [
    [`App [ width=1, height=1, t: Text [ text = { [1,2].map((x: number) => x + 1).join(":") } ] ]`,
      /annotates a binding \('x'\).*cast narrows/],
    [`App [ width=1, height=1, n: number = 0, onClick() { const k: number = 2; n = k } ]`,
      /annotates a binding \('k'\)/],
    [`App [ width=1, height=1, n: number = 0, onClick() { type K = number; n = 2 } ]`,
      /declares a type — type declarations don't live in a \{ \} body/],
    [`App [ width=1, height=1, t: Text [ text = { ((<T>(x: T) => x)("hi")) } ] ]`,
      /type parameter|annotates a binding/],
    [`App [ width=1, height=1, t: Text [ text = { ((x?) => "" + x)(1) } ] ]`,
      /annotates a binding \('x'\)/],
  ];
  for (const [src, re] of cases) {
    const r = compile(src, {});
    assert.equal(r.source, null, "must be rejected: " + src);
    assert.match(r.errors.map((e) => e.message).join("\n"), re, src);
  }
});

await test("typed bodies: casts beside islands in a STATEMENT body (handler) strip and run", () => {
  const src = `App [ width = 200, height = 200,
    picked: string = "",
    pick(v: object) { this.picked = v },
    d: Dataset { { "title": "hello", "n": 3 } },
    card: View [ datapath = { app.d.value },
        onClick() { const t = (:title satisfies string)!; app.pick(t + "/" + (:n as number).toFixed(0)) },
        ],
    ]`;
  const r = compile(src, { typecheck: true });
  assert.notEqual(r.source, null, "compiles + typechecks: " + r.errors.map((e) => e.message).join("; "));
  assert.ok(!r.source.includes("satisfies"), "satisfies is stripped");
  assert.ok(!r.source.includes(" as number"), "the cast is stripped");
  const app = instantiate(parseProgram(r.source));
  settle();
  app.card.onClick();
  settle();
  assert.equal(app.picked, "hello/3", "the stripped statement body runs against live data");
});

// ── static extraction (static-html.ts + headless.ts — docs/system-design/capabilities.md §4–5) ──
// The program EXECUTES headlessly to its t=0 snapshot (the real runtime, no
// pixels) and the settled tree serializes by CLASS SEMANTICS, no heuristics.

await test("extractStatic: class semantics as HTML — markdown, computed text, visibility, image", () => {
  const src = `App [
  fill = 0xffffff,
  m: Markdown [ width = 400, text = """
# Title

Body with **bold** and [a link](https://x.example/).

- one
- two
""" ],
  n: number = 3,
  t: Text [ y = 300, text = { "count: " + n } ],
  ghost: Text [ y = 330, visible = false, text = "never emitted" ],
  i: Image [ y = 360, width = 10, height = 10, source = "pic.png" ],
  ]`;
  const out = extractStatic(src);
  assert.equal(out.report, "", "a clean compile — extraction carries the dual-form diagnostics");
  assert.equal(out.html,
    '<h1>Title</h1>\n' +
    '<p>Body with <strong>bold</strong> and <a href="https://x.example/">a link</a>.</p>\n' +
    '<ul><li>one</li><li>two</li></ul>\n' +
    '<p>count: 3</p>\n' +           // the { } body EVALUATED — content is the settled value
    '<img src="pic.png">');          // and ghost (visible=false) emitted nothing
});

await test("extractStatic: the environment vector selects content (responsive constraints)", () => {
  // Geometry leaks into CONTENT through responsive constraints — the viewport
  // is an explicit parameter (DEFAULT_ENV = 1200×800), not an accident.
  const src = `App [ r: Text [ text = { app.hostWidth < 600 ? "compact" : "wide" } ] ]`;
  assert.equal(extractStatic(src).html, "<p>wide</p>");
  assert.equal(extractStatic(src, { env: { hostWidth: 400 } }).html, "<p>compact</p>");
});

await test("extractStatic: replication runs headlessly — every row's content lands", () => {
  const src = `App [
  d: Dataset { { "rows": [ { "t": "alpha" }, { "t": "beta" }, { "t": "gamma" } ] } },
  list: View [ datapath = { app.d.value },
    Text [ datapath = :rows[], text = { :t } ] ],
  ]`;
  assert.equal(extractStatic(src).html, "<p>alpha</p>\n<p>beta</p>\n<p>gamma</p>");
});

await test("extractStatic: HTMLText serializes through the same block model; a TextInput is not content", () => {
  const out = extractStatic(`App [
  h: HTMLText [ width = 300, html = "<h2>Sub</h2><p>body</p>" ],
  f: TextInput [ y = 200, width = 120, initial = "draft" ],
  ]`);
  assert.equal(out.html, "<h2>Sub</h2>\n<p>body</p>");
});

await test("extractStatic: a compile failure yields html null and the rendered report", () => {
  const out = extractStatic("App [ v: Txet [ ] ]");
  assert.equal(out.html, null);
  assert.match(out.report, /Txet/);
});

await test("extractStatic: navigate(to) in an activation handler wraps the subtree in <a href> (capabilities.md §6)", () => {
  // The navigation SERVICE ACTION, extracted statically from the CALL — a
  // literal target, and a class whose onClick navigates via classroot.url (the
  // library-button pattern), resolved per instance. Only an ACTIVATION handler
  // becomes an anchor; conditionality lives in the VALUE (an empty url → none).
  const src = `
class Nav extends View [ url: string = "",
    onClick() { app.navigate(classroot.url) },
    lbl: Text [ text = { classroot.url } ],
    ]

App [
  home: Text [ text = "Home", onClick() { app.navigate("https://x.example/home") } ],
  a: Nav [ url = "docs/index.declare" ],
  b: Nav [ url = "" ],
  init: Text [ text = "init-nav", onInit() { app.navigate("https://x.example/init") } ],
  plain: Text [ text = "plain" ],
  ]`;
  const out = extractStatic(src);
  assert.equal(out.report, "");
  assert.equal(out.html,
    '<a href="https://x.example/home"><p>Home</p></a>\n' +      // literal, activation → anchor
    '<a href="docs/index.declare"><p>docs/index.declare</p></a>\n' + // classroot.url read-path, per instance
    // b (url = "") — the value is empty, so no anchor and no content: nothing
    '<p>init-nav</p>\n' +   // onInit is NOT activation → no anchor
    '<p>plain</p>');        // no navigate → plain content
});

await test("extractStatic: heading level inferred from settled type — bigger + bolder than body becomes <hN>", () => {
  // Revising §5's no-inference rule (2026-07-14): a Text has no declared heading
  // level, so infer it from the rendered type. Two signals, no more — LARGER than
  // the body copy AND a heading weight (semibold+); level by size rank. The weight
  // gate keeps a big light LEAD a <p>. Deliberately imperfect: a big bold FIGURE
  // ("42") reads as a heading — accepted, not special-cased away.
  const src = `App [
  fill = 0xffffff,
  fig: Text [ fontSize = 64, fontWeight = bold, text = "42" ],
  head: Text [ y = 80, fontSize = 40, fontWeight = semibold, text = "The Heading" ],
  lead: Text [ y = 140, fontSize = 40, text = "Large but light — a lead, not a heading." ],
  body: Text [ y = 200, fontSize = 16, text = "Body copy that carries the most characters on the page by a clear margin overall." ],
  ]`;
  const out = extractStatic(src);
  assert.equal(out.report, "");
  assert.equal(out.html,
    '<h1>42</h1>\n' +             // biggest size → h1, even a bare figure (accepted imperfection)
    '<h2>The Heading</h2>\n' +    // next size → h2
    '<p>Large but light — a lead, not a heading.</p>\n' + // same 40px but light → weight gate → <p>
    '<p>Body copy that carries the most characters on the page by a clear margin overall.</p>');
});

await test("navigate is a service action, not an attribute — `app.navigate = url` is a type error", () => {
  // The migration signal for the §6 model: assignment to the method fails to
  // typecheck (the old surface is gone), so a stale program cannot silently ship.
  const out = extractStatic(`App [ lnk: Text [ text = "t", onClick() { app.navigate = "u" } ] ]`);
  assert.equal(out.html, null);
  assert.match(out.report, /\(to: string\) => void/);
});

await test("settleHeadless: text measures and auto-extents settle without a DOM", () => {
  // The approximate measurer (headless.ts) is enough to SETTLE any tree —
  // real numbers for auto-extents, deterministic on every host.
  const r = compile(`App [ t: Text [ text = "hello measured world" ] ]`);
  const app = settleHeadless(r.source, { deps: r.deps });
  try {
    const t = app.children[0];
    assert.ok(t.width > 0 && t.height > 0, `auto-extent computed headless (w ${t.width}, h ${t.height})`);
    assert.equal(app.hostWidth, 1200, "the canonical default viewport");
    assert.equal(app.width, 1200, "the App fills its (synthetic) host");
  } finally {
    app.discard();
  }
});

await test("E-series diagnostics name the fix: bare ident, layout-in-State, dotted member, <-> non-path", () => {
  // Run-1 findings (language-learnings.md E-4..E-7): each of these is a wrong
  // program a model ACTUALLY wrote; the diagnostic must state the repair, not
  // just the rule. compile() throws DeclareErrors carrying every message.
  const msg = (src) => {
    try { const r = compile(src); return (r.errors ?? []).map((e) => e.message ?? String(e)).join("\n"); }
    catch (e) { return String(e?.message ?? e); }
  };
  // E-5: bare identifier in a value slot → both intents named
  assert.match(msg(`App [ width=1, height=1, label: string = "x", Text [ text = label ] ]`),
    /write \{ label \} to bind the attribute, or "label" for the literal text/);
  // E-6: layout swap inside a State → the state rule + both idioms
  assert.match(msg(`App [ width=1, height=1, layout: SimpleLayout [ axis = x ],
    s: State [ applied = true, layout: SimpleLayout [ axis = y ] ] ]`),
    /a state cannot swap 'SimpleLayout' in/);
  // E-4: dotted member (reach-into-a-child) → own-attributes rule
  assert.match(msg(`App [ width=1, height=1, t: Text [ text = "x" ],
    s: State [ applied = true, t.opacity = 0.4 ] ]`),
    /a member sets this element's OWN attributes, never a child's/);
  // E-7: two-way arrow to an attribute chain → datapath rule + onInput idiom
  assert.match(msg(`App [ width=1, height=1, f: TextInput [ text <-> classroot.name ] ]`),
    /binds a DATAPATH .* deliver up in an onInput\(\) handler/);
  // E-9 is RETIRED (2026-07-28). Typed parameters and return annotations are
  // language §4's canonical form; the diagnostics pass that refused them had
  // mistaken an unbuilt feature for a rule. They must now COMPILE — and an
  // unresolvable type name is the error instead.
  assert.equal(msg(`App [ width=1, height=1, f(label: string) { return label } ]`), "");
  assert.equal(msg(`App [ width=1, height=1, f(): number { return 1 } ]`), "");
  assert.equal(msg(`App [ width=1, height=1, f(x: number) -> number { return x } ]`), "");
  assert.match(msg(`App [ width=1, height=1, f(v: Nonsense) { return 1 } ]`),
    /unknown type 'Nonsense' for parameter 'v'/);
  assert.match(msg(`App [ width=1, height=1, f(v: number) -> Nonsense { return v } ]`),
    /unknown return type 'Nonsense'/);
  // The recognition layer still reports ALL recovered TS-isms in one pass —
  // but a typed signature is no longer one of them, so this program's only
  // remaining diagnostic is the dotted member.
  const multi = (() => { const r = compile(`App [ width=1, height=1,
    f(a: string): number { return 1 },
    t: Text [ text = "x" ],
    s: State [ applied = true, t.opacity = 0.4 ],
  ]`); return r.errors ?? []; })();
  assert.equal(multi.length, 1, "the typed signature is legal; only the dotted member errors");
  assert.match(multi[0].rawMessage ?? multi[0].message,
    /a member sets this element's OWN attributes, never a child's/);
  // E-1 escalation 2: the CSS-interference table names the Declare slot
  assert.match(msg(`App [ width=1, height=1, v: View [ borderWidth = 1 ] ]`),
    /has no attribute 'borderWidth' — the CSS instinct: a border is 'stroke = \{ stroke\(1,/);
  assert.match(msg(`App [ width=1, height=1, v: View [ boxShadow = 1 ] ]`),
    /the CSS instinct: a shadow is 'shadow = \{ shadow\(/);
  // Run-2 finding: a raw :path decl-default names the { } binding form
  assert.match(msg(`App [ width=1, height=1, r: View [ datapath = :rows[], label: string = :label ] ]`),
    /to seed from data, write a \{ \} default: label: string = \{ :label \}/);
});

await test("location: a schema attr — settable in [ ], writable from handlers, reactive to reads", () => {
  // The Phase-A pinning tests (location.md §11.3): the DEFAULT RULE's literal form
  // must check (§3 — `App [ location = "home" ]`), a handler write must flow, and
  // a constraint reading it must re-derive. Host wiring (seed/echo/history) is
  // chromium-tested (loc-homepage.mjs / loc-viewer.mjs); this pins the
  // language surface those tests stand on.
  const r = compile(`App [ width = 100, height = 100, location = "home",
    why: View [ visible = { app.location == "why" } ],
    go: View [ onClick() { app.location = "why" } ],
  ]`);
  assert.equal(r.errors.length, 0, "the literal [ ] form checks — location is a schema attr");
  const app = settleHeadless(r.source, { deps: r.deps });
  try {
    assert.equal(app.location, "home", "the declared initial (§3 default rule)");
    assert.equal(app.why.visible, false, "derived state follows the initial");
    app.location = "why"; // the host's back/forward write and the app's navigate write are the same write
    settle();
    assert.equal(app.why.visible, true, "a location write re-derives every reader");
  } finally {
    app.discard();
  }
});

await test("headingSlug: the one deterministic heading→slug rule (location.md §6)", () => {
  assert.equal(headingSlug("Why a new language, now?"), "why-a-new-language-now");
  assert.equal(headingSlug("Section 3.1: Details"), "section-31-details");
  assert.equal(headingSlug("  trailing space  "), "trailing-space");
  assert.equal(headingSlug("The @name reveal"), "the-name-reveal");
  assert.equal(headingSlug("!!!"), "", "no slug characters ⇒ empty (not an anchor)");
});

await test("@name reveal: heading slugs, named-view priority, -2 suffixes, held intent (location.md §6)", () => {
  // The Phase-B mechanism, headless (the reveal LOCATES the target; there is no
  // viewport to scroll, so `resolveReveal` returning the name = it resolved). Live
  // scroll on both real backends is chromium-tested (loc-anchor.mjs). resolveReveal
  // re-arms the intent from `location`'s trailing @name on every location CHANGE,
  // fires once the name is in the settled tree, and holds it otherwise.

  // (a) a heading slug resolves; an unknown anchor is HELD (retained intent), not lost.
  const r = compile(`App [ width = 400, height = 400, location = "home",
    md: Markdown [ width = 380, text = "# Intro\\n\\nbody text\\n\\n## Fine Details\\n\\nmore" ],
  ]`);
  assert.equal(r.errors.length, 0);
  const app = settleHeadless(r.source, { deps: r.deps });
  try {
    app.location = "home@fine-details"; settle();
    assert.equal(app.resolveReveal(), "fine-details", "a heading's slug resolves and reveals");
    app.location = "home@missing"; settle();
    assert.equal(app.resolveReveal(), null, "an unknown anchor is held (returns null), not fired");
  } finally { app.discard(); }

  // (b) duplicate REGISTERED names are a compile error (location.md §0.4: the
  //     registry replaces `-2` suffixing for App-tree anchors — a URL breaks
  //     at build, never silently renumbers). Suffixing survives only for
  //     UNREGISTERED names — class-internal anchors, exercised right after.
  const r2 = compile(`App [ width = 200, height = 200, location = "x",
    a: View [ anchor = "sec", width = 10, height = 10 ],
    b: View [ anchor = "sec", width = 10, height = 10 ],
  ]`);
  assert.ok(r2.errors.length > 0, "duplicate registered anchors fail the build");
  assert.ok(r2.errors.some((e) => /declared twice/.test(e.message)), "the error names the duplication");
  const r2b = compile(`class Spot extends View [ inner: View [ anchor = "sec", width = 5, height = 5 ] ]
App [ width = 200, height = 200, location = "x",
    a: Spot [ width = 10, height = 10 ],
    b: Spot [ width = 10, height = 10 ],
  ]`);
  assert.equal(r2b.errors.length, 0, "class-internal anchors don't collide in the registry");
  const app2 = settleHeadless(r2b.source, { deps: r2b.deps });
  try {
    app2.location = "x@sec"; settle();
    assert.equal(app2.resolveReveal(), "sec", "first instance = the base name (preorder)");
    app2.location = "x@sec-2"; settle();
    assert.equal(app2.resolveReveal(), "sec-2", "second instance = the -2 suffix");
    app2.location = "x@sec-3"; settle();
    assert.equal(app2.resolveReveal(), null, "no third target — held");
    app2.location = "x"; settle();
    assert.equal(app2.resolveReveal(), null, "a location change with no @ cancels the intent");
  } finally { app2.discard(); }

  // (c) collision across kinds: a named view WINS the base name over a same-slug
  //     heading; the heading takes the -2 (views before slugs).
  const r3 = compile(`App [ width = 400, height = 400, location = "x",
    named: View [ anchor = "intro", width = 10, height = 10 ],
    md: Markdown [ width = 380, text = "# Intro\\n\\nbody" ],
  ]`);
  assert.equal(r3.errors.length, 0);
  const app3 = settleHeadless(r3.source, { deps: r3.deps });
  try {
    app3.location = "x@intro"; settle();
    assert.equal(app3.resolveReveal(), "intro", "a named view wins the base name");
    app3.location = "x@intro-2"; settle();
    assert.equal(app3.resolveReveal(), "intro-2", "the same-slug heading takes -2 (views before slugs)");
  } finally { app3.discard(); }
});

await test("settleHeadless: network is refused, never initiated — the source lands honestly absent", async () => {
  // capabilities.md §3/§9: headless execution may not INITIATE a live request.
  // An onInit fetch against an absolute URL must be refused by the injected
  // transport — at t=0 the source shows `loading` (the snapshot's honest
  // absence); once the refusal lands it is `failed` with the reason. If this
  // ever reaches a real socket, the URL below fails DNS anyway — but the error
  // text asserts it was the SEAM that refused, not the network.
  const r = compile(`App [ width = 100, height = 100,
    src: DataSource [ url = "https://declare-headless-must-not-fetch.invalid/x.json" ],
    onInit() { this.src.fetch() },
  ]`);
  const app = settleHeadless(r.source, { deps: r.deps });
  try {
    assert.equal(app.src.status, "loading", "t=0 snapshot: honestly absent, still loading");
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the refusal land
    assert.equal(app.src.status, "failed", "the refusal lands as failed");
    assert.match(app.src.error, /network unavailable headless/, "refused by the seam, not by the wire");
  } finally {
    app.discard();
  }
});

// ── the position literals (x/y = center | end) ──────────────────────────────

await test("center/end: geometric on views, band-optical on Text, end is the box", async () => {
  const src = `App [ width = 400, height = 200,
    box: View [ width = 100, height = 40, x = center, y = center, fill = navy ],
    corner: View [ width = 30, height = 30, x = end, y = end, fill = maroon ],
    lbl: Text [ fontSize = 20, x = center, y = center, text = "Centered" ],
  ]`;
  const r = compile(src, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const app = settleHeadless(r.source, { deps: r.deps });
  assert.equal(app.box.x, 150); assert.equal(app.box.y, 80);
  assert.equal(app.corner.x, 370); assert.equal(app.corner.y, 170);
  // Text y centers the INK BAND (cap 0.7em, ascent 0.8em in the deterministic
  // headless measurer): lead = 2, band = 14 → (200-14)/2 - 2 = 91 — NOT the
  // geometric (200-21)/2 = 89.5. The optics live only in the literal.
  assert.equal(app.lbl.y, 91);
  app.discard();
});

await test("center/end: reactive against parent resize (the literal is a standing derive)", async () => {
  const src = `App [ width = 400, height = 200,
    inner: View [ width = 300, height = 100,
      box: View [ width = 100, height = 40, x = center, fill = navy ] ],
  ]`;
  const r = compile(src, {});
  const app = settleHeadless(r.source, { deps: r.deps });
  assert.equal(app.inner.box.x, 100);
  app.inner.width = 500;
  settle();
  assert.equal(app.inner.box.x, 200, "recentered on parent resize");
  app.discard();
});

await test("center/end: a size slot refuses the position literal, naming the rule", () => {
  const r = compile("App [ width = 200, height = 100, v: View [ width = center ] ]", {});
  assert.ok(r.errors.length > 0);
  assert.match(r.errors[0].message, /legal on x and y only/);
});


// ── Author-facing font metrics (compositing.md Part III) ────────────────────
//
// Read-only, REACTIVE intrinsics of the EFFECTIVE font on Text: measured (the
// deterministic stub here; the browser's measurer in a page), re-derived when
// the effective font changes — the prevailing slots, so a provider's write
// re-derives a consumer's read. `baseline` is the first line's baseline y.

await test("Text metrics: ascent/descent/capHeight/xHeight/baseline are measured, ordered, and consistent", () => {
  const app = build(`App [ width=400, height=200,
    a: Text [ text="Title", fontSize=32 ],
    b: Text [ y=60, text="body", fontSize=16 ],
    ]`);
  const [a, b] = app.children;
  assert.ok(a.ascent > 0 && a.descent > 0, "metrics are positive");
  assert.equal(a.baseline, a.ascent, "the first baseline sits at the font ascent");
  assert.ok(a.capHeight <= a.ascent, "cap band fits inside the ascent");
  assert.ok(a.xHeight <= a.capHeight, "x-height fits inside the cap band");
  assert.ok(a.ascent > b.ascent, "a larger size measures a larger ascent");
});

await test("Text metrics are REACTIVE to the effective font — a constraint riding baseline follows a size change", () => {
  // The cross-size baseline-alignment idiom the metrics exist for: b's y
  // derives from both baselines; growing a's font re-derives it.
  const app = build(`App [ width=400, height=200,
    a: Text [ text="Title", fontSize=32 ],
    b: Text [ x=120, y={ parent.a.y + parent.a.baseline - this.baseline }, text="beside", fontSize=14 ],
    ]`);
  const [a, b] = app.children;
  const y0 = b.y;
  assert.ok(Math.abs(a.baseline - (y0 + b.baseline)) < 1e-9, "baselines aligned at build");
  a.fontSize = 64;
  settle();
  assert.ok(b.y > y0, "a larger title re-derives the aligned neighbour's y");
  assert.ok(Math.abs(a.baseline - (b.y + b.baseline)) < 1e-9, "baselines aligned after the change");
});

summarize("unit");

// ── the device profile: three independent facts, none of them a guess ───────

await test("device profile: the facts are read-only, and a hybrid is expressible", () => {
  const app = build(`App [ width = 100, height = 100,
    touchy: boolean = { this.touchDevice },
    floor:  boolean = { this.hasTouch },
    fine:   boolean = { this.hasPointer },
    live:   string  = { this.lastPointerType },
    ]`);
  settle();
  // the runtime feeds them (boot.ts); the defaults describe a plain desktop
  assert.equal(app.touchy, false);
  assert.equal(app.fine, true, "a fine pointer until the profile says otherwise");
  assert.equal(app.live, "mouse");

  // A WINDOWS TOUCH LAPTOP: has both, primary is the trackpad — the case a
  // single boolean cannot answer, and the reason hasTouch exists.
  app.touchDevice = false; app.hasTouch = true; app.hasPointer = true;
  settle();
  assert.equal(app.touchy, false, "sizing stays desktop — the trackpad IS primary");
  assert.equal(app.floor, true, "but a finger may still arrive: the hit-target floor applies");

  // the live fact follows the gesture, which is what a hybrid actually needs
  app.lastPointerType = "touch"; settle();
  assert.equal(app.live, "touch");
});

await test("device profile: an app may not WRITE the profile (the runtime owns it)", () => {
  const errs = check(parse(`App [ width = 100, height = 100, touchDevice = true ]`));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /read-only/);
  for (const name of ["hasTouch", "hasPointer", "lastPointerType"]) {
    const e = check(parse(`App [ width = 100, height = 100, ${name} = ${name === "lastPointerType" ? '"touch"' : "true"} ]`));
    assert.equal(e.length, 1, `${name} must be read-only`);
  }
});

// ── Heartbeat: the frame heartbeat as a component (heartbeat.ts) ──────────────────

await test("Heartbeat: onFrame(dt) is called per frame, with dt in SECONDS", () => {
  // the clock must be the fake one BEFORE the tree builds: a Heartbeat member
  // joins the clock at init (autoStart), like an animator
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  const app = build(`App [ width = 100, height = 100,
    ticks: number = 0,
    elapsed: number = 0,
    f: Heartbeat [ onFrame(dt: number) { this.parent.ticks = this.parent.ticks + 1; this.parent.elapsed = this.parent.elapsed + dt } ],
    ]`);
  settle();
  sched.frame(0);      // the first frame only establishes the baseline
  assert.equal(app.ticks, 0, "no step until there are two timestamps");
  sched.frame(16);
  assert.equal(app.ticks, 1);
  assert.ok(Math.abs(app.elapsed - 0.016) < 1e-9, "dt is seconds, not ms");
  sched.frame(32);
  assert.equal(app.ticks, 2);
});

await test("Heartbeat: `running` gates the heartbeat — a live slot, and dt never jumps on resume", () => {
  const app = build(`App [ width = 100, height = 100,
    go: boolean = false,
    ticks: number = 0,
    biggest: number = 0,
    f: Heartbeat [ running = { this.parent.go },
        onFrame(dt: number) { this.parent.ticks = this.parent.ticks + 1; if (dt > this.parent.biggest) this.parent.biggest = dt } ],
    ]`);
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  settle();
  sched.frame(0); sched.frame(16);
  assert.equal(app.ticks, 0, "running = false: nothing ticks");
  app.go = true; settle();
  sched.frame(100); sched.frame(116);
  assert.equal(app.ticks, 1, "started by the constraint, first frame is the baseline");
  // a long gap (a backgrounded tab) is CLAMPED, so an integrator cannot explode
  sched.frame(60116);
  assert.ok(app.biggest <= 1 / 15 + 1e-9, `dt clamped to the max step, got ${app.biggest}`);
});
