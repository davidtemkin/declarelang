/**
 * Selection, hover, guides and marquee, drawn in screen pixels over the slide.
 *
 * Every outline is drawn twice, a light halo under a strong accent line, so the selection
 * is unmistakable on a white slide, a black one, or one the colour of the accent itself.
 */
import { boundsOf, findElement, leaves, outermost, parentOf } from '../model/elements';
import type { Rect, SlideElement } from '../model/types';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types';
import { HANDLE_CURSORS, HANDLES, type Handle, handlePosition } from './resize';
import type { Guides } from './snapping';

interface Props {
  scale: number;
  elements: SlideElement[];
  selection: string[];
  hoverId: string | null;
  guides: Guides;
  marquee: Rect | null;
  hideHandles: boolean;
  editingId: string | null;
}

const HANDLE = 9;
const HIT = 18;

export function SelectionOverlay({ scale, elements, selection, hoverId, guides, marquee, hideHandles, editingId }: Props) {
  const s = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale });
  const ids = outermost(elements, selection);
  const selected = ids.map((id) => findElement(elements, id)).filter((el): el is SlideElement => el !== null);
  const hovered = hoverId && !selection.includes(hoverId) ? findElement(elements, hoverId) : null;
  const single = selected.length === 1 ? selected[0] : null;
  const box = selected.length ? s(unionOf(selected)) : null;
  const parentId = single ? parentOf(elements, single.id) : null;
  const parent = parentId ? findElement(elements, parentId) : null;
  const onlyText = selected.length > 0 && selected.every((el) => leaves(el).every((l) => l.kind === 'text'));
  const handles = HANDLES.filter((h) => !(onlyText && (h === 'n' || h === 's')));

  return (
    <svg className="overlay" width={SLIDE_WIDTH * scale} height={SLIDE_HEIGHT * scale} aria-hidden>
      {hovered && <Outline el={hovered} scale={scale} className="hover-outline" />}

      {parent && <Box rect={s(boundsOf(parent))} className="group-context" />}

      {selected.length > 1 && selected.map((el) => <Outline key={el.id} el={el} scale={scale} className="member-outline" />)}

      {single?.kind === 'line' ? (
        <>
          <Outline el={single} scale={scale} className="selection-outline" />
          {!hideHandles && (
            <>
              <EndHandle x={single.x1 * scale} y={single.y1 * scale} name="end1" />
              <EndHandle x={single.x2 * scale} y={single.y2 * scale} name="end2" />
            </>
          )}
        </>
      ) : (
        box && (
          <>
            <Box rect={box} className="selection-outline" />
            {!hideHandles && !editingId && handles.map((h) => <ResizeHandle key={h} handle={h} box={box} />)}
            {!hideHandles && !editingId && single?.kind === 'rect' && <RadiusHandle rect={single} scale={scale} />}
          </>
        )
      )}

      {guides.x.map((x) => (
        <line key={`gx${x}`} className="guide" x1={x * scale} x2={x * scale} y1={0} y2={SLIDE_HEIGHT * scale} />
      ))}
      {guides.y.map((y) => (
        <line key={`gy${y}`} className="guide" y1={y * scale} y2={y * scale} x1={0} x2={SLIDE_WIDTH * scale} />
      ))}

      {marquee && <rect className="marquee" {...s(marquee)} />}
    </svg>
  );
}

function unionOf(els: SlideElement[]): Rect {
  const rects = els.map(boundsOf);
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}

/** An outline drawn as halo + line, crisp on whole pixels. */
function Box({ rect, className }: { rect: Rect; className: string }) {
  const r = { x: Math.round(rect.x) + 0.5, y: Math.round(rect.y) + 0.5, width: Math.round(rect.width), height: Math.round(rect.height) };
  return (
    <g className={className}>
      <rect className="halo" {...r} />
      <rect className="ink" {...r} />
    </g>
  );
}

function Outline({ el, scale, className }: { el: SlideElement; scale: number; className: string }) {
  if (el.kind === 'line') {
    const p = { x1: el.x1 * scale, y1: el.y1 * scale, x2: el.x2 * scale, y2: el.y2 * scale };
    return (
      <g className={className}>
        <line className="halo" {...p} />
        <line className="ink" {...p} />
      </g>
    );
  }
  if (el.kind === 'ellipse') {
    const e = { cx: (el.x + el.width / 2) * scale, cy: (el.y + el.height / 2) * scale, rx: (el.width / 2) * scale, ry: (el.height / 2) * scale };
    return (
      <g className={className}>
        <ellipse className="halo" {...e} />
        <ellipse className="ink" {...e} />
      </g>
    );
  }
  const b = boundsOf(el);
  return <Box rect={{ x: b.x * scale, y: b.y * scale, width: b.width * scale, height: b.height * scale }} className={className} />;
}

function ResizeHandle({ handle, box }: { handle: Handle; box: Rect }) {
  const { x, y } = handlePosition(handle, box);
  const cx = Math.round(x) + 0.5;
  const cy = Math.round(y) + 0.5;
  return (
    <g className="handle" data-handle={handle} style={{ cursor: HANDLE_CURSORS[handle] }}>
      <rect className="handle-hit" x={cx - HIT / 2} y={cy - HIT / 2} width={HIT} height={HIT} />
      <rect className="handle-knob" x={cx - HANDLE / 2} y={cy - HANDLE / 2} width={HANDLE} height={HANDLE} rx={2} />
    </g>
  );
}

function EndHandle({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <g className="handle" data-handle={name} style={{ cursor: 'crosshair' }}>
      <circle className="handle-hit" cx={x} cy={y} r={HIT / 2} />
      <circle className="handle-knob" cx={x} cy={y} r={HANDLE / 2 + 0.5} />
    </g>
  );
}

/** The dot that rounds a rectangle's corners: it sits inside the top-left corner, at the radius. */
function RadiusHandle({ rect, scale }: { rect: Extract<SlideElement, { kind: 'rect' }>; scale: number }) {
  const w = rect.width * scale;
  const h = rect.height * scale;
  if (w < 48 || h < 48) return null;
  const r = Math.min(rect.cornerRadius, rect.width / 2, rect.height / 2) * scale;
  // Keep it clear of the corner handle when the corners are square.
  const inset = Math.min(Math.max(r, 16), Math.min(w, h) / 2);
  const x = rect.x * scale + inset;
  const y = rect.y * scale + inset;
  return (
    <g className="handle radius-handle" data-handle="radius" style={{ cursor: 'pointer' }}>
      <title>Corner radius</title>
      <circle className="handle-hit" cx={x} cy={y} r={HIT / 2} />
      <circle className="handle-knob" cx={x} cy={y} r={4.5} />
    </g>
  );
}
