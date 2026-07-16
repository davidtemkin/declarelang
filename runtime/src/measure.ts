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

/** `text` broken into the lines it wraps to within `width` px in `font` —
 *  greedy soft-break at spaces, hard-break at "\n", via the shared measurer.
 *  The DOM backend wraps natively; this is the shared breaker the Canvas
 *  backend paints and the model measures its auto-extent height from. A word
 *  longer than the box stays on its own line (no mid-word break), matching the
 *  default `word-break: normal`. */
export function wrapLines(text: string, font: string, width: number, letterSpacing = 0): string[] {
  if (width <= 0) return text.split("\n");
  const m = measurer();
  m.font = font;
  const ls = m as unknown as { letterSpacing: string };
  ls.letterSpacing = `${letterSpacing}px`;
  const out: string[] = [];
  for (const seg of text.split("\n")) {
    let cur = "";
    for (const word of seg.split(" ")) {
      const trial = cur === "" ? word : cur + " " + word;
      if (cur !== "" && m.measureText(trial).width > width) { out.push(cur); cur = word; }
      else cur = trial;
    }
    out.push(cur);
  }
  ls.letterSpacing = "0px"; // the measurer is shared — leave it neutral
  return out.length === 0 ? [""] : out;
}
