// A library class's own trackChanges and onChange are the author's
// (docs/system-design: the library keeps its own change work in private
// members — Floating's and Form's _watch, TableRow's and DataGridCell's
// _watch, Toast's _holdWatch, Sheet's _dragReset). A use site that tracks something of its own
// leaves the class's work running: a form still hears how its send ended, a
// table row still reports itself as the keyboard position, a grid's cell still
// does and its row still does not.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compileProgram } from "../compiler/dist/declarec.js";
import { instantiate } from "../runtime/dist/instantiate.js";
import { settle, provideMeasurer, Focus } from "../runtime/dist/index.js";
import { approximateMeasurer } from "../compiler/dist/headless.js";

provideMeasurer(approximateMeasurer());

function mockBackend() {
  const surface = () => new Proxy({}, { get: () => () => {} });
  return { createSurface: surface, attachRoot: () => {} };
}
async function boot(src, attach = false) {
  const b = await compileProgram(src, { originDir: process.cwd() + "/library", stripPos: false });
  assert.equal(b.errors.length, 0, b.errors.map((e) => e.message).join("; "));
  const app = instantiate(b.program);
  if (attach) app.$attach(mockBackend(), null);
  settle();
  return app;
}
const turn = () => new Promise((r) => setTimeout(r, 0));

await test("a Form with its own trackChanges and onChange still hears its slow local send land", async () => {
  const app = await boot(`App [ width = 500, height = 300, heard: number = 0, name: string = "",
    f: Form [ width = 400, note: string = "",
      trackChanges = ["note"], onChange() { app.heard = app.heard + 1 },
      TextInput [ width = 200, name = "name", required = "Enter a name.", text = { app.name }, onInput(v: string) { app.name = v } ],
      send() { pending = true } ] ]`, true);
  app.name = "Ada"; settle();
  app.f.submit(); settle(); await turn(); settle();
  assert.equal(app.f.pending, true, "the slow send is out");
  app.f.pending = false; settle(); await turn(); settle();
  assert.equal(app.f._members[0].judged, false, "it landed: the field is judged afresh");
  app.f.note = "x"; settle(); await turn(); settle();
  assert.equal(app.heard, 1, "and the use site's onChange heard its own attribute");
});

await test("a TableRow with its own trackChanges and onChange still reports itself as its table's keyboard position", async () => {
  const app = await boot(`App [ width = 400, height = 400, heard: number = 0,
    d: Dataset { { "rows": [ { "id": 0 }, { "id": 1 }, { "id": 2 } ] } },
    t: Table [ x = 10, y = 10, width = 300, height = 150, datapath = { app.d.value },
      TableRow [ datapath = :rows[], height = 30, mine: boolean = { this.selected },
        trackChanges = ["mine"], onChange() { app.heard = app.heard + 1 } ] ] ]`);
  const rows = app.t.children.filter((c) => c._isTableRow === true);
  rows[1].onClick(); settle(); await turn(); settle();
  assert.ok(app.t._activeView === rows[1], "the active row reports itself");
  assert.equal(app.heard, 1, "the use site's onChange heard its own attribute");
});

await test("a DataGrid's active cell reports itself; its rows do not", async () => {
  const app = await boot(`App [ width = 700, height = 400,
    d: Dataset { { "rows": [ { "id": 1, "a": "x", "b": "y" }, { "id": 2, "a": "z", "b": "w" } ] } },
    g: DataGrid [ x = 10, y = 10, width = 600, height = 300, items = { app.d.value.rows },
      columns = { [ { id: "a", title: "A", width: 100 }, { id: "b", title: "B", width: 100 } ] } ] ]`);
  Focus.setRoot(app);
  const rows = app.g.children.filter((c) => c._isGridRow === true);
  rows[1].onClick(); settle();
  Focus.focus(app.g); settle(); await turn(); settle();
  const v = app.g._activeView;
  assert.ok(v !== null && v !== undefined, "something is active");
  assert.ok(v._isGridRow !== true, "not a row");
  assert.equal(v.constructor.name.includes("Cell") || "activeHere" in v, true, "a cell");
});

await test("a Sheet with its own closed() still opens at rest after a swipe put it away", async () => {
  const app = await boot(`App [ width = 400, height = 600, n: number = 0,
    s: Sheet [ closed() { app.n = app.n + 1 }, Text [ text = "sheet" ] ] ]`);
  app.s.show(); settle();
  app.s._dragY = 150; settle();
  app.s.close(); settle(); await turn(); settle();
  assert.equal(app.n, 1, "the use site's closed() ran");
  assert.equal(app.s._dragY, 0, "and the swipe's offset is gone");
});

summarize("own-handlers");
