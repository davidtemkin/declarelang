import type { CSSProperties } from 'react';
import type { TextElement, TextStyle } from './types';

/** Line height used everywhere text is laid out: on the slide, in thumbnails, while editing, presenting. */
export const LINE_HEIGHT = 1.2;

/** Fonts offered in the inspector. A slide may use others; they are kept and shown as-is. */
export const FONTS: { name: string; fallback: string }[] = [
  { name: 'Inter Variable', fallback: 'sans-serif' },
  { name: 'Fraunces Variable', fallback: 'serif' },
  { name: 'Helvetica Neue', fallback: 'sans-serif' },
  { name: 'Avenir Next', fallback: 'sans-serif' },
  { name: 'Georgia', fallback: 'serif' },
  { name: 'Palatino', fallback: 'serif' },
  { name: 'Times New Roman', fallback: 'serif' },
  { name: 'Menlo', fallback: 'monospace' },
];

const SERIF = /georgia|times|palatino|garamond|serif|fraunces|baskerville/i;
const MONO = /mono|menlo|courier|consol/i;

export function fontLabel(font: string): string {
  return font.replace(/ Variable$/, '');
}

export function fontStack(font: string): string {
  const fallback = FONTS.find((f) => f.name === font)?.fallback ?? (MONO.test(font) ? 'monospace' : SERIF.test(font) ? 'serif' : 'sans-serif');
  return `"${font}", ${fallback}`;
}

/** The CSS that lays a text box out. Sizes are in slide points (1 point = 1 CSS px before scaling). */
export function textCss(style: TextStyle): CSSProperties {
  return {
    fontFamily: fontStack(style.font),
    fontSize: style.size,
    fontWeight: style.weight,
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color,
    textAlign: style.align,
    lineHeight: LINE_HEIGHT,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    margin: 0,
    padding: 0,
  };
}

let measurer: HTMLDivElement | null = null;

/** How tall `style` lays out at `width`, in points. Empty text still takes one line. */
export function measureTextHeight(style: TextStyle, width: number): number {
  if (!measurer) {
    measurer = document.createElement('div');
    measurer.setAttribute('aria-hidden', 'true');
    Object.assign(measurer.style, { position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden' });
    document.body.appendChild(measurer);
  }
  Object.assign(measurer.style, textCss(style), {
    fontSize: `${style.size}px`,
    width: `${Math.max(1, width)}px`,
  });
  // A trailing newline needs a character after it to take up a line.
  measurer.textContent = style.content.endsWith('\n') || style.content === '' ? style.content + '​' : style.content;
  return Math.ceil(measurer.getBoundingClientRect().height);
}

/** The text box with its height exactly what its text needs. */
export function snugTextHeight(el: TextElement): TextElement {
  const needed = measureTextHeight(el.text, el.width);
  return needed === el.height ? el : { ...el, height: needed };
}
