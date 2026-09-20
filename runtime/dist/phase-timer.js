// phase-timer — EXCLUSIVE time per category while the first mount's attach
// runs (boot.ts mountApp), to split `app.attach` into its parts on a device.
// Measurement only: every call site is guarded by __DECLARE_DEV_SWITCHES__ and
// folds to the plain call in a shipped build, so this module is dropped there.
//
// Exclusive: a nested phase pauses its parent, so the categories add up to the
// attach total. On Safari, performance.now() has ~1 ms resolution: one short
// call reads as 0 or 1 ms, but over hundreds of calls the SUMS are unbiased —
// read category totals, not single calls. Read back from
// globalThis.__declarePhaseTotals after mount.
export let phasesOn = false;
const totals = {};
const stack = [];
const acc = (name, ms) => { (totals[name] ??= { ms: 0, n: 0 }).ms += ms; };
export function phaseIn(name) {
    const now = performance.now();
    const top = stack[stack.length - 1];
    if (top !== undefined)
        acc(top.name, now - top.t);
    stack.push({ name, t: now });
    (totals[name] ??= { ms: 0, n: 0 }).n++;
}
export function phaseOut() {
    const now = performance.now();
    const top = stack.pop();
    if (top === undefined)
        return;
    acc(top.name, now - top.t);
    const parent = stack[stack.length - 1];
    if (parent !== undefined)
        parent.t = now;
}
export function phased(name, fn) {
    phaseIn(name);
    try {
        return fn();
    }
    finally {
        phaseOut();
    }
}
/** Code that must be WRAPPED only while timing (the kernel's methods: wrapping
 *  them for good would tax every call in a profiling build's interactive runs)
 *  registers an arm/disarm pair here. */
const hooks = [];
export function registerPhaseHooks(arm, disarm) { hooks.push({ arm, disarm }); if (phasesOn)
    arm(); }
/** Wrap `obj`'s named methods so each call is timed under its category; returns
 *  the undo. */
export function wrapMethods(obj, groups) {
    const saved = [];
    for (const [cat, names] of Object.entries(groups))
        for (const n of names) {
            const f = obj[n];
            if (typeof f !== "function")
                continue;
            saved.push([n, f]);
            obj[n] = function (...a) { phaseIn(cat); try {
                return f.apply(this, a);
            }
            finally {
                phaseOut();
            } };
        }
    return () => { for (const [n, f] of saved)
        obj[n] = f; };
}
/** Begin timing (idempotent — the first caller names the root category, the
 *  catch-all for time no finer category claims). */
export function phasesStart(root = "attach, other") {
    if (phasesOn || typeof performance === "undefined")
        return;
    phasesOn = true;
    phaseIn(root);
    for (const h of hooks)
        h.arm();
}
export function phasesStop() {
    if (!phasesOn)
        return;
    while (stack.length > 0)
        phaseOut();
    for (const h of hooks)
        h.disarm();
    phasesOn = false;
    globalThis.__declarePhaseTotals = totals;
}
//# sourceMappingURL=phase-timer.js.map