// The value model — the closed, compiler/kernel-owned vocabulary of literal
// value types (language §6): Color and Length, the plain number / boolean /
// string, and structural enums (named unions like `value Stretch = none |
// width | height | both`). The coercion that turns `navy` into an integer or
// `50%` into a Percent is deliberately imperative and lives here, never in
// Declare source. Each type's `coerce` case owns its "expects …" wording, so
// a type and its diagnostics are one thing and cannot drift apart.

import type { Literal } from "./parser.js";
import { CSS_COLORS } from "./css-colors.js";
import { validatePathData } from "./shape.js";
import { motionToken, MOTION_TOKENS, type Motion } from "./animate.js";

/** A color as one number, or `null` for "no color".
 *
 *  Opaque colors are plain 0xRRGGBB (0…0xFFFFFF) — every number a program
 *  computes is an opaque color, and `0x…` literals stay 6-digit opaque (the
 *  R2 ruling, intact). Alpha arrives ONLY through the `#RGBA`/`#RRGGBBAA`
 *  literal forms (ruled): a translucent color is encoded above 2^32
 *  (ALPHA + rgb·256 + a), so numeric punning between an opaque color and an
 *  alpha-bearing one is unrepresentable — no computable number collides with
 *  the translucent range, and an explicit `…FF` alpha normalizes back to the
 *  opaque form at coercion. `colorToCss` decodes both. */
export type Color = number | null;

/** The base of the translucent encoding — see the Color doc above. */
const ALPHA = 0x100000000;

/** Encode rgb (0xRRGGBB) + alpha (0…255) as one Color number. */
export function colorWithAlpha(rgb: number, a: number): number {
  return a >= 0xff ? rgb : ALPHA + rgb * 0x100 + a;
}

/** A gradient stop: an explicit 0…1 offset, or null for even spacing. */
export interface GradientStop {
  readonly offset: number | null;
  readonly color: number;
}

/** A linear gradient (a decoration Fill). `angle` is in degrees with CSS's
 *  compass semantics — 0 points up, clockwise; the constructor's default is
 *  180 (top → bottom). Plain immutable data — structured-cloneable, like
 *  every decoration value. */
export interface Gradient {
  readonly angle: number;
  readonly stops: readonly GradientStop[];
}

/** What paints a view's box: a solid Color (null = paint nothing) or a
 *  Gradient — the ruled `fill` slot's type, subsuming backgroundColor. */
export type Fill = Color | Gradient;

/** Narrow a Fill to its gradient arm. */
export function isGradient(f: Fill): f is Gradient {
  return typeof f === "object" && f !== null;
}

/** A border drawn INSIDE the view box (ruled: `stroke` over CSS's `border` —
 *  the box stays the layout/hit fact, per R5's hit-region rule). */
export interface Stroke {
  readonly width: number;
  readonly color: number;
}

/** A drop shadow (`shadow` on the view box, `textShadow` on glyphs) — the
 *  CSS box-shadow shape minus spread, until a consumer needs it. */
export interface Shadow {
  readonly dx: number;
  readonly dy: number;
  readonly blur: number;
  readonly color: number;
}

// ── The value constructors' RUNTIME forms — the same names inside `{ }`
// bodies (expr.ts puts them in scope), producing the same immutable
// plain-data records the literal grammar coerces to. One asymmetry, recorded:
// at runtime a leading number is indistinguishable from a color (no written
// form to consult), so the runtime gradient spells its optional angle as the
// string "45deg" — CSS's own spelling.

export function gradient(...args: (number | string | GradientStop)[]): Gradient {
  let angle = 180;
  if (typeof args[0] === "string") {
    const m = /^(-?\d+(?:\.\d+)?)deg$/.exec(args[0]);
    if (m === null) throw new Error(`gradient: an angle is written "45deg", got "${args[0]}"`);
    angle = parseFloat(m[1]);
    args = args.slice(1);
  }
  if (args.length < 2) throw new Error("gradient needs at least two stops");
  const stops = args.map((a): GradientStop => {
    if (typeof a === "number") return Object.freeze({ offset: null, color: a });
    if (typeof a === "object" && a !== null && "color" in a) return a;
    throw new Error("a gradient stop is a color or stop(offset, color)");
  });
  return Object.freeze({ angle, stops: Object.freeze(stops) });
}

export const stop = (offset: number, color: number): GradientStop => Object.freeze({ offset, color });
export const stroke = (width: number, color: number): Stroke => Object.freeze({ width, color });
export const shadow = (dx: number, dy: number, blur: number, color: number): Shadow =>
  Object.freeze({ dx, dy, blur, color });

// Structural equality for the decoration values (ruled: the === write gate
// extends to shallow structural equality for these — a constraint
// re-producing an equal record stops the cascade like a scalar). Each is
// called by the attribute layer only when identity already differed.

export function shadowEqual(a: Shadow | null, b: Shadow | null): boolean {
  return a !== null && b !== null &&
    a.dx === b.dx && a.dy === b.dy && a.blur === b.blur && a.color === b.color;
}

export function strokeEqual(a: Stroke | null, b: Stroke | null): boolean {
  return a !== null && b !== null && a.width === b.width && a.color === b.color;
}

export function fillEqual(a: Fill, b: Fill): boolean {
  if (!isGradient(a) || !isGradient(b)) return false; // unequal solids already failed ===
  return a.angle === b.angle && a.stops.length === b.stops.length &&
    a.stops.every((s, i) => s.offset === b.stops[i].offset && s.color === b.stops[i].color);
}

/** A theme: a plain immutable record of design tokens (ruled, v1 —
 *  wholesale-swapped, never mutated in place). The default is the HOUSE
 *  theme (design/components-baseline.md Contract 2): the ruled v1 role
 *  vocabulary with the house light palette, so `theme.role` in library
 *  components ALWAYS resolves — no provider means the house look, never a
 *  fallback expression in component source. `depth` (0 = flat …
 *  1 = dimensional) is the treatment dial components translate in their
 *  decoration constraints. Partial reskin is explicit-base spread:
 *  `theme = { { ...app.theme, accent: 0xE05252 } }`. (The dark-aware house —
 *  a binding default off `app.dark` — is the noted follow-up.) */
export type Theme = Readonly<Record<string, unknown>>;
export const DEFAULT_THEME: Theme = Object.freeze({
  bg: 0xF4F6FA, surface: 0xFFFFFF, line: 0xDBE1E9,
  text: 0x1B2733, textMuted: 0x6C7A88, textFaint: 0xAAB4BE,
  accent: 0x2E6FE0, accentText: 0xFFFFFF,
  control: 0xE7EBF1, controlActive: 0xD3E2FC,
  depth: 1,
  focusRing: true,
});

/** A parent-relative percentage, as written (`{ percent: 50 }` for `50%`).
 *  It stays symbolic: resolving it against a parent measurement is constraint
 *  work that lands at R4 — until then instantiate refuses it loudly rather
 *  than misrendering 50% as 50px (see instantiate.ts). */
export interface Percent {
  readonly percent: number;
}

/** A Length: pixels (a bare number) or a parent-relative Percent. */
export type Length = number | Percent;

/** A coerced literal — ready to assign to a typed view field. Percent is the
 *  one member with no field to land in yet (see above); the decoration
 *  records (Gradient/Stroke/Shadow) arrive from constructor literals. */
export type AttrValue = number | boolean | string | null | Percent | Gradient | Stroke | Shadow | Motion;

/** Narrow an AttrValue to the Percent arm (no longer the only object in the
 *  union since decoration values landed — the key is the discriminant). */
export function isPercent(v: AttrValue): v is Percent {
  return typeof v === "object" && v !== null && "percent" in v;
}

/** An attribute's declared type — the currency of the component schemas
 *  (schema.ts). The enum arm carries its name and full token set so a schema
 *  line reads as the union declaration it stands for. The component arm (R7)
 *  types a slot whose VALUE is a component instance — View.layout: a Layout —
 *  written as the member `layout: SimpleLayout [ … ]` (the checker routes
 *  that member shape here; the only literal such a slot coerces is `null`). */
export type AttrType =
  | { readonly kind: "length" | "number" | "boolean" | "string" | "color" | "shape" }
  | { readonly kind: "enum"; readonly name: string; readonly tokens: readonly string[] }
  | { readonly kind: "component"; readonly of: string }
  // R8: a slot whose value is a *place in a dataset* (View.datapath — the
  // cursor `:path` reads resolve against, language §9). Its written forms are
  // a `:path` literal (relative to the inherited cursor), a `{ }` expression
  // yielding a place, or `null`; only the null coerces — the other two are
  // standing relationships the checker routes to their own paths.
  | { readonly kind: "cursor" }
  // Animation (animation.md §3): the Animator.attribute slot's type — a bare
  // token that NAMES another slot on the animator's target. Its only literal
  // form is an identifier, and it stays a bare string at runtime; that the
  // named slot exists and is numeric is the one animation compile check, run
  // against the TARGET's schema at the element walk (check.ts), not here.
  | { readonly kind: "slotref" }
  // Styling: a typed token record (View.theme — the prevailing design-token
  // slot, wholesale-swapped; no literal form — values arrive from `{ }`
  // bindings or a stylesheet) and the three decoration slots, whose literal
  // forms are the ruled value CONSTRUCTORS (`gradient(…)`, `stroke(…)`,
  // `shadow(…)`) — self-naming, arity-checked, identical inside `{ }` where
  // the same names are ordinary functions in scope.
  | { readonly kind: "record"; readonly name: string }
  | { readonly kind: "fill" }
  | { readonly kind: "stroke" }
  | { readonly kind: "shadow" }
  // Animation (animation.md §1): an easing curve. Two written forms, both
  // already in the grammar — a bare named token (`easeBoth`, `quartOut`, like
  // any enum) or a value constructor (`cubicBezier(…)`, `back(…)`, `steps(…)`,
  // `laszlo(…)`, like `shadow(…)`). Resolves to a Motion value (animate.ts).
  | { readonly kind: "motion" }
  // Styling: the two channel slots. `styles` holds a static bundle-name list
  // (`styles = [card, danger]` — consumed at construction, ruled v1);
  // `stylesheet` holds a declared stylesheet by name (a prevailing slot —
  // provide it anywhere and the subtree reskins). Both resolve against the
  // PROGRAM's declarations, so the checker routes them with program context;
  // coercion here only answers the null form.
  | { readonly kind: "styles" }
  | { readonly kind: "stylesheet" }
  // The standard-CSS channel's `cssRules` slot: a declared `css` block by name
  // (a prevailing slot holding a RuleSet). Resolves against the program's `css`
  // declarations — the checker routes it with program context, exactly like
  // `stylesheet`; coercion here only answers the null form.
  | { readonly kind: "cssRules" }
  // Fonts: `fontFamily` — either a declared `font Name` reference (an ident,
  // resolved against the program's declarations to a family string at
  // instantiate, like `stylesheet`) or a raw family string (the legacy
  // literal). Prevailing; stays a plain string at runtime, so the render seam
  // and both backends are untouched.
  | { readonly kind: "font" };

/** Declare an enum attribute type: `enumType("Stretch", "none", "width", …)`
 *  — how §6's named unions declare. Built-in consumers: Image.stretches and
 *  Text.fontWeight (R3); user unions and Align slot in as pure data. */
export function enumType(name: string, ...tokens: string[]): AttrType {
  return { kind: "enum", name, tokens };
}

// What a user attribute declaration may name as its type (language §4:
// "ordinary TypeScript types plus the built-in value vocabulary of §6") —
// the TS primitives spelled as TS spells them, the value types capitalized
// as the doc capitalizes them. Arbitrary TS types are the tsc compiler
// path's surface; user `value` unions are their own future construct.
const DECLARED_TYPES: Readonly<Record<string, AttrType>> = {
  number: { kind: "number" },
  string: { kind: "string" },
  boolean: { kind: "boolean" },
  Color: { kind: "color" },
  Length: { kind: "length" },
  Shape: { kind: "shape" },
};

/** Resolve a written declaration type name (`count: number`), or null when
 *  the name is not in the declarable vocabulary. */
export function declaredType(name: string): AttrType | null {
  return Object.hasOwn(DECLARED_TYPES, name) ? DECLARED_TYPES[name] : null;
}

/** The declarable type names, for the checker's "expected one of …" message. */
export const DECLARED_TYPE_NAMES: readonly string[] = Object.keys(DECLARED_TYPES);

/** The result of coercing one literal to one type: the typed value, or — for
 *  the checker's message — what the type expected, plus `found` when the
 *  coercer knows more than the raw literal shows (e.g. *why* a name is not a
 *  color). When `found` is absent the checker describes the literal itself. */
export type Coerced =
  | { readonly ok: true; readonly value: AttrValue }
  | { readonly ok: false; readonly expected: string; readonly found?: string };

const ok = (value: AttrValue): Coerced => ({ ok: true, value });
const fail = (expected: string, found?: string): Coerced => ({ ok: false, expected, found });

/** Coerce a parsed literal to an attribute type. Pure — safe for the checker
 *  to call speculatively; instantiate assigns the same result. */
export function coerce(type: AttrType, lit: Literal): Coerced {
  switch (type.kind) {
    case "length":
      if (lit.kind === "number") return ok(lit.value);
      if (lit.kind === "percent") return ok({ percent: lit.value });
      return fail("a Length (a number of pixels, or a percent like 50%)");
    case "number":
      if (lit.kind === "number") return ok(lit.value);
      return fail("a number");
    case "boolean":
      if (lit.kind === "ident" && (lit.name === "true" || lit.name === "false")) {
        return ok(lit.name === "true");
      }
      return fail("a boolean (true or false)");
    case "string":
      if (lit.kind === "string") return ok(lit.value);
      return fail("a string");
    case "color":
      return coerceColor(lit);
    case "shape":
      return coerceShape(lit);
    case "enum":
      if (lit.kind === "ident" && type.tokens.includes(lit.name)) return ok(lit.name);
      // Vowel-aware article: R7's Axis is the first enum that needs "an".
      return fail(`${/^[AEIOU]/.test(type.name) ? "an" : "a"} ${type.name} (one of ${type.tokens.join(" | ")})`);
    case "component":
      // `null` is the one literal form ("no layout"); the instance form is
      // the member shape `layout: SimpleLayout [ … ]`, which never reaches
      // coercion (check.ts routes it to the component-value path).
      if (lit.kind === "ident" && lit.name === "null") return ok(null);
      return fail(`a ${type.of} component (a member like 'layout: SimpleLayout [ … ]'), or null for none`);
    case "cursor":
      // `null` is the one coercible form ("no cursor"); `:path` and `{ }`
      // are standing relationships check.ts routes before coercion.
      if (lit.kind === "ident" && lit.name === "null") return ok(null);
      return fail("a datapath (':field.path', a { } expression yielding a place in a dataset, or null)");
    case "slotref":
      // The `attribute` token names a slot on the target; it stays a bare
      // string at runtime. That the named slot exists and is numeric is
      // checked against the TARGET's schema at the element walk (check.ts).
      if (lit.kind === "ident" && lit.name !== "null") return ok(lit.name);
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
      if (lit.kind === "ident" && lit.name === "null") return ok(null);
      return fail("a style list ([card, danger] — names of declared style bundles), or null");
    case "stylesheet":
      if (lit.kind === "ident" && lit.name === "null") return ok(null);
      return fail("a stylesheet declared in this program (by name), or null");
    case "cssRules":
      if (lit.kind === "ident" && lit.name === "null") return ok(null);
      return fail("a css block declared in this program (by name), or null");
    case "font":
      // A raw family string is the literal form; a `font Name` reference (an
      // ident) resolves against program declarations — routed in
      // check.ts/instantiate.ts before coercion (like `stylesheet`).
      if (lit.kind === "string") return ok(lit.value);
      return fail("a declared font (by name), or a raw family string like \"Helvetica, sans-serif\"");
  }
}

// The literal forms for Color: navy / #354D5B / 0x354D5B / null (language
// §6), plus the ruled alpha forms #RGBA / #RRGGBBAA (`0x…` stays 6-digit
// opaque — the R2 ruling intact; see the Color doc). A decimal number is
// rejected on purpose: the doc's forms are closed, and `fill = 6702939`
// hides its channels.
const COLOR = "a Color (a name like navy, #RGB, #RRGGBB, #RGBA, #RRGGBBAA, 0xRRGGBB, or null)";

function coerceColor(lit: Literal): Coerced {
  switch (lit.kind) {
    case "number":
      if (!lit.hex) return fail(COLOR, `${describeLiteral(lit)} (write a color in hex: 0x… or #…)`);
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
      if (lit.name === "null") return ok(null);
      // CSS keywords are case-insensitive; own-key guard so a name like
      // `constructor` can't reach Object.prototype through the table.
      const key = lit.name.toLowerCase();
      if (Object.hasOwn(CSS_COLORS, key)) return ok(CSS_COLORS[key]);
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
function argColor(lit: Literal): number | null {
  const c = coerceColor(lit);
  return c.ok && typeof c.value === "number" ? c.value : null;
}

function argNumber(lit: Literal): number | null {
  return lit.kind === "number" ? lit.value : null;
}

function coerceFill(lit: Literal): Coerced {
  if (lit.kind === "call") {
    if (lit.name !== "gradient") return fail(FILL, `'${lit.name}(…)' (not a fill constructor)`);
    const args = [...lit.args];
    // An optional leading DECIMAL number is the angle (degrees, CSS compass —
    // 0 up, clockwise; default 180 = top → bottom). Hex-written numbers are
    // colors — the written form disambiguates, exactly as it types Color.
    const angle =
      args.length > 0 && args[0].kind === "number" && !args[0].hex ? argNumber(args.shift()!)! : 180;
    const stops: GradientStop[] = [];
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
      if (color === null) return fail(FILL, `${describeLiteral(a)} (a gradient stop is a Color or stop(offset, color))`);
      stops.push({ offset: null, color });
    }
    if (stops.length < 2) return fail(FILL, `a gradient needs at least two stops`);
    return ok({ angle, stops });
  }
  const c = coerceColor(lit); // the solid case: any Color form coerces
  return c.ok ? c : fail(FILL, c.found);
}

function coerceStroke(lit: Literal): Coerced {
  if (lit.kind === "ident" && lit.name === "null") return ok(null);
  if (lit.kind !== "call" || lit.name !== "stroke") return fail(STROKE);
  const width = lit.args.length === 2 ? argNumber(lit.args[0]) : null;
  const color = lit.args.length === 2 ? argColor(lit.args[1]) : null;
  if (width === null || color === null || width < 0) return fail(STROKE);
  return ok({ width, color });
}

function coerceShadow(lit: Literal): Coerced {
  if (lit.kind === "ident" && lit.name === "null") return ok(null);
  if (lit.kind !== "call" || lit.name !== "shadow") return fail(SHADOW);
  if (lit.args.length !== 4) return fail(SHADOW);
  const [dx, dy, blur] = lit.args.slice(0, 3).map(argNumber);
  const color = argColor(lit.args[3]);
  if (dx === null || dy === null || blur === null || color === null || blur < 0) return fail(SHADOW);
  return ok({ dx, dy, blur, color });
}

// ── Motion (animation.md §1) ─────────────────────────────────────────────────
//
// A named token OR a value constructor — both forms already in the grammar,
// so this adds a type, not syntax. Tokens resolve through animate.ts's
// motionToken (kept as the single source of truth); the four constructors
// (cubicBezier / back / steps / laszlo) validate their args here, next to the
// stroke/shadow coercers whose shape they share.
const MOTION =
  `a Motion (a named curve like easeBoth, quartOut, expoIn, or laszloBoth; or a constructor: ` +
  `cubicBezier(x1, y1, x2, y2), back(overshoot), steps(n[, jumpStart | jumpEnd]), laszlo(beginPole, endPole))`;

function coerceMotion(lit: Literal): Coerced {
  if (lit.kind === "ident") {
    const m = motionToken(lit.name);
    return m ? ok(m) : fail(MOTION, `'${lit.name}' (not one of ${MOTION_TOKENS.join(" | ")})`);
  }
  if (lit.kind !== "call") return fail(MOTION);
  switch (lit.name) {
    case "cubicBezier": {
      if (lit.args.length !== 4) return fail(MOTION, "cubicBezier(x1, y1, x2, y2) takes four numbers");
      const [x1, y1, x2, y2] = lit.args.map(argNumber);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return fail(MOTION, "cubicBezier(x1, y1, x2, y2) — four numbers");
      if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return fail(MOTION, "cubicBezier x-coordinates must be in [0, 1] (time is monotonic)");
      return ok({ k: "bezier", x1, y1, x2, y2 });
    }
    case "back": {
      const s = lit.args.length === 1 ? argNumber(lit.args[0]) : null;
      if (s === null) return fail(MOTION, "back(overshoot) — one number (try back(1.7))");
      return ok({ k: "back", dir: "both", overshoot: s });
    }
    case "steps": {
      if (lit.args.length < 1 || lit.args.length > 2) return fail(MOTION, "steps(n[, jumpStart | jumpEnd])");
      const n = argNumber(lit.args[0]);
      if (n === null || !Number.isInteger(n) || n < 1) return fail(MOTION, "steps(n, …) — n a positive integer");
      let jump: "start" | "end" = "end";
      if (lit.args.length === 2) {
        const j = lit.args[1];
        if (j.kind !== "ident" || (j.name !== "jumpStart" && j.name !== "jumpEnd")) return fail(MOTION, "steps' second argument is jumpStart or jumpEnd");
        jump = j.name === "jumpStart" ? "start" : "end";
      }
      return ok({ k: "steps", n, jump });
    }
    case "laszlo": {
      if (lit.args.length !== 2) return fail(MOTION, "laszlo(beginPole, endPole) — two numbers");
      const [bp, ep] = lit.args.map(argNumber);
      if (bp === null || ep === null || bp <= 0 || ep <= 0) return fail(MOTION, "laszlo(beginPole, endPole) — two positive numbers");
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

function coerceShape(lit: Literal): Coerced {
  if (lit.kind === "ident" && lit.name === "null") return ok(null);
  // The BOX-CLIP form (tabslider-gaps.md gap 1): `clip = true` clips a view's
  // subtree to its own box (0,0,width,height), tracking width/height so it
  // follows an animating height every frame; `false` = no clip. It rides the
  // same `clip` slot as an explicit Shape path (which clips to a declared
  // shape) — the runtime branches on the coerced value's type (view.ts).
  if (lit.kind === "ident" && (lit.name === "true" || lit.name === "false")) {
    return ok(lit.name === "true");
  }
  if (lit.kind !== "string") return fail(SHAPE);
  const problem = validatePathData(lit.value);
  if (problem !== null) return fail(SHAPE, `${describeLiteral(lit)} (${problem})`);
  return ok(lit.value);
}

/** A literal as a message names it — "got the string \"wide\"". Hex-written
 *  numbers read back as hex, so a color message shows the channels. */
export function describeLiteral(lit: Literal): string {
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
export function colorToCss(c: Color): string {
  if (c === null) return "transparent";
  if (c < ALPHA) return "#" + c.toString(16).padStart(6, "0");
  const v = c - ALPHA;
  return "#" + Math.floor(v / 0x100).toString(16).padStart(6, "0") + (v % 0x100).toString(16).padStart(2, "0");
}
