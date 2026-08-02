// App.jsx — shell: layout, keyboard layer, theme, selection bar, undo
// toasts, create dialog, busy overlay, and the metrics footer.
import { useEffect, useState } from "react";
import {
  ui, derived, useStore, setQuery, clearSelection, closeEditor, openEditor,
  deleteIds, undoDelete, bulkSetStatus, createIssue, setComposer,
  setStatsOpen, STATUSES, STATUS_LABELS, UNDO_MS,
} from "./hooks.js";
import Toolbar from "./Toolbar.jsx";
import Sidebar from "./Sidebar.jsx";
import List from "./List.jsx";
import Editor from "./Editor.jsx";

function useTheme() {
  const v = useStore();
  const [sysDark, setSysDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const fn = (e) => setSysDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  const resolved = ui.theme === "system" ? (sysDark ? "dark" : "light") : ui.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved, v]);
}

const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

function useKeyboard() {
  useEffect(() => {
    const onKey = (e) => {
      const typing = isTyping(e.target);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        document.getElementById("search")?.focus();
        return;
      }
      if (e.key === "Escape") {
        // walk back by layer: dialog -> stats drawer -> editor -> search -> selection
        if (ui.composer) { setComposer(false); return; }
        if (ui.statsOpen) { setStatsOpen(false); return; }
        if (ui.editingId != null) { closeEditor(); return; }
        if (ui.query) { setQuery(""); return; }
        if (isTyping(e.target)) { e.target.blur(); return; }
        if (ui.selection.size) { clearSelection(); return; }
        return;
      }
      if (typing) return;
      if (e.key === "Enter" && ui.anchorId != null && ui.editingId == null && !ui.composer) {
        e.preventDefault();
        openEditor(ui.anchorId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && ui.selection.size) {
        e.preventDefault();
        deleteIds(ui.selection);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function SelectionBar() {
  useStore();
  const n = ui.selection.size;
  if (!n || ui.editingId != null) return null;
  return (
    <div className="selbar">
      <strong>{n.toLocaleString()} selected</strong>
      <select
        className="ctl"
        value=""
        onChange={(e) => { if (e.target.value) bulkSetStatus([...ui.selection], e.target.value); }}
        aria-label="Set status of selection"
      >
        <option value="" disabled>Set status…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      <button className="btn danger" onClick={() => deleteIds(ui.selection)}>Delete</button>
      <button className="btn" onClick={clearSelection}>Clear</button>
    </div>
  );
}

function UndoToasts() {
  useStore();
  if (!ui.undos.length) return null;
  return (
    <div className="toasts">
      {ui.undos.map((u) => (
        <div className="toast" key={u.key}>
          <span>Deleted {u.ids.length.toLocaleString()} issue{u.ids.length > 1 ? "s" : ""}</span>
          <button className="btn primary" onClick={() => undoDelete(u.key)}>Undo</button>
          <i className="toast-clock" style={{ animationDuration: UNDO_MS + "ms" }} />
        </div>
      ))}
    </div>
  );
}

function Composer() {
  useStore();
  if (!ui.composer) return null;
  return (
    <div className="overlay" onClick={() => setComposer(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">New issue</div>
        <Editor create id={0} onSave={(f) => createIssue(f)} onCancel={() => setComposer(false)} />
      </div>
    </div>
  );
}

function BusyOverlay() {
  useStore();
  if (!ui.busy) return null;
  return (
    <div className="overlay busy">
      <div className="busycard">
        <div>{ui.busy.label}</div>
        <div className="busytrack"><i style={{ width: Math.round(ui.busy.pct * 100) + "%" }} /></div>
      </div>
    </div>
  );
}

function Footer() {
  useStore();
  const m = ui.metrics;
  const ms = (x) => (x == null ? "—" : x >= 100 ? Math.round(x) + "ms" : x.toFixed(1) + "ms");
  return (
    <footer className="footer">
      <span className="counts">
        <strong>{derived.visible.length.toLocaleString()}</strong>
        <span className="dim"> shown of </span>
        <strong>{derived.total.toLocaleString()}</strong>
        <span className="dim"> issues</span>
      </span>
      <span className="spring" />
      <span className="perf dim" title="Measured live: fetch+parse, model build, last filter derivation">
        load {ms(m.load)} · ingest {ms(m.ingest)} · search {ms(m.search)}
      </span>
    </footer>
  );
}

export default function App() {
  useStore();
  useTheme();
  useKeyboard();
  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <List />
        <Sidebar />
      </div>
      <Footer />
      <SelectionBar />
      <UndoToasts />
      <Composer />
      <BusyOverlay />
    </div>
  );
}
