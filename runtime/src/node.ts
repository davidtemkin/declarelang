// Node — the atom of the object system: tree membership, nothing visual.
// It is substrate-agnostic on purpose; some nodes are never drawn (a key/data
// coordinator). View (view.ts) layers visual incarnation on top.
//
// R0 keeps Node to the tree it must maintain. Its lifecycle grows with the
// rungs that need it: names/ids and `classroot` scope (R6), the reactive core
// and construct/init events (R4/R5). Establishing the Node↔View seam now is
// what lets those land without reshaping the base.

import { Cell, isTracking, noteOrigin } from "./reactive.js";
import { timeHost } from "./wallclock.js";
import { trackNode, untrackNode } from "./change-event.js";
import { providedRead, defineAttributes, providedChainMoved, PROVIDED_FACE } from "./attributes.js";
import type { Cursor } from "./data.js";

/** The cursor read, installed by view.ts. A cursor belongs to a VIEW — it comes
 *  from that view's `datapath` and its place in replication — but the things
 *  that want to read one are often not views: a Spring's target, an Animator's
 *  bounds, a Time's gate, a DataSource's url. Those are members OF a view, so
 *  the read climbs to the nearest view that has a cursor (view.ts
 *  `inheritedCursor` already walks any node's parent chain, at any depth of
 *  non-view nesting). A seam rather than an import, because view.ts imports
 *  this module and the dependency stays one-directional. */
type CursorRead = (node: Node, path: string | readonly unknown[]) => unknown;
let readCursor: CursorRead | null = null;
export function provideCursorRead(fn: CursorRead): void { readCursor = fn; }
/** The write half, through the same climb: a handler on any member writes the
 *  record of the nearest view with a cursor, exactly where its reads land. */
type CursorWrite = (node: Node, segs: readonly string[], v: unknown) => void;
let writeCursor: CursorWrite | null = null;
export function provideCursorWrite(fn: CursorWrite): void { writeCursor = fn; }

export class Node {
  parent: Node | null = null;
  /** The parent a removeChild just unlinked from — a re-link back to the SAME
   *  parent (what replication does to every row of a block on any change) is
   *  not a move, and must not invalidate the provider memos. */
  private exParent: Node | null = null;
  /** Landing under a DIFFERENT parent changes this subtree's ancestor chain,
   *  and only this subtree's: clear its provider memos (attributes.ts). */
  private chainMoved(child: Node): void {
    if (child.parent === this || child.exParent === this) return;
    providedChainMoved(child);
  }
  /** The values this node reports changes to (schema.ts NodeSchema). */
  declare trackChanges: string[] | null;
  /** The data cursor (language §9): the place `:path` reads and writes on this
   *  node and its descendants resolve against — the nearest ancestor-or-self
   *  cursor wins (view.ts inheritedCursor). On any node, so a model class can
   *  stand on one record with no view involved. Written as `datapath =
   *  :rel.path` (extends the inherited cursor), `datapath = { expr }` (a place
   *  derived from a dataset's value), or null. */
  declare datapath: Cursor | null;

  /** Read `path` against the nearest enclosing cursor — what a `:path` island
   *  lowers to (compile.ts resolveBody). On a view that is its own inherited
   *  cursor; on a non-view member it is the nearest view above that has one.
   *  An unresolved path yields null, as everywhere else in the language.
   *  Writes climb the same way (`$cell`). */
  $data(path: string | readonly unknown[]): unknown {
    return readCursor === null ? null : readCursor(this, path);
  }

  /** One field of the record the nearest cursor points at, as an assignable
   *  place — what a write to a `:path` in a handler lowers to (`:done = v` →
   *  `this.$cell(["done"]).value = v`). Reading `value` is the `:path` read;
   *  assigning it writes the dataset, so `:count += 1` reads and writes one field. */
  $cell(segs: readonly unknown[]): { value: unknown } {
    const node = this;
    return {
      get value(): unknown { return node.$data(segs); },
      set value(v: unknown) { writeCursor?.(node, segs.map(String), v); },   // a computed key writes by its string form
    };
  }
  readonly children: Node[] = [];

  /** The read behind `provided("name")` — a value an ancestor makes available,
   *  read explicitly here. The compiler rewrites a `provided(…)` call's callee
   *  to `this.$provided` (like `app` → `this.root`), so `this` is the reading
   *  node; `providedRead` (attributes.ts) walks the parent chain for the nearest
   *  ancestor that provides `name`. A second argument is the createContext-style
   *  default when nothing above provides it; with none, an unprovided read
   *  throws, naming the value. Lives on Node, not View: a faceless coordinator
   *  node reads provided values too. */
  $provided(name: string, ...dflt: unknown[]): unknown {
    return providedRead(this, name, dflt.length > 0, dflt[0]);
  }

  /** The call behind `afterDelay(ms, fn)` — run `fn` once, `ms` milliseconds from
   *  now. The compiler rewrites the callee to `this.$afterDelay`, so the wait
   *  belongs to the node whose handler asked: discarding the node cancels it,
   *  and the handle's `cancel()` drops it sooner. It never runs inside the
   *  frame that asked — the frame is shown first, so `afterDelay(0, fn)` is "next
   *  frame" — and it reads the wall clock through the one test seam
   *  (wallclock.ts), so a driver that advances Time advances this too. */
  $afterDelay(ms: number, fn: () => void): { cancel(): void } {
    const host = timeHost();
    const due = host.now() + Math.max(0, Number(ms) || 0);
    let frame: unknown = null, timer: unknown = null, done = false;
    const cancel = (): void => {
      if (done) return;
      done = true;
      pending(this).delete(cancel);
      if (frame !== null) (host.cancelFrame ?? host.clearTimeout)(frame);
      if (timer !== null) host.clearTimeout(timer);
    };
    const fire = (): void => {
      if (done) return;
      done = true;
      pending(this).delete(cancel);
      const name = authoredName(this);
      noteOrigin(`after on ${name ?? this.constructor.name}`, this);
      fn();
    };
    pending(this).add(cancel);
    const afterFrame = (): void => {
      frame = null;
      if (!done) timer = host.setTimeout(fire, Math.max(0, due - host.now()));
    };
    frame = host.frame !== undefined ? host.frame(afterFrame) : host.setTimeout(afterFrame, 0);
    return { cancel };
  }

  /** The read behind `hostProvided("name", default)` — a value this program's
   *  HOST makes available: an island's `provides` name, a page's
   *  `app.provide(…)`, the native host's launch parameters. The compiler
   *  rewrites the callee to `this.$hostProvided`; the value lives on the
   *  running App (its host values), so every node in the program reads the
   *  same one. The default types the read and stands in when nothing is
   *  provided (running standalone, or the host did not list the name); with
   *  no default an absent value throws, naming it. */
  $hostProvided(name: string, ...dflt: unknown[]): unknown {
    let top: Node = this;
    while (top.parent !== null) top = top.parent as Node;
    const hv = (top as unknown as { hostValues?: { read(n: string, h: boolean, d: unknown): unknown } }).hostValues;
    if (hv === undefined) {
      if (dflt.length > 0) return dflt[0];
      throw new Error(`hostProvided("${name}"): this node is not in a running app`);
    }
    return hv.read(name, dflt.length > 0, dflt[0]);
  }

  /** The read behind `providedTextStyle(overrides?)` — the `TextStyle` in force
   *  at THIS node: the five provided face names, each falling to the same default
   *  a `Text` would (attributes.ts PROVIDED_FACE, the one table), with the
   *  caller's fields replacing any of them.
   *
   *  It exists because `measureText` and a drawing's `fillText` take a style
   *  RECORD and inherit nothing — they have no place in the tree to inherit
   *  from — so measuring "as a Text here would render it" otherwise meant
   *  hand-writing five provided reads and keeping their defaults in step. The
   *  value is a property of the node, not of where it is read: a value slot and
   *  that same view's `draw()` get the same record, and a drawing's own `d.font`
   *  state is unrelated to it. */
  $providedTextStyle(overrides?: Record<string, unknown> | null): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, def] of PROVIDED_FACE) out[name] = providedRead(this, name, true, def);
    if (overrides == null) return out;
    for (const k of Object.keys(overrides)) out[k] = overrides[k];
    return out;
  }

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
  /** The child-list cell's kernel id (created on first need) — a native
   *  rule's edge on "the SET of children changed" (the auto-extent rule). */
  structureCellId(): number {
    if (this.structure === null) { this.structure = new Cell(); this.structure.structural = true; }
    return this.structure.cellId();
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
    this.chainMoved(child);
    child.parent = this;
    this.children.push(child);
    this.childListChanged();
  }

  /** Link `child` at `index` — child order is semantic (tree order is paint
   *  order, and replicated children take their data's order, R8). */
  insertChild(child: Node, index: number): void {
    this.chainMoved(child);
    child.parent = this;
    this.children.splice(index, 0, child);
    this.childListChanged();
  }

  /** Unlink `child`. Model structure only — a live view's surface and
   *  standing computations are the caller's to retire (View.discard). */
  removeChild(child: Node): void {
    child.exParent = this;                  // so a re-link back here is not a move
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
    this.structure?.free();
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

// A node's outstanding `after` waits, each held as its cancel — registered
// with the node's teardowns on the first one, so a discarded node leaves none.
const AFTER = new WeakMap<Node, Set<() => void>>();
function pending(node: Node): Set<() => void> {
  let set = AFTER.get(node);
  if (set === undefined) {
    const s = new Set<() => void>();
    set = s;
    AFTER.set(node, s);
    onDiscard(node, () => { for (const c of [...s]) c(); AFTER.delete(node); });
  }
  return set;
}

/** Run and clear `node`'s registered teardowns. Called by Node.discard (the
 *  base) and by View.discard (which re-implements the recursion rather than
 *  calling super — each discard path runs it exactly once). */
export function runRetire(node: Node): void {
  untrackNode(node);
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

// `trackChanges` (schema.ts NodeSchema): the values this node reports changes
// to. Re-arming is the reactive part — a rebound list re-tracks and re-seeds,
// so a name added later starts silent. Before `init` there is nothing to arm;
// view.ts arms the node when it goes live.
defineAttributes(Node, {
  // The cursor is model state: bindings read it (tracked), nothing renders it.
  datapath: { def: null },
  trackChanges: { def: null, push: (n, v) => {
    if ((n as unknown as { $live?: boolean }).$live !== true) return;
    trackNode(n, Array.isArray(v) ? v.map((x) => String(x)) : null);
  } },
});
