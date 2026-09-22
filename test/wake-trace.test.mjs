// test/wake-trace.test.mjs — the wake trace: what a settle changed, and what
// opened it (runtime/src/wake-trace.ts, reached through the bridge's `trace`).
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { compile } from "../compiler/dist/compile-node.js";
import { build, settle, bridgeFor } from "../runtime/dist/index.js";

async function app(src) {
  const r = await compile(src);
  assert.deepEqual(r.errors.map((e) => e.message), []);
  const a = build(r.source);
  settle();
  return a;
}

await test("a settle records its triggers, its changes, and the rule behind each change", async () => {
  const a = await app(`App [ width = 300, height = 200,
    n: number = 1,
    box: View [ width = { app.n * 10 }, height = 20 ],
    bump() { app.n = app.n + 1 } ]`);
  void a.box.width;                           // a read wires the rule, as a page does at first paint
  const T = bridgeFor(a).trace;
  assert.equal(T.active(), false, "off until asked");
  T.start(16);
  settle();                                   // the first recorded settle has no 'before' — a baseline
  a.bump();
  settle();
  const rec = T.read().at(-1);
  assert.ok(rec, "one settle recorded");
  const trig = rec.triggers.find((c) => c.path === "app" && c.attr === "n");
  assert.deepEqual({ from: trig.from, to: trig.to }, { from: 1, to: 2 }, "the write that opened the settle, with its values");
  const ch = rec.changes.find((c) => c.path === "app.box" && c.attr === "width");
  assert.deepEqual({ from: ch.from, to: ch.to }, { from: 10, to: 20 }, "what the settle changed in response");
  assert.match(ch.by.source, /this\.root\.n \* 10/, "named by the rule that wrote it (the compiled body: app → this.root)");
  assert.equal(typeof ch.by.line, "number");
  assert.ok(rec.runs >= 1);
  const text = T.text();
  assert.match(text, /app\.n 1 → 2/);
  assert.match(text, /app\.box\.width 10 → 20 ← \{ this\.root\.n \* 10 \} \(line 3\)/);
  T.clear();
  assert.equal(T.active(), false);
  assert.deepEqual(T.read(), [], "cleared");
  a.discard();
});

await test("a slot holding no number carries its values too; a handler names the settle's origin", async () => {
  const a = await app(`App [ width = 300, height = 200,
    label: string = "a",
    t: Text [ text = { app.label + "!" } ],
    onClick() { app.label = "b" } ]`);
  void a.t.text;
  const T = bridgeFor(a).trace;
  T.start();
  settle();
  a.onClick();                                // a direct call: no event fired, so no origin
  settle();
  let rec = T.read().at(-1);
  const trig = rec.triggers.find((c) => c.path === "app" && c.attr === "label");
  assert.deepEqual({ from: trig.from, to: trig.to }, { from: "a", to: "b" }, "the string trigger, with its values");
  const ch = rec.changes.find((c) => c.path === "app.t" && c.attr === "text");
  assert.deepEqual({ from: ch.from, to: ch.to }, { from: "a!", to: "b!" }, "the string change it caused");
  assert.match(ch.by.source, /root\.label/, "by the text rule");
  assert.match(T.text(), /app\.t\.text "a!" → "b!"/);
  assert.deepEqual(rec.origin, [], "nothing ran through an event");
  const { fireEvent } = await import("../runtime/dist/view.js");
  a.label = "a"; settle();
  fireEvent(a, "click");
  settle();
  rec = T.read().at(-1);
  assert.deepEqual(rec.origin, ["onClick on app"], "the handler that opened it");
  T.clear();
  a.discard();
});

await test("off, the trace costs nothing and records nothing", async () => {
  const a = await app(`App [ width = 10, height = 10, n: number = 0 ]`);
  const T = bridgeFor(a).trace;
  a.n = 1; settle();
  assert.deepEqual(T.read(), []);
  T.start(2);
  for (let i = 2; i < 8; i++) { a.n = i; settle(); }
  assert.equal(T.read().length, 2, "the ring keeps the last n");
  T.stop();
  a.n = 99; settle();
  assert.equal(T.read().length, 2, "stopped: nothing more recorded");
  assert.ok(!T.read().some((r) => r.triggers.some((c) => c.to === 99)));
  T.clear();
  a.discard();
});

summarize("wake-trace");
