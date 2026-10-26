// themes — the built-in theme PRESETS (library-charter §6: design systems are
// DATA riding one machinery, never code paths). The naming is geographic — the
// city, not the brand: `Cupertino` for the compact-desktop record,
// `MountainView` for Material 3, `SanFrancisco` for Declare's own, named for
// where Declare is made — and `SanFrancisco` is ALSO what a widget renders when
// nothing provides a theme (control.declare's `theme: Theme = provided("theme",
// SanFrancisco)`). Each city has a light record and a `…Dark` companion; an app
// picks the pair it wants (`theme = { app.systemDark ? CupertinoDark : Cupertino }`).
//
// A record carries the full vocabulary the library consults: colors, role radii
// (buttonCornerRadius pill-capable / fieldCornerRadius), control heights, switch dimensions
// and grow-on-check, checkbox metrics, field insets, disabled opacities, and the
// focus-indicator geometry. Each preset is a named value in scope inside `{ }`
// bodies, so an app names the ones it wants directly.

import type { Theme } from "./value.js";
import { THEME_RECORDS, ThemeDefaults } from "./themes-data.js";

// The records are authored in library/themes/*.declare (`theme Name [ … ]`
// declarations — the language's own record form) and projected into
// themes-data.ts by gen-themes.mjs, freshness-gated. This module is the calling
// surface over those objects: the by-name table an app's `{ }` bodies read, and
// the `tint` helper.

/** The built-in theme presets, keyed by name — the values a body's bare
 *  `SanFrancisco` / `CupertinoDark` reference, and the set `theme = Name`
 *  resolves against. */
/** A theme with the optional tokens it does not state filled from the library's
 *  defaults (library/themes/defaults.declare) — what every provided theme is
 *  laid over, so a reader never carries a fallback. The same theme object
 *  always yields the same filled one (identity is what keeps a reader quiet). */
const FILLED = new WeakMap<object, Theme>();
export function withThemeDefaults(t: Theme): Theme {
  if (t === null || typeof t !== "object") return t;
  const hit = FILLED.get(t);
  if (hit !== undefined) return hit;
  let missing = false;
  for (const k in ThemeDefaults) if (!(k in t)) { missing = true; break; }
  const out = missing ? Object.freeze({ ...ThemeDefaults, ...t }) as Theme : t;
  FILLED.set(t, out);
  if (out !== t) FILLED.set(out, out);
  return out;
}

export const THEME_PRESETS: Readonly<Record<string, Theme>> = /* @__PURE__ */ Object.freeze(
  Object.fromEntries(Object.entries(THEME_RECORDS).map(([k, r]) => [k, withThemeDefaults(r as Theme)])));


/** The preset names, for the checker and the scaffold. */
export const THEME_PRESET_NAMES: readonly string[] = Object.keys(THEME_RECORDS);

/** The house ACTIVE TONE: an accent laid 22% over the surface it sits on — the
 *  value a theme's `controlSelected` takes, and what an app that overrides
 *  `accent` recomputes so the selected tone is not a stale one derived from the
 *  preset's accent.
 *
 *  It takes the SURFACE rather than a `dark` flag. The flag only ever chose
 *  between two hard-coded bases, so a caller had to tell a theme helper which
 *  appearance it was in, and passing the wrong one silently returned the other
 *  mode's tone. The surface is a value the caller already has — it is the token
 *  being mixed over — so the arithmetic is honest and there is nothing to get
 *  out of step.
 *
 *  Renamed from `tint`, which is `Image.tint` and a filter op elsewhere in the
 *  language (`tint = { provided("theme").accent }` recolors a mask bitmap): one word, two
 *  unrelated meanings. */
export function activeTone(accent: number, surface: number): number {
  const mix = (sh: number): number =>
    Math.round(((accent >> sh) & 255) * 0.22 + ((surface >> sh) & 255) * 0.78);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
