// name-scope — a name means what it resolves to through the element it is
// written in and that element's class chain, never every name of the same
// spelling. Members of one element share a namespace; across unrelated
// classes, elements, schemas, script scope and datasets, reuse is legal unless
// a deliberate rule says otherwise — and where one does, the message names
// both things.
import assert from "node:assert/strict";
import { join } from "node:path";
import { compile } from "../compiler/dist/compile-node.js";
import { test, summarize, tempDir } from "./harness.mjs";

const DIR = tempDir("declare-name-scope-");
const build = (src) => compile(src, { originDir: DIR, mainId: join(DIR, "app.declare") });
const texts = (list) => list.map((e) => e.message);
const none = (list, re, r) => assert.ok(!texts(list).some((m) => re.test(m)), texts([...r.errors, ...r.warnings]).join("\n"));
const clean = (r) => assert.deepEqual(texts(r.errors), [], "no errors");

await test("4024: a local of a computed dataset's name, and a library's member, are not writes to it", async () => {
  const local = await build(`App [ width = 200, height = 100,
    rows: Dataset [ contents = { ({ a: 1 }) } ],
    tally() { const rows: number[] = []; rows.push(1); return rows.length } ]`);
  clean(local);
  none(local.warnings, /rows computes its value with contents/, local);
  const grid = await build(`App [ width = 400, height = 300,
    cols: Dataset [ contents = { ({ a: 1 }) } ],
    DataGrid [ ] ]`);
  clean(grid);
  none(grid.warnings, /cols computes its value with contents/, grid);
  const real = await build(`App [ width = 200, height = 100,
    rows: Dataset [ contents = { ({ list: [] }) } ],
    View [ onClick() { app.rows.insert(["list"], 0, 1) } ] ]`);
  assert.ok(texts(real.warnings).some((m) => /rows computes its value with contents.*rows\.insert/.test(m)), texts(real.warnings).join("\n"));
});

await test("event-named method: a bare call in a class's child counts for the class; a dotted call for its receiver", async () => {
  const r = await build(`class Stepper2 [ change(d: number) { }, Button [ text = "+", onClick() { change(1) } ] ]
App [ width = 200, height = 100, Stepper2 [ ] ]`);
  none(r.errors, /Stepper2\.change\(…\) is never called/, r);
  const dotted = await build(`class Other2 [ change(d: number) { } ]
class Stepper3 [ change(d: number) { } ]
App [ width = 200, height = 100, other: Other2 [ ], Stepper3 [ ],
    View [ onClick() { app.other.change(2) } ] ]`);
  none(dotted.errors, /Other2\.change/, dotted);
  assert.ok(texts(dotted.errors).some((m) => /Stepper3\.change\(…\) is never called/.test(m)), texts(dotted.errors).join("\n"));
});

await test("a nested element's own dataset is its cursor's schema, not the root's of the same name", async () => {
  const src = (field) => `App [ width = 200, height = 100,
    items: Dataset [ schema = [ a: string ] ] { { "a": "x" } },
    View [ items: Dataset [ schema = [ b: string ] ] { { "b": "y" } },
        datapath = { this.items.value }, Text [ text = :${field} ] ] ]`;
  const ok = await build(src("b"));
  none(ok.errors, /not in the schema/, ok);
  const bad = await build(src("c"));
  assert.ok(texts(bad.errors).some((m) => /':c' — 'c' is not in the schema here; fields: b\b/.test(m)), texts(bad.errors).join("\n"));
});

await test("a class member shadows a script let: writing it writes the member", async () => {
  const r = await build(`script { let total = 0 }
class Counter [ total: number = 0, onClick() { total = total + 1 } ]
App [ width = 200, height = 100, Counter [ ] ]`);
  clean(r);
  assert.ok(texts(r.warnings).some((m) => /bare 'total' means Counter's member here/.test(m)), "the deliberate ambiguity warning stays");
  const write = await build(`script { let total = 0 }
App [ width = 200, height = 100, View [ onClick() { total = 1 } ] ]`);
  assert.ok(texts(write.errors).some((m) => /'total' is a script \{ \} variable/.test(m)), "a write to the script binding itself is still refused");
});

await test("a script type named like a library class is the script's own; like the program's class, a pointed error", async () => {
  const r = await build(`script { type Column = { key: string, w: number }
  function first(c: Column): string { return c.key } }
App [ width = 400, height = 300, DataGrid [ ], Text [ text = { first({ key: "a", w: 1 }) } ] ]`);
  clean(r);
  const own = await build(`script { type Card2 = { key: string } }
class Card2 [ ]
App [ width = 200, height = 100, Card2 [ ] ]`);
  assert.ok(texts(own.errors).some((m) => /script \{ \} declares the type 'Card2', and this program declares class Card2/.test(m)), texts(own.errors).join("\n"));
});

await test("a script binding named like a runtime body name is refused where it is declared", async () => {
  const r = await build(`script { function sepia(x: number): number { return x * 2 } }
App [ width = 200, height = 100, Text [ text = { "v" + sepia(2) } ] ]`);
  assert.ok(texts(r.errors).some((m) => /script \{ \} declares 'sepia', a name the runtime already gives every \{ \} body/.test(m)), texts(r.errors).join("\n"));
  assert.equal(r.source, null, "nothing is emitted that could not start");
});

await test("link is navigation only on a View; location only the App's; a comparison reads it", async () => {
  const node = await build(`class Note extends Node [ link: string = "" ]
App [ width = 200, height = 100, Note [ link = "#notes" ] ]`);
  none(node.errors, /names no declared destination/, node);
  const loc = await build(`App [ width = 200, height = 100,
    spot: View [ location: string = "here" ],
    page: View [ shows = "page", visible = { app.spot.location != "" } ],
    View [ onClick() { if (app.location == "#page") app.spot.location = "x" } ] ]`);
  clean(loc);
  none(loc.warnings, /reading location again/, loc);
  none(loc.warnings, /onClick writes app\.location/, loc);
  const gate = await build(`App [ width = 200, height = 100,
    page: View [ shows = "page", visible = { app.location != "" } ] ]`);
  assert.ok(texts(gate.warnings).some((m) => /reading location again/.test(m)), "the App's own location still warns");
});

await test("4012: another class's this.fade.start() does not start the App's fade", async () => {
  const r = await build(`class Other [ fade: Animator [ attribute = opacity, to = 0, duration = 100 ], go() { this.fade.start() } ]
App [ width = 200, height = 100,
    fade: Animator [ attribute = opacity, to = 0, duration = 100 ],
    Other [ ] ]`);
  const warned = texts(r.warnings).filter((m) => /nothing starts this Animator/.test(m));
  assert.equal(warned.length, 1, texts(r.warnings).join("\n"));
  const started = await build(`App [ width = 200, height = 100,
    fade: Animator [ attribute = opacity, to = 0, duration = 100 ],
    View [ onClick() { app.fade.start() } ] ]`);
  none(started.warnings, /nothing starts this Animator/, started);
});

await test("a subclass declared before its base inherits the base's methods", async () => {
  const r = await build(`class Sub extends Base2 [ onClick() { hello() } ]
class Base2 [ hello() { } ]
App [ width = 200, height = 100, Sub [ ] ]`);
  clean(r);
});

await test("a theme named like a library class says so, not 'did you mean' its own name", async () => {
  const r = await build(`theme Card [ ]
App [ width = 200, height = 100, Card [ ] ]`);
  const m = texts(r.errors);
  assert.ok(m.some((x) => /theme Card takes that name/.test(x)), m.join("\n"));
  assert.ok(!m.some((x) => /did you mean 'Card'/.test(x)), m.join("\n"));
});

summarize("name-scope");
