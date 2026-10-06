// tween-layout — the animated-reflow layout base, in its own module: it is the
// one layout that drives an Animator (the tween on `t`), so a program that
// never extends it carries neither it nor the timed run (the `tween-layout`
// capability, compiler/src/capabilities.ts).
import { Constraint } from "./reactive.js";
import { defineAttributes, own, ownerOf, release, setBound } from "./attributes.js";
import { DeclareError, layoutConflictMessage } from "./errors.js";
import { Animator } from "./animator.js";
import { motionToken } from "./easing.js";
import { Layout } from "./layout.js";
/** TweenLayout — the animated-reflow engine (the calendar's gridslider idiom,
 *  generalized and shed of its Flash-era scaffolding). The layout owns every
 *  laid child's x/y/width/height/visible and glides them between two WHOLE
 *  layouts through a single animated scalar `t`:
 *
 *    child[i].x = from[i].x + (to[i].x − from[i].x) · t      (and y/w/h)
 *
 *  so one write to `t` — the built-in animator's, or a direct snap — wakes
 *  exactly the laid children and repositions the entire grid in one settle
 *  (168 per-cell animators in the original collapse to ONE on `t`). The
 *  geometry is stated once: a subclass supplies `place()` (pure — state → one
 *  Box per child), and the tween is literally the interpolation between two
 *  evaluations of it. `retarget(animate)` is the whole imperative surface (the
 *  provenance a constraint can't see — snap vs slide): it snapshots the
 *  children's CURRENT boxes as `from` (interruption-correct, like Core
 *  Animation's presentation layer), computes `to = place()`, then snaps (t←1)
 *  or eases (t:0→1). Even the reveal rule — a child entering the visible set
 *  holds hidden until the motion lands — is a function of t
 *  (`from.vis || (to.vis && t≥1)`), so it is a constraint, not the original's
 *  hardcoded 600ms timer. */
export class TweenLayout extends Layout {
    /** The single animator that drives `t`. A Node child of the layout, so it
     *  targets the layout itself (Animator.resolveTarget walks parent); created
     *  lazily on first install and reused across re-arms. */
    tween = null;
    /** Stand up one lerp constraint per laid child per geometry slot (owning it,
     *  the one-owner model), snapshot the initial layout, and evaluate. Re-run
     *  wholesale by rearm when the child set changes (R8). */
    $install(_view) {
        if (this.tween === null) {
            const a = new Animator();
            a.attribute = "t";
            a.to = 1;
            a.motion = motionToken("laszloBoth");
            this.$appendChild(a); // parent = this layout → the animator targets `t` on it
            this.tween = a;
        }
        const kids = this.laid();
        const arranger = `${this.view?.constructor.name ?? "?"}'s ${this.constructor.name}`;
        const owned = [];
        // This strategy claims all four geometry slots plus visibility on every
        // laid child, unconditionally — the one arrangement in which a child
        // cannot keep its own size and stay placed — so an author binding on any
        // of them is a refusal, and the sentence has to SAY all of that. It called
        // own() bare until 2026-09-19 and got the generic `View.width is already
        // bound (by Grid[0].width)`: no layout named, no position, and no
        // `ignoreLayout` offered, which is exactly the message that most needed to
        // offer it. (A throw, not the base's contained report: this install owns
        // every slot as a unit — `from`/`to` are per-child FullBoxes — so there is
        // no coherent half-arrangement to fall back to.)
        const refuseIfOwned = (child, slot) => {
            const prior = ownerOf(child, slot);
            if (prior !== null && !prior.yielding) {
                throw new DeclareError(layoutConflictMessage(child.constructor.name, slot, arranger, null, prior.sourcePos));
            }
        };
        const SLOTS = [
            ["x", "x"],
            ["y", "y"],
            ["width", "w"],
            ["height", "h"],
        ];
        const detach = () => {
            this.tween?.stop();
            for (const o of owned) {
                release(o.child, o.slot, o.k);
                o.k.dispose();
            }
        };
        try {
            kids.forEach((child, idx) => {
                for (const [slot, key] of SLOTS) {
                    const k = new Constraint(`${this.constructor.name}[${idx}].${slot}`, () => {
                        const f = this.from[idx];
                        const g = this.to[idx];
                        if (f === undefined || g === undefined)
                            return 0;
                        const a = f[key];
                        const b = g[key];
                        return a + (b - a) * this.t;
                    }, (v) => setBound(child, slot, v));
                    // The claim carries its arranger like every kernel claim, so a
                    // conflict on it gets the layout↔author sentence — which names the
                    // strategy and offers `ignoreLayout` — instead of the generic
                    // "already bound (by Grid[0].width)", which named neither. This is
                    // the one strategy that claims all four geometry slots on every
                    // child, so it is the one whose message most needs to say so.
                    k.arrangedBy = arranger;
                    refuseIfOwned(child, slot);
                    this.$reportDiscarded(child, slot, arranger);
                    own(child, slot, k);
                    owned.push({ child, slot, k });
                }
                const kv = new Constraint(`${this.constructor.name}[${idx}].visible`, () => {
                    const f = this.from[idx];
                    const g = this.to[idx];
                    // During the slide (t<1) show whoever was visible in `from` — a
                    // LEAVING cell stays on screen while it shrinks; an ARRIVING cell
                    // (hidden in `from`) is held out. At the end (t≥1) `to` governs, so
                    // arrivers appear and leavers vanish. A pure function of t — the
                    // original's 600ms reveal timer, made declarative.
                    if (f === undefined || g === undefined)
                        return true;
                    return this.t < 1 ? f.vis : g.vis;
                }, (v) => setBound(child, "visible", v));
                kv.arrangedBy = arranger;
                refuseIfOwned(child, "visible");
                this.$reportDiscarded(child, "visible", arranger);
                own(child, "visible", kv);
                owned.push({ child, slot: "visible", k: kv });
            });
        }
        catch (e) {
            for (const o of owned) {
                release(o.child, o.slot, o.k);
                o.k.dispose();
            }
            throw e; // transactional: a mid-install conflict leaves nothing owned
        }
        // Snapshot the current layout for these children, then evaluate the freshly
        // owned constraints against it (they subscribe to from/to/t on first run).
        this.retarget(false);
        for (const o of owned)
            o.k.run();
        return detach;
    }
    /** Snap or slide the laid children to the CURRENT target layout. `from` is
     *  the children's live boxes (so a re-trigger mid-slide glides from wherever
     *  they are); `to` is place(). animate ? ease t:0→1 : jam t←1. The one
     *  imperative entry — the app calls it after setting the layout's state on a
     *  geometry-affecting change the constraints can't infer (mode, focus). */
    retarget(animate) {
        const kids = this.laid();
        this.from = kids.map((c) => ({ x: c.x, y: c.y, w: c.width, h: c.height, vis: c.visible }));
        this.to = this.place();
        if (animate && this.tween !== null) {
            this.t = 0; // constraints settle children at `from` (= current) — no flash
            this.tween.duration = this.duration;
            this.tween.stop();
            this.tween.start(); // eases t 0→1; each frame wakes the geometry constraints
        }
        else {
            this.t = 1; // the `to` write above already woke the readers; this lands them there
        }
    }
}
defineAttributes(TweenLayout, {
    t: { def: 1 },
    from: { def: [] },
    to: { def: [] },
    duration: { def: 500 },
});
//# sourceMappingURL=tween-layout.js.map