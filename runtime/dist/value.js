// The value model — the closed, compiler/kernel-owned vocabulary of literal
// value types (language §6): Color and Length, the plain number / boolean /
// string, and structural enums (named unions like `value Stretch = none |
// width | height | both`). The coercion that turns `navy` into an integer or
// `50%` into a Percent is deliberately imperative and lives here, never in
// Declare source. Each type's `coerce` case owns its "expects …" wording, so
// a type and its diagnostics are one thing and cannot drift apart.
import { diag } from "./errors.js";
import { sidesEqual, sidesUniform } from "./stroke-sides.js";
import { parseLiteral } from "./literal-parse.js";
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
 *  runtime, so `stroke(provided("theme").line, 1)` produces exactly this: a fourteen-million
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
/** An inset as CSS `padding` (`"0"` when there is none). */
export function insetCss(i) {
    const [t, r, b, l] = insetSides(i);
    return t === 0 && r === 0 && b === 0 && l === 0 ? "0" : `${t}px ${r}px ${b}px ${l}px`;
}
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
    // The records door (planes.md §4 — classes arrange records): a slot
    // holding an ARRAY of records (`items`), a plain OBJECT record, or a VIEW
    // reference (`opener`). Literal defaults are null-only — structured values
    // arrive from `{ }` bindings and runtime writes; the names stay precise
    // (no `any` in the vocabulary) so a declaration still documents intent.
    array: { kind: "array" },
    object: { kind: "object" },
    View: { kind: "view" },
    // The design-token record views style off, read with `provided("theme")`.
    // A named record type, declarable for an attribute that holds a theme.
    Theme: { kind: "record", name: "Theme" },
    // What `afterDelay` hands back: a node can keep the pending call and
    // `cancel()` it from a later handler (a notice that a newer one replaces).
    DelayHandle: { kind: "record", name: "DelayHandle", data: true },
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
/** A NULLABLE number or boolean — `number | null`, `null | number`, `number?`
 *  (and `| undefined`, which a slot holds as null): "n" or "b", else null. Such
 *  a slot stays in the kernel's table, its null carried by the cell's flag. */
export function nullablePrimitive(written) {
    const parts = written.endsWith("?") ? [written.slice(0, -1).trim(), "null"] : written.split("|").map((p) => p.trim());
    if (parts.length !== 2)
        return null;
    const base = parts.filter((p) => p !== "null" && p !== "undefined");
    if (base.length !== 1)
        return null;
    return base[0] === "number" ? "n" : base[0] === "boolean" ? "b" : null;
}
export function declaredType(name) {
    return Object.hasOwn(DECLARED_TYPES, name) ? DECLARED_TYPES[name] : null;
}
/** The declarable type names, for the checker's "expected one of …" message. */
export const DECLARED_TYPE_NAMES = Object.keys(DECLARED_TYPES);
const ok = (value) => ({ ok: true, value });
/** THE LITERAL SINK — compile time only. While the compiler checks the program
 *  it will ship, every literal coerced to a value is reported here, and the
 *  compiler ships the value in place of the written form
 *  (compiler/src/lower-literals.ts). Null at run time. */
let literalSink = null;
export function withLiteralSink(sink, run) {
    const prev = literalSink;
    literalSink = sink;
    try {
        return run();
    }
    finally {
        literalSink = prev;
    }
}
/** Report a literal's value to the sink (coerceToken's untyped path uses it too). */
export function noteLiteral(lit, value) {
    literalSink?.(lit, value);
}
/** Coerce a parsed literal to an attribute type. Pure — safe for the checker
 *  to call speculatively; instantiate assigns the same result. A literal the
 *  compiler already coerced (`value`) is its value; any other is parsed by the
 *  literal vocabulary (literal-parse.ts parseLiteral), which a build carries
 *  only when it can meet a literal still as written. */
export function coerce(type, lit) {
    if (lit.kind === "value")
        return ok(lit.value);
    // A data shape is read as it is, not parsed: its parsed ShapeField
    // declarations pass through as plain data — an array-root document (`schema =
    // Task[]`) as the wrapper shape-resolve.ts defines, so validation knows the
    // root is an array. (Its names may resolve to recursive shapes, so the
    // compile cannot ship it as a value.)
    if (lit.kind === "schema" && type.kind === "dataschema")
        return ok((lit.arrayRoot === true ? { arrayRoot: true, fields: lit.shape } : lit.shape));
    const c = parseLiteral(type, lit);
    if (c.ok && literalSink !== null)
        literalSink(lit, c.value);
    return c;
}
/** Coerce a theme-record token to its runtime value (checkThemeRecord vetted
 *  the shapes): numbers and strings pass through, hex/named colors ground as
 *  Color, `true`/`false`/`null` as themselves, a constructor call as the first
 *  of fill/stroke/shadow that admits it, and a LIST of any of those.
 *
 *  A list is a token because the rule the record actually keeps is "a token is
 *  bounded, plain data" — spreadable, comparable, serializable, inspectable
 *  without asking what kind of object it is — and a frozen array of literals is
 *  all of those. Excluding it did not keep lists out; it denied them a type, so
 *  the one the corpus needed most, a font stack, was written as a comma-joined
 *  string and parsed back into a list at the other end. ONE LEVEL: a list of
 *  lists is refused, which keeps "bounded" a fact rather than a hope. */
export function coerceToken(lit) {
    if (lit.kind === "value")
        return lit.value;
    const v = tokenOf(lit);
    if (v !== undefined)
        noteLiteral(lit, v);
    return v;
}
function tokenOf(lit) {
    switch (lit.kind) {
        case "list": {
            const out = [];
            for (const item of lit.items) {
                // one level: a nested list is not a token, and neither is anything else
                // coerceToken refuses — the whole list fails so the record's error names
                // the token, and checkThemeRecord says which item was wrong.
                if (item.kind === "list")
                    return undefined;
                const v = coerceToken(item);
                if (v === undefined)
                    return undefined;
                out.push(v);
            }
            return Object.freeze(out);
        }
        case "number":
            return lit.value;
        case "string":
            return lit.value;
        case "hexColor": {
            const c = coerce({ kind: "color" }, lit);
            return c.ok ? c.value : undefined;
        }
        case "ident": {
            if (lit.name === "true")
                return true;
            if (lit.name === "false")
                return false;
            if (lit.name === "null")
                return null;
            const c = coerce({ kind: "color" }, lit); // named colors
            return c.ok ? c.value : undefined;
        }
        case "call": {
            const asFill = coerce({ kind: "fill" }, lit);
            if (asFill.ok)
                return asFill.value;
            const asStroke = coerce({ kind: "stroke" }, lit);
            if (asStroke.ok)
                return asStroke.value;
            const asShadow = coerce({ kind: "shadow" }, lit);
            if (asShadow.ok)
                return asShadow.value;
            const asBackdrop = coerce({ kind: "filter" }, lit);
            return asBackdrop.ok ? asBackdrop.value : undefined;
        }
        default:
            return undefined;
    }
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
        case "value":
            return `the value ${JSON.stringify(lit.value)}`;
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
    const form = hex ? diag `write 0x${hex[1].toUpperCase()}` : diag `0xRRGGBB (named colors are bare-value vocabulary only)`;
    console.error(diag `[Declare] a color attribute received ${JSON.stringify(key)} (a ${typeof c}) — inside { } a color is a NUMBER: ${form}. Nothing was painted.`);
}
//# sourceMappingURL=value.js.map