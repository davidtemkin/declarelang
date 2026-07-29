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
export declare function leafAt(v: InteractionView, lx: number, ly: number, pierce?: boolean): InteractionView | null;
/** The view under a ROOT-SPACE point — the public hit test (view.ts wraps it
 *  as `app.viewAt(x, y)`), answering with the same walk the pointer itself is
 *  routed by: clip shapes, scale and pivot, `pointerEvents: "none"`, and
 *  `ignoreClip` all count exactly as they do for a real press. Returns the
 *  deepest (topmost) view; walk `.parent` for an eligible ancestor. */
export declare function hitAt(root: unknown, x: number, y: number, pierce?: boolean): InteractionView | null;
/** Does `view`'s own box contain this point, given in ROOT space? Geometry
 *  only — occlusion is `hitAt`'s question — so a view can ask "is the pointer
 *  within me" without a tree walk. */
export declare function boxContains(view: InteractionView, x: number, y: number): boolean;
/** The tracked read behind `View.hovered`. */
export declare function readHovered(view: InteractionView): boolean;
/** The tracked read behind `View.pressed`. */
export declare function readPressed(view: InteractionView): boolean;
