// animator-group — AnimatorGroup, in its own module: a program that never
// groups its animators carries none of the coordination (the `animator-group`
// capability, compiler/src/capabilities.ts).
import { Node } from "./node.js";
import { sharedClock, DEFAULT_MOTION } from "./animate.js";
import { defineAttributes, disposeBindings, setBound } from "./attributes.js";
import { Animator } from "./animator.js";
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
export class AnimatorGroup extends Node {
    live = false;
    /** The members still to finish this run, in tree order — LZX's `actAnim`. */
    active = [];
    cyclesLeft = 1;
    grouped = false;
    autoStarted = false;
    markGrouped() {
        this.grouped = true;
    }
    /** This group's members (child Animators / AnimatorGroups), in tree order. */
    members() {
        return this.children.filter(isAnimatable);
    }
    autoStart() {
        if (this.autoStarted || this.grouped)
            return; // an enclosing group drives us
        this.autoStarted = true;
        if (this.started)
            this.start();
    }
    /** The group's own `started`, reactive exactly as an Animator's (see
     *  Animator.startedChanged) — the group is the driver, so a change here
     *  starts or stops the whole group, members included. */
    startedChanged(v) {
        if (!this.autoStarted || this.grouped)
            return;
        if (v)
            this.start();
        else
            this.stop();
    }
    /** The group's own pause is clock membership too (see Animator.pausedChanged):
     *  off the clock while paused — members freeze because nothing ticks them —
     *  and on resume every running member's anchor is re-seeded at NOW before the
     *  group re-enrolls, so no member measures the pause as elapsed time. */
    pausedChanged(v) {
        if (!this.live || this.grouped)
            return;
        if (v) {
            sharedClock.remove(this);
        }
        else {
            this.reanchor(sharedClock.now());
            sharedClock.add(this);
        }
    }
    /** Cascade the unpause re-anchor down (Animator.reanchor). */
    reanchor(now) {
        for (const m of this.active) {
            m.reanchor?.(now);
        }
    }
    /** Begin the group (LZX doStart): snapshot the members to run this cycle and
     *  register the one group ticker (unless the group is itself group-driven).
     *  Members are NOT started here — each is started lazily when it first
     *  becomes active (so a sequential member samples its `from` only once the
     *  members before it have moved the slot). */
    start() {
        if (this.live)
            return;
        this.live = true;
        setBound(this, "running", true);
        setBound(this, "arrived", false);
        this.cyclesLeft = this.repeat;
        this.active = this.members();
        // Armed-but-frozen under `paused = true`, exactly as an Animator's start
        // (pausedChanged enrolls on resume).
        if (!this.grouped && !this.paused)
            sharedClock.add(this);
        this.fire("onStart");
    }
    /** Stop the group (LZX stop): halt every still-running member in place, drop
     *  the group ticker, fire onStop. Idempotent. */
    stop() {
        if (!this.live)
            return;
        if (!this.grouped)
            sharedClock.remove(this);
        for (const m of this.active)
            if (m.running)
                m.stop();
        this.endGroup();
    }
    /** Retire with the host view: drop the group ticker + own bindings, then
     *  recurse so each member animator disposes its own bindings too. */
    teardown() {
        disposeBindings(this);
        this.stop();
        super.teardown();
    }
    /** One group frame: drive the active members with the shared `now`, retire
     *  the finished, replay or finish when all are done. `sequential` advances
     *  only the head member per frame; `simultaneous` advances all. A `frozen`
     *  group (its own pause, or an enclosing group's) keeps running members'
     *  clocks fresh but neither starts pending members nor advances progression. */
    rebase(delta) {
        // The group is the enrolled ticker; the anchors live in its members.
        for (const m of this.active)
            m.rebase?.(delta);
    }
    tick(now, frozen = false) {
        if (!this.live)
            return false;
        const freeze = frozen || this.paused;
        if (freeze) {
            for (const m of this.active)
                if (m.running)
                    m.tick(now, true);
            return true;
        }
        if (this.process === "sequential") {
            const head = this.active[0];
            if (head !== undefined) {
                if (!head.running)
                    head.start(); // lazy start — samples `from` now
                if (!head.tick(now))
                    this.active.shift();
            }
        }
        else {
            let i = 0;
            while (i < this.active.length) {
                const m = this.active[i];
                if (!m.running)
                    m.start();
                if (m.tick(now))
                    i += 1;
                else
                    this.active.splice(i, 1);
            }
        }
        if (this.active.length === 0)
            return this.cycleComplete();
        return true;
    }
    /** All members done: replay the whole group (repeat) or finish it. */
    cycleComplete() {
        if (this.cyclesLeft > 1) {
            this.cyclesLeft -= 1;
            this.fire("onRepeat");
            this.active = this.members();
            return true;
        }
        this.endGroup();
        return this.live; // an onStop that restarted the group keeps the ticker alive
    }
    endGroup() {
        this.live = false;
        setBound(this, "running", false);
        this.active = [];
        this.fire("onStop");
    }
    fire(handler) {
        const h = this[handler];
        if (typeof h === "function")
            h.call(this);
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
    started: { def: false, push: (s, v) => s.startedChanged(v) },
    paused: { def: false, push: (s, v) => s.pausedChanged(v) },
    running: { def: false },
    arrived: { def: false },
});
/** Is this node an animation member a group can drive — an Animator or a nested
 *  AnimatorGroup? (The runtime twin of `descendsFrom(schema, "AnimatorGroup")`.) */
function isAnimatable(n) {
    return n instanceof Animator || n instanceof AnimatorGroup;
}
//# sourceMappingURL=animator-group.js.map