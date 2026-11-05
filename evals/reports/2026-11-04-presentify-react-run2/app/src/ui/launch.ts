import type { SlideContent } from '../api/types'

/**
 * Where a presentation was opened from, so the editor can grow out of that card. Set by the list
 * as a card is opened and read once by the editor.
 */
interface Launch {
  deckId: string
  rect: { top: number; left: number; right: number; bottom: number }
  thumbnail: SlideContent | null
}

let pending: Launch | null = null

export function setLaunch(deckId: string, el: Element, thumbnail: SlideContent | null) {
  const r = el.getBoundingClientRect()
  pending = { deckId, rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom }, thumbnail }
}

export function takeLaunch(deckId: string): Launch | null {
  const launch = pending && pending.deckId === deckId ? pending : null
  pending = null
  return launch
}
