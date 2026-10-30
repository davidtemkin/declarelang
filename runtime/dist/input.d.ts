import type { InputSink } from "./backend.js";
/** Is a hold-gated drag capture live right now? (Backends consult this in
 *  their non-passive touchmove listeners.) */
export declare const holdCaptureActive: () => boolean;
/** Is a finger held whole by the program's drag right now? */
export declare const fingerHeldByDrag: () => boolean;
/** A resolved input point: the sink of the view under it, that view's
 *  identity (`key`, for the click pairing — any stable per-view object),
 *  and the point in the view's local space. */
export interface HitTarget {
    key: object;
    sink: InputSink;
    x: number;
    y: number;
    /** The view's `cursor` attribute, when set — the canvas backend resolves it
     *  on the hover walk (its host is one element; the DOM brushes per-element
     *  style.cursor instead and leaves this unset). */
    cursor?: string;
    /** True when this view declares `onDblClick` — the second click of a pair
     *  then reaches it as `dblClick` alone, not as a second `click` too. The
     *  first click is delivered at once, as the platforms do: the view's single
     *  click is something its double builds on. (Resolution knows this because a
     *  sink's existence and its declared handlers are the same fact — view.ts
     *  inputSink.) */
    wantsDbl?: boolean;
    /** True when this view declares `onHold`. */
    wantsHold?: boolean;
    /** True when this view (or an ancestor) declares the raw touch family — the
     *  gesture belongs to the app, so the router delivers the whole multi-finger
     *  stream and never interprets it. */
    wantsTouch?: boolean;
    /** True when this view declares `onPointerMove` — its claim on the
     *  single-finger drag (realized by the backend, not the router). */
    wantsDrag?: boolean;
    /** True when this view declares `onWheel` — its claim on the wheel stream
     *  (delivered by the backend directly; wheels never enter this router). */
    wantsWheel?: boolean;
    /** True when this view declares `onContextMenu` — the platform context
     *  gesture is delivered and the browser's own menu suppressed, exactly
     *  there (D8's ContextMenu brief). */
    wantsContext?: boolean;
    /** The nearest PINCH OWNER over this point — the closest view (self
     *  included) up the hit chain declaring the onPinch family — resolved by
     *  the backend because the claim covers a SUBTREE: two fingers may land on
     *  different interactive children of one pinching view, and the gesture
     *  belongs to the ancestor that declared it. Absent = nothing over this
     *  point pinches. */
    pinch?: {
        key: object;
        sink: InputSink;
    };
    /** The nearest HOLD OWNER over this point — the closest view (self
     *  included) up the hit chain declaring `onHold`. Each gesture goes to the
     *  nearest view that wants it, as pinch does: a child that takes the click
     *  does not take the long-press, so a hold anywhere on a message bubble —
     *  its photo, its label — reaches the bubble. Absent = nothing holds here. */
    hold?: {
        key: object;
        sink: InputSink;
    };
    /** The nearest CONTEXT-MENU OWNER (onContextMenu), resolved the same way. */
    context?: {
        key: object;
        sink: InputSink;
    };
    /** The nearest DRAG OWNER (onPointerMove), resolved the same way, with the
     *  axis it claims and whether it claims from a hold (it declares onHold too).
     *  A press that stays put is the pressed view's; once it travels it is this
     *  owner's, when the owner is not the pressed view itself (DRAG HANDOFF). */
    drag?: {
        key: object;
        sink: InputSink;
        axis: "both" | "x" | "y";
        fromHold: boolean;
    };
}
/** One finger, as the raw touch family reports it. `id` is stable for the
 *  life of that finger's contact, so an engine can track it across events. */
export interface TouchPoint {
    id: number;
    x: number;
    y: number;
}
/** Start routing window pointer input through `resolve`. `alive` gates the
 *  whole route (false = the tree is gone; the listeners remove themselves
 *  on the next event). */
/** The open overlays' say over a press in the top-level program (outside.ts):
 *  true = swallow it. Installed by the runtime. It hears the press where the
 *  browser reports it — the window point, the frame the walk reads, as hover
 *  does — and the root point beside it, for a step into a hosted program. No
 *  scroll offset converts one into the other: the browser's own pair is exact
 *  at the moment of the press, where an offset may lag the page. */
type OutsideHook = (x: number, y: number, rootX: number, rootY: number) => boolean;
export declare function setOutsidePressHook(fn: OutsideHook | null, scroll?: OutsideHook | null): void;
export declare function provideKeyContextTarget(fn: () => {
    $surface?: unknown;
} | null): void;
export declare function routeInput(alive: () => boolean, resolve: (e: MouseEvent) => HitTarget | null, rootPoint?: (e: MouseEvent) => {
    x: number;
    y: number;
}, onHover?: (t: HitTarget | null) => void, topLevel?: boolean): void;
/** Does a wheel scroll pass a view whose `claim` covers only one axis — a
 *  scroll mostly along the other, which goes on to the page as a finger's does
 *  (a chart that pans sideways leaves a vertical wheel scrolling past it)? */
export declare function passesWheel(axis: "both" | "x" | "y" | undefined, deltaX: number, deltaY: number): boolean;
export {};
