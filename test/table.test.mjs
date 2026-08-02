// Table / TableRow (B7 — component-briefs.md §2): the ruled selection model
// in component form. These tiers drive the protocol seam directly (rowClick /
// step / onKeyDown with explicit modifier facts) — the gesture-to-modifier
// wiring itself is one Keys.isDown call, pinned by inspection.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle } from "../runtime/dist/index.js";

const KEY = (key, mods = {}) => ({ key, shift: false, ctrl: false, alt: false, meta: false, repeat: false, code: key, ...mods });

function makeApp(extra = "", n = 6, tableAttrs = "") {
  const src = `App [ width = 400, height = 500,
    delivered: object = null,
    d: Dataset { { "rows": [] } },
    t: Table [ x = 10, y = 10, width = 300, height = 150, datapath = { d.value },
      selects = "multi", ${tableAttrs}
      TableRow [ datapath = :rows[], height = 30,
        lab: Text [ x = 8, y = 8, text = :label ],
      ],
    ],
    ${extra}
  ]`;
  const b = compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  app.d.value = { rows: Array.from({ length: n }, (_, i) => ({ id: i, label: "row " + i })) };
  settle();
  return app;
}

const rowsOf = (t) => t.children.filter((c) => c.isTableRow === true);

await test("click selects; the selection holds RECORDS; row visuals derive from the value", () => {
  const app = makeApp();
  const rows = rowsOf(app.t);
  rows[2].onClick();
  settle();
  assert.equal(app.t.selected, app.d.value.rows[2], "the value is the member — the record itself");
  assert.deepEqual(app.t.selection.map((r) => r.id), [2]);
  assert.equal(rows[2].selected, true, "the row PRESENTS membership");
  assert.equal(rows[1].selected, false);
  assert.equal(app.t.active, app.d.value.rows[2], "click lands the keyboard position too");
});

await test("the protocol: toggle, range from the anchor, single-mode replace", () => {
  const app = makeApp();
  const m = (i) => app.d.value.rows[i];
  app.t.rowClick(1, m(1), false, false);          // plain: anchor at 1
  app.t.rowClick(4, m(4), false, true);           // shift: range 1..4
  settle();
  assert.deepEqual(app.t.selection.map((r) => r.id), [1, 2, 3, 4], "ranges commit member SETS in presented order");
  app.t.rowClick(2, m(2), true, false);           // ⌘: toggle 2 out
  settle();
  assert.deepEqual(app.t.selection.map((r) => r.id), [1, 3, 4], "discontiguous by toggle");
  app.t.rowClick(5, m(5), false, false);          // plain replaces
  settle();
  assert.deepEqual(app.t.selection.map((r) => r.id), [5]);
  // single mode
  const s = makeApp("", 4, "");
  s.t.selects = "single";
  s.t.rowClick(1, s.d.value.rows[1], false, false);
  s.t.rowClick(3, s.d.value.rows[3], false, true); // shift is inert in single
  settle();
  assert.deepEqual(s.t.selection.map((r) => r.id), [3], "single: one member, ranges don't apply");
});

await test("keyboard: arrows move-and-select, shift extends, the ⌘-walk + Space builds discontiguous", () => {
  const app = makeApp();
  const t = app.t;
  t.onKeyDown(KEY("ArrowDown"));                  // → row 0, selected
  settle();
  assert.equal(t.active.id, 0);
  assert.deepEqual(t.selection.map((r) => r.id), [0]);
  t.onKeyDown(KEY("ArrowDown", { shift: true })); // extend 0..1
  t.onKeyDown(KEY("ArrowDown", { shift: true })); // extend 0..2
  settle();
  assert.deepEqual(t.selection.map((r) => r.id), [0, 1, 2], "shift-arrows grow the range from the anchor");
  t.onKeyDown(KEY("ArrowDown", { meta: true }));  // ⌘-walk: position only
  t.onKeyDown(KEY("ArrowDown", { meta: true }));
  settle();
  assert.equal(t.active.id, 4, "the walk moved the position…");
  assert.deepEqual(t.selection.map((r) => r.id), [0, 1, 2], "…and the selection stood still");
  t.onKeyDown(KEY(" "));                          // Space toggles at the position
  settle();
  assert.deepEqual(t.selection.map((r) => r.id), [0, 1, 2, 4], "keyboard parity for discontiguous selection");
  t.onKeyDown(KEY("End", { meta: true }));
  settle();
  assert.equal(t.active.id, 5, "End jumps the position");
});

await test("the delivery seam: a use-site input() owns the value; the default writes the slots", () => {
  const app = makeApp("", 6, 'input(sel: object) { app.delivered = sel },');
  const rows = rowsOf(app.t);
  rows[1].onClick();
  settle();
  assert.deepEqual(app.delivered.map((r) => r.id), [1], "the gesture delivered to the app");
  assert.equal(app.t.selection, null, "…and did NOT write the slot — the override redirected it (press-never-writes)");
});

await test("selection is record-anchored: it survives data reorder", () => {
  const app = makeApp();
  const rec = app.d.value.rows[1];
  app.t.rowClick(1, rec, false, false);
  settle();
  app.d.move(["rows"], 1, 4);
  settle();
  assert.equal(app.t.selected, rec, "the record stays selected wherever it moves");
  const nowAt = rowsOf(app.t).findIndex((r) => r.selected);
  assert.equal(nowAt, 4, "the visual follows the record to its new place");
});

await test("windowed: ranges cross the window and arrow travel materializes the destination", () => {
  const src = `App [ width = 400, height = 500,
    d: Dataset { { "rows": [] } },
    t: Table [ x = 10, y = 10, width = 300, height = 150, datapath = { d.value },
      selects = "multi",
      TableRow [ datapath = :rows[], materialize = window, height = 30,
        lab: Text [ x = 8, y = 8, text = :label ],
      ],
    ],
  ]`;
  const b = compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  app.d.value = { rows: Array.from({ length: 1000 }, (_, i) => ({ id: i, label: "row " + i })) };
  settle();
  assert.ok(rowsOf(app.t).length < 50, "the table is windowed");
  // Range from row 2 to row 500 — 30 rows exist, 499 get selected.
  app.t.rowClick(2, app.d.value.rows[2], false, false);
  app.t.rowClick(500, app.d.value.rows[500], false, true);
  settle();
  assert.equal(app.t.selection.length, 499, "the range read the DATA, not the instances");
  assert.equal(app.t.selection[0].id, 2);
  assert.equal(app.t.selection[498].id, 500);
  // Arrow travel to an unmaterialized neighborhood scrolls it into existence.
  app.t.activeIndex = 800;
  app.t.onKeyDown(KEY("ArrowDown"));
  settle();
  assert.equal(app.t.active.id, 801);
  const inst = rowsOf(app.t).find((r) => r.rowIndex() === 801);
  assert.ok(inst !== undefined, "the destination materialized on arrival");
  assert.equal(inst.selected, true);
});

await test("rows are never tab stops: a row press focuses the TABLE (the one-stop policy)", () => {
  const app = makeApp();
  const rows = rowsOf(app.t);
  assert.equal(rows[0].focusable, false, "a row is not a stop");
  assert.equal(app.t.focusable, true, "the table is THE stop");
  rows[2].onPointerDown();
  settle();
  assert.equal(app.t.focused, true, "the press delegated focus to the table — arrows work after a click");
  assert.equal(rows[2].focused, false);
});

await test("written members: rows ARE the members (the RadioGroup practice); selection holds the views", () => {
  const src = `App [ width = 400, height = 300,
    t: Table [ x = 10, y = 10, width = 300, height = 200,
      selects = "multi",
      a: TableRow [ height = 30, lab: Text [ x = 8, y = 8, text = "Alpha" ] ],
      b: TableRow [ height = 30, lab: Text [ x = 8, y = 8, text = "Beta" ] ],
      c: TableRow [ height = 30, lab: Text [ x = 8, y = 8, text = "Gamma" ] ],
    ],
  ]`;
  const b = compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  app.t.b.onClick();
  settle();
  assert.equal(app.t.selected, app.t.b, "a written member IS the child view");
  assert.equal(app.t.b.selected, true);
  app.t.rowClick(2, app.t.c, false, true); // shift-range b..c over child order
  settle();
  assert.deepEqual(app.t.selection, [app.t.b, app.t.c]);
});

summarize("table");
