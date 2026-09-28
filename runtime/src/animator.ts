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
import { DEFAULT_MOTION, type Motion, type Ticker } from "./animate.js";
import { defineAttributes, disposeBindings } from "./attributes.js";
import { TweenRun } from "./tween.js";
import { AnimatorGroup } from "./animator-group.js";

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
  perpetual = false;
  /** Opt-in auto-start at init. Default **false** — a deliberate divergence
   *  from LZX's `start="true"`: auto-start is the rare case (most animation is
   *  triggered), and the default's failure is silent — a start/reverse pair on
   *  one slot both auto-firing at init cancels to net-zero motion, invisible to
   *  the acceptance. Opt in with `started = true`. (See animation.md §6 Q3.) */
  declare started: boolean;
  /** Freeze in place; resume continues (LZX). */
  declare paused: boolean;
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
  declare running: boolean;
  declare arrived: boolean;

  /** Group-driven: an enclosing AnimatorGroup registers the clock and ticks
   *  us, so start()/stop() must NOT touch the shared clock themselves. */
  grouped = false;
  /** The timed run (tween.ts), made at the first start(). A Spring never
   *  makes one — it integrates its own tick — so every entry below that
   *  reaches the run is a no-op until there is one. */
  private run: TweenRun | null = null;
  private autoStarted = false;

  /** Marked by an enclosing AnimatorGroup at construct: the group drives the
   *  clock and cascades attributes, so this animator is group-controlled. */
  markGrouped(): void {
    this.grouped = true;
  }

  /** The node whose slot this animator drives: its parent, but for a grouped
   *  member the enclosing group is transparent — the target is the group's own
   *  target (LZX cascades `target` down a group), i.e. the nearest ancestor
   *  that is not itself an animator/group. For an ungrouped animator this is
   *  just its parent (a View). Matches the checker's target context, which
   *  threads the group's PARENT schema through to its members. */
  resolveTarget(): Node | null {
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
  startedChanged(v: boolean): void {
    if (!this.autoStarted || this.grouped) return;
    if (v) this.start();
    else this.stop();
  }

  /** `paused` is clock membership (TweenRun.paused says how). */
  pausedChanged(v: boolean): void {
    this.run?.paused(v);
  }

  /** Re-seed the elapsed-time anchor at `now` — a group resuming from its own
   *  pause calls this down its members (TweenRun.reanchor). */
  reanchor(now: number): void {
    this.run?.reanchor(now);
  }

  /** Begin driving the target slot through the curve (LZX's doStart) — the
   *  timed run, sampled once here (TweenRun.start). A no-op while running. */
  start(): void {
    (this.run ??= new TweenRun(this)).start();
  }

  /** Halt in place — no snap to either end (LZX). Idempotent (TweenRun.stop). */
  stop(): void {
    this.run?.stop();
  }

  /** Retire with the host view (the teardown recursion reaches us): drop off
   *  the clock and dispose our own `{ }` bindings (`to`, `attribute`, …).
   *  Without this a discarded Spring's `to` binding stays subscribed to what
   *  it read — the leak — and the spring keeps ticking. Bindings first, so a
   *  stop() that fires onStop cannot re-target through a live binding. */
  override teardown(): void {
    disposeBindings(this);
    this.stop();
    super.teardown();
  }

  /** Shift the anchor across a scheduler handover (Ticker.rebase). */
  rebase(delta: number): void {
    this.run?.rebase(delta);
  }

  /** One clock frame (the Ticker contract; TweenRun.tick). Returns whether
   *  still running — false drops it from the clock, and a group reads it to
   *  retire a finished member. */
  tick(now: number, frozen = false): boolean {
    return this.run !== null && this.run.tick(now, frozen);
  }

  /** Fire a carried handler if one is installed (onStart / onStop / onRepeat).
   *  A plain Node dispatch — fireEvent (view.ts) is View-typed, and an
   *  animator is a Node; an absent handler is a silent no-op. The timed run
   *  (tween.ts) and a Spring's own tick (spring.ts's rest branch) both
   *  announce through it. */
  fire(handler: string): void {
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
  started: { def: false, push: (s: Animator, v: boolean) => s.startedChanged(v) },
  paused: { def: false, push: (s: Animator, v: boolean) => s.pausedChanged(v) },
  running: { def: false },
  arrived: { def: false },
});


