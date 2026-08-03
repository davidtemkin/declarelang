// Heartbeat — the frame heartbeat as a component. A non-visual member that calls
// `onFrame(dt)` once per animation frame while it is running:
//
//     physics: Heartbeat [ onFrame(dt) { classroot.step(dt) } ],
//
// WHY IT EXISTS. Springs and Animators cover declarative motion — say where a
// thing belongs and the runtime finds the path. An app running its OWN
// integrator (a custom scroll/gesture physics engine, a simulation, a game
// loop) needs the raw heartbeat instead: a call per frame with the real elapsed
// time. That is the whole surface here.
//
// WHY A COMPONENT, not a `<-` subscription. An event is a function-typed member
// that gets called when the thing happens (the language's own ruling), and
// Declare already has the category for a member that is not a view: Dataset,
// Animator, State, and Spring are all non-visual node members. A source
// spelled as a component needs no new operator, no new grammar, and no
// subscribable-source table — and it tree-shakes out of a production build like
// any other component nobody instantiated.
//
// It rides the ONE shared clock (animate.ts), so a Heartbeat member costs exactly
// what an animator costs: nothing at all until it runs, and no second rAF loop.
// `dt` is seconds since the previous frame, clamped — a backgrounded tab
// resumes with a plausible step instead of one enormous jump that would launch
// any integrator into the weeds.
import { Node, onDiscard } from "./node.js";
import { sharedClock } from "./animate.js";
import { defineAttributes } from "./attributes.js";
/** The largest step handed to `onFrame`, in seconds. A tab that was hidden for
 *  a minute comes back with dt = 60, and any physics integrated against that
 *  explodes; ~4 frames at 60Hz is the standard clamp. */
const MAX_DT = 1 / 15;
export class Heartbeat extends Node {
    /** The previous frame's timestamp, or null before the first tick. */
    last = null;
    registered = false;
    constructor() {
        super();
        // Lifetime is the node's: a discarded Heartbeat leaves the clock, so a
        // torn-down subtree cannot keep a loop alive (the leak that a hand-written
        // rAF always risks).
        onDiscard(this, () => this.leave());
    }
    /** Sync clock membership with `running` — called at init and on every
     *  write to the slot (the attribute's pusher). */
    sync() {
        if (this.running)
            this.join();
        else
            this.leave();
    }
    join() {
        if (this.registered)
            return;
        this.registered = true;
        this.last = null; // the first frame after a resume yields no step
        sharedClock.add(this);
    }
    leave() {
        if (!this.registered)
            return;
        this.registered = false;
        sharedClock.remove(this);
        this.last = null;
    }
    /** Called once per frame by the shared clock. Returns whether to keep
     *  ticking (the clock's protocol). */
    tick(now) {
        if (!this.running)
            return false;
        const prev = this.last;
        this.last = now;
        // The first frame establishes the baseline; nothing has elapsed yet.
        if (prev === null)
            return true;
        const dt = Math.min((now - prev) / 1000, MAX_DT);
        const fn = this.onFrame;
        if (typeof fn === "function")
            fn.call(this, dt);
        return this.running;
    }
    /** Construction-complete (instantiate.ts fires this on animators; Heartbeat
     *  joins the same lifecycle) — start if `running` was left true. */
    autoStart() {
        this.sync();
    }
}
defineAttributes(Heartbeat, {
    running: {
        def: true,
        push: (f) => f.sync(),
    },
});
//# sourceMappingURL=heartbeat.js.map