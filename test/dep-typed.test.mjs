// TYPED method residence in dep-extract (task #25, 2026-08-20). Method calls
// used to resolve by NAME alone — a name-keyed map where the last same-named
// definition silently won — so declaring a node verb `open` re-aimed every
// `.open()` call in the compile (the combobox's own included) at the new
// body, surfacing as phantom residue errors positioned inside library source.
// Now a call resolves by (receiver's element/class chain, name); an
// unresolvable receiver falls back to the union of every candidate (sound);
// a knowable receiver with NO such method contributes nothing.
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

summarize("dep-typed");
