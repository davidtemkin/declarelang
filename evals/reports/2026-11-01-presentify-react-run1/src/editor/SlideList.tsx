/**
 * The slides, in order, down the left side. Each is a live picture of its slide.
 *
 * Reordering by drag leaves the list still under the pointer: the slides don't shuffle
 * while dragging; a line shows where the slide will land, and it moves there on release.
 */
import * as ContextMenu from '@radix-ui/react-context-menu';
import { memo, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { SlideView } from '../components/SlideView';
import { IconButton, formatShortcut } from '../components/ui';
import { PlusIcon, WarningIcon } from '../components/icons';
import * as cmd from './commands';
import type { SlideDoc } from './doc';
import { editor, useEditor } from './store';

const DRAG_THRESHOLD = 4;
const NO_SLIDES: string[] = [];
const AUTOSCROLL_EDGE = 48;

interface DragState {
  id: string;
  /** Where the slide was. */
  from: number;
  pointerId: number;
  startY: number;
  active: boolean;
  /** Where the slide would land, as an index into the order without it. */
  dropIndex: number;
  /** Midpoints of each item, in the list's scroll coordinates, taken when the drag began. */
  mids: number[];
  /** Where the drop line goes for each landing place. */
  lines: number[];
  ghostX: number;
  ghostY: number;
}

export function SlideList() {
  const order = useEditor((s) => s.doc?.order ?? NO_SLIDES);
  const slides = useEditor((s) => s.doc?.slides);
  const currentId = useEditor((s) => s.currentSlideId);
  const conflicts = useEditor((s) => s.conflicts);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointerY = useRef(0);

  const update = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // Keep the current slide in view as it changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-slide-id="${CSS.escape(currentId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  const contentY = (clientY: number) => {
    const scroller = scrollRef.current!;
    return clientY - scroller.getBoundingClientRect().top + scroller.scrollTop;
  };

  /** Work out where the dragged slide would land, from the pointer's latest position. */
  const recomputeDrop = () => {
    const d = dragRef.current;
    if (!d?.active) return;
    const y = contentY(pointerY.current);
    let index = d.mids.filter((m) => m < y).length;
    // Indices count the order without the dragged slide.
    if (index > d.from) index -= 1;
    if (index !== d.dropIndex) update({ ...d, dropIndex: index });
  };

  // While dragging near the top or bottom, scroll.
  const active = drag?.active ?? false;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const scroller = scrollRef.current!;
      const r = scroller.getBoundingClientRect();
      const y = pointerY.current;
      const speed =
        y < r.top + AUTOSCROLL_EDGE ? -(r.top + AUTOSCROLL_EDGE - y) / 3
        : y > r.bottom - AUTOSCROLL_EDGE ? (y - (r.bottom - AUTOSCROLL_EDGE)) / 3
        : 0;
      if (speed) {
        scroller.scrollTop += speed;
        recomputeDrop();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // recomputeDrop reads only refs, so the loop needn't restart when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onPointerDown = (e: PointerEvent, id: string) => {
    if (e.button !== 0) return;
    editor.setCurrentSlide(id);
    editor.select([]);
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    const from = order.indexOf(id);
    update({ id, from, pointerId: e.pointerId, startY: e.clientY, active: false, dropIndex: from, mids: [], lines: [], ghostX: e.clientX, ghostY: e.clientY });
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    pointerY.current = e.clientY;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD) return;
      listRef.current!.setPointerCapture(e.pointerId);
      // Measure once: the list doesn't move while dragging, so these stay true.
      const items = [...listRef.current!.querySelectorAll<HTMLElement>('[data-slide-id]')];
      const mids = items.map((el) => el.offsetTop + el.offsetHeight / 2);
      const others = items.filter((el) => el.dataset.slideId !== d.id);
      const last = others.at(-1);
      const lines = [...others.map((el) => el.offsetTop - 5), last ? last.offsetTop + last.offsetHeight + 5 : 0];
      update({ ...d, active: true, mids, lines, ghostX: e.clientX, ghostY: e.clientY });
      return;
    }
    dragRef.current = { ...d, ghostX: e.clientX, ghostY: e.clientY };
    setDrag(dragRef.current);
    recomputeDrop();
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    update(null);
    if (d?.active) cmd.moveSlideTo(d.id, d.dropIndex);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const index = order.indexOf(currentId);
    const mod = e.metaKey || e.ctrlKey;
    // With things on the slide selected (say, just pasted), editing keys are for them.
    const slideHasSelection = useEditor.getState().selection.length > 0;
    let handled = true;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      cmd.moveSlideTo(currentId, index + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') cmd.goToSlide(-1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') cmd.goToSlide(1);
    else if (e.key === 'Home') editor.setCurrentSlide(order[0]);
    else if (e.key === 'End') editor.setCurrentSlide(order[order.length - 1]);
    else if (e.key === 'Enter') cmd.addSlide();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !slideHasSelection) cmd.deleteSlide();
    else if (mod && e.key.toLowerCase() === 'd' && !slideHasSelection) cmd.duplicateSlide();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Focus follows the current slide while the list has focus.
  useEffect(() => {
    if (!listRef.current?.contains(document.activeElement)) return;
    listRef.current.querySelector<HTMLElement>(`[data-slide-id="${CSS.escape(currentId)}"]`)?.focus({ preventScroll: true });
  }, [currentId]);

  if (!slides) return null;

  // No line where the slide already is: dropping there changes nothing.
  const dropLineTop = drag?.active && drag.lines.length > 1 && drag.dropIndex !== drag.from ? drag.lines[drag.dropIndex] : null;

  const dragged = drag?.active ? slides[drag.id] : null;

  return (
    <aside className="slide-list" aria-label="Slides panel">
      <div className="slide-list-header">
        <span className="panel-title">Slides</span>
        <span className="slide-count">{order.length}</span>
        <IconButton label="New Slide" tooltipSide="right" onClick={cmd.addSlide}>
          <PlusIcon size={18} />
        </IconButton>
      </div>
      <div className="slide-list-scroll" ref={scrollRef}>
        <ol
          ref={listRef}
          className={`slide-list-items ${drag?.active ? 'is-dragging' : ''}`}
          role="listbox"
          aria-label="Slides"
          aria-orientation="vertical"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => update(null)}
          onKeyDown={onKeyDown}
        >
          {order.map((id, i) => (
            <SlideListItem
              key={id}
              slide={slides[id]}
              number={i + 1}
              current={id === currentId}
              conflicted={!!conflicts[id]}
              lifted={drag?.active === true && drag.id === id}
              onlyOne={order.length === 1}
              last={i === order.length - 1}
              onPointerDown={onPointerDown}
            />
          ))}
          {dropLineTop !== null && <li className="drop-line" style={{ top: dropLineTop }} aria-hidden />}
        </ol>
        <button type="button" className="add-slide-button" onClick={cmd.addSlide}>
          <PlusIcon size={16} /> New Slide
        </button>
      </div>
      {dragged && drag && (
        <div className="slide-ghost" style={{ left: drag.ghostX + 8, top: drag.ghostY - 30 }} aria-hidden>
          <SlideView background={dragged.background} elements={dragged.elements} />
        </div>
      )}
    </aside>
  );
}

interface ItemProps {
  slide: SlideDoc;
  number: number;
  current: boolean;
  conflicted: boolean;
  lifted: boolean;
  onlyOne: boolean;
  last: boolean;
  onPointerDown: (e: PointerEvent, id: string) => void;
}

const SlideListItem = memo(function SlideListItem({ slide, number, current, conflicted, lifted, onlyOne, last, onPointerDown }: ItemProps) {
  const label = `Slide ${number}`;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <li
          role="option"
          aria-selected={current}
          aria-label={label}
          title={label}
          tabIndex={current ? 0 : -1}
          data-slide-id={slide.id}
          className={`slide-list-item ${current ? 'is-current' : ''} ${lifted ? 'is-lifted' : ''}`}
          onPointerDown={(e) => onPointerDown(e, slide.id)}
          onContextMenu={() => editor.setCurrentSlide(slide.id)}
        >
          <span className="slide-number" aria-hidden>
            {number}
          </span>
          <span className="slide-thumb">
            <SlideView background={slide.background} elements={slide.elements} />
            {conflicted && (
              <span className="slide-thumb-badge" title="Changed in another window">
                <WarningIcon size={14} />
              </span>
            )}
          </span>
        </li>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu" collisionPadding={8} loop>
          <MenuItem onSelect={cmd.addSlide} shortcut="Enter">New Slide</MenuItem>
          <MenuItem onSelect={() => cmd.duplicateSlide(slide.id)} shortcut="Mod+D">Duplicate Slide</MenuItem>
          <ContextMenu.Separator className="menu-separator" />
          <MenuItem onSelect={() => cmd.moveSlideTo(slide.id, number - 2)} disabled={number === 1} shortcut="Alt+↑">Move Up</MenuItem>
          <MenuItem onSelect={() => cmd.moveSlideTo(slide.id, number)} disabled={last} shortcut="Alt+↓">Move Down</MenuItem>
          <ContextMenu.Separator className="menu-separator" />
          <MenuItem onSelect={() => cmd.deleteSlide(slide.id)} disabled={onlyOne} shortcut="Delete" danger>
            Delete Slide
          </MenuItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

function MenuItem({ children, onSelect, disabled, shortcut, danger }: {
  children: string;
  onSelect: () => void;
  disabled?: boolean;
  shortcut?: string;
  danger?: boolean;
}) {
  return (
    <ContextMenu.Item className={`menu-item ${danger ? 'is-danger' : ''}`} onSelect={onSelect} disabled={disabled}>
      <span className="menu-item-icon" />
      <span className="menu-item-label">{children}</span>
      {shortcut && <kbd className="menu-item-kbd">{formatShortcut(shortcut)}</kbd>}
    </ContextMenu.Item>
  );
}
