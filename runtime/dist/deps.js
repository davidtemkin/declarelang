// deps — carry the compiler's extracted constraint dependencies (read-paths,
// docs/system-design/constraints.md §5) across the SOURCE-STRING channel to the runtime.
//
// The precompiled (declarec) path attaches deps straight onto the program AST
// (`attr.value.deps`), so they ride in the serialized program. The dev / live
// path ships resolved SOURCE that the browser re-parses, so deps can't ride in
// the program object — they travel as a parallel walk-order list and are zipped
// back on after parse. Extraction needs the TS toolchain (compiler-side); APPLY
// needs nothing but field-setting, so it lives here in the zero-dep runtime.
//
// serialize (compiler side) and apply (runtime side) BOTH iterate through
// `forEachCodeValue`, so their indices align by construction — the browser
// re-parses the identical resolved source into the identical structure.
/** Every `{ }` code value in a program, in a FIXED order: the root subtree then
 *  each class body; within an element, attributes, then computed decl defaults,
 *  then children (pre-order). The one iteration order serialize/apply share. */
export function forEachCodeValue(program, fn) {
    const walk = (el) => {
        for (const a of el.attrs)
            if (a.value.kind === "code")
                fn(a.value);
        for (const d of el.decls)
            if (d.def && d.def.kind === "code")
                fn(d.def);
        for (const c of el.children)
            walk(c);
    };
    walk(program.root);
    for (const c of program.classes)
        walk(c.body);
}
/** Collect each code value's attached deps in walk order (compiler side, after
 *  annotation). Empty arrays hold the position for un-annotated / residue slots. */
export function serializeDeps(program) {
    const out = [];
    forEachCodeValue(program, (v) => out.push(v.deps ? [...v.deps] : []));
    return out;
}
/** Zip a walk-order dep list back onto a freshly-parsed program (runtime side).
 *  Additive: a missing/empty entry leaves the slot on the tracking fallback. */
export function applyDeps(program, list) {
    let i = 0;
    forEachCodeValue(program, (v) => {
        const d = list[i++];
        if (d && d.length > 0)
            v.deps = d;
    });
}
//# sourceMappingURL=deps.js.map