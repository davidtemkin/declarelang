import { Node } from "./node.js";
import { type Color, type Fill, type Shadow, type Stroke, type Theme } from "./value.js";
import type { FontWeight } from "./measure.js";
import { type Stylesheet } from "./stylesheet.js";
import { type RenderBackend, type Surface } from "./backend.js";
import { type Draw } from "./draw.js";
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
/** Run `fn` when `view` is discarded — how standing machinery that is not a
 *  slot owner (a Replicator) retires with the view that hosts it. */
export declare function onDiscard(view: View, fn: () => void): void;
export declare class View extends Node {
    x: number;
    y: number;
    width: number;
    height: number;
    /** What paints this view's box: a solid Color (null = paint nothing) or a
     *  Gradient — the ruled `fill` slot, subsuming the retired backgroundColor. */
    fill: Fill;
    /** The painted box's corner radius (0 = square). Shapes the PAINT only —
     *  clipping stays the explicit `clip` attribute (the recorded lean). */
    cornerRadius: number;
    /** A border drawn INSIDE the box (never layout); null = none. */
    stroke: Stroke | null;
    /** The box's drop shadow (cast by the border box, CSS semantics — never
     *  painted under the box itself); null = none. */
    shadow: Shadow | null;
    visible: boolean;
    opacity: number;
    scrolls: boolean;
    scrollY: number;
    /** Keyboard focus (design-docs/input.md, Layer 2). `focusable` = a tab stop;
     *  `focustrap` = a self-contained focus group. Traversal order is the tree,
     *  overridable per view by defining a `tabOrder()` method. */
    focusable: boolean;
    focustrap: boolean;
    /** Clip the subtree (paint AND hit-test). Two forms on one slot: a Shape
     *  string clips to that SVG path (view-local coordinates); the boolean
     *  box-clip `true` clips to the view's own box (0,0,width,height), tracking
     *  width/height reactively so it follows an animating height every frame
     *  (tabslider-gaps.md gap 1); false/null = no clip. */
    clip: string | boolean | null;
    /** The prevailing text-style slots (styling rung, ruled): declared on View
     *  so any container can PROVIDE them — an unset slot follows the nearest
     *  providing ancestor's value, live (the accessor's follow walk,
     *  attributes.ts). Text renders with the effective values; on a plain View
     *  they are pure context (no Surface push). `textColor` is the one
     *  text-color slot everywhere — Text.color is retired (ruled, no alias). */
    textColor: Color;
    fontSize: number;
    fontFamily: string;
    fontWeight: FontWeight;
    /** Letter tracking in px (canvas-native), 0 = natural advances. */
    letterSpacing: number;
    /** The prevailing design-token record (ruled, v1): a plain immutable
     *  record, wholesale-swapped — components opt in by reading tokens
     *  (`fill = { theme.buttonFill }`); re-skinning a subtree is one set. */
    theme: Theme;
    /** The applied style bundles' names (`styles = [card, danger]`) — a
     *  STATIC list (ruled v1): the bundles' sets merge at construction, so
     *  this slot is introspection, not a live channel. */
    styles: readonly string[] | null;
    /** The prevailing stylesheet (the external channel): provide one anywhere
     *  and that subtree reskins — its class-keyed entries land as rank-2
     *  offers through per-view appliers (stylesheet.ts); assigning another
     *  stylesheet re-skins live, one settle. */
    stylesheet: Stylesheet | null;
    /** Resolve a declared stylesheet by name — the honest public call for
     *  reaching a stylesheet from inside a `{ }` body, where you are in real TS and
     *  a bare `Dark` is (correctly) just an unresolved identifier, NOT sugar:
     *  `stylesheet = { night ? this.lookupStylesheet("Dark")
     *                        : this.lookupStylesheet("Light") }`.
     *  The bare-name form `stylesheet = Dark` is the DECLARATIVE surface and is
     *  compile-checked there; inside a body the name is a runtime string, so a
     *  miss throws loud + positioned (stylesheetByName) rather than resolving to a
     *  silent null. Resolved against the program registry at the tree root. */
    lookupStylesheet(name: string): Stylesheet;
    /** How this view arranges its children (language §5: a reactive slot, not
     *  a child and not a container type); null = none — absolute x/y. Written
     *  as the member `layout: SimpleLayout [ … ]`; assigning swaps the live
     *  arrangement (the pusher below), so the doc's "swap it" is a plain
     *  write. Purely model-side: the strategy's constraints move children, and
     *  those pushes cross the seam — the slot itself never does. */
    layout: LayoutStrategy | null;
    /** The data cursor (R8, language §9): the place `:path` reads on this view
     *  and its descendants resolve against, inherited down the tree (the
     *  nearest ancestor's cursor wins — see $data). Written as `datapath =
     *  :rel.path` (extends the inherited cursor), `datapath = { expr }` (a
     *  place derived from a dataset's value), or null. Model state — no
     *  Surface push; visuals follow through the bindings that read it. */
    datapath: Cursor | null;
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
    surface: Surface | null;
    /** The backend this view attached on — what lets a view that arrives
     *  AFTER attach (a replicated instance, R8) realize itself into the live
     *  tree. Null until attached. */
    backend: RenderBackend | null;
    /** The draw method's standing recording (null until one exists). Phase 1:
     *  it re-records only after value constraints settle, so a draw body
     *  always sees consistent attributes. */
    private drawing;
    /** The box-clip's standing derive when `clip === true` (null otherwise): a
     *  framework-internal reactive computation that feeds the backend the box
     *  rect as a clip path, recomputed as width/height change (bindBoxClip).
     *  Phase 1, like `drawing` — it reads settled geometry. */
    private boxClip;
    /** Realize this view and its subtree on a backend: create the surface,
     *  flush the current visual state across the seam, parent it (before
     *  `before` when the tree is mutating mid-list — R8; null appends), and
     *  recurse. This is the substrate-agnostic render pass — View touches only
     *  the Surface API. After this, the attribute setters push changes to the
     *  live surface one Surface call at a time. */
    attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    /** Read data relative to this view's inherited cursor — the runtime form
     *  every `:path` in a `{ }` body rewrites to (`:location.city` →
     *  `this.$data("location.city")`, expr.ts). Tracked like any read: the
     *  binding wakes when exactly this region — or any datapath on the chain
     *  above — changes. An unresolved path yields null (language §9). */
    $data(path: string): unknown;
    /** The tree-mutation entry (R8): children were inserted/removed/reordered
     *  as a unit — re-arm the installed arrangement and re-derive auto-extent,
     *  once per burst (the replicator calls this once per reconcile, not per
     *  child). A replicated block arriving under a never-sized view can also
     *  make a slot newly derivable — bindExtent picks it up. */
    childrenMutated(): void;
    /** This view's own content's extent on a size axis, folded into the
     *  auto-extent max — 0 for a plain view; Image overrides with the bitmap's
     *  natural size. Runs under tracking, so an override may read reactive
     *  state (Image reads `loaded`). */
    protected contentExtent(_size: "width" | "height"): number;
    /** Install auto-extent derives for whichever never-set, unowned size slots
     *  qualify — only on views with View children (a childless view keeps its
     *  zero-cost default; Dataset children are not geometry). Protected so the
     *  stage (App) can retarget it from content to the viewport. */
    protected bindExtent(): void;
    private extentOf;
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
    /** The default focus-traversal members of this view: its visible View
     *  children in source order (design-docs/input.md, Layer 2). The focus
     *  service descends into each; a view whose `tabOrder()` is not overridden
     *  uses this, so an all-default tree is pure tree preorder. An override may
     *  call it to compose ("the rest, minus X"). */
    tabDefault(): View[];
    /** Internal focus notification, called by the focus service when this view
     *  gains (true) or loses (false) neo focus — SEPARATE from the user's
     *  `onFocus`/`onBlur` handlers, so a built-in component (TextInput) can drive
     *  its native element without occupying the author's event slot. No-op on a
     *  plain view. */
    focusChanged(_focused: boolean): void;
    /** Retire this subtree: dispose every standing computation (bindings,
     *  percents, derives, a laid parent's constraints on these slots, the draw
     *  recording), run registered teardowns (a replicator's), uninstall the
     *  arrangement, and destroy the surfaces — so no data or attribute change
     *  can ever wake work for a removed view. Children first; the model links
     *  (parent/children) are the caller's to cut (Node.removeChild). */
    discard(): void;
    /** Push this view's full visual state across the seam. Subclasses extend
     *  it with their capabilities (Text, Image); it runs before the children
     *  attach, so a backend that keeps content in arrival order (the DOM) gets
     *  exactly the paint order the Canvas walk uses: content, then children. */
    protected flush(s: Surface): void;
    /** This view's input route, or null when it answers no pointer event —
     *  interactivity *derives* from declared handlers (Decisions §R5): a view
     *  with none is never wired (pay-per-use) and stays transparent to input,
     *  which is what lets a decorative child sit over an interactive parent
     *  without stealing its clicks (LZX's `clickable` intent, made automatic).
     *  A handler receives one plain event argument — the pointer position in
     *  this view's own coordinates. */
    private inputSink;
    /** Stand up the draw method as a tracked, re-recording computation. */
    private bindDraw;
    /** Re-record right now — the explicit half of draw-on-invalidation (the
     *  attribute-driven half is the recording's own tracked reads). Also the
     *  entry point for a draw method assigned after attach. */
    invalidateDraw(): void;
    /** Realize the `clip` slot across the seam (the pusher and flush both land
     *  here). Any prior box-clip derive is torn down first, so a switch between
     *  the forms — true → a Shape path → false — never leaves two clips
     *  fighting. Pre-attach (surface null) it is a no-op; flush replays it once
     *  the surface exists.
     *    - `true`  → the framework box-clip derive (bindBoxClip);
     *    - a Shape string → that path, straight to the backend (shape-clip);
     *    - false / null   → no clip. */
    applyClip(clip: string | boolean | null): void;
    /** The box-clip: a framework primitive that owns its own subscription
     *  (constraints.md §3), NOT a user constraint and NOT a slot owner. It reads
     *  width/height as TRACKED reads and feeds the backend the box rect as a
     *  clip path (the form both backends already consume — canvas setClip/
     *  clipData, DOM clip-path), so the reactive core re-runs it whenever
     *  width/height change — that is what makes it track an animating tab height
     *  every frame. It writes straight to the surface (no reactive slot), so it
     *  can never wake anything or cycle. */
    private bindBoxClip;
}
/** The cursor in effect at `node`: the nearest ancestor-or-self datapath
 *  (language §9 — "descendants read fields relative to it"). Each level's
 *  slot is a tracked read, so a cursor appearing, changing, or clearing
 *  ANYWHERE on the chain wakes exactly the reads below it. */
export declare function inheritedCursor(node: Node | null): Cursor | null;
export declare function setFocusDiscardHook(fn: (view: View) => void): void;
export declare function fireEvent(view: View, event: string, arg?: unknown): void;
/** The application root — the single visible tree, mapped to the stage
 *  (OpenLaszlo's `<canvas>`). R0 treats it as the root View; its stage-level
 *  behavior and singleton identity grow in later rungs. */
export declare class App extends View {
    /** The viewport size, page scroll, and free pointer — the reactive stage
     *  environment, fed by the runtime at mount (index.ts wireStage). Read from
     *  anywhere via `classroot`: `width = { classroot.stageWidth }`. */
    stageWidth: number;
    stageHeight: number;
    scrollY: number;
    pointerX: number;
    pointerY: number;
    hovering: boolean;
    /** True while the free pointer is over a native text-editing surface (a text
     *  input / textarea / contenteditable — e.g. an editable HTML island). A
     *  custom app cursor reads it to YIELD to the I-beam over a text field:
     *  `cursor: View [ visible = { !classroot.pointerOverText } ]`. */
    pointerOverText: boolean;
    /** The shipping page's over-the-wire size in KB (gzipped) and its neo-LZX
     *  source line count — provided by the host/build (see wireStage note), 0
     *  until set. Reactive reads: a stat bound to them settles when they land. */
    pageWeight: number;
    sourceLines: number;
    /** Set true by the page (a "view source" affordance) to ask the host to open
     *  its whole-page source editor — the one sanctioned app→host signal, kept a
     *  plain reactive flag so bodies stay DOM-free. */
    editing: boolean;
    /** Names which source the host loads when `editing` opens: a demo key (a
     *  card's "View & Edit Source" sets it) or "" for the whole page. Read by the
     *  host, reset on close — same DOM-free app→host channel as `editing`. */
    editSource: string;
    /** Host↔app data channel for the live demo cards (bodies stay DOM-free):
     *  `demoSources` = a name→source map the host seeds every editor from;
     *  `liveSource`/`liveCard` = the text an edit publishes for the host to
     *  recompile that card's preview. See design/language-learnings.md §11–12. */
    demoSources: Record<string, unknown>;
    liveCard: string;
    liveSource: string;
    /** The stage's auto-extent is the VIEWPORT, not its content: an unset width/
     *  height follows stageWidth/stageHeight (reactive on resize), so the root app
     *  fills its host with no declaration — the near-universal case. An explicit
     *  `width = …` still wins (isSet skips the derive), and there is no children
     *  guard: the stage fills its host even while empty. Reuses the same reactive
     *  derive the content path uses, so a resize repaints like any dependency. */
    protected bindExtent(): void;
}
/** HTML — a foreign-content island (design: the `HTML [ … ]` view). A leaf View
 *  whose box neo lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the neo-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. (Canvas backend realizes the same island as a positioned DOM overlay
 *  — setEmbed is a no-op there for now.) */
export declare class Html extends View {
    slot: string;
    protected flush(s: Surface): void;
}
