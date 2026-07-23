import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { ancestorChain, chainDiff } from "./interaction-tracker.mjs";
import { Pointer } from "../runtime/dist/pointer.js";

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

await test("Pointer: register + hover/press resolve sink->view and dedup", () => {
  Pointer.reset();
  const viewC = { name: "C" };
  const sinkC = () => {};            // an InputSink is just a function
  Pointer.register(sinkC, viewC);

  const hovers = [];
  const presses = [];
  Pointer.onHover((v) => hovers.push(v));
  Pointer.onPress((v) => presses.push(v));

  Pointer.hover(sinkC);              // -> viewC
  Pointer.hover(sinkC);              // same view: no re-fire
  Pointer.hover(null);              // -> null
  Pointer.hover(() => {});          // unknown sink -> null (already null: no fire)
  assert.deepEqual(hovers, [viewC, null]);

  Pointer.press(sinkC);
  Pointer.press(null);
  assert.deepEqual(presses, [viewC, null]);
});

await test("Pointer: reset drops subscribers and state", () => {
  Pointer.reset();
  let fired = 0;
  Pointer.onHover(() => fired++);
  Pointer.reset();
  const v = { name: "X" }, s = () => {};
  Pointer.register(s, v);
  Pointer.hover(s);
  assert.equal(fired, 0, "handler removed by reset");
});

summarize("interaction");
