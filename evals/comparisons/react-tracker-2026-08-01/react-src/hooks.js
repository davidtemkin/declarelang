// hooks.js — the store subscription hook plus re-exports so components can
// import state and actions from one place.
import { useSyncExternalStore } from "react";
import { subscribe, getVersion } from "./store.js";

export const useStore = () => useSyncExternalStore(subscribe, getVersion);

export {
  ui, derived, STATUSES, PRIORITIES, STATUS_LABELS, SORTS, SCALES, UNDO_MS,
  getIssue, getHorizon, getOptions,
  setQuery, setFilter, clearFilters, hasActiveFilters, setSort, toggleDir,
  toggleGrouped, toggleCollapse,
  select, clearSelection, openEditor, closeEditor,
  updateIssue, createIssue, bulkSetStatus, deleteIds, undoDelete,
  setScale, setTheme, setComposer, setStatsOpen, boot,
} from "./store.js";
