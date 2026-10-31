import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { Order } from "./api/types";

export type Notice = { id: number; text: string };

type State = {
  performanceId: string | null;
  seatIds: string[];
  /** Things the person must be told about their choice: seats lost to others. */
  notices: Notice[];
  /** The last completed order, shown as tickets. */
  order: Order | null;
  /**
   * A payment is in flight. The service announces the person's own seats as
   * sold before it answers them, so meanwhile those seats aren't counted lost.
   */
  paying: boolean;
};

type Action =
  | { type: "toggle"; performanceId: string; seatId: string }
  | { type: "lose"; seatIds: string[]; notice: string }
  | { type: "dismiss"; id: number }
  | { type: "paying"; paying: boolean }
  | { type: "complete"; order: Order }
  | { type: "reset" };

let nextNoticeId = 1;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "toggle": {
      // A choice belongs to one performance; picking in another starts afresh.
      const seatIds = state.performanceId === action.performanceId ? state.seatIds : [];
      return {
        ...state,
        performanceId: action.performanceId,
        notices: state.performanceId === action.performanceId ? state.notices : [],
        seatIds: seatIds.includes(action.seatId)
          ? seatIds.filter((id) => id !== action.seatId)
          : [...seatIds, action.seatId],
      };
    }
    case "lose": {
      const lost = new Set(action.seatIds);
      if (!state.seatIds.some((id) => lost.has(id))) return state;
      return {
        ...state,
        seatIds: state.seatIds.filter((id) => !lost.has(id)),
        notices: [...state.notices, { id: nextNoticeId++, text: action.notice }],
      };
    }
    case "dismiss":
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };
    case "paying":
      return { ...state, paying: action.paying };
    case "complete":
      return { performanceId: null, seatIds: [], notices: [], order: action.order, paying: false };
    case "reset":
      return { performanceId: null, seatIds: [], notices: [], order: null, paying: false };
  }
}

type SelectionContextValue = State & {
  seatIdsFor: (performanceId: string) => string[];
  toggleSeat: (performanceId: string, seatId: string) => void;
  loseSeats: (seatIds: string[], notice: string) => void;
  dismissNotice: (id: number) => void;
  setPaying: (paying: boolean) => void;
  completeOrder: (order: Order) => void;
  reset: () => void;
  /**
   * What has been typed at checkout, kept while the person steps back into the
   * hall (or is sent there because a seat went) and dropped once they have paid.
   */
  checkoutDraft: { current: Record<string, unknown> | null };
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    performanceId: null,
    seatIds: [],
    notices: [],
    order: null,
    paying: false,
  });

  const seatIdsFor = useCallback(
    (performanceId: string) => (state.performanceId === performanceId ? state.seatIds : []),
    [state.performanceId, state.seatIds],
  );
  const toggleSeat = useCallback(
    (performanceId: string, seatId: string) => dispatch({ type: "toggle", performanceId, seatId }),
    [],
  );
  const loseSeats = useCallback(
    (seatIds: string[], notice: string) => dispatch({ type: "lose", seatIds, notice }),
    [],
  );
  const dismissNotice = useCallback((id: number) => dispatch({ type: "dismiss", id }), []);
  const setPaying = useCallback((paying: boolean) => dispatch({ type: "paying", paying }), []);
  const checkoutDraft = useRef<Record<string, unknown> | null>(null);
  const completeOrder = useCallback((order: Order) => {
    checkoutDraft.current = null;
    dispatch({ type: "complete", order });
  }, []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const value = useMemo(
    () => ({ ...state, seatIdsFor, toggleSeat, loseSeats, dismissNotice, setPaying, completeOrder, reset, checkoutDraft }),
    [state, seatIdsFor, toggleSeat, loseSeats, dismissNotice, setPaying, completeOrder, reset],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("useSelection must be used inside <SelectionProvider>");
  return value;
}
