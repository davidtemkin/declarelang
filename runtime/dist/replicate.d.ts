import type { Element } from "./parser.js";
import { Node } from "./node.js";
import { View } from "./view.js";
/** What the Replicator needs from instantiate.ts (which imports this module;
 *  the interface keeps the dependency one-way): construct one instance of
 *  the template — tree only — and hand back `finish`, which installs its
 *  bindings and fires init once the instance is linked and attached. */
export interface Materialize {
    (template: Element, classroot: View): {
        view: View;
        finish: () => void;
    };
}
export declare class Replicator {
    private readonly parent;
    private readonly path;
    private readonly classroot;
    private readonly make;
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    private readonly prev;
    private views;
    private items;
    private readonly template;
    private readonly constraint;
    constructor(parent: View, element: Element, path: string, classroot: View, make: Materialize, 
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    prev: Node | Replicator | null);
    /** First run (instantiate pass two — the tree is linked) + retire with the
     *  parent, so a discarded subtree's replicators can never wake again. */
    arm(): void;
    /** The tracked half: the inherited cursor chain + the array region. A
     *  non-array (unresolved, or scalar) matches nothing — zero instances,
     *  re-matched the moment the region becomes an array. */
    private match;
    private reconcile;
    /** Where the block starts right now: after its anchor. */
    private start;
    /** The first live surface after the block — the `before` reference the
     *  re-inserted surfaces stack up against (null = the parent's end). */
    private surfaceAfter;
    /** @internal The block's last instance — the next block's anchor. */
    last(): Node | null;
}
