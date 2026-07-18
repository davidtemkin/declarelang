export declare class Node {
    parent: Node | null;
    readonly children: Node[];
    /** The STRUCTURE cell — lazily created on the first tracked read of this
     *  node's child list (extentOf's contentWidth/contentHeight walk), woken by
     *  insertChild/removeChild. This is what makes a constraint over a
     *  replication-populated container's content extent re-derive when rows
     *  ARRIVE — per-child attr reads track the children that exist, and this
     *  cell tracks that the SET of children changed. */
    private structure;
    /** Tracked read of the child-list structure (no-op untracked). */
    trackStructure(): void;
    private structureChanged;
    /** The scope noun (R6) for members declared in THIS node's body — the
     *  enclosing class instance, set at construction. It lives here, on Node, not
     *  on View: a node's members have a scope whether or not the node is visual
     *  (a controller node's members resolve `classroot` to the controller). */
    classroot: Node | null;
    /** The top of the tree — the App root. A deeply-nested view reaches
     *  app-level state and methods through `this.root` instead of a
     *  fragile fixed-depth `.parent` chain (the language's one escape from
     *  strict child→parent locality; structure, not reactive). */
    get root(): Node;
    /** Link `child` beneath this node. The tree is the single source of
     *  structure; the render backend mirrors it (see View.attach). */
    appendChild(child: Node): void;
    /** Link `child` at `index` — child order is semantic (tree order is paint
     *  order, and replicated children take their data's order, R8). */
    insertChild(child: Node, index: number): void;
    /** Unlink `child`. Model structure only — a live view's surface and
     *  standing computations are the caller's to retire (View.discard). */
    removeChild(child: Node): void;
    /** Retire this node's standing machinery, depth-first — called once when a
     *  subtree leaves the tree (replication, navigation). The base recurses and
     *  runs registered teardowns; View overrides it to also drop its surface +
     *  bindings, and Animator to drop its clock enrolment + bindings. Recursing
     *  over EVERY child (not just Views) is what tears down an Animator/Spring
     *  child — a Node, not a View — whose `to` binding would otherwise linger,
     *  subscribed to whatever it read, keeping the whole discarded subtree alive
     *  (and, for a Spring, still ticking). */
    discard(): void;
}
/** Run `fn` when `node` is discarded — how standing machinery that is not a
 *  slot owner (a Replicator, a subscription) retires with its host. */
export declare function onDiscard(node: Node, fn: () => void): void;
/** Run and clear `node`'s registered teardowns. Called by Node.discard (the
 *  base) and by View.discard (which re-implements the recursion rather than
 *  calling super — each discard path runs it exactly once). */
export declare function runRetire(node: Node): void;
