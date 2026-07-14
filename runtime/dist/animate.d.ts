/** The motion vocabulary (animation.md §1) — a curve over normalized progress
 *  `t` ∈ [0,1]. A `Motion` is a small tagged union: a polynomial family (the
 *  Penner set) under a direction, a cubic Bézier (CSS control points), a step
 *  function, an anticipation/overshoot `back`, or the ported LZX pole/
 *  exponential curve (`laszlo`). Named tokens (`easeBoth`, `quartOut`, …)
 *  resolve to these (motionToken); the constructors (`cubicBezier`/`back`/
 *  `steps`/`laszlo`) build them directly (value.ts). The declarative-surface
 *  grammar is unchanged: a token is a bare ident like `axis = y`, a constructor
 *  a `name(args)` call like `shadow(…)`. */
export type PolyFamily = "linear" | "sine" | "quad" | "cubic" | "quart" | "quint" | "expo" | "circ";
export type Dir = "in" | "out" | "both";
export type Motion = {
    readonly k: "poly";
    readonly fam: PolyFamily;
    readonly dir: Dir;
} | {
    readonly k: "bezier";
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
} | {
    readonly k: "steps";
    readonly n: number;
    readonly jump: "start" | "end";
} | {
    readonly k: "back";
    readonly dir: Dir;
    readonly overshoot: number;
} | {
    readonly k: "laszlo";
    readonly beginPole: number;
    readonly endPole: number;
};
/** LZX's default ease (`easeBoth` = quadratic in-out) — the schema default. */
export declare const DEFAULT_MOTION: Motion;
/** Map normalized progress `t` ∈ [0,1] through `motion` to an eased fraction.
 *  `delta` is the animator's travel (`runDelta`) — read ONLY by `laszlo`; every
 *  other curve ignores it. Endpoints are clamped so `t ≤ 0 → 0` and `t ≥ 1 → 1`
 *  exactly for every curve; the exact-landing ledger also snaps the end value,
 *  so a curve that overshoots mid-flight (`back`) or drifts by a float
 *  (`bezier`/`laszlo`) still lands precisely (§4.3). */
export declare function sample(motion: Motion, t: number, delta?: number): number;
/** Resolve a named motion token to its Motion, or null if unknown. `easeIn/
 *  Out/Both` are the quad family (LZX-compatible); `ease` is the CSS default
 *  Bézier; `laszlo*` carry OpenLaszlo's exact pole offsets. */
export declare function motionToken(name: string): Motion | null;
/** Every named motion token — the checker's "expected" set and the scaffold's
 *  `Motion` union, generated so the two never drift from `motionToken`. */
export declare const MOTION_TOKENS: readonly string[];
/** A registrant of the clock. On each frame the clock hands every live ticker
 *  the SAME absolute time `now` (ms) — "to ensure that all animators are
 *  synched" (LZX, LzAnimatorGroup.lzs:475). `tick` does its own model writes
 *  and returns whether it is still running; returning false drops it, and
 *  when the last one drops the clock goes idle. */
export interface Ticker {
    tick(now: number): boolean;
}
/** The frame source the clock drives itself from — the one seam that makes it
 *  testable. The runtime binds it to `requestAnimationFrame` /
 *  `performance.now`; a test injects a hand-cranked fake. `request` schedules
 *  exactly one callback; the clock re-requests each frame while non-empty. */
export interface FrameScheduler {
    now(): number;
    request(cb: (now: number) => void): number;
    cancel(handle: number): void;
}
/** The default browser scheduler — real rAF, real clock. Guarded so importing
 *  this module under Node (the unit suite) never touches a missing global;
 *  the runtime overrides it explicitly at startup anyway. */
export declare const browserScheduler: FrameScheduler;
/** The one shared animation clock (animation.md §2 "The clock", §4.1 "one
 *  shared clock"). Pay-per-use and idle-zero: no live frame loop until a
 *  ticker is added, and the loop stops the moment the set empties. */
export declare class Clock {
    private readonly tickers;
    /** The pending frame handle; null = no loop running (idle). */
    private handle;
    private readonly sched;
    /** True only inside a frame's tick loop. A ticker registered re-entrantly
     *  (an onStop that start()s another animator) must NOT schedule its own
     *  frame — the loop's own re-arm below already covers it — or two frames
     *  would run per browser frame from then on. */
    private ticking;
    constructor(sched?: FrameScheduler);
    /** Register a ticker and, if the clock was idle, start the frame loop.
     *  Idempotent on an already-registered ticker. */
    add(t: Ticker): void;
    /** Drop a ticker (an explicit `stop()`); if it was the last, go idle. A
     *  ticker that finishes naturally is dropped by `frame` instead. */
    remove(t: Ticker): void;
    /** Whether the frame loop is live — the observable idle-zero state, for the
     *  runtime's assertions and the perceptual "idle is still zero rAF" test. */
    get running(): boolean;
    /** Whether any motion is in flight — what `settleMotion` (inspect.ts) polls. */
    get busy(): boolean;
    /** Swap the frame source IN PLACE, keeping enrolled tickers — how the driven
     *  clock (inspect.ts: `step`/`settleMotion`, verify-and-evals.md §2.3) takes
     *  over from rAF and hands back. Cancels any pending frame on the old
     *  scheduler and re-arms on the new one if motion is in flight. */
    setScheduler(s: FrameScheduler): void;
    /** One frame: read `now` once, tick every ticker with that same value,
     *  drop the finished, then either re-arm for the next frame or go idle. A
     *  ticker added *during* this frame's ticks (an onStop that starts another)
     *  is included in the next frame, not this one — iteration is over a
     *  snapshot so the same-`now` invariant holds for exactly this frame's set. */
    private frame;
}
/** The one process-wide animation clock every running Animator registers
 *  with (animation.md §4.1). A live binding, not a const: `setClock` swaps it
 *  for a hand-cranked one under test, and — thanks to ESM live bindings —
 *  every Animator's `sharedClock.add(this)` reads the current one. */
export declare let sharedClock: Clock;
/** Replace the shared clock — the unit suite's seam (a Clock over a fake
 *  FrameScheduler), so motion is driven deterministically with no browser
 *  rAF. Not runtime surface. */
export declare function setClock(c: Clock): void;
