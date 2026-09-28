import type { View } from "./view.js";
import { Layout, type FullBox } from "./layout.js";
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
export declare abstract class TweenLayout extends Layout {
    /** The tween parameter, 0→1. The one slot an animator drives; the per-child
     *  geometry constraints read it, so driving it moves the whole grid. */
    t: number;
    /** The children's boxes at the start of the current transition (the live
     *  snapshot retarget takes) and the target boxes place() yields. Reactive so
     *  a snap (t already 1) still repositions: writing `to` wakes the readers. */
    from: readonly FullBox[];
    to: readonly FullBox[];
    /** Slide duration in ms (SPEC's 500 for the calendar); the snap path ignores it. */
    duration: number;
    /** The single animator that drives `t`. A Node child of the layout, so it
     *  targets the layout itself (Animator.resolveTarget walks parent); created
     *  lazily on first install and reused across re-arms. */
    private tween;
    /** Pure geometry: one FULL Box per laid child (the lerp needs both
     *  endpoints of all four geometry slots plus visibility), from the layout's
     *  own state (its attributes) and `this.view`'s box. No time, no side
     *  effects — the tween is the interpolation between two calls of this.
     *  (laid() is the base's — the one definition of the managed children.) */
    abstract place(): FullBox[];
    /** Stand up one lerp constraint per laid child per geometry slot (owning it,
     *  the one-owner model), snapshot the initial layout, and evaluate. Re-run
     *  wholesale by rearm when the child set changes (R8). */
    protected install(_view: View): () => void;
    /** Snap or slide the laid children to the CURRENT target layout. `from` is
     *  the children's live boxes (so a re-trigger mid-slide glides from wherever
     *  they are); `to` is place(). animate ? ease t:0→1 : jam t←1. The one
     *  imperative entry — the app calls it after setting the layout's state on a
     *  geometry-affecting change the constraints can't infer (mode, focus). */
    retarget(animate: boolean): void;
}
