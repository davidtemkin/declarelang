// Client for the Venue service. See task/api/API.md.

export const API_ORIGIN = 'http://127.0.0.1:8351'

export type Performance = {
  id: string
  startsAt: string
  doorsAt: string
  priceFromCents: number
  seatsLeft: number
  seats: number
}

export type Production = {
  title: string
  hall: string
  runningTime: string
  performances: Performance[]
}

export type SeatStatus = 'available' | 'sold'

export type Seat = { id: string; number: number; status: SeatStatus }
export type Row = { name: string; seats: Seat[] }
export type Section = {
  key: string
  name: string
  priceCents: number
  feeCents: number
  rows: Row[]
}
export type SeatMap = { performanceId: string; sections: Section[] }

export type Country = 'US' | 'CA' | 'GB'

export type Address = {
  line1: string
  line2: string | null
  city: string
  postalCode: string
  country: Country
}

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover'

export type SavedCard = {
  id: string
  brand: CardBrand
  last4: string
  expMonth: number
  expYear: number
}

export type Account = {
  name: string
  email: string
  billing: Address | null
  cards: SavedCard[]
}

export type Ticket = {
  seatId: string
  section: string
  row: string
  number: number
  barcode: string
}

export type Order = {
  code: string
  email: string
  totalCents: number
  brand: CardBrand
  last4: string
  performanceId: string
  tickets: Ticket[]
}

export type OrderRequest = {
  performanceId: string
  seatIds: string[]
  email: string
  payment:
    | { savedCardId: string; cvc: string }
    | {
        card: { number: string; expMonth: number; expYear: number; cvc: string; name: string }
        billing: Address
      }
}

export type ApiErrorBody = {
  error: string
  message: string
  field?: 'cvc' | 'postalCode' | 'number' | 'expiry' | 'email'
  conflicts?: string[]
}

/** A refusal from the service. `message` is the service's own sentence. */
export class ApiError extends Error {
  readonly status: number
  readonly body: ApiErrorBody

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const UNREACHABLE = "We couldn't reach the box office. Check your connection and try again."

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_ORIGIN + path, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
    })
  } catch {
    throw new ApiError(0, { error: 'network', message: UNREACHABLE })
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, body ?? { error: 'unknown', message: UNREACHABLE })
  }
  return body as T
}

export const api = {
  production: () => request<Production>('/api/production'),

  seatMap: (performanceId: string) =>
    request<SeatMap>(`/api/performances/${encodeURIComponent(performanceId)}/seats`),

  /** The signed-in account, or null when signed out. */
  me: async (): Promise<Account | null> => {
    try {
      return await request<Account>('/api/me')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null
      throw err
    }
  },

  signIn: (email: string, password: string) =>
    request<{ name: string; email: string }>('/api/session', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  signOut: () => request<void>('/api/session', { method: 'DELETE' }),

  placeOrder: (order: OrderRequest) =>
    request<Order>('/api/orders', { method: 'POST', body: JSON.stringify(order) }),

  eventsUrl: (performanceId: string) =>
    `${API_ORIGIN}/api/events?performance=${encodeURIComponent(performanceId)}`,
}
