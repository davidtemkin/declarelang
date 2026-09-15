import type { DomSurface } from "./dom-backend.js";
export declare function tintFilterRef(doc: Document, color: number | null): string;
/** The soft mask (graphics-pass.md §2) onto `s`'s element: CSS `mask-image`. A
 *  gradient masks by its alpha over the box. A STENCIL view masks by its painted
 *  alpha at its own box — and the DOM can only hand CSS a bitmap it already
 *  holds: an Image stencil's source, or a draw() stencil's raster (re-exported
 *  when it re-rasterizes — `maskUsers`). Any other stencil is refused with one
 *  warning; the canvas and Mac backends take any view. */
export declare function applyDomMask(s: DomSurface): void;
