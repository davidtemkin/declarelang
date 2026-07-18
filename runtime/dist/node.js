// Node — the atom of the object system: tree membership, nothing visual.
// It is substrate-agnostic on purpose; some nodes are never drawn (a key/data
// coordinator). View (view.ts) layers visual incarnation on top.
//
// R0 keeps Node to the tree it must maintain. Its lifecycle grows with the
// rungs that need it: names/ids and `classroot` scope (R6), the reactive core
// and construct/init events (R4/R5). Establishing the Node↔View seam now is
// what lets those land without reshaping the base.
import { Cell, isTracking } from "./reactive.js";
export class Node {
    parent = null;
    children = [];
    /** The STRUCTURE cell — lazily created on the first tracked read of this
     *  node's child list (extentOf's contentWidth/contentHeight walk), woken by
     *  insertChild/removeChild. This is what makes a constraint over a
     *  replication-populated container's content extent re-derive when rows
     *  ARRIVE — per-child attr reads track the children that exist, and this
     *  cell tracks that the SET of children changed. */
    structure = null;
    /** Tracked read of the child-list structure (no-op untracked). */
    trackStructure() {
        if (!isTracking())
            return;
        if (this.structure === null)
            this.structure = new Cell();
        this.structure.track();
    }
    structureChanged() {
        this.structure?.changed();
    }
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
        this.structureChanged();
    }
    /** Link `child` at `index` — child order is semantic (tree order is paint
     *  order, and replicated children take their data's order, R8). */
    insertChild(child, index) {
        child.parent = this;
        this.children.splice(index, 0, child);
        this.structureChanged();
    }
    /** Unlink `child`. Model structure only — a live view's surface and
     *  standing computations are the caller's to retire (View.discard). */
    removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) {
            this.children.splice(i, 1);
            this.structureChanged();
        }
        child.parent = null;
    }
    /** Retire this node's standing machinery, depth-first — called once when a
     *  subtree leaves the tree (replication, navigation). The base recurses and
     *  runs registered teardowns; View overrides it to also drop its surface +
     *  bindings, and Animator to drop its clock enrolment + bindings. Recursing
     *  over EVERY child (not just Views) is what tears down an Animator/Spring
     *  child — a Node, not a View — whose `to` binding would otherwise linger,
     *  subscribed to whatever it read, keeping the whole discarded subtree alive
     *  (and, for a Spring, still ticking). */
    discard() {
        for (const child of this.children)
            child.discard();
        runRetire(this);
    }
}
// node → teardown callbacks registered by outside machinery (a replicator's
// standing computations, a `<-` subscription's unsubscribe). Lived in view.ts
// keyed by View until the subscription work (2026-07-13): a plain Node can
// host a subscription (`nav: Node [ onKeyUp(e) <- Keys { … } ]`), so the
// registry lives at the base. Pay-per-use, module-private; node.ts stays
// ignorant of who registers.
const RETIRE = new WeakMap();
/** Run `fn` when `node` is discarded — how standing machinery that is not a
 *  slot owner (a Replicator, a subscription) retires with its host. */
export function onDiscard(node, fn) {
    const list = RETIRE.get(node);
    if (list !== undefined)
        list.push(fn);
    else
        RETIRE.set(node, [fn]);
}
/** Run and clear `node`'s registered teardowns. Called by Node.discard (the
 *  base) and by View.discard (which re-implements the recursion rather than
 *  calling super — each discard path runs it exactly once). */
export function runRetire(node) {
    const retire = RETIRE.get(node);
    if (retire !== undefined) {
        RETIRE.delete(node);
        for (const fn of retire)
            fn();
    }
}
//# sourceMappingURL=node.js.map