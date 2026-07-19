// effects — reactive-effect signatures for LANGUAGE-supplied component methods
// (docs/system-design/constraints.md, the 2026-07-13 revision, point 1).
//
// A `{ }` constraint's dependency analysis (dep-extract.ts) follows a call into a
// USER method's body to infer the reactive cells it reads. A LANGUAGE-supplied
// method — a runtime View/component method like `lookupStylesheet` — has no
// Declare body to follow (its body is runtime TS), so its reactive effect is
// DECLARED here instead. This is the effect analog of a typed library signature:
// a user method's effect is INFERRED from its body, a language method's is
// DECLARED, and the two are on the SAME footing — there is no "builtin" privilege
// tier, and a call into either is analyzable. A method absent from BOTH this
// table and the program's own methods is a residue: an unanalyzable call, hence a
// compile error that names the fix (constraints.md §3).
//
// A signature is the set of reactive READ-PATHS the method depends on, written
// relative to its receiver `this` (dep-extract rebases them to the call site). An
// EMPTY array is a PURE method — it reads no reactive cell.
//
// Compiler-side ONLY: the zero-dependency runtime graph never imports this. Grow
// the table as real constraint code calls a new language method; keep every entry
// justified by that method's ACTUAL reads (an over-broad effect is sound but adds
// useless edges; a missing read is UNSOUND — verify against the method's body).
/** Method name → reactive read-paths relative to `this` (empty = pure). Keyed by
 *  bare name, matching how dep-extract keys user methods (a same-named user method
 *  is resolved first and shadows an entry here). */
export const LANGUAGE_METHOD_EFFECTS = new Map([
    // View.lookupStylesheet(name) (runtime/src/view.ts) walks parent links —
    // structural navigation, not a reactive read — to the STATIC stylesheet
    // registry and looks the name up. It touches no reactive cell → PURE. So
    // `{ dark ? this.lookupStylesheet("Dark") : this.lookupStylesheet("Light") }`
    // depends only on `dark`, and is fully analyzable.
    ["lookupStylesheet", []],
    // App.navigate(to) — the navigation SERVICE ACTION (view.ts, capabilities.md
    // §6). It writes the host channel and reads no reactive cell → PURE for
    // dependency analysis. Registered so a body that reaches it (a handler, or a
    // method a constraint transitively calls) analyzes cleanly rather than falling
    // to the §3 residue. The NAVIGATION effect itself — the link relation — is
    // extracted separately, by links.ts, from the CALL SITE.
    ["navigate", []],
    ["openWindow", []],
    // View.raise() (runtime/src/view.ts) — promotion: re-links the view as its
    // parent's last child (planes.md §1, order-as-slot). Structural mutation,
    // no reactive READ → pure for dependency analysis. A Menu raises at open;
    // a Window raises on activation.
    ["raise", []],
    // View.scrollIntoView(align?) — the imperative reveal (backend.ts). Writes
    // scroll state, reads no reactive cell → pure for analysis.
    ["scrollIntoView", []],
    // App.createView(tag, parent, props?) — imperative creation (planes.md §7,
    // instantiate.ts). Constructs a subtree; reads no reactive cell at the call
    // site → pure for analysis (the created instance's own bindings wire
    // themselves through the ordinary pipeline).
    ["createView", []],
]);
//# sourceMappingURL=effects.js.map