import type { Element } from "./parser.js";
/** Install the running program's `style` bundles (instantiate, once per program). */
export declare function setStyleBundles(b: Map<string, Element>): void;
/** The current program's `style` bundles, for by-name resolution. */
export declare function styleBundles(): Map<string, Element>;
/** A bundle's fields as a frozen record of runtime values, keyed by the `Text`
 *  attribute names they set. A field that is not a coercible literal (the
 *  checker refuses those) is left out. */
export declare function bundleRecord(el: Element): Readonly<Record<string, unknown>>;
