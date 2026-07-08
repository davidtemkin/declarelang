// View — a Node with visual incarnation. It owns its geometry and appearance
// as reactive attributes (the same visual set the language reference gives
// View — x, y, width, height, backgroundColor, visible, opacity, language §6 —
// plus the R3 `clip` shape and the optional draw method).
//
// Since R4 every attribute is live: the fields are `declare`d and their
// accessors installed by defineAttributes below, so a bare read is a tracked
// read and a bare write stores, pushes exactly its own Surface call, and
// wakes exactly its dependents (attributes.ts has the full story). Before
// attach the pushes are no-ops (`surface` is null) and attach's flush sends
// the full state once — literals cost no reactive machinery at all.

import { Node } from "./node.js";
import { DEFAULT_THEME, fillEqual, shadowEqual, strokeEqual, type Color, type Fill, type Shadow, type Stroke, type Theme } from "./value.js";
import type { FontWeight } from "./measure.js";
import { disposeApplier, stylesheetArrived, stylesheetByName, type Stylesheet } from "./stylesheet.js";
import { POINTER_TYPES, type InputSink, type RenderBackend, type Surface } from "./backend.js";
import { record, type Draw, type DisplayList } from "./draw.js";
import { Constraint } from "./reactive.js";
import { bindDerived, defineAttributes, disposeBindings, isSet, ownerOf, percentOwned } from "./attributes.js";
import { handlerName } from "./schema.js";
import { splitPath } from "./datapath.js";
import type { Cursor } from "./data.js";

/** What a layout strategy is to the View — the whole protocol: begin
 *  arranging this view (get back the undo), and re-arrange when the CHILDREN
 *  THEMSELVES change (R8: replication inserts/removes/reorders — a strategy
 *  captures the children at install, so tree mutation re-arms it through
 *  childrenMutated below). Defined here (not layout.ts) so the `layout`
 *  slot's pusher needs no import of the strategies — the dependency points
 *  one way, layout.ts → view.ts, like the backends'. */
export interface LayoutStrategy {
  attachTo(view: View): () => void;
  rearm(): void;
}

// view → the installed strategy's detach. Module-private bookkeeping rather
// than a View field: only the pusher below touches it, and a layout-free
// view (the common case) carries nothing.
const INSTALLED = new WeakMap<View, () => void>();

// view → teardown callbacks registered by outside machinery (a parent's
// replicator, R8). Same shape as INSTALLED: pay-per-use, module-private,
// and view.ts stays ignorant of who registers.
const RETIRE = new WeakMap<View, (() => void)[]>();

// ── Auto-extent (the neoweather rung, ruled at the R7 checkpoint) ──────────
//
// A view whose width/height the author never set sizes to its children's
// extents — LZX's measureSize semantics (LaszloView.lzs, read for intent),
// rewritten as a *yielding derive* on the reactive core, exactly the Text
// auto-size shape: installed at attach for never-set, unowned slots on views
// that have View children, reading each child's position + size + visibility
// under tracking — so a child moving, growing, or hiding re-derives the
// parent — and displaced by a direct author write (derives yield).
//
// Two exclusions, both semantic:
//   - INVISIBLE children occupy no space (LZX's rule, and R7's layout rule —
//     one meaning of `visible=false` everywhere);
//   - a child slot that is PERCENT-BOUND on the derived axis is excluded on
//     that axis (the ruled CSS-style cycle guard: a percent resolves against
//     THIS view, so counting it would read the derive's own output).
//
// The view's own content folds in through contentExtent (an Image's natural
// bitmap size — LZX's max(resource, subviews), kept). `children` is not a
// reactive collection (R8's deliberate line), so the derives are held here
// and re-run by childrenMutated — the same explicit lifecycle layouts use.
const EXTENT = new WeakMap<View, Partial<Record<"width" | "height", Constraint>>>();

const AXIS_OF = { width: "x", height: "y" } as const;

/** Run `fn` when `view` is discarded — how standing machinery that is not a
 *  slot owner (a Replicator) retires with the view that hosts it. */
export function onDiscard(view: View, fn: () => void): void {
  const list = RETIRE.get(view);
  if (list !== undefined) list.push(fn);
  else RETIRE.set(view, [fn]);
}

export class View extends Node {
  declare x: number;
  declare y: number;
  declare width: number;
  declare height: number;
  /** What paints this view's box: a solid Color (null = paint nothing) or a
   *  Gradient — the ruled `fill` slot, subsuming the retired backgroundColor. */
  declare fill: Fill;
  /** The painted box's corner radius (0 = square). Shapes the PAINT only —
   *  clipping stays the explicit `clip` attribute (the recorded lean). */
  declare cornerRadius: number;
  /** A border drawn INSIDE the box (never layout); null = none. */
  declare stroke: Stroke | null;
  /** The box's drop shadow (cast by the border box, CSS semantics — never
   *  painted under the box itself); null = none. */
  declare shadow: Shadow | null;
  declare visible: boolean;
  declare opacity: number;
  /** Keyboard focus (design-docs/input.md, Layer 2). `focusable` = a tab stop;
   *  `focustrap` = a self-contained focus group. Traversal order is the tree,
   *  overridable per view by defining a `tabOrder()` method. */
  declare focusable: boolean;
  declare focustrap: boolean;
  /** Clip the subtree (paint AND hit-test). Two forms on one slot: a Shape
   *  string clips to that SVG path (view-local coordinates); the boolean
   *  box-clip `true` clips to the view's own box (0,0,width,height), tracking
   *  width/height reactively so it follows an animating height every frame
   *  (tabslider-gaps.md gap 1); false/null = no clip. */
  declare clip: string | boolean | null;

  /** The prevailing text-style slots (styling rung, ruled): declared on View
   *  so any container can PROVIDE them — an unset slot follows the nearest
   *  providing ancestor's value, live (the accessor's follow walk,
   *  attributes.ts). Text renders with the effective values; on a plain View
   *  they are pure context (no Surface push). `textColor` is the one
   *  text-color slot everywhere — Text.color is retired (ruled, no alias). */
  declare textColor: Color;
  declare fontSize: number;
  declare fontFamily: string;
  declare fontWeight: FontWeight;
  /** Letter tracking in px (canvas-native), 0 = natural advances. */
  declare letterSpacing: number;
  /** The prevailing design-token record (ruled, v1): a plain immutable
   *  record, wholesale-swapped — components opt in by reading tokens
   *  (`fill = { theme.buttonFill }`); re-skinning a subtree is one set. */
  declare theme: Theme;
  /** The applied style bundles' names (`styles = [card, danger]`) — a
   *  STATIC list (ruled v1): the bundles' sets merge at construction, so
   *  this slot is introspection, not a live channel. */
  declare styles: readonly string[] | null;
  /** The prevailing stylesheet (the external channel): provide one anywhere
   *  and that subtree reskins — its class-keyed entries land as rank-2
   *  offers through per-view appliers (stylesheet.ts); assigning another
   *  stylesheet re-skins live, one settle. */
  declare stylesheet: Stylesheet | null;

  /** Resolve a declared stylesheet by name — the honest public call for
   *  reaching a stylesheet from inside a `{ }` body, where you are in real TS and
   *  a bare `Dark` is (correctly) just an unresolved identifier, NOT sugar:
   *  `stylesheet = { night ? this.lookupStylesheet("Dark")
   *                        : this.lookupStylesheet("Light") }`.
   *  The bare-name form `stylesheet = Dark` is the DECLARATIVE surface and is
   *  compile-checked there; inside a body the name is a runtime string, so a
   *  miss throws loud + positioned (stylesheetByName) rather than resolving to a
   *  silent null. Resolved against the program registry at the tree root. */
  lookupStylesheet(name: string): Stylesheet {
    let root: Node = this;
    while (root.parent !== null) root = root.parent;
    return stylesheetByName(root, name);
  }
  /** How this view arranges its children (language §5: a reactive slot, not
   *  a child and not a container type); null = none — absolute x/y. Written
   *  as the member `layout: SimpleLayout [ … ]`; assigning swaps the live
   *  arrangement (the pusher below), so the doc's "swap it" is a plain
   *  write. Purely model-side: the strategy's constraints move children, and
   *  those pushes cross the seam — the slot itself never does. */
  declare layout: LayoutStrategy | null;

  /** The data cursor (R8, language §9): the place `:path` reads on this view
   *  and its descendants resolve against, inherited down the tree (the
   *  nearest ancestor's cursor wins — see $data). Written as `datapath =
   *  :rel.path` (extends the inherited cursor), `datapath = { expr }` (a
   *  place derived from a dataset's value), or null. Model state — no
   *  Surface push; visuals follow through the bindings that read it. */
  declare datapath: Cursor | null;

  /** The optional draw method (the ruled rendering model): a `draw(d) { … }`
   *  member (its R5 language surface), a runtime assignment, or a subclass
   *  override — and this view draws. It runs on invalidation only, recording
   *  into a display list the backend retains; user code never enters the
   *  frame loop. Since R4 the recording runs under dependency tracking, so a
   *  body that reads a reactive attribute re-records when that attribute
   *  changes (rendering model rule 4). A view without one carries zero
   *  drawing machinery. `declare`d so the slot has no runtime presence until
   *  something provides a draw — which is also what lets the language's
   *  `draw(d) { … }` member install here through the ordinary method path
   *  (instantiate's built-in-member guard sees an absent slot). */
  declare draw?: (d: Draw) => void;

  /** The enclosing class instance — the node this view was *written* inside
   *  (a named class's root, or the App root, whose whole tree is the
   *  anonymous App class, language §5/§11): a class-body child points at its
   *  class instance; a class instance itself (and any use-site child) points
   *  at the OUTER scope, since its element is written in the outer body.
   *  Structure, like `parent` — set once by instantiate, not reactive. Null
   *  on the root and on hand-built trees. */
  classroot: View | null = null;

  /** This view's handle on the render backend — null until attached. */
  surface: Surface | null = null;

  /** The backend this view attached on — what lets a view that arrives
   *  AFTER attach (a replicated instance, R8) realize itself into the live
   *  tree. Null until attached. */
  backend: RenderBackend | null = null;

  /** The draw method's standing recording (null until one exists). Phase 1:
   *  it re-records only after value constraints settle, so a draw body
   *  always sees consistent attributes. */
  private drawing: Constraint | null = null;

  /** The box-clip's standing derive when `clip === true` (null otherwise): a
   *  framework-internal reactive computation that feeds the backend the box
   *  rect as a clip path, recomputed as width/height change (bindBoxClip).
   *  Phase 1, like `drawing` — it reads settled geometry. */
  private boxClip: Constraint | null = null;

  /** Realize this view and its subtree on a backend: create the surface,
   *  flush the current visual state across the seam, parent it (before
   *  `before` when the tree is mutating mid-list — R8; null appends), and
   *  recurse. This is the substrate-agnostic render pass — View touches only
   *  the Surface API. After this, the attribute setters push changes to the
   *  live surface one Surface call at a time. */
  attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    this.backend = backend;
    // Auto-extent installs at attach, like every intrinsic sizing (Text's
    // measure derives — installed before super.attach — and an Image's
    // natural size already own or fill the slots they size, so a leaf's
    // intrinsics always win over this).
    this.bindExtent();
    const s = (this.surface = backend.createSurface());
    this.flush(s);
    parentSurface?.insertChild(s, before);
    for (const child of this.children) {
      if (child instanceof View) child.attach(backend, s);
    }
  }

  /** Read data relative to this view's inherited cursor — the runtime form
   *  every `:path` in a `{ }` body rewrites to (`:location.city` →
   *  `this.$data("location.city")`, expr.ts). Tracked like any read: the
   *  binding wakes when exactly this region — or any datapath on the chain
   *  above — changes. An unresolved path yields null (language §9). */
  $data(path: string): unknown {
    const cursor = inheritedCursor(this);
    if (cursor === null) return null;
    const v = cursor.data.read([...cursor.path, ...splitPath(path)]);
    return v === undefined ? null : v;
  }

  /** The tree-mutation entry (R8): children were inserted/removed/reordered
   *  as a unit — re-arm the installed arrangement and re-derive auto-extent,
   *  once per burst (the replicator calls this once per reconcile, not per
   *  child). A replicated block arriving under a never-sized view can also
   *  make a slot newly derivable — bindExtent picks it up. */
  childrenMutated(): void {
    this.layout?.rearm();
    if (this.backend !== null) this.bindExtent();
    const derives = EXTENT.get(this);
    if (derives !== undefined) {
      for (const size of ["width", "height"] as const) {
        const d = derives[size];
        // The ownership check skips a derive an author write displaced.
        if (d !== undefined && ownerOf(this, size) === d) d.run();
      }
    }
  }

  /** This view's own content's extent on a size axis, folded into the
   *  auto-extent max — 0 for a plain view; Image overrides with the bitmap's
   *  natural size. Runs under tracking, so an override may read reactive
   *  state (Image reads `loaded`). */
  protected contentExtent(_size: "width" | "height"): number {
    return 0;
  }

  /** Install auto-extent derives for whichever never-set, unowned size slots
   *  qualify — only on views with View children (a childless view keeps its
   *  zero-cost default; Dataset children are not geometry). */
  private bindExtent(): void {
    if (!this.children.some((c) => c instanceof View)) return;
    let derives = EXTENT.get(this);
    for (const size of ["width", "height"] as const) {
      if (isSet(this, size) || ownerOf(this, size) !== null) continue;
      if (derives === undefined) EXTENT.set(this, (derives = {}));
      derives[size] = bindDerived(this, size, () => this.extentOf(size));
    }
  }

  private extentOf(size: "width" | "height"): number {
    const axis = AXIS_OF[size];
    let max = this.contentExtent(size);
    for (const c of this.children) {
      if (!(c instanceof View) || !c.visible) continue;
      if (percentOwned(c, axis) || percentOwned(c, size)) continue;
      const extent = c[axis] + c[size];
      if (extent > max) max = extent;
    }
    return max;
  }

  /** The default focus-traversal members of this view: its visible View
   *  children in source order (design-docs/input.md, Layer 2). The focus
   *  service descends into each; a view whose `tabOrder()` is not overridden
   *  uses this, so an all-default tree is pure tree preorder. An override may
   *  call it to compose ("the rest, minus X"). */
  tabDefault(): View[] {
    const out: View[] = [];
    for (const c of this.children) if (c instanceof View && c.visible) out.push(c);
    return out;
  }

  /** Internal focus notification, called by the focus service when this view
   *  gains (true) or loses (false) neo focus — SEPARATE from the user's
   *  `onFocus`/`onBlur` handlers, so a built-in component (TextInput) can drive
   *  its native element without occupying the author's event slot. No-op on a
   *  plain view. */
  focusChanged(_focused: boolean): void {}

  /** Retire this subtree: dispose every standing computation (bindings,
   *  percents, derives, a laid parent's constraints on these slots, the draw
   *  recording), run registered teardowns (a replicator's), uninstall the
   *  arrangement, and destroy the surfaces — so no data or attribute change
   *  can ever wake work for a removed view. Children first; the model links
   *  (parent/children) are the caller's to cut (Node.removeChild). */
  discard(): void {
    // Move focus off this subtree before it is torn down (input.md §mutation).
    focusDiscardHook?.(this);
    for (const child of this.children) {
      if (child instanceof View) child.discard();
    }
    const retire = RETIRE.get(this);
    if (retire !== undefined) {
      RETIRE.delete(this);
      for (const fn of retire) fn();
    }
    const undoLayout = INSTALLED.get(this);
    if (undoLayout !== undefined) {
      INSTALLED.delete(this);
      undoLayout();
    }
    disposeApplier(this);
    disposeBindings(this);
    this.drawing?.dispose();
    this.drawing = null;
    this.boxClip?.dispose();
    this.boxClip = null;
    const s = this.surface;
    this.surface = null;
    this.backend = null;
    s?.destroy();
  }

  /** Push this view's full visual state across the seam. Subclasses extend
   *  it with their capabilities (Text, Image); it runs before the children
   *  attach, so a backend that keeps content in arrival order (the DOM) gets
   *  exactly the paint order the Canvas walk uses: content, then children. */
  protected flush(s: Surface): void {
    s.setX(this.x);
    s.setY(this.y);
    s.setWidth(this.width);
    s.setHeight(this.height);
    s.setFill(this.fill);
    // Decoration beyond the flat fill is pay-per-use at the seam too: an
    // undecorated box exercises exactly the calls it always did (pushers
    // carry any post-attach change regardless).
    if (this.cornerRadius !== 0) s.setCornerRadius(this.cornerRadius);
    if (this.stroke !== null) s.setStroke(this.stroke);
    if (this.shadow !== null) s.setShadow(this.shadow);
    s.setVisible(this.visible);
    s.setOpacity(this.opacity);
    this.applyClip(this.clip);
    const sink = this.inputSink();
    if (sink !== null) s.setInput(sink);
    if (this.draw) this.bindDraw();
  }

  /** This view's input route, or null when it answers no pointer event —
   *  interactivity *derives* from declared handlers (Decisions §R5): a view
   *  with none is never wired (pay-per-use) and stays transparent to input,
   *  which is what lets a decorative child sit over an interactive parent
   *  without stealing its clicks (LZX's `clickable` intent, made automatic).
   *  A handler receives one plain event argument — the pointer position in
   *  this view's own coordinates. */
  private inputSink(): InputSink | null {
    const self = this as unknown as Record<string, unknown>;
    if (!POINTER_TYPES.some((t) => typeof self[handlerName(t)] === "function")) return null;
    return (type, x, y) => fireEvent(this, type, { x, y });
  }

  /** Stand up the draw method as a tracked, re-recording computation. */
  private bindDraw(): void {
    this.drawing = new Constraint(
      `${this.constructor.name}.draw`,
      () => record((d) => this.draw!(d)),
      // Constraint is deliberately untyped across compute→apply (reactive.ts);
      // this apply's input is exactly its compute's output.
      (list) => this.surface?.setDrawing(list as DisplayList),
      1
    );
    this.drawing.run();
  }

  /** Re-record right now — the explicit half of draw-on-invalidation (the
   *  attribute-driven half is the recording's own tracked reads). Also the
   *  entry point for a draw method assigned after attach. */
  invalidateDraw(): void {
    if (this.drawing !== null) this.drawing.run();
    else if (this.draw && this.surface !== null) this.bindDraw();
  }

  /** Realize the `clip` slot across the seam (the pusher and flush both land
   *  here). Any prior box-clip derive is torn down first, so a switch between
   *  the forms — true → a Shape path → false — never leaves two clips
   *  fighting. Pre-attach (surface null) it is a no-op; flush replays it once
   *  the surface exists.
   *    - `true`  → the framework box-clip derive (bindBoxClip);
   *    - a Shape string → that path, straight to the backend (shape-clip);
   *    - false / null   → no clip. */
  applyClip(clip: string | boolean | null): void {
    if (this.boxClip !== null) {
      this.boxClip.dispose();
      this.boxClip = null;
    }
    if (this.surface === null) return; // pre-attach: flush will replay this
    if (clip === true) this.bindBoxClip();
    else this.surface.setClip(typeof clip === "string" ? clip : null);
  }

  /** The box-clip: a framework primitive that owns its own subscription
   *  (constraints.md §3), NOT a user constraint and NOT a slot owner. It reads
   *  width/height as TRACKED reads and feeds the backend the box rect as a
   *  clip path (the form both backends already consume — canvas setClip/
   *  clipData, DOM clip-path), so the reactive core re-runs it whenever
   *  width/height change — that is what makes it track an animating tab height
   *  every frame. It writes straight to the surface (no reactive slot), so it
   *  can never wake anything or cycle. */
  private bindBoxClip(): void {
    const c = new Constraint(
      `${this.constructor.name}.clip (box)`,
      () => `M0 0 H${this.width} V${this.height} H0 Z`,
      // Constraint is untyped across compute→apply (reactive.ts); this
      // apply's input is exactly its compute's string output.
      (d) => this.surface?.setClip(d as string),
      1
    );
    this.boxClip = c;
    c.run();
  }
}

defineAttributes(View, {
  x: { def: 0, push: (v, n) => v.surface?.setX(n) },
  y: { def: 0, push: (v, n) => v.surface?.setY(n) },
  width: { def: 0, push: (v, n) => v.surface?.setWidth(n) },
  height: { def: 0, push: (v, n) => v.surface?.setHeight(n) },
  fill: { def: null, push: (v, f) => v.surface?.setFill(f), equal: fillEqual },
  cornerRadius: { def: 0, push: (v, r) => v.surface?.setCornerRadius(r) },
  stroke: { def: null, push: (v, st) => v.surface?.setStroke(st), equal: strokeEqual },
  shadow: { def: null, push: (v, sh) => v.surface?.setShadow(sh), equal: shadowEqual },
  visible: { def: true, push: (v, b) => v.surface?.setVisible(b) },
  opacity: { def: 1, push: (v, o) => v.surface?.setOpacity(o) },
  focusable: { def: false },
  focustrap: { def: false },
  clip: { def: null, push: (v, c) => v.applyClip(c) },
  // The prevailing built-ins: model-side on View (no push — Text's style
  // derive is the consumer that crosses the seam). Defaults are the
  // browser-native text defaults Text carried through R3–R9.
  textColor: { def: 0x000000, prevailing: true },
  fontSize: { def: 16, prevailing: true },
  fontFamily: { def: "sans-serif", prevailing: true },
  fontWeight: { def: "normal", prevailing: true },
  letterSpacing: { def: 0, prevailing: true },
  theme: { def: DEFAULT_THEME, prevailing: true },
  styles: { def: null },
  // The pusher installs appliers under a newly-providing view (existing
  // appliers re-run through their own tracked follow of this slot).
  stylesheet: { def: null, prevailing: true, push: (v) => stylesheetArrived(v) },
  layout: {
    def: null,
    // The install/uninstall side of the slot: detach the old arrangement
    // (releasing its ownership of child positions), stand up the new one over
    // the children present now. instantiate assigns it after the tree is
    // linked; a runtime swap goes through this same one path.
    push: (v, l) => {
      INSTALLED.get(v)?.();
      INSTALLED.delete(v);
      if (l !== null) INSTALLED.set(v, l.attachTo(v));
    },
  },
  // The cursor is model state: bindings read it (tracked), nothing renders it.
  datapath: { def: null },
});

/** The cursor in effect at `node`: the nearest ancestor-or-self datapath
 *  (language §9 — "descendants read fields relative to it"). Each level's
 *  slot is a tracked read, so a cursor appearing, changing, or clearing
 *  ANYWHERE on the chain wakes exactly the reads below it. */
export function inheritedCursor(node: Node | null): Cursor | null {
  for (let n = node; n !== null; n = n.parent) {
    if (n instanceof View) {
      const dp = n.datapath;
      if (dp !== null) return dp;
    }
  }
  return null;
}

/** Deliver `event` to `view`'s handler, if it has one — a method named
 *  `on<Event>` (instantiate installs language members; a TS subclass may
 *  simply define one). No propagation: the event belongs to exactly the view
 *  it fires on (Decisions §R5). Handlers are the sanctioned home of writes —
 *  whatever this call mutates rides the R4 scheduler: one settle, one frame. */
/** The focus service's teardown hook, registered by focus.ts. Kept as a seam so
 *  view.ts never imports focus.ts (one-directional import, no cycle); called at
 *  the top of discard() so focus moves off a subtree before it is torn down
 *  (design-docs/input.md §mutation during traversal). */
let focusDiscardHook: ((view: View) => void) | null = null;
export function setFocusDiscardHook(fn: (view: View) => void): void {
  focusDiscardHook = fn;
}

export function fireEvent(view: View, event: string, arg?: unknown): void {
  const h = (view as unknown as Record<string, unknown>)[handlerName(event)];
  if (typeof h === "function") h.call(view, arg);
}

/** The application root — the single visible tree, mapped to the stage
 *  (OpenLaszlo's `<canvas>`). R0 treats it as the root View; its stage-level
 *  behavior and singleton identity grow in later rungs. */
export class App extends View {}
