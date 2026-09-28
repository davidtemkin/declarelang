import type { Animator } from "./animator.js";
export declare class TweenRun {
    private readonly a;
    live: boolean;
    private runTarget;
    private runAttr;
    /** The eased delta this run travels — measured against the ledger's expected
     *  value (LZX `this.to`), so an absolute `to` composes with everything in
     *  flight. Excludes the `from` snap (that rides `fromJump`). */
    private runDelta;
    /** The one-time `from` snap (from − slot's value at start), applied over the
     *  first frame; 0 when `from` is unset. Deferred to the first tick so a
     *  restart shows no jump at start() time. */
    private fromJump;
    /** How much this animator has contributed to the target so far — the sum of
     *  its written increments, `fromJump + ease(t)·runDelta`. The additive
     *  currentValue (LZX), one frame's increment being the delta of this. */
    private traveled;
    private runDuration;
    private runMotion;
    private cyclesLeft;
    private elapsed;
    private lastNow;
    constructor(a: Animator);
    /** `paused` is clock MEMBERSHIP, not a per-frame flag to poll: a paused
     *  animator produces no frames, so it must not hold the frame loop open —
     *  the idle-zero invariant (animate.ts) extends to "frozen counts as idle".
     *  Pause drops off the clock; resume re-seeds the anchor at NOW (elapsed
     *  cannot have advanced while unenrolled, so nothing jumps — the same
     *  re-anchor a scheduler handover uses) and re-enrolls. A grouped member
     *  keeps the old frozen-tick path instead: its group owns the clock and
     *  must keep ticking its OTHER members, so the member's own pause cannot
     *  withdraw the group's ticker. */
    paused(v: boolean): void;
    /** Re-seed the elapsed-time anchor at `now` — a group resuming from its own
     *  pause calls this down its members, whose anchors went stale while the
     *  group was off the clock (the unpause twin of rebase()). */
    reanchor(now: number): void;
    /** Shift the anchor across a scheduler handover (Ticker.rebase). */
    rebase(delta: number): void;
    /** Begin driving the target slot through the curve (LZX's doStart). A no-op
     *  while already running (LZX's guard). Samples from / to / duration /
     *  motion / repeat ONCE here, and enrolls in the slot's exact-landing ledger
     *  (displacing the slot's prior non-animator driver on the first arrival). */
    start(): void;
    /** Halt in place — no snap to either end (LZX). Idempotent; a no-op when not
     *  running. Leaves the ledger (resuming the displaced driver when it was the
     *  last animator), without landing an end value (animation.md §2). */
    stop(): void;
    /** One clock frame (the Ticker contract): advance by real elapsed time,
     *  write the eased DELTA additively, handle repeat / completion. `frozen`
     *  (an enclosing group's pause) freezes progression while keeping `lastNow`
     *  fresh so nothing jumps on unpause. Returns whether still running (false
     *  drops it from the clock; a group reads it to retire a finished member). */
    tick(now: number, frozen: boolean): boolean;
    /** Leave the slot's exact-landing ledger. Decrement the live-animator count;
     *  on a natural completion (`finalize`) with others still running, bring this
     *  animator's own contribution to its full delta first. When the count hits
     *  zero: resume the one displaced driver re-evaluated (animation.md §2 rule
     *  4), and — on a natural completion — assign the exact expected value (no
     *  float drift, LaszloAnimation.lzs:347–365); a mid-flight stop() halts in
     *  place, only rolling its un-travelled remainder out of `expected` so the
     *  animators still running land where they were headed. */
    private releaseSlot;
    /** Shared teardown for imperative stop AND natural completion (LZX has no
     *  finished-vs-stopped split): mark stopped, clear run state, fire onStop
     *  (which MAY restart us). The ledger cleanup + displaced resume already ran
     *  in releaseSlot; this only closes out the animator. */
    private end;
}
