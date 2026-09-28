import { useSyncExternalStore } from "react";

const query = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function prefersReducedMotion(): boolean {
  return query?.matches ?? false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      query?.addEventListener("change", onChange);
      return () => query?.removeEventListener("change", onChange);
    },
    prefersReducedMotion,
  );
}
