// style-bundles — a leaf holding the running program's `style` bundles (name →
// its parsed Element), so BOTH sides can reach them without importing each other:
// `instantiate` SETS the map (it collects the bundles), and `markdown`'s RichText
// resolver READS it (a `<span class>` resolves against it). Keeping this in its own
// tiny module is what preserves tree-shaking — `instantiate` (core, every app) must
// not pull in `markdown` (the RichText engine, RichText apps only), and vice versa.
//
// A bundle is a PLAIN RECORD of literal text attributes, exactly as a theme is a
// record of tokens (ruled 2026-09-14): it has no place in the tree, so nothing in it
// may depend on where it is used. The record is what a `<span class>` run wears,
// what `d.fillText(…, Caption)` and `measureText(…, Caption)` take, and what a body
// reads by the bundle's name.
import { coerce } from "./value.js";
import { attrType, TextSchema } from "./schema.js";
let BUNDLES = new Map();
/** Install the running program's `style` bundles (instantiate, once per program). */
export function setStyleBundles(b) {
    BUNDLES = b;
}
/** The current program's `style` bundles, for by-name resolution. */
export function styleBundles() {
    return BUNDLES;
}
const RECORDS = new WeakMap();
/** A bundle's fields as a frozen record of runtime values, keyed by the `Text`
 *  attribute names they set. A field that is not a coercible literal (the
 *  checker refuses those) is left out. */
export function bundleRecord(el) {
    const cached = RECORDS.get(el);
    if (cached !== undefined)
        return cached;
    const rec = {};
    for (const a of el.attrs) {
        const t = attrType(TextSchema, a.name);
        const v = a.value;
        if (t === null || v.kind === "code")
            continue;
        if (t.kind === "font" && v.kind === "list") {
            rec[a.name] = v.items.flatMap((i) => (i.kind === "string" ? [i.value] : [])).join(", ");
            continue;
        }
        const c = coerce(t, v);
        if (c.ok)
            rec[a.name] = c.value;
    }
    const frozen = Object.freeze(rec);
    RECORDS.set(el, frozen);
    return frozen;
}
//# sourceMappingURL=style-bundles.js.map