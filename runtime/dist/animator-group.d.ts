import { Node } from "./node.js";
import { type Motion } from "./animate.js";
import { type Animatable } from "./animator.js";
/** AnimatorGroup — coordinates several animators (or nested groups) in
 *  `sequential` or `simultaneous` order (animation.md §1, LzAnimatorGroup.lzs).
 *  A twin-table class exactly like Animator: it carries the same
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
    /** The two facts of motion, on a group as on its members (see Animator). */
    running: boolean;
    arrived: boolean;
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
    private live;
    /** The members still to finish this run, in tree order — LZX's `actAnim`. */
    private active;
    private cyclesLeft;
    private grouped;
    private autoStarted;
    $markGrouped(): void;
    /** This group's members (child Animators / AnimatorGroups), in tree order. */
    private $members;
    $autoStart(): void;
    /** The group's own `started`, reactive exactly as an Animator's (see
     *  Animator.startedChanged) — the group is the driver, so a change here
     *  starts or stops the whole group, members included. */
    $startedChanged(v: boolean): void;
    /** The group's own pause is clock membership too (see Animator.pausedChanged):
     *  off the clock while paused — members freeze because nothing ticks them —
     *  and on resume every running member's anchor is re-seeded at NOW before the
     *  group re-enrolls, so no member measures the pause as elapsed time. */
    $pausedChanged(v: boolean): void;
    /** Cascade the unpause re-anchor down (Animator.reanchor). */
    $reanchor(now: number): void;
    /** Begin the group (LZX doStart): snapshot the members to run this cycle and
     *  register the one group ticker (unless the group is itself group-driven).
     *  Members are NOT started here — each is started lazily when it first
     *  becomes active (so a sequential member samples its `from` only once the
     *  members before it have moved the slot). */
    start(): void;
    /** Stop the group (LZX stop): halt every still-running member in place, drop
     *  the group ticker, fire onStop. Idempotent. */
    stop(): void;
    /** Retire with the host view: drop the group ticker + own bindings, then
     *  recurse so each member animator disposes its own bindings too. */
    $teardown(): void;
    /** One group frame: drive the active members with the shared `now`, retire
     *  the finished, replay or finish when all are done. `sequential` advances
     *  only the head member per frame; `simultaneous` advances all. A `frozen`
     *  group (its own pause, or an enclosing group's) keeps running members'
     *  clocks fresh but neither starts pending members nor advances progression. */
    $rebase(delta: number): void;
    $tick(now: number, frozen?: boolean): boolean;
    /** All members done: replay the whole group (repeat) or finish it. */
    private $cycleComplete;
    private $endGroup;
    private $fire;
}
