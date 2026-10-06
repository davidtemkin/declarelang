// scene-walk — how input finds a view in a retained scene: the press, the
// cursor, the wheel, the scroll range, for the backends that keep their own
// scene (canvas, the Mac host). The finding is THE hit walk (hit-walk.ts),
// read over the surfaces — the same walk the language's views are read with
// (interaction.ts) — asking each time a different question: which surface
// takes the press, which shows its cursor, which hears the wheel. Each surface
// supplies its geometry and its exact clip. The DOM backend has no retained
// scene: the browser's own hit-testing is its walk.

import type { InputSink, InputWants } from "./backend.js";
import type { HitTarget } from "./input.js";
import { walkHit, hitPoint, type HitAdapter, type HitAccept, type HitNote } from "./hit-walk.js";

/** What a backend's surface exposes to the walks. */
export interface SceneSurface {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly visible: boolean;
  readonly children: readonly SceneSurface[];
  readonly parent: SceneSurface | null;
  readonly sink: InputSink | null;
  readonly wants: InputWants | undefined;
  /** The authored `pointerEvents` ("" = the default). */
  readonly pe: string;
  readonly cursorStyle: string;
  readonly scrolls: boolean;
  readonly scrollsX: boolean;
  readonly scrollOffset: number;
  readonly scrollXOffset: number;
  readonly ignoresClip: boolean;
  readonly ignoresScroll: boolean;
  /** The page's own scroller, whose wheel belongs to the browser. */
  readonly pageRoot?: boolean;
  /** A point in the parent's frame, translated already, into this surface's
   *  own untransformed coordinates. */
  invertTransform(lx: number, ly: number): [number, number];
  /** Whether this surface clips its subtree (a box clip or a shape clip). */
  clips(): boolean;
  /** Whether a local point is inside the clip; asked only when `clips()`. */
  insideClip(lx: number, ly: number): boolean;
  /** A windowed list's logical extent — the vertical scroll range's floor
   *  (0 = none). */
  extentFloor(): number;
  /** The content inset (padding) at the end of an axis: bottom for y, right for x. */
  trailingInset(axis: "x" | "y"): number;
}

const scroller = (s: SceneSurface): boolean => s.scrolls || s.scrollsX;

/** The surfaces as the hit walk reads them. A surface's children are in its
 *  scrolled frame, except its frame chrome, which rides the frame. */
const SURFACES: HitAdapter<SceneSurface> = {
  isNode: (_c): _c is SceneSurface => true,
  children: (s) => s.children,
  visible: (s) => s.visible,
  width: (s) => s.width,
  height: (s) => s.height,
  scroller,
  ignoresScroll: (s) => s.ignoresScroll,
  ignoresClip: (s) => s.ignoresClip,
  clips: (s) => s.clips(),
  insideClip: (s, lx, ly) => s.insideClip(lx, ly),
  toChild: (s, c, lx, ly) => {
    const shifted = !c.ignoresScroll;
    const px = shifted && s.scrollsX ? lx + s.scrollXOffset : lx;
    const py = shifted && s.scrolls ? ly + s.scrollOffset : ly;
    return c.invertTransform(px - c.x, py - c.y);
  },
};

/** A point in `s`'s PARENT frame, in `s`'s own. */
const local = (s: SceneSurface, px: number, py: number): [number, number] => s.invertTransform(px - s.x, py - s.y);

// The questions. A press target holds an input sink and is not
// pointer-transparent — opacity is paint, not presence, so a transparent view
// still takes a press; a surface the question passes over lets the press go on
// to the siblings beneath it. A cursor is any pointable surface's own `cursor`.
// The wheel goes to the deepest `onWheel` claimant or scroller — an
// intervening scroller keeps its wheel; the page's own scroller is the
// browser's, never this walk's.
const PRESS: HitAccept<SceneSurface> = (s) => (s.sink === null ? "passed over — holds no input" : s.pe === "none" ? "passed over — pointerEvents = \"none\"" : null);
const CURSOR: HitAccept<SceneSurface> = (s) => (s.cursorStyle !== "" && s.pe !== "none" ? null : "no cursor of its own");
const WHEEL: HitAccept<SceneSurface> = (s) =>
  (s.wants?.wantsWheel === true && s.sink !== null) || (scroller(s) && s.pageRoot !== true) ? null : "neither claims the wheel nor scrolls";

/** The press target under a point in `s`'s parent frame. Its cursor is the
 *  deepest cursor in its subtree under the point — a surface with no sink shows
 *  its cursor while its press passes to the sink beneath it — else its own. */
export function hitWalk(s: SceneSurface, px: number, py: number): HitTarget | null {
  const [lx, ly] = local(s, px, py);
  const t = walkHit(s, lx, ly, SURFACES, PRESS);
  if (t === null) return null;
  const x = hitPoint.x, y = hitPoint.y;
  // the nearest pinch owner up the chain, the target included — the claim
  // covers a subtree, so the gesture belongs to the declaring ancestor
  let pinch: { key: object; sink: InputSink } | undefined;
  for (let p: SceneSurface | null = t; p !== null; p = p.parent) {
    if (p.wants?.wantsPinch === true && p.sink !== null) { pinch = { key: p, sink: p.sink }; break; }
  }
  const zone = walkHit(t, x, y, SURFACES, CURSOR);
  const cursor = zone !== null ? zone.cursorStyle : undefined;
  return { key: t, sink: t.sink!, ...t.wants, pinch, x, y, cursor };
}

/** Where a wheel goes, from a point in `s`'s parent frame: delivered to a
 *  claimant ("claimed"), left to a scroller that owns it ("scroller"), or
 *  neither (null). `root` is the point in the root's frame, which the claimant
 *  hears beside its own. */
export function wheelWalk(s: SceneSurface, px: number, py: number, deltaX: number, deltaY: number, pinch: boolean,
                          root: { x: number; y: number }): "claimed" | "scroller" | null {
  const [lx, ly] = local(s, px, py);
  const t = walkHit(s, lx, ly, SURFACES, WHEEL);
  if (t === null) return null;
  if (t.wants?.wantsWheel === true && t.sink !== null) {
    t.sink("wheel", hitPoint.x, hitPoint.y, { deltaX, deltaY, pinch, rootX: root.x, rootY: root.y });
    return "claimed";
  }
  return "scroller";
}

/** A scroller's content extent along an axis: the furthest edge among its
 *  visible children — an unclipped child's own overflow included unless it
 *  scrolls on that axis, frame chrome included — plus the trailing inset, so a
 *  padded scroller stops a full inset after its content; floored (on y) by a
 *  windowed list's logical extent, which carries the insets already
 *  (virtualize.ts publishes rows plus the parent's padding). */
export function contentExtentOf(s: SceneSurface, axis: "x" | "y" = "y"): number {
  let max = 0;
  for (const c of s.children) {
    if (!c.visible) continue;
    const size = axis === "y" ? c.height : c.width;
    const own = c.clips() || (axis === "y" ? c.scrolls : c.scrollsX) ? size : Math.max(size, contentExtentOf(c, axis));
    const end = (axis === "y" ? c.y : c.x) + own;
    if (end > max) max = end;
  }
  if (max > 0) max += s.trailingInset(axis);
  return axis === "y" ? Math.max(max, s.extentFloor()) : max;
}

/** The press walk again, narrating each surface it visits — a diagnostic. */
export function traceWalk(s: SceneSurface, px: number, py: number, say: (line: string) => void): void {
  const [lx, ly] = local(s, px, py);
  const notes: HitNote<SceneSurface>[] = [];
  walkHit(s, lx, ly, SURFACES, PRESS, notes);
  for (const n of notes) say(`${(n.view as { id?: number }).id ?? "?"} @${n.x},${n.y} ${n.view.width}x${n.view.height} — ${n.why}`);
}

/** Whether a local point is inside a box rounded by `corners` (top-left,
 *  top-right, bottom-right, bottom-left, already fitted to the box). */
export function insideRoundedBox(lx: number, ly: number, w: number, h: number,
                                 corners: readonly [number, number, number, number]): boolean {
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
  const [tl, tr, br, bl] = corners;
  const outside = (cx: number, cy: number, r: number): boolean => (lx - cx) ** 2 + (ly - cy) ** 2 > r * r;
  if (lx < tl && ly < tl) return !outside(tl, tl, tl);
  if (lx > w - tr && ly < tr) return !outside(w - tr, tr, tr);
  if (lx > w - br && ly > h - br) return !outside(w - br, h - br, br);
  if (lx < bl && ly > h - bl) return !outside(bl, h - bl, bl);
  return true;
}
