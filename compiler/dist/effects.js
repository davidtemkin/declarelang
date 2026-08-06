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
    // App.destinationOf(loc) (view.ts) — strips the runtime's own trailing
    // `@name` from a location string. A pure function of its ARGUMENT: the
    // argument's own reads (`app.location` at every lowered `shows` gate) are
    // extracted at the call site, so the binding wires exactly them. PURE.
    ["destinationOf", []],
    // App.follow(ref) — the one arrival operation (location.md §0.5). Like
    // navigate: an ACTION a handler calls — it writes location and the host
    // channels, and reads no reactive cell the CALLER's analysis must wire (the
    // app-scoped onFollow hook runs inside it imperatively, never as a tracked
    // read). The LINK relation itself is authored (`link =`), not inferred here.
    ["follow", []],
    // View.raise(below?) (runtime/src/view.ts) — promotion: re-links the view to
    // the front of its siblings, or just beneath `below` when given (planes.md
    // §1, order-as-slot). Structural mutation, no reactive READ → pure for
    // dependency analysis. A Menu raises at open; a Window raises on activation.
    ["raise", []],
    // View.scrollIntoView(align?) — the imperative reveal (backend.ts). Writes
    // scroll state, reads no reactive cell → pure for analysis.
    ["scrollIntoView", []],
    // View.rootOrigin() is DELIBERATELY ABSENT — do not add it back.
    //
    // It was registered here as pure, and that was untrue: it walks the ancestor
    // chain reading every level's x/y and each scroller's scrollX/scrollY, all of
    // them reactive cells. This header's own rule calls that out — "a missing read
    // is UNSOUND" — and the cost was exactly the unsoundness described: a
    // constraint reading `v.rootOrigin().y` wired the NODE and none of the scroll
    // cells, so it showed its first value forever, at every rung, with no error.
    // The entry did not help analysis; it switched analysis OFF.
    //
    // Its true reads cannot be declared here in any case. A signature is read-paths
    // relative to `this`, and this walk's reads are an ancestor chain of unknown
    // depth — not nameable at compile time, which is precisely the condition the
    // residue rule exists to catch. So absence is not a gap: it lets the GENERAL
    // §3 path do its job, and it splits the two uses correctly on its own — a
    // constraint refuses (DECLARE7001), while a handler anchoring an overlay at
    // gesture time (Menu.openAt/openFor, FocusRing) keeps working, which is where
    // a snapshot was the right semantics all along.
    //
    // Live geometry in a constraint is already expressible, and statically: name
    // the scroller and subtract it — `{ pane.y + row.y - pane.scrollY }` wires
    // this.root.pane.y, this.root.row.y, this.root.pane.scrollY and stays true.
    // Keys.navClaim(owner, on) — claim/release the navigation keys from the
    // browser's scroll defaults (keys.ts). Mutates a plain claim set, reads no
    // reactive cell → pure for analysis. A Menu claims at open, releases at close.
    ["navClaim", []],
    // View.travelWith(scroller) — re-hosts the view's surface (view.ts). A
    // structural/backend move, no reactive read → pure for analysis.
    ["travelWith", []],
    // View.$setData(path, v) — the datapath WRITE (view.ts). The this-receiver
    // literal-path form is special-cased in dep-extract (the plan currency);
    // this row covers OTHER receivers — a cell writing through its ROW's cursor
    // (`classroot.$setData(["title"], v)`, the DataGrid editors). A write reads
    // no reactive cell → pure for analysis.
    ["$setData", []],
    // App.createView(tag, parent, props?) — imperative creation (planes.md §7,
    // instantiate.ts). Constructs a subtree; reads no reactive cell at the call
    // site → pure for analysis (the created instance's own bindings wire
    // themselves through the ordinary pipeline).
    ["createView", []],
]);
//# sourceMappingURL=effects.js.map