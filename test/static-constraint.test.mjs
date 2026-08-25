// static-constraint — validates the runtime STATIC-CONSTRAINT PATH: constraints
// whose deps the compiler extracted are wired once (no per-run re-tracking) and
// still behave identically — updates propagate, precision holds, and the path is
// actually taken (not silently falling back). The reactive hot path, on rails.
import assert from "node:assert";
import { compile } from "../compiler/dist/compile-node.js";
import { annotateProgram } from "../compiler/dist/dep-extract.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle, build, serializeDeps, applyDeps, forEachCodeValue } from "../runtime/dist/index.js";
import { Clock, setClock } from "../runtime/dist/animate.js";

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok —", name); } catch (e) { fail++; console.log("  FAIL —", name, "\n     ", e.message); } }

// compile → resolve → ANNOTATE deps → instantiate (the static path is active).
async function run(src) {
  const r = await compile(src, {});
  if (!r.source) throw new Error("compile: " + r.errors.map((e) => e.message).join("; "));
  const prog = parseProgram(r.source);
  const { errors } = annotateProgram(prog);
  if (errors.length) throw new Error("residue: " + errors.map((e) => e.where + " " + e.message).join("; "));
  const app = instantiate(prog);
  settle();
  return app;
}
const owner = (node, attr) => node.$owners?.[attr];

/** A driven frame source, so animator motion is stepped rather than waited on
 *  (the same shape unit.test.mjs uses for the motion core). */
function fakeScheduler() {
  let cb = null, handle = 0, last = 0;
  return {
    now: () => last,
    request(fn) { cb = fn; return ++handle; },
    cancel() { cb = null; },
    frame(now) { const fn = cb; cb = null; if (fn) { last = now; fn(now); } },
    get scheduled() { return cb !== null; },
  };
}

console.log("static-constraint");

test("annotated constraints are actually on the STATIC path (not falling back)", async () => {
  const app = await run(`App [ n: number = 3, v: View [ width = { app.n * 10 } ] ]`);
  const k = owner(app.v, "width");
  assert.ok(k, "width should be constraint-owned");
  assert.equal(k.isStatic, true, "constraint should be wired on the static path");
  assert.equal(app.v.width, 30, "initial value computed");
});

test("a static constraint recomputes when its dep changes", async () => {
  const app = await run(`App [ n: number = 3, v: View [ width = { app.n * 10 } ] ]`);
  app.n = 7; settle();
  assert.equal(app.v.width, 70, "static edge propagated the change");
});

test("interprocedural static constraint tracks deps read INSIDE the method", async () => {
  const app = await run(`App [ a: number = 1, b: number = 2,
      v: View [ width = { app.sum() } ],
      sum() { return this.a + this.b } ]`);
  assert.equal(owner(app.v, "width").isStatic, true);
  assert.equal(app.v.width, 3);
  app.a = 10; settle(); assert.equal(app.v.width, 12, "change to a method-internal dep propagates");
  app.b = 20; settle(); assert.equal(app.v.width, 30, "change to the other propagates");
});

test("precision — a NON-dependency change does not perturb the value", async () => {
  const app = await run(`App [ n: number = 3, other: number = 0, v: View [ width = { app.n * 10 } ] ]`);
  let applied = 0;
  const k = owner(app.v, "width");
  const realApply = k.run.bind(k);
  app.other = 999; settle();
  assert.equal(app.v.width, 30, "unrelated slot change left the value untouched");
});

test("ternary branch-union — both branches are wired, so either dep updates it", async () => {
  const app = await run(`App [ pick: boolean = true, px: number = 1, py: number = 2,
      v: View [ width = { app.pick ? app.px * 100 : app.py * 100 } ] ]`);
  assert.equal(app.v.width, 100);
  app.pick = false; settle(); assert.equal(app.v.width, 200, "switched branch");
  // py is the now-live branch; px is the union-subscribed but inactive branch
  app.px = 5; settle(); assert.equal(app.v.width, 200, "inactive-branch dep doesn't change the value");
  app.py = 9; settle(); assert.equal(app.v.width, 900, "active-branch dep updates");
  app.pick = true; settle(); assert.equal(app.v.width, 500, "px is still wired — switching back works (5*100)");
});

test("datapath static constraint updates on an in-place edit", async () => {
  const app = await run(`App [ rec: Dataset { { "title": "hi", "n": 5 } },
      card: View [ datapath = { app.rec.value },
        w: View [ width = { :n } ] ] ]`);
  assert.equal(app.card.w.width, 5);
  app.rec.set(["n"], 42); settle();
  assert.equal(app.card.w.width, 42, "datapath edge propagated the region edit");
});

test("chained recompute — a static constraint feeding another still cascades", async () => {
  const app = await run(`App [ n: number = 2,
      a: View [ width = { app.n * 3 } ],
      b: View [ width = { app.a.width + 1 } ] ]`);
  assert.equal(app.b.width, 7);
  app.n = 10; settle();
  assert.equal(app.a.width, 30);
  assert.equal(app.b.width, 31, "the cascade (n → a.width → b.width) fired on static edges");
});

// ── the DEV source-string channel: serializeDeps (server) → applyDeps (browser) ──
console.log("─ dev channel: serialize → apply alignment ─");

test("serializeDeps → applyDeps round-trips onto the identical constraints (no misalignment)", async () => {
  const src = (await compile(`App [ n: number = 1, m: number = 2, k: number = 3,
      a: View [ width = { app.n + app.m } ],
      b: View [ width = { app.k * 2 } ],
      grid: Dataset { { "rows": [] } },
      list: View [ datapath = { app.grid.value }, w: View [ width = { :rows.length } ] ],
      c: View [ height = { app.n } ] ]`, {})).source;
  // reference: annotate a parse directly (inline path, what prod uses)
  const p1 = parseProgram(src); annotateProgram(p1);
  const ref = []; forEachCodeValue(p1, (v) => ref.push([v.src.trim(), (v.deps ?? []).join("|")]));
  // dev path: serialize from p1, apply onto a FRESH parse of the same source
  const list = serializeDeps(p1);
  const p2 = parseProgram(src); applyDeps(p2, list);
  const got = []; forEachCodeValue(p2, (v) => got.push([v.src.trim(), (v.deps ?? []).join("|")]));
  assert.deepEqual(got, ref, "applied deps landed on different constraints than they were extracted from");
});

test("dev path (build with opts.deps) takes the static path and stays reactive", async () => {
  const src = (await compile(`App [ n: number = 4, v: View [ width = { app.n * 5 } ] ]`, {})).source;
  const p = parseProgram(src); annotateProgram(p);
  const deps = serializeDeps(p);
  const app = build(src, { deps });          // ← exactly what renderAsync does in the browser
  settle();
  assert.equal(app.v.$owners?.width?.isStatic, true, "dev path should wire the static edge");
  assert.equal(app.v.width, 20);
  app.n = 6; settle();
  assert.equal(app.v.width, 30, "dev static edge propagated");
});

// ── reading a computed `{ }` DECL default (regression) ────────────────────────
// A computed default (`name: type = { }`) has no cell — it is evaluated inline, its
// reads flowing to the reader. The extractor must INLINE a read of one (like a method
// call) and union its BRANCH-UNION deps; otherwise the reader wires only the branch
// live at boot and permanently misses cells read in the default's other branches.
// (This broke calendar day/week paging: the focus targets r0To/c0To and the period
// title read `anchorKey` only in a non-boot branch, so stepping never updated them.)
test("reader of a computed { } default inlines its branch-union deps — conditional reactivity", async () => {
  const app = await run(`App [
      mode: string = "a", alpha: number = 1, beta: number = 2,
      pick: number = { app.mode == "a" ? app.alpha : app.beta },
      v: View [ width = { app.pick } ] ]`);
  assert.equal(owner(app.v, "width").isStatic, true, "reader stays on the static path");
  assert.equal(app.v.width, 1, "boot branch (mode=a) → alpha");
  app.mode = "b"; settle(); assert.equal(app.v.width, 2, "switches to the other branch → beta");
  // beta is read ONLY in the non-boot branch — the bug wired the reader without it.
  app.beta = 9; settle();
  assert.equal(app.v.width, 9, "a dep read only in the default's non-boot branch still propagates");
});

test("computed default whose BOOT branch reads no cell still wires the other branch's dep", async () => {
  // Mirrors the focus targets: `r0To = { app.mode==\"week\" ? app.aRow : 0 }` — at boot
  // the ternary is false, so it returns 0 without reading aRow at all.
  const app = await run(`App [
      on: boolean = false, val: number = 5,
      gate: number = { app.on ? app.val : 0 },
      v: View [ width = { app.gate } ] ]`);
  assert.equal(owner(app.v, "width").isStatic, true);
  assert.equal(app.v.width, 0, "boot: gate false → 0, val never read");
  app.on = true; settle(); assert.equal(app.v.width, 5, "gate true → val");
  app.val = 12; settle(); assert.equal(app.v.width, 12, "val (read only when on) propagates on the static path");
});

test("computed-default inlining is transitive (default → default → method → cell)", async () => {
  const app = await run(`App [
      k: string = "z",
      idx(s: object) { return s == "z" ? this.base : 0 },
      base: number = 3,
      aRow: number = { app.idx(app.k) },
      r0To: number = { app.aRow + 1 },
      v: View [ width = { app.r0To } ] ]`);
  assert.equal(owner(app.v, "width").isStatic, true);
  assert.equal(app.v.width, 4);
  app.base = 10; settle();
  assert.equal(app.v.width, 11, "a cell reached only through nested defaults + a method propagates");
});

// ── SUSPENSION must not sever a wired constraint's edges (regression) ─────────
// suspend() drops the dependency edges to make a constraint inert, but on the
// static path run() deliberately does NOT rediscover them — that is what
// prewiring buys. So a resumed wired constraint used to land its value once
// (resume() re-runs, per animation.md §2 rule 4) and then never wake again:
// alive, still owning the slot, still reporting its wiredPaths to explain(), and
// permanently deaf. constraints.md §6 permits exactly ONE divergence from the
// tracking path — branch-union OVER-subscription — never under-subscription, so
// suspension has to re-arm the edges. Both callers of suspend() are covered.
//
// Invisible on the tracking path (build(): run() re-tracks every run, so resume
// self-heals) and easy to miss on the animator, which repairs the value at every
// stop — the loss shows only when a dep moves in the quiet interval AFTER the
// resume. Found via a stuck `visible = { app.panelVisible }` on a view whose
// sibling State had briefly applied at boot (its gate read `app.width < 480`,
// true before the viewport landed).

test("a wired constraint stays reactive after a State override displaces and pops it", async () => {
  const app = await run(`App [ width = 100, height = 100,
      flag: boolean = false, gate: boolean = false,
      p: View [ width = 10, height = 10,
          visible = { app.flag },
          s: State [ applied = { app.gate }, visible = { false } ] ] ]`);
  const k = owner(app.p, "visible");
  assert.equal(k.isStatic, true, "the base is on the static path");
  app.gate = true; settle();
  assert.equal(app.p.visible, false, "the override drives the slot while applied");
  app.gate = false; settle();
  assert.equal(app.p.visible, false, "the base is restored, re-evaluated (flag still false)");
  assert.equal(owner(app.p, "visible"), k, "and it is the same base constraint owning the slot again");
  app.flag = true; settle();
  assert.equal(app.p.visible, true, "the resumed base still wakes on its dep — edges re-armed, not severed");
});

test("a wired constraint stays reactive after an Animator displaces and completes", async () => {
  const sched = fakeScheduler();
  setClock(new Clock(sched));
  try {
    const app = await run(`App [ width = 400, height = 100,
        prog: number = 0,
        v: View [ height = 10, width = { 50 + app.prog },
            a: Animator [ attribute = width, to = 150, duration = 100, motion = linear ] ] ]`);
    const k = owner(app.v, "width");
    assert.equal(k.isStatic, true, "the base is on the static path");
    assert.equal(app.v.width, 50, "base value at boot");
    app.v.a.start();
    sched.frame(0);
    sched.frame(50);
    assert.equal(app.v.width, 100, "the animator drives the displaced slot");
    sched.frame(100);
    settle();
    assert.equal(app.v.width, 50, "on completion the base resumes, re-evaluated (animation.md §2 rule 4)");
    // The value above is repaired by resume()'s own run() even with dead edges —
    // this next write is the assertion that actually catches the severance.
    app.prog = 500; settle();
    assert.equal(app.v.width, 550, "the resumed base still wakes on its dep after the animator finished");
  } finally {
    setClock(new Clock());
  }
});

// ── the ALIAS/CLOSURE DOOR (silent-staleness fix, 2026-08-25) ───────────────
// A cell read rooted at a local alias (`const a = list.find(…); a.running`) or
// an iterator closure's parameter is REAL but has no nameable static path. The
// extractor used to drop it silently — a prewired constraint then missed the
// edge and went permanently stale (found as the desktop's vanished running-dot,
// caught only by the R6 pixel gate). Such constraints now stay on the runtime-
// tracking path (empty deps), where every read is live per run; constraints
// whose reads are all nameable keep their prewiring.

test("a find()-alias read stays LIVE — the constraint drops to tracking, never to staleness", async () => {
  const app = await run(`class A extends Node [ id: string = "", running: boolean = false ]
    class Ic extends View [ appId: string = "",
      dot: View [ width = 4, height = 4, visible = { app.runningOf(classroot.appId) } ] ]
    App [ width = 100, height = 100,
      ax: A [ id = "x" ], ay: A [ id = "y" ],
      roster: A[] = { [this.ax, this.ay] },
      runningOf(id: string) -> boolean { const a = this.roster.find((q) => q.id == id); return a != null && a.running },
      ic: Ic [ appId = "y" ] ]`);
  assert.equal(owner(app.ic.dot, "visible").isStatic, false, "alias-carried reads force the tracking path");
  assert.equal(app.ic.dot.visible, false);
  app.ay.running = true; settle();
  assert.equal(app.ic.dot.visible, true, "the aliased read woke — no silent staleness");
});

test("an iterator-closure read stays LIVE (roster.map((a) => a.running) in a class body)", async () => {
  const app = await run(`class A extends Node [ id: string = "", running: boolean = false ]
    class L extends Node [
      ax: A [ id = "x" ], ay: A [ id = "y" ],
      roster: A[] = { [this.ax, this.ay] },
      data: Dataset [ contents = { ({ apps: classroot.roster.map((a) => ({ id: a.id, running: a.running })) }) } ],
      ]
    App [ width = 100, height = 100, l: L [ ],
      t: Text [ text = { (app.l.data.value.apps || []).map((r) => r.id + ":" + r.running).join(" ") } ] ]`);
  assert.equal(app.t.text, "x:false y:false");
  app.l.ay.running = true; settle();
  assert.equal(app.t.text, "x:false y:true", "the closure read woke through the data lens");
});

test("a pure projection off an alias KEEPS the static path (.split/.length)", async () => {
  const app = await run(`App [ n: number = 3,
    v: View [ width = { app.calc() } ],
    calc() -> number { const s = ("" + this.n).split("."); return s.length + this.n } ]`);
  assert.equal(owner(app.v, "width").isStatic, true, "a value-typed alias costs no wiring");
  app.n = 7; settle();
  assert.equal(app.v.width, 8, "still live on its named deps");
});

console.log(`\nstatic-constraint: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
