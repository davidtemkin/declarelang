const ARG_LIMIT = 64; // edge lists are summarized past this; the count is what matters
const summarize = (a) => {
    const out = [];
    const n = Math.min(a.length, ARG_LIMIT);
    for (let i = 0; i < n; i++)
        out.push(a[i]);
    if (a.length > n)
        out.push(-a.length); // negative = "and this many in total"
    return out;
};
/** A fingerprint of the value table: order-sensitive, cheap, and stable across
 *  implementations (it is only arithmetic on the values themselves). */
function fingerprint(table, cells) {
    let h = 0x811c9dc5;
    const view = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < cells; i++) {
        const v = table[i];
        if (v === 0)
            continue; // the common case, and 0 vs -0 must not matter
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
export function traceKernel(k, host) {
    const trace = { steps: [], marks: [] };
    const step = (...s) => { trace.steps.push(s); };
    const tracedHost = {
        body: (rule, elem, target) => { step("<body", rule, elem, target); const v = host.body(rule, elem, target); step("<body=", v); return v; },
        afterSteps: () => { const r = host.afterSteps(); step("<after", r ? 1 : 0); return r; },
        fireChanges: () => { const r = host.fireChanges(); step("<changes", r ? 1 : 0); return r; },
        endChain: () => { step("<end"); host.endChain(); },
        error: (code, rule) => { step("<error", code, rule); host.error(code, rule); },
        schedule: () => { step("<schedule"); host.schedule(); },
        decline: (rule) => { step("<decline", rule); host.decline(rule); },
    };
    const kernel = Object.create(k);
    const wrap1 = (name, fn) => (...a) => { step(name, ...a.map((x) => (typeof x === "number" ? x : (typeof x === "boolean" ? (x ? 1 : 0) : summarize(x))))); return fn(...a); };
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
    kernel.settle = () => {
        step("settle");
        const runs = k.settle();
        trace.marks.push({ at: trace.steps.length, runs, cells: k.cells(), rules: k.rules(), sum: fingerprint(k.table, k.cells()) });
        step("settle=", runs);
        return runs;
    };
    return { kernel, host: tracedHost, trace };
}
/** Is tracing asked for, and where should it go? */
export function traceTarget() {
    const g = globalThis;
    if (typeof g.__declareKernelTrace === "string")
        return g.__declareKernelTrace;
    if (g.__declareKernelTrace === true)
        return "memory";
    return g.process?.env?.DECLARE_KERNEL_TRACE ?? null;
}
//# sourceMappingURL=kernel-trace.js.map