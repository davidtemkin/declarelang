// The named screen-update seam: a single, multi-subscriber observation point
// fired once at the clean completion of a top-level settle (reactive.ts). It
// changes nothing about WHEN a frame paints — the backends already schedule
// their rAF from Surface writes — it just names the frame boundary so callers
// (and readers) have one place that means "everything this settle changed has
// landed." Fired only on a clean settle (never after a throw); see settle().
const subscribers = new Set();
/** Subscribe to the screen-update seam. Returns an unsubscribe function. */
export function onScreenUpdate(fn) {
    subscribers.add(fn);
    return () => {
        subscribers.delete(fn);
    };
}
/** Invoke every subscriber. Called by settle's clean-completion tail. A
 *  subscriber added or removed during dispatch takes effect next fire. */
export function fireScreenUpdate() {
    for (const fn of [...subscribers])
        fn();
}
//# sourceMappingURL=screen-update.js.map