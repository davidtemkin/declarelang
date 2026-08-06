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
/** The reference schemes a link may carry (location.md §0.4): the app's own
 *  fragment, the web's, mail, or a relative path — never javascript:/data:.
 *  Shared by BOTH enforcement points: App.follow (the operation), and the
 *  realization seam (a disallowed scheme never becomes an href, so the native
 *  paths that bypass follow — copy-link, middle-click — stay shut too). */
export function allowedRef(ref) {
    if (ref.startsWith("#"))
        return true;
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(ref);
    if (m === null)
        return true; // relative path
    const scheme = m[1].toLowerCase();
    return scheme === "http" || scheme === "https" || scheme === "mailto";
}
export const POINTER_TYPES = ["pointerDown", "pointerUp", "click", "dblClick", "pointerMove", "pointerOver", "pointerOut", "hold", "contextMenu", "touchStart", "touchMove", "touchEnd", "touchCancel", "wheel"];
/** The raw-touch member of the family: declaring one of these is a view's
 *  statement that it owns multi-finger gestures in its subtree (the backend
 *  then stops the browser from claiming them — dom-backend setGestureOwner). */
export const TOUCH_TYPES = ["touchStart", "touchMove", "touchEnd", "touchCancel"];
//# sourceMappingURL=backend.js.map