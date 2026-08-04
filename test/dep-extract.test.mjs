// dep-extract — validates the static dependency extractor (docs/system-design/constraints.md,
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
import { extractProgram, annotateProgram } from "../compiler/dist/dep-extract.js";
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
// dep extraction in and rejects a residue with a DECLARE7001 that NAMES the fix
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
  assert.ok(e.some((x) => x.code === "DECLARE7001"), "carries the constraint-residue code");
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

// ── A2. `script { }` free functions are the FOURTH analyzable callee kind ──
//
// A script block is module scope: no receiver, no scope nouns. So a script
// function's only door to reactive state is its PARAMETERS, and following one
// means rebasing each read through a parameter onto the path the call site
// passed. Before this, a script call was simply not followed, and a constraint
// that ALSO named a slot directly got PARTIAL deps — statically wired to the
// reads it happened to see, permanently stale on the one it dropped. Silent, and
// worse than the error it replaced.
console.log("\n─ A2. script { } functions: the fourth analyzable callee kind ─");

/** Compile, annotate, instantiate — then move a slot and report whether the
 *  constraint actually re-ran. The extractor can only be trusted about a
 *  dependency if the running program agrees. */
function rerendersOn(src, mutate, read) {
  const r = compile(src, {});
  assert.ok(r.source, "should compile: " + r.errors.map((e) => e.message).join("; "));
  const prog = parseProgram(r.source);
  annotateProgram(prog);
  const app = instantiate(prog, true);
  settle();
  const before = read(app);
  mutate(app);
  settle();
  return { before, after: read(app) };
}

test("a script call's reads are followed and rebased onto the call-site argument", () => {
  const r = extract(`script { function vOf(node: any) { return node.v } }
App [ v: number = 10, w: number = 2, b: View [ width = { vOf(app) + app.w } ] ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.v", "this.root.w"]);
});

test("REGRESSION: a script helper's dependency re-renders — no partial deps", () => {
  // The exact hole phase 4 closes. `vOf(app)` reads app.v inside the script body
  // while `app.w` is named directly: the constraint used to wire ONLY `w`, so
  // `app.v = 50` moved nothing. Both the extracted set and the LIVE program are
  // asserted, because a dep list that is right on paper and dead at runtime is
  // the failure being fixed.
  const src = `script { function vOf(node: any) { return node.v } }
App [ v: number = 10, w: number = 2, b: View [ width = { vOf(app) + app.w } ] ]`;
  const { before, after } = rerendersOn(src, (app) => { app.v = 50; }, (app) => app.b.width);
  assert.equal(before, 12, "10 + 2");
  assert.equal(after, 52, "app.v = 50 must re-run the constraint (was STALE at 12)");
});

test("a script helper reached through `this` rebases onto the owning node", () => {
  const src = `script { function twice(node: any) { return node.n * 2 } }
App [ w: number = 3, b: View [ n: number = 10, width = { twice(this) + app.w } ] ]`;
  assert.deepEqual(readsOf(extract(src), "width"), ["this.n", "this.root.w"]);
  const { before, after } = rerendersOn(src, (app) => { app.b.n = 50; }, (app) => app.b.width);
  assert.equal(before, 23);
  assert.equal(after, 103);
});

test("a script helper over plain VALUES stays analyzable (nothing to rebase)", () => {
  // The common case must not be refused: the arguments' own reads are recorded at
  // the call site, and arithmetic on a parameter can't hide an attribute read.
  const r = extract(`script { function pick(a: number, b: number) { return a > b ? a : b } }
App [ v: number = 10, w: number = 3, b: View [ width = { pick(app.v, app.w) } ] ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.v", "this.root.w"]);
});

test("script calls compose — through a method, and script-to-script", () => {
  const r = extract(`script {
  function inner(node: any) { return node.v }
  function outer(node: any) { return inner(node) + 1 }
}
App [ v: number = 10, b: View [ width = { app.calc() } ], calc() { return outer(app) } ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.v"]);
});

test("refused — a script body reading MUTABLE module state", () => {
  // A module `let` has no cell, so neither prewiring nor runtime tracking could
  // ever notice it move: unrepresentable, and refused rather than wired to nothing.
  const e = residueErrors(`script { let bias = 5
function biased(n: number) { return n + bias } }
App [ v: number = 10, b: View [ width = { biased(app.v) } ] ]`);
  assert.ok(e.some((x) => /mutable state in a script/.test(x.message)), JSON.stringify(e.map((x) => x.message)));
});

test("a script body reading a module CONST is fine (a frozen constant)", () => {
  const r = extract(`script { const SCALE = 3
function scaled(n: number) { return n * SCALE } }
App [ v: number = 10, b: View [ width = { scaled(app.v) } ] ]`);
  assert.deepEqual(readsOf(r, "width"), ["this.root.v"]);
  assert.equal(errsOf(r, "width").length, 0);
});

test("refused — an argument that is not a nameable path, where it is read through", () => {
  const e = residueErrors(`script { function vOf(node: any) { return node.v } }
App [ v: number = 10, b: View [ width = { vOf(app.pick()) } ], pick() { return app } ]`);
  assert.ok(e.some((x) => /not a nameable path/.test(x.message)), JSON.stringify(e.map((x) => x.message)));
});

test("refused — a parameter that ESCAPES into a local (the aliasing trap)", () => {
  // `const m = node; return m.v` extracts clean and goes stale — the read roots at
  // a name the call site never wrote.
  const e = residueErrors(`script { function vOf(node: any) { const m = node
  return m.v } }
App [ v: number = 10, w: number = 2, b: View [ width = { vOf(app) + app.w } ] ]`);
  assert.ok(e.some((x) => /parameter escape/.test(x.message)), JSON.stringify(e.map((x) => x.message)));
});

test("refused — a script function PASSED as a value, when it reads through a parameter", () => {
  const e = residueErrors(`script { function vOf(node: any) { return node.v } }
App [ v: number = 10, b: View [ width = { [app].map(vOf).length } ] ]`);
  assert.ok(e.some((x) => /passed as a value/.test(x.message)), JSON.stringify(e.map((x) => x.message)));
});

test("WIRED — reading through a result that may be a parameter handed back", () => {
  // Was refused, on the reasoning that "which node came back is not knowable
  // here". It is knowable — not which ONE, but the finite set the call site
  // passed — so both candidates are wired, the same over-approximation a
  // conditional's arms already get. An extra dependency costs a recomputation;
  // the refusal cost correct code. (Changed 2026-08-03 with findings §A1.)
  const r = extract(`script { function pick(a: any, b: any) { return a.n > b.n ? a : b } }
App [ cardA: View [ n: number = 1, label: string = "a" ], cardB: View [ n: number = 2, label: string = "b" ],
  b: Text [ text = { pick(app.cardA, app.cardB).label } ] ]`);
  assert.equal(errsOf(r, "text").length, 0, JSON.stringify(errsOf(r, "text")));
  const deps = readsOf(r, "text");
  assert.ok(deps.includes("this.root.cardA.label") && deps.includes("this.root.cardB.label"),
    `expected BOTH candidates; got ${JSON.stringify(deps)}`);
});

test("a script function that returns a parameter is fine when the result is NOT projected", () => {
  const r = extract(`script { function pick(a: number, b: number) { return a > b ? a : b } }
App [ v: number = 4, w: number = 9, b: View [ width = { pick(app.v, app.w) } ] ]`);
  assert.equal(errsOf(r, "width").length, 0, JSON.stringify(errsOf(r, "width")));
});

test("refused — `new` of a script CLASS (its constructor's reads are invisible)", () => {
  // Checked on the typecheck opt-out, as the opaque-call residue above is: with
  // the type phase on, an untyped script class dies earlier as a member miss —
  // same defect, earlier and better-worded message.
  const src = `script { class Box { constructor(node: any) { this.v = node.v } } }
App [ v: number = 10, w: number = 2, b: View [ width = { new Box(app).v + app.w } ] ]`;
  const r = compile(src, { typecheck: false });
  assert.ok(!r.source, "expected the unanalyzable constructor to block compilation");
  assert.ok(r.errors.some((x) => /constructor reads can't be analyzed/.test(x.message)), JSON.stringify(r.errors.map((x) => x.message)));
});

test("handlers stay UNRESTRICTED — a method never reached from a constraint is not analyzed", () => {
  // The refusals above are a property of the CONSTRAINT graph, not of script code.
  // A helper that a constraint could never wire is fine in a handler.
  const src = `script { let hits = 0
function bump(node: any) { hits = hits + 1
  return node.v + hits } }
App [ v: number = 10, onClick() { v = bump(this) }, b: View [ width = { app.v } ] ]`;
  const r = compile(src, {});
  assert.ok(r.source, "a handler may call anything: " + r.errors.map((e) => e.message).join("; "));
});

// ── B. corpus: every real app extracts with zero residue ──
console.log("─ B. corpus: 0 residue across all apps ─");
test("all five apps: 700 constraints, 0 residue errors", () => {
  const apps = ["calendar/calendar", "lzx-calendar/lzx-calendar", "lzx-weather/lzx-weather", "homepage/homepage", "docs/docs"];
  let tot = 0, errs = 0;
  for (const a of apps) {
    const r = extract(readFileSync(resolve(HERE, `../apps/${a}.declare`), "utf8"));
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

test("a computed default does NOT shadow a same-named app slot (L-17)", () => {
  // The inline decision used to be made on the bare NAME: an inner view declaring
  // `colA` captured every read of `colA` anywhere, including `app.colA` inside the
  // very default that defines it. It inlined into itself, the recursion guard
  // returned nothing, and the edge to the app's slot was silently dropped — the
  // slot changed and no consumer re-ran (the Inspector's undraggable pane seams).
  // The receiver decides now: `app.colA` is a plain cell on the root and stays a
  // subscribable read; `parent.colA` IS the inner default and still inlines.
  const r = extract(`App [ width = 400, height = 300,
    colA: number = 250,
    panes: View [ width = 400, height = 200,
        colA: number = { Math.min(app.colA, parent.width - 40) },
        treeCol: View [ width = { parent.colA }, height = 40 ],
        ],
    ]`);
  const own = readsOf(r, "colA", "panes");
  assert.ok(own.includes("this.root.colA"), "the default keeps its edge to the app slot: " + JSON.stringify(own));
  assert.ok(!own.some((p) => p === "this.root.parent.width"),
    "and never inlines itself into an impossible path: " + JSON.stringify(own));

  const consumer = readsOf(r, "width", "treeCol");
  assert.ok(consumer.includes("parent.root.colA"),
    "the consumer inlines the default and inherits its app-slot edge: " + JSON.stringify(consumer));
  assert.ok(consumer.includes("parent.parent.width"),
    "and the default's other read, rebased: " + JSON.stringify(consumer));
});

test("shadowing still inlines the RIGHT default when two elements share a name", () => {
  // Two different views each declare `k` as a computed default. Each reader must
  // inline its own parent's formula, not whichever was registered last.
  const r = extract(`App [ width = 400, height = 300, a: number = 1, b: number = 2,
    one: View [ width = 100, height = 100,
        k: number = { app.a },
        kid: View [ width = { parent.k }, height = 10 ],
        ],
    two: View [ width = 100, height = 100,
        k: number = { app.b },
        kid: View [ width = { parent.k }, height = 10 ],
        ],
    ]`);
  const kids = r.filter((c) => c.name === "kid" && c.attr === "width").map((c) => c.reads.sort());
  assert.equal(kids.length, 2, "two consumers");
  assert.ok(kids.some((k) => k.includes("parent.root.a")), "one inlines app.a: " + JSON.stringify(kids));
  assert.ok(kids.some((k) => k.includes("parent.root.b")), "the other inlines app.b: " + JSON.stringify(kids));
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
