import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { ancestorChain, chainDiff } from "./interaction-tracker.mjs";

// Plain {name, parent} mocks — the helpers only follow `.parent`.
const A = { name: "A", parent: null };
const B = { name: "B", parent: A };
const C = { name: "C", parent: B };

await test("ancestorChain: leaf -> root inclusive", () => {
  assert.deepEqual(ancestorChain(C), [C, B, A]);
  assert.deepEqual(ancestorChain(A), [A]);
});

await test("chainDiff: set the newly-entered, clear the newly-left", () => {
  // prev empty -> next [C,B,A]: set all, clear none
  assert.deepEqual(chainDiff([], [C, B, A]), { clear: [], set: [C, B, A] });
  // moving off entirely: clear all
  assert.deepEqual(chainDiff([C, B, A], []), { clear: [C, B, A], set: [] });
  // shared ancestors A,B stay; C leaves, D enters
  const D = { name: "D", parent: B };
  assert.deepEqual(chainDiff([C, B, A], [D, B, A]), { clear: [C], set: [D] });
});

summarize("interaction");
