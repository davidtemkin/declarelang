# LZX Component-Library Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the dominant `unknown-tag` oracle gap by cleaning up the accounting (skip `<doc>`/data, route language constructs to real categories) and mapping the schema-backed OL components safely, then rewrite the coverage snapshot.

**Architecture:** All changes are in `lzx/src/` (`map.ts`, `naming.ts`, `gaps.ts`) + `test/lzx.test.mjs` + `design-docs/lzx-coverage.md`. A new `routeSpecial(el, sink)` step in `mapElement` handles doc/data/language constructs *position-independently* (root AND child). Component mapping extends `TAG_TABLE` with attribute/handler dropping gated on schema introspection. Spec: `docs/plans/2026-07-21-lzx-library-mapping-design.md`.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), built via `tsc -b`; `.mjs` tests via `test/harness.mjs` (`await test(...)` / `summarize`).

## Global Constraints

- **`await` every test** — `test()` is async; `summarize("lzx")` stays at file end.
- **Two-sided anchoring:** every `TAG_TABLE` value is a real `runtime/src/schema.ts` `SCHEMAS` key OR a `library/src/*.declare` class name. A test asserts this.
- **No compiled-clean regression:** a mapped schema-backed component emits only attributes/handlers its schema has; the rest are dropped to an `unmapped-attr` gap so `check()` still passes.
- **Drop is gated on `naming.hasSchema(tag)`** (tag ∈ `SCHEMAS`). Library-class targets (Button, deferred Checkbox/…) emit attrs as-is.
- **Move-5 recategorization applies ONLY to the tag-unresolved site** (`map.ts:118-126`), not canvas-knob / unnamed-class / text-no-slot `unknown-tag` emissions.
- **Compile tests import `compile` from `compiler/dist/compile-node.js`** (auto-include host); core `compile.js` defaults to `NO_INCLUDES` and rejects library tags.
- **Verified facts:** `TextInput.text`, `Image.source`, `View`/`Image` events include `click`+lifecycle, `Animator` events `start`/`stop`/`repeat`, `NodeSchema.attrs` empty (so `node` is NOT mapped). `eventOfHandler('onClick')==='click'`, `eventsOf(schema)` walks the base chain.
- **Commit** after every green step (`git commit --no-verify` if the hook is slow).

---

## File Structure

```
lzx/src/gaps.ts     # + 9 new S13Ref union values
lzx/src/naming.ts   # + hasSchema, declaresEvent, src/resource/url→source alias, component TAG_TABLE rows
lzx/src/map.ts      # + routeSpecial (moves 0/1/3), dataset child-suppression (move 2),
                    #   attribute/handler drop (move 4), residue→library-component (move 5)
test/lzx.test.mjs   # + tests per move
design-docs/lzx-coverage.md  # rewritten snapshot (move 6)
tools/lzx-transpile.mjs      # + library-root bucket in the report
```

---

## Task 1: gaps.ts — add the 9 new S13Ref values

**Files:** Modify `lzx/src/gaps.ts`. Test: none standalone (each value is exercised by its move's task; this task just unblocks the union so those compile).

- [ ] **Step 1: Add the values to the `S13Ref` union**

In `lzx/src/gaps.ts`, extend the union (keep existing entries):

```ts
export type S13Ref =
  | "animation-choreography" | "resources-and-fonts" | "slots-placement"
  | "modules" | "constraint-timing" | "imperative-data-mutation" | "dynamic-body"
  | "datapath-xpath" | "subscription-source" | "attr-change-handler"
  | "state-form" | "typed-method" | "state-when-sugar" | "mixins" | "unknown-tag"
  | "documentation" | "dataset-body" | "event-decl" | "custom-setter" | "rpc"
  | "styling" | "script-block" | "library-component" | "unmapped-attr";
```

- [ ] **Step 2: Build** — Run: `npm run build 2>&1 | grep -iE "error TS" | head` — Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add lzx/src/gaps.ts
git commit -m "lzx(lib): add 9 S13Ref values for accounting cleanup + component mapping"
```

---

## Task 2: naming.ts — hasSchema, declaresEvent, image-source alias, component rows

**Files:** Modify `lzx/src/naming.ts`. Test: append to `test/lzx.test.mjs`.

**Interfaces produced:** `Naming.hasSchema(declareTag: string): boolean`; `Naming.declaresEvent(declareTag: string, handlerName: string): boolean`; extended `TAG_TABLE`/`ATTR_TABLE`.

- [ ] **Step 1: Write failing tests** (append before `summarize`)

```js
await test("hasSchema true for a schema tag, false for a library class", () => {
  const { naming } = buildNaming([]);
  if (!naming.hasSchema("TextInput")) throw new Error("TextInput should be schema-backed");
  if (naming.hasSchema("Button")) throw new Error("Button is a library class, not a schema");
});
await test("declaresEvent walks the base chain", () => {
  const { naming } = buildNaming([]);
  if (!naming.declaresEvent("Image", "onClick")) throw new Error("Image should inherit View's click");
  if (naming.declaresEvent("Image", "onFrobnicate")) throw new Error("no such event");
  if (!naming.declaresEvent("Animator", "onStop")) throw new Error("Animator declares stop");
});
await test("image source aliases (src/resource/url) map to source", () => {
  const { naming } = buildNaming([]);
  for (const a of ["src", "resource", "url"]) if (naming.attrFor(a) !== "source") throw new Error(a + "→" + naming.attrFor(a));
});
await test("component tags map to schema-backed Declare tags", () => {
  const { naming } = buildNaming([]);
  if (naming.tagFor("edittext") !== "TextInput") throw new Error("edittext");
  if (naming.tagFor("image") !== "Image") throw new Error("image");
  if (naming.tagFor("animatorgroup") !== "AnimatorGroup") throw new Error("animatorgroup");
  if (naming.tagFor("node") !== null) throw new Error("node must NOT be mapped (empty schema)");
});
await test("every TAG_TABLE value is a schema key or a library class (two-sided anchoring)", () => {
  const keys = new Set(Object.keys(_schemas));
  // library class names, hardcoded from library/src/*.declare (see plan)
  const libClasses = new Set(["Button","Checkbox","Radio","RadioGroup","Slider","Switch","Field","ProgressBar","Bar","FocusRing","Control"]);
  const { naming } = buildNaming([]);
  for (const lzx of ["canvas","view","text","button","simplelayout","dataset","edittext","inputtext","image","animator","animatorgroup","wrappinglayout"]) {
    const t = naming.tagFor(lzx);
    if (t && !keys.has(t) && !libClasses.has(t)) throw new Error(`${lzx}→${t} not anchored`);
  }
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | grep FAIL` — Expected: the 5 new cases FAIL (hasSchema/declaresEvent/aliases/component rows absent).

- [ ] **Step 3: Implement in `naming.ts`**

Add to the imports (top):

```ts
import { SCHEMAS, eventsOf, eventOfHandler } from "../../runtime/dist/schema.js";
```

(Replace the existing `import { SCHEMAS } from …` line — merge the named imports.)

Add the image-source aliases to `ATTR_TABLE`:

```ts
  src: "source", resource: "source", url: "source",
```

Add the component rows to `TAG_TABLE` (note: NO `node` — empty schema):

```ts
  edittext: "TextInput", inputtext: "TextInput", image: "Image",
  animator: "Animator", animatorgroup: "AnimatorGroup", wrappinglayout: "WrappingLayout",
```

Add the two methods to the `Naming` interface:

```ts
  hasSchema(declareTag: string): boolean;
  declaresEvent(declareTag: string, handlerName: string): boolean;
```

Add them to the returned `naming` object (inside `buildNaming`):

```ts
    hasSchema(declareTag) { return declareTag in SCHEMAS; },
    declaresEvent(declareTag, handlerName) {
      const sc = SCHEMAS[declareTag];
      const ev = eventOfHandler(handlerName); // string | null
      return sc !== undefined && ev !== null && eventsOf(sc).includes(ev);
    },
```

- [ ] **Step 4: Run** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | tail -3` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lzx/src/naming.ts test/lzx.test.mjs
git commit -m "lzx(lib): naming — hasSchema, declaresEvent, image-source alias, schema-backed component rows"
```

---

## Task 3: map.ts — routeSpecial (moves 0/1/3, position-independent)

**Files:** Modify `lzx/src/map.ts`. Test: append.

**Interfaces produced:** internal `routeSpecial(el, sink): "handled" | "walk" | null`, called at the top of `mapElement` (after the mixin check, before `resolveTag`).

- [ ] **Step 1: Write failing tests**

```js
await test("<doc> is skipped (not emitted, children not walked) with a documentation gap", () => {
  const r = lzxToDeclare(`<canvas><view><doc><p>hi</p><classname>Foo</classname></doc></view></canvas>`);
  if (r.gaps.some((g) => g.kind.includes("<p>") || g.kind.includes("classname"))) throw new Error("walked into doc: " + JSON.stringify(r.gaps));
  if (!r.gaps.some((g) => g.s13Ref === "documentation")) throw new Error("no documentation gap");
});
await test("language constructs route to their categories", () => {
  const cases = [["include", "modules"], ["event", "event-decl"], ["setter", "custom-setter"], ["remotecall", "rpc"], ["param", "rpc"], ["stylesheet", "styling"], ["script", "script-block"]];
  for (const [tag, ref] of cases) {
    const r = lzxToDeclare(`<canvas><view><${tag}/></view></canvas>`);
    if (!r.gaps.some((g) => g.s13Ref === ref)) throw new Error(`<${tag}> should → ${ref}; got ${JSON.stringify(r.gaps.map(g=>g.s13Ref))}`);
  }
});
await test("<library> ROOT routes to modules and its classes are still walked (not dropped)", () => {
  const r = lzxToDeclare(`<library><class name="myThing" extends="view"/></library>`);
  if (!r.gaps.some((g) => g.s13Ref === "modules")) throw new Error("no modules gap for library root");
  // declare is null (no App) but no unknown-tag gap for <library> itself
  if (r.gaps.some((g) => g.s13Ref === "unknown-tag" && g.kind.includes("library"))) throw new Error("library should not be unknown-tag");
});
await test("a <param> inside <doc> is documentation, not rpc (ordering)", () => {
  const r = lzxToDeclare(`<canvas><view><doc><param>x</param></doc></view></canvas>`);
  if (r.gaps.some((g) => g.s13Ref === "rpc")) throw new Error("doc param leaked to rpc");
  if (!r.gaps.some((g) => g.s13Ref === "documentation")) throw new Error("no documentation gap");
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | grep FAIL` — Expected: the 4 new cases FAIL.

- [ ] **Step 3: Implement** — add `routeSpecial` and wire it into `mapElement`.

Add the routing table + function near the top of `map.ts` (after imports):

```ts
import type { Severity, S13Ref } from "./gaps.js";

// Position-independent routing for LZX constructs that are NOT UI components:
// documentation prose and language constructs. Runs in mapElement (before
// resolveTag) so it fires at ROOT (e.g. <library>) and child position alike.
const SPECIAL: Record<string, { ref: S13Ref; sev: Severity; note: string; walk?: true }> = {
  doc:        { ref: "documentation", sev: "info",     note: "documentation prose" },
  include:    { ref: "modules",       sev: "degraded", note: "<include> module directive" },
  import:     { ref: "modules",       sev: "degraded", note: "<import> module directive" },
  library:    { ref: "modules",       sev: "degraded", note: "<library> module root", walk: true },
  event:      { ref: "event-decl",    sev: "degraded", note: "<event> declaration" },
  setter:     { ref: "custom-setter", sev: "degraded", note: "<setter>" },
  remotecall: { ref: "rpc",           sev: "degraded", note: "<remotecall>" },
  rpc:        { ref: "rpc",           sev: "degraded", note: "<rpc>" },
  param:      { ref: "rpc",           sev: "degraded", note: "<param> RPC argument" },
  stylesheet: { ref: "styling",       sev: "degraded", note: "<stylesheet>" },
  script:     { ref: "script-block",  sev: "degraded", note: "<script> block" },
};

function routeSpecial(el: LzxNode, sink: GapSink): "handled" | "walk" | null {
  const s = SPECIAL[el.tag.toLowerCase()];
  if (!s) return null;
  sink.add({ kind: s.note, severity: s.sev, s13Ref: s.ref, pos: el.pos, note: s.note });
  return s.walk ? "walk" : "handled";
}
```

Wire into `mapElement` — insert immediately after the mixin/`with` check, before `const tag = resolveTag(...)`:

```ts
  const special = routeSpecial(el, sink);
  if (special === "handled") return null;
  if (special === "walk") { mapMembers(el, el.tag, naming, sink, classes); return null; }
```

- [ ] **Step 4: Run** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | tail -3` — Expected: all pass. (The `<doc>` children aren't walked because `routeSpecial` returns `"handled"` before `mapMembers`.)

- [ ] **Step 5: Commit**

```bash
git add lzx/src/map.ts test/lzx.test.mjs
git commit -m "lzx(lib): routeSpecial — skip <doc>, route language constructs, walk <library> root (position-independent)"
```

---

## Task 4: map.ts — suppress `<dataset>` child recursion (move 2)

**Files:** Modify `lzx/src/map.ts`. Test: append.

- [ ] **Step 1: Write failing test**

```js
await test("<dataset> maps to Dataset; its data children are NOT walked", () => {
  const r = lzxToDeclare(`<canvas><dataset name="d"><item><day>Mon</day></item></dataset></canvas>`);
  // no per-row unknown-tag/library-component gaps for item/day
  if (r.gaps.some((g) => g.kind.includes("item") || g.kind.includes("day"))) throw new Error("walked dataset data: " + JSON.stringify(r.gaps));
  if (!r.gaps.some((g) => g.s13Ref === "dataset-body")) throw new Error("no dataset-body gap");
  if (!/Dataset/.test(r.declare ?? "")) throw new Error("Dataset not emitted: " + r.declare);
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | grep FAIL` — Expected: FAIL (item/day walked, no dataset-body gap).

- [ ] **Step 3: Implement** — in `mapMembers`, guard the children loop for `Dataset`. At the very top of `mapMembers`' `for (const c of el.children)` block, add a short-circuit; and record the gap once. Insert just before the `for (const c of el.children) {` loop:

```ts
  if (tag === "Dataset") {
    sink.add({ kind: "<dataset> body", severity: "degraded", s13Ref: "dataset-body", pos: el.pos, note: "XML data body not converted to JSON (deferred)" });
    return { attrs, decls, methods, children }; // attrs already mapped above; skip data children
  }
```

(Place this AFTER the attribute loop that fills `attrs`, and BEFORE the `for (const c of el.children)` loop, so the dataset's own attributes like `name`/`src` are still processed but its data children are not.)

- [ ] **Step 4: Run** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | tail -3` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lzx/src/map.ts test/lzx.test.mjs
git commit -m "lzx(lib): suppress <dataset> child recursion (data is not components)"
```

---

## Task 5: map.ts — attribute + handler dropping for schema-backed tags (move 4)

**Files:** Modify `lzx/src/map.ts`. Test: append.

- [ ] **Step 1: Write failing tests** (the test file already imports `compile` from `compiler/dist/compile-node.js` — Phase-1 Task 7 — so reuse it; do NOT add a second import)

```js
await test("mapped edittext keeps schema attrs, drops unknown, compiles clean", () => {
  const r = lzxToDeclare(`<canvas><edittext text="hi" width="200" enabled="false"/></canvas>`);
  if (!/TextInput \[/.test(r.declare)) throw new Error("no TextInput: " + r.declare);
  if (!/text = "hi"/.test(r.declare) || !/width = 200/.test(r.declare)) throw new Error("dropped a schema attr: " + r.declare);
  if (/enabled/.test(r.declare)) throw new Error("enabled should be dropped: " + r.declare);
  if (!r.gaps.some((g) => g.s13Ref === "unmapped-attr")) throw new Error("no unmapped-attr gap");
  const c = compile(r.declare, { typecheck: false });
  if (c.errors.length) throw new Error("compile errors:\n" + c.report);
});
await test("mapped image keeps source via alias and compiles clean", () => {
  const r = lzxToDeclare(`<canvas><image src="a.png" width="64"/></canvas>`);
  if (!/source = "a.png"/.test(r.declare)) throw new Error("source dropped: " + r.declare);
  const c = compile(r.declare, { typecheck: false });
  if (c.errors.length) throw new Error("compile errors:\n" + c.report);
});
await test("a handler for an undeclared event on a schema tag is dropped", () => {
  const r = lzxToDeclare(`<canvas><image onclick="go()" onfrobnicate="x()"/></canvas>`);
  if (!/onClick\(\)/.test(r.declare)) throw new Error("onclick (valid) should be kept: " + r.declare);
  if (/onFrobnicate/.test(r.declare)) throw new Error("onfrobnicate (undeclared) should be dropped: " + r.declare);
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | grep FAIL` — Expected: FAIL (enabled/onfrobnicate currently emitted → compile errors).

- [ ] **Step 3: Implement** — in `mapMembers`' attribute loop, gate on `hasSchema`.

Replace the on-handler branch's `methods.push` line and the final `attrs.push` with drop-aware versions. The handler branch becomes:

```ts
    if (/^on[A-Za-z]/.test(a.name)) {
      if (isAttrChangeHandler(a.name, tag, naming)) { sink.add({ kind: `${a.name} change handler`, severity: "degraded", s13Ref: "attr-change-handler", pos: a.pos, note: "LZX attribute-change events map to reactive constraints, not handlers" }); continue; }
      const ev = onName(a.name, naming);
      if (naming.hasSchema(tag) && !naming.declaresEvent(tag, ev)) { sink.add({ kind: `${tag}.${ev} unmapped event`, severity: "degraded", s13Ref: "unmapped-attr", pos: a.pos, note: "handler for an event the schema does not declare" }); continue; }
      methods.push({ name: ev, params: [], body: a.value }); continue;
    }
```

The final attribute line becomes:

```ts
    const name = naming.attrFor(a.name);
    const kind = naming.attrTypeFor(tag, name);
    if (naming.hasSchema(tag) && kind === "unknown") { sink.add({ kind: `${tag}.${name} unmapped`, severity: "degraded", s13Ref: "unmapped-attr", pos: a.pos, note: "attribute has no slot on the mapped schema" }); continue; }
    attrs.push({ name, value: mapValue(a.value, kind, a.pos, sink) });
```

- [ ] **Step 4: Run** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | tail -3` — Expected: all pass. (If a prior Phase-1 test regresses because a schema-backed tag now drops an attr it shouldn't, check that `attrFor` aliases it first — only genuinely-absent attrs should drop.)

- [ ] **Step 5: Commit**

```bash
git add lzx/src/map.ts test/lzx.test.mjs
git commit -m "lzx(lib): attribute + handler dropping for schema-backed mapped components (no compiled-clean regression)"
```

---

## Task 6: map.ts — residue → library-component (move 5, scoped)

**Files:** Modify `lzx/src/map.ts`. Test: append.

- [ ] **Step 1: Write failing tests**

```js
await test("an unmapped component tag is library-component, not unknown-tag", () => {
  const r = lzxToDeclare(`<canvas><window title="x"/></canvas>`);
  if (!r.gaps.some((g) => g.s13Ref === "library-component")) throw new Error("no library-component gap");
  if (r.gaps.some((g) => g.s13Ref === "unknown-tag" && g.kind.includes("window"))) throw new Error("window should be library-component: " + JSON.stringify(r.gaps));
});
await test("a canvas knob stays its own gap, NOT library-component", () => {
  const r = lzxToDeclare(`<canvas debug="true" width="100"/>`);
  if (r.gaps.some((g) => g.s13Ref === "library-component")) throw new Error("knob wrongly recategorized: " + JSON.stringify(r.gaps));
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | grep FAIL` — Expected: FAIL (window currently `unknown-tag`).

- [ ] **Step 3: Implement** — change ONLY the tag-unresolved branch of `mapElement` (map.ts:120) to emit `library-component`:

```ts
    sink.add({ kind: `unmapped component <${el.tag}>`, severity: "degraded", s13Ref: "library-component", pos: el.pos, note: `OL component <${el.tag}> has no Declare equivalent` });
```

(Leave the canvas-knob, unnamed-`<class>`/`<attribute>`, and text-no-slot `sink.add(... s13Ref: "unknown-tag" ...)` sites in `mapMembers` unchanged — they are not components.)

- [ ] **Step 4: Run** — Run: `npm run build && node test/lzx.test.mjs 2>&1 | tail -3` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lzx/src/map.ts test/lzx.test.mjs
git commit -m "lzx(lib): residue → library-component (scoped to the tag-unresolved site)"
```

---

## Task 7: full-corpus sweep + coverage report rewrite

**Files:** Modify `tools/lzx-transpile.mjs` (library-root bucket), rewrite `design-docs/lzx-coverage.md`.

- [ ] **Step 1: Add a library-root bucket to the report.** In `tools/lzx-transpile.mjs` `sweep()`, count files whose source root is `<library>` separately (a `.lzx` whose first non-prolog tag is `library`). Add to the returned object:

```js
  const libraryRoots = files.filter((f) => /^\s*(?:<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|\s)*<library\b/i.test(readFileSync(f, "utf8"))).length;
```

and include `libraryRoots` in the return + print it in `main` (`console.log(\`library-root (class-only): ${s.libraryRoots}\`)`).

- [ ] **Step 2: Run the full sweep** — Run: `node tools/lzx-transpile.mjs /Users/maxcarlsonold/openlaszlo-5.0 --compile --report` — Expected: a new ranked table; `unknown-tag` collapsed, `documentation`/`dataset-body`/`modules`/`library-component` carrying the redistributed weight. Capture the numbers.

- [ ] **Step 2b: ASSERT no compiled-clean regression** (the spec's key invariant — a hard check, not an eyeball). Run:

```bash
node -e 'import("./tools/lzx-transpile.mjs").then(m=>{const s=m.sweep("/Users/maxcarlsonold/openlaszlo-5.0",{compile:true}); const BASE=408; console.log("compiled-clean:",s.compiledClean,"baseline:",BASE); if(s.compiledClean < BASE){console.error("REGRESSION: compiled-clean dropped below baseline"); process.exit(1);} console.log("OK — no regression");})'
```
Expected: `OK — no regression` and exit 0. If it exits 1, a mapped component is failing `check()` — fix the drop/alias (do not lower the baseline).

- [ ] **Step 3: Rewrite `design-docs/lzx-coverage.md`** with the new distribution (headline transpiled/compiled-clean, library-root count, the ranked gap table with `library-component` now the honest top signal, and a one-line note that `unknown-tag` now means only genuine strays).

- [ ] **Step 4: Run the lzx test suite** — Run: `node test/lzx.test.mjs 2>&1 | tail -1` — Expected: all pass (no regressions from Phase 1).

- [ ] **Step 5: Commit**

```bash
git add tools/lzx-transpile.mjs design-docs/lzx-coverage.md
git commit -m "lzx(lib): full-corpus sweep + rewritten coverage snapshot (unknown-tag corrected)"
```

---

## Self-Review

**Spec coverage:**
- Move 0 (routeSpecial position-independent) → Task 3. ✓
- Move 1 (`<doc>` skip) → Task 3. ✓
- Move 2 (dataset child suppression) → Task 4. ✓
- Move 3 (language constructs → categories) → Task 3. ✓
- Move 4 (schema-backed component mapping + attr/handler drop + image alias + node excluded + two-sided anchoring) → Tasks 2 (naming/aliases/rows/anchoring test) + 5 (drop logic). ✓
- Move 5 (residue → library-component, scoped) → Task 6. ✓
- 9 new S13Ref values → Task 1. ✓
- `hasSchema`/`declaresEvent`/`eventsOf`/`eventOfHandler` → Task 2. ✓
- Library-root metric bucket → Task 7. ✓
- Coverage report rewrite → Task 7. ✓
- Deferred (script/stylesheet/setter translation, dataset JSON, library-class input components) → out of plan, per spec. ✓

**Placeholder scan:** No TBD/vague steps; each code step shows the exact edit. Task 1 has no standalone test by design (enum values are exercised by their producing move) — noted.

**Type consistency:** `Naming.hasSchema`/`declaresEvent` (Task 2) used in Task 5; `S13Ref` values (Task 1) used across 3–6; `routeSpecial` return type `"handled"|"walk"|null` consistent in Task 3. `SPECIAL` table typed `Record<string, {ref: S13Ref; sev: Severity; note: string; walk?: true}>` — imports `Severity`/`S13Ref` from `./gaps.js`.

**Risk note (flagged):** Task 5 gates drop on `hasSchema(tag)`, which includes `App`/`View`/`Text` — verified `View` declares the full common event set and `attrFor` aliases known renames first, so only genuinely-absent attrs/events drop; Phase-1 tests (whose attrs/handlers are all valid) do not regress. If any Phase-1 test fails at Task 5 Step 4, the cause is a missing `ATTR_TABLE` alias — add it, don't weaken the gate.
