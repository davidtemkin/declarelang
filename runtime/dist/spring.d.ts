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
    /** Armed by `arrive()`: consume the next target outright (see arrive). */
    private arriving;
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
    arrive(): void;
    /** Shift the anchor across a scheduler handover (Ticker.rebase); the
     *  Animator half never runs for a spring, but super keeps its own anchor
     *  coherent if it ever does. */
    rebase(delta: number): void;
    tick(now: number): boolean;
}
/** Walk a newly-pointed subtree and arm every spring in it (see
 *  `Spring.arrive`). Children of a view include its animators, so the walk
 *  is the ordinary tree walk; nothing else in the subtree is touched. */
export declare function arriveSubtree(root: {
    children?: readonly unknown[];
}): void;
