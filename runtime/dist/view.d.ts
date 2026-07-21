import { Node } from "./node.js";
import { type Color, type Fill, type Shadow, type Stroke, type Theme } from "./value.js";
import type { FontWeight } from "./measure.js";
import { type Stylesheet } from "./stylesheet.js";
import { type RenderBackend, type Surface } from "./backend.js";
type ViewCreator = (root: View, tag: string, parent: View, props?: Record<string, unknown>) => View;
export declare function provideViewCreator(fn: ViewCreator): void;
import { type Draw } from "./draw.js";
import type { LinkTarget } from "./parser.js";
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
export { onDiscard } from "./node.js";
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
    /** The pointer cursor while over this view (a CSS cursor keyword —
     *  "ew-resize", "col-resize", "pointer", …; "" = inherit). Meaningful on
     *  views that take input: the sink is the hit target on both backends. */
    cursor: string;
    /** Uniform paint-only scale about (pivotX, pivotY), the view's own
     *  coordinates (default the top-left corner); 1 = no transform. Spring it for
     *  zoom effects — it never affects layout, exactly like opacity. */
    scale: number;
    pivotX: number;
    pivotY: number;
    scrolls: boolean;
    /** The tooltip text (planes.md tier 1 — one attribute at the use site). A
     *  non-empty tip wires this view's hover into the Tip service; the
     *  auto-included Tooltip singleton renders it. "" = no tip. */
    tip: string;
    scrollsX: boolean;
    scrollY: number;
    /** Keyboard focus (docs/system-design/input.md, Layer 2). `focusable` = a tab stop;
     *  `focustrap` = a self-contained focus group. Traversal order is the tree,
     *  overridable per view by defining a `tabOrder()` method. */
    focusable: boolean;
    focustrap: boolean;
    anchor: string;
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
    /** Rich-text STRUCTURE style, prevailing: a `Markdown`/`HTMLText` renders its
     *  headings/links/inline-code from these; a plain View just carries them for
     *  its rich-text descendants. Colours are `null` = the theme-aware house token;
     *  `headingWeight` defaults to the house `bold`. */
    headingColor: Color;
    headingWeight: FontWeight;
    linkColor: Color;
    codeColor: Color;
    /** Code face + size, prevailing: the monospace regions of a `Markdown`/`HTMLText`
     *  (inline code, fenced/`<pre>` blocks) render at these; `0`/`""` = the house
     *  code style (PROSE.codeSize / PROSE.mono). */
    codeSize: number;
    codeFamily: string;
    /** Code-block box paint, prevailing: `codeBackground` tints the box behind a
     *  fenced/`<pre>` code block, `codeRule` draws a left accent bar on it. Both
     *  `null` = the house look (fenced code keeps its themed tint; a `<pre>` stays
     *  bare), so setting them is opt-in and changes nothing unset. */
    codeBackground: Color;
    codeRule: Color;
    /** Per-block-type layout geometry for rendered rich text, prevailing: a plain
     *  record keyed by block type (`paragraph`/`heading`/`code`/`pre`/`list`/
     *  `table`/`blockquote`/`rule`, plus `default`), each entry `{ maxWidth, margin:
     *  [l, r], align }`. Defaulted in the consumer like `theme` — an unset map or
     *  field is today's full-width left-aligned flow; `pre` shares `code`. */
    richTextLayout: Readonly<Record<string, {
        maxWidth?: number;
        margin?: readonly [number, number];
        align?: "left" | "center" | "right";
    }>> | null;
    /** Native text selection, prevailing: `selectable = true` on a container opts
     *  its whole subtree back into browser selection/copy (Text acts on it; a
     *  `Markdown` component's runs inherit it). Off by default — the app is a UI. */
    selectable: boolean;
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
    /** Write `v` to `path` relative to this view's inherited cursor — the write
     *  twin of `$data`, the runtime half of a two-way `<->` binding (language §9,
     *  the leaf-input exception). Lands through `Dataset.set` (equality-gated →
     *  the read side that fed the field re-reads the same value and stops at the
     *  gate, so committing a draft is a no-op round-trip, not a loop). A datapath
     *  that resolves to no dataset is a no-op — there is nowhere to write. */
    $setData(path: string, v: unknown): void;
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
     *  App can retarget it from content to its host. */
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
     *  children in source order (docs/system-design/input.md, Layer 2). The focus
     *  service descends into each; a view whose `tabOrder()` is not overridden
     *  uses this, so an all-default tree is pure tree preorder. An override may
     *  call it to compose ("the rest, minus X"). */
    tabDefault(): View[];
    /** Internal focus notification, called by the focus service when this view
     *  gains (true) or loses (false) Declare focus — SEPARATE from the user's
     *  `onFocus`/`onBlur` handlers, so a built-in component (TextInput) can drive
     *  its native element without occupying the author's event slot. No-op on a
     *  plain view. */
    focusChanged(_focused: boolean): void;
    /** The OPTICAL band the `center` position literal centers — { lead, size }
     *  along the given axis, in this view's own coordinates. The base answer is
     *  the whole box (lead 0); Text overrides the y axis with its ink band (cap
     *  height to last baseline — the text-box-trim semantics). The same
     *  component-supplies-its-shape protocol family as the focus silhouette. */
    alignBand(axis: "x" | "y"): {
        lead: number;
        size: number;
    };
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
    /** Scroll this view to the top of its nearest scrolling ancestor — the
     *  imperative companion to the reactive `scrolls`/`scrollY` pair (a click
     *  handler calls it to jump to a target). Both backends do the work in their
     *  Surface; a no-op before attach or with nothing scrolling above. (Named for
     *  the platform primitive — `reveal` is deliberately left free as a member name,
     *  e.g. a `reveal:` fade-in Spring.) */
    scrollIntoView(align?: "start" | "nearest"): void;
    /** Promotion (planes.md §1 — order is a slot): re-link this view among its
     *  siblings, tree and surface both. `raise()` moves it to the FRONT (last
     *  child — stacking is source order); `raise(below)` moves it to just BENEATH
     *  a sibling instead, so a pinned band above it (e.g. the dock's minimized
     *  windows) stays on top. Same parent only — the verb form of z-order, no
     *  numbers. A Menu raises at open; a Window raises on activation. */
    raise(below?: View | null): void;
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
    applyClip(clip: string | boolean | null): void;
}
/** The cursor in effect at `node`: the nearest ancestor-or-self datapath
 *  (language §9 — "descendants read fields relative to it"). Each level's
 *  slot is a tracked read, so a cursor appearing, changing, or clearing
 *  ANYWHERE on the chain wakes exactly the reads below it. */
export declare function inheritedCursor(node: Node | null): Cursor | null;
export declare function setFocusDiscardHook(fn: (view: View) => void): void;
export declare function fireEvent(view: View, event: string, arg?: unknown): void;
/** The application root — the single visible tree at the top (OpenLaszlo's
 *  `<canvas>`). R0 treats it as the root View; it fills its host by default and
 *  carries the app's reactive environment (host extent, scroll, pointer). */
export declare class App extends View {
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
    /** True while the free pointer is over a native text-editing surface (a text
     *  input / textarea / contenteditable — e.g. an editable HTML island). A
     *  custom app cursor reads it to YIELD to the I-beam over a text field:
     *  `cursor: View [ visible = { !classroot.pointerOverText } ]`. */
    pointerOverText: boolean;
    /** The OS colour-scheme preference (`prefers-color-scheme: dark`), fed live by
     *  the runtime. Theme an app off it: `fill = { app.dark ? 0x0B141B : 0xFFFFFF }`
     *  or drive a `theme` record from it. Read-only to user code. */
    dark: boolean;
    /** The embedding environment's parameters (see schema.ts `env`): a record
     *  the host provides and keeps live; `{}` when top-level. Read reactively —
     *  `theme = { Themes.x(app.env.dark == true) }` follows the host's flips. */
    env: Record<string, unknown>;
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
     *  component; the app-authored state that once rode alongside (editing /
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
    /** app→host navigation channel: `navigate(to)` sets it, the host (host-client.js
     *  / a backend) polls it, opens the URL, and clears it to "". A plain field, not
     *  a reactive attribute — nothing in the tree renders from it, and no Declare
     *  source names it: navigation is the CALL, never an observed attribute. */
    pendingNav: string;
    /** navigate(to) — the navigation SERVICE ACTION (capabilities.md §6). A link or
     *  button calls `app.navigate(url)` in an activation handler; the compiler reads
     *  the call statically (links.ts → `<a href>` in the static extraction), and at
     *  runtime the host opens `to`. DOM-free: bodies never touch window.location, so
     *  navigation rides this channel like `editing` — one clear way, analyzable. */
    /** Imperative creation (planes.md §7): instantiate a component by NAME
     *  into `parent`, a full citizen (bindings installed, init fired). Resolves
     *  against this tree's program registry; a name referenced only here needs
     *  `use [ Name ]` to survive static tracing. `props` are post-init writes
     *  (`datapath: record` gives the instance a data context — replication's
     *  convention). */
    createView(tag: string, parent: View, props?: Record<string, unknown>): View;
    navigate(to: string): void;
    /** app→host channel for openWindow, exactly like pendingNav: the verb writes
     *  it, the host polls it on the next frame and window.opens (still inside the
     *  click's transient user activation, so it isn't popup-blocked). */
    pendingOpen: string;
    /** openWindow(to) — navigate's NEW-WINDOW sibling (a "View Source" that must
     *  not replace the running app). Same discipline: bodies never touch
     *  `window`, the intent rides a channel the host owns. */
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
    resolveReveal(): string | null;
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
    protected bindExtent(): void;
}
/** DOMIsland — a foreign-content island (design: the `DOMIsland [ … ]` view). A leaf View
 *  whose box Declare lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the Declare-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. (Canvas backend realizes the same island as a positioned DOM overlay
 *  — setEmbed is a no-op there for now.) */
export declare class DOMIsland extends View {
    slot: string;
    protected flush(s: Surface): void;
}
