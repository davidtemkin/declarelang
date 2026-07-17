// CSS engine + screen-update seam tests (design-docs/css-engine-plan.md).
// Runs against the built runtime/dist — `npm test` builds first.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { onScreenUpdate, fireScreenUpdate } from "../runtime/dist/screen-update.js";

// ── M0: the screen-update seam ──────────────────────────────────────────────

await test("onScreenUpdate: subscriber is invoked on fire", () => {
  let n = 0;
  const off = onScreenUpdate(() => { n++; });
  fireScreenUpdate();
  assert.equal(n, 1);
  off();
});

await test("onScreenUpdate: multiple subscribers all invoked; unsubscribe works", () => {
  let a = 0, b = 0;
  const offA = onScreenUpdate(() => { a++; });
  const offB = onScreenUpdate(() => { b++; });
  fireScreenUpdate();
  assert.equal(a, 1); assert.equal(b, 1);
  offA();
  fireScreenUpdate();
  assert.equal(a, 1); assert.equal(b, 2);
  offB();
});

summarize("css");
