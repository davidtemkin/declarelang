// tween — an Animator's TIMED RUN (animation.md §1–§4): the eased drive of one
// slot from `from` to `to` over `duration`, the additive write, and the
// per-target exact-landing ledger (animator.ts's header states the model). Its
// own module because a Spring never runs it — a Spring integrates its own tick
// — so a program whose only motion is springs leaves the timed run, and the
// curves it samples (easing.ts), out of its build (the `tween` capability,
// compiler/src/capabilities.ts). An Animator creates its run at its first
// start().
import { sharedClock, DEFAULT_MOTION } from "./animate.js";
import { sample } from "./easing.js";
import { addBound, ownerOf, setBound } from "./attributes.js";
/** The per-target ledger, keyed by slot name (LZX's `__animatedAttributes`).
 *  A Symbol-keyed side table, materialized only when an animator first drives a
 *  slot on the target — pay-per-use, invisible to author reads. */
const LEDGER = Symbol("animatedAttributes");
function ledgerFor(target) {
    const t = target;
    return (t[LEDGER] ??= new Map());
}
/** The target's current numeric value for a slot (0 for a never-written or
 *  non-numeric slot) — read through the ordinary getter, off the tracking path
 *  (a tick never runs inside a constraint's compute), so it registers no dep. */
function numOf(target, attr) {
    const v = target[attr];
    return typeof v === "number" ? v : 0;
}
export class TweenRun {
    a;
    // ── Per-run state: set by start(), read by tick(), cleared by end(). All
    //    the driving inputs are SAMPLED at start (animation.md §1) so writing
    //    `to`/`duration`/… mid-run has no effect until a restart. ────────────
    live = false;
    runTarget = null;
    runAttr = "";
    /** The eased delta this run travels — measured against the ledger's expected
     *  value (LZX `this.to`), so an absolute `to` composes with everything in
     *  flight. Excludes the `from` snap (that rides `fromJump`). */
    runDelta = 0;
    /** The one-time `from` snap (from − slot's value at start), applied over the
     *  first frame; 0 when `from` is unset. Deferred to the first tick so a
     *  restart shows no jump at start() time. */
    fromJump = 0;
    /** How much this animator has contributed to the target so far — the sum of
     *  its written increments, `fromJump + ease(t)·runDelta`. The additive
     *  currentValue (LZX), one frame's increment being the delta of this. */
    traveled = 0;
    runDuration = 0;
    runMotion = DEFAULT_MOTION;
    cyclesLeft = 1;
    elapsed = 0; // accumulated ms in the current cycle (pause-aware)
    lastNow = null;
    constructor(a) {
        this.a = a;
    }
    /** `paused` is clock MEMBERSHIP, not a per-frame flag to poll: a paused
     *  animator produces no frames, so it must not hold the frame loop open —
     *  the idle-zero invariant (animate.ts) extends to "frozen counts as idle".
     *  Pause drops off the clock; resume re-seeds the anchor at NOW (elapsed
     *  cannot have advanced while unenrolled, so nothing jumps — the same
     *  re-anchor a scheduler handover uses) and re-enrolls. A grouped member
     *  keeps the old frozen-tick path instead: its group owns the clock and
     *  must keep ticking its OTHER members, so the member's own pause cannot
     *  withdraw the group's ticker. */
    paused(v) {
        if (!this.live || this.a.grouped)
            return;
        if (v) {
            sharedClock.remove(this.a);
        }
        else {
            this.lastNow = sharedClock.now();
            sharedClock.add(this.a);
        }
    }
    /** Re-seed the elapsed-time anchor at `now` — a group resuming from its own
     *  pause calls this down its members, whose anchors went stale while the
     *  group was off the clock (the unpause twin of rebase()). */
    reanchor(now) {
        if (this.live && this.lastNow !== null)
            this.lastNow = now;
    }
    /** Shift the anchor across a scheduler handover (Ticker.rebase). */
    rebase(delta) {
        if (this.lastNow !== null)
            this.lastNow += delta;
    }
    /** Begin driving the target slot through the curve (LZX's doStart). A no-op
     *  while already running (LZX's guard). Samples from / to / duration /
     *  motion / repeat ONCE here, and enrolls in the slot's exact-landing ledger
     *  (displacing the slot's prior non-animator driver on the first arrival). */
    start() {
        if (this.live)
            return;
        const a = this.a;
        const target = a.$resolveTarget();
        const attr = a.attribute;
        if (target === null || attr === "")
            return; // no target / unnamed slot: nothing to drive
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
        if (fresh)
            entry.expected = a.from !== null ? a.from : preStart;
        // The eased delta: `relative` travels `to` outright; an absolute `to`
        // travels to the author's value measured against the EXPECTED end
        // (LaszloAnimation.lzs:236–244) so a later `to` composes with what is
        // already in flight. `expected` then advances to the new running end.
        this.runDelta = a.relative ? a.to : a.to - entry.expected;
        entry.expected += this.runDelta;
        entry.count += 1;
        // The `from` snap, deferred to the first frame: from a slot not already at
        // `from`, the first increment jumps it there before easing begins.
        this.fromJump = a.from !== null ? a.from - preStart : 0;
        this.traveled = 0;
        this.runDuration = a.duration;
        this.runMotion = a.motion;
        this.cyclesLeft = a.repeat;
        // Declared perpetuity (Ticker.perpetual): `repeat = Infinity` is life —
        // it keeps painting without holding settleMotion open.
        a.perpetual = a.repeat === Infinity;
        this.elapsed = 0;
        // Seed the baseline NOW rather than on the first tick (the same enroll-time
        // rule the Spring adopted, spring.ts: "enrollment is the start of motion"):
        // a null seed spends the first frame recording a baseline, which under a
        // hand-cranked clock reads as "the animation never ran" — a full-duration
        // step() moved nothing (GitHub #17's Animator readout).
        this.lastNow = sharedClock.now();
        this.live = true;
        setBound(a, "running", true); // a new journey (the two facts, animator.ts)
        setBound(a, "arrived", false);
        // A start under `paused = true` arms without enrolling — frozen at `from`,
        // zero frames until the resume push re-anchors and enrolls (paused()).
        if (!a.grouped && !a.paused)
            sharedClock.add(a);
        a.$fire("onStart");
    }
    /** Halt in place — no snap to either end (LZX). Idempotent; a no-op when not
     *  running. Leaves the ledger (resuming the displaced driver when it was the
     *  last animator), without landing an end value (animation.md §2). */
    stop() {
        if (!this.live)
            return;
        if (!this.a.grouped)
            sharedClock.remove(this.a);
        this.releaseSlot(false); // halt in place — read runTarget before end() clears it
        this.end();
    }
    /** One clock frame (the Ticker contract): advance by real elapsed time,
     *  write the eased DELTA additively, handle repeat / completion. `frozen`
     *  (an enclosing group's pause) freezes progression while keeping `lastNow`
     *  fresh so nothing jumps on unpause. Returns whether still running (false
     *  drops it from the clock; a group reads it to retire a finished member). */
    tick(now, frozen) {
        if (!this.live)
            return false;
        if (this.lastNow === null)
            this.lastNow = now; // defensive: start() seeds it
        const dt = Math.max(now - this.lastNow, 0);
        this.lastNow = now;
        if (this.a.paused || frozen)
            return true; // frozen in place: hold elapsed, stay live
        this.elapsed += dt;
        // Consume completed cycles (a large dt may span several) — repeat replays
        // from→to; the last cycle finishes below.
        while (this.runDuration > 0 && this.elapsed >= this.runDuration && this.cyclesLeft > 1) {
            this.elapsed -= this.runDuration;
            this.cyclesLeft -= 1;
            this.a.$fire("onRepeat");
        }
        const t = this.runDuration > 0 ? Math.min(this.elapsed / this.runDuration, 1) : 1;
        if (t >= 1) {
            this.releaseSlot(true); // natural completion: land the full delta / exact expected
            setBound(this.a, "arrived", true); // arrived — BEFORE onStop, so its handler reads the landed truth
            this.end(); // resumes a displaced owner (when last) + fires onStop, which MAY restart us
            return this.live; // an onStop that called start() keeps the ticker alive; else false → dropped
        }
        // The additive write: this animator's cumulative contribution is
        // `fromJump + ease(t)·runDelta`; land the increment since last frame so it
        // composes with any other animator's contribution on the same slot.
        const contribution = this.fromJump + sample(this.runMotion, t, this.runDelta) * this.runDelta;
        addBound(this.runTarget, this.runAttr, contribution - this.traveled);
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
    releaseSlot(finalize) {
        const target = this.runTarget;
        if (target === null)
            return;
        const attr = this.runAttr;
        const ledger = ledgerFor(target);
        const entry = ledger.get(attr);
        if (entry === undefined)
            return;
        entry.count -= 1;
        if (finalize && entry.count > 0) {
            // Others still running: complete my own contribution to its full delta.
            addBound(target, attr, this.fromJump + this.runDelta - this.traveled);
            this.traveled = this.fromJump + this.runDelta;
        }
        if (entry.count <= 0) {
            const expected = entry.expected;
            ledger.delete(attr);
            if (finalize)
                setBound(target, attr, expected); // exact landing — assign the expected end outright
            entry.displaced?.resume(); // the displaced driver takes the slot back, re-evaluated
        }
        else if (!finalize) {
            // Halted in place: withdraw the delta I had not yet travelled so the
            // remaining animators' expected end value stays consistent.
            entry.expected -= this.fromJump + this.runDelta - this.traveled;
        }
    }
    /** Shared teardown for imperative stop AND natural completion (LZX has no
     *  finished-vs-stopped split): mark stopped, clear run state, fire onStop
     *  (which MAY restart us). The ledger cleanup + displaced resume already ran
     *  in releaseSlot; this only closes out the animator. */
    end() {
        this.live = false;
        setBound(this.a, "running", false);
        this.runTarget = null;
        this.a.$fire("onStop");
    }
}
//# sourceMappingURL=tween.js.map