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
  /** Uniform paint-only scale about (pivotX, pivotY), the view's own
   *  coordinates (default the top-left corner); 1 = no transform. Spring it for
   *  zoom effects — it never affects layout, exactly like opacity. */
  declare scale: number;
  declare pivotX: number;
  declare pivotY: number;
  declare scrolls: boolean;
  declare scrollsX: boolean;
  declare scrollY: number;
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
  /** Rich-text STRUCTURE style, prevailing: a `Markdown`/`HTMLText` renders its
   *  headings/links/inline-code from these; a plain View just carries them for
   *  its rich-text descendants. Colours are `null` = the theme-aware house token;
   *  `headingWeight` defaults to the house `bold`. */
  declare headingColor: Color;
  declare headingWeight: FontWeight;
  declare linkColor: Color;
  declare codeColor: Color;
  /** Native text selection, prevailing: `selectable = true` on a container opts
   *  its whole subtree back into browser selection/copy (Text acts on it; a
   *  `Markdown` component's runs inherit it). Off by default — the app is a UI. */
  declare selectable: boolean;
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

  /** Write `v` to `path` relative to this view's inherited cursor — the write
   *  twin of `$data`, the runtime half of a two-way `<->` binding (language §9,
   *  the leaf-input exception). Lands through `Dataset.set` (equality-gated →
   *  the read side that fed the field re-reads the same value and stops at the
   *  gate, so committing a draft is a no-op round-trip, not a loop). A datapath
   *  that resolves to no dataset is a no-op — there is nowhere to write. */
  $setData(path: string, v: unknown): void {
    const cursor = inheritedCursor(this);
    if (cursor === null) return;
    cursor.data.set([...cursor.path, ...splitPath(path)].join("."), v);
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
   *  zero-cost default; Dataset children are not geometry). Protected so the
   *  App can retarget it from content to its host. */
  protected bindExtent(): void {
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

  /** The bounding-box extent of this view's visible children on each axis — the
   *  same value auto-extent derives into an *unset* size slot (`extentOf`),
   *  surfaced as read-only reactive attributes (schema.ts marks them readOnly,
   *  so a set is a compile error) so a constraint can CLAMP a size:
   *  `height = { Math.min(classroot.contentHeight, 480) }`. Reading either from
   *  a size constraint is loop-free — `extentOf` excludes percent-bound children
   *  on the derived axis, the same cycle guard auto-extent relies on. Always
   *  live, and independent of this view's own width/height. */
  get contentWidth(): number { return this.extentOf("width"); }
  get contentHeight(): number { return this.extentOf("height"); }

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
  override discard(): void {
    // Move focus off this subtree before it is torn down (input.md §mutation).
    focusDiscardHook?.(this);
    // EVERY child, not just Views: an Animator/Spring child is a Node, and its
    // `to`/`attribute` bindings must be disposed too (else they leak, subscribed
    // to whatever they read — e.g. a Spring `to = { app.openSection … }`).
    for (const child of this.children) child.discard();
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
    if (this.scale !== 1 || this.pivotX !== 0 || this.pivotY !== 0)
      s.setScale(this.scale, this.pivotX, this.pivotY);
    this.applyClip(this.clip);
    if (this.scrolls) s.setScroll(true, (y) => { this.scrollY = y; });
    if (this.scrollsX) s.setScrollX(true);
    const sink = this.inputSink();
    if (sink !== null) s.setInput(sink);
    if (this.draw) this.bindDraw();
  }

  /** Scroll this view to the top of its nearest scrolling ancestor — the
   *  imperative companion to the reactive `scrolls`/`scrollY` pair (a click
   *  handler calls it to jump to a target). Both backends do the work in their
   *  Surface; a no-op before attach or with nothing scrolling above. (Named for
   *  the platform primitive — `reveal` is deliberately left free as a member name,
   *  e.g. a `reveal:` fade-in Spring.) */
  scrollIntoView(): void {
    this.surface?.scrollIntoView();
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
  // Scale + pivot ride one transform at the seam: any of the three re-pushes
  // the combined value (transform + transform-origin on the DOM).
  scale: { def: 1, push: (v) => v.surface?.setScale(v.scale, v.pivotX, v.pivotY) },
  pivotX: { def: 0, push: (v) => v.surface?.setScale(v.scale, v.pivotX, v.pivotY) },
  pivotY: { def: 0, push: (v) => v.surface?.setScale(v.scale, v.pivotX, v.pivotY) },
  focusable: { def: false },
  focustrap: { def: false },
  clip: { def: null, push: (v, c) => v.applyClip(c) },
  // Scroll container: enabling it wires the backend's native scroll and feeds
  // the user's offset back into `scrollY` (a plain reactive write — no push, so
  // it never echoes to the surface; reads drive fades/reveals).
  scrolls: { def: false, push: (v, on) => v.surface?.setScroll(on, (y) => { v.scrollY = y; }) },
  scrollsX: { def: false, push: (v, on) => v.surface?.setScrollX(on) },
  scrollY: { def: 0 },
  // The prevailing built-ins: model-side on View (no push — Text's style
  // derive is the consumer that crosses the seam). Defaults are the
  // browser-native text defaults Text carried through R3–R9.
  textColor: { def: 0x000000, prevailing: true },
  selectable: { def: false, prevailing: true },
  fontSize: { def: 16, prevailing: true },
  fontFamily: { def: "sans-serif", prevailing: true },
  fontWeight: { def: "normal", prevailing: true },
  letterSpacing: { def: 0, prevailing: true },
  // Rich-text structure overrides — consumed by Markdown/HTMLText (null colour =
  // the theme-aware house token; headingWeight = the house bold).
  headingColor: { def: null, prevailing: true },
  headingWeight: { def: "bold", prevailing: true },
  linkColor: { def: null, prevailing: true },
  codeColor: { def: null, prevailing: true },
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

/** The application root — the single visible tree at the top (OpenLaszlo's
 *  `<canvas>`). R0 treats it as the root View; it fills its host by default and
 *  carries the app's reactive environment (host extent, scroll, pointer). */
export class App extends View {
  /** `hostWidth`/`hostHeight` — the App's enclosing extent (the window at top
   *  level, the container element when embedded), fed by the runtime at mount
   *  (index.ts). READ-ONLY intrinsics (schema.ts marks them so; a set is a
   *  compile error) — the App's own `width`/`height` DEFAULT to them (bindExtent
   *  below), so the common app just fills, and a size that is a function of the
   *  host (aspect-locked, "as large as fits") reads them: `width = { Math.min(
   *  hostWidth, hostHeight * 1.6) }`. Parallels View's `contentWidth`/
   *  `contentHeight` — a box's size defaults to a read-only extent, content for a
   *  view, host for the App. `scrollY`/`pointer*` are the app's scroll+pointer
   *  environment, also fed at mount. */
  declare hostWidth: number;
  declare hostHeight: number;
  declare scrollY: number;
  declare pointerX: number;
  declare pointerY: number;
  declare hovering: boolean;
  /** True while the free pointer is over a native text-editing surface (a text
   *  input / textarea / contenteditable — e.g. an editable HTML island). A
   *  custom app cursor reads it to YIELD to the I-beam over a text field:
   *  `cursor: View [ visible = { !classroot.pointerOverText } ]`. */
  declare pointerOverText: boolean;
  /** The OS colour-scheme preference (`prefers-color-scheme: dark`), fed live by
   *  the runtime. Theme an app off it: `fill = { app.dark ? 0x0B141B : 0xFFFFFF }`
   *  or drive a `theme` record from it. Read-only to user code. */
  declare dark: boolean;
  /** The shipping page's over-the-wire size in KB (gzipped) and its Declare
   *  source line count — provided by the host/build (see index.ts note), 0
   *  until set. Reactive reads: a stat bound to them settles when they land. */
  declare pageWeight: number;
  declare sourceLines: number;
  /** Set true by the page (a "view source" affordance) to ask the host to open
   *  its whole-page source editor — the one sanctioned app→host signal, kept a
   *  plain reactive flag so bodies stay DOM-free. */
  declare editing: boolean;
  /** Names which source the host loads when `editing` opens: a demo key (a
   *  card's "View & Edit Source" sets it) or "" for the whole page. Read by the
   *  host, reset on close — same DOM-free app→host channel as `editing`. */
  declare editSource: string;
  /** Host↔app data channel for the live demo cards (bodies stay DOM-free):
   *  `demoSources` = a name→source map the host seeds every editor from;
   *  `liveSource`/`liveCard` = the text an edit publishes for the host to
   *  recompile that card's preview. See design/language-learnings.md §11–12. */
  declare demoSources: Record<string, unknown>;
  declare liveCard: string;
  declare liveSource: string;
  /** app→host navigation: set to a URL by a link/button; the host opens it and
   *  resets to "" — same DOM-free app→host channel as `editing`. */
  declare navigate: string;

  /** The App's auto-extent is the HOST, not its content: an unset width/height
   *  follows hostWidth/hostHeight (reactive on resize), so the root app fills its
   *  enclosing area with no declaration — the near-universal case. An explicit
   *  `width = …` still wins (isSet skips the derive), and there is no children
   *  guard: the app fills its host even while empty. This is the exact yielding
   *  default the content path uses (View.bindExtent), retargeted from content to
   *  host — so a resize repaints like any dependency. */
  protected bindExtent(): void {
    let derives = EXTENT.get(this);
    for (const size of ["width", "height"] as const) {
      if (isSet(this, size) || ownerOf(this, size) !== null) continue;
      if (derives === undefined) EXTENT.set(this, (derives = {}));
      derives[size] = bindDerived(this, size, () => (size === "width" ? this.hostWidth : this.hostHeight));
    }
  }
}

defineAttributes(App, {
  // Stored reactive slots the runtime feeds (index.ts). Read-only to USER code
  // via schema.readOnly (a compile error) — not `readOnly: true` here, which
  // would throw the setter the runtime feed needs. `width`/`height` default to
  // these (bindExtent above).
  hostWidth: { def: 0 },
  hostHeight: { def: 0 },
  scrollY: { def: 0 },
  pointerX: { def: 0 },
  pointerY: { def: 0 },
  hovering: { def: false },
  pointerOverText: { def: false },
  dark: { def: false },
  pageWeight: { def: 0 },
  sourceLines: { def: 0 },
  editing: { def: false },
  editSource: { def: "" },
  demoSources: { def: {} },
  liveCard: { def: "" },
  liveSource: { def: "" },
});

/** HTML — a foreign-content island (design: the `HTML [ … ]` view). A leaf View
 *  whose box neo lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the neo-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. (Canvas backend realizes the same island as a positioned DOM overlay
 *  — setEmbed is a no-op there for now.) */
export class Html extends View {
  declare slot: string;

  protected flush(s: Surface): void {
    super.flush(s);
    if (this.slot !== "") s.setEmbed(this.slot);
  }
}

defineAttributes(Html, {
  slot: { def: "", push: (v, id) => v.surface?.setEmbed(id) },
});
