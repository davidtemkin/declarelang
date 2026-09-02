// inspect — the runtime's structured act of looking (verify-and-evals.md §2.2)
// and the driven clock (§2.3): tree-as-data, find-by-path, provenance
// (`explain` — the static-dep payoff), stats, and deterministic motion.
// All in Node: this is rung 5's foundation running with no browser at all.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle, inspect, find, explain, stats, clock, pickAt } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

async function boot(src) {
  const r = await compile(src, {});
  assert.notEqual(r.source, null, "compiles: " + r.errors.map((e) => e.message).join("; "));
  const program = parseProgram(r.source);
  applyDeps(program, r.deps);          // zip the compiler's read-paths back on (what renderAsync does)
  const app = instantiate(program);
  settle();
  return app;
}

const APP = `App [ width = 400, height = 300, n: number = 10,
    panel: View [ x = 20, y = 30, width = 200, height = 100,
        lbl: Text [ x = 8, y = 8, text = "hello" ],
        wide: View [ width = { app.n * 4 }, height = 10 ],
        View [ width = 5, height = 5 ],
        ],
    ball: View [ x = 0, y = 200, width = 20, height = 20,
        slide: Spring [ attribute = x, to = { app.n * 10 }, stiffness = 200, damping = 30 ],
        ],
    ]`;

await test("inspect: tree as data — kinds, names, paths, geometry, root-space", async () => {
  const app = await boot(APP);
  const t = inspect(app);
  assert.equal(t.kind, "App");
  const panel = t.children.find((c) => c.name === "panel");
  assert.ok(panel, "named child surfaces");
  assert.equal(panel.path, "app.panel");
  assert.equal(panel.x, 20);
  const lbl = panel.children.find((c) => c.name === "lbl");
  assert.equal(lbl.text, "hello");
  assert.equal(lbl.rootX, 28, "root-space = parent chain summed (20 + 8)");
  assert.equal(lbl.rootY, 38);
  const anon = panel.children.find((c) => c.name === null);
  assert.match(anon.path, /^app\.panel\.\d+$/, "anonymous children address by index");
  app.discard();
});

await test("shown: EFFECTIVE visibility, folding in every ancestor", async () => {
  // reported 2026-08-03: a node inside a hidden panel read back `visible: true`
  // — true of its own slot, and useless to a reader asking why nothing is on
  // screen. Both facts are now present and neither is guessed from the other.
  const app = await boot(`App [ width = 300, height = 120,
      pane: View [ visible = false, width = 200, height = 60,
          b: View [ width = 80, height = 24,
              deep: View [ width = 10, height = 10 ] ] ] ]`);
  const pane = find(app, "app.pane");
  assert.equal(inspect(pane).visible, false);
  assert.equal(inspect(pane).shown, false);
  const b = inspect(find(app, "app.pane.b"));
  assert.equal(b.visible, true, "its OWN slot is untouched");
  assert.equal(b.shown, false, "but it is not on screen — the panel above it is hidden");
  // entered at arbitrary depth: the chain is walked UP, not folded down
  assert.equal(inspect(find(app, "app.pane.b.deep")).shown, false, "two levels down, still hidden");
  assert.equal(b.children[0].shown, false, "and the same node reached by recursion agrees");
  pane.visible = true;
  settle();
  assert.equal(inspect(find(app, "app.pane.b.deep")).shown, true, "revealing the ancestor shows it");
  app.discard();
});

await test("geometry under scroll: rootX/rootY is where the view is SEEN", async () => {
  // Reported 2026-08-03: a driver could not reach anything below a scrolled
  // pane's fold and had to subtract scrollY by hand. inspect() summed ancestor
  // x/y directly — the exact defect rootFrameOrigin() was built to end for the
  // Inspector's highlight ("accumulated x/y by hand and was blind to every
  // scroll regime"), still living in a second walk here. The sum is right until
  // something scrolls, which is why it survived so long.
  const app = await boot(`App [ width = 200, height = 100,
      pane: View [ y = 10, width = 200, height = 100, scrolls = y, clip = true,
          a: View [ y = 0, width = 50, height = 20 ],
          b: View [ y = 300, width = 50, height = 20 ]
          ]
      ]`);
  const at = (p) => inspect(find(app, p));
  assert.equal(at("app.pane.b").rootY, 310, "unscrolled: the plain sum is correct");
  find(app, "app.pane").scrollY = 280;
  settle();
  assert.equal(at("app.pane.b").rootY, 30, "scrolled: b is SEEN 30px down");
  assert.equal(at("app.pane.a").rootY, -270, "and a has gone off the top");
  app.discard();
});

await test("a point from inspect() resolves back through the introspection at()", async () => {
  // The round-trip that makes the number usable: the same coordinates a driver
  // clicks are the ones `at(x, y)` takes. NOTE these are NOT View.viewAt's
  // coordinates — that method takes the root's CONTENT space and converts at the
  // boundary, while the introspection pickAt (inspect.ts) is the raw hit walk.
  // Two functions, one name, different spaces; this pins which one the reported
  // geometry belongs to.
  const app = await boot(`App [ width = 200, height = 100, scrolls = y,
      top: View [ y = 10,  width = 200, height = 20 ],
      mid: View [ y = 360, width = 200, height = 20 ]
      ]`);
  const seen = (p) => { const g = inspect(find(app, p)); return pickAt(app, g.rootX + 5, g.rootY + 5); };
  assert.equal(seen("app.top"), find(app, "app.top"), "unscrolled, the visible one round-trips");
  app.scrollY = 350;
  settle();
  assert.equal(inspect(find(app, "app.mid")).rootY, 10, "mid has scrolled into view");
  assert.equal(seen("app.mid"), find(app, "app.mid"), "and the point it reports resolves to it");
  app.discard();
});

await test("find: dotted paths resolve names and indices; misses are null", async () => {
  const app = await boot(APP);
  assert.equal(find(app, "app.panel.lbl").text, "hello");
  assert.equal(find(app, "panel.lbl").text, "hello", "leading 'app' optional");
  assert.equal(find(app, "app.panel.2").width, 5, "index addressing");
  assert.equal(find(app, "app.nope.lbl"), null);
  app.discard();
});

await test("explain: provenance — literal vs wired constraint (label + static deps) vs spring", async () => {
  const app = await boot(APP);
  const lit = explain(find(app, "app.panel"), "x");
  assert.equal(lit.value, 20);
  assert.equal(lit.constraint, null, "a literal has no owning constraint");
  const wired = explain(find(app, "app.panel.wide"), "width");
  assert.equal(wired.value, 40);
  assert.ok(wired.constraint, "a { } slot is owned");
  assert.equal(wired.constraint.static, true, "compiler-wired, not tracked");
  assert.deepEqual([...wired.constraint.deps], ["this.root.n"], "the extracted read-paths ride to runtime");
  const sprung = explain(find(app, "app.ball"), "x");
  assert.ok(sprung.spring, "a driving Spring is reported");
  assert.equal(sprung.spring.target, 100, "with its live target");
  app.discard();
});

await test("driven clock: step() advances motion deterministically; settleMotion() lands it", async () => {
  clock.manual();
  const app = await boot(APP);
  const ball = find(app, "app.ball");
  // The FIRST target is a declaration, not a destination (spring.ts): the
  // slot snaps there on the first tick — a boot never animates. Motion means
  // a CHANGE, so the flight under test starts at the retarget.
  clock.step(16.7);
  assert.equal(ball.x, 100, "boot snaps to the declared target — no load-time flight");
  app.n = 5;
  settle();
  clock.step(16.7);
  clock.step(16.7);
  const mid = ball.x;
  assert.ok(mid < 100 && mid > 50, `mid-flight after two frames of the retarget: ${mid}`);
  const settled = clock.settleMotion(10000);
  assert.equal(settled, true, "motion runs to rest");
  assert.ok(Math.abs(ball.x - 50) < 1, `settled at the new target: ${ball.x}`);
  assert.equal(stats(app).motionBusy, false);
  app.discard();
  clock.auto();
});

await test("stats: node and owned-slot counts", async () => {
  const app = await boot(APP);
  const s = stats(app);
  assert.equal(s.nodes, 7, "App + panel + 3 + ball + spring");
  assert.ok(s.ownedSlots >= 2, "wired width + spring target are owned");
  app.discard();
});

// ── the introspection boundary (field report 2026-08-19): the surface must
// answer for the slots the PROGRAM is made of, not just the platform's ──────

await test("explain: an author declaration's { } default carries full provenance", async () => {
  const app = await boot(`App [ width = 400, height = 300, n: number = 10,
      fitS: number = { app.n * 2 + app.width / 100 },
      ]`);
  try {
    const p = explain(app, "fitS");
    assert.equal(p.value, 24, "the live value");
    assert.ok(p.constraint, "a declaration default explains itself — not null");
    assert.equal(p.declaration, true, "and says it is a declaration, not a standing constraint");
    assert.match(p.constraint.source, /n \* 2/, "the derivation's source text (compiler-qualified)");
    assert.ok(p.constraint.pos && p.constraint.pos.line >= 1, "with its position");
  } finally { app.discard(); }
});

await test("slots: author-declared slots are enumerable — constraints and defaulted plains alike", async () => {
  const app = await boot(`App [ width = 400, height = 300,
      timeScale: number = 1,
      fitS: number = { app.width / 100 },
      ]`);
  try {
    const { slotsOf } = await import("../runtime/dist/index.js");
    const names = slotsOf(app).map((s) => s.attr);
    assert.ok(names.includes("fitS"), "a declared constraint slot is discoverable");
    assert.ok(names.includes("timeScale"), "a plain slot still at its default is discoverable");
  } finally { app.discard(); }
});

await test("evaluate: a :path whose field name collides with a node member reads the DATA (field report 2026-09-01 finding 4)", async () => {
  // qualify() rewrites bare member names to `this.<name>` — it must never
  // touch the names INSIDE a datapath island: `:done` on a node that also
  // declares `done` was becoming `:this.done`, which reads nothing and
  // answered null with a straight face.
  const app = await boot(`App [ width = 100, height = 100,
      store: Dataset { { "rec": { "done": true, "id": "x7" } } },
      row: View [ datapath = { app.store.value.rec },
          done: boolean = false,
          ],
      ]`);
  try {
    const { evaluateIn } = await import("../runtime/dist/inspect-service.js");
    const collide = evaluateIn(app, "app.row", ":done");
    assert.equal(collide.ok, true, "the read succeeds: " + collide.text);
    assert.match(collide.text, /true/, "…and answers the record's field, not the member's default (got: " + collide.text + ")");
    const plain = evaluateIn(app, "app.row", ":id");
    assert.match(plain.text, /x7/, "a non-colliding field still reads");
    const member = evaluateIn(app, "app.row", "done");
    assert.match(member.text, /false/, "the bare member name still answers the MEMBER");
  } finally { app.discard(); }
});

await test("explain: an unknown slot answers loudly, never with placid nothing", async () => {
  const app = await boot(`App [ width = 400, height = 300, fitS: number = 1 ]`);
  try {
    const p = explain(app, "fitZ");
    assert.ok(p.error, "the miss is an error, not undefined");
    assert.match(p.error, /no slot 'fitZ'/);
    assert.match(p.error, /fitS/, "with the near name suggested");
  } finally { app.discard(); }
});

summarize("inspect");
