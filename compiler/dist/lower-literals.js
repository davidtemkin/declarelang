// lower-literals — A COMPILED PROGRAM SHIPS VALUES, NOT LITERAL TEXT.
//
// The checker coerces every literal the program writes, in its slot, to the
// value it means: `navy` in a Color slot is 0x000080, `gradient(#F8F8F8, #D8D8D8)`
// a gradient record, `easeOut` in a Motion slot a curve, `bold` in a weight
// slot 700. The runtime used to do all of that again at boot, from the text —
// which put the parsers and their tables (148 color names among them) in every
// build. Instead, while the compile checks the program it will ship, the
// runtime's own coercion reports each value it produced (value.ts
// withLiteralSink), and this pass replaces each written literal with a `value`
// literal carrying it. Nothing is re-derived here: the value is the one the
// runtime's coercion computed, so it cannot disagree with what the runtime would
// have done.
//
// A literal is replaced only when its value is plain data (it crosses the
// program's JSON) and every coercion of it agreed. One that is not stays as
// written; the runtime still coerces it, and a production build keeps the
// parsers for such a program (the `literal-parsing` capability).
import { THEME_PRESETS } from "../../runtime/dist/themes.js";
const LITERAL_KINDS = new Set(["number", "percent", "string", "hexColor", "ident", "call", "list"]);
/** Literal kinds the runtime reads as they are — no coercion to replace. */
const OPAQUE_KINDS = new Set(["code", "path", "query", "subfrom", "schema", "value"]);
/** Plain data that survives the program's JSON unchanged. */
function plain(v) {
    if (v === null || typeof v === "string" || typeof v === "boolean")
        return true;
    if (typeof v === "number")
        return Number.isFinite(v) && !Object.is(v, -0);
    if (Array.isArray(v))
        return v.every(plain);
    if (typeof v !== "object")
        return false;
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null)
        return false;
    return Object.values(v).every((x) => x !== undefined && plain(x));
}
/** What the coercions of each literal produced, collected during the check. */
export class LiteralValues {
    seen = new Map();
    note = (lit, value) => {
        let vs = this.seen.get(lit);
        if (vs === undefined)
            this.seen.set(lit, (vs = []));
        vs.push(value);
    };
    has(lit) { return this.seen.has(lit); }
    /** Why `lit` cannot ship as a value: its coercions disagreed, or the value is
     *  not plain data. Null when it can. */
    whyNot(lit) {
        const vs = this.seen.get(lit);
        if (vs === undefined)
            return "never coerced";
        if (!plain(vs[0]))
            return `not plain data: ${String(vs[0])}`;
        const one = JSON.stringify(vs[0]);
        return vs.every((v) => JSON.stringify(v) === one) ? null : `coerced two ways: ${vs.map((v) => JSON.stringify(v)).join(" / ")}`;
    }
    /** The one value every coercion of `lit` agreed on, if it is plain data. */
    valueOf(lit) {
        const vs = this.seen.get(lit);
        if (vs === undefined || !plain(vs[0]))
            return null;
        const one = JSON.stringify(vs[0]);
        return vs.every((v) => JSON.stringify(v) === one) ? { value: vs[0] } : null;
    }
}
/** Replace every literal in `program` whose value is known with that value, in
 *  place. A literal is replaced whole; a list that is not is walked for items
 *  that are (a bare list's items are coerced one by one); a constructor call
 *  that is not is left whole, since its arguments are its parser's. Returns how
 *  many literals were replaced, and how many the runtime will still coerce from
 *  their written form (coerced during the check, but not to plain data). */
export function lowerLiterals(program, values) {
    let lowered = 0;
    const kept = [];
    const visit = (node) => {
        if (node === null || typeof node !== "object")
            return;
        if (Array.isArray(node)) {
            for (const x of node)
                visit(x);
            return;
        }
        const o = node;
        const kind = typeof o.kind === "string" ? o.kind : null;
        if (kind !== null && OPAQUE_KINDS.has(kind))
            return;
        if (kind !== null && LITERAL_KINDS.has(kind) && "pos" in o) {
            const v = values.valueOf(o);
            if (v !== null) {
                const pos = o.pos;
                for (const k of Object.keys(o))
                    delete o[k];
                o.kind = "value";
                o.value = v.value;
                o.pos = pos;
                lowered++;
                return;
            }
            if (values.has(o))
                kept.push({ pos: o.pos, why: values.whyNot(o) ?? "" });
            if (kind === "list")
                visit(o.items);
            return;
        }
        for (const k of Object.keys(o))
            visit(o[k]);
    };
    visit(program);
    return { lowered, kept };
}
/** `theme = SanFranciscoDark` — a built-in preset named as a literal — ships as
 *  the preset's record. The runtime resolves such a name against the preset
 *  table, which a production build carries only for a program whose bodies name
 *  a preset; resolving it here means the build carries the one record it uses
 *  and no table. A name the program declares itself (`theme Name [ … ]`) is left
 *  as written: the runtime resolves it from the declaration, which ships anyway. */
export function lowerThemeNames(program) {
    const own = new Set((program.themes ?? []).map((t) => t.name));
    let lowered = 0;
    const visit = (node) => {
        if (node === null || typeof node !== "object")
            return;
        if (Array.isArray(node)) {
            for (const x of node)
                visit(x);
            return;
        }
        const o = node;
        const attrs = o.attrs;
        if (Array.isArray(attrs)) {
            for (const a of attrs) {
                const v = a.value;
                if (a.name === "theme" && v !== undefined && v.kind === "ident" && typeof v.name === "string"
                    && !own.has(v.name) && Object.hasOwn(THEME_PRESETS, v.name)) {
                    a.value = { kind: "value", value: THEME_PRESETS[v.name], pos: v.pos };
                    lowered++;
                }
            }
        }
        for (const k of Object.keys(o))
            if (k !== "attrs")
                visit(o[k]);
    };
    visit(program);
    return lowered;
}
//# sourceMappingURL=lower-literals.js.map