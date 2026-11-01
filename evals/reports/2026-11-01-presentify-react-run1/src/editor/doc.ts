/**
 * The editor's working copy of a presentation.
 *
 * It is immutable: every edit makes a new `Doc` that shares everything it didn't touch,
 * so a snapshot for undo costs nothing and "has this slide changed?" is a reference check.
 *
 * Slides are keyed by a *local* id. Slides loaded from the service keep their service id;
 * slides made here get a local id until the sync engine has created them on the service
 * (see sync.ts), so undo history never has to be rewritten when ids arrive.
 */
import type { Color, SlideElement } from '../model/types';

export interface SlideDoc {
  id: string;
  background: Color;
  elements: SlideElement[];
}

export interface Doc {
  title: string;
  order: string[];
  slides: Readonly<Record<string, SlideDoc>>;
}

export function updateSlide(doc: Doc, slideId: string, fn: (slide: SlideDoc) => SlideDoc): Doc {
  const slide = doc.slides[slideId];
  if (!slide) return doc;
  const next = fn(slide);
  return next === slide ? doc : { ...doc, slides: { ...doc.slides, [slideId]: next } };
}

export function updateElements(doc: Doc, slideId: string, fn: (elements: SlideElement[]) => SlideElement[]): Doc {
  return updateSlide(doc, slideId, (slide) => {
    const elements = fn(slide.elements);
    return elements === slide.elements ? slide : { ...slide, elements };
  });
}

export function insertSlide(doc: Doc, slide: SlideDoc, afterId: string | null): Doc {
  const order = [...doc.order];
  const at = afterId === null ? order.length : order.indexOf(afterId) + 1;
  order.splice(at, 0, slide.id);
  return { ...doc, order, slides: { ...doc.slides, [slide.id]: slide } };
}

export function removeSlide(doc: Doc, slideId: string): Doc {
  const slides = { ...doc.slides };
  delete slides[slideId];
  return { ...doc, order: doc.order.filter((id) => id !== slideId), slides };
}

export function moveSlide(doc: Doc, slideId: string, toIndex: number): Doc {
  const order = doc.order.filter((id) => id !== slideId);
  order.splice(Math.max(0, Math.min(order.length, toIndex)), 0, slideId);
  return { ...doc, order };
}

export function newLocalSlideId(): string {
  return 'local-' + crypto.randomUUID();
}
