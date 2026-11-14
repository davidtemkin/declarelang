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
    Text [ datapath = :rows[], identityKey = :id, text = { seen("" + :name) } ]
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

// The records a program keeps are its own: a derived dataset that shows them
// lands copies and merges into those, never into the objects the program
// holds (an undo snapshot kept the old slides; the merge used to rewrite it).
const KEPT = `
script {
  const counter = { n: 0 }
  function seen(v: string): string { counter.n++; return v }
  function evals(): number { return counter.n }
}
schema El [ id: string, x: number ]
schema Sl [ id: string, elements[]: El ]
App [ width = 300, height = 300,
  slides: Sl[] = [],
  evalCount() -> number { return evals() },
  shown: Dataset [ contents = { { slides: app.slides } } ],
  col: View [ width = 300, datapath = { app.shown.value },
    layout: SimpleLayout [ axis = y ],
    Text [ datapath = :slides[], identityKey = :id, text = { seen(:id + " " + :elements[0].x) } ]
  ]
]`;

await (async () => {
  const app = await build(KEPT);
  app.slides = [{ id: "s1", elements: [{ id: "e1", x: 100 }] }, { id: "s2", elements: [{ id: "e2", x: 5 }] }];
  settle();

  test("a recompute never writes into records the program holds", () => {
    const kept = app.slides;
    app.slides = kept.map((s) => s.id === "s1" ? { ...s, elements: s.elements.map((e) => ({ ...e, x: 160 })) } : s);
    settle();
    assert.equal(kept[0].elements[0].x, 100, "the kept snapshot still holds the old position");
    assert.equal(app.shown.value.slides[0].elements[0].x, 160, "the dataset shows the new one");
    assert.equal(app.col.childViews[0].text, "s1 160");
  });

  test("a record the program hands back unchanged keeps its row asleep", () => {
    const before = app.evalCount(), row1 = app.shown.value.slides[1];
    app.slides = app.slides.map((s) => s.id === "s1" ? { ...s, elements: [{ id: "e1", x: 170 }] } : s);
    settle();
    assert.equal(app.shown.value.slides[1], row1, "the unchanged row is the same object");
    assert.equal(app.evalCount(), before + 1, "only the changed row's reader ran");
  });
})();

// A read through a derived dataset that stops at a source's record (or list)
// wakes for writes beneath it, as the same read through the source does: the
// derived read also rides the record's slot in its source, which every write
// beneath wakes as an ancestor (Murmur run 17: an unread count went stale).
const HELD = `
schema M [ id: string ]
schema T [ id: string, msgs[]: M ]
class Row extends View [ height = 20,
  t: T = { :@ },
  n: number = { classroot.t.msgs.length },
  label: Text [ text = { classroot.t.id + " " + classroot.n } ] ]
App [ width = 300, height = 300,
  s: Dataset { { "threads": [ { "id": "t1", "msgs": [ { "id": "m1" } ] }, { "id": "t2", "msgs": [] } ] } },
  byRef: Dataset [ contents = { { rows: app.s.value.threads } } ],
  copied: Dataset [ contents = { { rows: [...app.s.value.threads] } } ],
  list: Text [ datapath = { app.byRef.value }, text = { "" + ((:rows as any)[0].msgs.length) } ],
  col: View [ datapath = { app.copied.value }, layout: SimpleLayout [ axis = y ],
    Row [ datapath = :rows[] ] ] ]`;

await (async () => {
  const app = await build(HELD);
  test("a derived read that stops at a source's list wakes for a write beneath it", () => {
    assert.equal(app.list.text, "1");
    app.s.insert(["threads", 0, "msgs"], 0, { id: "m2" }); settle();
    assert.equal(app.list.text, "2");
  });
  test("a row whose record is a source's record wakes for a write beneath it", () => {
    assert.equal(app.col.childViews[0].label.text, "t1 2");
    app.s.insert(["threads", 0, "msgs"], 2, { id: "m3" }); settle();
    assert.equal(app.col.childViews[0].label.text, "t1 3");
  });
  test("…and still after the source's records shift ahead of it", () => {
    app.s.insert(["threads"], 0, { id: "t0", msgs: [] }); settle();
    const row = app.col.childViews.find((r) => r.t.id === "t1");
    app.s.insert(["threads", 1, "msgs"], 0, { id: "m4" }); settle();
    assert.equal(row.label.text, "t1 4");
  });
})();

// A re-sorting derived list lands a new array: positional row cursors must
// re-check their record (the dataset's shape count moves), or a row keeps
// reading the record that now sits at its old index (Murmur run 17).
const SORTED = `
schema M [ id: string, at: number ]
schema T [ id: string, msgs[]: M ]
class Row extends View [ height = 20,
  tid: string = { :id ?? "" },
  n: number = { (:msgs as any).length },
  label: Text [ text = { classroot.tid + " " + classroot.n } ] ]
App [ width = 300, height = 300,
  s: Dataset { { "threads": [
    { "id": "a", "msgs": [ { "id": "a1", "at": 3 } ] },
    { "id": "b", "msgs": [ { "id": "b1", "at": 2 }, { "id": "b2", "at": 2 } ] },
    { "id": "c", "msgs": [ { "id": "c1", "at": 1 }, { "id": "c2", "at": 1 }, { "id": "c3", "at": 1 } ] } ] } },
  last(t: T) -> number { return t.msgs[t.msgs.length - 1]?.at ?? 0 },
  inbox: Dataset [ contents = { { rows: [...(app.s.value.threads as T[])].sort((x, y) => app.last(y) - app.last(x)) } } ],
  bump(i: number, at: number) { app.s.insert(["threads", i, "msgs"], app.s.value.threads[i].msgs.length, { id: "x" + at, at: at }) },
  list: View [ layout: SimpleLayout [ axis = y ], datapath = { app.inbox.value },
    Row [ datapath = :rows[] ] ] ]`;

await (async () => {
  const app = await build(SORTED);
  const shown = () => app.list.childViews.slice().sort((p, q) => p.y - q.y).map((r) => r.label.text).join(" | ");
  test("a re-sort moves the shape count, and every row reads its own record", () => {
    const shape = app.inbox.$shape;
    app.bump(2, 10); settle();
    assert.ok(app.inbox.$shape > shape, "the re-sorted list is a structural change");
    app.bump(1, 11); settle();
    assert.equal(shown(), "b 3 | c 4 | a 1");
  });
})();

console.log(`dataset-merge: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
