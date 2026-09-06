// Native browser text metrics — the shared text primitive. The Flash-era
// letter-spacing / text-metric adjustment is deliberately shed (APPROACH §3,
// deliberately-not-reproduced ledger #1): the browser measures, Declare believes
// it. One lazily-created off-screen 2D context measures for everyone — the
// Text leaf (auto-sizing), the DOM backend (a line-height that pins the
// first baseline to the font ascent), and the Canvas backend (the fillText
// baseline) — so both backends place identical glyph geometry and differ
// only in the rasterizer that inks it.

import type { Color, Fill, Shadow } from "./value.js";

export type FontWeight =
  | "thin" | "extralight" | "light" | "regular" | "normal"
  | "medium" | "semibold" | "bold" | "extrabold" | "black";

/** A weight token → its numeric CSS weight. The numeric form is what both the
 *  canvas `ctx.font` string and the DOM `font-weight` carry, and it is what
 *  selects the matching web face when a `font` declares several. */
const WEIGHT_CSS: Readonly<Record<FontWeight, string>> = {
  thin: "100", extralight: "200", light: "300", regular: "400", normal: "400",
  medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900",
};
export function cssWeight(w: FontWeight): string {
  return WEIGHT_CSS[w] ?? "400";
}

/** A text run's style — the render seam's text currency. Backends derive
 *  what their substrate needs (font string, CSS color, ascent) from this.
 *  Since the styling rung the values are the EFFECTIVE (prevailing) ones —
 *  Text's style derive resolves them before they cross the seam — and the
 *  run's optional glyph shadow rides along (style is the cold path). */
export interface TextStyle {
  readonly fontFamily: string;
  readonly fontSize: number; // px
  readonly fontWeight: FontWeight;
  readonly letterSpacing: number; // px tracking, 0 = natural
  readonly color: Color;
  readonly shadow?: Shadow | null;
  /** Run wraps within its box width (`pre-wrap`) vs a single line (`pre`). */
  readonly wrap?: boolean;
  readonly align?: "left" | "center" | "right";
  readonly italic?: boolean;
  /** Fill the glyphs with a gradient (or solid Fill) — overrides `color` when
   *  set. Canvas realizes it over the text box; DOM clips a background to text. */
  readonly textFill?: Fill | null;
  /** Opt back into native text selection (the app root suppresses it): the run
   *  becomes a selection/pointer target. Off by default (app feel). */
  readonly selectable?: boolean;
  /** Leading as a fontSize multiplier (line box = round(fontSize × lineHeight));
   *  0/absent = the font's natural ascent + descent. */
  readonly lineHeight?: number;
}

// Created on first use — never at import or instantiation time — so the
// model stays importable in Node (unit tests) and measurement remains a
// browser-only, attach-time activity.
let measureCtx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D {
  return (measureCtx ??= document.createElement("canvas").getContext("2d")!);
}

/** Inject the measuring context for a DOM-less host — the environment
 *  contract's text-metrics seam (docs/system-design/capabilities.md §3, verify §2.8).
 *  Headless execution (static extraction, verify rung 4) passes a real 2D
 *  context for exact typography or a deterministic stand-in (the compiler's
 *  headless.ts approximation); in a browser nothing is injected and the
 *  lazily-created off-screen context above measures as always. */
export function provideMeasurer(ctx: CanvasRenderingContext2D): void {
  measureCtx = ctx;
}

/** A style as a canvas font string — the one font encoding the measurer and
 *  both backends share, so they cannot disagree about which font they mean. */
export function fontString(style: { fontFamily: string; fontSize: number; fontWeight: FontWeight; italic?: boolean }): string {
  return `${style.italic ? "italic " : ""}${cssWeight(style.fontWeight)} ${style.fontSize}px ${style.fontFamily}`;
}

/** The advance width of `text` in `font`, in px (fractional), including
 *  `letterSpacing` tracking (canvas-native; the shared measurer is reset). */
export function textWidth(text: string, font: string, letterSpacing = 0): number {
  const m = measurer();
  m.font = font;
  const ls = m as unknown as { letterSpacing: string };
  ls.letterSpacing = `${letterSpacing}px`;
  const w = m.measureText(text).width;
  ls.letterSpacing = "0px"; // the measurer is shared — leave it neutral
  return w;
}

/** Font-wide ascent/descent (the font bounding box) — a property of the
 *  font, independent of any particular string. ascent+descent is the natural
 *  line height; a baseline at `ascent` renders identically as DOM text (with
 *  line-height = ascent+descent) and as fillText. */
export function fontMetrics(font: string): { ascent: number; descent: number } {
  const m = measurer();
  m.font = font;
  const t = m.measureText("");
  return { ascent: t.fontBoundingBoxAscent, descent: t.fontBoundingBoxDescent };
}

/** The CAP HEIGHT of `font` — the baseline-to-capital band the optical
 *  centering literal centers (`y = center` on a Text; the text-box-trim
 *  semantics). Probed once per font from a capital sample glyph; a measurer
 *  that reports no actualBoundingBoxAscent (the deterministic headless stub
 *  predates the field) falls back to the classic 0.7em approximation. */
export function capHeight(font: string): number {
  const m = measurer();
  m.font = font;
  const t = m.measureText("H") as TextMetrics & { actualBoundingBoxAscent?: number };
  if (typeof t.actualBoundingBoxAscent === "number" && t.actualBoundingBoxAscent > 0) return t.actualBoundingBoxAscent;
  const size = /(\d+(?:\.\d+)?)px/.exec(font);
  return 0.7 * (size ? parseFloat(size[1]) : 16);
}

/** The X-HEIGHT of `font` — the lowercase ink band, probed from a sample
 *  glyph exactly as capHeight probes "H" (compositing.md Part III: no web
 *  API reads a font's tables — the binary is unreachable for system fonts
 *  and carries three competing metric sets browsers disagree on; the
 *  measurer reports what THIS engine will actually render). The classic
 *  0.5em approximation carries the deterministic headless stub. */
export function xHeight(font: string): number {
  const m = measurer();
  m.font = font;
  const t = m.measureText("x") as TextMetrics & { actualBoundingBoxAscent?: number };
  if (typeof t.actualBoundingBoxAscent === "number" && t.actualBoundingBoxAscent > 0) return t.actualBoundingBoxAscent;
  const size = /(\d+(?:\.\d+)?)px/.exec(font);
  return 0.5 * (size ? parseFloat(size[1]) : 16);
}

/** How a surface breaks lines. The browser has two rules and they are NOT
 *  interchangeable, so the caller says which one it is:
 *
 *  `countIndent` — whether a line's own leading spaces are measured. A DOM box
 *  and a field both do; `wrapLines` does not, and correcting that moves the
 *  measured height of every wrapped Text with an indented line, so the
 *  correction waits for a baseline re-bless of its own (findings below).
 *
 *  `breakWord` — `overflow-wrap`. A box of text is `normal`: a word longer
 *  than the box overflows on a line of its own. An EDITABLE is `break-word` —
 *  Chrome's UA stylesheet puts it on every textarea — so it breaks an
 *  over-long token at the last character that fits. Measured 2026-09-05: at
 *  150px a dotted chain the box called one line rendered four in the field. */
interface WrapRule { countIndent: boolean; breakWord: boolean }

/** `text` broken into the lines it wraps to within `width` px in `font` —
 *  greedy soft-break at spaces, hard-break at "\n", via the shared measurer.
 *  The DOM backend wraps natively; this is the shared breaker the Canvas
 *  backend paints and the model measures its auto-extent height from.
 *
 *  This is a deliberate approximation of CSS line breaking, not UAX #14. The
 *  break opportunities it knows are the space and the "/" and "-" below. Its
 *  known gaps, all measured against Chrome (2026-09-05) and all UNDER-counts
 *  — whose failure is an overflow or a scrollbar, never a wrong line:
 *  a line's own indent (see `countIndent`), CJK (a break between any two
 *  ideographs), the other Unicode spaces, the dash family past ASCII "-", the
 *  soft hyphen, and a tab, which it measures as one glyph rather than to the
 *  next `tab-size` stop. Widen it against a measurement, never a theory. */
export function wrapLines(text: string, font: string, width: number, letterSpacing = 0): string[] {
  return wrapBy(text, font, width, letterSpacing, { countIndent: false, breakWord: false });
}

/** The same breaker under an EDITABLE's rules — what a native field will do
 *  with this text, which is not what a box of text would do with it. Used by
 *  TextInput's auto-height: a field that sizes to its own content has to
 *  measure the way the element it becomes will lay out. */
export function wrapEditable(text: string, font: string, width: number, letterSpacing = 0): string[] {
  return wrapBy(text, font, width, letterSpacing, { countIndent: true, breakWord: true });
}

function wrapBy(text: string, font: string, width: number, letterSpacing: number, rule: WrapRule): string[] {
  if (width <= 0) return text.split("\n");
  const m = measurer();
  m.font = font;
  const ls = m as unknown as { letterSpacing: string };
  ls.letterSpacing = `${letterSpacing}px`;
  const out: string[] = [];
  for (const seg of text.split("\n")) {
    let cur = "";
    // `ink`: the line holds something past its indent — what a break is
    // allowed to leave behind, so a deep indent never lands on a line alone.
    let ink = false;
    // Break opportunities are the BROWSER'S: at spaces (the space collapses
    // at the break), and after "/" or "-" inside a word — how engines wrap
    // paths, URLs, and hyphenated words; the delimiter stays with the line it
    // ends. Without these a spaceless path measured as ONE line while the DOM
    // rendered two (the desktop's preview pane caught it), so the model's
    // height under-counted and layouts stacked into the overflow.
    const words = seg.split(" ");
    for (let i = 0; i < words.length; i++) {
      const chunks = words[i].split(/(?<=[/-])/);
      for (let j = 0; j < chunks.length; j++) {
        // The separator belongs to the word that FOLLOWS it, which is what
        // makes a line's indent measurable: leading spaces ARE the empty
        // words, so testing the LINE for emptiness (`countIndent` off) drops
        // every indent in the text. At a break the separator is dropped
        // rather than carried — that is CSS hanging it at the line's end.
        const sep = j === 0 && (rule.countIndent ? i > 0 : cur !== "") ? " " : "";
        const trial = !rule.countIndent && cur === "" ? chunks[j] : cur + sep + chunks[j];
        const held = rule.countIndent ? ink : cur !== "";
        if (held && m.measureText(trial).width > width) { out.push(cur); cur = chunks[j]; ink = chunks[j] !== ""; }
        else { cur = trial; ink = ink || chunks[j] !== ""; }
        // break-word: the piece has a line to itself and still does not fit,
        // so the browser breaks it mid-word at the last character that fits.
        if (rule.breakWord && m.measureText(cur).width > width) {
          const over = cur;
          cur = "";
          for (const ch of over) {
            if (cur !== "" && m.measureText(cur + ch).width > width) { out.push(cur); cur = ch; }
            else cur += ch;
          }
          ink = true;
        }
      }
    }
    out.push(cur);
  }
  ls.letterSpacing = "0px"; // the measurer is shared — leave it neutral
  return out.length === 0 ? [""] : out;
}
