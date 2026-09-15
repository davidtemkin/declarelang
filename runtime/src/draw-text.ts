// `d.fillText` / `d.strokeText` with a text style (graphics-pass text round). Its
// own file so a production build carries it only for a program that draws text
// (declarec's slim-draw-text); a plain run never reaches it.

import { DeclareError } from "./errors.js";
import { fontString, transformText } from "./measure.js";
import type { Draw, DrawTextStyle } from "./draw.js";

/** One run drawn in a text style: the style's face, tracking, colour, shadow
 *  and treatments become ORDINARY text state for this run, inside save/restore,
 *  so every renderer replays the recording unchanged. The face is built by the
 *  shared `fontString` — the one a Text measures with — so a Font in the style is
 *  a tracked read, and the drawing records again when its faces land. */
export function styledRun(d: Draw, style: DrawTextStyle, paint: "fill" | "stroke", text: string, run: (shown: string) => void): void {
  for (const k of ["textFill", "outline", "underline", "strike"] as const) {
    const v = style[k];
    if (v !== undefined && v !== null && v !== false) {
      throw new DeclareError(`${paint}Text draws a style's face, textColor and textShadow — '${k}' is not drawn in a drawing; paint it with the drawing's own calls`);
    }
  }
  const prevFont = d.tFont, prevLetter = d.tLetter;
  d.save();
  d.font = fontString({
    fontFamily: style.fontFamily ?? "sans-serif",
    fontSize: typeof style.fontSize === "number" ? style.fontSize : 16,
    fontWeight: style.fontWeight ?? "normal",
    italic: style.italic === true,
    smallCaps: style.smallCaps === true,
    numerals: style.numerals,
    numeralWidth: style.numeralWidth,
    slashedZero: style.slashedZero === true,
  });
  d.letterSpacing = `${typeof style.letterSpacing === "number" ? style.letterSpacing : 0}px`;
  if (typeof style.textColor === "number") {
    if (paint === "fill") d.fillStyle = style.textColor; else d.strokeStyle = style.textColor;
  }
  const sh = style.textShadow;
  if (sh !== undefined && sh !== null) {
    d.shadowOffsetX = sh.dx; d.shadowOffsetY = sh.dy; d.shadowBlur = sh.blur; d.shadowColor = sh.color;
  }
  run(transformText(text, style.textTransform));
  d.restore();
  d.tFont = prevFont; d.tLetter = prevLetter;
}
