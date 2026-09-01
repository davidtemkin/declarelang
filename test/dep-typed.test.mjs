// TYPED method residence in dep-extract (task #25, 2026-08-20). Method calls
// used to resolve by NAME alone — a name-keyed map where the last same-named
// definition silently won — so declaring a node verb `open` re-aimed every
// `.open()` call in the compile (the combobox's own included) at the new
// body, surfacing as phantom residue errors positioned inside library source.
// Now a call resolves by (receiver's element/class chain, name); a receiver
// unresolvable HERE is typed by the CHECKER (L-21, RULED 2026-09-01: TS
// semantics, answered from the typecheck's own ts.Program — the declared
// class plus its override closure, or the exact instance method); a receiver
// TS calls `any` sends the constraint to the runtime tracking path (the
// ~dynamic sentinel), so no stranger's body is ever walked and no phantom
// error can leave its family; a knowable receiver with NO such method
// contributes nothing.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

async function boot(src) {
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);
  const app = instantiate(program);
  settle();
  return app;
}

await test("same-named methods on different classes wire their OWN reads", async () => {
  // Under last-wins, `outA`'s constraint followed Beta.probe (the later
  // definition), read `this.w`, rebased it to app.a.w — a slot Alpha does not
  // have — and the compile REFUSED a perfectly legal program.
  const app = await boot(`
class Alpha extends Node [ v: number = 1, probe() -> number { return this.v * 2 } ]
class Beta extends Node [ w: number = 10, probe() -> number { return this.w * 3 } ]
App [ width = 100, height = 100,
    a: Alpha [ ], b: Beta [ ],
    outA: Text [ text = { "" + app.a.probe() } ],
    outB: Text [ text = { "" + app.b.probe() } ],
    ]`);
  assert.equal(app.outA.text, "2");
  assert.equal(app.outB.text, "30");
  // each constraint re-derives from ITS residence's reads…
  app.a.v = 5;
  settle();
  assert.equal(app.outA.text, "10", "Alpha's read wired to Alpha's slot");
  assert.equal(app.outB.text, "30", "…and Beta's constraint did not stir");
  app.b.w = 20;
  settle();
  assert.equal(app.outB.text, "60", "Beta's read wired to Beta's slot");
  assert.equal(app.outA.text, "10");
});

await test("an unanalyzable same-named neighbor no longer poisons the compile", async () => {
  // Gamma.report aggregates over .children — genuinely unanalyzable, refused
  // IF a constraint reaches it. Alpha's same-named report must not inherit
  // that refusal: the receiver types the call.
  const app = await boot(`
class Alpha extends Node [ v: number = 7, report() -> number { return this.v } ]
class Gamma extends View [ report() -> number { return this.children.filter((c) => c.visible).length } ]
App [ width = 100, height = 100,
    a: Alpha [ ], g: Gamma [ ],
    out: Text [ text = { "" + app.a.report() } ],
    ]`);
  assert.equal(app.out.text, "7");
  app.a.v = 9;
  settle();
  assert.equal(app.out.text, "9", "the typed residence wired");
});

await test("inherited methods resolve up the class chain", async () => {
  const app = await boot(`
class Base extends Node [ n: number = 3, twice() -> number { return this.n * 2 } ]
class Sub extends Base [ ]
App [ width = 100, height = 100,
    s: Sub [ ],
    out: Text [ text = { "" + app.s.twice() } ],
    ]`);
  assert.equal(app.out.text, "6");
  app.s.n = 5;
  settle();
  assert.equal(app.out.text, "10", "the base-chain method's read wired through the subclass instance");
});

await test("a faceless node has a lifecycle — onInit fires, depth-first", async () => {
  // the walk skipped every non-View child until 2026-08-20, so a node's
  // onInit silently never ran (Node.md promised it all along)
  const app = await boot(`
class Inner extends Node [ mark: string = "", onInit() { this.mark = "inner" } ]
class Brain extends Node [ log: string = "",
    inner: Inner [ ],
    onInit() { this.log = this.inner.mark + ";brain" }
    ]
App [ width = 100, height = 100,
    brain: Brain [ ],
    out: Text [ text = { app.brain.log } ],
    ]`);
  assert.equal(app.out.text, "inner;brain", "children first, then the node — initTree's own order");
});

await test("a CAST receiver resolves to its class — TS semantics — and never a same-named stranger's family", async () => {
  // `(childViews[0] as Chip).boost()` — textually unknowable (an indexed
  // receiver), typed exactly by the checker through the cast. The oracle
  // follows Chip's family alone: the old union would have walked Motor's
  // same-named verb too and wired its reads into a stranger's constraint.
  const src = `
class Chip extends View [
    boost() -> number { return app.gain * 2 },
    ]
class Motor extends Node [
    boost() -> number { return app.rpm * 3 },
    ]
App [ width = 100, height = 100,
    gain: number = 1, rpm: number = 1,
    chip: Chip [ width = 10, height = 10 ],
    m: Motor [ ],
    out: Text [ text = { "" + (app.childViews[0] as Chip).boost() } ],
    ]`;
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  const flat = JSON.stringify(r.deps);
  assert.ok(flat.includes("gain"), "the cast family's read is wired: " + flat);
  assert.ok(!flat.includes("rpm"), "…and the stranger's read is NOT (the union would have leaked it): " + flat);
  const app = await boot(src);
  assert.equal(app.out.text, "2");
  app.gain = 5;
  settle();
  assert.equal(app.out.text, "10", "the family's input is a live edge");
  app.rpm = 100;
  settle();
  assert.equal(app.out.text, "10", "the stranger's input does not stir it");
});

await test("an `any` receiver goes to the tracking path — no union, no stranger's body, still live", async () => {
  // TWO classes declare open(); the constraint reaches open() through a chain
  // the checker types `any` (an object slot behind a cast). The old union
  // followed every same-named body and could export another family's
  // resolution errors; now the constraint goes DYNAMIC — empty deps — and the
  // runtime's tracking keeps it live where static wiring cannot see.
  const src = `
class Widgetry extends View [
    grow: Animator [ attribute = height, to = 180 ],
    open() { this.grow.start() },
    ]
class Doc extends Node [
    opens: number = 0,
    open(v: View?) -> number { return this.opens + 1 },
    ]
App [ width = 200, height = 100,
    current: Doc [ ],
    w: Widgetry [ width = 10, height = 10 ],
    bag: object = null,
    onInit() { this.bag = ({ x: this.current }) },
    status: Text [ text = { app.bag != null ? "" + (app.bag as any).x.open(null) : "-" } ],
    ]`;
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "no phantom from a stranger's body: " + r.errors.map((e) => e.message).join("; "));
  assert.deepEqual(r.deps, [[]], "the constraint went dynamic (empty deps), not unioned: " + JSON.stringify(r.deps));
  const app = await boot(src);
  assert.equal(app.status.text, "1");
  app.current.opens = 5;
  settle();
  assert.equal(app.status.text, "6", "tracking observed the read through the any-typed chain — live, not stale");
});

await test("L-20: a pointer slot repoints live — and the through-read follows the NEW node, not the old", async () => {
  const src = `
class Doc extends Node [ hue: number = 3 ]
App [ width = 100, height = 100,
    a: Doc [ hue = 5 ], b: Doc [ hue = 7 ],
    which: boolean = true,
    ap: Doc = { this.which ? this.a : this.b },
    out: Text [ text = { "" + app.ap!.hue } ],
    ]`;
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
  assert.deepEqual(r.deps[r.deps.length - 1], [], "the through-read rides tracking (a prewired edge would pin the old node)");
  const app = await boot(src);
  assert.equal(app.out.text, "5");
  app.which = false; settle();
  assert.equal(app.out.text, "7", "repointing wakes the reader");
  app.b.hue = 9; settle();
  assert.equal(app.out.text, "9", "the NEW node's cell is live after the repoint");
  app.a.hue = 100; settle();
  assert.equal(app.out.text, "9", "…and the OLD node's no longer stirs it");
});

await test("L-24: reading through an opaque return (find over an array) is legal and live", async () => {
  const src = `
class Doc extends Node [ id: string = "", hue: number = 3 ]
App [ width = 100, height = 100,
    a: Doc [ id = "a", hue = 5 ], b: Doc [ id = "b", hue = 7 ],
    roster: object = null,
    onInit() { this.roster = [this.a, this.b] },
    byId(id: string) -> Doc { const r = this.roster as any; return r != null ? r.find((d) => (d as any).id == id) : null },
    out: Text [ text = { app.roster != null ? "" + app.byId("b")!.hue : "-" } ],
    ]`;
  const r = await compile(src, {});
  assert.equal(r.errors.length, 0, "the accessor-farm shape compiles: " + r.errors.map((e) => e.message).join("; "));
  assert.deepEqual(r.deps[r.deps.length - 1], [], "dynamic — tracking, not refusal");
  const app = await boot(src);
  assert.equal(app.out.text, "7");
  app.b.hue = 12; settle();
  assert.equal(app.out.text, "12", "the found node's cell is observed by tracking — live");
});

summarize("dep-typed");
