// Combobox / ContextMenu / DataGrid (B7 — component-briefs.md §3–§5): the
// remaining ruled briefs in component form. Protocol-driven, the table-test
// discipline: gestures land on the seams (pickIndex / headerClick / commitDrop
// / resizeInput) — the pointer-to-seam wiring is inspection-pinned.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

// Menu machinery centers text (`y = center`) — node has no canvas, so the
// deterministic headless approximation measures (the capabilities.md §3 seam).
provideMeasurer(approximateMeasurer());

const KEY = (key, mods = {}) => ({ key, shift: false, ctrl: false, alt: false, meta: false, repeat: false, code: key, ...mods });

function boot(src) {
  const b = compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  settle();
  return app;
}

// ── Combobox ──────────────────────────────────────────────────────────────

const COMBO = `App [ width = 400, height = 300,
  chosen: object = null,
  c: Combobox [ x = 20, y = 20, width = 240,
    items = { [
      ({ id: "ada", label: "Ada Lovelace" }),
      ({ id: "alan", label: "Alan Turing" }),
      ({ id: "grace", label: "Grace Hopper" }),
    ] },
  ],
]`;

await test("Combobox: the matches are a derivation — typing filters, the count rides along", () => {
  const app = boot(COMBO);
  const c = app.c;
  assert.equal(c.matchCount, 3, "unfiltered: the whole list");
  c.query = "AL";
  c.filtering = true;
  settle();
  assert.deepEqual(c.matches.map((m) => m.id), ["alan"], "case-insensitive substring over labels");
  assert.equal(c.matchCount, 1);
  c.query = "ace";
  settle();
  assert.deepEqual(c.matches.map((m) => m.id), ["ada", "grace"], "lovelace and grace both carry it");
  c.query = "hopper";
  settle();
  assert.deepEqual(c.matches.map((m) => m.id), ["grace"]);
  c.filtering = false;
  settle();
  assert.equal(c.matchCount, 3, "a pick clears filtering — the full list returns");
});

await test("Combobox: picking delivers the MEMBER, echoes the label, closes the list", () => {
  const app = boot(COMBO);
  const c = app.c;
  c.open();
  settle();
  assert.equal(c.list.shown, true, "the Menu machinery is the overlay");
  c.query = "tur";
  c.filtering = true;
  settle();
  c.pickIndex(0);
  settle();
  assert.equal(c.value, c.items[1], "the value is the member — the record itself");
  assert.equal(c.entry.text, "Alan Turing", "the field echoes the choice");
  assert.equal(c.list.shown, false, "pick closes");
});

await test("Combobox: a use-site input() owns the value (press-never-writes)", () => {
  const app = boot(`App [ width = 400, height = 300,
    chosen: object = null,
    c: Combobox [ x = 20, y = 20, items = { [({ id: "a", label: "Alpha" })] },
      input(v: object) { app.chosen = v },
    ],
  ]`);
  app.c.pickIndex(0);
  settle();
  assert.equal(app.chosen.id, "a", "delivered to the app");
  assert.equal(app.c.value, null, "…and the slot stayed untouched — the override redirected");
});

// ── ContextMenu ───────────────────────────────────────────────────────────

await test("ContextMenu: open(v, e) anchors at the pointer; pick delivers and closes", async () => {
  const app = boot(`App [ width = 500, height = 400,
    last: string = "",
    m: ContextMenu [ items = { [({ id: "cut", label: "Cut" }), ({ id: "copy", label: "Copy" })] },
      picked(id: string) { app.last = id },
    ],
    v: View [ x = 100, y = 100, width = 200, height = 100,
      onContextMenu(e: PointerEvent) { app.m.open(this, e) },
      onHold(e: PointerEvent) { app.m.open(this, e) },
    ],
  ]`);
  assert.equal(app.m.shown, false);
  app.v.onContextMenu({ x: 30, y: 40 });
  settle();
  assert.equal(app.m.shown, true, "the gesture opened it");
  assert.equal(app.m.opener, app.v, "the serving view is the opener");
  assert.equal(app.m.x + 0, 130, "anchored at the pointer (root space)");
  assert.equal(app.m.y + 0, 140);
  app.m.pick("copy");
  await new Promise((r) => setTimeout(r, 5));   // delivery is DEFERRED past the takedown (the native contract)
  settle();
  assert.equal(app.last, "copy", "delivery through the ordinary path");
  assert.equal(app.m.shown, false, "…and closed");
});

await test("ContextMenu: a serving view inside a SCROLLED pane anchors where the user sees it", () => {
  const app = boot(`App [ width = 500, height = 400,
    m: ContextMenu [ items = { [({ id: "a", label: "A" })] } ],
    sc: View [ x = 0, y = 50, width = 500, height = 300, scrolls = y, clip = true,
      tall: View [ width = 500, height = 2000,
        pad: View [ x = 40, y = 600, width = 200, height = 100,
          onContextMenu(e: PointerEvent) { app.m.open(this, e) },
        ],
      ],
    ],
  ]`);
  app.sc.scrollY = 500;
  settle();
  app.sc.tall.pad.onContextMenu({ x: 10, y: 20 });
  settle();
  // pad renders at 50 + 600 - 500 = 150; the event adds 20 → 170
  assert.equal(app.m.y, 170, "the walk subtracts the ancestor scroll");
  assert.equal(app.m.x, 50, "x too (unscrolled axis unaffected)");
  app.m.close(); // release the nav claim — Keys is a process singleton
});

await test("Menu: viewport-aware — a list that won't fit below emerges ABOVE; nav keys are claimed while open", async () => {
  const { Keys } = await import("../runtime/dist/keys.js");
  const app = boot(`App [ width = 400, height = 300,
    m: Menu [ items = { [({ id: "a", label: "A" }), ({ id: "b", label: "B" }), ({ id: "c", label: "C" })] } ],
    btn: View [ x = 50, y = 240, width = 120, height = 30 ],
  ]`);
  assert.equal(Keys.navClaimed(), false);
  app.m.openFor(app.btn);
  settle();
  assert.equal(Keys.navClaimed(), true, "an open menu claims the nav keys from page scroll");
  const h = app.m.expectedHeight();
  assert.ok(app.m.y + app.m.offY + h <= 244, `emerged above the control (y=${app.m.y}, h=${h})`);
  app.m.close();
  settle();
  assert.equal(Keys.navClaimed(), false, "closed releases the claim");
});

await test("Menu: a long list caps at the viewport and its body scrolls (the rover reveals)", () => {
  const app = boot(`App [ width = 400, height = 260,
    m: Menu [ items = { Array.from({ length: 40 }, (_, i) => ({ id: "" + i, label: "Item " + i })) } ],
    btn: View [ x = 50, y = 10, width = 120, height = 30 ],
  ]`);
  app.m.openFor(app.btn);
  settle();
  assert.ok(app.m.panel.height <= 260 - 8, "the panel caps at the viewport");
  assert.equal(app.m.panel.body.scrolls, "y", "…and the body is the scroller");
  assert.ok(app.m.panel.body.contentHeight > app.m.panel.body.height, "content overflows into the scroll");
});

await test("Menu: the ruled COLUMN model — check space always, icon column iff icons, ONE text edge", () => {
  // icons present: check col 7.., icon col 25.., every label at 46
  const app = boot(`App [ width = 400, height = 400,
    m: Menu [ items = { [
      ({ id: "a", label: "Light", icon: "A", checked: true }),
      ({ id: "b", label: "Plain" }),
    ] } ],
    btn: View [ x = 40, y = 10, width = 100, height = 24 ],
  ]`);
  app.m.openFor(app.btn);
  settle();
  assert.equal(app.m.hasIcons, true);
  const rows = app.m.panel.body.children.filter((r) => r.lbl !== undefined);
  for (const r of rows) assert.equal(r.lbl.x, 46, "one text edge for iconed and plain rows alike");
  assert.equal(rows[0].check.x, 7, "the check column leads");
  assert.equal(rows[0].ico.x, 25, "icons get their own column");
  app.m.close();
  // no icons anywhere: the icon column does not exist — text at 24, but the
  // CHECK column is still reserved (no row text ever starts at the inset)
  const app2 = boot(`App [ width = 400, height = 400,
    m: Menu [ items = { [({ id: "a", label: "One" }), ({ id: "b", label: "Two", checked: true })] } ],
    btn: View [ x = 40, y = 10, width = 100, height = 24 ],
  ]`);
  app2.m.openFor(app2.btn);
  settle();
  assert.equal(app2.m.hasIcons, false);
  const rows2 = app2.m.panel.body.children.filter((r) => r.lbl !== undefined);
  for (const r of rows2) assert.equal(r.lbl.x, 24, "no icons → no icon gutter; the check column alone leads");
  app2.m.close();
});

await test("Combobox: the list lives at the APP layer — it paints over the combobox's later siblings", () => {
  const app = boot(COMBO);
  const c = app.c;
  assert.equal(c.list, null, "dormant until first open — zero views");
  c.open();
  settle();
  assert.equal(c.list.parent, app, "the shipped overlay idiom: an app-level instance (the Menu-cascade door)");
  assert.equal(c.list.shown, true);
  c.query = "tur";
  c.filtering = true;
  c.syncList();
  settle();
  assert.equal(c.list.items.length, 1, "typing re-pushes the derived matches");
  c.pickIndex(0);
  settle();
  assert.equal(c.list.shown, false);
});

// ── DataGrid ──────────────────────────────────────────────────────────────

const GRID = `App [ width = 700, height = 400,
  d: Dataset { { "rows": [] } },
  g: DataGrid [ x = 10, y = 10, width = 600, height = 300, datapath = { d.value },
    selects = "multi",
    Column [ title = "ID", field = "id", width = 70 ],
    Column [ title = "Title", field = "title", width = 280 ],
    Column [ title = "State", field = "state", width = 110 ],
    GridRow [ datapath = :rows[] ],
  ],
]`;

const ROWS = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i, title: "Issue " + i, state: i % 2 ? "open" : "done" }));

const gridRows = (g) => g.children.filter((c) => c.isGridRow === true);
const cellTexts = (row) => row.cells.children.filter((c) => c.t).map((c) => c.t.text);

await test("DataGrid: columns are written members — cells generate from the model, offsets run", () => {
  const app = boot(GRID);
  app.d.value = { rows: ROWS(3) };
  settle();
  const cols = app.g.colData.value.cols;
  assert.deepEqual(cols.map((c) => c.id), ["id", "title", "state"], "a column's id is its field");
  assert.deepEqual(cols.map((c) => c.x), [0, 70, 350], "running x offsets from plain widths");
  const rows = gridRows(app.g);
  assert.equal(rows.length, 3);
  assert.deepEqual(cellTexts(rows[1]), ["1", "Issue 1", "open"], "each cell shows record[field]");
  assert.equal(app.g.hdr.y, -app.g.headerH, "the header floats ABOVE the scroll box");
  assert.equal(rows[0].y, 0, "rows start at the box top — the scroll region is rows only");
});

await test("DataGrid: header click is a SORT DELIVERY — it names a derivation, data stays the truth", () => {
  const app = boot(GRID);
  app.d.value = { rows: ROWS(3) };
  settle();
  app.g.headerClick("title");
  assert.equal(app.g.sortOn, "title");
  assert.equal(app.g.sortDir, "asc");
  app.g.headerClick("title");
  assert.equal(app.g.sortDir, "desc", "same column toggles");
  app.g.headerClick("state");
  assert.deepEqual([app.g.sortOn, app.g.sortDir], ["state", "asc"], "a new column starts ascending");
});

await test("DataGrid: reorder and resize are value-pattern state — deliveries an app may own", () => {
  const app = boot(GRID);
  app.d.value = { rows: ROWS(2) };
  settle();
  // drag "id" so its center passes "title"'s midpoint → the insertion bar
  // tracks (drop-commit: nothing re-derives mid-drag), then RELEASE commits
  app.g.dragCol = "id";
  app.g.dropAt = app.g.dropIndexFor(300);
  settle();
  assert.equal(app.g.dropAt, 2, "the bar shows the would-be slot");
  assert.ok(app.g.dropBarX(app.g.dropAt) > 0, "…at a real boundary");
  app.g.commitDrop("id");
  settle();
  assert.deepEqual(app.g.currentOrder(), ["title", "id", "state"], "the release committed the reorder");
  assert.equal(app.g.dragCol, "", "drag state cleared");
  assert.deepEqual(cellTexts(gridRows(app.g)[0]), ["Issue 0", "0", "done"], "cells follow the order");
  app.g.resizeInput("title", 150);
  settle();
  const cols = app.g.colData.value.cols;
  assert.deepEqual(cols.map((c) => [c.id, c.x]), [["title", 0], ["id", 150], ["state", 220]],
    "a width override reflows every offset");
  // an app override owns the state
  const app2 = boot(`App [ width = 700, height = 400,
    got: array = null,
    d: Dataset { { "rows": [] } },
    g: DataGrid [ x = 10, y = 10, width = 600, height = 300, datapath = { d.value },
      arrangeInput(ord: array) { app.got = ord },
      Column [ title = "A", field = "a", width = 100 ],
      Column [ title = "B", field = "b", width = 100 ],
      GridRow [ datapath = :rows[] ],
    ],
  ]`);
  app2.d.value = { rows: [{ a: 1, b: 2 }] };
  settle();
  app2.g.dragCol = "a";
  app2.g.dropAt = app2.g.dropIndexFor(190);
  app2.g.commitDrop("a");
  settle();
  assert.deepEqual(app2.got, ["b", "a"], "the reorder delivered up");
  assert.equal(app2.g.order, null, "…and the slot stayed the app's (press-never-writes)");
});

await test("DataGrid: the Table contract rides along — selection over grid rows", () => {
  const app = boot(GRID);
  app.d.value = { rows: ROWS(4) };
  settle();
  const rows = gridRows(app.g);
  rows[1].onClick();
  settle();
  assert.equal(app.g.selected, app.d.value.rows[1], "a grid row selects like a table row");
  assert.equal(rows[1].selected, true);
  app.g.rowClick(3, app.d.value.rows[3], false, true);
  settle();
  assert.deepEqual(app.g.selection.map((r) => r.id), [1, 2, 3], "ranges too");
});

await test("DataGrid: cell KINDS — an editor, a checkbox, and a select all write the RECORD", async () => {
  const app = boot(`App [ width = 700, height = 400,
    d: Dataset { { "rows": [ { "id": 1, "title": "One", "state": "open", "done": false } ] } },
    g: DataGrid [ x = 10, y = 10, width = 650, height = 300, datapath = { d.value },
      Column [ title = "ID", field = "id", width = 60 ],
      Column [ title = "Title", field = "title", width = 240, kind = "edit" ],
      Column [ title = "State", field = "state", width = 120, kind = "select", options = { ["open", "triage", "done"] } ],
      Column [ title = "Done", field = "done", width = 70, kind = "check" ],
      GridRow [ datapath = :rows[] ],
    ],
  ]`);
  const row = app.g.children.find((c) => c.isGridRow === true);
  const cells = row.cells.children.filter((c) => c.k !== undefined);
  assert.deepEqual(cells.map((c) => c.k), ["text", "edit", "select", "check"], "one presentation per kind");
  // the editor commits each edit into the record through the row's cursor
  cells[1].ed.onInput("Renamed");
  settle();
  assert.equal(app.d.value.rows[0].title, "Renamed", "typing writes the record live");
  // the checkbox writes the boolean
  cells[3].ck.input(true);
  settle();
  assert.equal(app.d.value.rows[0].done, true, "the checkbox writes the field");
  assert.equal(cells[3].ck.checked, true, "…and re-derives from it");
  // the select opens the SHARED app-layer menu and picking writes the field
  cells[2].sel.onClick();
  settle();
  assert.equal(app.g.selMenu.parent, app, "one shared options menu, at the app layer");
  assert.equal(app.g.selMenu.shown, true);
  assert.deepEqual(app.g.selMenu.items.map((i) => i.id), ["open", "triage", "done"]);
  assert.equal(app.g.selMenu.items[0].checked, true, "the current value wears the check");
  app.g.selMenu.pick("done");
  await new Promise((r) => setTimeout(r, 5));   // deferred delivery
  settle();
  assert.equal(app.d.value.rows[0].state, "done", "picking writes the record");
  assert.equal(app.g.selMenu.shown, false);
});

await test("DataGrid: windowing composes — the header offsets the window (the leading anchor)", () => {
  const app = boot(`App [ width = 700, height = 400,
    d: Dataset { { "rows": [] } },
    g: DataGrid [ x = 10, y = 10, width = 600, height = 300, datapath = { d.value },
      Column [ title = "ID", field = "id", width = 70 ],
      Column [ title = "Title", field = "title", width = 280 ],
      GridRow [ datapath = :rows[], materialize = window ],
    ],
  ]`);
  app.d.value = { rows: ROWS(10000) };
  settle();
  const rows = gridRows(app.g);
  assert.ok(rows.length < 60, "10k rows, a window's worth of instances");
  const first = rows.find((r) => r.rowIndex() === 0);
  assert.ok(first !== undefined);
  assert.equal(first.y, 0, "row 0 sits at the box top — the header floats above the region");
  assert.deepEqual(cellTexts(first), ["0", "Issue 0"], "cells render in the window");
});

await test("DataGrid: a FOCUSED cell's row is never recycled — focus is touch (D5 focus-as-touched)", async () => {
  const { Focus } = await import("../runtime/dist/focus.js");
  const app = boot(`App [ width = 700, height = 400,
    d: Dataset { { "rows": [] } },
    g: DataGrid [ x = 10, y = 10, width = 650, height = 300, datapath = { d.value },
      Column [ title = "ID", field = "id", width = 60 ],
      Column [ title = "State", field = "state", width = 120, kind = "select", options = { ["open", "done"] } ],
      GridRow [ datapath = :rows[], materialize = window ],
    ],
  ]`);
  app.d.value = { rows: Array.from({ length: 1000 }, (_, i) => ({ id: i, state: i % 2 ? "open" : "done" })) };
  settle();
  const row = app.g.children.find((c) => c.isGridRow === true && c.rowIndex() === 3);
  const sel = row.cells.children.find((c) => c.k === "select").sel;
  Focus.setRoot(app);
  Focus.focus(sel);
  settle();
  assert.equal(Focus.getFocus(), sel);
  const rec = row.rec;
  app.g.scrollY = 20000; // the window leaves row 3 far behind
  settle();
  assert.ok(app.g.children.includes(row), "the focused row is RETAINED, not recycled or parked");
  assert.equal(row.rec, rec, "…still presenting ITS record — focus never teleports to another row");
  assert.equal(Focus.getFocus(), sel, "focus itself is undisturbed");
  Focus.blur();
  app.g.scrollY = 0;
  settle();
});

// ── Segmented ─────────────────────────────────────────────────────────────

await test("Segmented: every segment is a STOP — tab to an inactive choice, Space picks; arrows rove", async () => {
  const { Focus } = await import("../runtime/dist/focus.js");
  const app = boot(`App [ width = 500, height = 200,
    page: string = "a",
    s: Segmented [ x = 20, y = 20,
      value = { app.page },
      input(v: object) { app.page = "" + v },
      Segment [ choice = { "a" }, lbl = "Alpha" ],
      Segment [ choice = { "b" }, lbl = "Beta" ],
      Segment [ choice = { "c" }, lbl = "Gamma" ],
    ],
  ]`);
  const s = app.s;
  const segs = s.segs();
  assert.equal(segs.length, 3);
  assert.equal(segs[0].focusable, true, "a segment IS a tab stop — inactive choices are reachable");
  assert.equal(segs[0].on, true, "the value elects the active segment");
  // click picks; the use-site input owns the value
  segs[2].onClick();
  settle();
  assert.equal(app.page, "c", "delivered to the app");
  assert.equal(segs[2].on, true, "…and the constraint re-elects");
  // tab to an INACTIVE segment and pick it from the keyboard
  Focus.setRoot(app);
  Focus.focus(segs[0]);
  settle();
  assert.equal(segs[0].on, false, "focused an inactive choice");
  segs[0].onKeyDown(KEY(" "));
  settle();
  assert.equal(app.page, "a", "Space picked it — the Control activation path");
  // arrows ROVE focus (not the value)
  segs[0].onKeyDown(KEY("ArrowRight"));
  settle();
  assert.equal(Focus.getFocus(), segs[1], "arrows rove focus across segments");
  assert.equal(app.page, "a", "…without changing the value");
  const fs = segs[1].focusShape();
  assert.ok(fs != null && fs.rad === 6, "the ring hugs the segment's pill");
  Focus.blur();
});

summarize("components");
