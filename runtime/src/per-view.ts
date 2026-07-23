// The generic per-view lifecycle seam (per-view-hook spec, Increment 2): lets a
// plugin run a reactive effect per view. Core calls enter(view) once per view at
// instantiate (parent-first, however the view came to exist) and runs the
// returned cleanup on discard. The plugin owns its own Constraint (reactivity);
// core dispatches lifecycle only. Any plugin may use it (not CSS-specific).
//
// `View` is imported type-only (erased): instantiate.ts / view.ts import this
// module as a value, so a value import back into view.ts would be a runtime cycle.
import type { View } from "./view.js";

type Enter = (view: View) => (() => void) | void;

const hooks = new Set<Enter>();
const cleanups = new WeakMap<View, Array<() => void>>();

/** Register a per-view effect. `enter(view)` is called once per view at
 *  instantiate (parent-first), for the initial tree AND later-created
 *  (replicated / data) subtrees; its optional return is run when the view is
 *  discarded. Returns an unregister thunk. */
export function onEachView(enter: Enter): () => void {
  hooks.add(enter);
  return () => { hooks.delete(enter); };
}

/** Core wiring (instantiate.ts initTree): run every registered enter for a
 *  freshly-initialized view, storing any cleanups it returns. */
export function runEnterHooks(view: View): void {
  if (hooks.size === 0) return;
  for (const enter of [...hooks]) {
    const cleanup = enter(view);
    if (cleanup !== undefined) {
      let list = cleanups.get(view);
      if (list === undefined) { list = []; cleanups.set(view, list); }
      list.push(cleanup);
    }
  }
}

/** Core wiring (view.ts discard): run and drop this view's cleanups. */
export function runExitHooks(view: View): void {
  const list = cleanups.get(view);
  if (list === undefined) return;
  cleanups.delete(view);
  for (const c of list) c();
}
