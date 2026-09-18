// Text — the text leaf. A single run of styled text, measured by the
// browser's native metrics (measure.ts; the Flash-era text-metric quirk is
// deliberately shed — APPROACH §3 ledger #1) and rendered by each backend's
// own rasterizer: a real DOM text node there, fillText on the shared canvas
// here — same glyph geometry, substrate-native inking.
//
// Style is the face quartet Text declares (textColor/fontSize/fontFamily/
// fontWeight — one textColor slot carries the glyph color), each a `provided(
// name, default)` read: a Text with no style of its own renders with whatever
// the nearest providing container says, live. The seam push is
// therefore a small *derive* over the effective values (the ruled shape —
// exactly like the measure derives): it reads the four slots under tracking,
// so a provider change anywhere up the chain re-styles exactly the runs that
// follow it, and re-measures them (the auto-size derives read the same
// slots). `textShadow` (a decoration value) rides the same derive — style is
// the cold path, one seam call per style change (the R3 setText/setTextStyle
// split, kept).
//
// Sizing: a width/height the author never set auto-sizes to the measured
// text — a real *derive* on the reactive core (R4), reading text and the
// font attributes under tracking; an explicit `width=0` means zero (was-set
// tracking); the derive *yields* to a direct author write. Wrapping /
// multiline is a ruled open question (HANDOFF) — a run never wraps.
import { View, onDiscard } from "./view.js";
import { shadowEqual, outlineEqual } from "./value.js";
import { fontMetrics, fontString, textWidth, transformText, wrapLines, capHeight as measureCapHeight, xHeight as measureXHeight } from "./measure.js";
import { holdsFamily, heldFamily } from "./font-value.js";
/** A line count under `maxLines` (0 = no clamp). */
const clampN = (n, max) => (max > 0 ? Math.min(n, max) : n);
import { bindDerived, defineAttributes, faceSlots, isSet, ownerOf, providedDefault, setBound } from "./attributes.js";
import { Constraint } from "./reactive.js";
export class Text extends View {
    /** The per-line advance: the declared leading (a fontSize multiplier, the
     *  Markdown convention) or, at the 0 default, the font's natural line box. */
    lineAdvance(m) {
        return this.lineHeight > 0 ? Math.round(this.fontSize * this.lineHeight) : m.ascent + m.descent;
    }
    // ── Author-facing font metrics (compositing.md Part III) — read-only,
    // REACTIVE intrinsics of the EFFECTIVE font (the face slots): each
    // getter measures through fontString(this), whose slot reads are tracked,
    // so a constraint reading `label.ascent` re-derives when the effective
    // font changes — a provider re-rooting above included. Measurement, not
    // font tables, deliberately: no web API reads a font's binary (unreachable
    // for system fonts, and it carries THREE competing ascent/descent sets
    // browsers disagree on) — the measurer reports what THIS engine renders.
    // RULED in-build: Text-only v1 (no per-font query service until a real
    // program needs one that a hidden Text cannot serve).
    /** The effective font's ascent above the baseline (the font bounding box,
     *  a property of the font — independent of this run's characters). */
    get ascent() { return fontMetrics(fontString(this)).ascent; }
    /** The effective font's descent below the baseline — ascent + descent is
     *  the natural line box. */
    get descent() { return fontMetrics(fontString(this)).descent; }
    /** The capital ink band above the baseline (probed from "H" — what
     *  `y = center` optically centers). */
    get capHeight() { return measureCapHeight(fontString(this)); }
    /** The lowercase ink band above the baseline (probed from "x"). */
    get xHeight() { return measureXHeight(fontString(this)); }
    /** The y of the FIRST baseline inside this view — what cross-font,
     *  cross-size baseline alignment positions against:
     *  `y = { title.y + title.baseline - this.baseline }`. Both renderers
     *  place the first line's baseline at the font ascent (the natural-box
     *  rule; a declared `lineHeight` changes the stride between lines, never
     *  where the first baseline sits). */
    get baseline() { return fontMetrics(fontString(this)).ascent; }
    attach(backend, parentSurface) {
        // A switch to a font still inside its wait keeps this run in the family it
        // had until the font settles (font-value.ts) — measure and paint alike.
        holdsFamily(this);
        // Auto-size installs at attach (measurement is a browser activity — the
        // model stays Node-importable) and only for unowned, never-set slots: an
        // author literal, constraint, or percent takes precedence untouched.
        if (!isSet(this, "width") && ownerOf(this, "width") === null) {
            // As wide as the widest HARD line: a newline breaks the line on every renderer
            // even when soft wrapping is off, so the whole string is not one line's width.
            bindDerived(this, "width", () => {
                const font = fontString(this);
                return Math.ceil(transformText(this.text, this.textTransform).split("\n")
                    .reduce((w, line) => Math.max(w, textWidth(line, font, this.letterSpacing)), 0));
            });
        }
        if (!isSet(this, "height") && ownerOf(this, "height") === null) {
            bindDerived(this, "height", () => {
                const m = fontMetrics(fontString(this));
                const lineH = this.lineAdvance(m);
                // A bounded width wraps (unless wrap=false) → height extends to the
                // wrapped line count. Reading `width` keeps this reactive, so a
                // container/viewport resize re-wraps and re-flows — baseline.
                const bounded = (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0;
                const all = bounded && this.wrap
                    ? wrapLines(transformText(this.text, this.textTransform), fontString(this), this.width, this.letterSpacing).length
                    // Not wrapping still breaks at a HARD newline — DOM (`pre`), canvas and the
                    // Mac host all draw each line — so a code block's Text is as tall as its lines.
                    : this.text.split("\n").length;
                setBound(this, "truncated", this.maxLines > 0 && all > this.maxLines);
                const lines = clampN(all, this.maxLines);
                return Math.ceil(lineH * lines);
            });
        }
        super.attach(backend, parentSurface);
    }
    /** A Text's own content folds into `contentWidth`/`contentHeight` as its
     *  MEASURED glyph extent — the way an Image folds in its bitmap (view.ts
     *  contentExtent). Without this a Text reported the base 0, so a container
     *  sizing to `label.contentWidth` (an auto-sized pill/badge) always read
     *  empty. Reads `text` and the font slots under tracking (contentExtent runs
     *  tracked), so it re-measures when the text or style changes — the fix for
     *  content-bound labels. The natural single-line width; height follows the
     *  wrapped line count when the width is bounded, matching the derives above. */
    contentExtent(size) {
        const font = fontString(this);
        const disp = transformText(this.text, this.textTransform);
        if (size === "width")
            return Math.ceil(disp.split("\n").reduce((w, line) => Math.max(w, textWidth(line, font, this.letterSpacing)), 0));
        const m = fontMetrics(font);
        const bounded = (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0;
        const all = bounded && this.wrap ? wrapLines(disp, font, this.width, this.letterSpacing).length : disp.split("\n").length;
        setBound(this, "truncated", this.maxLines > 0 && all > this.maxLines);
        const lines = clampN(all, this.maxLines);
        return Math.ceil(this.lineAdvance(m) * lines);
    }
    // `y = center` centers the geometric box (View.alignBand), like every other
    // view and like the x axis — the ordinary meaning. A label that wants its cap
    // band optically centered uses the library's TextLabel (a Text whose y is a
    // cap-centering constraint over baseline/capHeight); box-centering was the
    // surprising default and is retired here (2026-09-06).
    flush(s) {
        super.flush(s);
        // Style before text: the style creates the run's rendering context, the
        // text is the hot path that changes alone under a constraint. The style
        // push is a standing derive because the four slots read provided values:
        // the effective values can change with no write to THIS view (a provider
        // re-roots above), and the tracked reads here are what follow it.
        const style = new Constraint(`${this.constructor.name}.textStyle`, () => {
            // THE FACE TABLE, read here too (face-table.ts). A Text with both
            // dimensions set has no auto-size constraint, so this push is the only
            // thing on the view that can notice its face changing — and a backend
            // only re-wraps when it receives a push (canvas drops its lines, the host
            // rebuilds its layer). `fontString` is the one choke point that tracks
            // the effective families, so reading it subscribes this push to exactly
            // this Text's families and no others. Pinned in test/text.test.mjs,
            // which drives the table by assignment; a real load race never showed it.
            fontString(this);
            return {
                fontFamily: heldFamily(this, "fontFamily", this.fontFamily),
                fontSize: this.fontSize,
                fontWeight: this.fontWeight,
                letterSpacing: this.letterSpacing,
                color: this.textColor,
                shadow: this.textShadow,
                wrap: this.wrap && (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0,
                maxLines: this.maxLines,
                align: this.textAlign,
                italic: this.italic,
                textFill: this.textFill,
                outline: this.outline,
                textTransform: this.textTransform,
                smallCaps: this.smallCaps,
                numerals: this.numerals,
                numeralWidth: this.numeralWidth,
                slashedZero: this.slashedZero,
                underline: this.underline,
                strike: this.strike,
                selectable: this.selectable,
                lineHeight: this.lineHeight,
            };
        }, 
        // Constraint is deliberately untyped across compute→apply; this
        // apply's input is exactly its compute's output.
        (st) => this.surface?.setTextStyle(st), 0);
        style.run();
        onDiscard(this, () => style.dispose());
        s.setText(this.text);
    }
}
defineAttributes(Text, {
    // The FACE slots, off View (docs/system-design/style.md): each defaults to the
    // nearest provided value, so a bare Text inherits its region's style; setting
    // one overrides just this run. `selectable` carries the DOM selection push.
    // …built from the ONE face table (attributes.ts PROVIDED_FACE), which
    // `providedTextStyle()` reads too, so a measurement and the run it measures
    // can never fall to different defaults.
    ...faceSlots(),
    selectable: {
        def: false,
        defBinding: providedDefault("selectable", false),
        push: (v, val) => v.surface?.setSelectableRegion?.(val === true),
    },
    text: { def: "", push: (t, v) => t.surface?.setText(v) },
    textShadow: { def: null, equal: shadowEqual },
    wrap: { def: true },
    maxLines: { def: 0 },
    truncated: { def: false },
    textAlign: { def: "left" },
    italic: { def: false },
    textFill: { def: null },
    // Typographical treatments — a Text wears them like textShadow/textFill; runs
    // get them through the RichText span path. Paint/decoration, per-Text.
    outline: { def: null, equal: outlineEqual },
    textTransform: { def: "none" },
    smallCaps: { def: false },
    // OpenType figures: `normal` on either axis is the face's own default, which
    // is why both tabular and proportional are sayable (schema.ts says the rest).
    numerals: { def: "normal" },
    numeralWidth: { def: "normal" },
    slashedZero: { def: false },
    underline: { def: false },
    strike: { def: false },
    lineHeight: { def: 0 },
});
//# sourceMappingURL=text.js.map