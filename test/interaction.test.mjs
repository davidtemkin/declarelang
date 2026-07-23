import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { ancestorChain, chainDiff, makeInteractionTracker } from "./interaction-tracker.mjs";
import { Pointer } from "../runtime/dist/pointer.js";
import { routeInput } from "../runtime/dist/input.js";
import { Focus } from "../runtime/dist/focus.js";
import { Constraint, settle } from "../runtime/dist/reactive.js";
import { build } from "../runtime/dist/index.js";

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

await test("routeInput feeds Pointer.hover/press with the registered view", () => {
  Pointer.reset();
  const handlers = {};
  const realWindow = globalThis.window;
  globalThis.window = {
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter((h) => h !== fn); },
  };
  try {
    const viewA = { name: "A" };
    const sinkA = () => {};
    Pointer.register(sinkA, viewA);
    const targets = { A: { key: sinkA, sink: sinkA, x: 1, y: 2 } };

    const hovers = [], presses = [];
    Pointer.onHover((v) => hovers.push(v));
    Pointer.onPress((v) => presses.push(v));

    routeInput(() => true, (e) => targets[e.k] ?? null, (e) => ({ x: e.clientX, y: e.clientY }));
    const fire = (type, k) => (handlers[type] ?? []).forEach((h) => h({ k, clientX: 10, clientY: 20, pointerType: "mouse" }));

    fire("pointermove", "A");        // hover A
    fire("pointerdown", "A");        // press A
    fire("pointerup", "A");          // release
    fire("pointermove", null);       // hover off

    assert.deepEqual(hovers, [viewA, null], "hover fires on enter and leave");
    assert.deepEqual(presses, [viewA, null], "press fires on down and release");
  } finally {
    globalThis.window = realWindow;
  }
});

await test("tracker: hover/press propagate up the chain; focus is leaf-only", () => {
  Pointer.reset();
  Focus.reset();
  const app = build(`App [ width = 100, height = 100,
    a: View [ b: View [ c: View [ focusable = true ] ] ],
  ]`);
  const A = app.a, B = app.a.b, C = app.a.b.c;
  const tr = makeInteractionTracker(Pointer, Focus);
  try {
    const sinkC = () => {};
    Pointer.register(sinkC, C);

    Pointer.hover(sinkC);
    assert.equal(tr.isHovered(C), true, "leaf hovered");
    assert.equal(tr.isHovered(B), true, "ancestor hovered (chain)");
    assert.equal(tr.isHovered(A), true, "root-side ancestor hovered (chain)");

    Pointer.hover(null);
    assert.equal(tr.isHovered(C), false);
    assert.equal(tr.isHovered(A), false);

    Pointer.press(sinkC);
    assert.equal(tr.isPressed(B), true, "press propagates up the chain");
    Pointer.press(null);
    assert.equal(tr.isPressed(B), false);

    Focus.setRoot(app);
    Focus.focus(C);
    assert.equal(tr.isFocused(C), true, "focused leaf");
    assert.equal(tr.isFocused(B), false, "focus is leaf-only (no :focus-within)");
  } finally {
    tr.dispose();
  }
});

await test("tracker: isHovered is reactive under a constraint", () => {
  Pointer.reset();
  Focus.reset();
  const app = build(`App [ width = 100, height = 100, a: View [ ] ]`);
  const A = app.a;
  const tr = makeInteractionTracker(Pointer, Focus);
  try {
    const sinkA = () => {};
    Pointer.register(sinkA, A);
    let runs = 0, last;
    const c = new Constraint("test-hover", () => { last = tr.isHovered(A); return last; }, () => { runs++; }, 0);
    c.run();
    const before = runs;
    Pointer.hover(sinkA);
    settle();
    assert.ok(runs > before, "constraint re-ran when hover changed");
    assert.equal(last, true, "sees the new hovered state");
    c.dispose();
  } finally {
    tr.dispose();
  }
});

summarize("interaction");
