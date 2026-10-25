import { Node } from "./node.js";
/** The dotted address of a live node under `root` — the inverse of find(). */
export declare function pathOf(root: Node, n: Node): string;
/** Resolve a dotted inspect path (`app.col.opts`, `app.col.3`) to the node.
 *  Returns null (never throws) on a miss — the caller owns the message. */
export declare function findPath(root: Node, path: string, said?: (from: Node, words: string) => Node | undefined): Node | null;
