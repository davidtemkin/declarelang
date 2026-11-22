// color-strings — a color in code may be written as CSS writes it, `"#4169E1"` or
// `"royalblue"`, wherever TypeScript types it as a Color, beside `0x4169E1`. The
// compile turns each such literal into its number; a hex string or a color name
// arriving at run time is read where it lands; text that is no color is said.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

async function boot(src) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const app = instantiate(program);
  settle();
  return { app, source: r.source };
}

async function errorsOf(src) {
  return (await compile(src, {})).errors.map((e) => e.message);
}

await test("a quoted hex or a CSS name, wherever a color goes in a body, is the color's number — and the compile leaves no string behind", async () => {
  const { app, source } = await boot(`App [ width = 200, height = 100, fill = { app.width > 100 ? "#6495ED" : "royalblue" },
    v: View [ width = 50, height = 50, stroke = { Stroke(1, "#EBC9A2") }, fill = { Color.mix("#ffffff", "navy", 0.5) } ],
    s: View [ width = 10, height = 10, shadow = { Shadow(0, 2, 4, "#00000033") }, fill = { Gradient.linear("tomato", "#0f0") } ],
    t: Text [ text = { "#abc and royalblue" } ] ]`);
  assert.equal(app.fill, 0x6495ED);
  assert.deepEqual({ ...app.v.stroke }, { width: 1, color: 0xEBC9A2 });
  assert.equal(app.v.fill, 0x8080C0);
  assert.equal(app.s.fill.stops[0].color, 0xFF6347);
  assert.equal(app.s.fill.stops[1].color, 0x00FF00);
  assert.equal(app.t.text, "#abc and royalblue", "a string headed for a string stays one");
  assert.doesNotMatch(source, /"royalblue"|"navy"|"tomato"/, "no color name reaches the running program");
});

await test("a misspelled name is a type error with the near name; a bare #hex or name inside { } names the quoted form", async () => {
  assert.match((await errorsOf(`App [ fill = { "royalbleu" } ]`))[0], /Did you mean '"royalblue"'/);
  assert.match((await errorsOf(`App [ fill = { #334455 } ]`))[0], /write "#334455" \(or 0x334455\)/);
  assert.match((await errorsOf(`App [ fill = { navy } ]`))[0], /write "navy" \(or 0x000080\)/);
});

await test("arithmetic on a Color is refused, naming Color's operations", async () => {
  const errs = await errorsOf(`App [ k: number = { (app.fill ?? 0) & 0xFF } ]`);
  assert.ok(errs.some((e) => /operand of this arithmetic is a Color .* Color\.mix/.test(e)), errs.join("\n"));
});

await test("text from data becomes a color through Color.from; a hex string that reaches a color at run time is read there", async () => {
  const { app } = await boot(`schema Tag [ name: string, tone: string ]
App [ width = 200, height = 100,
    tags: Dataset [ schema = [ tags[]: Tag ], contents = { { tags: [ { name: "a", tone: "#CC3333" } ] } } ],
    tint: Color = null,
    v: View [ width = 50, height = 50, fill = { Color.from(app.tags.value.tags[0].tone) } ],
    w: View [ width = 50, height = 50 ] ]`);
  assert.equal(app.v.fill, 0xCC3333);
  app.tint = JSON.parse('"#102030"');
  assert.equal(app.tint, 0x102030, "a declared Color stores the number");
  app.w.fill = JSON.parse('"#11223344"');
  assert.ok(app.w.fill > 0xFFFFFF, "an alpha hex is the runtime's alpha encoding");
});

await test("a color name that arrives at run time is read; text that is no color is said, naming the view and attribute, and paints nothing", async () => {
  const { app } = await boot(`App [ width = 200, height = 100, v: View [ width = 50, height = 50 ], w: View [ width = 50, height = 50 ] ]`);
  app.v.fill = JSON.parse('"Crimson"');
  assert.equal(app.v.fill, 0xDC143C, "a name, in any case, is its color");
  const said = [];
  const orig = console.error;
  console.error = (...a) => said.push(a.join(" "));
  try { app.w.fill = JSON.parse('"crimsonish"'); } finally { console.error = orig; }
  assert.equal(app.w.fill, null);
  assert.ok(said.some((s) => /"crimsonish" on app\.w\.fill arrived as a string at run time, and it is not a color/.test(s)), said.join("\n"));
});

await test("the runtime's built-in color attributes are exactly the schemas' color and fill attributes", async () => {
  const { SCHEMAS } = await import("../runtime/dist/schema.js");
  const { BUILTIN_COLOR_ATTRS } = await import("../runtime/dist/attributes.js");
  const want = new Set();
  for (const sc of Object.values(SCHEMAS)) for (const [n, t] of Object.entries(sc.attrs)) if (t.kind === "color" || t.kind === "fill") want.add(n);
  assert.deepEqual([...BUILTIN_COLOR_ATTRS].sort(), [...want].sort());
});

// A built-in color name is a color on every class, so a class can't declare one as
// something a color isn't: a `tint: string` would be handed numbers (Pagemap
// functional run 1's avatar lost its fill). Declared a Color, or a number, it is fine.
await test("a built-in color name declared as a string is refused; as a Color or a number it holds a color", async () => {
  const bad = await errorsOf(`class Avatar [ width = 20, height = 20, tint: string = "#80a7ff" ]
App [ width = 100, height = 100, Avatar [ tint = "#336699" ] ]`);
  assert.ok(bad.some((m) => /'tint' is a color wherever it is declared .* so it can't be a string: declare it 'Color' \(or 'number'\)/.test(m)), bad.join("\n"));
  for (const [type, set] of [["Color = #80a7ff", "#336699"], ["number = 0", "0x336699"]]) {
    const ok = await errorsOf(`class Chip [ width = 20, height = 20, tint: ${type}, fill = { classroot.tint } ]
App [ width = 100, height = 100, Chip [ tint = ${set} ] ]`);
    assert.deepEqual(ok, [], type);
  }
});

await test("a bare value takes a color in quotes too, the same color as unquoted", async () => {
  const { app } = await boot(`App [ width = 100, height = 100, fill = "#FF000080",
    v: View [ width = 10, height = 10, fill = "royalblue", stroke = Stroke(1, "#123") ] ]`);
  assert.equal(app.v.fill, 0x4169E1);
  assert.equal(app.v.stroke.color, 0x112233);
  assert.ok(app.fill > 0xFFFFFF, "an alpha hex keeps its alpha");
  assert.match((await errorsOf(`App [ fill = "#12" ]`))[0], /3, 4, 6, or 8 hex digits/);
});

await test("Color.hex gives a color's text, however it was written, so equal colors read equal", async () => {
  const { app } = await boot(`App [ width = 100, height = 100,
    a: string = { Color.hex(0xE85D3C) ?? "" }, b: string = { Color.hex("#E85D3C") ?? "" },
    c: string = { Color.hex("tomato") ?? "" }, d: string = { Color.hex(Color.withAlpha(0xE85D3C, 0.5)) ?? "" },
    e: string = { Color.hex(null) ?? "none" } ]`);
  assert.equal(app.a, "#e85d3c");
  assert.equal(app.b, "#e85d3c");
  assert.equal(app.c, "#ff6347");
  assert.equal(app.d, "#e85d3c80");
  assert.equal(app.e, "none");
});

// A color is a value in code; data holds text. A data schema has no Color field (its field
// types are JSON's), a record keeps the text it was given, and only Declare's own Color takes
// the compile's literal step — a program's own `#${string}` type is text (Presentify run 15:
// its records' "#5B3DF5" left as 5979637, and every save was refused).
await test("a data schema has no Color field, and a record or a program's own #-type keeps its hex text", async () => {
  const refused = await errorsOf(`schema Swatch [ id: string, fill: Color ]
App [ width = 100, height = 100 ]`);
  assert.ok(refused.some((m) => /'fill: Color' names no schema .*string \| number \| boolean \| any/.test(m)), refused.join("\n"));
  const { app } = await boot(`schema Swatch [ id: string, fill: string ]
script { type Hex = \`#\${string}\` }
App [ width = 100, height = 100, fill = { "royalblue" },
    made: Swatch = { { id: "a", fill: "#5B3DF5" } },
    hex: Hex = { "#5B3DF5" },
    wire: string = { JSON.stringify(app.made) + " " + JSON.stringify(app.hex) } ]`);
  assert.equal(app.wire, '{"id":"a","fill":"#5B3DF5"} "#5B3DF5"');
  assert.equal(app.fill, 0x4169E1, "a literal headed for a view is still its number");
});

await test("Color.from reads a color from text — hex or a CSS name — and gives null for text that is not one", async () => {
  const { app } = await boot(`App [ width = 100, height = 100,
    a: Color = { Color.from("#5B3DF5") }, b: Color = { Color.from("#abc") },
    c: string = { Color.hex(Color.from("#5b3df580")) ?? "" }, d: Color = { Color.from("crimson") }, e: Color = { Color.from("") } ]`);
  assert.equal(app.a, 0x5B3DF5);
  assert.equal(app.b, 0xAABBCC);
  assert.equal(app.c, "#5b3df580");
  assert.equal(app.d, 0xDC143C, "a CSS name is read");
  assert.equal(app.e, null);
  const hint = await errorsOf(`schema T [ tone: string ]
App [ width = 100, height = 100, t: T = { { tone: "#112233" } }, v: View [ fill = { app.t.tone } ] ]`);
  assert.ok(hint.some((m) => /a string is text, not a color: read it as one with Color\.from/.test(m)), hint.join("\n"));
});

summarize("color-strings");
