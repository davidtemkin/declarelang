// events — the payload types a handler receives.
//
// Until 2026-07-28 the pointer payload had no name at all: it travelled the
// runtime's own plumbing as `extra?: Record<string, unknown>` (backend.ts's
// InputSink) and reached a handler as an object literal assembled in view.ts.
// A handler's `e` was therefore `any`, and no amount of annotating a signature
// could fix that — there was no type to name. These are that missing type.
//
// NAMING: these describe Declare's INPUTS (a pointer, keys), not a platform's
// DEVICES (a mouse, a touchscreen) and not the DOM's event objects. `KeyEvent`
// (keys.ts) set the precedent and is deliberately NOT the DOM's KeyboardEvent:
// it is a flat 7-field normalization with the modifiers renamed (`shift`, not
// `shiftKey`) and the whole Event/UIEvent inheritance — target, bubbles,
// preventDefault — dropped, because nothing bubbles here. `PointerEvent`
// shadows a DOM global inside this package for the same reason: the name has
// to describe Declare's model on a host that has no DOM at all (the Mac-native
// host), so it cannot be borrowed from one.
//
// Structural, not nominal: the runtime still passes object literals (`{ x, y }`
// plus whatever the event kind carries), and a literal satisfies these. They
// exist to NAME the shape for the scaffold, for a handler's written parameter
// type, and for the reference pages.
/** One finger in a multi-touch payload. `id` is stable for the life of that
 *  finger's contact, so a gesture can follow it across moves. */
export class Touch {
}
/** What every single-point pointer handler receives — `onMouseDown`,
 *  `onMouseMove`, `onClick`, `onDblClick`, `onHold`, `onMouseOver`,
 *  `onMouseOut`.
 *
 *  The coordinate FRAME differs by handler, and deliberately: `onMouseDown`,
 *  `onClick` and `onDblClick` carry view-local coordinates, while
 *  `onMouseMove` and `onMouseUp` carry ROOT-space ones — a drag needs a frame
 *  that does not move with the thing being dragged. */
export class PointerEvent {
}
/** `onMouseUp` — a release, which may be an INTERRUPTION rather than a drop.
 *  On a touch screen the browser can reclaim a gesture mid-flight to scroll the
 *  page; that still arrives here (so state resets) with `canceled` true, and a
 *  drag must not commit on it. */
export class PointerUpEvent extends PointerEvent {
}
/** `onTouchStart` / `onTouchMove` / `onTouchEnd` / `onTouchCancel` — the
 *  multi-finger stream, which is a genuinely different payload from the
 *  single-point one above (this is why the touch handlers keep their own
 *  names). `touches` is every finger currently down on this view; `changed` is
 *  only those this event is about. */
export class TouchEvent extends PointerEvent {
}
/** The onPinch family (compositing.md §II.2) — the RECOGNIZED two-finger
 *  gesture over a pinch-declaring subtree. `scale` is CUMULATIVE (distance
 *  now / distance at pinchStart — 1 at the start, monotone with the spread);
 *  `center` is the midpoint of the two fingers in ROOT space (`x`/`y` carry
 *  the same point, so the single-point idiom still reads). Declaring any of
 *  the three handlers claims the two-finger gesture from the browser;
 *  single-finger pan stays the enclosing regime's. */
export class PinchEvent extends PointerEvent {
}
/** `onWheel` — the wheel stream over a view. A desktop trackpad PINCH arrives
 *  here too, as a wheel with `pinch` true (the platform reports it that way and
 *  there is no other signal); ⌘ +/− dispatches nothing at all and cannot be
 *  intercepted by anyone. */
export class WheelEvent extends PointerEvent {
}
//# sourceMappingURL=events.js.map