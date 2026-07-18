// themes — the named theme PRESETS (library-charter §6: design systems are
// DATA riding one machinery, never code paths). The naming is geographic —
// the city, not the brand: `cupertino` for the Apple-fidelity record,
// `mountainView` for Material 3, `sanFrancisco(dark)` for Declare's own —
// named for where Declare is made, and it is ALSO the zero-declaration
// default: an app that never mentions a theme renders sanFrancisco(light)
// (value.ts DEFAULT_THEME IS the San Francisco light record — one object,
// not a copy, so the fallback tier can never drift from the named preset).
// (Flutter half-shares the idea — Material + Cupertino; Redmond is next.)
//
// Each preset is a FUNCTION of the one resolved mode fact (dark), returning a
// plain token record for the prevailing `theme` slot:
//
//   theme = { Themes.cupertino(app.dark) }
//
// The records carry the full vocabulary the library consults: colors, role
// radii (buttonRadius pill-capable / fieldRadius), control heights, switch
// dimensions and grow-on-check, checkbox metrics, field insets, disabled
// opacities, and the focus-indicator geometry. `tint(c, dark)` derives an
// active tone from any accent (22% over the surface tone) — what an accent
// override uses so nothing keeps a stale precomputed tint.
import { THEME_RECORDS as R } from "./themes-data.js";
// The records are AUTHORED in library/themes/*.declare (stylesheet
// declarations carrying `theme: Theme [ … ]` records — the language's own
// channel) and PROJECTED into themes-data.ts by gen-themes.mjs, freshness-
// gated. This module is just the calling surface over those objects; the
// zero-declaration default (value.ts DEFAULT_THEME) is R.SanFrancisco by
// identity, so the fallback tier and the named preset cannot drift.
export const Themes = Object.freeze({
    sanFrancisco: (dark) => (dark ? R.SanFranciscoDark : R.SanFrancisco),
    cupertino: (dark) => (dark ? R.CupertinoDark : R.Cupertino),
    mountainView: (dark) => (dark ? R.MountainViewDark : R.MountainView),
    /** An active tone derived from an accent — 22% over the surface tone. */
    tint(c, dark) {
        const base = dark ? 0x22 : 0xFF;
        const mix = (ch) => Math.round(ch * 0.22 + base * 0.78);
        return (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255);
    },
});
//# sourceMappingURL=themes.js.map