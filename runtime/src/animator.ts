// Animator / AnimatorGroup — imperative motion over a target's numeric slot
// (animation.md §1–§4). LZX's animation vocabulary, applied imperatively: a
// `start()` call drives one slot through an easing curve, sampled once at start
// (no live retarget in v1). They are ordinary twin-table components (schema +
// runtime class, registered like Dataset or SimpleLayout), NOT keywords —
// written as ordinary child-instance members (`slide: Animator [ attribute =
// height, to = 255 ]`).
//
// A non-visual Node member (like Dataset), but unlike Dataset each carries
// built-in start()/stop() and the on* handlers, so its construct path installs
// methods/handlers (see instantiate.ts). Each clock tick it writes the target
// slot with an ORDINARY model write, so constraints, layout, auto-extent, and
// draw bodies downstream of the animated slot see every intermediate frame
// value — the model-space ruling (animation.md §2 rule 1), not
// presentation-layer tweening. One shared clock (animate.ts) runs only while
// ≥1 animator is live, and the idle-zero invariant holds exactly.
//
// The write is ADDITIVE (animation.md §4.2, carried from LaszloAnimation.lzs):
// every frame lands a DELTA (`target[attr] += valueNow − valuePrev`), so two
// animators on one slot COMPOSE instead of fighting — the animator-vs-animator
// half of §2 rule 5. A per-target exact-landing ledger (`__animatedAttributes`,
// §4.3) holds each animated slot's expected end value plus a running count of
// live animators: a later absolute `to` measures its delta against the EXPECTED
// value (composing with everything in flight), and when the count hits zero the
// exact expected value is assigned outright — no float drift from summing
// increments. A single lone animator is frame-identical to an absolute write
// (its delta stream reconstructs `from + ease·(to−from)` exactly), so the A1a
// behavior is preserved; the additive machinery only shows itself when a second
// animator lands on the same slot.
//
// Deconfliction with NON-animator drivers (animation.md §2): whatever drove the
// slot before — a constraint, a derive, a layout's laid axis — is DISPLACED for
// the run (one deep, remembered in the ledger entry) and RESUMED re-evaluated
// when the last animator on the slot finishes. Animators are runtime writers in
// the derive family, so they never trip R4's error-on-direct-author-write; the
// displace/resume rides Constraint's suspend/resume (reactive.ts), the
// sanctioned supersede/restore service. The displace/resume model (§2) sits ON
// TOP of the additive core (§4): the one displaced driver is remembered per
// slot (not per animator), suspended when the first animator arrives and
// resumed only when the last one leaves, so a composing pair displaces its
// prior owner exactly once and hands it back exactly once.

import { Node } from "./node.js";
import { sample, sharedClock, DEFAULT_MOTION, type Motion, type Ticker } from "./animate.js";
import { addBound, defineAttributes, disposeBindings, ownerOf, setBound } from "./attributes.js";
import type { Constraint } from "./reactive.js";

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

/** One animated slot's exact-landing bookkeeping (animation.md §4.3,
 *  LaszloAnimation.lzs:210–259 / 347–365): the running expected end value, the
 *  live-animator counter, and the one non-animator driver displaced for the
 *  run. Held per (target, attribute) in the target's ledger. */
interface LedgerEntry {
  /** Where the slot is expected to end when every live animator finishes — a
   *  later absolute `to` measures its delta against THIS, not the instant
   *  value, so it lands where its author said (accounting for all in flight). */
  expected: number;
  /** How many animators are live on this slot. First arrival displaces the
   *  prior driver; the last departure resumes it and assigns `expected`. */
  count: number;
  /** The one non-animator driver (constraint / derive / laid axis) superseded
   *  for the run, remembered one-deep (animation.md §2 rule 3). */
  displaced: Constraint | null;
}

/** The per-target ledger, keyed by slot name (LZX's `__animatedAttributes`).
 *  A Symbol-keyed side table, materialized only when an animator first drives a
 *  slot on the target — pay-per-use, invisible to author reads. */
const LEDGER = Symbol("animatedAttributes");

function ledgerFor(target: Node): Map<string, LedgerEntry> {
  const t = target as unknown as { [LEDGER]?: Map<string, LedgerEntry> };
  return (t[LEDGER] ??= new Map());
}

/** The target's current numeric value for a slot (0 for a never-written or
 *  non-numeric slot) — read through the ordinary getter, off the tracking path
 *  (a tick never runs inside a constraint's compute), so it registers no dep. */
function numOf(target: Node, attr: string): number {
  const v = (target as unknown as Record<string, unknown>)[attr];
  return typeof v === "number" ? v : 0;
}

export class Animator extends Node implements Animatable {
  /** The target's slot name — a bare token, schema-checked against the
   *  target's numeric slots at compile time (the one animation check,
   *  animation.md §3); a plain string at runtime. */
  declare attribute: string;
  /** The destination, sampled once at start (v1 has no live retarget). */
  declare to: number;
  /** The origin; null (default) samples the target's current value at start
   *  (LZX). An explicit `from` snaps the slot there on the FIRST frame — not at
   *  start() — so a restart from within an onStop handler shows no mid-frame
   *  flash (the Declare deferral of LZX's prepareStart jump; the additive stream
   *  folds the snap into the first increment). */
  declare from: number | null;
  /** `to` is a delta from `from`, not an absolute (LZX). */
  declare relative: boolean;
  /** Duration in milliseconds (LZX; a plain number, no unit suffix). */
  declare duration: number;
  /** The easing curve, carried whole (default easeBoth, LZX). */
  declare motion: Motion;
  /** How many times to play from→to (default 1; Infinity legal, LZX). */
  declare repeat: number;
  /** Opt-in auto-start at init. Default **false** — a deliberate divergence
   *  from LZX's `start="true"`: auto-start is the rare case (most animation is
   *  triggered), and the default's failure is silent — a start/reverse pair on
   *  one slot both auto-firing at init cancels to net-zero motion, invisible to
   *  the acceptance. Opt in with `started = true`. (See animation.md §6 Q3.) */
  declare started: boolean;
  /** Freeze in place; resume continues (LZX). */
  declare paused: boolean;

  // ── Per-run state: set by start(), read by tick(), cleared by end(). All
  //    the driving inputs are SAMPLED at start (animation.md §1) so writing
  //    `to`/`duration`/… mid-run has no effect until a restart. ────────────
  private running = false;
  /** Group-driven: an enclosing AnimatorGroup registers the clock and ticks
   *  us, so start()/stop() must NOT touch the shared clock themselves. */
  private grouped = false;
  private runTarget: Node | null = null;
  private runAttr = "";
  /** The eased delta this run travels — measured against the ledger's expected
   *  value (LZX `this.to`), so an absolute `to` composes with everything in
   *  flight. Excludes the `from` snap (that rides `fromJump`). */
  private runDelta = 0;
  /** The one-time `from` snap (from − slot's value at start), applied over the
   *  first frame; 0 when `from` is unset. Deferred to the first tick so a
   *  restart shows no jump at start() time. */
  private fromJump = 0;
  /** How much this animator has contributed to the target so far — the sum of
   *  its written increments, `fromJump + ease(t)·runDelta`. The additive
   *  currentValue (LZX), one frame's increment being the delta of this. */
  private traveled = 0;
  private runDuration = 0;
  private runMotion: Motion = DEFAULT_MOTION;
  private cyclesLeft = 1;
  private elapsed = 0; // accumulated ms in the current cycle (pause-aware)
  private lastNow: number | null = null;
  private autoStarted = false;

  /** Marked by an enclosing AnimatorGroup at construct: the group drives the
   *  clock and cascades attributes, so this animator is group-controlled. */
  markGrouped(): void {
    this.grouped = true;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** The node whose slot this animator drives: its parent, but for a grouped
   *  member the enclosing group is transparent — the target is the group's own
   *  target (LZX cascades `target` down a group), i.e. the nearest ancestor
   *  that is not itself an animator/group. For an ungrouped animator this is
   *  just its parent (a View). Matches the checker's target context, which
   *  threads the group's PARENT schema through to its members. */
  protected resolveTarget(): Node | null {
    let t = this.parent;
    while (t !== null && (t instanceof Animator || t instanceof AnimatorGroup)) t = t.parent;
    return t;
  }

  /** Auto-start at init if `started` (the initTree hook — once per lifetime,
   *  after the tree is linked and every binding has evaluated, so `from`
   *  samples a settled target value). A grouped animator is never reached here
   *  (its group is the init-time child, and it drives its members). */
  autoStart(): void {
    if (this.autoStarted || this.grouped) return; // a group drives its members
    this.autoStarted = true;
    if (this.started) this.start();
  }

  /** Begin driving the target slot through the curve (LZX's doStart). A no-op
   *  while already running (LZX's guard). Samples from / to / duration /
   *  motion / repeat ONCE here, and enrolls in the slot's exact-landing ledger
   *  (displacing the slot's prior non-animator driver on the first arrival). */
  start(): void {
    if (this.running) return;
    const target = this.resolveTarget();
    const attr = this.attribute;
    if (target === null || attr === "") return; // no target / unnamed slot: nothing to drive
    this.runTarget = target;
    this.runAttr = attr;

    const ledger = ledgerFor(target);
    let entry = ledger.get(attr);
    const fresh = entry === undefined;
    if (entry === undefined) {
      entry = { expected: 0, count: 0, displaced: null };
      ledger.set(attr, entry);
    }
    // First animator on this slot displaces the slot's prior (non-animator)
    // driver one-deep (animation.md §2 rules 2–3) and remembers it in the
    // ledger; later animators COMPOSE (§4) — they see no owner (an animator
    // never owns) and simply add on top.
    if (entry.count === 0) {
      entry.displaced = ownerOf(target, attr);
      entry.displaced?.suspend();
    }
    const preStart = numOf(target, attr);
    // A fresh slot's expected end starts at the animator's own start position:
    // the explicit `from`, else the current value. (An existing entry keeps its
    // running expected — a composing animator measures against that.)
    if (fresh) entry.expected = this.from !== null ? this.from : preStart;
    // The eased delta: `relative` travels `to` outright; an absolute `to`
    // travels to the author's value measured against the EXPECTED end
    // (LaszloAnimation.lzs:236–244) so a later `to` composes with what is
    // already in flight. `expected` then advances to the new running end.
    this.runDelta = this.relative ? this.to : this.to - entry.expected;
    entry.expected += this.runDelta;
    entry.count += 1;
    // The `from` snap, deferred to the first frame: from a slot not already at
    // `from`, the first increment jumps it there before easing begins.
    this.fromJump = this.from !== null ? this.from - preStart : 0;
    this.traveled = 0;
    this.runDuration = this.duration;
    this.runMotion = this.motion;
    this.cyclesLeft = this.repeat;
    this.elapsed = 0;
    this.lastNow = null;
    this.running = true;
    if (!this.grouped) sharedClock.add(this);
    this.fire("onStart");
  }

  /** Halt in place — no snap to either end (LZX). Idempotent; a no-op when not
   *  running. Leaves the ledger (resuming the displaced driver when it was the
   *  last animator), without landing an end value (animation.md §2). */
  stop(): void {
    if (!this.running) return;
    if (!this.grouped) sharedClock.remove(this);
    this.releaseSlot(false); // halt in place — read runTarget before end() clears it
    this.end();
  }

  /** Retire with the host view (View.discard reaches us now): drop off the
   *  clock and dispose our own `{ }` bindings (`to`, `attribute`, …). Without
   *  this a discarded Spring's `to` binding stays subscribed to what it read —
   *  the leak — and the spring keeps ticking. Bindings first, so a stop() that
   *  fires onStop cannot re-target through a live binding. */
  override discard(): void {
    disposeBindings(this);
    this.stop();
    super.discard();
  }

  /** One clock frame (the Ticker contract): advance by real elapsed time,
   *  write the eased DELTA additively, handle repeat / completion. `frozen`
   *  (an enclosing group's pause) freezes progression while keeping `lastNow`
   *  fresh so nothing jumps on unpause. Returns whether still running (false
   *  drops it from the clock; a group reads it to retire a finished member). */
  tick(now: number, frozen = false): boolean {
    if (!this.running) return false;
    if (this.lastNow === null) this.lastNow = now; // first frame: dt = 0 → t = 0
    const dt = now - this.lastNow;
    this.lastNow = now;
    if (this.paused || frozen) return true; // frozen in place: hold elapsed, stay live
    this.elapsed += dt;
    // Consume completed cycles (a large dt may span several) — repeat replays
    // from→to; the last cycle finishes below.
    while (this.runDuration > 0 && this.elapsed >= this.runDuration && this.cyclesLeft > 1) {
      this.elapsed -= this.runDuration;
      this.cyclesLeft -= 1;
      this.fire("onRepeat");
    }
    const t = this.runDuration > 0 ? Math.min(this.elapsed / this.runDuration, 1) : 1;
    if (t >= 1) {
      this.releaseSlot(true); // natural completion: land the full delta / exact expected
      this.end(); // resumes a displaced owner (when last) + fires onStop, which MAY restart us
      return this.running; // an onStop that called start() keeps the ticker alive; else false → dropped
    }
    // The additive write: this animator's cumulative contribution is
    // `fromJump + ease(t)·runDelta`; land the increment since last frame so it
    // composes with any other animator's contribution on the same slot.
    const contribution = this.fromJump + sample(this.runMotion, t, this.runDelta) * this.runDelta;
    addBound(this.runTarget!, this.runAttr, contribution - this.traveled);
    this.traveled = contribution;
    return true;
  }

  /** Leave the slot's exact-landing ledger. Decrement the live-animator count;
   *  on a natural completion (`finalize`) with others still running, bring this
   *  animator's own contribution to its full delta first. When the count hits
   *  zero: resume the one displaced driver re-evaluated (animation.md §2 rule
   *  4), and — on a natural completion — assign the exact expected value (no
   *  float drift, LaszloAnimation.lzs:347–365); a mid-flight stop() halts in
   *  place, only rolling its un-travelled remainder out of `expected` so the
   *  animators still running land where they were headed. */
  private releaseSlot(finalize: boolean): void {
    const target = this.runTarget;
    if (target === null) return;
    const attr = this.runAttr;
    const ledger = ledgerFor(target);
    const entry = ledger.get(attr);
    if (entry === undefined) return;
    entry.count -= 1;
    if (finalize && entry.count > 0) {
      // Others still running: complete my own contribution to its full delta.
      addBound(target, attr, this.fromJump + this.runDelta - this.traveled);
      this.traveled = this.fromJump + this.runDelta;
    }
    if (entry.count <= 0) {
      const expected = entry.expected;
      ledger.delete(attr);
      if (finalize) setBound(target, attr, expected); // exact landing — assign the expected end outright
      entry.displaced?.resume(); // the displaced driver takes the slot back, re-evaluated
    } else if (!finalize) {
      // Halted in place: withdraw the delta I had not yet travelled so the
      // remaining animators' expected end value stays consistent.
      entry.expected -= this.fromJump + this.runDelta - this.traveled;
    }
  }

  /** Shared teardown for imperative stop AND natural completion (LZX has no
   *  finished-vs-stopped split): mark stopped, clear run state, fire onStop
   *  (which MAY restart us). The ledger cleanup + displaced resume already ran
   *  in releaseSlot; this only closes out the animator. */
  private end(): void {
    this.running = false;
    this.runTarget = null;
    this.fire("onStop");
  }

  /** Fire a carried handler if one is installed (onStart / onStop / onRepeat).
   *  A plain Node dispatch — fireEvent (view.ts) is View-typed, and an
   *  animator is a Node; an absent handler is a silent no-op. */
  private fire(handler: string): void {
    const h = (this as unknown as Record<string, unknown>)[handler];
    if (typeof h === "function") (h as () => void).call(this);
  }
}

defineAttributes(Animator, {
  attribute: { def: "" },
  to: { def: 0 },
  from: { def: null },
  relative: { def: false },
  duration: { def: 1000 },
  motion: { def: DEFAULT_MOTION },
  repeat: { def: 1 },
  started: { def: false },
  paused: { def: false },
});

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
export class AnimatorGroup extends Node implements Animatable {
  /** Cascaded to members at construct (the LZX default-cascade): a member that
   *  did not set one of these inherits the group's. Not surface the group reads
   *  itself (its motion lives in its members) — declared so cascade can carry
   *  them and the schema can check the group's `attribute` against its target. */
  declare attribute: string;
  declare to: number;
  declare from: number | null;
  declare relative: boolean;
  declare duration: number;
  declare motion: Motion;
  /** Run members one-after-another (`sequential`, default) or all-at-once
   *  (`simultaneous`) — the one group-only control (LZX). */
  declare process: "sequential" | "simultaneous";
  /** How many times to replay the whole group (default 1; Infinity legal). */
  declare repeat: number;
  /** Opt-in auto-start at init: default **false** (see Animator.started). */
  declare started: boolean;
  /** Freeze the whole group; members hold in place and resume together. */
  declare paused: boolean;

  private running = false;
  /** The members still to finish this run, in tree order — LZX's `actAnim`. */
  private active: Animatable[] = [];
  private cyclesLeft = 1;
  private grouped = false;
  private autoStarted = false;

  markGrouped(): void {
    this.grouped = true;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** This group's members (child Animators / AnimatorGroups), in tree order. */
  private members(): Animatable[] {
    return this.children.filter(isAnimatable) as unknown as Animatable[];
  }

  autoStart(): void {
    if (this.autoStarted || this.grouped) return; // an enclosing group drives us
    this.autoStarted = true;
    if (this.started) this.start();
  }

  /** Begin the group (LZX doStart): snapshot the members to run this cycle and
   *  register the one group ticker (unless the group is itself group-driven).
   *  Members are NOT started here — each is started lazily when it first
   *  becomes active (so a sequential member samples its `from` only once the
   *  members before it have moved the slot). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.cyclesLeft = this.repeat;
    this.active = this.members();
    if (!this.grouped) sharedClock.add(this);
    this.fire("onStart");
  }

  /** Stop the group (LZX stop): halt every still-running member in place, drop
   *  the group ticker, fire onStop. Idempotent. */
  stop(): void {
    if (!this.running) return;
    if (!this.grouped) sharedClock.remove(this);
    for (const m of this.active) if (m.isRunning()) m.stop();
    this.endGroup();
  }

  /** Retire with the host view: drop the group ticker + own bindings, then
   *  recurse so each member animator disposes its own bindings too. */
  override discard(): void {
    disposeBindings(this);
    this.stop();
    super.discard();
  }

  /** One group frame: drive the active members with the shared `now`, retire
   *  the finished, replay or finish when all are done. `sequential` advances
   *  only the head member per frame; `simultaneous` advances all. A `frozen`
   *  group (its own pause, or an enclosing group's) keeps running members'
   *  clocks fresh but neither starts pending members nor advances progression. */
  tick(now: number, frozen = false): boolean {
    if (!this.running) return false;
    const freeze = frozen || this.paused;
    if (freeze) {
      for (const m of this.active) if (m.isRunning()) m.tick(now, true);
      return true;
    }
    if (this.process === "sequential") {
      const head = this.active[0];
      if (head !== undefined) {
        if (!head.isRunning()) head.start(); // lazy start — samples `from` now
        if (!head.tick(now)) this.active.shift();
      }
    } else {
      let i = 0;
      while (i < this.active.length) {
        const m = this.active[i];
        if (!m.isRunning()) m.start();
        if (m.tick(now)) i += 1;
        else this.active.splice(i, 1);
      }
    }
    if (this.active.length === 0) return this.cycleComplete();
    return true;
  }

  /** All members done: replay the whole group (repeat) or finish it. */
  private cycleComplete(): boolean {
    if (this.cyclesLeft > 1) {
      this.cyclesLeft -= 1;
      this.fire("onRepeat");
      this.active = this.members();
      return true;
    }
    this.endGroup();
    return this.running; // an onStop that restarted the group keeps the ticker alive
  }

  private endGroup(): void {
    this.running = false;
    this.active = [];
    this.fire("onStop");
  }

  private fire(handler: string): void {
    const h = (this as unknown as Record<string, unknown>)[handler];
    if (typeof h === "function") (h as () => void).call(this);
  }
}

defineAttributes(AnimatorGroup, {
  attribute: { def: "" },
  to: { def: 0 },
  from: { def: null },
  relative: { def: false },
  duration: { def: 1000 },
  motion: { def: DEFAULT_MOTION },
  process: { def: "sequential" },
  repeat: { def: 1 },
  started: { def: false },
  paused: { def: false },
});

/** Is this node an animation member a group can drive — an Animator or a nested
 *  AnimatorGroup? (The runtime twin of `descendsFrom(schema, "AnimatorGroup")`.) */
function isAnimatable(n: Node): boolean {
  return n instanceof Animator || n instanceof AnimatorGroup;
}
