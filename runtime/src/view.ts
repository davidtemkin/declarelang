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

import { Node, onDiscard, runRetire, authoredName, provideCursorRead, provideCursorWrite } from "./node.js";
import { DeclareError, diag, negativeSizeMessage } from "./errors.js";
import { backdropEqual, fillEqual, filterList, filtersEqual, insetIsZero, insetLead, insetSides, isMaskGradient, shadowEqual, strokeEqual, type Backdrop, type BoxStroke, type Fill, type FilterValue, type Inset, type Mask, type Radius, type Shadow } from "./value.js";
import { PINCH_TYPES, POINTER_TYPES, TOUCH_TYPES, allowedRef, type InputSink, type InputWants, type RenderBackend, type Surface } from "./backend.js";
import { Tip } from "./tip.js";

// Imperative creation's injection seam (instantiate.ts provides; the cycle
// view→instantiate is broken the same way focus.ts's discard hook is).
type ViewCreator = (root: View, tag: string, parent: View, props?: Record<string, unknown>) => View;
let viewCreator: ViewCreator | null = null;
export function provideViewCreator(fn: ViewCreator): void {
  viewCreator = fn;
}

/** The PROGRAM'S CLASS TABLE, as rich text's inline views need it (markdown.ts):
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
let inlineHost: ((root: Node) => InlineViewHost | null) | null = null;
export function provideInlineViewHost(fn: (root: Node) => InlineViewHost | null): void {
  inlineHost = fn;
}
/** The class table for the program `v` belongs to, or null (no program). */
export function inlineViewHost(v: View): InlineViewHost | null {
  return inlineHost === null ? null : inlineHost(v.root);
}
import { record, type Draw, type DisplayList } from "./draw.js";
import { sharedClock } from "./animate.js";
import { Cell, Constraint, afterSettle, isSettling, kernel, kernelLoaded, noteOrigin } from "./reactive.js";
import { setChangeDispatcher, trackNode } from "./change-event.js";
import { boxThrough, fromParts, isIdentity as isIdentityAffine, type Affine } from "./affine.js";
import { footprint3D, spec3DOf } from "./projective.js";
import { initInteraction, readHovered, readPressed, hitAt, boxContains, rootFrameOrigin, rootFrameBox, rootTransform, type InteractionView } from "./interaction.js";
import { bindDerived, blockOf, declarationsOf, defineAttributes, disposeBindings, freeCells, isSet, localProvision, own, ownerOf, percentOwned, release, setBound, slotCellOf, slotIndex } from "./attributes.js";
import { type AttrType } from "./value.js";
import { observe } from "./reactive.js";
import { handlerName } from "./schema.js";
import { splitPath, type PathSeg } from "./datapath.js";
import { selectValue } from "./select.js";
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
}

// view → the installed strategy's detach. Module-private bookkeeping rather
// than a View field: only the pusher below touches it, and a layout-free
// view (the common case) carries nothing.
const INSTALLED = new WeakMap<View, () => void>();

// Teardown registration (onDiscard) moved to node.ts (2026-07-13): a plain
// Node can host a `<-` subscription, so the registry lives at the base.
// Re-exported here so existing importers keep their path.
export { onDiscard } from "./node.js";

// Views whose replicated content is currently WINDOWED (replicate.ts marks
// and unmarks). Lives here so view.ts needs no import of the replicator (the
// dependency runs the other way).
const WINDOWED_BLOCKS = new WeakSet<View>();
// …and the cell behind the app-language read, so a constraint on `virtualized`
// re-runs when a block engages or disengages — which it now can, since the
// policy itself takes a constraint.
const WINDOWED_CELLS = new WeakMap<View, Cell>();
const windowedCell = (v: View): Cell => {
  let c = WINDOWED_CELLS.get(v);
  if (c === undefined) WINDOWED_CELLS.set(v, (c = new Cell()));
  return c;
};

/** Is this view's replicated content currently windowed? The UNTRACKED read,
 *  for the layout kernel (its pass suspends while windowing owns placement)
 *  and other internals that must not subscribe. */
export function isWindowedBlock(v: View): boolean {
  return WINDOWED_BLOCKS.has(v);
}
/** The tracked read behind `View.virtualized`. */
export function readVirtualized(v: View): boolean {
  windowedCell(v).track();
  return WINDOWED_BLOCKS.has(v);
}
export function markWindowedBlock(v: View, on: boolean): void {
  const was = WINDOWED_BLOCKS.has(v);
  if (on) WINDOWED_BLOCKS.add(v);
  else WINDOWED_BLOCKS.delete(v);
  if (was !== on) windowedCell(v).changed();
}

// ── onRetire — the DEPARTURE hook (D5 ruled the semantics, D8 the name) ──
//
// Fires when a member's PRESENCE ends — its record leaves the match, or its
// subtree is discarded — the exact symmetric of the membership-anchored
// onInit, and NEVER on window eviction (a dematerialized row's presence
// continues; the replicator marks evictions so discard stays silent for
// them). Children before parents, mirroring initTree's order; once per
// lifetime. Fired at the TOP of discard, so handlers see live state.
const EVICTING = new WeakSet<View>();
const RETIRED = new WeakSet<View>();
export function markEvicting(v: View): void {
  EVICTING.add(v);
}
/** A retired subtree RECYCLED onto a new member (replicate.ts departure
 *  recycling) can retire again when that membership ends. */
export function clearRetiredTree(v: View): void {
  RETIRED.delete(v);
  for (const c of v.children) if (c instanceof View) clearRetiredTree(c);
}
/** The values an App constructed during one build starts with (build's
 *  `provides`): set around that instantiate by withHostProvides. */
let SEED_PROVIDES: Record<string, unknown> | null = null;

/** Run `fn` (a build) with `values` as the host values its root App starts
 *  with. What makes a hosted program's first evaluation see what its host
 *  provides — a DataSource url or anything else evaluated at instantiate
 *  runs before any link could deliver them. */
export function withHostProvides<T>(values: Readonly<Record<string, unknown>> | undefined, fn: () => T): T {
  if (values === undefined) return fn();
  const prev = SEED_PROVIDES;
  SEED_PROVIDES = { ...values };
  try { return fn(); } finally { SEED_PROVIDES = prev; }
}

function seededHostValues(): BoundaryValues {
  const bv = new BoundaryValues("hostProvided");
  // every App constructed inside the one build reads the seed (not consumed:
  // instantiate may construct a throwaway App before the root; a program has
  // only one real App, and a tenant is always its own, later, build)
  if (SEED_PROVIDES !== null) for (const [k, v] of Object.entries(SEED_PROVIDES)) if (v !== undefined) bv.write(k, v);
  return bv;
}

/** A set of named reactive values crossing a boundary — what a host provides
 *  to an app (App.hostValues), what a hosted side exposes to its island
 *  (Island.exposedValues). Each name owns a cell, created on first read, so a
 *  write wakes exactly its readers; a write from outside a settle schedules
 *  one (reactive.ts touchCell), which is how a page or foreign code drives it. */
class BoundaryValues {
  private readonly m = new Map<string, { has: boolean; v: unknown; cell: Cell }>();
  private readonly warned = new Set<string>();
  constructor(private readonly what: "hostProvided" | "exposed") {}
  private entry(name: string): { has: boolean; v: unknown; cell: Cell } {
    let e = this.m.get(name);
    if (e === undefined) { e = { has: false, v: undefined, cell: new Cell() }; this.m.set(name, e); }
    return e;
  }
  write(name: string, v: unknown): void {
    const e = this.entry(name);
    if (e.has && Object.is(e.v, v)) return;
    e.has = true;
    e.v = v;
    e.cell.changed();
  }
  clear(name: string): void {
    const e = this.m.get(name);
    if (e === undefined || !e.has) return;
    e.has = false;
    e.v = undefined;
    e.cell.changed();
  }
  names(): string[] { return [...this.m].filter(([, e]) => e.has).map(([n]) => n); }
  /** The tracked read. With a default: an absent value, or one of a different
   *  kind than the default, answers the default (the latter with a warning,
   *  once per name). With none: an absent value throws, naming it. */
  read(name: string, hasDefault: boolean, dflt: unknown): unknown {
    const e = this.entry(name);
    e.cell.track();
    if (!e.has) {
      if (hasDefault) return dflt;
      throw new DeclareError(`${this.what}("${name}"): nothing provides '${name}' here, and this read declares no default — give the read a default, or have the ${this.what === "hostProvided" ? "host list it in its island's `provides`" : "hosted side expose it"}`);
    }
    if (hasDefault && !sameKind(e.v, dflt)) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`[Declare] ${this.what}("${name}"): the value arriving is ${kindOf(e.v)}, but this read's default is ${kindOf(dflt)} — using the default`);
      }
      return dflt;
    }
    return e.v;
  }
}

/** The kind a boundary read compares — the default's kind is the read's type. */
function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  return typeof v === "object" ? "a record" : `a ${typeof v}`;
}
function sameKind(v: unknown, dflt: unknown): boolean {
  if (dflt === null || dflt === undefined) return true;   // a null default accepts any value
  return kindOf(v) === kindOf(dflt);
}

/** The value an island provides under `name` — the `provided("name")` read AT
 *  the island: its own provision or declared slot first, then its ancestors.
 *  Undefined when nothing provides it. Tracked (the readers of a provision
 *  wake on change), so an observe over it follows the host. */
export function islandProvision(island: Island, name: string): unknown {
  const own = localProvision(island, name);
  if (own !== undefined) return own;
  const decls = declarationsOf(island);
  if (decls[name] !== undefined) return (island as unknown as Record<string, unknown>)[name];
  return (island as unknown as { $provided(n: string, d: unknown): unknown }).$provided(name, undefined);
}

/** Everything an island provides right now, by name — what a host passes as
 *  build's `provides` for the tenant it is about to build, so the tenant's
 *  first evaluation sees it; linkIslandTenant keeps it live from there. */
export function islandProvisions(island: Island): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of providesOf(island)) { const v = islandProvision(island, n); if (v !== undefined) out[n] = v; }
  return out;
}

/** The names an island provides, as a clean string list. */
function providesOf(island: Island): string[] {
  const p = (island as unknown as { provides?: unknown }).provides;
  return Array.isArray(p) ? p.filter((n): n is string => typeof n === "string") : [];
}

export function fireRetireTree(v: View): void {
  if (RETIRED.has(v)) return;
  RETIRED.add(v);
  for (const c of v.children) {
    if (c instanceof View) fireRetireTree(c);
  }
  fireEvent(v, "retire");
}

/** Fire the membership-anchored `init` down an EXISTING subtree — the
 *  RECYCLED-instance arrival (replicate.ts): a live row re-pointed at a
 *  record whose presence episode is new fires that MEMBER's init without a
 *  reconstruction, the exact mirror of suppressInit on a rebuilt member
 *  whose episode continues. Parent-first, like construction's own order. */
export function fireInitTree(v: View): void {
  fireEvent(v, "init");
  for (const c of v.children) {
    if (c instanceof View) fireInitTree(c);
  }
}

// ── Auto-extent (the weather rung, ruled at the R7 checkpoint) ──────────
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


export class View extends Node {
  /** The navigation target the compiler's link extraction (links.ts) found for
   *  this instance's activation handler — stamped by instantiate from the source
   *  element's `link`. Read only by the static extractor (static-html.ts) to wrap the
   *  subtree in `<a href>`; undefined for all but the handful of navigable views. */
  _navLink?: LinkTarget;
  declare x: number;
  declare y: number;
  declare width: number;
  declare height: number;
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
  declare scrollsOn: boolean;
  declare visOn: boolean; declare visScale: number; declare visX: number; declare visY: number; declare visW: number; declare visH: number;
  declare visMode: number;
  /** The names this app EXPOSES to whatever hosts it — its own attributes,
   *  read by a host island's `exposed(…)` or a page's `app.exposed(…)`. */
  declare exposes: readonly string[];
  declare padding: Inset;
  /** @internal The inset TOTALS, one per axis (left+right, top+bottom) — the
   *  content box as two numeric slots, so a kernel expression can read it the
   *  way it reads any other slot (`parent.insetX`). Maintained by `padding`'s
   *  push below; authored nowhere. */
  declare insetX: number;
  declare insetY: number;
  /** What paints this view's box: a solid Color (null = paint nothing) or a
   *  Gradient — the ruled `fill` slot, subsuming the retired backgroundColor. */
  declare fill: Fill;
  /** The painted box's corner radius (0 = square). Shapes the PAINT only —
   *  clipping stays the explicit `clip` attribute (the recorded lean). */
  declare cornerRadius: Radius;
  /** A border drawn INSIDE the box (never layout); null = none. One Stroke
   *  borders all four sides; four — [top, right, bottom, left], clockwise from
   *  the top, `null` for a bare side — border them one at a time. */
  declare stroke: BoxStroke;
  /** The box's drop shadow (cast by the border box, CSS semantics — never
   *  painted under the box itself); null = none. */
  declare shadow: Shadow | null;
  declare visible: boolean;
  declare opacity: number;
  /** Opt out of the parent's LAYOUT (this child owns its own position; the
   *  arrangement skips it) — the decoration/overlay case. */
  declare ignoreLayout: boolean;
  /** Opt out of the parent's CLIP (outside the parent's frame this child
   *  still paints and still hits) and of its auto-extent — frame chrome that
   *  straddles the frame. Parent-scoped: ancestors' clips still apply. */
  declare ignoreClip: boolean;
  /** Opt out of the nearest enclosing SCROLL regime: this child rides the
   *  scroll frame (the window at the page altitude, the pane's frame inside a
   *  `scrolls` view) and contributes nothing to the scroll range. The fixed
   *  header, the pinned toolbar, the overlay layer. */
  declare ignoreScroll: boolean;
  /** The pointer cursor while over this view (a CSS cursor keyword —
   *  "ew-resize", "col-resize", "pointer", …; "" = inherit). Meaningful on
   *  views that take input: the sink is the hit target on both backends. */
  declare cursor: string;
  /** "none" makes this view and its subtree transparent to the pointer, so
   *  presses fall through to whatever is behind (an overlay's rule). "" /
   *  "auto" = the normal behaviour. */
  declare pointerEvents: string;
  /** Uniform paint-only scale about (pivotX, pivotY), the view's own
   *  coordinates (default the top-left corner); 1 = no transform. Spring it for
   *  zoom effects — it never affects layout, exactly like opacity. */
  declare scale: number;
  declare pivotX: number;
  declare pivotY: number;
  /** Rotation in DEGREES, clockwise, about (pivotX, pivotY) — paint-only,
   *  like `scale`, whose pivot it shares (scale-then-rotate, one documented
   *  order). Layout never rotates; hit-testing follows the visible result
   *  through the inverse transform. */
  declare rotation: number;
  /** Per-axis scale (multiplied with the uniform `scale`) and skew in
   *  degrees — the affine completion of the transform (graphics-pass.md §5).
   *  `scaleY = 0.2` squashes a card to a sliver without changing its width;
   *  `skewX = 12` shears it. Same pivot, same one-geometry rule. */
  declare scaleX: number;
  declare scaleY: number;
  declare skewX: number;
  declare skewY: number;
  /** The third dimension (graphics-pass.md §6): rotations about X and Y in
   *  degrees and a push along Z, about the pivot, projected through the
   *  PARENT's `perspective` (0 = orthographic). `backface = hidden` hides a
   *  view showing its back. Paint and the hit walk agree (projective.ts). */
  declare rotateX: number;
  declare rotateY: number;
  declare translateZ: number;
  declare perspective: number;
  declare backface: "visible" | "hidden";
  /** Does this view leave its plane? */
  is3D(): boolean { return this.rotateX !== 0 || this.rotateY !== 0 || this.translateZ !== 0; }

  /** This view's paint transform as one matrix, local → parent (before the
   *  view's own x/y): what every reader composes and inverts. */
  localTransform(): Affine {
    return fromParts({ scale: this.scale, scaleX: this.scaleX, scaleY: this.scaleY, rotation: this.rotation,
      skewX: this.skewX, skewY: this.skewY, pivotX: this.pivotX, pivotY: this.pivotY });
  }
  /** The compositing operator this view LANDS with against what has already
   *  painted beneath it within the nearest isolating ancestor (compositing.md
   *  §4.1 — the App root, a group-opacity subtree, a scroller's content
   *  group, an island boundary; plain containers are transparent to
   *  blending). `normal` = plain painting. A blending view blends as a unit,
   *  children included; paint only — hit testing and focus never change. */
  declare blend: "normal" | "multiply" | "screen" | "overlay" | "darken"
    | "lighten" | "colorDodge" | "colorBurn" | "hardLight" | "softLight"
    | "difference" | "exclusion" | "hue" | "saturation" | "color"
    | "luminosity" | "plusLighter";
  /** The frost (`frost(radius, saturation?)`; null = none): what has already
   *  painted beneath this view, sampled through a blur within the view's own
   *  painted shape — the view's `fill` then paints OVER the frosted sample,
   *  the platform-material shape. Paint only, never input. */
  declare backdrop: Backdrop | null;
  /** The view's own painted subtree, filtered as a group (graphics-pass.md
   *  §1): one filter or a list — `blur(3)`, `[blur(2), brightness(0.8)]`,
   *  `shadow(…)` for a shadow of the group's alpha, `tint(c)` for the group's
   *  alpha in one colour. Lengths in view units. Paint only, never input. */
  declare filter: FilterValue;
  /** A soft alpha mask (graphics-pass.md §2): a gradient's alpha over the
   *  box, or a stencil view (`mask = { stencil }`) whose painted alpha,
   *  placed by its own x/y inside this box, masks the subtree. Applied after
   *  clip, before opacity. Paint only, never input. */
  declare mask: Mask | null;
  /** Views masked BY this one (it is their stencil) — re-pushed when this
   *  view attaches, since a stencil declared after (or inside) the masked
   *  view has no surface at the masked view's own push. */
  private maskUsers: Set<View> | null = null;

  /** Push the mask to the seam; a stencil rides as the live view itself. */
  applyMask(m: Mask | null): void {
    const s = this.surface;
    if (s === null) return; // pre-attach: flush replays it
    if (m === null) { s.setMask?.(null); return; }
    if (isMaskGradient(m)) { s.setMask?.({ kind: "gradient", gradient: m }); return; }
    const stencil = m as unknown as View;
    (stencil.maskUsers ??= new Set()).add(this);
    s.setMask?.({ kind: "view", stencil: stencil as unknown as import("./backend.js").MaskStencil });
  }
  /** Which axes of interior overflow this view scrolls — `"none"` (the View
   *  default), `"y"`, `"x"`, or `"both"`. Overflow along a declared axis
   *  becomes scroll range; along any other axis it is out of frame. */
  declare scrolls: "none" | "y" | "x" | "both";

  /** The axis a declared drag claims (`claim = x | y | both`; D8 RULED —
   *  claim-surface.md's axis-scoped drag claim). Read into InputWants at
   *  attach; `both` is the whole-gesture claim drags always had. */
  declare claim: "both" | "x" | "y";
  /** The tooltip text (planes.md tier 1 — one attribute at the use site). A
   *  non-empty tip wires this view's hover into the Tip service; the
   *  auto-included Tooltip singleton renders it. "" = no tip. */
  declare tip: string;
  declare scrollY: number;
  declare scrollX: number;
  declare scrollStartY: number;
  declare scrollStartX: number;
  declare scrolling: boolean;
  /** Keyboard focus (docs/system-design/input.md, Layer 2). `focusable` = a tab stop;
   *  `focusTrap` = a self-contained focus group. Traversal order is the tree,
   *  overridable per view by defining a `tabOrder()` method. */
  declare focusable: boolean;
  declare focusTrap: boolean;
  declare anchor: string;
  /** The linking triple (location.md §0): `link` — this view IS a link to the
   *  reference ("" = not a link); `replace` — following it overwrites the
   *  current history entry; `shows` — this view manifests the named location
   *  (its visibility is lowered to a `visible` binding at instantiation). */
  declare link: string;
  declare replace: boolean;
  declare shows: string;
  /** Clip the subtree (paint AND hit-test). Two forms on one slot: a Shape
   *  string clips to that SVG path (view-local coordinates); the boolean
   *  box-clip `true` clips to the view's own box (0,0,width,height), tracking
   *  width/height reactively so it follows an animating height every frame
   *  (tabslider-gaps.md gap 1); false/null = no clip. */
  declare clip: string | boolean | null;

  // The text face, rich-text structure, iconSize, and theme are provided values,
  // not View slots (docs/system-design/style.md): a container draws no glyphs.
  // They live with the text leaves (Text, RichText, TextInput — face + rich),
  // Icon (iconSize), and Control (theme) as provided reads. A container that
  // sets one PROVIDES it to its subtree.
  /** How this view arranges its children (language §5: a reactive slot, not
   *  a child and not a container type); null = none — absolute x/y. Written
   *  as the member `layout: SimpleLayout [ … ]`; assigning swaps the live
   *  arrangement (the pusher below), so the doc's "swap it" is a plain
   *  write. Purely model-side: the strategy's constraints move children, and
   *  those pushes cross the seam — the slot itself never does. */
  declare layout: LayoutStrategy | null;

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
    // A travel request made before attach (the ordinary case — `onInit` runs
    // at initTree, which precedes App.attach) lands HERE, now that surfaces
    // exist. Children first: a request whose host is a descendant scroller
    // needs that surface in place.
    this.applyTravel();
  }

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
  $setData(path: string | readonly string[], v: unknown): void {
    const cursor = inheritedCursor(this);
    if (cursor === null) return;
    const segs = typeof path === "string" ? splitPath(path) : path;
    cursor.data.set([...cursor.path, ...segs], v);
  }

  /** The tree-mutation entry (R8): children were inserted/removed/reordered
   *  as a unit — re-arm the installed arrangement and re-derive auto-extent,
   *  once per burst (the replicator calls this once per reconcile, not per
   *  child). A replicated block arriving under a never-sized view can also
   *  make a slot newly derivable — bindExtent picks it up. */
  override childrenMutated(): void {
    this.layout?.rearm();
    if (this.backend !== null) this.bindExtent();
    const derives = EXTENT.get(this);
    if (derives !== undefined) {
      for (const size of ["width", "height"] as const) {
        const d = derives[size];
        // The ownership check skips a derive an author write displaced.
        if (d !== undefined && ownerOf(this, size) === d) {
          if (d.isNative && !isSettling()) {
            // outside a settle (a handler's insert, a test): re-list and
            // re-derive now, as the JS derive does
            kernel().extentRewire(d.id, this.extentWords());
            d.run();
          } else if (d.isNative) {
            // inside a settle (a reconcile re-links every row): re-list ONCE
            // per settle, at the close, where the run's write folds into the
            // same settle — the extent is exact before anything paints
            if (!this.extentRelistQueued) {
              this.extentRelistQueued = true;
              afterSettle(() => {
                this.extentRelistQueued = false;
                const now = EXTENT.get(this);
                if (now === undefined) return;
                for (const s of ["width", "height"] as const) {
                  const n = now[s];
                  if (n !== undefined && n.isNative && ownerOf(this, s) === n && n.id >= 0) {
                    kernel().extentRewire(n.id, this.extentWords());
                    n.run();
                  }
                }
              });
            }
          } else {
            d.run();
          }
        }
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
      derives[size] = this.installKernelExtent(size) ?? markExtent(bindDerived(this, size, () => this.extentOf(size)));
    }
  }

  private extentRelistQueued = false;
  /** THE KERNEL'S AUTO-EXTENT (kernel.md, the layout-pass item): the same
   *  max over the children's footprints as extentOf, evaluated natively over
   *  the table — a container with many children re-derived per frame was half
   *  the calendar's settle on the interpreter. The rule's edges are the
   *  children's geometry cells plus the child-list cell; childrenMutated
   *  re-lists them. Null (the JS derive) when the view measures its own
   *  content (Image) or a child is out of the plane; a child turning 3D
   *  later DECLINES the rule and the JS derive takes over then. */
  private installKernelExtent(size: "width" | "height"): Constraint | null {
    // PADDING IS PART OF THE EXTENT (extentOf): the kernel's rule is a max over
    // the children's boxes and knows nothing of the insets, so a padded view
    // keeps the JavaScript derive. Teaching the rule the inset totals is the
    // way to take this back (kernel.md); a padded container is common enough
    // (every Card) that guessing here would be wrong in the visible direction.
    if (!insetIsZero(this.padding)) return null;
    if (!kernelLoaded() || !viewLayoutReady()) return null;
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareNoKernelExtent?: boolean }).__declareNoKernelExtent === true) return null;   // the A/B switch (profiling builds only)
    if (this.contentExtent !== View.prototype.contentExtent) return null;
    for (const c of this.children) if (c instanceof View && c.is3D()) return null;
    const target = slotCellOf(this, size);
    if (target < 0) return null;
    const K = kernel();
    const words = this.extentWords();
    if (words.length > 1000) return null;   // the scratch's reach; a JS derive walks any count
    const rule = K.extentAdd(size === "width" ? 0 : 1, target, words);
    if (rule < 0) return null;
    const k = new Constraint(`${this.constructor.name}.${size} (runtime derive)`, () => undefined, () => {}, 0, true);
    k.isAutoExtent = true;
    k.adoptRule(rule);
    k.onDecline = () => {
      const d = EXTENT.get(this);
      if (d === undefined || d[size] !== k) return;
      k.dispose(); release(this, size, k);
      d[size] = markExtent(bindDerived(this, size, () => this.extentOf(size)));
    };
    own(this, size, k);
    K.run(rule);
    return k;
  }
  /** The kernel auto-extent's word list: the child-list cell, then each View
   *  child's numeric block base (the rule reads its slots by base). */
  private extentWords(): number[] {
    const words: number[] = [this.structureCellId()];
    for (const c of this.children) if (c instanceof View) words.push(blockOf(c));
    return words;
  }

  private extentOf(size: "width" | "height"): number {
    // The child-LIST is a dependency too: a container populated by
    // replication (or createView) starts empty — without this, a constraint
    // reading contentWidth/contentHeight at that moment tracks nothing and
    // freezes (the menu-panel bug). Attr reads below cover the children that
    // exist; the structure cell covers arrival and removal.
    this.watchChildList();
    const axis = AXIS_OF[size];
    let max = this.contentExtent(size);
    for (const c of this.children) {
      if (!(c instanceof View) || !c.visible) continue;
      if (c.ignoreClip) continue; // frame chrome: derives from the bounds, never defines them
      if (percentOwned(c, axis) || percentOwned(c, size)) continue;
      // The TRANSFORMED footprint (bounds), not the raw slots: a scaled or
      // rotated child counts the box it visibly covers — the same geometry
      // paint and the hit walk already honor (one geometry, every reader
      // agrees; the 2026-08-13 scale ruling).
      const b = c.bounds();
      const extent = (axis === "x" ? b.x : b.y) + b[size];
      if (extent > max) max = extent;
    }
    // PADDING IS PART OF THE EXTENT, both insets. Every child's box above was
    // measured from the CONTENT origin, so nothing in `max` carries either
    // half: the leading inset is the room before the first child, the trailing
    // one the room that must still exist beyond the last of them for the box
    // to read as padded. `this.contentExtent(size)` — an Image's bitmap, a
    // Text's measured run — is content too, and sits inside the same box.
    //
    // This is also the SCROLLER's rule (RULED 2026-09-19, against CSS's decade
    // of getting it wrong): a padded scroller must stop the full bottom inset
    // after its last child, not flush against it.
    //
    // A tracked read: writing `padding` re-derives every container that sizes
    // itself. 0 for a view that was never given any — the common case, and the
    // arithmetic is one addition of two literal zeroes.
    const [top, right, bottom, left] = insetSides(this.padding);
    return max + (size === "width" ? left + right : top + bottom);
  }

  /** THIS VIEW'S CONTENT ORIGIN, in its own coordinates: the leading insets of
   *  `padding`. Every child's `x`/`y` is measured from here — laid,
   *  self-placing and `ignoreLayout` alike — which is what makes the content
   *  box a property of the view rather than of whatever arranges it. */
  contentOrigin(): { x: number; y: number } {
    const [top, , , left] = insetSides(this.padding);
    return { x: left, y: top };
  }

  /** THE ROOM INSIDE: this view's extent on `size` less both of `padding`'s
   *  insets on that axis, never below 0. It is what `100%` and every other
   *  percent resolves against (bind.ts bindPercent), what a layout divides
   *  (`Layout.contentExtent` is this, through the arranged view), and what a
   *  component spanning its parent's content reads (library Divider).
   *  `{ parent.width }` deliberately still answers the parent's literal box —
   *  "the space I am given" versus "the parent's own width". */
  contentBox(size: "width" | "height"): number {
    const raw = size === "width" ? this.width : this.height;
    const p = this.padding;
    if (p === 0) return raw;               // identity, clamp included: see below
    const [top, right, bottom, left] = insetSides(p);
    const pair = size === "width" ? left + right : top + bottom;
    // The floor guards the INSET, not the author: an inset deeper than the box
    // would otherwise hand a layout a negative room to divide. An unpadded
    // view answers with its extent EXACTLY as written — a degenerate negative
    // width stays negative, because clamping it here would make `padding = 0`
    // observably different from no padding (a `x = center` child of a
    // collapsed, invisible row was the one place in the corpus that saw it).
    return pair === 0 ? raw : Math.max(0, raw - pair);
  }

  /** The kernel's view id and its visibility rule (−1 = none): the ancestor
   *  walk runs in the kernel over the table, and `visGeneric`/`visWake`
   *  become small wired rules over the vis* output cells. */
  private visElem = -1;
  private visRule = -1;
  /** @internal This view as the kernel knows it (its block + parent link),
   *  registering the ancestors on the way up. */
  kernelElem(): number {
    if (this.visElem >= 0) return this.visElem;
    const base = blockOf(this);
    const p = this.parent instanceof View ? this.parent.kernelElem() : -1;
    this.visElem = kernel().viewAdd(base, p);
    return this.visElem;
  }
  /** A (re)attach may have moved this view under a new parent: refresh the
   *  kernel's link and the rule's edges, and land the facts again. */
  private relinkKernelVis(): void {
    const K = kernel();
    const p = this.parent instanceof View ? this.parent.kernelElem() : -1;
    K.viewParent(this.visElem, p);
    K.visRewire(this.visRule);
    K.run(this.visRule);
  }
  /** @internal THE ORIGIN SHIFT, at the seam: what this view's own `x`/`y` is
   *  measured from in the coordinates its SURFACE lives in — its position
   *  host's content origin on that axis. The host is the parent, or the
   *  scroller this view travels with (travelWith re-hosts the surface, and the
   *  position slots then mean that scroller's content coordinates).
   *
   *  One number, not a point, and an early literal 0 for the unpadded case:
   *  this runs on every position push, which is every frame of every animated
   *  or laid-out view in the tree. */
  positionLead(axis: "x" | "y"): number {
    const t = this.travelHost;
    const host = t === undefined || t === null ? this.parent : t;
    if (!(host instanceof View)) return 0;
    const p = host.padding;
    if (p === 0) return 0;
    return insetLead(p, axis);
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
  bounds(): { x: number; y: number; width: number; height: number } {
    const f = this.footprint();
    return { x: this.x + f.x, y: this.y + f.y, width: f.width, height: f.height };
  }

  /** The POSITION-FREE half of `bounds()`: the transformed box relative to
   *  this view's own untransformed origin — `x`/`y` here are the lead offsets
   *  the transform introduces (0 when untransformed; negative when a
   *  centered-pivot scale-up grows past the origin), `width`/`height` the
   *  footprint extents. Reads ONLY width, height, scale, pivotX, pivotY,
   *  rotation — never `x`/`y` — which is what a layout's place() must consume:
   *  a strategy that read a slot it writes would wake itself and break the
   *  one-pass discipline (pinned by the re-layout test). `bounds()` is this
   *  plus the position, for every reader that is not writing the position. */
  footprint(): { x: number; y: number; width: number; height: number } {
    const w = this.width;
    const h = this.height;
    // a view out of its plane: the projected quad's bounds, position-free (projective.ts)
    if (this.is3D()) return footprint3D(this, this.localTransform(), this.parent instanceof View ? this.parent.perspective : 0);
    const m = this.localTransform();
    if (isIdentityAffine(m)) return { x: 0, y: 0, width: w, height: h };
    return boxThrough(m, 0, 0, w, h);
  }

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
  get childViews(): readonly View[] {
    // TRANSPARENT, not abstracted (RULED 2026-08-02, superseding D5's refusal).
    // On a virtualized block this answers with the instances that exist right
    // now — a subset, and it changes as you scroll. That was the reason the
    // read used to throw: a partial answer was indistinguishable from a whole
    // one. It is distinguishable now, because virtualization is explicit at
    // the source and legible at runtime through `virtualized`. So the honest
    // move is to say what is there and let the reader see the flag, rather
    // than refuse a question the program is entitled to ask.
    this.watchChildList();
    return this.children.filter((c): c is View => c instanceof View);
  }

  /** Is this view's replicated content virtualized right now? Read-only, and
   *  TRACKED — the policy takes a `{ }`, so a block can engage and disengage
   *  while the program runs, and a constraint reading this follows it.
   *
   *  This is what makes `childViews` legible on a virtualized block: the list
   *  is the instances that exist, which is a subset, and this says so. Counts
   *  of the collection still come from the DATA, which is complete by
   *  definition — but that is now a thing you can see rather than a rule the
   *  runtime enforces by refusing to answer. */
  get virtualized(): boolean { return readVirtualized(this); }

  /** Pointer-interaction intrinsics (interaction.ts): `hovered` is true while
   *  this view is on the live hit chain — the topmost visible view under the
   *  pointer and its ancestors, occlusion-correct, false on touch; `pressed`
   *  while it is on the chain captured at pointer-down (a mouse press releases
   *  dragged off, re-arms dragged back; a touch press holds while down).
   *  Read-only reactive intrinsics like `contentWidth` (schema readOnly — a
   *  set is a compile error); reading one from a constraint subscribes it.
   *  Pay-per-use: a program that never reads them allocates nothing. */
  get hovered(): boolean { return readHovered(this); }
  get pressed(): boolean { return readPressed(this); }

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
  declare onScreen: boolean;

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
  declare visibleRect: { x: number; y: number; width: number; height: number };

  /** The composed scale from MY units to DEVICE pixels — ancestor scales ×
   *  devicePixelRatio. THE raster-rung fact: an image pyramid picks its tier
   *  from it, a drawn view its backing density, without reimplementing the
   *  composed transform or reaching for a host global. Within Declare's own
   *  transforms (uniform scale + rotation — a similarity) this is exact and
   *  rotation does not participate; under a non-similar HOST transform (an
   *  embedding page's CSS) it is the largest axis ratio — the rasterization
   *  convention (what CA's contentsScale does). Same at-rest delivery as
   *  visibleRect. Read-only. */
  declare apparentScale: number;

  /** The default focus-traversal members of this view: its visible View
   *  children in source order (docs/system-design/input.md, Layer 2). The focus
   *  service descends into each; a view whose `tabOrder()` is not overridden
   *  uses this, so an all-default tree is pure tree preorder. An override may
   *  call it to compose ("the rest, minus X"). */
  tabDefault(): View[] {
    const out: View[] = [];
    for (const c of this.children) if (c instanceof View && c.visible) out.push(c);
    return out;
  }

  /** Internal focus notification, called by the focus service when this view
   *  gains (true) or loses (false) Declare focus — SEPARATE from the user's
   *  `onFocus`/`onBlur` handlers, so a built-in component (TextInput) can drive
   *  its native element without occupying the author's event slot. No-op on a
   *  plain view. */
  focusChanged(_focused: boolean): void {}

  /** The OPTICAL band the `center` position literal centers — { lead, size }
   *  along the given axis, in this view's own coordinates. The base answer is
   *  the whole box (lead 0); Text overrides the y axis with its ink band (cap
   *  height to last baseline — the text-box-trim semantics). The same
   *  component-supplies-its-shape protocol family as the focus silhouette. */
  alignBand(axis: "x" | "y"): { lead: number; size: number } {
    return { lead: 0, size: axis === "x" ? this.width : this.height };
  }

  /** The self-completing exit (Node.discard does the unlink + ex-parent
   *  notify): this override only moves the DEPARTURE hook earlier for the
   *  still-linked caller — presence ends while the tree is WHOLE, so an
   *  `onRetire` reading `parent`, a datapath, or focus sees live state (the
   *  replicator's own order: fire, unlink, teardown). Unlink-first paths
   *  arrive with `parent` null and keep today's timing: teardown's own
   *  lifetime-guarded fire covers them. */
  override discard(): void {
    if (this.parent !== null) {
      if (!EVICTING.has(this)) fireRetireTree(this);
      // Focus must find its survivor while this subtree is still LINKED —
      // noteDiscarded walks the live tree for a neighbor (idempotent: the
      // teardown-path call below finds focus already moved and returns).
      focusDiscardHook?.(this);
    }
    super.discard();
  }

  /** Retire this subtree: dispose every standing computation (bindings,
   *  percents, derives, a laid parent's constraints on these slots, the draw
   *  recording), run registered teardowns (a replicator's), uninstall the
   *  arrangement, and destroy the surfaces — so no data or attribute change
   *  can ever wake work for a removed view. Children first; teardown ONLY —
   *  unlinking (and notifying the ex-parent) is discard's, the verb above. */
  override teardown(): void {
    // The departure hook (D5/D8): presence is ENDING — fire onRetire down
    // the subtree while everything is still alive, unless this discard is a
    // window EVICTION (the presence continues; the replicator marked it).
    // A verb-entry discard already fired this while LINKED; the per-lifetime
    // guard makes this second call a no-op.
    if (EVICTING.has(this)) EVICTING.delete(this);
    else fireRetireTree(this);
    // Move focus off this subtree before it is torn down (input.md §mutation).
    focusDiscardHook?.(this);
    // EVERY child, not just Views: an Animator/Spring child is a Node, and its
    // `to`/`attribute` bindings must be disposed too (else they leak, subscribed
    // to whatever they read — e.g. a Spring `to = { app.openSection … }`).
    for (const child of this.children) child.teardown();
    runRetire(this);
    const undoLayout = INSTALLED.get(this);
    if (undoLayout !== undefined) {
      INSTALLED.delete(this);
      undoLayout();
    }
    disposeBindings(this);
    freeCells(this);
    if (this.visRule >= 0) { kernel().dispose(this.visRule); this.visRule = -1; }
    if (this.visElem >= 0) { kernel().viewRemove(this.visElem); this.visElem = -1; }
    // the visibility feed dies with the view — the backend watch, the generic
    // computer, and any at-rest flush still pending
    this.visUnwatch?.();
    this.visUnwatch = null;
    if (this.visGeneric !== null) { this.visGeneric.dispose(); this.visGeneric = null; }
    if (this.visWake !== null) { this.visWake.dispose(); this.visWake = null; }
    if (this.visFlushTimer !== 0) { clearTimeout(this.visFlushTimer); this.visFlushTimer = 0; }
    this.visPending = null;
    this.visStale = false;
    this.drawing?.dispose();
    this.drawing = null;
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
    // Pushers fire on CHANGE; the attach flush carries pre-attach state
    // across (the Image.stretches discipline). Text selection is realized by
    // the text leaves themselves (Text/TextInput's `selectable` push), which
    // read the ambient `selectable` provided value. A container that PROVIDES
    // `selectable = true` is additionally a selection SURFACE, so a press in the
    // gap between its leaves anchors on it (backend.setSelectableRegion).
    if (localProvision(this, "selectable") === true) s.setSelectableRegion?.(true);
    // an armed visibility feed follows the view onto its (re)attached surface
    if (this.visArmed) this.startVisibility();
    // The position lands in the parent's CONTENT coordinates — x/y plus the
    // parent's leading inset, the one place the origin shift reaches paint
    // (the pushers below do the same for every later change). Everything past
    // the seam then sees ordinary surface geometry: the canvas compositor's
    // walk, its hit test, the native host's ops and the browser's own
    // scrollable overflow all honour padding without knowing it exists.
    s.setX(this.x + this.positionLead("x"));
    s.setY(this.y + this.positionLead("y"));
    s.setWidth(this.width);
    s.setHeight(this.height);
    if (!insetIsZero(this.padding)) s.setPadding?.(this.padding);
    s.setFill(this.fill);
    // Decoration beyond the flat fill is pay-per-use at the seam too: an
    // undecorated box exercises exactly the calls it always did (pushers
    // carry any post-attach change regardless).
    if (this.cornerRadius !== 0) s.setCornerRadius(this.cornerRadius);
    if (this.stroke !== null) s.setStroke(this.stroke);
    if (this.shadow !== null) s.setShadow(this.shadow);
    s.setVisible(this.visible);
    s.setOpacity(this.opacity);
    if (this.ignoreClip) s.setIgnoreClip?.(true);
    if (this.ignoreScroll) s.setIgnoreScroll?.(true);
    if (this.cursor !== "") s.setCursor(this.cursor);
    if (this.pointerEvents !== "") s.setPointerEvents(this.pointerEvents);
    if (this.scale !== 1 || this.pivotX !== 0 || this.pivotY !== 0 || this.rotation !== 0
        || this.scaleX !== 1 || this.scaleY !== 1 || this.skewX !== 0 || this.skewY !== 0 || this.is3D()) pushTransform(this);
    if (this.perspective !== 0) s.setPerspective?.(this.perspective);
    if (this.blend !== "normal") s.setBlend?.(this.blend);
    if (this.backdrop !== null) s.setBackdrop?.(nullIfEmpty(filterList(this.backdrop)));
    if (this.filter !== null) s.setFilter?.(nullIfEmpty(filterList(this.filter)));
    if (this.mask !== null) this.applyMask(this.mask);
    // a stencil attaching late: the views it masks re-push, now with a surface
    if (this.maskUsers !== null) for (const u of this.maskUsers) if (u.mask === (this as unknown as Mask)) u.applyMask(u.mask);
    this.applyClip(this.clip);
    // The facts' read halves: the platform mirrors its offset and its
    // in-motion state in; nothing here pushes out (a request is a verb call).
    const scrolling = (a: boolean) => { this.scrolling = a; };
    if (this.scrolls === "y" || this.scrolls === "both") s.setScroll?.(true, (y) => { this.scrollY = y; }, scrolling);
    if (this.scrolls === "x" || this.scrolls === "both") s.setScrollX?.(true, (x) => { this.scrollX = x; }, scrolling);
    // A DECLARED START, applied once as a request (a hidden pane holds it —
    // dom-backend SCROLL_WANT; boot.ts re-applies after the first layout).
    if (this.scrollStartY !== 0) this.surface?.scrollToY?.(this.scrollStartY);
    if (this.scrollStartX !== 0) this.surface?.scrollToX?.(this.scrollStartX);
    const sink = this.inputSink();
    if (sink !== null) s.setInput(sink, this.inputWants());
    // a linked view wears the link affordance from first paint (rewireInput
    // carries post-attach changes; this is the attach-time half), and realizes
    // its REAL anchor where the backend can (location.md §0.4)
    if (this.cursor === "" && this.link !== "") s.setCursor("pointer");
    if (this.link !== "") s.setLink?.(this.link, (this as unknown as { label?: string }).label ?? "");
    if (this.draw) this.bindDraw();
  }

  /** THE HIT TEST: the view under a root-space point, or null. The same walk
   *  the pointer is routed by (interaction.ts) — clip shapes, scale, pivot,
   *  `pointerEvents`, and `ignoreClip` all count exactly as they do for a real
   *  press — so what a handler computes and what the runtime routes can never
   *  disagree. Answers the deepest (topmost) view; walk `.parent` to find an
   *  eligible ancestor:
   *
   *      onPointerUp(e) {
   *          let t = app.viewAt(e.x, e.y)
   *          while (t != null && t.accept == null) t = t.parent
   *          if (t != null) t.accept(dragged)
   *          },
   *
   *  Root-space, like the coordinates `onPointerMove`/`onPointerUp` carry, so a
   *  drag can pass its own event coordinates straight in. (Root-space is the
   *  root's CONTENT space; the walk itself runs in frame space, so the root's
   *  own scroll converts here at the boundary — the contract stays exactly
   *  what the drag pairing needs, scrolled or not.) */
  viewAt(x: number, y: number): View | null {
    const r = (this.root ?? this) as View;
    return hitAt(r, x - r.scrollX, y - r.scrollY) as View | null;
  }

  /** Does this view's box contain the root-space point? Geometry only — what
   *  paints ON TOP is `viewAt`'s question — so a drop target can ask about
   *  itself without walking the tree. */
  containsPoint(x: number, y: number): boolean {
    return boxContains(this, x, y);
  }

  /** This view's origin in ROOT space (the root's content coordinates — the
   *  same space `viewAt` takes and drag events carry). THE one walk
   *  (interaction.ts): translate per level MINUS every intermediate scroll
   *  offset, with the root's own scroll added back at the boundary — so an
   *  overlay anchored by it (a menu at a pointer, a popover under a control)
   *  lands where the view is SEEN, at any scroll. Components call this
   *  instead of hand-accumulating ancestor x/y, which is scroll-blind. */
  /** This view's BOX in root space — rootOrigin()'s sibling for the whole
   *  frame: the transformed axis-aligned box (ancestor scale/rotation
   *  composed, every intermediate scroll subtracted; interaction.ts
   *  rootFrameBox — the hit walk's own math). A one-shot QUERY, deliberately
   *  not a fact: absolute geometry depends on every ancestor, and a live slot
   *  would re-derive on each scrolled pixel. Compose with the viewport facts
   *  for "where am I on screen": `rootBounds().y - app.scrollY` against
   *  `app.hostHeight`. For the coarse question, bind `onScreen` instead. */
  rootBounds(): { x: number; y: number; width: number; height: number } {
    const b = rootFrameBox(this as unknown as InteractionView);
    const r = (this.root ?? this) as View;
    return { x: b.x + r.scrollX, y: b.y + r.scrollY, width: b.width, height: b.height };
  }

  /** The visibility feed — armed at the FIRST tracked read of any of the
   *  three facts (AttrSpec.onTrack: facts nobody binds cost nothing),
   *  re-armed at attach so a bound view that re-attaches keeps its feed.
   *
   *  TWO FEEDERS, one contract. A backend with page context implements
   *  Surface.watchVisibility (DOM: one shared IntersectionObserver — sees the
   *  host page's scroll and transforms, which the app cannot). Everywhere
   *  else — canvas, native, headless — the runtime computes the facts itself:
   *  a Constraint over the ancestor walk (rootFrameBox ∩ the root's frame,
   *  rootTransform's scale × dpr), whose TRACKED reads subscribe it to
   *  exactly the ancestor x/y/scale/rotation/scroll/visible slots the answer
   *  depends on — the camera case (a world writing its own scale) invalidates
   *  it for free, with no attribute of the descendant changing.
   *
   *  DELIVERY GRANULARITY (the Aperture ruling): `onScreen` lands
   *  immediately — a crossing is rare and cheap. `visibleRect` /
   *  `apparentScale` land AT REST — while the shared clock has motion in
   *  flight the latest value is buffered and flushed when the glide ends, so
   *  a fact-bound tier re-derives once per flight, not per frame. */
  private visArmed = false;
  private visUnwatch: (() => void) | null = null;
  private visGeneric: Constraint | null = null;
  private visWake: Constraint | null = null;
  private visPending: { rect: { x: number; y: number; width: number; height: number }; scale: number } | null = null;
  private visStale = false;
  private visFlushTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** @internal the attribute table's onTrack calls this (first tracked read). */
  armVisibility(): void {
    this.visArmed = true;
    this.startVisibility();
  }
/** THE KERNEL PATH. The kernel's rule walks this view's parent chain in the
   *  slot table — rootTransform ∘ boxThrough ∩ the root's frame, scale × dpr,
   *  the arithmetic of readVisibility term for term — and writes the vis*
   *  cells; a wired JS rule over those cells delivers (or wakes). A 3D
   *  transform anywhere on the chain is beyond the affine walk: the rule
   *  writes visMode = 0 and the JS walk takes over (visFallbackToJS). Returns
   *  false when the kernel path is not available (no kernel; 3D at arm). */
  private installKernelVis(): boolean {
    if (this.visRule >= 0) return true;
    if (!kernelLoaded() || !viewLayoutReady()) return false;
    for (let v: View | null = this; v !== null; v = v.parent instanceof View ? v.parent : null)
      if (v.rotateX !== 0 || v.rotateY !== 0 || v.translateZ !== 0) return false;
    const K = kernel();
    const root = (this.root ?? this) as View;
    const rule = K.visAdd(this.kernelElem(), root.kernelElem());
    if (rule < 0) return false;
    this.visRule = rule;
    K.run(rule);
    return true;
  }
/** The delivery rule: wired over the seven output cells. */
  private visOutputRule(label: string, land: (on: boolean, rect: { x: number; y: number; width: number; height: number } | null, scale: number) => void): Constraint {
    const c = new Constraint(label,
      () => [this.visMode, this.visOn, this.visScale, this.visX, this.visY, this.visW, this.visH] as const,
      (v) => {
        const [mode, on, scale, x, y, w, h] = v as readonly [number, boolean, number, number, number, number, number];
        if (mode === 0) { this.visFallbackToJS(); return; }
        land(on, on ? { x, y, width: w, height: h } : null, scale);
      });
    c.wire(() => { void this.visMode; void this.visOn; void this.visScale; void this.visX; void this.visY; void this.visW; void this.visH; });
    return c;
  }
/** The chain grew a 3D transform: retire the kernel rule and run the JS
   *  walk as a tracking constraint from here on (this life). */
  private visFallbackToJS(): void {
    if (this.visRule < 0) return;
    kernel().dispose(this.visRule); this.visRule = -1;
    if (this.visGeneric !== null) { this.visGeneric.dispose(); this.visGeneric = null; }
    if (this.visWake !== null) { this.visWake.dispose(); this.visWake = null; }
    this.startVisibility();
  }
  /** The model's own answer — the ancestor walk, with TRACKED reads: the
   *  visible chain, rootTransform, rootFrameBox. The generic feed delivers
   *  this value; the DOM feed runs the same reads purely as a WAKE (below),
   *  because the reads subscribing to exactly the ancestor slots the answer
   *  depends on is what makes the camera case (a world writing only its own
   *  scale) invalidate a descendant's facts with no attribute of its own
   *  changing. */
  private readVisibility(): { on: boolean; rect: { x: number; y: number; width: number; height: number } | null; scale: number } {
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    // hidden anywhere up the chain = off (tracked reads, so a flip wakes us)
    for (let v: View | null = this; v !== null; v = v.parent instanceof View ? v.parent : null)
      if (!v.visible) return { on: false, rect: null, scale: rootTransform(this as unknown as InteractionView).scale * dpr };
    const t = rootTransform(this as unknown as InteractionView);
    const b = rootFrameBox(this as unknown as InteractionView);
    const r = (this.root ?? this) as View;
    const ix = Math.max(b.x, 0), iy = Math.max(b.y, 0);
    const iw = Math.min(b.x + b.width, r.width) - ix, ih = Math.min(b.y + b.height, r.height) - iy;
    if (iw <= 0 || ih <= 0) return { on: false, rect: null, scale: t.scale * dpr };
    const k = t.scale === 0 ? 1 : t.scale;
    return {
      on: true,
      rect: { x: (ix - b.x) / k, y: (iy - b.y) / k, width: iw / k, height: ih / k },
      scale: t.scale * dpr,
    };
  }
  private startVisibility(): void {
    if (!this.visArmed) return;
    const s = this.surface;
    if (s?.watchVisibility) {
      // backend feed available: retire any generic computer from a prior life
      if (this.visGeneric !== null) { this.visGeneric.dispose(); this.visGeneric = null; }
      this.visUnwatch?.();
      this.visUnwatch = s.watchVisibility((v) => this.deliverVisibility(v.on, v.rect, v.scale));
      // THE WAKE (the sprung-camera fix). An IntersectionObserver is an EDGE
      // sensor: it reports when the intersection crosses a threshold, not
      // when the level changes — a fully visible box under a scaling
      // ancestor crosses nothing and reports nothing, and mid-glide entries
      // are samples frozen at each box's crossing instant. So the facts
      // cannot be read off the observer's last entry; it is kept for what
      // only it can see (the HOST PAGE's scroll and transforms, ancestor
      // clip) and as the measurement instrument. The model's tracked reads
      // are the wake: when an ancestor slot changes, RE-ASK the observer for
      // current truth (refreshVisibility → a fresh entry) — at once when at
      // rest, at the glide's end otherwise. The computed value is discarded:
      // the model cannot see the page context, the observer can.
      if (this.visWake === null) {
        // THE KERNEL PATH first: the chain walk runs over the slot table and a
        // small wired rule over its outputs does the waking (installKernelVis).
        const wake = (): void => {
          if (sharedClock.busy) { this.visStale = true; this.scheduleVisFlush(); return; }
          this.surface?.refreshVisibility?.();
        };
        if (this.installKernelVis()) {
          this.visWake = this.visOutputRule(`${this.constructor.name}.visibilityWake`, () => wake());
        } else {
          this.visWake = new Constraint(
            `${this.constructor.name}.visibilityWake`,
            () => this.readVisibility(),
            wake,
          );
          this.visWake.run();
        }
      } else if (this.visRule >= 0) this.relinkKernelVis();
      return;
    }
    if (this.visGeneric !== null) { if (this.visRule >= 0) this.relinkKernelVis(); return; } // already computing
    if (this.installKernelVis()) {
      this.visGeneric = this.visOutputRule(`${this.constructor.name}.visibility`,
        (on, rect, scale) => this.deliverVisibility(on, rect, scale));
      return;
    }
    this.visGeneric = new Constraint(
      `${this.constructor.name}.visibility`,
      () => this.readVisibility(),
      (v) => {
        const r = v as { on: boolean; rect: { x: number; y: number; width: number; height: number } | null; scale: number };
        this.deliverVisibility(r.on, r.rect, r.scale);
      },
    );
    this.visGeneric.run();
  }
  /** Arm the at-rest flush (the timer only exists while something is pending
   *  or stale — no standing loop). At rest it prefers RE-MEASURING over
   *  replaying: a buffered value from mid-glide is a sample of the journey,
   *  not the destination. */
  private scheduleVisFlush(): void {
    if (this.visFlushTimer !== 0) return;
    const tick = (): void => {
      this.visFlushTimer = 0;
      if (sharedClock.busy) { this.visFlushTimer = setTimeout(tick, 120); return; }
      const p = this.visPending;
      this.visPending = null;
      const s = this.surface;
      if (this.visStale && s?.refreshVisibility) {
        // the backend can measure current truth — ask it; the fresh entry
        // arrives through deliverVisibility on the now-idle clock
        this.visStale = false;
        s.refreshVisibility();
        return;
      }
      this.visStale = false;
      if (p !== null) {
        setBound(this, "visibleRect", p.rect);
        setBound(this, "apparentScale", p.scale);
        if (this.drawing !== null && p.rect !== null) this.surface?.setRasterScale?.(p.scale);
      }
    };
    this.visFlushTimer = setTimeout(tick, 120);
  }
  private deliverVisibility(on: boolean, rect: { x: number; y: number; width: number; height: number } | null, scale: number): void {
    if (this.onScreen !== on) setBound(this, "onScreen", on);
    const shaped = on && rect !== null ? rect : EMPTY_RECT;
    if (sharedClock.busy) {
      // mid-glide: hold the latest, flush at rest
      this.visPending = { rect: shaped, scale };
      this.scheduleVisFlush();
      return;
    }
    this.visPending = null;
    setBound(this, "visibleRect", shaped);
    setBound(this, "apparentScale", scale);
    if (this.drawing !== null && on) this.surface?.setRasterScale?.(scale);
  }

  /** The composed transform from MY frame to ROOT-frame space — `{x, y,
   *  scale, rotation}`, the similarity the language's transforms compose to
   *  (scroll-aware, the hit walk's own math). The METHOD tier's exact answer;
   *  the facts above are its coarse, at-rest companions. */
  rootTransform(): { x: number; y: number; scale: number; rotation: number } {
    const t = rootTransform(this as unknown as InteractionView);
    const r = (this.root ?? this) as View;
    return { x: t.tx + r.scrollX, y: t.ty + r.scrollY, scale: t.scale, rotation: t.rotation };
  }

  rootOrigin(): { x: number; y: number } {
    const o = rootFrameOrigin(this as unknown as InteractionView);
    const r = (this.root ?? this) as View;
    return { x: o.x + r.scrollX, y: o.y + r.scrollY };
  }

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
  travelWith(scroller: View | null): boolean {
    this.travelHost = scroller;
    return this.applyTravel();
  }

  /** The standing travel request (undefined = never asked). Applied here and
   *  re-applied at attach; `travelDone` is the reactive echo the requester
   *  reads (see attach). */
  private travelHost: View | null | undefined = undefined;

  private applyTravel(): boolean {
    const scroller = this.travelHost;
    if (scroller === undefined) return false;
    const s = this.surface as (Surface & { travelWith?(h: unknown): void }) | null;
    if (s === null || typeof s.travelWith !== "function") return false;
    const home = scroller === null || scroller === this.parent;
    if (home) {
      s.travelWith(null);
      this.repushPosition();
      return false;
    }
    if (scroller.surface === null) return false;
    s.travelWith(scroller.surface);
    // The position host changed, so the content origin this view's x/y is
    // measured from did too (positionLead). Nothing wrote x or y, so only an
    // explicit re-push lands it.
    this.repushPosition();
    return true;
  }

  /** @internal Re-send x/y through the seam against the CURRENT position host
   *  — the one case where the realized position changes without either slot
   *  moving (a padding write on the host, a travelWith that re-hosts the
   *  surface). */
  repushPosition(): void {
    const s = this.surface;
    if (s === null) return;
    s.setX(this.x + this.positionLead("x"));
    s.setY(this.y + this.positionLead("y"));
  }

  /** Scroll this view to the top of its nearest scrolling ancestor — the
   *  imperative companion to the reactive `scrolls`/`scrollY` pair (a click
   *  handler calls it to jump to a target). Both backends do the work in their
   *  Surface; a no-op before attach or with nothing scrolling above. (Named for
   *  the platform primitive — `reveal` is deliberately left free as a member name,
   *  e.g. a `reveal:` fade-in Spring.) */
  scrollIntoView(align?: "start" | "nearest", smooth?: boolean, inset?: number): void {
    this.surface?.scrollIntoView(align, smooth, inset);
  }

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
  scrollTo(y: number, glide?: { duration?: number; motion?: string }): void {
    if (Number.isFinite(y) && glide === undefined) this.scrollY = y;   // a glide arrives through the mirror as it moves
    this.surface?.scrollToY?.(y, glide);
  }

  /** The horizontal twin of `scrollTo` — same request/clamp/hold contract,
   *  for a `scrolls = x` (or `both`) view. */
  scrollToX(x: number, glide?: { duration?: number; motion?: string }): void {
    if (Number.isFinite(x) && glide === undefined) this.scrollX = x;
    this.surface?.scrollToX?.(x, glide);
  }

  /** A RELATIVE request — `scrollBy(dx, dy[, glide])`: the same contract as
   *  `scrollTo`/`scrollToX`, measured from the current facts. The optional
   *  glide is the provider's own motion (see ScrollGlide in backend.ts). */
  scrollBy(dx: number, dy: number, glide?: { duration?: number; motion?: string }): void {
    if (dy !== 0) this.scrollTo(this.scrollY + dy, glide);
    if (dx !== 0) this.scrollToX(this.scrollX + dx, glide);
  }

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
  /** Imperative creation (planes.md §7): instantiate a component by NAME
   *  into THIS view — the receiver is the parent, and with it the new
   *  instance's scope and data anchor (`classroot` resolution and `datapath`
   *  inheritance boot against it). A full citizen: bindings installed, init
   *  fired, and the arrangement/auto-extent notified (childrenMutated).
   *  Resolves against the tree's program registry (via `root`); a name
   *  referenced only here needs `use [ Name ]` to survive static tracing.
   *  `props` are post-init writes (`datapath: record` gives the instance a
   *  data context — replication's convention). The pair of `discard()`. */
  createView(tag: string, props?: Record<string, unknown>): View {
    if (viewCreator === null) throw new Error(diag`createView: the instantiation module is not loaded`);
    return viewCreator(this.root as View, tag, this, props);
  }

  raise(below?: View | null): void {
    const p = this.parent;
    if (!(p instanceof View)) return;
    const away = (this.surface as (Surface & { isTraveling?(): boolean }) | null)?.isTraveling?.() === true;
    if (below == null || below === this || below.parent !== p) {
      if (p.children[p.children.length - 1] === this) return;         // already frontmost
      p.removeChild(this);
      p.insertChild(this, p.children.length);
      if (!away && this.surface !== null && p.surface !== null) p.surface.insertChild(this.surface, null);
      return;
    }
    if (p.children[p.children.indexOf(below) - 1] === this) return;   // already just beneath `below`
    p.removeChild(this);
    const at = p.children.indexOf(below);
    p.insertChild(this, at < 0 ? p.children.length : at);
    if (!away && this.surface !== null && p.surface !== null && below.surface !== null) {
      p.surface.insertChild(this.surface, below.surface);
    }
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
    const handled = POINTER_TYPES.some((t) => typeof self[handlerName(t)] === "function");
    // A tip-carrying view is hover-interactive by that fact alone (pay-per-use
    // extends to the tip attribute): its sink reports over/out/press to the
    // Tip service; declared handlers, when present, fire exactly as before.
    // A LINKED view is interactive by the same rule (location.md §0.4): `link`
    // grants interest the way a handler does, and a plain click follows the
    // reference — AFTER any declared onClick (handler first, then follow; the
    // handler cannot cancel — veto belongs to onFollow, or to link = "").
    // A SCROLLER is interactive by the same rule. `scrolls` declares that this
    // view answers drags and wheels over its box, and the answer is scrolling —
    // performed by the platform's scroll process rather than by a method, which
    // is what makes it look like an exception and is not one. The consequence
    // the walk needs is that a scroller TAKES the point: content behind it is
    // not reachable through it, exactly as on the web and in every native
    // toolkit, and a tap on its empty area does not fall through to whatever
    // was declared beneath it.
    const scroller = this.scrolls !== "none";
    if (!handled && !scroller && this.tip === "" && this.link === "") return null;
    return (type, x, y, extra) => {
      if (this.tip !== "") {
        if (type === "pointerOver") Tip.over(this);
        else if (type === "pointerOut") Tip.out(this);
        else if (type === "pointerDown") Tip.hide();
      }
      // One plain event argument: the point in this view's coordinates, plus
      // whatever fact this event kind carries (`canceled` on a release, the
      // finger list on the raw touch family).
      if (handled) fireEvent(this, type, extra === undefined ? { x, y } : { x, y, ...extra });
      if (type === "click" && this.link !== "") {
        const app = this.root as unknown as { follow?: (ref: string, replace?: boolean) => void };
        app?.follow?.(this.link, this.replace);
      }
    };
  }

  /** Re-derive the surface's input wiring — the pusher for attributes that
   *  GRANT interest by their value (`link`; a post-attach handler install goes
   *  through here too). Idempotent: attach-time flush and this call converge
   *  on the same sink/wants pair. */
  rewireInput(): void {
    const s = this.surface;
    if (s === null) return;
    const sink = this.inputSink();
    if (sink !== null) s.setInput(sink, this.inputWants());
    // A linked view reads as a link: the pointer affordance, unless the author
    // set an explicit cursor. (The DOM path also gets this from the realized
    // anchor; canvas gets it only from here.)
    if (this.cursor === "") s.setCursor(this.link !== "" ? "pointer" : "");
  }

  /** What the ROUTER needs to know about this view's declared handlers to
   *  arbitrate gestures for it (input.ts HitTarget): whether it answers
   *  double-clicks (so its single click waits out the double window), holds,
   *  or the raw touch family (so the whole multi-finger stream is delivered and
   *  nothing is interpreted). Declaration IS the opt-in — no configuration. */
  private inputWants(): InputWants {
    const self = this as unknown as Record<string, unknown>;
    const has = (t: string): boolean => typeof self[handlerName(t)] === "function";
    return {
      wantsDbl: has("dblClick"),
      wantsHold: has("hold"),
      wantsTouch: TOUCH_TYPES.some(has),
      wantsPinch: PINCH_TYPES.some(has),
      wantsDrag: has("pointerMove"),
      wantsWheel: has("wheel"),
      claimAxis: this.claim,
      wantsContext: has("contextMenu"),
    };
  }

  /** Stand up the draw method as a tracked, re-recording computation. */
  private bindDraw(): void {
    this.drawing = new Constraint(
      `${this.constructor.name}.draw`,
      // The box arrives as THUNKS so `d.w`/`d.h` register a dependency only when
      // the body actually reads one (draw.ts) — a drawing that ignores its size
      // must not re-record on every resize.
      () => record((d) => this.draw!(d), () => this.width, () => this.height),
      // Constraint is deliberately untyped across compute→apply (reactive.ts);
      // this apply's input is exactly its compute's output.
      (list) => this.surface?.setDrawing(list as DisplayList),
      1
    );
    this.drawing.run();
    // A drawing has a RESOLUTION, and the resolution it should have is the
    // composed scale it is seen at — which is the apparentScale fact, delivered
    // at rest. The facts arm on tracked reads and a drawing does not read its
    // own scale, so arm here: a drawn view keeps its feed, and the surface
    // learns its density through setRasterScale (backend.ts).
    this.armVisibility();
  }

  /** Re-record right now — the explicit half of draw-on-invalidation (the
   *  attribute-driven half is the recording's own tracked reads). Also the
   *  entry point for a draw method assigned after attach. */
  invalidateDraw(): void {
    if (this.drawing !== null) this.drawing.run();
    else if (this.draw && this.surface !== null) this.bindDraw();
  }

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
  applyClip(clip: string | boolean | null): void {
    if (this.surface === null) return; // pre-attach: flush will replay this
    this.surface.setBoxClip(clip === true);
    this.surface.setClip(typeof clip === "string" ? clip : null);
  }
}

/** The one composed-transform pusher (scale + rotation about a shared
 *  pivot): any of the four attributes re-pushes both seam calls, so a
 *  backend keeps a single transform and never sees a half-updated pivot. */
/** A filter list at the seam is null when empty — a backend keys "none" on null. */
const nullIfEmpty = (l: readonly import("./value.js").Filter[]): readonly import("./value.js").Filter[] | null => (l.length === 0 ? null : l);

const pushTransform = (v: View): void => {
  const s = v.surface;
  if (s === null) return;
  // one matrix at the seam (graphics-pass.md §5); a backend without the
  // matrix member still gets the similarity pair — the seam table says which
  if (s.setTransform !== undefined) {
    s.setTransform(v.localTransform(), v.pivotX, v.pivotY);
    if (s.setTransform3D !== undefined) s.setTransform3D(spec3DOf(v, v.parent instanceof View ? v.parent : null));
    return;
  }
  s.setScale(v.scale, v.pivotX, v.pivotY);
  s.setRotation?.(v.rotation, v.pivotX, v.pivotY);
};

/** The `scrolls` axis-enum pusher, shared by View and the App's own default
 *  (`"y"` — the App's scroller is the page; the backend realizes the root's
 *  regime as the browser's own scroll). */
const pushScrolls = (v: View, ax: string): void => {
  setBound(v, "scrollsOn", ax !== "none");   // the kernel's numeric mirror (native visibility rule)
  // optional-called: a minimal host/mock surface may omit the scroll seam
  const scrolling = (a: boolean) => { v.scrolling = a; };
  v.surface?.setScroll?.(ax === "y" || ax === "both", (y) => { v.scrollY = y; }, scrolling);
  v.surface?.setScrollX?.(ax === "x" || ax === "both", (x) => { v.scrollX = x; }, scrolling);
  // opening (or closing) a scroll axis changes whether this view takes the
  // pointer — the same rewire a late `link` or `tip` triggers
  v.rewireInput();
};

/** visibleRect's rest state — one frozen instance, so an off-screen view's
 *  slot never churns (rectEqual gates the writes besides). */
const EMPTY_RECT: { x: number; y: number; width: number; height: number } = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
const rectEqual = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a === b || (a != null && b != null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/** A CHILD SIZED FROM A PARENT THAT HAS NO SIZE TO GIVE is reported
 *  (docs/system-design/layout-ownership.md §4). A child whose size is derived
 *  from its parent's does not count toward the parent's content size, so when
 *  that parent takes its size from its content the child's arithmetic runs from
 *  nothing — `{ parent.contentWidth - 40 }` in a card with no width is −40 in
 *  every state. That lands below zero, and it is a mistake that draws nothing
 *  and says nothing, so it is said here. Ordinary arithmetic below zero is NOT
 *  reported: a field sized `{ parent.height - 60 }` in an accordion section
 *  closed to 46px is −14 while the section hides it, which is what the author
 *  meant, and a negative size draws nothing, as it always has.
 *
 *  Judged only once the program HAS ITS ROOM. A program settles once before it
 *  is attached, when its host has not yet said how big it is, and every size
 *  computed from the App's is provisional then. So a size noted before the App
 *  attaches waits, and is judged at the close of the first settle after it
 *  does (App.attach — the join point `onReady` uses, on every render path);
 *  one noted after is judged at its own settle's close. Once per class and axis
 *  per program: one authored line builds every replicated row. */
const NEGATIVE_PENDING = new Set<View>();
const NEGATIVE_SAID = new WeakMap<object, Set<string>>();
function rootOf(v: Node): Node {
  let root: Node = v;
  while (root.parent !== null) root = root.parent;
  return root;
}
function noteNegativeSize(v: View, size: "width" | "height"): void {
  if (!percentOwned(v, size) || NEGATIVE_PENDING.has(v)) return;   // only a size derived from the parent's
  NEGATIVE_PENDING.add(v);
  // attached: judge at this settle's close; not yet: App.attach judges it
  if ((rootOf(v) as View).surface != null) afterSettle(judgeNegativeSizes);
}
/** Judge every pending size whose program is attached (see noteNegativeSize). */
export function judgeNegativeSizes(): void {
  for (const v of [...NEGATIVE_PENDING]) {
    const root = rootOf(v);
    if ((root as View).surface == null) continue;   // not attached yet — its App will ask
    NEGATIVE_PENDING.delete(v);
    const p = v.parent instanceof View ? v.parent : null;
    if (p === null) continue;
    for (const axis of ["width", "height"] as const) {
      const value = v[axis];
      if (!(value < 0) || !percentOwned(v, axis)) continue;
      // the parent has no size to give on this axis: it takes it from its
      // content (no size of its own, or its auto-extent owns it)
      const pOwner = ownerOf(p, axis);
      if (!(pOwner === null ? !isSet(p, axis) : pOwner.isAutoExtent)) continue;
      let said = NEGATIVE_SAID.get(root);
      if (said === undefined) NEGATIVE_SAID.set(root, (said = new Set()));
      const key = `${v.constructor.name}.${axis}`;
      if (said.has(key)) continue;
      said.add(key);
      const onlyContent = !p.children.some((c) => c !== v && c instanceof View && c.visible && !percentOwned(c, axis));
      console.error("[Declare] " + negativeSizeMessage(v.constructor.name, axis, value, p.constructor.name, onlyContent, ownerOf(v, axis)?.sourcePos));
    }
  }
}

defineAttributes(View, {
  // Position is authored in the parent's CONTENT coordinates and realized in
  // its box coordinates: the leading inset is added here, once, on the way to
  // the seam (positionLead; flush does the same at attach). Writing the
  // parent's `padding` re-pushes every child through the same call.
  x: { def: 0, push: (v, n) => v.surface?.setX(n + v.positionLead("x")) },
  y: { def: 0, push: (v, n) => v.surface?.setY(n + v.positionLead("y")) },
  width: { def: 0, push: (v, n) => { if (n < 0) noteNegativeSize(v, "width"); v.surface?.setWidth(n); } },
  height: { def: 0, push: (v, n) => { if (n < 0) noteNegativeSize(v, "height"); v.surface?.setHeight(n); } },
  // THE CONTENT BOX (declared above). Three consequences, and the reactive
  // graph carries two of them by itself: every constraint that reads the
  // content box — a percent, a layout's place(), auto-extent — tracked this
  // slot and re-runs. What it cannot carry is the REALIZED position of
  // children whose own x/y did not change, so the pusher re-pushes them; and
  // the backends' own scroll extents, which get the inset across the seam.
  padding: { def: 0, push: (v: View, p: Inset) => {
    // the kernel's auto-extent cannot carry an inset: re-derive this view's
    // extents in JavaScript the moment it is padded (installKernelExtent), and
    // let them go back to the kernel if the padding ever returns to zero
    rebindExtents(v);
    // the axis totals, for the kernel's content-box reads (declared above)
    const [t, r, b, l] = insetSides(p);
    v.insetX = l + r;
    v.insetY = t + b;
    for (const c of v.children) if (c instanceof View) c.repushPosition();
    v.surface?.setPadding?.(p);
  } },
  // the names this app exposes to its host (islands.md); a program sets a
  // literal list, and the host reads each through `exposed(name)`
  exposes: { def: Object.freeze([]) },
  insetX: { def: 0 },
  insetY: { def: 0 },
  // KERNEL-FACING MIRRORS AND OUTPUTS (kernel.md; the native visibility rule):
  // `scrollsOn` mirrors `scrolls !== "none"` as a number the kernel can read;
  // the vis* cells are the rule's outputs, delivered to the public facts by
  // the JS delivery rule (at-rest buffering intact). Not language surface.
  scrollsOn: { def: false },
  visOn: { def: true }, visScale: { def: 1 }, visX: { def: 0 }, visY: { def: 0 }, visW: { def: 0 }, visH: { def: 0 },
  /** 1 = the kernel computed the facts; 0 = a 3D transform on the chain: the JS walk owns them. */
  visMode: { def: 1 },
  fill: { def: null, push: (v, f) => v.surface?.setFill(f), equal: fillEqual },
  cornerRadius: { def: 0, push: (v, r) => v.surface?.setCornerRadius(r) },
  stroke: { def: null, push: (v, st) => v.surface?.setStroke(st), equal: strokeEqual },
  shadow: { def: null, push: (v, sh) => v.surface?.setShadow(sh), equal: shadowEqual },
  visible: { def: true, push: (v, b) => {
    v.surface?.setVisible(b);
    // Un-hiding re-arms the measurement veto for every rich flow underneath
    // (location.md §0.5.3): a flow inside a display:none subtree measured 0,
    // and its TRUE height arrives only after this flip, through the backend's
    // ResizeObserver. Until it does, an anchored reveal into this subtree
    // would land against a half-built page (§12.1's warm-arrival race) — so
    // each flow reports pending, and the retained intent holds. Deferred
    // backends only: a synchronous backend's heights were right while hidden.
    if (b) markRichPending(v);
  } },
  // the visibility facts (declared above): defaults for a page never fed;
  // the ONE feed arms at the first tracked read of any of the three
  // (onTrack — pay-per-use), backend-fed where the backend has page context,
  // runtime-computed everywhere else
  onScreen: { def: true, onTrack: (v: View) => v.armVisibility() },
  visibleRect: { def: EMPTY_RECT, equal: rectEqual, onTrack: (v: View) => v.armVisibility() },
  apparentScale: { def: 1, onTrack: (v: View) => v.armVisibility() },
  ignoreLayout: { def: false, push: (v) => { const p = v.parent; if (p instanceof View) p.childrenMutated(); } },
  ignoreClip: { def: false, push: (v, b: boolean) => v.surface?.setIgnoreClip?.(b) },
  ignoreScroll: { def: false, push: (v, b: boolean) => v.surface?.setIgnoreScroll?.(b) },
  opacity: { def: 1, push: (v, o) => v.surface?.setOpacity(o) },
  cursor: { def: "", push: (v, c: string) => v.surface?.setCursor(c) },
  pointerEvents: { def: "", push: (v, c: string) => v.surface?.setPointerEvents(c) },
  // Scale + rotation + pivot ride one transform at the seam: any of the four
  // re-pushes the combined value (transform + transform-origin on the DOM).
  // setScale always accompanies setRotation so a backend can keep ONE
  // composed transform without ordering questions.
  scale: { def: 1, push: pushTransform },
  pivotX: { def: 0, push: pushTransform },
  pivotY: { def: 0, push: pushTransform },
  rotation: { def: 0, push: pushTransform },
  rotateX: { def: 0, push: pushTransform },
  rotateY: { def: 0, push: pushTransform },
  translateZ: { def: 0, push: pushTransform },
  backface: { def: "visible", push: pushTransform },
  // the eye: a change re-projects every child that leaves its plane
  perspective: { def: 0, push: (v) => { v.surface?.setPerspective?.(v.perspective); for (const c of v.children) if (c instanceof View && c.is3D()) pushTransform(c); } },
  scaleX: { def: 1, push: pushTransform },
  scaleY: { def: 1, push: pushTransform },
  skewX: { def: 0, push: pushTransform },
  skewY: { def: 0, push: pushTransform },
  // optional-chained (the ignoreScroll pattern): backends adopt independently,
  // and the seam table (test/seam.test.mjs) says which have.
  blend: { def: "normal", push: (v, b: string) => v.surface?.setBlend?.(b) },
  backdrop: { def: null, push: (v, b: FilterValue) => v.surface?.setBackdrop?.(nullIfEmpty(filterList(b))), equal: backdropEqual },
  filter: { def: null, push: (v, f: FilterValue) => v.surface?.setFilter?.(nullIfEmpty(filterList(f))), equal: filtersEqual },
  mask: { def: null, push: (v, m: Mask | null) => v.applyMask(m) },
  focusable: { def: false },
  focusTrap: { def: false },
  // `anchor` — the view's name in the reveal namespace (location.md §6). A stored
  // slot the reveal walk reads after settle; "" = not an anchor. No push: it has
  // no surface effect. (Materializes §6's "named view"; heading slugs are the rest.)
  anchor: { def: "" },
  // `link` — the view IS a link to this reference (location.md §0): "#name" in-app,
  // anything else out through `navigate`. "" = not a link (no interest, no focus
  // stop, nothing for the crawl). Interest derives from it exactly as from declared
  // handlers (inputSink) — the `tip` precedent — so the push REWIRES the surface's
  // input when the value changes (empty↔non-empty flips interest itself).
  link: { def: "", push: (v) => {
    v.rewireInput();
    v.surface?.setLink?.(v.link, (v as unknown as { label?: string }).label ?? "");
  } },
  // `replace` — this link overwrites the current history entry instead of pushing
  // (location.md §0.5.6): fine-grained movement WITHIN a place (a deck's arrows),
  // not movement between places. Read by App.follow when the link is followed.
  replace: { def: false },
  // `shows` — this view manifests the named location (location.md §0.4). The slot
  // stores the name for the registry and introspection; the VISIBILITY it implies
  // is lowered to a `visible` binding at instantiation (instantiate.ts), so the
  // hit walk, focus traversal, and auto-extent all see it through the one channel.
  shows: { def: "" },
  clip: { def: null, push: (v, c) => v.applyClip(c) },
  // Scroll container: the axis enum wires the backend's native scroll per
  // declared axis and feeds the user's offsets back into `scrollY`/`scrollX`
  // (plain reactive writes — no push, so they never echo to the surface;
  // reads drive fades/reveals).
  scrolls: { def: "none", push: pushScrolls },
  tip: { def: "" },
  // FACTS (schema readOnly): the backend mirrors the platform's offset IN
  // (setScroll's callback); a program cannot write them — the checker refuses
  // an assignment and an Animator alike, naming the verbs. The push survives
  // for the RUNTIME's own writes (`scrollTo` lands a finite request in the
  // model before the surface clamps it); on a mirrored value it is inert, the
  // surface already holding that number. A scroller that wants to move itself
  // calls its verb — `strip.scrollToX(x, { duration, motion })` — a request
  // to THIS scroller only (scrollIntoView is axis-blind and walks ancestors,
  // which is how a strip reveal once vertically scrolled its hosting island).
  scrollY: { def: 0, push: (v, y: number) => v.surface?.scrollToY?.(y) },
  claim: { def: "both" },
  scrollX: { def: 0, push: (v, x: number) => v.surface?.scrollToX?.(x) },
  // the declared start (applied once at attach / after first layout) and the
  // in-motion fact — read-only, fed by the platform
  scrollStartY: { def: 0 },
  scrollStartX: { def: 0 },
  scrolling: { def: false },
  // The text face / rich-text / iconSize / theme values are provided, not View
  // slots — they live with the text leaves, Icon, and Control (attributes.ts
  // providedDefault). A container that sets one PROVIDES it: an undeclared set
  // becomes an instance-slot provision.
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
});

/** The view whose `datapath = { }` compute is currently running, if any. A
 *  `:path` island in that body reads through the walk below — and must
 *  resolve against the cursor the slot EXTENDS, never the one it defines
 *  (bindDatapath's rule, applied to the island form). Without the skip,
 *  `datapath = { :detail }` reads its own half-written cursor on re-run and
 *  oscillates (null ↔ cursor) until the cycle guard trips. */
let cursorDefining: Node | null = null;
export function withCursorDefining<T>(view: Node, fn: () => T): T {
  const prev = cursorDefining;
  cursorDefining = view;
  try {
    return fn();
  } finally {
    cursorDefining = prev;
  }
}

/** The cursor in effect at `node`: the nearest ancestor-or-self datapath
 *  (language §9 — "descendants read fields relative to it"). Each level's
 *  slot is a tracked read, so a cursor appearing, changing, or clearing
 *  ANYWHERE on the chain wakes exactly the reads below it. */
export function inheritedCursor(node: Node | null): Cursor | null {
  for (let n = node; n !== null; n = n.parent) {
    if (n !== cursorDefining) {
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
 *  (docs/system-design/input.md §mutation during traversal). */
let focusDiscardHook: ((view: View) => void) | null = null;
export function setFocusDiscardHook(fn: (view: View) => void): void {
  focusDiscardHook = fn;
}

/** A node's address for an error message: its authored-name path up the tree
 *  (`app.pulse.card`), or its class when anonymous. Cheap, and built only once
 *  a handler has already thrown. */
/** Re-derive a view's auto-extents after something the kernel rule cannot
 *  express changed (today: padding). Each side is dropped and bound again, so
 *  installKernelExtent gets to decide afresh — kernel rule or JS derive. */
function rebindExtents(v: View): void {
  const derives = EXTENT.get(v);
  if (derives === undefined) return;
  for (const size of ["width", "height"] as const) {
    const d = derives[size];
    if (d === undefined || ownerOf(v, size) !== d) continue;
    d.dispose();
    release(v, size, d);
    delete derives[size];
  }
  EXTENT.delete(v);
  (v as unknown as { bindExtent(): void }).bindExtent();
}

/** The auto-extent, marked (reactive.ts isAutoExtent). */
function markExtent(k: Constraint): Constraint { k.isAutoExtent = true; return k; }

export function nodeLabel(n: Node): string {
  const parts: string[] = [];
  let cur: Node | null = n;
  for (let i = 0; cur !== null && cur.parent !== null && i < 12; i++, cur = cur.parent) {
    parts.unshift(authoredName(cur) ?? (i === 0 ? cur.constructor.name : "…"));
  }
  return "app" + (parts.length > 0 ? "." + parts.join(".") : "");
}

export function fireEvent(view: Node, event: string, ...args: unknown[]): void {
  // typed at Node, not View: an event is a handler lookup on the instance, and
  // the faceless tier has a lifecycle too (a plain Node fires `init`)
  // `init` is the moment a node is LIVE for the change event: boot's own
  // first values are not changes (reactive.ts / attributes.ts write)
  if (event === "init") {
    // `init` is the moment a node is LIVE for the change event: the values it
    // tracks are read once here to seed, so boot's own first values are not
    // changes (change-event.ts trackNode).
    (view as unknown as { $live?: boolean }).$live = true;
    const names = (view as unknown as { trackChanges?: unknown }).trackChanges;
    if (Array.isArray(names) && names.length > 0) trackNode(view, names.map((x) => String(x)));
  }
  const h = (view as unknown as Record<string, unknown>)[handlerName(event)];
  if (typeof h === "function") {
    // A throwing handler is LOUD and ATTRIBUTED, never fatal: the settle it
    // fired in must survive (field report 2026-08-21 — a throwing onInit
    // surfaced nothing across four console reads). The handler's name and the
    // node's address are the two facts the console was missing.
    noteOrigin(`${handlerName(event)} on ${nodeLabel(view)}`, view);
    try {
      (h as (...a: unknown[]) => void).call(view, ...args);
    } catch (e) {
      console.error(`[Declare] ${handlerName(event)} on ${nodeLabel(view)} threw: ${(e as Error)?.message ?? e}`, e);
    }
  }
}

/** Resolve a reveal anchor name against a settled tree (location.md §6). One
 *  preorder pass builds the namespace: named views (`anchor` attr) first, then
 *  heading slugs (duck-typed: a TextFlow exposes `anchorSlugs()`/`revealAnchor()`),
 *  each in document order, with `-2`/`-3` suffixes on duplicate names — so the
 *  namespace is flat and every name unique, views winning a tie. Returns the reveal
 *  action for `name` (which reports whether it actually revealed — false before the
 *  target is attached/rendered, so the caller keeps holding the intent), or null
 *  when the name is not present in the tree at all. */
/** Re-arm the rich-measurement veto for every flow under `v` — the visible
 *  pusher's half of the §0.5.3 hold (see markdown.ts measurePending). Duck-
 *  typed to avoid a view→markdown import cycle; deferred backends only. */
function markRichPending(v: View): void {
  const walk = (n: Node): void => {
    const f = n as unknown as { measurePending?: boolean; surface?: { deferredRichMeasure?: boolean } | null };
    if (typeof f.measurePending === "boolean" && f.surface?.deferredRichMeasure === true) f.measurePending = true;
    for (const c of n.children) walk(c);
  };
  walk(v);
}

/** Any rich flow in the tree still awaiting its settled measurement? The
 *  reveal HOLDS while true (location.md §0.5.3) — tree-wide on purpose: a
 *  reveal's landing depends on every flow above the target in document order,
 *  and "which flows sit between" is exactly the geometry that isn't settled
 *  yet. Conservative, cheap (only runs while an intent is held), and false
 *  everywhere on synchronous backends — headless stays first-call (§0.11). */
function anyRichPending(root: View): boolean {
  let pending = false;
  const walk = (n: Node): void => {
    if (pending) return;
    if ((n as unknown as { measurePending?: boolean }).measurePending === true) { pending = true; return; }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return pending;
}

/** One resolved anchor: the target VIEW (for a heading slug, the view hosting
 *  the flow it renders in) and the default landing — the scroll. resolveReveal
 *  fires one or hands the other to a declared onArrive. */
interface AnchorHit { view: View; fire: () => boolean }

function findAnchor(root: View, name: string): AnchorHit | null {
  // The reveal inset (location.md §0.5.4): fixed chrome the landing must
  // clear, one app-wide knob, threaded to both target kinds.
  const inset = (root as unknown as { revealInset?: number }).revealInset ?? 0;
  const views: { base: string; view: View; fire: () => boolean }[] = [];
  const slugs: { base: string; view: View; fire: () => boolean }[] = [];
  // A target that is not SHOWN — itself or an ancestor `visible = false` —
  // is not a landing: a section gated on data that has not arrived exists,
  // attached, hidden, at a provisional y. Firing at it would "succeed" and
  // consume the intent while the page is still empty. Hold instead; the
  // intent fires when the gate opens, like a target awaiting its surface.
  const shown = (v: View): boolean => {
    for (let n: View | null = v; n !== null; n = n.parent instanceof View ? n.parent : null) if (!n.visible) return false;
    return true;
  };
  const walk = (n: Node): void => {
    if (n instanceof View) {
      if (n.anchor !== "") { const v = n; views.push({ base: v.anchor, view: v, fire: () => { if (v.surface === null || !shown(v)) return false; v.scrollIntoView("start", false, inset); return true; } }); }
      const flow = n as unknown as { anchorSlugs?: () => string[]; revealAnchor?: (s: string, inset?: number) => boolean };
      if (typeof flow.anchorSlugs === "function" && typeof flow.revealAnchor === "function") {
        for (const s of flow.anchorSlugs()) slugs.push({ base: s, view: n, fire: () => shown(n) && flow.revealAnchor!(s, inset) });
      }
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  const seen = new Map<string, number>();
  for (const c of [...views, ...slugs]) {
    const n = (seen.get(c.base) ?? 0) + 1;
    seen.set(c.base, n);
    const key = n === 1 ? c.base : `${c.base}-${n}`;
    if (key === name) return { view: c.view, fire: c.fire };
  }
  return null;
}

/** The application root — the single visible tree at the top (OpenLaszlo's
 *  `<canvas>`). R0 treats it as the root View; it fills its host by default and
 *  carries the app's reactive environment (host extent, scroll, pointer). */
/** Tell the kernel where View's slots sit (once, at the first arm — the
 *  kernel loads asynchronously, after this module) and give it the dpr cell. */
let viewLayoutSent = false;
function viewLayoutReady(): boolean {
  if (viewLayoutSent) return true;
  if (!kernelLoaded()) return false;
  const K = kernel();
  const layout: Record<string, number> = {};
  for (const f of ["x", "y", "width", "height", "visible", "scale", "scaleX", "scaleY", "rotation", "skewX", "skewY", "pivotX", "pivotY",
                   "scrollX", "scrollY", "ignoreScroll", "scrollsOn", "rotateX", "rotateY", "translateZ", "visOn", "visScale", "visX", "visY", "visW", "visH", "visMode", "ignoreClip"]) {
    const i = slotIndex(View, f);
    if (i < 0) return false;   // a slot is not numeric on this build: the kernel path stays off
    layout[f] = i;
  }
  K.viewLayout(layout);
  const dpr = K.addCell(0, false);
  K.table[dpr] = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  K.viewDprCell(dpr);
  viewLayoutSent = true;
  return true;
}

export class App extends View {
  /** onReady — the boot transaction's close, DELIVERED (schema.ts App
   *  events): boot is the one settle with no app handler anywhere in it, so
   *  its close cannot be asked for inline (afterSettle) and must arrive as an
   *  event. Registered at attach — the join point of every render path
   *  (mounted, headless, native) — and fired at the close of the FIRST settle
   *  after it: tree standing, constraints wired, geometry computed, nothing
   *  painted, so what the handler writes is in the first frame the user sees.
   *  Once per App instance; an embedded island's App gets its own. */
  private readyDelivered = false;
  override attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    super.attach(backend, parentSurface, before);
    if (!this.readyDelivered) {
      this.readyDelivered = true;
      afterSettle(() => fireEvent(this, "ready"));
      // the program has its room from here: sizes noted before it did are judged now
      afterSettle(judgeNegativeSizes);
    }
  }

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
  /** True while a pointer (mouse button or touch) is down anywhere in the app —
   *  the press half of the interaction intrinsics (interaction.ts); fed at mount
   *  like the pointer coordinates. Read-only to user code. */
  declare pointerDown: boolean;
  /** True while the free pointer is over a native text-editing surface (a text
   *  input / textarea / contenteditable — e.g. an editable HTML island). A
   *  custom app cursor reads it to YIELD to the I-beam over a text field:
   *  `cursor: View [ visible = { !classroot.pointerOverText } ]`. */
  declare pointerOverText: boolean;
  /** The OS color-scheme preference (`prefers-color-scheme: dark`), fed live by
   *  the runtime. Theme an app off it: `fill = { app.dark ? 0x0B141B : 0xFFFFFF }`
   *  or drive a `theme` record from it. Read-only to user code. */
  declare dark: boolean;
  /** Is the page this app lives on visible? The browser's Page Visibility fact
   *  (boot.ts wireVisibility feeds it; the native host feeds the same slot from
   *  its occlusion signal). Ambient motion gates itself on it —
   *  `running = { … && app.pageVisible }` — and because clock membership is
   *  constraint-driven, a `Time` (which pauses itself on this fact) leaving empties the frame loop: a hidden
   *  page books nothing. Read-only to user code; schema.ts has the caveats
   *  (Safari does not report window occlusion). */
  declare pageVisible: boolean;
  /** "Am I running on a touch device?" — true when the device's primary pointer
   *  is coarse (`pointer: coarse`), a phone or tablet. A stable device fact fed
   *  live by the runtime, distinct from the transient `hovering`: switch mouse-only
   *  affordances off with `visible = { !app.touchDevice }`. Read-only to user code. */
  declare touchDevice: boolean;

  /** Does this device HAVE a touch digitizer at all (`any-pointer: coarse`)?
   *  True on a phone, a tablet, AND a touch laptop whose primary pointer is a
   *  trackpad — the case `touchDevice` deliberately answers false. Use it for a
   *  hit-target floor (a finger may still arrive), not to switch layout.
   *  Read-only to user code. */
  declare hasTouch: boolean;

  /** Does this device have a FINE pointer (`any-pointer: fine`) — a mouse,
   *  trackpad, or stylus? Read-only to user code. */
  declare hasPointer: boolean;

  /** What the user JUST used: "mouse" | "touch" | "pen", updated live on every
   *  move and press. The honest signal on a hybrid device, where the answer
   *  changes per gesture: reveal hover-only affordances with
   *  `visible = { app.lastPointerType == "mouse" }`. Read-only to user code. */
  declare lastPointerType: string;
  /** How the app meets the device's own chrome (the notch, the home-indicator
   *  bar): `"safe"` (default) letterboxes the app inside the safe region —
   *  the bars wear the app's fill and every inset reads 0; `"cover"` extends
   *  the box edge-to-edge (viewport-fit=cover, patched at mount) and the
   *  `safeTop`…`safeRight` facts carry the real insets for pinned chrome to
   *  place itself with. A fact about the app, read at mount. */
  declare edges: "safe" | "cover";
  /** The safe-area insets, in pixels — live (rotation re-reads them), 0
   *  while letterboxed or on any desktop. Under `edges = cover`, pinned
   *  chrome offsets itself: `y = { app.safeTop }`, a bottom bar reserving
   *  `app.safeBottom` below its buttons. Fed by boot.ts wireSafeArea. */
  declare safeTop: number;
  declare safeBottom: number;
  declare underlapBottom: number;
  declare safeLeft: number;
  declare safeRight: number;
  /** The shipping page's over-the-wire size in KB (gzipped) and its Declare
   *  source line count — provided by the host/build (see index.ts note), 0
   *  until set. Reactive reads: a stat bound to them settles when they land. */
  declare pageWeight: number;
  declare sourceLines: number;
  /** INTERIM (capabilities.md §7): the two host-fed live-demo channels —
   *  `demoSources` (a name→source map the host seeds every editor from,
   *  host-client.js) and `liveReport` (the last live recompile's rendered
   *  report; "" while the edit compiles clean, the island keeps the last good
   *  render). Reactive slots so bindings on them settle when the host writes;
   *  read-only to user code, typed in the compiler's LANGUAGE_API (scaffold.ts),
   *  never schema attrs. RULED to dissolve into a per-instance `LiveDemo`
   *  component; the app-authored state that once rode alongside (editing /
   *  liveCard / liveSource) is already instance-declared on the demo-hosting
   *  apps. See docs/system-design/language-learnings.md §11–12. */
  declare demoSources: Record<string, unknown>;
  declare liveReport: string;
  /** `location` — the app's slice of the URL, the fragment (docs/system-design/location.md). A
   *  two-way reactive string the host seeds from the URL fragment before first
   *  settle, mirrors outward per settle (one history push per changed settle), and
   *  writes back on back/forward. The app owns the grammar: it reads `app.location`
   *  to derive state (`mode = { app.location.split("/")[0] }`) and writes it to
   *  navigate (`app.location = "why"`). The declared initial is the default — the
   *  fragment is omitted at it (§3). Read-write to user code; schema.ts. */
  declare location: string;
  /** `waypoint` — the STEP: the half of the history coordinate the URL does
   *  not show (the other half of the history entry; `location` is the address
   *  half). The host carries it in the History entry's state object, restores
   *  it on back/forward — a coordinate comes back by traversal, never by
   *  arrival, so a reload starts at the declared initial — and never lets it
   *  near the URL, so it is not shareable and not crawlable, by construction.
   *  The app owns the grammar, same as location. Schema attr; default "". */
  declare waypoint: string;
  /** app→host navigation channel: `navigate(to)` sets it when no host services
   *  are installed, and a polling host opens the URL and clears it to "". A plain
   *  field, not a reactive attribute — nothing in the tree renders from it, and no
   *  Declare source names it: navigation is the CALL, never an observed attribute.
   *  The FALLBACK half of the verb — a host that registered `hostServices` is
   *  called directly instead, and this field never carries. */
  pendingNav = "";

  /** The host's service table — the app→host VERBS' direct line, installed at
   *  mount by provideHostServices (boot.ts). Per-app, so two embedded apps on
   *  one page each route to their own host, and a foreign page can supply its
   *  own (route `navigate` into an SPA router). A registered service is called
   *  SYNCHRONOUSLY inside the verb — still within the click's transient user
   *  activation, which is what window.open needs. Null = no host registered:
   *  the verb parks its intent on the matching pending* channel for a polling
   *  host. (The mac bridge replaces `navigate` wholesale — Bridge.swift — and
   *  reads neither.) */
  hostServices: { navigate?: (to: string) => void; openWindow?: (to: string) => void; inspect?: (slot: string) => void } | null = null;

  /** @internal an EMBEDDED tenant's line to its host island (linkIslandTenant
   *  installs it). Null = not linked (a top-level app, or never linked) —
   *  send() says so instead of vanishing. */
  hostSink: { message(topic: string, payload: unknown): void } | null = null;

  /** post(topic, payload) — the tenant's message VERB, this app → its host
   *  island's onPost. The other half of the bridge from the facts: consumed
   *  once, ordered, never re-readable — for "do this", not "this is so"
   *  (islands design; the state channel is the `external` attributes). */
  post(topic: string, payload?: unknown): void {
    if (this.hostSink === null) { console.warn(`[Declare] app.post("${topic}"): this app is not linked to a host island — message dropped`); return; }
    this.hostSink.message(topic, payload);
  }

  /** navigate(to) — the navigation SERVICE ACTION (capabilities.md §6). A link or
   *  button calls `app.navigate(url)` in an activation handler; the compiler reads
   *  the call statically (links.ts → `<a href>` in the static extraction), and at
   *  runtime the host opens `to`. DOM-free: bodies never touch window.location, so
   *  navigation rides this channel like `editing` — one clear way, analyzable. */
  navigate(to: string): void {
    if (this.hostServices?.navigate) { this.hostServices.navigate(to); return; }
    this.pendingNav = to;
  }

  /** The reference schemes a link may carry (location.md §0.4) — the shared
   *  predicate lives at the render seam (backend.ts allowedRef), because the
   *  realization path enforces it too: a disallowed scheme never becomes an
   *  href, so copy-link and middle-click — native paths that never enter
   *  follow — stay shut. */
  static allowedRef(ref: string): boolean { return allowedRef(ref); }

  /** The destination part of a location — the runtime strips ITS OWN trailing
   *  `@name` (§6's one shared grammar character); the app never writes the
   *  split. `shows` lowers to a comparison against this (instantiate.ts). */
  destinationOf(loc: string): string {
    const at = loc.indexOf("@");
    return at >= 0 ? loc.slice(0, at) : loc;
  }

  /** The history verb the NEXT location mirror should use (location.md §0.5.6):
   *  "push" (default), or "replace" — set by follow when the link carries
   *  `replace = true`, and by the host itself on traversal/cold arrivals so a
   *  redirect can never mint an entry (no Back loops). Consumed (reset to
   *  "push") by the host at the mirror. A plain field, like pendingNav. */
  pendingHistoryVerb: "push" | "replace" = "push";

  /** follow(ref) — the ONE operation behind every arrival (location.md §0.5):
   *  a linked view's activation, a rich-text href, a cold URL, back/forward.
   *  Source requests, runtime delivers, destination decides. The app-scoped
   *  hook `onFollow(ref) -> ref'` (a user-declared method, §0.6) is applied
   *  ONCE — transform, veto (""), or side-effect; then an external reference
   *  leaves through `navigate`, and a `#…` writes `location`. The anchor
   *  reveal rides the existing retained intent (resolveReveal); an anchorless
   *  arrival seeds the scroll to the top. Re-following the current reference
   *  re-runs the arrival step — no dead clicks. */
  follow(ref: string, replace = false): void {
    if (!App.allowedRef(ref)) return;
    const hook = (this as unknown as { onFollow?: (r: string) => string }).onFollow;
    if (typeof hook === "function") {
      const out = hook.call(this, ref);
      if (typeof out !== "string" || out === "") return;
      ref = out;
      if (!App.allowedRef(ref)) return;
    }
    if (!ref.startsWith("#")) { this.navigate(ref); return }
    let loc = ref.slice(1);
    // A BARE NAME may be an anchor (location.md §0.3): the author writes
    // "#story" and never the compound — the destination is DERIVED, here,
    // from the tree itself: the anchored view's nearest `shows` ancestor.
    // (The compiler checked the name against the same registry at build; this
    // is the runtime answering the same question off the live structure, so
    // the two cannot drift.) A name that is no anchor falls through to a
    // plain location write — destinations and computed locations unchanged.
    if (loc !== "" && loc.indexOf("@") < 0 && loc.indexOf("/") < 0) {
      const dest = this.destinationOfAnchor(loc);
      if (dest !== null) loc = dest === "" ? this.destinationOf(this.location) + "@" + loc : dest + "@" + loc;
    }
    if (replace) this.pendingHistoryVerb = "replace";
    const same = this.location === loc;
    this.location = loc;
    // Anchorless: the destination starts at its top — the scroll must not
    // inherit the previous view's offset (the toTop discipline, now follow's).
    // With `onArrive` declared, the handler owns that landing instead: the
    // destination view is delivered at the close of this follow's settle —
    // real, placed, sized, nothing painted — resolved then, off the settled
    // tree. Per FOLLOW, not per change of address (§0.5.5, no dead clicks).
    // Anchored: resolveReveal owns the landing (its intent re-arms on the
    // location CHANGE; a same-reference re-follow re-arms it here).
    if (loc.indexOf("@") < 0) {
      if (this.hasArrive()) afterSettle(() => fireEvent(this, "arrive", this.destinationView()));
      else this.scrollIntoView("start");
    }
    else if (same) this.rearmReveal();
  }

  /** The destination gating an anchored view: walk the tree for `anchor ===
   *  name`, then up from it for the nearest `shows`. null = no such anchor
   *  (the name is a destination or a computed location); "" = an anchor
   *  outside any destination (reveal within the current location). */
  private destinationOfAnchor(name: string): string | null {
    let found: View | null = null;
    const walk = (n: Node): void => {
      if (found !== null) return;
      if (n instanceof View && n.anchor === name) { found = n; return; }
      for (const c of n.children) walk(c);
    };
    walk(this);
    const f = found as View | null;   // assigned in the closure — TS can't see it
    if (f === null) return null;
    for (let v: View | null = f; v !== null; v = v.parent instanceof View ? v.parent : null) {
      if (v.shows !== "") return v.shows;
    }
    return "";
  }

  /** app→host channel for openWindow, exactly like pendingNav: the verb writes
   *  it, the host polls it on the next frame and window.opens (still inside the
   *  click's transient user activation, so it isn't popup-blocked). */
  pendingOpen = "";

  /** app→host channel for the Inspector (the third of the same shape). A button
   *  calls `app.inspect("run:spring")` naming an island slot — or `""` for this
   *  app itself — and the host opens the Inspector on that subject. A plain
   *  field, not a reactive attribute: nothing renders from it, and no Declare
   *  source reads it. */
  pendingInspect: string | null = null;

  /** inspect(slot) — the Inspector SERVICE ACTION. `slot` names an embedded
   *  app's island ("run:spring"); omit it to inspect this app. Like navigate(),
   *  the intent rides the service table (or its channel fallback), so a `{ }`
   *  body never touches the document. */
  inspect(slot = ""): void {
    if (this.hostServices?.inspect) { this.hostServices.inspect(slot); return; }
    this.pendingInspect = slot;
  }

  /** openWindow(to) — navigate's NEW-WINDOW sibling (a "View Source" that must
   *  not replace the running app). Same discipline: bodies never touch
   *  `window`, the intent rides the service table (or its channel fallback).
   *  A registered service runs synchronously inside the activation, which is
   *  MORE popup-safe than the old next-frame poll, not less. */
  openWindow(to: string): void {
    if (this.hostServices?.openWindow) { this.hostServices.openWindow(to); return; }
    this.pendingOpen = to;
  }

  /** The reveal intent held from `location`'s trailing `@name` (location.md §6) —
   *  null when the location carries no anchor. Retained across settles until the
   *  name appears in a settled tree; re-armed or cancelled when `location` changes. */
  private pendingAnchor: string | null = null;
  private lastRevealLocation: string | null = null;

  /** Resolve the pending `@name` reveal against the current settled tree. The host
   *  calls this after settles — and each frame while an intent is held, so a cold
   *  deep link (`/#guide/22-reach@some-heading`) fires once the DataSource lands and
   *  the heading renders. A location CHANGE re-arms the intent from its trailing
   *  `@name` (a change with no anchor cancels it); a resolved name fires the reveal
   *  and clears the intent. Runtime-side and backend-agnostic — the reveal itself
   *  splits at the surface seam (DOM scrollIntoView / canvas scroll clamp). Returns
   *  the name it revealed this call (else null) — the host ignores it; tests read it. */
  resolveReveal(): string | null {
    if (this.location !== this.lastRevealLocation) {
      this.lastRevealLocation = this.location;
      const at = this.location.indexOf("@");
      this.pendingAnchor = at >= 0 ? this.location.slice(at + 1) : null;
    }
    const name = this.pendingAnchor;
    if (name === null || name === "") return null;
    // THE MEASUREMENT VETO (location.md §0.5.3, closing §12.1): while any rich
    // flow's height is provisional — just rendered, or just un-hidden by this
    // very location change — the page's geometry is not the page's geometry,
    // and a reveal that "succeeds" against it lands ~a-viewport wrong and
    // clears the intent. Hold; the flows' measurement callbacks lift the veto
    // within a frame, and the host retries every frame while an intent is
    // held. Synchronous backends never set the flag, so headless (and the
    // pinned first-call contract) are untouched.
    if (anyRichPending(this)) return null;
    const hit = findAnchor(this, name);
    if (hit === null) return null;
    // A declared onArrive REPLACES the built-in landing (the scroll): the
    // platform still resolves the name and waits out data and measurement —
    // only what "showing" means is the handler's. Same readiness gate as the
    // scroll thunk's own (attached surface), same hold-and-retry.
    if (this.hasArrive()) {
      if (hit.view.surface === null) return null;
      this.pendingAnchor = null;
      fireEvent(this, "arrive", hit.view);
      return name;
    }
    // Clear the intent only when the reveal ACTUALLY landed — the name being present
    // in `content` before its element is attached/rendered (the cold-deep-link race)
    // returns false, so we hold and retry next frame.
    if (hit.fire()) { this.pendingAnchor = null; return name; }
    return null;
  }

  /** Is an `onArrive` handler declared? (Installed by instantiate like every
   *  language member; a TS subclass may simply define one.) Its presence is
   *  the policy switch: declared, the app owns the landing. */
  private hasArrive(): boolean {
    return typeof (this as unknown as { onArrive?: unknown }).onArrive === "function";
  }

  /** The view an anchorless location lands on: the destination view (`shows`
   *  === the location's destination), or the App itself when no view declares
   *  it (a computed-location family, or the bare ""). Resolved at dispatch
   *  time, off the settled tree. */
  private destinationView(): View {
    const dest = this.destinationOf(this.location);
    if (dest === "") return this;
    let found: View | null = null;
    const walk = (n: Node): void => {
      if (found !== null) return;
      if (n instanceof View && n.shows === dest) { found = n; return; }
      for (const c of n.children) walk(c);
    };
    walk(this);
    return found ?? this;
  }

  /** @internal the values the host provides, by name (Node.$hostProvided reads).
   *  Seeded from build's `provides` when there are any, so the app's very
   *  first evaluation — at instantiate, before any settle or link — reads them. */
  readonly hostValues = seededHostValues();

  /** The HOST's write: make `value` available to this app under `name` — what
   *  a `hostProvided("name", …)` read in the program returns. Called by the
   *  island bridge for each name the island `provides`, by a page embedding
   *  this app (`el.__declareApp.provide(…)`, or `boot({ provides })`), and by
   *  the native host for its launch parameters. Equality-gated; a change
   *  re-derives every reader. `undefined` withdraws the value (readers fall to
   *  their defaults). Data only — a host never hands over a node. */
  provide(name: string, value: unknown): void {
    if (value === undefined) this.hostValues.clear(name);
    else this.hostValues.write(name, value);
  }

  /** The value this app exposes under `name` — one of its `exposes` names — or
   *  undefined when it exposes no such name. The page's read (an island reads
   *  through its own `exposed`); tracked, so an `observe` over it follows. */
  exposed(name: string): unknown {
    const list = (this as unknown as { exposes?: unknown }).exposes;
    if (!Array.isArray(list) || !list.includes(name)) return undefined;
    return (this as unknown as Record<string, unknown>)[name];
  }

  /** A page's standing watch over one exposed value: `cb` runs now with the
   *  current value and again at the close of every settle that changed it.
   *  Returns the unwatch. */
  watchExposed(name: string, cb: (value: unknown) => void): () => void {
    cb(this.exposed(name));
    return observe(() => this.exposed(name), cb, `exposed:${name}`);
  }

  /** The DEFAULT landing, exposed — what the platform does with an arrival
   *  when no `onArrive` is declared: scroll the target into view, honoring
   *  `revealInset` (the App itself starts at its top). A document app that
   *  declares `onArrive` for the extra work composes the scroll back by
   *  calling this — the same move as `tabOrder()` composing `tabDefault()`. */
  reveal(target: View): void {
    if (target === (this as View)) { this.scrollIntoView("start"); return; }
    target.scrollIntoView("start", false, this.revealInset);
  }

  /** Re-arm the reveal intent for the CURRENT location — follow's no-dead-click
   *  rule (§0.5): re-following `#why@story` while already there re-runs the
   *  reveal, which resolveReveal's location-change guard would otherwise skip. */
  rearmReveal(): void { this.lastRevealLocation = null; this.scheduleReveal(); }

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
  private pumpOn = false;
  private readonly revealPump = {
    perpetual: true as const,
    tick: (): boolean => {
      this.resolveReveal();
      if (this.pendingAnchor !== null) return true;
      this.pumpOn = false;
      return false;
    },
  };

  /** Stop the pump when the app leaves — a held intent must not keep the
   *  frame loop alive past the app (registered once, at first arm). */
  private pumpRetireHooked = false;
  private hookPumpRetire(): void {
    if (this.pumpRetireHooked) return;
    this.pumpRetireHooked = true;
    onDiscard(this, () => {
      if (this.pumpOn) { this.pumpOn = false; sharedClock.remove(this.revealPump); }
    });
  }

  /** Enroll the pump at the close of the current settle when the location
   *  carries an `@name`. Armed from `location`'s own push (the write IS the
   *  event), from rearmReveal, and once at mount for the cold-arrival seed.
   *  Arms, never resolves: resolution belongs to the pump's frame ticks — and
   *  to any host or test that calls resolveReveal itself (the pinned
   *  first-call contract). A no-anchor location makes this a peek and a no-op. */
  scheduleReveal(): void {
    afterSettle(() => {
      if (this.location.indexOf("@") >= 0 && !this.pumpOn) {
        this.pumpOn = true;
        this.hookPumpRetire();
        sharedClock.add(this.revealPump);
      }
    });
  }

  /** Cancel a HELD reveal intent — the user's first scroll or touch takes
   *  ownership of the viewport (location.md §0.5.5, the uncontrolled-editor
   *  rule): a reference SEEDS the scroll position, it never owns it. The host
   *  calls this from its scroll/wheel/touch listeners; a reveal that already
   *  landed cleared the intent itself, so this is a no-op then — which is what
   *  makes the reveal's own scrollIntoView (whose scroll event arrives a tick
   *  later) safe from self-cancellation. */
  cancelReveal(): void { this.pendingAnchor = null; }

  /** The app's size floor. An app that degrades below some width declares
   *  `minWidth = 600` and the auto-extent never goes under it: in a narrower
   *  host the app holds its floor and the STAGE pans natively (the page
   *  scrolls horizontally at top level; an embedded island scrolls its box).
   *  A declared policy, not clamp arithmetic in a constraint — tools and
   *  models can read the floor statically. 0 (the default) = no floor. Only
   *  the auto-extent honours it; an explicit `width = { … }` is the author's
   *  own formula and wins untouched. */
  declare minWidth: number;
  declare minHeight: number;
  /** Linking knobs (location.md §0): `revealInset` — pixels of fixed chrome a
   *  reveal must clear (the scroll-margin analogue); `crawlSeeds` — extra
   *  references the extraction crawl seeds beyond the registry. */
  declare revealInset: number;
  declare crawlSeeds: unknown[];

  /** The app's human name — hosts surface it where names go: the page title
   *  (host-client mirrors it per settle, before the location history push so
   *  back/forward entries carry the state's name) and the crawled document's
   *  <title> (the extractor reads the settled value). Author-settable, literal
   *  or constraint; "" (the default) leaves the host's served title alone. */
  declare appName: string;

  /** The App's auto-extent is the HOST, not its content: an unset width/height
   *  follows hostWidth/hostHeight (reactive on resize), so the root app fills its
   *  enclosing area with no declaration — the near-universal case. An explicit
   *  `width = …` still wins (isSet skips the derive), and there is no children
   *  guard: the app fills its host even while empty. This is the exact yielding
   *  default the content path uses (View.bindExtent), retargeted from content to
   *  host — so a resize repaints like any dependency. `minWidth`/`minHeight`
   *  floor the derive (tracked reads, so a reactive floor re-applies live). */
  protected bindExtent(): void {
    let derives = EXTENT.get(this);
    for (const size of ["width", "height"] as const) {
      if (isSet(this, size) || ownerOf(this, size) !== null) continue;
      if (derives === undefined) EXTENT.set(this, (derives = {}));
      derives[size] = bindDerived(this, size, () =>
        size === "width" ? Math.max(this.hostWidth, this.minWidth) : Math.max(this.hostHeight, this.minHeight));
    }
    this.bindPageScroll();
  }

  /** An App is CLIPPED BY DEFINITION (ruled 2026-07-29): a program owns its
   *  rectangle. The boolean form of `clip` is absorbed here — the per-axis
   *  realization (overflow along a declared scroll axis is the page's range;
   *  overflow along any other axis is out of frame) lives in the backend's
   *  root scroll styling, composed with `scrolls`. A Shape clip keeps its
   *  paint+hit meaning; `clip = false` is refused at compile time (check.ts). */
  override applyClip(clip: string | boolean | null): void {
    if (this.surface === null) return;
    this.surface.setClip(typeof clip === "string" ? clip : null);
  }

  /** Derive "can the page scroll right now?" from the model — a declared
   *  scroll axis with overflowing content, or a frame the floors hold larger
   *  than the host — and hand it to the root surface (backend.ts
   *  setPageScrollable), which keys the app's gesture default on it: pan
   *  stays with the user exactly when the page has somewhere to go, and
   *  retires (stilling the rubber-band) when it doesn't. Reactive — content
   *  growth, floor changes, and host resizes all re-derive; child mutations
   *  re-run it through childrenMutated like the auto-extent derives. */
  private pageScroll: Constraint | null = null;
  private bindPageScroll(): void {
    if (this.pageScroll !== null) return;
    this.pageScroll = new Constraint(
      "App.pageExtent",
      () => [this.contentWidth, this.contentHeight] as const,
      (wh) => {
        const [w, h] = wh as readonly [number, number];
        this.surface?.setPageExtent?.(w, h);
      },
      1
    );
    this.pageScroll.run();
  }

  override childrenMutated(): void {
    super.childrenMutated();
    this.pageScroll?.run();
  }
}

// One shared, frozen empty record for every top-level app's `env` — safe to
// share because hosts REPLACE the record wholesale, never mutate it.
// The interaction module's injected instance test (cycle-free): interaction.ts
// types views structurally; this is the one brand check.
initInteraction((n): n is InteractionView => n instanceof View);

defineAttributes(App, {
  // An App SCROLLS BY DEFAULT, and its scroller is the page (ruled
  // 2026-07-29): the App is the outermost view, so its scroll regime is the
  // browser's own — content taller than the frame makes the page itself
  // scroll. Same pusher as View's; the backend realizes the ROOT regime as
  // the document scroll instead of a pane (dom-backend applyScrollStyle).
  // An app whose content fits has nothing to scroll — the fixed window is
  // this default, idle. A calendar-shaped app may state `scrolls = none`.
  scrolls: { def: "y", push: pushScrolls },
  // `revealInset` — the scroll-margin analogue (location.md §0.5.4): fixed
  // chrome (a sticky header) overlaps a reveal target pinned to the viewport
  // top; the reveal lands this many pixels short instead. One knob, app-wide.
  revealInset: { def: 0 },
  // `crawlSeeds` — extra references the extraction crawl seeds beyond the
  // registry (location.md §0.8.2): computed locations worth emitting that no
  // rendered link reaches. An ordinary attribute the extractor reads at t=0.
  crawlSeeds: { def: [] },
  // Stored reactive slots the runtime feeds (index.ts). Read-only to USER code
  // via schema.readOnly (a compile error) — not `readOnly: true` here, which
  // would throw the setter the runtime feed needs. `width`/`height` default to
  // these (bindExtent above).
  hostWidth: { def: 0 },
  hostHeight: { def: 0 },
  scrollY: { def: 0 },
  pointerX: { def: 0 },
  pointerDown: { def: false },
  pointerY: { def: 0 },
  hovering: { def: false },
  pointerOverText: { def: false },
  dark: { def: false },
  // page visibility (schema.ts) — true until a host reports otherwise, so
  // headless and test mounts that never wire it see a visible page
  pageVisible: { def: true },
  touchDevice: { def: false },
  hasTouch: { def: false },
  hasPointer: { def: true },      // a plain desktop until the profile says otherwise
  lastPointerType: { def: "mouse" },
  // How the app meets the DEVICE'S OWN chrome — a phone's notch/Dynamic Island
  // and home-indicator bar. `safe` (the default) letterboxes the app inside the
  // safe region: the browser keeps the box clear of the system chrome, the
  // letterbox bars wear the app's own `fill`, and every `safe*` inset reads 0 —
  // nothing to handle. `cover` is the edge-to-edge opt-in: the runtime patches
  // `viewport-fit=cover` into the page's viewport meta at mount, the box
  // extends under the system chrome, and the `safeTop`…`safeRight` facts carry
  // the real insets for pinned chrome to place itself with. A fact about the
  // app, read at mount — not a runtime toggle.
  edges: { def: "safe" },
  // The top safe-area inset, in pixels — the notch/status-bar band. 0 while
  // letterboxed (`edges = safe`) and on any desktop; the device's real number
  // under `edges = cover`, live across rotation. Pinned top chrome offsets
  // itself with it: `y = { app.safeTop }`.
  safeTop: { def: 0 },
  // The bottom safe-area inset — the home-indicator band. A pinned bottom bar
  // reserves it BELOW its buttons: `height = { 56 + app.safeBottom }` with the
  // content anchored to the bar's top. 0 letterboxed or on desktop; live.
  safeBottom: { def: 0 },
  // How much of the bottom of `hostHeight` is the browser's own RETRACTABLE
  // chrome. `hostHeight` reaches the true bottom — including the zones a
  // collapsed toolbar has vacated — which is what a full-bleed background
  // wants. Something a finger must REACH wants the other number: this is the
  // band the chrome will re-cover, and the band where a tap summons it back
  // instead of landing on the app. Floating chrome clears both bands at once
  // with `Math.max(app.safeBottom, app.underlapBottom)` — 0 while the
  // browser's bars are shown (nothing is hidden, so nothing is in the way),
  // their height once they retract. Desktop and the native host: always 0.
  underlapBottom: { def: 0 },
  // The side safe-area insets — 0 in portrait, the sensor-housing band on one
  // side in landscape (rotation re-feeds all four). Full-width pinned chrome
  // insets both edges: `x = { app.safeLeft }`,
  // `width = { app.width - app.safeLeft - app.safeRight }`.
  safeLeft: { def: 0 },
  safeRight: { def: 0 },
  pageWeight: { def: 0 },
  sourceLines: { def: 0 },
  // `location` — the app's URL fragment (docs/system-design/location.md). A stored reactive
  // slot: the host seeds/writes it (deep link, back/forward), the app writes it to
  // navigate, and `{ }` constraints that read it (`visible = { app.location == … }`)
  // re-derive on every change. Default "" so an app that declares no initial keeps
  // a clean URL. NOT readOnly — navigation IS a write from app code. The push arms
  // the reveal pump: a location carrying `@name` is an intent, and the write is
  // the moment it arms (scheduleReveal — no host pumps this per frame anymore).
  location: { def: "", push: (a: App) => a.scheduleReveal() },
  // `waypoint` — the history-carried step (schema.ts has the full contract).
  // A stored reactive slot exactly like location, with the opposite visibility:
  // the host mirrors it into the History entry's STATE OBJECT (never the URL)
  // and writes it back on traversal. Default "" = the declared initial step.
  waypoint: { def: "" },
  demoSources: { def: {} },
  liveReport: { def: "" },
  // the size floor (bindExtent) — author-settable, 0 = none
  minWidth: { def: 0 },
  minHeight: { def: 0 },
  // the app's human name (page title etc.) — author-settable, "" = host default
  appName: { def: "" },
});

// ═══ Islands — the boundary is a box, and the box has a typed surface ════════
//
// An Island is a View whose INTERIOR belongs to a TENANT — foreign DOM
// (DOMIsland) or a whole other Declare program (AppIsland, library). The
// bridge across that boundary is two channels with two natures (islands
// design, ruled 2026-08-20):
//
//   FACTS — the instance's `external` attribute declarations (parser.ts).
//   Typed, declared on BOTH sides (the island's declarations are the host's
//   half; a tenant App's `external` declarations are its exports), paired by
//   name at link time with a TYPE HANDSHAKE — two separately compiled programs
//   cannot share a static proof, so agreement is checked at the moment the
//   pairing forms, like a linker resolving extern symbols; a mismatch is a
//   link error, not a mid-session surprise. Direction is arbitrated by the
//   OWNERSHIP machinery (a host-bound slot refuses tenant pushes, loudly —
//   the same referee `location` lives under), with `readonly external` as the
//   opt-in stricter spelling for a tenant-owned out-fact.
//
//   VERBS — post(topic, payload) / onPost({ topic, payload }), both directions,
//   data-shaped payloads. Consumed once, ordered, never re-readable: what
//   state slots must not be abused into (the pendingNav lesson).
//
// Foreign (non-Declare) tenants reach the same bridge through ONE sanctioned
// JS handle (the island element's `__declareIsland`): get/set/observe/post/
// onPost — set is boundary-VALIDATED against the declared type, since a
// foreign push has no compiler behind it (the same trust-edge rule a
// DataSource applies to arriving bytes).

/** A tenant's connection, installed by linkIslandTenant / the foreign handle. */
interface TenantSink {
  message(topic: string, payload: unknown): void;
}



/** Island — the abstract boundary box. Concrete kinds decide what the tenant
 *  IS (DOMIsland: foreign DOM; AppIsland: a Declare program); this base owns
 *  the bridge — the external-fact surface and the message verbs. */
export class Island extends View {
  declare provides: readonly string[];
  /** @internal the linked tenant's delivery sink (null = nothing linked). */
  tenantSink: TenantSink | null = null;
  /** @internal the values the hosted side exposes, by name (`exposed` reads). */
  readonly exposedValues = new BoundaryValues("exposed");

  /** The host's read of a value the hosted side EXPOSES — a Declare tenant's
   *  `exposes` name, or foreign content's `expose(name, value)`. Tracked like
   *  any attribute read, so a constraint over it re-derives when the hosted
   *  side changes it. The default types the read: an absent value, or one of a
   *  different kind, answers the default (the latter with a warning). With no
   *  default an absent value throws, naming it. */
  exposed(name: string, ...dflt: unknown[]): unknown {
    return this.exposedValues.read(name, dflt.length > 0, dflt[0]);
  }

  /** The message verb, host → tenant (`post`, in the postMessage lineage —
   *  `message` is the stream family's event). Dropped with a console note
   *  when no tenant is linked — a verb has no meaning without a receiver. */
  post(topic: string, payload?: unknown): void {
    if (this.tenantSink === null) { console.warn(`[Declare] ${this.constructor.name}.post("${topic}"): no tenant linked — message dropped`); return; }
    this.tenantSink.message(topic, payload);
  }

  /** @internal tenant → host verb arrival: fire the declared onPost with the
   *  one-record payload `{ topic, payload }` (IslandPost). */
  receiveMessage(topic: string, payload: unknown): void {
    fireEvent(this, "post", { topic, payload });
  }

  /** The value this island provides under `name`, if `name` is on its
   *  `provides` list — else undefined, with a warning (the host did not offer
   *  it). What a hosted side's read resolves to. */
  providedValue(name: string): unknown {
    if (!providesOf(this).includes(name)) {
      console.warn(`[Declare] hostProvided("${name}"): this island does not list '${name}' in its provides (${providesOf(this).join(", ") || "none"})`);
      return undefined;
    }
    return islandProvision(this, name);
  }

  /** The foreign content's handle — built once, attached to the island's
   *  element by the DOM backend (`el.__declareIsland`). The whole sanctioned
   *  surface for non-Declare content, in the same words a Declare tenant
   *  uses: read what the host provides, expose values up, and the verbs. */
  private handle: Record<string, unknown> | null = null;
  foreignHandle(): Record<string, unknown> {
    if (this.handle !== null) return this.handle;
    const island = this;
    const messageCbs: Array<(m: { topic: string; payload: unknown }) => void> = [];
    this.tenantSink ??= {
      message: (topic, payload) => { for (const cb of messageCbs) cb({ topic, payload }); },
    };
    this.handle = {
      /** the current value the host provides under `name` (plain data), or
       *  undefined when the island does not list it */
      hostProvided: (name: string) => island.providedValue(name),
      /** a standing watch over a provided value: cb(value) now, then at the
       *  close of each settle that changed it; returns the unwatch */
      watchProvided: (name: string, cb: (v: unknown) => void) => {
        cb(island.providedValue(name));
        return observe(() => (providesOf(island).includes(name) ? islandProvision(island, name) : undefined), (v) => cb(v), `island:${name}`);
      },
      /** expose a value up to the host — read there with `exposed(name, default)`,
       *  whose default's kind the value must match */
      expose: (name: string, v: unknown) => {
        if (v === undefined) island.exposedValues.clear(name);
        else island.exposedValues.write(name, v);
      },
      /** tenant → host message (fires the island's onPost) */
      post: (topic: string, payload?: unknown) => island.receiveMessage(topic, payload),
      /** host → tenant messages (island.post lands here); cb({ topic, payload }) */
      onPost: (cb: (m: { topic: string; payload: unknown }) => void) => { messageCbs.push(cb); return () => { const i = messageCbs.indexOf(cb); if (i >= 0) messageCbs.splice(i, 1); }; },
      /** the names the host provides here, for discovery */
      provides: () => providesOf(island),
    };
    return this.handle;
  }
}

/** A standing sync of a NAMED SET of values: `read()` returns the current
 *  { name → value } (tracked), and each settle that changes it delivers the
 *  names whose value changed, and the names that left. Shared by both
 *  directions of the island link. */
function syncNamed(read: () => Record<string, unknown>, put: (name: string, v: unknown) => void, drop: (name: string) => void, label: string): () => void {
  let last: Record<string, unknown> = {};
  const apply = (next: Record<string, unknown>): void => {
    for (const n of Object.keys(next)) if (!(n in last) || !Object.is(last[n], next[n])) put(n, next[n]);
    for (const n of Object.keys(last)) if (!(n in next)) drop(n);
    last = next;
  };
  apply(read());
  // observe coalesces equal results one level deep; a fresh record per run
  // is compared here, name by name, so identical values deliver nothing
  return observe(() => { const r = read(); return Object.keys(r).sort().flatMap((k) => [k, r[k]]); }, () => apply(read()), label);
}

/** Link an Island to a DECLARE tenant (host-client renderChild, the canvas
 *  island service, the mac runner). DOWN: every name on the island's
 *  `provides` list, resolved at the island, is provided to the tenant (what
 *  its `hostProvided` reads return) and kept live. UP: every name on the
 *  tenant's `exposes` list is delivered into the island's exposed values
 *  (what the host's `exposed` reads return) and kept live. The verbs link
 *  both ways. Build the tenant with `provides: islandProvisions(island)` so
 *  its first evaluation already sees what the host provides, and link it
 *  before its first settle. Returns the unlink. */
export function linkIslandTenant(island: Island, tenant: App): () => void {
  const undo: Array<() => void> = [];
  undo.push(syncNamed(
    () => islandProvisions(island),
    (n, v) => tenant.provide(n, v),
    (n) => tenant.provide(n, undefined),
    "link:provides"));
  undo.push(syncNamed(
    () => {
      const out: Record<string, unknown> = {};
      const list = (tenant as unknown as { exposes?: unknown }).exposes;
      if (Array.isArray(list)) for (const n of list) {
        if (typeof n !== "string") continue;
        const v = (tenant as unknown as Record<string, unknown>)[n];
        if (v !== undefined) out[n] = v;
      }
      return out;
    },
    (n, v) => island.exposedValues.write(n, v),
    (n) => island.exposedValues.clear(n),
    "link:exposes"));
  // verbs, both directions
  island.tenantSink = {
    message: (topic, payload) => fireEvent(tenant, "post", { topic, payload }),
  };
  tenant.hostSink = { message: (topic, payload) => island.receiveMessage(topic, payload) };
  undo.push(() => { island.tenantSink = null; tenant.hostSink = null; });
  return () => { for (const fn of undo.splice(0)) { try { fn(); } catch { /* torn down */ } } };
}

/** DOMIsland — the FOREIGN-CONTENT island (design: the `DOMIsland [ … ]` view). A leaf
 *  whose box Declare lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the Declare-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. Carries the Island boundary: `provides` down, `exposed` up, and the
 *  post/onPost verbs, reachable from the foreign side through the element's
 *  `__declareIsland`. */
export class DOMIsland extends Island {
  declare slot: string;
  declare childName: string;

  protected flush(s: Surface): void {
    super.flush(s);
    if (this.slot !== "") s.setEmbed(this.slot, this);
  }
}

defineAttributes(DOMIsland, {
  slot: { def: "", push: (v, id) => v.surface?.setEmbed(id, v) },
  childName: { def: "" },
});

// THE CHANGE EVENT's delivery (change-event.ts wakes and batches; this module owns
// the handler door). The node remembers which values it is being called for, so
// attributes.ts can refuse the handler writing one of them back.
setChangeDispatcher((node, changed) => {
  const n = node as { $changing?: Set<string> };
  n.$changing = new Set(changed.map((c) => c.name));
  try { fireEvent(node as Node, "change", { changed }); }
  finally { n.$changing = undefined; }
});

// THE CURSOR READ (node.ts holds the seam; the walk lives here because it is a
// fact about views). `inheritedCursor` climbs from ANY node — so a Spring two
// levels inside an AnimatorGroup resolves to the same view its siblings do —
// and a node with no cursor above it reads null, exactly as a view without a
// datapath does.
provideCursorWrite((node, segs, v) => {
  const cursor = inheritedCursor(node);
  if (cursor !== null) cursor.data.set([...cursor.path, ...segs], v);
});
provideCursorRead((node, path) => {
  const cursor = inheritedCursor(node);
  if (cursor === null) return null;
  // a computed key arrives as its value: a number is an index, anything else a name
  const plan = typeof path === "string" ? splitPath(path)
    : (path as readonly unknown[]).map((sg) => typeof sg === "number" ? { i: sg } : typeof sg === "object" && sg !== null ? sg : String(sg)) as PathSeg[];
  // Pure-name plans ride the currency walk (today's read, coercing —
  // `:rows.length` stays live); a plan with selectors evaluates per RFC 9535
  // (select.ts), the B3 surface.
  if (plan.every((sg) => typeof sg === "string")) {
    const v = cursor.data.read([...cursor.path, ...(plan as string[])]);
    return v === undefined ? null : v;
  }
  return selectValue(cursor.data, cursor.path, plan);
});
