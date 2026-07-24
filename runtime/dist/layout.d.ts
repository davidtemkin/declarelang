import { Node } from "./node.js";
import { Constraint } from "./reactive.js";
import { View, type LayoutStrategy } from "./view.js";
/** The geometry a layout places one child in: any subset of position, size,
 *  and visibility. `w`/`h` name the sizes so a box is a plain record, distinct
 *  from the child's live `width`/`height` slots the layout writes. A strategy
 *  OWNS exactly the slots its boxes carry (uniform across children, probed at
 *  install): a box without `h` leaves heights to the children; `vis: false`
 *  hides — the zero-size-is-hidden idiom made explicit. */
export interface Box {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    vis?: boolean;
}
/** A Box with every slot present — what TweenLayout interpolates (its lerp
 *  needs both endpoints of all four geometry slots plus visibility). */
export type FullBox = Required<Box>;
/** The abstract strategy. A layout is its `place()` — pure geometry, one Box
 *  per laid child — and the base turns that into STANDING constraints over the
 *  children's own slots (install below). `laid()` is the one definition of
 *  which children a layout manages. A subclass overrides `place()` to define an
 *  arrangement; it MAY also override `install()` when it can wire the same
 *  semantics more precisely (SimpleLayout's chained per-child constraints) or
 *  differently in time (TweenLayout's interpolated write path).
 *
 *  A Node — like Animator and Dataset, the other non-visual declarables (the
 *  ruled model: a declarable object is a Node, so hierarchy navigation from a
 *  layout's own code behaves as a developer expects). It is NOT a tree child,
 *  though: it lives in the view's typed `layout` slot, not in `children`, so a
 *  paint/hit walk never sees it. `parent`/`view` both point at the arranged
 *  view — the slot pusher wires them on attach — so `this.view.width`,
 *  `this.view.children`, `this.parent…` up to the root, and lexically-resolved
 *  ids all work; only the layout's own (always-empty) `children` is vestigial.
 *  `this.view` is the typed accessor (parent narrowed to View) the arrangement
 *  reads. */
export declare abstract class Layout extends Node implements LayoutStrategy {
    /** The view whose children this strategy arranges; null when unattached.
     *  Kept in step with `parent` (a Node link for upward navigation); this is
     *  the View-typed handle the arrangement uses. */
    view: View | null;
    private undo;
    /** Each claimed (child, slot)'s AUTHORED BASE value, captured at first claim
     *  and kept across rearm. When a strategy vacates a slot (an axis flip, a
     *  layout swap) the slot reverts to this base — the authored cross-axis
     *  literal (`y = 15`) or the class default — instead of stranding whatever
     *  the arrangement last wrote (release() leaves the stored value; the
     *  restore is ours to make). */
    private readonly bases;
    /** Begin arranging `view` (the View.layout pusher's entry). One strategy
     *  arranges one view: a strategy is written per element, and sharing one
     *  across views would make its reactive attributes action-at-a-distance.
     *
     *  Alongside install, a SHAPE WATCHER stands guard: the set of slots a
     *  strategy manages can itself depend on its inputs (a ResponsiveLayout
     *  tier flip swaps row→stack and shares appear/disappear), and the
     *  installed claims were probed from one shape. The watcher re-derives the
     *  shape signature under tracking and REARMS on change — a rearm restores
     *  vacated slots to their authored bases (see `rearming`) and re-probes.
     *  It lives OUTSIDE the install/undo cycle (rearm must not dispose its own
     *  trigger) and is disposed only on detach. */
    attachTo(view: View): () => void;
    /** True while rearm() swaps installs — unclaim restores authored bases only
     *  then. A full detach (layout = null, a strategy swap) keeps the last
     *  arranged values instead (the documented release semantics: the slot
     *  reverts to a plain stored value); a rearm within ONE strategy (an axis
     *  flip, a plan regime change) must not strand the old arrangement's
     *  offsets on slots the new install no longer drives. */
    private rearming;
    /** Re-run install — the entry for a *structural* attribute change (axis),
     *  where the constraints' target slots themselves change. Value-level
     *  attributes (spacing) never need this: constraints read them under
     *  tracking and re-run through the ordinary machinery. */
    rearm(): void;
    /** The children this strategy arranges: the view's View children, honoring
     *  the `ignorelayout` opt-out (LZX's rule — a decoration/overlay child owns
     *  its own position, both axes). Non-View members (a Dataset, an Animator, a
     *  State) are never laid. In child order — order is the layout semantics —
     *  and `place()`'s boxes align with this array BY INDEX. */
    protected laid(): View[];
    /** Pure geometry — one Box per laid child, from this strategy's own
     *  attributes and `this.view`'s box. No time, no side effects. THE seam: a
     *  strategy IS its place(); everything else is shared machinery. The boxes'
     *  shape declares ownership — carry exactly the slots this strategy manages
     *  (uniform across children; a box without `h` leaves heights alone). */
    protected abstract place(): Box[];
    /** Claim `slot` on `child` for constraint `k`: capture the authored base
     *  (first claim only — rearm must not capture the arrangement's own writes),
     *  then take ownership. Errors loudly on a standing author binding (two
     *  owners), naming both sides. */
    protected claim(child: View, slot: string, k: Constraint, label: string): void;
    /** Release `k`'s claim of `slot` on `child`; during a rearm, restore the
     *  authored base (see `rearming` — a full detach keeps the last values).
     *  Does NOT dispose `k` — one constraint may back many slots (the pass), so
     *  disposal is the detacher's, once per distinct constraint. */
    protected unclaim(child: View, slot: string, k: Constraint): void;
    /** The label claims and conflict errors carry. A strategy with an `axis`
     *  attribute gets it tagged on ("App's SimpleLayout[y]") — sharp diagnostics
     *  for any axis-bearing strategy, library or native. */
    protected label(): string;
    /** Stand up standing constraints over `view`'s children from `place()` —
     *  the ONE kernel wiring every strategy shares. Each child's own probe box
     *  declares its managed slots (shape may vary per child: a Spacer carries
     *  its flexed size, a plan-shared child its width, a plain sibling only its
     *  position). POSITIONS and VISIBILITY ride one shared pass-constraint —
     *  compute place() once per wave, fan out equality-gated writes (the
     *  kernel-only one-engine-many-slots shape the header describes). SIZES get
     *  a percent-family constraint per (child, slot) — markPercent — because a
     *  kernel-driven size is parent-extent-derived by nature and must sit out
     *  of auto-extent's max (the cycle guard percent Lengths ride); positions
     *  stay unmarked so containers keep auto-extending around laid children.
     *  Transactional: on a mid-install error nothing stays owned. Children are
     *  read at install (tree mutation is R8's rearm). TweenLayout overrides
     *  this with its interpolating write path over the same place(). */
    protected install(_view: View): () => void;
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
    protected abstract place(): FullBox[];
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
