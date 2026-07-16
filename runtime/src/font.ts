// The font declaration — Declare's typed Font model (design-docs/fonts.md). A
// top-level `font Name [ … ]` names a FAMILY that owns its faces: a container,
// like OpenLaszlo's own `<font><face/></font>`, not CSS's flat `@font-face`.
//
//   font Display [ Face [ src = "d-700.woff2", weight = bold ], … ]  // web
//   font UI      [ family = "Helvetica Neue" ]                        // system
//
// `family` is the CSS family the name resolves to (defaults to the declaration
// name). Each `Face [ src, weight?, italic? ]` child is a face to load; a font
// with no faces is a SYSTEM font (its faces are the OS's, resolved at the use
// site). Unlike the stylesheet channel, a font is STATIC: `fontFamily = Name`
// resolves to a plain family string at instantiate (the render seam still
// carries a string; the backends are untouched), no runtime reactivity. Web
// faces are collected for the runtime to load before first paint (index.ts →
// loadFonts) so text measures against real metrics, not a fallback.

import { DeclareError, type Pos } from "./errors.js";
import type { Element, Literal } from "./parser.js";

/** The formalized weight tokens a Face's `weight` is written with (CSS 100–900),
 *  plus the `normal`/`bold` aliases the `fontWeight` slot also accepts. */
export const FONT_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  thin: 100, extralight: 200, light: 300, regular: 400, normal: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
});

/** One web face to load: the family it registers under, the CSS `src` it loads
 *  from (`url("…")`, `local("…")`, or a comma chain), and its descriptors. */
export interface FontFaceSpec {
  readonly family: string;
  readonly src: string;    // a CSS src value: `url("…")` | `local("…")` | `local("…"), url("…")`
  readonly weight: string; // "400" | "700" | …
  readonly style: string;  // "normal" | "italic"
}

/** A resolved font: the family `fontFamily = Name` resolves to, plus (for a web
 *  font) the faces to load. A system font has no faces. */
export interface Font {
  readonly name: string;
  readonly family: string;
  readonly faces: readonly FontFaceSpec[];
}

/** A weight token → its numeric CSS weight, or null if not a formalized token. */
export function faceWeight(token: string): string | null {
  const w = FONT_WEIGHTS[token];
  return w === undefined ? null : String(w);
}

/** The single quoted-string argument of a `url("…")` / `local("…")` source. */
function sourceArg(name: string, call: Extract<Literal, { kind: "call" }>): string {
  if (call.args.length !== 1 || call.args[0].kind !== "string") {
    throw new DeclareError(`${name}(…) takes one quoted string`, call.pos);
  }
  return call.args[0].value;
}

/** A Face's `src` literal → its CSS `src` value. A bare string is a URL; `url(…)`
 *  says so explicitly; `local(…)` names an installed face; a list tries each. */
function cssSource(lit: Literal): string {
  switch (lit.kind) {
    case "string": return `url(${JSON.stringify(lit.value)})`;
    case "call":
      if (lit.name === "url") return `url(${JSON.stringify(sourceArg("url", lit))})`;
      if (lit.name === "local") return `local(${JSON.stringify(sourceArg("local", lit))})`;
      throw new DeclareError(`a face source is a URL string, url("…"), local("…"), or a list of them — not '${lit.name}(…)'`, lit.pos);
    case "list":
      if (lit.items.length === 0) throw new DeclareError(`a face source list is empty`, lit.pos);
      return lit.items.map(cssSource).join(", ");
    default:
      throw new DeclareError(`a face source is a URL string, url("…"), local("…"), or a list of them`, lit.pos);
  }
}

/** Build one Face element into a spec (family is the owning font's). */
function buildFace(fontName: string, family: string, face: Element): FontFaceSpec {
  let src: string | null = null;
  let weight = "400";
  let style = "normal";
  for (const a of face.attrs) {
    if (a.name === "src") { src = cssSource(a.value); continue; }
    if (a.name === "weight") {
      if (a.value.kind !== "ident") throw new DeclareError(`font ${fontName}: a Face weight is a token (thin … black)`, a.value.pos);
      const w = faceWeight(a.value.name);
      if (w === null) throw new DeclareError(`font ${fontName}: '${a.value.name}' is not a weight — use one of ${Object.keys(FONT_WEIGHTS).join(", ")}`, a.value.pos);
      weight = w;
      continue;
    }
    if (a.name === "italic") {
      style = a.value.kind === "ident" && a.value.name === "true" ? "italic" : "normal";
      continue;
    }
    throw new DeclareError(`font ${fontName}: a Face has src, weight, italic — not '${a.name}'`, a.pos);
  }
  if (src === null) throw new DeclareError(`font ${fontName}: a Face needs a src`, face.pos);
  return { family, src, weight, style };
}

/** Build the program's font declarations into resolved Fonts. Mirrors
 *  buildStylesheets: the checker (checkFontBody) reports every error, this
 *  throws on the first as the direct-instantiate safety net. */
export function buildFonts(decls: readonly { name: string; body: Element; pos: Pos }[]): Map<string, Font> {
  const map = new Map<string, Font>();
  for (const decl of decls) {
    const b = decl.body;
    let family = decl.name;
    for (const a of b.attrs) {
      if (a.name === "family" && a.value.kind === "string") { family = a.value.value; continue; }
      throw new DeclareError(`font ${decl.name}: a font body carries 'family = "…"' and Face children only`, a.pos);
    }
    const faces = b.children.map((c) => {
      if (c.tag !== "Face") throw new DeclareError(`font ${decl.name}: '${c.tag}' is not a Face`, c.pos);
      return buildFace(decl.name, family, c);
    });
    if (b.attrs.length === 0 && faces.length === 0) {
      throw new DeclareError(`font ${decl.name}: declare a family ('family = "…"') or at least one Face`, decl.pos);
    }
    map.set(decl.name, { name: decl.name, family, faces });
  }
  return map;
}

/** Every web face across the program's fonts — what the runtime loads before
 *  first paint. */
export function collectFaces(fonts: ReadonlyMap<string, Font>): FontFaceSpec[] {
  const out: FontFaceSpec[] = [];
  for (const f of fonts.values()) out.push(...f.faces);
  return out;
}

// The program's face list, keyed by tree root — index.ts reads it to load the
// web faces before first paint (mirrors the stylesheet registry).
const FACES = new WeakMap<object, readonly FontFaceSpec[]>();

export function registerFontFaces(root: object, faces: readonly FontFaceSpec[]): void {
  FACES.set(root, faces);
}

export function fontFacesOf(root: object): readonly FontFaceSpec[] {
  return FACES.get(root) ?? [];
}
