import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { build } from "../runtime/dist/index.js";
import { Constraint, settle } from "../runtime/dist/reactive.js";

const attrPlugin = { name: "test-attr", attrs: [{ on: "View", name: "flavor", def: "plain" }] };

await test("a registered string attr type-checks + reads its default", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ ] ]`, { plugins: [attrPlugin] });
  assert.equal(app.a.flavor, "plain", "default applies");
});

await test("an author value for a registered attr is read back", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ flavor = "spicy" ] ]`, { plugins: [attrPlugin] });
  assert.equal(app.a.flavor, "spicy");
});

await test("an unregistered attr is still an unknown-attribute compile error", () => {
  assert.throws(() => build(`App [ width = 10, height = 10, a: View [ zork = "x" ] ]`, { plugins: [attrPlugin] }));
});

await test("a registered attr is reactive", () => {
  const app = build(`App [ width = 10, height = 10, a: View [ ] ]`, { plugins: [attrPlugin] });
  const A = app.a;
  let runs = 0, last;
  const c = new Constraint("t", () => { last = A.flavor; return last; }, () => { runs++; }, 0);
  c.run();
  const before = runs;
  A.flavor = "tangy"; settle();
  assert.ok(runs > before, "constraint re-ran");
  assert.equal(last, "tangy");
  c.dispose();
});

summarize("attribute-registration");
