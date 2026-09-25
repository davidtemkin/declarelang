// The wall clock and the alarm — one seam for everything in the runtime that
// waits on real time: Time's tiers and periods (time.ts) and a node's
// `afterDelay(ms, fn)` (node.ts). Swappable for tests (setTimeHost), so a test or a
// driver advances time by hand and both see the same clock. A leaf module: it
// imports nothing, so node.ts can reach it from the bottom of the graph.
const g = globalThis;
const REAL_HOST = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
    // A hidden page paints nothing, so waiting for a frame would wait for the
    // page to come back; the next turn stands in for it.
    frame: (fn) => typeof g.requestAnimationFrame === "function" && g.document?.hidden !== true
        ? { raf: g.requestAnimationFrame(fn) }
        : { timer: setTimeout(fn, 0) },
    cancelFrame: (h) => {
        const x = h;
        if (x.raf !== undefined)
            g.cancelAnimationFrame?.(x.raf);
        if (x.timer !== undefined)
            clearTimeout(x.timer);
    },
};
let host = REAL_HOST;
export function timeHost() { return host; }
export function setTimeHost(h) { host = h ?? REAL_HOST; }
//# sourceMappingURL=wallclock.js.map