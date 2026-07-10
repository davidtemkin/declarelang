import type { InputSink } from "./backend.js";
/** A resolved input point: the sink of the view under it, that view's
 *  identity (`key`, for the click pairing — any stable per-view object),
 *  and the point in the view's local space. */
export interface HitTarget {
    key: object;
    sink: InputSink;
    x: number;
    y: number;
}
/** Start routing window pointer input through `resolve`. `alive` gates the
 *  whole route (false = the tree is gone; the listeners remove themselves
 *  on the next event). */
export declare function routeInput(alive: () => boolean, resolve: (e: MouseEvent) => HitTarget | null, rootPoint?: (e: MouseEvent) => {
    x: number;
    y: number;
}): void;
