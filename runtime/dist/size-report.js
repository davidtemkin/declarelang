// size-report — an AUTHORING diagnostic: a child sized from a parent that has
// no size to give. Its own module because it speaks to the author at their
// desk, and a production build — built once the program is right — leaves it
// out (the `size-report` capability, compiler/src/capabilities.ts: aboard a
// `--debug` build and every development page).
import { View } from "./view.js";
import { afterSettle } from "./reactive.js";
import { isSet, ownerOf, percentOwned } from "./attributes.js";
import { negativeSizeMessage } from "./errors.js";
/** A CHILD SIZED FROM A PARENT THAT HAS NO SIZE TO GIVE is reported
 *  (docs/system-design/layout-ownership.md §4). A child whose size is derived
 *  from its parent's does not count toward the parent's content size, so when
 *  that parent takes its size from its content the child's arithmetic runs from
 *  nothing — `{ parent.contentWidth - 40 }` in a card with no width is −40 in
 *  every state. That lands below zero, and it is a mistake that draws nothing
 *  and says nothing, so it is said here. Ordinary arithmetic below zero is NOT
 *  reported: a field sized `{ parent.height - 60 }` in an accordion section
 *  closed to 46px is −14 while the section hides it, which is what the author
 *  meant, and a negative size draws nothing, as it always has.
 *
 *  Judged only once the program HAS ITS ROOM. A program settles once before it
 *  is attached, when its host has not yet said how big it is, and every size
 *  computed from the App's is provisional then. So a size noted before the App
 *  attaches waits, and is judged at the close of the first settle after it
 *  does (App.attach — the join point `onReady` uses, on every render path);
 *  one noted after is judged at its own settle's close. Once per class and axis
 *  per program: one authored line builds every replicated row. */
const NEGATIVE_PENDING = new Set();
const NEGATIVE_SAID = new WeakMap();
function rootOf(v) {
    let root = v;
    while (root.parent !== null)
        root = root.parent;
    return root;
}
export function noteNegativeSize(v, size) {
    if (!percentOwned(v, size) || NEGATIVE_PENDING.has(v))
        return; // only a size derived from the parent's
    NEGATIVE_PENDING.add(v);
    // attached: judge at this settle's close; not yet: App.attach judges it
    if (rootOf(v).surface != null)
        afterSettle(judgeNegativeSizes);
}
/** Judge every pending size whose program is attached (see noteNegativeSize). */
export function judgeNegativeSizes() {
    for (const v of [...NEGATIVE_PENDING]) {
        const root = rootOf(v);
        if (root.surface == null)
            continue; // not attached yet — its App will ask
        NEGATIVE_PENDING.delete(v);
        const p = v.parent instanceof View ? v.parent : null;
        if (p === null)
            continue;
        for (const axis of ["width", "height"]) {
            const value = v[axis];
            if (!(value < 0) || !percentOwned(v, axis))
                continue;
            // the parent has no size to give on this axis: it takes it from its
            // content (no size of its own, or its auto-extent owns it)
            const pOwner = ownerOf(p, axis);
            if (!(pOwner === null ? !isSet(p, axis) : pOwner.isAutoExtent))
                continue;
            let said = NEGATIVE_SAID.get(root);
            if (said === undefined)
                NEGATIVE_SAID.set(root, (said = new Set()));
            const key = `${v.constructor.name}.${axis}`;
            if (said.has(key))
                continue;
            said.add(key);
            const onlyContent = !p.children.some((c) => c !== v && c instanceof View && c.visible && !percentOwned(c, axis));
            console.error("[Declare] " + negativeSizeMessage(v.constructor.name, axis, value, p.constructor.name, onlyContent, ownerOf(v, axis)?.sourcePos));
        }
    }
}
//# sourceMappingURL=size-report.js.map