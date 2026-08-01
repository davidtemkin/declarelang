/** The geometry surface the chain walk reads — structurally, any View. */
export interface InteractionView {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    pivotX: number;
    pivotY: number;
    clip: string | boolean | null;
    visible: boolean;
    pointerEvents: string;
    ignoreClip: boolean;
    /** The scroll regime facts (view.ts): which axes this view scrolls, its
     *  live offsets, and whether it opts out of its parent's regime. The
     *  transform below is incomplete without them — a scrolled parent's content
     *  is translated by the platform, and that translation is as much a part of
     *  the view→child transform as `x`/`y` and `scale` are. */
    scrolls: string;
    scrollX: number;
    scrollY: number;
    ignoreScroll: boolean;
    parent: unknown;
    root: unknown;
    children: readonly unknown[];
}
/** The app surface the driver reads. */
export interface InteractionApp extends InteractionView {
    pointerX: number;
    pointerY: number;
    pointerDown: boolean;
    hovering: boolean;
}
/** One decision the hit walk made, for `traceHitAt` below. Carries the VIEW
 *  rather than a name: this module is deliberately view-free (structural
 *  typing, no import of view.ts), so naming is the caller's job — inspect.ts
 *  maps each to its path. */
export interface HitNote {
    view: InteractionView;
    why: string;
    /** the point in that view's own coordinates, which is usually the tell */
    x: number;
    y: number;
}
/** Narrate the hit walk at a root-FRAME point: what it descended into, what it
 *  skipped and why, and what finally took the point (or that nothing did).
 *
 *  The narration comes from instrumenting THE walk, never from a second one
 *  that re-derives the rules — a duplicate diagnostic that disagrees with the
 *  real router is worse than none, and duplicated hit logic is precisely what
 *  produced the desktop's mis-hit corner and the Inspector's blind highlight.
 *  Costs nothing when unused: the collector is optional and the notes are only
 *  built when one is passed. */
export declare function traceHitAt(root: unknown, x: number, y: number, pierce?: boolean): {
    hit: InteractionView | null;
    notes: HitNote[];
};
/** view.ts calls this once at module init — the injected instance test. */
export declare function initInteraction(test: (n: unknown) => n is InteractionView): void;
/** The topmost visible view whose box contains the point — reverse paint
 *  order, descending through containers; overflow children are reachable
 *  outside their parent's box unless the parent clips. All attribute reads
 *  here run inside the driver's tracked compute — they ARE the dependencies.
 *
 *  THE ONE WALK. Exported because it is also the language's own hit test
 *  (View.viewAt / View.containsPoint, view.ts): what an app computes about
 *  "what is under this point" and what the runtime computes for `hovered` must
 *  be the same answer, from the same code. (Three hand-rolled versions of this
 *  question — the inspector's picker, a calendar's cell math, a window's resize
 *  zones — is how the desktop's corner bug happened.) */
export declare function leafAt(v: InteractionView, lx: number, ly: number, pierce?: boolean, trace?: HitNote[]): InteractionView | null;
/** The view under a point in the root's FRAME space (viewport coordinates for
 *  a top-level app) — the walk's own space. view.ts wraps it as
 *  `app.viewAt(x, y)` with the CONTENT-space contract the language documents
 *  (root-space, pairing with drag coordinates), converting at that boundary;
 *  the Inspector's picker calls it directly (its overlay is viewport-fixed).
 *  Same walk the pointer is routed by: clip shapes, scale and pivot,
 *  `pointerEvents: "none"`, `ignoreClip`, and every scroll regime count
 *  exactly as they do for a real press. Returns the deepest (topmost) view;
 *  walk `.parent` for an eligible ancestor. */
export declare function hitAt(root: unknown, x: number, y: number, pierce?: boolean): InteractionView | null;
/** Does `view`'s own box contain this point, given in the root's CONTENT
 *  space (the language's root-space — what drag events carry)? Geometry only —
 *  occlusion is `hitAt`'s question — so a view can ask "is the pointer within
 *  me" without a tree walk. */
export declare function boxContains(view: InteractionView, x: number, y: number): boolean;
/** A view's origin in the ROOT'S FRAME space (viewport coordinates for a
 *  top-level app) — the inverse of the descent the walk makes, minus scale
 *  (callers so far box overlays that don't scale; the term joins when one
 *  does). Shared for the same reason the walk is: the Inspector's highlight
 *  accumulated x/y by hand and was blind to every scroll regime. */
export declare function rootFrameOrigin(view: InteractionView): {
    x: number;
    y: number;
};
/** The tracked read behind `View.hovered`. */
export declare function readHovered(view: InteractionView): boolean;
/** The tracked read behind `View.pressed`. */
export declare function readPressed(view: InteractionView): boolean;
