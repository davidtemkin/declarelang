import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_MODES, useThemeStore, type ThemeMode } from "../../hooks/useTheme";
import styles from "./ThemeToggle.module.css";

const ICONS: Record<ThemeMode, typeof Sun> = { light: Sun, system: Monitor, dark: Moon };

export function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <div className={styles.group} role="group" aria-label="Colour theme">
      {THEME_MODES.map((value) => {
        const Icon = ICONS[value];
        return (
          <button
            key={value}
            type="button"
            className={styles.button}
            aria-pressed={mode === value}
            aria-label={`${value} theme`}
            title={`${value[0].toUpperCase()}${value.slice(1)} theme`}
            onClick={() => setMode(value)}
          >
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
