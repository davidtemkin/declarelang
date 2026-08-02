// List.jsx — custom virtualizer. Fixed-height rows (ROW_H) with at most a
// handful of irregularities: up to 4 group headers and one expanded editor
// row, so offsets are O(#segments) arithmetic and position lookup is a
// binary search over that arithmetic — no per-row height arrays even at 1M.
// Above ~15M virtual px (1M rows) the scrollbar is compressed: real
// scrollTop maps linearly onto virtual space, rows get a correction shift.
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  derived, ui, useStore, closeEditor, clearFilters, hasActiveFilters,
  setComposer,
} from "./hooks.js";
import { IssueRow, HeaderRow } from "./Row.jsx";
import Editor from "./Editor.jsx";
import { updateIssue } from "./store.js";

export const ROW_H = 40;
const HEADER_H = 34;
const MAX_H = 15_000_000;
const OVERSCAN = 8;
const CHUNK = 100_000; // px; row-offset rebase granularity (see below)

function headersBefore(f) {
  let c = 0;
  for (const s of derived.segments) if (s.headerFlat >= 0 && s.headerFlat < f) c++;
  return c;
}
function offsetOf(f, expFlat, extra) {
  return f * ROW_H + headersBefore(f) * (HEADER_H - ROW_H) + (expFlat >= 0 && f > expFlat ? extra : 0);
}
function indexAt(y, expFlat, extra) {
  let lo = 0, hi = derived.flatCount - 1, ans = 0;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (offsetOf(m, expFlat, extra) <= y) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}
function itemAt(f) {
  for (const s of derived.segments) {
    if (s.headerFlat === f) return { header: s };
    if (f >= s.rowsStart && f < s.rowsStart + s.shown) return { idx: s.rows[f - s.rowsStart] };
  }
  return null;
}

export default function List() {
  const v = useStore();
  const elRef = useRef(null);
  const [, setTick] = useState(0);
  const force = () => setTick((n) => n + 1);
  const hRef = useRef(600);
  const stRef = useRef(0);
  const frameRef = useRef({ start: 0, end: 0, shift: 0 });
  // editor expansion animation: extra px added to the editing row's height
  const anim = useRef({ id: null, extra: 0, target: 0, measured: 360, raf: 0, scrollOnOpen: false });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      hRef.current = el.clientHeight;
      force();
    });
    ro.observe(el);
    hRef.current = el.clientHeight;
    return () => ro.disconnect();
  }, []);

  // Drive the open/close animation. Closing finishes before a new row opens.
  const a = anim.current;
  useEffect(() => {
    const step = () => {
      const a = anim.current;
      const wanted = ui.editingId;
      let target = a.id != null && a.id === wanted ? a.target : 0;
      const d = target - a.extra;
      if (Math.abs(d) < 1.5) {
        a.extra = target;
        if (a.id !== wanted) {
          a.id = wanted;
          a.extra = 0;
          a.target = wanted != null ? Math.max(0, a.measured - ROW_H) : 0;
          if (wanted != null) a.scrollOnOpen = true;
        }
        if (a.extra === a.target && a.id === wanted) { a.raf = 0; force(); return; }
      } else {
        a.extra += d * 0.28;
      }
      force();
      a.raf = requestAnimationFrame(step);
    };
    const a = anim.current;
    if (a.id !== ui.editingId || a.extra !== a.target) {
      if (!a.raf) a.raf = requestAnimationFrame(step);
    }
    return () => { if (a.raf) { cancelAnimationFrame(a.raf); a.raf = 0; } };
  }, [v, ui.editingId]);

  const expFlat = a.id != null && a.id === ui.editingId ? derived.expFlat : (a.id != null ? flatOfId(a.id) : -1);
  const extra = expFlat >= 0 ? a.extra : 0;

  const total = offsetOf(derived.flatCount, expFlat, extra);
  const spacer = Math.min(total, MAX_H);
  const ch = hRef.current;
  const scale = total > spacer && spacer > ch ? (total - ch) / (spacer - ch) : 1;
  const maxSt = Math.max(0, spacer - ch);
  const st = Math.min(stRef.current, maxSt);
  const vTop = st * scale;
  const flatCount = derived.flatCount;
  const start = flatCount ? Math.max(0, indexAt(vTop, expFlat, extra) - OVERSCAN) : 0;
  const end = flatCount ? Math.min(flatCount, indexAt(vTop + ch, expFlat, extra) + 1 + OVERSCAN) : 0;
  // Rows are positioned relative to a chunk origin, not to absolute virtual
  // space: Chrome saturates layout/transform geometry near 2^25 px (~33.5M),
  // which 1M rows * 40px would blow past. base tracks vTop in CHUNK steps, so
  // row transforms stay tiny and the window transform stays within scrollTop
  // range — and rows only re-render when the chunk actually changes.
  const base = Math.floor(vTop / CHUNK) * CHUNK;
  const shift = st - vTop + base;
  frameRef.current = { start, end, shift };

  // scroll the freshly opened editor into view once
  useEffect(() => {
    const a = anim.current;
    if (!a.scrollOnOpen || a.id == null || derived.expFlat < 0) return;
    a.scrollOnOpen = false;
    const el = elRef.current;
    if (!el) return;
    const top = offsetOf(derived.expFlat, -1, 0);
    const bottom = top + ROW_H + Math.max(0, a.measured - ROW_H) + 12;
    let want = vTop;
    if (top < vTop + 4) want = top - 8;
    else if (bottom > vTop + ch) want = Math.min(top - 8, bottom - ch);
    if (want !== vTop) el.scrollTop = Math.max(0, want / scale);
  });

  const onScroll = () => {
    const el = elRef.current;
    if (!el) return;
    stRef.current = el.scrollTop;
    const t = offsetOf(derived.flatCount, expFlat, anim.current.extra);
    const sp = Math.min(t, MAX_H);
    const c = hRef.current;
    const sc = t > sp && sp > c ? (t - c) / (sp - c) : 1;
    const vt = el.scrollTop * sc;
    const s0 = derived.flatCount ? Math.max(0, indexAt(vt, expFlat, anim.current.extra) - OVERSCAN) : 0;
    const e0 = derived.flatCount ? Math.min(derived.flatCount, indexAt(vt + c, expFlat, anim.current.extra) + 1 + OVERSCAN) : 0;
    const sh = el.scrollTop - vt + Math.floor(vt / CHUNK) * CHUNK;
    const f = frameRef.current;
    if (s0 !== f.start || e0 !== f.end || sh !== f.shift) flushSync(force);
  };

  if (derived.flatCount === 0 && !ui.busy) return <EmptyState />;

  const children = [];
  // the editor stays rendered through the close animation (a.id lags editingId)
  const editing = a.id != null && expFlat >= 0;
  for (let f = start; f < end; f++) {
    const item = itemAt(f);
    if (!item) continue;
    const top = offsetOf(f, expFlat, extra) - base;
    if (item.header) {
      children.push(<HeaderRow key={"h:" + item.header.status} seg={item.header} top={top} height={HEADER_H} />);
    } else if (editing && f === expFlat) {
      children.push(renderEditorRow(top, extra, anim.current));
    } else {
      const id = item.idx + 1;
      children.push(
        <IssueRow key={id} id={id} top={top} selected={ui.selection.has(id)}
          anchored={ui.anchorId === id} dataV={v} />
      );
    }
  }
  // keep the editor mounted (draft alive) even when scrolled out of range
  if (editing && (expFlat < start || expFlat >= end)) {
    children.push(renderEditorRow(offsetOf(expFlat, expFlat, extra) - base, extra, anim.current));
  }

  return (
    <div className="list" ref={elRef} onScroll={onScroll} tabIndex={-1}>
      <div className="spacer" style={{ height: spacer }}>
        <div className="win" style={{ transform: `translateY(${shift}px)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function flatOfId(id) {
  const idx = id - 1;
  for (const s of derived.segments) {
    if (s.collapsed) continue;
    const p = s.rows.indexOf(idx);
    if (p >= 0) return s.rowsStart + p;
  }
  return -1;
}

function renderEditorRow(top, extra, a) {
  const id = a.id;
  return (
    <div key={"e:" + id} className="vrow editrow"
      style={{ transform: `translateY(${top}px)`, height: ROW_H + extra }}>
      <Editor
        key={id}
        id={id}
        onMeasure={(h) => {
          if (h && Math.abs(h - a.measured) > 1) {
            a.measured = h;
            if (a.id != null) a.target = Math.max(0, h - ROW_H);
          }
        }}
        onSave={(patch) => { updateIssue(id, patch); closeEditor(); }}
        onCancel={() => closeEditor()}
      />
    </div>
  );
}

function EmptyState() {
  const none = derived.total === 0;
  return (
    <div className="empty">
      {none ? (
        <>
          <div className="empty-title">No issues exist</div>
          <div className="empty-sub">The tracker is empty.</div>
          <button className="btn primary" onClick={() => setComposer(true)}>Create an issue</button>
        </>
      ) : (
        <>
          <div className="empty-title">Nothing matches</div>
          <div className="empty-sub">No issues match the current search and filters.</div>
          {hasActiveFilters() && (
            <button className="btn" onClick={clearFilters}>Clear search &amp; filters</button>
          )}
        </>
      )}
    </div>
  );
}
