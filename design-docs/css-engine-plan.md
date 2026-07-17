# CSS Engine & Screen-Update Seam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standard-CSS styling channel (selectors, specificity, cascade) to declarelang as a parallel offer channel alongside the class-dict stylesheet, plus a named `onScreenUpdate` seam on the existing settle loop.

**Architecture:** Port OpenLaszlo 5's CSS parser/specificity/cascade *logic* onto declarelang's reactive `Constraint` system. Pure engine (`css-parse.ts`, `css-match.ts`, `css-coerce.ts`); a per-view applier `Constraint` (sibling of `stylesheet.ts`'s) installs coerced matches as rank-2b offers via new `cssWrite`/`cssClear` in `attributes.ts`. Inheritance rides declarelang's existing `prevailing`-follow, not an OL5 parent-cache.

**Tech Stack:** TypeScript (ESM, `type: module`), `tsc -b` build, Node test harness (`test/harness.mjs`), no runtime deps beyond `typescript`.

**Spec:** `design-docs/css-engine-and-screen-update.md` (read it — this plan implements it).

## Global Constraints

- Build before test: `npm run build` (runs `tsc -b`); tests run against `runtime/dist/*.js`, not `src`.
- Tests use `test/harness.mjs`: `import { test, summarize } from "./harness.mjs"`; a file ends with `summarize()`. New file: `test/css.test.mjs`, run as `node test/css.test.mjs`, and added to the `test` npm script chain in `package.json`.
- Pure modules (`css-parse.ts`, `css-match.ts`, `css-coerce.ts`) import nothing from the view/runtime graph — they are View-free and unit-tested with plain objects.
- Follow existing code style: dense explanatory header comment per module (see `stylesheet.ts`), named exports, no default exports.
- TDD: write the failing test, run it red, implement minimally, run it green, commit. One logical change per commit.
- Value folding (hex/`rgb()`/named/px → number) lives ONLY in `css-coerce.ts`. The parser stores raw declaration strings. Do NOT copy OL5 `css.ts`'s parse-time `cssValueToJs` folding.
- Precedence (enforced, not emergent): author `$set`/binding > class-dict stylesheet (rank-2) > CSS (rank-2b) > prevailing follow > declaration default.

---

## Milestone map

- **M0** — `onScreenUpdate` seam (standalone). Tasks 1–2.
- **M1** — pure engine: parser + matcher. Tasks 3–7.
- **M2** — value coercers + `AttrSpec.css`/reverse map. Tasks 8–10.
- **M3** — runtime wiring: marks/eviction, applier, view slots, end-to-end. Tasks 11–16. **Task 11 is a decision gate.**
- **M4/M5** — dynamic-semantics hardening + compile-time parse + checker + docs. Deferred to a follow-on plan written after M3 lands (their tasks depend on M3's realized code and the `#id` gate outcome).

---

## M0 — The screen-update seam

### Task 1: `onScreenUpdate` seam module

**Files:**
- Create: `runtime/src/screen-update.ts`
- Test: `test/css.test.mjs` (new; first tests land here)

**Interfaces:**
- Produces: `onScreenUpdate(fn: () => void): () => void` (subscribe, returns unsubscribe); `fireScreenUpdate(): void` (called by settle's clean tail).

- [ ] **Step 1: Write the failing test** — add to a new `test/css.test.mjs`:

```js
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { onScreenUpdate, fireScreenUpdate } from "../runtime/dist/screen-update.js";

test("onScreenUpdate: subscriber is invoked on fire", () => {
  let n = 0;
  const off = onScreenUpdate(() => { n++; });
  fireScreenUpdate();
  assert.equal(n, 1);
  off();
});

test("onScreenUpdate: multiple subscribers all invoked; unsubscribe works", () => {
  let a = 0, b = 0;
  const offA = onScreenUpdate(() => { a++; });
  const offB = onScreenUpdate(() => { b++; });
  fireScreenUpdate();
  assert.equal(a, 1); assert.equal(b, 1);
  offA();
  fireScreenUpdate();
  assert.equal(a, 1); assert.equal(b, 2);
  offB();
});

summarize("css");
```

> `summarize` takes a label (`test/harness.mjs`); pass `"css"`. Keep this the single `summarize` call at the file's end — later tasks append their `test(...)` calls above it.

- [ ] **Step 2: Run test to verify it fails** — `npm run build` then `node test/css.test.mjs`. Expected: build error / FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `runtime/src/screen-update.ts`:

```ts
// The named screen-update seam: a single, multi-subscriber observation point
// fired once at the clean completion of a top-level settle (reactive.ts). It
// changes nothing about WHEN a frame paints — the backends already schedule
// their rAF from Surface writes — it just names the frame boundary so callers
// (and readers) have one place that means "everything this settle changed has
// landed." Fired only on a clean settle (never after a throw); see settle().

type Subscriber = () => void;

const subscribers = new Set<Subscriber>();

/** Subscribe to the screen-update seam. Returns an unsubscribe function. */
export function onScreenUpdate(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/** Invoke every subscriber. Called by settle's clean-completion tail. A
 *  subscriber added or removed during dispatch takes effect next fire. */
export function fireScreenUpdate(): void {
  for (const fn of [...subscribers]) fn();
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm run build && node test/css.test.mjs`. Expected: PASS (2 tests).

- [ ] **Step 5: Add `test/css.test.mjs` to the npm test chain** — in `package.json` `scripts.test`, append ` && node test/css.test.mjs` to the chain.

- [ ] **Step 6: Commit**

```bash
git add runtime/src/screen-update.ts test/css.test.mjs package.json
git commit -m "M0: onScreenUpdate seam module (subscribe/fire)"
```

### Task 2: Fire the seam from settle's clean tail

**Files:**
- Modify: `runtime/src/reactive.ts:243-264` (the `settle` function)
- Test: `test/css.test.mjs`

**Interfaces:**
- Consumes: `fireScreenUpdate` from Task 1; `settle`, `Constraint`, `Cell` from `reactive.ts`.

- [ ] **Step 1: Write the failing test** — append to `test/css.test.mjs` before `summarize()`:

```js
import { settle, Constraint, Cell } from "../runtime/dist/reactive.js";
import { onScreenUpdate as onSU } from "../runtime/dist/screen-update.js";

test("settle fires onScreenUpdate once on clean completion", () => {
  let fires = 0;
  const off = onSU(() => { fires++; });
  const cell = new Cell();
  const k = new Constraint("t", () => { cell.track(); return 1; }, () => {});
  k.run();
  cell.changed();       // invalidate → queues a settle
  settle();             // force deterministic settle
  assert.equal(fires, 1);
  off(); k.dispose();
});

test("settle does NOT fire onScreenUpdate when a constraint throws mid-settle", () => {
  let fires = 0;
  const off = onSU(() => { fires++; });
  const cell = new Cell();
  let armed = false;
  const k = new Constraint("boom", () => { cell.track(); if (armed) throw new Error("x"); return 1; }, () => {});
  k.run();              // armed=false → clean initial run
  armed = true;
  cell.changed();       // invalidates k, queues a settle whose recompute throws
  assert.throws(() => settle(), /x/);
  assert.equal(fires, 0); // clean-guard skips the seam on a thrown settle
  off(); try { k.dispose(); } catch {}
});

test("settle fires the seam AFTER constraints run (ordering), and not when idle", () => {
  const order = [];
  const cell = new Cell();
  const k = new Constraint("v", () => { cell.track(); order.push("compute"); return 1; }, () => {});
  k.run();
  order.length = 0;     // discard the construction-time run; capture only the settle below
  const off = onSU(() => { order.push("seam"); });
  cell.changed();
  settle();
  assert.deepEqual(order, ["compute", "seam"]); // recompute ran before the seam fired
  // idle-zero: a settle with nothing invalidated fires the seam exactly once, no compute churn.
  order.length = 0;
  settle();             // nothing queued
  assert.deepEqual(order, ["seam"]);
  off(); k.dispose();
});
```

> The throw test triggers the exception *inside* `settle()` (armed on the second run), so it genuinely exercises the `clean` guard — a naive `finally { fireScreenUpdate() }` would fire and fail this test. `Constraint.invalidate()` is public (`reactive.ts:150`); `Cell.changed()` invalidates subscribers.

- [ ] **Step 2: Run test to verify it fails** — `npm run build && node test/css.test.mjs`. Expected: FAIL (`fires` is 0; seam not wired).

- [ ] **Step 3: Implement** — in `reactive.ts`, import the seam and fire it on the clean path. Add at top with other imports:

```ts
import { fireScreenUpdate } from "./screen-update.js";
```

Modify `settle` to track clean completion and fire after the `finally` resets, guarded:

```ts
export function settle(): void {
  scheduled = false;
  if (flushing) return;
  flushing = true;
  stamp++;
  let clean = false;
  try {
    for (;;) {
      const phase = heads[0] < queues[0].length ? 0 : heads[1] < queues[1].length ? 1 : null;
      if (phase === null) break;
      queues[phase][heads[phase]++].runQueued(stamp);
    }
    clean = true;
  } finally {
    flushing = false;
    for (const phase of [0, 1] as const) {
      for (let i = heads[phase]; i < queues[phase].length; i++) queues[phase][i].abandon();
      queues[phase].length = 0;
      heads[phase] = 0;
    }
  }
  if (clean) fireScreenUpdate();
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm run build && node test/css.test.mjs`. Expected: PASS.

- [ ] **Step 5: Verify no regressions** — `npm test`. Expected: the full suite passes (the seam is additive; `settleHeadless` in `compiler/dist/compile-node.js` delegates to this `settle`, so it fires there too — confirm the suite is green).

- [ ] **Step 6: Commit**

```bash
git add runtime/src/reactive.ts test/css.test.mjs
git commit -m "M0: fire onScreenUpdate on clean settle completion"
```

---

## M1 — The pure engine (parser + matcher)

### Task 3: Selector AST types + specificity helper

**Files:**
- Create: `runtime/src/css-parse.ts`
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  type RawValue = string;
  type Condition =
    | { kind: "tag";   name: string }
    | { kind: "id";    name: string }
    | { kind: "class"; name: string }
    | { kind: "attr";  name: string; op?: "=" | "~=" | "|="; value?: string };
  interface SimpleSelector { conditions: Condition[] }
  type SelectorAST = SimpleSelector[];
  interface Rule { selector: SelectorAST; specificity: number; sourceIndex: number; decls: Map<string, RawValue> }
  function specificityOf(sel: SelectorAST): number;
  ```

- [ ] **Step 1: Write the failing test**:

```js
import { specificityOf } from "../runtime/dist/css-parse.js";

test("specificityOf sums conditions across simple selectors", () => {
  // #id = 100, .class/[attr] = 10, element = 1, * = 0
  assert.equal(specificityOf([{ conditions: [{ kind: "class", name: "red" }] }]), 10);
  assert.equal(specificityOf([{ conditions: [{ kind: "class", name: "red" }, { kind: "class", name: "green" }] }]), 20);
  assert.equal(specificityOf([{ conditions: [{ kind: "tag", name: "view" }, { kind: "class", name: "red" }] }]), 11);
  assert.equal(specificityOf([{ conditions: [{ kind: "id", name: "x" }] }]), 100);
  assert.equal(specificityOf([]), 0);
  // descendant `view button.active` = 1 + (1+10) = 12
  assert.equal(specificityOf([
    { conditions: [{ kind: "tag", name: "view" }] },
    { conditions: [{ kind: "tag", name: "button" }, { kind: "class", name: "active" }] },
  ]), 12);
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run build && node test/css.test.mjs`. Expected: FAIL (module/exports missing).

- [ ] **Step 3: Implement** — start `css-parse.ts` with the header, types, and `specificityOf`:

```ts
// The CSS parser: CSS text → typed Rule[]. A faithful port of OpenLaszlo 5's
// compiler/src/css.ts selector tokenizing + specificity, EXTENDED to emit
// compound condition chains (`.red.green`, `view.red`) as a typed AST, and
// DEVIATING deliberately in one way: values are stored as raw trimmed strings
// (RawValue) — all folding (hex/rgb/named/px → number) is the coercers' job
// (css-coerce.ts), never the parser's. Unsupported surface (`!important`,
// `>`/`+`/`~`, pseudo-classes) is rejected cleanly for the M5 checker.

export type RawValue = string;

export type Condition =
  | { kind: "tag"; name: string }
  | { kind: "id"; name: string }
  | { kind: "class"; name: string }
  | { kind: "attr"; name: string; op?: "=" | "~=" | "|="; value?: string };

export interface SimpleSelector { conditions: Condition[] }
export type SelectorAST = SimpleSelector[];

export interface Rule {
  selector: SelectorAST;
  specificity: number;
  sourceIndex: number;
  decls: Map<string, RawValue>;
}

/** Specificity = sum over every condition: id 100, class/attr 10, tag 1, * 0. */
export function specificityOf(sel: SelectorAST): number {
  let s = 0;
  for (const simple of sel) {
    for (const c of simple.conditions) {
      s += c.kind === "id" ? 100 : c.kind === "tag" ? 1 : 10;
    }
  }
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm run build && node test/css.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/css-parse.ts test/css.test.mjs
git commit -m "M1: css-parse selector AST types + specificityOf"
```

### Task 4: Parse a single simple selector (conditions)

**Files:**
- Modify: `runtime/src/css-parse.ts`
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces: `parseSelectorText(text: string): SelectorAST` (whitespace = descendant combinator; each token = a `SimpleSelector` with compound conditions). Throws `CssUnsupported` (a subclass of `Error`) on `>`/`+`/`~`/pseudo.

- [ ] **Step 1: Write the failing test**:

```js
import { parseSelectorText } from "../runtime/dist/css-parse.js";

test("parseSelectorText: single conditions", () => {
  assert.deepEqual(parseSelectorText(".red"), [{ conditions: [{ kind: "class", name: "red" }] }]);
  assert.deepEqual(parseSelectorText("#x"), [{ conditions: [{ kind: "id", name: "x" }] }]);
  assert.deepEqual(parseSelectorText("view"), [{ conditions: [{ kind: "tag", name: "view" }] }]);
  assert.deepEqual(parseSelectorText("*"), [{ conditions: [] }]);
});

test("parseSelectorText: compound + attribute ops", () => {
  assert.deepEqual(parseSelectorText(".red.green"), [{ conditions: [
    { kind: "class", name: "red" }, { kind: "class", name: "green" }] }]);
  assert.deepEqual(parseSelectorText("view.red"), [{ conditions: [
    { kind: "tag", name: "view" }, { kind: "class", name: "red" }] }]);
  assert.deepEqual(parseSelectorText("[sel]"), [{ conditions: [{ kind: "attr", name: "sel" }] }]);
  assert.deepEqual(parseSelectorText("[k=v]"), [{ conditions: [{ kind: "attr", name: "k", op: "=", value: "v" }] }]);
  assert.deepEqual(parseSelectorText("[k~=v]"), [{ conditions: [{ kind: "attr", name: "k", op: "~=", value: "v" }] }]);
  assert.deepEqual(parseSelectorText("[k|=v]"), [{ conditions: [{ kind: "attr", name: "k", op: "|=", value: "v" }] }]);
});

test("parseSelectorText: descendant combinator", () => {
  assert.deepEqual(parseSelectorText("view button.active"), [
    { conditions: [{ kind: "tag", name: "view" }] },
    { conditions: [{ kind: "tag", name: "button" }, { kind: "class", name: "active" }] },
  ]);
});

test("parseSelectorText: rejects unsupported combinators/pseudo", () => {
  assert.throws(() => parseSelectorText("a > b"), /unsupported/i);
  assert.throws(() => parseSelectorText("a:hover"), /unsupported/i);
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (export missing).

- [ ] **Step 3: Implement** — add to `css-parse.ts`:

```ts
export class CssUnsupported extends Error {
  constructor(message: string) { super(message); this.name = "CssUnsupported"; }
}

/** Tokenize one simple selector (`view.red`, `#x`, `[k~=v]`, `*`) into a
 *  SimpleSelector. A leading identifier is the tag; `.x` `#x` `[..]` are
 *  conditions; `*` yields an empty condition list (universal). */
function parseSimple(token: string): SimpleSelector {
  const conditions: Condition[] = [];
  let i = 0;
  // Optional leading tag / universal.
  const tagMatch = /^[A-Za-z_][\w-]*/.exec(token);
  if (tagMatch) { conditions.push({ kind: "tag", name: tagMatch[0] }); i = tagMatch[0].length; }
  else if (token[0] === "*") { i = 1; }
  while (i < token.length) {
    const ch = token[i];
    if (ch === ".") {
      const m = /^\.([\w-]+)/.exec(token.slice(i));
      if (!m) throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
      conditions.push({ kind: "class", name: m[1] }); i += m[0].length;
    } else if (ch === "#") {
      const m = /^#([\w-]+)/.exec(token.slice(i));
      if (!m) throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
      conditions.push({ kind: "id", name: m[1] }); i += m[0].length;
    } else if (ch === "[") {
      const m = /^\[\s*([\w-]+)\s*(?:([~|]?=)\s*"?([^"\]]*)"?\s*)?\]/.exec(token.slice(i));
      if (!m) throw new CssUnsupported(`unsupported attribute selector near '${token.slice(i)}'`);
      const cond: Condition = { kind: "attr", name: m[1] };
      if (m[2]) { cond.op = m[2] as "=" | "~=" | "|="; cond.value = m[3]; }
      conditions.push(cond); i += m[0].length;
    } else if (ch === ":" || ch === ">" || ch === "+" || ch === "~") {
      throw new CssUnsupported(`unsupported selector feature '${ch}'`);
    } else {
      throw new CssUnsupported(`unsupported selector near '${token.slice(i)}'`);
    }
  }
  return { conditions };
}

/** Parse a full selector: whitespace-separated simple selectors → descendant
 *  chain (ancestor-first). Combinators `>`/`+`/`~` and pseudo `:` reject. */
export function parseSelectorText(text: string): SelectorAST {
  const trimmed = text.trim();
  if (/[>+~]/.test(trimmed)) throw new CssUnsupported(`unsupported combinator in '${trimmed}'`);
  return trimmed.split(/\s+/).map(parseSimple);
}
```

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/css-parse.ts test/css.test.mjs
git commit -m "M1: parseSelectorText — compound conditions, attr ops, descendant, reject unsupported"
```

### Task 5: Parse declarations + full rules (`parseCss`)

**Files:**
- Modify: `runtime/src/css-parse.ts`
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces: `parseCss(text: string): Rule[]` — strips `/* */` comments, splits `selector { decls }`, parses each into a `Rule` with `specificity`, a monotonic `sourceIndex` (0,1,2… in source order), and `decls: Map<cssProp, rawValueString>`. A rule with a comma-grouped selector expands to one `Rule` per selector, sharing decls, each with its own `sourceIndex`.

- [ ] **Step 1: Write the failing test**:

```js
import { parseCss } from "../runtime/dist/css-parse.js";

test("parseCss: rules, decls (raw strings), specificity, sourceIndex", () => {
  const rules = parseCss(`
    /* c */
    .red { background-color: #2d7; color: white }
    view.red { font-size: 14px }
  `);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].specificity, 10);
  assert.equal(rules[0].sourceIndex, 0);
  assert.equal(rules[0].decls.get("background-color"), "#2d7");
  assert.equal(rules[0].decls.get("color"), "white");
  assert.equal(rules[1].specificity, 11);
  assert.equal(rules[1].sourceIndex, 1);
  assert.equal(rules[1].decls.get("font-size"), "14px");
});

test("parseCss: comma-grouped selectors expand to one rule each", () => {
  const rules = parseCss(`.a, .b { color: red }`);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].sourceIndex, 0);
  assert.equal(rules[1].sourceIndex, 1);
  assert.equal(rules[1].decls.get("color"), "red");
});

test("parseCss: rejects !important cleanly", () => {
  assert.throws(() => parseCss(`.a { color: red !important }`), /unsupported|important/i);
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — add to `css-parse.ts`:

```ts
/** Parse a declaration body `a: 1; b: 2` into a Map of raw string values. */
function parseDecls(body: string): Map<string, RawValue> {
  const decls = new Map<string, RawValue>();
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue; // blank or malformed fragment
    const name = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (name === "") continue;
    if (/!\s*important/i.test(value)) {
      throw new CssUnsupported(`unsupported '!important' in '${name}: ${value}'`);
    }
    decls.set(name, value);
  }
  return decls;
}

/** Parse a full stylesheet text into Rule[]. */
export function parseCss(text: string): Rule[] {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments)) !== null) {
    const selectorGroup = m[1].trim();
    const decls = parseDecls(m[2]);
    for (const selText of selectorGroup.split(",")) {
      const trimmed = selText.trim();
      if (trimmed === "") continue;
      const selector = parseSelectorText(trimmed);
      rules.push({ selector, specificity: specificityOf(selector), sourceIndex: rules.length, decls });
    }
  }
  return rules;
}
```

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/css-parse.ts test/css.test.mjs
git commit -m "M1: parseCss — decls as raw strings, source-order index, comma expansion"
```

### Task 6: The matcher — `MatchView`, `matches`, `RuleSet`

**Files:**
- Create: `runtime/src/css-match.ts`
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  interface MatchView { tagChain: readonly string[]; id: string; styleclass: string;
                        attr(name: string): unknown; parent: MatchView | null }
  interface RuleSet { rules: readonly Rule[] }
  function buildRuleSet(cssText: string): RuleSet;
  function matches(view: MatchView, sel: SelectorAST): boolean;
  ```
- Consumes: `Rule`, `SelectorAST`, `Condition`, `parseCss` from `css-parse.ts`.

- [ ] **Step 1: Write the failing test**:

```js
import { buildRuleSet, matches } from "../runtime/dist/css-match.js";
import { parseSelectorText } from "../runtime/dist/css-parse.js";

function fakeView(over = {}, parent = null) {
  return { tagChain: over.tagChain ?? [], id: over.id ?? "", styleclass: over.styleclass ?? "",
           attr: (n) => (over.attrs ?? {})[n], parent };
}

test("matches: class membership is whitespace-tokenized (~=)", () => {
  const v = fakeView({ styleclass: "red bold" });
  assert.equal(matches(v, parseSelectorText(".red")), true);
  assert.equal(matches(v, parseSelectorText(".bold")), true);
  assert.equal(matches(v, parseSelectorText(".re")), false);   // not a substring match
  assert.equal(matches(v, parseSelectorText(".red.bold")), true);
  assert.equal(matches(v, parseSelectorText(".red.green")), false);
});

test("matches: subclass-aware tag via tagChain, id, universal", () => {
  const v = fakeView({ tagChain: ["Button", "View", "Node"], id: "ok" });
  assert.equal(matches(v, parseSelectorText("View")), true);     // subclass match
  assert.equal(matches(v, parseSelectorText("Button")), true);
  assert.equal(matches(v, parseSelectorText("Text")), false);
  assert.equal(matches(v, parseSelectorText("#ok")), true);
  assert.equal(matches(v, parseSelectorText("*")), true);
});

test("matches: attribute ops = ~= |=", () => {
  const v = fakeView({ attrs: { sel: true, cls: "a b", lang: "en-US" } });
  assert.equal(matches(v, parseSelectorText("[sel]")), true);
  assert.equal(matches(v, parseSelectorText("[missing]")), false);
  assert.equal(matches(v, parseSelectorText('[cls~=b]')), true);
  assert.equal(matches(v, parseSelectorText('[cls~=c]')), false);
  assert.equal(matches(v, parseSelectorText('[lang|=en]')), true);   // en or en-*
  assert.equal(matches(v, parseSelectorText('[lang|=fr]')), false);
});

test("matches: descendant combinator walks the parent chain", () => {
  const root = fakeView({ tagChain: ["View"] });
  const child = fakeView({ tagChain: ["Button", "View"], styleclass: "active" }, root);
  assert.equal(matches(child, parseSelectorText("View Button.active")), true);
  assert.equal(matches(child, parseSelectorText("Text Button.active")), false);
  // rightmost must match THIS node, not an ancestor: `Button View` fails here
  // (child is a Button whose ancestor is a View — the rightmost `View` would
  // need child itself to be a View-not-Button-… it is (subclass), so craft a
  // clearer negative: rightmost `Text` never matches child)
  assert.equal(matches(child, parseSelectorText("View Text")), false);
});

test("buildRuleSet parses text into rules", () => {
  const rs = buildRuleSet(".a { color: red }");
  assert.equal(rs.rules.length, 1);
  assert.equal(rs.rules[0].decls.get("color"), "red");
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — `css-match.ts`:

```ts
// The CSS matcher: given a structural view (MatchView) and a parsed RuleSet,
// decide which rules apply and cascade their declarations. A port of OL5's
// LzCSSStyle matching WITHOUT getPropertyCache's parent-cache — matching is
// per-view; inheritance of properties like `color` is left to declarelang's
// prevailing-follow. View-free: it reads only the MatchView interface, so it
// is fully unit-testable with plain objects.

import { parseCss, type Rule, type SelectorAST, type Condition, type RawValue } from "./css-parse.js";

export interface MatchView {
  tagChain: readonly string[]; // this class + ancestors (subclass-aware tag)
  id: string;
  styleclass: string; // whitespace-tokenized for .class (~=) membership
  attr(name: string): unknown;
  parent: MatchView | null;
}

export interface RuleSet { rules: readonly Rule[] }

/** Build a RuleSet from CSS text (mirrors buildStylesheet). */
export function buildRuleSet(cssText: string): RuleSet {
  return { rules: parseCss(cssText) };
}

function tokens(s: string): string[] { return s.trim() === "" ? [] : s.trim().split(/\s+/); }

/** Does one simple selector's conditions all hold on `view`? */
function simpleMatches(view: MatchView, conditions: readonly Condition[]): boolean {
  for (const c of conditions) {
    if (c.kind === "tag") { if (!view.tagChain.includes(c.name)) return false; }
    else if (c.kind === "id") { if (view.id !== c.name) return false; }
    else if (c.kind === "class") { if (!tokens(view.styleclass).includes(c.name)) return false; }
    else { // attr
      const v = view.attr(c.name);
      if (c.op === undefined) { if (v === undefined || v === null || v === false) return false; }
      else {
        const s = v === undefined || v === null ? "" : String(v);
        if (c.op === "=") { if (s !== c.value) return false; }
        else if (c.op === "~=") { if (!tokens(s).includes(c.value ?? "")) return false; }
        else if (c.op === "|=") { if (!(s === c.value || s.startsWith((c.value ?? "") + "-"))) return false; }
      }
    }
  }
  return true;
}

/** Does the full selector (descendant chain, ancestor-first) match `view`?
 *  The rightmost simple selector must match `view`; earlier ones must match
 *  some ancestor, in order (standard descendant semantics). */
export function matches(view: MatchView, sel: SelectorAST): boolean {
  if (sel.length === 0) return true;
  const last = sel[sel.length - 1];
  if (!simpleMatches(view, last.conditions)) return false;
  let ancestorIdx = sel.length - 2;
  let node = view.parent;
  while (ancestorIdx >= 0) {
    if (node === null) return false;
    if (simpleMatches(node, sel[ancestorIdx].conditions)) ancestorIdx--;
    node = node.parent;
  }
  return true;
}
```

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/css-match.ts test/css.test.mjs
git commit -m "M1: css-match — MatchView, subclass tag, ~=/|= attrs, descendant chain, buildRuleSet"
```

### Task 7: The cascade — `matched(view, ruleSet)`

**Files:**
- Modify: `runtime/src/css-match.ts`
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces: `matched(view: MatchView, ruleSet: RuleSet): Map<string, RawValue>` — fold matching rules ascending by `(specificity, sourceIndex)`; each rule overrides only the properties it declares (per-property last-wins).

- [ ] **Step 1: Write the failing test**:

```js
import { matched } from "../runtime/dist/css-match.js";

test("matched: specificity then source order; per-property last wins", () => {
  const rs = buildRuleSet(`
    .red { color: red; font-size: 10px }
    .red.green { color: yellow }
    #id { color: blue }
  `);
  // .red only
  let m = matched(fakeView({ styleclass: "red" }), rs);
  assert.equal(m.get("color"), "red");
  assert.equal(m.get("font-size"), "10px");
  // .red.green (spec 20) beats .red (spec 10) for color; font-size stays
  m = matched(fakeView({ styleclass: "red green" }), rs);
  assert.equal(m.get("color"), "yellow");
  assert.equal(m.get("font-size"), "10px");
  // #id (spec 100) beats classes
  m = matched(fakeView({ styleclass: "red green", id: "id" }), rs);
  assert.equal(m.get("color"), "blue");
});

test("matched: equal specificity resolves by source order (last wins)", () => {
  const rs = buildRuleSet(`.a { color: red } .a { color: green }`);
  const m = matched(fakeView({ styleclass: "a" }), rs);
  assert.equal(m.get("color"), "green");
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — add to `css-match.ts`:

```ts
import { type RawValue } from "./css-parse.js"; // (extend the existing import instead of duplicating)

/** The per-view cascade: declarations of all rules matching `view`, folded in
 *  ascending (specificity, sourceIndex) so a later/more-specific rule
 *  overrides only the properties it declares. No parent-cache inheritance. */
export function matched(view: MatchView, ruleSet: RuleSet): Map<string, RawValue> {
  const hits = ruleSet.rules.filter((r) => matches(view, r.selector));
  hits.sort((a, b) => a.specificity - b.specificity || a.sourceIndex - b.sourceIndex);
  const out = new Map<string, RawValue>();
  for (const r of hits) for (const [k, v] of r.decls) out.set(k, v);
  return out;
}
```

> Implementer note: merge this `RawValue` import into the single import from `./css-parse.js` at the top of the file (do not add a second `import` statement — TypeScript allows one; the block above shows the symbol for clarity).

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/css-match.ts test/css.test.mjs
git commit -m "M1: matched — per-view cascade by (specificity, sourceIndex)"
```

---

## M2 — Value coercers + attribute mapping

### Task 8: Coercers (`css-coerce.ts`)

**Files:**
- Create: `runtime/src/css-coerce.ts`
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces: `coerceColor(raw: string): number | undefined`, `coerceLength(raw: string): number | undefined`, `coerceNumber(raw: string): number | undefined`, `coerceString(raw: string): string | undefined`, `coerceWeight(raw: string): string | undefined`. Each returns `undefined` on malformed input (the applier then skips the declaration).
- Consumes: `CSS_COLORS` from `css-colors.ts`.

- [ ] **Step 1: Write the failing test**:

```js
import { coerceColor, coerceLength, coerceNumber, coerceString, coerceWeight } from "../runtime/dist/css-coerce.js";

test("coerceColor: hex, named, rgb() → int; malformed → undefined", () => {
  assert.equal(coerceColor("#2d7"), 0x22dd77);          // 3-digit expands
  assert.equal(coerceColor("#22dd77"), 0x22dd77);
  assert.equal(coerceColor("white"), 0xffffff);
  assert.equal(coerceColor("WHITE"), 0xffffff);          // case-insensitive
  assert.equal(coerceColor("rgb(34, 221, 119)"), 0x22dd77);
  assert.equal(coerceColor("rgb(300, 0, 0)"), 0xff0000);  // channels clamp to 255
  assert.equal(coerceColor("notacolor"), undefined);
  assert.equal(coerceColor("#12"), undefined);
});

test("coerceLength: px + unitless; malformed → undefined", () => {
  assert.equal(coerceLength("10px"), 10);
  assert.equal(coerceLength("10"), 10);
  assert.equal(coerceLength("2.5px"), 2.5);
  assert.equal(coerceLength("banana"), undefined);
});

test("coerceNumber / coerceString / coerceWeight", () => {
  assert.equal(coerceNumber("0.5"), 0.5);
  assert.equal(coerceNumber("x"), undefined);
  assert.equal(coerceString("sans-serif"), "sans-serif");
  assert.equal(coerceWeight("bold"), "bold");
  assert.equal(coerceWeight("normal"), "normal");
  assert.equal(coerceWeight("700"), "bold");            // numeric ≥600 → bold
  assert.equal(coerceWeight("400"), "normal");
  assert.equal(coerceWeight("maybe"), undefined);
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — `css-coerce.ts`:

```ts
// CSS value coercers: raw declaration strings → declarelang attribute values.
// This is where ALL folding lives (the parser stays structural). Each coercer
// returns `undefined` on malformed input; the CSS applier then skips that
// declaration (and the M5 checker will flag it). `color` is net-new parsing —
// css-colors.ts supplies only the 148 named-color keywords, not hex/rgb.

import { CSS_COLORS } from "./css-colors.js";

export function coerceColor(raw: string): number | undefined {
  const s = raw.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16));
    return (r << 16) | (g << 8) | b;
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return parseInt(m[1], 16);
  m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.min(255, parseInt(n, 10)));
    return (r << 16) | (g << 8) | b;
  }
  if (Object.hasOwn(CSS_COLORS, s)) return CSS_COLORS[s];
  return undefined;
}

export function coerceLength(raw: string): number | undefined {
  const m = /^(-?\d*\.?\d+)(px)?$/.exec(raw.trim());
  return m ? Number(m[1]) : undefined;
}

export function coerceNumber(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : undefined;
}

export function coerceString(raw: string): string | undefined {
  const s = raw.trim();
  return s === "" ? undefined : s;
}

export function coerceWeight(raw: string): string | undefined {
  const s = raw.trim().toLowerCase();
  if (s === "bold" || s === "normal") return s;
  const n = Number(s);
  if (Number.isFinite(n)) return n >= 600 ? "bold" : "normal";
  return undefined;
}
```

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/css-coerce.ts test/css.test.mjs
git commit -m "M2: css-coerce — color/length/number/string/weight, malformed→undefined"
```

### Task 9: `AttrSpec.css` + reverse map in `defineAttributes`

**Files:**
- Modify: `runtime/src/attributes.ts` (`AttrSpec` interface ~line 36; `defineAttributes` ~line 107)
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces: `AttrSpec` gains `css?: string` and `coerce?: (raw: string) => unknown`; `cssMap(ctor: Function): Record<string, { attr: string; coerce: (raw: string) => unknown }>` returns the per-class reverse map (cssProp → {attr, coerce}), prototype-chained like the other tables.

- [ ] **Step 1: Write the failing test**:

```js
import { defineAttributes, cssMap } from "../runtime/dist/attributes.js";

test("cssMap builds cssProp → {attr, coerce} from css:/coerce specs", () => {
  class Widget {}
  defineAttributes(Widget, {
    fill: { def: null, css: "background-color", coerce: (raw) => (raw === "#2d7" ? 0x22dd77 : undefined) },
    plain: { def: 0 }, // no css: → absent from the map
  });
  const map = cssMap(Widget);
  assert.equal(map["background-color"].attr, "fill");
  assert.equal(map["background-color"].coerce("#2d7"), 0x22dd77);
  assert.equal(map["plain"], undefined);

  class Bare {}
  defineAttributes(Bare, { x: { def: 0 } });
  assert.deepEqual(cssMap(Bare), {}); // no css specs → empty map
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (`cssMap` missing).

- [ ] **Step 3: Implement** — in `attributes.ts`:

  (a) Extend `AttrSpec` (add after `equal?`):

```ts
  /** The W3C CSS property that feeds this attribute (e.g. "background-color"),
   *  and the coercer turning a raw CSS value string into this attr's value.
   *  Both must be present for the CSS channel to target this attribute. */
  css?: string;
  coerce?: (raw: string) => unknown;
```

  (b) Add a `CSSMAP` table alongside `PUSHERS`/`PREVAILING`/`EQUALS` (mirror their `Object.create(tableFor(...))` construction in `defineAttributes`), populate it per attr when `spec.css !== undefined && spec.coerce !== undefined` with `{ attr: name, coerce: spec.coerce }` keyed by `spec.css`, and export:

```ts
export function cssMap(ctor: Function): Record<string, { attr: string; coerce: (raw: string) => unknown }> {
  return tableFor(CSSMAP, ctor) ?? {};
}
```

  Follow the exact pattern the existing tables use (a module-level `WeakMap`, `tableFor`, prototype-chained per class). The reverse map is keyed by CSS property, value `{attr, coerce}`.

- [ ] **Step 4: Run to verify it passes** — `npm run build && node test/css.test.mjs`. Expected: PASS (the throwaway-class assertions are fully independent of View wiring, which lands in Task 10).

- [ ] **Step 5: Commit**

```bash
git add runtime/src/attributes.ts test/css.test.mjs
git commit -m "M2: AttrSpec.css/coerce + cssMap reverse-map in defineAttributes"
```

### Task 10: Wire `css:`/`coerce` onto View's styling attributes

**Files:**
- Modify: `runtime/src/view.ts` (`defineAttributes(View, {...})` ~line 485)
- Test: `test/css.test.mjs` (the Task 9 assertions now pass fully)

**Interfaces:**
- Consumes: coercers from `css-coerce.ts`; `AttrSpec.css`/`coerce` from Task 9.

- [ ] **Step 1: Ensure the Task 9 test asserts the full mapping** (it does). Run it red against the un-wired View — Expected: FAIL (`map["background-color"]` undefined).

- [ ] **Step 2: Implement** — import coercers at the top of `view.ts`:

```ts
import { coerceColor, coerceLength, coerceNumber, coerceString, coerceWeight } from "./css-coerce.js";
```

Add `css`/`coerce` to the relevant specs in `defineAttributes(View, {...})` (extend the existing entries — do not reorder). Example edits:

```ts
  x: { def: 0, push: (v, n) => v.surface?.setX(n), css: "left", coerce: coerceLength },
  y: { def: 0, push: (v, n) => v.surface?.setY(n), css: "top", coerce: coerceLength },
  width: { def: 0, push: (v, n) => v.surface?.setWidth(n), css: "width", coerce: coerceLength },
  height: { def: 0, push: (v, n) => v.surface?.setHeight(n), css: "height", coerce: coerceLength },
  fill: { def: null, push: (v, f) => v.surface?.setFill(f), equal: fillEqual, css: "background-color", coerce: coerceColor },
  cornerRadius: { def: 0, push: (v, r) => v.surface?.setCornerRadius(r), css: "border-radius", coerce: coerceLength },
  opacity: { def: 1, push: (v, o) => v.surface?.setOpacity(o), css: "opacity", coerce: coerceNumber },
  textColor: { def: 0x000000, prevailing: true, css: "color", coerce: coerceColor },
  fontSize: { def: 16, prevailing: true, css: "font-size", coerce: coerceLength },
  fontFamily: { def: "sans-serif", prevailing: true, css: "font-family", coerce: coerceString },
  fontWeight: { def: "normal", prevailing: true, css: "font-weight", coerce: coerceWeight },
  letterSpacing: { def: 0, prevailing: true, css: "letter-spacing", coerce: coerceLength },
```

> `background`/`background-color` both mapping to `fill`: register `fill` under `css: "background-color"`. A `background` alias can be added later; keep the starter map to the one property per attr shown above (YAGNI).

- [ ] **Step 3: Run to verify it passes** — `npm run build && node test/css.test.mjs`. Expected: PASS (the Task 9 `cssMap(View)` assertions).

- [ ] **Step 4: Full suite** — `npm test`. Expected: green (additive fields; no behavior change).

- [ ] **Step 5: Commit**

```bash
git add runtime/src/view.ts test/css.test.mjs
git commit -m "M2: map W3C properties onto View styling attributes (fill/textColor/x/…)"
```

---

## M3 — Runtime wiring (end-to-end)

> **M3 is the first end-to-end-correct milestone.** Do its tasks in order; Task 11 is a decision gate that must be resolved before the rest.

### Task 11 (GATE): Resolve CSS `#id` identity

**Decision:** Does CSS `#id` match a new `id` attribute on `View`, or declarelang's existing §27 scope-noun identity? This changes whether Task 14 adds an `id` attribute.

- [ ] **Step 1:** Present the two options to the human (recommended default: a plain `id` attribute on `View`, defaulting to `""`, since scope-nouns are a compile-time binding concept and CSS `#id` wants a runtime string). Get a decision. Record it as a one-line note at the top of M3 in this plan. Do not write code in this task.

### Task 12: `$cssMarks` + `cssWrite`/`cssClear`/`cssMarks` + reactive marks + eviction

**Files:**
- Modify: `runtime/src/attributes.ts` (Carrier type ~line 80; near `stylesheetWrite`/`stylesheetClear` ~line 303; `provided` ~line 186)
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces: `cssWrite(self, name, v)`, `cssClear(self, name)`, `cssMarks(self): ReadonlySet<string> | undefined`. `provided()` counts a `$cssMarks` mark. `stylesheetWrite` evicts a `$cssMarks` entry for the same slot; every mark add/remove (both channels) fires `cellFor(self, name).changed()` so a tracked provision probe re-runs.

- [ ] **Step 1: Write the failing test** (arbitration determinism, both orders):

This task's tests target the marks/eviction MECHANISM directly on a real `View`
(constructing views is fine — `new View()` is used throughout `test/unit.test.mjs`).
The full both-orders *arbitration through the applier* is Task 14's integration test.

```js
import { cssWrite, cssClear, cssMarks, stylesheetWrite, stylesheetClear, isSet } from "../runtime/dist/attributes.js";
import { View } from "../runtime/dist/view.js";

test("cssWrite marks + provides; cssClear restores the fallback", () => {
  const v = new View();
  cssWrite(v, "fill", 0x111111);
  assert.equal(v.fill, 0x111111);
  assert.equal(cssMarks(v)?.has("fill"), true);
  cssClear(v, "fill");
  assert.equal(v.fill, null);                 // View's fill default
  assert.equal(cssMarks(v)?.has("fill") ?? false, false);
});

test("class-dict eviction: stylesheetWrite over a CSS-marked slot wins and evicts the CSS mark", () => {
  const v = new View();
  cssWrite(v, "fill", 0x111111);
  stylesheetWrite(v, "fill", 0x222222);
  assert.equal(v.fill, 0x222222);
  assert.equal(cssMarks(v)?.has("fill") ?? false, false); // CSS mark evicted (class-dict rank-2 > CSS rank-2b)
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — mirror the real `stylesheetWrite`/`stylesheetClear` (`attributes.ts:303-327`) exactly — same inline `becameProvider` pattern — adding a `$cssMarks?: Set<string>` field to `Carrier`:

```ts
export function cssWrite(self: object, name: string, v: unknown): void {
  const carrier = self as Carrier;
  const becameProvider =
    tableFor(PREVAILING, self.constructor)?.[name] === true && !provided(carrier, name);
  (carrier.$cssMarks ??= new Set()).add(name);
  write(self, name, v);                       // fires $cells[name].changed() on value change (the probe's wake)
  if (becameProvider) carrier.$cells?.[name]?.changed(); // prevailing followers re-root
}

export function cssClear(self: object, name: string): void {
  const carrier = self as Carrier;
  if (carrier.$cssMarks === undefined || !carrier.$cssMarks.delete(name)) return;
  if (provided(carrier, name)) return;
  if (carrier.$attrs !== undefined && Object.hasOwn(carrier.$attrs, name)) delete carrier.$attrs[name];
  carrier.$cells?.[name]?.changed();
  const v = (self as Record<string, unknown>)[name];
  tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
}

export function cssMarks(self: object): ReadonlySet<string> | undefined {
  return (self as Carrier).$cssMarks;
}
```

Extend `provided` to OR in `$cssMarks`:

```ts
function provided(self: Carrier, name: string): boolean {
  return (
    (self.$set?.has(name) ?? false) ||
    (self.$owners?.[name] !== undefined) ||
    (self.$stylesheetMarks?.has(name) ?? false) ||
    (self.$cssMarks?.has(name) ?? false)   // ← new
  );
}
```

Add eviction to `stylesheetWrite` (class-dict outranks CSS): after `write(self, name, v);`, before the `becameProvider` wake:

```ts
  carrier.$cssMarks?.delete(name); // class-dict (rank-2) evicts a CSS (rank-2b) mark
```

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runtime/src/attributes.ts test/css.test.mjs
git commit -m "M3: $cssMarks + cssWrite/cssClear + provided() + class-dict eviction + reactive marks"
```

### Task 13: The CSS applier (`css-apply.ts`)

**Files:**
- Create: `runtime/src/css-apply.ts`
- Test: `test/css.test.mjs`

**Interfaces:**
- Produces: `ensureCssApplier(view: object): void`, `cssRulesArrived(view: object): void`, `cssReparent(view: object): void`, `disposeCssApplier(view: object): void` — the sibling of `stylesheet.ts`'s `ensureApplier`/`stylesheetArrived`/`disposeApplier`.
- Consumes: `matched`, `MatchView`, `RuleSet` from `css-match.ts`; `cssMap` from `attributes.ts`; `cssWrite`/`cssClear`/`cssMarks`/`isSet`/`ownerOf`/`stylesheetMarks` from `attributes.ts`; `Constraint` from `reactive.ts`.

> **This task and Task 14 are executed together and committed once** (Task 14's
> commit includes `css-apply.ts`). The applier consumes real `View` machinery
> (`cssWrite`/`write`/`$cells`), so it cannot be meaningfully unit-tested without
> the View slots Task 14 adds — Task 14's end-to-end test IS this applier's
> red→green. Do NOT commit `css-apply.ts` with only a compile check.

- [ ] **Step 1: Implement** — `css-apply.ts` (mirrors `stylesheet.ts:104-179`):

```ts
// The CSS applier: one Constraint per view (pay-per-use), the sibling of the
// stylesheet applier. It reads (tracked) the prevailing cssRules, the view's
// and ancestors' styleclass/id and any tested [attr], computes the per-view
// cascade, coerces each mapped property, and installs the result as rank-2b
// offers (below the class-dict) via cssWrite / withdraws via cssClear. Dynamic
// re-matching rides the reactive settle: any tracked read that changes wakes it.

import { Constraint } from "./reactive.js";
import { cssMap, cssWrite, cssClear, cssMarks, isSet, ownerOf, stylesheetMarks } from "./attributes.js";
import { matched, type MatchView, type RuleSet } from "./css-match.js";

interface Styled {
  parent: Styled | null;
  children?: readonly unknown[];
  cssRules: RuleSet | null;
  styleclass: string;
  id: string;
  constructor: Function;
}

const APPLIERS = new WeakMap<object, Constraint>();

/** Adapt a view to the matcher's structural interface, reading through the
 *  view's TRACKED accessors so a change to styleclass/id/[attr] on this view
 *  OR any ancestor wakes the applier. tagChain is immutable (no tracking). */
function asMatchView(v: Styled): MatchView {
  return {
    get tagChain() { return classNames(v.constructor); },
    get id() { return v.id; },                 // tracked read
    get styleclass() { return v.styleclass; }, // tracked read
    attr: (name) => (v as Record<string, unknown>)[name], // tracked read of the tested attr
    get parent() { return v.parent ? asMatchView(v.parent) : null; },
  };
}

function classNames(ctor: Function): string[] {
  const names: string[] = [];
  let c: Function | null = ctor;
  while (c && c !== Function.prototype && c.name) { names.push(c.name); c = Object.getPrototypeOf(c); }
  return names;
}

export function ensureCssApplier(view: object): void {
  const v = view as Styled;
  if (APPLIERS.has(view)) return;
  if (v.cssRules === null) return;
  const map = cssMap(v.constructor);
  const applier = new Constraint(
    `${v.constructor.name}'s css`,
    () => {
      const rules = v.cssRules;               // tracked follow of the prevailing slot
      const offers: Record<string, unknown> = Object.create(null);
      if (rules !== null) {
        const decls = matched(asMatchView(v), rules);
        for (const [prop, raw] of decls) {
          const entry = map[prop];
          if (entry === undefined) continue;  // unmapped property → ignore
          // TRACKED PROVISION PROBE: read the slot's effective value through the
          // getter so this applier subscribes to entry.attr's cell. Any provision
          // change on it — author $set, an owning binding, a class-dict
          // stylesheetWrite/Clear (all fire that cell's changed()) — then wakes
          // this applier to withdraw or re-offer. Without this the eviction
          // re-offer silently never fires (spec Reactive-fit point 3).
          void (view as Record<string, unknown>)[entry.attr];
          // Author or class-dict outranks CSS: don't offer.
          if (isSet(view, entry.attr) || ownerOf(view, entry.attr) !== null) continue;
          if (stylesheetMarks(view)?.has(entry.attr)) continue;
          const value = entry.coerce(raw);
          if (value === undefined) continue;  // malformed → skip
          offers[entry.attr] = value;
        }
      }
      return offers;
    },
    (offers) => {
      const o = offers as Record<string, unknown>;
      const marks = cssMarks(view);
      if (marks !== undefined) for (const name of [...marks]) if (!(name in o)) cssClear(view, name);
      for (const name in o) cssWrite(view, name, o[name]);
    }
  );
  APPLIERS.set(view, applier);
  applier.run();
}

export function cssRulesArrived(view: object): void {
  const walk = (n: Styled): void => {
    ensureCssApplier(n);
    for (const c of n.children ?? []) if (typeof c === "object" && c !== null && "cssRules" in c) walk(c as Styled);
  };
  walk(view as Styled);
}

/** Re-cascade a moved subtree against its new ancestors. */
export function cssReparent(view: object): void {
  const walk = (n: Styled): void => {
    APPLIERS.get(n)?.run();
    for (const c of n.children ?? []) if (typeof c === "object" && c !== null && "cssRules" in c) walk(c as Styled);
  };
  walk(view as Styled);
}

export function disposeCssApplier(view: object): void {
  const a = APPLIERS.get(view);
  if (a !== undefined) { APPLIERS.delete(view); a.dispose(); }
}
```

> Note: reading `v.styleclass`/`v.id`/`v[attr]` inside `compute()` registers tracked deps on those cells (the getter tracks the read receiver — verified against `attributes.ts:127` / `followRead`). Reading an ancestor via `parent` recursion tracks the ancestor's cells too. `cssRules` is a prevailing slot so its read is a tracked follow.

- [ ] **Step 2: Build to verify it compiles** — `npm run build`. Expected: clean compile. Do NOT commit yet — proceed directly to Task 14, whose end-to-end test verifies this module, and commit both together.

### Task 14: `styleclass`/`id`/`cssRules` slots on View + wiring (verifies Task 13)

**Files:**
- Create: `runtime/src/css-apply.ts` (from Task 13 — committed here)
- Modify: `runtime/src/view.ts` (`defineAttributes(View, {...})`; `childrenMutated` ~line 288; `discard` ~line 383)
- Modify: `runtime/src/instantiate.ts:215` (`initTree`, right after the `ensureApplier(view)` call)
- Test: `test/css.test.mjs`

**Interfaces:**
- Consumes: `ensureCssApplier`/`cssRulesArrived`/`cssReparent`/`disposeCssApplier` from `css-apply.ts`.
- Produces: `View.styleclass: string`, `View.id: string` (per Task 11 gate), `View.cssRules: RuleSet | null` (prevailing).

**View construction note:** `View.children` is `readonly` (`node.ts:12`) — you **cannot** assign `root.children = [...]`. Use `root.appendChild(child)` (`node.ts:32`), which links `child.parent`. Build the tree, THEN set `root.cssRules` so the `cssRulesArrived` pusher's subtree walk reaches the children and installs their appliers.

- [ ] **Step 1: Write the failing end-to-end test**:

```js
import { buildRuleSet } from "../runtime/dist/css-match.js";
import { settle } from "../runtime/dist/reactive.js";
import { View } from "../runtime/dist/view.js";

test("CSS end-to-end: a .class rule sets fill; author $set outranks it", () => {
  const root = new View();
  const child = new View();
  child.styleclass = "box";
  root.appendChild(child);                 // links child.parent = root
  root.cssRules = buildRuleSet(`.box { background-color: #2d7 }`); // pusher walks subtree → appliers
  settle();
  assert.equal(child.fill, 0x22dd77);

  // author provision outranks CSS
  const authored = new View();
  authored.styleclass = "box";
  authored.fill = 0x0000ff;                // $set
  root.appendChild(authored);
  settle();
  assert.equal(authored.fill, 0x0000ff);
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (`styleclass`/`cssRules` not attributes; `child.fill` still `null`).

- [ ] **Step 3: Implement** — in `view.ts`:

  (a) import the applier fns:
```ts
import { ensureCssApplier, cssRulesArrived, cssReparent, disposeCssApplier } from "./css-apply.js";
```
  (b) add attributes to `defineAttributes(View, {...})`:
```ts
  styleclass: { def: "" },
  id: { def: "" }, // per Task 11 gate; omit if scope-noun identity chosen
  cssRules: { def: null, prevailing: true, push: (v) => cssRulesArrived(v) },
```
  (c) in `childrenMutated` (`view.ts:288`), after the existing re-arm work, re-cascade the subtree:
```ts
    cssReparent(this);
```
  > **Trigger scope (M3 vs M4):** `childrenMutated` is called by the replication
  > path, **not** by plain `appendChild`/`insertChild` (`node.ts:32/40`). So this
  > wires re-cascade for replication-driven mutation only. Binding `cssReparent`
  > to the manual reparent path (and the reparent re-cascade test) is **deferred
  > to M4** — M3's tests set `cssRules` *after* building the tree, so the
  > `cssRulesArrived` pusher installs every applier and reparenting is not
  > exercised in M3.
  (d) in `discard` (`view.ts:383`), alongside the existing `disposeApplier(this)`, add:
```ts
    disposeCssApplier(this);
```
  (e) in `instantiate.ts` `initTree` (line 215), right after `ensureApplier(view);`, add:
```ts
  ensureCssApplier(view);
```

- [ ] **Step 4: Run to verify it passes** — `npm run build && node test/css.test.mjs`. Expected: PASS.

- [ ] **Step 5: Full suite** — `npm test`. Expected: green.

- [ ] **Step 6: Commit (both the applier module and the wiring)**

```bash
git add runtime/src/css-apply.ts runtime/src/view.ts runtime/src/instantiate.ts test/css.test.mjs
git commit -m "M3: css-apply applier + View styleclass/id/cssRules slots + install/dispose/reparent wiring"
```

### Task 15: Arbitration + inheritance integration tests

**Files:**
- Test: `test/css.test.mjs`

- [ ] **Step 1: Write tests** (no new impl — these lock in the spec's guarantees). Import `stylesheetWrite`, `stylesheetClear` from `attributes.js`:

```js
import { stylesheetWrite, stylesheetClear } from "../runtime/dist/attributes.js";

test("class-dict outranks CSS: value is the class-dict's after both channels apply", () => {
  const v = new View();
  v.styleclass = "a";
  v.cssRules = buildRuleSet(`.a { background-color: #2d7 }`);
  ensureCssApplier(v);
  settle();
  assert.equal(v.fill, 0x22dd77);          // CSS offered
  stylesheetWrite(v, "fill", 0x0000ff);    // class-dict claims it (evicts CSS mark)
  settle();
  assert.equal(v.fill, 0x0000ff);          // class-dict wins
});

test("reactive marks: class-dict RELEASE re-offers the CSS value (the probe wakes the applier)", () => {
  const v = new View();
  v.styleclass = "a";
  v.cssRules = buildRuleSet(`.a { background-color: #2d7 }`);
  ensureCssApplier(v);
  settle();
  stylesheetWrite(v, "fill", 0x0000ff);
  settle();
  assert.equal(v.fill, 0x0000ff);
  stylesheetClear(v, "fill");              // class-dict withdraws
  settle();
  assert.equal(v.fill, 0x22dd77);          // CSS re-offers via the tracked provision probe
});

test("CSS on a prevailing slot inherits to descendants via follow (no CSS parent-cache)", () => {
  const root = new View();
  root.id = "root";
  const child = new View();
  root.appendChild(child);
  root.cssRules = buildRuleSet(`#root { color: red }`);
  settle();
  assert.equal(root.textColor, 0xff0000);
  assert.equal(child.textColor, 0xff0000); // inherited by prevailing-follow
});

test("no-thrash: a stable cascade settles without exceeding the cycle guard", () => {
  const root = new View();
  const v = new View();
  v.styleclass = "a";
  root.appendChild(v);
  root.cssRules = buildRuleSet(`.a { background-color: #2d7 }`);
  assert.doesNotThrow(() => settle()); // bounded fixpoint (=== gate + cycle guard), no NeoError
  assert.equal(v.fill, 0x22dd77);
});
```

- [ ] **Step 2: Run** — `npm run build && node test/css.test.mjs`. Expected: PASS (fix any applier gating-order issue surfaced; the release-re-offer test is the load-bearing reactive-mark check).

- [ ] **Step 3: Commit**

```bash
git add test/css.test.mjs
git commit -m "M3: arbitration determinism + prevailing-follow inheritance + no-thrash tests"
```

### Task 16: Milestone review checkpoint

- [ ] **Step 1:** Run the full suite `npm test` — all green.
- [ ] **Step 2:** Add the M0 audit note to `docs/guide` (a short section: the settle → pusher → paint path and the `onScreenUpdate` seam; ordering settle phases → seam → browser rAF paint). Commit.
- [ ] **Step 3:** Request code review of M0–M3 (superpowers:requesting-code-review) over the range from the pre-M0 commit to HEAD. Address Critical/Important findings before proceeding.
- [ ] **Step 4:** Update `design-docs/css-engine-and-screen-update.md` status line to note M0–M3 landed; open the M4/M5 follow-on plan.

---

## Deferred: M4 (dynamic-semantics hardening) & M5 (formalize)

Written as a follow-on plan (`design-docs/css-engine-plan-m4-m5.md`) after M3 lands, because their tasks depend on M3's realized applier and the Task 11 gate outcome. Scope, from the spec:

- **M4:** attribute-selector (`[selected]`) toggle re-cascade; `styleclass` swap; **reparent trigger wiring** (bind `cssReparent` to the manual `appendChild`/`removeChild` path, since `childrenMutated` only fires on replication) + reparent re-cascade test; compound-selector toggles; specificity tie-break under change; `cssRules` hot-swap — each verified to settle in one frame.
- **M5:** compile-time parse of `<stylesheet>`/`.css` in the `.declare` pipeline; a checker pass (unknown W3C property; malformed value = coercer returns `undefined`; no-attr-mapping for resolvable-tag selectors); `docs/guide` styling-flow page; one migrated example.

---

## Self-review

**Spec coverage:** M0 seam (Tasks 1–2 ✓), M1 parser+matcher+cascade (Tasks 3–7 ✓), M2 coercers+mapping (Tasks 8–10 ✓), M3 marks/eviction/applier/slots/end-to-end/arbitration (Tasks 11–16 ✓). M4/M5 explicitly deferred with scope carried. Precedence, per-view inheritance, compound selectors, subclass tag, source-index tie-break, RawValue=string, malformed→skip, reactive marks, cssReparent — all have a task.

**Type consistency:** `RawValue = string` throughout; `matched(view, ruleSet): Map<string, RawValue>`; `MatchView`/`RuleSet` shapes identical across css-match tasks and css-apply; `cssMap` return `{attr, coerce}` matches its consumer in css-apply; `cssWrite`/`cssClear`/`cssMarks` names consistent between attributes.ts and css-apply.ts.

**Plan-review round 1 fixes applied:** Task 2 now triggers the throw *inside* settle (real `clean`-guard exercise) and adds phase-ordering + idle-zero tests; `!important` rejection added to Task 5; negative descendant case added to Task 6; `rgb()` clamp to Task 8; Task 9 now tests `cssMap` on a throwaway class (true green, independent of Task 10); Task 12's test asserts real eviction (no mock probe) and `cssWrite` mirrors the real sibling; Task 13 gains the **tracked provision probe** (the arbitration crux) and is committed with Task 14 (no compile-only false-green); Tasks 14/15 use `appendChild` (not the illegal `children =`) and name the `instantiate.ts:215` hook; Task 15 adds the class-dict-release-re-offers-CSS test; `summarize("css")` label; M0 docs note is Task 16 Step 2.

**Residual (acceptable) lookups:** Task 11's `#id` gate is a required human decision before M3 (recommended default: a plain `id` attribute). Task 14's `new View()` tree-building follows `test/unit.test.mjs` conventions (`new View()` + `appendChild`).
