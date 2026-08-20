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
import { Node, onDiscard, runRetire } from "./node.js";
import { DeclareError } from "./errors.js";
import { backdropEqual, DEFAULT_THEME, fillEqual, shadowEqual, strokeEqual } from "./value.js";
import { disposeApplier, stylesheetArrived, stylesheetByName } from "./stylesheet.js";
import { PINCH_TYPES, POINTER_TYPES, TOUCH_TYPES, allowedRef } from "./backend.js";
import { Tip } from "./tip.js";
let viewCreator = null;
export function provideViewCreator(fn) {
    viewCreator = fn;
}
import { record } from "./draw.js";
import { sharedClock } from "./animate.js";
import { Constraint, Cell, afterSettle } from "./reactive.js";
import { initInteraction, readHovered, readPressed, hitAt, boxContains, rootFrameOrigin, rootFrameBox, rootTransform } from "./interaction.js";
import { bindDerived, declarationsOf, defineAttributes, disposeBindings, isSet, ownerOf, percentOwned, setBound } from "./attributes.js";
import { declaredType } from "./value.js";
import { observe } from "./reactive.js";
import { handlerName } from "./schema.js";
import { splitPath } from "./datapath.js";
import { selectValue } from "./select.js";
// view → the installed strategy's detach. Module-private bookkeeping rather
// than a View field: only the pusher below touches it, and a layout-free
// view (the common case) carries nothing.
const INSTALLED = new WeakMap();
// Teardown registration (onDiscard) moved to node.ts (2026-07-13): a plain
// Node can host a `<-` subscription, so the registry lives at the base.
// Re-exported here so existing importers keep their path.
export { onDiscard } from "./node.js";
// Views whose replicated content is currently WINDOWED (replicate.ts marks
// and unmarks). Lives here so view.ts needs no import of the replicator (the
// dependency runs the other way).
const WINDOWED_BLOCKS = new WeakSet();
// …and the cell behind the app-language read, so a constraint on `virtualized`
// re-runs when a block engages or disengages — which it now can, since the
// policy itself takes a constraint.
const WINDOWED_CELLS = new WeakMap();
const windowedCell = (v) => {
    let c = WINDOWED_CELLS.get(v);
    if (c === undefined)
        WINDOWED_CELLS.set(v, (c = new Cell()));
    return c;
};
/** Is this view's replicated content currently windowed? The UNTRACKED read,
 *  for the layout kernel (its pass suspends while windowing owns placement)
 *  and other internals that must not subscribe. */
export function isWindowedBlock(v) {
    return WINDOWED_BLOCKS.has(v);
}
/** The tracked read behind `View.virtualized`. */
export function readVirtualized(v) {
    windowedCell(v).track();
    return WINDOWED_BLOCKS.has(v);
}
export function markWindowedBlock(v, on) {
    const was = WINDOWED_BLOCKS.has(v);
    if (on)
        WINDOWED_BLOCKS.add(v);
    else
        WINDOWED_BLOCKS.delete(v);
    if (was !== on)
        windowedCell(v).changed();
}
// ── onRetire — the DEPARTURE hook (D5 ruled the semantics, D8 the name) ──
//
// Fires when a member's PRESENCE ends — its record leaves the match, or its
// subtree is discarded — the exact symmetric of the membership-anchored
// onInit, and NEVER on window eviction (a dematerialized row's presence
// continues; the replicator marks evictions so discard stays silent for
// them). Children before parents, mirroring initTree's order; once per
// lifetime. Fired at the TOP of discard, so handlers see live state.
const EVICTING = new WeakSet();
const RETIRED = new WeakSet();
export function markEvicting(v) {
    EVICTING.add(v);
}
export function fireRetireTree(v) {
    if (RETIRED.has(v))
        return;
    RETIRED.add(v);
    for (const c of v.children) {
        if (c instanceof View)
            fireRetireTree(c);
    }
    fireEvent(v, "retire");
}
/** Fire the membership-anchored `init` down an EXISTING subtree — the
 *  RECYCLED-instance arrival (replicate.ts): a live row re-pointed at a
 *  record whose presence episode is new fires that MEMBER's init without a
 *  reconstruction, the exact mirror of suppressInit on a rebuilt member
 *  whose episode continues. Parent-first, like construction's own order. */
export function fireInitTree(v) {
    fireEvent(v, "init");
    for (const c of v.children) {
        if (c instanceof View)
            fireInitTree(c);
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
const EXTENT = new WeakMap();
const AXIS_OF = { width: "x", height: "y" };
export class View extends Node {
    /** The navigation target the compiler's link extraction (links.ts) found for
     *  this instance's activation handler — stamped by instantiate from the source
     *  element's `link`. Read only by the static extractor (static-html.ts) to wrap the
     *  subtree in `<a href>`; undefined for all but the handful of navigable views. */
    _navLink;
    /** Resolve a declared stylesheet by name — the honest public call for
     *  reaching a stylesheet from inside a `{ }` body, where you are in real TS and
     *  a bare `Dark` is (correctly) just an unresolved identifier, NOT sugar:
     *  `stylesheet = { night ? this.lookupStylesheet("Dark")
     *                        : this.lookupStylesheet("Light") }`.
     *  The bare-name form `stylesheet = Dark` is the DECLARATIVE surface and is
     *  compile-checked there; inside a body the name is a runtime string, so a
     *  miss throws loud + positioned (stylesheetByName) rather than resolving to a
     *  silent null. Resolved against the program registry at the tree root. */
    lookupStylesheet(name) {
        let root = this;
        while (root.parent !== null)
            root = root.parent;
        return stylesheetByName(root, name);
    }
    /** The enclosing class instance — the node this view was *written* inside
     *  (a named class's root, or the App root, whose whole tree is the
     *  anonymous App class, language §5/§11): a class-body child points at its
     *  class instance; a class instance itself (and any use-site child) points
     *  at the OUTER scope, since its element is written in the outer body.
     *  Structure, like `parent` — set once by instantiate, not reactive. Null
     *  on the root and on hand-built trees. */
    classroot = null;
    /** This view's handle on the render backend — null until attached. */
    surface = null;
    /** The backend this view attached on — what lets a view that arrives
     *  AFTER attach (a replicated instance, R8) realize itself into the live
     *  tree. Null until attached. */
    backend = null;
    /** The draw method's standing recording (null until one exists). Phase 1:
     *  it re-records only after value constraints settle, so a draw body
     *  always sees consistent attributes. */
    drawing = null;
    /** Realize this view and its subtree on a backend: create the surface,
     *  flush the current visual state across the seam, parent it (before
     *  `before` when the tree is mutating mid-list — R8; null appends), and
     *  recurse. This is the substrate-agnostic render pass — View touches only
     *  the Surface API. After this, the attribute setters push changes to the
     *  live surface one Surface call at a time. */
    attach(backend, parentSurface, before = null) {
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
            if (child instanceof View)
                child.attach(backend, s);
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
    $data(path) {
        const cursor = inheritedCursor(this);
        if (cursor === null)
            return null;
        const plan = typeof path === "string" ? splitPath(path) : path;
        // Pure-name plans ride the currency walk (today's read, coercing —
        // `:rows.length` stays live); a plan with selectors evaluates per RFC
        // 9535 (select.ts), the B3 surface.
        if (plan.every((s) => typeof s === "string")) {
            const v = cursor.data.read([...cursor.path, ...plan]);
            return v === undefined ? null : v;
        }
        return selectValue(cursor.data, cursor.path, plan);
    }
    /** Write `v` to `path` relative to this view's inherited cursor — the write
     *  twin of `$data`, the runtime half of a two-way `<->` binding (language §9,
     *  the leaf-input exception). Lands through `Dataset.set` (equality-gated →
     *  the read side that fed the field re-reads the same value and stops at the
     *  gate, so committing a draft is a no-op round-trip, not a loop). A datapath
     *  that resolves to no dataset is a no-op — there is nowhere to write.
     *  Accepts pre-parsed segments like $data, for symmetry. */
    $setData(path, v) {
        const cursor = inheritedCursor(this);
        if (cursor === null)
            return;
        const segs = typeof path === "string" ? splitPath(path) : path;
        cursor.data.set([...cursor.path, ...segs], v);
    }
    /** The tree-mutation entry (R8): children were inserted/removed/reordered
     *  as a unit — re-arm the installed arrangement and re-derive auto-extent,
     *  once per burst (the replicator calls this once per reconcile, not per
     *  child). A replicated block arriving under a never-sized view can also
     *  make a slot newly derivable — bindExtent picks it up. */
    childrenMutated() {
        this.layout?.rearm();
        if (this.backend !== null)
            this.bindExtent();
        const derives = EXTENT.get(this);
        if (derives !== undefined) {
            for (const size of ["width", "height"]) {
                const d = derives[size];
                // The ownership check skips a derive an author write displaced.
                if (d !== undefined && ownerOf(this, size) === d)
                    d.run();
            }
        }
    }
    /** This view's own content's extent on a size axis, folded into the
     *  auto-extent max — 0 for a plain view; Image overrides with the bitmap's
     *  natural size. Runs under tracking, so an override may read reactive
     *  state (Image reads `loaded`). */
    contentExtent(_size) {
        return 0;
    }
    /** Install auto-extent derives for whichever never-set, unowned size slots
     *  qualify — only on views with View children (a childless view keeps its
     *  zero-cost default; Dataset children are not geometry). Protected so the
     *  App can retarget it from content to its host. */
    bindExtent() {
        if (!this.children.some((c) => c instanceof View))
            return;
        let derives = EXTENT.get(this);
        for (const size of ["width", "height"]) {
            if (isSet(this, size) || ownerOf(this, size) !== null)
                continue;
            if (derives === undefined)
                EXTENT.set(this, (derives = {}));
            derives[size] = bindDerived(this, size, () => this.extentOf(size));
        }
    }
    extentOf(size) {
        // The child-LIST is a dependency too: a container populated by
        // replication (or createView) starts empty — without this, a constraint
        // reading contentWidth/contentHeight at that moment tracks nothing and
        // freezes (the menu-panel bug). Attr reads below cover the children that
        // exist; the structure cell covers arrival and removal.
        this.watchChildList();
        const axis = AXIS_OF[size];
        let max = this.contentExtent(size);
        for (const c of this.children) {
            if (!(c instanceof View) || !c.visible)
                continue;
            if (c.ignoreClip)
                continue; // frame chrome: derives from the bounds, never defines them
            if (percentOwned(c, axis) || percentOwned(c, size))
                continue;
            // The TRANSFORMED footprint (bounds), not the raw slots: a scaled or
            // rotated child counts the box it visibly covers — the same geometry
            // paint and the hit walk already honor (one geometry, every reader
            // agrees; the 2026-08-13 scale ruling).
            const b = c.bounds();
            const extent = (axis === "x" ? b.x : b.y) + b[size];
            if (extent > max)
                max = extent;
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
    get contentWidth() { return this.extentOf("width"); }
    get contentHeight() { return this.extentOf("height"); }
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
    bounds() {
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
    footprint() {
        const s = this.scale;
        const rot = this.rotation;
        const w = this.width;
        const h = this.height;
        if (s === 1 && rot === 0)
            return { x: 0, y: 0, width: w, height: h };
        const px = this.pivotX;
        const py = this.pivotY;
        const a = (rot * Math.PI) / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
            const dx = cx - px;
            const dy = cy - py;
            const fx = px + s * (dx * ca - dy * sa);
            const fy = py + s * (dx * sa + dy * ca);
            if (fx < minX)
                minX = fx;
            if (fx > maxX)
                maxX = fx;
            if (fy < minY)
                minY = fy;
            if (fy > maxY)
                maxY = fy;
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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
    get childViews() {
        // TRANSPARENT, not abstracted (RULED 2026-08-02, superseding D5's refusal).
        // On a virtualized block this answers with the instances that exist right
        // now — a subset, and it changes as you scroll. That was the reason the
        // read used to throw: a partial answer was indistinguishable from a whole
        // one. It is distinguishable now, because virtualization is explicit at
        // the source and legible at runtime through `virtualized`. So the honest
        // move is to say what is there and let the reader see the flag, rather
        // than refuse a question the program is entitled to ask.
        this.watchChildList();
        return this.children.filter((c) => c instanceof View);
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
    get virtualized() { return readVirtualized(this); }
    /** Pointer-interaction intrinsics (interaction.ts): `hovered` is true while
     *  this view is on the live hit chain — the topmost visible view under the
     *  pointer and its ancestors, occlusion-correct, false on touch; `pressed`
     *  while it is on the chain captured at pointer-down (a mouse press releases
     *  dragged off, re-arms dragged back; a touch press holds while down).
     *  Read-only reactive intrinsics like `contentWidth` (schema readOnly — a
     *  set is a compile error); reading one from a constraint subscribes it.
     *  Pay-per-use: a program that never reads them allocates nothing. */
    get hovered() { return readHovered(this); }
    get pressed() { return readPressed(this); }
    /** The default focus-traversal members of this view: its visible View
     *  children in source order (docs/system-design/input.md, Layer 2). The focus
     *  service descends into each; a view whose `tabOrder()` is not overridden
     *  uses this, so an all-default tree is pure tree preorder. An override may
     *  call it to compose ("the rest, minus X"). */
    tabDefault() {
        const out = [];
        for (const c of this.children)
            if (c instanceof View && c.visible)
                out.push(c);
        return out;
    }
    /** Internal focus notification, called by the focus service when this view
     *  gains (true) or loses (false) Declare focus — SEPARATE from the user's
     *  `onFocus`/`onBlur` handlers, so a built-in component (TextInput) can drive
     *  its native element without occupying the author's event slot. No-op on a
     *  plain view. */
    focusChanged(_focused) { }
    /** The OPTICAL band the `center` position literal centers — { lead, size }
     *  along the given axis, in this view's own coordinates. The base answer is
     *  the whole box (lead 0); Text overrides the y axis with its ink band (cap
     *  height to last baseline — the text-box-trim semantics). The same
     *  component-supplies-its-shape protocol family as the focus silhouette. */
    alignBand(axis) {
        return { lead: 0, size: axis === "x" ? this.width : this.height };
    }
    /** The self-completing exit (Node.discard does the unlink + ex-parent
     *  notify): this override only moves the DEPARTURE hook earlier for the
     *  still-linked caller — presence ends while the tree is WHOLE, so an
     *  `onRetire` reading `parent`, a datapath, or focus sees live state (the
     *  replicator's own order: fire, unlink, teardown). Unlink-first paths
     *  arrive with `parent` null and keep today's timing: teardown's own
     *  lifetime-guarded fire covers them. */
    discard() {
        if (this.parent !== null) {
            if (!EVICTING.has(this))
                fireRetireTree(this);
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
    teardown() {
        // The departure hook (D5/D8): presence is ENDING — fire onRetire down
        // the subtree while everything is still alive, unless this discard is a
        // window EVICTION (the presence continues; the replicator marked it).
        // A verb-entry discard already fired this while LINKED; the per-lifetime
        // guard makes this second call a no-op.
        if (EVICTING.has(this))
            EVICTING.delete(this);
        else
            fireRetireTree(this);
        // Move focus off this subtree before it is torn down (input.md §mutation).
        focusDiscardHook?.(this);
        // EVERY child, not just Views: an Animator/Spring child is a Node, and its
        // `to`/`attribute` bindings must be disposed too (else they leak, subscribed
        // to whatever they read — e.g. a Spring `to = { app.openSection … }`).
        for (const child of this.children)
            child.teardown();
        runRetire(this);
        const undoLayout = INSTALLED.get(this);
        if (undoLayout !== undefined) {
            INSTALLED.delete(this);
            undoLayout();
        }
        disposeApplier(this);
        disposeBindings(this);
        // the visibility feed dies with the view — the backend watch, the generic
        // computer, and any at-rest flush still pending
        this.visUnwatch?.();
        this.visUnwatch = null;
        if (this.visGeneric !== null) {
            this.visGeneric.dispose();
            this.visGeneric = null;
        }
        if (this.visWake !== null) {
            this.visWake.dispose();
            this.visWake = null;
        }
        if (this.visFlushTimer !== 0) {
            clearTimeout(this.visFlushTimer);
            this.visFlushTimer = 0;
        }
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
    flush(s) {
        // Pushers fire on CHANGE; the attach flush carries pre-attach state
        // across (the Image.stretches discipline). Phase-2 selection: a
        // container constructed `selectable = true` realizes its surface now.
        if (this.selectable === true)
            s.setSelectableRegion?.(true);
        // an armed visibility feed follows the view onto its (re)attached surface
        if (this.visArmed)
            this.startVisibility();
        s.setX(this.x);
        s.setY(this.y);
        s.setWidth(this.width);
        s.setHeight(this.height);
        s.setFill(this.fill);
        // Decoration beyond the flat fill is pay-per-use at the seam too: an
        // undecorated box exercises exactly the calls it always did (pushers
        // carry any post-attach change regardless).
        if (this.cornerRadius !== 0)
            s.setCornerRadius(this.cornerRadius);
        if (this.stroke !== null)
            s.setStroke(this.stroke);
        if (this.shadow !== null)
            s.setShadow(this.shadow);
        s.setVisible(this.visible);
        s.setOpacity(this.opacity);
        if (this.ignoreClip)
            s.setIgnoreClip?.(true);
        if (this.ignoreScroll)
            s.setIgnoreScroll?.(true);
        if (this.cursor !== "")
            s.setCursor(this.cursor);
        if (this.pointerEvents !== "")
            s.setPointerEvents(this.pointerEvents);
        if (this.scale !== 1 || this.pivotX !== 0 || this.pivotY !== 0)
            s.setScale(this.scale, this.pivotX, this.pivotY);
        if (this.rotation !== 0)
            s.setRotation?.(this.rotation, this.pivotX, this.pivotY);
        if (this.blend !== "normal")
            s.setBlend?.(this.blend);
        if (this.backdrop !== null)
            s.setBackdrop?.(this.backdrop);
        this.applyClip(this.clip);
        if (this.scrolls === "y" || this.scrolls === "both")
            s.setScroll?.(true, (y) => { this.scrollY = y; });
        if (this.scrolls === "x" || this.scrolls === "both")
            s.setScrollX?.(true, (x) => { this.scrollX = x; });
        const sink = this.inputSink();
        if (sink !== null)
            s.setInput(sink, this.inputWants());
        // a linked view wears the link affordance from first paint (rewireInput
        // carries post-attach changes; this is the attach-time half), and realizes
        // its REAL anchor where the backend can (location.md §0.4)
        if (this.cursor === "" && this.link !== "")
            s.setCursor("pointer");
        if (this.link !== "")
            s.setLink?.(this.link, this.label ?? "");
        if (this.draw)
            this.bindDraw();
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
    viewAt(x, y) {
        const r = (this.root ?? this);
        return hitAt(r, x - r.scrollX, y - r.scrollY);
    }
    /** Does this view's box contain the root-space point? Geometry only — what
     *  paints ON TOP is `viewAt`'s question — so a drop target can ask about
     *  itself without walking the tree. */
    containsPoint(x, y) {
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
    rootBounds() {
        const b = rootFrameBox(this);
        const r = (this.root ?? this);
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
    visArmed = false;
    visUnwatch = null;
    visGeneric = null;
    visWake = null;
    visPending = null;
    visStale = false;
    visFlushTimer = 0;
    /** @internal the attribute table's onTrack calls this (first tracked read). */
    armVisibility() {
        this.visArmed = true;
        this.startVisibility();
    }
    /** The model's own answer — the ancestor walk, with TRACKED reads: the
     *  visible chain, rootTransform, rootFrameBox. The generic feed delivers
     *  this value; the DOM feed runs the same reads purely as a WAKE (below),
     *  because the reads subscribing to exactly the ancestor slots the answer
     *  depends on is what makes the camera case (a world writing only its own
     *  scale) invalidate a descendant's facts with no attribute of its own
     *  changing. */
    readVisibility() {
        const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
        // hidden anywhere up the chain = off (tracked reads, so a flip wakes us)
        for (let v = this; v !== null; v = v.parent instanceof View ? v.parent : null)
            if (!v.visible)
                return { on: false, rect: null, scale: rootTransform(this).scale * dpr };
        const t = rootTransform(this);
        const b = rootFrameBox(this);
        const r = (this.root ?? this);
        const ix = Math.max(b.x, 0), iy = Math.max(b.y, 0);
        const iw = Math.min(b.x + b.width, r.width) - ix, ih = Math.min(b.y + b.height, r.height) - iy;
        if (iw <= 0 || ih <= 0)
            return { on: false, rect: null, scale: t.scale * dpr };
        const k = t.scale === 0 ? 1 : t.scale;
        return {
            on: true,
            rect: { x: (ix - b.x) / k, y: (iy - b.y) / k, width: iw / k, height: ih / k },
            scale: t.scale * dpr,
        };
    }
    startVisibility() {
        if (!this.visArmed)
            return;
        const s = this.surface;
        if (s?.watchVisibility) {
            // backend feed available: retire any generic computer from a prior life
            if (this.visGeneric !== null) {
                this.visGeneric.dispose();
                this.visGeneric = null;
            }
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
                this.visWake = new Constraint(`${this.constructor.name}.visibilityWake`, () => this.readVisibility(), () => {
                    if (sharedClock.busy) {
                        this.visStale = true;
                        this.scheduleVisFlush();
                        return;
                    }
                    this.surface?.refreshVisibility?.();
                });
                this.visWake.run();
            }
            return;
        }
        if (this.visGeneric !== null)
            return; // already computing
        this.visGeneric = new Constraint(`${this.constructor.name}.visibility`, () => this.readVisibility(), (v) => {
            const r = v;
            this.deliverVisibility(r.on, r.rect, r.scale);
        });
        this.visGeneric.run();
    }
    /** Arm the at-rest flush (the timer only exists while something is pending
     *  or stale — no standing loop). At rest it prefers RE-MEASURING over
     *  replaying: a buffered value from mid-glide is a sample of the journey,
     *  not the destination. */
    scheduleVisFlush() {
        if (this.visFlushTimer !== 0)
            return;
        const tick = () => {
            this.visFlushTimer = 0;
            if (sharedClock.busy) {
                this.visFlushTimer = setTimeout(tick, 120);
                return;
            }
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
            }
        };
        this.visFlushTimer = setTimeout(tick, 120);
    }
    deliverVisibility(on, rect, scale) {
        if (this.onScreen !== on)
            setBound(this, "onScreen", on);
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
    }
    /** The composed transform from MY frame to ROOT-frame space — `{x, y,
     *  scale, rotation}`, the similarity the language's transforms compose to
     *  (scroll-aware, the hit walk's own math). The METHOD tier's exact answer;
     *  the facts above are its coarse, at-rest companions. */
    rootTransform() {
        const t = rootTransform(this);
        const r = (this.root ?? this);
        return { x: t.tx + r.scrollX, y: t.ty + r.scrollY, scale: t.scale, rotation: t.rotation };
    }
    rootOrigin() {
        const o = rootFrameOrigin(this);
        const r = (this.root ?? this);
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
    travelWith(scroller) {
        this.travelHost = scroller;
        return this.applyTravel();
    }
    /** The standing travel request (undefined = never asked). Applied here and
     *  re-applied at attach; `travelDone` is the reactive echo the requester
     *  reads (see attach). */
    travelHost = undefined;
    applyTravel() {
        const scroller = this.travelHost;
        if (scroller === undefined)
            return false;
        const s = this.surface;
        if (s === null || typeof s.travelWith !== "function")
            return false;
        const home = scroller === null || scroller === this.parent;
        if (home) {
            s.travelWith(null);
            return false;
        }
        if (scroller.surface === null)
            return false;
        s.travelWith(scroller.surface);
        return true;
    }
    /** Scroll this view to the top of its nearest scrolling ancestor — the
     *  imperative companion to the reactive `scrolls`/`scrollY` pair (a click
     *  handler calls it to jump to a target). Both backends do the work in their
     *  Surface; a no-op before attach or with nothing scrolling above. (Named for
     *  the platform primitive — `reveal` is deliberately left free as a member name,
     *  e.g. a `reveal:` fade-in Spring.) */
    scrollIntoView(align, smooth, inset) {
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
    scrollTo(y) {
        if (Number.isFinite(y))
            this.scrollY = y;
        this.surface?.scrollToY?.(y);
    }
    /** The horizontal twin of `scrollTo` — same request/clamp/hold contract,
     *  for a `scrolls = x` (or `both`) view. */
    scrollToX(x) {
        if (Number.isFinite(x))
            this.scrollX = x;
        this.surface?.scrollToX?.(x);
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
    createView(tag, props) {
        if (viewCreator === null)
            throw new Error("createView: the instantiation module is not loaded");
        return viewCreator(this.root, tag, this, props);
    }
    raise(below) {
        const p = this.parent;
        if (!(p instanceof View))
            return;
        const away = this.surface?.isTraveling?.() === true;
        if (below == null || below === this || below.parent !== p) {
            if (p.children[p.children.length - 1] === this)
                return; // already frontmost
            p.removeChild(this);
            p.insertChild(this, p.children.length);
            if (!away && this.surface !== null && p.surface !== null)
                p.surface.insertChild(this.surface, null);
            return;
        }
        if (p.children[p.children.indexOf(below) - 1] === this)
            return; // already just beneath `below`
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
    inputSink() {
        const self = this;
        const handled = POINTER_TYPES.some((t) => typeof self[handlerName(t)] === "function");
        // A tip-carrying view is hover-interactive by that fact alone (pay-per-use
        // extends to the tip attribute): its sink reports over/out/press to the
        // Tip service; declared handlers, when present, fire exactly as before.
        // A LINKED view is interactive by the same rule (location.md §0.4): `link`
        // grants interest the way a handler does, and a plain click follows the
        // reference — AFTER any declared onClick (handler first, then follow; the
        // handler cannot cancel — veto belongs to onFollow, or to link = "").
        if (!handled && this.tip === "" && this.link === "")
            return null;
        return (type, x, y, extra) => {
            if (this.tip !== "") {
                if (type === "pointerOver")
                    Tip.over(this);
                else if (type === "pointerOut")
                    Tip.out(this);
                else if (type === "pointerDown")
                    Tip.hide();
            }
            // One plain event argument: the point in this view's coordinates, plus
            // whatever fact this event kind carries (`canceled` on a release, the
            // finger list on the raw touch family).
            if (handled)
                fireEvent(this, type, extra === undefined ? { x, y } : { x, y, ...extra });
            if (type === "click" && this.link !== "") {
                const app = this.root;
                app?.follow?.(this.link, this.replace);
            }
        };
    }
    /** Re-derive the surface's input wiring — the pusher for attributes that
     *  GRANT interest by their value (`link`; a post-attach handler install goes
     *  through here too). Idempotent: attach-time flush and this call converge
     *  on the same sink/wants pair. */
    rewireInput() {
        const s = this.surface;
        if (s === null)
            return;
        const sink = this.inputSink();
        if (sink !== null)
            s.setInput(sink, this.inputWants());
        // A linked view reads as a link: the pointer affordance, unless the author
        // set an explicit cursor. (The DOM path also gets this from the realized
        // anchor; canvas gets it only from here.)
        if (this.cursor === "")
            s.setCursor(this.link !== "" ? "pointer" : "");
    }
    /** What the ROUTER needs to know about this view's declared handlers to
     *  arbitrate gestures for it (input.ts HitTarget): whether it answers
     *  double-clicks (so its single click waits out the double window), holds,
     *  or the raw touch family (so the whole multi-finger stream is delivered and
     *  nothing is interpreted). Declaration IS the opt-in — no configuration. */
    inputWants() {
        const self = this;
        const has = (t) => typeof self[handlerName(t)] === "function";
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
    bindDraw() {
        this.drawing = new Constraint(`${this.constructor.name}.draw`, 
        // The box arrives as THUNKS so `d.w`/`d.h` register a dependency only when
        // the body actually reads one (draw.ts) — a drawing that ignores its size
        // must not re-record on every resize.
        () => record((d) => this.draw(d), () => this.width, () => this.height), 
        // Constraint is deliberately untyped across compute→apply (reactive.ts);
        // this apply's input is exactly its compute's output.
        (list) => this.surface?.setDrawing(list), 1);
        this.drawing.run();
    }
    /** Re-record right now — the explicit half of draw-on-invalidation (the
     *  attribute-driven half is the recording's own tracked reads). Also the
     *  entry point for a draw method assigned after attach. */
    invalidateDraw() {
        if (this.drawing !== null)
            this.drawing.run();
        else if (this.draw && this.surface !== null)
            this.bindDraw();
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
    applyClip(clip) {
        if (this.surface === null)
            return; // pre-attach: flush will replay this
        this.surface.setBoxClip(clip === true);
        this.surface.setClip(typeof clip === "string" ? clip : null);
    }
}
/** The one composed-transform pusher (scale + rotation about a shared
 *  pivot): any of the four attributes re-pushes both seam calls, so a
 *  backend keeps a single transform and never sees a half-updated pivot. */
const pushTransform = (v) => {
    v.surface?.setScale(v.scale, v.pivotX, v.pivotY);
    v.surface?.setRotation?.(v.rotation, v.pivotX, v.pivotY);
};
/** The `scrolls` axis-enum pusher, shared by View and the App's own default
 *  (`"y"` — the App's scroller is the page; the backend realizes the root's
 *  regime as the browser's own scroll). */
const pushScrolls = (v, ax) => {
    // optional-called: a minimal host/mock surface may omit the scroll seam
    v.surface?.setScroll?.(ax === "y" || ax === "both", (y) => { v.scrollY = y; });
    v.surface?.setScrollX?.(ax === "x" || ax === "both", (x) => { v.scrollX = x; });
};
/** visibleRect's rest state — one frozen instance, so an off-screen view's
 *  slot never churns (rectEqual gates the writes besides). */
const EMPTY_RECT = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
const rectEqual = (a, b) => a === b || (a != null && b != null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
defineAttributes(View, {
    x: { def: 0, push: (v, n) => v.surface?.setX(n) },
    y: { def: 0, push: (v, n) => v.surface?.setY(n) },
    width: { def: 0, push: (v, n) => v.surface?.setWidth(n) },
    height: { def: 0, push: (v, n) => v.surface?.setHeight(n) },
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
            if (b)
                markRichPending(v);
        } },
    // the visibility facts (declared above): defaults for a page never fed;
    // the ONE feed arms at the first tracked read of any of the three
    // (onTrack — pay-per-use), backend-fed where the backend has page context,
    // runtime-computed everywhere else
    onScreen: { def: true, onTrack: (v) => v.armVisibility() },
    visibleRect: { def: EMPTY_RECT, equal: rectEqual, onTrack: (v) => v.armVisibility() },
    apparentScale: { def: 1, onTrack: (v) => v.armVisibility() },
    ignoreLayout: { def: false, push: (v) => { const p = v.parent; if (p instanceof View)
            p.childrenMutated(); } },
    ignoreClip: { def: false, push: (v, b) => v.surface?.setIgnoreClip?.(b) },
    ignoreScroll: { def: false, push: (v, b) => v.surface?.setIgnoreScroll?.(b) },
    opacity: { def: 1, push: (v, o) => v.surface?.setOpacity(o) },
    cursor: { def: "", push: (v, c) => v.surface?.setCursor(c) },
    pointerEvents: { def: "", push: (v, c) => v.surface?.setPointerEvents(c) },
    // Scale + rotation + pivot ride one transform at the seam: any of the four
    // re-pushes the combined value (transform + transform-origin on the DOM).
    // setScale always accompanies setRotation so a backend can keep ONE
    // composed transform without ordering questions.
    scale: { def: 1, push: pushTransform },
    pivotX: { def: 0, push: pushTransform },
    pivotY: { def: 0, push: pushTransform },
    rotation: { def: 0, push: pushTransform },
    // optional-chained (the ignoreScroll pattern): backends adopt independently,
    // and the seam table (test/seam.test.mjs) says which have.
    blend: { def: "normal", push: (v, b) => v.surface?.setBlend?.(b) },
    backdrop: { def: null, push: (v, b) => v.surface?.setBackdrop?.(b), equal: backdropEqual },
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
            v.surface?.setLink?.(v.link, v.label ?? "");
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
    // TWO-WAY: the backend mirrors user scrolling IN (setScroll's callback); a
    // program write pushes OUT. The echo is inert — a mirrored value arrives
    // already equal to the surface's, so the push's scrollTo is a no-op there.
    // This is what lets an app drive its own scroller (the Files strip animates
    // `scrollX` to reveal a fresh column) instead of asking a platform reveal to
    // find one — scrollIntoView is axis-blind and walks ancestors, which is how
    // a horizontal strip reveal once vertically scrolled the island hosting it.
    scrollY: { def: 0, push: (v, y) => v.surface?.scrollToY?.(y) },
    claim: { def: "both" },
    scrollX: { def: 0, push: (v, x) => v.surface?.scrollToX?.(x) },
    // The prevailing built-ins: model-side on View (no push — Text's style
    // derive is the consumer that crosses the seam). Defaults are the
    // browser-native text defaults Text carried through R3–R9.
    textColor: { def: 0x000000, prevailing: true },
    selectable: {
        def: false,
        prevailing: true,
        // Phase-2 selection: an explicitly-selectable container realizes as a
        // selection surface (optional-chained — DOM-only affordance).
        push: (v, val) => v.surface?.setSelectableRegion?.(val === true),
    },
    fontSize: { def: 16, prevailing: true },
    fontFamily: { def: "sans-serif", prevailing: true },
    fontWeight: { def: "normal", prevailing: true },
    letterSpacing: { def: 0, prevailing: true },
    iconSize: { def: 16, prevailing: true },
    // Rich-text structure overrides — consumed by Markdown/HTMLText (null color =
    // the theme-aware house token; headingWeight = the house bold).
    headingColor: { def: null, prevailing: true },
    headingWeight: { def: "bold", prevailing: true },
    linkColor: { def: null, prevailing: true },
    codeColor: { def: null, prevailing: true },
    codeSize: { def: 0, prevailing: true },
    codeFamily: { def: "", prevailing: true },
    codeBackground: { def: null, prevailing: true },
    codeRule: { def: null, prevailing: true },
    richTextLayout: { def: null, prevailing: true },
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
            if (l !== null)
                INSTALLED.set(v, l.attachTo(v));
        },
    },
    // The cursor is model state: bindings read it (tracked), nothing renders it.
    datapath: { def: null },
});
/** The view whose `datapath = { }` compute is currently running, if any. A
 *  `:path` island in that body reads through the walk below — and must
 *  resolve against the cursor the slot EXTENDS, never the one it defines
 *  (bindDatapath's rule, applied to the island form). Without the skip,
 *  `datapath = { :detail }` reads its own half-written cursor on re-run and
 *  oscillates (null ↔ cursor) until the cycle guard trips. */
let cursorDefining = null;
export function withCursorDefining(view, fn) {
    const prev = cursorDefining;
    cursorDefining = view;
    try {
        return fn();
    }
    finally {
        cursorDefining = prev;
    }
}
/** The cursor in effect at `node`: the nearest ancestor-or-self datapath
 *  (language §9 — "descendants read fields relative to it"). Each level's
 *  slot is a tracked read, so a cursor appearing, changing, or clearing
 *  ANYWHERE on the chain wakes exactly the reads below it. */
export function inheritedCursor(node) {
    for (let n = node; n !== null; n = n.parent) {
        if (n instanceof View && n !== cursorDefining) {
            const dp = n.datapath;
            if (dp !== null)
                return dp;
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
let focusDiscardHook = null;
export function setFocusDiscardHook(fn) {
    focusDiscardHook = fn;
}
export function fireEvent(view, event, ...args) {
    const h = view[handlerName(event)];
    if (typeof h === "function")
        h.call(view, ...args);
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
function markRichPending(v) {
    const walk = (n) => {
        const f = n;
        if (typeof f.measurePending === "boolean" && f.surface?.deferredRichMeasure === true)
            f.measurePending = true;
        for (const c of n.children)
            walk(c);
    };
    walk(v);
}
/** Any rich flow in the tree still awaiting its settled measurement? The
 *  reveal HOLDS while true (location.md §0.5.3) — tree-wide on purpose: a
 *  reveal's landing depends on every flow above the target in document order,
 *  and "which flows sit between" is exactly the geometry that isn't settled
 *  yet. Conservative, cheap (only runs while an intent is held), and false
 *  everywhere on synchronous backends — headless stays first-call (§0.11). */
function anyRichPending(root) {
    let pending = false;
    const walk = (n) => {
        if (pending)
            return;
        if (n.measurePending === true) {
            pending = true;
            return;
        }
        for (const c of n.children)
            walk(c);
    };
    walk(root);
    return pending;
}
function findAnchor(root, name) {
    // The reveal inset (location.md §0.5.4): fixed chrome the landing must
    // clear, one app-wide knob, threaded to both target kinds.
    const inset = root.revealInset ?? 0;
    const views = [];
    const slugs = [];
    const walk = (n) => {
        if (n instanceof View) {
            if (n.anchor !== "") {
                const v = n;
                views.push({ base: v.anchor, view: v, fire: () => { if (v.surface === null)
                        return false; v.scrollIntoView("start", false, inset); return true; } });
            }
            const flow = n;
            if (typeof flow.anchorSlugs === "function" && typeof flow.revealAnchor === "function") {
                for (const s of flow.anchorSlugs())
                    slugs.push({ base: s, view: n, fire: () => flow.revealAnchor(s, inset) });
            }
        }
        for (const c of n.children)
            walk(c);
    };
    walk(root);
    const seen = new Map();
    for (const c of [...views, ...slugs]) {
        const n = (seen.get(c.base) ?? 0) + 1;
        seen.set(c.base, n);
        const key = n === 1 ? c.base : `${c.base}-${n}`;
        if (key === name)
            return { view: c.view, fire: c.fire };
    }
    return null;
}
/** The application root — the single visible tree at the top (OpenLaszlo's
 *  `<canvas>`). R0 treats it as the root View; it fills its host by default and
 *  carries the app's reactive environment (host extent, scroll, pointer). */
export class App extends View {
    /** onReady — the boot transaction's close, DELIVERED (schema.ts App
     *  events): boot is the one settle with no app handler anywhere in it, so
     *  its close cannot be asked for inline (afterSettle) and must arrive as an
     *  event. Registered at attach — the join point of every render path
     *  (mounted, headless, native) — and fired at the close of the FIRST settle
     *  after it: tree standing, constraints wired, geometry computed, nothing
     *  painted, so what the handler writes is in the first frame the user sees.
     *  Once per App instance; an embedded island's App gets its own. */
    readyDelivered = false;
    attach(backend, parentSurface, before = null) {
        super.attach(backend, parentSurface, before);
        if (!this.readyDelivered) {
            this.readyDelivered = true;
            afterSettle(() => fireEvent(this, "ready"));
        }
    }
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
    hostServices = null;
    /** @internal an EMBEDDED tenant's line to its host island (linkIslandTenant
     *  installs it). Null = not linked (a top-level app, or never linked) —
     *  send() says so instead of vanishing. */
    hostSink = null;
    /** post(topic, payload) — the tenant's message VERB, this app → its host
     *  island's onPost. The other half of the bridge from the facts: consumed
     *  once, ordered, never re-readable — for "do this", not "this is so"
     *  (islands design; the state channel is the `external` attributes). */
    post(topic, payload) {
        if (this.hostSink === null) {
            console.warn(`[Declare] app.post("${topic}"): this app is not linked to a host island — message dropped`);
            return;
        }
        this.hostSink.message(topic, payload);
    }
    /** navigate(to) — the navigation SERVICE ACTION (capabilities.md §6). A link or
     *  button calls `app.navigate(url)` in an activation handler; the compiler reads
     *  the call statically (links.ts → `<a href>` in the static extraction), and at
     *  runtime the host opens `to`. DOM-free: bodies never touch window.location, so
     *  navigation rides this channel like `editing` — one clear way, analyzable. */
    navigate(to) {
        if (this.hostServices?.navigate) {
            this.hostServices.navigate(to);
            return;
        }
        this.pendingNav = to;
    }
    /** The reference schemes a link may carry (location.md §0.4) — the shared
     *  predicate lives at the render seam (backend.ts allowedRef), because the
     *  realization path enforces it too: a disallowed scheme never becomes an
     *  href, so copy-link and middle-click — native paths that never enter
     *  follow — stay shut. */
    static allowedRef(ref) { return allowedRef(ref); }
    /** The destination part of a location — the runtime strips ITS OWN trailing
     *  `@name` (§6's one shared grammar character); the app never writes the
     *  split. `shows` lowers to a comparison against this (instantiate.ts). */
    destinationOf(loc) {
        const at = loc.indexOf("@");
        return at >= 0 ? loc.slice(0, at) : loc;
    }
    /** The history verb the NEXT location mirror should use (location.md §0.5.6):
     *  "push" (default), or "replace" — set by follow when the link carries
     *  `replace = true`, and by the host itself on traversal/cold arrivals so a
     *  redirect can never mint an entry (no Back loops). Consumed (reset to
     *  "push") by the host at the mirror. A plain field, like pendingNav. */
    pendingHistoryVerb = "push";
    /** follow(ref) — the ONE operation behind every arrival (location.md §0.5):
     *  a linked view's activation, a rich-text href, a cold URL, back/forward.
     *  Source requests, runtime delivers, destination decides. The app-scoped
     *  hook `onFollow(ref) -> ref'` (a user-declared method, §0.6) is applied
     *  ONCE — transform, veto (""), or side-effect; then an external reference
     *  leaves through `navigate`, and a `#…` writes `location`. The anchor
     *  reveal rides the existing retained intent (resolveReveal); an anchorless
     *  arrival seeds the scroll to the top. Re-following the current reference
     *  re-runs the arrival step — no dead clicks. */
    follow(ref, replace = false) {
        if (!App.allowedRef(ref))
            return;
        const hook = this.onFollow;
        if (typeof hook === "function") {
            const out = hook.call(this, ref);
            if (typeof out !== "string" || out === "")
                return;
            ref = out;
            if (!App.allowedRef(ref))
                return;
        }
        if (!ref.startsWith("#")) {
            this.navigate(ref);
            return;
        }
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
            if (dest !== null)
                loc = dest === "" ? this.destinationOf(this.location) + "@" + loc : dest + "@" + loc;
        }
        if (replace)
            this.pendingHistoryVerb = "replace";
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
            if (this.hasArrive())
                afterSettle(() => fireEvent(this, "arrive", this.destinationView()));
            else
                this.scrollIntoView("start");
        }
        else if (same)
            this.rearmReveal();
    }
    /** The destination gating an anchored view: walk the tree for `anchor ===
     *  name`, then up from it for the nearest `shows`. null = no such anchor
     *  (the name is a destination or a computed location); "" = an anchor
     *  outside any destination (reveal within the current location). */
    destinationOfAnchor(name) {
        let found = null;
        const walk = (n) => {
            if (found !== null)
                return;
            if (n instanceof View && n.anchor === name) {
                found = n;
                return;
            }
            for (const c of n.children)
                walk(c);
        };
        walk(this);
        const f = found; // assigned in the closure — TS can't see it
        if (f === null)
            return null;
        for (let v = f; v !== null; v = v.parent instanceof View ? v.parent : null) {
            if (v.shows !== "")
                return v.shows;
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
    pendingInspect = null;
    /** inspect(slot) — the Inspector SERVICE ACTION. `slot` names an embedded
     *  app's island ("run:spring"); omit it to inspect this app. Like navigate(),
     *  the intent rides the service table (or its channel fallback), so a `{ }`
     *  body never touches the document. */
    inspect(slot = "") {
        if (this.hostServices?.inspect) {
            this.hostServices.inspect(slot);
            return;
        }
        this.pendingInspect = slot;
    }
    /** openWindow(to) — navigate's NEW-WINDOW sibling (a "View Source" that must
     *  not replace the running app). Same discipline: bodies never touch
     *  `window`, the intent rides the service table (or its channel fallback).
     *  A registered service runs synchronously inside the activation, which is
     *  MORE popup-safe than the old next-frame poll, not less. */
    openWindow(to) {
        if (this.hostServices?.openWindow) {
            this.hostServices.openWindow(to);
            return;
        }
        this.pendingOpen = to;
    }
    /** The reveal intent held from `location`'s trailing `@name` (location.md §6) —
     *  null when the location carries no anchor. Retained across settles until the
     *  name appears in a settled tree; re-armed or cancelled when `location` changes. */
    pendingAnchor = null;
    lastRevealLocation = null;
    /** Resolve the pending `@name` reveal against the current settled tree. The host
     *  calls this after settles — and each frame while an intent is held, so a cold
     *  deep link (`/#guide/22-reach@some-heading`) fires once the DataSource lands and
     *  the heading renders. A location CHANGE re-arms the intent from its trailing
     *  `@name` (a change with no anchor cancels it); a resolved name fires the reveal
     *  and clears the intent. Runtime-side and backend-agnostic — the reveal itself
     *  splits at the surface seam (DOM scrollIntoView / canvas scroll clamp). Returns
     *  the name it revealed this call (else null) — the host ignores it; tests read it. */
    resolveReveal() {
        if (this.location !== this.lastRevealLocation) {
            this.lastRevealLocation = this.location;
            const at = this.location.indexOf("@");
            this.pendingAnchor = at >= 0 ? this.location.slice(at + 1) : null;
        }
        const name = this.pendingAnchor;
        if (name === null || name === "")
            return null;
        // THE MEASUREMENT VETO (location.md §0.5.3, closing §12.1): while any rich
        // flow's height is provisional — just rendered, or just un-hidden by this
        // very location change — the page's geometry is not the page's geometry,
        // and a reveal that "succeeds" against it lands ~a-viewport wrong and
        // clears the intent. Hold; the flows' measurement callbacks lift the veto
        // within a frame, and the host retries every frame while an intent is
        // held. Synchronous backends never set the flag, so headless (and the
        // pinned first-call contract) are untouched.
        if (anyRichPending(this))
            return null;
        const hit = findAnchor(this, name);
        if (hit === null)
            return null;
        // A declared onArrive REPLACES the built-in landing (the scroll): the
        // platform still resolves the name and waits out data and measurement —
        // only what "showing" means is the handler's. Same readiness gate as the
        // scroll thunk's own (attached surface), same hold-and-retry.
        if (this.hasArrive()) {
            if (hit.view.surface === null)
                return null;
            this.pendingAnchor = null;
            fireEvent(this, "arrive", hit.view);
            return name;
        }
        // Clear the intent only when the reveal ACTUALLY landed — the name being present
        // in `content` before its element is attached/rendered (the cold-deep-link race)
        // returns false, so we hold and retry next frame.
        if (hit.fire()) {
            this.pendingAnchor = null;
            return name;
        }
        return null;
    }
    /** Is an `onArrive` handler declared? (Installed by instantiate like every
     *  language member; a TS subclass may simply define one.) Its presence is
     *  the policy switch: declared, the app owns the landing. */
    hasArrive() {
        return typeof this.onArrive === "function";
    }
    /** The view an anchorless location lands on: the destination view (`shows`
     *  === the location's destination), or the App itself when no view declares
     *  it (a computed-location family, or the bare ""). Resolved at dispatch
     *  time, off the settled tree. */
    destinationView() {
        const dest = this.destinationOf(this.location);
        if (dest === "")
            return this;
        let found = null;
        const walk = (n) => {
            if (found !== null)
                return;
            if (n instanceof View && n.shows === dest) {
                found = n;
                return;
            }
            for (const c of n.children)
                walk(c);
        };
        walk(this);
        return found ?? this;
    }
    /** The DEFAULT landing, exposed — what the platform does with an arrival
     *  when no `onArrive` is declared: scroll the target into view, honoring
     *  `revealInset` (the App itself starts at its top). A document app that
     *  declares `onArrive` for the extra work composes the scroll back by
     *  calling this — the same move as `tabOrder()` composing `tabDefault()`. */
    reveal(target) {
        if (target === this) {
            this.scrollIntoView("start");
            return;
        }
        target.scrollIntoView("start", false, this.revealInset);
    }
    /** Re-arm the reveal intent for the CURRENT location — follow's no-dead-click
     *  rule (§0.5): re-following `#why@story` while already there re-runs the
     *  reveal, which resolveReveal's location-change guard would otherwise skip. */
    rearmReveal() { this.lastRevealLocation = null; this.scheduleReveal(); }
    /** The reveal pump — resolveReveal's retry as an ARMED-LIFETIME ticker on the
     *  shared clock. The hosts used to call resolveReveal once per frame for the
     *  life of the page (a standing rAF loop on every page, intent or no intent);
     *  now the runtime owns the wait, because it owns the intent: the pump
     *  enrolls when an `@name` intent arms and leaves the moment it lands or is
     *  cancelled, so an app with no deep link pays zero frames. The per-frame
     *  retry itself is load-bearing — a target's geometry can finish arriving
     *  via browser-async work (an image decode, a rich flow's measurement) that
     *  produces no settle to hook. Perpetual (never holds settleMotion open),
     *  like a Heartbeat. A held intent whose anchor never appears keeps the pump
     *  alive — exactly the old loops' behavior, now scoped to the one page that
     *  asked for an anchor. */
    pumpOn = false;
    revealPump = {
        perpetual: true,
        tick: () => {
            this.resolveReveal();
            if (this.pendingAnchor !== null)
                return true;
            this.pumpOn = false;
            return false;
        },
    };
    /** Stop the pump when the app leaves — a held intent must not keep the
     *  frame loop alive past the app (registered once, at first arm). */
    pumpRetireHooked = false;
    hookPumpRetire() {
        if (this.pumpRetireHooked)
            return;
        this.pumpRetireHooked = true;
        onDiscard(this, () => {
            if (this.pumpOn) {
                this.pumpOn = false;
                sharedClock.remove(this.revealPump);
            }
        });
    }
    /** Enroll the pump at the close of the current settle when the location
     *  carries an `@name`. Armed from `location`'s own push (the write IS the
     *  event), from rearmReveal, and once at mount for the cold-arrival seed.
     *  Arms, never resolves: resolution belongs to the pump's frame ticks — and
     *  to any host or test that calls resolveReveal itself (the pinned
     *  first-call contract). A no-anchor location makes this a peek and a no-op. */
    scheduleReveal() {
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
    cancelReveal() { this.pendingAnchor = null; }
    /** The App's auto-extent is the HOST, not its content: an unset width/height
     *  follows hostWidth/hostHeight (reactive on resize), so the root app fills its
     *  enclosing area with no declaration — the near-universal case. An explicit
     *  `width = …` still wins (isSet skips the derive), and there is no children
     *  guard: the app fills its host even while empty. This is the exact yielding
     *  default the content path uses (View.bindExtent), retargeted from content to
     *  host — so a resize repaints like any dependency. `minWidth`/`minHeight`
     *  floor the derive (tracked reads, so a reactive floor re-applies live). */
    bindExtent() {
        let derives = EXTENT.get(this);
        for (const size of ["width", "height"]) {
            if (isSet(this, size) || ownerOf(this, size) !== null)
                continue;
            if (derives === undefined)
                EXTENT.set(this, (derives = {}));
            derives[size] = bindDerived(this, size, () => size === "width" ? Math.max(this.hostWidth, this.minWidth) : Math.max(this.hostHeight, this.minHeight));
        }
        this.bindPageScroll();
    }
    /** An App is CLIPPED BY DEFINITION (ruled 2026-07-29): a program owns its
     *  rectangle. The boolean form of `clip` is absorbed here — the per-axis
     *  realization (overflow along a declared scroll axis is the page's range;
     *  overflow along any other axis is out of frame) lives in the backend's
     *  root scroll styling, composed with `scrolls`. A Shape clip keeps its
     *  paint+hit meaning; `clip = false` is refused at compile time (check.ts). */
    applyClip(clip) {
        if (this.surface === null)
            return;
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
    pageScroll = null;
    bindPageScroll() {
        if (this.pageScroll !== null)
            return;
        this.pageScroll = new Constraint("App.pageExtent", () => [this.contentWidth, this.contentHeight], (wh) => {
            const [w, h] = wh;
            this.surface?.setPageExtent?.(w, h);
        }, 1);
        this.pageScroll.run();
    }
    childrenMutated() {
        super.childrenMutated();
        this.pageScroll?.run();
    }
}
// One shared, frozen empty record for every top-level app's `env` — safe to
// share because hosts REPLACE the record wholesale, never mutate it.
// The interaction module's injected instance test (cycle-free, stylesheet.ts's
// discipline): interaction.ts types views structurally; this is the one brand check.
initInteraction((n) => n instanceof View);
const EMPTY_ENV = Object.freeze({});
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
    hasPointer: { def: true }, // a plain desktop until the profile says otherwise
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
    // the embedding environment's parameters (schema.ts): the HOST replaces the
    // whole record on every change (never mutates), so the default may be one
    // shared frozen empty object — reads like `app.env.dark` never null-crash
    env: { def: EMPTY_ENV },
    pageWeight: { def: 0 },
    sourceLines: { def: 0 },
    // `location` — the app's URL fragment (docs/system-design/location.md). A stored reactive
    // slot: the host seeds/writes it (deep link, back/forward), the app writes it to
    // navigate, and `{ }` constraints that read it (`visible = { app.location == … }`)
    // re-derive on every change. Default "" so an app that declares no initial keeps
    // a clean URL. NOT readOnly — navigation IS a write from app code. The push arms
    // the reveal pump: a location carrying `@name` is an intent, and the write is
    // the moment it arms (scheduleReveal — no host pumps this per frame anymore).
    location: { def: "", push: (a) => a.scheduleReveal() },
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
/** Validate a FOREIGN push against a declared type name — the trust-edge
 *  check (Declare tenants skip it; their own compiler governed the write and
 *  the handshake matched the types). Returns the refusal, or null. */
function boundaryCheck(typeName, v) {
    if (typeName.endsWith("[]") || typeName === "array")
        return Array.isArray(v) ? null : `expected an array (${typeName})`;
    switch (typeName) {
        case "number":
        case "Length":
        case "Color":
            return typeof v === "number" && Number.isFinite(v) ? null : `expected a number (${typeName})`;
        case "string": return typeof v === "string" ? null : "expected a string";
        case "boolean": return typeof v === "boolean" ? null : "expected a boolean";
        case "object": return typeof v === "object" && v !== null && !Array.isArray(v) ? null : "expected a plain object";
        default: {
            const t = declaredType(typeName);
            if (t !== null && t.kind === "enum") {
                const vals = t.values ?? [];
                return typeof v === "string" && vals.includes(v) ? null : `expected one of ${vals.join(", ")} (${typeName})`;
            }
            return null; // an unrecognized name got past the checker — let it through rather than invent a second checker
        }
    }
}
/** The external declarations of an instance — its half of a bridge. */
function externalsOf(node) {
    const out = {};
    const all = declarationsOf(node);
    for (const k of Object.keys(all))
        if (all[k].external === true)
            out[k] = all[k];
    return out;
}
/** Island — the abstract boundary box. Concrete kinds decide what the tenant
 *  IS (DOMIsland: foreign DOM; AppIsland: a Declare program); this base owns
 *  the bridge — the external-fact surface and the message verbs. */
export class Island extends View {
    /** @internal the linked tenant's delivery sink (null = nothing linked). */
    tenantSink = null;
    /** @internal per-name echo guard: which side a delivery is currently
     *  crossing FROM, so the far observer skips reflecting it back (identity-
     *  fresh computed values would otherwise ping-pong; equality gates alone
     *  cannot stop a constraint that mints a new array per run). */
    crossing = new Map();
    /** The message verb, host → tenant (`post`, in the postMessage lineage —
     *  `message` is the stream family's event). Dropped with a console note
     *  when no tenant is linked — a verb has no meaning without a receiver. */
    post(topic, payload) {
        if (this.tenantSink === null) {
            console.warn(`[Declare] ${this.constructor.name}.post("${topic}"): no tenant linked — message dropped`);
            return;
        }
        this.tenantSink.message(topic, payload);
    }
    /** @internal tenant → host verb arrival: fire the declared onPost with the
     *  one-record payload `{ topic, payload }` (IslandPost). */
    receiveMessage(topic, payload) {
        fireEvent(this, "post", { topic, payload });
    }
    /** @internal a tenant value push (validated when foreign). Ownership
     *  referees direction: a non-readonly slot the host BOUND refuses the push
     *  with the constraint named — the loud, structural answer. A `readonly
     *  external` slot is tenant-owned by declaration, so it lands via the
     *  runtime write path. */
    receiveValue(name, v, foreign) {
        const decl = externalsOf(this)[name];
        if (decl === undefined) {
            console.error(`[Declare] tenant push to '${name}': not an external attribute of this island (its externals: ${Object.keys(externalsOf(this)).join(", ") || "none"})`);
            return;
        }
        if (foreign && decl.type !== undefined) {
            const bad = boundaryCheck(decl.type, v);
            if (bad !== null) {
                console.error(`[Declare] tenant push to '${name}': ${bad}; got ${JSON.stringify(v)?.slice(0, 80)}`);
                return;
            }
        }
        this.crossing.set(name, "toIsland");
        try {
            if (decl.readOnly === true)
                setBound(this, name, v);
            else
                this[name] = v;
        }
        catch (e) {
            // The ownership referee spoke (a host-bound slot refuses a push, naming
            // its constraint). Loud, attributed — but never fatal to the settle the
            // observer fired in: a tenant cannot be allowed to crash its host.
            console.error(`[Declare] tenant push to '${name}' refused: ${e.message}`);
        }
        finally {
            // the guard clears when the island-side observer consumes it; clear
            // here too for the no-observer case (nothing host-side reads the slot)
            queueMicrotask(() => { if (this.crossing.get(name) === "toIsland")
                this.crossing.delete(name); });
        }
    }
    /** The foreign tenant's handle — built once, attached to the island's
     *  element by the DOM backend (`el.__declareIsland`). The whole sanctioned
     *  surface for non-Declare content; everything it does rides the same
     *  bridge a Declare tenant uses. */
    handle = null;
    foreignHandle() {
        if (this.handle !== null)
            return this.handle;
        const island = this;
        const messageCbs = [];
        this.tenantSink ??= {
            value: () => { }, // a foreign tenant has no value inbox; it observes instead
            message: (topic, payload) => { for (const cb of messageCbs)
                cb({ topic, payload }); },
        };
        this.handle = {
            /** current value of an external */
            get: (name) => island[name],
            /** push a value in — boundary-validated */
            set: (name, v) => island.receiveValue(name, v, true),
            /** per-settle change notifications for an external (returns unobserve) */
            observe: (name, cb) => observe(() => island[name], (v) => cb(v), `island:${name}`),
            /** tenant → host message (fires the island's onPost) */
            post: (topic, payload) => island.receiveMessage(topic, payload),
            /** host → tenant messages (island.post lands here); cb({ topic, payload }) */
            onPost: (cb) => { messageCbs.push(cb); return () => { const i = messageCbs.indexOf(cb); if (i >= 0)
                messageCbs.splice(i, 1); }; },
            /** the declared surface, for discovery */
            externals: () => { const e = externalsOf(island); return Object.keys(e).map((n) => ({ name: n, type: e[n].type ?? "unknown", readonly: e[n].readOnly === true })); },
        };
        return this.handle;
    }
}
/** Link an Island to a DECLARE tenant (host-client renderChild, the canvas
 *  island service, the mac runner). Pairs the two `external` surfaces by name
 *  with a TYPE HANDSHAKE — the link error, at link time — then bridges both
 *  directions with per-settle observers, echo-guarded. Initial values: the
 *  host's side wins for host-writable slots, the tenant's for `readonly
 *  external` (tenant-owned) ones. Returns the unlink. */
export function linkIslandTenant(island, tenant) {
    const hostExt = externalsOf(island);
    const tenantExt = externalsOf(tenant);
    const paired = [];
    for (const name of Object.keys(hostExt)) {
        const t = tenantExt[name];
        if (t === undefined) {
            if (Object.keys(tenantExt).length > 0)
                console.warn(`[Declare] island external '${name}' has no matching external on the tenant app — not bridged`);
            continue;
        }
        if (hostExt[name].type !== undefined && t.type !== undefined && hostExt[name].type !== t.type) {
            throw new DeclareError(`island link: '${name}' is declared 'external ${hostExt[name].type}' here and 'external ${t.type}' in the tenant — the island could not be linked`);
        }
        paired.push(name);
    }
    const undo = [];
    const deliver = (from, to, name, dir) => {
        const v = from[name];
        island.crossing.set(name, dir);
        setBound(to, name, v);
    };
    for (const name of paired) {
        // initial sync — direction by the readonly mark (tenant-owned out-fact vs host-fed)
        if (hostExt[name].readOnly === true)
            deliver(tenant, island, name, "toIsland");
        else
            deliver(island, tenant, name, "toTenant");
        // island → tenant
        undo.push(observe(() => island[name], () => {
            if (island.crossing.get(name) === "toIsland") {
                island.crossing.delete(name);
                return;
            }
            deliver(island, tenant, name, "toTenant");
        }, `link:${name}:out`));
        // tenant → island
        undo.push(observe(() => tenant[name], () => {
            if (island.crossing.get(name) === "toTenant") {
                island.crossing.delete(name);
                return;
            }
            const v = tenant[name];
            island.receiveValue(name, v, false);
        }, `link:${name}:in`));
    }
    // verbs, both directions
    island.tenantSink = {
        value: (name, v) => setBound(tenant, name, v),
        message: (topic, payload) => fireEvent(tenant, "post", { topic, payload }),
    };
    tenant.hostSink = { message: (topic, payload) => island.receiveMessage(topic, payload) };
    undo.push(() => { island.tenantSink = null; tenant.hostSink = null; });
    return () => { for (const fn of undo.splice(0)) {
        try {
            fn();
        }
        catch { /* torn down */ }
    } };
}
/** DOMIsland — the FOREIGN-CONTENT island (design: the `DOMIsland [ … ]` view). A leaf
 *  whose box Declare lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the Declare-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. Carries the Island bridge: `external` declarations + send/onMessage,
 *  reachable from the tenant side through the element's `__declareIsland`. */
export class DOMIsland extends Island {
    flush(s) {
        super.flush(s);
        if (this.slot !== "")
            s.setEmbed(this.slot, this);
    }
}
defineAttributes(DOMIsland, {
    slot: { def: "", push: (v, id) => v.surface?.setEmbed(id, v) },
    childName: { def: "" },
});
//# sourceMappingURL=view.js.map