import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const THEME_MODES = ["light", "system", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  /** What "system" currently resolves to; components that need a concrete
   *  value (e.g. the toast layer) read this rather than the raw preference. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

export const THEME_STORAGE_KEY = "tracker.theme";

/**
 * `next-themes` is the usual answer here but is Next-specific; there is no
 * comparably standard framework-agnostic package, so this is ~20 lines of
 * zustand + `persist` instead. The matching pre-paint script lives in
 * index.html and reads the same storage key.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      resolved: "light",
      setMode: (mode) => set({ mode }),
    }),
    { name: THEME_STORAGE_KEY, partialize: ({ mode }) => ({ mode }) },
  ),
);

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Applies the resolved theme to <html>; call once, at the app root. */
export function useApplyTheme(): void {
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    const media = darkQuery();
    const apply = () => {
      const resolved: ResolvedTheme = mode === "system" ? (media.matches ? "dark" : "light") : mode;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      useThemeStore.setState({ resolved });
    };
    apply();
    if (mode !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);
}
