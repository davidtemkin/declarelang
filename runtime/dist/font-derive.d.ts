/** The derived family name for `base` with `tags` — e.g. `Hoefler_Text--ot--lnum-tnum`. */
export declare function derivedName(base: string, tags: readonly string[]): string;
/** Split a derived name back into its base and tags; null when it is not one.
 *  (The web side never needs this; it is the contract the host implements, and
 *  a test pins the two halves against each other.) */
export declare function splitDerived(name: string): {
    base: string;
    tags: string[];
} | null;
/** Register the derived family if it is not already registered. One FontFace
 *  per face the base family has loaded (so weights and italics stay exact); for
 *  a family the program did not declare, one `local(…)` face — which reaches the
 *  installed regular face, with the browser synthesizing the rest, exactly as a
 *  single-face `@font-face` would. */
export declare function ensureDerived(base: string, derived: string, tags: readonly string[]): void;
