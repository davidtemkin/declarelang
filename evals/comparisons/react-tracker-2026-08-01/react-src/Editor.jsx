// Editor.jsx — draft-semantics issue form. Used both inline (expanded row)
// and in the create dialog. All changes stage into local state; Save commits
// via the callback, Cancel/Esc discards. No autosave.
import { useLayoutEffect, useRef, useState } from "react";
import { getIssue, getOptions, STATUSES, STATUS_LABELS, PRIORITIES } from "./hooks.js";

function parseLabels(text) {
  return [...new Set(text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 5);
}

export default function Editor({ id, onSave, onCancel, onMeasure, create = false }) {
  const it = create ? null : getIssue(id);
  const [d, setD] = useState(() => ({
    title: it?.title ?? "",
    description: it?.description ?? "",
    status: it?.status ?? "open",
    priority: it?.priority ?? "P2",
    assignee: it?.assignee ?? "",
    labels: it?.labels.join(", ") ?? "",
  }));
  const ref = useRef(null);
  const titleRef = useRef(null);
  const { assignees } = getOptions();

  useLayoutEffect(() => {
    if (!onMeasure || !ref.current) return;
    const el = ref.current;
    onMeasure(el.offsetHeight);
    const ro = new ResizeObserver(() => onMeasure(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure]);

  useLayoutEffect(() => { titleRef.current?.focus(); titleRef.current?.select(); }, []);

  const set = (k) => (e) => setD((p) => ({ ...p, [k]: e.target.value }));
  const save = () => onSave({
    title: d.title.trim() || (it?.title ?? "Untitled issue"),
    description: d.description,
    status: d.status,
    priority: d.priority,
    assignee: d.assignee || null,
    labels: parseLabels(d.labels),
  });
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  };

  return (
    <div className="editor" ref={ref} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="ed-row">
        <input
          ref={titleRef}
          className="ed-title"
          value={d.title}
          placeholder="Issue title"
          onChange={set("title")}
          aria-label="Title"
        />
      </div>
      <div className="ed-row ed-selects">
        <label>Status
          <select value={d.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label>Priority
          <select value={d.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Assignee
          <select value={d.assignee} onChange={set("assignee")}>
            <option value="">Unassigned</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>
      <div className="ed-row">
        <label className="ed-block">Labels
          <input
            value={d.labels}
            placeholder="comma-separated, up to 5"
            onChange={set("labels")}
          />
        </label>
      </div>
      <div className="ed-row">
        <label className="ed-block">Description
          <textarea rows={3} value={d.description} onChange={set("description")} />
        </label>
      </div>
      <div className="ed-row ed-actions">
        {!create && it && <span className="ed-meta">#{it.id} · {it.comments} comments</span>}
        <span className="spring" />
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={save}>{create ? "Create" : "Save"}</button>
      </div>
    </div>
  );
}
