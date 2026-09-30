// Animator / AnimatorGroup — imperative motion over a target's numeric slot
// (animation.md §1–§4). LZX's animation vocabulary, applied imperatively: a
// `start()` call drives one slot through an easing curve, sampled once at start
// (no live retarget in v1). They are ordinary twin-table classes (schema +
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
import { DEFAULT_MOTION } from "./animate.js";
import { defineAttributes, disposeBindings } from "./attributes.js";
import { TweenRun } from "./tween.js";
import { AnimatorGroup } from "./animator-group.js";
export class Animator extends Node {
    perpetual = false;
    /** Group-driven: an enclosing AnimatorGroup registers the clock and ticks
     *  us, so start()/stop() must NOT touch the shared clock themselves. */
    grouped = false;
    /** The timed run (tween.ts), made at the first start(). A Spring never
     *  makes one — it integrates its own tick — so every entry below that
     *  reaches the run is a no-op until there is one. */
    run = null;
    autoStarted = false;
    /** Marked by an enclosing AnimatorGroup at construct: the group drives the
     *  clock and cascades attributes, so this animator is group-controlled. */
    markGrouped() {
        this.grouped = true;
    }
    /** The node whose slot this animator drives: its parent, but for a grouped
     *  member the enclosing group is transparent — the target is the group's own
     *  target (LZX cascades `target` down a group), i.e. the nearest ancestor
     *  that is not itself an animator/group. For an ungrouped animator this is
     *  just its parent (a View). Matches the checker's target context, which
     *  threads the group's PARENT schema through to its members. */
    resolveTarget() {
        let t = this.parent;
        while (t !== null && (t instanceof Animator || t instanceof AnimatorGroup))
            t = t.parent;
        return t;
    }
    /** Auto-start at init if `started` (the initTree hook — once per lifetime,
     *  after the tree is linked and every binding has evaluated, so `from`
     *  samples a settled target value). A grouped animator is never reached here
     *  (its group is the init-time child, and it drives its members). */
    autoStart() {
        if (this.autoStarted || this.grouped)
            return; // a group drives its members
        this.autoStarted = true;
        if (this.started)
            this.start();
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
    startedChanged(v) {
        if (!this.autoStarted || this.grouped)
            return;
        if (v)
            this.start();
        else
            this.stop();
    }
    /** `paused` is clock membership (TweenRun.paused says how). */
    pausedChanged(v) {
        this.run?.paused(v);
    }
    /** Re-seed the elapsed-time anchor at `now` — a group resuming from its own
     *  pause calls this down its members (TweenRun.reanchor). */
    reanchor(now) {
        this.run?.reanchor(now);
    }
    /** Begin driving the target slot through the curve (LZX's doStart) — the
     *  timed run, sampled once here (TweenRun.start). A no-op while running. */
    start() {
        (this.run ??= new TweenRun(this)).start();
    }
    /** Halt in place — no snap to either end (LZX). Idempotent (TweenRun.stop). */
    stop() {
        this.run?.stop();
    }
    /** Retire with the host view (the teardown recursion reaches us): drop off
     *  the clock and dispose our own `{ }` bindings (`to`, `attribute`, …).
     *  Without this a discarded Spring's `to` binding stays subscribed to what
     *  it read — the leak — and the spring keeps ticking. Bindings first, so a
     *  stop() that fires onStop cannot re-target through a live binding. */
    teardown() {
        disposeBindings(this);
        this.stop();
        super.teardown();
    }
    /** Shift the anchor across a scheduler handover (Ticker.rebase). */
    rebase(delta) {
        this.run?.rebase(delta);
    }
    /** One clock frame (the Ticker contract; TweenRun.tick). Returns whether
     *  still running — false drops it from the clock, and a group reads it to
     *  retire a finished member. */
    tick(now, frozen = false) {
        return this.run !== null && this.run.tick(now, frozen);
    }
    /** Fire a carried handler if one is installed (onStart / onStop / onRepeat).
     *  A plain Node dispatch — fireEvent (view.ts) is View-typed, and an
     *  animator is a Node; an absent handler is a silent no-op. The timed run
     *  (tween.ts) and a Spring's own tick (spring.ts's rest branch) both
     *  announce through it. */
    fire(handler) {
        const h = this[handler];
        if (typeof h === "function")
            h.call(this);
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
    started: { def: false, push: (s, v) => s.startedChanged(v) },
    paused: { def: false, push: (s, v) => s.pausedChanged(v) },
    running: { def: false },
    arrived: { def: false },
});
//# sourceMappingURL=animator.js.map