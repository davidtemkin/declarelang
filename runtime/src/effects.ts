// The graphics vocabulary a program has to NAME to use — the filter functions,
// `frost`, and the radial and conic gradients — with the literal forms that
// build them. Its own file so a production build carries it only for a program
// that writes one of these names (declarec's slim-effects): what every program
// can reach without naming anything — a theme's `menuBackdrop` record, the
// linear `gradient`, the filter list's CSS — stays in value.ts.

import { diag } from "./errors.js";
import { argColor, argNumber, coerceShadow, coerceStops, FILL, type AttrValue, type Backdrop, type Coerced, type Color, type Filter, type Gradient, type GradientStop, type Shadow } from "./value.js";
import type { Literal } from "./parser.js";

const ok = (value: AttrValue): Coerced => ({ ok: true, value });
const fail = (expected: string, found?: string): Coerced => ({ ok: false, expected, found });

function gradientStops(args: (number | GradientStop)[], who: string): readonly GradientStop[] {
  if (args.length < 2) throw new Error(`${who} needs at least two stops`);
  return Object.freeze(args.map((a): GradientStop => {
    if (typeof a === "number") return Object.freeze({ offset: null, color: a });
    if (typeof a === "object" && a !== null && "color" in a) return a;
    throw new Error(diag`a gradient stop is a color or stop(offset, color)`);
  }));
}
/** `radialGradient(cx, cy, r, stops…)` — centre as fractions of the box, reach
 *  as a fraction of the farthest-corner distance (graphics-pass.md §3). */
export function radialGradient(cx: number, cy: number, r: number, ...args: (number | GradientStop)[]): Gradient {
  return Object.freeze({ kind: "radial", angle: 0, cx, cy, r, stops: gradientStops(args, "radialGradient") });
}
/** `conicGradient(cx, cy, angleDeg, stops…)` — a sweep from `angle` (CSS `from`, 0 = up, clockwise). */
export function conicGradient(cx: number, cy: number, angle: number, ...args: (number | GradientStop)[]): Gradient {
  return Object.freeze({ kind: "conic", angle, cx, cy, stops: gradientStops(args, "conicGradient") });
}

export const blur = (radius: number): Filter => Object.freeze({ fn: "blur", radius: Math.max(0, radius) });
export const brightness = (amount: number): Filter => Object.freeze({ fn: "brightness", amount: Math.max(0, amount) });
export const contrast = (amount: number): Filter => Object.freeze({ fn: "contrast", amount: Math.max(0, amount) });
export const saturate = (amount: number): Filter => Object.freeze({ fn: "saturate", amount: Math.max(0, amount) });
export const grayscale = (amount: number): Filter => Object.freeze({ fn: "grayscale", amount: Math.min(1, Math.max(0, amount)) });
export const invert = (amount: number): Filter => Object.freeze({ fn: "invert", amount: Math.min(1, Math.max(0, amount)) });
export const sepia = (amount: number): Filter => Object.freeze({ fn: "sepia", amount: Math.min(1, Math.max(0, amount)) });
export const hueRotate = (degrees: number): Filter => Object.freeze({ fn: "hueRotate", degrees });
/** `colorize(color)`: the group's alpha in one colour (template-image rendering) —
 *  what `Image.tint` is sugar for. (`tint(…)` is the theme helper's name.) */
export const colorize = (color: Color): Filter => Object.freeze({ fn: "tint", color });
/** The frost: blur + saturate, the material pair every platform's menus wear. */
export const frost = (radius: number, saturation = 1): Backdrop =>
  Object.freeze(saturation === 1 ? [blur(radius)] : [blur(radius), saturate(saturation)]);

/** A written `radialGradient(…)` / `conicGradient(…)` fill. */
export function coerceRadialConic(lit: Extract<Literal, { kind: "call" }>): Coerced {
  const geo = lit.args.slice(0, 3).map(argNumber);
  if (geo.length < 3 || geo.some((g) => g === null)) {
    return fail(FILL, diag`${lit.name}(cx, cy, ${lit.name === "radialGradient" ? "r" : "angle"}, stops…) — three numbers, then the stops`);
  }
  const stops = coerceStops(lit.args.slice(3));
  if (typeof stops === "string") return fail(FILL, stops);
  return ok(lit.name === "radialGradient"
    ? radialGradient(geo[0]!, geo[1]!, geo[2]!, ...stops)
    : conicGradient(geo[0]!, geo[1]!, geo[2]!, ...stops));
}

const FILTER = diag`a filter — blur(radius), brightness(k), contrast(k), saturate(k), grayscale(k), invert(k), sepia(k), hueRotate(deg), colorize(color), shadow(dx, dy, blur, color), or frost(radius, saturation) — one, a list [ … ] of them, or null`;

/** One filter function from its written call, or null when the call is not one. */
function coerceFilterFn(lit: Literal): Filter | null {
  if (lit.kind !== "call") return null;
  const n = lit.args.length;
  const one = (): number | null => (n === 1 ? argNumber(lit.args[0]) : null);
  switch (lit.name) {
    case "blur": { const r = one(); return r === null || r < 0 ? null : blur(r); }
    case "brightness": { const k = one(); return k === null || k < 0 ? null : brightness(k); }
    case "contrast": { const k = one(); return k === null || k < 0 ? null : contrast(k); }
    case "saturate": { const k = one(); return k === null || k < 0 ? null : saturate(k); }
    case "grayscale": { const k = one(); return k === null || k < 0 || k > 1 ? null : grayscale(k); }
    case "invert": { const k = one(); return k === null || k < 0 || k > 1 ? null : invert(k); }
    case "sepia": { const k = one(); return k === null || k < 0 || k > 1 ? null : sepia(k); }
    case "hueRotate": { const d = one(); return d === null ? null : hueRotate(d); }
    case "colorize": { const c = n === 1 ? argColor(lit.args[0]) : null; return c === null ? null : colorize(c); }
    case "shadow": { const r = coerceShadow(lit); return r.ok ? (r.value as Shadow) : null; }
    default: return null;
  }
}

/** A written `filter` / `backdrop` value: one function, a list, `frost(…)`, or null. */
export function coerceFilter(lit: Literal): Coerced {
  if (lit.kind === "ident" && lit.name === "null") return ok(null);
  if (lit.kind === "call" && lit.name === "frost") {
    if (lit.args.length < 1 || lit.args.length > 2) return fail(FILTER);
    const radius = argNumber(lit.args[0]);
    const saturation = lit.args.length === 2 ? argNumber(lit.args[1]) : 1;
    if (radius === null || saturation === null || radius < 0 || saturation < 0) return fail(FILTER);
    return ok(frost(radius, saturation));
  }
  const items = lit.kind === "list" ? lit.items : [lit];
  const out: Filter[] = [];
  for (const item of items) {
    if (item.kind === "call" && item.name === "frost") {
      const r = coerceFilter(item);
      if (!r.ok) return r;
      out.push(...(r.value as readonly Filter[]));
      continue;
    }
    const f = coerceFilterFn(item);
    if (f === null) return fail(FILTER, item.kind === "call" ? diag`'${item.name}(…)' with these arguments` : undefined);
    out.push(f);
  }
  return ok(Object.freeze(out));
}
