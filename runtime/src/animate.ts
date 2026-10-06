// Animation v1 — the motion substrate (docs/system-design/animation.md §1–§4).
//
// Two pieces, both author-invisible kernel-tier services (the design's magic
// ledger §3): the `motion` vocabulary (the curves themselves are easing.ts),
// and the one shared clock every running Animator registers with. Deliberately free of
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
export type Motion =
  | { readonly k: "poly"; readonly fam: PolyFamily; readonly dir: Dir }
  | { readonly k: "bezier"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly k: "steps"; readonly n: number; readonly jump: "start" | "end" }
  | { readonly k: "back"; readonly dir: Dir; readonly overshoot: number }
  | { readonly k: "laszlo"; readonly beginPole: number; readonly endPole: number };

/** LZX's default ease (`easeBoth` = quadratic in-out) — the schema default. */
export const DEFAULT_MOTION: Motion = { k: "poly", fam: "quad", dir: "both" };


/** A registrant of the clock. On each frame the clock hands every live ticker
 *  the SAME absolute time `now` (ms) — "to ensure that all animators are
 *  synched" (LZX, LzAnimatorGroup.lzs:475). `tick` does its own model writes
 *  and returns whether it is still running; returning false drops it, and
 *  when the last one drops the clock goes idle. */
export interface Ticker {
  $tick(now: number): boolean;
  /** Life, not transition (RULED 2026-08-06, David — verify-and-evals.md
   *  "Settle and ambient motion"): a ticker whose perpetuity is DERIVED from
   *  its own declaration — a Time (ticks while `running`, never arrives
   *  anywhere) or an Animator with `repeat = Infinity`. It keeps painting but
   *  does not hold `settling` open, so settleMotion waits only for
   *  transitions. Never an author-facing flag — derivation, not declaration,
   *  so nothing can drift. */
  perpetual?: boolean;
  /** Carry this ticker's time anchors across a scheduler handover: `delta` is
   *  (new timeline's now − old timeline's now) at the swap, and every stored
   *  absolute timestamp must shift by it. Without this, an anchor recorded
   *  under one clock is measured against the other's frames — the driven
   *  clock's first steps then integrate a NEGATIVE dt (clamped to zero), which
   *  reads as "the animation never ran" (GitHub #17's readout). The clock
   *  calls it in `setScheduler`; a ticker with no stored times omits it. */
  $rebase?(delta: number): void;
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
export const browserScheduler: FrameScheduler = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  request: (cb) => (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(cb) : 0),
  cancel: (h) => {
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(h);
  },
};

/** True from the moment a frame's ticks begin until the settle they queued has
 *  drained — the window in which a backend can still paint INTO this frame. A
 *  backend that books its own rAF instead lands on the NEXT frame, and its
 *  pending-handle guard then swallows the following frame's request, so the
 *  paint cadence halves: measured at 31 painted frames for 61 ticks during a
 *  zoom. Motion drawn at half the rate it is computed is visible judder. */
let framePhase = false;
export function inAnimationFrame(): boolean { return framePhase; }

/** The one shared animation clock (animation.md §2 "The clock", §4.1 "one
 *  shared clock"). Pay-per-use and idle-zero: no live frame loop until a
 *  ticker is added, and the loop stops the moment the set empties. */
export class Clock {
  private readonly tickers = new Set<Ticker>();
  /** The pending frame handle; null = no loop running (idle). */
  private handle: number | null = null;
  private readonly sched: FrameScheduler;
  /** True only inside a frame's tick loop. A ticker registered re-entrantly
   *  (an onStop that start()s another animator) must NOT schedule its own
   *  frame — the loop's own re-arm below already covers it — or two frames
   *  would run per browser frame from then on. */
  private ticking = false;

  constructor(sched: FrameScheduler = browserScheduler) {
    this.sched = sched;
    // Bound once so the scheduler always gets a stable callback identity.
    this.frame = this.frame.bind(this);
  }

  /** The scheduler's current timestamp — the same value the next frame's
   *  `tick(now)` will be measured against. Lets a ticker seed its own baseline
   *  at ENROLL time, so its first tick integrates a real dt instead of spending
   *  the frame establishing a baseline (under a hand-cranked clock that
   *  baseline frame read as "the animation never ran" — two agents,
   *  independently). */
  now(): number {
    return this.sched.now();
  }

  /** Register a ticker and, if the clock was idle, start the frame loop.
   *  Idempotent on an already-registered ticker. */
  add(t: Ticker): void {
    this.tickers.add(t);
    if (this.handle === null && !this.ticking) this.handle = this.sched.request(this.frame);
  }

  /** Drop a ticker (an explicit `stop()`); if it was the last, go idle. A
   *  ticker that finishes naturally is dropped by `frame` instead. */
  remove(t: Ticker): void {
    this.tickers.delete(t);
    if (this.tickers.size === 0 && this.handle !== null) {
      this.sched.cancel(this.handle);
      this.handle = null;
    }
  }

  /** Whether the frame loop is live — the observable idle-zero state, for the
   *  runtime's assertions and the perceptual "idle is still zero rAF" test. */
  get running(): boolean {
    return this.handle !== null;
  }

  /** Whether any motion is in flight — what `settleMotion` (inspect.ts) polls. */
  get busy(): boolean {
    return this.tickers.size > 0;
  }

  /** Any FINITE motion in flight — the settle predicate (busy minus the
   *  perpetual tickers; see Ticker.perpetual). */
  get settling(): boolean {
    for (const t of this.tickers) if (t.perpetual !== true) return true;
    return false;
  }

  /** Swap the frame source IN PLACE, keeping enrolled tickers — how the driven
   *  clock (inspect.ts: `step`/`settleMotion`, verify-and-evals.md §2.3) takes
   *  over from rAF and hands back. Cancels any pending frame on the old
   *  scheduler and re-arms on the new one if motion is in flight. The two
   *  timelines share no origin, so every in-flight ticker's anchors are
   *  REBASED by the swap's offset — a handover is a change of frame source,
   *  never a jump in any motion's elapsed time (in either direction: the old
   *  skew ate the driven clock's first steps as negative dt, and a long
   *  settleMotion left `auto()` frozen until real time caught back up). */
  setScheduler(s: FrameScheduler): void {
    if (this.handle !== null) {
      this.sched.cancel(this.handle);
      this.handle = null;
    }
    const delta = s.now() - this.sched.now();
    for (const t of this.tickers) t.$rebase?.(delta);
    (this as unknown as { sched: FrameScheduler }).sched = s;
    if (this.tickers.size > 0 && !this.ticking) this.handle = this.sched.request(this.frame);
  }

  /** One frame: read `now` once, tick every ticker with that same value,
   *  drop the finished, then either re-arm for the next frame or go idle. A
   *  ticker added *during* this frame's ticks (an onStop that starts another)
   *  is included in the next frame, not this one — iteration is over a
   *  snapshot so the same-`now` invariant holds for exactly this frame's set. */
  private frame(now: number): void {
    framePhase = true;   // opened here, closed after the ticks below
    this.handle = null;
    this.ticking = true;
    try {
      const running = [...this.tickers];
      for (const t of running) {
        // The backstop under every ticker's own guard: one throwing ticker
        // must not kill the frame for the rest, and must not wedge the loop —
        // it is dropped from the clock, loudly.
        try {
          if (!t.$tick(now)) this.tickers.delete(t);
        } catch (e) {
          this.tickers.delete(t);
          console.error(`[Declare] a ${((t as object).constructor?.name ?? "ticker")} threw during its frame and was removed from the clock: ${(e as Error)?.message ?? e}`, e);
        }
      }
    } finally {
      this.ticking = false;
      // Close the window only AFTER the settle this frame's writes queued: the
      // ticks ran first, so their settle microtask is already ahead of this one
      // — a backend invalidating during that settle still sees the window open
      // and paints into THIS frame instead of booking the next.
      queueMicrotask(() => { framePhase = false; });
    }
    if (this.tickers.size > 0) this.handle = this.sched.request(this.frame);
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
export function setClock(c: Clock): void {
  sharedClock = c;
}
