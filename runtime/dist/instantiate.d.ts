import type { Element, Program } from "./parser.js";
import { View } from "./view.js";
/** Build a Node/View tree from a parsed Program or Element fragment (no
 *  rendering). */
export declare function instantiate(input: Element | Program): View;
/** Imperative creation (planes.md §7): instantiate `tag` by NAME into
 *  `parent`, on the tree rooted at `root` — the same construct pipeline as
 *  replication (one materializer instance: construct → link → attach →
 *  finish), so a created view is a full citizen: bindings installed, init
 *  fired, discard reachable. `props` are ordinary post-init writes (a
 *  `datapath` prop gives the instance a record context — the replication
 *  convention, reused). Name resolution is the program's registry: a class
 *  referenced ONLY here is invisible to static tracing — keep it with
 *  `use [ Name ]` (instantiation.md §8). Throws loudly on unknown names. */
export declare function createViewIn(root: View, tag: string, parent: View, props?: Record<string, unknown>): View;
