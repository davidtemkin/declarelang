// scroll-places — where the user was, for Back to return to.
//
// THE DIVISION OF LABOR, the same on every host. The native side (the
// browser's history, the Mac window's trail) keeps the entries. The host
// notes each entry's place — the root scroll and every scrolling pane's
// offset, by path — at the moment the app leaves it, and hands it back when a
// traversal arrives. The runtime lands it. The program writes nothing.
//
// THE MOMENT OF LEAVING is the first `location` or `waypoint` write of a
// settle (App.$departing calls the host's $onDepart), before anything later in
// that handler moves the page: an app that starts each new place at its top
// cannot overwrite where the user was.
//
// LANDING is an intent, like an `@name` reveal: held at the close of the
// traversal's settle, applied when the content can hold the offset, and kept
// until the platform reports it there (`$shownY`, written only from the
// platform's own scroll report). Some heights finish after any settle (rich
// text measured by the browser, an image decoding), so while an intent is
// held it is retried once a frame, for at most two seconds; the user's first
// scroll drops it (the host calls dropScrollPlaces).

import type { Node } from "./node.js";
import { View } from "./view.js";
import { findPath as find, pathOf } from "./node-path.js";
import { afterSettle } from "./reactive.js";
import { sharedClock } from "./animate.js";

/** path → vertical offset, or [x, y] when the view has scrolled across too.
 *  Views at their origin are left out: they are at the top. */
export type ScrollPlaces = Record<string, number | [number, number]>;

/** An entry's place: `s` the root's scroll (the host's own), `v` the panes. */
export interface Place { s?: number; v?: ScrollPlaces }

export function scrollPlaces(app: Node): ScrollPlaces {
  const out: ScrollPlaces = {};
  const walk = (n: Node): void => {
    for (const c of n.children) {
      if (!(c instanceof View) || !c.visible) continue;
      if (c.scrolls !== "none" && (c.scrollY !== 0 || c.scrollX !== 0))
        out[pathOf(app, c)] = c.scrollX !== 0 ? [c.scrollX, c.scrollY] : c.scrollY;
      walk(c);
    }
  };
  walk(app);
  return out;
}

interface Held { panes: Map<string, [number, number]>; root: number | null; rootTo: ((y: number) => number) | null; frames: number }
const HELD = new WeakMap<Node, Held>();

/** Land `place` once the traversal that arrived has settled. A pane the place
 *  leaves out goes to the top — a reused pane may still hold the offset of the
 *  place just left. `rootTo` scrolls the host's root and answers where it got
 *  to (null on a host whose root does not scroll). */
export function holdScrollPlaces(app: Node, place: Place, rootTo: ((y: number) => number) | null): void {
  const panes = new Map<string, [number, number]>();
  for (const path of Object.keys(scrollPlaces(app))) panes.set(path, [0, 0]);
  for (const [path, at] of Object.entries(place.v ?? {})) panes.set(path, typeof at === "number" ? [0, at] : at);
  const h: Held = { panes, root: typeof place.s === "number" && rootTo !== null ? place.s : null, rootTo, frames: 120 };
  HELD.set(app, h);
  afterSettle(() => land(app, h));
}

/** Drop a held landing: the user scrolled, or the app moved on. */
export function dropScrollPlaces(app: Node): void { HELD.delete(app); }

function land(app: Node, h: Held): void {
  if (HELD.get(app) !== h) return;
  const last = h.frames-- <= 0;
  if (h.root !== null && Math.abs(h.rootTo!(h.root) - h.root) < 1) h.root = null;
  for (const [path, [x, y]] of h.panes) {
    const v = find(app, path);
    if (!(v instanceof View)) continue;                    // not built yet
    const shownY = v.$shownY ?? v.scrollY, shownX = v.$shownX ?? v.scrollX;
    if (Math.abs(shownY - y) < 1 && Math.abs(shownX - x) < 1) { h.panes.delete(path); continue; }
    // ask only once the content can hold the offset — or, at the end, for
    // what it can hold. Straight to the platform, not View.scrollTo: that
    // waits out a scroll in motion (the user's hand first), and the motion
    // here is the pane clamping as its content changed, not the user.
    if (last || ((y <= 0 || v.contentHeight - v.height >= y - 1) && (x <= 0 || v.contentWidth - v.width >= x - 1))) {
      if (Math.abs(shownY - y) >= 1) v.$surface?.scrollToY?.(y);
      if (Math.abs(shownX - x) >= 1) v.$surface?.scrollToX?.(x);
    }
  }
  if (last || (h.root === null && h.panes.size === 0)) { HELD.delete(app); return; }
  if (h.frames === 119) sharedClock.add({ perpetual: true, $tick: () => { land(app, h); return HELD.get(app) === h; } });
}
