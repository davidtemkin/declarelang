// The render seam — the single boundary between the view model and whatever
// draws it. This is Declare's answer to LZX's view→"sprite" contract, kept but
// cleaned of Flash-era baggage (no frames/play, rotation/scale, capability
// probing, or Flash a11y attributes).
//
// Two implementations sit behind it: the DOM backend (dom-backend.ts, R0) and
// the Canvas backend (R1). A View talks only to a Surface and never learns
// which one it has; the runtime injects the backend, so the application never
// names a substrate (APPROACH §4) — the property that lets a later optimizing
// runtime choose a backend per view / per hierarchy.
export const POINTER_TYPES = ["mouseDown", "mouseUp", "click", "dblClick", "mouseMove", "mouseOver", "mouseOut", "hold", "touchStart", "touchMove", "touchEnd", "touchCancel", "wheel"];
/** The raw-touch member of the family: declaring one of these is a view's
 *  statement that it owns multi-finger gestures in its subtree (the backend
 *  then stops the browser from claiming them — dom-backend setGestureOwner). */
export const TOUCH_TYPES = ["touchStart", "touchMove", "touchEnd", "touchCancel"];
//# sourceMappingURL=backend.js.map