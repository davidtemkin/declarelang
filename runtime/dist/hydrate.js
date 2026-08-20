// hydrate — restore a compacted program to the parser's full shape. A
// production build (tools/declarec.mjs) elides what a checked program repeats
// tens of thousands of times — empty member arrays, `name: null`, `def: null`,
// false flags — before embedding the JSON; this walk puts the structural
// fields back so every consumer keeps reading `el.attrs` / `el.name !== null`
// unconditionally. The boolean flags (`hex`, `many`, `prevailing`, `readOnly`,
// `external`, `entry`) are NOT restored: every reader treats absence as false already.
//
// Deliberately its own tiny module (not parser.ts): the production entry is
// the one importer, and it must pull nothing of the parser along.
function hydrateElement(el) {
    const e = el;
    e.name ??= null;
    e.attrs ??= [];
    e.decls ??= [];
    e.methods ??= [];
    e.children ??= [];
    for (const d of el.decls)
        d.def ??= null;
    for (const m of el.methods)
        m.params ??= [];
    for (const c of el.children)
        hydrateElement(c);
}
/** Restore elided structural fields in place and return the program.
 *  Idempotent; a never-compacted program passes through untouched. */
export function hydrateProgram(program) {
    const p = program;
    for (const k of ["classes", "stylesheets", "styles", "fonts", "includes", "includeSpans", "uses"]) {
        p[k] ??= [];
    }
    hydrateElement(program.root);
    for (const c of program.classes)
        hydrateElement(c.body);
    for (const s of program.stylesheets)
        hydrateElement(s.body);
    for (const s of program.styles)
        hydrateElement(s.body);
    for (const f of program.fonts)
        hydrateElement(f.body);
    return program;
}
//# sourceMappingURL=hydrate.js.map