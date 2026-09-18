// inline views in rich text — a tag whose name is a class the program declares
// (`<Issue id='142'/>`) is ONE REAL VIEW of that class, placed inline in the
// flowing text as an atomic box the text flows around.
//
// The mechanism is split across two renderers by design — the DOM emits a
// placeholder per slot and reads back where the browser put it; the manual flow
// (canvas, and the Mac host, which cannot place slots in its native text
// engine) computes the same boxes as it wraps — so the GEOMETRY FACT they
// publish must come out the same shape on both. Most cases run headless, where
// `setRichContent` returns -1 and the manual flow is exactly the canvas path;
// the DOM half runs in Chrome and is compared against the headless numbers.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { buildProduction } from "../tools/declarec.mjs";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, HeadlessBackend } from "../runtime/dist/index.js";

// One deterministic measurer: 8px a character, 10 in a monospace face — the
// same stub shape text.test.mjs uses, so every number below is arithmetic.
provideMeasurer({
  font: "16px sans-serif", letterSpacing: "0px",
  measureText(s) {
    const per = /mono|menlo|courier/i.test(this.font) ? 10 : 8;
    return { width: [...String(s)].length * per, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4,
      actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 0 };
  },
});

// The chip every case embeds: a rounded box that sizes itself to its label, so
// "the view owns its own width/height" is a real derivation and not a literal.
const ISSUE = `class Issue extends View [
    id: number = 0,
    hot: boolean = false,
    tone: string = "plain",
    tint: Color = #DDF4E4,
    align: CrossAlign = start,
    state: "open" | "closed" = "open",
    height = 20, width = { this.t.width + 26 }, cornerRadius = 10, fill = { this.tint },
    t: TextLabel [ x = 19, fontSize = 12, text = { "#" + classroot.id } ]
    ]`;

async function boot(src) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.deepEqual(b.errors.map((e) => e.message), [], "compiles");
  const app = instantiate(b.program);
  app.attach(new HeadlessBackend(), null);
  settle();
  return app;
}

/** Every flow under a rich text, in tree order. */
const flowsOf = (rt) => rt.children.filter((c) => c.constructor.name === "TextFlow");
/** The rich text's inline views (its children that are not flows/blocks). */
const chipsOf = (rt, cls) => rt.children.filter((c) => c.constructor.name === cls);
/** The published geometry fact, merged across this rich text's flows. */
function factOf(rt) {
  const out = {};
  const walk = (v) => {
    if (v.constructor.name === "TextFlow") Object.assign(out, v.slots());
    for (const c of v.children) if (c.children !== undefined) walk(c);
  };
  walk(rt);
  return out;
}

/** Collect the runtime's contained diagnostics (console.error) around `fn`. */
async function withDiagnostics(fn) {
  const said = [];
  const real = console.error;
  console.error = (...a) => said.push(a.join(" "));
  try { return { value: await fn(), said }; } finally { console.error = real; }
}

// ── the tag becomes a view, and its attributes convert by declared type ──────

await test("a tag naming a class becomes one real view, attributes converted by their declared types", async () => {
  const app = await boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400,
        html = "Fixed by <Issue id='142' hot tone='urgent' tint='#112233' align='center' state='closed'/> today." ],
      ]`);
  const chips = chipsOf(app.m, "Issue");
  assert.equal(chips.length, 1, "one Issue view");
  const c = chips[0];
  assert.equal(c.id, 142, "a number attribute converts to a number");
  assert.equal(c.hot, true, "a bare attribute is true");
  assert.equal(c.tone, "urgent", "a string attribute stays a string");
  assert.equal(c.tint, 0x112233, "a #RRGGBB attribute converts to a Color");
  assert.equal(c.align, "center", "an enum member converts by name");
  assert.equal(c.state, "closed", "a literal union's member converts too");
  // The class's own derivation still drives its size — the flow never sizes it.
  assert.equal(c.width, 32 + 26, "the view owns its width: the label's measure + 26");
  assert.equal(c.height, 20);
});

await test("the view is placed IN the line: after the words before it, before the words after", async () => {
  const app = await boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "Fixed by <Issue id='142'/> today." ],
      ]`);
  const c = chipsOf(app.m, "Issue")[0];
  const texts = flowsOf(app.m)[0].children.filter((v) => v.constructor.name === "Text");
  const before = texts.find((t) => t.text.includes("Fixed"));
  const after = texts.find((t) => t.text.includes("today"));
  assert.ok(before.x + before.width <= c.x, `the chip sits after "Fixed by": ${before.x + before.width} vs ${c.x}`);
  assert.ok(c.x + c.width <= after.x, `and "today." after the chip: ${c.x + c.width} vs ${after.x}`);
  // The geometry fact carries exactly this box, in flow coordinates.
  const fact = factOf(app.m);
  const keys = Object.keys(fact);
  assert.deepEqual(keys, ["Issue#0"], "the default identity is the class name + its ordinal");
  assert.equal(fact["Issue#0"].x, c.x, "the fact's x is the placed x (the flow sits at x=0)");
  assert.equal(fact["Issue#0"].width, c.width);
  assert.equal(fact["Issue#0"].height, c.height);
});

// ── the tag IS the use site: it joins the attribute merge as its last layer ──
//
// `<Box width='120'/>` means `Box [ width = 120 ]`. The language's precedence
// rule is "nearest provider wins — class bodies base → leaf, then the use site",
// and ONLY THE WINNER INSTALLS: a class-body `{ }` constraint on a slot the tag
// claims is never built, so it cannot recompute over the tag's value.

const SIZED = `class Sized extends View [
    n: number = 3,
    lit: number = 0,
    height = 18,
    width = { 40 },                       // a class-body CONSTRAINT
    cornerRadius = 4, fill = #DDF4E4,
    ]`;

await test("a tag attribute beats a class-body CONSTRAINT on the same slot — the constraint never installs", async () => {
  const app = await boot(`${SIZED}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "wide <Sized width='120'/> then <Sized/> end." ],
      ]`);
  const [tagged, plain] = chipsOf(app.m, "Sized");
  assert.equal(tagged.width, 120, "the tag's width won");
  assert.equal(plain.width, 40, "a slot the tag does not mention keeps the class's constraint");
  // The GEOMETRY, not just the slot: the flow reserved 120px for the first box,
  // so the published fact carries it and the second box sits past it.
  const fact = factOf(app.m);
  assert.equal(fact["Sized#0"].width, 120, "the flow laid out the 120px box");
  assert.equal(fact["Sized#1"].width, 40);
  assert.ok(fact["Sized#1"].x >= fact["Sized#0"].x + 120, "the words after it were pushed by the real width");
});

await test("a tag attribute beats a class-body LITERAL, and a class-body :path binding, on the same slot", async () => {
  const lit = await boot(`class Lit extends View [ height = 10, width = 40 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "a <Lit width='90'/> b <Lit/> c" ],
      ]`);
  assert.deepEqual(chipsOf(lit.m, "Lit").map((c) => c.width), [90, 40], "the tag beats the class's literal");
  assert.equal(factOf(lit.m)["Lit#0"].width, 90, "and the flow laid the tag's width out");

  // The same rule for a slot the class binds from DATA: the tag is nearer, so
  // the datapath binding does not install on the view the tag claims.
  const data = await boot(`class Bound extends View [ height = 10, width = :n ]
    App [ width = 600, height = 300,
      d: Dataset [ ] { { "n": 33 } },
      m: HTMLText [ x = 10, y = 10, width = 400, datapath = { d.value },
        html = "a <Bound width='90'/> b <Bound/> c" ],
      ]`);
  assert.deepEqual(chipsOf(data.m, "Bound").map((c) => c.width), [90, 33],
    "the tag beats `width = :n`; the untouched one still reads the data");
});

await test("a percent resolves against the rich text's content width, like any child's", async () => {
  const app = await boot(`${SIZED}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "pct <Sized width='50%'/> end." ],
      ]`);
  const c = chipsOf(app.m, "Sized")[0];
  assert.equal(c.width, 200, "50% of the rich text's 400");
  assert.equal(factOf(app.m)["Sized#0"].width, 200, "and the flow laid THAT box out");
  // It is a standing relationship, not a number: the container narrows, the box
  // follows — the same thing `width = 50%` does for an ordinary child.
  app.m.width = 300;
  settle();
  assert.equal(c.width, 150, "the percent re-resolved when the container changed");
});

await test("a percent on a slot with no axis is REFUSED, not accepted as a value that does nothing", async () => {
  const src = (policy) => `class Padded extends View [ pad: Length = 4, width = 40, height = 10 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, unsupported = ${policy}, html = "a <Padded pad='50%'/> b" ],
      ]`;
  const { value: app, said } = await withDiagnostics(() => boot(src("strip")));
  assert.equal(chipsOf(app.m, "Padded")[0].pad, 4, "the slot keeps its class default — no percent object in it");
  assert.ok(said.some((m) => /no axis to resolve a percent against/.test(m)), said.join(" | "));
  await assert.rejects(() => boot(src(error_())), /no axis to resolve a percent against/);
});

await test("center and end are refused on a tag: the flow places an inline view", async () => {
  const src = (policy) => `class Al extends View [ width = 40, height = 10 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, unsupported = ${policy}, html = "a <Al width='center'/> b" ],
      ]`;
  const { value: app, said } = await withDiagnostics(() => boot(src("strip")));
  assert.equal(chipsOf(app.m, "Al")[0].width, 40, "no align literal landed in the Length slot");
  assert.ok(said.some((m) => /center and end have no meaning/.test(m)), said.join(" | "));
  await assert.rejects(() => boot(src(error_())), /center and end have no meaning/);
});

await test("a read-only slot is refused through the policy — never thrown from the setter mid-render", async () => {
  // View's own computed intrinsic…
  const src = (policy) => `class Ro extends View [ width = 40, height = 10 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, unsupported = ${policy}, html = "a <Ro hovered='true'/> b" ],
      ]`;
  const { value: app, said } = await withDiagnostics(() => boot(src("strip")));
  assert.equal(chipsOf(app.m, "Ro").length, 1, "the view is still built — the rest of the tag stands");
  assert.equal(app.m.children.filter((c) => c.constructor.name === "TextFlow").length >= 1, true, "and the prose rendered");
  assert.ok(said.some((m) => /hovered.*is read-only/.test(m)), said.join(" | "));
  await assert.rejects(() => boot(src(error_())), /hovered.*is read-only/);
  // …and a slot the class itself declares `readonly`.
  const own = (policy) => `class Ro2 extends View [ readonly n: number = { 7 }, width = 40, height = 10 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, unsupported = ${policy}, html = "a <Ro2 n='3'/> b" ],
      ]`;
  const second = await withDiagnostics(() => boot(own("strip")));
  assert.equal(chipsOf(second.value.m, "Ro2")[0].n, 7, "the declaration still computes it");
  assert.ok(second.said.some((m) => /Ro2\.n is read-only/.test(m)), second.said.join(" | "));
  await assert.rejects(() => boot(own(error_())), /Ro2\.n is read-only/);
});

await test("the use-site layer keeps identity: a content change rewrites a value on the SAME view", async () => {
  const app = await boot(`${SIZED}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "a <Sized n='1' width='120'/> b" ],
      ]`);
  const first = chipsOf(app.m, "Sized")[0];
  first.$mark = "alive";                        // stand-in for hover, focus, a running spring
  app.m.html = "a rewritten sentence with <Sized n='2' width='120'/> in it";
  settle();
  const still = chipsOf(app.m, "Sized")[0];
  assert.equal(still, first, "the same view object — the tag claiming slots did not cost identity");
  assert.equal(still.$mark, "alive", "its state survived");
  assert.equal(still.n, 2, "the changed attribute was rewritten");
  assert.equal(still.width, 120, "and the claimed slot still holds the tag's value");
  // Dropping an attribute hands the slot BACK to the class — constraint and all.
  // Which slots the tag claims is an instantiation fact, so that view is rebuilt.
  app.m.html = "a rewritten sentence with <Sized n='2'/> in it";
  settle();
  const after = chipsOf(app.m, "Sized")[0];
  assert.equal(after.width, 40, "the class's own constraint drives the slot again");
  assert.equal(after.n, 2, "the attributes the tag still carries are unchanged");
});

// ── refusals, through the component's own `unsupported` policy ───────────────

await test("an attribute the class does not have: strip drops it and says so; error throws", async () => {
  const src = (policy) => `${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, unsupported = ${policy},
        html = "a <Issue id='7' nope='4'/> b" ],
      ]`;
  const { value: app, said } = await withDiagnostics(() => boot(src("strip")));
  assert.equal(chipsOf(app.m, "Issue").length, 1, "the view is still created");
  assert.equal(chipsOf(app.m, "Issue")[0].id, 7, "the attributes that DO convert still land");
  assert.ok(said.some((m) => /no attribute 'nope'/.test(m)), "a dev diagnostic names it: " + said.join(" | "));
  await assert.rejects(() => boot(src(error_())), /no attribute 'nope'/, "error throws");
});

await test("a value that will not convert: strip drops the attribute; error throws, naming what the slot expects", async () => {
  const src = (policy) => `${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, unsupported = ${policy},
        html = "a <Issue id='not-a-number'/> b" ],
      ]`;
  const { value: app, said } = await withDiagnostics(() => boot(src("strip")));
  assert.equal(chipsOf(app.m, "Issue")[0].id, 0, "the slot keeps its class default");
  assert.ok(said.some((m) => /expects a number/.test(m)), "the diagnostic quotes the type: " + said.join(" | "));
  await assert.rejects(() => boot(src(error_())), /expects a number/);
});

await test("x and y are refused — the flow owns placement", async () => {
  const { value: app, said } = await withDiagnostics(() => boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "a <Issue id='1' x='300' y='40'/> b" ],
      ]`));
  const c = chipsOf(app.m, "Issue")[0];
  assert.notEqual(c.x, 300, "x did not come from the tag");
  assert.notEqual(c.y, 40, "y did not come from the tag");
  assert.ok(said.filter((m) => /is not yours to set here/.test(m)).length >= 2, "both are named: " + said.join(" | "));
});

await test("a tag with content is refused: an inline view must be self-closing", async () => {
  const src = (policy) => `${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, unsupported = ${policy}, html = "a <Issue>docs</Issue> b" ],
      ]`;
  const { value: app, said } = await withDiagnostics(() => boot(src("strip")));
  assert.equal(chipsOf(app.m, "Issue").length, 0, "no view is made");
  assert.ok(said.some((m) => /must be self-closing/.test(m)), said.join(" | "));
  // strip unwraps, exactly as it unwraps an unsupported tag: the text stays.
  const texts = flowsOf(app.m)[0].children.filter((v) => v.constructor.name === "Text").map((t) => t.text).join(" ");
  assert.match(texts, /docs/, "the content survives as text");
  await assert.rejects(() => boot(src(error_())), /must be self-closing/);
});

// ── everything else keeps the meaning it has today ───────────────────────────

await test("a tag naming no class stays plain HTML", async () => {
  const app = await boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "a <b>bold</b> <Nope/> c" ],
      ]`);
  assert.equal(chipsOf(app.m, "Issue").length, 0);
  const texts = flowsOf(app.m)[0].children.filter((v) => v.constructor.name === "Text");
  assert.ok(texts.some((t) => t.text.includes("bold") && t.fontWeight === "bold"), "<b> still bolds");
  assert.ok(texts.every((t) => !t.text.includes("Nope")), "an unknown tag still strips");
});

await test("<span class> is still a style, never a view — even when a class of that name exists", async () => {
  const app = await boot(`class hero extends View [ width = 10, height = 10 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400,
        textStyles = { { hero: { fontSize: 40 } } },
        html = "Base <span class='hero'>HEAD</span> tail" ],
      ]`);
  assert.equal(chipsOf(app.m, "hero").length, 0, "no view was made for the span");
  const texts = flowsOf(app.m)[0].children.filter((v) => v.constructor.name === "Text");
  assert.ok(texts.some((t) => t.text.includes("HEAD") && t.fontSize === 40), "the run wears the named style: " +
    JSON.stringify(texts.map((t) => [t.text, t.fontSize])));
});

await test("a class named exactly like a whitelisted tag wins in rich text", async () => {
  const app = await boot(`class code extends View [ width = 30, height = 12 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "see <code/> here" ],
      ]`);
  assert.equal(chipsOf(app.m, "code").length, 1, "the program class won");
  const fact = factOf(app.m);
  assert.deepEqual(Object.keys(fact), ["code#0"]);
});

// ── identity across content changes ──────────────────────────────────────────

await test("a matched view is KEPT across a content change, and only a changed attribute is rewritten", async () => {
  const app = await boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "a <Issue id='142'/> b" ],
      ]`);
  const first = chipsOf(app.m, "Issue")[0];
  first.$mark = "alive";                       // stand-in for hover, focus, a running spring
  app.m.html = "A totally different sentence about <Issue id='157'/> and more.";
  settle();
  const second = chipsOf(app.m, "Issue")[0];
  assert.equal(second, first, "the same view object — identity kept");
  assert.equal(second.$mark, "alive", "its state survived");
  assert.equal(second.id, 157, "the attribute that changed was rewritten");
});

await test("a `key` keeps identity when a tag is inserted before it", async () => {
  const app = await boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "a <Issue key='b' id='2'/> c" ],
      ]`);
  const keyed = chipsOf(app.m, "Issue")[0];
  keyed.$mark = "keyed";
  app.m.html = "a <Issue id='1'/> mid <Issue key='b' id='2'/> c";
  settle();
  const chips = chipsOf(app.m, "Issue");
  assert.equal(chips.length, 2, "two views now");
  const still = chips.find((c) => c.$mark === "keyed");
  assert.ok(still !== undefined, "the keyed view is the same object");
  assert.equal(still.id, 2, "and still carries its own attributes");
  assert.deepEqual(Object.keys(factOf(app.m)).sort(), ["Issue#0", "b"], "the keyed slot is addressed by its key");
});

await test("a vanished tag's view is discarded", async () => {
  const app = await boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "a <Issue id='1'/> b <Issue id='2'/> c" ],
      ]`);
  assert.equal(chipsOf(app.m, "Issue").length, 2);
  const gone = chipsOf(app.m, "Issue")[1];
  app.m.html = "a <Issue id='1'/> b";
  settle();
  assert.equal(chipsOf(app.m, "Issue").length, 1, "the second view is gone from the tree");
  assert.equal(gone.parent, null, "and unlinked");
  assert.deepEqual(Object.keys(factOf(app.m)), ["Issue#0"]);
});

// ── the run's face, and the line's geometry ──────────────────────────────────

await test("the inline view sees the surrounding run's face as provided values", async () => {
  const app = await boot(`class Chipface extends View [
      width = 10, height = 10,
      seen: object = { providedTextStyle() },
      ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400,
        html = "<h1>Big <Chipface/> title</h1><p>small <Chipface/> body</p>" ],
      ]`);
  const [inHeading, inBody] = chipsOf(app.m, "Chipface");
  assert.equal(inHeading.seen.fontSize, 32, "a chip in an h1 is heading-sized: " + JSON.stringify(inHeading.seen));
  assert.equal(inBody.seen.fontSize, 16, "and body-sized in a paragraph");
  assert.equal(typeof inHeading.seen.fontFamily, "string");
  assert.ok("fontWeight" in inHeading.seen && "textColor" in inHeading.seen && "letterSpacing" in inHeading.seen,
    "all five provided face names are there");
});

await test("a view taller than the line's text makes that line taller", async () => {
  const short = await boot(`class Tall extends View [ width = 20, height = 8 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "one <Tall/> two" ],
      ]`);
  const tall = await boot(`class Tall extends View [ width = 20, height = 60 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "one <Tall/> two" ],
      ]`);
  assert.ok(tall.m.height > short.m.height + 30,
    `the 60px view grew its line: ${short.m.height} → ${tall.m.height}`);
  // It sits ON the baseline: the box's bottom is the text's baseline, so a
  // taller box pushes the line's top up and the text stays put beneath it.
  const box = factOf(tall.m)["Tall#0"];
  const text = flowsOf(tall.m)[0].children.find((v) => v.constructor.name === "Text");
  assert.equal(box.y + box.height, text.y + 12, "the box's bottom is the run's baseline (ascent 12)");
});

await test("a size change re-flows the text — the words and the views after it move", async () => {
  const app = await boot(`class Chip extends View [ w: number = 20, width = { this.w }, height = 10 ]
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "one <Chip/> two <Chip/> three" ],
      ]`);
  const [a, b] = chipsOf(app.m, "Chip");
  const before = { b: b.x, fact: { ...factOf(app.m) } };
  const words = () => flowsOf(app.m)[0].children.filter((v) => v.constructor.name === "Text").map((t) => t.x);
  const wordsBefore = words();
  a.w = 120;
  settle();
  assert.equal(a.width, 120, "the view's own size changed");
  assert.equal(b.x, before.b + 100, `the following view moved by the delta: ${before.b} → ${b.x}`);
  assert.notDeepEqual(words(), wordsBefore, "and the words after it moved too");
  assert.equal(factOf(app.m)["Chip#0"].width, 120, "the fact carries the new box");
});

// ── the view's own state is the view's ───────────────────────────────────────
// A matched view keeps everything it owns — hover, focus, a running spring, and
// any attribute it or a handler of its own wrote. Only the attributes whose
// CONVERTED value changed in the content are rewritten.

const PILL = `class Pill extends View [
    label: string = "",
    picked: boolean = false,
    height = 20, width = 70, cornerRadius = 10,
    fill = { picked ? 0x1A7F37 : 0xDDDDDD },
    onClick() { this.picked = !this.picked }
    ]`;

await test("an attribute the view's own handler wrote survives every later render", async () => {
  const app = await boot(`${PILL}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "Click <Pill label='one'/> here." ],
      ]`);
  const pill = chipsOf(app.m, "Pill")[0];
  pill.onClick();
  settle();
  assert.equal(pill.picked, true, "the handler's write landed");
  // a width change re-lays the document out
  app.m.width = 320;
  settle();
  assert.equal(chipsOf(app.m, "Pill")[0], pill, "same view after a re-width");
  assert.equal(pill.picked, true, "and it still owns what it wrote");
  // a `scale` change rebuilds the document from the source
  app.m.scale = 1.4;
  settle();
  assert.equal(chipsOf(app.m, "Pill")[0], pill, "same view after a rebuild");
  assert.equal(pill.picked, true, "and it STILL owns what it wrote");
  // and the class default is what a NEW view starts from
  app.m.html = "Click <Pill label='one'/> and <Pill label='two'/> here.";
  settle();
  const [first, second] = chipsOf(app.m, "Pill");
  assert.equal(first, pill, "the matched view is the same one");
  assert.equal(first.picked, true, "still picked");
  assert.equal(second.picked, false, "the new one starts at the class default");
});

await test("a content change rewrites only the attribute that changed — the view's own state is untouched", async () => {
  const app = await boot(`${PILL}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "Click <Pill label='one'/> here." ],
      ]`);
  const pill = chipsOf(app.m, "Pill")[0];
  pill.onClick();
  settle();
  app.m.html = "Press <Pill label='two'/> instead.";
  settle();
  assert.equal(chipsOf(app.m, "Pill")[0], pill, "the same view");
  assert.equal(pill.label, "two", "the tag's changed attribute was rewritten");
  assert.equal(pill.picked, true, "and the state the view itself wrote was left alone");
});

await test("an attribute DROPPED from the tag goes back to the class default, and only that one", async () => {
  const app = await boot(`${PILL}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "Click <Pill key='p' label='one' picked='true'/> here." ],
      ]`);
  const pill = chipsOf(app.m, "Pill")[0];
  assert.equal(pill.picked, true, "the tag said so");
  app.m.html = "Click <Pill key='p' label='one'/> here.";
  settle();
  const after = chipsOf(app.m, "Pill")[0];
  assert.equal(after.picked, false, "the dropped attribute is the class default again");
  assert.equal(after.label, "one", "the attribute the tag still carries is unchanged");
});

// ── the baseline an inline view sits by ──────────────────────────────────────
// A chip is a word in the sentence, not a picture in it: when its subtree claims
// a baseline, that baseline sits on the line's. With nothing claiming one, the
// box's bottom takes the line — the placement a replaced box gets.

const BASED = `class Chip extends View [
    label: string = "hi",
    pad: number = 0,
    height = 22, width = { this.t.width + 16 }, cornerRadius = 11, fill = #DDF4E4,
    t: TextLabel [ x = 8, y = { parent.height / 2 - this.baseline + this.capHeight / 2 + classroot.pad },
                   fontSize = 12, text = { classroot.label } ]
    ]
  class Plain extends View [ width = 30, height = 22, fill = #EEEEEE ]`;

/** Where the chip's own label puts its baseline, in FLOW coordinates. */
const labelBaseline = (rt, chip) => factOf(rt)["Chip#0"].y + chip.t.y + chip.t.baseline;

await test("a view whose subtree claims a baseline is placed BY it", async () => {
  const app = await boot(`${BASED}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "one <Chip/> two <Plain/> three" ],
      ]`);
  const chip = chipsOf(app.m, "Chip")[0];
  const flow = flowsOf(app.m)[0];
  assert.equal(typeof flow.firstBaseline, "number", "the flow published its line baseline");
  assert.equal(labelBaseline(app.m, chip), flow.firstBaseline,
    `the chip's label sits on the prose baseline (${flow.firstBaseline})`);
  // the box therefore STRADDLES the baseline: part of it hangs below the line
  const box = factOf(app.m)["Chip#0"];
  assert.ok(box.y + box.height > flow.firstBaseline, "the box hangs below the baseline, as a chip does");
  // and a view with nothing claiming a baseline keeps bottom-on-baseline
  const plain = factOf(app.m)["Plain#0"];
  assert.equal(plain.y + plain.height, flow.firstBaseline, "no claim ⇒ the bottom edge takes the line");
});

await test("the baseline is measured, not frozen: moving what claims it re-places the box", async () => {
  const app = await boot(`${BASED}
    App [ width = 600, height = 300,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "one <Chip/> two" ],
      ]`);
  const chip = chipsOf(app.m, "Chip")[0];
  const flow = () => flowsOf(app.m)[0];
  // How far the box sits ABOVE the line's baseline — the number the placement is
  // made of, on either renderer.
  const lift = () => flow().firstBaseline - factOf(app.m)["Chip#0"].y;
  const claim = () => chip.t.y + chip.t.baseline;
  assert.equal(lift(), claim(), "the box is lifted by exactly the baseline its label claims");
  const before = lift();
  chip.pad = 6;                       // the label moved DOWN inside the chip
  settle();
  assert.equal(lift(), before + 6, `the placement followed it: ${before} → ${lift()}`);
  assert.equal(lift(), claim(), "still lifted by what the label claims");
  assert.equal(labelBaseline(app.m, chip), flow().firstBaseline, "so the label is still on the prose baseline");
  // a text change re-sizes the chip and the baseline still holds
  chip.label = "a much longer label";
  settle();
  assert.equal(labelBaseline(app.m, chip), flow().firstBaseline, "after a text change too");
});

// ── the Markdown reader reads the same tags ──────────────────────────────────

await test("Markdown reads the same tag inline, and every other `<` stays literal", async () => {
  const app = await boot(`${ISSUE}
    App [ width = 600, height = 300,
      m: Markdown [ x = 10, y = 10, width = 400, text = "Fixed by <Issue id='142'/>, see <https://declare.dev> and a < b." ],
      ]`);
  assert.equal(chipsOf(app.m, "Issue").length, 1, "the class tag became a view");
  assert.equal(chipsOf(app.m, "Issue")[0].id, 142);
  const texts = flowsOf(app.m)[0].children.filter((v) => v.constructor.name === "Text").map((t) => t.text).join(" ");
  assert.match(texts, /a < b/, "a lone `<` is still the literal character");
  assert.match(texts, /declare\.dev/, "an autolink is still an autolink");
});

// ── the DOM path: the same fact, from the placeholders the browser flowed ────

const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => existsSync(p));

if (!CHROME) {
  console.log("  (skipping the DOM half — no Chrome found)");
} else {
  const puppeteer = (await import("puppeteer-core")).default;
  const DOC = `${ISSUE}
    App [ width = 600, height = 300, fontSize = 16,
      m: HTMLText [ x = 10, y = 10, width = 400, html = "Fixed by <Issue id='142'/> and <Issue id='157'/> today." ],
      ]`;
  const dom = await (async () => {
    const b = await buildProduction(DOC, { render: "dom" });
    assert.ok(b.ok, "build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const appJs = b.files.find((f) => f.name.startsWith("app.")).contents;
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(`<!doctype html><div id=host></div><script type=module>${appJs}</script>`, { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 400));
      return { errs, probe: await page.evaluate(() => {
        const phs = Array.from(document.querySelectorAll("[data-rich-slot]"));
        const chips = Array.from(document.querySelectorAll("#host *")).filter((e) =>
          /^#1[45]\d$/.test(e.textContent || "") && (e.parentElement?.textContent ?? "") !== e.textContent);
        const boxOf = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
        // WHERE A BASELINE IS, read the way CSS defines it: an EMPTY, zero-sized
        // inline-block's own baseline is its bottom margin edge, so dropped into a
        // line at `vertical-align: baseline` its box IS that line's baseline. One
        // probe in the prose, one inside the chip's label; if the rule holds, the
        // two land on the same y.
        const baselineIn = (host, before) => {
          const p = document.createElement("span");
          p.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
          host.insertBefore(p, before ?? host.firstChild);
          const y = p.getBoundingClientRect().bottom;
          p.remove();
          return y;
        };
        const ph0 = phs[0];
        const lineBaseline = baselineIn(ph0.parentElement, ph0);
        const label = chips[0]?.querySelector("span");
        // The rich text's own element, and which of its children each branch is:
        // the flows must come FIRST and the inline views after, so a view paints
        // on top of the line it sits in — under it, the flow's selectable box
        // takes every pointer event and the view can never be clicked.
        const rt = (() => { let a = chips[0]?.parentElement; while (a && !a.contains(ph0)) a = a.parentElement; return a; })();
        const indexIn = (n) => { let e = n; while (e && e.parentElement !== rt) e = e.parentElement; return e === null ? -1 : [...rt.children].indexOf(e); };
        return {
          slots: phs.map((e) => e.dataset.richSlot).sort(),
          // a placeholder is EMPTY: it holds a seat, it is not the view
          empty: phs.every((e) => e.textContent === ""),
          inline: phs.map((e) => getComputedStyle(e).display),
          phBoxes: phs.map(boxOf),
          chipBoxes: chips.map(boxOf),
          chipText: chips.map((e) => e.textContent),
          lineBaseline,
          labelBaseline: label === null || label === undefined ? null : baselineIn(label, label.firstChild),
          order: { flow: indexIn(ph0), view: indexIn(chips[0]) },
        };
      }) };
    } finally { await browser.close(); }
  })();

  await test("DOM: one placeholder per slot, flowed inline and empty", () => {
    assert.deepEqual(dom.errs, [], dom.errs.slice(0, 2).join(" | "));
    assert.deepEqual(dom.probe.slots, ["Issue#0", "Issue#1"], "the same slot keys the model made");
    assert.ok(dom.probe.empty, "the placeholder contributes no text (selection/copy are unaffected)");
    assert.ok(dom.probe.inline.every((d) => d === "inline-block"), "flowed as an atomic box: " + dom.probe.inline.join());
  });

  await test("DOM: the real view lands exactly where the browser flowed its placeholder", () => {
    assert.equal(dom.probe.chipBoxes.length, 2, "both chips rendered: " + JSON.stringify(dom.probe.chipText));
    const ph = [...dom.probe.phBoxes].sort((a, b) => a.x - b.x);
    const chips = [...dom.probe.chipBoxes].sort((a, b) => a.x - b.x);
    for (let i = 0; i < 2; i++) {
      // the chip's LABEL sits inside the chip, which sits on the placeholder's box
      assert.deepEqual(chips[i], ph[i],
        `chip ${i} is not on its placeholder: ${JSON.stringify(chips[i])} vs ${JSON.stringify(ph[i])}`);
    }
    assert.ok(ph[0].x < ph[1].x, "the two slots are in reading order");
  });

  await test("DOM: an inline view is parented ABOVE the flow it sits in, so input reaches it", () => {
    const o = dom.probe.order;
    assert.ok(o.flow >= 0 && o.view >= 0, "both branches found under the rich text: " + JSON.stringify(o));
    assert.ok(o.view > o.flow,
      `the view must paint over the line, not under it: flow at ${o.flow}, view at ${o.view}`);
  });

  await test("DOM: the chip's own label sits on the prose baseline", () => {
    assert.equal(typeof dom.probe.labelBaseline, "number", "the chip's label element was found");
    assert.ok(Math.abs(dom.probe.labelBaseline - dom.probe.lineBaseline) <= 1,
      `label baseline ${dom.probe.labelBaseline} vs line baseline ${dom.probe.lineBaseline}`);
  });

  // The CANVAS renderer, in a real browser: the manual flow places the slots
  // itself (there is no native text engine to ask), and the inline view is an
  // ordinary painted view. Pixels, because on canvas there is nothing else to
  // read — a distinctly-colored chip has to appear at the box the flow published.
  const canvas = await (async () => {
    const src = `class Chip extends View [ width = 60, height = 20, fill = #FF00FF ]
      App [ width = 600, height = 200,
        m: HTMLText [ x = 10, y = 10, width = 400, html = "Fixed by <Chip/> today." ],
        ]`;
    const b = await buildProduction(src, { render: "canvas" });
    assert.ok(b.ok, "canvas build failed: " + (b.errors || []).map((e) => e.message).join("; "));
    const appJs = b.files.find((f) => f.name.startsWith("app.")).contents;
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.setContent(`<!doctype html><div id=host></div><script type=module>${appJs}</script>`, { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 400));
      return { errs, probe: await page.evaluate(() => {
        const cv = document.querySelector("canvas");
        if (cv === null) return { ok: false };
        const cx = cv.getContext("2d");
        const { width: W, height: H } = cv;
        const d = cx.getImageData(0, 0, W, H).data;
        let x0 = -1, y0 = -1, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] > 200 && d[i + 3] > 40) {
            if (x0 < 0) { x0 = x; y0 = y; }
            x0 = Math.min(x0, x); y0 = Math.min(y0, y);
            x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
        }
        return { ok: true, dpr: window.devicePixelRatio, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
      }) };
    } finally { await browser.close(); }
  })();

  await test("canvas: the inline view is painted at the box the manual flow published", () => {
    assert.deepEqual(canvas.errs, [], canvas.errs.slice(0, 2).join(" | "));
    assert.ok(canvas.probe.ok, "no canvas mounted");
    const r = canvas.probe.dpr;
    const box = canvas.probe.box;
    assert.ok(box.x > 0, "no magenta chip found on the canvas: " + JSON.stringify(box));
    assert.ok(Math.abs(box.w / r - 60) <= 2 && Math.abs(box.h / r - 20) <= 2,
      `the painted chip is not 60×20: ${JSON.stringify(box)} at dpr ${r}`);
    // It is INSIDE the line, not at the flow's origin: the words before it
    // ("Fixed by ") push it right of the rich text's own x.
    assert.ok(box.x / r > 10 + 40, "the chip was not placed after the words before it: " + JSON.stringify(box));
  });

  await test("DOM and canvas publish the same fact SHAPE, and the same baseline placement", async () => {
    const app = await boot(DOC);
    const fact = factOf(app.m);
    assert.deepEqual(Object.keys(fact).sort(), dom.probe.slots, "same keys");
    for (const k of Object.keys(fact)) {
      assert.deepEqual(Object.keys(fact[k]).sort(), ["height", "width", "x", "y"], "same four numbers per slot");
    }
    // THE SAME PLACEMENT, each in its own units: the two renderers measure with
    // different font metrics (the stub here, the real face in Chrome), so the
    // statement they must both make is the geometric one — the chip's own label
    // baseline IS the line's. The manual flow says it in flow coordinates, the
    // DOM in client ones.
    const chip = chipsOf(app.m, "Issue")[0];
    const flow = flowsOf(app.m)[0];
    assert.equal(fact["Issue#0"].y + chip.t.y + chip.t.baseline, flow.firstBaseline,
      "manual flow: the chip's label is on the line's baseline");
    assert.ok(Math.abs(dom.probe.labelBaseline - dom.probe.lineBaseline) <= 1,
      `DOM: the chip's label is on the line's baseline (${dom.probe.labelBaseline} vs ${dom.probe.lineBaseline})`);
    // and neither puts the box's BOTTOM there — a chip straddles the line
    assert.ok(fact["Issue#0"].y + fact["Issue#0"].height > flow.firstBaseline, "manual: the box hangs below");
    assert.ok(dom.probe.phBoxes[0].y + dom.probe.phBoxes[0].h > dom.probe.lineBaseline, "DOM: the box hangs below");
  });
}

// `unsupported = error` written as a bare token, kept out of the template
// literals above so the sources stay readable.
function error_() { return "error"; }

summarize("inline-views");
