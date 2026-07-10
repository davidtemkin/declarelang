// Text — the text leaf. A single run of styled text, measured by the
// browser's native metrics (measure.ts; the Flash-era text-metric quirk is
// deliberately shed — APPROACH §3 ledger #1) and rendered by each backend's
// own rasterizer: a real DOM text node there, fillText on the shared canvas
// here — same glyph geometry, substrate-native inking.
//
// Style, since the styling rung, is the PREVAILING quartet declared on View
// (textColor/fontSize/fontFamily/fontWeight — Text.color is retired into the
// one textColor slot, ruled): a Text with no style of its own renders with
// whatever the nearest providing container says, live. The seam push is
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
import { shadowEqual } from "./value.js";
import { fontMetrics, fontString, textWidth, wrapLines } from "./measure.js";
import { bindDerived, defineAttributes, isSet, ownerOf } from "./attributes.js";
import { Constraint } from "./reactive.js";
export class Text extends View {
    attach(backend, parentSurface) {
        // Auto-size installs at attach (measurement is a browser activity — the
        // model stays Node-importable) and only for unowned, never-set slots: an
        // author literal, constraint, or percent takes precedence untouched.
        if (!isSet(this, "width") && ownerOf(this, "width") === null) {
            bindDerived(this, "width", () => Math.ceil(textWidth(this.text, fontString(this), this.letterSpacing)));
        }
        if (!isSet(this, "height") && ownerOf(this, "height") === null) {
            bindDerived(this, "height", () => {
                const m = fontMetrics(fontString(this));
                const lineH = m.ascent + m.descent;
                // A bounded width wraps (unless wrap=false) → height extends to the
                // wrapped line count. Reading `width` keeps this reactive, so a
                // container/viewport resize re-wraps and re-flows — baseline.
                const bounded = (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0;
                const lines = bounded && this.wrap
                    ? wrapLines(this.text, fontString(this), this.width, this.letterSpacing).length
                    : 1;
                return Math.ceil(lineH * lines);
            });
        }
        super.attach(backend, parentSurface);
    }
    flush(s) {
        super.flush(s);
        // Style before text: the style creates the run's rendering context, the
        // text is the hot path that changes alone under a constraint. The style
        // push is a standing derive because the four slots are prevailing: the
        // effective values can change with no write to THIS view (a provider
        // re-roots above), and the tracked reads here are what follow it.
        const style = new Constraint(`${this.constructor.name}.textStyle`, () => ({
            fontFamily: this.fontFamily,
            fontSize: this.fontSize,
            fontWeight: this.fontWeight,
            letterSpacing: this.letterSpacing,
            color: this.textColor,
            shadow: this.textShadow,
            wrap: this.wrap && (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0,
            align: this.textAlign,
            italic: this.italic,
            textFill: this.textFill,
            selectable: this.selectable,
        }), 
        // Constraint is deliberately untyped across compute→apply; this
        // apply's input is exactly its compute's output.
        (st) => this.surface?.setTextStyle(st), 0);
        style.run();
        onDiscard(this, () => style.dispose());
        s.setText(this.text);
    }
}
defineAttributes(Text, {
    text: { def: "", push: (t, v) => t.surface?.setText(v) },
    textShadow: { def: null, equal: shadowEqual },
    wrap: { def: true },
    textAlign: { def: "left" },
    italic: { def: false },
    textFill: { def: null },
    selectable: { def: false },
});
//# sourceMappingURL=text.js.map