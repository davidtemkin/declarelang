// The change event: `trackChanges = [ … ]` names a node's own reactive values,
// and `onChange(e: ChangeEvent)` fires at the CLOSE of any settle in which one
// of them ended different from where it started — ONE call per settle carrying
// every value that moved, in the order the names were written. Silent at boot;
// every change a handler's assignment causes in a later round of the settle is heard
// too; a handler doesn't assign what it tracks (refused at compile time, where
// the code shows it); an update whose handlers never rest stops, naming them.
import assert from "node:assert";
import { compile, settleHeadless } from "../compiler/dist/compile-node.js";
import { settle, observe } from "../runtime/dist/reactive.js";
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
const errorsOf = async (src) => ((await compile(src)).errors ?? []).map((e) => e.message);
console.log("the change event — trackChanges + onChange");

await (async () => {
  const app = await build(`App [ width = 300, height = 300,
    n: number = 0,
    calls: number = 0,
    kind: string = "text",
    log: string = "",
    // a tracked value may be a CONSTRAINT: the event reports the settled result
    twice: number = { app.n * 2 },
    trackChanges = [ "twice", "kind" ],
    onChange(e: ChangeEvent) {
        app.calls = app.calls + 1
        for (const c of e.changed) { app.log = app.log + c.name + ":" + c.previousValue + ">" + c.currentValue + " " }
        },
    box: View [ width = { app.twice } ]
  ]`);
  test("boot is silent: first values are not changes", () => {
    assert.equal(app.calls, 0);
    assert.equal(app.twice, 0);
  });
  test("a settle that moves a tracked value fires once, with previous and current", () => {
    app.n = 5; settle();
    assert.equal(app.calls, 1);
    assert.equal(app.log, "twice:0>10 ");
    assert.equal(app.box.width, 10, "the handler ran after the settle: every reader already holds the new value");
  });
  test("a settle that moves nothing tracked fires nothing", () => {
    app.log = ""; app.n = 5; settle();
    assert.equal(app.calls, 1);
    app.log = "x"; settle();                    // an untracked write
    assert.equal(app.calls, 1);
  });
  test("a value that moves and moves back inside one settle is not a change", () => {
    app.log = ""; app.n = 7; app.n = 5; settle();
    assert.equal(app.calls, 1);
  });
  test("two values moving in one settle are ONE call carrying both, in list order", () => {
    app.log = ""; app.n = 1; app.kind = "photo"; settle();
    assert.equal(app.calls, 2, "one more call, not two");
    assert.equal(app.log, "twice:10>2 kind:text>photo ");
  });
  test("a value that moves twice inside one settle reports the first and the last", () => {
    app.log = ""; app.n = 4; app.n = 9; settle();
    assert.equal(app.log, "twice:2>18 ");
  });
})();

await (async () => {
  // a handler that writes ANOTHER node's tracked value: the second fires in the
  // next pass of the same settle() call, in order, and the chain converges
  const app = await build(`App [ width = 300, height = 300,
    log: string = "",
    a: number = 0,
    b: number = 0,
    trackChanges = [ "a" ],
    onChange(e: ChangeEvent) { app.log = app.log + "A" + e.changed[0].currentValue; app.child.v = (e.changed[0].currentValue as number) + 1 },
    child: View [ v: number = 0, trackChanges = [ "v" ],
      onChange(e: ChangeEvent) { app.log = app.log + "C" + e.changed[0].currentValue; app.b = (e.changed[0].currentValue as number) * 10 } ]
  ]`);
  test("a handler's write chains into the next pass; the chain converges", () => {
    app.a = 1; settle();
    assert.equal(app.log, "A1C2");
    assert.equal(app.b, 20, "the second handler's write settled too");
  });
})();

await (async () => {
  // a value stepped toward a target by its own consequence: every change in
  // the update is delivered, so the steps run until it arrives
  const app = await build(`App [ width = 300, height = 300,
    raw: number = 0, fires: number = 0,
    level: number = { app.raw },
    trackChanges = [ "level" ],
    onChange(e: ChangeEvent) { app.fires = app.fires + 1; if (this.level < 5) app.raw = this.level + 1 }
  ]`);
  test("a change caused in a later round of the settle is delivered too", () => {
    app.raw = 1; settle();
    assert.equal(app.raw, 5, "each step was heard, to the end");
    assert.equal(app.fires, 5, "1, 2, 3, 4, 5: one call per round");
  });
})();

await (async () => {
  // the history mirror's vantage: an observer that waits for the whole settle
  const app = await build(`App [ width = 300, height = 300,
    raw: number = 0,
    level: number = { app.raw },
    trackChanges = [ "level" ],
    onChange(e: ChangeEvent) { if (this.level < 5) app.raw = this.level + 1 }
  ]`);
  test("an observer at the settle's end hears it once, with the final value (history: one entry per settle)", () => {
    const perRound = [], atEnd = [];
    const a = observe(() => app.raw, (v) => perRound.push(v), "t:round");
    const b = observe(() => app.raw, (v) => atEnd.push(v), "t:end", true);
    try { app.raw = 1; settle(); app.raw = 0; app.raw = 5; settle(); }
    finally { a(); b(); }
    assert.deepEqual(atEnd, [5], "once, where it ended; a settle that ends where it began says nothing");
    assert.deepEqual(perRound, [1, 2, 3, 4, 5], "the per-round observer heard every round");
  });
})();

await (async () => {
  // a ring that never rests: A's handler moves B, B's moves A
  const app = await build(`App [ width = 300, height = 300,
    a: number = 0,
    trackChanges = [ "a" ],
    onChange(e: ChangeEvent) { app.child.v = this.a + 1 },
    child: View [ v: number = 0, trackChanges = [ "v" ],
      onChange(e: ChangeEvent) { app.a = this.v + 1 } ]
  ]`);
  test("a settle whose handlers never come to rest stops, naming them", () => {
    app.a = 1;
    assert.throws(() => settle(), (e) => /change handlers kept one settle going for 100 rounds — .*app's onChange \(\d+ times\).*app\.child's onChange \(\d+ times\)|change handlers kept one settle going for 100 rounds — .*app\.child's onChange \(\d+ times\).*app's onChange/.test(e.message), "the error names both handlers");
  });
  test("what was assigned before the stop stands", () => {
    assert.ok(app.a > 1);
  });
})();

await (async () => {
  for (const body of ["this.a = 99", "a = 99", "app.a = 99"]) {
    const errs = await errorsOf(`App [ width = 300, height = 300, a: number = 0, b: number = 0,
      trackChanges = [ "a" ],
      onChange(e: ChangeEvent) { ${body} } ]`);
    test(`'${body}' in onChange, with a tracked: refused`, () => {
      assert.ok(errs.some((m) => /App\.onChange assigns 'a', which it tracks/.test(m)), errs.join("\n"));
    });
  }
  const ok = await errorsOf(`App [ width = 300, height = 300, a: number = 0, b: number = 0,
    trackChanges = [ "a" ],
    onChange(e: ChangeEvent) { const a = 3; this.b = a; app.b = this.a } ]`);
  test("assigning a different value, or a local of the same name, is allowed", () => {
    assert.deepEqual(ok, []);
  });
})();

await (async () => {
  // an assignment the compiler can't see (through a method) runs; one that
  // comes to rest — a clamp — ends the update in two settles
  const app = await build(`App [ width = 300, height = 300,
    zoom: number = 1, fires: number = 0,
    trackChanges = [ "zoom" ],
    clamp() { this.zoom = Math.min(this.zoom, 8) },
    onChange(e: ChangeEvent) { app.fires = app.fires + 1; this.clamp() }
  ]`);
  test("a correction through a method runs and comes to rest", () => {
    app.zoom = 20; settle();
    assert.equal(app.zoom, 8);
    assert.equal(app.fires, 2, "told 1→20, then 20→8 in the next round; the second clamp assigns nothing");
  });
})();

await (async () => {
  // a DATA-BOUND attribute: the record's field changes, the attribute follows,
  // the node hears it — the one door for hearing data
  const app = await build(`class Row extends View [ kind: string = { :kind }, trackChanges = [ "kind" ],
      onChange(e: ChangeEvent) { app.log = app.log + :id + ":" + e.changed[0].previousValue + ">" + e.changed[0].currentValue + " " } ]
  App [ width = 300, height = 300,
    log: string = "",
    d: Dataset { { "rows": [ { "id": "a", "kind": "text" }, { "id": "b", "kind": "photo" } ] } },
    col: View [ datapath = { app.d.value },
      Row [ datapath = :rows[], identityKey = :id ]
    ]
  ]`);
  test("a data-bound attribute under trackChanges reports the record's change", () => {
    app.d.set(["rows", 0, "kind"], "voice"); settle();
    assert.equal(app.log, "a:text>voice ");
  });
})();

await (async () => {
  const r = await compile(`App [ width = 300, height = 300, trackChanges = [ "nope" ], onChange(e: ChangeEvent) { } ]`);
  test("the checker refuses a name that is not one of the node's values", () => {
    assert.ok((r.errors ?? []).some((e) => /trackChanges: 'nope' is not a reactive value/.test(e.message)), JSON.stringify(r.errors));
  });
  const ok = await compile(`App [ width = 300, height = 300, k: string = "", trackChanges = [ "k", "width" ], onChange(e: ChangeEvent) { } ]`);
  test("a declared attribute and a schema attribute both pass", () => {
    assert.deepEqual(ok.errors ?? [], []);
  });
  const dyn = await compile(`App [ width = 300, height = 300, a: number = 0,
    trackChanges = { [ "a", "nosuch" ] }, onChange(e: ChangeEvent) { } ]`);
  test("a COMPUTED list compiles, and the runtime refuses its unknown name loudly", () => {
    assert.deepEqual(dyn.errors ?? [], [], "the compiler cannot see a computed list");
    assert.throws(() => settleHeadless(dyn.program),
                  /trackChanges: 'nosuch' is not a value of/);
  });
})();

// A list of names is a literal on every node — a DataSource, a stream — not only
// on a view: a request that fails is heard once, through `failed`.
await (async () => {
  const { provideTransport } = await import("../runtime/dist/data.js");
  const prev = provideTransport(async () => ({ ok: false, status: 500, text: async () => "{\"message\":\"nope\"}" }));
  try {
    const app = await build(`App [ width = 100, height = 100, heard: number = 0,
      src: DataSource [ url = "/x", trackChanges = [ "failed" ],
          onChange(e: ChangeEvent) { if (this.failed) app.heard = app.heard + 1 } ],
      feed: EventStream [ listenTo = [ "delta", "done" ] ] ]`);
    app.src.fetch();
    await new Promise((r) => setTimeout(r, 10)); settle();
    test("trackChanges = [ … ] on a DataSource hears the failure", () => {
      assert.equal(app.heard, 1);
      assert.equal(app.src.errorBody.message, "nope");
    });
    test("listenTo = [ … ] on a stream is the list it names", () => {
      assert.deepEqual([...app.feed.listenTo], ["delta", "done"]);
    });
  } finally { provideTransport(prev); }
})();

console.log(`change-event: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
