// The value model — the closed, compiler/kernel-owned vocabulary of literal
// value types (language §6): Color and Length, the plain number / boolean /
// string, and structural enums (named unions like `value Stretch = none |
// width | height | both`). The coercion that turns `navy` into an integer or
// `50%` into a Percent is deliberately imperative and lives here, never in
// Declare source. Each type's `coerce` case owns its "expects …" wording, so
// a type and its diagnostics are one thing and cannot drift apart.
import { CSS_COLORS } from "./css-colors.js";
import { validatePathData } from "./shape.js";
import { motionToken, MOTION_TOKENS } from "./animate.js";
/** The base of the translucent encoding — see the Color doc above. */
const ALPHA = 0x100000000;
/** Encode rgb (0xRRGGBB) + alpha (0…255) as one Color number. */
export function colorWithAlpha(rgb, a) {
    return a >= 0xff ? rgb : ALPHA + rgb * 0x100 + a;
}
/** Narrow a Fill to its gradient arm. */
export function isGradient(f) {
    return typeof f === "object" && f !== null;
}
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
        throw new Error("a gradient stop is a color or stop(offset, color)");
    });
    return Object.freeze({ angle, stops: Object.freeze(stops) });
}
export const stop = (offset, color) => Object.freeze({ offset, color });
export const stroke = (width, color) => Object.freeze({ width, color });
export const shadow = (dx, dy, blur, color) => Object.freeze({ dx, dy, blur, color });
// Structural equality for the decoration values (ruled: the === write gate
// extends to shallow structural equality for these — a constraint
// re-producing an equal record stops the cascade like a scalar). Each is
// called by the attribute layer only when identity already differed.
export function shadowEqual(a, b) {
    return a !== null && b !== null &&
        a.dx === b.dx && a.dy === b.dy && a.blur === b.blur && a.color === b.color;
}
export function strokeEqual(a, b) {
    return a !== null && b !== null && a.width === b.width && a.color === b.color;
}
export function fillEqual(a, b) {
    if (!isGradient(a) || !isGradient(b))
        return false; // unequal solids already failed ===
    return a.angle === b.angle && a.stops.length === b.stops.length &&
        a.stops.every((s, i) => s.offset === b.stops[i].offset && s.color === b.stops[i].color);
}
export const DEFAULT_THEME = Object.freeze({
    bg: 0xF4F6FA, surface: 0xFFFFFF, line: 0xDBE1E9,
    text: 0x1B2733, textMuted: 0x6C7A88, textFaint: 0xAAB4BE,
    accent: 0x2E6FE0, accentText: 0xFFFFFF,
    control: 0xE7EBF1, controlActive: 0xD3E2FC,
    depth: 1,
});
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
    Shape: { kind: "shape" },
};
/** Resolve a written declaration type name (`count: number`), or null when
 *  the name is not in the declarable vocabulary. */
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
            if (lit.kind === "number")
                return ok(lit.value);
            if (lit.kind === "percent")
                return ok({ percent: lit.value });
            return fail("a Length (a number of pixels, or a percent like 50%)");
        case "number":
            if (lit.kind === "number")
                return ok(lit.value);
            return fail("a number");
        case "boolean":
            if (lit.kind === "ident" && (lit.name === "true" || lit.name === "false")) {
                return ok(lit.name === "true");
            }
            return fail("a boolean (true or false)");
        case "string":
            if (lit.kind === "string")
                return ok(lit.value);
            return fail("a string");
        case "color":
            return coerceColor(lit);
        case "shape":
            return coerceShape(lit);
        case "enum":
            if (lit.kind === "ident" && type.tokens.includes(lit.name))
                return ok(lit.name);
            // Vowel-aware article: R7's Axis is the first enum that needs "an".
            return fail(`${/^[AEIOU]/.test(type.name) ? "an" : "a"} ${type.name} (one of ${type.tokens.join(" | ")})`);
        case "component":
            // `null` is the one literal form ("no layout"); the instance form is
            // the member shape `layout: SimpleLayout [ … ]`, which never reaches
            // coercion (check.ts routes it to the component-value path).
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(`a ${type.of} component (a member like 'layout: SimpleLayout [ … ]'), or null for none`);
        case "cursor":
            // `null` is the one coercible form ("no cursor"); `:path` and `{ }`
            // are standing relationships check.ts routes before coercion.
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail("a datapath (':field.path', a { } expression yielding a place in a dataset, or null)");
        case "slotref":
            // The `attribute` token names a slot on the target; it stays a bare
            // string at runtime. That the named slot exists and is numeric is
            // checked against the TARGET's schema at the element walk (check.ts).
            if (lit.kind === "ident" && lit.name !== "null")
                return ok(lit.name);
            return fail("a slot name written as a bare token (like height or x)");
        case "record":
            // No literal form, deliberately — not even null (an "empty" theme is
            // the default record, so readers' `theme.token` never explodes).
            // Values arrive from { } bindings or a stylesheet.
            return fail(`a ${type.name} (a token record — provide one with a { } binding or a stylesheet)`);
        case "fill":
            return coerceFill(lit);
        case "stroke":
            return coerceStroke(lit);
        case "shadow":
            return coerceShadow(lit);
        case "motion":
            return coerceMotion(lit);
        case "styles":
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail("a style list ([card, danger] — names of declared style bundles), or null");
        case "stylesheet":
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail("a stylesheet declared in this program (by name), or null");
        case "font":
            // A raw family string is the literal form; a `font Name` reference (an
            // ident) resolves against program declarations — routed in
            // check.ts/instantiate.ts before coercion (like `stylesheet`).
            if (lit.kind === "string")
                return ok(lit.value);
            return fail("a declared font (by name), or a raw family string like \"Helvetica, sans-serif\"");
    }
}
// The literal forms for Color: navy / #354D5B / 0x354D5B / null (language
// §6), plus the ruled alpha forms #RGBA / #RRGGBBAA (`0x…` stays 6-digit
// opaque — the R2 ruling intact; see the Color doc). A decimal number is
// rejected on purpose: the doc's forms are closed, and `fill = 6702939`
// hides its channels.
const COLOR = "a Color (a name like navy, #RGB, #RRGGBB, #RGBA, #RRGGBBAA, 0xRRGGBB, or null)";
function coerceColor(lit) {
    switch (lit.kind) {
        case "number":
            if (!lit.hex)
                return fail(COLOR, `${describeLiteral(lit)} (write a color in hex: 0x… or #…)`);
            if (!Number.isInteger(lit.value) || lit.value < 0 || lit.value > 0xffffff) {
                return fail(COLOR, `${describeLiteral(lit)} (outside 0x000000–0xFFFFFF)`);
            }
            return ok(lit.value);
        case "hexColor": {
            const hex = lit.raw.slice(1);
            if (!/^[0-9a-fA-F]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) {
                return fail(COLOR, `'${lit.raw}' (a hex color is 3, 4, 6, or 8 hex digits)`);
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
            return fail(COLOR, `'${lit.name}' (not a CSS color name)`);
        }
        default:
            return fail(COLOR);
    }
}
// ── Decoration values (styling rung) ────────────────────────────────────────
//
// The literal grammar is the ruled CONSTRUCTOR form — `name(args)`, parallel
// to how `50%` and `#354D5B` are typed literal forms — with args themselves
// literals (colors in any Color form, numbers, nested `stop(…)`). The same
// names are ordinary functions inside `{ }` bodies (expr.ts puts them in
// scope), so one vocabulary serves both lexical homes.
const FILL = `a Fill (a Color, gradient(#F8F8F8, #D8D8D8), gradient(angle, …stops), or null)`;
const STROKE = `a Stroke (stroke(width, color) — drawn inside the box — or null)`;
const SHADOW = `a Shadow (shadow(dx, dy, blur, color), or null)`;
/** A constructor argument as a plain color number (no null). */
function argColor(lit) {
    const c = coerceColor(lit);
    return c.ok && typeof c.value === "number" ? c.value : null;
}
function argNumber(lit) {
    return lit.kind === "number" ? lit.value : null;
}
function coerceFill(lit) {
    if (lit.kind === "call") {
        if (lit.name !== "gradient")
            return fail(FILL, `'${lit.name}(…)' (not a fill constructor)`);
        const args = [...lit.args];
        // An optional leading DECIMAL number is the angle (degrees, CSS compass —
        // 0 up, clockwise; default 180 = top → bottom). Hex-written numbers are
        // colors — the written form disambiguates, exactly as it types Color.
        const angle = args.length > 0 && args[0].kind === "number" && !args[0].hex ? argNumber(args.shift()) : 180;
        const stops = [];
        for (const a of args) {
            if (a.kind === "call" && a.name === "stop") {
                const offset = a.args.length === 2 ? argNumber(a.args[0]) : null;
                const color = a.args.length === 2 ? argColor(a.args[1]) : null;
                if (offset === null || color === null) {
                    return fail(FILL, `a stop is stop(offset, color) — offset 0…1, color a Color`);
                }
                stops.push({ offset, color });
                continue;
            }
            const color = argColor(a);
            if (color === null)
                return fail(FILL, `${describeLiteral(a)} (a gradient stop is a Color or stop(offset, color))`);
            stops.push({ offset: null, color });
        }
        if (stops.length < 2)
            return fail(FILL, `a gradient needs at least two stops`);
        return ok({ angle, stops });
    }
    const c = coerceColor(lit); // the solid case: any Color form coerces
    return c.ok ? c : fail(FILL, c.found);
}
function coerceStroke(lit) {
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
function coerceShadow(lit) {
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
    return ok({ dx, dy, blur, color });
}
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
        return m ? ok(m) : fail(MOTION, `'${lit.name}' (not one of ${MOTION_TOKENS.join(" | ")})`);
    }
    if (lit.kind !== "call")
        return fail(MOTION);
    switch (lit.name) {
        case "cubicBezier": {
            if (lit.args.length !== 4)
                return fail(MOTION, "cubicBezier(x1, y1, x2, y2) takes four numbers");
            const [x1, y1, x2, y2] = lit.args.map(argNumber);
            if (x1 === null || y1 === null || x2 === null || y2 === null)
                return fail(MOTION, "cubicBezier(x1, y1, x2, y2) — four numbers");
            if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1)
                return fail(MOTION, "cubicBezier x-coordinates must be in [0, 1] (time is monotonic)");
            return ok({ k: "bezier", x1, y1, x2, y2 });
        }
        case "back": {
            const s = lit.args.length === 1 ? argNumber(lit.args[0]) : null;
            if (s === null)
                return fail(MOTION, "back(overshoot) — one number (try back(1.7))");
            return ok({ k: "back", dir: "both", overshoot: s });
        }
        case "steps": {
            if (lit.args.length < 1 || lit.args.length > 2)
                return fail(MOTION, "steps(n[, jumpStart | jumpEnd])");
            const n = argNumber(lit.args[0]);
            if (n === null || !Number.isInteger(n) || n < 1)
                return fail(MOTION, "steps(n, …) — n a positive integer");
            let jump = "end";
            if (lit.args.length === 2) {
                const j = lit.args[1];
                if (j.kind !== "ident" || (j.name !== "jumpStart" && j.name !== "jumpEnd"))
                    return fail(MOTION, "steps' second argument is jumpStart or jumpEnd");
                jump = j.name === "jumpStart" ? "start" : "end";
            }
            return ok({ k: "steps", n, jump });
        }
        case "laszlo": {
            if (lit.args.length !== 2)
                return fail(MOTION, "laszlo(beginPole, endPole) — two numbers");
            const [bp, ep] = lit.args.map(argNumber);
            if (bp === null || ep === null || bp <= 0 || ep <= 0)
                return fail(MOTION, "laszlo(beginPole, endPole) — two positive numbers");
            return ok({ k: "laszlo", beginPole: bp, endPole: ep });
        }
        default:
            return fail(MOTION, `'${lit.name}(…)' (not a motion constructor)`);
    }
}
// A Shape's literal is SVG path *data* carried in a string (the `d`
// mini-grammar only — the rendering model's ruling), or `null` for "no
// shape". Path2D and clip-path both swallow malformed data silently, so the
// validation here is where a bad path becomes a positioned message instead
// of a mysteriously blank region.
const SHAPE = `a Shape (SVG path data in a string, like "M0 0 L80 0 L40 60 Z", or null)`;
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
        return fail(SHAPE, `${describeLiteral(lit)} (${problem})`);
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
    if (c < ALPHA)
        return "#" + c.toString(16).padStart(6, "0");
    const v = c - ALPHA;
    return "#" + Math.floor(v / 0x100).toString(16).padStart(6, "0") + (v % 0x100).toString(16).padStart(2, "0");
}
//# sourceMappingURL=value.js.map