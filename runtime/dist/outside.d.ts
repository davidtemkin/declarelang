import { View } from "./view.js";
import { type InteractionView } from "./interaction.js";
/** A view's visibility or policy changed: list it as open, or not. A view that
 *  comes to be shown goes on top. */
export declare function noteOverlay(v: View): void;
/** The context an overlay belongs to: the nearest region above the view it
 *  paints in (or above itself, painting where it is declared), or null for
 *  the whole program. */
export declare function contextOf(v: View): View | null;
/** Is `node` inside `overlay`, along the paint tree? */
export declare function inside(node: InteractionView | null, overlay: View): boolean;
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
export declare function leafAcross(app: View, x: number, y: number, rx?: number, ry?: number): InteractionView | null;
/** A hosted program is leaving: its overlays are no longer open. */
export declare function withdrawOpen(root: View): void;
/** Anything open at all — a cheap gate for the router's hot path. */
export declare function anyOverlayOpen(): boolean;
/** A press at frame point (x, y) of `app` — root point (rx, ry), as
 *  leafAcross takes them: should the router swallow it? The overlays it
 *  passes are told (onOutsidePress) as their policies say. */
export declare function pressOutside(app: View, x: number, y: number, rx?: number, ry?: number): boolean;
/** A scroll (wheel or touch move) at frame point (x, y) of `app` — root
 *  point (rx, ry): should it be swallowed? */
export declare function scrollOutside(app: View, x: number, y: number, rx?: number, ry?: number): boolean;
