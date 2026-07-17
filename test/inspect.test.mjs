// inspect — the runtime's structured act of looking (verify-and-evals.md §2.2)
// and the driven clock (§2.3): tree-as-data, find-by-path, provenance
// (`explain` — the static-dep payoff), stats, and deterministic motion.
// All in Node: this is rung 5's foundation running with no browser at all.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { parseProgram } from "../runtime/dist/parser.js";
import { instantiate, settle, inspect, find, explain, stats, clock } from "../runtime/dist/index.js";
import { applyDeps } from "../runtime/dist/deps.js";

function boot(src) {
  const r = compile(src, {});
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

await test("inspect: tree as data — kinds, names, paths, geometry, root-space", () => {
  const app = boot(APP);
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

await test("find: dotted paths resolve names and indices; misses are null", () => {
  const app = boot(APP);
  assert.equal(find(app, "app.panel.lbl").text, "hello");
  assert.equal(find(app, "panel.lbl").text, "hello", "leading 'app' optional");
  assert.equal(find(app, "app.panel.2").width, 5, "index addressing");
  assert.equal(find(app, "app.nope.lbl"), null);
  app.discard();
});

await test("explain: provenance — literal vs wired constraint (label + static deps) vs spring", () => {
  const app = boot(APP);
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

await test("driven clock: step() advances motion deterministically; settleMotion() lands it", () => {
  clock.manual();
  const app = boot(APP);
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

await test("stats: node and owned-slot counts", () => {
  const app = boot(APP);
  const s = stats(app);
  assert.equal(s.nodes, 7, "App + panel + 3 + ball + spring");
  assert.ok(s.ownedSlots >= 2, "wired width + spring target are owned");
  app.discard();
});

summarize("inspect");
