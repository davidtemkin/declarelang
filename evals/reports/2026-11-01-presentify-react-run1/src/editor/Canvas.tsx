/**
 * The slide being edited, shown large, and everything the pointer does to it: drawing,
 * selecting, moving, resizing, rounding corners, and typing in place.
 *
 * Drawing happens in two layers. The slide itself is a `SlideView` in slide points; the
 * selection, handles, guides and marquee sit on top in screen pixels, so handles are the
 * same comfortable size at any zoom.
 */
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SlideView } from '../components/SlideView';
import {
  boundsOf,
  findElement,
  hitTest,
  leaves,
  locksProportions,
  normalizeRect,
  outermost,
  pathTo,
  rectsIntersect,
  round,
  transformInto,
  translate,
  unionRects,
} from '../model/elements';
import type { LineElement, Rect, RectElement, SlideElement } from '../model/types';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types';
import { fitText, mapTopmost } from './commands';
import { CanvasContextMenu } from './CanvasContextMenu';
import { DEFAULT_TEXT_WIDTH, makeEllipse, makeLine, makeRect, makeText } from './defaults';
import { updateElements } from './doc';
import { type Handle, resizeBox } from './resize';
import { SelectionOverlay } from './SelectionOverlay';
import { type Guides, NO_GUIDES, snapBox, snapPoint, snapTargets, type SnapTargets } from './snapping';
import { editor, selectCurrentSlide, type Tool, useEditor } from './store';
import { TextEditor } from './TextEditor';

/** Pointer travel, in screen pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
/** How close, in screen pixels, something must come to snap. */
const SNAP_DISTANCE = 6;
/** Space kept around the slide, in screen pixels. */
const MARGIN = 48;

interface Point {
  x: number;
  y: number;
}

type Drag =
  | { type: 'press'; start: Point; client: Point; target: string; wasSelected: boolean; additive: boolean }
  | { type: 'move'; start: Point; ids: Set<string>; box: Rect; targets: SnapTargets }
  | { type: 'resize'; handle: Handle; ids: Set<string>; box: Rect; lock: boolean; targets: SnapTargets; onlyText: boolean }
  | { type: 'line-end'; id: string; end: 1 | 2; targets: SnapTargets }
  | { type: 'radius'; id: string; start: Point; r0: number }
  | { type: 'marquee'; start: Point; base: string[] }
  | { type: 'draw'; tool: Exclude<Tool, 'select'>; start: Point; client: Point; id: string | null; targets: SnapTargets };

export interface Readout {
  x: number;
  y: number;
  text: string;
}

export function Canvas() {
  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 0, left: 0, top: 0 });
  const slide = useEditor(selectCurrentSlide);
  const slideId = useEditor((s) => s.currentSlideId);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const editingId = useEditor((s) => s.editingId);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [dragging, setDragging] = useState<Drag['type'] | null>(null);
  const drag = useRef<Drag | null>(null);

  // Fit the slide to the space, keeping 16:9.
  useLayoutEffect(() => {
    const area = areaRef.current!;
    const fit = () => {
      const { width, height } = area.getBoundingClientRect();
      const scale = Math.max(0.05, Math.min((width - MARGIN * 2) / SLIDE_WIDTH, (height - MARGIN * 2) / SLIDE_HEIGHT));
      setView({ scale, left: Math.round((width - SLIDE_WIDTH * scale) / 2), top: Math.round((height - SLIDE_HEIGHT * scale) / 2) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const { scale } = view;

  const toSlide = useCallback(
    (clientX: number, clientY: number): Point => {
      const r = stageRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
    },
    [scale],
  );

  const elements = slide?.elements ?? [];

  /** Which element a click on `path` should pick, given what is selected now. */
  const pickTarget = (path: string[]): string => {
    const { selection: sel } = useEditor.getState();
    // Something selected under the pointer stays the target, so it can be dragged.
    for (let i = path.length - 1; i >= 0; i--) if (sel.includes(path[i])) return path[i];
    // Inside a group already? Pick siblings at that depth.
    for (const id of sel) {
      const p = pathTo(elements, id);
      if (p && p.length > 1) {
        const parent = p[p.length - 2];
        const at = path.indexOf(parent);
        if (at >= 0 && at + 1 < path.length) return path[at + 1];
      }
    }
    return path[0];
  };

  const setDrag = (d: Drag | null) => {
    drag.current = d;
    setDragging(d?.type ?? null);
  };

  const showReadout = (clientX: number, clientY: number, text: string) => {
    const r = areaRef.current!.getBoundingClientRect();
    setReadout({ x: clientX - r.left + 14, y: clientY - r.top + 18, text });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!slide || scale === 0) return;
    if (e.button !== 0 && e.button !== 2) return;
    const targetEl = e.target as Element;
    if (targetEl.closest('.text-editor')) return;
    if (useEditor.getState().editingId) editor.endEditing();
    setHoverId(null);
    // Keys now belong to the slide, not to whatever had focus before (like the slide list).
    areaRef.current!.focus({ preventScroll: true });

    const p = toSlide(e.clientX, e.clientY);
    const tolerance = SNAP_DISTANCE / scale;
    const state = useEditor.getState();
    const current = state.doc!.slides[state.currentSlideId].elements;

    if (e.button === 2) {
      // A right-click picks what's under it, so the context menu acts on it.
      const path = hitTest(current, p.x, p.y, tolerance);
      if (!path) editor.select([]);
      else {
        const target = pickTarget(path);
        if (!state.selection.includes(target)) editor.select([target]);
      }
      return;
    }

    areaRef.current!.setPointerCapture(e.pointerId);
    const exclude = new Set(outermost(current, state.selection));

    if (state.tool !== 'select') {
      const start = e.shiftKey || e.metaKey ? p : snapPoint(p.x, p.y, snapTargets(current, new Set()), tolerance);
      setDrag({
        type: 'draw',
        tool: state.tool,
        start: { x: round(start.x), y: round(start.y) },
        client: { x: e.clientX, y: e.clientY },
        id: null,
        targets: snapTargets(current, new Set()),
      });
      return;
    }

    const handle = targetEl.closest<SVGElement>('[data-handle]')?.dataset.handle;
    if (handle) {
      e.preventDefault();
      editor.begin();
      if (handle === 'radius') {
        const rect = findElement(current, state.selection[0]) as RectElement;
        setDrag({ type: 'radius', id: rect.id, start: p, r0: Math.min(rect.cornerRadius, rect.width / 2, rect.height / 2) });
      } else if (handle === 'end1' || handle === 'end2') {
        const id = state.selection[0];
        setDrag({ type: 'line-end', id, end: handle === 'end1' ? 1 : 2, targets: snapTargets(current, new Set([id])) });
      } else {
        const ids = new Set(outermost(current, state.selection));
        const chosen = [...ids].map((id) => findElement(current, id)!).filter(Boolean);
        setDrag({
          type: 'resize',
          handle: handle as Handle,
          ids,
          box: unionRects(chosen.map(boundsOf)),
          lock: chosen.some(locksProportions),
          targets: snapTargets(current, exclude),
          onlyText: chosen.every((el) => leaves(el).every((l) => l.kind === 'text')),
        });
      }
      return;
    }

    const path = hitTest(current, p.x, p.y, tolerance);
    if (!path) {
      const base = e.shiftKey ? state.selection : [];
      if (!e.shiftKey) editor.select([]);
      setDrag({ type: 'marquee', start: p, base });
      return;
    }

    const target = pickTarget(path);
    const wasSelected = state.selection.includes(target);
    if (e.shiftKey) {
      editor.select(wasSelected ? state.selection.filter((id) => id !== target) : [...state.selection, target]);
    } else if (!wasSelected) {
      editor.select([target]);
    }
    setDrag({ type: 'press', start: p, client: { x: e.clientX, y: e.clientY }, target, wasSelected, additive: e.shiftKey });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!slide || scale === 0) return;
    const d = drag.current;
    const p = toSlide(e.clientX, e.clientY);
    const tolerance = SNAP_DISTANCE / scale;
    const snapping = !e.metaKey && !e.ctrlKey;

    if (!d) {
      if (useEditor.getState().tool === 'select') {
        const path = hitTest(elements, p.x, p.y, tolerance);
        setHoverId(path ? pickTarget(path) : null);
      }
      return;
    }

    switch (d.type) {
      case 'press': {
        if (Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < DRAG_THRESHOLD) return;
        const { selection: sel } = useEditor.getState();
        if (!sel.includes(d.target)) return; // shift-click that deselected: nothing to drag
        const ids = new Set(outermost(elements, sel));
        const chosen = [...ids].map((id) => findElement(elements, id)!).filter(Boolean);
        editor.begin();
        const next: Drag = { type: 'move', start: d.start, ids, box: unionRects(chosen.map(boundsOf)), targets: snapTargets(elements, ids) };
        setDrag(next);
        setHoverId(null);
        moveTo(next, p, e.shiftKey, snapping, tolerance);
        return;
      }
      case 'move':
        moveTo(d, p, e.shiftKey, snapping, tolerance);
        return;
      case 'resize': {
        const s = snapping ? snapPoint(p.x, p.y, d.targets, tolerance) : { ...p, guides: NO_GUIDES };
        // Shift flips whether proportions are kept, for this drag only.
        const lock = d.lock !== e.shiftKey;
        const box = resizeBox(d.box, d.handle, s.x, s.y, lock);
        const shown: Guides = {
          x: d.handle.includes('w') || d.handle.includes('e') ? s.guides.x : [],
          y: d.handle.includes('n') || d.handle.includes('s') ? s.guides.y : [],
        };
        setGuides(lock ? NO_GUIDES : shown);
        editor.preview((doc) =>
          updateElements(doc, slideId, (els) => mapTopmost(els, d.ids, (el) => fitText(transformInto(el, d.box, box)))),
        );
        showReadout(e.clientX, e.clientY, d.onlyText ? `${Math.round(box.width)} wide` : `${Math.round(box.width)} × ${Math.round(box.height)}`);
        return;
      }
      case 'line-end': {
        const line = findElement(useEditor.getState().gesture!.doc.slides[slideId].elements, d.id) as LineElement;
        const ox = d.end === 1 ? line.x2 : line.x1;
        const oy = d.end === 1 ? line.y2 : line.y1;
        let q = p;
        let g = NO_GUIDES;
        if (e.shiftKey) q = constrainAngle(ox, oy, p.x, p.y);
        else if (snapping) {
          const s = snapPoint(p.x, p.y, d.targets, tolerance);
          q = s;
          g = s.guides;
        }
        setGuides(g);
        const x = round(q.x);
        const y = round(q.y);
        editor.preview((doc) =>
          updateElements(doc, slideId, (els) =>
            mapTopmost(els, new Set([d.id]), (el) => (d.end === 1 ? { ...(el as LineElement), x1: x, y1: y } : { ...(el as LineElement), x2: x, y2: y })),
          ),
        );
        showReadout(e.clientX, e.clientY, `${Math.round(Math.hypot(x - ox, y - oy))} long`);
        return;
      }
      case 'radius': {
        const rect = findElement(useEditor.getState().gesture!.doc.slides[slideId].elements, d.id) as RectElement;
        const max = Math.min(rect.width, rect.height) / 2;
        // Dragging in along the diagonal rounds the corner; dragging out squares it.
        const r = Math.round(Math.max(0, Math.min(max, d.r0 + (p.x - d.start.x + (p.y - d.start.y)) / 2)));
        editor.preview((doc) =>
          updateElements(doc, slideId, (els) => mapTopmost(els, new Set([d.id]), (el) => ({ ...(el as RectElement), cornerRadius: r }))),
        );
        showReadout(e.clientX, e.clientY, r >= max ? 'Fully round' : `Radius ${r}`);
        return;
      }
      case 'marquee': {
        const box = normalizeRect(d.start.x, d.start.y, p.x, p.y);
        setMarquee(box);
        const touched = elements.filter((el) => rectsIntersect(box, boundsOf(el))).map((el) => el.id);
        editor.select([...new Set([...d.base, ...touched])]);
        return;
      }
      case 'draw':
        drawTo(d, e, p, snapping, tolerance);
        return;
    }
  };

  const moveTo = (d: Extract<Drag, { type: 'move' }>, p: Point, constrain: boolean, snapping: boolean, tolerance: number) => {
    let dx = p.x - d.start.x;
    let dy = p.y - d.start.y;
    if (constrain) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let g = NO_GUIDES;
    if (snapping) {
      const s = snapBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }, d.targets, tolerance);
      if (!constrain || dy === 0) dx += s.dx;
      if (!constrain || dx === 0) dy += s.dy;
      g = s.guides;
    }
    dx = round(dx);
    dy = round(dy);
    setGuides(g);
    editor.preview((doc) => updateElements(doc, slideId, (els) => mapTopmost(els, d.ids, (el) => translate(el, dx, dy))));
  };

  const drawTo = (d: Extract<Drag, { type: 'draw' }>, e: ReactPointerEvent, p: Point, snapping: boolean, tolerance: number) => {
    if (!d.id && Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < DRAG_THRESHOLD) return;
    const background = slide!.background;
    let q = p;
    let g = NO_GUIDES;
    if (d.tool === 'line' && e.shiftKey) q = constrainAngle(d.start.x, d.start.y, p.x, p.y);
    else if (snapping && !(e.shiftKey && d.tool !== 'text')) {
      const s = snapPoint(p.x, p.y, d.targets, tolerance);
      q = s;
      g = s.guides;
    }
    setGuides(g);
    let el: SlideElement;
    if (d.tool === 'line') {
      el = makeLine(d.start.x, d.start.y, round(q.x), round(q.y), background);
      showReadout(e.clientX, e.clientY, `${Math.round(Math.hypot(q.x - d.start.x, q.y - d.start.y))} long`);
    } else {
      let w = q.x - d.start.x;
      let h = q.y - d.start.y;
      if (e.shiftKey && d.tool !== 'text') {
        const side = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * side;
        h = Math.sign(h || 1) * side;
      }
      const box = normalizeRect(d.start.x, d.start.y, round(d.start.x + w), round(d.start.y + h));
      box.width = Math.max(1, box.width);
      box.height = Math.max(1, box.height);
      el =
        d.tool === 'rect' ? makeRect(box, e.shiftKey)
        : d.tool === 'ellipse' ? makeEllipse(box, e.shiftKey)
        : makeText(box.x, box.y, Math.max(24, box.width), background);
      showReadout(e.clientX, e.clientY, d.tool === 'text' ? `${Math.round(box.width)} wide` : `${Math.round(box.width)} × ${Math.round(box.height)}`);
    }
    if (!d.id) {
      d.id = el.id;
      editor.begin();
    }
    const placed = { ...el, id: d.id } as SlideElement;
    editor.preview((doc) => updateElements(doc, slideId, (els) => [...els, placed]), [d.id]);
  };

  const finish = (e: ReactPointerEvent) => {
    const d = drag.current;
    setDrag(null);
    setGuides(NO_GUIDES);
    setMarquee(null);
    setReadout(null);
    if (!d || !slide) return;
    if (areaRef.current!.hasPointerCapture(e.pointerId)) areaRef.current!.releasePointerCapture(e.pointerId);

    switch (d.type) {
      case 'press':
        // A plain click on one of several selected things selects just that one.
        if (!d.additive && d.wasSelected && useEditor.getState().selection.length > 1) editor.select([d.target]);
        return;
      case 'move':
        editor.commit('Move');
        return;
      case 'resize':
        editor.commit('Resize');
        return;
      case 'line-end':
        editor.commit('Resize');
        return;
      case 'radius':
        editor.commit('Corner Radius');
        return;
      case 'marquee':
        return;
      case 'draw': {
        if (!d.id) {
          // A click without a drag makes a thing of a comfortable default size.
          const p = d.start;
          const bg = slide.background;
          const el =
            d.tool === 'text' ? makeText(p.x, p.y, DEFAULT_TEXT_WIDTH, bg)
            : d.tool === 'line' ? makeLine(p.x, p.y, p.x + 240, p.y, bg)
            : d.tool === 'rect' ? makeRect({ x: p.x - 120, y: p.y - 80, width: 240, height: 160 }, e.shiftKey)
            : makeEllipse({ x: p.x - 100, y: p.y - 100, width: 200, height: 200 }, e.shiftKey);
          d.id = el.id;
          editor.begin();
          editor.preview((doc) => updateElements(doc, slideId, (els) => [...els, el]), [el.id]);
        }
        if (d.tool === 'text') {
          editor.startEditing(d.id);
        } else {
          editor.commit('Draw', [d.id]);
          editor.setTool('select');
        }
        return;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!slide || useEditor.getState().tool !== 'select' || (e.target as Element).closest('.text-editor')) return;
    const p = toSlide(e.clientX, e.clientY);
    const path = hitTest(elements, p.x, p.y, SNAP_DISTANCE / scale);
    if (!path) return;
    const { selection: sel } = useEditor.getState();
    const depth = path.findIndex((id) => sel.includes(id));
    // Double-clicking a group goes one level in; double-clicking text starts typing.
    if (depth >= 0 && depth < path.length - 1) {
      editor.select([path[depth + 1]]);
      return;
    }
    const target = depth >= 0 ? path[depth] : path[0];
    const el = findElement(elements, target);
    if (el?.kind === 'text') editor.startEditing(target);
    else if (el?.kind === 'group') editor.select([path[1]]);
  };

  // Escape while drawing or dragging puts things back as they were.
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (drag.current?.type !== 'marquee' && drag.current?.type !== 'press') editor.cancel();
      setDrag(null);
      setGuides(NO_GUIDES);
      setMarquee(null);
      setReadout(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dragging]);

  const cursor = tool === 'text' ? 'text' : tool !== 'select' ? 'crosshair' : dragging === 'move' ? 'move' : hoverId ? 'move' : 'default';
  const editingEl = editingId ? findElement(elements, editingId) : null;

  return (
    <CanvasContextMenu>
      <div
        ref={areaRef}
        className={`canvas-area ${dragging ? 'is-dragging' : ''}`}
        style={{ cursor }}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={() => !drag.current && setHoverId(null)}
        onDoubleClick={onDoubleClick}
      >
        {slide && scale > 0 && (
          <div
            ref={stageRef}
            className="stage"
            role="region"
            aria-label="Slide"
            aria-roledescription="slide"
            style={{ left: view.left, top: view.top, width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
          >
            <SlideView background={slide.background} elements={slide.elements} hiddenId={editingId} className="stage-slide" />
            {slide.elements.length === 0 && !dragging && tool === 'select' && <EmptySlideHint />}
            <SelectionOverlay
              scale={scale}
              elements={slide.elements}
              selection={selection}
              hoverId={dragging ? null : hoverId}
              guides={guides}
              marquee={marquee}
              hideHandles={dragging === 'draw'}
              editingId={editingId}
            />
            {editingEl?.kind === 'text' && <TextEditor key={editingEl.id} element={editingEl} scale={scale} slideId={slideId} />}
          </div>
        )}
        {readout && (
          <div className="readout" style={{ left: readout.x, top: readout.y }}>
            {readout.text}
          </div>
        )}
      </div>
    </CanvasContextMenu>
  );
}

function EmptySlideHint() {
  return (
    <div className="empty-slide-hint" aria-hidden>
      <span>Choose Rectangle, Ellipse, Line or Text above, then drag on the slide.</span>
    </div>
  );
}

/** Snap the direction from (ox, oy) to (px, py) to the nearest 45°. */
function constrainAngle(ox: number, oy: number, px: number, py: number): Point {
  const dx = px - ox;
  const dy = py - oy;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return { x: ox + Math.cos(angle) * length, y: oy + Math.sin(angle) * length };
}
