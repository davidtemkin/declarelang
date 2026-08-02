import { useState } from "react";
import clsx from "clsx";
import { Toaster } from "sonner";
import { FilterPanel } from "./components/filters/FilterPanel";
import { IssueList } from "./components/list/IssueList";
import { StatsPanel } from "./components/stats/StatsPanel";
import { MetricsBar } from "./components/shell/MetricsBar";
import { TopBar } from "./components/shell/TopBar";
import { ListToolbar } from "./components/toolbar/ListToolbar";
import { useApplyTheme, useThemeStore } from "./hooks/useTheme";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTrackerStore } from "./store/trackerStore";
import { ViewModelProvider } from "./state/viewModel";
import styles from "./App.module.css";

export default function App() {
  useApplyTheme();
  useKeyboardShortcuts();

  const theme = useThemeStore((s) => s.resolved);
  const loading = useTrackerStore((s) => s.loading);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ViewModelProvider>
      <div className={styles.app}>
        <TopBar onToggleSidebar={() => setSidebarOpen((open) => !open)} />

        <div className={styles.body}>
          <aside className={clsx(styles.sidebar, sidebarOpen && styles.sidebarOpen)}>
            <FilterPanel />
            <StatsPanel />
          </aside>
          {sidebarOpen && (
            <button
              type="button"
              className={styles.scrim}
              aria-label="Close panel"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <main className={styles.main}>
            <ListToolbar />
            <IssueList />
            <MetricsBar />
          </main>
        </div>

        {loading && (
          <div className={styles.loading} role="status">
            <span className={styles.spinner} aria-hidden />
            Preparing dataset…
          </div>
        )}

        <Toaster theme={theme} position="bottom-center" closeButton />
      </div>
    </ViewModelProvider>
  );
}
