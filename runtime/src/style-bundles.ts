// style-bundles — a leaf holding the running program's `style` bundles (name →
// its parsed Element), so BOTH sides can reach them without importing each other:
// `instantiate` SETS the map (it collects the bundles), and `markdown`'s RichText
// resolver READS it (a `<span class>` resolves against it). Keeping this in its own
// tiny module is what preserves tree-shaking — `instantiate` (core, every app) must
// not pull in `markdown` (the RichText engine, RichText apps only), and vice versa.
//
// Type-only import of Element: erased at build, so no runtime dependency crosses.

import type { Element } from "./parser.js";

let BUNDLES = new Map<string, Element>();

/** Install the running program's `style` bundles (instantiate, once per program). */
export function setStyleBundles(b: Map<string, Element>): void {
  BUNDLES = b;
}

/** The current program's `style` bundles, for by-name resolution. */
export function styleBundles(): Map<string, Element> {
  return BUNDLES;
}
