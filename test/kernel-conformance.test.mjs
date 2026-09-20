// test/kernel-conformance.test.mjs — THE TWO KERNELS, ONE CONTRACT.
//
// The C kernel (compiled to WebAssembly) and the JavaScript one (kernel-js.ts)
// are driven through identical scenarios in one process, and everything
// OBSERVABLE is compared: what each call returned, what the table holds, which
// cells came back dirty, which rules ran and in what order, and the exact
// sequence of callbacks the kernel made into the host.
//
// WHY THE SCENARIOS ARE HAND-WRITTEN AND NOT RECORDED (DT, 2026-09-17): a
// recording says what one implementation did, not what an implementation should
// do. The C kernel is the only implementation of these mechanisms and has had
// far less use than the constraint core it replaced, so a recorded trace would
// enshrine its bugs as the specification. Each case below is written from the
// stated contract — docs/system-design/kernel.md and the semantics the suite
// already pins — so when the two disagree, the question "which is right?" has an
// answer that does not depend on which one ran first.
//
// A disagreement here is a real finding either way: the C is the fast path and
// the JavaScript one is the reference, the fallback for a host without
// WebAssembly, and the version you can step through in a debugger.
import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { instantiateKernelSync, decodeWasm, emptyImage } from "../runtime/dist/kernel-loader.js";
import { instantiateKernelJS } from "../runtime/dist/kernel-js.js";
import { KERNEL_WASM_B64 } from "../runtime/dist/kernel-wasm.js";

// opcodes, as declare_kernel.h numbers them
const OP = { END: 0, LOAD: 1, CONST: 2, ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOD: 7, NEG: 8, MIN: 9, MAX: 10,
  ABS: 11, FLOOR: 12, CEIL: 13, ROUND: 14, SQRT: 15, LT: 16, LE: 17, GT: 18, GE: 19, EQ: 20, NE: 21,
  AND: 22, OR: 23, NOT: 24, SELECT: 25, CLAMP: 26 };
const KIND = { EXPR: 0, BODY: 1, DYNAMIC: 2 };
const FLAG = { YIELDING: 1, PHASE1: 2 };
const ERR = { OK: 0, OWNED: -3, CYCLE: -4, AFTER: -5, BOUND: -6 };

/** A host that records what it was asked, and lets a scenario supply bodies. */
function makeHost() {
  const log = [];
  const bodies = new Map();          // rule → () => number
  let afterQueue = [], changeQueue = [];
  const host = {
    body: (rule, elem, target) => {
      log.push(`body ${rule}`);
      const fn = bodies.get(rule);
      return fn ? fn() : 0;
    },
    afterSteps: () => { const f = afterQueue.shift(); if (!f) return false; log.push("after"); f(); return true; },
    fireChanges: () => { const f = changeQueue.shift(); if (!f) return false; log.push("changes"); f(); return true; },
    endChain: () => { log.push("end"); },
    error: (code, rule) => { log.push(`error ${code} rule ${rule}`); },
    schedule: () => { log.push("schedule"); },
    decline: (rule) => { log.push(`decline ${rule}`); },
  };
  return { host, log, bodies, onAfter: (f) => afterQueue.push(f), onChange: (f) => changeQueue.push(f) };
}

/** Everything observable about a kernel after a scenario ran. */
function observe(K, cells) {
  const table = [];
  for (let i = 0; i < cells; i++) {
    const v = K.table[i];
    table.push(Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : String(v));   // ±1 ulp is not a difference worth failing on
  }
  return { table, cells: K.cells(), rules: K.rules(), pending: K.pending() };
}

/** Run one scenario on both kernels and compare everything observable. */
async function bothAgree(name, scenario) {
  await test(name, () => {
    const results = [];
    for (const which of ["wasm", "js"]) {
      const h = makeHost();
      const caps = { extra_cells: 4096, extra_rules: 1024, dyn_edges: 8192, ring: 1024, track_ring: 1024, code_words: 4096, consts: 256 };
      const K = which === "wasm"
        ? instantiateKernelSync(decodeWasm(KERNEL_WASM_B64), emptyImage(), h.host, caps)
        : instantiateKernelJS(h.host, caps);
      const returns = [];
      const record = (label, v) => { returns.push(`${label}=${v}`); return v; };
      scenario(K, h, record);
      results.push({ which, state: observe(K, K.cells()), log: h.log.slice(), returns });
    }
    const [a, b] = results;
    assert.deepEqual(b.returns, a.returns, `the two kernels returned different values\n    wasm: ${a.returns.join(" ")}\n    js:   ${b.returns.join(" ")}`);
    assert.deepEqual(b.state, a.state, `the two kernels ended in different states\n    wasm: ${JSON.stringify(a.state)}\n    js:   ${JSON.stringify(b.state)}`);
    assert.deepEqual(b.log, a.log, `the two kernels called the host differently\n    wasm: ${a.log.join(" | ")}\n    js:   ${b.log.join(" | ")}`);
  });
}

// ── the contract, case by case ──────────────────────────────────────────────

await bothAgree("an expression rule computes, and re-computes when an input moves", (K, h, r) => {
  const a = K.addCell(0, false), b = K.addCell(0, false), out = K.addCell(0, false);
  K.set(a, 3); K.set(b, 4);
  const at = K.addCode([OP.LOAD, a, OP.LOAD, b, OP.ADD, OP.END]);
  const rule = K.addExprRule(out, 0, [a, b], at, 6);
  r("own", K.own(out, rule));
  r("run", K.run(rule));
  r("out", K.table[out]);
  K.set(a, 10);
  r("settle", K.settle());
  r("out2", K.table[out]);
});

await bothAgree("every arithmetic opcode agrees, including the awkward ones", (K, h, r) => {
  const x = K.addCell(0, false), y = K.addCell(0, false), out = K.addCell(0, false);
  const cases = [
    ["add", [OP.LOAD, 0, OP.LOAD, 1, OP.ADD, OP.END], 6, 0.1, 0.2],
    ["div by zero", [OP.LOAD, 0, OP.LOAD, 1, OP.DIV, OP.END], 6, 1, 0],
    ["mod negative", [OP.LOAD, 0, OP.LOAD, 1, OP.MOD, OP.END], 6, -7, 3],
    ["round half", [OP.LOAD, 0, OP.ROUND, OP.END], 4, -0.5, 0],
    ["round half up", [OP.LOAD, 0, OP.ROUND, OP.END], 4, 2.5, 0],
    ["min with NaN", [OP.LOAD, 0, OP.LOAD, 1, OP.MIN, OP.END], 6, NaN, 1],
    ["max with NaN", [OP.LOAD, 0, OP.LOAD, 1, OP.MAX, OP.END], 6, NaN, 1],
    ["and of NaN", [OP.LOAD, 0, OP.LOAD, 1, OP.AND, OP.END], 6, NaN, 1],
    ["not of -0", [OP.LOAD, 0, OP.NOT, OP.END], 4, -0, 0],
    ["select false", [OP.LOAD, 0, OP.LOAD, 1, OP.LOAD, 1, OP.SELECT, OP.END], 8, 0, 5],
    ["clamp above", [OP.LOAD, 0, OP.LOAD, 1, OP.LOAD, 1, OP.CLAMP, OP.END], 8, 9, 2],
    ["sqrt of negative", [OP.LOAD, 0, OP.SQRT, OP.END], 4, -4, 0],
    ["floor of negative", [OP.LOAD, 0, OP.FLOOR, OP.END], 4, -2.5, 0],
    ["equality of NaN", [OP.LOAD, 0, OP.LOAD, 0, OP.EQ, OP.END], 6, NaN, 0],
  ];
  for (const [label, words, n, xv, yv] of cases) {
    K.set(x, xv); K.set(y, yv);
    const at = K.addCode(words.map((w, i) => (words[i - 1] === OP.LOAD ? (w === 0 ? x : y) : w)));
    const rule = K.addExprRule(out, 0, [x, y], at, n);
    K.run(rule);
    r(label, String(K.table[out]));
    K.dispose(rule);
  }
});

await bothAgree("a write to an owned cell is refused, and a YIELDING owner steps aside", (K, h, r) => {
  const src = K.addCell(0, false), out = K.addCell(0, false);
  K.set(src, 2);
  const at = K.addCode([OP.LOAD, src, OP.END]);
  const strict = K.addExprRule(out, 0, [src], at, 3);
  r("own", K.own(out, strict));
  K.run(strict);
  r("write refused", K.write(out, 99));
  r("value kept", K.table[out]);
  K.dispose(strict);

  const yielding = K.addExprRule(out, FLAG.YIELDING, [src], at, 3);
  r("own2", K.own(out, yielding));
  K.run(yielding);
  r("write accepted", K.write(out, 42));
  r("value taken", K.table[out]);
  K.set(src, 7);
  r("settle", K.settle());
  r("owner gone, value stands", K.table[out]);
});

await bothAgree("a dynamic rule re-discovers its reads every run", (K, h, r) => {
  const pick = K.addCell(0, false), a = K.addCell(0, false), b = K.addCell(0, false), out = K.addCell(0, false);
  K.set(pick, 0); K.set(a, 10); K.set(b, 20);
  const rule = K.addRule(out, KIND.DYNAMIC, 0, [pick], 0);
  h.bodies.set(rule, () => {
    K.track(pick);
    const from = K.table[pick] === 0 ? a : b;
    K.track(from);
    return K.table[from];
  });
  K.own(out, rule);
  r("run", K.run(rule));
  r("out", K.table[out]);
  // ⚠ ORDER IS NOT PART OF THE CONTRACT, and the two differ: the C prepends each
  // discovered edge to a list (so it reports them newest-first) while the
  // JavaScript one appends (oldest-first). Nothing documented promises an order,
  // and `deps` is a diagnostic — but it does mean the PULL visits a rule's
  // queued owners in a different order on the two kernels, which deserves a
  // ruling rather than a shrug. Compared as a set until there is one.
  r("deps", K.deps(rule).slice().sort((x, y) => x - y).join(","));
  K.set(b, 21);                  // not read yet: nothing should wake
  r("settle quiet", K.settle());
  K.set(pick, 1);
  r("settle switch", K.settle());
  r("out2", K.table[out]);
  r("deps2", K.deps(rule).slice().sort((x, y) => x - y).join(","));
  K.set(a, 11);                  // no longer read: still quiet
  r("settle after switch", K.settle());
  r("out3", K.table[out]);
});

await bothAgree("phase 1 runs after every phase 0 rule", (K, h, r) => {
  const src = K.addCell(0, false), first = K.addCell(0, false), second = K.addCell(0, false);
  K.set(src, 1);
  const order = [];
  const r0 = K.addRule(first, KIND.BODY, 0, [src], 0);
  const r1 = K.addRule(second, KIND.BODY, FLAG.PHASE1, [src], 0);
  const r2 = K.addRule(-1, KIND.BODY, 0, [src], 0);
  h.bodies.set(r0, () => { order.push("p0-a"); return 1; });
  h.bodies.set(r1, () => { order.push("p1"); return 1; });
  h.bodies.set(r2, () => { order.push("p0-b"); return 1; });
  K.run(r0); K.run(r1); K.run(r2);
  order.length = 0;
  K.set(src, 2);
  r("settle", K.settle());
  r("order", order.join(" "));
});

await bothAgree("a rule that re-runs without end is a cycle, and the settle reports it", (K, h, r) => {
  const cell = K.addCell(0, false);
  const rule = K.addRule(-1, KIND.BODY, 0, [cell], 0);
  let n = 0;
  h.bodies.set(rule, () => { K.set(cell, ++n); return 1; });   // wakes itself, forever
  K.run(rule);
  K.set(cell, 1);
  r("settle", K.settle());
});

await bothAgree("after-settle steps and change events loop until quiet", (K, h, r) => {
  const cell = K.addCell(0, false), out = K.addCell(0, false);
  const at = K.addCode([OP.LOAD, cell, OP.LOAD, cell, OP.ADD, OP.END]);
  const rule = K.addExprRule(out, 0, [cell], at, 6);
  K.own(out, rule);
  K.run(rule);
  h.onAfter(() => K.set(cell, 5));       // a step that writes: the settle loops back
  h.onChange(() => K.set(cell, 6));      // and so does a change event
  K.set(cell, 1);
  r("settle", K.settle());
  r("out", K.table[out]);
});

await bothAgree("suspend stops a rule; resume runs it once and re-wires", (K, h, r) => {
  const src = K.addCell(0, false), out = K.addCell(0, false);
  K.set(src, 1);
  const at = K.addCode([OP.LOAD, src, OP.END]);
  const rule = K.addExprRule(out, 0, [src], at, 3);
  K.own(out, rule);
  K.run(rule);
  K.suspend(rule);
  K.set(src, 2);
  r("settle while suspended", K.settle());
  r("out unchanged", K.table[out]);
  r("resume", K.resume(rule));
  r("out after resume", K.table[out]);
  K.set(src, 3);
  r("settle", K.settle());
  r("out follows again", K.table[out]);
});

await bothAgree("disposing a rule drops its edges and frees its cell", (K, h, r) => {
  const src = K.addCell(0, false), out = K.addCell(0, false);
  K.set(src, 1);
  const at = K.addCode([OP.LOAD, src, OP.END]);
  const rule = K.addExprRule(out, 0, [src], at, 3);
  K.own(out, rule);
  K.run(rule);
  r("owner", K.owner(out));
  K.dispose(rule);
  r("owner after dispose", K.owner(out));
  r("listened", K.listened(src) ? 1 : 0);
  K.set(src, 9);
  r("settle", K.settle());
  r("out frozen", K.table[out]);
  r("write now allowed", K.write(out, 5));
});

await bothAgree("rewiring replaces a rule's reads wholesale", (K, h, r) => {
  const a = K.addCell(0, false), b = K.addCell(0, false), out = K.addCell(0, false);
  K.set(a, 1); K.set(b, 2);
  const at = K.addCode([OP.LOAD, a, OP.END]);
  const rule = K.addExprRule(out, 0, [a], at, 3);
  K.own(out, rule);
  K.run(rule);
  // ⚠ ORDER IS NOT PART OF THE CONTRACT, and the two differ: the C prepends each
  // discovered edge to a list (so it reports them newest-first) while the
  // JavaScript one appends (oldest-first). Nothing documented promises an order,
  // and `deps` is a diagnostic — but it does mean the PULL visits a rule's
  // queued owners in a different order on the two kernels, which deserves a
  // ruling rather than a shrug. Compared as a set until there is one.
  r("deps", K.deps(rule).slice().sort((x, y) => x - y).join(","));
  r("rewire", K.rewire(rule, [b]));
  r("deps2", K.deps(rule).slice().sort((x, y) => x - y).join(","));
  K.set(a, 5);
  r("settle on old input", K.settle());
  K.set(b, 6);
  r("settle on new input", K.settle());
});

await bothAgree("the write ring carries host writes into the next settle", (K, h, r) => {
  const src = K.addCell(0, false), out = K.addCell(0, false);
  const at = K.addCode([OP.LOAD, src, OP.END]);
  const rule = K.addExprRule(out, 0, [src], at, 3);
  K.own(out, rule);
  K.run(rule);
  // the host's own path: write the table, then append the id to the ring
  K.table[src] = 12;
  K.ring[K.ringCount[0]++] = src;
  r("settle", K.settle());
  r("out", K.table[out]);
});

await bothAgree("a freed cell's subscribers survive, minus that edge", (K, h, r) => {
  const a = K.addCell(0, false), b = K.addCell(0, false), out = K.addCell(0, false);
  K.set(a, 1); K.set(b, 2);
  const at = K.addCode([OP.LOAD, a, OP.LOAD, b, OP.ADD, OP.END]);
  const rule = K.addExprRule(out, 0, [a, b], at, 6);
  K.own(out, rule);
  K.run(rule);
  K.freeCell(a);
  r("deps after free", K.deps(rule).slice().sort((x, y) => x - y).join(","));
  K.set(b, 5);
  r("settle", K.settle());
  r("out", K.table[out]);
});

await bothAgree("a REF cell carries the wake but no value", (K, h, r) => {
  const ref = K.addCell(1, false), out = K.addCell(0, false);   // kind 1 = REF
  const rule = K.addRule(out, KIND.BODY, 0, [ref], 0);
  let runs = 0;
  h.bodies.set(rule, () => { runs++; return runs; });
  K.own(out, rule);
  K.run(rule);
  r("runs", runs);
  K.touch(ref);
  r("settle", K.settle());
  r("runs after touch", runs);
  r("ref value untouched", K.table[ref]);
});

summarize("kernel-conformance");
