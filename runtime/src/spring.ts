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
import { defineAttributes, setBound } from "./attributes.js";

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
  private springLastNow: number | null = null;
  private vel = 0;

  /** Called by the `to` pusher on every retarget: (re)enroll on the clock.
   *  A no-op while already live, so a moving target does not pile up tickers. */
  wake(): void {
    if (this.springRunning) return;
    if (this.attribute === "" || this.resolveTarget() === null) return;
    this.springRunning = true;
    this.springLastNow = null;
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
  override tick(now: number): boolean {
    if (!this.springRunning) return false;
    if (this.springLastNow === null) {
      this.springLastNow = now; // first frame: dt = 0, settle nothing yet
      return true;
    }
    // seconds, clamped so a backgrounded tab (one huge dt) cannot detonate the
    // integration when it resumes.
    const dt = Math.min((now - this.springLastNow) / 1000, 0.064);
    this.springLastNow = now;

    const target = this.resolveTarget();
    const attr = this.attribute;
    if (target === null || attr === "") {
      this.springRunning = false;
      return false;
    }

    const to = this.to; // reactive: the live target this frame
    let pos = numOf(target, attr);
    const m = this.mass > 0 ? this.mass : 1;
    const accel = (this.stiffness * (to - pos) - this.damping * this.vel) / m;
    this.vel += accel * dt;
    pos += this.vel * dt;

    const eps = this.epsilon;
    if (Math.abs(to - pos) < eps && Math.abs(this.vel) < eps * 60) {
      // Landed: assign the exact target, zero the velocity, and sleep.
      setBound(target, attr, to);
      this.vel = 0;
      this.springRunning = false;
      sharedClock.remove(this);
      return false;
    }
    setBound(target, attr, pos);
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
