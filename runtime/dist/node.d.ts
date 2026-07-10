export declare class Node {
    parent: Node | null;
    readonly children: Node[];
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
}
