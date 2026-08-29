// Animation v1 — the motion substrate (docs/system-design/animation.md §1–§4).
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

const BACK_DEFAULT = 1.70158; // Penner's standard back overshoot (~10% past)

/** The family ease-IN primitives (Penner); a direction composes them below. */
function polyIn(fam: PolyFamily, t: number): number {
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
const backIn = (s: number, t: number): number => (s + 1) * t * t * t - s * t * t;

/** Apply a direction to an ease-IN primitive `f`: `in = f(t)`, `out = 1−f(1−t)`,
 *  `both` = the halved mirror (Penner's standard in-out construction). */
function directed(f: (t: number) => number, dir: Dir, t: number): number {
  if (dir === "in") return f(t);
  if (dir === "out") return 1 - f(1 - t);
  return t < 0.5 ? f(2 * t) / 2 : 1 - f(2 * (1 - t)) / 2;
}

/** Solve a cubic Bézier for `y` at a given `x` (time) — CSS timing-function
 *  semantics with P0=(0,0), P3=(1,1), controls (x1,y1),(x2,y2). Newton, then a
 *  bisection fallback (the standard WebKit UnitBezier). */
function bezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number): number => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number): number => ((ay * u + by) * u + cy) * u;
  const dsx = (u: number): number => (3 * ax * u + 2 * bx) * u + cx;
  let u = x;
  for (let i = 0; i < 8; i++) {
    const e = sx(u) - x;
    if (Math.abs(e) < 1e-6) return sy(u);
    const d = dsx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= e / d;
  }
  let lo = 0, hi = 1;
  u = x;
  for (let i = 0; i < 24 && lo < hi; i++) {
    const e = sx(u);
    if (Math.abs(e - x) < 1e-6) break;
    if (x > e) lo = u; else hi = u;
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
function laszlo(beginPoleDelta: number, endPoleDelta: number, t: number, delta: number): number {
  if (delta === 0) return t; // no travel: nothing to shape (avoids a 0/0)
  const cval = 0, to = delta, dir = 1;
  let beginPole: number, endPole: number;
  if (cval < to) { beginPole = cval - dir * beginPoleDelta; endPole = to + dir * endPoleDelta; }
  else { beginPole = cval + dir * beginPoleDelta; endPole = to - dir * endPoleDelta; }
  const kN = (beginPole - to) * (cval - endPole);
  const kD = (beginPole - cval) * (to - endPole);
  const primaryK = kD !== 0 ? Math.abs(kN / kD) : 1;
  const K = Math.exp(t * Math.log(primaryK));
  let value = cval;
  if (K !== 1) {
    const num = beginPole * endPole * (1 - K);
    const den = endPole - K * beginPole;
    if (den !== 0) value = num / den;
  }
  return value / delta;
}

/** Map normalized progress `t` ∈ [0,1] through `motion` to an eased fraction.
 *  `delta` is the animator's travel (`runDelta`) — read ONLY by `laszlo`; every
 *  other curve ignores it. Endpoints are clamped so `t ≤ 0 → 0` and `t ≥ 1 → 1`
 *  exactly for every curve; the exact-landing ledger also snaps the end value,
 *  so a curve that overshoots mid-flight (`back`) or drifts by a float
 *  (`bezier`/`laszlo`) still lands precisely (§4.3). */
export function sample(motion: Motion, t: number, delta = 0): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (motion.k) {
    case "poly": return directed((u) => polyIn(motion.fam, u), motion.dir, t);
    case "bezier": return bezier(motion.x1, motion.y1, motion.x2, motion.y2, t);
    case "steps": return (motion.jump === "end" ? Math.floor(t * motion.n) : Math.ceil(t * motion.n)) / motion.n;
    case "back": return directed((u) => backIn(motion.overshoot, u), motion.dir, t);
    case "laszlo": return laszlo(motion.beginPole, motion.endPole, t, delta);
  }
}

// ── named tokens → Motion (families, `ease` aliases, `back`, `laszlo`) ──
const DIR_SUFFIX: ReadonlyArray<readonly [string, Dir]> = [["In", "in"], ["Out", "out"], ["Both", "both"]];
const FAMILIES: readonly PolyFamily[] = ["sine", "quad", "cubic", "quart", "quint", "expo", "circ"];

/** Resolve a named motion token to its Motion, or null if unknown. `easeIn/
 *  Out/Both` are the quad family (LZX-compatible); `ease` is the CSS default
 *  Bézier; `laszlo*` carry OpenLaszlo's exact pole offsets. */
export function motionToken(name: string): Motion | null {
  if (name === "linear") return { k: "poly", fam: "linear", dir: "in" };
  if (name === "ease") return { k: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
  if (name === "easeIn") return { k: "poly", fam: "quad", dir: "in" };
  if (name === "easeOut") return { k: "poly", fam: "quad", dir: "out" };
  if (name === "easeBoth") return { k: "poly", fam: "quad", dir: "both" };
  for (const fam of FAMILIES) for (const [suf, dir] of DIR_SUFFIX) if (name === fam + suf) return { k: "poly", fam, dir };
  for (const [suf, dir] of DIR_SUFFIX) if (name === "back" + suf) return { k: "back", dir, overshoot: BACK_DEFAULT };
  if (name === "laszloIn") return { k: "laszlo", beginPole: 0.25, endPole: 15 };
  if (name === "laszloOut") return { k: "laszlo", beginPole: 100, endPole: 0.25 };
  if (name === "laszloBoth") return { k: "laszlo", beginPole: 0.25, endPole: 0.25 };
  return null;
}

/** Every named motion token — the checker's "expected" set and the scaffold's
 *  `Motion` union, generated so the two never drift from `motionToken`. */
export const MOTION_TOKENS: readonly string[] = [
  "linear", "ease", "easeIn", "easeOut", "easeBoth",
  ...FAMILIES.flatMap((f) => DIR_SUFFIX.map(([suf]) => f + suf)),
  ...DIR_SUFFIX.map(([suf]) => "back" + suf),
  "laszloIn", "laszloOut", "laszloBoth",
];

/** A registrant of the clock. On each frame the clock hands every live ticker
 *  the SAME absolute time `now` (ms) — "to ensure that all animators are
 *  synched" (LZX, LzAnimatorGroup.lzs:475). `tick` does its own model writes
 *  and returns whether it is still running; returning false drops it, and
 *  when the last one drops the clock goes idle. */
export interface Ticker {
  tick(now: number): boolean;
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
  rebase?(delta: number): void;
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
    for (const t of this.tickers) t.rebase?.(delta);
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
          if (!t.tick(now)) this.tickers.delete(t);
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
