// literal-parse — the written forms of the value literals that take PARSING:
// colors (names, hex), the decoration constructors (gradient, stroke, outline,
// shadow, a mask), motion (tokens and curves) and shapes. A compiled program
// carries none of them as text — the compile ships each literal as its value
// (compiler/src/lower-literals.ts) — so this module rides only where literal
// text still reaches the runtime: a literal the compile could not turn into a
// value, and rich text's inline views, whose attributes are read from the text
// as it arrives (the `literal-parsing` capability, compiler/src/capabilities.ts).
// value.ts's coerce() dispatches here.
import { diag, strokeShapeMessage } from "./errors.js";
import { CSS_COLORS } from "./css-colors.js";
import { validatePathData } from "./shape.js";
import { motionToken, MOTION_TOKENS } from "./easing.js";
import { coerceRadialConic } from "./effects.js";
import { coerceStrokeSides } from "./stroke-sides.js";
import { colorWithAlpha, describeLiteral, isAuthoredUnion, shadow } from "./value.js";
import { faceSourceLiteral, faceWeightLiteral } from "./face-literal.js";
import { coerceFilter } from "./effects.js";
const ok = (value) => ({ ok: true, value });
const fail = (expected, found) => ({ ok: false, expected, found });
// The literal forms for Color: navy / #354D5B / 0x354D5B / null (language
// §6), plus the ruled alpha forms #RGBA / #RRGGBBAA (`0x…` stays 6-digit
// opaque — the R2 ruling intact; see the Color doc). A decimal number is
// rejected on purpose: the doc's forms are closed, and `fill = 6702939`
// hides its channels.
const COLOR = diag `a Color (a name like navy, #RGB, #RRGGBB, #RGBA, #RRGGBBAA, 0xRRGGBB, or null)`;
export function coerceColor(lit) {
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
export function coerceFill(lit) {
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
export function coerceStroke(lit) {
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
export function coerceOutline(lit) {
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
export function coerceMotion(lit) {
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
export function coerceShape(lit) {
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
/** A mask: a gradient whose alpha masks the view, or null. */
export function coerceMask(lit) {
    if (lit.kind === "ident" && lit.name === "null")
        return ok(null);
    if (lit.kind !== "call")
        return fail(MASK);
    const g = coerceFill(lit);
    if (!g.ok || typeof g.value !== "object" || g.value === null)
        return fail(MASK, g.ok ? undefined : g.found);
    return g;
}
/** Coerce the written form of a literal to a slot's type (value.ts coerce):
 *  the whole literal vocabulary, and the reason a written form is not one of
 *  the type's. A compiled program ships its literals as the values this
 *  produced at compile time, so a build carries it only for a literal that
 *  arrives as written — rich text's inline views, and what the compile could
 *  not ship as a value. */
export function parseLiteral(type, lit) {
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
            // slot (check.ts / instantiate.ts); inside a class-valued member —
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
            // A shape literal is read as it is (value.ts coerce); null is "no
            // schema" (the default — schema presence is the only switch).
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
                    return fail(diag `one of ${members} — a literal union's member is written in quotes, as a bare value as in { }: "${lit.name}"`);
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
            // Like a class slot: `null` is the one literal form ("no callback").
            // A real function arrives by assignment from a { } body, never as a
            // literal in the declarative layer.
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null);
            return fail(diag `a function ${type.written}, or null for none`);
        case "class":
            // `null` is the one literal form ("no layout"); the instance form is
            // the member shape `layout: SimpleLayout [ … ]`, which never reaches
            // coercion (check.ts routes it to the class-value path).
            if (lit.kind === "ident" && lit.name === "null") {
                return type.required === true ? fail(diag `a ${type.of} — declared without '?', so never empty; write '${type.of}?' to let it be null`) : ok(null);
            }
            return fail(diag `a ${type.of} (a member like 'layout: SimpleLayout [ … ]'), or null for none`);
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
            if (lit.kind === "ident" && lit.name === "null") {
                return type.required === true ? fail(diag `a View — declared without '?', so never empty; write 'View?' to let it be null`) : ok(null);
            }
            return fail(diag `a View reference — assigned at runtime (an opener, a target), or null`);
        case "slotref":
            // The `attribute` token names a slot on the target; it stays a bare
            // string at runtime. That the named slot exists and is numeric is
            // checked against the TARGET's schema at the element walk (check.ts).
            if (lit.kind === "ident" && lit.name !== "null")
                return ok(lit.name);
            return fail(diag `an attribute name written as a bare token (like height or x)`);
        case "record":
            // A DATA record (schema-typed, `sel: Task = null`): null is the one
            // literal form — the slot may be empty before anything feeds it, exactly
            // like a class slot. A token record (Theme) arrives as a named theme
            // (`theme = Cupertino` — an ident routed and resolved before coercion), a
            // `{ }` binding, or an inline `Theme [ … ]` record.
            if (type.data === true) {
                if (lit.kind === "ident" && lit.name === "null") {
                    return type.required === true ? fail(diag `a ${type.name} — declared without '?', so never empty; write '${type.name}?' to let it be null`) : ok(null);
                }
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
            if (lit.kind === "ident" && lit.name === "null")
                return ok(null); // no filter: the effects module is not asked
            return coerceFilter(lit);
        case "mask":
            return coerceMask(lit);
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
//# sourceMappingURL=literal-parse.js.map