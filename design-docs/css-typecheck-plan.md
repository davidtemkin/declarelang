# CSS type-checking (`css` blocks) — Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD (red → green → commit). Steps are checkboxes.

**Goal:** A compile-time `css Name { … }` declaration, type-checked with hard errors (unknown property, malformed value, unknown tag, syntax), compiled to a `RuleSet`, used via `cssRules = Name`.

**Spec:** `design-docs/css-typecheck.md`.

## Global Constraints

- Build before test: `npm run build`; tests run against `runtime/dist/*.js` and `compiler/dist/*.js`.
- Checker tests go in `test/unit.test.mjs` (the checker/parser test home) following its convention: `errs(src)[0]` matches a `/regex/`, `errs(src)[i].pos.line`/`.col` assert positions. Pure CSS-parse tests go in `test/css.test.mjs`.
- Source of truth for `CSS_PROPERTIES`: the 12 `css:`-bearing specs in `defineAttributes(View, …)` (`view.ts:577-609`).
- Coercers (`css-coerce.ts`) are pure — importable by `schema.ts`/`check.ts`.
- TDD: failing test → red → minimal impl → green → commit.

---

## M1a — Schema slots + `cssRules` AttrType (make CSS-channel slots checkable)

### Task 1: `styleclass`/`id` usable in `.declare`

**Files:** Modify `runtime/src/schema.ts`; test `test/unit.test.mjs`.

- [ ] **Step 1: Failing test** — add near the other schema tests:
```js
await test("checker: styleclass/id are string attributes on View", () => {
  assert.equal(errs(`App [ View [ styleclass = "card", id = "hero" ] ]`).length, 0);
  assert.match(errs(`App [ View [ styleclass = 5 ] ]`)[0], /styleclass expects a string|string/i);
});
```
- [ ] **Step 2: Run red** — `npm run build && node test/unit.test.mjs` → FAIL (`View has no attribute 'styleclass'`).
- [ ] **Step 3: Implement** — in `schema.ts` `ViewSchema.attrs`, beside `stylesheet: { kind: "stylesheet" }`:
```ts
    styleclass: { kind: "string" },
    id: { kind: "string" },
```
- [ ] **Step 4: Green** — PASS.
- [ ] **Step 5: Commit** — `git add runtime/src/schema.ts runtime/dist/schema.* test/unit.test.mjs && git commit -m "M1a: styleclass/id are checkable string attributes on View"`.

### Task 2: the `cssRules` AttrType kind (+ exhaustiveness)

**Files:** Modify `runtime/src/value.ts`, `runtime/src/data.ts`, `runtime/src/schema.ts`; test `test/unit.test.mjs`.

- [ ] **Step 1: Failing test**:
```js
await test("checker: cssRules slot accepts null; a bare name is not yet resolvable", () => {
  assert.equal(errs(`App [ cssRules = null ]`).length, 0);
  // no css blocks yet → a name is rejected by the coercer (routing lands in M3)
  assert.match(errs(`App [ cssRules = Dark ]`)[0], /css block|css/i);
});
```
- [ ] **Step 2: Run red** — FAIL (`App has no attribute 'cssRules'`).
- [ ] **Step 3: Implement**:
  (a) `value.ts` — add to the `AttrType` union (line 171): `| { kind: "cssRules" }`. Add `"cssRules"` to `UNSTYLABLE`. In `coerce()` (near the `case "stylesheet"` ~318):
```ts
    case "cssRules":
      if (lit.kind === "ident" && lit.name === "null") return ok(null);
      return fail("a css block declared in this program (by name), or null");
```
  (b) `data.ts` — in `coerceData()`'s kind-switch, add `cssRules` to the same group as `stylesheet` (the `return def` / unstyleable group).
  (c) `schema.ts` `ViewSchema.attrs` — add `cssRules: { kind: "cssRules" }`.
- [ ] **Step 4: Green + build clean** (exhaustiveness satisfied) — PASS, no TS error.
- [ ] **Step 5: Full suite** — `npm test` → green.
- [ ] **Step 6: Commit** — `git add runtime/src/{value,data,schema}.ts runtime/dist/{value,data,schema}.* test/unit.test.mjs && git commit -m "M1a: cssRules AttrType kind (+ exhaustiveness) + ViewSchema slot"`.

---

## M1b — Parser: the `css Name { … }` declaration

### Task 3: `Parser` gets `source`; `css` keyword + `parseCssDecl`

**Files:** Modify `runtime/src/parser.ts`; test `test/unit.test.mjs`.

**Interfaces produced:** `interface CssDecl { name: string; text: string; bodyOffset: number }`; `program.csses: CssDecl[]`.

- [ ] **Step 1: Failing test**:
```js
import { parseProgram } from "../runtime/dist/parser.js"; // if not already imported
await test("parser: css Name { … } captures the raw body", () => {
  const p = parseProgram(`css Dark { Card { background-color: #171b28 } .card:hover { background-color: #202636 } }
    App [ ]`);
  assert.equal(p.csses.length, 1);
  assert.equal(p.csses[0].name, "Dark");
  assert.match(p.csses[0].text, /Card \{ background-color: #171b28 \}/);
  assert.match(p.csses[0].text, /\.card:hover/);
});
await test("parser: empty css block is valid; unterminated errors", () => {
  assert.equal(parseProgram(`css E {} App [ ]`).csses[0].text.trim(), "");
  assert.throws(() => parseProgram(`css X { Card { color: red } App [ ]`), /unterminated css block/i);
});
await test("parser: brace inside a comment does not truncate", () => {
  const p = parseProgram(`css C { /* } */ Card { color: red } } App [ ]`);
  assert.match(p.csses[0].text, /Card \{ color: red \}/);
});
```
- [ ] **Step 2: Run red** — FAIL (`csses` undefined / `css` unparsed).
- [ ] **Step 3: Implement** in `parser.ts`:
  (a) Give `Parser` the source: constructor `new Parser(tokens, source)`; `parseProgram`/`parseLibrary` pass `source` (they have it in scope, ~862).
  (b) Add `css` to the top-level dispatch in `parseTopDecls` (beside `atTop("stylesheet")`): `else if (p.atTop("css")) csses.push(p.parseCssDecl());`.
  (c) `parseCssDecl()`: consume `css` + the name ident + expect `{`; from the `{` token's `pos.offset`, run a **CSS-aware brace scan over `source`**: start depth 1 at the char after `{`, walk chars — on `/*` skip to `*/`; on `"`/`'` skip to the matching quote; on `{` depth++, on `}` depth-- (depth 0 → close); EOF before close → `throw new NeoError("unterminated css block", <pos>)`. Capture `text = source.slice(bodyStart, closeIndex)`, `bodyOffset = bodyStart`. Then **resync the token cursor**: advance past tokens until the next token's `pos.offset >= closeIndex + 1`.
  (d) Thread `csses: CssDecl[]` through `parseTopDecls`' return, `Program`, `Library`, both assemblers, and add `csses: []` to the bare `Program` literal at `check.ts:77`.
- [ ] **Step 4: Green** — PASS.
- [ ] **Step 5: Full suite** — `npm test` → green (parser is core).
- [ ] **Step 6: Commit** — `git add runtime/src/parser.ts runtime/src/check.ts runtime/dist/{parser,check}.* test/unit.test.mjs && git commit -m "M1b: parse css Name { … } via a parser-level CSS-aware brace scan"`.

### Task 4: namespace dedupe includes `css`

**Files:** Modify `runtime/src/check.ts`; test `test/unit.test.mjs`.

- [ ] **Step 1: Failing test**:
```js
await test("checker: a css name collides with the one namespace", () => {
  assert.match(errs(`css S { } css S { } App [ ]`)[0], /already a component, stylesheet, style, font, or css/i);
  assert.match(errs(`stylesheet S [ ] css S { } App [ ]`)[0], /already a component, stylesheet, style, font, or css/i);
});
```
- [ ] **Step 2: Run red** — FAIL (no dedupe for css).
- [ ] **Step 3: Implement** — extend the `taken()` helper (`check.ts:226`) with a `csses` set; add a `for (const c of program.csses)` dedupe loop mirroring the stylesheet one (`:236-242`); update the collision message string to `"…component, stylesheet, style, font, or css block named 'X'"` (all four existing sites).
- [ ] **Step 4: Green + full suite** — PASS (existing dedupe tests must accept the new wording — update their regexes if they pin the exact string).
- [ ] **Step 5: Commit** — `git add runtime/src/check.ts runtime/dist/check.* test/unit.test.mjs && git commit -m "M1b: css names join the top-level namespace dedupe"`.

---

## M2 — Positions in `css-parse`

### Task 5: `selPos` per rule, `{namePos,valuePos}` per decl, `CssUnsupported.offset`

**Files:** Modify `runtime/src/css-parse.ts`; test `test/css.test.mjs`.

- [ ] **Step 1: Failing test** (offsets relative to the CSS text):
```js
await test("parseCss carries selector + decl offsets", () => {
  const css = `.a { color: red }`;
  const r = parseCss(css)[0];
  assert.equal(css.slice(r.selPos, r.selPos + 2), ".a");
  const d = r.decls.get("color");        // decls now carry positions — shape per impl
  // assert the value offset points at "red":
  assert.equal(css.slice(r.declPos.get("color").valuePos, r.declPos.get("color").valuePos + 3), "red");
});
await test("CssUnsupported carries a relative offset", () => {
  try { parseCss(`a > b { color: red }`); assert.fail("should throw"); }
  catch (e) { assert.equal(typeof e.offset, "number"); }
});
```
> The exact position shape is an impl choice: keep `decls: Map<prop,value>` for the matcher (unchanged) and add a parallel `declPos: Map<prop,{namePos,valuePos}>` + `selPos: number` on `Rule`, so `buildRuleSet`/matcher are untouched.
- [ ] **Step 2: Run red** — FAIL.
- [ ] **Step 3: Implement** — in `parseCss`, record `selPos` from the selector-group match index; rewrite `parseDecls` to track the running index across `split(";")`/`indexOf(":")`, producing `{namePos, valuePos}` per property (offsets relative to the whole CSS text — add the rule/body base). Add an optional `offset` field to `CssUnsupported` and set it where thrown (selector/decl offset).
- [ ] **Step 4: Green + `npm test`** — the matcher/cascade tests still pass (added fields are ignored).
- [ ] **Step 5: Commit** — `git add runtime/src/css-parse.ts runtime/dist/css-parse.* test/css.test.mjs && git commit -m "M2: css-parse carries selector/decl offsets + CssUnsupported.offset"`.

---

## M3 — The checker

### Task 6: `CSS_PROPERTIES` + parity guard

**Files:** Modify `runtime/src/schema.ts`; test `test/css.test.mjs`.

- [ ] **Step 1: Failing test** (parity against the runtime map):
```js
import { cssMap, View } from "../runtime/dist/index.js"; // or per existing imports
const { CSS_PROPERTIES } = await import("../runtime/dist/schema.js");
await test("CSS_PROPERTIES parity with runtime cssMap(View)", () => {
  const runtime = cssMap(View);
  assert.deepEqual(Object.keys(CSS_PROPERTIES).sort(), Object.keys(runtime).sort());
  for (const k of Object.keys(runtime)) {
    assert.equal(CSS_PROPERTIES[k].attr, runtime[k].attr, `attr for ${k}`);
    assert.equal(CSS_PROPERTIES[k].coerce, runtime[k].coerce, `coerce fn for ${k}`);
  }
});
```
- [ ] **Step 2: Run red** — FAIL (`CSS_PROPERTIES` undefined).
- [ ] **Step 3: Implement** — in `schema.ts`, import the coercers from `css-coerce.js` and export the 12-row table (property → `{attr, coerce, kind}`) from the spec's table.
- [ ] **Step 4: Green** — PASS (parity holds by construction).
- [ ] **Step 5: Commit** — `git add runtime/src/schema.ts runtime/dist/schema.* test/css.test.mjs && git commit -m "M3: CSS_PROPERTIES check-time table + parity guard"`.

### Task 7: `checkCss` — the four error classes

**Files:** Modify `runtime/src/check.ts`; test `test/unit.test.mjs`.

- [ ] **Step 1: Failing test** (one red per class + valids):
```js
await test("checkCss: unknown property, bad value, unknown tag, syntax", () => {
  const uc = errs(`css X { Card { colour: red } } class Card extends View [ ] App [ ]`);
  assert.match(uc[0], /unknown CSS property 'colour'/);
  assert.match(errs(`css X { Card { font-size: banana } } class Card extends View [ ] App [ ]`)[0],
    /'banana' is not a length for 'font-size'/);
  assert.match(errs(`css X { button { color: red } } App [ ]`)[0], /unknown component 'button'/);
  assert.match(errs(`css X { a > b { color: red } } App [ ]`)[0], /unsupported/i);
  // valids pass clean:
  assert.equal(errs(`css X { Card { background-color: #2d7; color: white } .card:hover { opacity: 0.5 } } class Card extends View [ ] App [ ]`).length, 0);
});
await test("checkCss: positions point at the offending token", () => {
  const e = errsFull(`css X {\n  Card { colour: red }\n} class Card extends View [ ] App [ ]`)[0];
  assert.equal(e.pos.line, 2); // 'colour' is on line 2 (per the harness's NeoError pos accessor)
});
```
> Adapt `errs`/position access to the existing convention; the second test asserts `pos.line`/`.col` as unit.test.mjs does.
- [ ] **Step 2: Run red** — FAIL.
- [ ] **Step 3: Implement** — `checkCss(program, schemas, source)`:
  - a `posOf(source, offset)` helper (mirror `compile.ts:376-383`).
  - for each `CssDecl`: `parseCss(text)` in try/catch (`CssUnsupported` → error at `posOf(source, bodyOffset + e.offset)`); per rule: for each decl, look up `CSS_PROPERTIES[prop]` (missing → unknown-property at `namePos`), else `entry.coerce(value) === undefined` → `'value' is not a <kind> for 'prop'` at `valuePos`; for each `tag` condition not in `schemas` → `unknown component 'Tag'` at `selPos`; Tier-2 (resolvable tag, `attrType(schema, entry.attr) === null`) → `'C' has no styleable 'prop'`. Positions add `bodyOffset`.
  - call `checkCss` from `check()` when `source` is provided (`check(input, source?)`); thread `source` from `compile.ts:272`.
- [ ] **Step 4: Green + full suite** — PASS.
- [ ] **Step 5: Commit** — `git add runtime/src/check.ts runtime/dist/check.* test/unit.test.mjs && git commit -m "M3: checkCss — unknown property/value/tag/syntax with positions"`.

### Task 8: `cssRules = Name` routing + Tier-2 positive test

**Files:** Modify `runtime/src/check.ts`; test `test/unit.test.mjs`.

- [ ] **Step 1: Failing test**:
```js
await test("cssRules = Name resolves a css block; a non-css name errors", () => {
  assert.equal(errs(`css Dark { } App [ cssRules = Dark ]`).length, 0);
  assert.match(errs(`stylesheet S [ ] App [ cssRules = S ]`)[0], /no css block named 'S'|not a css block/i);
  assert.match(errs(`App [ cssRules = Nope ]`)[0], /no css block named 'Nope'/i);
});
await test("Tier-2 does not false-fire on .class/#id (positive)", () => {
  assert.equal(errs(`css X { .anything { color: red; opacity: 0.5 } #x { left: 5px } } App [ ]`).length, 0);
});
```
- [ ] **Step 2: Run red** — FAIL (`cssRules = Dark` hits the coercer `fail`).
- [ ] **Step 3: Implement** — add `csses: ReadonlySet<string>` to `StyleEnv` (+ `EMPTY_ENV.csses = new Set()`), populate it beside `env.stylesheets`; add a `t?.kind === "cssRules" && attr.value.kind === "ident" && attr.value.name !== "null"` branch in `checkElement` (mirror `check.ts:752-762`) checking `env.csses`, with the `no css block named 'X'` message; `continue` before `checkAttr`.
- [ ] **Step 4: Green + full suite** — PASS.
- [ ] **Step 5: Commit** — `git add runtime/src/check.ts runtime/dist/check.* test/unit.test.mjs && git commit -m "M3: cssRules = Name resolution against declared css blocks"`.

---

## M4 — Compile + runtime wiring

### Task 9: `buildCsses`/`registerCsses`/`cssByName` + `cssRules = Name` end-to-end

**Files:** Modify `runtime/src/instantiate.ts`, add a registry (in `css-match.ts` or a small module); test `test/unit.test.mjs` (or `test/css.test.mjs`).

- [ ] **Step 1: Failing end-to-end test**:
```js
await test("a checked css block styles a view via cssRules = Name", () => {
  const app = build(`css Dark { .box { background-color: #2d7 } }
    App [ width = 100, height = 100, cssRules = Dark, b: View [ styleclass = "box" ] ]`);
  app.attach(mockBackend([]), null); // or the standard instantiate path
  settle();
  assert.equal(app.b.fill, 0x22dd77);
});
```
> Use `build(...)` (parse+check+instantiate). `app.b` is the scope-noun child.
- [ ] **Step 2: Run red** — FAIL (`cssRules = Dark` not resolved at instantiate).
- [ ] **Step 3: Implement** — mirror the stylesheet path: `registerCsses(root, map)` + `cssByName(root, name)` (mirror `stylesheet.ts:187/191`); `buildCsses(program)` = `new Map(program.csses.map(c => [c.name, buildRuleSet(c.text)]))` (mirror `buildStylesheets`, `instantiate.ts:245`), called + `registerCsses` at `instantiate.ts:167`; in the attribute-set resolution (`instantiate.ts:536-547`), add a `kind === "cssRules"` ident branch → `ctx.csses.get(name)` assigned to the slot.
- [ ] **Step 4: Green + full suite** — PASS.
- [ ] **Step 5: Commit** — `git add runtime/src/instantiate.ts runtime/src/css-match.ts runtime/dist/{instantiate,css-match}.* test/*.mjs && git commit -m "M4: buildCsses/registerCsses + cssRules = Name end-to-end"`.

### Task 10: highlighter + example + milestone review

- [ ] **Step 1:** `compiler/src/highlight.ts` — add `"css"` to the keyword set; a quick highlight test if the suite has one.
- [ ] **Step 2:** Add/convert an example `.declare` using a `css { }` block + `cssRules = Name` (a small styled app), verified by the `verify-examples` harness.
- [ ] **Step 3:** `npm test` — all green.
- [ ] **Step 4:** Request code review (superpowers:requesting-code-review); apply findings.
- [ ] **Step 5:** Merge `feat/css-typecheck` → `feat/css-engine`, push (or open its own PR, per the user's call at finish).

---

## Self-review

**Coverage:** schema slots + cssRules AttrType (T1-2), parser css block (T3) + dedupe (T4), positions (T5), CSS_PROPERTIES+parity (T6), checkCss error classes + positions (T7), cssRules routing + Tier-2 positive (T8), end-to-end instantiate (T9), highlighter+example (T10). Every spec decision has a task; the schema prerequisite is M1a; exhaustiveness cases are in T2; the parser-level scan (not tokenizer) is T3.

**Type/name consistency:** `CssDecl {name,text,bodyOffset}`, `program.csses`, `CSS_PROPERTIES {attr,coerce,kind}`, `{kind:"cssRules"}`, `StyleEnv.csses`, `buildCsses`/`registerCsses`/`cssByName` — consistent across tasks.

**Known risks flagged:** T3's brace-scan resync (token cursor ↔ source cursor); T5's position shape is an impl choice (parallel `declPos` map to keep the matcher untouched); T7/T9's `errs`/`build` helpers + `mockBackend` follow the existing test conventions.
