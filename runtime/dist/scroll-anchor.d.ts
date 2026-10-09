import { View } from "./view.js";
/** Install the anchor on a scroller (idempotent). */
export declare function installScrollAnchor(s: View): void;
/** An end pane held at its end: the anchor puts it at the new end whenever
 *  the content moves, so nothing inside it compensates the offset as well
 *  (replicate.ts' estimate corrections stand down). */
export declare function heldAtEnd(s: View): boolean;
/** An end pane whose reader is at its end, whatever its offset says this
 *  moment: not opened yet (the anchor opens it at its end), or still where the
 *  anchor last put it (the content grew since, and the anchor puts it at the
 *  new end before this update is drawn). A virtualized list inside reads its
 *  rows there, not at the offset the pane is about to leave. */
export declare function readsAtEnd(s: View): boolean;
/** A program request: to the far end, it is travelling — an end pane keeps
 *  following while it gets there (and a pane already there has arrived);
 *  anywhere else, it supersedes one still travelling (view.ts scrollTo). */
export declare function noteScrollRequest(s: View, toEnd: boolean): void;
