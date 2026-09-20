// meters.template.ts — THE TEMPLATE, not a module this tree uses.
//
// Nothing in main imports this. It is copied to `runtime/src/meters.ts` inside a
// MEASUREMENT COPY of a tree (never main: a shipped runtime must not carry
// meters), and the call sites are then placed by hand. The runbook —
// docs/system-design/comparative-benchmarking.md — says where each one goes and
// why that site and not another.
//
// It lives here because the measurement trees are temporary and this file is the
// one durable artifact of the 2026-09-20 round: it records which quantities can
// be compared ACROSS two unrelated implementations and which cannot, which is
// the part that took the longest to get right and is invisible in the numbers.

// meters — the measurement points for the before/after round, PLACED BY HAND.
//
// WHY BY HAND. The profile rig (mac-host/profile/build-runtime.mjs) injects its
// meters by matching strings in the compiled JS. Across two trees that were
// years apart that is not a reliable comparison: the same patch lands on
// `runBody()` in one tree and `run()` in the other, on `commitOps` here and
// `host().commit` there, and adds kernel counters that exist on only one side.
// Every anchor matches, the build succeeds, and the two numbers quietly count
// DIFFERENT POPULATIONS. A meter placed by reading the code says what it
// measures; a meter placed by string match says only where it landed.
//
// WHAT IS COMPARABLE ACROSS TREES, and what is not:
//
//   settle wall clock   ✅ the same boundary in both — one call to the public
//                          `settle()`, entry to exit. The implementations are
//                          unrelated (a JS queue loop before, a kernel call
//                          after); the QUESTION "how long did settling take"
//                          is the same question.
//   paint               ✅ one backend paint, its milliseconds, and how much of
//                          the surface it covered.
//   commit (Mac)        ✅ serialize + hand to the host, in ms and bytes.
//   instantiate / boot  ✅ same boundary, same meaning.
//   evaluations         ✅ rules DEQUEUED AND RUN during settles. This one took
//                          a fix to become comparable, and the fix is the point
//                          of placing meters by hand. Counting `runBody` in the
//                          merged tree counts only the bodies the kernel calls
//                          back into — EXPR bytecode and the visibility rule
//                          evaluate inside the kernel and never appear — so it
//                          would have reported far FEWER evaluations than the
//                          pre-arc tree and flattered the wrong side. The kernel
//                          already counts every rule it dequeues and returns
//                          that from `kernel_settle` (kernel.c: `runs++` before
//                          `run_queued`), so the merged tree reads THAT, and the
//                          pre-arc tree counts at its own dequeue — the same
//                          event, in both.
//   evalJsN             ── how many of those entered JavaScript. All of them
//                          before; the callback subset after, so the difference
//                          is the work that stayed inside the kernel.
//
// This file exists only in the two MEASUREMENT trees (Declare-Before,
// Declare-After). It is not part of main and nothing ships it.

export interface Meters {
  settleN: number; settleMs: number; settleMax: number;
  /** Rules DEQUEUED AND RUN during settles. Comparable across trees: the
   *  pre-arc tree counts at its own dequeue, the merged tree takes the count
   *  the kernel returns from `kernel_settle` (which counts the same event, for
   *  every rule — JS body, EXPR bytecode, or the visibility rule). */
  evalN: number;
  /** Of those, the ones that RAN A JAVASCRIPT BODY.
   *
   *  ⚠ THE DIFFERENCE `evalN - evalJsN` DOES NOT MEAN THE SAME THING IN BOTH
   *  TREES, and must not be reported as one quantity. A rule can be dequeued
   *  and not run a JS body for two unrelated reasons:
   *    • it was dead or suspended — true in EITHER tree;
   *    • the kernel evaluated it itself (EXPR bytecode, the visibility rule) —
   *      only possible in the merged tree.
   *  So in the pre-arc tree the difference is entirely SKIPPED rules, and
   *  calling it "work that stayed inside the kernel" would invent a kernel for
   *  a tree that has none. Reported as `notInJs`, named for what it is. */
  evalJsN: number;
  paintN: number; paintFullN: number; paintMs: number; paintAreaSum: number; paintAreaN: number;
  commitN: number; commitMs: number; stringifyMs: number; bytes: number; opsN: number;
  instN: number; instMs: number; nfN: number; nfMs: number;
  /** App-level landmarks: `name` → [count, total ms between mark/measure]. */
  marks: Record<string, number>;
  spans: Record<string, { n: number; ms: number; open: number }>;
  mark(name: string): void;
  begin(name: string): void;
  end(name: string): void;
  reset(): void;
  resetAll(): void;
  snapshot(): Record<string, unknown>;
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function make(): Meters {
  const m: Meters = {
    settleN: 0, settleMs: 0, settleMax: 0,
    evalN: 0, evalJsN: 0,
    paintN: 0, paintFullN: 0, paintMs: 0, paintAreaSum: 0, paintAreaN: 0,
    commitN: 0, commitMs: 0, stringifyMs: 0, bytes: 0, opsN: 0,
    instN: 0, instMs: 0, nfN: 0, nfMs: 0,
    marks: Object.create(null),
    spans: Object.create(null),
    mark(name) { m.marks[name] = (m.marks[name] ?? 0) + 1; },
    begin(name) {
      const s = (m.spans[name] ??= { n: 0, ms: 0, open: 0 });
      s.open = now();
    },
    end(name) {
      const s = m.spans[name];
      if (s === undefined || s.open === 0) return;   // an end without a begin is not a span
      s.ms += now() - s.open; s.n++; s.open = 0;
    },
    /** Zero the MEASUREMENT WINDOW. Landmarks deliberately survive: a case's
     *  `reset` step marks where measuring starts, AFTER setup (two windows
     *  opened, a tenant waited for), and the landmarks are the record of what
     *  the whole case did — the evidence the two trees did the same work.
     *  Clearing them here reported `desktop:newFiles: expected 2, recorded 0`
     *  for a case that had just opened two windows. `resetAll` is the one that
     *  clears them, once, when a case begins. */
    reset() {
      m.settleN = m.settleMs = m.settleMax = 0;
      m.evalN = m.evalJsN = 0;
      m.paintN = m.paintFullN = m.paintMs = m.paintAreaSum = m.paintAreaN = 0;
      m.commitN = m.commitMs = m.stringifyMs = m.bytes = m.opsN = 0;
      m.instN = m.instMs = m.nfN = m.nfMs = 0;
    },
    resetAll() {
      m.reset();
      m.marks = Object.create(null);
      m.spans = Object.create(null);
    },
    snapshot() {
      return {
        settle: { n: m.settleN, ms: +m.settleMs.toFixed(2), max: +m.settleMax.toFixed(2) },
        evals: { n: m.evalN, js: m.evalJsN, notInJs: m.evalN - m.evalJsN },
        paint: { n: m.paintN, full: m.paintFullN, ms: +m.paintMs.toFixed(2),
                 area: m.paintAreaN === 0 ? null : +(m.paintAreaSum / m.paintAreaN).toFixed(3) },
        commit: { n: m.commitN, ms: +m.commitMs.toFixed(2), stringifyMs: +m.stringifyMs.toFixed(2),
                  bytes: m.bytes, ops: m.opsN },
        boot: { instN: m.instN, instMs: +m.instMs.toFixed(2), nfN: m.nfN, nfMs: +m.nfMs.toFixed(2) },
        marks: { ...m.marks },
        spans: Object.fromEntries(Object.entries(m.spans).map(([k, v]) => [k, { n: v.n, ms: +v.ms.toFixed(2) }])),
      };
    },
  };
  return m;
}

const g = globalThis as { __M?: Meters };
export const M: Meters = (g.__M ??= make());
