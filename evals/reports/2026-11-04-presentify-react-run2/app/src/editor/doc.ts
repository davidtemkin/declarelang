import type { SlideContent, SlideElement } from '../api/types'

/**
 * The part of an open presentation that undo covers: its slides, in order, and what is on them.
 * Slides are identified by a `key` that lasts for the whole editing session. A slide that came from
 * the service is keyed by its id; one made here is keyed `local-…` until (and after) the service
 * gives it an id — the sync engine keeps that mapping, so history never has to.
 */
export interface DocState {
  order: string[]
  slides: Record<string, SlideContent>
}

export function newSlideKey(): string {
  return `local-${Math.random().toString(36).slice(2, 10)}`
}

export function withSlide(doc: DocState, key: string, change: (content: SlideContent) => SlideContent): DocState {
  const before = doc.slides[key]
  if (!before) return doc
  const after = change(before)
  if (after === before) return doc
  return { ...doc, slides: { ...doc.slides, [key]: after } }
}

export function withElements(doc: DocState, key: string, change: (elements: SlideElement[]) => SlideElement[]): DocState {
  return withSlide(doc, key, (content) => {
    const elements = change(content.elements)
    return elements === content.elements ? content : { ...content, elements }
  })
}

export function insertSlide(doc: DocState, key: string, content: SlideContent, afterKey: string | null): DocState {
  const order = [...doc.order]
  const at = afterKey === null ? order.length : order.indexOf(afterKey) + 1
  order.splice(at, 0, key)
  return { order, slides: { ...doc.slides, [key]: content } }
}

export function removeSlide(doc: DocState, key: string): DocState {
  if (!doc.slides[key]) return doc
  const slides = { ...doc.slides }
  delete slides[key]
  return { order: doc.order.filter((k) => k !== key), slides }
}

/** Content equality, for deciding whether a slide still needs saving. */
export function sameContent(a: SlideContent | undefined, b: SlideContent | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.background === b.background && JSON.stringify(a.elements) === JSON.stringify(b.elements)
}

export function docsEqual(a: DocState, b: DocState): boolean {
  if (a === b) return true
  if (a.order.length !== b.order.length || a.order.some((k, i) => b.order[i] !== k)) return false
  return a.order.every((k) => sameContent(a.slides[k], b.slides[k]))
}
