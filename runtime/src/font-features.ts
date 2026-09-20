// OPENTYPE FEATURES — carried by the FAMILY NAME, which is the only channel
// every renderer already shares.
//
// The problem a feature poses is not how to paint it, it is how to MEASURE it.
// A feature changes advance widths, and Declare's layout, wrapping, clamping and
// metric facts all go through `measure.ts`, which measures with canvas
// `measureText` against a CSS font shorthand — and the shorthand has no slot for
// features. Set the feature only where it paints (CSS `font-feature-settings` on
// the element, a Core Text descriptor on the host) and paint and layout disagree
// on that renderer. That is defect D1 exactly (the small-caps parse), and it is
// the reason this is worth a file of its own.
//
// The answer, measured before it was built (rendering-gaps.md §11c): a
// `FontFace(name, src, { featureSettings })` registers a family whose every
// glyph already carries the feature, and canvas `measureText` honours it —
// Hoefler Text's digits measure 152.08 plain and 182.40 with `lnum`, through the
// shared measurer, with no change to the measurer at all. And the source may be
// `local("Hoefler Text")`, so this reaches INSTALLED faces, not only the ones a
// program ships.
//
// So a run asking for features resolves to a DERIVED family name, and the name
// is what travels:
//
//   fontFamily = [Hoefler, "Georgia"] + numerals = lining
//     → "Hoefler--ot--lnum, Hoefler, Georgia--ot--lnum, Georgia"
//
// Every base family stays in the list right behind its derived twin, so a
// derivation that fails to register degrades to the plain face rather than to
// the system default — CSS's own fallback does the work.
//
// The native host does NOT register derived families; it reads the suffix off
// the name and applies the features through a Core Text descriptor
// (TextEngine.swift). Same one name, same one meaning, three renderers.

// The derived names and their registration are font-derive.ts — carried by a
// production build only for a program that asks for a feature.
import { derivedName, ensureDerived } from "./font-derive.js";

/** The shape of the digits: `normal` is whatever the face does by default. */
export type Numerals = "normal" | "lining" | "oldstyle";
/** The advance of the digits: `tabular` = every digit the same width. */
export type NumeralWidth = "normal" | "tabular" | "proportional";

/** A style's OpenType feature tags, sorted so one combination has one name. */
export function featureTags(style: {
  numerals?: Numerals; numeralWidth?: NumeralWidth; slashedZero?: boolean;
}): string[] {
  const tags: string[] = [];
  if (style.numerals === "lining") tags.push("lnum");
  else if (style.numerals === "oldstyle") tags.push("onum");
  if (style.numeralWidth === "tabular") tags.push("tnum");
  else if (style.numeralWidth === "proportional") tags.push("pnum");
  if (style.slashedZero === true) tags.push("zero");
  return tags.sort();
}

// The CSS generic families and the platform aliases every font stack uses —
// keywords, never quoted (a quoted "serif" names a family called serif).
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong",
  "-apple-system", "blinkmacsystemfont"]);

/** One family name as a CSS font shorthand will accept it. An unquoted family
 *  must be a sequence of identifiers, and a token that starts with a digit is
 *  not one — so `400 17px Source Serif 4` is not a font at all, and canvas
 *  `ctx.font` REJECTS it silently and keeps whatever font it had. The measurer
 *  then measures in one face while the painter draws in another: tiny glyphs,
 *  huge word gaps, a column that wraps short. Found by my-apps/fonts-and-text,
 *  whose reading face is Source Serif 4; DOM and the Mac host were unaffected.
 *  A name that is already quoted, a generic keyword, or a valid identifier
 *  sequence passes through untouched, so no existing font string changes. */
export function cssFamilyName(name: string): string {
  const n = name.trim();
  if (n === "" || n.startsWith('"') || n.startsWith("'") || GENERIC.has(n.toLowerCase())) return n;
  if (n.split(/\s+/).every((t) => /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(t))) return n;
  return `"${n.replace(/["\\]/g, "\\$&")}"`;
}

/** The family list a style should MEASURE AND PAINT in — the authored list when
 *  it asks for no features, and the derived-then-plain list when it does. Every
 *  name leaves CSS-safe (cssFamilyName), and a list that needs no quoting comes
 *  back as the very string that went in. */
const PLAIN = new Map<string, string>();
export function featureFamily(family: string, tags: readonly string[]): string {
  // THE PLAIN CASE IS MEMOIZED (2026-09-18): every text asks this on every
  // measure — the same family string split, trimmed and quote-checked (a regex
  // per name) each time. It is a pure function of the string. The feature case
  // below is not memoized: it registers derived faces as it goes.
  if (tags.length === 0) {
    const hit = PLAIN.get(family);
    if (hit !== undefined) return hit;
  }
  if (family === "") return family;
  const names = family.split(",").map((raw) => raw.trim()).filter((n) => n !== "");
  if (tags.length === 0) {
    const safe = names.map(cssFamilyName);
    const r = safe.every((n, i) => n === names[i]) ? family : safe.join(", ");
    if (PLAIN.size > 4096) PLAIN.clear();
    PLAIN.set(family, r);
    return r;
  }
  const out: string[] = [];
  for (const name of names) {
    const derived = derivedName(name, tags);
    ensureDerived(name, derived, tags);
    out.push(derived, cssFamilyName(name));
  }
  return out.join(", ");
}
