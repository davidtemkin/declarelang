import { type Pos } from "./errors.js";
import type { Element } from "./parser.js";
/** The formalized weight tokens a Face's `weight` is written with (CSS 100–900),
 *  plus the `normal`/`bold` aliases the `fontWeight` slot also accepts. */
export declare const FONT_WEIGHTS: Readonly<Record<string, number>>;
/** One web face to load: the family it registers under, the CSS `src` it loads
 *  from (`url("…")`, `local("…")`, or a comma chain), and its descriptors. */
export interface FontFaceSpec {
    readonly family: string;
    readonly src: string;
    readonly weight: string;
    readonly style: string;
}
/** A resolved font: the family `fontFamily = Name` resolves to, plus (for a web
 *  font) the faces to load. A system font has no faces. */
export interface Font {
    readonly name: string;
    readonly family: string;
    readonly faces: readonly FontFaceSpec[];
}
/** A weight token → its numeric CSS weight, or null if not a formalized token. */
export declare function faceWeight(token: string): string | null;
/** Build the program's font declarations into resolved Fonts. Mirrors
 *  buildStylesheets: the checker (checkFontBody) reports every error, this
 *  throws on the first as the direct-instantiate safety net. */
export declare function buildFonts(decls: readonly {
    name: string;
    body: Element;
    pos: Pos;
}[]): Map<string, Font>;
/** Every web face across the program's fonts — what the runtime loads before
 *  first paint. */
export declare function collectFaces(fonts: ReadonlyMap<string, Font>): FontFaceSpec[];
export declare function registerFontFaces(root: object, faces: readonly FontFaceSpec[]): void;
export declare function fontFacesOf(root: object): readonly FontFaceSpec[];
