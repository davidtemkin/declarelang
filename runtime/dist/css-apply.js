// The CSS applier: one Constraint per view (pay-per-use), the sibling of the
// stylesheet applier (stylesheet.ts). It reads (tracked) the prevailing
// cssRules, the view's and ancestors' styleclass/id and any tested [attr],
// computes the per-view cascade, coerces each mapped property, and installs the
// result as rank-2b offers (below the class-dict) via cssWrite / withdraws via
// cssClear. Dynamic re-matching rides the reactive settle: any tracked read
// that changes wakes it. Inheritance is NOT done here — a CSS offer on a
// prevailing slot flows down by the ordinary follow.
import { Constraint } from "./reactive.js";
import { cssMap, cssWrite, cssClear, cssMarks, isSet, ownerOf, stylesheetMarks } from "./attributes.js";
import { matched } from "./css-match.js";
const APPLIERS = new WeakMap();
/** This class + its ancestors' names — subclass-aware tag matching. Immutable
 *  (a class never changes), so it needs no tracking. */
function classNames(ctor) {
    const names = [];
    let c = ctor;
    while (c && c !== Function.prototype && c.name) {
        names.push(c.name);
        c = Object.getPrototypeOf(c);
    }
    return names;
}
/** Adapt a view to the matcher's structural interface, reading through the
 *  view's TRACKED accessors so a change to styleclass/id/[attr] on this view OR
 *  any ancestor wakes the applier. */
function asMatchView(v) {
    return {
        get tagChain() {
            return classNames(v.constructor);
        },
        get id() {
            return v.id;
        },
        get styleclass() {
            return v.styleclass;
        },
        attr: (name) => v[name],
        get parent() {
            return v.parent ? asMatchView(v.parent) : null;
        },
    };
}
/** Install the view's CSS applier if an effective cssRules is in force (and it
 *  has none yet). Idempotent; called at instantiate and by cssRulesArrived. */
export function ensureCssApplier(view) {
    const v = view;
    if (APPLIERS.has(view))
        return;
    if (v.cssRules === null)
        return; // plain (untracked) effective read
    const applier = new Constraint(`${v.constructor.name}'s css`, () => {
        const rules = v.cssRules; // tracked follow of the prevailing slot
        const offers = Object.create(null);
        if (rules !== null) {
            const map = cssMap(v.constructor);
            const decls = matched(asMatchView(v), rules);
            for (const [prop, raw] of decls) {
                const entry = map[prop];
                if (entry === undefined)
                    continue; // unmapped property → ignore
                // TRACKED PROVISION PROBE: read the slot's effective value through the
                // getter so this applier subscribes to entry.attr's cell. Any
                // provision change on it — author $set, an owning binding, a class-dict
                // stylesheetWrite/Clear (all fire that cell's changed()) — then wakes
                // this applier to withdraw or re-offer.
                void view[entry.attr];
                // Author or class-dict outranks CSS: don't offer.
                if (isSet(view, entry.attr) || ownerOf(view, entry.attr) !== null)
                    continue;
                if (stylesheetMarks(view)?.has(entry.attr))
                    continue;
                const value = entry.coerce(raw);
                if (value === undefined)
                    continue; // malformed → skip
                offers[entry.attr] = value;
            }
        }
        return offers;
    }, (offers) => {
        const o = offers;
        const marks = cssMarks(view);
        if (marks !== undefined) {
            for (const name of [...marks])
                if (!(name in o))
                    cssClear(view, name);
        }
        for (const name in o)
            cssWrite(view, name, o[name]);
    });
    APPLIERS.set(view, applier);
    applier.run();
}
/** The `cssRules` slot's pusher: rules arrived at (or left) this view — make
 *  sure the subtree beneath has appliers (existing ones re-run through their
 *  own tracking; this walk only INSTALLS missing ones). */
export function cssRulesArrived(view) {
    const walk = (n) => {
        ensureCssApplier(n);
        for (const c of n.children ?? []) {
            if (typeof c === "object" && c !== null && "cssRules" in c)
                walk(c);
        }
    };
    walk(view);
}
/** Re-cascade a moved subtree against its new ancestors (re-run every applier
 *  on the moved node and its descendants). */
export function cssReparent(view) {
    const walk = (n) => {
        APPLIERS.get(n)?.run();
        for (const c of n.children ?? []) {
            if (typeof c === "object" && c !== null && "cssRules" in c)
                walk(c);
        }
    };
    walk(view);
}
/** Retire the view's CSS applier (View.discard). */
export function disposeCssApplier(view) {
    const a = APPLIERS.get(view);
    if (a !== undefined) {
        APPLIERS.delete(view);
        a.dispose();
    }
}
//# sourceMappingURL=css-apply.js.map