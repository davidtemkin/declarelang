import { Node } from "./node.js";
import { type Motion, type Ticker } from "./animate.js";
/** The shared contract a group drives its members through — an Animator or a
 *  nested AnimatorGroup, uniformly (LZX: LzAnimator extends LzAnimatorGroup).
 *  `tick`'s optional `frozen` freezes progression while keeping the member's
 *  clock reference fresh — how a group cascades its own pause down without the
 *  member jumping when unpaused (a plain Ticker call passes it false). */
export interface Animatable extends Ticker {
    start(): void;
    stop(): void;
    tick(now: number, frozen?: boolean): boolean;
    /** The in-flight fact — a read-only attribute on every implementor (Animator,
     *  Spring, AnimatorGroup); the group coordinates its members by it. */
    readonly running: boolean;
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
     *  flash (the Declare deferral of LZX's prepareStart jump; the additive stream
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
    perpetual: boolean;
    /** Opt-in auto-start at init. Default **false** — a deliberate divergence
     *  from LZX's `start="true"`: auto-start is the rare case (most animation is
     *  triggered), and the default's failure is silent — a start/reverse pair on
     *  one slot both auto-firing at init cancels to net-zero motion, invisible to
     *  the acceptance. Opt in with `started = true`. (See animation.md §6 Q3.) */
    started: boolean;
    /** Freeze in place; resume continues (LZX). */
    paused: boolean;
    /** THE TWO FACTS OF MOTION (2026-09-12 ruling — one name, one meaning, on
     *  Animator and Spring alike; `started` is the request, these are the
     *  platform's report). `running`: a journey is in flight — false at birth,
     *  true from start (or a spring's wake) until it stops for ANY reason, a
     *  landing or a stop(). `arrived`: the run reached its destination on its
     *  own — false at birth, false after a mid-flight stop(), cleared by a new
     *  start, true only at natural completion (the animation twin of a
     *  DataSource's `.loaded`). `visible = { open.arrived }` reveals a panel
     *  once its container has finished opening; `Time [ running = { fit.running } ]`
     *  runs a clock for exactly the length of a motion. (Neither is "the
     *  settle", the update transaction, language §7 — different clocks.) */
    running: boolean;
    arrived: boolean;
    /** Group-driven: an enclosing AnimatorGroup registers the clock and ticks
     *  us, so start()/stop() must NOT touch the shared clock themselves. */
    grouped: boolean;
    /** The timed run (tween.ts), made at the first start(). A Spring never
     *  makes one — it integrates its own tick — so every entry below that
     *  reaches the run is a no-op until there is one. */
    private run;
    private autoStarted;
    /** Marked by an enclosing AnimatorGroup at construct: the group drives the
     *  clock and cascades attributes, so this animator is group-controlled. */
    markGrouped(): void;
    /** The node whose slot this animator drives: its parent, but for a grouped
     *  member the enclosing group is transparent — the target is the group's own
     *  target (LZX cascades `target` down a group), i.e. the nearest ancestor
     *  that is not itself an animator/group. For an ungrouped animator this is
     *  just its parent (a View). Matches the checker's target context, which
     *  threads the group's PARENT schema through to its members. */
    resolveTarget(): Node | null;
    /** Auto-start at init if `started` (the initTree hook — once per lifetime,
     *  after the tree is linked and every binding has evaluated, so `from`
     *  samples a settled target value). A grouped animator is never reached here
     *  (its group is the init-time child, and it drives its members). */
    autoStart(): void;
    /** `started` is a REACTIVE boolean (animation.md §1), not a construct-time
     *  flag: every later change drives the run — a constraint re-evaluating
     *  (`started = { app.open }`), a state override arriving, a direct write.
     *  True starts, false stops (in place, as stop() always does), so the one
     *  declaration covers both edges of the fact it reads. Before init the slot
     *  is still just a DECLARATION — construct-time literals and a `{ }`
     *  binding's first evaluation both land here with the tree half-built and
     *  `from` unsettled — so pre-init writes belong to autoStart(), which reads
     *  the settled value once at the init hook. A grouped member is driven by
     *  its group (its own `started` is ignored; see AnimatorGroup). */
    startedChanged(v: boolean): void;
    /** `paused` is clock membership (TweenRun.paused says how). */
    pausedChanged(v: boolean): void;
    /** Re-seed the elapsed-time anchor at `now` — a group resuming from its own
     *  pause calls this down its members (TweenRun.reanchor). */
    reanchor(now: number): void;
    /** Begin driving the target slot through the curve (LZX's doStart) — the
     *  timed run, sampled once here (TweenRun.start). A no-op while running. */
    start(): void;
    /** Halt in place — no snap to either end (LZX). Idempotent (TweenRun.stop). */
    stop(): void;
    /** Retire with the host view (the teardown recursion reaches us): drop off
     *  the clock and dispose our own `{ }` bindings (`to`, `attribute`, …).
     *  Without this a discarded Spring's `to` binding stays subscribed to what
     *  it read — the leak — and the spring keeps ticking. Bindings first, so a
     *  stop() that fires onStop cannot re-target through a live binding. */
    teardown(): void;
    /** Shift the anchor across a scheduler handover (Ticker.rebase). */
    rebase(delta: number): void;
    /** One clock frame (the Ticker contract; TweenRun.tick). Returns whether
     *  still running — false drops it from the clock, and a group reads it to
     *  retire a finished member. */
    tick(now: number, frozen?: boolean): boolean;
    /** Fire a carried handler if one is installed (onStart / onStop / onRepeat).
     *  A plain Node dispatch — fireEvent (view.ts) is View-typed, and an
     *  animator is a Node; an absent handler is a silent no-op. The timed run
     *  (tween.ts) and a Spring's own tick (spring.ts's rest branch) both
     *  announce through it. */
    fire(handler: string): void;
}
