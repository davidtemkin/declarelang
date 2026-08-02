import { Animator } from "./animator.js";
export declare class Spring extends Animator {
    /** Spring constants (framer-motion vocabulary). Defaults are a gentle,
     *  slightly-underdamped follow; the cursor loosens them for a longer trail,
     *  a header tightens them for a quick settle. */
    stiffness: number;
    damping: number;
    mass: number;
    /** Rest threshold (slot units): the spring sleeps once it is within
     *  `epsilon` of the target AND barely moving. Small for a 0–1 slot like
     *  opacity, ~a fraction of a pixel for a position. */
    epsilon: number;
    private springRunning;
    private springLastNow;
    private vel;
    private primed;
    /** Called by the `to` pusher on every retarget: (re)enroll on the clock.
     *  A no-op while already live, so a moving target does not pile up tickers. */
    wake(): void;
    isRunning(): boolean;
    /** A Spring is not start()-triggered — it wakes on `to`. Keep start()/stop()
     *  as simple clock enroll/withdraw so the Animatable contract still holds
     *  (e.g. an author who does call spring.stop() to pin it). */
    start(): void;
    stop(): void;
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
    prime(): void;
    /** RE-SNAP (recycling): a recycled instance is re-born serving a
     *  DIFFERENT record, so motion still in flight belongs to the record that
     *  left — it is not this row's animation to finish. Take the current
     *  target outright, exactly as the declaration snap does at boot, and
     *  drop off the clock. (A windowed row whose height animates makes this
     *  load-bearing: without it the measured ladder chases a height that is
     *  sliding toward the departed record's geometry, and re-derives the
     *  window on every frame of the slide.) */
    resnap(): void;
    tick(now: number): boolean;
}
/** Walk a recycled subtree and re-snap every spring in it (see
 *  `Spring.resnap`). Children of a view include its animators, so the walk
 *  is the ordinary tree walk; nothing else in the subtree is touched. */
export declare function resnapSubtree(root: {
    children?: readonly unknown[];
}): void;
