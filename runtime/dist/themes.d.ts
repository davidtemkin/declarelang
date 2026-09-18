import type { Theme } from "./value.js";
/** The built-in theme presets, keyed by name — the values a body's bare
 *  `SanFrancisco` / `CupertinoDark` reference, and the set `theme = Name`
 *  resolves against. */
export declare const THEME_PRESETS: Readonly<Record<string, Theme>>;
/** The preset names, for the checker and the scaffold. */
export declare const THEME_PRESET_NAMES: readonly string[];
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
 *  language (`tint = { theme.accent }` recolors a mask bitmap): one word, two
 *  unrelated meanings. */
export declare function activeTone(accent: number, surface: number): number;
