import { type Color, type Filter } from "./value.js";
/** The CSS spelling of a filter list — DOM `filter:`/`backdrop-filter:` and
 *  canvas `ctx.filter` share it. `scale` maps view units to the target's
 *  (device px on canvas, 1 on the DOM where CSS scales with the transform).
 *  `colorize` has no CSS function: the DOM realizes it as an SVG `feColorMatrix`
 *  reference the backend registers (`tintRef`), canvas as a `source-in` pass
 *  after the blit — both leave it out of this string. */
export declare function filterCss(list: readonly Filter[], scale?: number, tintRef?: (color: Color) => string): string;
