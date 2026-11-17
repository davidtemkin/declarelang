// a11y-roles — the accessibility vocabulary: the roles a view may declare
// (`accessibilityRole = slider`) and, for each, the CONTRACT the role reads
// (docs/system-design/accessibility.md §3.1). One table, read by the compiler
// (a class that declares a role must meet its contract — checked by name and
// type, with no list of classes anywhere) and by the runtime (the same check
// when a view's class is only known as it is created, and the semantic tree's
// projection, semantics.ts).
//
// A role is a contract, not a registry: nothing here names a class. A
// library Slider and an author's Waveform meet `slider` the same way.
/** The attributes of the `accessibility…` namespace on View, by role-free
 *  name: what a contract may require. */
export const A11Y_MEMBERS = [
    "accessibilityValue", "accessibilityMin", "accessibilityMax", "accessibilityStep",
    "accessibilityValueText", "accessibilityChecked", "accessibilityPressed",
    "accessibilitySelected", "accessibilityLevel", "accessibilityExpanded",
    "accessibilityPosInSet", "accessibilitySetSize",
];
import { ROLES } from "./a11y-vocab.js";
const PRESS = ["press"];
const c = (needs, may, methods, extra = {}) => ({ needs, may, methods, ...extra });
/** Every role, and what it reads. `none` is transparent: the view contributes
 *  no node, and its children rise to the nearest ancestor with a role. */
// Built by one call marked pure, so a build that never reads a contract (one
// with the layer off) leaves the whole table out.
const makeContracts = () => ({
    none: c([], [], []),
    button: c([], ["accessibilityExpanded"], PRESS, { nameFromContent: true, named: true }),
    toggle: c(["accessibilityPressed"], [], PRESS, { nameFromContent: true, named: true }),
    checkbox: c(["accessibilityChecked"], [], PRESS, { nameFromContent: true, named: true }),
    switch: c(["accessibilityChecked"], [], PRESS, { nameFromContent: true, named: true }),
    radio: c(["accessibilityChecked"], [], PRESS, { nameFromContent: true, named: true }),
    slider: c(["accessibilityValue", "accessibilityMin", "accessibilityMax"], ["accessibilityStep", "accessibilityValueText"], ["accessibilityIncrement", "accessibilityDecrement"], { named: true }),
    spinButton: c(["accessibilityValue", "accessibilityMin", "accessibilityMax"], ["accessibilityStep", "accessibilityValueText"], ["accessibilityIncrement", "accessibilityDecrement"], { named: true }),
    progress: c(["accessibilityValue", "accessibilityMin", "accessibilityMax"], ["accessibilityValueText"], [], { named: true }),
    // a measurement within a known range (storage used, a battery): a value, not progress toward an end
    meter: c(["accessibilityValue", "accessibilityMin", "accessibilityMax"], ["accessibilityValueText"], [], { named: true }),
    textField: c([], ["accessibilityValueText"], [], { named: true }),
    link: c([], [], [], { nameFromContent: true, named: true }),
    image: c([], [], []),
    heading: c([], ["accessibilityLevel"], [], { nameFromContent: true }),
    list: c([], [], []),
    listItem: c([], ["accessibilitySelected"], [], { nameFromContent: true }),
    grid: c([], ["accessibilityMultiselectable"], []),
    row: c([], ["accessibilitySelected", "accessibilityExpanded"], []),
    cell: c([], ["accessibilitySelected"], [], { nameFromContent: true }),
    columnHeader: c([], ["accessibilitySort"], [], { nameFromContent: true }),
    rowHeader: c([], [], [], { nameFromContent: true }),
    tabList: c([], [], []),
    tab: c(["accessibilitySelected"], [], PRESS, { nameFromContent: true, named: true }),
    tabPanel: c([], [], []),
    menu: c([], [], []),
    menuBar: c([], [], []),
    menuItem: c([], ["accessibilityChecked", "accessibilityExpanded"], PRESS, { nameFromContent: true, named: true }),
    // one of a set of menu items of which one is chosen at a time (a sort order, a view)
    menuItemRadio: c(["accessibilityChecked"], [], PRESS, { nameFromContent: true, named: true }),
    dialog: c([], [], [], { named: true }),
    alertDialog: c([], [], [], { named: true }),
    group: c([], ["accessibilityExpanded"], []),
    toolbar: c([], [], []),
    region: c([], [], [], { named: true }),
    status: c([], ["accessibilityValueText"], []),
    listbox: c([], ["accessibilityMultiselectable"], [], { named: true }),
    option: c([], ["accessibilitySelected", "accessibilityChecked"], PRESS, { nameFromContent: true, named: true }),
    tree: c([], ["accessibilityMultiselectable"], [], { named: true }),
    treeItem: c([], ["accessibilitySelected", "accessibilityExpanded", "accessibilityLevel", "accessibilityPosInSet", "accessibilitySetSize"], PRESS, { nameFromContent: true, named: true }),
    radioGroup: c([], [], []),
    combobox: c([], ["accessibilityExpanded", "accessibilityValueText"], [], { named: true }),
    separator: c([], ["accessibilityValue", "accessibilityMin", "accessibilityMax", "accessibilityValueText"], [], { mayMethods: ["accessibilityIncrement", "accessibilityDecrement"] }),
    searchBox: c([], [], [], { named: true }),
    navigation: c([], [], []),
    main: c([], [], []),
    search: c([], [], []),
    banner: c([], [], []),
    complementary: c([], [], []),
    contentinfo: c([], [], []),
}); // every word has its contract
export const ROLE_CONTRACTS = /* @__PURE__ */ makeContracts();
export { ROLES, LIVE } from "./a11y-vocab.js";
/** The members `role` reads, needed and optional — every contract member the
 *  semantic node reports for a view of that role. */
export function roleReads(role) {
    const k = ROLE_CONTRACTS[role];
    return k === undefined ? [] : [...k.needs, ...k.may];
}
/** What a class or view declaring `role` lacks, given what it sets and which
 *  methods it has: one line per missing member, empty when it meets the
 *  contract. The compiler and the runtime say it in the same words. */
export function contractGaps(role, sets, has) {
    const k = ROLE_CONTRACTS[role];
    if (k === undefined)
        return [];
    const out = [];
    for (const n of k.needs)
        if (!sets(n))
            out.push(`${n}`);
    for (const m of k.methods)
        if (!has(m))
            out.push(`${m}()`);
    return out;
}
/** The sentence a contract gap reads as, wherever it is found. */
export function contractMessage(owner, role, gaps) {
    const k = ROLE_CONTRACTS[role];
    const reads = [...k.needs.map((n) => n), ...k.methods.map((m) => m + "()")].join(", ");
    const attrs = gaps.filter((g) => !g.endsWith("()")), methods = gaps.filter((g) => g.endsWith("()"));
    const fixes = [];
    if (attrs.length > 0)
        fixes.push(`Bind ${attrs.length === 1 ? "it" : "each"} to the class's own fact (${attrs[0]} = { … }).`);
    if (methods.length > 0)
        fixes.push(`Define ${methods.join(" and ")}: what the ${role} does when it is used.`);
    if (methods.includes("press()"))
        fixes.push(`A view that only goes somewhere is a link, not a ${role}: give it link and leave the role off.`);
    return `${owner} declares accessibilityRole = ${role}, and the ${role} role reads ${reads}; ` +
        `${owner} has no ${gaps.join(" and no ")}. ${fixes.join(" ")}`;
}
//# sourceMappingURL=a11y-roles.js.map