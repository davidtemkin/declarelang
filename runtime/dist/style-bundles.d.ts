import type { Element } from "./parser.js";
/** Install the running program's `style` bundles (instantiate, once per program). */
export declare function setStyleBundles(b: Map<string, Element>): void;
/** The current program's `style` bundles, for by-name resolution. */
export declare function styleBundles(): Map<string, Element>;
