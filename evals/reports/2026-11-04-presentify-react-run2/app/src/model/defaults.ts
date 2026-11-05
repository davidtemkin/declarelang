import type { Color, EllipseElement, LineElement, RectElement, TextElement } from '../api/types'
import { textColorOn } from './colors'
import { DEFAULT_FONT } from './fonts'
import type { Rect } from './geometry'
import { measureTextHeight } from './textLayout'

export type ShapeTool = 'rect' | 'ellipse' | 'line' | 'text'
export type Tool = 'select' | ShapeTool

export const DEFAULT_TEXT_WIDTH = 360
export const DEFAULT_TEXT_SIZE = 32

export function newRect(id: string, box: Rect, keepProportions: boolean): RectElement {
  return { id, kind: 'rect', ...box, fill: '#5B3DF5', stroke: null, cornerRadius: 0, keepProportions }
}

export function newEllipse(id: string, box: Rect, keepProportions: boolean): EllipseElement {
  return { id, kind: 'ellipse', ...box, fill: '#FF6A4D', stroke: null, keepProportions }
}

export function newLine(id: string, x1: number, y1: number, x2: number, y2: number): LineElement {
  return { id, kind: 'line', x1, y1, x2, y2, stroke: { color: '#17151F', width: 4 } }
}

export function newText(id: string, box: Rect, keepProportions: boolean, on: Color, overrides: Partial<TextElement['text']> = {}): TextElement {
  const text = {
    content: '',
    font: DEFAULT_FONT,
    size: DEFAULT_TEXT_SIZE,
    weight: 400,
    italic: false,
    color: textColorOn(on),
    align: 'left' as const,
    ...overrides,
  }
  const height = Math.max(box.height, measureTextHeight(text, box.width))
  return { id, kind: 'text', ...box, height, keepProportions, text }
}
