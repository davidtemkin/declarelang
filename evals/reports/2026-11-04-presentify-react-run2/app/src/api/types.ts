/**
 * The Presentify document format, exactly as the service defines it (see task/api/API.md).
 * Every coordinate is in slide points: a slide is 1280 × 720, origin top left, y downward.
 */

export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

/** `#RRGGBB` or `#RRGGBBAA`. */
export type Color = string

export interface Stroke {
  color: Color
  width: number
}

export type TextAlign = 'left' | 'center' | 'right'

export interface TextStyle {
  content: string
  font: string
  size: number
  weight: number
  italic: boolean
  color: Color
  align: TextAlign
}

interface Box {
  x: number
  y: number
  width: number
  height: number
  keepProportions: boolean
}

export interface RectElement extends Box {
  id: string
  kind: 'rect'
  fill: Color | null
  stroke: Stroke | null
  cornerRadius: number
}

export interface EllipseElement extends Box {
  id: string
  kind: 'ellipse'
  fill: Color | null
  stroke: Stroke | null
}

export interface LineElement {
  id: string
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: Stroke
}

export interface TextElement extends Box {
  id: string
  kind: 'text'
  text: TextStyle
}

export interface GroupElement {
  id: string
  kind: 'group'
  children: SlideElement[]
}

export type BoxElement = RectElement | EllipseElement | TextElement
export type SlideElement = RectElement | EllipseElement | LineElement | TextElement | GroupElement
export type ElementKind = SlideElement['kind']

export interface Deck {
  id: string
  title: string
  version: number
  updatedAt: string
  slideOrder: string[]
  thumbnailSlideId: string
}

export interface DeckSummary {
  id: string
  title: string
  updatedAt: string
  slideCount: number
  thumbnailSlideId: string
}

export interface Slide {
  id: string
  deckId: string
  version: number
  background: Color
  elements: SlideElement[]
}

/** What a slide holds, without its identity or version: the part a person edits. */
export interface SlideContent {
  background: Color
  elements: SlideElement[]
}
