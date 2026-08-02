// Toolbar.jsx — search, filters, sort, grouping, scale, theme, create.
import { useRef } from "react";
import {
  ui, useStore, setQuery, setFilter, clearFilters, hasActiveFilters,
  setSort, toggleDir, toggleGrouped, setScale, setTheme, setComposer,
  setStatsOpen, getOptions, STATUSES, STATUS_LABELS, SORTS, SCALES,
} from "./hooks.js";

const fmtScale = (n) => (n >= 1000000 ? n / 1000000 + "M" : n / 1000 + "K");

export default function Toolbar() {
  useStore();
  const { assignees, labels } = getOptions();
  const searchRef = useRef(null);
  return (
    <header className="toolbar">
      <div className="brand">Tracker</div>

      <div className="search">
        <svg className="search-ico" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          id="search"
          ref={searchRef}
          value={ui.query}
          placeholder="Search issues…  ( / )"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search issues"
        />
        {ui.query && (
          <button className="search-clear" title="Clear search" onClick={() => setQuery("")}>×</button>
        )}
      </div>

      <div className="controls">
        <select className="ctl" value={ui.fStatus} onChange={(e) => setFilter("status", e.target.value)} aria-label="Filter by status">
          <option value="">Status: all</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select className="ctl" value={ui.fAssignee} onChange={(e) => setFilter("assignee", e.target.value)} aria-label="Filter by assignee">
          <option value="">Assignee: all</option>
          <option value="__none">Unassigned</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="ctl" value={ui.fLabel} onChange={(e) => setFilter("label", e.target.value)} aria-label="Filter by label">
          <option value="">Label: all</option>
          {labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {hasActiveFilters() && (
          <button className="btn subtle" title="Clear search and filters" onClick={clearFilters}>Reset</button>
        )}

        <span className="sep" />

        <select className="ctl" value={ui.sortKey} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
          {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
        </select>
        <button className={"btn icon"} title={"Direction: " + ui.sortDir} onClick={toggleDir} aria-label="Toggle sort direction">
          {ui.sortDir === "asc" ? "↑" : "↓"}
        </button>
        <button className={"btn" + (ui.grouped ? " on" : "")} onClick={toggleGrouped} aria-pressed={ui.grouped}>
          Group
        </button>

        <span className="sep" />

        <div className="seg" role="group" aria-label="Dataset scale">
          {SCALES.map((n) => (
            <button key={n} className={ui.scale === n ? "on" : ""} onClick={() => setScale(n)}>
              {fmtScale(n)}
            </button>
          ))}
        </div>

        <div className="seg" role="group" aria-label="Theme">
          {["light", "system", "dark"].map((t) => (
            <button key={t} className={ui.theme === t ? "on" : ""} title={"Theme: " + t} onClick={() => setTheme(t)}>
              {t === "light" ? "Light" : t === "dark" ? "Dark" : "Auto"}
            </button>
          ))}
        </div>

        <button className="btn subtle statsbtn" onClick={() => setStatsOpen(!ui.statsOpen)} aria-pressed={ui.statsOpen}>
          Stats
        </button>
        <button className="btn primary" onClick={() => setComposer(true)}>New issue</button>
      </div>
    </header>
  );
}
