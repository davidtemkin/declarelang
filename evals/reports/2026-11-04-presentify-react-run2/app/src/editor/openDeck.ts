import type { Deck, Slide } from '../api/types'

/** A presentation as the editor opens it: the deck and all its slides, in order. */
export interface OpenDeck {
  deck: Deck
  slides: Slide[]
}

export const openDeckKey = (deckId: string) => ['open-deck', deckId] as const
