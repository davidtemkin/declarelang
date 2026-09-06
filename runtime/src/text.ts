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
import type { RenderBackend, Surface } from "./backend.js";
import { shadowEqual, type Fill, type Shadow } from "./value.js";
import { fontMetrics, fontString, textWidth, wrapLines, capHeight as measureCapHeight, xHeight as measureXHeight } from "./measure.js";
import { bindDerived, defineAttributes, isSet, ownerOf } from "./attributes.js";
import { Constraint } from "./reactive.js";

export class Text extends View {
  declare text: string;
  /** The glyphs' drop shadow (a decoration value, styling rung); null = none.
   *  Replaces the two-stacked-runs idiom (weather's ShadowText). */
  declare textShadow: Shadow | null;
  /** A bounded-width run wraps (default) or stays a single line. */
  declare wrap: boolean;
  declare textAlign: "left" | "center" | "right";
  declare italic: boolean;
  declare textFill: Fill | null;
  declare lineHeight: number;
  // `selectable` is a prevailing View slot now (inherited): the textStyle derive
  // below reads `this.selectable` so a `selectable` container opts a whole subtree in.

  /** The per-line advance: the declared leading (a fontSize multiplier, the
   *  Markdown convention) or, at the 0 default, the font's natural line box. */
  private lineAdvance(m: { ascent: number; descent: number }): number {
    return this.lineHeight > 0 ? Math.round(this.fontSize * this.lineHeight) : m.ascent + m.descent;
  }

  // ── Author-facing font metrics (compositing.md Part III) — read-only,
  // REACTIVE intrinsics of the EFFECTIVE font (the prevailing slots): each
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
  get ascent(): number { return fontMetrics(fontString(this)).ascent; }
  /** The effective font's descent below the baseline — ascent + descent is
   *  the natural line box. */
  get descent(): number { return fontMetrics(fontString(this)).descent; }
  /** The capital ink band above the baseline (probed from "H" — what
   *  `y = center` optically centers). */
  get capHeight(): number { return measureCapHeight(fontString(this)); }
  /** The lowercase ink band above the baseline (probed from "x"). */
  get xHeight(): number { return measureXHeight(fontString(this)); }
  /** The y of the FIRST baseline inside this view — what cross-font,
   *  cross-size baseline alignment positions against:
   *  `y = { title.y + title.baseline - this.baseline }`. Both renderers
   *  place the first line's baseline at the font ascent (the natural-box
   *  rule; a declared `lineHeight` changes the stride between lines, never
   *  where the first baseline sits). */
  get baseline(): number { return fontMetrics(fontString(this)).ascent; }

  override attach(backend: RenderBackend, parentSurface: Surface | null): void {
    // Auto-size installs at attach (measurement is a browser activity — the
    // model stays Node-importable) and only for unowned, never-set slots: an
    // author literal, constraint, or percent takes precedence untouched.
    if (!isSet(this, "width") && ownerOf(this, "width") === null) {
      bindDerived(this, "width", () => Math.ceil(textWidth(this.text, fontString(this), this.letterSpacing)));
    }
    if (!isSet(this, "height") && ownerOf(this, "height") === null) {
      bindDerived(this, "height", () => {
        const m = fontMetrics(fontString(this));
        const lineH = this.lineAdvance(m);
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

  /** A Text's own content folds into `contentWidth`/`contentHeight` as its
   *  MEASURED glyph extent — the way an Image folds in its bitmap (view.ts
   *  contentExtent). Without this a Text reported the base 0, so a container
   *  sizing to `label.contentWidth` (an auto-sized pill/badge) always read
   *  empty. Reads `text` and the font slots under tracking (contentExtent runs
   *  tracked), so it re-measures when the text or style changes — the fix for
   *  content-bound labels. The natural single-line width; height follows the
   *  wrapped line count when the width is bounded, matching the derives above. */
  protected override contentExtent(size: "width" | "height"): number {
    const font = fontString(this);
    if (size === "width") return Math.ceil(textWidth(this.text, font, this.letterSpacing));
    const m = fontMetrics(font);
    const bounded = (isSet(this, "width") || ownerOf(this, "width") !== null) && this.width > 0;
    const lines = bounded && this.wrap
      ? wrapLines(this.text, font, this.width, this.letterSpacing).length
      : 1;
    return Math.ceil(this.lineAdvance(m) * lines);
  }

  // `y = center` centers the geometric box (View.alignBand), like every other
  // view and like the x axis — the ordinary meaning. A label that wants its cap
  // band optically centered uses the library's TextLabel (a Text whose y is a
  // cap-centering constraint over baseline/capHeight); box-centering was the
  // surprising default and is retired here (2026-09-06).

  protected override flush(s: Surface): void {
    super.flush(s);
    // Style before text: the style creates the run's rendering context, the
    // text is the hot path that changes alone under a constraint. The style
    // push is a standing derive because the four slots are prevailing: the
    // effective values can change with no write to THIS view (a provider
    // re-roots above), and the tracked reads here are what follow it.
    const style = new Constraint(
      `${this.constructor.name}.textStyle`,
      () => ({
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
        lineHeight: this.lineHeight,
      }),
      // Constraint is deliberately untyped across compute→apply; this
      // apply's input is exactly its compute's output.
      (st) => this.surface?.setTextStyle(st as never),
      0
    );
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
  lineHeight: { def: 0 },
});
