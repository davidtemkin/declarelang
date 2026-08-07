// Spring — declarative motion toward a REACTIVE target (the follow half of the
// animation family). Where an Animator samples `to` once at start() and eases
// over a fixed duration, a Spring reads `to` LIVE every frame and integrates a
// physical spring toward it — so it retargets continuously (a cursor chasing
// the pointer) and settles smoothly on a step change (a header fading in when a
// boolean flips). No start() call and no event trigger: the reactive `to`'s
// pusher WAKES the spring whenever the target moves, and the spring sleeps the
// moment it comes to rest, so the idle-zero-rAF invariant holds exactly.
//
// It is a twin-table component like Animator (schema in schema.ts, class here,
// registered in instantiate.ts's animator table), and it descends from Animator
// so the checker validates its `attribute` slotref against the target through
// the same path — but it OWNS its slot outright (no additive ledger, no
// displace/resume): a Spring is the sole driver of what it animates, so the
// author simply omits a competing constraint on that slot and lets the Spring
// drive it toward the reactive `to`.

import { Animator } from "./animator.js";
import type { Node } from "./node.js";
import { sharedClock } from "./animate.js";
import { defineAttributes, asRuntimeWrite } from "./attributes.js";

/** A spring's write is a DRIVEN ASSIGNMENT, not a bound push: it must
 *  DISPLACE whatever owns the slot (§5's rule — assignment wins), or an
 *  auto-size derive re-fires later (a webfont load re-measuring labels) and
 *  silently overwrites the spring's rest value while the spring sleeps. The
 *  plain reactive setter is exactly that displacement. */
const drive = (target: object, attr: string, v: number): void => {
  asRuntimeWrite(() => { (target as Record<string, number>)[attr] = v; });
};

/** Read a numeric slot off a node (0 for a non-number / absent slot). */
function numOf(target: Node, attr: string): number {
  const v = (target as unknown as Record<string, unknown>)[attr];
  return typeof v === "number" ? v : 0;
}

export class Spring extends Animator {
  /** Spring constants (framer-motion vocabulary). Defaults are a gentle,
   *  slightly-underdamped follow; the cursor loosens them for a longer trail,
   *  a header tightens them for a quick settle. */
  declare stiffness: number;
  declare damping: number;
  declare mass: number;
  /** Rest threshold (slot units): the spring sleeps once it is within
   *  `epsilon` of the target AND barely moving. Small for a 0–1 slot like
   *  opacity, ~a fraction of a pixel for a position. */
  declare epsilon: number;

  private springRunning = false;
  /** Armed by `arrive()`: consume the next target outright (see arrive). */
  private arriving = false;
  private springLastNow: number | null = null;
  private vel = 0;
  private primed = false;

  /** Called by the `to` pusher on every retarget: (re)enroll on the clock.
   *  A no-op while already live, so a moving target does not pile up tickers. */
  wake(): void {
    if (this.arriving) {
      this.arriving = false;
      this.stop();
      this.vel = 0;
      this.primed = true;
      const at = this.resolveTarget();
      if (at !== null && this.attribute !== "") drive(at, this.attribute, this.to);
      return;
    }
    if (this.springRunning) return;
    if (this.attribute === "" || this.resolveTarget() === null) return;
    this.springRunning = true;
    // Seed the baseline NOW rather than on the first tick: enrollment is the
    // moment motion begins, so the first tick integrates a real dt. With a null
    // seed the first tick only recorded a baseline — invisible at 60Hz, but
    // under a driven clock one `clock.step()` moved nothing, which reads
    // exactly as "the spring never ran".
    this.springLastNow = sharedClock.now();
    sharedClock.add(this);
  }

  override isRunning(): boolean {
    return this.springRunning;
  }

  /** A Spring is not start()-triggered — it wakes on `to`. Keep start()/stop()
   *  as simple clock enroll/withdraw so the Animatable contract still holds
   *  (e.g. an author who does call spring.stop() to pin it). */
  override start(): void {
    this.wake();
  }

  override stop(): void {
    if (!this.springRunning) return;
    this.springRunning = false;
    sharedClock.remove(this);
  }

  /** One integration frame (semi-implicit Euler). The SLOT is the position
   *  state — read live each frame — so the spring resumes from wherever the
   *  value actually is, and a mid-flight retarget just curves toward the new
   *  `to`. Returns false (drops off the clock) once at rest. */
  /** Consume the DECLARATION SNAP at init (instantiate's animator walk): the
   *  first computed target is a boot fact, so the slot takes it outright — a
   *  Switch declared checked renders checked; it does not slide there.
   *  Physics governs every change AFTER this. Priming must happen HERE, not
   *  lazily at the first wake: a spring whose boot target equals the slot's
   *  default never wakes at boot (the equality gate swallows the push), and
   *  a lazy primer would then swallow the first REAL change instead — the
   *  calendar's month→year zoom snapping while year→month animated. */
  prime(): void {
    if (this.primed) return;
    this.primed = true;
    const t = this.resolveTarget();
    if (t !== null && this.attribute !== "") drive(t, this.attribute, this.to);
    this.vel = 0;
  }

  /** ARRIVAL (recycling / materialization). A recycled or freshly built
   *  instance is presenting a record it was not presenting before, so the
   *  geometry it lands on is a FACT ABOUT THAT RECORD, not a change this
   *  row lived through — it must appear, not animate.
   *
   *  This arms rather than snaps because the new target is not known yet:
   *  the cursor write that will produce it invalidates lazily, so reading
   *  `to` here would return the DEPARTED record's value and pin it. The
   *  next target this spring receives is therefore taken outright; the
   *  arming clears itself on the following microtask, so a genuine change
   *  a moment later still animates. When the two records agree the slot is
   *  already correct and no push ever comes — which is also right.
   *
   *  (A windowed row whose height animates makes this load-bearing: an
   *  expanded row scrolled out and back must return at its open height,
   *  and the measured ladder must never see it slide.) */
  arrive(): void {
    this.arriving = true;
    // Expire on the next FRAME, not the next microtask. The target is
    // produced by a settle wave whose boundary differs per engine — Chrome
    // completes it inside the arming task, WebKit does not — so a microtask
    // deadline silently disarms there and the row animates. A frame is long
    // enough for any engine's wave and far shorter than a human gesture, so
    // a genuine change still animates.
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => void }).requestAnimationFrame;
    if (typeof raf === "function") raf(() => { this.arriving = false; });
    else setTimeout(() => { this.arriving = false; }, 0);
  }

  /** Shift the anchor across a scheduler handover (Ticker.rebase); the
   *  Animator half never runs for a spring, but super keeps its own anchor
   *  coherent if it ever does. */
  override rebase(delta: number): void {
    super.rebase(delta);
    if (this.springLastNow !== null) this.springLastNow += delta;
  }

  override tick(now: number): boolean {
    if (!this.springRunning) return false;
    // The lazy fallback for a spring constructed outside the init walk —
    // same declaration-snap semantics, consumed on the first-ever tick.
    if (!this.primed) {
      this.prime();
      this.springRunning = false;
      sharedClock.remove(this);
      return false;
    }
    if (this.springLastNow === null) {
      this.springLastNow = now; // first frame: dt = 0, settle nothing yet
      return true;
    }
    // seconds, clamped at BOTH ends: a backgrounded tab (one huge dt) cannot
    // detonate the integration when it resumes, and a clock handover (a driven
    // clock starting near zero after performance.now baselines) cannot run it
    // backwards.
    const dt = Math.min(Math.max((now - this.springLastNow) / 1000, 0), 0.064);
    this.springLastNow = now;

    const target = this.resolveTarget();
    const attr = this.attribute;
    if (target === null || attr === "") {
      this.springRunning = false;
      return false;
    }

    const to = this.to; // reactive: the live target this frame
    let pos = numOf(target, attr);
    if (!Number.isFinite(pos)) pos = to; // recover from any poisoned prior state
    const m = this.mass > 0 ? this.mass : 1;
    // Integrate in fixed SUB-STEPS. A single large Euler step of a stiff spring
    // is numerically unstable — it overshoots the target, then overshoots harder,
    // and diverges (→ ±∞/NaN), which on a long/janky frame shows as a value
    // flying back and forth and can poison dependent constraints. Splitting the
    // elapsed time into small steps keeps the integration stable at any stiffness.
    const H = 1 / 120;
    for (let t = dt; t > 0; t -= H) {
      const h = t < H ? t : H;
      const accel = (this.stiffness * (to - pos) - this.damping * this.vel) / m;
      this.vel += accel * h;
      pos += this.vel * h;
    }
    if (!Number.isFinite(pos)) { pos = to; this.vel = 0; } // last-resort clamp

    const eps = this.epsilon;
    if (Math.abs(to - pos) < eps && Math.abs(this.vel) < eps * 60) {
      // Landed: assign the exact target, zero the velocity, and sleep.
      drive(target, attr, to);
      this.vel = 0;
      this.springRunning = false;
      sharedClock.remove(this);
      return false;
    }
    drive(target, attr, pos);
    return true;
  }
}

// `to` carries a pusher (Animator's does not): every reactive retarget wakes
// the spring. attribute/to are inherited from Animator's table; these add the
// spring's own controls with framer-like defaults.
defineAttributes(Spring, {
  to: { def: 0, push: (s: Spring) => s.wake() },
  stiffness: { def: 170 },
  damping: { def: 22 },
  mass: { def: 1 },
  epsilon: { def: 0.1 },
});


/** Walk a newly-pointed subtree and arm every spring in it (see
 *  `Spring.arrive`). Children of a view include its animators, so the walk
 *  is the ordinary tree walk; nothing else in the subtree is touched. */
export function arriveSubtree(root: { children?: readonly unknown[] }): void {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const n = stack.pop() as { children?: readonly unknown[] };
    if (n instanceof Spring) { n.arrive(); continue; }
    const kids = n?.children;
    if (kids !== undefined) for (const k of kids) stack.push(k);
  }
}
