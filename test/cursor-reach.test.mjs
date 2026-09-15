// A `:path` on a non-view member (2026-09-14): a cursor belongs to a VIEW, and
// the members that want to read one are often not views — a Spring's target, a
// Time's gate, a DataSource's url. Those are members OF a view, so the read
// climbs to the nearest view that has a cursor, at any depth of non-view
// nesting. The WRITE half stays on the view.
//
// Two independent eval runs wrote the refused form before this landed, which is
// what made it worth changing: nothing had ever ruled it out — the refusal fell
// out of `$data` living on View, and surfaced as a TypeScript error we had
// rewritten into a friendly sentence.
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
console.log("a cursor read from a non-view member");

await (async () => {
  const app = await build(`class Row extends View [ width = 100, height = 20,
      move: Spring [ attribute = y, to = { :rank * 20 } ],
      beat: Time [ tick = frame, running = { :typing } ],
      group: AnimatorGroup [
        deep: Spring [ attribute = opacity, to = { :unread > 0 ? 1 : 0.4 } ]
        ]
      ]
    App [ width = 300, height = 300,
      d: Dataset { { "rows": [ { "id": "a", "rank": 2, "typing": false, "unread": 0 } ] } },
      col: View [ datapath = { app.d.value }, Row [ datapath = :rows[], key = :id ] ] ]`);
  const row = app.col.children[0];
  test("a Spring reads the row's record for its target", () => {
    assert.equal(row.move.to, 40, "rank 2 × 20");
  });
  test("…and RE-TARGETS when the record changes (the edge is real, not a boot read)", () => {
    app.d.set(["rows", 0, "rank"], 5); settle();
    assert.equal(row.move.to, 100);
  });
  test("a non-animator member reads it too — a Time's gate", () => {
    assert.equal(row.beat.running, false);
    app.d.set(["rows", 0, "typing"], true); settle();
    assert.equal(row.beat.running, true);
  });
  test("two levels of non-view nesting resolve to the same view", () => {
    // addressed through the group's children: an AnimatorGroup does not install
    // its members by name (pre-existing, unrelated to the cursor reach)
    const deep = row.group.children[0];
    assert.equal(deep.to, 0.4);
    app.d.set(["rows", 0, "unread"], 3); settle();
    assert.equal(deep.to, 1, "the spring two levels down re-targets from the same record");
  });
})();

await (async () => {
  // no cursor anywhere above: the read answers null, exactly as a view with no
  // datapath does — not an error, and not a crash
  const app = await build(`App [ width = 100, height = 100,
      n: number = 0,
      s: Spring [ attribute = n, to = { :nothing == null ? 7 : 0 } ] ]`);
  test("no cursor above: the read is null, and nothing throws", () => {
    assert.equal(app.s.to, 7);
  });
})();

await (async () => {
  const r = await compile(`class Row extends View [ width = 100, height = 20,
      f: TextInput [ width = 80, text <-> :name ] ]
    App [ width = 300, height = 300,
      d: Dataset { { "rows": [ { "id": "a", "name": "x" } ] } },
      col: View [ datapath = { app.d.value }, Row [ datapath = :rows[], key = :id ] ] ]`);
  test("the WRITE half still belongs to a view: a two-way path on a leaf input compiles", () => {
    assert.deepEqual(r.errors ?? [], []);
  });
})();

console.log(`cursor-reach: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
