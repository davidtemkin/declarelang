import { Node } from "./node.js";
import { type Backdrop, type BoxStroke, type Fill, type FilterValue, type Inset, type Mask, type Radius, type Shadow } from "./value.js";
import { type RenderBackend, type Surface } from "./backend.js";
type ViewCreator = (root: View, tag: string, parent: View, props?: Record<string, unknown>) => View;
export declare function provideViewCreator(fn: ViewCreator): void;
/** The PROGRAM'S CLASS TABLE, as rich text's inline views need it (rich-text.ts):
 *  which names a tag in flowing content may claim, what each attribute's
 *  declared type is, and how to make one. The same injection seam as the view
 *  creator above, and for the same reason — the rich-text engine must not import
 *  the instantiator. A tree not built from a program has no table, and an inline
 *  view then never resolves (a tag stays plain text).
 *
 *  Small on purpose: the mechanism that RESOLVES a tag, converts its attributes
 *  and reconciles the views lives with rich text, which only ships when a program
 *  uses Markdown/HTMLText. What has to live in always-shipped code is just this
 *  lookup. */
export interface InlineViewHost {
    /** Is `name` a VIEW class this program declares? Exact, case-sensitive — and
     *  only the program's own classes, never a built-in tag. */
    declares(name: string): boolean;
    /** The declared type of attribute `name` on class `cls` (an AttrType from
     *  value.ts), or null when the class has no such attribute. */
    attrType(cls: string, name: string): AttrType | null;
    /** Is `cls.name` a read-only slot — computed from its declaration, never
     *  assignable? A tag that names one is refused (through the rich text's
     *  `unsupported` policy) instead of throwing from the setter mid-render. */
    readOnly(cls: string, name: string): boolean;
    /** Make one instance of `cls` under `parent`: a full citizen (bindings
     *  installed, `onInit` fired, discard reachable), with `attrs` — the tag's
     *  attributes, as literals — joining the instantiation as THE USE-SITE LAYER
     *  of the ordinary attribute merge, so a tag attribute beats a class body's
     *  set of the same slot (literal or `{ }` constraint) and only the winner
     *  installs. `provides` lands BEFORE the instance attaches — which is what
     *  lets its body inherit the surrounding run's text face. */
    create(parent: View, cls: string, attrs: readonly Attr[], provides: Record<string, unknown>): View;
}
export declare function provideInlineViewHost(fn: (root: Node) => InlineViewHost | null): void;
/** The class table for the program `v` belongs to, or null (no program). */
export declare function inlineViewHost(v: View): InlineViewHost | null;
import { type Draw } from "./draw.js";
import { Constraint } from "./reactive.js";
import { type Affine } from "./affine.js";
import { type AttrType } from "./value.js";
import { type BoundaryValues } from "./boundary.js";
import type { Attr, LinkTarget } from "./parser.js";
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
    /** A kernel-placed stack stops writing at once (its child list changed inside a settle). */
    $retireNative?(): void;
}
export { onDiscard } from "./node.js";
/** Is this view's replicated content currently windowed? The UNTRACKED read,
 *  for the layout kernel (its pass suspends while windowing owns placement)
 *  and other internals that must not subscribe. */
export declare function isWindowedBlock(v: View): boolean;
/** The tracked read behind `View.virtualized`. */
export declare function readVirtualized(v: View): boolean;
export declare function markWindowedBlock(v: View, on: boolean): void;
/** The tracked read behind `View.rowIndex`. */
export declare function readRowIndex(v: View): number;
export declare function setRowIndex(v: View, index: number): void;
export declare function markEvicting(v: View): void;
/** A retired subtree RECYCLED onto a new member (replicate.ts departure
 *  recycling) can retire again when that membership ends. */
export declare function clearRetiredTree(v: View): void;
/** Run `fn` (a build) with `values` as the host values its root App starts
 *  with. What makes a hosted program's first evaluation see what its host
 *  provides — a DataSource url or anything else evaluated at instantiate
 *  runs before any link could deliver them. */
export declare function withHostProvides<T>(values: Readonly<Record<string, unknown>> | undefined, fn: () => T): T;
export declare function fireRetireTree(v: View): void;
/** Fire the membership-anchored `init` down an EXISTING subtree — the
 *  RECYCLED-instance arrival (replicate.ts): a live row re-pointed at a
 *  record whose presence episode is new fires that MEMBER's init without a
 *  reconstruction, the exact mirror of suppressInit on a rebuilt member
 *  whose episode continues. Parent-first, like construction's own order. */
export declare function fireInitTree(v: View): void;
export declare class View extends Node {
    /** The navigation target the compiler's link extraction (links.ts) found for
     *  this instance's activation handler — stamped by instantiate from the source
     *  element's `link`. Read only by the static extractor (static-html.ts) to wrap the
     *  subtree in `<a href>`; undefined for all but the handful of navigable views. */
    _navLink?: LinkTarget;
    x: number;
    y: number;
    width: number;
    height: number;
    /** THE CONTENT BOX — the inset between this view's own box and the room its
     *  children live in. One number insets all four sides; four are
     *  [top, right, bottom, left], clockwise from the top (the Inset house
     *  shape, value.ts). 0 by default, and a view that never names it is
     *  byte-identical to one that could not.
     *
     *  A VIEW WITH PADDING HAS AN INSIDE, and `x = 0` / `y = 0` mean that
     *  inside's origin — for EVERY child: one a layout laid, one that placed
     *  itself, one with `ignoreLayout = true`. There is no CSS-style split where
     *  an absolutely-positioned child ignores the inset (RULED 2026-09-19); the
     *  content origin is a property of the parent, and a child's position is
     *  measured in it. `100%` (and every percent) resolves against the content
     *  box too; `{ parent.width }` is the deliberate escape hatch that still
     *  means the parent's literal box, and an edge-to-edge child pairs it with a
     *  negative `x`.
     *
     *  PAINT DOES NOT MOVE. `fill`, `stroke` (per side included), `cornerRadius`
     *  and `draw()` are all this view's OWN box — a card's background still
     *  covers its padding — and the inset lives in this view's own coordinate
     *  space, so it scales and rotates with the box like any other geometry.
     *
     *  It is NOT the layout's: a layout arranges within the room it is given
     *  (`Layout.contentExtent`), and a padded view with no layout at all still
     *  has an inside. */
    /** @internal kernel-facing (the native visibility rule): a numeric mirror of scrolls, and the rule's outputs. */
    scrollsOn: boolean;
    visOn: boolean;
    visScale: number;
    visX: number;
    visY: number;
    visW: number;
    visH: number;
    visMode: number;
    /** The names this app EXPOSES to whatever hosts it — its own attributes,
     *  read by a host island's `exposed(…)` or a page's `app.exposed(…)`. */
    exposes: readonly string[];
    padding: Inset;
    /** @internal The inset TOTALS, one per axis (left+right, top+bottom) — the
     *  content box as two numeric slots, so a kernel expression can read it the
     *  way it reads any other slot (`parent.insetX`). Maintained by `padding`'s
     *  push below; authored nowhere. */
    insetX: number;
    insetY: number;
    /** What paints this view's box: a solid Color (null = paint nothing) or a
     *  Gradient — the ruled `fill` slot, subsuming the retired backgroundColor. */
    fill: Fill;
    /** The painted box's corner radius (0 = square). Shapes the PAINT only —
     *  clipping stays the explicit `clip` attribute (the recorded lean). */
    cornerRadius: Radius;
    /** A border drawn INSIDE the box (never layout); null = none. One Stroke
     *  borders all four sides; four — [top, right, bottom, left], clockwise from
     *  the top, `null` for a bare side — border them one at a time. */
    stroke: BoxStroke;
    /** The box's drop shadow (cast by the border box, CSS semantics — never
     *  painted under the box itself); null = none. */
    shadow: Shadow | null;
    visible: boolean;
    opacity: number;
    /** Opt out of the parent's LAYOUT (this child owns its own position; the
     *  arrangement skips it) — the decoration/overlay case. */
    ignoreLayout: boolean;
    /** Take an equal share of the room the parent's layout leaves along its
     *  flow axis: the layout sizes this child along the flow (height in a
     *  column, width in a row); across the flow it is aligned like any other
     *  child. A `Spacer` is an empty view that flexes. */
    flexes: boolean;
    /** Opt out of the parent's CLIP (outside the parent's frame this child
     *  still paints and still hits) and of its auto-extent — frame chrome that
     *  straddles the frame. Parent-scoped: ancestors' clips still apply. */
    ignoreClip: boolean;
    /** Opt out of the nearest enclosing SCROLL regime: this child rides the
     *  scroll frame (the window at the page altitude, the pane's frame inside a
     *  `scrolls` view) and contributes nothing to the scroll range. The fixed
     *  header, the pinned toolbar, the overlay layer. */
    ignoreScroll: boolean;
    /** The pointer cursor while over this view (a CSS cursor keyword —
     *  "ew-resize", "col-resize", "pointer", …; "" = inherit). Meaningful on
     *  views that take input: the sink is the hit target on both backends. */
    cursor: string;
    /** "none" makes this view and its subtree transparent to the pointer, so
     *  presses fall through to whatever is behind (an overlay's rule). "" /
     *  "auto" = the normal behaviour. */
    pointerEvents: string;
    /** Uniform paint-only scale about (pivotX, pivotY), the view's own
     *  coordinates (default the top-left corner); 1 = no transform. Spring it for
     *  zoom effects — it never affects layout, exactly like opacity. */
    scale: number;
    pivotX: number;
    pivotY: number;
    /** Rotation in DEGREES, clockwise, about (pivotX, pivotY) — paint-only,
     *  like `scale`, whose pivot it shares (scale-then-rotate, one documented
     *  order). Layout never rotates; hit-testing follows the visible result
     *  through the inverse transform. */
    rotation: number;
    /** Per-axis scale (multiplied with the uniform `scale`) and skew in
     *  degrees — the affine completion of the transform (graphics-pass.md §5).
     *  `scaleY = 0.2` squashes a card to a sliver without changing its width;
     *  `skewX = 12` shears it. Same pivot, same one-geometry rule. */
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
    /** The third dimension (graphics-pass.md §6): rotations about X and Y in
     *  degrees and a push along Z, about the pivot, projected through the
     *  PARENT's `perspective` (0 = orthographic). `backface = hidden` hides a
     *  view showing its back. Paint and the hit walk agree (projective.ts). */
    rotateX: number;
    rotateY: number;
    translateZ: number;
    perspective: number;
    backface: "visible" | "hidden";
    /** Does this view leave its plane? */
    $is3D(): boolean;
    /** This view's paint transform as one matrix, local → parent (before the
     *  view's own x/y): what every reader composes and inverts. */
    $localTransform(): Affine;
    /** The compositing operator this view LANDS with against what has already
     *  painted beneath it within the nearest isolating ancestor (compositing.md
     *  §4.1 — the App root, a group-opacity subtree, a scroller's content
     *  group, an island boundary; plain containers are transparent to
     *  blending). `normal` = plain painting. A blending view blends as a unit,
     *  children included; paint only — hit testing and focus never change. */
    blend: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "colorDodge" | "colorBurn" | "hardLight" | "softLight" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity" | "plusLighter";
    /** The frost (`frost(radius, saturation?)`; null = none): what has already
     *  painted beneath this view, sampled through a blur within the view's own
     *  painted shape — the view's `fill` then paints OVER the frosted sample,
     *  the platform-material shape. Paint only, never input. */
    backdrop: Backdrop | null;
    /** The view's own painted subtree, filtered as a group (graphics-pass.md
     *  §1): one filter or a list — `blur(3)`, `[blur(2), brightness(0.8)]`,
     *  `shadow(…)` for a shadow of the group's alpha, `tint(c)` for the group's
     *  alpha in one colour. Lengths in view units. Paint only, never input. */
    filter: FilterValue;
    /** A soft alpha mask (graphics-pass.md §2): a gradient's alpha over the
     *  box, or a stencil view (`mask = { stencil }`) whose painted alpha,
     *  placed by its own x/y inside this box, masks the subtree. Applied after
     *  clip, before opacity. Paint only, never input. */
    mask: Mask | null;
    /** Views masked BY this one (it is their stencil) — re-pushed when this
     *  view attaches, since a stencil declared after (or inside) the masked
     *  view has no surface at the masked view's own push. */
    private maskUsers;
    /** Push the mask to the seam; a stencil rides as the live view itself. */
    $applyMask(m: Mask | null): void;
    /** Which axes of interior overflow this view scrolls — `"none"` (the View
     *  default), `"y"`, `"x"`, or `"both"`. Overflow along a declared axis
     *  becomes scroll range; along any other axis it is out of frame. */
    scrolls: "none" | "y" | "x" | "both";
    /** The axis a declared drag claims (`claim = x | y | both`; D8 RULED —
     *  claim-surface.md's axis-scoped drag claim). Read into InputWants at
     *  attach; `both` is the whole-gesture claim drags always had. */
    claim: "both" | "x" | "y";
    /** The tooltip text (planes.md tier 1 — one attribute at the use site). A
     *  non-empty tip wires this view's hover into the Tooltips service; the
     *  auto-included Tooltip singleton renders it. "" = no tip. */
    tooltipLabel: string;
    defaultplacement: string;
    scrollY: number;
    scrollX: number;
    scrollStartY: number;
    scrollStartX: number;
    scrolling: boolean;
    scrollAnchor: string;
    /** Keyboard focus (docs/system-design/input.md, Layer 2). `focusable` = a tab stop;
     *  `focusTrap` = a self-contained focus group. Traversal order is the tree,
     *  overridable per view by defining a `tabOrder()` method. */
    focusable: boolean;
    focusTrap: boolean;
    anchor: string;
    /** The linking triple (location.md §0): `link` — this view IS a link to the
     *  reference ("" = not a link); `replace` — following it overwrites the
     *  current history entry; `shows` — this view manifests the named location
     *  (its visibility is lowered to a `visible` binding at instantiation). */
    link: string;
    replace: boolean;
    shows: string;
    /** Clip the subtree (paint AND hit-test). Two forms on one slot: a Shape
     *  string clips to that SVG path (view-local coordinates); the boolean
     *  box-clip `true` clips to the view's own box (0,0,width,height), tracking
     *  width/height reactively so it follows an animating height every frame
     *  (tabslider-gaps.md gap 1); false/null = no clip. */
    clip: string | boolean | null;
    /** How this view arranges its children (language §5: a reactive slot, not
     *  a child and not a container type); null = none — absolute x/y. Written
     *  as the member `layout: SimpleLayout [ … ]`; assigning swaps the live
     *  arrangement (the pusher below), so the doc's "swap it" is a plain
     *  write. Purely model-side: the strategy's constraints move children, and
     *  those pushes cross the seam — the slot itself never does. */
    layout: LayoutStrategy | null;
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
    draw?: (d: Draw) => void;
    /** The enclosing class instance — the node this view was *written* inside
     *  (a named class's root, or the App root, whose whole tree is the
     *  anonymous App class, language §5/§11): a class-body child points at its
     *  class instance; a class instance itself (and any use-site child) points
     *  at the OUTER scope, since its element is written in the outer body.
     *  Structure, like `parent` — set once by instantiate, not reactive. Null
     *  on the root and on hand-built trees. */
    classroot: View | null;
    /** This view's handle on the render backend — null until attached. */
    $surface: Surface | null;
    /** The backend this view attached on — what lets a view that arrives
     *  AFTER attach (a replicated instance, R8) realize itself into the live
     *  tree. Null until attached. */
    $backend: RenderBackend | null;
    /** The draw method's standing recording (null until one exists). Phase 1:
     *  it re-records only after value constraints settle, so a draw body
     *  always sees consistent attributes. @internal read by the visibility
     *  feed, which lands a drawing's resolution (visibility.ts). */
    $drawing: Constraint | null;
    /** Realize this view and its subtree on a backend: create the surface,
     *  flush the current visual state across the seam, parent it (before
     *  `before` when the tree is mutating mid-list — R8; null appends), and
     *  recurse. This is the substrate-agnostic render pass — View touches only
     *  the Surface API. After this, the attribute setters push changes to the
     *  live surface one Surface call at a time. */
    $attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    /** Read data relative to this view's inherited cursor — the runtime form
     *  every `:path` in a `{ }` body resolves to. The COMPILER emits the
     *  pre-parsed segments (`:location.city` → `this.$data(["location","city"])`,
     *  compile.ts resolveBody — data-paths.md §5's emitted plans); the string
     *  form remains for hand-written calls and the direct-instantiate dev path
     *  (expr.ts's link-time rewrite). Tracked like any read: the binding wakes
     *  when exactly this region — or any datapath on the chain above — changes.
     *  An unresolved path yields null (language §9). */
    /** Write `v` to `path` relative to this view's inherited cursor — the write
     *  twin of `$data`, the runtime half of a two-way `<->` binding (language §9,
     *  the leaf-input exception). Lands through `Dataset.set` (equality-gated →
     *  the read side that fed the field re-reads the same value and stops at the
     *  gate, so committing a draft is a no-op round-trip, not a loop). A datapath
     *  that resolves to no dataset is a no-op — there is nowhere to write.
     *  Accepts pre-parsed segments like $data, for symmetry. */
    $setData(path: string | readonly string[], v: unknown): void;
    /** The tree-mutation entry (R8): children were inserted/removed/reordered
     *  as a unit — re-arm the installed arrangement and re-derive auto-extent,
     *  once per burst (the replicator calls this once per reconcile, not per
     *  child). A replicated block arriving under a never-sized view can also
     *  make a slot newly derivable — bindExtent picks it up.
     *
     *  Inside a settle the work runs ONCE per view, at the settle's close: the
     *  parts a row's states build arrive one at a time, and each would otherwise
     *  tear down and reinstall the arrangement and re-derive the extent. The
     *  close is still before anything paints, and whatever read the interim
     *  geometry re-runs when the arrangement lands — the result is the one the
     *  final child list gives either way. */
    private $mutationQueued;
    private $tornDown;
    $childrenMutated(): void;
    private $applyChildrenMutated;
    /** This view's own content's extent on a size axis, folded into the
     *  auto-extent max — 0 for a plain view; Image overrides with the bitmap's
     *  natural size. Runs under tracking, so an override may read reactive
     *  state (Image reads `loaded`). */
    protected $contentExtent(_size: "width" | "height"): number;
    /** A windowed block's whole logical extent when this view is the scroller
     *  its rows sit in directly (replicate.ts): the rows that exist are only the
     *  window, so `contentHeight` takes the block's extent as its floor — the
     *  same range every renderer's scroll already spans. A change wakes the
     *  child-list cell extentOf already watches, so no other view pays for it. */
    private $virtualHeight;
    /** A DRAGGED VIEW SIZES ITS CONTAINERS FROM WHERE IT WAS PICKED UP. While
     *  the press that drags it lasts, extentOf counts this view at its box at
     *  the press, not where the hand has taken it: a container neither grows
     *  after the drag (a scroller's range would grow ahead of autoscroll, which
     *  would chase it into empty room) nor collapses (a box sized by the very
     *  card being lifted). The drop is the program's: whatever the release
     *  writes is counted from then on. */
    private $pressHome;
    private $dragHome;
    private $freezeHome;
    $setVirtualExtent(h: number | null): void;
    /** Install auto-extent derives for whichever never-set, unowned size slots
     *  qualify — only on views with View children (a childless view keeps its
     *  zero-cost default; Dataset children are not geometry). Protected so the
     *  App can retarget it from content to its host. */
    protected $bindExtent(): void;
    private extentRelistQueued;
    /** THE KERNEL'S AUTO-EXTENT (kernel.md, the layout-pass item): the same
     *  max over the children's footprints as extentOf, evaluated natively over
     *  the table — a container with many children re-derived per frame was half
     *  the calendar's settle on the interpreter. The rule's edges are the
     *  children's geometry cells plus the child-list cell; childrenMutated
     *  re-lists them. Null (the JS derive) when the view measures its own
     *  content (Image) or a child is out of the plane; a child turning 3D
     *  later DECLINES the rule and the JS derive takes over then. */
    private $installKernelExtent;
    /** The kernel auto-extent's word list: the child-list cell, this view's inset
     *  cell on the axis, then each View child's numeric block base (the rule
     *  reads its slots by base). */
    private $extentWords;
    private $extentOf;
    /** THIS VIEW'S CONTENT ORIGIN, in its own coordinates: the leading insets of
     *  `padding`. Every child's `x`/`y` is measured from here — laid,
     *  self-placing and `ignoreLayout` alike — which is what makes the content
     *  box a property of the view rather than of whatever arranges it. */
    $contentOrigin(): {
        x: number;
        y: number;
    };
    /** THE ROOM INSIDE: this view's extent on `size` less both of `padding`'s
     *  insets on that axis, never below 0. It is what `100%` and every other
     *  percent resolves against (bind.ts bindPercent), what a layout divides
     *  (`Layout.contentExtent` is this, through the arranged view), and what a
     *  class spanning its parent's content reads (library Divider).
     *  `{ parent.width }` deliberately still answers the parent's literal box —
     *  "the space I am given" versus "the parent's own width". */
    contentBox(size: "width" | "height"): number;
    /** @internal THE ORIGIN SHIFT, at the seam: what this view's own `x`/`y` is
     *  measured from in the coordinates its SURFACE lives in — its position
     *  host's content origin on that axis. The host is the parent, or the
     *  scroller this view travels with (travelWith re-hosts the surface, and the
     *  position slots then mean that scroller's content coordinates).
     *
     *  One number, not a point, and an early literal 0 for the unpadded case:
     *  this runs on every position push, which is every frame of every animated
     *  or laid-out view in the tree. */
    $positionLead(axis: "x" | "y"): number;
    /** The bounding-box extent of this view's visible children on each axis — the
     *  same value auto-extent derives into an *unset* size slot (`extentOf`),
     *  surfaced as read-only reactive attributes (schema.ts marks them readOnly,
     *  so a set is a compile error) so a constraint can CLAMP a size:
     *  `height = { Math.min(classroot.contentHeight, 480) }`. Reading either from
     *  a size constraint is loop-free — `extentOf` excludes percent-bound children
     *  on the derived axis, the same cycle guard auto-extent relies on. Always
     *  live, and independent of this view's own width/height. */
    get contentWidth(): number;
    get contentHeight(): number;
    /** This view's TRANSFORMED box in the parent's coordinates — the axis-aligned
     *  bounding box of the frame under scale-then-rotate about the pivot, the
     *  same F(p) = pivot + s·R(p−pivot) that paint, the hit walk, and the root
     *  walk compose (interaction.ts `toChildLocal` is its inverse). THE
     *  FOOTPRINT: what a layout packs and what auto-extent measures, so a
     *  `scale = 0.5` child really occupies half its slot (the fractal idiom) and
     *  a rotated card reserves the box it visibly covers. Identity when
     *  scale = 1 and rotation = 0 — the box IS x/y/width/height, at no cost.
     *  Every read is reactive (x, y, width, height, scale, pivotX, pivotY,
     *  rotation — the effects row in the compiler names exactly these), so a
     *  constraint or a place() reading it re-derives as any of them move. */
    bounds(): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /** The POSITION-FREE half of `bounds()`: the transformed box relative to
     *  this view's own untransformed origin — `x`/`y` here are the lead offsets
     *  the transform introduces (0 when untransformed; negative when a
     *  centered-pivot scale-up grows past the origin), `width`/`height` the
     *  footprint extents. Reads ONLY width, height, scale, pivotX, pivotY,
     *  rotation — never `x`/`y` — which is what a layout's place() must consume:
     *  a strategy that read a slot it writes would wake itself and break the
     *  one-pass discipline (pinned by the re-layout test). `bounds()` is this
     *  plus the position, for every reader that is not writing the position. */
    footprint(): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /** This view's View children — the reactive read of the child list, and the
     *  only one there is: `children` is a plain array (machinery included, and
     *  unlike the DOM's `children` it is NOT pre-filtered), so reading it in a
     *  `{ }` tracks nothing and freezes. This wakes on arrival and removal, which
     *  is what a container populated by replication or `createView` needs.
     *
     *  Set membership only — the cell does not carry a child's own attributes, so
     *  `.length` is live while `.map(c => c.width)` would wire half of what it
     *  reads. Aggregation over a node collection is refused for exactly that
     *  reason (dep-extract); the number you want is usually in the data. */
    get childViews(): readonly View[];
    /** Is this view's replicated content virtualized right now? Read-only, and
     *  TRACKED — the policy takes a `{ }`, so a block can engage and disengage
     *  while the program runs, and a constraint reading this follows it.
     *
     *  This is what makes `childViews` legible on a virtualized block: the list
     *  is the instances that exist, which is a subset, and this says so. Counts
     *  of the collection still come from the DATA, which is complete by
     *  definition — but that is now a thing you can see rather than a rule the
     *  runtime enforces by refusing to answer. */
    get virtualized(): boolean;
    /** This view's index in the array its replication presents — 0 for the
     *  first record, following the record as others arrive and leave; -1 on a
     *  view no replication made. A fact: read-only, and a constraint reading it
     *  re-runs when the row's place changes. */
    get rowIndex(): number;
    /** Pointer-interaction intrinsics (interaction.ts): `hovered` is true while
     *  this view is on the live hit chain — the topmost visible view under the
     *  pointer and its ancestors, occlusion-correct, false on touch; `pressed`
     *  while it is on the chain captured at pointer-down (a mouse press releases
     *  dragged off, re-arms dragged back; a touch press holds while down).
     *  Read-only reactive intrinsics like `contentWidth` (schema readOnly — a
     *  set is a compile error); reading one from a constraint subscribes it.
     *  Pay-per-use: a program that never reads them allocates nothing.
     *
     *  A view that declares `disabled` (every Control) answers under that
     *  policy: while disabled it is neither hovered nor pressed, so a disabled
     *  control never lights up under the pointer. And a view's own `flash` — a
     *  Control's keyboard activation (Space/Enter) — reads as pressed, so the
     *  keyboard shows the same look a pointer press does. One pair of facts,
     *  styled against everywhere. */
    get hovered(): boolean;
    get pressed(): boolean;
    /** Is this view ON SCREEN — inside the viewport, not scrolled away, not in
     *  a hidden subtree? A COARSE fact that flips at threshold crossings, so
     *  binding it costs a re-derive only when the answer changes — the cheap
     *  way for a view to know it can't be seen, without touching geometry per
     *  frame. Gate ambient work on it: `running = { classroot.onScreen &&
     *  app.pageVisible }`. Fed by the backend's visibility machinery where the
     *  backend has page context (DOM: IntersectionObserver, viewport-rooted —
     *  an embedded app's box scrolled off a foreign page reads false too), and
     *  by the runtime's own ancestor walk elsewhere (canvas, native, headless —
     *  exact for everything the language can express). Armed lazily at the
     *  first tracked read, so a program that never binds it pays nothing.
     *  Read-only; for EXACT geometry ask `rootBounds()` / `rootTransform()`. */
    onScreen: boolean;
    /** What of me is visible, in MY OWN coordinates — `{x, y, width, height}`,
     *  the EMPTY rect (all zeros) when nothing shows. The cull-with-margin
     *  primitive: the fact reports the truth and the author's arithmetic adds
     *  the band (`visibleRect.width > -300` style margins are the app's
     *  judgement about its content, not the platform's). AT-REST delivery: it
     *  updates when motion settles and scrolling quiets, never per frame of a
     *  glide — a rung/tier decision wants the flight's END, and a fact chasing
     *  every frame would re-derive its readers sixty times a second (the
     *  idle-zero discipline). Mid-flight readers use rootBounds() in a handler.
     *  Under rotation the rect is the axis-aligned approximation. Read-only. */
    visibleRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /** The composed scale from MY units to DEVICE pixels — ancestor scales ×
     *  devicePixelRatio. THE raster-rung fact: an image pyramid picks its tier
     *  from it, a drawn view its backing density, without reimplementing the
     *  composed transform or reaching for a host global. Within Declare's own
     *  transforms (uniform scale + rotation — a similarity) this is exact and
     *  rotation does not participate; under a non-similar HOST transform (an
     *  embedding page's CSS) it is the largest axis ratio — the rasterization
     *  convention (what CA's contentsScale does). Same at-rest delivery as
     *  visibleRect. Read-only. */
    apparentScale: number;
    /** The default focus-traversal members of this view: its visible View
     *  children in source order (docs/system-design/input.md, Layer 2). The focus
     *  service descends into each; a view whose `tabOrder()` is not overridden
     *  uses this, so an all-default tree is pure tree preorder. An override may
     *  call it to compose ("the rest, minus X"). */
    tabDefault(): View[];
    /** Internal focus notification, called by the focus service when this view
     *  gains (true) or loses (false) Declare focus — SEPARATE from the user's
     *  `onFocus`/`onBlur` handlers, so a built-in class (TextInput) can drive
     *  its native element without occupying the author's event slot. No-op on a
     *  plain view. */
    $focusChanged(_focused: boolean): void;
    /** The OPTICAL band the `center` position literal centers — { lead, size }
     *  along the given axis, in this view's own coordinates. The base answer is
     *  the whole box (lead 0); Text overrides the y axis with its ink band (cap
     *  height to last baseline — the text-box-trim semantics). The same
     *  class-supplies-its-shape protocol family as the focus silhouette. */
    $alignBand(axis: "x" | "y"): {
        lead: number;
        size: number;
    };
    /** The self-completing exit (Node.discard does the unlink + ex-parent
     *  notify): this override only moves the DEPARTURE hook earlier for the
     *  still-linked caller — presence ends while the tree is WHOLE, so an
     *  `onRetire` reading `parent`, a datapath, or focus sees live state (the
     *  replicator's own order: fire, unlink, teardown). Unlink-first paths
     *  arrive with `parent` null and keep today's timing: teardown's own
     *  lifetime-guarded fire covers them. */
    discard(): void;
    /** Retire this subtree: dispose every standing computation (bindings,
     *  percents, derives, a laid parent's constraints on these slots, the draw
     *  recording), run registered teardowns (a replicator's), uninstall the
     *  arrangement, and destroy the surfaces — so no data or attribute change
     *  can ever wake work for a removed view. Children first; teardown ONLY —
     *  unlinking (and notifying the ex-parent) is discard's, the verb above. */
    $teardown(): void;
    /** Push this view's full visual state across the seam. Subclasses extend
     *  it with their capabilities (Text, Image); it runs before the children
     *  attach, so a backend that keeps content in arrival order (the DOM) gets
     *  exactly the paint order the Canvas walk uses: content, then children. */
    protected $flush(s: Surface): void;
    /** THE HIT TEST: the view under a root-space point, or null. The same walk
     *  the pointer is routed by (interaction.ts) — clip shapes, scale, pivot,
     *  `pointerEvents`, and `ignoreClip` all count exactly as they do for a real
     *  press — so what a handler computes and what the runtime routes can never
     *  disagree. Answers the deepest (topmost) view; walk `.parent` to find an
     *  eligible ancestor:
     *
     *      onPointerUp(e) {
     *          let t = app.viewAt(e.rootX, e.rootY)
     *          while (t != null && t.accept == null) t = t.parent
     *          if (t != null) t.accept(dragged)
     *          },
     *
     *  Root-space, like every pointer event's `rootX`/`rootY`, so a drag can
     *  pass its own event's root point straight in. (Root-space is the
     *  root's CONTENT space; the walk itself runs in frame space, so the root's
     *  own scroll converts here at the boundary — the contract stays exactly
     *  what the drag pairing needs, scrolled or not.) */
    viewAt(x: number, y: number): View | null;
    /** Does this view's box contain the root-space point? Geometry only — what
     *  paints ON TOP is `viewAt`'s question — so a drop target can ask about
     *  itself without walking the tree. */
    containsPoint(x: number, y: number): boolean;
    /** This view's origin in ROOT space (the root's content coordinates — the
     *  same space `viewAt` takes and drag events carry). THE one walk
     *  (interaction.ts): translate per level MINUS every intermediate scroll
     *  offset, with the root's own scroll added back at the boundary — so an
     *  overlay anchored by it (a menu at a pointer, a popover under a control)
     *  lands where the view is SEEN, at any scroll. Classes call this
     *  instead of hand-accumulating ancestor x/y, which is scroll-blind. */
    /** This view's BOX in root space — rootOrigin()'s sibling for the whole
     *  frame: the transformed axis-aligned box (ancestor scale/rotation
     *  composed, every intermediate scroll subtracted; interaction.ts
     *  rootFrameBox — the hit walk's own math). A one-shot QUERY, deliberately
     *  not a fact: absolute geometry depends on every ancestor, and a live slot
     *  would re-derive on each scrolled pixel. Compose with the viewport facts
     *  for "where am I on screen": `rootBounds().y - app.scrollY` against
     *  `app.hostHeight`. For the coarse question, bind `onScreen` instead. */
    rootBounds(): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /** @internal the facts' feed (visibility.ts), armed by the attribute
     *  table's onTrack — the first tracked read of a fact — and by a drawing. */
    $armVisibility(): void;
    /** The composed transform from MY frame to ROOT-frame space — `{x, y,
     *  scale, rotation}`, the similarity the language's transforms compose to
     *  (scroll-aware, the hit walk's own math). The METHOD tier's exact answer;
     *  the facts above are its coarse, at-rest companions. */
    rootTransform(): {
        x: number;
        y: number;
        scale: number;
        rotation: number;
    };
    rootOrigin(): {
        x: number;
        y: number;
    };
    /** Travel with `scroller`: re-host this view's SURFACE inside the
     *  scroller's container so the platform carries it with the scrolled
     *  content — zero-lag chrome that belongs to content (the FocusRing's
     *  ride; the inverse of `ignoreScroll`). Position slots then mean the
     *  scroller's CONTENT coordinates. Pass null (or this view's own parent —
     *  its natural host) to come home; the ROOT is a real destination, not
     *  home, so chrome can climb OUT of a scroller that sits directly under
     *  it (the DataGrid header's escape).
     *  Returns whether the surface now rides the scroller — false when the
     *  backend can't (no travelWith) or the surfaces do not exist YET, so
     *  callers keep the reactive root-space fallback.
     *
     *  The request is DECLARATIVE, and that is what makes the answer
     *  trustworthy: a caller in `onInit` runs before attach (initTree precedes
     *  App.attach), so the first call can only ever answer "not yet". The
     *  request is therefore remembered and re-applied when this view attaches
     *  — no polling, and no retry budget that can be exhausted on a slow
     *  machine and silently leave the chrome un-escaped (which is exactly what
     *  DataGrid's 20×50ms chain used to risk). `escaped` becomes true at
     *  attach, through the ordinary reactive write below, so a `{ }` reading it
     *  re-runs then. */
    travelWith(scroller: View | null): boolean;
    /** The standing travel request (undefined = never asked). Applied here and
     *  re-applied at attach; `travelDone` is the reactive echo the requester
     *  reads (see attach). */
    private travelHost;
    private $applyTravel;
    /** @internal Re-send x/y through the seam against the CURRENT position host
     *  — the one case where the realized position changes without either slot
     *  moving (a padding write on the host, a travelWith that re-hosts the
     *  surface). */
    $repushPosition(): void;
    /** Scroll this view to the top of its nearest scrolling ancestor — the
     *  imperative companion to the reactive `scrolls`/`scrollY` pair (a click
     *  handler calls it to jump to a target). Both backends do the work in their
     *  Surface; a no-op before attach or with nothing scrolling above. (Named for
     *  the platform primitive — `reveal` is deliberately left free as a member name,
     *  e.g. a `reveal:` fade-in Spring.) */
    scrollIntoView(align?: "start" | "nearest", smooth?: boolean, inset?: number): void;
    /** @internal A request made while the USER is scrolling this scroller waits
     *  until that scroll is over; only the latest one is kept (the scroll verbs
     *  store themselves here, $scrollingChanged runs it). */
    $pendingScroll: (() => void) | null;
    /** @internal The platform reported the user's scroll starting or ending. */
    $scrollingChanged(a: boolean): void;
    /** Ask this scroller to go to offset `y` — a REQUEST, not an assignment
     *  (platform-authorship.md): the platform clamps it to the real scroll
     *  range, and a surface that cannot take it yet (a hidden pane) HOLDS it
     *  and applies it when it can (dom-backend SCROLL_WANT/reassertScroll).
     *  `Infinity` means the far end — "scroll to the bottom" with no magic
     *  number (each backend resolves it against the range it alone knows).
     *  The `scrollY` fact follows: a finite request lands in the model now
     *  (the same write an assignment made), and the surface's mirror settles
     *  it to the clamped truth; a non-finite request leaves the fact to the
     *  mirror alone, so the model never holds `Infinity`. The surface call is
     *  deliberately unconditional — an equality-gated model write must not
     *  swallow the request (the boot-time trap applyDeclaredScroll records). */
    scrollTo(y: number, glide?: {
        duration?: number;
        motion?: string;
    }): void;
    /** The horizontal twin of `scrollTo` — same request/clamp/hold contract,
     *  for a `scrolls = x` (or `both`) view. */
    scrollToX(x: number, glide?: {
        duration?: number;
        motion?: string;
    }): void;
    /** A RELATIVE request — `scrollBy(dx, dy[, glide])`: the same contract as
     *  `scrollTo`/`scrollToX`, measured from the current facts. The optional
     *  glide is the provider's own motion (see ScrollGlide in backend.ts). */
    scrollBy(dx: number, dy: number, glide?: {
        duration?: number;
        motion?: string;
    }): void;
    /** Promotion (planes.md §1 — order is a slot): re-link this view among its
     *  siblings, tree and surface both. `raise()` moves it to the FRONT (last
     *  child — stacking is source order); `raise(below)` moves it to just BENEATH
     *  a sibling instead, so a pinned band above it (e.g. the dock's minimized
     *  windows) stays on top. Same parent only — the verb form of z-order, no
     *  numbers. A Menu raises at open; a Window raises on activation.
     *
     *  A TRAVELING surface (travelWith) keeps its host: its parentage is the
     *  travel host's business, and re-seating it under the model parent would
     *  drag it home while its position slots still read the host's CONTENT
     *  coordinates — the ring painting a scroller's origin above its target.
     *  The MODEL order still moves; only the surface seat is left alone. */
    /** Imperative creation (planes.md §7): instantiate a class by NAME
     *  into THIS view — the receiver is the parent, and with it the new
     *  instance's scope and data anchor (`classroot` resolution and `datapath`
     *  inheritance boot against it). A full citizen: bindings installed, init
     *  fired, and the arrangement/auto-extent notified (childrenMutated).
     *  Resolves against the tree's program registry (via `root`); a name
     *  referenced only here needs `use [ Name ]` to survive static tracing.
     *  `props` are post-init writes (`datapath: record` gives the instance a
     *  data context — replication's convention). The pair of `discard()`. */
    createView(tag: string, props?: Record<string, unknown>): View;
    raise(below?: View | null): void;
    /** This view's input route, or null when it answers no pointer event —
     *  interactivity *derives* from declared handlers (Decisions §R5): a view
     *  with none is never wired (pay-per-use) and stays transparent to input,
     *  which is what lets a decorative child sit over an interactive parent
     *  without stealing its clicks (LZX's `clickable` intent, made automatic).
     *  A handler receives one plain event argument — the pointer position in
     *  this view's own coordinates. */
    private $inputSink;
    /** Re-derive the surface's input wiring — the pusher for attributes that
     *  GRANT interest by their value (`link`; a post-attach handler install goes
     *  through here too). Idempotent: attach-time flush and this call converge
     *  on the same sink/wants pair. */
    $rewireInput(): void;
    /** What the ROUTER needs to know about this view's declared handlers to
     *  arbitrate gestures for it (input.ts HitTarget): whether it answers
     *  double-clicks (so its single click waits out the double window), holds,
     *  or the raw touch family (so the whole multi-finger stream is delivered and
     *  nothing is interpreted). Declaration IS the opt-in — no configuration. */
    private $inputWants;
    /** Stand up the draw method as a tracked, re-recording computation. */
    private $bindDraw;
    /** Re-record right now — the explicit half of draw-on-invalidation (the
     *  attribute-driven half is the recording's own tracked reads). Also the
     *  entry point for a draw method assigned after attach. */
    $invalidateDraw(): void;
    /** Realize the `clip` slot across the seam (the pusher and flush both land
     *  here). Both modes are set explicitly on every apply, so a switch between
     *  the forms — true → a Shape path → false — never leaves two clips
     *  fighting. Pre-attach (surface null) it is a no-op; flush replays it once
     *  the surface exists.
     *    - `true`  → the backend BOX-clip mode (setBoxClip): clip to the view's
     *      own rounded box, tracked by the backend as it animates — and with
     *      CONTAINMENT semantics (backend.ts): children parked beyond the box
     *      contribute no scrollable overflow and cannot be focus-scrolled into
     *      view. No derive needed — the backend reads the box at use time.
     *    - a Shape string → that path, straight to the backend (shape-clip,
     *      paint + hit only);
     *    - false / null   → no clip. */
    $applyClip(clip: string | boolean | null): void;
}
/** visibleRect's rest state — one frozen instance, so an off-screen view's
 *  slot never churns (rectEqual gates the writes besides). */
export declare const EMPTY_RECT: {
    x: number;
    y: number;
    width: number;
    height: number;
};
export declare function withCursorDefining<T>(view: Node, fn: () => T): T;
/** The cursor in effect at `node`: the nearest ancestor-or-self datapath
 *  (language §9 — "descendants read fields relative to it"). Each level's
 *  slot is a tracked read, so a cursor appearing, changing, or clearing
 *  ANYWHERE on the chain wakes exactly the reads below it. */
export declare function inheritedCursor(node: Node | null): Cursor | null;
export declare function setFocusDiscardHook(fn: (view: View) => void): void;
/** A node's address for an error message: its authored-name path up the tree
 *  (`app.pulse.card`), or its class when anonymous. Cheap, and built only once
 *  a handler has already thrown. */
export declare function nodeLabel(n: Node): string;
export declare function fireEvent(view: Node, event: string, ...args: unknown[]): void;
export declare function viewLayoutReady(): boolean;
export declare class App extends View {
    /** onReady — the boot transaction's close, DELIVERED (schema.ts App
     *  events): boot is the one settle with no app handler anywhere in it, so
     *  its close cannot be asked for inline (afterSettle) and must arrive as an
     *  event. Registered at attach — the join point of every render path
     *  (mounted, headless, native) — and fired at the close of the FIRST settle
     *  after it: tree standing, constraints wired, geometry computed, nothing
     *  painted, so what the handler writes is in the first frame the user sees.
     *  Once per App instance; an embedded island's App gets its own. */
    private readyDelivered;
    $attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
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
    hostWidth: number;
    hostHeight: number;
    scrollY: number;
    pointerX: number;
    pointerY: number;
    hovering: boolean;
    /** True while a pointer (mouse button or touch) is down anywhere in the app —
     *  the press half of the interaction intrinsics (interaction.ts); fed at mount
     *  like the pointer coordinates. Read-only to user code. */
    pointerDown: boolean;
    /** True while the free pointer is over a native text-editing surface (a text
     *  input / textarea / contenteditable — e.g. an editable HTML island). A
     *  custom app cursor reads it to YIELD to the I-beam over a text field:
     *  `cursor: View [ visible = { !classroot.pointerOverText } ]`. */
    pointerOverText: boolean;
    /** The OS color-scheme preference (`prefers-color-scheme: dark`), fed live by
     *  the runtime. Theme an app off it: `fill = { app.dark ? 0x0B141B : 0xFFFFFF }`
     *  or drive a `theme` record from it. Read-only to user code. */
    dark: boolean;
    /** Is the page this app lives on visible? The browser's Page Visibility fact
     *  (boot.ts wireVisibility feeds it; the native host feeds the same slot from
     *  its occlusion signal). Ambient motion gates itself on it —
     *  `running = { … && app.pageVisible }` — and because clock membership is
     *  constraint-driven, a `Time` (which pauses itself on this fact) leaving empties the frame loop: a hidden
     *  page books nothing. Read-only to user code; schema.ts has the caveats
     *  (Safari does not report window occlusion). */
    pageVisible: boolean;
    /** "Am I running on a touch device?" — true when the device's primary pointer
     *  is coarse (`pointer: coarse`), a phone or tablet. A stable device fact fed
     *  live by the runtime, distinct from the transient `hovering`: switch mouse-only
     *  affordances off with `visible = { !app.touchDevice }`. Read-only to user code. */
    touchDevice: boolean;
    /** Does this device HAVE a touch digitizer at all (`any-pointer: coarse`)?
     *  True on a phone, a tablet, AND a touch laptop whose primary pointer is a
     *  trackpad — the case `touchDevice` deliberately answers false. Use it for a
     *  hit-target floor (a finger may still arrive), not to switch layout.
     *  Read-only to user code. */
    hasTouch: boolean;
    /** Does this device have a FINE pointer (`any-pointer: fine`) — a mouse,
     *  trackpad, or stylus? Read-only to user code. */
    hasPointer: boolean;
    /** What the user JUST used: "mouse" | "touch" | "pen", updated live on every
     *  move and press. The honest signal on a hybrid device, where the answer
     *  changes per gesture: reveal hover-only affordances with
     *  `visible = { app.lastPointerType == "mouse" }`. Read-only to user code. */
    lastPointerType: string;
    /** How the app meets the device's own chrome (the notch, the home-indicator
     *  bar): `"safe"` (default) letterboxes the app inside the safe region —
     *  the bars wear the app's fill and every inset reads 0; `"cover"` extends
     *  the box edge-to-edge (viewport-fit=cover, patched at mount) and the
     *  `safeTop`…`safeRight` facts carry the real insets for pinned chrome to
     *  place itself with. A fact about the app, read at mount. */
    edges: "safe" | "cover";
    /** The safe-area insets, in pixels — live (rotation re-reads them), 0
     *  while letterboxed or on any desktop. Under `edges = cover`, pinned
     *  chrome offsets itself: `y = { app.safeTop }`, a bottom bar reserving
     *  `app.safeBottom` below its buttons. Fed by boot.ts wireSafeArea. */
    safeTop: number;
    safeBottom: number;
    underlapBottom: number;
    safeLeft: number;
    safeRight: number;
    /** The shipping page's over-the-wire size in KB (gzipped) and its Declare
     *  source line count — provided by the host/build (see index.ts note), 0
     *  until set. Reactive reads: a stat bound to them settles when they land. */
    pageWeight: number;
    sourceLines: number;
    /** INTERIM (capabilities.md §7): the two host-fed live-demo channels —
     *  `demoSources` (a name→source map the host seeds every editor from,
     *  host-client.js) and `liveReport` (the last live recompile's rendered
     *  report; "" while the edit compiles clean, the island keeps the last good
     *  render). Reactive slots so bindings on them settle when the host writes;
     *  read-only to user code, typed in the compiler's LANGUAGE_API (scaffold.ts),
     *  never schema attrs. RULED to dissolve into a per-instance `LiveDemo`
     *  class; the app-authored state that once rode alongside (editing /
     *  liveCard / liveSource) is already instance-declared on the demo-hosting
     *  apps. See docs/system-design/language-learnings.md §11–12. */
    demoSources: Record<string, unknown>;
    liveReport: string;
    /** `location` — the app's slice of the URL, the fragment (docs/system-design/location.md). A
     *  two-way reactive string the host seeds from the URL fragment before first
     *  settle, mirrors outward per settle (one history push per changed settle), and
     *  writes back on back/forward. The app owns the grammar: it reads `app.location`
     *  to derive state (`mode = { app.location.split("/")[0] }`) and writes it to
     *  navigate (`app.location = "why"`). The declared initial is the default — the
     *  fragment is omitted at it (§3). Read-write to user code; schema.ts. */
    location: string;
    /** `waypoint` — the STEP: the half of the history coordinate the URL does
     *  not show (the other half of the history entry; `location` is the address
     *  half). The host carries it in the History entry's state object, restores
     *  it on back/forward — a coordinate comes back by traversal, never by
     *  arrival, so a reload starts at the declared initial — and never lets it
     *  near the URL, so it is not shareable and not crawlable, by construction.
     *  The app owns the grammar, same as location. Schema attr; default "". */
    waypoint: string;
    /** app→host navigation channel: `navigate(to)` sets it when no host services
     *  are installed, and a polling host opens the URL and clears it to "". A plain
     *  field, not a reactive attribute — nothing in the tree renders from it, and no
     *  Declare source names it: navigation is the CALL, never an observed attribute.
     *  The FALLBACK half of the verb — a host that registered `hostServices` is
     *  called directly instead, and this field never carries. */
    pendingNav: string;
    /** The host's service table — the app→host VERBS' direct line, installed at
     *  mount by provideHostServices (boot.ts). Per-app, so two embedded apps on
     *  one page each route to their own host, and a foreign page can supply its
     *  own (route `navigate` into an SPA router). A registered service is called
     *  SYNCHRONOUSLY inside the verb — still within the click's transient user
     *  activation, which is what window.open needs. Null = no host registered:
     *  the verb parks its intent on the matching pending* channel for a polling
     *  host. (The mac bridge replaces `navigate` wholesale — Bridge.swift — and
     *  reads neither.) */
    hostServices: {
        navigate?: (to: string) => void;
        openWindow?: (to: string) => void;
        inspect?: (slot: string) => void;
    } | null;
    /** @internal an EMBEDDED tenant's line to its host island (linkIslandTenant
     *  installs it). Null = not linked (a top-level app, or never linked) —
     *  send() says so instead of vanishing. */
    hostSink: {
        message(topic: string, payload: unknown): void;
    } | null;
    /** post(topic, payload) — the tenant's message VERB, this app → its host
     *  island's onPost. The other half of the bridge from the facts: consumed
     *  once, ordered, never re-readable — for "do this", not "this is so"
     *  (islands design; the state channel is the `external` attributes). */
    post(topic: string, payload?: unknown): void;
    /** navigate(to) — the navigation SERVICE ACTION (capabilities.md §6). A link or
     *  button calls `app.navigate(url)` in an activation handler; the compiler reads
     *  the call statically (links.ts → `<a href>` in the static extraction), and at
     *  runtime the host opens `to`. DOM-free: bodies never touch window.location, so
     *  navigation rides this channel like `editing` — one clear way, analyzable. */
    navigate(to: string): void;
    /** The reference schemes a link may carry (location.md §0.4) — the shared
     *  predicate lives at the render seam (backend.ts allowedRef), because the
     *  realization path enforces it too: a disallowed scheme never becomes an
     *  href, so copy-link and middle-click — native paths that never enter
     *  follow — stay shut. */
    static allowedRef(ref: string): boolean;
    /** The destination part of a location — the runtime strips ITS OWN trailing
     *  `@name` (§6's one shared grammar character); the app never writes the
     *  split. `shows` lowers to a comparison against this (instantiate.ts). */
    destinationOf(loc: string): string;
    /** The history verb the NEXT location mirror should use (location.md §0.5.6):
     *  "push" (default), or "replace" — set by follow when the link carries
     *  `replace = true`, and by the host itself on traversal/cold arrivals so a
     *  redirect can never mint an entry (no Back loops). Consumed (reset to
     *  "push") by the host at the mirror. A plain field, like pendingNav. */
    pendingHistoryVerb: "push" | "replace";
    /** follow(ref) — the ONE operation behind every arrival (location.md §0.5):
     *  a linked view's activation, a rich-text href, a cold URL, back/forward.
     *  Source requests, runtime delivers, destination decides. The app-scoped
     *  hook `onFollow(ref) -> ref'` (a user-declared method, §0.6) is applied
     *  ONCE — transform, veto (""), or side-effect; then an external reference
     *  leaves through `navigate`, and a `#…` writes `location`. The anchor
     *  reveal rides the existing retained intent (resolveReveal); an anchorless
     *  arrival seeds the scroll to the top. Re-following the current reference
     *  re-runs the arrival step — no dead clicks. */
    follow(ref: string, replace?: boolean): void;
    /** The destination gating an anchored view: walk the tree for `anchor ===
     *  name`, then up from it for the nearest `shows`. null = no such anchor
     *  (the name is a destination or a computed location); "" = an anchor
     *  outside any destination (reveal within the current location). */
    private $destinationOfAnchor;
    /** app→host channel for openWindow, exactly like pendingNav: the verb writes
     *  it, the host polls it on the next frame and window.opens (still inside the
     *  click's transient user activation, so it isn't popup-blocked). */
    pendingOpen: string;
    /** app→host channel for the Inspector (the third of the same shape). A button
     *  calls `app.inspect("run:spring")` naming an island slot — or `""` for this
     *  app itself — and the host opens the Inspector on that subject. A plain
     *  field, not a reactive attribute: nothing renders from it, and no Declare
     *  source reads it. */
    pendingInspect: string | null;
    /** inspect(slot) — the Inspector SERVICE ACTION. `slot` names an embedded
     *  app's island ("run:spring"); omit it to inspect this app. Like navigate(),
     *  the intent rides the service table (or its channel fallback), so a `{ }`
     *  body never touches the document. */
    inspect(slot?: string): void;
    /** openWindow(to) — navigate's NEW-WINDOW sibling (a "View Source" that must
     *  not replace the running app). Same discipline: bodies never touch
     *  `window`, the intent rides the service table (or its channel fallback).
     *  A registered service runs synchronously inside the activation, which is
     *  MORE popup-safe than the old next-frame poll, not less. */
    openWindow(to: string): void;
    /** The reveal intent held from `location`'s trailing `@name` (location.md §6) —
     *  null when the location carries no anchor. Retained across settles until the
     *  name appears in a settled tree; re-armed or cancelled when `location` changes. */
    private pendingAnchor;
    private lastRevealLocation;
    /** Resolve the pending `@name` reveal against the current settled tree. The host
     *  calls this after settles — and each frame while an intent is held, so a cold
     *  deep link (`/#guide/22-reach@some-heading`) fires once the DataSource lands and
     *  the heading renders. A location CHANGE re-arms the intent from its trailing
     *  `@name` (a change with no anchor cancels it); a resolved name fires the reveal
     *  and clears the intent. Runtime-side and backend-agnostic — the reveal itself
     *  splits at the surface seam (DOM scrollIntoView / canvas scroll clamp). Returns
     *  the name it revealed this call (else null) — the host ignores it; tests read it. */
    $resolveReveal(): string | null;
    /** Is an `onArrive` handler declared? (Installed by instantiate like every
     *  language member; a TS subclass may simply define one.) Its presence is
     *  the policy switch: declared, the app owns the landing. */
    private $hasArrive;
    /** The view an anchorless location lands on: the destination view (`shows`
     *  === the location's destination), or the App itself when no view declares
     *  it (a computed-location family, or the bare ""). Resolved at dispatch
     *  time, off the settled tree. */
    private $destinationView;
    /** @internal the values the host provides, by name (Node.$hostProvided reads).
     *  Seeded from build's `provides` when there are any, so the app's very
     *  first evaluation — at instantiate, before any settle or link — reads them.
     *  Null in a build without host values (boundary.ts): no read could reach them. */
    readonly hostValues: BoundaryValues | null;
    /** The HOST's write: make `value` available to this app under `name` — what
     *  a `hostProvided("name", …)` read in the program returns. Called by the
     *  island bridge for each name the island `provides`, by a page embedding
     *  this app (`el.__declareApp.provide(…)`, or `boot({ provides })`), and by
     *  the native host for its launch parameters. Equality-gated; a change
     *  re-derives every reader. `undefined` withdraws the value (readers fall to
     *  their defaults). Data only — a host never hands over a node. */
    provide(name: string, value: unknown): void;
    /** The value this app exposes under `name` — one of its `exposes` names — or
     *  undefined when it exposes no such name. The page's read (an island reads
     *  through its own `exposed`); tracked, so an `observe` over it follows. */
    exposed(name: string): unknown;
    /** A page's standing watch over one exposed value: `cb` runs now with the
     *  current value and again at the close of every settle that changed it.
     *  Returns the unwatch. */
    watchExposed(name: string, cb: (value: unknown) => void): () => void;
    /** The DEFAULT landing, exposed — what the platform does with an arrival
     *  when no `onArrive` is declared: scroll the target into view, honoring
     *  `revealInset` (the App itself starts at its top). A document app that
     *  declares `onArrive` for the extra work composes the scroll back by
     *  calling this — the same move as `tabOrder()` composing `tabDefault()`. */
    reveal(target: View): void;
    /** Re-arm the reveal intent for the CURRENT location — follow's no-dead-click
     *  rule (§0.5): re-following `#why@story` while already there re-runs the
     *  reveal, which resolveReveal's location-change guard would otherwise skip. */
    $rearmReveal(): void;
    /** The reveal pump — resolveReveal's retry as an ARMED-LIFETIME ticker on the
     *  shared clock. The hosts used to call resolveReveal once per frame for the
     *  life of the page (a standing rAF loop on every page, intent or no intent);
     *  now the runtime owns the wait, because it owns the intent: the pump
     *  enrolls when an `@name` intent arms and leaves the moment it lands or is
     *  cancelled, so an app with no deep link pays zero frames. The per-frame
     *  retry itself is load-bearing — a target's geometry can finish arriving
     *  via browser-async work (an image decode, a rich flow's measurement) that
     *  produces no settle to hook. Perpetual (never holds settleMotion open),
     *  like a Time. A held intent whose anchor never appears keeps the pump
     *  alive — exactly the old loops' behavior, now scoped to the one page that
     *  asked for an anchor. */
    private pumpOn;
    private readonly revealPump;
    /** Stop the pump when the app leaves — a held intent must not keep the
     *  frame loop alive past the app (registered once, at first arm). */
    private pumpRetireHooked;
    private $hookPumpRetire;
    /** Enroll the pump at the close of the current settle when the location
     *  carries an `@name`. Armed from `location`'s own push (the write IS the
     *  event), from rearmReveal, and once at mount for the cold-arrival seed.
     *  Arms, never resolves: resolution belongs to the pump's frame ticks — and
     *  to any host or test that calls resolveReveal itself (the pinned
     *  first-call contract). A no-anchor location makes this a peek and a no-op. */
    $scheduleReveal(): void;
    /** Cancel a HELD reveal intent — the user's first scroll or touch takes
     *  ownership of the viewport (location.md §0.5.5, the uncontrolled-editor
     *  rule): a reference SEEDS the scroll position, it never owns it. The host
     *  calls this from its scroll/wheel/touch listeners; a reveal that already
     *  landed cleared the intent itself, so this is a no-op then — which is what
     *  makes the reveal's own scrollIntoView (whose scroll event arrives a tick
     *  later) safe from self-cancellation. */
    $cancelReveal(): void;
    /** The app's size floor. An app that degrades below some width declares
     *  `minWidth = 600` and the auto-extent never goes under it: in a narrower
     *  host the app holds its floor and the STAGE pans natively (the page
     *  scrolls horizontally at top level; an embedded island scrolls its box).
     *  A declared policy, not clamp arithmetic in a constraint — tools and
     *  models can read the floor statically. 0 (the default) = no floor. Only
     *  the auto-extent honours it; an explicit `width = { … }` is the author's
     *  own formula and wins untouched. */
    minWidth: number;
    minHeight: number;
    /** Linking knobs (location.md §0): `revealInset` — pixels of fixed chrome a
     *  reveal must clear (the scroll-margin analogue); `crawlSeeds` — extra
     *  references the extraction crawl seeds beyond the registry. */
    revealInset: number;
    crawlSeeds: unknown[];
    /** The app's human name — hosts surface it where names go: the page title
     *  (host-client mirrors it per settle, before the location history push so
     *  back/forward entries carry the state's name) and the crawled document's
     *  <title> (the extractor reads the settled value). Author-settable, literal
     *  or constraint; "" (the default) leaves the host's served title alone. */
    appName: string;
    /** The App's auto-extent is the HOST, not its content: an unset width/height
     *  follows hostWidth/hostHeight (reactive on resize), so the root app fills its
     *  enclosing area with no declaration — the near-universal case. An explicit
     *  `width = …` still wins (isSet skips the derive), and there is no children
     *  guard: the app fills its host even while empty. This is the exact yielding
     *  default the content path uses (View.bindExtent), retargeted from content to
     *  host — so a resize repaints like any dependency. `minWidth`/`minHeight`
     *  floor the derive (tracked reads, so a reactive floor re-applies live). */
    protected $bindExtent(): void;
    /** An App is CLIPPED BY DEFINITION (ruled 2026-07-29): a program owns its
     *  rectangle. The boolean form of `clip` is absorbed here — the per-axis
     *  realization (overflow along a declared scroll axis is the page's range;
     *  overflow along any other axis is out of frame) lives in the backend's
     *  root scroll styling, composed with `scrolls`. A Shape clip keeps its
     *  paint+hit meaning; `clip = false` is refused at compile time (check.ts). */
    $applyClip(clip: string | boolean | null): void;
    /** Derive "can the page scroll right now?" from the model — a declared
     *  scroll axis with overflowing content, or a frame the floors hold larger
     *  than the host — and hand it to the root surface (backend.ts
     *  setPageScrollable), which keys the app's gesture default on it: pan
     *  stays with the user exactly when the page has somewhere to go, and
     *  retires (stilling the rubber-band) when it doesn't. Reactive — content
     *  growth, floor changes, and host resizes all re-derive; child mutations
     *  re-run it through childrenMutated like the auto-extent derives. */
    private pageScroll;
    private $bindPageScroll;
    $childrenMutated(): void;
}
