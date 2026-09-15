// measureText — a run of text measured in a style, with the measurer and the
// wrapping a `Text` uses (measure.ts), so the numbers agree with a Text of that
// style and width, on every renderer.
//
//   width = { measureText(app.label, { fontFamily: app.brand, fontSize: 13 }).width + 16 }
//   draw(d: Draw) { const m = measureText("Plate 4", Caption); d.fillText("Plate 4", (d.w - m.width) / 2, m.baseline, Caption) }
//
// The style is a record of `Text` attribute names — a `style` bundle, or an inline
// record — and a field left out takes its plain default, never an inherited value:
// a measurement depends only on what it is given, so it means the same wherever it
// is called. Its dependencies are ordinary: the values passed, and — through a
// Font in `fontFamily` — that font's current family and faces, tracked reads
// (font-value.ts, face-table.ts). The compiler keeps a body that calls this on the
// tracking path (dep-extract.ts), as a drawing always is.

import { capHeight, fontMetrics, fontString, textWidth, transformText, wrapLines, type FontWeight, type TextTransform } from "./measure.js";
import type { Numerals, NumeralWidth } from "./font-features.js";

/** What measureText reports — a Text's own fact names. */
export interface TextMeasure {
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
  readonly capHeight: number;
  readonly lines: number;
}

interface StyleFields {
  fontFamily?: unknown; fontSize?: unknown; fontWeight?: unknown; italic?: unknown;
  letterSpacing?: unknown; lineHeight?: unknown; textTransform?: unknown;
  smallCaps?: unknown; numerals?: unknown; numeralWidth?: unknown; slashedZero?: unknown;
}

const num = (v: unknown, dflt: number): number => (typeof v === "number" && Number.isFinite(v) ? v : dflt);

/** Measure `text` in `style` — one line per hard newline, or wrapped at `width`. */
export function measureText(text: unknown, style?: StyleFields | null, width?: number): TextMeasure {
  const s: StyleFields = style ?? {};
  const size = num(s.fontSize, 16);
  const font = fontString({
    fontFamily: s.fontFamily ?? "sans-serif",
    fontSize: size,
    fontWeight: (typeof s.fontWeight === "string" || typeof s.fontWeight === "number" ? s.fontWeight : "normal") as FontWeight,
    italic: s.italic === true,
    smallCaps: s.smallCaps === true,
    numerals: s.numerals as Numerals | undefined,
    numeralWidth: s.numeralWidth as NumeralWidth | undefined,
    slashedZero: s.slashedZero === true,
  });
  const tracking = num(s.letterSpacing, 0);
  const shown = transformText(String(text ?? ""), s.textTransform as TextTransform | undefined);
  const m = fontMetrics(font);
  // Text's own line advance: a declared leading multiplies the size; 0 is the
  // font's natural line box.
  const lead = num(s.lineHeight, 0);
  const lineH = lead > 0 ? Math.round(size * lead) : m.ascent + m.descent;
  const lines = width !== undefined && width > 0 ? wrapLines(shown, font, width, tracking) : shown.split("\n");
  const widest = lines.reduce((w, line) => Math.max(w, textWidth(line, font, tracking)), 0);
  return {
    width: Math.ceil(widest),
    height: Math.ceil(lineH * lines.length),
    baseline: m.ascent,
    capHeight: capHeight(font),
    lines: lines.length,
  };
}
