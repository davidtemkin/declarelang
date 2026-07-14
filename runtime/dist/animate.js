// Animation v1 — the motion substrate (design-docs/animation.md §1–§4).
//
// Two pieces, both author-invisible kernel-tier services (the design's magic
// ledger §3): the easing curves the carried `motion` enum names, and the one
// shared clock every running Animator registers with. Deliberately free of
// any Animator / View / schema import — this is the substrate those sit on,
// unit-testable on its own with an injected scheduler (no browser rAF needed).
//
// The clock preserves the reactive core's idle-zero invariant exactly: it
// holds a live requestAnimationFrame loop ONLY while at least one ticker is
// running, and cancels it the instant the last one finishes. It never writes
// the model itself — a ticker's `tick` does the model writes (setBound), and
// the ordinary microtask settle + backend paint follow from those, so every
// intermediate frame value propagates through constraints, layout, and draw
// bodies (the model-space ruling, HANDOFF 2026-07-01).
/** LZX's default ease (`easeBoth` = quadratic in-out) — the schema default. */
export const DEFAULT_MOTION = { k: "poly", fam: "quad", dir: "both" };
const BACK_DEFAULT = 1.70158; // Penner's standard back overshoot (~10% past)
/** The family ease-IN primitives (Penner); a direction composes them below. */
function polyIn(fam, t) {
    switch (fam) {
        case "linear": return t;
        case "sine": return 1 - Math.cos((t * Math.PI) / 2);
        case "quad": return t * t;
        case "cubic": return t * t * t;
        case "quart": return t * t * t * t;
        case "quint": return t * t * t * t * t;
        case "expo": return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
        case "circ": return 1 - Math.sqrt(1 - t * t);
    }
}
/** `back`'s ease-IN: dips below 0 (anticipation) before pulling to 1. */
const backIn = (s, t) => (s + 1) * t * t * t - s * t * t;
/** Apply a direction to an ease-IN primitive `f`: `in = f(t)`, `out = 1−f(1−t)`,
 *  `both` = the halved mirror (Penner's standard in-out construction). */
function directed(f, dir, t) {
    if (dir === "in")
        return f(t);
    if (dir === "out")
        return 1 - f(1 - t);
    return t < 0.5 ? f(2 * t) / 2 : 1 - f(2 * (1 - t)) / 2;
}
/** Solve a cubic Bézier for `y` at a given `x` (time) — CSS timing-function
 *  semantics with P0=(0,0), P3=(1,1), controls (x1,y1),(x2,y2). Newton, then a
 *  bisection fallback (the standard WebKit UnitBezier). */
function bezier(x1, y1, x2, y2, x) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dsx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    let u = x;
    for (let i = 0; i < 8; i++) {
        const e = sx(u) - x;
        if (Math.abs(e) < 1e-6)
            return sy(u);
        const d = dsx(u);
        if (Math.abs(d) < 1e-6)
            break;
        u -= e / d;
    }
    let lo = 0, hi = 1;
    u = x;
    for (let i = 0; i < 24 && lo < hi; i++) {
        const e = sx(u);
        if (Math.abs(e - x) < 1e-6)
            break;
        if (x > e)
            lo = u;
        else
            hi = u;
        u = (lo + hi) / 2;
    }
    return sy(u);
}
/** The ported LZX pole/exponential curve (LaszloAnimation.lzs) — a Möbius
 *  function of `primary_K^t`, the poles sitting `beginPole`/`endPole` OUTSIDE
 *  the [0, delta] travel. It is the one **scale-dependent** curve: `primary_K`
 *  is a cross-ratio of the poles, whose absolute offsets make the shape depend
 *  on the travel magnitude — so `laszlo` is the only motion that reads `delta`.
 *  Returns a fraction of the travel. */
function laszlo(beginPoleDelta, endPoleDelta, t, delta) {
    if (delta === 0)
        return t; // no travel: nothing to shape (avoids a 0/0)
    const cval = 0, to = delta, dir = 1;
    let beginPole, endPole;
    if (cval < to) {
        beginPole = cval - dir * beginPoleDelta;
        endPole = to + dir * endPoleDelta;
    }
    else {
        beginPole = cval + dir * beginPoleDelta;
        endPole = to - dir * endPoleDelta;
    }
    const kN = (beginPole - to) * (cval - endPole);
    const kD = (beginPole - cval) * (to - endPole);
    const primaryK = kD !== 0 ? Math.abs(kN / kD) : 1;
    const K = Math.exp(t * Math.log(primaryK));
    let value = cval;
    if (K !== 1) {
        const num = beginPole * endPole * (1 - K);
        const den = endPole - K * beginPole;
        if (den !== 0)
            value = num / den;
    }
    return value / delta;
}
/** Map normalized progress `t` ∈ [0,1] through `motion` to an eased fraction.
 *  `delta` is the animator's travel (`runDelta`) — read ONLY by `laszlo`; every
 *  other curve ignores it. Endpoints are clamped so `t ≤ 0 → 0` and `t ≥ 1 → 1`
 *  exactly for every curve; the exact-landing ledger also snaps the end value,
 *  so a curve that overshoots mid-flight (`back`) or drifts by a float
 *  (`bezier`/`laszlo`) still lands precisely (§4.3). */
export function sample(motion, t, delta = 0) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    switch (motion.k) {
        case "poly": return directed((u) => polyIn(motion.fam, u), motion.dir, t);
        case "bezier": return bezier(motion.x1, motion.y1, motion.x2, motion.y2, t);
        case "steps": return (motion.jump === "end" ? Math.floor(t * motion.n) : Math.ceil(t * motion.n)) / motion.n;
        case "back": return directed((u) => backIn(motion.overshoot, u), motion.dir, t);
        case "laszlo": return laszlo(motion.beginPole, motion.endPole, t, delta);
    }
}
// ── named tokens → Motion (families, `ease` aliases, `back`, `laszlo`) ──
const DIR_SUFFIX = [["In", "in"], ["Out", "out"], ["Both", "both"]];
const FAMILIES = ["sine", "quad", "cubic", "quart", "quint", "expo", "circ"];
/** Resolve a named motion token to its Motion, or null if unknown. `easeIn/
 *  Out/Both` are the quad family (LZX-compatible); `ease` is the CSS default
 *  Bézier; `laszlo*` carry OpenLaszlo's exact pole offsets. */
export function motionToken(name) {
    if (name === "linear")
        return { k: "poly", fam: "linear", dir: "in" };
    if (name === "ease")
        return { k: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
    if (name === "easeIn")
        return { k: "poly", fam: "quad", dir: "in" };
    if (name === "easeOut")
        return { k: "poly", fam: "quad", dir: "out" };
    if (name === "easeBoth")
        return { k: "poly", fam: "quad", dir: "both" };
    for (const fam of FAMILIES)
        for (const [suf, dir] of DIR_SUFFIX)
            if (name === fam + suf)
                return { k: "poly", fam, dir };
    for (const [suf, dir] of DIR_SUFFIX)
        if (name === "back" + suf)
            return { k: "back", dir, overshoot: BACK_DEFAULT };
    if (name === "laszloIn")
        return { k: "laszlo", beginPole: 0.25, endPole: 15 };
    if (name === "laszloOut")
        return { k: "laszlo", beginPole: 100, endPole: 0.25 };
    if (name === "laszloBoth")
        return { k: "laszlo", beginPole: 0.25, endPole: 0.25 };
    return null;
}
/** Every named motion token — the checker's "expected" set and the scaffold's
 *  `Motion` union, generated so the two never drift from `motionToken`. */
export const MOTION_TOKENS = [
    "linear", "ease", "easeIn", "easeOut", "easeBoth",
    ...FAMILIES.flatMap((f) => DIR_SUFFIX.map(([suf]) => f + suf)),
    ...DIR_SUFFIX.map(([suf]) => "back" + suf),
    "laszloIn", "laszloOut", "laszloBoth",
];
/** The default browser scheduler — real rAF, real clock. Guarded so importing
 *  this module under Node (the unit suite) never touches a missing global;
 *  the runtime overrides it explicitly at startup anyway. */
export const browserScheduler = {
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    request: (cb) => (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(cb) : 0),
    cancel: (h) => {
        if (typeof cancelAnimationFrame !== "undefined")
            cancelAnimationFrame(h);
    },
};
/** The one shared animation clock (animation.md §2 "The clock", §4.1 "one
 *  shared clock"). Pay-per-use and idle-zero: no live frame loop until a
 *  ticker is added, and the loop stops the moment the set empties. */
export class Clock {
    tickers = new Set();
    /** The pending frame handle; null = no loop running (idle). */
    handle = null;
    sched;
    /** True only inside a frame's tick loop. A ticker registered re-entrantly
     *  (an onStop that start()s another animator) must NOT schedule its own
     *  frame — the loop's own re-arm below already covers it — or two frames
     *  would run per browser frame from then on. */
    ticking = false;
    constructor(sched = browserScheduler) {
        this.sched = sched;
        // Bound once so the scheduler always gets a stable callback identity.
        this.frame = this.frame.bind(this);
    }
    /** Register a ticker and, if the clock was idle, start the frame loop.
     *  Idempotent on an already-registered ticker. */
    add(t) {
        this.tickers.add(t);
        if (this.handle === null && !this.ticking)
            this.handle = this.sched.request(this.frame);
    }
    /** Drop a ticker (an explicit `stop()`); if it was the last, go idle. A
     *  ticker that finishes naturally is dropped by `frame` instead. */
    remove(t) {
        this.tickers.delete(t);
        if (this.tickers.size === 0 && this.handle !== null) {
            this.sched.cancel(this.handle);
            this.handle = null;
        }
    }
    /** Whether the frame loop is live — the observable idle-zero state, for the
     *  runtime's assertions and the perceptual "idle is still zero rAF" test. */
    get running() {
        return this.handle !== null;
    }
    /** Whether any motion is in flight — what `settleMotion` (inspect.ts) polls. */
    get busy() {
        return this.tickers.size > 0;
    }
    /** Swap the frame source IN PLACE, keeping enrolled tickers — how the driven
     *  clock (inspect.ts: `step`/`settleMotion`, verify-and-evals.md §2.3) takes
     *  over from rAF and hands back. Cancels any pending frame on the old
     *  scheduler and re-arms on the new one if motion is in flight. */
    setScheduler(s) {
        if (this.handle !== null) {
            this.sched.cancel(this.handle);
            this.handle = null;
        }
        this.sched = s;
        if (this.tickers.size > 0 && !this.ticking)
            this.handle = this.sched.request(this.frame);
    }
    /** One frame: read `now` once, tick every ticker with that same value,
     *  drop the finished, then either re-arm for the next frame or go idle. A
     *  ticker added *during* this frame's ticks (an onStop that starts another)
     *  is included in the next frame, not this one — iteration is over a
     *  snapshot so the same-`now` invariant holds for exactly this frame's set. */
    frame(now) {
        this.handle = null;
        this.ticking = true;
        try {
            const running = [...this.tickers];
            for (const t of running) {
                if (!t.tick(now))
                    this.tickers.delete(t);
            }
        }
        finally {
            this.ticking = false;
        }
        if (this.tickers.size > 0)
            this.handle = this.sched.request(this.frame);
    }
}
/** The one process-wide animation clock every running Animator registers
 *  with (animation.md §4.1). A live binding, not a const: `setClock` swaps it
 *  for a hand-cranked one under test, and — thanks to ESM live bindings —
 *  every Animator's `sharedClock.add(this)` reads the current one. */
export let sharedClock = new Clock();
/** Replace the shared clock — the unit suite's seam (a Clock over a fake
 *  FrameScheduler), so motion is driven deterministically with no browser
 *  rAF. Not runtime surface. */
export function setClock(c) {
    sharedClock = c;
}
//# sourceMappingURL=animate.js.map