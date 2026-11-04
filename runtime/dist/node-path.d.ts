import { Node } from "./node.js";
/** An unnamed child's step: its place among the views beside it, or, for a
 *  member that is no view, `$` and its place among all the children. */
export declare function indexStep(parent: Node, n: Node): string;
/** The dotted address of a live node under `root` — the inverse of find(). */
export declare function pathOf(root: Node, n: Node): string;
/** Resolve a dotted inspect path (`app.col.opts`, `app.col.3`) to the node.
 *  Returns null (never throws) on a miss — the caller owns the message. */
export declare function findPath(root: Node, path: string, said?: (from: Node, words: string) => Node | undefined): Node | null;
