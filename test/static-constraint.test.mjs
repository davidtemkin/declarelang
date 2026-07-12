// static-constraint — validates the runtime STATIC-CONSTRAINT PATH: constraints
// whose deps the compiler extracted are wired once (no per-run re-tracking) and
// still behave identically — updates propagate, precision holds, and the path is
// actually taken (not silently falling back). The reactive hot path, on rails.
import assert from "node:assert";
import { compile } from "../compiler/dist/compile-node.js";
import { annotateProgram } from "../compiler/dist/dep-extract.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle, build, serializeDeps, applyDeps, forEachCodeValue } from "../runtime/dist/index.js";

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok —", name); } catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); } }

// compile → resolve → ANNOTATE deps → instantiate (the static path is active).
function run(src) {
  const r = compile(src, {});
  if (!r.source) throw new Error("compile: " + r.errors.map((e) => e.message).join("; "));
  const prog = parseProgram(r.source);
  const { errors } = annotateProgram(prog);
  if (errors.length) throw new Error("residue: " + errors.map((e) => e.where + " " + e.message).join("; "));
  const app = instantiate(prog);
  settle();
  return app;
}
const owner = (node, attr) => node.$owners?.[attr];

console.log("static-constraint");

test("annotated constraints are actually on the STATIC path (not falling back)", () => {
  const app = run(`App [ n: number = 3, v: View [ width = { app.n * 10 } ] ]`);
  const k = owner(app.v, "width");
  assert.ok(k, "width should be constraint-owned");
  assert.equal(k.isStatic, true, "constraint should be wired on the static path");
  assert.equal(app.v.width, 30, "initial value computed");
});

test("a static constraint recomputes when its dep changes", () => {
  const app = run(`App [ n: number = 3, v: View [ width = { app.n * 10 } ] ]`);
  app.n = 7; settle();
  assert.equal(app.v.width, 70, "static edge propagated the change");
});

test("interprocedural static constraint tracks deps read INSIDE the method", () => {
  const app = run(`App [ a: number = 1, b: number = 2,
      v: View [ width = { app.sum() } ],
      sum() { return this.a + this.b } ]`);
  assert.equal(owner(app.v, "width").isStatic, true);
  assert.equal(app.v.width, 3);
  app.a = 10; settle(); assert.equal(app.v.width, 12, "change to a method-internal dep propagates");
  app.b = 20; settle(); assert.equal(app.v.width, 30, "change to the other propagates");
});

test("precision — a NON-dependency change does not perturb the value", () => {
  const app = run(`App [ n: number = 3, other: number = 0, v: View [ width = { app.n * 10 } ] ]`);
  let applied = 0;
  const k = owner(app.v, "width");
  const realApply = k.run.bind(k);
  app.other = 999; settle();
  assert.equal(app.v.width, 30, "unrelated slot change left the value untouched");
});

test("ternary branch-union — both branches are wired, so either dep updates it", () => {
  const app = run(`App [ pick: boolean = true, px: number = 1, py: number = 2,
      v: View [ width = { app.pick ? app.px * 100 : app.py * 100 } ] ]`);
  assert.equal(app.v.width, 100);
  app.pick = false; settle(); assert.equal(app.v.width, 200, "switched branch");
  // py is the now-live branch; px is the union-subscribed but inactive branch
  app.px = 5; settle(); assert.equal(app.v.width, 200, "inactive-branch dep doesn't change the value");
  app.py = 9; settle(); assert.equal(app.v.width, 900, "active-branch dep updates");
  app.pick = true; settle(); assert.equal(app.v.width, 500, "px is still wired — switching back works (5*100)");
});

test("datapath static constraint updates on an in-place edit", () => {
  const app = run(`App [ rec: Dataset { { "title": "hi", "n": 5 } },
      card: View [ datapath = { app.rec.value },
        w: View [ width = { :n } ] ] ]`);
  assert.equal(app.card.w.width, 5);
  app.rec.set("n", 42); settle();
  assert.equal(app.card.w.width, 42, "datapath edge propagated the region edit");
});

test("chained recompute — a static constraint feeding another still cascades", () => {
  const app = run(`App [ n: number = 2,
      a: View [ width = { app.n * 3 } ],
      b: View [ width = { app.a.width + 1 } ] ]`);
  assert.equal(app.b.width, 7);
  app.n = 10; settle();
  assert.equal(app.a.width, 30);
  assert.equal(app.b.width, 31, "the cascade (n → a.width → b.width) fired on static edges");
});

// ── the DEV source-string channel: serializeDeps (server) → applyDeps (browser) ──
console.log("─ dev channel: serialize → apply alignment ─");

test("serializeDeps → applyDeps round-trips onto the identical constraints (no misalignment)", () => {
  const src = compile(`App [ n: number = 1, m: number = 2, k: number = 3,
      a: View [ width = { app.n + app.m } ],
      b: View [ width = { app.k * 2 } ],
      grid: Dataset { { "rows": [] } },
      list: View [ datapath = { app.grid.value }, w: View [ width = { :rows.length } ] ],
      c: View [ height = { app.n } ] ]`, {}).source;
  // reference: annotate a parse directly (inline path, what prod uses)
  const p1 = parseProgram(src); annotateProgram(p1);
  const ref = []; forEachCodeValue(p1, (v) => ref.push([v.src.trim(), (v.deps ?? []).join("|")]));
  // dev path: serialize from p1, apply onto a FRESH parse of the same source
  const list = serializeDeps(p1);
  const p2 = parseProgram(src); applyDeps(p2, list);
  const got = []; forEachCodeValue(p2, (v) => got.push([v.src.trim(), (v.deps ?? []).join("|")]));
  assert.deepEqual(got, ref, "applied deps landed on different constraints than they were extracted from");
});

test("dev path (build with opts.deps) takes the static path and stays reactive", () => {
  const src = compile(`App [ n: number = 4, v: View [ width = { app.n * 5 } ] ]`, {}).source;
  const p = parseProgram(src); annotateProgram(p);
  const deps = serializeDeps(p);
  const app = build(src, { deps });          // ← exactly what renderAsync does in the browser
  settle();
  assert.equal(app.v.$owners?.width?.isStatic, true, "dev path should wire the static edge");
  assert.equal(app.v.width, 20);
  app.n = 6; settle();
  assert.equal(app.v.width, 30, "dev static edge propagated");
});

console.log(`\nstatic-constraint: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
