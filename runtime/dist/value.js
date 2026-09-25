// The value model — the closed, compiler/kernel-owned vocabulary of literal
// value types (language §6): Color and Length, the plain number / boolean /
// string, and structural enums (named unions like `value Stretch = none |
// width | height | both`). The coercion that turns `navy` into an integer or
// `50%` into a Percent is deliberately imperative and lives here, never in
// Declare source. Each type's `coerce` case owns its "expects …" wording, so
// a type and its diagnostics are one thing and cannot drift apart.
import { diag, strokeShapeMessage } from "./errors.js";
import { CSS_COLORS } from "./css-colors.js";
import { validatePathData } from "./shape.js";
import { motionToken, MOTION_TOKENS } from "./animate.js";
import { faceSourceLiteral, faceWeightLiteral } from "./face-literal.js";
import { coerceFilter, coerceRadialConic } from "./effects.js";
import { coerceStrokeSides, sidesEqual, sidesUniform } from "./stroke-sides.js";
/** The base of the translucent encoding — see the Color doc above. */
const ALPHA = 0x100000000;
/** Encode rgb (0xRRGGBB) + alpha (0…255) as one Color number. */
export function colorWithAlpha(rgb, a) {
    return a >= 0xff ? rgb : ALPHA + rgb * 0x100 + a;
}
/** The CSS spelling of a gradient — background, mask-image and text-fill share it. */
export function gradientCss(g) {
    const stops = g.stops.map((st) => colorToCss(st.color) + (st.offset === null ? "" : ` ${st.offset * 100}%`)).join(", ");
    const at = `${(g.cx ?? 0.5) * 100}% ${(g.cy ?? 0.5) * 100}%`;
    if (g.kind === "radial") {
        // the reach scales every placed stop (an unplaced last stop lands at r)
        const r = g.r ?? 1;
        const scaled = g.stops.map((st, i) => colorToCss(st.color) + " " + ((st.offset ?? (i === g.stops.length - 1 ? 1 : i === 0 ? 0 : NaN)) * r * 100).toFixed(3) + "%")
            .map((s) => s.replace(" NaN%", ""));
        return `radial-gradient(circle farthest-corner at ${at}, ${scaled.join(", ")})`;
    }
    if (g.kind === "conic")
        return `conic-gradient(from ${g.angle}deg at ${at}, ${stops})`;
    return `linear-gradient(${g.angle}deg, ${stops})`;
}
/** Narrow a Fill to its gradient arm. */
export function isGradient(f) {
    return typeof f === "object" && f !== null;
}
/** The uniform Stroke this value is on all four sides, or null when it is
 *  bare on all four — and `undefined` when the sides genuinely differ, which
 *  is the signal to take a painter's per-side path. Keeps the overwhelmingly
 *  common uniform case on the one-ring fast path in both backends; the FOUR-side
 *  arm lives in stroke-sides.ts, one module for everything four sides mean. */
export function strokeUniform(s) {
    if (s === null || !Array.isArray(s))
        return s;
    return sidesUniform(s);
}
export function isMaskGradient(m) {
    return typeof m === "object" && m !== null && "stops" in m;
}
export function filterList(v) {
    if (v === null || v === undefined)
        return EMPTY_FILTERS;
    return Array.isArray(v) ? v : [v];
}
const EMPTY_FILTERS = Object.freeze([]);
// ── The value constructors' RUNTIME forms — the same names inside `{ }`
// bodies (expr.ts puts them in scope), producing the same immutable
// plain-data records the literal grammar coerces to. One asymmetry, recorded:
// at runtime a leading number is indistinguishable from a color (no written
// form to consult), so the runtime gradient spells its optional angle as the
// string "45deg" — CSS's own spelling.
export function gradient(...args) {
    let angle = 180;
    if (typeof args[0] === "string") {
        const m = /^(-?\d+(?:\.\d+)?)deg$/.exec(args[0]);
        if (m === null)
            throw new Error(`gradient: an angle is written "45deg", got "${args[0]}"`);
        angle = parseFloat(m[1]);
        args = args.slice(1);
    }
    if (args.length < 2)
        throw new Error("gradient needs at least two stops");
    const stops = args.map((a) => {
        if (typeof a === "number")
            return Object.freeze({ offset: null, color: a });
        if (typeof a === "object" && a !== null && "color" in a)
            return a;
        throw new Error(diag `a gradient stop is a color or stop(offset, color)`);
    });
    return Object.freeze({ angle, stops: Object.freeze(stops) });
}
// radialGradient / conicGradient and the filter functions live in effects.ts —
// carried by a production build only when a program names one.
export const stop = (offset, color) => Object.freeze({ offset, color });
/** A width that cannot be a width. A stroke is drawn INSIDE the box, so a value
 *  past a few thousand points is never art — and a `Color` is a number at
 *  runtime, so `stroke(theme.line, 1)` produces exactly this: a fourteen-million
 *  point stroke, which paints as a filled black box, with nothing to say so.
 *  Reported once per distinct pair, because the constructor runs inside a
 *  constraint and may re-evaluate on every settle. (A warning, not a refusal:
 *  the value is legal, it is only certainly not what was meant.) */
const MAX_SANE_STROKE = 4096;
const swapped = new Set();
function checkOrder(fn, width, color) {
    if (!(typeof width === "number") || width <= MAX_SANE_STROKE)
        return;
    const key = `${fn}:${width}:${String(color)}`;
    if (swapped.has(key))
        return;
    swapped.add(key);
    const looksSwapped = Number.isInteger(width) && width <= 0xffffff && typeof color === "number" && color <= MAX_SANE_STROKE;
    console.warn(looksSwapped
        ? diag `[Declare] ${fn}(${width}, ${String(color)}) — the arguments look reversed: it is ${fn}(width, color), and ${width} is 0x${width.toString(16).toUpperCase()} as a colour. A stroke is drawn inside the box, so this paints as a filled rectangle`
        : diag `[Declare] ${fn}(${width}, …) — a stroke width of ${width} is drawn inside the box, so it paints as a filled rectangle. ${fn}(width, color) takes the width first`);
}
export const stroke = (width, color) => { checkOrder("stroke", width, color); return Object.freeze({ width, color }); };
export const outline = (width, color) => { checkOrder("outline", width, color); return Object.freeze({ width, color }); };
export const shadow = (dx, dy, blur, color) => Object.freeze({ fn: "shadow", dx, dy, blur, color });
/** The CSS spelling of a filter list — DOM `filter:`/`backdrop-filter:` and
 *  canvas `ctx.filter` share it. `scale` maps view units to the target's
 *  (device px on canvas, 1 on the DOM where CSS scales with the transform).
 *  `colorize` has no CSS function: the DOM realizes it as an SVG `feColorMatrix`
 *  reference the backend registers (`tintRef`), canvas as a `source-in` pass
 *  after the blit — both leave it out of this string. */
export function filterCss(list, scale = 1, tintRef) {
    const parts = [];
    for (const f of list) {
        switch (f.fn) {
            case "blur":
                parts.push(`blur(${f.radius * scale}px)`);
                break;
            case "brightness":
            case "contrast":
            case "saturate":
            case "grayscale":
            case "invert":
            case "sepia":
                parts.push(`${f.fn}(${f.amount})`);
                break;
            case "hueRotate":
                parts.push(`hue-rotate(${f.degrees}deg)`);
                break;
            // CSS drop-shadow's third length is the Gaussian's σ; `shadow(…)`'s blur is
            // the box-shadow radius (2σ) at every site, so one value looks the same
            // on a box, on glyphs, and in a filter list — halve it here.
            case "shadow":
                parts.push(`drop-shadow(${f.dx * scale}px ${f.dy * scale}px ${(f.blur * scale) / 2}px ${colorToCss(f.color)})`);
                break;
            case "colorize":
                if (tintRef !== undefined)
                    parts.push(tintRef(f.color));
                break;
        }
    }
    return parts.length === 0 ? "none" : parts.join(" ");
}
/** How far a filter's output can reach past the painted box, in view units —
 *  a blur's 3σ, a shadow's offset plus its 3σ. The over-scan a backdrop sample
 *  and an offscreen group both pad by (graphics-pass.md §0, the bleed rule). */
export function filterBleed(list) {
    let pad = 0;
    for (const f of list) {
        if (f.fn === "blur")
            pad += f.radius * 3;
        else if (f.fn === "shadow")
            pad = Math.max(pad, Math.max(Math.abs(f.dx), Math.abs(f.dy)) + f.blur * 3);
    }
    return Math.ceil(pad);
}
/** The largest blur radius in a list — what a frost's sample over-scans by. */
export function filterBlur(list) {
    let r = 0;
    for (const f of list)
        if (f.fn === "blur")
            r += f.radius;
    return r;
}
// Structural equality for the decoration values (ruled: the === write gate
// extends to shallow structural equality for these — a constraint
// re-producing an equal record stops the cascade like a scalar). Each is
// called by the attribute layer only when identity already differed.
export function shadowEqual(a, b) {
    return a !== null && b !== null &&
        a.dx === b.dx && a.dy === b.dy && a.blur === b.blur && a.color === b.color;
}
export function strokeEqual(a, b) {
    if (a === null || b === null)
        return false;
    if (Array.isArray(a) || Array.isArray(b))
        return sidesEqual(a, b);
    const s = a;
    const t = b;
    return s.width === t.width && s.color === t.color;
}
export function outlineEqual(a, b) {
    return a !== null && b !== null && a.width === b.width && a.color === b.color;
}
export function filterEqual(a, b) {
    if (a === b)
        return true;
    if (a.fn !== b.fn)
        return false;
    switch (a.fn) {
        case "blur": return a.radius === b.radius;
        case "hueRotate": return a.degrees === b.degrees;
        case "colorize": return a.color === b.color;
        case "shadow": return shadowEqual(a, b);
        default: return a.amount === b.amount;
    }
}
/** Structural equality over a filter value in any written form (one, a list, null). */
export function filtersEqual(a, b) {
    const la = filterList(a), lb = filterList(b);
    if (la.length !== lb.length)
        return false;
    for (let i = 0; i < la.length; i++)
        if (!filterEqual(la[i], lb[i]))
            return false;
    return true;
}
export function backdropEqual(a, b) {
    return filtersEqual(a, b);
}
export function fillEqual(a, b) {
    if (!isGradient(a) || !isGradient(b))
        return false; // unequal solids already failed ===
    return a.angle === b.angle && a.stops.length === b.stops.length &&
        a.stops.every((s, i) => s.offset === b.stops[i].offset && s.color === b.stops[i].color);
}
export function isAlign(v) {
    return typeof v === "object" && v !== null && "align" in v;
}
export function radiusCorners(r) {
    return typeof r === "number" ? [r, r, r, r] : [r[0], r[1], r[2], r[3]];
}
export function radiusIsSquare(r) {
    return typeof r === "number" ? r <= 0 : r[0] <= 0 && r[1] <= 0 && r[2] <= 0 && r[3] <= 0;
}
export function radiusMax(r) {
    return typeof r === "number" ? r : Math.max(r[0], r[1], r[2], r[3]);
}
/** The four sides of an Inset — top, right, bottom, left. Negative values are
 *  clamped to 0: an inset that grew the box would make a layout place children
 *  outside the view it arranges. */
export function insetSides(i) {
    const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
    return typeof i === "number" ? [n(i), n(i), n(i), n(i)] : [n(i[0]), n(i[1]), n(i[2]), n(i[3])];
}
/** ONE side of an Inset, without materializing the other three — the hot pair:
 *  every child's position push and every descent of the hit walk asks for the
 *  LEADING inset (left on x, top on y), and the answer is almost always the
 *  literal 0 an unpadded view carries. Same clamp as insetSides. */
export function insetLead(i, axis) {
    if (typeof i === "number")
        return Number.isFinite(i) && i > 0 ? i : 0;
    const v = axis === "x" ? i[3] : i[0];
    return Number.isFinite(v) && v > 0 ? v : 0;
}
/** True when this inset takes nothing off any side — the zero-cost path a
 *  layout takes when nobody asked for padding. */
export function insetIsZero(i) {
    const [t, r, b, l] = insetSides(i);
    return t === 0 && r === 0 && b === 0 && l === 0;
}
export function radiusFit(r, w, h) {
    const c = radiusCorners(r).map((v) => Math.max(0, v));
    const [tl, tr, br, bl] = c;
    const over = (edge, sum) => (sum > 0 ? edge / sum : 1);
    const f = Math.min(1, over(w, tl + tr), over(w, bl + br), over(h, tl + bl), over(h, tr + br));
    return f >= 1 ? c : [tl * f, tr * f, br * f, bl * f];
}
/** Narrow an AttrValue to the Percent arm (no longer the only object in the
 *  union since decoration values landed — the key is the discriminant). */
export function isPercent(v) {
    return typeof v === "object" && v !== null && "percent" in v;
}
/** Declare an enum attribute type: `enumType("Stretch", "none", "width", …)`
 *  — how §6's named unions declare. Built-in consumers: Image.stretches and
 *  Text.fontWeight (R3); user unions and Align slot in as pure data. */
export function enumType(name, ...tokens) {
    return { kind: "enum", name, tokens };
}
/** An enum that also takes a number in `[min, max]` — see AttrType's `numeric`. */
export function numericEnumType(name, range, ...tokens) {
    return { kind: "enum", name, tokens, numeric: range };
}
// What a user attribute declaration may name as its type (language §4:
// "ordinary TypeScript types plus the built-in value vocabulary of §6") —
// the TS primitives spelled as TS spells them, the value types capitalized
// as the doc capitalizes them. Arbitrary TS types are the tsc compiler
// path's surface; user `value` unions are their own future construct.
const DECLARED_TYPES = {
    number: { kind: "number" },
    string: { kind: "string" },
    boolean: { kind: "boolean" },
    Color: { kind: "color" },
    Length: { kind: "length" },
    Radius: { kind: "radius" },
    Shape: { kind: "shape" },
    // An Inset (`View.padding`) is the same LITERAL shape as a Radius — one
    // number, or four clockwise — and rides the same routes: the coercer and the
    // bare-four-item-list path are the ones a Radius already has. It is its OWN
    // KIND because the names mean different things to a reader (corners vs edges,
    // and an Inset's four start at the TOP), and only a kind carries that to the
    // scaffold and from there to the reference.
    Inset: { kind: "inset" },
    // The records door (planes.md §4 — components arrange records): a slot
    // holding an ARRAY of records (`items`), a plain OBJECT record, or a VIEW
    // reference (`opener`). Literal defaults are null-only — structured values
    // arrive from `{ }` bindings and runtime writes; the names stay precise
    // (no `any` in the vocabulary) so a declaration still documents intent.
    array: { kind: "array" },
    object: { kind: "object" },
    View: { kind: "view" },
    // The design-token record widgets style off (`theme: Theme = provided("theme",
    // …)` on Control). A named record type — declarable so the library reads
    // `this.theme.accent` typed, not `any`.
    Theme: { kind: "record", name: "Theme" },
    // Built-in VALUE ENUMS, declarable by name so a library-authored class keeps
    // the bare-token use-site surface (`axis = x`, `align = center`) — these are
    // as built-in as Color. (User-authored unions remain their own future
    // construct, per the note above.)
    Axis: enumType("Axis", "x", "y"),
    // A flow's MAIN-axis justification (`justify = center` centres a short row)
    // and a layout's CROSS-axis alignment — CSS's split of the two words. `none`
    // is a cross axis the strategy leaves to the children (SimpleLayout's
    // default); `baseline` aligns children by the baseline each DECLARES.
    Justify: enumType("Justify", "start", "center", "end", "fill"),
    CrossAlign: enumType("CrossAlign", "none", "start", "center", "end", "baseline"),
};
/** Resolve a written declaration type name (`count: number`), or null when
 *  the name is not in the declarable vocabulary. */
/** An AUTHORED literal union (`"idle" | "loading"`) is an enum whose NAME is
 *  the written union text — that text is the discriminator between it and a
 *  built-in vocabulary (Axis, Motion), whose name is an identifier. Every
 *  consumer asks this one question here, not with its own `startsWith('"')`. */
export const isAuthoredUnion = (name) => name.startsWith('"');
/** The members of a written string-literal union, or null when `text` is not
 *  one. Quote-AWARE: the members are extracted as JSON string literals and
 *  must reconstruct the text exactly, so a member containing `|` (`"a|b" |
 *  "c"`) parses correctly — a bare split on `|` did not (review, 2026-09-04). */
export function parseLiteralUnion(text) {
    if (!isAuthoredUnion(text))
        return null;
    const lits = text.match(/"(?:[^"\\]|\\.)*"/g);
    if (lits === null || lits.join(" | ") !== text.trim())
        return null;
    const out = [];
    for (const l of lits) {
        try {
            out.push(JSON.parse(l));
        }
        catch {
            return null;
        }
    }
    return out;
}
export function declaredType(name) {
    return Object.hasOwn(DECLARED_TYPES, name) ? DECLARED_TYPES[name] : null;
}
/** The declarable type names, for the checker's "expected one of …" message. */
export const DECLARED_TYPE_NAMES = Object.keys(DECLARED_TYPES);
const ok = (value) => ({ ok: true, value });
const fail = (expected, found) => ({ ok: false, expected, found });
/** Coerce a parsed literal to an attribute type. Pure — safe for the checker
 *  to call speculatively; instantiate assigns the same result. */
export function coerce(type, lit) {
    switch (type.kind) {
        case "length":
            if (lit.kind === "number") {
                if (lit.hex && lit.hexLen === 8)
                    return fail(diag `a Length`, diag `${describeLiteral(lit)} (an 8-digit 0x is an alpha color, not a number — write a number in decimal)`);
                return ok(lit.value);
            }
            if (lit.kind === "percent")
                return ok({ percent: lit.value });
            if (lit.kind === "ident" && (lit.name === "center" || lit.name === "end"))
                return ok({ align: lit.name });
            return fail(diag `a Length (a number of pixels, a percent like 50%, or the position literals center | end on x/y)`);
        case "number":
            if (lit.kind === "number") {
                if (lit.hex && lit.hexLen === 8)
                    return fail(diag `a number`, diag `${describeLiteral(lit)} (an 8-digit 0x is an alpha color, not a number — write a number in decimal)`);
                return ok(lit.value);
            }
            return fail(diag `a number`);
        case "radius":
        case "inset":
            // One value, or four clockwise — the house pattern (a Radius's four are
            // corners from the top-left, an Inset's edges from the top). On a view's
            // own attribute a bare list is routed around coercion like every list
            // slot (check.ts / instantiate.ts); inside a component-valued member —
            // `layout: SimpleLayout [ padding = [ 8, 12, 16, 20 ] ]` — this IS the
            // path, so the four-item form is admitted here too.
            if (lit.kind === "number")
                return ok(lit.value);
            if (lit.kind === "list" && lit.items.length === 4 && lit.items.every((it) => it.kind === "number")) {
                return ok(Object.freeze(lit.items.map((it) => (it.kind === "number" ? it.value : 0))));
            }
            return fail(diag `a number for all four, or a list of four numbers — clockwise from the top (a Radius's corners start at the top-left; an Inset's edges at the top)`);
        case "boolean":
            if (lit.kind === "ident" && (lit.name === "true" || lit.name === "false")) {
                return ok(lit.name === "true");
            }
            return fail(diag `a boolean (true or false)`);
        case "string":
            if (lit.kind === "string")
                return ok(lit.value);
            return fail(diag `a string`);
        case "color":
            return coerceColor(lit);
        case "shape":
            return coerceShape(lit);
        case "dataschema":
            // The parsed ShapeField declarations pass through as plain data; null
            // is "no schema" (the default — schema presence is the only switch).
            // An array-root document (`schema = Task[]`) passes as the wrapper
            // shape-resolve.ts defines, so validation knows the root is an array.
            if (lit.kind === "schema")
                return ok(lit.arrayRoot === true ? { arrayRoot: true, fields: lit.shape } : lit.shape);
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(diag `a schema shape ([ field: type, rows[]: [ … ] ]), or null for none`);
        case "enum":
            // SPELL A MEMBER THE WAY ITS DECLARATION SPELLS IT (DT's ruling,
            // 2026-09-05). A built-in vocabulary declares `y`, so `axis = y` and
            // never `"y"`; an AUTHORED literal union declares `"idle"`, so
            // `phase = "idle"` and never `idle`. One spelling each — the bare
            // token was accepted for authored unions too until the ruling, and two
            // spellings for one thing is the leak the language does not otherwise
            // allow. The written union text is the discriminator (isAuthoredUnion).
            if (isAuthoredUnion(type.name)) {
                const members = type.tokens.map((t) => JSON.stringify(t)).join(" | ");
                if (lit.kind === "string" && type.tokens.includes(lit.value))
                    return ok(lit.value);
                if (lit.kind === "ident" && type.tokens.includes(lit.name)) {
                    return fail(diag `one of ${members} — a literal union's member is written in quotes, in a slot as in { }: "${lit.name}"`);
                }
                return fail(diag `one of ${members}`);
            }
            if (lit.kind === "ident" && type.tokens.includes(lit.name))
                return ok(lit.name);
            if (type.numeric !== undefined && lit.kind === "number") {
                const [lo, hi] = type.numeric;
                if (Number.isFinite(lit.value) && lit.value >= lo && lit.value <= hi)
                    return ok(lit.value);
                return fail(diag `a ${type.name} (one of ${type.tokens.join(" | ")}, or a number ${lo}–${hi})`);
            }
            // Vowel-aware article: R7's Axis is the first enum that needs "an".
            return fail(diag `${/^[AEIOU]/.test(type.name) ? "an" : "a"} ${type.name} (one of ${type.tokens.join(" | ")}${type.numeric !== undefined ? `, or a number ${type.numeric[0]}–${type.numeric[1]}` : ""})`);
        case "fn":
            // Like a component slot: `null` is the one literal form ("no callback").
            // A real function arrives by assignment from a { } body, never as a
            // literal in the declarative layer.
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(diag `a function ${type.written}, or null for none`);
        case "component":
            // `null` is the one literal form ("no layout"); the instance form is
            // the member shape `layout: SimpleLayout [ … ]`, which never reaches
            // coercion (check.ts routes it to the component-value path).
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(diag `a ${type.of} component (a member like 'layout: SimpleLayout [ … ]'), or null for none`);
        case "cursor":
            // `null` is the one coercible form ("no cursor"); `:path` and `{ }`
            // are standing relationships check.ts routes before coercion.
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(diag `a datapath (':field.path', a { } expression yielding a place in a dataset, or null)`);
        case "array":
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            // A list of names — `trackChanges = [ "failed" ]`, `listenTo = [ "delta" ]` —
            // is a literal on every node, not only where the view walk reads it.
            if (type.of === "string" && lit.kind === "list" && lit.items.every((it) => it.kind === "string")) {
                return ok(lit.items.map((it) => it.value));
            }
            return fail(diag `an array — a { } constraint (plain TS: items = { [ … ] }), or null`);
        case "object":
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(diag `an object — a { } constraint (plain TS), or null`);
        case "view":
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(diag `a View reference — assigned at runtime (an opener, a target), or null`);
        case "slotref":
            // The `attribute` token names a slot on the target; it stays a bare
            // string at runtime. That the named slot exists and is numeric is
            // checked against the TARGET's schema at the element walk (check.ts).
            if (lit.kind === "ident" && lit.name !== "null")
                return ok(lit.name);
            return fail(diag `a slot name written as a bare token (like height or x)`);
        case "record":
            // A DATA record (schema-typed, `sel: Task = null`): null is the one
            // literal form — the slot may be empty before anything feeds it, exactly
            // like a component slot. A token record (Theme) arrives as a named theme
            // (`theme = Cupertino` — an ident routed and resolved before coercion), a
            // `{ }` binding, or an inline `Theme [ … ]` record.
            if (type.data === true) {
                if (lit.kind === "ident" && lit.name === "null")
                    return ok(null);
                return fail(diag `a ${type.name} record (provide one with a { } constraint), or null for none`);
            }
            return fail(diag `a ${type.name} (a named theme, a { } constraint, or a Theme [ … ] record)`);
        case "fill":
            return coerceFill(lit);
        case "stroke":
            return coerceStroke(lit);
        case "outline":
            return coerceOutline(lit);
        case "shadow":
            return coerceShadow(lit);
        case "filter":
            return coerceFilter(lit);
        case "mask": {
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            if (lit.kind !== "call")
                return fail(MASK);
            const g = coerceFill(lit);
            if (!g.ok || typeof g.value !== "object" || g.value === null)
                return fail(MASK, g.ok ? undefined : g.found);
            return g;
        }
        case "motion":
            return coerceMotion(lit);
        case "font":
            // A family string is the literal form (a list joins in check.ts/instantiate.ts
            // before coercion); a Font object arrives from a { }.
            if (lit.kind === "string")
                return ok(lit.value);
            return fail(diag `a family string like "Helvetica, sans-serif" — or a Font, written in a { } (fontFamily = { app.brand })`);
        case "faceSource": {
            // a source string, or the list of them tried in order
            const r = faceSourceLiteral(lit);
            return "error" in r ? fail(r.error) : ok(r.value);
        }
        case "faceWeight": {
            // a token, a number, or a variable font's [lo, hi]
            const r = faceWeightLiteral(lit);
            return "error" in r ? fail(r.error) : ok(r.value);
        }
    }
}
// The literal forms for Color: navy / #354D5B / 0x354D5B / null (language
// §6), plus the ruled alpha forms #RGBA / #RRGGBBAA (`0x…` stays 6-digit
// opaque — the R2 ruling intact; see the Color doc). A decimal number is
// rejected on purpose: the doc's forms are closed, and `fill = 6702939`
// hides its channels.
const COLOR = diag `a Color (a name like navy, #RGB, #RRGGBB, #RGBA, #RRGGBBAA, 0xRRGGBB, or null)`;
function coerceColor(lit) {
    switch (lit.kind) {
        case "number":
            if (!lit.hex)
                return fail(COLOR, diag `${describeLiteral(lit)} (write a color in hex: 0x… or #…)`);
            // 0xRRGGBBAA — the 0x twin of #RRGGBBAA: 8 hex digits carry alpha,
            // riding the same translucent encoding (…FF normalizes to opaque rgb).
            if (lit.hexLen === 8)
                return ok(colorWithAlpha((lit.value >>> 8) & 0xffffff, lit.value & 0xff));
            if (!Number.isInteger(lit.value) || lit.value < 0 || lit.value > 0xffffff) {
                return fail(COLOR, diag `${describeLiteral(lit)} (outside 0x000000–0xFFFFFF)`);
            }
            return ok(lit.value);
        case "hexColor": {
            const hex = lit.raw.slice(1);
            if (!/^[0-9a-fA-F]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) {
                return fail(COLOR, diag `'${lit.raw}' (a hex color is 3, 4, 6, or 8 hex digits)`);
            }
            // Short forms double their digits (CSS); a trailing alpha pair rides
            // the translucent encoding (…FF normalizes to plain opaque rgb).
            const long = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
            const rgb = parseInt(long.slice(0, 6), 16);
            return ok(long.length === 8 ? colorWithAlpha(rgb, parseInt(long.slice(6), 16)) : rgb);
        }
        case "ident": {
            if (lit.name === "null")
                return ok(null);
            // CSS keywords are case-insensitive; own-key guard so a name like
            // `constructor` can't reach Object.prototype through the table.
            const key = lit.name.toLowerCase();
            if (Object.hasOwn(CSS_COLORS, key))
                return ok(CSS_COLORS[key]);
            return fail(COLOR, diag `'${lit.name}' (not a CSS color name)`);
        }
        default:
            return fail(COLOR);
    }
}
// ── Decoration values ───────────────────────────────────────────────────────
//
// The literal grammar is the ruled CONSTRUCTOR form — `name(args)`, parallel
// to how `50%` and `#354D5B` are typed literal forms — with args themselves
// literals (colors in any Color form, numbers, nested `stop(…)`). The same
// names are ordinary functions inside `{ }` bodies (expr.ts puts them in
// scope), so one vocabulary serves both lexical homes.
export const FILL = diag `a Fill (a Color, gradient(#F8F8F8, #D8D8D8), gradient(angle, …stops), or null)`;
const STROKE = strokeShapeMessage(); // errors.ts — one sentence, shared with the typecheck's report of the same mistake made inside a { }
const SHADOW = diag `a Shadow (shadow(dx, dy, blur, color), or null)`;
/** A constructor argument as a plain color number (no null). */
export function argColor(lit) {
    const c = coerceColor(lit);
    return c.ok && typeof c.value === "number" ? c.value : null;
}
export function argNumber(lit) {
    return lit.kind === "number" ? lit.value : null;
}
/** The stops of a written gradient call (after its geometry arguments). */
export function coerceStops(args) {
    const stops = [];
    for (const a of args) {
        if (a.kind === "call" && a.name === "stop") {
            const offset = a.args.length === 2 ? argNumber(a.args[0]) : null;
            const color = a.args.length === 2 ? argColor(a.args[1]) : null;
            if (offset === null || color === null)
                return diag `a stop is stop(offset, color) — offset 0…1, color a Color`;
            stops.push(Object.freeze({ offset, color }));
            continue;
        }
        const color = argColor(a);
        if (color === null)
            return diag `a gradient stop is a color or stop(offset, color)`;
        stops.push(Object.freeze({ offset: null, color }));
    }
    if (stops.length < 2)
        return diag `at least two stops`;
    return stops;
}
function coerceGradientCall(lit) {
    return lit.name === "radialGradient" || lit.name === "conicGradient" ? coerceRadialConic(lit) : null;
}
function coerceFill(lit) {
    if (lit.kind === "call") {
        const rc = coerceGradientCall(lit);
        if (rc !== null)
            return rc;
        if (lit.name !== "gradient")
            return fail(FILL, diag `'${lit.name}(…)' (not a fill constructor)`);
        const args = [...lit.args];
        // An optional leading DECIMAL number is the angle (degrees, CSS compass —
        // 0 up, clockwise; default 180 = top → bottom). Hex-written numbers are
        // colors — the written form disambiguates, exactly as it types Color. A
        // leading `"45deg"` STRING is also an angle — the spelling the runtime
        // `gradient()` accepts — so the same literal coerces whether it is evaluated
        // (a { } value) or read statically (a `style` bundle field). Both → the angle.
        let angle = 180;
        if (args.length > 0) {
            const a0 = args[0];
            if (a0.kind === "number" && !a0.hex) {
                angle = argNumber(args.shift());
            }
            else if (a0.kind === "string") {
                const m = a0.value.match(/^\s*(-?\d+(?:\.\d+)?)\s*deg\s*$/);
                if (m) {
                    angle = parseFloat(m[1]);
                    args.shift();
                }
            }
        }
        const stops = [];
        for (const a of args) {
            if (a.kind === "call" && a.name === "stop") {
                const offset = a.args.length === 2 ? argNumber(a.args[0]) : null;
                const color = a.args.length === 2 ? argColor(a.args[1]) : null;
                if (offset === null || color === null) {
                    return fail(FILL, diag `a stop is stop(offset, color) — offset 0…1, color a Color`);
                }
                stops.push({ offset, color });
                continue;
            }
            const color = argColor(a);
            if (color === null)
                return fail(FILL, diag `${describeLiteral(a)} (a gradient stop is a Color or stop(offset, color))`);
            stops.push({ offset: null, color });
        }
        if (stops.length < 2)
            return fail(FILL, diag `a gradient needs at least two stops`);
        return ok({ angle, stops });
    }
    const c = coerceColor(lit); // the solid case: any Color form coerces
    return c.ok ? c : fail(FILL, c.found);
}
function coerceStroke(lit) {
    // The per-side form: four, clockwise from the top, `null` for a bare side.
    // A list reaches coercion whole (like a filter list); stroke-sides.ts owns
    // the shape check, so the type and its diagnostic stay one thing.
    if (lit.kind === "list")
        return coerceStrokeSides(lit, oneStroke, STROKE);
    return oneStroke(lit);
}
function oneStroke(lit) {
    if (lit.kind === "ident" && lit.name === "null")
        return ok(null);
    if (lit.kind !== "call" || lit.name !== "stroke")
        return fail(STROKE);
    const width = lit.args.length === 2 ? argNumber(lit.args[0]) : null;
    const color = lit.args.length === 2 ? argColor(lit.args[1]) : null;
    if (width === null || color === null || width < 0)
        return fail(STROKE);
    return ok({ width, color });
}
function coerceOutline(lit) {
    if (lit.kind === "ident" && lit.name === "null")
        return ok(null);
    if (lit.kind !== "call" || lit.name !== "outline")
        return fail(diag `an outline (outline(width, color))`);
    const width = lit.args.length === 2 ? argNumber(lit.args[0]) : null;
    const color = lit.args.length === 2 ? argColor(lit.args[1]) : null;
    if (width === null || color === null || width < 0)
        return fail(diag `an outline (outline(width, color))`);
    return ok({ width, color });
}
export function coerceShadow(lit) {
    if (lit.kind === "ident" && lit.name === "null")
        return ok(null);
    if (lit.kind !== "call" || lit.name !== "shadow")
        return fail(SHADOW);
    if (lit.args.length !== 4)
        return fail(SHADOW);
    const [dx, dy, blur] = lit.args.slice(0, 3).map(argNumber);
    const color = argColor(lit.args[3]);
    if (dx === null || dy === null || blur === null || color === null || blur < 0)
        return fail(SHADOW);
    return ok(shadow(dx, dy, blur, color));
}
const MASK = diag `a mask — a gradient (gradient(…), radialGradient(…), conicGradient(…); its alpha masks the view), a stencil view from a { } constraint (mask = { stencil }), or null`;
// ── Motion (animation.md §1) ─────────────────────────────────────────────────
//
// A named token OR a value constructor — both forms already in the grammar,
// so this adds a type, not syntax. Tokens resolve through animate.ts's
// motionToken (kept as the single source of truth); the four constructors
// (cubicBezier / back / steps / laszlo) validate their args here, next to the
// stroke/shadow coercers whose shape they share.
const MOTION = `a Motion (a named curve like easeBoth, quartOut, expoIn, or laszloBoth; or a constructor: ` +
    `cubicBezier(x1, y1, x2, y2), back(overshoot), steps(n[, jumpStart | jumpEnd]), laszlo(beginPole, endPole))`;
function coerceMotion(lit) {
    if (lit.kind === "ident") {
        const m = motionToken(lit.name);
        return m ? ok(m) : fail(MOTION, diag `'${lit.name}' (not one of ${MOTION_TOKENS.join(" | ")})`);
    }
    if (lit.kind !== "call")
        return fail(MOTION);
    switch (lit.name) {
        case "cubicBezier": {
            if (lit.args.length !== 4)
                return fail(MOTION, diag `cubicBezier(x1, y1, x2, y2) takes four numbers`);
            const [x1, y1, x2, y2] = lit.args.map(argNumber);
            if (x1 === null || y1 === null || x2 === null || y2 === null)
                return fail(MOTION, diag `cubicBezier(x1, y1, x2, y2) — four numbers`);
            if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1)
                return fail(MOTION, diag `cubicBezier x-coordinates must be in [0, 1] (time is monotonic)`);
            return ok({ k: "bezier", x1, y1, x2, y2 });
        }
        case "back": {
            const s = lit.args.length === 1 ? argNumber(lit.args[0]) : null;
            if (s === null)
                return fail(MOTION, diag `back(overshoot) — one number (try back(1.7))`);
            return ok({ k: "back", dir: "both", overshoot: s });
        }
        case "steps": {
            if (lit.args.length < 1 || lit.args.length > 2)
                return fail(MOTION, diag `steps(n[, jumpStart | jumpEnd])`);
            const n = argNumber(lit.args[0]);
            if (n === null || !Number.isInteger(n) || n < 1)
                return fail(MOTION, diag `steps(n, …) — n a positive integer`);
            let jump = "end";
            if (lit.args.length === 2) {
                const j = lit.args[1];
                if (j.kind !== "ident" || (j.name !== "jumpStart" && j.name !== "jumpEnd"))
                    return fail(MOTION, diag `steps' second argument is jumpStart or jumpEnd`);
                jump = j.name === "jumpStart" ? "start" : "end";
            }
            return ok({ k: "steps", n, jump });
        }
        case "laszlo": {
            if (lit.args.length !== 2)
                return fail(MOTION, diag `laszlo(beginPole, endPole) — two numbers`);
            const [bp, ep] = lit.args.map(argNumber);
            if (bp === null || ep === null || bp <= 0 || ep <= 0)
                return fail(MOTION, diag `laszlo(beginPole, endPole) — two positive numbers`);
            return ok({ k: "laszlo", beginPole: bp, endPole: ep });
        }
        default:
            return fail(MOTION, diag `'${lit.name}(…)' (not a motion constructor)`);
    }
}
// A Shape's literal is SVG path *data* carried in a string (the `d`
// mini-grammar only — the rendering model's ruling), or `null` for "no
// shape". Path2D and clip-path both swallow malformed data silently, so the
// validation here is where a bad path becomes a positioned message instead
// of a mysteriously blank region.
const SHAPE = diag `a Shape (SVG path data in a string, like "M0 0 L80 0 L40 60 Z", or null)`;
function coerceShape(lit) {
    if (lit.kind === "ident" && lit.name === "null")
        return ok(null);
    // The BOX-CLIP form (tabslider-gaps.md gap 1): `clip = true` clips a view's
    // subtree to its own box (0,0,width,height), tracking width/height so it
    // follows an animating height every frame; `false` = no clip. It rides the
    // same `clip` slot as an explicit Shape path (which clips to a declared
    // shape) — the runtime branches on the coerced value's type (view.ts).
    if (lit.kind === "ident" && (lit.name === "true" || lit.name === "false")) {
        return ok(lit.name === "true");
    }
    if (lit.kind !== "string")
        return fail(SHAPE);
    const problem = validatePathData(lit.value);
    if (problem !== null)
        return fail(SHAPE, diag `${describeLiteral(lit)} (${problem})`);
    return ok(lit.value);
}
/** A literal as a message names it — "got the string \"wide\"". Hex-written
 *  numbers read back as hex, so a color message shows the channels. */
export function describeLiteral(lit) {
    switch (lit.kind) {
        case "number":
            return `the number ${lit.hex && lit.value >= 0 ? "0x" + lit.value.toString(16).toUpperCase() : lit.value}`;
        case "percent":
            return `the percent ${lit.value}%`;
        case "string":
            return `the string ${JSON.stringify(lit.value)}`;
        case "hexColor":
            return `the color ${lit.raw}`;
        case "ident":
            return `'${lit.name}'`;
        case "code":
            // Unreachable through checkAttr (which routes { } to the binding
            // path before coercion), but coerce/describeLiteral are public and
            // must stay total over the literal union.
            return "a { … } expression";
        case "path":
            return `the datapath :${lit.path}${lit.many ? "[]" : ""}`;
        case "schema":
            return "a schema shape";
        case "call":
            return `'${lit.name}(…)'`;
        case "list":
            return `the list [${lit.items.map((i) => (i.kind === "ident" ? i.name : i.kind === "string" ? `"${i.value}"` : "…")).join(", ")}]`;
    }
}
/** Render a Color as a CSS color string (a DOM style value or a canvas
 *  fillStyle — both backends share this one encoding). Decodes both Color
 *  encodings: plain opaque 0xRRGGBB and the translucent form (see Color). */
export function colorToCss(c) {
    if (c === null)
        return "transparent";
    // A STRING reaching here is the classic seam mistake — a `{ }` body handed
    // `"#87CEEB"` (or a named color) where a color is a NUMBER (`0x87CEEB`).
    // Typed code can't do it (`Color = number | null`), but an `any` smuggles it
    // through, and the old arithmetic below then produced garbage CSS the
    // browser DISCARDED SILENTLY — a paint that simply never happens, no error
    // anywhere (measured cost: an hour of a real user's debugging, 2026-08-07).
    // Say it loudly, once per distinct value, and paint nothing on purpose.
    if (typeof c !== "number") {
        warnBadColor(c);
        return "transparent";
    }
    if (c < ALPHA)
        return "#" + c.toString(16).padStart(6, "0");
    const v = c - ALPHA;
    return "#" + Math.floor(v / 0x100).toString(16).padStart(6, "0") + (v % 0x100).toString(16).padStart(2, "0");
}
const badColors = new Set();
function warnBadColor(c) {
    const key = String(c);
    if (badColors.has(key) || typeof console === "undefined")
        return;
    badColors.add(key);
    const hex = /^#([0-9a-fA-F]{6})$/.exec(key);
    // one sentence, one code: the form the value should have taken is a hole,
    // itself a diagnostic sentence, never a concatenation the strip would skip
    const form = hex ? diag `write 0x${hex[1].toUpperCase()}` : diag `0xRRGGBB (named colors are bare-slot vocabulary only)`;
    console.error(diag `[Declare] a color slot received ${JSON.stringify(key)} (a ${typeof c}) — inside { } a color is a NUMBER: ${form}. Nothing was painted.`);
}
//# sourceMappingURL=value.js.map