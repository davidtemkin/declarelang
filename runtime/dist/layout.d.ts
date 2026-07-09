import { Node } from "./node.js";
import { View, type LayoutStrategy } from "./view.js";
/** The abstract strategy: lifecycle only (which view it arranges, install /
 *  undo bookkeeping). What "arranging" means is the subclass's `install`.
 *
 *  A Node — like Animator and Dataset, the other non-visual declarables (the
 *  ruled model: a declarable object is a Node, so hierarchy navigation from a
 *  layout's own code behaves as a developer expects). It is NOT a tree child,
 *  though: it lives in the view's typed `layout` slot, not in `children`, so a
 *  paint/hit walk never sees it (and layouts already filter children to
 *  `instanceof View`). `parent`/`view` both point at the arranged view — the
 *  slot pusher wires them on attach — so `this.view.width`, `this.view.children`,
 *  `this.parent…` up to the root, and lexically-resolved ids all work; only the
 *  layout's own (always-empty) `children` is vestigial. `this.view` is the
 *  typed accessor (parent narrowed to View) the arrangement reads. */
export declare abstract class Layout extends Node implements LayoutStrategy {
    /** The view whose children this strategy arranges; null when unattached.
     *  Kept in step with `parent` (a Node link for upward navigation); this is
     *  the View-typed handle the arrangement uses. */
    view: View | null;
    private undo;
    /** Begin arranging `view` (the View.layout pusher's entry). One strategy
     *  arranges one view: a strategy is written per element, and sharing one
     *  across views would make its reactive attributes action-at-a-distance. */
    attachTo(view: View): () => void;
    /** Re-run install — the entry for a *structural* attribute change (axis),
     *  where the constraints' target slots themselves change. Value-level
     *  attributes (spacing) never need this: constraints read them under
     *  tracking and re-run through the ordinary machinery. */
    rearm(): void;
    /** Stand up this strategy's constraints over `view`'s children (present at
     *  install — layouts react to geometry; tree mutation is R8's) and return
     *  the exact undo. Must be transactional: on a mid-install error, nothing
     *  stays owned. */
    protected abstract install(view: View): () => void;
}
/** SimpleLayout — the stacking idiom (LZX's simplelayout, rewritten): siblings
 *  stacked along `axis` in child order, `spacing` apart (negative overlaps,
 *  per the weather app's `spacing = -10`), invisible children skipped. The
 *  cross axis is untouched, and so are the children's sizes — sizes are
 *  inputs here (a Text auto-sizing or an Image's bitmap arriving re-flows the
 *  stack through the ordinary dependency wake). */
export declare class SimpleLayout extends Layout {
    axis: "x" | "y";
    spacing: number;
    protected install(view: View): () => void;
}
/** WrappingLayout — a horizontal flow that WRAPS: children run left-to-right
 *  `spacing` apart, and when the next child would overflow the view's width it
 *  drops to a new row (`lineSpacing` down, default = `spacing`). With room for
 *  one row it is identical to `SimpleLayout[axis=x]`; as the view narrows it
 *  stacks — the whole point (cards that reflow on a phone with no media query).
 *  It owns BOTH axes of each child (a flow is 2-D), each child's position a pure
 *  function of the view's width and the predecessors' sizes, so a resize or a
 *  child growing re-flows through the ordinary reactive wake. */
export declare class WrappingLayout extends Layout {
    spacing: number;
    /** Row-to-row gap; the sentinel −1 means "same as `spacing`" (the common case). */
    lineSpacing: number;
    /** The placed position of every child, computed in one left-to-right pass —
     *  the shared read the per-child x/y constraints call (reads the view width,
     *  spacings, and each child's size/visibility, so all are tracked deps). */
    private positions;
    protected install(view: View): () => void;
}
/** The geometry a TweenLayout places one child in: its box plus a visibility
 *  flag (the reveal rule reads it). `w`/`h` name the sizes so a box is a plain
 *  record, distinct from the child's live `width`/`height` slots the layout
 *  writes. */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
    vis: boolean;
}
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
    from: readonly Box[];
    to: readonly Box[];
    /** Slide duration in ms (SPEC's 500 for the calendar); the snap path ignores it. */
    duration: number;
    /** The single animator that drives `t`. A Node child of the layout, so it
     *  targets the layout itself (Animator.resolveTarget walks parent); created
     *  lazily on first install and reused across re-arms. */
    private tween;
    /** Pure geometry: one Box per laid child, from the layout's own state (its
     *  attributes) and `this.view`'s box. No time, no side effects — the tween
     *  is the interpolation between two calls of this. */
    protected abstract place(): Box[];
    /** The laid children: this.view's View children, honoring an `ignorelayout`
     *  opt-out (LZX's rule — a decoration/overlay child sits outside layout).
     *  Non-View members (a Dataset) and the tween animator (a child of the
     *  LAYOUT, not the view) are never in this set. */
    protected laid(): View[];
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
