import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import type { Order } from './api'
import type { CheckoutValues } from './checkout/values'

/**
 * What the person is in the middle of: which performance, which seats, what
 * they have typed at checkout, and — once paid — their order. It lives above
 * the routes so that moving between the hall and checkout, or signing in
 * part-way, loses nothing.
 */
type Booking = {
  performanceId: string | null
  /** Seat ids, in the order they were chosen. */
  selected: string[]
  /** A sentence for the hall, e.g. that a chosen seat was taken, and which seats it's about. */
  notice: { id: number; text: string; seatIds: string[] } | null
  /** An order is in flight; seats it is buying going "sold" are not losses. */
  paying: boolean
  /** Checkout fields, kept while the person goes back to the hall. Never holds a security code. */
  draft: Partial<CheckoutValues> | null
  order: Order | null
}

type Action =
  | { type: 'enter'; performanceId: string }
  | { type: 'toggle'; seatId: string }
  | { type: 'lose'; seatIds: string[]; notice: string }
  | { type: 'dismissNotice' }
  | { type: 'paying'; paying: boolean }
  | { type: 'saveDraft'; draft: Partial<CheckoutValues> }
  | { type: 'complete'; order: Order }
  | { type: 'reset' }

const initial: Booking = {
  performanceId: null,
  selected: [],
  notice: null,
  draft: null,
  order: null,
  paying: false,
}

let noticeId = 0

function reducer(state: Booking, action: Action): Booking {
  switch (action.type) {
    case 'enter':
      if (state.performanceId === action.performanceId) return state
      // A different performance: seats don't carry over, but typed details do.
      return { ...initial, performanceId: action.performanceId, draft: state.draft }
    case 'toggle': {
      const has = state.selected.includes(action.seatId)
      return {
        ...state,
        selected: has
          ? state.selected.filter((id) => id !== action.seatId)
          : [...state.selected, action.seatId],
        // Choosing again answers the notice.
        notice: null,
      }
    }
    case 'lose': {
      const lost = new Set(action.seatIds)
      return {
        ...state,
        selected: state.selected.filter((id) => !lost.has(id)),
        notice: { id: ++noticeId, text: action.notice, seatIds: action.seatIds },
      }
    }
    case 'dismissNotice':
      return { ...state, notice: null }
    case 'paying':
      return { ...state, paying: action.paying }
    case 'saveDraft':
      return { ...state, draft: action.draft }
    case 'complete':
      return { ...initial, order: action.order, draft: state.draft }
    case 'reset':
      return initial
  }
}

type BookingContextValue = Booking & {
  enter: (performanceId: string) => void
  toggle: (seatId: string) => void
  lose: (seatIds: string[], notice: string) => void
  dismissNotice: () => void
  setPaying: (paying: boolean) => void
  saveDraft: (draft: Partial<CheckoutValues>) => void
  complete: (order: Order) => void
  reset: () => void
}

const BookingContext = createContext<BookingContextValue | null>(null)

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const actions = useMemo(
    () => ({
      enter: (performanceId: string) => dispatch({ type: 'enter', performanceId }),
      toggle: (seatId: string) => dispatch({ type: 'toggle', seatId }),
      lose: (seatIds: string[], notice: string) => dispatch({ type: 'lose', seatIds, notice }),
      dismissNotice: () => dispatch({ type: 'dismissNotice' }),
      setPaying: (paying: boolean) => dispatch({ type: 'paying', paying }),
      saveDraft: (draft: Partial<CheckoutValues>) => dispatch({ type: 'saveDraft', draft }),
      complete: (order: Order) => dispatch({ type: 'complete', order }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  )
  const value = useMemo(() => ({ ...state, ...actions }), [state, actions])
  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

export function useBooking() {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking must be used inside <BookingProvider>')
  return ctx
}
