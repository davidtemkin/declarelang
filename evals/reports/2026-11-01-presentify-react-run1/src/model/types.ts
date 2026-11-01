/**
 * The document format, exactly as the Presentify service stores it (see task/api/API.md).
 * Every position and size is in slide points; a slide is 1280 × 720, origin top left.
 */

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

/** "#RRGGBB" or "#RRGGBBAA". */
export type Color = string;

export interface Stroke {
  color: Color;
  width: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  content: string;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  color: Color;
  align: TextAlign;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RectElement extends Box {
  id: string;
  kind: 'rect';
  fill: Color | null;
  stroke: Stroke | null;
  cornerRadius: number;
  keepProportions: boolean;
}

export interface EllipseElement extends Box {
  id: string;
  kind: 'ellipse';
  fill: Color | null;
  stroke: Stroke | null;
  keepProportions: boolean;
}

export interface LineElement {
  id: string;
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: Stroke;
}

export interface TextElement extends Box {
  id: string;
  kind: 'text';
  keepProportions: boolean;
  text: TextStyle;
}

export interface GroupElement {
  id: string;
  kind: 'group';
  children: SlideElement[];
}

export type ShapeElement = RectElement | EllipseElement;
export type LeafElement = RectElement | EllipseElement | LineElement | TextElement;
export type SlideElement = LeafElement | GroupElement;
export type ElementKind = SlideElement['kind'];

export interface Slide {
  id: string;
  deckId: string;
  version: number;
  background: Color;
  /** Back to front. */
  elements: SlideElement[];
}

export interface Deck {
  id: string;
  title: string;
  version: number;
  updatedAt: string;
  slideOrder: string[];
  thumbnailSlideId: string;
}

export interface DeckSummary {
  id: string;
  title: string;
  updatedAt: string;
  slideCount: number;
  thumbnailSlideId: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
