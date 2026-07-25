// The post-settle seam: a single, generic, multi-subscriber observation point
// fired once at the clean completion of a top-level settle() (reactive.ts). It
// changes nothing about WHEN a frame paints — the backends already schedule
// their rAF from Surface writes — it just names the boundary "everything this
// settle changed has landed" so any observer (an external renderer, telemetry,
// a frame-synced animation) has one place to hang off. Fired only on a clean
// settle, never after a throw; see settle().
//
// This is the runtime-loop dimension: unlike the view/attribute/input seams, a
// post-settle boundary can only be observed from inside settle(), so the seam
// lives here. `onScreenUpdate` (screen-update.ts) is one named consumer of it.

type Observer = () => void;

const observers = new Set<Observer>();

/** Subscribe to the post-settle seam. Returns an unsubscribe function. */
export function onSettleComplete(fn: Observer): () => void {
  observers.add(fn);
  return () => {
    observers.delete(fn);
  };
}

/** Invoke every observer. Called by settle's clean-completion tail. An observer
 *  added or removed during dispatch takes effect on the next fire. */
export function fireSettleComplete(): void {
  for (const fn of [...observers]) fn();
}
