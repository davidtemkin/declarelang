// scaffold tests — the proof that the typed-scaffolding generator (src/
// scaffold.ts) is REAL: stock tsc, run over the generated scaffold plus a
// hand-authored check-block, accepts a valid body and rejects a cross-boundary
// one. This is the first slice of APPROACH §5's "typechecking falls out given
// the right typed scaffolding" — here the scaffolding, and here tsc catching
// imperative misuse of a declarative type.
//
// Two things are asserted:
//   1. Snapshot — the generated scaffold for a small program (View/Text + a
//      WeatherTab-like user class) carries the right `declare class` lines
//      (attrs typed via the AttrType→TS map, base via `extends`, methods).
//   2. tsc — the scaffold + a check-block, compiled through an in-memory
//      CompilerHost under `strict`, yields 0 semantic diagnostics for a valid
//      body and exactly the expected diagnostics for a cross-boundary one.
//
// Runs against the built dist/ (npm test builds first), like the other suites.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { test, summarize } from "./harness.mjs";
import { parseProgram, programSchemas } from "../runtime/dist/index.js";
import { generateScaffold } from "../compiler/dist/scaffold.js";
import ts from "typescript";

const require = createRequire(import.meta.url);
// The real lib.*.d.ts live beside typescript.js — the virtual FS reads them
// from disk so `.call`/strictBindCallApply and the standard lib are in scope.
const LIB_DIR = path.dirname(require.resolve("typescript"));

// The WeatherTab-like program the doc sketches (language §5): a user class over
// View with typed declared slots, a constrained inherited slot (`height`), and
// a method — plus a root that uses it.
const PROGRAM = `class WeatherTab extends View [
  label: string = "Mon",
  sel: boolean = false,
  openHeight: number = 120,
  height = { sel ? openHeight : 25 },
  select() { sel = true }
]
App [ WeatherTab [] ]`;

/** Parse + register + generate — the exact call shape a compile pass would use:
 *  `programSchemas(program.classes).schemas` is the built-in+user registry, and
 *  `program.classes` carries the methods. */
function scaffoldFor(source) {
  const program = parseProgram(source);
  const { schemas, errors } = programSchemas(program.classes);
  assert.equal(errors.length, 0, `program should register cleanly, got: ${errors.map((e) => e.message).join("; ")}`);
  return generateScaffold(schemas, program.classes);
}

/** Run stock tsc over `scaffold.ts` (the generated scaffold) + `case.ts` (a
 *  hand-authored check file) in a virtual FS, under `strict` (so
 *  strictBindCallApply types `fn.call(inst)` to the body's real return type).
 *  Returns simplified {code, message, line} diagnostics per file — both
 *  syntactic and semantic. Both files are script-mode (no import/export), so
 *  the scaffold's ambient `type`/`declare` shapes are global to the check file.
 *
 *  Checked against the ES-only lib (no DOM) DELIBERATELY: the ambient neo
 *  component names `Text` and `Image` (and, ahead, Event/Option/Audio/…) shadow
 *  DOM lib globals, so a global `declare class Text` duplicates lib.dom's. That
 *  reconciliation — module/namespace-scope the neo surface, or a curated global
 *  shim for the browser globals bodies actually use — is a next-slice decision
 *  (the "tsc path replaces the whole global story", HANDOFF/compile.ts). This
 *  slice proves the boundary cleanly without it. `extra` overrides options. */
function typecheck(scaffold, caseSrc, extra = {}) {
  const files = { "scaffold.ts": scaffold, "case.ts": caseSrc };
  const options = {
    strict: true, // strictBindCallApply — the check-block SHAPE depends on it
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts"], // ES only — no DOM globals to collide with Text/Image
    skipLibCheck: true,
    noEmit: true,
    types: [],
    ...extra,
  };
  const readFile = (name) => {
    if (Object.hasOwn(files, name)) return files[name];
    try { return fs.readFileSync(name, "utf8"); } catch { return undefined; }
  };
  const host = {
    getSourceFile: (name, target) => {
      const text = readFile(name);
      return text === undefined ? undefined : ts.createSourceFile(name, text, target, true);
    },
    getDefaultLibFileName: (o) => path.join(LIB_DIR, ts.getDefaultLibFileName(o)),
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    fileExists: (name) => Object.hasOwn(files, name) || fs.existsSync(name),
    readFile,
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    directoryExists: () => true,
    realpath: (n) => n,
  };
  const program = ts.createProgram(["scaffold.ts", "case.ts"], options, host);
  const simplify = (file) => {
    const sf = program.getSourceFile(file);
    return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map((d) => ({
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
    }));
  };
  return { scaffold: simplify("scaffold.ts"), case: simplify("case.ts") };
}

// ── 1. Snapshot: the generated scaffold's key lines ─────────────────────────

await test("scaffold: the fixed value prelude mirrors value.ts", () => {
  const s = scaffoldFor(PROGRAM);
  for (const line of [
    "type Percent = { percent: number };",
    "type Length = number | Percent;",
    "type Color = number | null;",
    "type Shape = string | null;",
    "type Fill = Color | Gradient;",
    "type Theme = Readonly<Record<string, unknown>>;",
    "type Cursor = unknown;",
    "declare function gradient(",
    "declare function stroke(width: number, color: number): Stroke;",
    "declare function shadow(dx: number, dy: number, blur: number, color: number): Shadow;",
  ]) {
    assert.ok(s.includes(line), `prelude should contain: ${line}`);
  }
});

await test("scaffold: enum-typed attributes emit named string-literal unions", () => {
  const s = scaffoldFor(PROGRAM);
  assert.ok(s.includes(`type Stretch = "none" | "width" | "height" | "both";`), "Stretch enum alias");
  assert.ok(s.includes(`type FontWeight = "thin" | "extralight" | "light" | "regular" | "normal" | "medium" | "semibold" | "bold" | "extrabold" | "black";`), "FontWeight enum alias");
  assert.ok(s.includes(`type Axis = "x" | "y";`), "Axis enum alias");
});

await test("scaffold: View declares its attrs (AttrType→TS map) + the §11 pronouns", () => {
  const s = scaffoldFor(PROGRAM);
  const view = classBlock(s, "View");
  // The AttrType → TS decisions, one per kind present on View:
  assert.ok(view.includes("x: Length;"), "length → Length");
  assert.ok(view.includes("cornerRadius: number;"), "number → number");
  assert.ok(view.includes("visible: boolean;"), "boolean → boolean");
  assert.ok(view.includes("fontFamily: string;"), "string → string");
  assert.ok(view.includes("textColor: Color;"), "color → Color");
  assert.ok(view.includes("clip: Shape;"), "shape → Shape");
  assert.ok(view.includes("fontWeight: FontWeight;"), "enum → named union");
  assert.ok(view.includes("fill: Fill;"), "fill → Fill");
  assert.ok(view.includes("stroke: Stroke | null;"), "stroke → Stroke | null");
  assert.ok(view.includes("shadow: Shadow | null;"), "shadow → Shadow | null");
  assert.ok(view.includes("theme: Theme;"), "record → Theme");
  assert.ok(view.includes("styles: string[];"), "styles → string[]");
  assert.ok(view.includes("stylesheet: string | null;"), "stylesheet → string | null");
  assert.ok(view.includes("layout: Layout | null;"), "component → <of> | null");
  assert.ok(view.includes("datapath: Cursor;"), "cursor → Cursor (deferred placeholder)");
  // The pronouns (language §11), on View, inherited by View-derived classes.
  assert.ok(view.includes("parent: View;"), "parent pronoun");
  assert.ok(view.includes("classroot: View;"), "classroot pronoun");
  assert.ok(view.includes("readonly children: View[];"), "children pronoun");
  assert.ok(s.startsWith("type Percent"), "prelude leads the scaffold");
});

await test("scaffold: Text extends View with its own leaf attrs", () => {
  const s = scaffoldFor(PROGRAM);
  const text = classBlock(s, "Text");
  assert.ok(text.startsWith("declare class Text extends View {"), "Text extends View");
  assert.ok(text.includes("text: string;"), "Text.text");
  assert.ok(text.includes("textShadow: Shadow | null;"), "Text.textShadow");
});

await test("scaffold: the abstract Layout base (not in the name table) is still declared", () => {
  const s = scaffoldFor(PROGRAM);
  assert.ok(s.includes("declare class Layout {}"), "Layout declared (empty) so `Layout | null` + SimpleLayout resolve");
  assert.ok(classBlock(s, "SimpleLayout").startsWith("declare class SimpleLayout extends Layout {"), "SimpleLayout extends Layout");
});

await test("scaffold: the WeatherTab user class — attrs typed, base extends, method", () => {
  const s = scaffoldFor(PROGRAM);
  const wt = classBlock(s, "WeatherTab");
  assert.ok(wt.startsWith("declare class WeatherTab extends View {"), "extends View");
  assert.ok(wt.includes("label: string;"), "declared string slot");
  assert.ok(wt.includes("sel: boolean;"), "declared boolean slot");
  assert.ok(wt.includes("openHeight: number;"), "declared number slot");
  assert.ok(wt.includes("select(): void;"), "the method, void-returning");
  // `height` is INHERITED from View (setting it does not redeclare it — that
  // is a checkDecl error), so it is NOT on WeatherTab: the scaffold is more
  // precise than the task's illustrative sketch. It reaches WeatherTab via
  // `extends View`, where height: Length lives.
  assert.ok(!wt.includes("height:"), "height is inherited from View, not redeclared on WeatherTab");
});

// ── 2. tsc: the scaffold is valid, a valid body passes, a bad body is caught ─

await test("scaffold: the generated scaffold itself is well-formed TS (0 diagnostics)", () => {
  const s = scaffoldFor(PROGRAM);
  const { scaffold } = typecheck(s, "");
  assert.deepEqual(scaffold, [], `scaffold should be clean TS, got: ${JSON.stringify(scaffold)}`);
});

await test("scaffold: a VALID resolved body typechecks — 0 semantic diagnostics", () => {
  const s = scaffoldFor(PROGRAM);
  // height (Length) = { sel ? openHeight : 25 }, resolved to this.* — the doc's
  // WeatherTab constraint. sel:boolean is the ternary test; openHeight:number
  // and 25 give a number; number ⊂ Length ⇒ clean.
  const VALID = `declare const tab: WeatherTab;
const _h: Length = (function (this: WeatherTab) { return this.sel ? this.openHeight : 25; }).call(tab);`;
  const { case: diags } = typecheck(s, VALID);
  assert.deepEqual(diags, [], `valid body should be clean, got: ${JSON.stringify(diags)}`);
});

await test("scaffold: a CROSS-BOUNDARY body is caught — boolean→Length + typo'd slot", () => {
  const s = scaffoldFor(PROGRAM);
  // Line 2: sel (boolean) flows into a Length slot — the declarative type
  // catches the imperative misuse (TS2322). Line 3: a typo'd slot (TS2339).
  const INVALID = `declare const tab: WeatherTab;
const _bad1: Length = (function (this: WeatherTab) { return this.sel; }).call(tab);
const _bad2: Length = (function (this: WeatherTab) { return this.openHeightX; }).call(tab);`;
  const { case: diags } = typecheck(s, INVALID);
  assert.equal(diags.length, 2, `expected exactly 2 diagnostics, got: ${JSON.stringify(diags)}`);

  const assign = diags.find((d) => d.code === 2322);
  assert.ok(assign, `a TS2322 (not-assignable) is expected; got ${JSON.stringify(diags)}`);
  assert.equal(assign.line, 2, "boolean→Length is on line 2");
  assert.ok(assign.message.includes("not assignable to type 'Length'"), `2322 message: ${assign.message}`);

  // The typo is TS2339 ("does not exist") or TS2551 (the same, plus a "Did you
  // mean 'openHeight'?" suggestion — tsc's near-match hint, which it emits here
  // because openHeight is one edit away). Either is the missing-property catch.
  const typo = diags.find((d) => d.code === 2339 || d.code === 2551);
  assert.ok(typo, `a missing-property diagnostic (2339/2551) is expected; got ${JSON.stringify(diags)}`);
  assert.equal(typo.line, 3, "the typo'd slot is on line 3");
  assert.ok(typo.message.includes("openHeightX"), `message names the typo: ${typo.message}`);
  assert.ok(typo.message.includes("does not exist"), `message is a missing-property: ${typo.message}`);
  assert.ok(typo.message.includes("WeatherTab"), `message names the class: ${typo.message}`);
});

// A cross-check that strictBindCallApply is genuinely what makes the boundary
// visible: the same boolean→Length body, with strictBindCallApply OFF (so
// `.call` reverts to returning `any`), is NOT caught — proving the catch above
// is real type flow through the check-block SHAPE, not luck.
await test("scaffold: WITHOUT strictBindCallApply the boundary is invisible (control)", () => {
  const s = scaffoldFor(PROGRAM);
  const INVALID = `declare const tab: WeatherTab;
const _bad1: Length = (function (this: WeatherTab) { return this.sel; }).call(tab);`;
  const { case: diags } = typecheck(s, INVALID, { strictBindCallApply: false });
  assert.equal(diags.length, 0, "without strictBindCallApply, .call returns any → the boundary is silently swallowed");
});

// Print the generated scaffold once, for the record / eyeballing.
await test("scaffold: (dump) print the generated scaffold", () => {
  console.log("\n----- generated scaffold -----\n" + scaffoldFor(PROGRAM) + "----- end scaffold -----\n");
});

/** Extract the `declare class <name> { … }` block from the scaffold text —
 *  from its `declare class <name>` head to the matching top-level `}` line. */
function classBlock(scaffold, name) {
  const lines = scaffold.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`declare class ${name} `) || l.startsWith(`declare class ${name}{`) || l === `declare class ${name} {}` || l.startsWith(`declare class ${name} {`));
  assert.ok(start >= 0, `scaffold should declare class ${name}`);
  if (lines[start].endsWith("}")) return lines[start]; // single-line `{}` form
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1).join("\n");
}

summarize("scaffold");
