// A handler writes the record its view is showing with the spelling it reads
// it by: `:done = v`. The write lands in the dataset (Dataset.set, through the
// view's cursor), so everything reading that field follows in the same settle —
// the row never needs to know where in the collection it sits.
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
  return settleHeadless(r.source, { deps: r.deps });
}
async function errorsOf(src) {
  const r = await compile(src);
  return (r.errors ?? []).map((e) => e.message);
}
console.log("writing a record field from a handler");

await (async () => {
  const app = await build(`App [ width = 300, height = 300,
      d: Dataset { { "rows": [ { "id": 1, "done": false, "n": 1, "owner": { "name": "a" }, "tags": ["x", "y"] },
                               { "id": 2, "done": false, "n": 5, "owner": { "name": "b" }, "tags": ["z"] } ] } },
      open: number = { (app.d.value.rows).filter((r) => !r.done).length },
      col: View [ datapath = { app.d.value },
        View [ datapath = :rows[], height = 20,
          setDone(v: boolean) { :done = v },
          bump() { :n += 2 },
          inc() { :n++ },
          rename(s: string) { :owner.name = s },
          retag(s: string) { :tags[0] = s }
          ]
        ] ]`);
  const [r0, r1] = app.col.children;
  test("`:done = v` writes the row's own record, not another row's", () => {
    r1.setDone(true); settle();
    assert.equal(app.d.value.rows[1].done, true);
    assert.equal(app.d.value.rows[0].done, false);
  });
  test("…and a constraint reading the dataset follows in the same settle", () => {
    assert.equal(app.open, 1);
  });
  test("compound assignment reads and writes the same field", () => {
    r0.bump(); settle();
    assert.equal(app.d.value.rows[0].n, 3);
  });
  test("increment works on a field", () => {
    r1.inc(); settle();
    assert.equal(app.d.value.rows[1].n, 6);
  });
  test("a nested field", () => {
    r0.rename("ada"); settle();
    assert.equal(app.d.value.rows[0].owner.name, "ada");
  });
  test("a non-negative index", () => {
    r1.retag("q"); settle();
    assert.deepEqual(app.d.value.rows[1].tags, ["q"]);
  });
})();

await (async () => {
  const app = await build(`App [ width = 300, height = 300,
      d: Dataset { { "rows": [ { "id": 1, "done": false } ] } },
      col: View [ datapath = { app.d.value },
        View [ datapath = :rows[], height = 20,
          c: Checkbox [ checked = :done, input(v: boolean) { :done = v } ]
          ]
        ] ]`);
  test("a Checkbox in a repeated row edits its record through input(v)", () => {
    app.col.children[0].c.press(); settle();
    assert.equal(app.d.value.rows[0].done, true);
    assert.equal(app.col.children[0].c.checked, true, "and the box reads the record back");
  });
})();

await (async () => {
  const app = await build(`schema Task [ id: number, done: boolean ]
    App [ width = 300, height = 300,
      d: Dataset [ schema = [ rows[]: Task ] ] { { "rows": [ { "id": 1, "done": false } ] } },
      col: View [ datapath = { app.d.value },
        View [ datapath = :rows[], height = 20, wrong() { :done = "yes" } ] ] ]`);
  test("under a schema the write is held to it, as set() is", () => {
    assert.throws(() => app.col.children[0].wrong(), /done/);
  });
})();

await (async () => {
  const errs = await errorsOf(`App [ d: Dataset { { "a": 1 } }, datapath = { app.d.value }, n: number = { :a = 2 } ]`);
  test("assigning a :path inside a { } value is refused", () => {
    assert.ok(errs.some((m) => /only reads data/.test(m)), errs.join(" | "));
  });
})();
await (async () => {
  const errs = await errorsOf(`App [ go() { :a = 2 } ]`);
  test("with no datapath above, the write is refused and says why", () => {
    assert.ok(errs.some((m) => /no record to write/.test(m)), errs.join(" | "));
  });
})();
await (async () => {
  const errs = await errorsOf(`App [ d: Dataset { { "rows": [ { "a": 1 } ] } }, datapath = { app.d.value },
      go() { :rows[1:2] = 3 } ]`);
  test("a slice is not one place", () => {
    assert.ok(errs.some((m) => /does not name one place/.test(m)), errs.join(" | "));
  });
})();
await (async () => {
  const app = await build(`class Mark [ seen() { :seen = true } ]
    App [ width = 300, height = 300,
      d: Dataset { { "rows": [ { "id": 1, "seen": false, "x": 0 } ] } },
      col: View [ datapath = { app.d.value },
        View [ datapath = :rows[], height = 20,
          mark: Mark [ ],
          s: Spring [ attribute = y, to = 10, onStop() { :x = 1 } ]
          ]
        ] ]`);
  test("a Node member of a row writes the row's record, as its reads climb", () => {
    app.col.children[0].mark.seen(); settle();
    assert.equal(app.d.value.rows[0].seen, true);
  });
})();
await (async () => {
  // A model class stands on one record with no view involved: its own datapath,
  // its declarations derived from the record, its methods writing it back.
  const app = await build(`class TaskModel [
      overdue: boolean = { :due < app.today },
      title: string = { "" + :title },
      finish() { :done = true },
      mark: Mark [ ]
      ]
    class Mark extends View [ width = 10, height = 10, seen: boolean = { :done == true } ]
    App [ width = 300, height = 300, today: number = 5, pick: number = 0,
      d: Dataset { { "tasks": [ { "id": 1, "title": "a", "due": 3, "done": false },
                                { "id": 2, "title": "b", "due": 9, "done": false } ] } },
      sel: TaskModel [ datapath = { app.d.value.tasks[app.pick] } ] ]`);
  test("a Node with its own datapath reads its record", () => {
    assert.equal(app.sel.title, "a");
    assert.equal(app.sel.overdue, true);
  });
  test("…writes it back from a method", () => {
    app.sel.finish(); settle();
    assert.equal(app.d.value.tasks[0].done, true);
  });
  test("…and a view inside the model reads the same record", () => {
    assert.equal(app.sel.mark.seen, true);
  });
  test("re-pointing the cursor moves the whole model to another record", () => {
    app.pick = 1; settle();
    assert.equal(app.sel.title, "b");
    assert.equal(app.sel.overdue, false);
    assert.equal(app.sel.mark.seen, false);
  });
})();
await (async () => {
  const errs = await errorsOf(`class M [ n: number = 0 ]
    App [ d: Dataset { { "rows": [ { "id": 1 } ] } }, col: View [ datapath = { app.d.value }, M [ datapath = :rows[] ] ] ]`);
  test("a model class cannot replicate (only a view does) — and says what to write instead", () => {
    assert.ok(errs.some((m) => /only a view replicates/.test(m)), errs.join(" | "));
  });
})();
await (async () => {
  const r = await compile(`class Row extends View [ height = 20, flip() { :done = !:done } ]
    App [ width = 100, height = 100 ]`);
  test("a class body writes without a cursor in sight — its use site supplies one", () => {
    assert.deepEqual((r.errors ?? []).map((e) => e.message), []);
  });
})();
await (async () => {
  const r = await compile(`App [ d: Dataset { { "a": 1 } }, datapath = { app.d.value },
      n: number = 0, go() { if (:a == 1) app.n = 2 } ]`);
  test("a comparison is a read, not a write", () => {
    assert.deepEqual((r.errors ?? []).map((e) => e.message), []);
  });
})();

console.log("\nthe record itself (:@) and computed keys ([( expr )])");

await (async () => {
  const app = await build(`App [ width = 300, height = 300,
      d: Dataset { { "tags": ["design", "draft"],
                     "rows": [ { "id": 1, "name": "a", "n": 1 }, { "id": 2, "name": "b", "n": 2 } ],
                     "scores": [0.5, 0.25] } },
      field: string = "name",
      pick: number = 1,
      opened: string = "",
      open(r: object) { opened = "" + (r as any).name },
      col: View [ datapath = { app.d.value },
        tags: View [ Text [ datapath = :tags[], text = :@ ] ],
        pct: View [ Text [ datapath = :scores[], text = { (:@ * 100) + "%" } ] ],
        rows: View [ View [ datapath = :rows[], height = 10,
            label: string = { "" + :@[(app.field)] },
            rename(v: string) { :@[(app.field)] = v },
            bump() { :@[("n")] += 10 },
            report() { app.open(:@) },
            reset() { :@ = ({ id: 9, name: "z", n: 0 }) }
            ] ],
        chosen: Text [ text = { "" + :rows[(app.pick)].name } ],
        nested: Text [ datapath = :rows[0], keyName: string = "name", text = { "" + :@[(:name == "a" ? keyName : "n")] } ]
        ] ]`);
  const col = app.col;
  test("`text = :@` shows a scalar record — each tag is its own record", () => {
    assert.deepEqual(col.tags.children.map((t) => t.text), ["design", "draft"]);
  });
  test("`:@` in a { } computes with a record that is a number", () => {
    assert.deepEqual(col.pct.children.map((t) => t.text), ["50%", "25%"]);
  });
  const [r0, r1] = col.rows.children;
  test("`:@[(expr)]` reads the field the expression names, and follows the expression", () => {
    assert.equal(r0.label, "a");
    app.field = "n"; settle();
    assert.equal(r0.label, "1");
    app.field = "name"; settle();
  });
  test("`:@[(expr)] = v` writes that field of this row's record", () => {
    r1.rename("bee"); settle();
    assert.equal(app.d.value.rows[1].name, "bee");
    assert.equal(r1.label, "bee");
  });
  test("a computed key takes compound assignment", () => {
    r0.bump(); settle();
    assert.equal(app.d.value.rows[0].n, 11);
  });
  test("`:@` hands the whole record to a method", () => {
    r0.report(); settle();
    assert.equal(app.opened, "a");
  });
  test("a computed index mid-path — `:rows[(app.pick)].name` — follows the index", () => {
    assert.equal(col.chosen.text, "bee");
    app.pick = 0; settle();
    assert.equal(col.chosen.text, "a");
  });
  test("a key may itself read the record", () => {
    assert.equal(col.nested.text, "a");
  });
  test("`:@ = r` replaces the record", () => {
    r1.reset(); settle();
    assert.equal(app.d.value.rows[1].name, "z");
  });
})();

await (async () => {
  test("a computed key in a bare slot is sent to the braces form", async () => {});
  const errs = await errorsOf(`App [ d: Dataset { { "r": { "a": 1 } } }, v: View [ datapath = { app.d.value.r }, Text [ text = :@[(k)] ] ] ]`);
  test("…with the rewrite named", () => {
    assert.ok(errs.some((m) => /computed key \[\( … \)\] is TypeScript/.test(m)), errs.join("\n"));
  });
  const vErrs = await errorsOf(`App [ d: Dataset { { "r": { "a": 1 } } }, v: View [ datapath = { app.d.value.r }, n: number = { :@[("a")] = 2 } ] ]`);
  test("a { } value may not assign `:@[(k)]`", () => {
    assert.ok(vErrs.length > 0, "refused");
  });
})();

console.log(`path-write: ${pass} passed, ${fail} failed`);
// the Checkbox press leaves an animation timer armed; the verdict is in
process.exit(fail ? 1 : 0);
