const hooks = new Set();
const cleanups = new WeakMap();
/** Register a per-view effect. `enter(view)` is called once per view at
 *  instantiate (parent-first), for the initial tree AND later-created
 *  (replicated / data) subtrees; its optional return is run when the view is
 *  discarded. Returns an unregister thunk. */
export function onEachView(enter) {
    hooks.add(enter);
    return () => { hooks.delete(enter); };
}
/** Core wiring (instantiate.ts initTree): run every registered enter for a
 *  freshly-initialized view, storing any cleanups it returns. */
export function runEnterHooks(view) {
    if (hooks.size === 0)
        return;
    for (const enter of [...hooks]) {
        const cleanup = enter(view);
        if (cleanup !== undefined) {
            let list = cleanups.get(view);
            if (list === undefined) {
                list = [];
                cleanups.set(view, list);
            }
            list.push(cleanup);
        }
    }
}
/** Core wiring (view.ts discard): run and drop this view's cleanups. */
export function runExitHooks(view) {
    const list = cleanups.get(view);
    if (list === undefined)
        return;
    cleanups.delete(view);
    for (const c of list)
        c();
}
//# sourceMappingURL=per-view.js.map