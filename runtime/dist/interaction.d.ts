/** The geometry surface the chain walk reads — structurally, any View. */
export interface InteractionView {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    pivotX: number;
    pivotY: number;
    /** Painted rotation in degrees, clockwise, about the same pivot — the
     *  fourth transform term (Part II); the walk inverts it like scale. */
    rotation: number;
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
/** The COMPOSED view→root-frame transform — every level's scale-then-rotate
 *  about its pivot (F(p) = pivot + s·R(rot)(p − pivot), the forward of
 *  toChildLocal's terms 3–4), translate, and scroll subtraction folded into
 *  ONE similarity {scale, rotation, tx, ty}: a point p in `view`'s frame
 *  space lands at (tx, ty) + scale·R(rotation)(p). Omitting the transform
 *  terms was the scale-blind twin of the scroll-blind-walk bug: a view under
 *  scaled ancestors reported the Σ(local x) position while paint and the hit
 *  walk agreed on the composed one (field report 2026-08-13, repro B: 320 vs
 *  the real 250).
 *
 *  `stopAt` (exclusive) bounds the walk for CONTENT-space geometry — the
 *  focus ring's travel home stops at its scroller, before that scroller's own
 *  translate and (deliberately unread) scroll offset. */
export declare function rootTransform(view: InteractionView, stopAt?: InteractionView | null): {
    scale: number;
    rotation: number;
    tx: number;
    ty: number;
};
/** A view's origin in the ROOT'S FRAME space (viewport coordinates for a
 *  top-level app) — the composed transform of (0, 0). Shared for the same
 *  reason the walk is: the Inspector's highlight accumulated x/y by hand and
 *  was blind to every scroll regime. */
export declare function rootFrameOrigin(view: InteractionView): {
    x: number;
    y: number;
};
/** The root-frame AXIS-ALIGNED BOX of a local rect (default the view's whole
 *  frame, [0,width]×[0,height]) — the four corners through the composed
 *  transform, min/maxed. What every overlay that DRAWS a box must use: an
 *  origin from the walk paired with the LOCAL width/height boxes a scaled
 *  view at its unscaled size (the Inspector-highlight/tooltip/focus-ring
 *  defect this replaced, 2026-08-13). `stopAt` as in rootTransform. */
export declare function rootFrameBox(view: InteractionView, rect?: {
    x: number;
    y: number;
    w: number;
    h: number;
}, stopAt?: InteractionView | null): {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
};
/** The tracked read behind `View.hovered`. */
export declare function readHovered(view: InteractionView): boolean;
/** The tracked read behind `View.pressed`. */
export declare function readPressed(view: InteractionView): boolean;
