/**
 * How new things look. New shapes and text pick colours that read on the slide they're
 * drawn on, so nothing new is invisible on a dark background.
 */
import { newId } from '../model/elements';
import { measureTextHeight } from '../model/text';
import type { Color, EllipseElement, LineElement, Rect, RectElement, TextElement, TextStyle } from '../model/types';

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(color: Color): number {
  const hex = color.replace('#', '').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isDark = (color: Color) => luminance(color) < 0.3;

const SHAPE_FILL = '#4F7CFF';

export function inkFor(background: Color): Color {
  return isDark(background) ? '#FFFFFF' : '#1F2328';
}

export function makeRect(box: Rect, keepProportions: boolean): RectElement {
  return { id: newId(), kind: 'rect', ...box, fill: SHAPE_FILL, stroke: null, cornerRadius: 0, keepProportions };
}

export function makeEllipse(box: Rect, keepProportions: boolean): EllipseElement {
  return { id: newId(), kind: 'ellipse', ...box, fill: SHAPE_FILL, stroke: null, keepProportions };
}

export function makeLine(x1: number, y1: number, x2: number, y2: number, background: Color): LineElement {
  return { id: newId(), kind: 'line', x1, y1, x2, y2, stroke: { color: inkFor(background), width: 4 } };
}

export function defaultTextStyle(background: Color): TextStyle {
  return {
    content: '',
    font: 'Inter Variable',
    size: 32,
    weight: 400,
    italic: false,
    color: inkFor(background),
    align: 'left',
  };
}

export const DEFAULT_TEXT_WIDTH = 360;

export function makeText(x: number, y: number, width: number, background: Color): TextElement {
  const text = defaultTextStyle(background);
  return { id: newId(), kind: 'text', x, y, width, height: measureTextHeight(text, width), keepProportions: false, text };
}
