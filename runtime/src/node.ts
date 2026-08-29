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
  parent: Node | null = null;
  readonly children: Node[] = [];

  /** The STRUCTURE cell — lazily created on the first tracked read of this
   *  node's child list (extentOf's contentWidth/contentHeight walk), woken by
   *  insertChild/removeChild. This is what makes a constraint over a
   *  replication-populated container's content extent re-derive when rows
   *  ARRIVE — per-child attr reads track the children that exist, and this
   *  cell tracks that the SET of children changed. */
  private structure: Cell | null = null;

  /** Register the caller's interest in "my child list changed" (no-op when
   *  nothing is tracking). Every reactive read works this way — a cell the
   *  reader subscribes to — and the child list's cell is created on first
   *  interest rather than up front, so a tree nobody asks about pays nothing. */
  watchChildList(): void {
    if (!isTracking()) return;
    if (this.structure === null) {
      this.structure = new Cell();
      this.structure.structural = true;   // wakes carry the re-wire signal
    }
    this.structure.track();
  }

  private childListChanged(): void {
    this.structure?.changed();
  }

  /** The scope noun (R6) for members declared in THIS node's body — the
   *  enclosing class instance, set at construction. It lives here, on Node, not
   *  on View: a node's members have a scope whether or not the node is visual
   *  (a controller node's members resolve `classroot` to the controller). */
  classroot: Node | null = null;

  /** The top of the tree — the App root. A deeply-nested view reaches
   *  app-level state and methods through `this.root` instead of a
   *  fragile fixed-depth `.parent` chain (the language's one escape from
   *  strict child→parent locality; structure, not reactive). */
  get root(): Node {
    let n: Node = this;
    while (n.parent !== null) n = n.parent;
    return n;
  }

  /** Link `child` beneath this node. The tree is the single source of
   *  structure; the render backend mirrors it (see View.attach). */
  appendChild(child: Node): void {
    child.parent = this;
    this.children.push(child);
    this.childListChanged();
  }

  /** Link `child` at `index` — child order is semantic (tree order is paint
   *  order, and replicated children take their data's order, R8). */
  insertChild(child: Node, index: number): void {
    child.parent = this;
    this.children.splice(index, 0, child);
    this.childListChanged();
  }

  /** Unlink `child`. Model structure only — a live view's surface and
   *  standing computations are the caller's to retire (View.discard). */
  removeChild(child: Node): void {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
      this.childListChanged();
    }
    child.parent = null;
  }

  /** The self-completing retirement verb — the pair of createView: cut the
   *  model link if one still stands, tear the subtree down, then notify the
   *  ex-parent that its child list changed as a unit (childrenMutated), so
   *  an arrangement re-packs and auto-extent re-derives with no second
   *  incantation. Machinery that unlinks FIRST (the replicator's bursts,
   *  markdown rebuilds) arrives here with `parent` already null and pays
   *  nothing extra — the once-per-burst notify stays the burst's own. */
  discard(): void {
    const p = this.parent;
    if (p !== null) p.removeChild(this);
    this.teardown();
    if (p !== null) p.childrenMutated();
  }

  /** Retire this node's standing machinery, depth-first — teardown ONLY, no
   *  unlinking: the recursion for a subtree leaving as one (a child's link
   *  dies with its parent). The base runs registered teardowns; View
   *  overrides it to also drop its surface + bindings, and Animator to drop
   *  its clock enrolment + bindings. Recursing over EVERY child (not just
   *  Views) is what tears down an Animator/Spring child — a Node, not a View
   *  — whose `to` binding would otherwise linger, subscribed to whatever it
   *  read, keeping the whole discarded subtree alive (and, for a Spring,
   *  still ticking). */
  teardown(): void {
    for (const child of this.children) child.teardown();
    runRetire(this);
  }

  /** Children were inserted/removed/reordered as a unit — the notification
   *  seam the tree verbs speak (discard above; the replicator, once per
   *  reconcile). A no-op at this layer: Node owns structure, not geometry.
   *  View overrides it with the visual response (layout re-arm, auto-extent
   *  re-derive). Declared here so `discard` can notify an ex-parent without
   *  the base knowing what a View is. */
  childrenMutated(): void {}
}

// node → teardown callbacks registered by outside machinery (a replicator's
// standing computations, a service member's unsubscribe). Lived in view.ts
// keyed by View until the subscription work (2026-07-13): a plain Node can
// host a runtime service (`nav: Node [ Keys [ onKeyUp(e) { … } ] ]`), so the
// registry lives at the base. Pay-per-use, module-private; node.ts stays
// ignorant of who registers.
const RETIRE = new WeakMap<Node, (() => void)[]>();

/** Run `fn` when `node` is discarded — how standing machinery that is not a
 *  slot owner (a Replicator, a subscription) retires with its host. */
export function onDiscard(node: Node, fn: () => void): void {
  const list = RETIRE.get(node);
  if (list !== undefined) list.push(fn);
  else RETIRE.set(node, [fn]);
}

/** Run and clear `node`'s registered teardowns. Called by Node.discard (the
 *  base) and by View.discard (which re-implements the recursion rather than
 *  calling super — each discard path runs it exactly once). */
export function runRetire(node: Node): void {
  const retire = RETIRE.get(node);
  if (retire !== undefined) {
    RETIRE.delete(node);
    for (const fn of retire) fn();
  }
}

/** The name the author gave `node`, if any: a named child is installed as a
 *  property on its parent and on its classroot (whichever scope declared it),
 *  so the name is the key under which one of them holds it. Null for an
 *  anonymous node. Lives here, at the bottom of the import graph, so both the
 *  inspector (inspect.ts) and a binding's error label (bind.ts) can ask. */
export function authoredName(node: Node): string | null {
  for (const holder of [node.parent, node.classroot]) {
    if (holder === null || holder === undefined) continue;
    for (const k of Object.keys(holder)) {
      if (k.startsWith("$") || k === "parent" || k === "children" || k === "classroot") continue;
      if ((holder as unknown as Record<string, unknown>)[k] === node) return k;
    }
  }
  return null;
}
