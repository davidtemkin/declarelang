// Node — the atom of the object system: tree membership, nothing visual.
// It is substrate-agnostic on purpose; some nodes are never drawn (a key/data
// coordinator). View (view.ts) layers visual incarnation on top.
//
// R0 keeps Node to the tree it must maintain. Its lifecycle grows with the
// rungs that need it: names/ids and `classroot` scope (R6), the reactive core
// and construct/init events (R4/R5). Establishing the Node↔View seam now is
// what lets those land without reshaping the base.
export class Node {
    parent = null;
    children = [];
    /** The scope noun (R6) for members declared in THIS node's body — the
     *  enclosing class instance, set at construction. It lives here, on Node, not
     *  on View: a node's members have a scope whether or not the node is visual
     *  (a controller node's members resolve `classroot` to the controller). */
    classroot = null;
    /** The top of the tree — the App root. A deeply-nested view reaches
     *  app-level state and methods through `this.root` instead of a
     *  fragile fixed-depth `.parent` chain (the language's one escape from
     *  strict child→parent locality; structure, not reactive). */
    get root() {
        let n = this;
        while (n.parent !== null)
            n = n.parent;
        return n;
    }
    /** Link `child` beneath this node. The tree is the single source of
     *  structure; the render backend mirrors it (see View.attach). */
    appendChild(child) {
        child.parent = this;
        this.children.push(child);
    }
    /** Link `child` at `index` — child order is semantic (tree order is paint
     *  order, and replicated children take their data's order, R8). */
    insertChild(child, index) {
        child.parent = this;
        this.children.splice(index, 0, child);
    }
    /** Unlink `child`. Model structure only — a live view's surface and
     *  standing computations are the caller's to retire (View.discard). */
    removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0)
            this.children.splice(i, 1);
        child.parent = null;
    }
}
//# sourceMappingURL=node.js.map