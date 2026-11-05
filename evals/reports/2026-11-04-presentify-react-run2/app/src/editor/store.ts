import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Color, GroupElement, Slide, SlideContent, SlideElement, TextElement } from '../api/types'
import { align, distribute, group, reorder, shareParent, ungroup, type AlignMode, type DistributeAxis, type OrderMove } from '../model/arrange'
import {
  allIds,
  cloneWithFreshIds,
  findElement,
  findPath,
  makeId,
  refitText,
  removeByIds,
  translate,
  updateById,
  updateLeaves,
  updateMany,
} from '../model/elements'
import type { Tool } from '../model/defaults'
import { nextPasteStep, parseClipboardText, readClipboard, writeClipboard } from './clipboard'
import { docsEqual, insertSlide, newSlideKey, removeSlide, withElements, withSlide, type DocState } from './doc'

export type SaveState = 'saved' | 'saving' | 'offline'

type Leaf = Exclude<SlideElement, GroupElement>

/** Everything undo puts back: the presentation, and where the person was in it. */
interface Snapshot {
  doc: DocState
  currentSlide: string
  selection: string[]
  scope: string | null
}

export interface EditorState {
  deckId: string
  title: string
  doc: DocState
  /** The key of the slide shown large. */
  currentSlide: string
  /** Selected elements on the current slide. They always share one parent: the slide, or `scope`. */
  selection: string[]
  /** The group a double-click has opened, whose parts can be selected one by one; null for the slide itself. */
  scope: string | null
  tool: Tool
  editingTextId: string | null
  past: Snapshot[]
  future: Snapshot[]
  saveState: SaveState
  /** Slides changed somewhere else since they were opened here, with the copy the service holds now. */
  conflicts: Record<string, Slide>
  presenting: boolean
  actions: EditorActions
}

export interface EditorActions {
  /* history */
  undo(): void
  redo(): void
  /** Starts one undo step that may span many changes (a drag, a run of typing). */
  begin(): void
  /** Applies a change within the current step without making a new one. */
  preview(change: (doc: DocState, state: EditorState) => DocState): void
  commit(): void
  cancel(): void

  /* selection and tools */
  setTool(tool: Tool): void
  select(ids: string[], scope?: string | null): void
  selectAll(): void
  clearSelection(): void

  /* elements on the current slide */
  updateElements(change: (elements: SlideElement[]) => SlideElement[], options?: { coalesce?: string; select?: string[] }): void
  styleSelection(change: (leaf: Leaf) => Leaf, coalesce?: string): void
  addElement(el: SlideElement): void
  deleteSelection(): void
  duplicateSelection(): void
  nudge(dx: number, dy: number, repeat: boolean): void
  copy(): string | null
  cut(): string | null
  paste(text?: string): boolean
  groupSelection(): void
  ungroupSelection(): void
  alignSelection(mode: AlignMode): void
  distributeSelection(axis: DistributeAxis): void
  reorderSelection(move: OrderMove): void
  setBackground(color: Color, coalesce?: string): void

  /* text */
  beginTextEditing(id: string): void
  setTextContent(content: string): void
  endTextEditing(): void

  /* slides */
  goToSlide(key: string): void
  addSlide(): void
  duplicateSlide(key: string): void
  deleteSlide(key: string): void
  moveSlide(key: string, toIndex: number): void

  /* the deck */
  rename(title: string): void
  setPresenting(on: boolean): void

  /* the sync engine's side */
  setSaveState(state: SaveState): void
  setConflict(key: string, current: Slide | null): void
  /** Replaces a slide with the copy saved elsewhere, as an undoable step. */
  takeTheirs(key: string): void
  /** Applies a change from elsewhere to the document and to every step of history alike. */
  rebase(change: (doc: DocState) => DocState): void
}

const HISTORY_LIMIT = 300
const COALESCE_WINDOW_MS = 1200
/** How far a duplicate or a paste lands from its original. */
export const COPY_OFFSET = 16

export interface InitialEditor {
  deckId: string
  title: string
  doc: DocState
}

export function createEditorStore(initial: InitialEditor): StoreApi<EditorState> {
  /** The state before the step now in progress, while one is (a drag, a typing run). */
  let pending: Snapshot | null = null
  /** The last coalescing change, so a quick run of like changes (one colour dragged) is one step. */
  let lastCoalesce: { key: string; at: number } | null = null

  return createStore<EditorState>()((set, get) => {
    const snapshot = (s: EditorState = get()): Snapshot => ({
      doc: s.doc,
      currentSlide: s.currentSlide,
      selection: s.selection,
      scope: s.scope,
    })

    const record = (before: Snapshot, coalesce?: string) => {
      const now = Date.now()
      if (coalesce && lastCoalesce?.key === coalesce && now - lastCoalesce.at < COALESCE_WINDOW_MS) {
        lastCoalesce.at = now
        set({ future: [] })
        return
      }
      lastCoalesce = coalesce ? { key: coalesce, at: now } : null
      set((s) => ({ past: [...s.past, before].slice(-HISTORY_LIMIT), future: [] }))
    }

    /** Makes one change to the document as one step (or as part of the step in progress). */
    const change = (patch: Partial<Snapshot> & { doc: DocState }, coalesce?: string) => {
      const s = get()
      if (patch.doc === s.doc) {
        if (patch.selection || patch.scope !== undefined) set(patch)
        return
      }
      if (pending) {
        set(patch)
        return
      }
      const before = snapshot(s)
      set(patch)
      record(before, coalesce)
    }

    const elementsOf = (s: EditorState) => s.doc.slides[s.currentSlide]?.elements ?? []

    /** Re-lays-out every text box among `ids` whose text or style may have changed. */
    const refitTexts = (beforeEls: SlideElement[], afterEls: SlideElement[]) => {
      let out = afterEls
      const visit = (els: SlideElement[]) => {
        for (const el of els) {
          if (el.kind === 'group') visit(el.children)
          else if (el.kind === 'text') {
            const before = findElement(beforeEls, el.id)
            if (before && before.kind === 'text' && before.text !== el.text) {
              const refit = refitText(before, el)
              if (refit !== el) out = updateById(out, el.id, () => refit)
            }
          }
        }
      }
      visit(afterEls)
      return out
    }

    const endEditingIfAny = () => {
      if (get().editingTextId) actions.endTextEditing()
    }

    const actions: EditorActions = {
      undo() {
        endEditingIfAny()
        actions.commit()
        const s = get()
        const previous = s.past[s.past.length - 1]
        if (!previous) return
        lastCoalesce = null
        set({
          ...previous,
          currentSlide: previous.doc.slides[previous.currentSlide] ? previous.currentSlide : previous.doc.order[0],
          past: s.past.slice(0, -1),
          future: [snapshot(s), ...s.future],
          editingTextId: null,
        })
      },

      redo() {
        endEditingIfAny()
        actions.commit()
        const s = get()
        const next = s.future[0]
        if (!next) return
        lastCoalesce = null
        set({
          ...next,
          currentSlide: next.doc.slides[next.currentSlide] ? next.currentSlide : next.doc.order[0],
          past: [...s.past, snapshot(s)],
          future: s.future.slice(1),
          editingTextId: null,
        })
      },

      begin() {
        if (!pending) {
          pending = snapshot()
          lastCoalesce = null
        }
      },

      preview(changeDoc) {
        const s = get()
        const doc = changeDoc(s.doc, s)
        if (doc !== s.doc) set({ doc })
      },

      commit() {
        if (!pending) return
        const before = pending
        pending = null
        const s = get()
        if (docsEqual(s.doc, before.doc)) {
          // Nothing really changed (a click without a drag, a text box made and left empty).
          if (s.doc !== before.doc) set({ doc: before.doc })
          return
        }
        record(before)
      },

      cancel() {
        if (!pending) return
        const before = pending
        pending = null
        set({ doc: before.doc, selection: before.selection, scope: before.scope })
      },

      setTool(tool) {
        endEditingIfAny()
        set({ tool })
      },

      select(ids, scope) {
        const s = get()
        const nextScope = scope === undefined ? s.scope : scope
        if (s.editingTextId && !ids.includes(s.editingTextId)) actions.endTextEditing()
        set({ selection: ids, scope: nextScope })
      },

      selectAll() {
        endEditingIfAny()
        const s = get()
        const els = s.scope ? ((findElement(elementsOf(s), s.scope) as GroupElement | null)?.children ?? []) : elementsOf(s)
        set({ selection: els.map((e) => e.id) })
      },

      clearSelection() {
        endEditingIfAny()
        set({ selection: [], scope: null })
      },

      updateElements(changeEls, options = {}) {
        // A change from the inspector while typing is its own step: close the typing run first, then start another.
        const typing = !!get().editingTextId
        if (typing) actions.commit()
        const s = get()
        const before = elementsOf(s)
        const after = refitTexts(before, changeEls(before))
        change(
          { doc: withElements(s.doc, s.currentSlide, () => after), ...(options.select ? { selection: options.select } : {}) },
          options.coalesce,
        )
        if (typing) actions.begin()
      },

      styleSelection(changeLeaf, coalesce) {
        const s = get()
        if (s.selection.length === 0) return
        actions.updateElements((els) => updateMany(els, s.selection, (el) => updateLeaves(el, changeLeaf)), {
          coalesce: coalesce ? `${coalesce}:${s.selection.join(',')}` : undefined,
        })
      },

      addElement(el) {
        const s = get()
        change({
          doc: withElements(s.doc, s.currentSlide, (els) => [...els, el]),
          selection: [el.id],
          scope: null,
        })
      },

      deleteSelection() {
        endEditingIfAny()
        const s = get()
        if (s.selection.length === 0) return
        const ids = new Set(s.selection)
        change({ doc: withElements(s.doc, s.currentSlide, (els) => removeByIds(els, ids)), selection: [], scope: null })
      },

      duplicateSelection() {
        endEditingIfAny()
        const s = get()
        const els = elementsOf(s)
        const chosen = s.selection.map((id) => findElement(els, id)).filter((e): e is SlideElement => e !== null)
        if (chosen.length === 0) return
        const taken = allIds(els)
        const copies = chosen.map((el) => translate(cloneWithFreshIds(el, taken), COPY_OFFSET, COPY_OFFSET))
        change({
          doc: withElements(s.doc, s.currentSlide, (list) => insertAbove(list, s.selection, copies)),
          selection: copies.map((c) => c.id),
        })
      },

      nudge(dx, dy, repeat) {
        const s = get()
        if (s.selection.length === 0) return
        actions.updateElements((els) => updateMany(els, s.selection, (el) => translate(el, dx, dy)), {
          coalesce: repeat ? `nudge:${s.selection.join(',')}` : undefined,
        })
        if (!repeat) lastCoalesce = { key: `nudge:${s.selection.join(',')}`, at: Date.now() }
      },

      copy() {
        const s = get()
        const els = elementsOf(s)
        const chosen = s.selection.map((id) => findElement(els, id)).filter((e): e is SlideElement => e !== null)
        if (chosen.length === 0) return null
        // Keep the slide's stacking order, whatever order things were selected in.
        const order = [...allIds(els)]
        chosen.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
        return writeClipboard(chosen)
      },

      cut() {
        const text = actions.copy()
        if (text) actions.deleteSelection()
        return text
      },

      paste(text) {
        endEditingIfAny()
        const payload = text ? parseClipboardText(text) : readClipboard()
        if (!payload || payload.elements.length === 0) return false
        const step = nextPasteStep(payload)
        const s = get()
        const taken = allIds(elementsOf(s))
        const copies = payload.elements.map((el) => translate(cloneWithFreshIds(el, taken), COPY_OFFSET * step, COPY_OFFSET * step))
        change({
          doc: withElements(s.doc, s.currentSlide, (els) => [...els, ...copies]),
          selection: copies.map((c) => c.id),
          scope: null,
        })
        return true
      },

      groupSelection() {
        endEditingIfAny()
        const s = get()
        const els = elementsOf(s)
        if (s.selection.length < 2 || !shareParent(els, s.selection)) return
        const id = makeId(allIds(els))
        change({ doc: withElements(s.doc, s.currentSlide, (list) => group(list, s.selection, id)), selection: [id] })
      },

      ungroupSelection() {
        endEditingIfAny()
        const s = get()
        const els = elementsOf(s)
        const groups = s.selection.filter((id) => findElement(els, id)?.kind === 'group')
        if (groups.length === 0) return
        const result = ungroup(els, groups)
        const kept = s.selection.filter((id) => !groups.includes(id))
        change({ doc: withElements(s.doc, s.currentSlide, () => result.elements), selection: [...kept, ...result.parts] })
      },

      alignSelection(mode) {
        const s = get()
        if (s.selection.length === 0) return
        actions.updateElements((els) => align(els, s.selection, mode))
      },

      distributeSelection(axis) {
        const s = get()
        if (s.selection.length < 3) return
        actions.updateElements((els) => distribute(els, s.selection, axis))
      },

      reorderSelection(move) {
        const s = get()
        if (s.selection.length === 0) return
        actions.updateElements((els) => reorder(els, s.selection, move))
      },

      setBackground(color, coalesce) {
        const s = get()
        change(
          { doc: withSlide(s.doc, s.currentSlide, (c) => (c.background === color ? c : { ...c, background: color })) },
          coalesce ? `background:${s.currentSlide}:${coalesce}` : undefined,
        )
      },

      beginTextEditing(id) {
        const s = get()
        const el = findElement(elementsOf(s), id)
        if (!el || el.kind !== 'text') return
        actions.begin()
        const path = findPath(elementsOf(s), id)!
        const scope = path.length > 1 ? path[path.length - 2].id : null
        set({ editingTextId: id, selection: [id], scope, tool: 'select' })
      },

      setTextContent(content) {
        const s = get()
        const id = s.editingTextId
        if (!id) return
        actions.preview((doc) =>
          withElements(doc, s.currentSlide, (els) =>
            updateById(els, id, (el) => {
              if (el.kind !== 'text' || el.text.content === content) return el
              return refitText(el, { ...el, text: { ...el.text, content } } as TextElement)
            }),
          ),
        )
      },

      endTextEditing() {
        const s = get()
        const id = s.editingTextId
        if (!id) return
        const el = findElement(elementsOf(s), id)
        set({ editingTextId: null })
        if (el && el.kind === 'text' && el.text.content.trim() === '') {
          // A text box left empty goes away; if it was only just made, so does its step.
          actions.preview((doc) => withElements(doc, s.currentSlide, (els) => removeByIds(els, new Set([id]))))
          set({ selection: [] })
        }
        actions.commit()
      },

      goToSlide(key) {
        const s = get()
        if (!s.doc.slides[key] || key === s.currentSlide) return
        endEditingIfAny()
        set({ currentSlide: key, selection: [], scope: null })
      },

      addSlide() {
        endEditingIfAny()
        const s = get()
        const key = newSlideKey()
        change({
          doc: insertSlide(s.doc, key, { background: '#FFFFFF', elements: [] }, s.currentSlide),
          currentSlide: key,
          selection: [],
          scope: null,
        })
      },

      duplicateSlide(key) {
        endEditingIfAny()
        const s = get()
        const source = s.doc.slides[key]
        if (!source) return
        const copy = newSlideKey()
        change({
          doc: insertSlide(s.doc, copy, structuredClone(source), key),
          currentSlide: copy,
          selection: [],
          scope: null,
        })
      },

      deleteSlide(key) {
        endEditingIfAny()
        const s = get()
        if (s.doc.order.length <= 1 || !s.doc.slides[key]) return
        const index = s.doc.order.indexOf(key)
        const doc = removeSlide(s.doc, key)
        const currentSlide = key === s.currentSlide ? doc.order[Math.min(index, doc.order.length - 1)] : s.currentSlide
        change({ doc, currentSlide, selection: key === s.currentSlide ? [] : s.selection, scope: key === s.currentSlide ? null : s.scope })
      },

      moveSlide(key, toIndex) {
        const s = get()
        const from = s.doc.order.indexOf(key)
        if (from < 0 || from === toIndex) return
        const order = [...s.doc.order]
        order.splice(from, 1)
        order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, key)
        change({ doc: { ...s.doc, order }, currentSlide: key })
      },

      rename(title) {
        set({ title })
      },

      setPresenting(on) {
        endEditingIfAny()
        set({ presenting: on })
      },

      setSaveState(saveState) {
        if (get().saveState !== saveState) set({ saveState })
      },

      setConflict(key, current) {
        const conflicts = { ...get().conflicts }
        if (current) conflicts[key] = current
        else delete conflicts[key]
        set({ conflicts })
      },

      takeTheirs(key) {
        const s = get()
        const theirs = s.conflicts[key]
        if (!theirs) return
        if (s.editingTextId) actions.endTextEditing()
        const content: SlideContent = { background: theirs.background, elements: theirs.elements }
        const after = get()
        change({
          doc: withSlide(after.doc, key, () => content),
          selection: key === after.currentSlide ? [] : after.selection,
          scope: key === after.currentSlide ? null : after.scope,
        })
      },

      rebase(changeDoc) {
        const s = get()
        const fix = (snap: Snapshot): Snapshot => {
          const doc = changeDoc(snap.doc)
          return { ...snap, doc, currentSlide: doc.slides[snap.currentSlide] ? snap.currentSlide : doc.order[0] }
        }
        if (pending) pending = fix(pending)
        const doc = changeDoc(s.doc)
        const currentSlide = doc.slides[s.currentSlide] ? s.currentSlide : doc.order[0]
        set({
          doc,
          currentSlide,
          selection: currentSlide === s.currentSlide ? s.selection : [],
          past: s.past.map(fix),
          future: s.future.map(fix),
        })
      },
    }

    return {
      deckId: initial.deckId,
      title: initial.title,
      doc: initial.doc,
      currentSlide: initial.doc.order[0],
      selection: [],
      scope: null,
      tool: 'select',
      editingTextId: null,
      past: [],
      future: [],
      saveState: 'saved',
      conflicts: {},
      presenting: false,
      actions,
    }
  })
}

/** Puts `copies` directly above the topmost of `ids`, in the list that holds them. */
function insertAbove(elements: SlideElement[], ids: string[], copies: SlideElement[]): SlideElement[] {
  const top = elements.findIndex((el) => ids.includes(el.id))
  if (top >= 0) {
    const last = Math.max(...ids.map((id) => elements.findIndex((el) => el.id === id)))
    return [...elements.slice(0, last + 1), ...copies, ...elements.slice(last + 1)]
  }
  return elements.map((el) =>
    el.kind === 'group' && findPath(el.children, ids[0]) ? { ...el, children: insertAbove(el.children, ids, copies) } : el,
  )
}


export const EditorStoreContext = createContext<StoreApi<EditorState> | null>(null)

export function useEditorStore(): StoreApi<EditorState> {
  const store = useContext(EditorStoreContext)
  if (!store) throw new Error('useEditorStore must be used inside an open presentation')
  return store
}

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStore(), selector)
}

export const useEditorActions = () => useEditor((s) => s.actions)

/** The elements on the slide being edited. */
export const currentElements = (s: EditorState): SlideElement[] => s.doc.slides[s.currentSlide]?.elements ?? []
