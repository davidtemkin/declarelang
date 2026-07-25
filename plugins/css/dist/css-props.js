// The plugin's own CSS-property → View-attribute map + a pure coercion step
// (replaces core's private CSSMAP). Mirrors feat/css-engine's css:/coerce wiring,
// targeting attributes that already exist on View. Colors are numbers here
// (value.ts Color = number | null), so coerceColor's 0xRRGGBB needs no wrapping.
import { coerceColor, coerceLength, coerceNumber, coerceString, coerceWeight } from "./css-coerce.js";
export const PROP_MAP = {
    "left": { attr: "x", coerce: coerceLength },
    "top": { attr: "y", coerce: coerceLength },
    "width": { attr: "width", coerce: coerceLength },
    "height": { attr: "height", coerce: coerceLength },
    "background-color": { attr: "fill", coerce: coerceColor },
    "border-radius": { attr: "cornerRadius", coerce: coerceLength },
    "opacity": { attr: "opacity", coerce: coerceNumber },
    "color": { attr: "textColor", coerce: coerceColor },
    "font-size": { attr: "fontSize", coerce: coerceLength },
    "font-family": { attr: "fontFamily", coerce: coerceString },
    "font-weight": { attr: "fontWeight", coerce: coerceWeight },
    "letter-spacing": { attr: "letterSpacing", coerce: coerceLength },
};
/** PURE: matched declarations → coerced (attr → value) offers. Unmapped
 *  properties and malformed values are dropped. */
export function coerceDecls(decls, map = PROP_MAP) {
    const out = new Map();
    for (const [prop, raw] of decls) {
        const entry = map[prop];
        if (entry === undefined)
            continue;
        const v = entry.coerce(raw);
        if (v === undefined)
            continue;
        out.set(entry.attr, v);
    }
    return out;
}
//# sourceMappingURL=css-props.js.map