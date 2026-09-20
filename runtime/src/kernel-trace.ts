// kernel-trace — a recording of everything that crosses the kernel boundary, so
// a failure that only happens inside a running program can be replayed outside
// one, step by step, in a debugger.
//
// WHY (2026-09-17): the desktop's focus bug took an afternoon because the rule
// graph lives in the kernel's arrays rather than in JavaScript objects, so there
// was nothing to read — I found it by poking values and watching what changed.
// A trace turns that into a file.
//
// WHAT IT IS NOT: a definition of correct. A recording says what THIS build did,
// not what a build should do (DT's ruling, 2026-09-17: the C kernel has had far
// less of a workout than the core it replaced, so recording it and calling the
// result expected would freeze its bugs). A trace is evidence and a repro; the
// suite and the written contract are the oracle.
//
// WHAT IT RECORDS. Every call the runtime makes INTO the kernel, in order, with
// its arguments and its return — and every call the kernel makes OUT to the
// host (a rule body, the after-settle drain, change events, an error), with what
// that callback did. A replay feeds the host calls back from the recording, so
// the kernel under test is a pure function of the trace and the two
// implementations can be compared step for step.
//
//   DECLARE_KERNEL_TRACE=/tmp/desktop.trace node …      (node)
//   globalThis.__declareKernelTrace = true              (a page; read it back
//                                                        from __declareTraceDump)
import type { Kernel, KernelHost } from "./kernel-loader.js";

/** One crossing. `[op, …args]` for a call in; `["<", op, …]` for a callback out.
 *  Arrays, not objects: a long trace is mostly punctuation otherwise. */
export type TraceStep = (string | number | number[])[];

export interface Trace {
  steps: TraceStep[];
  /** Cheap, order-sensitive fingerprints of the table, taken at each settle's
   *  end — enough to locate a divergence without storing the whole table. */
  marks: Array<{ at: number; runs: number; cells: number; rules: number; sum: number }>;
}

const ARG_LIMIT = 64;   // edge lists are summarized past this; the count is what matters

const summarize = (a: ArrayLike<number>): number[] => {
  const out: number[] = [];
  const n = Math.min(a.length, ARG_LIMIT);
  for (let i = 0; i < n; i++) out.push(a[i]);
  if (a.length > n) out.push(-a.length);   // negative = "and this many in total"
  return out;
};

/** A fingerprint of the value table: order-sensitive, cheap, and stable across
 *  implementations (it is only arithmetic on the values themselves). */
function fingerprint(table: Float64Array, cells: number): number {
  let h = 0x811c9dc5;
  const view = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < cells; i++) {
    const v = table[i];
    if (v === 0) continue;                 // the common case, and 0 vs -0 must not matter
    view.setFloat64(0, v);
    h = (h ^ i) >>> 0;
    h = Math.imul(h ^ view.getUint32(0), 0x01000193) >>> 0;
    h = Math.imul(h ^ view.getUint32(4), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Wrap a kernel and a host so that every crossing is recorded. The returned
 *  kernel behaves exactly as the one given — recording changes nothing but
 *  speed, and it is off unless asked for. */
export function traceKernel(k: Kernel, host: KernelHost): { kernel: Kernel; host: KernelHost; trace: Trace } {
  const trace: Trace = { steps: [], marks: [] };
  const step = (...s: TraceStep): void => { trace.steps.push(s); };

  const tracedHost: KernelHost = {
    body: (rule, elem, target) => { step("<body", rule, elem, target); const v = host.body(rule, elem, target); step("<body=", v); return v; },
    afterSteps: () => { const r = host.afterSteps(); step("<after", r ? 1 : 0); return r; },
    fireChanges: () => { const r = host.fireChanges(); step("<changes", r ? 1 : 0); return r; },
    endChain: () => { step("<end"); host.endChain(); },
    error: (code, rule) => { step("<error", code, rule); host.error(code, rule); },
    schedule: () => { step("<schedule"); host.schedule(); },
    decline: (rule) => { step("<decline", rule); host.decline(rule); },
  };

  const kernel: Kernel = Object.create(k) as Kernel;
  const wrap1 = <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A): R => { step(name, ...(a as unknown[]).map((x) => (typeof x === "number" ? x : (typeof x === "boolean" ? (x ? 1 : 0) : summarize(x as ArrayLike<number>)))) as TraceStep); return fn(...a); };

  // the calls that CHANGE something — reads (table, stateOf, listened) are left
  // alone: they are on every hot path and say nothing a replay needs
  kernel.write = wrap1("write", k.write.bind(k));
  kernel.set = wrap1("set", k.set.bind(k));
  kernel.touch = wrap1("touch", k.touch.bind(k));
  kernel.own = wrap1("own", k.own.bind(k));
  kernel.release = wrap1("release", k.release.bind(k));
  kernel.run = wrap1("run", k.run.bind(k));
  kernel.invalidate = wrap1("invalidate", k.invalidate.bind(k));
  kernel.dispose = wrap1("dispose", k.dispose.bind(k));
  kernel.suspend = wrap1("suspend", k.suspend.bind(k));
  kernel.resume = wrap1("resume", k.resume.bind(k));
  kernel.track = wrap1("track", k.track.bind(k));
  kernel.flush = wrap1("flush", k.flush.bind(k));
  kernel.addCell = wrap1("addCell", k.addCell.bind(k));
  kernel.addCells = wrap1("addCells", k.addCells.bind(k));
  kernel.clearCells = wrap1("clearCells", k.clearCells.bind(k));
  kernel.freeCell = wrap1("freeCell", k.freeCell.bind(k));
  kernel.rewire = wrap1("rewire", k.rewire.bind(k));
  kernel.addRule = wrap1("addRule", k.addRule.bind(k));
  kernel.addExprRule = wrap1("addExprRule", k.addExprRule.bind(k));
  kernel.addCode = wrap1("addCode", k.addCode.bind(k));
  kernel.addConst = wrap1("addConst", k.addConst.bind(k));
  kernel.abort = wrap1("abort", k.abort.bind(k));
  kernel.extentAdd = wrap1("extentAdd", k.extentAdd.bind(k));
  kernel.extentRewire = wrap1("extentRewire", k.extentRewire.bind(k));
  kernel.visAdd = wrap1("visAdd", k.visAdd.bind(k));
  kernel.viewAdd = wrap1("viewAdd", k.viewAdd.bind(k));
  kernel.viewParent = wrap1("viewParent", k.viewParent.bind(k));
  kernel.viewRemove = wrap1("viewRemove", k.viewRemove.bind(k));

  // a settle is the unit a replay compares: record what it ran and where the
  // table stood afterwards
  kernel.settle = (): number => {
    step("settle");
    const runs = k.settle();
    trace.marks.push({ at: trace.steps.length, runs, cells: k.cells(), rules: k.rules(), sum: fingerprint(k.table, k.cells()) });
    step("settle=", runs);
    return runs;
  };

  return { kernel, host: tracedHost, trace };
}

/** Is tracing asked for, and where should it go? */
export function traceTarget(): string | null {
  const g = globalThis as { __declareKernelTrace?: boolean | string; process?: { env?: Record<string, string | undefined> } };
  if (typeof g.__declareKernelTrace === "string") return g.__declareKernelTrace;
  if (g.__declareKernelTrace === true) return "memory";
  return g.process?.env?.DECLARE_KERNEL_TRACE ?? null;
}
