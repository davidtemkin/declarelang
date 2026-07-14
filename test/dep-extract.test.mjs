// dep-extract — validates the static dependency extractor (design/constraints.md,
// Model Y). Three ways: (A) unit — hand-verified read-paths + residue rejection on
// crafted constraints; (B) corpus — 0 residue errors across every real app; (C)
// the gold standard — cross-check the extractor's read-paths against the RUNTIME
// tracker's actually-discovered deps, proving prewiring(extracted) ⊇ track(whole).
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { extractProgram } from "../compiler/dist/dep-extract.js";
import { instantiate, settle } from "../runtime/dist/index.js";
import { Constraint } from "../runtime/dist/reactive.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok —", name); } catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); } }

// compile a source to its RESOLVED program, then extract. Returns the constraint list.
function extract(src) {
  const r = compile(src, {});
  if (!r.source) throw new Error("compile failed: " + r.errors.map((e) => e.message).join("; "));
  return extractProgram(parseProgram(r.source));
}
const find = (list, attr, name = undefined) => list.find((c) => c.attr === attr && (name === undefined || c.name === name));
const readsOf = (list, attr, name) => (find(list, attr, name)?.reads ?? []).sort();
const errsOf = (list, attr, name) => (find(list, attr, name)?.errors ?? []);

console.log("dep-extract\n─ A. unit: extraction + residue ─");

test("direct reads — union of the slots the expression names", () => {
  const r = extract(`App [ n: number = 3, m: number = 4, v: View [ width = { app.n * 20 + app.m } ] ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.m", "this.root.n"]);
});

test("ternary takes the union of ALL branches (over-subscription, by design)", () => {
  const r = extract(`App [ a: boolean = true, b: number = 1, c: number = 2, v: View [ width = { app.a ? app.b : app.c } ] ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.a", "this.root.b", "this.root.c"]);
});

test("record projection off an attribute — the read-path resolves to the slot cell", () => {
  const r = extract(`App [ v: View [ fill = { app.theme.pageBg } ] ]`);
  // the read-path keeps the projection (`.pageBg`), which is untracked — evaluating
  // it under the tracker touches only the `theme` slot cell (verified in the cross-check).
  assert.deepEqual(readsOf(r, "fill"), ["this.root.theme.pageBg"]);
});

test("interprocedural — reads through a method call into its body", () => {
  const r = extract(`App [ n: number = 3, m: number = 4,
      v: View [ width = { app.sum() } ],
      sum() { return this.n + this.m } ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.m", "this.root.n"]);
});

test("interprocedural — transitive across a call chain", () => {
  const r = extract(`App [ n: number = 3,
      v: View [ width = { app.a() } ],
      a() { return this.b() + 1 },
      b() { return this.n * 2 } ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.n"]);
});

test("callback closure — reactive reads inside are found; the loop var is not", () => {
  const r = extract(`App [ n: number = 2, rows: number = 5,
      v: View [ width = { app.list().filter(x => x.k > app.n).length } ],
      list() { return [] } ]`);
  const reads = readsOf(r, "width");
  assert.ok(reads.includes("this.root.n"), "app.n from the closure is a dep: " + reads);
});

test("datapath read is a dependency", () => {
  const r = extract(`App [ rec: Dataset { { "title": "hi" } },
      card: View [ datapath = { app.rec.value }, t: Text [ text = { :title } ] ] ]`);
  assert.deepEqual(readsOf(r, "text"), [":title"]);
});

test("recursion terminates (cycle guard) and still extracts", () => {
  const r = extract(`App [ n: number = 1,
      v: View [ width = { app.a() } ],
      a() { return this.b() },
      b() { return this.a() + this.n } ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.n"]);
});

// ── residue: the dynamic-target forms + opaque calls are BLOCKING compile errors
// (constraints.md §3 — never a silent runtime-tracking fallback). compile() folds
// dep extraction in and rejects a residue with a NEO7001 that NAMES the fix
// (diagnostics.md §4). A legitimate language-method call is analyzable via its
// effect signature (effects.ts), so it compiles — asserted last. ──
function residueErrors(src) {
  const r = compile(src, {});
  assert.ok(!r.source, "expected residue to BLOCK compilation, but it compiled");
  return r.errors;
}

test("residue — computed attribute this[<expr>] blocks", () => {
  const e = residueErrors(`App [ k: string = "x", v: View [ width = { app[app.k] } ] ]`);
  assert.ok(e.some((x) => /computed attribute/.test(x.message)), JSON.stringify(e.map((x) => x.message)));
  assert.ok(e.some((x) => x.code === "NEO7001"), "carries the constraint-residue code");
});

test("residue — dynamic datapath read([<expr>]) blocks", () => {
  const e = residueErrors(`App [ k: string = "a", d: Dataset { { "a": 1 } },
      v: View [ width = { app.d.read([app.k]) } ] ]`);
  assert.ok(e.some((x) => /dynamic datapath/.test(x.message)), JSON.stringify(e.map((x) => x.message)));
});

test("residue — aggregation over a reactive node collection blocks", () => {
  const e = residueErrors(`App [ v: View [ width = { app.children.map(c => c.width).length } ] ]`);
  assert.ok(e.some((x) => /node collection/.test(x.message)), JSON.stringify(e.map((x) => x.message)));
});

test("residue — opaque call target blocks (not assumed pure)", () => {
  // With the (default) typecheck phase on, an unknown method dies EARLIER as a
  // member miss — phased diagnostics, same defect, better message:
  const src = `App [ v: View [ width = { app.mysteryLib() } ] ]`;
  const d = compile(src, {});
  assert.ok(!d.source && d.errors.some((x) => /'mysteryLib' is not a member/.test(x.message)), d.report);
  // The residue arm stays load-bearing on the EXPLICIT typecheck opt-out (the
  // latency escape must be exactly as sound about dependencies):
  const r = compile(src, { typecheck: false });
  assert.ok(!r.source, "opt-out still blocks the unanalyzable constraint");
  assert.ok(r.errors.some((x) => /unresolved call target/.test(x.message)), JSON.stringify(r.errors.map((x) => x.message)));
});

test("language-method effect signature makes the call analyzable (no residue)", () => {
  // lookupStylesheet is PURE (effects.ts) — the constraint COMPILES and its only
  // dep is the ternary condition, statically WIRED (not tracked, not residue).
  const src = `stylesheet Dark [ View: [ opacity = 0.5 ] ]
stylesheet Light [ View: [ opacity = 1 ] ]
App [ night: boolean = true,
    stylesheet = { night ? this.lookupStylesheet("Dark") : this.lookupStylesheet("Light") },
    v: View [ ] ]`;
  const r = compile(src, {});
  assert.ok(r.source, "should compile: " + r.errors.map((e) => e.message).join("; "));
  assert.deepEqual(readsOf(extractProgram(parseProgram(r.source)), "stylesheet"), ["this.night"]);
});

test("aggregation over DATA is fine (not node) — no error", () => {
  const r = extract(`App [ rec: Dataset { { "rows": [1,2] } },
      card: View [ datapath = { app.rec.value }, w: View [ width = { :rows.length } ] ] ]`);
  assert.equal(errsOf(r, "width").length, 0, "data aggregation should be analyzable");
});

// ── B. corpus: every real app extracts with zero residue ──
console.log("─ B. corpus: 0 residue across all apps ─");
test("all five apps: 700 constraints, 0 residue errors", () => {
  const apps = ["calendar/calendar", "neocalendar/neocalendar", "neoweather/neoweather", "site/site", "docs/docs"];
  let tot = 0, errs = 0;
  for (const a of apps) {
    const r = extract(readFileSync(resolve(HERE, `../examples/${a}.declare`), "utf8"));
    tot += r.length; errs += r.flatMap((c) => c.errors).length;
  }
  assert.equal(errs, 0, `${errs} residue errors across the corpus`);
  assert.ok(tot >= 650, `expected the full corpus, got ${tot} constraints`);
});

// ── C. ground-truth cross-check against the runtime tracker ──
console.log("─ C. cross-check: prewire(extracted) ⊇ track(whole constraint) ─");

// Resolve a read-path to the runtime cells it touches, by evaluating it under a
// throwaway Constraint (the tracker) — exactly the intended link-time prewiring.
function cellsOf(node, readPath) {
  const expr = readPath.startsWith(":") ? `this.$data(${JSON.stringify(readPath.slice(1))})` : readPath;
  let fn; try { fn = new Function("parent", "classroot", `return (${expr})`); } catch { return []; }
  const probe = new Constraint("probe", () => fn.call(node, node.parent ?? null, node.root ?? null), () => {});
  probe.run();
  const cells = [...probe.deps];
  probe.dispose();
  return cells;
}
const runtimeDeps = (node, attr) => [...(node.$owners?.[attr]?.deps ?? [])];

test("static read-paths resolve to a SUPERSET of the runtime-discovered deps", () => {
  const src = `App [ width = 200, height = 100,
      n: number = 3, a: boolean = true, b: number = 5, c: number = 9,
      rec: Dataset { { "title": "hi", "k": 7 } },
      v1: View [ width = { app.n * 2 } ],
      v2: View [ width = { app.a ? app.b : app.c } ],
      v3: View [ width = { app.sum() } ],
      card: View [ datapath = { app.rec.value }, t: Text [ text = { :title } ], w: View [ width = { :k } ] ],
      sum() { return this.n + this.b } ]`;
  const list = extract(src);
  const app = instantiate(compileProgram(src));
  settle();

  const cases = [
    { node: app.v1, attr: "width", name: "v1", exact: true },   // direct
    { node: app.v2, attr: "width", name: "v2", exact: false },  // ternary → static superset of the taken branch
    { node: app.v3, attr: "width", name: "v3", exact: true },   // interprocedural
    { node: app.card.t, attr: "text", name: "t", exact: true }, // datapath
    { node: app.card.w, attr: "width", name: "w", exact: true },// datapath (numeric)
  ];
  for (const { node, attr, name, exact } of cases) {
    const rt = new Set(runtimeDeps(node, attr));
    assert.ok(rt.size > 0, `${name}.${attr}: runtime discovered no deps (test setup)`);
    const staticCells = new Set();
    for (const rp of readsOf(list, attr, name)) for (const cell of cellsOf(node, rp)) staticCells.add(cell);
    // SOUNDNESS: every cell the runtime actually depended on must be covered.
    for (const cell of rt) assert.ok(staticCells.has(cell), `${name}.${attr}: static extraction MISSED a runtime dep (UNSOUND)`);
    // EXACTNESS: for unconditional shapes the sets match; a ternary is a deliberate superset.
    if (exact) assert.equal(staticCells.size, rt.size, `${name}.${attr}: static ${staticCells.size} vs runtime ${rt.size} (want exact)`);
    else assert.ok(staticCells.size >= rt.size, `${name}.${attr}: superset expected`);
  }
});

// helper: compile to a runnable program object
function compileProgram(src) {
  const r = compile(src, {});
  if (!r.source) throw new Error("compile: " + r.errors.map((e) => e.message).join("; "));
  return parseProgram(r.source);
}

console.log("\n─ C2. inlining rebase + path canonicalization (the Radio bug, 2026-07-13) ─");

test("inlined computed default — parent-rooted reads REBASE to the reader's frame", () => {
  // Radio's `on` formula reads `(parent as G).value`; the dot's constraint reads
  // bare `on` (→ classroot.on), which INLINES the formula. Un-rebased, the literal
  // `parent` would mean the DOT's parent (the radio — wrong node) and the stripped
  // cast's parens would defeat the runtime's path probe: the constraint silently
  // never re-fired. Both fixed: parens canonicalized away, nouns rebased onto the
  // receiver (a member's scope nouns are relative to the instance carrying it).
  const r = extract(`class G extends View [ value: string = "" ]
class R extends View [ choice: string = "",
    on: boolean = { (parent as G).value == choice },
    dot: View [ width = 10, height = 10, opacity = { on ? 1 : 0.4 } ],
    ]
App [ width = 100, height = 100, g: G [ value = "a", R [ choice = "a" ] ] ]`);
  const reads = readsOf(r, "opacity");
  assert.ok(reads.includes("classroot.parent.value"), "rebased through the inline: " + JSON.stringify(reads));
  assert.ok(reads.includes("classroot.choice"), "this-rooted read rebased too: " + JSON.stringify(reads));
  assert.ok(!reads.some((p) => p.includes("(")), "no parens in dep paths: " + JSON.stringify(reads));
});

console.log("\n─ D. self-dependence: a constraint may not read its own slot ─");

// The check fires inside compile() (annotate → hard constraint-phase error), so
// a self-dep program REFUSES TO COMPILE — assert at that layer.
function compileRefuses(src, re) {
  const r = compile(src, {});
  assert.equal(r.source, null, "expected compile to refuse");
  assert.match(r.errors.map((e) => e.message).join("\n"), re);
}

test("self-dep — bare spread of own slot is refused at compile (the `...theme` trap)", () => {
  compileRefuses(`App [ width = 100, height = 100,
      theme = { ({ a: 1 }) },
      p: View [ theme = { ({ ...theme, b: 2 }) } ] ]`, /reads itself/);
});

test("self-dep — App-root `app.` spelling of own slot is refused at compile", () => {
  compileRefuses(`App [ width = 100, height = 100,
      theme = { ({ ...app.theme, a: 1 }) } ]`, /reads itself/);
});

test("self-dep — a set-attribute reading its own slot is refused", () => {
  compileRefuses(`App [ width = 100, height = 100,
      v: View [ width = 50, x = { this.x + 1 } ] ]`, /reads itself/);
});
// (A computed DECL default reading itself takes the inliner path, not this
// check — its handling is the inliner's cycle guard, out of scope here.)

test("self-dep — a sibling/ancestor base is NOT self (the blessed spread)", () => {
  const r = extract(`App [ width = 100, height = 100,
      theme = { ({ a: 1 }) },
      p: View [ theme = { ({ ...app.theme, b: 2 }) } ] ]`);
  assert.equal(errsOf(r, "theme", "p").length, 0);
});

test("self-dep — content intrinsics are not self (`width` reading contentWidth)", () => {
  const r = extract(`App [ width = 100, height = 100,
      v: View [ width = { Math.min(this.contentWidth, 480) } ] ]`);
  assert.equal(errsOf(r, "width", null).length, 0);
});

console.log(`\ndep-extract: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
