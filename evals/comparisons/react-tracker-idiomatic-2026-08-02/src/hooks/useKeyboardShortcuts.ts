import { useHotkeys } from "react-hotkeys-hook";
import { useTrackerStore } from "../store/trackerStore";
import { useDeleteWithUndo } from "./useDeleteWithUndo";
import { facetsAreEmpty } from "../domain/query";

export const SEARCH_INPUT_ID = "tracker-search";

const focusSearch = () => {
  const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
  input?.focus();
  input?.select();
};

/**
 * Global shortcuts. Callbacks read the store imperatively so the bindings are
 * registered once rather than re-bound on every state change.
 *
 * By default react-hotkeys-hook ignores keystrokes originating in form fields,
 * which is exactly the "never while typing" rule for Enter and Delete; the two
 * shortcuts that must work while typing opt in explicitly.
 */
export function useKeyboardShortcuts(): void {
  const deleteWithUndo = useDeleteWithUndo();

  useHotkeys("mod+k", focusSearch, { enableOnFormTags: true, preventDefault: true });
  // `useKey` matches the produced character rather than the physical key, so
  // "/" works on any layout (and on the numpad).
  useHotkeys("/", focusSearch, { useKey: true, preventDefault: true });

  // preventDefault matters: without it the keypress that follows this keydown
  // reaches the editor's freshly focused title field and submits the form.
  useHotkeys(
    "enter",
    () => {
      const { selection, openEditor } = useTrackerStore.getState();
      if (selection.size === 1) openEditor([...selection][0]);
    },
    { preventDefault: true },
  );

  useHotkeys("delete, backspace", (event) => {
    const { selection } = useTrackerStore.getState();
    if (selection.size === 0) return;
    event.preventDefault();
    deleteWithUndo(selection);
  });

  // Esc unwinds one layer at a time: editor → selection → search → filters.
  useHotkeys(
    "escape",
    () => {
      const state = useTrackerStore.getState();
      if (state.editingId !== null) state.closeEditor();
      else if (state.selection.size > 0) state.clearSelection();
      else if (state.query !== "") state.setQuery("");
      else if (!facetsAreEmpty(state.facets)) state.clearAllFilters();
    },
    { enableOnFormTags: true },
  );
}
