// devicePixelRatio change notification, shared by everything that holds a
// raster (the Canvas backend's compositor, the DOM backend's per-view
// drawing canvases): rasters must re-render crisply when the user zooms or
// the window moves between displays — even on an otherwise idle tree.
//
// The media query names the *current* ratio, so each firing re-arms a fresh
// query against the new one; `alive` lets a torn-down owner end the chain.
/** Call `changed` whenever devicePixelRatio changes, for as long as
 *  `alive()` holds. */
export function onDprChange(alive, changed) {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener("change", () => {
        if (!alive())
            return;
        changed();
        onDprChange(alive, changed);
    }, { once: true });
}
//# sourceMappingURL=dpr.js.map