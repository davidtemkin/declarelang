// A declared default whose type is a schema (`picked: Item? = { … }`) stands as a
// rule like any other declared default: evaluated once per input change, and still
// following its inputs after its first value lands. Its push hook writes a tracked
// view back to the raw record as the rule's own write, so the rule keeps the slot;
// a reader of the record still hears an edit to it in the dataset.
import assert from "node:assert";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { settle } from "../runtime/dist/reactive.js";
import { provideMeasurer } from "../runtime/dist/measure.js";
provideMeasurer({ set font(_) {}, set letterSpacing(_) {}, measureText: (t) => ({ width: t.length * 7, fontBoundingBoxAscent: 11, fontBoundingBoxDescent: 3, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }) });
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok —", name); }
  catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); }
}
async function build(src) {
  const r = await compile(src);
  assert.deepEqual((r.errors ?? []).map((e) => e.message), [], "compiles");
  return settleHeadless(r.program);
}
console.log("a schema-typed declared default stands as a rule");

const app = await build(`schema Item [ name: string, n: number ]
App [ width = 300, height = 100,
    d: Dataset [ schema = [ items[]: Item ] ] { { "items": [ { "name": "a", "n": 1 }, { "name": "b", "n": 2 }, { "name": "c", "n": 3 } ] } },
    sel: number = 0,
    picked: Item? = { app.d.value.items[app.sel] },
    made: Item = { ({ name: "m", n: app.sel * 10 }) },
    label: Text [ text = { app.picked == null ? "" : app.picked.name + app.picked.n } ],
    madeLabel: Text [ text = { app.made.name + app.made.n } ]
    ]`);

test("its first value lands", () => {
  assert.equal(app.picked.name, "a");
  assert.equal(app.label.text, "a1");
});

test("it follows its input after the first landing", () => {
  app.sel = 1; settle();
  assert.equal(app.picked.name, "b");
  assert.equal(app.label.text, "b2");
  app.sel = 2; settle();
  assert.equal(app.label.text, "c3");
});

test("a computed record follows its inputs, and reads as the plain object it is", () => {
  assert.equal(app.madeLabel.text, "m20");
  app.sel = 1; settle();
  assert.equal(app.madeLabel.text, "m10");
  app.sel = 2; settle();
  assert.equal(app.madeLabel.text, "m20");
});

test("an edit to the picked record reaches a reader of it", () => {
  app.d.set(["items", 2, "name"], "z"); settle();
  assert.equal(app.label.text, "z3");
});

test("an assignment replaces the rule, as for any declared default", () => {
  app.picked = null; settle();
  assert.equal(app.label.text, "");
  app.sel = 0; settle();
  assert.equal(app.label.text, "", "the assigned value stands");
});

console.log(`\nschema-default-rule: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
