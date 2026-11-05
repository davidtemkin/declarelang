import type { Deck, DeckSummary, Slide, SlideContent, SlideElement } from './types'

export const API_ORIGIN = import.meta.env.VITE_PRESENTIFY_API ?? 'http://127.0.0.1:8361'

export type ApiErrorCode = 'conflict' | 'invalid' | 'not_found' | 'unavailable' | 'last_slide' | 'network' | 'unknown'

/**
 * Every way a request can fail. `network` means the service could not be reached at all;
 * `unavailable` means it answered but did not take the write. Both are worth retrying.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly field?: string
  /** On a `conflict`, the copy the service holds now. */
  readonly current?: unknown

  constructor(code: ApiErrorCode, status: number, message: string, extra: { field?: string; current?: unknown } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.field = extra.field
    this.current = extra.current
  }

  get isRetryable(): boolean {
    return this.code === 'network' || this.code === 'unavailable' || this.status >= 500
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError('network', 0, 'Can’t reach the Presentify service.')
  }

  if (response.status === 204) return undefined as T

  let payload: unknown = undefined
  try {
    payload = await response.json()
  } catch {
    // A body that isn't JSON is treated as a refusal below if the status says so.
  }

  if (!response.ok) {
    const refusal = (payload ?? {}) as { error?: string; message?: string; field?: string; current?: unknown }
    const known: ApiErrorCode[] = ['conflict', 'invalid', 'not_found', 'unavailable', 'last_slide']
    const code = known.includes(refusal.error as ApiErrorCode) ? (refusal.error as ApiErrorCode) : 'unknown'
    throw new ApiError(code, response.status, refusal.message ?? `The service answered ${response.status}.`, {
      field: refusal.field,
      current: refusal.current,
    })
  }
  return payload as T
}

export const api = {
  listDecks: (signal?: AbortSignal) =>
    request<{ decks: DeckSummary[] }>('GET', '/api/decks', undefined, signal).then((r) => r.decks),

  createDeck: (title?: string) => request<{ deck: Deck; slides: Slide[] }>('POST', '/api/decks', { title }),

  getDeck: (deckId: string, signal?: AbortSignal) => request<Deck>('GET', `/api/decks/${deckId}`, undefined, signal),

  patchDeck: (deckId: string, change: { version: number; title?: string; slideOrder?: string[] }) =>
    request<Deck>('PATCH', `/api/decks/${deckId}`, change),

  deleteDeck: (deckId: string) => request<void>('DELETE', `/api/decks/${deckId}`),

  listSlides: (deckId: string, signal?: AbortSignal) =>
    request<{ slides: Slide[] }>('GET', `/api/decks/${deckId}/slides`, undefined, signal).then((r) => r.slides),

  createSlide: (deckId: string, slide: { after?: string | null; background?: string; elements?: SlideElement[] }) =>
    request<{ slide: Slide; deck: Deck }>('POST', `/api/decks/${deckId}/slides`, slide),

  getSlide: (slideId: string, signal?: AbortSignal) => request<Slide>('GET', `/api/slides/${slideId}`, undefined, signal),

  putSlide: (slideId: string, version: number, content: SlideContent) =>
    request<Slide>('PUT', `/api/slides/${slideId}`, { version, background: content.background, elements: content.elements }),

  deleteSlide: (slideId: string) => request<{ deck: Deck }>('DELETE', `/api/slides/${slideId}`),
}
