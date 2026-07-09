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
    tick(now: number): boolean;
}
