// a11y-vocab — the accessibility vocabulary's words alone: the role tokens and
// the live-region politeness (docs/system-design/accessibility.md §3). The
// schema's enums read these; what each role reads is a11y-roles.ts, which only
// the compiler, createView and the semantic tree need.
export const ROLES = [
    "none", "button", "toggle", "checkbox", "switch", "radio", "slider", "progress", "textField", "link", "image",
    "heading", "list", "listItem", "grid", "row", "cell", "columnHeader", "rowHeader", "tabList", "tab", "tabPanel", "menu", "menuBar", "menuItem", "menuItemRadio",
    "dialog", "alertDialog", "group", "toolbar", "region", "status",
    "listbox", "option", "tree", "treeItem", "radioGroup", "combobox", "separator", "searchBox", "spinButton", "meter",
    // landmarks: the parts of a screen a screen reader's user jumps between
    "navigation", "main", "search", "banner", "complementary", "contentinfo",
];
/** Where the person is, among a set of views: the page in a navigation, the
 *  step in a sequence, the day in a calendar — or `item`, the current one of
 *  anything else. */
export const CURRENT = ["none", "page", "step", "location", "date", "time", "item"];
/** Which way a column is sorted, said by its header. */
export const SORTS = ["none", "ascending", "descending"];
/** The politeness of a live region. */
export const LIVE = ["off", "polite", "assertive"];
//# sourceMappingURL=a11y-vocab.js.map