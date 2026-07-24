import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { build, onEachView } from "../runtime/dist/index.js";
import { Constraint, settle } from "../runtime/dist/reactive.js";

await test("onEachView: enter fires once per view, parent-first", () => {
  const seen = [];
  const off = onEachView((view) => { seen.push(view); });
  try {
    const app = build(`App [ width = 10, height = 10, a: View [ b: View [ ] ] ]`);
    assert.deepEqual(seen, [app, app.a, app.a.b], "App, then a, then b (parent-first)");
  } finally { off(); }
});

await test("onEachView: a plugin Constraint re-runs on a tracked change", () => {
  const states = new Map();
  const off = onEachView((view) => {
    const s = { runs: 0, last: undefined };
    const c = new Constraint("t", () => { s.last = view.cornerRadius; return s.last; }, () => { s.runs++; }, 0);
    c.run();
    states.set(view, s);
    return () => c.dispose();
  });
  try {
    const app = build(`App [ width = 10, height = 10, a: View [ ] ]`);
    const A = app.a;
    const s = states.get(A);
    const before = s.runs;
    A.cornerRadius = 7;   // author write fires the slot cell
    settle();
    assert.ok(s.runs > before, "the per-view Constraint re-ran on the write");
    assert.equal(s.last, 7, "it saw the new value");
  } finally { off(); }
});

await test("onEachView: the returned cleanup runs on discard", () => {
  const cleaned = new Map();
  const off = onEachView((view) => { cleaned.set(view, false); return () => cleaned.set(view, true); });
  try {
    const app = build(`App [ width = 10, height = 10, a: View [ ] ]`);
    const A = app.a;
    assert.equal(cleaned.get(A), false, "not cleaned before discard");
    A.discard();
    assert.equal(cleaned.get(A), true, "cleanup ran on discard");
  } finally { off(); }
});

summarize("per-view-hook");
