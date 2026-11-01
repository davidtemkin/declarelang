/**
 * The editor's state: the working document, what is selected, and the undo history.
 *
 * Every change to the document goes through `apply` (one step) or through
 * `begin` → `preview`… → `commit` (a gesture, like a drag, that is one step however many
 * times it redraws). Each step remembers the document and the selection on both sides,
 * so undo and redo put both back.
 */
import { create } from 'zustand';
import { findElement, removeElements } from '../model/elements';
import type { Slide } from '../model/types';
import { type Doc, updateElements } from './doc';

export type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'text';

export type SaveState = 'saved' | 'saving' | 'offline';

/** What the service holds for a slide that differs from what we last read, when we've learnt of it. */
export type SlideConflict = { kind: 'changed'; theirs: Slide } | { kind: 'deleted' };

interface Snapshot {
  doc: Doc;
  slideId: string;
  selection: string[];
}

interface HistoryEntry {
  label: string;
  before: Snapshot;
  after: Snapshot;
}

const HISTORY_LIMIT = 300;

export interface EditorState {
  deckId: string | null;
  doc: Doc | null;
  currentSlideId: string;
  /** Element ids on the current slide. May name an element inside a group. */
  selection: string[];
  tool: Tool;
  /** The text box being typed into, if any. */
  editingId: string | null;
  presenting: boolean;

  past: HistoryEntry[];
  future: HistoryEntry[];
  /** The snapshot a gesture started from, while one is under way. */
  gesture: Snapshot | null;

  saveState: SaveState;
  conflicts: Readonly<Record<string, SlideConflict>>;
  /** The slide list was changed in another window in a way we couldn't merge. */
  deckConflict: boolean;
}

const initialState: EditorState = {
  deckId: null,
  doc: null,
  currentSlideId: '',
  selection: [],
  tool: 'select',
  editingId: null,
  presenting: false,
  past: [],
  future: [],
  gesture: null,
  saveState: 'saved',
  conflicts: {},
  deckConflict: false,
};

export const useEditor = create<EditorState>()(() => initialState);

const get = useEditor.getState;
const set = useEditor.setState;

function snapshot(): Snapshot {
  const s = get();
  return { doc: s.doc!, slideId: s.currentSlideId, selection: s.selection };
}

function restore(snap: Snapshot) {
  const slideId = snap.doc.slides[snap.slideId] ? snap.slideId : snap.doc.order[0];
  set({
    doc: snap.doc,
    currentSlideId: slideId,
    selection: slideId === snap.slideId ? snap.selection : [],
    editingId: null,
    gesture: null,
  });
}

function push(label: string, before: Snapshot) {
  const after = snapshot();
  if (after.doc === before.doc) return;
  set((s) => ({ past: [...s.past, { label, before, after }].slice(-HISTORY_LIMIT), future: [] }));
}

export const editor = {
  reset(deckId: string, doc: Doc) {
    set({ ...initialState, deckId, doc, currentSlideId: doc.order[0] });
  },

  close() {
    set(initialState);
  },

  /** One undoable step. `selection` is what's selected afterwards (unchanged if omitted). */
  apply(label: string, fn: (doc: Doc) => Doc, selection?: string[], slideId?: string) {
    if (!get().doc) return;
    editor.endEditing();
    if (get().gesture) editor.commit(label);
    const s = get();
    const before = snapshot();
    const doc = fn(s.doc!);
    if (doc === s.doc && !selection) return;
    set({
      doc,
      ...(slideId ? { currentSlideId: slideId } : null),
      ...(selection ? { selection } : null),
    });
    push(label, before);
  },

  /** Start a gesture: changes until `commit` become a single step. */
  begin() {
    if (!get().doc) return;
    if (!get().gesture) set({ gesture: snapshot() });
  },

  /** Show the gesture's state so far, computed from where the gesture began. */
  preview(fn: (start: Doc) => Doc, selection?: string[]) {
    const { gesture } = get();
    if (!gesture) return;
    set({ doc: fn(gesture.doc), ...(selection ? { selection } : null) });
  },

  /** Like `preview`, but builds on the latest state rather than the gesture's start. */
  previewIncremental(fn: (doc: Doc) => Doc) {
    const { gesture, doc } = get();
    if (!gesture || !doc) return;
    set({ doc: fn(doc) });
  },

  commit(label: string, selection?: string[]) {
    const { gesture } = get();
    if (!gesture) return;
    if (selection) set({ selection });
    set({ gesture: null });
    push(label, gesture);
  },

  cancel() {
    const { gesture } = get();
    if (gesture) restore(gesture);
  },

  undo() {
    editor.endEditing();
    if (get().gesture) editor.commit('Edit');
    const entry = get().past.at(-1);
    if (!entry) return;
    restore(entry.before);
    set((st) => ({ past: st.past.slice(0, -1), future: [entry, ...st.future] }));
  },

  redo() {
    const entry = get().future[0];
    if (!entry) return;
    restore(entry.after);
    set((st) => ({ past: [...st.past, entry], future: st.future.slice(1) }));
  },

  /**
   * Replace the document without making an undo step, for changes that come from the
   * service rather than the person. History is rebased so that undo never resurrects
   * the stale copy of `slideId`.
   */
  replaceSlideFromService(slideId: string, fn: (doc: Doc) => Doc) {
    const s = get();
    if (!s.doc) return;
    const rebase = (snap: Snapshot): Snapshot => ({ ...snap, doc: fn(snap.doc) });
    set({
      doc: fn(s.doc),
      past: s.past.map((e) => ({ ...e, before: rebase(e.before), after: rebase(e.after) })),
      future: s.future.map((e) => ({ ...e, before: rebase(e.before), after: rebase(e.after) })),
      selection: slideId === s.currentSlideId ? [] : s.selection,
      editingId: slideId === s.currentSlideId ? null : s.editingId,
    });
  },

  setCurrentSlide(slideId: string) {
    const s = get();
    if (s.currentSlideId === slideId || !s.doc?.slides[slideId]) return;
    editor.endEditing();
    if (get().gesture) editor.commit('Edit');
    set({ currentSlideId: slideId, selection: [], editingId: null });
  },

  select(ids: string[]) {
    set({ selection: ids });
  },

  setTool(tool: Tool) {
    editor.endEditing();
    set({ tool });
  },

  /**
   * Start typing into a text box. Everything typed until `endEditing` is one step; if the
   * box was just made, making it is part of the same step.
   */
  startEditing(id: string) {
    editor.begin();
    set({ editingId: id, selection: [id], tool: 'select' });
  },

  /** Stop typing. A text box left empty disappears. */
  endEditing() {
    const s = get();
    const id = s.editingId;
    if (!id || !s.doc) return;
    set({ editingId: null });
    const el = findElement(s.doc.slides[s.currentSlideId]?.elements ?? [], id);
    const empty = el?.kind !== 'text' || el.text.content.trim() === '';
    if (!empty) {
      editor.commit('Typing', [id]);
      return;
    }
    const existedBefore = s.gesture && findElement(s.gesture.doc.slides[s.currentSlideId]?.elements ?? [], id);
    if (!existedBefore) {
      // Made and abandoned in one go: as if it never happened.
      if (s.gesture) restore({ ...s.gesture, selection: [] });
      return;
    }
    editor.previewIncremental((doc) => updateElements(doc, s.currentSlideId, (els) => removeElements(els, new Set([id]))));
    editor.commit('Delete', []);
  },

  setPresenting(presenting: boolean) {
    editor.endEditing();
    set({ presenting });
  },
};

// Convenience selectors.
export const selectCurrentSlide = (s: EditorState) => s.doc?.slides[s.currentSlideId] ?? null;
export const selectCanUndo = (s: EditorState) => s.past.length > 0;
export const selectCanRedo = (s: EditorState) => s.future.length > 0;
