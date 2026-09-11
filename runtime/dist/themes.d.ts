import type { Theme } from "./value.js";
/** The built-in theme presets, keyed by name — the values a body's bare
 *  `SanFrancisco` / `CupertinoDark` reference, and the set `theme = Name`
 *  resolves against. */
export declare const THEME_PRESETS: Readonly<Record<string, Theme>>;
/** The preset names, for the checker and the scaffold. */
export declare const THEME_PRESET_NAMES: readonly string[];
/** An active tone derived from an accent — 22% over the surface tone. What an
 *  accent override uses so nothing keeps a stale precomputed tint. */
export declare function tint(c: number, dark?: boolean): number;
