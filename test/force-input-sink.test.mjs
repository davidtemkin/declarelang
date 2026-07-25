import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { build } from "../runtime/dist/index.js";
import { Pointer } from "../runtime/dist/pointer.js";
import { routeInput } from "../runtime/dist/input.js";

// A backend whose surfaces record only their installed input sink (in __sink)
// and no-op everything else — robust to whatever methods attach() calls.
function mockBackend() {
  const surface = () => {
    const self = { __sink: undefined };
    return new Proxy(self, {
      get(t, prop) {
        if (prop === "__sink") return t.__sink;
        if (prop === "setInput") return (sink) => { t.__sink = sink; };
        return () => {};
      },
    });
  };
  return { createSurface: surface, attachRoot: () => {} };
}

await test("forceInputSink: a plain view becomes hit-testable + Pointer-observable", () => {
  Pointer.reset();
  const app = build(`App [ width = 50, height = 50, a: View [ ] ]`);
  app.attach(mockBackend(), null);
  const A = app.a;
  const token = {};

  assert.equal(A.surface.__sink, undefined, "plain view has no sink at attach");

  A.forceInputSink(token, true);
  assert.equal(typeof A.surface.__sink, "function", "forcing installs a sink");

  const hovers = [];
  Pointer.onHover((v) => hovers.push(v));
  const handlers = {};
  const realWindow = globalThis.window;
  globalThis.window = {
    addEventListener: (t, fn) => { (handlers[t] ??= []).push(fn); },
    removeEventListener: () => {},
  };
  try {
    const sink = A.surface.__sink;
    routeInput(() => true, () => ({ key: sink, sink, x: 0, y: 0 }), () => ({ x: 0, y: 0 }));
    (handlers["pointermove"] ?? []).forEach((h) => h({ clientX: 1, clientY: 1, pointerType: "mouse" }));
    assert.deepEqual(hovers, [A], "Pointer resolves the forced view on hover");
  } finally {
    globalThis.window = realWindow;
  }

  A.forceInputSink(token, false);
  assert.equal(A.surface.__sink, null, "unforcing removes the sink");
});

await test("forceInputSink: independent tokens — sink held until the last is removed", () => {
  Pointer.reset();
  const app = build(`App [ width = 50, height = 50, a: View [ ] ]`);
  app.attach(mockBackend(), null);
  const A = app.a, t1 = {}, t2 = {};
  A.forceInputSink(t1, true);
  A.forceInputSink(t2, true);
  assert.equal(typeof A.surface.__sink, "function");
  A.forceInputSink(t1, false);
  assert.equal(typeof A.surface.__sink, "function", "still forced by t2");
  A.forceInputSink(t2, false);
  assert.equal(A.surface.__sink, null, "last token removed → sink gone");
});

await test("forceInputSink: a handler-bearing view keeps its sink regardless of forcers", () => {
  Pointer.reset();
  const app = build(`App [ width = 50, height = 50, a: View [ onMouseDown() { } ] ]`);
  app.attach(mockBackend(), null);
  const A = app.a, tok = {};
  assert.equal(typeof A.surface.__sink, "function", "handler view has a sink at attach");
  A.forceInputSink(tok, true);
  A.forceInputSink(tok, false);
  assert.equal(typeof A.surface.__sink, "function", "removing a forcer doesn't drop a handler's sink");
});

summarize("force-input-sink");
