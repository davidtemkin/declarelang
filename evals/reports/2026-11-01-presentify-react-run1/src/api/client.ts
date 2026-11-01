import type { Deck, DeckSummary, Slide, SlideElement } from '../model/types';

/** The Presentify data service. It answers any origin. */
export const API_BASE = 'http://127.0.0.1:8361';

export type ApiErrorCode = 'conflict' | 'invalid' | 'not_found' | 'unavailable' | 'last_slide' | 'network';

/**
 * A refusal from the service, or a failure to reach it at all (`code: 'network'`).
 * `current` is the server's copy on a `conflict`.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  readonly current?: unknown;
  readonly field?: string;

  constructor(code: string, status: number, message: string, extra: { current?: unknown; field?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.current = extra.current;
    this.field = extra.field;
  }

  /** True when the request can simply be sent again later. */
  get isRetryable(): boolean {
    return this.code === 'network' || this.code === 'unavailable' || this.status >= 500;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 0, "Can't reach the Presentify service.");
  }
  if (response.status === 204) return undefined as T;
  let data: Record<string, unknown> | undefined;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const code = typeof data?.error === 'string' ? data.error : response.status >= 500 ? 'unavailable' : 'unknown';
    const message = typeof data?.message === 'string' ? data.message : `The service answered ${response.status}.`;
    throw new ApiError(code, response.status, message, {
      current: data?.current,
      field: typeof data?.field === 'string' ? data.field : undefined,
    });
  }
  return data as T;
}

export interface SlideContent {
  background: string;
  elements: SlideElement[];
}

export const api = {
  listDecks: () => request<{ decks: DeckSummary[] }>('GET', '/api/decks').then((r) => r.decks),
  createDeck: (title?: string) => request<{ deck: Deck; slides: Slide[] }>('POST', '/api/decks', { title }),
  getDeck: (id: string) => request<Deck>('GET', `/api/decks/${encodeURIComponent(id)}`),
  updateDeck: (id: string, body: { version: number; title?: string; slideOrder?: string[] }) =>
    request<Deck>('PATCH', `/api/decks/${encodeURIComponent(id)}`, body),
  deleteDeck: (id: string) => request<void>('DELETE', `/api/decks/${encodeURIComponent(id)}`),

  listSlides: (deckId: string) =>
    request<{ slides: Slide[] }>('GET', `/api/decks/${encodeURIComponent(deckId)}/slides`).then((r) => r.slides),
  createSlide: (deckId: string, body: Partial<SlideContent> & { after?: string | null }) =>
    request<{ slide: Slide; deck: Deck }>('POST', `/api/decks/${encodeURIComponent(deckId)}/slides`, body),
  getSlide: (id: string) => request<Slide>('GET', `/api/slides/${encodeURIComponent(id)}`),
  saveSlide: (id: string, body: SlideContent & { version: number }) =>
    request<Slide>('PUT', `/api/slides/${encodeURIComponent(id)}`, body),
  deleteSlide: (id: string) => request<{ deck: Deck }>('DELETE', `/api/slides/${encodeURIComponent(id)}`),
};
