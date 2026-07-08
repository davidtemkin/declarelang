import { Node } from "./node.js";
import { type Motion, type Ticker } from "./animate.js";
/** The shared contract a group drives its members through — an Animator or a
 *  nested AnimatorGroup, uniformly (LZX: LzAnimator extends LzAnimatorGroup).
 *  `tick`'s optional `frozen` freezes progression while keeping the member's
 *  clock reference fresh — how a group cascades its own pause down without the
 *  member jumping when unpaused (a plain Ticker call passes it false). */
interface Animatable extends Ticker {
    start(): void;
    stop(): void;
    isRunning(): boolean;
    tick(now: number, frozen?: boolean): boolean;
}
export declare class Animator extends Node implements Animatable {
    /** The target's slot name — a bare token, schema-checked against the
     *  target's numeric slots at compile time (the one animation check,
     *  animation.md §3); a plain string at runtime. */
    attribute: string;
    /** The destination, sampled once at start (v1 has no live retarget). */
    to: number;
    /** The origin; null (default) samples the target's current value at start
     *  (LZX). An explicit `from` snaps the slot there on the FIRST frame — not at
     *  start() — so a restart from within an onStop handler shows no mid-frame
     *  flash (the neo deferral of LZX's prepareStart jump; the additive stream
     *  folds the snap into the first increment). */
    from: number | null;
    /** `to` is a delta from `from`, not an absolute (LZX). */
    relative: boolean;
    /** Duration in milliseconds (LZX; a plain number, no unit suffix). */
    duration: number;
    /** The easing curve, carried whole (default easeBoth, LZX). */
    motion: Motion;
    /** How many times to play from→to (default 1; Infinity legal, LZX). */
    repeat: number;
    /** Opt-in auto-start at init. Default **false** — a deliberate divergence
     *  from LZX's `start="true"`: auto-start is the rare case (most animation is
     *  triggered), and the default's failure is silent — a start/reverse pair on
     *  one slot both auto-firing at init cancels to net-zero motion, invisible to
     *  the acceptance. Opt in with `started = true`. (See animation.md §6 Q3.) */
    started: boolean;
    /** Freeze in place; resume continues (LZX). */
    paused: boolean;
    private running;
    /** Group-driven: an enclosing AnimatorGroup registers the clock and ticks
     *  us, so start()/stop() must NOT touch the shared clock themselves. */
    private grouped;
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
    private autoStarted;
    /** Marked by an enclosing AnimatorGroup at construct: the group drives the
     *  clock and cascades attributes, so this animator is group-controlled. */
    markGrouped(): void;
    isRunning(): boolean;
    /** The node whose slot this animator drives: its parent, but for a grouped
     *  member the enclosing group is transparent — the target is the group's own
     *  target (LZX cascades `target` down a group), i.e. the nearest ancestor
     *  that is not itself an animator/group. For an ungrouped animator this is
     *  just its parent (a View). Matches the checker's target context, which
     *  threads the group's PARENT schema through to its members. */
    private resolveTarget;
    /** Auto-start at init if `started` (the initTree hook — once per lifetime,
     *  after the tree is linked and every binding has evaluated, so `from`
     *  samples a settled target value). A grouped animator is never reached here
     *  (its group is the init-time child, and it drives its members). */
    autoStart(): void;
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
    tick(now: number, frozen?: boolean): boolean;
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
    /** Fire a carried handler if one is installed (onStart / onStop / onRepeat).
     *  A plain Node dispatch — fireEvent (view.ts) is View-typed, and an
     *  animator is a Node; an absent handler is a silent no-op. */
    private fire;
}
/** AnimatorGroup — coordinates several animators (or nested groups) in
 *  `sequential` or `simultaneous` order (animation.md §1, LzAnimatorGroup.lzs).
 *  A twin-table component exactly like Animator: it carries the same
 *  started/paused/start()/stop()/repeat surface, and it — not its children —
 *  is the driver (a member's own `started` is ignored; the group starts them).
 *  It registers ONE ticker with the shared clock and forwards the same `now`
 *  to its members each frame ("to ensure that all animators are synched",
 *  LzAnimatorGroup.lzs:475), so a whole group's motion stays in lockstep and
 *  the idle-zero invariant holds for the group as a unit. Members compose on a
 *  shared slot through the same additive ledger an ungrouped pair uses. */
export declare class AnimatorGroup extends Node implements Animatable {
    /** Cascaded to members at construct (the LZX default-cascade): a member that
     *  did not set one of these inherits the group's. Not surface the group reads
     *  itself (its motion lives in its members) — declared so cascade can carry
     *  them and the schema can check the group's `attribute` against its target. */
    attribute: string;
    to: number;
    from: number | null;
    relative: boolean;
    duration: number;
    motion: Motion;
    /** Run members one-after-another (`sequential`, default) or all-at-once
     *  (`simultaneous`) — the one group-only control (LZX). */
    process: "sequential" | "simultaneous";
    /** How many times to replay the whole group (default 1; Infinity legal). */
    repeat: number;
    /** Opt-in auto-start at init: default **false** (see Animator.started). */
    started: boolean;
    /** Freeze the whole group; members hold in place and resume together. */
    paused: boolean;
    private running;
    /** The members still to finish this run, in tree order — LZX's `actAnim`. */
    private active;
    private cyclesLeft;
    private grouped;
    private autoStarted;
    markGrouped(): void;
    isRunning(): boolean;
    /** This group's members (child Animators / AnimatorGroups), in tree order. */
    private members;
    autoStart(): void;
    /** Begin the group (LZX doStart): snapshot the members to run this cycle and
     *  register the one group ticker (unless the group is itself group-driven).
     *  Members are NOT started here — each is started lazily when it first
     *  becomes active (so a sequential member samples its `from` only once the
     *  members before it have moved the slot). */
    start(): void;
    /** Stop the group (LZX stop): halt every still-running member in place, drop
     *  the group ticker, fire onStop. Idempotent. */
    stop(): void;
    /** One group frame: drive the active members with the shared `now`, retire
     *  the finished, replay or finish when all are done. `sequential` advances
     *  only the head member per frame; `simultaneous` advances all. A `frozen`
     *  group (its own pause, or an enclosing group's) keeps running members'
     *  clocks fresh but neither starts pending members nor advances progression. */
    tick(now: number, frozen?: boolean): boolean;
    /** All members done: replay the whole group (repeat) or finish it. */
    private cycleComplete;
    private endGroup;
    private fire;
}
export {};
