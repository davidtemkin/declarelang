// themes — the named theme PRESETS (library-charter §6: design systems are
// DATA riding one machinery, never code paths). The naming is geographic —
// the campus, not the brand: `cupertino` for the Apple-fidelity record,
// `mountainView` for Material 3, `house(dark)` for Declare's own. (Flutter
// half-shares the idea — Material + Cupertino; Redmond is expected next.)
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
const HOUSE_LIGHT = Object.freeze({
    bg: 0xF4F6FA, surface: 0xFFFFFF, line: 0xDBE1E9,
    text: 0x1B2733, textMuted: 0x6C7A88, textFaint: 0xAAB4BE,
    accent: 0x2E6FE0, accentText: 0xFFFFFF,
    control: 0xE7EBF1, controlActive: 0xD3E2FC,
    depth: 1, focusRing: true, controlRadius: 7,
});
const HOUSE_DARK = Object.freeze({
    bg: 0x0F1620, surface: 0x18212C, line: 0x2A3642,
    text: 0xE7EEF2, textMuted: 0x9DB0BC, textFaint: 0x556673,
    accent: 0x4C8DFF, accentText: 0xFFFFFF,
    control: 0x223040, controlActive: 0x1F3B54,
    depth: 1, focusRing: true, controlRadius: 7,
});
const MOUNTAIN_VIEW_LIGHT = Object.freeze({
    ...HOUSE_LIGHT,
    bg: 0xFFFBFE, surface: 0xFFFFFF, line: 0x79747E,
    text: 0x1C1B1F, textMuted: 0x49454F,
    accent: 0x6750A4, accentText: 0xFFFFFF,
    control: 0xE7E0EC, controlActive: 0xE8DEF8,
    controlRadius: 4, buttonRadius: 999, fieldRadius: 4, fieldPadding: 12,
    buttonHeight: 40, switchWidth: 52, switchHeight: 32, switchThumbOff: 16,
    focusRingWidth: 3, focusRingGap: 2, sliderHandle: "bar",
    checkboxSize: 18, checkboxRadius: 2, disabledOpacity: 0.38,
});
const MOUNTAIN_VIEW_DARK = Object.freeze({
    ...MOUNTAIN_VIEW_LIGHT,
    bg: 0x141218, surface: 0x211F26, line: 0x938F99,
    text: 0xE6E0E9, textMuted: 0xCAC4D0,
    accent: 0xD0BCFF, accentText: 0x381E72,
    control: 0x49454F, controlActive: 0x4A4458,
});
const CUPERTINO_LIGHT = Object.freeze({
    ...HOUSE_LIGHT,
    bg: 0xF5F5F7, surface: 0xFFFFFF, line: 0xC6C6C8,
    text: 0x1D1D1F, textMuted: 0x6E6E73,
    accent: 0x007AFF, accentText: 0xFFFFFF,
    control: 0xFFFFFF, controlActive: 0xE8F0FE,
    controlRadius: 6, buttonRadius: 6, fieldRadius: 6, fieldPadding: 7,
    buttonHeight: 28, switchWidth: 40, switchHeight: 24,
    focusRingWidth: 3.5, focusRingGap: 0,
    checkboxSize: 14, checkboxRadius: 3.5, disabledOpacity: 0.5,
});
const CUPERTINO_DARK = Object.freeze({
    ...CUPERTINO_LIGHT,
    bg: 0x1E1E1E, surface: 0x2C2C2E, line: 0x48484A,
    text: 0xF2F2F7, textMuted: 0x98989D,
    accent: 0x0A84FF, accentText: 0xFFFFFF,
    control: 0x3A3A3C, controlActive: 0x1C3D5F,
});
export const Themes = Object.freeze({
    house: (dark) => (dark ? HOUSE_DARK : HOUSE_LIGHT),
    cupertino: (dark) => (dark ? CUPERTINO_DARK : CUPERTINO_LIGHT),
    mountainView: (dark) => (dark ? MOUNTAIN_VIEW_DARK : MOUNTAIN_VIEW_LIGHT),
    /** An active tone derived from an accent — 22% over the surface tone. */
    tint(c, dark) {
        const base = dark ? 0x22 : 0xFF;
        const mix = (ch) => Math.round(ch * 0.22 + base * 0.78);
        return (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255);
    },
});
//# sourceMappingURL=themes.js.map