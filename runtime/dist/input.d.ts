import type { InputSink } from "./backend.js";
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
    /** True when this view declares `onDblClick` — the router then HOLDS its
     *  click for the double-click window instead of firing immediately, so a
     *  double-tap does not also perform the single action first. Pay-per-use
     *  gesture arbitration: the latency exists only where the app asked for the
     *  ambiguity. (Resolution knows this because a sink's existence and its
     *  declared handlers are the same fact — view.ts inputSink.) */
    wantsDbl?: boolean;
    /** True when this view declares `onHold`. */
    wantsHold?: boolean;
    /** True when this view (or an ancestor) declares the raw touch family — the
     *  gesture belongs to the app, so the router delivers the whole multi-finger
     *  stream and never interprets it. */
    wantsTouch?: boolean;
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
export declare function routeInput(alive: () => boolean, resolve: (e: MouseEvent) => HitTarget | null, rootPoint?: (e: MouseEvent) => {
    x: number;
    y: number;
}, onHover?: (t: HitTarget | null) => void): void;
