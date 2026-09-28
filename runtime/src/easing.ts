// easing — the curves a `motion` names (animation.md §1): the Penner families
// under a direction, a cubic Bézier, steps, `back`, and the ported LZX pole
// curve, with the named tokens that resolve to them. Its own module because
// only a timed run reads a curve — an Animator, a group, a TweenLayout, a
// `motion` literal, the canvas scroller's glide — and a program with none of
// those (a Spring follows physics, not a curve) leaves it out of its build.
// The Motion union itself, and the default, stay in animate.ts.

import type { Dir, Motion, PolyFamily } from "./animate.js";

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
