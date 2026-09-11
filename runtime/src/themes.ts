// themes — the built-in theme PRESETS (library-charter §6: design systems are
// DATA riding one machinery, never code paths). The naming is geographic — the
// city, not the brand: `Cupertino` for the compact-desktop record,
// `MountainView` for Material 3, `SanFrancisco` for Declare's own, named for
// where Declare is made — and `SanFrancisco` is ALSO what a widget renders when
// nothing provides a theme (control.declare's `theme: Theme = provided("theme",
// SanFrancisco)`). Each city has a light record and a `…Dark` companion; an app
// picks the pair it wants (`theme = { app.dark ? CupertinoDark : Cupertino }`).
//
// A record carries the full vocabulary the library consults: colors, role radii
// (buttonRadius pill-capable / fieldRadius), control heights, switch dimensions
// and grow-on-check, checkbox metrics, field insets, disabled opacities, and the
// focus-indicator geometry. Each preset is a named value in scope inside `{ }`
// bodies, so an app names the ones it wants directly.

import type { Theme } from "./value.js";
import { THEME_RECORDS } from "./themes-data.js";

// The records are authored in library/themes/*.declare (`theme Name [ … ]`
// declarations — the language's own record form) and projected into
// themes-data.ts by gen-themes.mjs, freshness-gated. This module is the calling
// surface over those objects: the by-name table an app's `{ }` bodies read, and
// the `tint` helper.

/** The built-in theme presets, keyed by name — the values a body's bare
 *  `SanFrancisco` / `CupertinoDark` reference, and the set `theme = Name`
 *  resolves against. */
export const THEME_PRESETS: Readonly<Record<string, Theme>> = THEME_RECORDS;

/** The preset names, for the checker and the scaffold. */
export const THEME_PRESET_NAMES: readonly string[] = Object.keys(THEME_RECORDS);

/** An active tone derived from an accent — 22% over the surface tone. What an
 *  accent override uses so nothing keeps a stale precomputed tint. */
export function tint(c: number, dark?: boolean): number {
  const base = dark ? 0x22 : 0xFF;
  const mix = (ch: number): number => Math.round(ch * 0.22 + base * 0.78);
  return (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255);
}
