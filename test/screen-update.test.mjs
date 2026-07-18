// The named screen-update seam: onScreenUpdate fires once at the clean
// completion of a top-level settle (never on a throw). Runs against the built
// runtime/dist — `npm test` builds first.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { onScreenUpdate, fireScreenUpdate } from "../runtime/dist/screen-update.js";
import { settle, Constraint, Cell } from "../runtime/dist/reactive.js";

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

await test("settle fires onScreenUpdate once on clean completion", () => {
  let fires = 0;
  const off = onScreenUpdate(() => { fires++; });
  const cell = new Cell();
  const k = new Constraint("t", () => { cell.track(); return 1; }, () => {});
  k.run();
  cell.changed();       // invalidate → queues a settle
  settle();             // force deterministic settle
  assert.equal(fires, 1);
  off(); k.dispose();
});

await test("settle does NOT fire onScreenUpdate when a constraint throws mid-settle", () => {
  let fires = 0;
  const off = onScreenUpdate(() => { fires++; });
  const cell = new Cell();
  let armed = false;
  const k = new Constraint("boom", () => { cell.track(); if (armed) throw new Error("x"); return 1; }, () => {});
  k.run();              // armed=false → clean initial run
  armed = true;
  cell.changed();       // invalidates k, queues a settle whose recompute throws
  assert.throws(() => settle(), /x/);
  assert.equal(fires, 0); // clean-guard skips the seam on a thrown settle
  off(); try { k.dispose(); } catch {}
});

await test("settle fires the seam AFTER constraints run (ordering), and not when idle", () => {
  const order = [];
  const cell = new Cell();
  const k = new Constraint("v", () => { cell.track(); order.push("compute"); return 1; }, () => {});
  k.run();
  order.length = 0;     // discard the construction-time run; capture only the settle below
  const off = onScreenUpdate(() => { order.push("seam"); });
  cell.changed();
  settle();
  assert.deepEqual(order, ["compute", "seam"]); // recompute ran before the seam fired
  // idle-zero: a settle with nothing invalidated fires the seam exactly once, no compute churn.
  order.length = 0;
  settle();             // nothing queued
  assert.deepEqual(order, ["seam"]);
  off(); k.dispose();
});

summarize("screen-update");
