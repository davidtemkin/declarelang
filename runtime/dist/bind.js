// Bind parsed attribute values that are *relationships*, not literals, onto a
// live view: `{ }` constraint bodies and percent Lengths. instantiate.ts
// calls these after the whole tree is linked (a binding's first evaluation
// may read the parent — a percent does by construction).
//
// Both forms become the same Constraint: evaluate under tracking, land the
// result through setBound (store → the one affected Surface call → wake
// dependents). A percent is not a special mechanism — it is the constraint
// `parent.<axis> × p/100` the runtime writes for you, which is why "parent
// resizes → dependent re-resolves" needs no extra machinery.
import { DeclareError } from "./errors.js";
import { Constraint } from "./reactive.js";
import { followedValue, markPercent, own, setBound } from "./attributes.js";
import { compileExpr } from "./expr.js";
import { View, inheritedCursor } from "./view.js";
import { coerceData, toCursor } from "./data.js";
import { splitPath } from "./datapath.js";
/** Bind `name = { src }`: compile, install as the slot's owner, evaluate
 *  once now. check() already validated the syntax on the build path; a
 *  direct instantiate of an unchecked tree still fails soundly here with
 *  the same wording (compileExpr is the one message source). `classroot` is
 *  the instance of the class whose body the binding was WRITTEN in (R6) —
 *  a member-origin fact instantiate supplies, not always view.classroot
 *  (a class-body member on the class root itself binds to that root).
 *  `view` is any Node since R8 — a DataSource's `url = { … }` binds the
 *  same way a View attribute does. */
export function bindConstraint(view, name, src, pos, classroot, 
/** The compiler's extracted dependency read-paths (design/constraints.md §5).
 *  When present, the constraint is wired on the static path — edges fixed once,
 *  no per-run re-tracking. Absent (dev re-parse, or an un-annotated program) →
 *  the runtime-tracking fallback, unchanged. */
deps) {
    const c = compileExpr(src);
    if ("error" in c) {
        throw new DeclareError(`${view.constructor.name}.${name} = { … } ${c.error}`, pos);
    }
    const fn = c.fn;
    const k = new Constraint(`${view.constructor.name}.${name}`, () => fn.call(view, view.parent, classroot), (v) => setBound(view, name, v));
    own(view, name, k);
    // The static path prewires STABLE-slot edges (attribute cells, a Dataset's
    // `.value` slot — they outlive every recompute). A read of a DATA REGION
    // (`:path` or `.read([…])`) resolves to a cell on the data VALUE tree, which is
    // recreated when the value arrives or is replaced — that dynamic, per-element
    // subscription is the data-binding primitive's to own (design/constraints.md §3),
    // so such a constraint stays on the tracking path. (The extractor still lists
    // the region read-path, for legibility/tooling.)
    const regionReactive = deps !== undefined && deps.some((rp) => rp.startsWith(":") || rp.includes(".read("));
    if (deps !== undefined && deps.length > 0 && !regionReactive) {
        // Each read-path is an analyzable expression (`this.root.n`, `this.theme`);
        // compile once and read it under tracking to wire the (stable) edge.
        const probes = deps.map((rp) => compileExpr(rp)).filter((r) => "fn" in r).map((r) => r.fn);
        k.wire(() => {
            for (const p of probes) {
                try {
                    p.call(view, view.parent, classroot);
                }
                catch { /* a null-value projection — its tracked prefix is already wired */ }
            }
        }, deps);
    }
    else {
        k.run();
    }
}
/** Bind `name = :path` (a value slot reading data, language §9): a standing
 *  computation over exactly that region of the inherited cursor's dataset.
 *  The raw value coerces to the slot's declared type at the boundary; an
 *  unresolved path lands the slot's fallback — the class default, or, on a
 *  PREVAILING slot, the followed value (ruled: the declaration default is
 *  just the chain's end). The fallback is read inside the tracked compute,
 *  so an unresolved prevailing slot keeps following live and lets go of the
 *  chain the moment the path resolves. */
export function bindData(view, name, path, type) {
    const UNRESOLVED = {}; // sentinel: coerceData returns the def verbatim
    const k = new Constraint(`${view.constructor.name}.${name} = :${path}`, () => {
        const v = coerceData(type, view.$data(path), UNRESOLVED);
        return v === UNRESOLVED ? followedValue(view, name) : v;
    }, (v) => setBound(view, name, v));
    own(view, name, k);
    k.run();
}
/** Bind `datapath = :rel.path`: this view's cursor is the INHERITED cursor
 *  (from the parent chain — never this view's own slot, which it defines)
 *  extended by `rel.path`. Interned, so a re-derivation of the same place
 *  stops at the equality gate. */
export function bindDatapath(view, path) {
    const segs = splitPath(path);
    const k = new Constraint(`${view.constructor.name}.datapath = :${path}`, () => {
        const base = inheritedCursor(view.parent);
        return base === null ? null : base.data.cursorAt([...base.path, ...segs]);
    }, (v) => setBound(view, "datapath", v));
    own(view, "datapath", k);
    k.run();
}
/** Bind `datapath = { expr }`: the expression yields a value from a
 *  dataset (`weatherData.value.rss.channel` — plain TS dereferences), and
 *  toCursor turns it back into a *place*, inside the tracked compute so the
 *  cursor stands on its whole chain (a structural change along it re-runs). */
export function bindCursor(view, src, pos, classroot) {
    const c = compileExpr(src);
    if ("error" in c) {
        throw new DeclareError(`${view.constructor.name}.datapath = { … } ${c.error}`, pos);
    }
    const fn = c.fn;
    const label = `${view.constructor.name}.datapath`;
    const k = new Constraint(label, () => toCursor(fn.call(view, view.parent, classroot), label), (v) => setBound(view, "datapath", v));
    own(view, "datapath", k);
    k.run();
}
// A percent resolves against the parent's extent on the attribute's own
// axis — horizontal slots against parent.width, vertical against
// parent.height (the doc's `width = 100%`, generalized the way CSS
// percentages resolve). Only geometry is Length-typed today; a future
// Length attribute extends this table alongside its schema entry.
const PERCENT_AXIS = {
    x: "width",
    y: "height",
    width: "width",
    height: "height",
};
/** Bind `name = p%` as the runtime constraint described above. The root has
 *  no parent to resolve against — that is an instantiation-context fact, not
 *  a source fact (the same fragment could be checked for embedding
 *  elsewhere), which is why it surfaces here and not in check(). */
export function bindPercent(view, name, percent, pos) {
    const cls = view.constructor.name;
    const axis = Object.hasOwn(PERCENT_AXIS, name) ? PERCENT_AXIS[name] : null;
    if (axis === null) {
        throw new DeclareError(`${cls}.${name} = ${percent}%: no axis to resolve a percent against`, pos);
    }
    if (!(view.parent instanceof View)) {
        throw new DeclareError(`${cls}.${name} = ${percent}%: the root has no parent for a percent to resolve against`, pos);
    }
    const k = new Constraint(`${cls}.${name} = ${percent}%`, () => view.parent[axis] * (percent / 100), (v) => setBound(view, name, v));
    markPercent(k); // auto-extent excludes percent-bound child slots (view.ts)
    own(view, name, k);
    k.run();
}
//# sourceMappingURL=bind.js.map