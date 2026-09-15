// The DERIVED FAMILIES behind OpenType features (font-features.ts): the name a
// feature combination travels under, and its registration on the web. Its own
// file so a production build carries it only for a program that asks for a
// feature — `numerals`, `numeralWidth`, `slashedZero` (declarec's slim-features).

import { familyChanged, loadedFontFaces } from "./face-table.js";

/** The marker that makes a derived name unmistakable and parseable on the far
 *  side. Chosen to be legal in an unquoted CSS custom ident, so a derived name
 *  never needs quoting in a font shorthand however the base was spelled. */
const MARK = "--ot--";

function sanitize(name: string): string {
  return name.replace(/^["']|["']$/g, "").trim().replace(/[^A-Za-z0-9_-]/g, "_");
}

/** The derived family name for `base` with `tags` — e.g. `Hoefler_Text--ot--lnum-tnum`. */
export function derivedName(base: string, tags: readonly string[]): string {
  return `${sanitize(base)}${MARK}${tags.join("-")}`;
}

/** Split a derived name back into its base and tags; null when it is not one.
 *  (The web side never needs this; it is the contract the host implements, and
 *  a test pins the two halves against each other.) */
export function splitDerived(name: string): { base: string; tags: string[] } | null {
  const i = name.indexOf(MARK);
  if (i < 0) return null;
  return { base: name.slice(0, i).replace(/_/g, " "), tags: name.slice(i + MARK.length).split("-") };
}

// Running on the native host? There the FontFace shim hands bytes to
// FontRegistry, which knows nothing about features — so the host reads the
// suffix instead and the web registration below would only file the plain face
// under the derived name, defeating both.
function onMacHost(): boolean {
  return (globalThis as unknown as { __declareMacHost?: unknown }).__declareMacHost !== undefined;
}

const REGISTERED = new Set<string>();

/** Register the derived family if it is not already registered. One FontFace
 *  per face the base family has loaded (so weights and italics stay exact); for
 *  a family the program did not declare, one `local(…)` face — which reaches the
 *  installed regular face, with the browser synthesizing the rest, exactly as a
 *  single-face `@font-face` would. */
export function ensureDerived(base: string, derived: string, tags: readonly string[]): void {
  if (REGISTERED.has(derived) || onMacHost()) return;
  REGISTERED.add(derived);
  if (typeof FontFace === "undefined" || typeof document === "undefined") return;
  const featureSettings = tags.map((t) => `"${t}" 1`).join(", ");
  const plain = base.replace(/^["']|["']$/g, "").trim();
  const loaded = loadedFontFaces().filter((f) => f.family.toLowerCase() === plain.toLowerCase());
  const specs = loaded.length > 0
    ? loaded.map((f) => ({ src: f.src, weight: f.weight, style: f.style }))
    : [{ src: `local("${plain}")`, weight: "1 1000", style: "normal" }];
  for (const sp of specs) {
    try {
      const face = new FontFace(derived, sp.src, { weight: sp.weight, style: sp.style, featureSettings });
      void face.load().then(
        () => {
          (document.fonts as unknown as { add(f: FontFace): void }).add(face);
          // THE POINT OF THE TRACKED READ (face-table.ts): this lands a beat after the
          // render that asked for it, and the text that measured in the plain
          // face re-measures itself rather than staying wrong.
          familyChanged(derived);
        },
        () => { /* no such local face, or the bytes refused: the base is next in the list */ },
      );
    } catch { /* a descriptor this engine will not take: same fallback */ }
  }
}
