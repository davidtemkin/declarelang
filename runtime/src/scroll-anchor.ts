// scroll-anchor — a scroller keeps the reader's place (`scrollAnchor`).
//
// Content changes size while people read it: a photograph takes its real height,
// a message gains reactions, history loads in above. Before anything changes, a
// scroller notes the view at the top edge of its visible area and how far below
// that edge it starts; when that view moves, the scroller moves its own offset by
// the same amount, inside the settle that moved it — before anything is drawn —
// so nothing on screen moves. That is `scrollAnchor = content` (the default):
//
//   - the view kept still is the deepest one crossing the top edge (in a long
//     post, the paragraph being read, not the post's top) — unless the edge
//     runs through a container's empty room (its padding), and then it is the
//     view below, so the container grows upward, out of view;
//   - a pane at its very start (`scrollY` 0) stays at its start: a page still
//     loading grows at its top, and holding on to the text would scroll away
//     from the top as it loaded;
//   - a virtualized block keeps its own place (replicate.ts' anchor, which also
//     absorbs its rows' estimate corrections), so its rows are not anchored here.
//
// `scrollAnchor = end` is for a pane read from the bottom — a conversation, a
// log: at the end, it stays at the end as content grows or shrinks; away from
// the end it keeps the reader's place as `content` does, and the top is just
// history there (no start exception). A pane opens at its end, and a request to
// go to the end (`scrollTo(Infinity)`) counts as being there while it travels.
//
// A correction is not a request: it is written straight to the surface, never
// queued behind the user's scroll (view.ts), because the content under the
// reader really moved. Works on the model's own geometry, so every renderer
// keeps the same place.

import { View } from "./view.js";
import { Constraint, afterSettle, untracked } from "./reactive.js";
import { onDiscard } from "./node.js";
import { draggingView } from "./drag-autoscroll.js";

interface AnchorState {
  view: View | null;          // the view held still
  top: number;                // where its top sat in content coordinates when picked
  vis: number;                // how far below the top edge it sat then — what a correction restores
  atEnd: boolean;             // the pane was at its end at the last look (end mode)
  held: boolean;              // a correction was held back during a touch scroll
  wantEnd: boolean;           // a request to the end is travelling (end mode)
  opened: boolean;            // an end pane has opened at its end
  endY: number | null;        // the offset the anchor last put an end pane at (end mode)
  corrected: number | null;   // the offset the last correction wrote (its own scroll is not a move)
}

const STATE = new WeakMap<View, AnchorState>();
const END_SLOP = 4;           // "at the end" within this many pixels

/** A view's top in `scroller`'s content coordinates — tracked reads of every
 *  y on the way up, so a constraint over it wakes when any of them moves. */
function topIn(v: View, scroller: View): number | null {
  let y = 0;
  let n: View | null = v;
  while (n !== null && n !== scroller) {
    y += n.y + n.positionLead("y");
    const p: unknown = n.parent;
    n = p instanceof View ? p : null;
  }
  return n === scroller ? y : null;
}

/** Inside a virtualized block — its replicator keeps that place. (The block
 *  may be the scroller itself: a Table's rows are its own children.) */
function inVirtualized(v: View, scroller: View): boolean {
  for (let n: unknown = v.parent; n instanceof View; n = n.parent) {
    if ((n as unknown as { virtualized?: boolean }).virtualized === true) return true;
    if (n === scroller) break;
  }
  return false;
}

/** The deepest view crossing the top edge `edge` (content coordinates), or the
 *  first one wholly below it. Untracked: picking is not a dependency. */
function pick(scroller: View, edge: number): View | null {
  let best: View | null = null;
  const walk = (parent: View, base: number): boolean => {
    for (const c of parent.children) {
      if (!(c instanceof View) || !c.visible || (c as unknown as { ignoreScroll?: boolean }).ignoreScroll === true) continue;
      if (c === draggingView()) continue;              // the dragged view moves under the hand, never the anchor
      const top = base + c.y + c.positionLead("y");
      const bottom = top + c.height;
      if (bottom <= edge) continue;                    // wholly above the edge
      best = c;
      if (top >= edge) return true;                    // the first view below the edge: stop here
      if (walk(c, top)) return true;                   // crossing: a smaller one inside is what is read
      // nothing inside reaches past the edge: a leaf across it is what is read;
      // a container's edge runs through its trailing room (padding, spacing),
      // and what is read is the view below — held still, the container grows
      // upward, out of view, instead of pushing the screen down
      if (!c.children.some((k) => k instanceof View && k.visible)) return true;
    }
    return false;
  };
  walk(scroller, 0);
  return best;
}

function atEndOf(s: View): boolean {
  return s.scrollY >= s.contentHeight - s.height - END_SLOP;
}

/** Move the offset — the surface write, not a request (no queue, no glide). */
function correct(s: View, y: number, st: AnchorState): void {
  const clamped = Math.max(0, y);
  if (Math.abs(clamped - s.scrollY) < 0.5) return;
  st.corrected = clamped;
  s.scrollY = clamped;
  s.$surface?.scrollToY?.(clamped);
}

/** Install the anchor on a scroller (idempotent). */
export function installScrollAnchor(s: View): void {
  if (STATE.has(s)) return;
  const st: AnchorState = { view: null, top: 0, vis: 0, atEnd: false, wantEnd: false, opened: false, held: false, endY: null, corrected: null };
  STATE.set(s, st);
  const mode = (): string => (s as unknown as { scrollAnchor?: string }).scrollAnchor ?? "content";

  const repick = (): void => {
    if (mode() === "none") { st.view = null; return; }
    untracked(() => {
      const v = pick(s, s.scrollY);
      st.view = v !== null && !inVirtualized(v, s) ? v : null;
      st.top = st.view !== null ? (topIn(st.view, s) ?? 0) : 0;
      st.vis = st.top - s.scrollY;
      // Still where the anchor put it at the end: the reader has not moved,
      // whatever the content did since (rows measuring after the pane opened
      // grow it before this look runs). Only a real move leaves the end.
      const stayed = st.atEnd && st.endY !== null && Math.abs(s.scrollY - st.endY) < 0.5;
      st.atEnd = stayed || atEndOf(s);
      if (!st.atEnd) st.endY = null;
      if (st.atEnd) st.wantEnd = false;                // the travelling request arrived
    });
  };

  // THE USER MOVED THE PANE: a new place to keep. A correction's own write
  // lands here too and is not a move: the kept view stays kept. (Re-picking
  // there would pick wherever the content had got to by then — content still
  // moving above the reader would be taken as the new place, and the move it
  // made since the correction never paid back.)
  const onScroll = new Constraint(`${s.constructor.name}.scrollAnchor.scroll`, () => `${s.scrollY}|${s.scrolling}`, () => {
    if (s.scrolling && st.wantEnd && !atEndOf(s)) st.wantEnd = false;   // the reader left the end mid-travel
    if (!s.scrolling) st.held = false;                                  // the scroll is over: take the place as it is now
    // (it lands twice — the model's own write, then the engine's echo, which
    // an engine holding the offset to whole pixels reports less its fraction —
    // so the mark holds until a move that is not it)
    if (!s.scrolling && st.corrected !== null && Math.abs(s.scrollY - st.corrected) < 1) return;
    st.corrected = null;
    // moved away from where the anchor put an end pane: it has left the end
    // NOW — content landing in this same settle (rows built where the pane
    // went, on a renderer that moves the offset inside the settle) must not
    // be taken for growth at the end and pull it back
    if (st.atEnd && st.endY !== null && Math.abs(s.scrollY - st.endY) >= 0.5 && !atEndOf(s)) { st.atEnd = false; st.endY = null; }
    afterSettle(repick);
  }, 0);
  onScroll.run();

  // THE CONTENT MOVED: where does the kept view sit now, and is the pane
  // still where its mode says it should be?
  const onContent = new Constraint(`${s.constructor.name}.scrollAnchor.content`, () => {
    const m = mode();
    const h = s.contentHeight;
    const top = st.view !== null ? topIn(st.view, s) : null;
    return `${m}|${h}|${s.height}|${top}`;
  }, () => {
    afterSettle(() => {
      const m = mode();
      if (m === "none") return;
      // A FINGER IS SCROLLING in a browser that drives the scroll itself: an
      // offset written now would stop its momentum. Hold the correction; when
      // the scroll is over the place is taken afresh (one visible shift, no
      // second jump back).
      if (s.scrolling && s.$surface?.userScrollByTouch?.() === true) { st.held = true; return; }
      if (m === "end") {
        const fits = s.contentHeight <= s.height;
        if (!st.opened && !fits) { st.opened = true; st.atEnd = true; }
        if (st.atEnd || st.wantEnd) {
          correct(s, s.contentHeight - s.height, st);
          st.atEnd = true;
          st.endY = s.scrollY;
          st.wantEnd = false;                        // the travelling request has arrived
          return;
        }
      }
      if (st.view === null) { repick(); return; }
      if (st.view.parent === null) { repick(); return; }          // the kept view left the tree
      if (m === "content" && s.scrollY <= 0) { repick(); return; } // at the start, the start stays
      const now = topIn(st.view, s);
      if (now === null) { repick(); return; }
      // the kept view back where the reader saw it — an absolute target, so an
      // engine that holds the offset to whole pixels loses nothing between
      // corrections (each one relative to the last would drop its fraction)
      const target = now - st.vis;
      if (Math.abs(target - s.scrollY) >= 0.5) correct(s, target, st);
      st.top = now;
    });
  }, 0);
  onContent.run();
  afterSettle(repick);
  onDiscard(s, () => { onScroll.dispose(); onContent.dispose(); STATE.delete(s); });
}

/** An end pane held at its end: the anchor puts it at the new end whenever
 *  the content moves, so nothing inside it compensates the offset as well
 *  (replicate.ts' estimate corrections stand down). */
export function heldAtEnd(s: View): boolean {
  const st = STATE.get(s);
  return st !== undefined && (st.atEnd || st.wantEnd) && (s as unknown as { scrollAnchor?: string }).scrollAnchor === "end";
}

/** A program request: to the far end, it is travelling — an end pane keeps
 *  following while it gets there (and a pane already there has arrived);
 *  anywhere else, it supersedes one still travelling (view.ts scrollTo). */
export function noteScrollRequest(s: View, toEnd: boolean): void {
  const st = STATE.get(s);
  if (st === undefined) return;
  if (!toEnd) { st.wantEnd = false; return; }
  if (atEndOf(s)) { st.atEnd = true; st.endY = s.scrollY; st.wantEnd = false; return; }
  st.wantEnd = true;
}
