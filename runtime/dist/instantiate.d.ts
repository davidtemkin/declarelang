import type { Element, Program } from "./parser.js";
import { View } from "./view.js";
/** Build a Node/View tree from a parsed Program or Element fragment (no
 *  rendering). */
export declare function instantiate(input: Element | Program): View;
/** Mark a whole subtree as already-inited WITHOUT firing anything — the
 *  membership-anchored lifecycle (materialization.md §2, RULED 2026-07-30):
 *  onInit fires once per record-MEMBERSHIP, so when the reconciler
 *  reconstructs an instance for a member whose init already fired (a
 *  windowed row scrolling back in, a keyed re-derivation reusing identity),
 *  it pre-marks the fresh subtree and initTree stays silent. */
export declare function markInited(view: View): void;
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
/** Instantiate a PARSED element into a live parent — the Inspector's
 *  `Tag [ … ]` evaluation. Unlike createViewIn (which synthesizes an empty
 *  element from a tag name), this takes the real parsed node, so nested
 *  children, `{ }` constraints and declarations all materialize exactly as
 *  they would in source. Resolves against the SUBJECT tree's registry. */
export declare function createElementIn(root: View, el: Element, parent: View): View;
