/** One finger in a multi-touch payload. `id` is stable for the life of that
 *  finger's contact, so a gesture can follow it across moves. */
export declare class Touch {
    id: number;
    x: number;
    y: number;
}
/** What every single-point pointer handler receives — `onMouseDown`,
 *  `onMouseMove`, `onClick`, `onDblClick`, `onHold`, `onMouseOver`,
 *  `onMouseOut`.
 *
 *  The coordinate FRAME differs by handler, and deliberately: `onMouseDown`,
 *  `onClick` and `onDblClick` carry view-local coordinates, while
 *  `onMouseMove` and `onMouseUp` carry ROOT-space ones — a drag needs a frame
 *  that does not move with the thing being dragged. */
export declare class PointerEvent {
    x: number;
    y: number;
}
/** `onMouseUp` — a release, which may be an INTERRUPTION rather than a drop.
 *  On a touch screen the browser can reclaim a gesture mid-flight to scroll the
 *  page; that still arrives here (so state resets) with `canceled` true, and a
 *  drag must not commit on it. */
export declare class PointerUpEvent extends PointerEvent {
    canceled: boolean;
}
/** `onTouchStart` / `onTouchMove` / `onTouchEnd` / `onTouchCancel` — the
 *  multi-finger stream, which is a genuinely different payload from the
 *  single-point one above (this is why the touch handlers keep their own
 *  names). `touches` is every finger currently down on this view; `changed` is
 *  only those this event is about. */
export declare class TouchEvent extends PointerEvent {
    touches: readonly Touch[];
    changed: readonly Touch[];
}
/** `onWheel` — the wheel stream over a view. A desktop trackpad PINCH arrives
 *  here too, as a wheel with `pinch` true (the platform reports it that way and
 *  there is no other signal); ⌘ +/− dispatches nothing at all and cannot be
 *  intercepted by anyone. */
export declare class WheelEvent extends PointerEvent {
    deltaX: number;
    deltaY: number;
    pinch: boolean;
}
