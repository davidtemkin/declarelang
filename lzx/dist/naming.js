// naming — LZX identifiers → Declare identifiers, schema-anchored. LZX resolves
// tags/classes case-insensitively, so user names fold to their declared form and
// collisions are reported. Attribute-alias targets and type lookups are anchored
// against the runtime's static schema tables (the retired backgroundColor is not
// a target — the box-fill slot is `fill`).
import { SCHEMAS, eventsOf, eventOfHandler } from "../../runtime/dist/schema.js"; // real export is SCHEMAS (uppercase), verified
const TAG_TABLE = {
    canvas: "App", view: "View", text: "Text", button: "Button",
    simplelayout: "SimpleLayout", dataset: "Dataset",
    // schema-backed exact-equivalent components (no `node` — empty NodeSchema)
    edittext: "TextInput", inputtext: "TextInput", image: "Image",
    animator: "Animator", animatorgroup: "AnimatorGroup", wrappinglayout: "WrappingLayout",
};
const ATTR_TABLE = {
    bgcolor: "fill", fgcolor: "textColor", minheight: "minHeight", minwidth: "minWidth",
    onclick: "onClick", onmouseup: "onMouseUp", oninit: "onInit",
    fontsize: "fontSize", fontweight: "fontWeight", fontfamily: "fontFamily",
    cornerradius: "cornerRadius",
    // OL image source → Declare Image's `source` slot
    src: "source", resource: "source", url: "source",
};
const CONTENT_ATTR = { Button: "label", Text: "text" };
/** The built-in schema's attribute-type kind for tag+attr, walking the base
 *  chain; "unknown" when the tag or attr is not a built-in. */
function schemaKind(declareTag, declareAttr) {
    const start = SCHEMAS[declareTag];
    for (let sc = start; sc; sc = sc.base) {
        const t = sc.attrs[declareAttr];
        if (t) {
            switch (t.kind) {
                // Bare-ident slots: Color (fill/color) and enum tokens (fontWeight,
                // textAlign, stretches, axis) must emit BARE — a quoted "bold" fails
                // enum coercion (verified in plan review).
                case "fill":
                case "color":
                case "enum": return "color";
                case "length": return "length";
                case "number": return "number";
                case "boolean": return "boolean";
                default: return "string";
            }
        }
    }
    return "unknown";
}
export function buildNaming(userClassNames) {
    const canonical = new Map();
    const collide = new Map();
    for (const name of userClassNames) {
        const key = name.toLowerCase();
        if (!canonical.has(key))
            canonical.set(key, name);
        const set = collide.get(key) ?? new Set();
        set.add(name);
        collide.set(key, set);
    }
    const collisions = [];
    for (const [key, set] of collide) {
        if (set.size > 1)
            collisions.push({ canonical: canonical.get(key), lzxNames: [...set] });
    }
    const naming = {
        tagFor(lzxTag) { return TAG_TABLE[lzxTag.toLowerCase()] ?? null; },
        isBuiltinTag(lzxTag) { return lzxTag.toLowerCase() in TAG_TABLE; },
        attrFor(lzxAttr) { return ATTR_TABLE[lzxAttr.toLowerCase()] ?? lzxAttr; },
        attrTypeFor(declareTag, declareAttr) { return schemaKind(declareTag, declareAttr); },
        contentAttrFor(declareTag) { return CONTENT_ATTR[declareTag] ?? null; },
        // Emit PascalCase tags: uppercase the first char of the canonical declared
        // form, preserving internal caps (conditionIcon→ConditionIcon) and the
        // case-insensitive fold (mybox/myBox → one class, emitted MyBox).
        classNameFor(lzxName) { const d = canonical.get(lzxName.toLowerCase()) ?? lzxName; return d.charAt(0).toUpperCase() + d.slice(1); },
        isUserClass(lzxName) { return canonical.has(lzxName.toLowerCase()); },
        hasSchema(declareTag) { return declareTag in SCHEMAS; },
        declaresEvent(declareTag, handlerName) {
            const sc = SCHEMAS[declareTag];
            const ev = eventOfHandler(handlerName); // string | null
            return sc !== undefined && ev !== null && eventsOf(sc).includes(ev);
        },
    };
    return { naming, collisions };
}
//# sourceMappingURL=naming.js.map