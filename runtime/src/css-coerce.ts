// CSS value coercers: raw declaration strings → declarelang attribute values.
// This is where ALL folding lives (the parser stays structural). Each coercer
// returns `undefined` on malformed input; the CSS applier then skips that
// declaration (and the checker will flag it). `color` is net-new parsing —
// css-colors.ts supplies only the 148 named-color keywords, not hex/rgb.

import { CSS_COLORS } from "./css-colors.js";

/** A CSS color value → 0xRRGGBB int, or undefined if unrecognizable. Accepts
 *  `#rgb`, `#rrggbb`, `rgb(r,g,b)` (channels clamped to 255), and the 148
 *  `<named-color>` keywords (case-insensitive). */
export function coerceColor(raw: string): number | undefined {
  const s = raw.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16));
    return (r << 16) | (g << 8) | b;
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return parseInt(m[1], 16);
  m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.min(255, parseInt(n, 10)));
    return (r << 16) | (g << 8) | b;
  }
  if (Object.hasOwn(CSS_COLORS, s)) return CSS_COLORS[s];
  return undefined;
}

/** A CSS length → number (px stripped), or undefined. Unitless is accepted. */
export function coerceLength(raw: string): number | undefined {
  const m = /^(-?\d*\.?\d+)(px)?$/.exec(raw.trim());
  return m ? Number(m[1]) : undefined;
}

/** A bare number, or undefined. */
export function coerceNumber(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** A non-empty string (verbatim, trimmed), or undefined. */
export function coerceString(raw: string): string | undefined {
  const s = raw.trim();
  return s === "" ? undefined : s;
}

/** A font-weight → "bold" | "normal", or undefined. Numeric ≥600 → bold. */
export function coerceWeight(raw: string): string | undefined {
  const s = raw.trim().toLowerCase();
  if (s === "bold" || s === "normal") return s;
  const n = Number(s);
  if (Number.isFinite(n)) return n >= 600 ? "bold" : "normal";
  return undefined;
}
