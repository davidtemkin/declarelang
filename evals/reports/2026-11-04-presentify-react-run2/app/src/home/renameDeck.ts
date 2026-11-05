import { api, ApiError } from '../api/client'

/** Renames a deck from outside the editor. If it moved on since it was read, it is read again and renamed once more. */
export async function renameDeck(deckId: string, title: string) {
  for (let attempt = 0; ; attempt++) {
    const deck = await api.getDeck(deckId)
    try {
      return await api.patchDeck(deckId, { version: deck.version, title })
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'conflict' || attempt >= 2) throw error
    }
  }
}
