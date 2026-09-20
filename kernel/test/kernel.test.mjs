// kernel.test — the kernel under WebAssembly, from JS: the C scenarios again
// through image.mjs + loader.mjs, then the SETTLE TRACES: the same graph and
// the same writes driven through the JS reactive core (runtime/dist) and
// through the kernel, compared run for run. That comparison is Phase A's gate.
//
//   node kernel/test/kernel.test.mjs      (after: node kernel/build.mjs wasm)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { buildImage, assemble, KIND, FLAG, CELL } from "../image.mjs";
import { loadKernel, ERR } from "../loader.mjs";
// THE ORACLE is the previous JS core — main's untouched runtime — not this
// tree's reactive.ts, which is the kernel itself.
import { Cell, Constraint, settle as jsSettle, afterSettle } from "/Users/temkin/Code/Declare/runtime/dist/reactive.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM = readFileSync(path.join(HERE, "../build/kernel.wasm"));
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log("  ok   " + name); } catch (e) { console.log("  FAIL " + name + "\n       " + (e.stack ?? e)); process.exitCode = 1; } };

const host = (bodies, extra = {}) => ({ log: [], body(rule, elem, target) { this.log.push("b" + rule); return bodies[rule]?.(rule, elem, target) ?? 0; }, ...extra });

console.log("kernel.test (wasm)");

await test("chain of EXPR rules: gated, settled once, dirty list", async () => {
  const consts = [];
  const img = buildImage({
    elems: [{ nslots: 3 }], cells: [{ init: 1 }, {}, {}],
    rules: [
      { target: 1, kind: KIND.EXPR, edges: [0], code: assemble(consts, ["load", 0], ["const", 2], "mul") },
      { target: 2, kind: KIND.EXPR, edges: [1], code: assemble(consts, ["load", 1], ["const", 1], "add") },
    ], consts,
  });
  const k = await loadKernel(WASM, img, host({}));
  k.run(0); k.run(1); k.settle();
  assert.deepEqual(Array.from(k.table), [1, 2, 3]);
  k.write(0, 10); assert.equal(k.pending(), true); assert.equal(k.table[1], 2);
  assert.equal(k.settle(), 2); assert.deepEqual(Array.from(k.table), [10, 20, 21]);
  k.write(0, 10); assert.equal(k.pending(), false);
  assert.deepEqual(k.dirty(), [1, 2, 0]); assert.deepEqual(k.dirty(), []);
});

await test("BODY rules call back synchronously; REF targets carry the wake", async () => {
  const img = buildImage({
    elems: [{ nslots: 3 }], cells: [{ init: 4 }, { kind: CELL.REF }, {}],
    rules: [{ target: 1, kind: KIND.BODY, edges: [0], body: 7 }, { target: 2, kind: KIND.BODY, edges: [1], body: 8 }],
  });
  const refs = [null, null, null];
  const h = host({
    0: () => { const v = "n" + k.table[0]; const changed = refs[1] !== v; refs[1] = v; return changed ? 1 : 0; },
    1: () => refs[1].length,
  });
  const k = await loadKernel(WASM, img, h);
  k.run(0); k.run(1); k.settle(); assert.equal(k.table[2], 2);
  k.write(0, 123); assert.equal(k.settle(), 2); assert.equal(k.table[2], 4);
  h.log.length = 0; k.write(0, 123.0); assert.equal(k.settle(), 0);      // gated at the number
  k.write(0, 321); k.settle(); assert.deepEqual(h.log, ["b0", "b1"]);     // the REF changed ("n321" vs "n123") → b1 runs, lands the same length (gated there)
});

await test("ownership, cycle, dynamic tracking, close", async () => {
  const img = buildImage({
    elems: [{ nslots: 4 }], cells: [{ init: 0 }, { init: 10 }, { init: 20 }, {}],
    rules: [{ target: 3, kind: KIND.DYNAMIC }, { target: 1, kind: KIND.BODY, flags: FLAG.YIELDING, edges: [0] }],
  });
  let steps = 0, changes = 0, errors = [];
  const h = host({
    0: () => { k.track(0); if (k.table[0] !== 0) { k.track(1); return k.table[1]; } k.track(2); return k.table[2]; },
    1: () => k.table[0] + 100,
  }, { afterSteps: () => steps-- > 0, fireChanges: () => changes-- > 0, error: (c, r) => errors.push([c, r]) });
  const k = await loadKernel(WASM, img, h, { dyn_edges: 16 });
  k.run(0); k.settle(); assert.equal(k.table[3], 20);
  h.log.length = 0; k.write(1, 11); k.settle(); assert.deepEqual(h.log, []);          // not read this run
  k.write(2, 21); k.settle(); assert.equal(k.table[3], 21);
  k.write(0, 1); k.settle(); assert.equal(k.table[3], 11);
  assert.equal(k.active[0], -1);
  // ownership: the yielding derive owns cell 1; an author write displaces it
  assert.equal(k.own(1, 1), 0); k.run(1); k.settle(); assert.equal(k.table[1], 101);
  assert.equal(k.write(1, 5), 0); assert.equal(k.owner(1), -1); assert.equal(k.isSet(1), true);
  k.write(0, 2); k.settle(); assert.equal(k.table[1], 5);                              // never runs again
  // the close: steps then changes, each looping back
  steps = 2; changes = 1; k.write(0, 3); assert.ok(k.settle() >= 0); assert.equal(steps, -2); assert.equal(changes, -1);   // steps, steps, (none) → change → steps asked again → (none)
  steps = 1000; k.write(0, 4); assert.equal(k.settle(), ERR.AFTER); assert.deepEqual(errors.at(-1), [ERR.AFTER, -1]); steps = 0;   // no rule to blame: NONE crosses as i32 −1
});

// ── settle traces: the JS core and the kernel on one graph ──────────────────
//
// A random DAG of numeric rules — each `sum of some earlier cells, plus a
// constant` — with the same random write sequence applied to both. Compared:
// every cell's value after every settle, and the ORDER rules ran in (the
// visit policy is the JS core's: FIFO by invalidation with re-queue).
await test("settle traces: kernel ≡ reactive.ts on 60 random graphs", async () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let g = 0; g < 60; g++) {
    const N = 4 + rnd(12), R = 2 + rnd(10);
    const rules = [];
    for (let i = 0; i < R; i++) {
      const target = 1 + rnd(N - 1);
      const reads = new Set(); const nr = 1 + rnd(3);
      for (let j = 0; j < nr; j++) { const c = rnd(N); if (c !== target) reads.add(c); }
      if (reads.size === 0) reads.add(target === 0 ? 1 : 0);
      rules.push({ target, reads: [...reads], k: rnd(5) });
    }
    // no two rules own one cell (the one-owner rule); drop duplicates
    const seen = new Set(); const uniq = rules.filter((r) => !seen.has(r.target) && seen.add(r.target));
    // ── JS core ──
    const cells = Array.from({ length: N }, () => new Cell());
    const vals = Array.from({ length: N }, (_, i) => i);
    const jsLog = [];
    const cs = uniq.map((r, i) => new Constraint("r" + i, () => { jsLog.push(i); return r.reads.reduce((s, c) => s + vals[c], r.k); }, (v) => { if (vals[r.target] !== v) { vals[r.target] = v; cells[r.target].changed(); } }));
    const probes = uniq.map((r) => () => { for (const c of r.reads) cells[c].track(); });
    // ── kernel ── (BODY rules with static edges, the same bodies)
    const img = buildImage({ elems: [{ nslots: N }], cells: Array.from({ length: N }, (_, i) => ({ init: i })), rules: uniq.map((r) => ({ target: r.target, kind: KIND.BODY, edges: r.reads })) });
    const h = host(Object.fromEntries(uniq.map((r, i) => [i, () => r.reads.reduce((s, c) => s + k.table[c], r.k)])));
    const k = await loadKernel(WASM, img, h);
    // the same landing order, then the same drain
    let cyc = false;
    try { for (let i = 0; i < cs.length; i++) cs[i].wire(probes[i]); jsSettle(); } catch (e) { if (!/cycle/.test(String(e))) throw e; cyc = true; }
    for (let i = 0; i < uniq.length; i++) { k.run(i); k.own(uniq[i].target, i); }   // a bound slot has an owner (attributes.ts own)
    const kr = k.settle();
    if (cyc) { assert.equal(kr, ERR.CYCLE, `graph ${g}: JS cycled, kernel did not`); continue; }
    assert.ok(kr >= 0, `graph ${g}: kernel errored ${kr} where JS settled`);
    for (let step = 0; step < 12; step++) {
      jsLog.length = 0; h.log.length = 0;
      const c = rnd(N), v = rnd(50) - 10;
      // a JS author write: the cell value + wake (owned cells refused in both)
      const owned = uniq.some((r) => r.target === c);
      if (owned) { assert.equal(k.write(c, v), ERR.OWNED, `graph ${g}: owned cell accepted`); continue; }
      if (vals[c] !== v) { vals[c] = v; cells[c].changed(); }
      let jsErr = null; try { jsSettle(); } catch (e) { jsErr = e; }
      k.write(c, v); const r = k.settle();
      if (jsErr) { assert.equal(r, ERR.CYCLE, `graph ${g} step ${step}: JS threw, kernel returned ${r}`); break; }
      assert.deepEqual(Array.from(k.table), vals, `graph ${g} step ${step}: values differ`);
      assert.deepEqual(h.log.map((s) => +s.slice(1)), jsLog, `graph ${g} step ${step}: run order differs`);
    }
  }
});

await test("afterSettle ordering matches: steps run at the close, writes fold into the same settle", async () => {
  // JS: a step that writes; the settle loops. Kernel: the host's afterSteps does the same through kernel.set
  const img = buildImage({ elems: [{ nslots: 2 }], cells: [{ init: 0 }, {}], rules: [{ target: 1, kind: KIND.BODY, edges: [0] }] });
  const trace = [];
  let armed = false;
  const h = host({ 0: () => { trace.push("run"); return k.table[0] * 2; } }, { afterSteps: () => { if (!armed) return false; armed = false; trace.push("step"); k.set(0, 7); return true; } });
  const k = await loadKernel(WASM, img, h);
  k.run(0); k.settle(); trace.length = 0;
  armed = true; k.write(0, 3); k.settle();
  assert.deepEqual(trace, ["run", "step", "run"]); assert.equal(k.table[1], 14);
  // the JS core, same shape
  const c0 = new Cell(); let v0 = 0; const jt = [];
  const c = new Constraint("x", () => { c0.track(); jt.push("run"); return v0 * 2; }, () => {});
  c.run(); jsSettle(); jt.length = 0;
  afterSettle(() => { jt.push("step"); v0 = 7; c0.changed(); });
  v0 = 3; c0.changed(); jsSettle();
  assert.deepEqual(jt, trace);
});

console.log(`${passed} passed${process.exitCode ? ", with failures" : ""}`);
