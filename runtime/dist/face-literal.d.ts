import type { Literal } from "./parser.js";
/** The formalized weight tokens (CSS 100–900), plus the `normal`/`bold` aliases. */
export declare const FONT_WEIGHTS: Readonly<Record<string, number>>;
/** A Face's weight at runtime: a token, a number 1–1000, or a variable range. */
export type FaceWeight = string | number | readonly [number, number];
/** A weight token → its numeric CSS weight, or null if not a formalized token. */
export declare function faceWeight(token: string): string | null;
export declare const FACE_WEIGHT_FORMS = "a token (thin \u2026 black), a number 1\u20131000, or range(lo, hi) for a variable font";
/** What a Face's `weight` may be written as — the one rule for the checker and
 *  the coercion. `range(lo, hi)` is a VARIABLE font whose `wght` axis spans the
 *  range: the face answers every weight in it (CSS's `font-weight: 100 900`). */
export declare function faceWeightLiteral(lit: Literal): {
    value: FaceWeight;
} | {
    error: string;
};
/** A runtime weight → the CSS `font-weight` descriptor a face registers with. */
export declare function faceWeightDescriptor(v: unknown): string;
/** What a Face's `src` may be written as: a URL string, `url("…")`, `local("…")`,
 *  or a list of those tried in order. The value is the CSS form of each item. */
export declare function faceSourceLiteral(lit: Literal): {
    value: string | string[];
} | {
    error: string;
};
/** A runtime source → a CSS `src` value, relative URLs rebased with `rebase`.
 *  A bare string is a URL; `url("…")` / `local("…")` pass through (a url's
 *  argument rebased); a list joins in order. */
export declare function faceSourceCss(v: unknown, rebase: (url: string) => string): string;
