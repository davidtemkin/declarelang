import { useEffect, useRef } from "react";

/**
 * Moves focus to a page's heading when the page opens, so that keyboard and
 * screen reader users start where everyone else is looking.
 */
export function useFocusOnArrival<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
