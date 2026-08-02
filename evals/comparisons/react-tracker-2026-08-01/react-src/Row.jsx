// Row.jsx — one virtualized list row / group header. Rows are memoized so
// scroll-range shifts re-render only the rows entering the viewport.
import { memo } from "react";
import {
  getIssue, getHorizon, select, openEditor, toggleCollapse, STATUS_LABELS,
} from "./hooks.js";

export function relTime(ts, horizon) {
  const d = Math.max(0, horizon - ts);
  const day = 86400000;
  if (d < day) return "today";
  if (d < 14 * day) return Math.floor(d / day) + "d";
  if (d < 60 * day) return Math.floor(d / (7 * day)) + "w";
  if (d < 365 * day) return Math.floor(d / (30 * day)) + "mo";
  return (d / (365 * day)).toFixed(1) + "y";
}

export const IssueRow = memo(function IssueRow({ id, top, selected, anchored }) {
  const it = getIssue(id);
  const horizon = getHorizon();
  const onClick = (e) => {
    if (e.shiftKey) select(id, "set", { withShift: true });
    else if (e.metaKey || e.ctrlKey) select(id, "toggle");
    else select(id, "set");
  };
  return (
    <div
      className={"vrow row" + (selected ? " sel" : "") + (anchored ? " anchor" : "")}
      style={{ transform: `translateY(${top}px)` }}
      onClick={onClick}
      onDoubleClick={() => openEditor(id)}
    >
      <input
        type="checkbox"
        className="rowcheck"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => select(id, "toggle", { withShift: e.nativeEvent.shiftKey })}
        aria-label={"Select issue " + id}
      />
      <span className={"dot st-" + it.status} title={STATUS_LABELS[it.status]} />
      <span className={"prio " + it.priority.toLowerCase()}>{it.priority}</span>
      <span className="rowmain">
        <span className="rowtitle">{it.title}</span>
        {it.labels.length > 0 && (
          <span className="rowlabels">
            {it.labels.map((l) => <span className="chip" key={l}>{l}</span>)}
          </span>
        )}
      </span>
      <span className={"assignee" + (it.assignee ? "" : " none")}>
        {it.assignee ?? "—"}
      </span>
      <span className="updated">{relTime(it.updated, horizon)}</span>
      <button
        className="rowedit"
        title="Edit issue"
        onClick={(e) => { e.stopPropagation(); openEditor(id); }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M11.5 2.5l2 2L5 13l-2.7.7.7-2.7 8.5-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
});

export const HeaderRow = memo(function HeaderRow({ seg, top, height }) {
  return (
    <div
      className="vrow ghead"
      style={{ transform: `translateY(${top}px)`, height }}
      onClick={() => toggleCollapse(seg.status)}
    >
      <span className={"chev" + (seg.collapsed ? " closed" : "")}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3l3 4 3-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={"dot st-" + seg.status} />
      <span className="ghead-name">{STATUS_LABELS[seg.status]}</span>
      <span className="ghead-count">{seg.rows.length.toLocaleString()}</span>
    </div>
  );
});
