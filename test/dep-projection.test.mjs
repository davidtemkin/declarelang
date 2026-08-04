// test/dep-projection.test.mjs — reading an attribute off a method's RETURNED NODE.
//
// The bug (findings-2026-08-03 §A1): a helper that hands back a view, whose
// caller reads a property off it, wired the NODE and not the property —
//
//     pickBox() { return this.box },
//     text = { app.pickBox().width }      // deps: ["this.root.box"]
//
// A node reference never changes, so nothing ever invalidated: the constraint
// showed its first value forever, with no error at any rung. It is subscribing
// to the folder while caring about a file inside it, and the trigger is the most
// ordinary edit there is — pulling a repeated expression into a helper.
//
// Two halves are joined to fix it: the callee publishes the static path it
// returns, the call site contributes the tail it reads. Neither is a dependency
// alone.
//
// The NEGATIVES matter as much: over-approximating (both arms of a conditional)
// costs a recomputation, while under-approximating costs correctness — and a
// runtime-picked node must still refuse rather than wire something untrue.
import assert from "node:assert/strict";
import { compile } from "../compiler/dist/compile-node.js";
import { test, summarize } from "./harness.mjs";

/** Every wired dep-path in a one-constraint program, flattened. `deps` is a list
 *  per constraint and `source` is the whole program, so with a single constraint
 *  under test the flat set is the exact thing to assert against. */
function depsOf(src) {
  const r = compile(src, { originDir: process.cwd() });
  assert.equal(r.errors?.length ?? 0, 0, `compile failed:\n${(r.errors ?? []).map((e) => e.message).join("\n")}`);
  const out = [];
  const walk = (o) => {
    if (o === null || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (Array.isArray(o.deps)) out.push(...o.deps.flat(Infinity).filter((d) => typeof d === "string"));
    for (const v of Object.values(o)) walk(v);
  };
  walk(r.program ?? r);
  return [...new Set(out)];
}

await test("a returned node's attribute is wired, not just the node", async () => {
  const deps = depsOf(`App [
      box: View [ width = 100 ],
      pickBox(): View { return this.box },
      t: Text [ text = { "" + app.pickBox().width } ] ]`);
  assert.ok(deps.includes("this.root.box.width"),
    `expected the ATTRIBUTE to be wired; got ${JSON.stringify(deps)}`);
});

await test("a deeper tail is carried whole", async () => {
  // the return TYPE has to declare the member being read, or the typechecker
  // stops it before the extractor is reached
  const deps = depsOf(`class Outer extends View [ inner: View [ width = 10 ] ]
    App [
      outer: Outer [ ],
      pick(): Outer { return this.outer },
      t: Text [ text = { "" + app.pick().inner.width } ] ]`);
  assert.ok(deps.includes("this.root.outer.inner.width"),
    `expected the full tail; got ${JSON.stringify(deps)}`);
});

await test("a conditional return wires BOTH arms", async () => {
  // over-approximating on purpose: an extra dependency costs a recomputation,
  // a missing one costs correctness
  const deps = depsOf(`App [
      flag: boolean = true,
      a: View [ width = 10 ], b: View [ width = 20 ],
      which(): View { return app.flag ? this.a : this.b },
      t: Text [ text = { "" + app.which().width } ] ]`);
  assert.ok(deps.includes("this.root.a.width") && deps.includes("this.root.b.width"),
    `expected both arms; got ${JSON.stringify(deps)}`);
});

await test("the derived-value shape is UNCHANGED", async () => {
  // `issuesOf(rev).length` — the tracker's shape, ~15 call sites. The returned
  // list is built from what the body read, so those reads already cover the
  // projection. Nothing extra should appear, and nothing should be lost.
  const deps = depsOf(`App [
      n: number = 3,
      listOf(k: number): array { return [1, 2, 3].slice(0, k) },
      t: Text [ text = { "" + app.listOf(app.n).length } ] ]`);
  assert.ok(deps.includes("this.root.n"), `lost the body's read: ${JSON.stringify(deps)}`);
  assert.ok(!deps.some((d) => d.endsWith(".length")),
    `a computed value has no static path to project; got ${JSON.stringify(deps)}`);
});

await test("a runtime-picked node still REFUSES", async () => {
  // which node it is depends on state, so there is no static path — this must
  // stay a blocking error rather than wire something untrue
  const r = compile(`App [
      box: View [ width = 10 ],
      pick(): View { return this.childViews.filter((c) => c.width > 5)[0] as View },
      t: Text [ text = { "" + app.pick().width } ] ]`, { originDir: process.cwd() });
  assert.ok((r.errors ?? []).length > 0, "expected a refusal, got a clean compile");
});

await test("a call whose result is NOT read through is untouched", async () => {
  const deps = depsOf(`App [
      box: View [ width = 100 ],
      pickBox(): View { return this.box },
      t: Text [ text = { app.pickBox() == null ? "none" : "some" } ] ]`);
  assert.ok(!deps.some((d) => d.startsWith("this.root.box.")),
    `nothing is read off the result, so nothing should be projected; got ${JSON.stringify(deps)}`);
});

await test("a returned PARAMETER resolves against the argument", async () => {
  // the callee says "I hand back parameter 0"; the call site knows that was
  // `app.a`. Finite candidates, so it wires rather than refuses — this is the
  // case the old gate called "not knowable here"
  const deps = depsOf(`App [
      a: View [ width = 10 ], b: View [ width = 20 ],
      pick(x: View, y: View): View { return x },
      t: Text [ text = { "" + app.pick(app.a, app.b).width } ] ]`);
  assert.ok(deps.includes("this.root.a.width"),
    `expected the ARGUMENT's attribute; got ${JSON.stringify(deps)}`);
});

await test("an array's own properties reach no cell, so nothing is refused", async () => {
  // measured against the shipped apps: `.length`/`.map`/`.find`/`.includes` on
  // an array reach no cell whatever the array holds. Treating `array` as
  // suspicious refused four correct sites in the tracker and calendar.
  for (const tail of ["length", "map(x => x)", "find(x => true)"]) {
    const r = compile(`App [ n: number = 3,
        listOf(k: number): array { return [1,2,3].slice(0,k) },
        t: Text [ text = { "" + app.listOf(app.n).${tail} } ] ]`, { originDir: process.cwd() });
    assert.equal(r.errors?.length ?? 0, 0,
      `.${tail} should be legal:\n${(r.errors ?? []).map((e) => e.message).join("\n")}`);
  }
});

await test("the refusal explains DETERMINABILITY, not types", async () => {
  const r = compile(`App [ i: number = 0, box: View [ width = 10 ],
      pick(): View { return this.childViews[app.i] as View },
      t: Text [ text = { "" + app.pick().width } ] ]`, { originDir: process.cwd() });
  const msg = (r.errors ?? []).map((e) => e.message).join("\n");
  assert.ok(/chosen at run time/.test(msg) && /cannot be named at compile time/.test(msg),
    `the message should name the reason, not the return type; got:\n${msg}`);
  assert.ok(!/node|component/i.test(msg), `it should not talk about node-ness; got:\n${msg}`);
});

await test("a language method registered as PURE when it is not switches analysis off", async () => {
  // `View.rootOrigin()` walks the ancestor chain reading every level's x/y and
  // each scroller's scrollX/scrollY. It was declared pure in the effects table,
  // so a constraint reading it wired the NODE and none of the scroll cells —
  // the §A1 shape exactly, showing its first value forever with no error at any
  // rung. The table's own rule already names this: "a missing read is UNSOUND".
  //
  // The repair was a DELETION, not a case: absence makes it a §3 residue and the
  // general path refuses it. Nothing about rootOrigin is special-cased anywhere.
  const r = compile(`App [ width = 200, height = 100,
      pane: View [ y = 10, width = 200, height = 100, scrolls = y, clip = true,
          b: View [ y = 300, width = 50, height = 20 ] ],
      probe: Text [ text = { "y=" + app.pane.b.rootOrigin().y } ] ]`,
    { originDir: process.cwd() });
  const msg = (r.errors ?? []).map((e) => e.message).join("\n");
  assert.ok(/rootOrigin\(\)/.test(msg) && /can't be analyzed/.test(msg),
    `a constraint must refuse it rather than freeze; got:\n${msg}`);
});

await test("the same call in a HANDLER is untouched — a snapshot is correct there", async () => {
  // Menu.openAt and FocusRing anchor an overlay at gesture time; the position
  // wanted is the one at the moment of the gesture, which is what a snapshot IS.
  // The split falls out of the residue rule; it is not written anywhere.
  const r = compile(`App [ width = 200, height = 100,
      pane: View [ y = 10, width = 200, height = 100,
          b: View [ y = 30, width = 50, height = 20 ] ],
      at: number = 0,
      onClick() { at = this.pane.b.rootOrigin().y } ]`, { originDir: process.cwd() });
  assert.deepEqual((r.errors ?? []).map((e) => e.message), [],
    "a handler may take the snapshot");
});

summarize("dep-projection");
