// A derived Dataset's recompute MERGES into its standing tree (data.ts
// Dataset.adopt + mergeTree, 2026-09-12): unchanged regions keep their objects
// and their readers stay asleep; a changed leaf wakes exactly its readers; an
// append wakes the list's readers. Pinned because the wholesale replacement it
// replaced re-ran every constraint in a 305-row column on one appended message
// (Murmur run 2: 430 ms of a 440 ms settle).
import assert from "node:assert";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate, settle } from "../runtime/dist/index.js";
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
async function build(src) {
  const r = await compileProgram(src, { stripPos: false });
  assert.equal(r.errors.length, 0, "compile errors: " + r.errors.map((e) => e.message).join("; "));
  const app = instantiate(r.program);
  settle();
  return app;
}
console.log("derived dataset: structural merge on recompute");

// `seen()` counts how many times a row's text constraint evaluates — script
// state is outside reactivity, which is exactly what makes it a fair counter.
const SRC = `
script {
  const counter = { n: 0 }
  function seen(v: string): string { counter.n++; return v }
  function evals(): number { return counter.n }
}

App [ width = 300, height = 300,
  n: number = 0,
  extra: string = "",
  evalCount() -> number { return evals() },
  src: Dataset { { "rows": [ { "id": "a", "name": "Ann" }, { "id": "b", "name": "Bob" }, { "id": "c", "name": "Cy" } ] } },
  // the derivation: a fresh tree every recompute, like an app's build() method
  d: Dataset [ contents = { app.derive() } ],
  derive() -> object {
    const rows = ((app.src.value as any).rows as any[]).map((r) => ({ id: r.id, name: r.name + app.extra }))
    if (app.n < 0) return ([1, 2, 3] as any)
    if (app.n > 0) rows.push({ id: "z" + app.n, name: "New" + app.n })
    return { rows: rows }
  },
  col: View [ width = 300, datapath = { app.d.value },
    layout: SimpleLayout [ axis = y ],
    Text [ datapath = :rows[], key = :id, text = { seen("" + :name) } ]
  ]
]`;

await (async () => {
  const app = await build(SRC);
  const rowsBefore = app.d.value.rows;
  const r0 = rowsBefore[0], r1 = rowsBefore[1];
  const base = app.evalCount();
  assert.equal(base, 3, "three rows evaluated once at boot");

  test("an unchanged recompute keeps every row object and wakes no reader", () => {
    app.n = 0; app.extra = ""; settle();      // no-op writes — but force a recompute through a real dependency below
    app.src.set(["rows", 0, "name"], "Ann"); settle();   // same value: the source is inert too
    assert.equal(app.d.value.rows, rowsBefore, "the rows array is the same object");
    assert.equal(app.evalCount(), base, "no row re-evaluated");
  });

  test("a changed leaf keeps the array and the other rows, and wakes only its own reader", () => {
    app.src.set(["rows", 1, "name"], "Bobby"); settle();
    assert.equal(app.d.value.rows, rowsBefore, "same array");
    assert.equal(app.d.value.rows[0], r0, "row 0 untouched");
    assert.equal(app.d.value.rows[1], r1, "row 1 is the same object, mutated in place");
    assert.equal(app.d.value.rows[1].name, "Bobby");
    assert.equal(app.evalCount(), base + 1, "exactly one reader re-ran");
    assert.equal(app.col.childViews[1].text, "Bobby", "and it shows the new value");
  });

  test("an append keeps the existing rows asleep and wakes the list — as a NEW array, so a held snapshot stays put", () => {
    const before = app.evalCount();
    app.n = 1; settle();
    assert.notEqual(app.d.value.rows, rowsBefore, "a structural change is a new array");
    assert.equal(rowsBefore.length, 3, "the array a caller held before the append did not change under it");
    assert.equal(app.d.value.rows.length, 4);
    assert.equal(app.d.value.rows[0], r0, "row 0 is the same object, in the new array");
    assert.equal(app.col.childViews.length, 4, "the replication gained a row");
    assert.equal(app.col.childViews[3].text, "New1");
    assert.equal(app.evalCount(), before + 1, "only the new row's reader ran");
  });

  test("a change that touches three of four rows wakes exactly those three", () => {
    const before = app.evalCount();
    app.extra = "!"; settle();
    assert.equal(app.col.childViews[0].text, "Ann!");
    assert.equal(app.evalCount(), before + 3, `the three renamed rows re-ran, the untouched appended row did not (ran ${app.evalCount() - before})`);
  });

  test("a shape change at the root falls back to wholesale replacement", () => {
    app.n = -1; settle();                       // derive() answers an ARRAY now — a different shape at the root
    assert.deepEqual(app.d.value, [1, 2, 3]);
    assert.equal(app.col.childViews.length, 0, "the replication has no rows to read");
  });
})();

console.log(`dataset-merge: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
