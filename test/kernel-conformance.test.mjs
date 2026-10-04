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
import { VIEW_LAYOUT_FIELDS } from "../runtime/dist/kernel-loader.js";

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
async function bothAgree(name, scenario, capsOverride = null) {
  await test(name, () => {
    const results = [];
    for (const which of ["wasm", "js"]) {
      const h = makeHost();
      const caps = capsOverride ?? { extra_elems: 256, extra_cells: 4096, extra_rules: 1024, dyn_edges: 8192, ring: 1024, track_ring: 1024, code_words: 4096, consts: 256 };
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
  r("deps", K.deps(rule).join(","));
  K.set(b, 21);                  // not read yet: nothing should wake
  r("settle quiet", K.settle());
  K.set(pick, 1);
  r("settle switch", K.settle());
  r("out2", K.table[out]);
  r("deps2", K.deps(rule).join(","));
  K.set(a, 11);                  // no longer read: still quiet
  r("settle after switch", K.settle());
  r("out3", K.table[out]);
});

// THE TRACK RING'S OWNER MARKS (declare_kernel.h DK_TRACK_OWNER): reads appended
// with no call, closed under the rule a mark names — the runtime marks where a
// body hands the active rule to its outer (its apply) or to nobody (untracked).
// Written as the contract, not as agreement: each read lands where it says.
await bothAgree("the track ring: owner marks close reads under the rule they name", (K, h, r) => {
  const OWNER = 0x80000000, NOBODY = 0x7fffffff;
  const [a, b, c, d, e] = [0, 0, 0, 0, 0].map(() => K.addCell(0, false));
  const push = (v) => { K.trackRing[K.trackCount[0]++] = v; };
  const outer = K.addRule(-1, KIND.DYNAMIC, 0, [], 0);
  const inner = K.addRule(-1, KIND.DYNAMIC, 0, [], 0);
  h.bodies.set(outer, () => { K.run(inner); return 0; });
  h.bodies.set(inner, () => {
    push(a); push(b); push(OWNER | inner);       // the body's reads: inner's
    K.active[0] = outer;
    push(c); push(OWNER | outer);                // its apply's, under the outer tracker
    K.active[0] = -1;
    push(d); push(OWNER | NOBODY);               // made untracked: nobody's
    K.active[0] = inner;
    push(e);                                     // after the last mark: the rule active at the drain
    return 0;
  });
  r("run", K.run(outer));
  const deps = (rule) => K.deps(rule).slice().sort((x, y) => x - y).join(",");
  assert.equal(deps(inner), [a, b, e].join(","), "inner's reads: before its mark, and after the last");
  assert.equal(deps(outer), String(c), "outer's: the apply's read");
  r("inner deps", deps(inner)); r("outer deps", deps(outer));
  K.set(d, 1);                                   // nobody reads d
  r("settle d", K.settle());
  K.set(c, 1);                                   // wakes outer, which runs inner
  r("settle c", K.settle());
  K.set(e, 1);                                   // inner re-linked e on that run
  r("settle e", K.settle());
});

// A GROWTH IN THE MIDDLE OF A DRAIN: a rule's reads wait in the track ring
// while the edge table is nearly full, so linking them asks the host for room
// and the kernel's tables move. Every read must arrive as an edge — the ring's
// entries cross the move with it (kernel.c drain_track asks for room before it
// resets the count). Opened tiny, the scenario grows the edge table here.
await bothAgree("the track ring survives a growth in the middle of its drain", (K, h, r) => {
  const cells = [];
  for (let i = 0; i < 200; i++) { const c = K.addCell(0, false); cells.push(c); K.set(c, i); }
  const push = (v) => { K.trackRing[K.trackCount[0]++] = v; };
  const rule = K.addRule(-1, KIND.DYNAMIC, 0, [], 0);
  h.bodies.set(rule, () => { for (const c of cells) push(c); return 0; });   // 200 reads, 64 edges of room
  r("run", K.run(rule));
  const deps = K.deps(rule);
  assert.equal(deps.length, cells.length, `every read became an edge (${deps.length} of ${cells.length})`);
  r("deps", deps.length);
  K.set(cells[199], 1000);                        // the last read wakes it
  r("settle", K.settle());
}, { extra_elems: 8, extra_cells: 256, extra_rules: 16, dyn_edges: 64, ring: 256, code_words: 64, consts: 8, track_ring: 256 });

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
  r("deps", K.deps(rule).join(","));
  r("rewire", K.rewire(rule, [b]));
  r("deps2", K.deps(rule).join(","));
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
  r("deps after free", K.deps(rule).join(","));
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


// ── the built-in VIEW rules (EVAL-KERNEL: the port into kernel-js) ──────────
// Random view trees laid out the way view.ts lays out View blocks; both kernels
// get the same tree, the same writes, the same rules, and must end identical.
const LAYOUT = Object.fromEntries(VIEW_LAYOUT_FIELDS.map((f, i) => [f, i]));
const NF = VIEW_LAYOUT_FIELDS.length;
function viewTree(K, seed, n) {
  let s = seed; const rnd = (m) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % m; };
  K.viewLayout(LAYOUT);
  const dpr = K.addCell(0, false); K.set(dpr, 2); K.viewDprCell(dpr);
  const base = K.addCells(n * NF);
  const views = [], bases = [];
  for (let i = 0; i < n; i++) {
    const b = base + i * NF; bases.push(b);
    const set = (f, v) => K.set(b + LAYOUT[f], v);
    set("x", rnd(400) - 60); set("y", rnd(300) - 60); set("width", i === 0 ? 800 : 20 + rnd(300)); set("height", i === 0 ? 600 : 20 + rnd(200));
    set("visible", rnd(9) === 0 ? 0 : 1);
    set("scale", rnd(3) === 0 ? 0.5 + rnd(20) / 10 : 1); set("scaleX", 1); set("scaleY", rnd(6) === 0 ? 0.7 : 1);
    set("rotation", rnd(4) === 0 ? rnd(90) - 45 : 0); set("skewX", rnd(6) === 0 ? rnd(30) - 15 : 0); set("skewY", 0);
    set("pivotX", rnd(80)); set("pivotY", rnd(60));
    set("scrollsOn", rnd(3) === 0 ? 1 : 0); set("scrollX", rnd(50)); set("scrollY", rnd(120)); set("ignoreScroll", rnd(8) === 0 ? 1 : 0);
    set("rotateX", 0); set("rotateY", 0); set("translateZ", 0); set("ignoreClip", 0);
    const parent = i === 0 ? -1 : views[rnd(i)];
    views.push(K.viewAdd(b, parent));
  }
  return { views, bases, rnd, dpr };
}

await bothAgree("the visibility rule: random trees, transforms, scrolls, hidden ancestors", (K, h, r) => {
  const { views, bases, rnd, dpr } = viewTree(K, 11, 24);
  const rules = views.map((v) => K.visAdd(v, views[0]));
  r("added", rules.join(","));
  for (const rule of rules) K.run(rule);
  for (let round = 0; round < 6; round++) {
    for (let w = 0; w < 5; w++) {
      const b = bases[rnd(bases.length)], f = ["x", "y", "width", "scale", "rotation", "scrollY", "visible"][rnd(7)];
      K.set(b + LAYOUT[f], f === "visible" ? rnd(2) : f === "scale" ? 0.5 + rnd(15) / 10 : rnd(300) - 40);
    }
    if (round === 3) { K.set(dpr, 3); K.set(bases[5] + LAYOUT.rotateX, 20); }   // a 3D ancestor: the host's walk takes over
    r(`settle${round}`, K.settle() >= 0);
  }
  // reparent a view and rewire its rule
  K.viewParent(views[7], views[2]); r("rewire", K.visRewire(rules[7])); K.run(rules[7]);
  r("final", K.settle() >= 0);
});

await bothAgree("the auto-extent rule: footprints, percent-owned and hidden children, a 3D decline", (K, h, r) => {
  const { views, bases, rnd } = viewTree(K, 23, 10);
  const targetW = K.addCell(0, false), targetH = K.addCell(0, false);
  const kids = bases.slice(1, 8);
  const ew = K.extentAdd(0, targetW, [0xffffffff, ...kids]); r("ew", ew); r("ownW", K.own(targetW, ew));
  const eh = K.extentAdd(1, targetH, [0xffffffff, ...kids]); r("eh", eh); r("ownH", K.own(targetH, eh));
  K.run(ew); K.run(eh); r("w0", K.table[targetW]); r("h0", K.table[targetH]);
  // a percent binding owns one child's width: the extent skips that child
  const at = K.addCode([OP.CONST, K.addConst(50), OP.END]);
  const pct = K.addExprRule(kids[2] + LAYOUT.width, 4, [], at, 3); K.own(kids[2] + LAYOUT.width, pct); K.run(pct);
  r("s1", K.settle() >= 0); r("w1", K.table[targetW]);
  for (let w = 0; w < 8; w++) K.set(kids[rnd(kids.length)] + LAYOUT[["x", "y", "width", "height", "rotation", "visible"][rnd(6)]], rnd(200));
  r("s2", K.settle() >= 0); r("w2", K.table[targetW]); r("h2", K.table[targetH]);
  K.set(kids[4] + LAYOUT.translateZ, 30);   // out of the plane: declined, value kept
  r("s3", K.settle() >= 0); r("w3", K.table[targetW]);
  r("rewire", K.extentRewire(ew, [0xffffffff, ...kids.slice(0, 3)])); K.run(ew); r("w4", K.table[targetW]);
  // an author write displaces the yielding extent
  r("write", K.write(targetH, 77)); r("h5", K.table[targetH]);
});


// ── GROWTH: the capacities are an opening size, not a ceiling ────────────────
// Both kernels open tiny here and are driven far past it. The WebAssembly
// kernel grows between settles (the loader's reserve) and on a spent capacity
// at an allocating call; the JavaScript one grows as it goes. Either way the
// program sees nothing: the same values, the same host calls.
await bothAgree("tables grow past their opening capacities: cells, rules, reads, code, constants, views", (K, h, r) => {
  const cells = [];
  for (let i = 0; i < 300; i++) { const c = K.addCell(0, false); cells.push(c); K.set(c, i); }
  r("cells", K.cells());
  const outs = [];
  for (let i = 0; i < 120; i++) {
    const out = K.addCell(0, false);
    const a = cells[i], b = cells[(i * 7) % 300];
    const at = K.addCode([OP.LOAD, a, OP.LOAD, b, OP.ADD, OP.CONST, K.addConst(i), OP.ADD, OP.END]);
    const rule = K.addExprRule(out, 0, [a, b], at, 9);
    K.own(out, rule); K.run(rule); outs.push(out);
  }
  r("rules", K.rules());
  r("settle1", K.settle());
  for (let i = 0; i < 300; i += 3) K.set(cells[i], cells[i] * 2 + 1);
  r("settle2", K.settle());
  r("outs", outs.map((o) => K.table[o]).join(","));
  const bases = K.addCells(28 * 40);
  K.viewLayout(Object.fromEntries(VIEW_LAYOUT_FIELDS.map((f, i) => [f, i])));
  const views = [];
  for (let i = 0; i < 40; i++) views.push(K.viewAdd(bases + 28 * i, i === 0 ? -1 : views[(i - 1) >> 1]));
  r("views", views.join(","));
  r("fits", K.capacity >= K.cells() ? "yes" : "no");
  // after growing, the capacity IS the table's size as the kernel holds it, and
  // the table view spans exactly it (a view past the table reads memory that is
  // not the table; one past the memory's end fails, stranding every view after it)
  r("capacity is the table", K.capacity === K.tableSize() && K.table.length === K.capacity ? "yes" : `no: capacity ${K.capacity}, table ${K.tableSize()}, view ${K.table.length}`);
}, { extra_elems: 8, extra_cells: 64, extra_rules: 16, dyn_edges: 64, ring: 256, code_words: 64, consts: 8, track_ring: 256 });

// ── rule lifecycle under teardown ───────────────────────────────────────────
// A body can tear down the view that owns it — a reconcile discarding rows, an
// `exists` going false — and so dispose the very rule that is running. The id
// must not be handed out again while that run is on the stack, nothing may land
// for it, and it must reach the free list exactly once.

await bothAgree("a rule disposed by its own body lands nothing, and its id is freed once, after the run", (K, h, r) => {
  const src = K.addCell(0, false), out = K.addCell(0, false);
  const rule = K.addRule(out, KIND.BODY, FLAG.YIELDING, [src]);
  r("own", K.own(out, rule));
  h.bodies.set(rule, () => {
    K.dispose(rule);
    assert.notEqual(r("allocated while running", K.addRule(-1, KIND.BODY, 0, [])), rule, "the running rule's id is not handed out");
    return 42;
  });
  r("run", K.run(rule));
  assert.equal(r("nothing landed", K.table[out]), 0, "a disposed rule lands nothing");
  const a = K.addRule(-1, KIND.BODY, 0, []), b = K.addRule(-1, KIND.BODY, 0, []);
  assert.notEqual(a, b, "the freed id is handed out once");
  r("ids", `${a},${b}`);
});


// A body's reads become edges once it has run; the host grows the edge table
// first when they may not fit. A free list holding a few nodes is not room for
// a long batch — the batch must still land, with no capacity error.
await bothAgree("a long batch of reads lands though only a short free list is spare", (K, h, r) => {
  const cells = []; for (let i = 0; i < 40; i++) cells.push(K.addCell(0, false));
  const push = (v) => { K.trackRing[K.trackCount[0]++] = v; };
  const reader = (n) => { const rule = K.addRule(-1, KIND.DYNAMIC, 0, [], 0); h.bodies.set(rule, () => { for (let i = 0; i < n; i++) push(cells[i]); return 0; }); return rule; };
  const a = reader(6); K.run(a); K.dispose(a);         // six nodes back on the free list
  const b = reader(40); r("run", K.run(b));            // forty reads: more than the free list holds
  assert.ok(!h.log.some((l) => l.startsWith("error -7")), "no capacity error: " + h.log.filter((l) => l.startsWith("error")).join(", "));
  assert.equal(K.deps(b).length, 40, "every read became an edge");
}, { extra_elems: 16, extra_cells: 256, extra_rules: 64, dyn_edges: 12, ring: 64, track_ring: 256, code_words: 64, consts: 16 });

summarize("kernel-conformance");
