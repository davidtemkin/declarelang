// Presses and scrolls aimed past an open overlay (planes.md §8, §8.1): the input
// strata, resolved in the router — a walk over the open overlays, top first, not
// bubbling. An OVERLAY is a shown view whose `outsidePress` or `scrollBelow` is
// not `none`; the open ones are kept in the order they appeared, which is their
// paint order (an overlay paints in its stratum in entry order).
//
// `outsidePress` — what a press outside the overlay does:
//   dismiss            the overlay hears onOutsidePress; the press is swallowed
//   dismissAndDeliver  the overlay hears onOutsidePress; the press goes on
//   block              the press is swallowed; the overlay stays
//   ignore             the press goes on, as if the overlay were not there
// `scrollBelow` — what a scroll (wheel, touch) outside it does:
//   block              swallowed
//   allow              goes on
//   dismiss            the overlay hears onOutsidePress; the scroll goes on
//
// A press or scroll inside the top overlay is its own. Outside it, the top
// overlay's policy applies; one that lets it go on (ignore, dismissAndDeliver)
// hands it to the next overlay down, until one swallows it or none is left.
//
// Holding back (`block`) is the overlay's CONTEXT's: a dialog that opened in a
// window holds back presses and scrolls in that window, and one aimed at
// another window, or the desktop, goes on — the window-modal sheet of macOS. An
// overlay's context is the nearest region (`focusScope = region`, a `Window`)
// above the view it paints in, else the whole program. Closing (`dismiss`) is
// not scoped — a press anywhere closes an open menu — except for a modal
// overlay (`focusScope = modal`, a sheet): it is its context's, so a press in
// another window goes on and the sheet stays.

import { View, fireEvent } from "./view.js";
import { leafAt, paintParentOf, rootToLocal, type InteractionView } from "./interaction.js";

/** The open overlays, oldest first. */
const OPEN: View[] = [];

const policyOf = (v: View): boolean => v.outsidePress !== "none" || v.scrollBelow !== "none";

/** Is the view shown — itself and every ancestor it paints under visible? */
function shown(v: View): boolean {
  for (let n: InteractionView | null = v as unknown as InteractionView; n !== null; n = paintParentOf(n)) {
    if (!(n as unknown as View).visible) return false;
  }
  return true;
}

/** A view's visibility or policy changed: list it as open, or not. A view that
 *  comes to be shown goes on top. */
export function noteOverlay(v: View): void {
  const i = OPEN.indexOf(v);
  const open = policyOf(v) && v.visible;
  if (open && i < 0) OPEN.push(v);
  else if (!open && i >= 0) OPEN.splice(i, 1);
}

/** The open overlays, top first, that are really shown. */
function openTopFirst(): View[] {
  // one torn down while open (its program unmounted) is no longer open
  for (let i = OPEN.length - 1; i >= 0; i--) if ((OPEN[i] as unknown as { $tornDown?: boolean }).$tornDown === true) OPEN.splice(i, 1);
  const out: View[] = [];
  for (let i = OPEN.length - 1; i >= 0; i--) if (shown(OPEN[i])) out.push(OPEN[i]);
  return out;
}

/** The context an overlay belongs to: the nearest region above the view it
 *  paints in (or above itself, painting where it is declared), or null for
 *  the whole program. */
export function contextOf(v: View): View | null {
  const start = (v.paintsIn ?? v) as unknown as InteractionView;
  for (let n: InteractionView | null = start; n !== null; n = paintParentOf(n)) {
    if ((n as unknown as View).focusScope === "region") return n as unknown as View;
  }
  return null;
}

/** Is `node` inside `overlay`, along the paint tree? */
export function inside(node: InteractionView | null, overlay: View): boolean {
  for (let n = node; n !== null; ) {
    if ((n as unknown as View) === overlay) return true;
    // up the paint tree, and from a hosted program's root to its island
    n = paintParentOf(n) ?? ((n as unknown as { $hostIsland?: InteractionView | null }).$hostIsland ?? null);
  }
  return false;
}

/** The view under a press, walking on through an island into the program it
 *  hosts (an overlay may belong to a tenant). (x, y) is the press in the
 *  root's FRAME — for the page, the window point the browser reports — which
 *  is what the walk reads: an overlay pinned to the window is found where it
 *  is seen, at any scroll. (rx, ry) is the same press in ROOT space, for the
 *  step into a tenant (rootToLocal). Both come from the browser at the moment
 *  of the press; no scroll offset is applied to either. (A root point given
 *  as the frame point, on a scrolled page, fell past the window's foot: a
 *  press inside an open drawer read as outside it and dismissed it — iPhone,
 *  2026-10-25.) Unscrolled, the two are one point, the default. */
export function leafAcross(app: View, x: number, y: number, rx = x, ry = y): InteractionView | null {
  let leaf = leafAt(app as unknown as InteractionView, x, y);
  for (let guard = 0; leaf !== null && guard < 8; guard++) {
    const t = (leaf as unknown as { $tenant?: View | null }).$tenant;
    if (!(t instanceof View)) break;
    const [lx, ly] = rootToLocal(leaf, rx, ry);
    const inner = leafAt(t as unknown as InteractionView, lx, ly);
    if (inner === null) break;
    leaf = inner;
    rx = lx; ry = ly;
  }
  return leaf;
}

/** Is `leaf` inside the context `o` belongs to? */
function inContext(leaf: InteractionView | null, o: View): boolean {
  const c = contextOf(o);
  return c === null || inside(leaf, c);
}

/** A hosted program is leaving: its overlays are no longer open. */
export function withdrawOpen(root: View): void {
  for (let i = OPEN.length - 1; i >= 0; i--) {
    let r: View = OPEN[i];
    while (r.parent instanceof View) r = r.parent;
    if (r === root) OPEN.splice(i, 1);
  }
}

/** Anything open at all — a cheap gate for the router's hot path. */
export function anyOverlayOpen(): boolean {
  return OPEN.length > 0;
}

/** A press at frame point (x, y) of `app` — root point (rx, ry), as
 *  leafAcross takes them: should the router swallow it? The overlays it
 *  passes are told (onOutsidePress) as their policies say. */
export function pressOutside(app: View, x: number, y: number, rx = x, ry = y): boolean {
  if (OPEN.length === 0) return false;
  const leaf = leafAcross(app, x, y, rx, ry);
  for (const o of openTopFirst()) {
    if (inside(leaf, o)) return false;
    const p = o.outsidePress;
    // a modal overlay — a sheet on a window — is its context's: a press in
    // another window is that window's, and leaves the sheet where it is
    if (p === "dismiss" && o.focusScope === "modal" && !inContext(leaf, o)) continue;
    if (p === "dismiss") { fireEvent(o, "outsidePress"); return true; }
    if (p === "block") { if (inContext(leaf, o)) return true; continue; }
    if (p === "dismissAndDeliver") { fireEvent(o, "outsidePress"); continue; }
    // ignore / none: the next overlay down decides
  }
  return false;
}

/** A scroll (wheel or touch move) at frame point (x, y) of `app` — root
 *  point (rx, ry): should it be swallowed? */
export function scrollOutside(app: View, x: number, y: number, rx = x, ry = y): boolean {
  if (OPEN.length === 0) return false;
  const leaf = leafAcross(app, x, y, rx, ry);
  for (const o of openTopFirst()) {
    if (inside(leaf, o)) return false;
    const s = o.scrollBelow;
    if (s === "block") { if (inContext(leaf, o)) return true; continue; }
    if (s === "dismiss" && o.focusScope === "modal" && !inContext(leaf, o)) continue;
    if (s === "dismiss") { fireEvent(o, "outsidePress"); continue; }
  }
  return false;
}
