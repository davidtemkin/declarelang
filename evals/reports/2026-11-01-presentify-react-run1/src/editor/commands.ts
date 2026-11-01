/**
 * Everything the person can do to a presentation, as one function each. Menus, buttons,
 * shortcuts and the context menu all call these, so every route to an action behaves the same.
 */
import {
  boundsOf,
  cloneWithNewIds,
  findElement,
  leaves,
  mapLeaves,
  newId,
  outermost,
  parentOf,
  removeElements,
  transformInto,
  translate,
  updateChildren,
  unionRects,
} from '../model/elements';
import { snugTextHeight } from '../model/text';
import type { Color, LeafElement, Rect, SlideElement } from '../model/types';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types';
import { type Doc, insertSlide, moveSlide, newLocalSlideId, removeSlide, updateElements } from './doc';
import { editor, useEditor } from './store';

const PASTE_OFFSET = 20;

function state() {
  return useEditor.getState();
}

function currentElements(): SlideElement[] {
  const s = state();
  return s.doc?.slides[s.currentSlideId]?.elements ?? [];
}

/** The selected elements, outermost only, in stacking order. */
export function selectedElements(): SlideElement[] {
  const elements = currentElements();
  return outermost(elements, state().selection)
    .map((id) => findElement(elements, id))
    .filter((el): el is SlideElement => el !== null);
}

export function selectedLeaves(): LeafElement[] {
  return selectedElements().flatMap(leaves);
}

export function selectionBounds(): Rect | null {
  const els = selectedElements();
  return els.length ? unionRects(els.map(boundsOf)) : null;
}

/**
 * Show a change that is still being made (a colour being dragged in a picker) without
 * making an undo step yet. `finishEdit` makes the step.
 */
export function previewEdit(fn: (doc: Doc) => Doc) {
  editor.begin();
  editor.preview(fn);
}

export function finishEdit(label: string, fn: (doc: Doc) => Doc) {
  if (state().gesture) {
    editor.preview(fn);
    editor.commit(label);
  } else {
    editor.apply(label, fn);
  }
}

/** The change `fn` makes to every selected leaf on the current slide, as a document change. */
export function leafChange(fn: (leaf: LeafElement) => LeafElement): (doc: Doc) => Doc {
  const ids = new Set(state().selection);
  const slideId = state().currentSlideId;
  return (doc) => updateElements(doc, slideId, (els) => mapLeaves(els, ids, (leaf) => fitText(fn(leaf))));
}

export function backgroundChange(color: Color): (doc: Doc) => Doc {
  const slideId = state().currentSlideId;
  return (doc) => ({ ...doc, slides: { ...doc.slides, [slideId]: { ...doc.slides[slideId], background: color } } });
}

function editCurrent(label: string, fn: (elements: SlideElement[]) => SlideElement[], selection?: string[]) {
  const slideId = state().currentSlideId;
  editor.apply(label, (doc) => updateElements(doc, slideId, fn), selection);
}

// ---------------------------------------------------------------- availability

export function canGroup(): boolean {
  const elements = currentElements();
  const ids = outermost(elements, state().selection);
  if (ids.length < 2) return false;
  const parent = parentOf(elements, ids[0]);
  return ids.every((id) => parentOf(elements, id) === parent);
}

export function canUngroup(): boolean {
  return selectedElements().some((el) => el.kind === 'group');
}

// ---------------------------------------------------------------- selection

export function selectAll() {
  editor.select(currentElements().map((el) => el.id));
}

export function clearSelection() {
  editor.select([]);
}

// ---------------------------------------------------------------- delete, duplicate, clipboard

export function deleteSelection() {
  const ids = new Set(state().selection);
  if (!ids.size) return;
  editCurrent('Delete', (els) => removeElements(els, ids), []);
}

/** Copies of `elements`, offset, added in front of everything at the top level. Returns the new ids. */
function addCopies(label: string, elements: SlideElement[], offset: number) {
  const copies = elements.map((el) => translate(cloneWithNewIds(el), offset, offset));
  editCurrent(label, (els) => [...els, ...copies], copies.map((c) => c.id));
}

export function duplicateSelection() {
  const els = selectedElements();
  if (els.length) addCopies('Duplicate', els, PASTE_OFFSET);
}

const CLIPBOARD_KEY = 'presentify.clipboard';

interface ClipboardData {
  elements: SlideElement[];
  pasteCount: number;
}

export function copySelection() {
  const els = selectedElements();
  if (!els.length) return;
  const data: ClipboardData = { elements: els, pasteCount: 0 };
  localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event('presentify-clipboard'));
}

export function cutSelection() {
  copySelection();
  const ids = new Set(state().selection);
  if (ids.size) editCurrent('Cut', (els) => removeElements(els, ids), []);
}

function readClipboard(): ClipboardData | null {
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    return raw ? (JSON.parse(raw) as ClipboardData) : null;
  } catch {
    return null;
  }
}

export function hasClipboard(): boolean {
  return (readClipboard()?.elements.length ?? 0) > 0;
}

export function paste() {
  const data = readClipboard();
  if (!data?.elements.length) return;
  data.pasteCount += 1;
  localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
  addCopies('Paste', data.elements, PASTE_OFFSET * data.pasteCount);
}

// ---------------------------------------------------------------- moving

export function nudge(dx: number, dy: number) {
  const ids = new Set(outermost(currentElements(), state().selection));
  if (!ids.size) return;
  editCurrent('Move', (els) => mapTopmost(els, ids, (el) => translate(el, dx, dy)));
}

/** Apply `fn` to each element whose id is in `ids`, wherever it is in the tree. */
export function mapTopmost(
  elements: SlideElement[],
  ids: ReadonlySet<string>,
  fn: (el: SlideElement) => SlideElement,
): SlideElement[] {
  return elements.map((el) => {
    if (ids.has(el.id)) return fn(el);
    if (el.kind === 'group') return { ...el, children: mapTopmost(el.children, ids, fn) };
    return el;
  });
}

/** Move and resize the selection to exactly `to`. */
export function setSelectionBounds(to: Rect, label = 'Resize') {
  const from = selectionBounds();
  if (!from) return;
  const ids = new Set(outermost(currentElements(), state().selection));
  editCurrent(label, (els) => mapTopmost(els, ids, (el) => fitText(transformInto(el, from, to))));
}

/** Text boxes are as tall as their text: after any change to one, its height follows. */
export function fitText<T extends SlideElement>(el: T): T {
  if (el.kind === 'group') return { ...el, children: el.children.map(fitText) };
  if (el.kind !== 'text') return el;
  return snugTextHeight(el) as T;
}

// ---------------------------------------------------------------- groups

export function group() {
  if (!canGroup()) return;
  const elements = currentElements();
  const ids = outermost(elements, state().selection);
  const parent = parentOf(elements, ids[0]);
  const chosen = new Set(ids);
  const groupId = newId();
  editCurrent(
    'Group',
    (els) =>
      updateChildren(els, parent, (children) => {
        const members = children.filter((c) => chosen.has(c.id));
        const at = Math.max(...children.map((c, i) => (chosen.has(c.id) ? i : -1)));
        const out: SlideElement[] = [];
        children.forEach((c, i) => {
          if (i === at) out.push({ id: groupId, kind: 'group', children: members });
          else if (!chosen.has(c.id)) out.push(c);
        });
        return out;
      }),
    [groupId],
  );
}

export function ungroup() {
  const groups = selectedElements().filter((el) => el.kind === 'group');
  if (!groups.length) return;
  const elements = currentElements();
  const groupIds = new Set(groups.map((g) => g.id));
  const keep = state().selection.filter((id) => !groupIds.has(id));
  const freed = groups.flatMap((g) => (g.kind === 'group' ? g.children.map((c) => c.id) : []));
  let next = elements;
  for (const g of groups) {
    const parent = parentOf(next, g.id);
    next = updateChildren(next, parent, (children) =>
      children.flatMap((c) => (c.id === g.id && c.kind === 'group' ? c.children : [c])),
    );
  }
  editCurrent('Ungroup', () => next, [...keep, ...freed]);
}

// ---------------------------------------------------------------- order

export type OrderChange = 'forward' | 'backward' | 'front' | 'back';

function reorder(children: SlideElement[], chosen: ReadonlySet<string>, change: OrderChange): SlideElement[] {
  const picked = children.filter((c) => chosen.has(c.id));
  const rest = children.filter((c) => !chosen.has(c.id));
  if (change === 'front') return [...rest, ...picked];
  if (change === 'back') return [...picked, ...rest];
  const out = [...children];
  if (change === 'forward') {
    for (let i = out.length - 2; i >= 0; i--) {
      if (chosen.has(out[i].id) && !chosen.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (chosen.has(out[i].id) && !chosen.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
    }
  }
  return out;
}

const ORDER_LABELS: Record<OrderChange, string> = {
  forward: 'Bring Forward',
  backward: 'Send Backward',
  front: 'Bring to Front',
  back: 'Send to Back',
};

export function changeOrder(change: OrderChange) {
  const elements = currentElements();
  const ids = outermost(elements, state().selection);
  if (!ids.length) return;
  const parents = new Set(ids.map((id) => parentOf(elements, id)));
  const chosen = new Set(ids);
  editCurrent(ORDER_LABELS[change], (els) => {
    let next = els;
    for (const parent of parents) next = updateChildren(next, parent, (c) => reorder(c, chosen, change));
    return next;
  });
}

// ---------------------------------------------------------------- align and distribute

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Align two or more things to each other, or a single thing to the slide. */
export function align(alignment: Alignment) {
  const els = selectedElements();
  if (!els.length) return;
  const box = els.length === 1 ? { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT } : unionRects(els.map(boundsOf));
  const moves = new Map<string, [number, number]>();
  for (const el of els) {
    const b = boundsOf(el);
    const dx =
      alignment === 'left' ? box.x - b.x
      : alignment === 'center' ? box.x + box.width / 2 - (b.x + b.width / 2)
      : alignment === 'right' ? box.x + box.width - (b.x + b.width)
      : 0;
    const dy =
      alignment === 'top' ? box.y - b.y
      : alignment === 'middle' ? box.y + box.height / 2 - (b.y + b.height / 2)
      : alignment === 'bottom' ? box.y + box.height - (b.y + b.height)
      : 0;
    moves.set(el.id, [dx, dy]);
  }
  editCurrent('Align', (all) => mapTopmost(all, new Set(moves.keys()), (el) => translate(el, ...moves.get(el.id)!)));
}

/** Space three or more things so the gaps between them are equal. */
export function distribute(axis: 'horizontal' | 'vertical') {
  const els = selectedElements();
  if (els.length < 3) return;
  const h = axis === 'horizontal';
  const items = els
    .map((el) => ({ el, b: boundsOf(el) }))
    .sort((a, b) => (h ? a.b.x + a.b.width / 2 - (b.b.x + b.b.width / 2) : a.b.y + a.b.height / 2 - (b.b.y + b.b.height / 2)));
  const start = h ? items[0].b.x : items[0].b.y;
  const last = items[items.length - 1].b;
  const end = h ? last.x + last.width : last.y + last.height;
  const total = items.reduce((sum, i) => sum + (h ? i.b.width : i.b.height), 0);
  const gap = (end - start - total) / (items.length - 1);
  const moves = new Map<string, number>();
  let cursor = start;
  for (const { el, b } of items) {
    moves.set(el.id, cursor - (h ? b.x : b.y));
    cursor += (h ? b.width : b.height) + gap;
  }
  editCurrent('Distribute', (all) =>
    mapTopmost(all, new Set(moves.keys()), (el) =>
      h ? translate(el, moves.get(el.id)!, 0) : translate(el, 0, moves.get(el.id)!),
    ),
  );
}

// ---------------------------------------------------------------- slides

export function addSlide() {
  const { doc, currentSlideId } = state();
  if (!doc) return;
  const slide = { id: newLocalSlideId(), background: '#FFFFFF', elements: [] };
  editor.apply('New Slide', (d) => insertSlide(d, slide, currentSlideId), [], slide.id);
}

export function duplicateSlide(slideId = state().currentSlideId) {
  const { doc } = state();
  const source = doc?.slides[slideId];
  if (!source) return;
  // Element ids only need to be unique within a slide, so the copy can keep them.
  const slide = { id: newLocalSlideId(), background: source.background, elements: source.elements };
  editor.apply('Duplicate Slide', (d) => insertSlide(d, slide, slideId), [], slide.id);
}

export function deleteSlide(slideId = state().currentSlideId) {
  const { doc, currentSlideId } = state();
  if (!doc || doc.order.length <= 1 || !doc.slides[slideId]) return;
  const index = doc.order.indexOf(slideId);
  const next = slideId === currentSlideId ? doc.order[index + 1] ?? doc.order[index - 1] : currentSlideId;
  editor.apply('Delete Slide', (d) => removeSlide(d, slideId), [], next);
}

export function moveSlideTo(slideId: string, toIndex: number) {
  const { doc } = state();
  if (!doc) return;
  const from = doc.order.indexOf(slideId);
  if (from === toIndex) return;
  editor.apply('Move Slide', (d) => moveSlide(d, slideId, toIndex), undefined, slideId);
}

export function goToSlide(offset: number) {
  const { doc, currentSlideId } = state();
  if (!doc) return;
  const index = doc.order.indexOf(currentSlideId) + offset;
  if (index >= 0 && index < doc.order.length) editor.setCurrentSlide(doc.order[index]);
}

export function renameDeck(title: string) {
  const trimmed = title.trim() || 'Untitled presentation';
  if (trimmed === state().doc?.title) return;
  editor.apply('Rename', (doc: Doc) => ({ ...doc, title: trimmed }));
}

// ---------------------------------------------------------------- presenting

/**
 * Present from the current slide (or the first). Full screen is asked for here, in the
 * click or key press itself, because browsers only grant it in direct response to one.
 */
export function present({ fromStart = false } = {}) {
  const { doc } = state();
  if (!doc) return;
  if (fromStart) editor.setCurrentSlide(doc.order[0]);
  document.documentElement.requestFullscreen?.().catch(() => {
    // Refused: presenting fills the window instead.
  });
  editor.setPresenting(true);
}
