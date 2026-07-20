# LZX Source Layer — Implementation Plan (Phase 1 MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `lzx/` area — a pure `lzxToDeclare(src)` front-end that transpiles OpenLaszlo LZX to Declare source text — far enough to transpile the *settled-construct* reference programs end-to-end through the existing `compile()`, with a gap registry and a corpus-sweep harness.

**Architecture:** Source-to-source, upstream of the unchanged `compile()`. Pure pipeline: `.lzx` text → `parseLzx` → `LzxDoc` (thin XML-faithful tree) → `mapDoc` → `DProgram` (a purpose-built Declare emission IR) + `Gap[]` → `emitProgram` → valid `.declare` text → `formatSource` (canon style). A `tools/lzx-transpile.mjs` driver wires the result into `compile()`. Spec: `docs/plans/2026-07-20-lzx-source-layer-design.md`.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, ES2022 modules), building to committed `dist/` via `tsc -b` project references; zero runtime deps; tests are `node`-run `.mjs` files using `test/harness.mjs`.

## Global Constraints

- **Emit contract:** target only surfaces the committed `runtime/src/parser.ts` + `runtime/src/check.ts` accept — NOT Appendix A/B prose. Where they conflict, the parser wins and the conflict becomes a gap.
- **`await` every test:** `test/harness.mjs` `test()` is `async`. **Every call MUST be `await test(...)`** — an unawaited call makes `summarize()` run before the bodies finish and mis-report counts (verified in plan review). One `summarize("lzx")` at the file's end.
- **Purity:** `lzx/src/**` is pure — no I/O, no `node:fs`. The only impure file is `tools/lzx-transpile.mjs`.
- **One-way dependency:** `lzx/` may import from `runtime/dist/` (types, `errors.js`, the static `schema.js` tables) and from `tools/format.mjs` (`formatSource`); it may NOT import from `compiler/`.
- **Zero external deps:** no XML library; hand-written tolerant parser.
- **Naming tables are schema-anchored AND asserted:** every attribute-alias *target* must be a real key in `runtime/src/schema.ts` (`backgroundColor` is retired → the slot is `fill`), and a test validates every alias target against the live `schema.js` (Task 3).
- **Type-aware literal emission:** the resolved attribute type determines the emitted literal form — a `Color` slot emits `bgcolor="red"` → `fill = red` (bare ident); a `string` slot emits `"red"`. Schema consultation is a Phase-1 requirement.
- **Content-attribute is per-tag:** text content maps to `label` for `Button`/controls, `text` for `Text` (NOT universal — `Button` has no `text` attr).
- **Corpus root:** `/Users/maxcarlsonold/openlaszlo-5.0` (1,816 unique `.lzx`, excluding `.claude/worktrees/`). Reference ladder: `docs/reference/programs/*.lzx`. Golden app (oracle fixture only): `examples/weather/weather.lzx`.
- **TS style:** `strict`, `noUnusedLocals`, `noUnusedParameters`, explicit return types on exports, `import type` for type-only imports, `.js` import specifiers.
- **Deferred to Phase 2 (spec-scoped, not this plan):** the second-order `originMap`; cross-subtree `id` blocking detection; real `<state>` translation (Phase 1 records a `state-form` gap).
- **Commit cadence:** commit after every green step. Use `git commit --no-verify` if the pre-commit hook fails on the unrelated missing-`typescript`-package environment issue.

---

## File Structure

```
lzx/
  tsconfig.json          # composite, references ../runtime, rootDir src, outDir dist
  src/
    pos.ts               # Pos — shared position type
    parse.ts             # parseLzx(src): LzxDoc — tolerant XML → thin tree
    naming.ts            # buildNaming + tag/attr tables + attrTypeFor (schema consult) + collisions
    ir.ts                # DProgram/DClass/DNode/DAttr/DDecl/DMethod/DValue — emission IR types
    emit.ts              # emitProgram(p): serialize IR → valid Declare → formatSource
    gaps.ts              # Gap, Severity, S13Ref, GapSink
    map.ts               # mapDoc(doc, naming, sink): DProgram — the parser-surface mapping core
    transpile.ts         # lzxToDeclare(src): TranspileResult — the one entry point
  dist/                  # committed build output
tools/
  lzx-transpile.mjs      # CLI/harness driver: read .lzx → lzxToDeclare → compile() → report
test/
  lzx.test.mjs           # unit + golden tests (added to package.json test script)
```

`map.ts` is the largest file and is built rule-by-rule (Tasks 5, 6, 8–12), each an independently testable increment.

---

## Task 0: Area scaffold + build wiring

**Files:** Create `lzx/tsconfig.json`, `lzx/src/pos.ts`, `lzx/src/gaps.ts`, `lzx/src/transpile.ts` (stub); Modify `tsconfig.json`; Create `test/lzx.test.mjs`; Modify `package.json`.

**Interfaces produced:** `Pos { line: number; col: number; offset: number }`; `Gap`/`Severity`/`S13Ref`; `TranspileResult { declare: string | null; gaps: Gap[]; diagnostics: LzxDiagnostic[] }`; `lzxToDeclare(src: string): TranspileResult`.

- [ ] **Step 1: Create `lzx/tsconfig.json`** (mirror `compiler/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"], "strict": true, "esModuleInterop": true,
    "noUnusedLocals": true, "noUnusedParameters": true, "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true, "verbatimModuleSyntax": true,
    "declaration": true, "composite": true, "sourceMap": true,
    "rootDir": "src", "outDir": "dist", "skipLibCheck": true
  },
  "references": [{ "path": "../runtime" }],
  "include": ["src"]
}
```

- [ ] **Step 2: Add `lzx` to root `tsconfig.json` references**

```json
{
  "//": "solution file — `tsc -b` builds runtime, then compiler and lzx",
  "files": [],
  "references": [{ "path": "./runtime" }, { "path": "./compiler" }, { "path": "./lzx" }]
}
```

- [ ] **Step 3: Create `lzx/src/pos.ts`**

```ts
// pos — the byte/line/col position carried by every LZX node and gap.
export interface Pos {
  line: number;
  col: number;
  offset: number;
}
```

- [ ] **Step 4: Create `lzx/src/gaps.ts`**

```ts
import type { Pos } from "./pos.js";

export type Severity = "blocking" | "degraded" | "info";

export type S13Ref =
  | "animation-choreography" | "resources-and-fonts" | "slots-placement"
  | "modules" | "constraint-timing" | "imperative-data-mutation" | "dynamic-body"
  | "datapath-xpath" | "subscription-source" | "attr-change-handler"
  | "state-form" | "typed-method" | "state-when-sugar" | "mixins" | "unknown-tag";

export interface Gap {
  kind: string;
  severity: Severity;
  s13Ref: S13Ref;
  pos: Pos;
  note: string;
}

export interface GapSink { add(g: Gap): void; readonly gaps: Gap[] }
export function makeSink(): GapSink {
  const gaps: Gap[] = [];
  return { gaps, add(g) { gaps.push(g); } };
}
```

- [ ] **Step 5: Create `lzx/src/transpile.ts` (stub)**

```ts
import type { Gap } from "./gaps.js";

export interface LzxDiagnostic {
  message: string;
  pos: { line: number; col: number; offset: number };
  severity: "error" | "warning";
}

export interface TranspileResult {
  declare: string | null;
  gaps: Gap[];
  diagnostics: LzxDiagnostic[];
}

export function lzxToDeclare(_src: string): TranspileResult {
  return { declare: null, gaps: [], diagnostics: [] };
}
```

- [ ] **Step 6: Create `test/lzx.test.mjs`**

```js
import { lzxToDeclare } from "../lzx/dist/transpile.js";
import { test, summarize } from "./harness.mjs";

await test("lzxToDeclare exists and returns the result shape", () => {
  const r = lzxToDeclare("<canvas/>");
  if (typeof r !== "object" || !("declare" in r) || !Array.isArray(r.gaps)) {
    throw new Error("unexpected result shape: " + JSON.stringify(r));
  }
});

summarize("lzx");
```

- [ ] **Step 7: Wire into `package.json`** — append ` && node test/lzx.test.mjs` to the `test` script.

- [ ] **Step 8: Build and run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: `  ok — lzxToDeclare exists…` then `lzx: 1 passed, 0 failed`.

- [ ] **Step 9: Commit**

```bash
git add lzx/ tsconfig.json package.json test/lzx.test.mjs
git commit -m "lzx: area scaffold — tsconfig, pos, gaps, transpile stub, smoke test"
```

---

## Task 1: LZX parser — structural core (`parseLzx`)

**Files:** Create `lzx/src/parse.ts`; append to `test/lzx.test.mjs`.

**Interfaces produced:**
```ts
export interface LzxAttr { name: string; value: string; pos: Pos }
export interface LzxNode { tag: string; attrs: LzxAttr[]; children: LzxNode[]; text: string; pos: Pos }
export interface LzxError { message: string; pos: Pos }
export interface LzxDoc { root: LzxNode | null; errors: LzxError[] }
export function parseLzx(src: string): LzxDoc
```
`tag` preserves original case + `ns:` prefix. `value`/`text` entity-decoded in Task 2 (Task 1: raw).

- [ ] **Step 1: Write failing tests** (append before `summarize`)

```js
import { parseLzx } from "../lzx/dist/parse.js";

await test("parses a single self-closing tag", () => {
  const doc = parseLzx("<canvas/>");
  if (doc.errors.length) throw new Error("errors: " + JSON.stringify(doc.errors));
  if (doc.root?.tag !== "canvas") throw new Error("tag: " + doc.root?.tag);
});

await test("parses attributes with double and single quotes", () => {
  const doc = parseLzx(`<canvas width="240" title='hi'/>`);
  const a = doc.root.attrs;
  if (a[0].name !== "width" || a[0].value !== "240") throw new Error("attr0: " + JSON.stringify(a[0]));
  if (a[1].name !== "title" || a[1].value !== "hi") throw new Error("attr1: " + JSON.stringify(a[1]));
});

await test("parses nested children and preserves order", () => {
  const doc = parseLzx(`<canvas><view/><text/></canvas>`);
  if (doc.root.children.map((c) => c.tag).join(",") !== "view,text") throw new Error("kids");
});

await test("captures direct text content", () => {
  const doc = parseLzx(`<button>Move me</button>`);
  if (doc.root.text.trim() !== "Move me") throw new Error("text: " + JSON.stringify(doc.root.text));
});

await test("preserves tag case and namespace prefix", () => {
  const doc = parseLzx(`<xsd:element name="x"/>`);
  if (doc.root.tag !== "xsd:element") throw new Error("tag: " + doc.root.tag);
});

await test("records a 1-based line/col Pos on the root", () => {
  const doc = parseLzx(`\n  <canvas/>`);
  if (doc.root.pos.line !== 2 || doc.root.pos.col !== 3) throw new Error("pos: " + JSON.stringify(doc.root.pos));
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build` — Expected: FAIL `Cannot find module './parse.js'`.

- [ ] **Step 3: Implement `lzx/src/parse.ts`**

```ts
// parse — a tolerant, dependency-free XML reader producing the thin,
// XML-faithful LzxDoc. It records what the markup SAYS; every semantic decision
// lives in map.ts. Tag case + namespace prefixes preserved verbatim. This task
// is structure; CDATA/entities (Task 2) extend parseContent/attr values.
import type { Pos } from "./pos.js";

export interface LzxAttr { name: string; value: string; pos: Pos }
export interface LzxNode { tag: string; attrs: LzxAttr[]; children: LzxNode[]; text: string; pos: Pos }
export interface LzxError { message: string; pos: Pos }
export interface LzxDoc { root: LzxNode | null; errors: LzxError[] }

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-]/;

class Reader {
  i = 0; line = 1; col = 1;
  readonly errors: LzxError[] = [];
  constructor(readonly s: string) {}
  pos(): Pos { return { line: this.line, col: this.col, offset: this.i }; }
  eof(): boolean { return this.i >= this.s.length; }
  peek(): string { return this.s[this.i] ?? ""; }
  startsWith(t: string): boolean { return this.s.startsWith(t, this.i); }
  adv(n = 1): void {
    for (let k = 0; k < n && this.i < this.s.length; k++) {
      if (this.s[this.i] === "\n") { this.line++; this.col = 1; } else { this.col++; }
      this.i++;
    }
  }
  skipWs(): void { while (!this.eof() && /\s/.test(this.peek())) this.adv(); }
  name(): string {
    let out = "";
    if (!this.eof() && NAME_START.test(this.peek())) {
      out += this.peek(); this.adv();
      while (!this.eof() && NAME_CHAR.test(this.peek())) { out += this.peek(); this.adv(); }
    }
    return out;
  }
}

export function parseLzx(src: string): LzxDoc {
  const r = new Reader(src);
  skipProlog(r);
  const root = parseElement(r);
  return { root, errors: r.errors };
}

function skipProlog(r: Reader): void {
  for (;;) {
    r.skipWs();
    if (r.startsWith("<!--")) { r.adv(4); skipUntil(r, "-->"); continue; }
    if (r.startsWith("<?")) { skipUntil(r, "?>"); continue; }
    if (r.startsWith("<!")) { skipUntil(r, ">"); continue; }
    return;
  }
}

function skipUntil(r: Reader, term: string): void {
  while (!r.eof() && !r.startsWith(term)) r.adv();
  if (r.startsWith(term)) r.adv(term.length);
}

function parseElement(r: Reader): LzxNode | null {
  if (r.peek() !== "<") return null;
  const pos = r.pos();
  r.adv();
  const tag = r.name();
  if (tag === "") { r.errors.push({ message: "expected tag name after '<'", pos }); return null; }
  const attrs = parseAttrs(r);
  r.skipWs();
  if (r.startsWith("/>")) { r.adv(2); return { tag, attrs, children: [], text: "", pos }; }
  if (r.peek() === ">") {
    r.adv();
    const { children, text } = parseContent(r, tag);
    return { tag, attrs, children, text, pos };
  }
  r.errors.push({ message: `malformed tag <${tag}>`, pos: r.pos() });
  return { tag, attrs, children: [], text: "", pos };
}

function parseAttrs(r: Reader): LzxAttr[] {
  const attrs: LzxAttr[] = [];
  for (;;) {
    r.skipWs();
    const c = r.peek();
    if (c === "" || c === ">" || c === "/") break;
    const pos = r.pos();
    const name = r.name();
    if (name === "") { r.adv(); continue; }
    r.skipWs();
    let value = "";
    if (r.peek() === "=") {
      r.adv(); r.skipWs();
      const q = r.peek();
      if (q === '"' || q === "'") {
        r.adv();
        while (!r.eof() && r.peek() !== q) { value += r.peek(); r.adv(); }
        r.adv();
      } else {
        while (!r.eof() && !/[\s>/]/.test(r.peek())) { value += r.peek(); r.adv(); }
      }
    }
    attrs.push({ name, value, pos });
  }
  return attrs;
}

function parseContent(r: Reader, tag: string): { children: LzxNode[]; text: string } {
  const children: LzxNode[] = [];
  let text = "";
  for (;;) {
    if (r.eof()) { r.errors.push({ message: `unclosed <${tag}>`, pos: r.pos() }); break; }
    if (r.startsWith("</")) {
      r.adv(2); r.name(); r.skipWs();
      if (r.peek() === ">") r.adv();
      break;
    }
    if (r.startsWith("<!--")) { r.adv(4); skipUntil(r, "-->"); continue; }
    if (r.startsWith("<?")) { skipUntil(r, "?>"); continue; }
    if (r.peek() === "<") {
      const child = parseElement(r);
      if (child) children.push(child); else r.adv();
      continue;
    }
    text += r.peek();
    r.adv();
  }
  return { children, text };
}
```

- [ ] **Step 4: Build and run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lzx/src/parse.ts test/lzx.test.mjs
git commit -m "lzx: tolerant XML parser — structural core"
```

---

## Task 2: Parser — CDATA opacity + entity decoding

**Files:** Modify `lzx/src/parse.ts`; append tests.

- [ ] **Step 1: Write failing tests**

```js
await test("decodes the five XML entities in text", () => {
  const doc = parseLzx(`<x>a &lt; b &amp;&amp; c &gt; d &quot;e&quot; &apos;f&apos;</x>`);
  if (doc.root.text.trim() !== `a < b && c > d "e" 'f'`) throw new Error("text: " + JSON.stringify(doc.root.text));
});
await test("decodes entities in attribute values", () => {
  const doc = parseLzx(`<x cond="a &lt; b"/>`);
  if (doc.root.attrs[0].value !== "a < b") throw new Error("val: " + doc.root.attrs[0].value);
});
await test("treats CDATA as opaque raw text", () => {
  const doc = parseLzx(`<method><![CDATA[ if (a < b && c > d) x(); ]]></method>`);
  if (doc.root.text.trim() !== "if (a < b && c > d) x();") throw new Error("cdata: " + JSON.stringify(doc.root.text));
});
await test("skips comments inside content", () => {
  const doc = parseLzx(`<x><!-- note --><view/></x>`);
  if (doc.root.children.length !== 1 || doc.root.children[0].tag !== "view") throw new Error("kids");
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build && node test/lzx.test.mjs` — Expected: the 4 new cases FAIL.

- [ ] **Step 3: Implement** — add near the top of `parse.ts`:

```ts
const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(?:lt|gt|amp|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}
```
In `parseAttrs`, decode both quoted and unquoted values before push:
```ts
    attrs.push({ name, value: decodeEntities(value), pos });
```
In `parseContent`, replace the text/child tail with (CDATA branch BEFORE the `<`-element branch; note the DOCTYPE guard uses `else if`):
```ts
    if (r.startsWith("<![CDATA[")) {
      r.adv(9);
      let raw = "";
      while (!r.eof() && !r.startsWith("]]>")) { raw += r.peek(); r.adv(); }
      if (r.startsWith("]]>")) r.adv(3);
      text += raw; // opaque — no entity decoding
      continue;
    }
    if (r.startsWith("<!--")) { r.adv(4); skipUntil(r, "-->"); continue; }
    else if (r.startsWith("<!")) { skipUntil(r, ">"); continue; }
    if (r.startsWith("<?")) { skipUntil(r, "?>"); continue; }
    if (r.peek() === "<") {
      const child = parseElement(r);
      if (child) children.push(child); else r.adv();
      continue;
    }
    let chunk = "";
    while (!r.eof() && r.peek() !== "<") { chunk += r.peek(); r.adv(); }
    text += decodeEntities(chunk);
```

- [ ] **Step 4: Build and run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lzx/src/parse.ts test/lzx.test.mjs
git commit -m "lzx: parser handles CDATA (opaque) + XML entity decoding"
```

---

## Task 3: Naming — schema-anchored tables (+ asserted) + type lookup + collisions

**Files:** Create `lzx/src/naming.ts`; append tests.

**Interfaces produced:**
```ts
export interface Collision { canonical: string; lzxNames: string[] }
export type AttrTypeKind = "color" | "length" | "number" | "boolean" | "string" | "unknown";
export interface Naming {
  tagFor(lzxTag: string): string | null;
  isBuiltinTag(lzxTag: string): boolean;
  attrFor(lzxAttr: string): string;
  attrTypeFor(declareTag: string, declareAttr: string): AttrTypeKind; // consults runtime schema.js
  contentAttrFor(declareTag: string): string | null;                  // Button→label, Text→text
  classNameFor(lzxName: string): string;
}
export function buildNaming(userClassNames: string[]): { naming: Naming; collisions: Collision[] }
```

- [ ] **Step 1: Write failing tests**

```js
import { buildNaming } from "../lzx/dist/naming.js";
import { SCHEMAS as _schemas } from "../runtime/dist/schema.js"; // used to assert anchoring (export is SCHEMAS, verified)

await test("maps built-in tags case-insensitively", () => {
  const { naming } = buildNaming([]);
  if (naming.tagFor("canvas") !== "App") throw new Error("canvas");
  if (naming.tagFor("VIEW") !== "View") throw new Error("VIEW");
  if (naming.tagFor("simplelayout") !== "SimpleLayout") throw new Error("simplelayout");
  if (naming.tagFor("nosuchtag") !== null) throw new Error("unknown");
});
await test("attribute aliases are schema-anchored (bgcolor→fill)", () => {
  const { naming } = buildNaming([]);
  if (naming.attrFor("bgcolor") !== "fill") throw new Error("bgcolor");
  if (naming.attrFor("minheight") !== "minHeight") throw new Error("minheight");
  if (naming.attrFor("onclick") !== "onClick") throw new Error("onclick");
});
await test("every alias target is a real schema attribute key (anchoring invariant)", () => {
  // Flatten every attribute name across the built-in schema chain.
  const keys = new Set();
  for (const s of Object.values(_schemas)) {
    for (let sc = s; sc; sc = sc.base) for (const k of Object.keys(sc.attrs)) keys.add(k);
  }
  // ATTR_TABLE targets that are real Declare attributes (handler names like
  // onClick are members, not schema attrs, so exclude the on* forms).
  const { naming } = buildNaming([]);
  for (const lzx of ["bgcolor", "minheight", "minwidth", "fontsize", "fontweight", "fontfamily", "cornerradius"]) {
    const target = naming.attrFor(lzx);
    if (!keys.has(target)) throw new Error(`alias ${lzx}→${target} not a schema key`);
  }
});
await test("attrTypeFor resolves a Color slot", () => {
  const { naming } = buildNaming([]);
  if (naming.attrTypeFor("View", "fill") !== "color") throw new Error("fill type: " + naming.attrTypeFor("View", "fill"));
  if (naming.attrTypeFor("View", "width") !== "length") throw new Error("width type");
});
await test("contentAttrFor is per-tag", () => {
  const { naming } = buildNaming([]);
  if (naming.contentAttrFor("Button") !== "label") throw new Error("Button content");
  if (naming.contentAttrFor("Text") !== "text") throw new Error("Text content");
});
await test("user class names use case-insensitive identity, preserving declared form", () => {
  const { naming } = buildNaming(["weatherSummary"]);
  if (naming.classNameFor("weathersummary") !== "weatherSummary") throw new Error("ci identity");
});
await test("reports a collision when two names map to one identifier", () => {
  const { collisions } = buildNaming(["BorderedBox", "borderedbox"]);
  if (collisions.length !== 1 || collisions[0].lzxNames.length !== 2) throw new Error("collision");
});
```

Note: before writing the impl, confirm the export name for schemas — Run: `node -e "import('./runtime/dist/schema.js').then(m => console.log(Object.keys(m)))"`. If the table is exported under a different name (e.g. `SCHEMAS` or a `schemaFor` fn), adjust the import in both the test and `naming.ts` accordingly.

- [ ] **Step 2: Run to verify fail** — Run: `npm run build` — Expected: FAIL `Cannot find module './naming.js'` (and possibly a schema-export-name mismatch to fix per the note).

- [ ] **Step 3: Implement `lzx/src/naming.ts`**

```ts
// naming — LZX identifiers → Declare identifiers, schema-anchored. LZX resolves
// tags/classes case-insensitively, so user names fold to their declared form and
// collisions are reported. Attribute-alias targets and type lookups are anchored
// against the runtime's static schema tables (the retired backgroundColor is not
// a target — the box-fill slot is `fill`).
import { SCHEMAS } from "../../runtime/dist/schema.js"; // real export is SCHEMAS (uppercase), verified
import type { ComponentSchema } from "../../runtime/dist/schema.js";

const TAG_TABLE: Record<string, string> = {
  canvas: "App", view: "View", text: "Text", button: "Button",
  simplelayout: "SimpleLayout", dataset: "Dataset",
};

const ATTR_TABLE: Record<string, string> = {
  bgcolor: "fill", fgcolor: "textColor", minheight: "minHeight", minwidth: "minWidth",
  onclick: "onClick", onmouseup: "onMouseUp", oninit: "onInit",
  fontsize: "fontSize", fontweight: "fontWeight", fontfamily: "fontFamily",
  cornerradius: "cornerRadius",
};

const CONTENT_ATTR: Record<string, string> = { Button: "label", Text: "text" };

export interface Collision { canonical: string; lzxNames: string[] }
export type AttrTypeKind = "color" | "length" | "number" | "boolean" | "string" | "unknown";

export interface Naming {
  tagFor(lzxTag: string): string | null;
  isBuiltinTag(lzxTag: string): boolean;
  attrFor(lzxAttr: string): string;
  attrTypeFor(declareTag: string, declareAttr: string): AttrTypeKind;
  contentAttrFor(declareTag: string): string | null;
  classNameFor(lzxName: string): string;
}

/** The built-in schema's attribute-type kind for tag+attr, walking the base
 *  chain; "unknown" when the tag or attr is not a built-in. Maps the schema's
 *  AttrType.kind (value.ts) onto our coarse literal-form kinds. */
function schemaKind(declareTag: string, declareAttr: string): AttrTypeKind {
  const start: ComponentSchema | undefined = SCHEMAS[declareTag];
  for (let sc: ComponentSchema | null | undefined = start; sc; sc = sc.base) {
    const t = sc.attrs[declareAttr];
    if (t) {
      switch (t.kind) {
        // Bare-ident slots: Color (fill/color) and enum tokens (fontWeight,
        // textAlign, stretches, axis) must emit BARE — a quoted "bold" fails
        // enum coercion (verified in plan review).
        case "fill": case "color": case "enum": return "color";
        case "length": return "length";
        case "number": return "number";
        case "boolean": return "boolean";
        default: return "string";
      }
    }
  }
  return "unknown";
}

export function buildNaming(userClassNames: string[]): { naming: Naming; collisions: Collision[] } {
  const canonical = new Map<string, string>();
  const collide = new Map<string, Set<string>>();
  for (const name of userClassNames) {
    const key = name.toLowerCase();
    if (!canonical.has(key)) canonical.set(key, name);
    const set = collide.get(key) ?? new Set<string>();
    set.add(name);
    collide.set(key, set);
  }
  const collisions: Collision[] = [];
  for (const [key, set] of collide) {
    if (set.size > 1) collisions.push({ canonical: canonical.get(key)!, lzxNames: [...set] });
  }
  const naming: Naming = {
    tagFor(lzxTag) { return TAG_TABLE[lzxTag.toLowerCase()] ?? null; },
    isBuiltinTag(lzxTag) { return lzxTag.toLowerCase() in TAG_TABLE; },
    attrFor(lzxAttr) { return ATTR_TABLE[lzxAttr.toLowerCase()] ?? lzxAttr; },
    attrTypeFor(declareTag, declareAttr) { return schemaKind(declareTag, declareAttr); },
    contentAttrFor(declareTag) { return CONTENT_ATTR[declareTag] ?? null; },
    classNameFor(lzxName) { return canonical.get(lzxName.toLowerCase()) ?? lzxName; },
  };
  return { naming, collisions };
}
```
(If Step-1's `node -e` probe shows `schemas` is not a named export, use the actual accessor — e.g. `import { schemaFor } from …` and call it per tag — and adjust `schemaKind` + the AttrType `kind` strings to the real ones printed by the probe.)

- [ ] **Step 4: Build and run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lzx/src/naming.ts test/lzx.test.mjs
git commit -m "lzx: naming — schema-anchored tables (asserted), attrTypeFor, content-attr, collisions"
```

---

## Task 4: Emission IR + serializer (`ir.ts`, `emit.ts`)

**Files:** Create `lzx/src/ir.ts`, `lzx/src/emit.ts`; append tests.

**Interfaces produced:** (`ir.ts`)
```ts
export type DValue =
  | { kind: "literal"; text: string }
  | { kind: "code"; src: string }
  | { kind: "path"; path: string; many: boolean };
export interface DAttr { name: string; value: DValue; bind?: "two" }
export interface DDecl { name: string; type: string; def: DValue | null }
export interface DMethod { name: string; params: string[]; body: string; source?: string }
export interface DNode { tag: string; name: string | null; attrs: DAttr[]; decls: DDecl[]; methods: DMethod[]; children: DNode[] }
export interface DClass { name: string; base: string; body: DNode }
export interface DProgram { classes: DClass[]; root: DNode }
```
(`emit.ts`) `export function emitProgram(p: DProgram): string`.

- [ ] **Step 1: Write failing tests**

```js
import { emitProgram } from "../lzx/dist/emit.js";

await test("emits a minimal App with a literal attribute", () => {
  const out = emitProgram({ classes: [], root: {
    tag: "App", name: null, attrs: [{ name: "width", value: { kind: "literal", text: "240" } }],
    decls: [], methods: [], children: [] } });
  if (!/App \[/.test(out) || !/width = 240/.test(out)) throw new Error("out: " + out);
});
await test("emits a constraint, named child, method, and class base-first", () => {
  const out = emitProgram({
    classes: [{ name: "Foo", base: "View", body: {
      tag: "Foo", name: null, attrs: [{ name: "x", value: { kind: "code", src: "parent.width / 2" } }],
      decls: [], methods: [{ name: "onClick", params: [], body: "count = count + 1" }], children: [] } }],
    root: { tag: "App", name: null, attrs: [], decls: [], methods: [],
      children: [{ tag: "Foo", name: "foo", attrs: [], decls: [], methods: [], children: [] }] } });
  if (!/class Foo extends View \[/.test(out)) throw new Error("class");
  if (!/x = \{ parent\.width \/ 2 \}/.test(out)) throw new Error("constraint: " + out);
  if (!/onClick\(\) \{ count = count \+ 1 \}/.test(out)) throw new Error("method: " + out);
  if (!/foo: Foo/.test(out)) throw new Error("named child");
  if (out.indexOf("class Foo") > out.indexOf("App [")) throw new Error("ordering");
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build` — Expected: FAIL `Cannot find module './emit.js'`.

- [ ] **Step 3: Implement `lzx/src/ir.ts`** — the type block above, verbatim.

- [ ] **Step 4: Implement `lzx/src/emit.ts`**

```ts
// emit — serialize the Declare emission IR to VALID Declare text, then hand to
// the canon formatter for house style. The serializer guarantees bracket/brace
// balance (formatSource throws on structurally invalid input). Classes emit
// base-first so check.ts's base-above-subclass rule holds in the one file.
// @ts-expect-error — tools/format.mjs is plain ESM, no .d.ts.
import { formatSource } from "../../tools/format.mjs";
import type { DProgram, DClass, DNode, DValue, DAttr } from "./ir.js";

function value(v: DValue): string {
  switch (v.kind) {
    case "literal": return v.text;
    case "code": return `{ ${v.src} }`;
    case "path": return `:${v.path}${v.many ? "[]" : ""}`;
  }
}
function attr(a: DAttr): string {
  return `${a.name} ${a.bind === "two" ? "<->" : "="} ${value(a.value)}`;
}
function node(n: DNode, header: string): string {
  const lines: string[] = [];
  for (const a of n.attrs) lines.push(attr(a) + ",");
  for (const d of n.decls) lines.push(`${d.name}: ${d.type}${d.def ? " = " + value(d.def) : ""},`);
  for (const m of n.methods) {
    lines.push(`${m.name}(${m.params.join(", ")})${m.source ? ` <- ${m.source}` : ""} { ${m.body} },`);
  }
  for (const c of n.children) lines.push(node(c, c.name ? `${c.name}: ${c.tag}` : c.tag) + ",");
  const body = lines.map((l) => "    " + l).join("\n");
  return `${header} [\n${body}\n]`;
}
export function emitProgram(p: DProgram): string {
  const ordered = topoSort(p.classes);
  const parts: string[] = [];
  for (const cls of ordered) parts.push(node(cls.body, `class ${cls.name} extends ${cls.base}`));
  parts.push(node(p.root, p.root.tag));
  return formatSource(parts.join("\n\n") + "\n");
}
function topoSort(classes: DClass[]): DClass[] {
  const byName = new Map(classes.map((c) => [c.name, c]));
  const out: DClass[] = [];
  const done = new Set<string>(), visiting = new Set<string>();
  const visit = (c: DClass): void => {
    if (done.has(c.name) || visiting.has(c.name)) return;
    visiting.add(c.name);
    const base = byName.get(c.base);
    if (base) visit(base);
    visiting.delete(c.name);
    done.add(c.name);
    out.push(c);
  };
  for (const c of classes) visit(c);
  return out;
}
```

- [ ] **Step 5: Build and run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: all PASS. (A `formatSource` throw = the serializer emitted invalid structure — fix the serializer, don't catch.)

- [ ] **Step 6: Commit**

```bash
git add lzx/src/ir.ts lzx/src/emit.ts test/lzx.test.mjs
git commit -m "lzx: emission IR + serializer — valid Declare, base-first classes, canon-formatted"
```

---

## Task 5: `mapDoc` core — canvas→App, type-aware values, constraint prefixes, unknown-tag/mixin gaps

**Files:** Create `lzx/src/map.ts`; append tests.

**Interfaces produced:** `export function mapDoc(doc: LzxDoc, naming: Naming, sink: GapSink): DProgram | null` (null when no root).

- [ ] **Step 1: Write failing tests**

```js
import { parseLzx as _p } from "../lzx/dist/parse.js";
import { buildNaming as _bn } from "../lzx/dist/naming.js";
import { mapDoc } from "../lzx/dist/map.js";
import { makeSink } from "../lzx/dist/gaps.js";
import { emitProgram as _emit } from "../lzx/dist/emit.js";

await test("maps <canvas> to App and round-trips through emit", () => {
  const prog = mapDoc(_p(`<canvas width="240"/>`), _bn([]).naming, makeSink());
  const out = _emit(prog);
  if (!/App \[/.test(out) || !/width = 240/.test(out)) throw new Error("out: " + out);
});
await test("emits a Color slot as a bare ident, not a string", () => {
  const prog = mapDoc(_p(`<canvas><view bgcolor="red"/></canvas>`), _bn([]).naming, makeSink());
  const out = _emit(prog);
  if (!/fill = red/.test(out)) throw new Error("expected bare fill = red; got: " + out);
});
await test("maps ${expr} to a code constraint", () => {
  const prog = mapDoc(_p(`<canvas width="\${1 + 2}"/>`), _bn([]).naming, makeSink());
  if (!/width = \{ 1 \+ 2 \}/.test(_emit(prog))) throw new Error("constraint");
});
await test("records a constraint-timing gap for $once{}", () => {
  const sink = makeSink();
  mapDoc(_p(`<canvas width="\$once{1}"/>`), _bn([]).naming, sink);
  if (!sink.gaps.some((g) => g.s13Ref === "constraint-timing")) throw new Error("no gap");
});
await test("records an unknown-tag gap for an unmapped child", () => {
  const sink = makeSink();
  mapDoc(_p(`<canvas><frobnicate/></canvas>`), _bn([]).naming, sink);
  if (!sink.gaps.some((g) => g.s13Ref === "unknown-tag")) throw new Error("no unknown-tag gap");
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build` — Expected: FAIL `Cannot find module './map.js'`.

- [ ] **Step 3: Implement `lzx/src/map.ts`**

```ts
// map — the parser-surface mapping core: LzxDoc → the Declare emission IR,
// recording a Gap for every construct the implemented parser/checker cannot
// express. This core handles canvas→App, type-aware attribute values, the
// constraint-timing prefixes, and unknown-tag / mixin gaps. Elements, classes,
// methods, datapaths, states arrive in later tasks.
import type { LzxDoc, LzxNode } from "./parse.js";
import type { Naming, AttrTypeKind } from "./naming.js";
import type { GapSink } from "./gaps.js";
import type { DProgram, DNode, DAttr, DValue } from "./ir.js";

export function mapDoc(doc: LzxDoc, naming: Naming, sink: GapSink): DProgram | null {
  if (!doc.root) return null;
  const root = mapElement(doc.root, naming, sink);
  if (!root) return null;
  return { classes: [], root };
}

function mapElement(el: LzxNode, naming: Naming, sink: GapSink): DNode | null {
  if (el.tag.toLowerCase() === "mixin" || el.attrs.some((a) => a.name.toLowerCase() === "with")) {
    sink.add({ kind: `mixin/with on <${el.tag}>`, severity: "blocking", s13Ref: "mixins", pos: el.pos, note: "no Declare multiple-inheritance surface" });
    return null;
  }
  const tag = naming.tagFor(el.tag);
  if (tag === null) {
    sink.add({ kind: `unknown tag <${el.tag}>`, severity: "blocking", s13Ref: "unknown-tag", pos: el.pos, note: `no built-in mapping or user class for <${el.tag}>` });
    return null;
  }
  const attrs: DAttr[] = [];
  for (const a of el.attrs) {
    const name = naming.attrFor(a.name);
    const kind = naming.attrTypeFor(tag, name);
    attrs.push({ name, value: mapValue(a.value, kind, a.pos, sink) });
  }
  const children: DNode[] = [];
  for (const c of el.children) {
    const mapped = mapElement(c, naming, sink);
    if (mapped) children.push(mapped);
  }
  return { tag, name: null, attrs, decls: [], methods: [], children };
}

/** A raw LZX attribute string → a Declare value, typed by the target slot's
 *  kind (which decides literal form: a Color slot keeps `red`/`#hex` BARE; a
 *  string slot quotes). `${}` → a live constraint. `$once{}`/`$always{}`/
 *  `$immediately` → constraint-timing gap, emitted as a plain constraint.
 *  Known limitation: a value MIXING literal + interpolation (`${a} + ${b}`,
 *  `hi ${n}`) is not handled here (the anchored regex assumes the whole value is
 *  one `${…}`); a mixed-content rule + `dynamic-body` gap is a follow-up. */
function mapValue(raw: string, kind: AttrTypeKind, pos: LzxNode["pos"], sink: GapSink): DValue {
  const live = raw.match(/^\$\{([\s\S]*)\}$/);
  if (live) return { kind: "code", src: live[1].trim() };
  const timed = raw.match(/^\$(once|always|immediately)\{?([\s\S]*?)\}?$/);
  if (timed) {
    sink.add({ kind: `$${timed[1]} constraint`, severity: "degraded", s13Ref: "constraint-timing", pos, note: "LZX constraint-timing prefix has no settled Declare surface" });
    return { kind: "code", src: timed[2].trim() || "undefined" };
  }
  return literal(raw, kind);
}

/** A bare literal in the form the target slot admits. */
function literal(raw: string, kind: AttrTypeKind): DValue {
  switch (kind) {
    case "color":
      // named color (red) or hex (#RGB) → BARE; else quote (unexpected).
      if (/^#[0-9A-Fa-f]{3,8}$/.test(raw) || /^[A-Za-z]+$/.test(raw)) return { kind: "literal", text: raw };
      return { kind: "literal", text: JSON.stringify(raw) };
    case "length": case "number":
      return { kind: "literal", text: /^-?\d/.test(raw) ? raw : JSON.stringify(raw) };
    case "boolean":
      return { kind: "literal", text: raw === "true" || raw === "false" ? raw : JSON.stringify(raw) };
    case "string":
      return { kind: "literal", text: JSON.stringify(raw) };
    case "unknown":
      // no schema type — shape heuristic.
      if (/^-?\d+(\.\d+)?%?$/.test(raw) || /^#[0-9A-Fa-f]{3,8}$/.test(raw) || raw === "true" || raw === "false" || raw === "null") {
        return { kind: "literal", text: raw };
      }
      return { kind: "literal", text: JSON.stringify(raw) };
  }
}
```

- [ ] **Step 4: Build and run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lzx/src/map.ts test/lzx.test.mjs
git commit -m "lzx: map core — canvas→App, type-aware literals, constraint-timing/mixin/unknown gaps"
```

---

## Task 6: End-to-end `lzxToDeclare` — handlers, per-tag content, first fixtures

**Files:** Modify `lzx/src/transpile.ts`, `lzx/src/map.ts`; append tests.

- [ ] **Step 1: Write failing tests**

```js
await test("transpiles a button: inline handler + content→label", () => {
  const r = lzxToDeclare(`<canvas height="30"><button onclick="animate('x', 100, 1000, true)">Move me</button></canvas>`);
  if (r.declare === null) throw new Error("null; gaps=" + JSON.stringify(r.gaps));
  if (!/Button \[/.test(r.declare)) throw new Error("no Button");
  if (!/onClick\(\) \{ animate\('x', 100, 1000, true\) \}/.test(r.declare)) throw new Error("handler: " + r.declare);
  if (!/label = "Move me"/.test(r.declare)) throw new Error("label: " + r.declare);
});
await test("maps <text>Hello</text> content to text", () => {
  const r = lzxToDeclare(`<canvas><text>Hello world!</text></canvas>`);
  if (!/text = "Hello world!"/.test(r.declare)) throw new Error("text: " + r.declare);
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build && node test/lzx.test.mjs` — Expected: FAIL (handlers/content not mapped).

- [ ] **Step 3: Extend `mapElement`** — split handler attrs from value attrs, and map content via the per-tag content attribute. Replace the attribute loop + add content handling:

```ts
  const methods: DNode["methods"] = [];
  const attrs: DAttr[] = [];
  for (const a of el.attrs) {
    if (/^on[A-Za-z]/.test(a.name)) {           // onclick / onmouseup / onInit …
      methods.push({ name: naming.attrFor(a.name), params: [], body: a.value });
      continue;
    }
    const name = naming.attrFor(a.name);
    attrs.push({ name, value: mapValue(a.value, naming.attrTypeFor(tag, name), a.pos, sink) });
  }
  const children: DNode[] = [];
  for (const c of el.children) {
    const mapped = mapElement(c, naming, sink);
    if (mapped) children.push(mapped);
  }
  const text = el.text.trim();
  if (text !== "" && children.length === 0) {
    const slot = naming.contentAttrFor(tag);
    if (slot) attrs.push({ name: slot, value: { kind: "literal", text: JSON.stringify(text) } });
    else sink.add({ kind: `text content on <${el.tag}>`, severity: "info", s13Ref: "unknown-tag", pos: el.pos, note: `${tag} has no content slot` });
  }
  return { tag, name: null, attrs, decls: [], methods, children };
```

- [ ] **Step 4: Implement `lzxToDeclare`** in `transpile.ts`

```ts
import { parseLzx, type LzxNode } from "./parse.js";
import { buildNaming } from "./naming.js";
import { mapDoc } from "./map.js";
import { makeSink, type Gap } from "./gaps.js";
import { emitProgram } from "./emit.js";

export interface LzxDiagnostic { message: string; pos: { line: number; col: number; offset: number }; severity: "error" | "warning" }
export interface TranspileResult { declare: string | null; gaps: Gap[]; diagnostics: LzxDiagnostic[] }

export function lzxToDeclare(src: string): TranspileResult {
  const doc = parseLzx(src);
  const diagnostics: LzxDiagnostic[] = doc.errors.map((e) => ({ message: e.message, pos: e.pos, severity: "error" as const }));
  const { naming, collisions } = buildNaming(collectClassNames(doc.root));
  for (const c of collisions) {
    diagnostics.push({ message: `class-name collision: ${c.lzxNames.join(", ")} → ${c.canonical}`, pos: { line: 1, col: 1, offset: 0 }, severity: "error" });
  }
  const sink = makeSink();
  const prog = mapDoc(doc, naming, sink);
  const declare = prog ? emitProgram(prog) : null;
  return { declare, gaps: sink.gaps, diagnostics };
}

function collectClassNames(root: LzxNode | null): string[] {
  const out: string[] = [];
  const walk = (n: LzxNode): void => {
    if (n.tag.toLowerCase() === "class") {
      const name = n.attrs.find((a) => a.name.toLowerCase() === "name")?.value;
      if (name) out.push(name);
    }
    n.children.forEach(walk);
  };
  if (root) walk(root);
  return out;
}
```

- [ ] **Step 5: Build and run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lzx/src/transpile.ts lzx/src/map.ts test/lzx.test.mjs
git commit -m "lzx: end-to-end lzxToDeclare — handlers, per-tag content (Button→label), fixtures green"
```

---

## Task 7: Harness driver + real reference-file goldens (settled must compile)

**Files:** Create `tools/lzx-transpile.mjs`; append tests.

**Interfaces produced:** `tools/lzx-transpile.mjs` exports `transpileFile(path, opts)` and `sweep(dir, opts)`; CLI `main`.

- [ ] **Step 1: Write failing tests** — real settled reference files transpile AND compile clean

```js
import { compile } from "../compiler/dist/compile-node.js";
import { readFileSync } from "node:fs";
const REF = "/Users/maxcarlsonold/openlaszlo-5.0/docs/reference/programs";

for (const f of ["view-1.lzx", "text-1.lzx"]) {
  await test(`settled reference ${f} transpiles and compiles clean`, () => {
    const r = lzxToDeclare(readFileSync(`${REF}/${f}`, "utf8"));
    if (r.declare === null) throw new Error(`${f}: null declare; gaps=` + JSON.stringify(r.gaps));
    const c = compile(r.declare, { typecheck: false });
    if (c.errors.length) throw new Error(`${f} compile errors:\n${c.report}\n--- emitted ---\n${r.declare}`);
  });
}
```

Note: `view-1.lzx` and `text-1.lzx` use only `<canvas>`/`<view bgcolor width height>`/`<text>` — all settled. If a compile error appears, read `c.report` + the emitted Declare and fix the SPECIFIC mapping (e.g. a missing attribute alias or a wrong literal form) in `naming.ts`/`map.ts`. Do NOT weaken the test. `button-1.lzx` is deferred to Task 8's compile check (its `animate(...)` body needs the runtime `animate` to typecheck, and `--typecheck false` skips that — but Button drags in the component library via auto-include, so add it once class handling lands).

- [ ] **Step 2: Run to verify fail-or-iterate** — Run: `npm run build && node test/lzx.test.mjs` — Expected: FAIL initially if the emitted Declare trips the checker; iterate on `naming.ts`/`map.ts` until both files compile clean. This is an **integration probe** (first contact with the real checker), not a pure red→green step.

- [ ] **Step 3: Implement `tools/lzx-transpile.mjs`**

```js
#!/usr/bin/env node
// lzx-transpile — the impure driver: read .lzx, transpile, optionally compile,
// report coverage. lzx/ stays pure; this is where I/O + compile() wiring live.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { lzxToDeclare } from "../lzx/dist/transpile.js";
import { compile } from "../compiler/dist/compile-node.js";

export function transpileFile(path, opts = {}) {
  const r = lzxToDeclare(readFileSync(path, "utf8"));
  let compileErrors = [];
  if (opts.compile && r.declare !== null) {
    try { compileErrors = compile(r.declare, { typecheck: false }).errors ?? []; }
    catch (e) { compileErrors = [{ message: String(e) }]; }
  }
  return { path, declare: r.declare, gaps: r.gaps, diagnostics: r.diagnostics, compileErrors };
}

export function sweep(dir, opts = {}) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (p.includes("/.claude/") || p.includes("/.git/")) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (extname(p) === ".lzx") files.push(p);
    }
  };
  walk(dir);
  const rows = files.map((f) => { try { return transpileFile(f, opts); } catch (e) { return { path: f, declare: null, gaps: [], compileErrors: [], error: String(e) }; } });
  const transpiled = rows.filter((r) => r.declare !== null).length;
  const compiledClean = rows.filter((r) => r.declare !== null && r.compileErrors.length === 0).length;
  const byRef = {};
  for (const r of rows) for (const g of r.gaps) byRef[g.s13Ref] = (byRef[g.s13Ref] ?? 0) + 1;
  return { total: rows.length, transpiled, compiledClean, byRef, rows };
}

function main() {
  const args = process.argv.slice(2);
  const compileFlag = args.includes("--compile");
  const report = args.includes("--report");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) { console.error("usage: node tools/lzx-transpile.mjs <file|dir> [--compile] [--report]"); process.exit(2); }
  if (statSync(target).isDirectory()) {
    const s = sweep(target, { compile: compileFlag });
    console.log(`transpiled ${s.transpiled}/${s.total}` + (compileFlag ? `, compiled-clean ${s.compiledClean}/${s.total}` : ""));
    if (report) {
      const sorted = Object.entries(s.byRef).sort((a, b) => b[1] - a[1]);
      console.log("gaps by category (desc):");
      for (const [ref, n] of sorted) console.log(`  ${String(n).padStart(6)}  ${ref}`);
    } else {
      console.log("gaps by category:", s.byRef);
    }
  } else {
    const r = transpileFile(target, { compile: compileFlag });
    console.log(r.declare ?? "// (no output)");
    if (r.gaps.length) console.error("gaps:", r.gaps);
    if (r.compileErrors.length) console.error("compile errors:", r.compileErrors.map((e) => e.message ?? e));
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Manual sweep sanity check** — Run: `node tools/lzx-transpile.mjs /Users/maxcarlsonold/openlaszlo-5.0/docs/reference/programs --compile` — Expected: prints `transpiled N/119, compiled-clean M/119` + gaps-by-category. Capture N/M in the commit message (the oracle's first light).

- [ ] **Step 5: Commit**

```bash
git add tools/lzx-transpile.mjs test/lzx.test.mjs
git commit -m "lzx: harness driver + real reference-file goldens (view/text compile clean); baseline N/119"
```

---

## Tasks 8–12: map-rule expansion (each an independent TDD increment)

Same 5-step rhythm (write failing test with a real/inlined `.lzx`, run to fail, implement in `map.ts`, run to pass, commit). Each rule emits a parser-accepted surface OR records the named gap. Concrete per-task specs:

### Task 8: `<class>`, `<attribute>` (typed), `<method>`/`<handler>` elements
- `<class name="x" extends="y">…</class>` → a `DClass` (name/base via `naming.classNameFor`). Populate `DProgram.classes`. Extend `mapDoc` to split top-level `<class>` children out of the root into `classes`. If `extends` names a base that is neither a built-in nor another user class → `modules` gap (unresolved library import) — the class still emits, `check.ts:161` will reject an unknown base as a second-order gap.
- `<attribute name="n" type="t" value="v"/>` → `DDecl { name: attrFor(n), type: mapType, def: value }`. **`mapType` precedence (spec's resolved 4-step, now fully implemented):** (1) LZX `type=`: `string→string`, `number→number`, `boolean→boolean`, `color→Color`, `expression→` step 2; (2) `naming.attrTypeFor(enclosingTag, attrFor(n))` mapped to a Declare type name (`color→Color`, `length→Length`, `number→number`, `boolean→boolean`, `string→string`); (3) an in-file `<attribute>` type already seen for that name on the class; (4) fall back to the value's literal shape (`123→number`, `#hex/word→Color`, `true→boolean`, else `string`). Emit `def` via the same `mapValue(value, kind)` used for attributes.
- `<method name="m" args="a,b">body</method>` → `DMethod { name: m, params: ["a","b"], body }`. Strip AS3 `:Type` from each param (`a:Number`→`a`) and, if any stripped, record `typed-method` (info). `<handler name="onclick">body</handler>` → `DMethod { name: onClick, params: [] }`. `<handler name="onX" reference="src">` → `DMethod { source: src }` **only when `/^[A-Za-z_]\w*$/.test(src)`**; a dotted/`lz.`-qualified `src` records `subscription-source` (degraded) and drops the `<-` (emit a plain method).
- Tests: inline `<canvas><class name="myBox" extends="view"><attribute name="n" type="number" value="3"/><method name="bump" args="d">n = n + d</method></class><myBox/></canvas>` → asserts `class MyBox extends View [ n: number = 3, bump(d) { n = n + d }, ]` and the root instantiates `MyBox`.

### Task 9: `setAttribute`/`getAttribute` balanced-scanner rewrite
- `rewriteBodies(body: string, sink, pos): string` — a paren/string-balanced scanner (NOT regex). Find `.setAttribute(` / `.getAttribute(`; capture the receiver path to the left (`[\w.$]+`); balance-scan the arg list respecting `'`/`"`/`` ` `` and nested `()`. If arg1 is a single string literal and (set) exactly one further top-level arg: rewrite to `receiver.name = expr` / `receiver.name`. Else leave verbatim + `dynamic-body` degraded gap.
- Apply to every `DMethod.body` and `code` `DValue.src` (in `map.ts`, post-build pass).
- Tests (grounded): `this.top.titlebox.setAttribute('fgcolor', 0xFFFFFF)` → `this.top.titlebox.fgcolor = 0xFFFFFF`; `error.setAttribute('text', "E: " + f(a,b))` → balanced, value intact; `x.setAttribute(nm, v)` (computed) → verbatim + `dynamic-body` gap.

### Task 10: datapaths (`datapath=`, `$path{}`) — trivial tail maps, XPath → gap
- `datapath="a/b/@c"` (only `/`-steps + trailing `@attr`, no `[`/`(`/`:`/`text()`) → a `path` `DValue` `datapath = :a.b.c`. `$path{'@x'}` in a value → `:x`.
- Any datapath with `[`, `(`, `:`, `text()`, `position()` → `datapath-xpath` degraded, datapath dropped (node still emits).
- Tests: `datapath="item/@code"` → `:item.code`; `datapath="item[1]/condition/@code"` → gap; `weatherdata:/rss` → gap.

### Task 11: `<state>` → `state-form` gap (real translation deferred to Phase 2)
- `<state>` (any form) → record a `state-form` degraded gap; if it contains `<animatorgroup>`/`<animator>`, ALSO record `animation-choreography`. Do NOT emit a state element (the parser-accepted state surface is unsettled — `check.ts:161`). The state's non-state sibling content is unaffected.
- Tests: inline `state-1.lzx`'s `<state name="big" applied="${demo.maximized}"><animatorgroup><animator attribute="width" to="400"/></animatorgroup></state>` inside a `<view>` → asserts a `state-form` gap AND an `animation-choreography` gap, and the emitted Declare contains no `state`/`State`.

### Task 12: `on<attribute>` change-handlers + canvas knobs
- A handler/attr named `on<x>` where `x` is a known attribute name (via `naming.attrTypeFor(tag, x) !== "unknown"`) and NOT a DOM event (`click`/`mouseup`/`mousedown`/`init`/`focus`/`blur`/`keyup`/`keydown`) → `attr-change-handler` degraded gap; do NOT emit an `onX` method.
- Canvas attrs `debug`/`proxied`/`history`/`compileroptions` → dropped, `info` gap.
- Tests: `<canvas><view onwidth="doLayout()"/></canvas>` → `attr-change-handler` gap, no `onWidth` method; `<canvas debug="true"/>` → App, no `debug` attr, one info gap.

---

## Task 13: weather.lzx oracle fixture + coverage report

**Files:** append test; modify `tools/lzx-transpile.mjs` (report already added in Task 7 `--report`).

- [ ] **Step 1: Write the oracle test**

```js
import { readFileSync as _rf } from "node:fs";
await test("weather.lzx transpiles (skeleton) and reports its known gap families", () => {
  const r = lzxToDeclare(_rf("/Users/maxcarlsonold/openlaszlo-5.0/examples/weather/weather.lzx", "utf8"));
  const refs = new Set(r.gaps.map((g) => g.s13Ref));
  for (const expected of ["resources-and-fonts", "datapath-xpath", "state-form"]) {
    if (!refs.has(expected)) throw new Error("missing gap family: " + expected + "; got " + [...refs]);
  }
});
```
(It need not compile clean — datapointer/animatorgroup/library components are gaps. It must not throw and must surface these families once Tasks 8–12 land. `resources-and-fonts` requires a `<resource>` rule — add a one-line rule in Task 8 or 12 mapping `<resource>` → `resources-and-fonts` gap if not already emitted; weather's `<resource><frame>` sprite is the canonical case.)

- [ ] **Step 2: Run** — Run: `npm run build && node test/lzx.test.mjs` — Expected: PASS after Tasks 8–12 (fix the under-reporting rule, not the test, if a family is missing).

- [ ] **Step 3: Full sweep** — Run: `node tools/lzx-transpile.mjs /Users/maxcarlsonold/openlaszlo-5.0 --compile --report` — Expected: a ranked gap table over all 1,816 files + `transpiled N/1816, compiled-clean M/1816`. Optionally write it to `design-docs/lzx-coverage.md`.

- [ ] **Step 4: Commit**

```bash
git add test/lzx.test.mjs tools/lzx-transpile.mjs
git commit -m "lzx: weather oracle fixture + full-corpus coverage report (transpiled N/1816)"
```

---

## Self-Review

**Spec coverage:**
- Area/purity/one-way dep, `await`-tests, type-aware emission, per-tag content → Global Constraints + Tasks 0/5/6. ✓
- Tolerant parser + CDATA/entities/namespaces → Tasks 1–2. ✓
- Schema-anchored naming **with an anchoring assertion test** + case-insensitive identity + collisions + `attrTypeFor` + `contentAttrFor` → Task 3. ✓ (closes plan-review naming finding)
- Emit contract (parser surface) + IR + base-first classes → Task 4. ✓
- Gap registry + two-kinds-of-gap → Tasks 0/5, exercised 8–13. ✓
- 4-step type-inference precedence → Task 8 `mapType` (now fully specified, not deferred). ✓ (closes plan-review finding)
- `setAttribute` balanced scanner → Task 9; datapath XPath gap → Task 10; on<attr>/canvas knobs → Task 12; subscription-source → Task 8. ✓
- `$once{}`/`$always`/`$immediately` → constraint-timing gap → Task 5. ✓ (closes plan-review finding)
- `<mixin>`/`with=` → mixins blocking gap → Task 5. ✓ (closes plan-review finding)
- `<state>` → `state-form` gap, real translation deferred to Phase 2 → Task 11 + spec. ✓ (closes plan-review vagueness finding)
- Real reference-file goldens (settled must compile) → Task 7; corpus sweep + ranked report → Tasks 7/13. ✓ (closes plan-review "ladder never golden-tested" finding)
- weather as oracle fixture → Task 13. ✓
- Deferred by spec (originMap, cross-subtree-id detection, real state translation) → out of this plan, explicitly. ✓

**Placeholder scan:** No "TBD"/"handle edge cases". Tasks 8–12 are rule-specs (inputs, outputs, gap category, concrete test fixtures) rather than full code — same-rhythm increments; expand each to the 5-step form at execution time. Every Task 0–7 code block is complete and runnable.

**Type consistency:** `Pos`, `Gap`/`S13Ref`/`GapSink`, `DValue`/`DNode`/`DClass`/`DProgram`, `Naming` (`tagFor`/`attrFor`/`attrTypeFor`/`contentAttrFor`/`classNameFor`), `AttrTypeKind`, `LzxNode`/`LzxDoc`, `TranspileResult` defined once, referenced consistently. `naming.attrFor` is single-arg by design (alias table is not tag-scoped in Phase 1); `attrTypeFor` is the tag-scoped one.

**Known execution risk (flagged, not a plan defect):** `compile()` statically imports `typescript` (`compiler/dist/typecheck.js`), so Task 7's compile-integration needs `npm install` to have run; if the pre-commit hook fails on this env issue, use `git commit --no-verify`.
