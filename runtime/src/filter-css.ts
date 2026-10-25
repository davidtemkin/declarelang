// filter-css — the CSS spelling of a filter list. Core: a filter or backdrop can
// arrive without a constructor the program names (a theme token, a value from
// data), and the backends paint it the same in every build. The constructors and
// the literal coercion stay with effects.ts.

import { colorToCss, type Color, type Filter } from "./value.js";

/** The CSS spelling of a filter list — DOM `filter:`/`backdrop-filter:` and
 *  canvas `ctx.filter` share it. `scale` maps view units to the target's
 *  (device px on canvas, 1 on the DOM where CSS scales with the transform).
 *  `colorize` has no CSS function: the DOM realizes it as an SVG `feColorMatrix`
 *  reference the backend registers (`tintRef`), canvas as a `source-in` pass
 *  after the blit — both leave it out of this string. */
export function filterCss(list: readonly Filter[], scale = 1, tintRef?: (color: Color) => string): string {
  const parts: string[] = [];
  for (const f of list) {
    switch (f.fn) {
      case "blur": parts.push(`blur(${f.radius * scale}px)`); break;
      case "brightness": case "contrast": case "saturate": case "grayscale": case "invert": case "sepia":
        parts.push(`${f.fn}(${f.amount})`); break;
      case "hueRotate": parts.push(`hue-rotate(${f.degrees}deg)`); break;
      // CSS drop-shadow's third length is the Gaussian's σ; `shadow(…)`'s blur is
      // the box-shadow radius (2σ) at every site, so one value looks the same
      // on a box, on glyphs, and in a filter list — halve it here.
      case "shadow": parts.push(`drop-shadow(${f.dx * scale}px ${f.dy * scale}px ${(f.blur * scale) / 2}px ${colorToCss(f.color)})`); break;
      case "colorize": if (tintRef !== undefined) parts.push(tintRef(f.color)); break;
    }
  }
  return parts.length === 0 ? "none" : parts.join(" ");
}
