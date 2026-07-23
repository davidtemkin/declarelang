import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { build, provide, withdraw, isProvided, isSet } from "../runtime/dist/index.js";
import { Constraint, settle } from "../runtime/dist/reactive.js";

// A backend whose surfaces record every method call in per-surface __log.
function mockBackend() {
  const surface = () => {
    const self = { __log: [] };
    return new Proxy(self, {
      get(t, prop) {
        if (prop === "__log") return t.__log;
        return (...args) => { t.__log.push([prop, ...args]); };
      },
    });
  };
  return { createSurface: surface, attachRoot: () => {} };
}

await test("provide installs a sub-author value; a reading constraint re-runs", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ ] ]`);
  const A = app.a;
  assert.equal(A.cornerRadius, 0, "default before provide");
  let runs = 0, last;
  const c = new Constraint("r", () => { last = A.cornerRadius; return last; }, () => { runs++; }, 0);
  c.run();
  const before = runs;
  provide(A, "cornerRadius", 8);
  settle();
  assert.equal(A.cornerRadius, 8, "provided value reads back");
  assert.ok(runs > before, "reading constraint re-ran on provide");
  assert.equal(last, 8);
  assert.equal(isProvided(A, "cornerRadius"), true, "isProvided true after provide");
  c.dispose();
});

await test("withdraw reverts to default and re-pushes to the surface", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ ] ]`);
  app.attach(mockBackend(), null);
  const A = app.a;
  provide(A, "cornerRadius", 8);
  assert.equal(A.cornerRadius, 8);
  withdraw(A, "cornerRadius");
  assert.equal(A.cornerRadius, 0, "reverts to default");
  const last = A.surface.__log.filter((e) => e[0] === "setCornerRadius").pop();
  assert.deepEqual(last, ["setCornerRadius", 0], "re-pushed the effective default to the surface");
  assert.equal(isProvided(A, "cornerRadius"), false, "isProvided false after withdraw");
});

await test("isProvided reflects author provision; the gate lets author win", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ cornerRadius = 5 ] ]`);
  const A = app.a;
  assert.equal(isSet(A, "cornerRadius"), true, "author set");
  assert.equal(isProvided(A, "cornerRadius"), true, "author provision counts as provided");
  const record = new Set();
  const gatedProvide = (v, attr, val) => {
    if (!isProvided(v, attr) || record.has(attr)) { provide(v, attr, val); record.add(attr); }
  };
  gatedProvide(A, "cornerRadius", 8);
  assert.equal(A.cornerRadius, 5, "author value stands — gated provide skipped");
});

await test("cooperative first-wins across records; self-update allowed", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ ] ]`);
  const A = app.a;
  const gated = (rec) => (v, attr, val) => {
    if (!isProvided(v, attr) || rec.has(attr)) { provide(v, attr, val); rec.add(attr); }
  };
  const recA = new Set(), recB = new Set();
  const gA = gated(recA), gB = gated(recB);

  gA(A, "cornerRadius", 8);
  assert.equal(A.cornerRadius, 8, "A provided");
  gB(A, "cornerRadius", 99);
  assert.equal(A.cornerRadius, 8, "B yields to A (first-wins)");
  gA(A, "cornerRadius", 12);
  assert.equal(A.cornerRadius, 12, "A updates its own held slot");
  withdraw(A, "cornerRadius"); recA.delete("cornerRadius");
  assert.equal(isProvided(A, "cornerRadius"), false, "A withdrew");
  gB(A, "cornerRadius", 99);
  assert.equal(A.cornerRadius, 99, "B may now provide after A withdrew");
});

await test("a provided prevailing slot is followed by descendants", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ b: View [ ] ] ]`);
  const A = app.a, B = app.a.b;
  provide(A, "fontSize", 20);
  assert.equal(B.fontSize, 20, "descendant follows the provided prevailing value");
});

summarize("provision-tier");
