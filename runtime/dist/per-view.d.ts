import type { View } from "./view.js";
type Enter = (view: View) => (() => void) | void;
/** Register a per-view effect. `enter(view)` is called once per view at
 *  instantiate (parent-first), for the initial tree AND later-created
 *  (replicated / data) subtrees; its optional return is run when the view is
 *  discarded. Returns an unregister thunk. */
export declare function onEachView(enter: Enter): () => void;
/** Core wiring (instantiate.ts initTree): run every registered enter for a
 *  freshly-initialized view, storing any cleanups it returns. */
export declare function runEnterHooks(view: View): void;
/** Core wiring (view.ts discard): run and drop this view's cleanups. */
export declare function runExitHooks(view: View): void;
export {};
