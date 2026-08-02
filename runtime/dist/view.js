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
import { Node, runRetire } from "./node.js";
import { DeclareError } from "./errors.js";
import { DEFAULT_THEME, fillEqual, shadowEqual, strokeEqual } from "./value.js";
import { disposeApplier, stylesheetArrived, stylesheetByName } from "./stylesheet.js";
import { POINTER_TYPES, TOUCH_TYPES } from "./backend.js";
import { Tip } from "./tip.js";
let viewCreator = null;
export function provideViewCreator(fn) {
    viewCreator = fn;
}
import { record } from "./draw.js";
import { Constraint } from "./reactive.js";
import { initInteraction, readHovered, readPressed, hitAt, boxContains, rootFrameOrigin } from "./interaction.js";
import { bindDerived, defineAttributes, disposeBindings, isSet, ownerOf, percentOwned } from "./attributes.js";
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
// and unmarks) — consulted by the childViews refusal above. Lives here so
// view.ts needs no import of the replicator (the dependency runs the other
// way).
const WINDOWED_BLOCKS = new WeakSet();
/** Is this view's replicated content currently windowed? Consulted by the
 *  layout kernel (the pass suspends while the windowing kernel owns
 *  placement) and by the childViews refusal. */
export function isWindowedBlock(v) {
    return WINDOWED_BLOCKS.has(v);
}
export function markWindowedBlock(v, on) {
    if (on)
        WINDOWED_BLOCKS.add(v);
    else
        WINDOWED_BLOCKS.delete(v);
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
            const extent = c[axis] + c[size];
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
        // The honest seam made loud (materialization.md §2, D5 RULED 2026-07-30):
        // on a WINDOWED block the instance list is the runtime's business — a
        // partial answer would be scroll-dependent, so the app-language read
        // refuses and names the idiom. The live window is kernel API
        // (replicate.ts blockOf/windowInfo); non-windowed blocks are unchanged.
        if (WINDOWED_BLOCKS.has(this)) {
            throw new DeclareError(`childViews on a windowed block answers with whichever rows happen to be materialized — a scroll-dependent lie. Derive counts and aggregates from the DATA (:rows), which is complete by definition`);
        }
        this.watchChildList();
        return this.children.filter((c) => c instanceof View);
    }
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
    /** Retire this subtree: dispose every standing computation (bindings,
     *  percents, derives, a laid parent's constraints on these slots, the draw
     *  recording), run registered teardowns (a replicator's), uninstall the
     *  arrangement, and destroy the surfaces — so no data or attribute change
     *  can ever wake work for a removed view. Children first; the model links
     *  (parent/children) are the caller's to cut (Node.removeChild). */
    discard() {
        // The departure hook (D5/D8): presence is ENDING — fire onRetire down
        // the subtree while everything is still alive, unless this discard is a
        // window EVICTION (the presence continues; the replicator marked it).
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
            child.discard();
        runRetire(this);
        const undoLayout = INSTALLED.get(this);
        if (undoLayout !== undefined) {
            INSTALLED.delete(this);
            undoLayout();
        }
        disposeApplier(this);
        disposeBindings(this);
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
        this.applyClip(this.clip);
        if (this.scrolls === "y" || this.scrolls === "both")
            s.setScroll?.(true, (y) => { this.scrollY = y; });
        if (this.scrolls === "x" || this.scrolls === "both")
            s.setScrollX?.(true, (x) => { this.scrollX = x; });
        const sink = this.inputSink();
        if (sink !== null)
            s.setInput(sink, this.inputWants());
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
     *  backend can't (no surface yet, or no travelWith), so callers keep the
     *  reactive root-space fallback. */
    travelWith(scroller) {
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
    scrollIntoView(align, smooth) {
        this.surface?.scrollIntoView(align, smooth);
    }
    /** Promotion (planes.md §1 — order is a slot): re-link this view among its
     *  siblings, tree and surface both. `raise()` moves it to the FRONT (last
     *  child — stacking is source order); `raise(below)` moves it to just BENEATH
     *  a sibling instead, so a pinned band above it (e.g. the dock's minimized
     *  windows) stays on top. Same parent only — the verb form of z-order, no
     *  numbers. A Menu raises at open; a Window raises on activation. */
    raise(below) {
        const p = this.parent;
        if (!(p instanceof View))
            return;
        if (below == null || below === this || below.parent !== p) {
            if (p.children[p.children.length - 1] === this)
                return; // already frontmost
            p.removeChild(this);
            p.insertChild(this, p.children.length);
            if (this.surface !== null && p.surface !== null)
                p.surface.insertChild(this.surface, null);
            return;
        }
        if (p.children[p.children.indexOf(below) - 1] === this)
            return; // already just beneath `below`
        p.removeChild(this);
        const at = p.children.indexOf(below);
        p.insertChild(this, at < 0 ? p.children.length : at);
        if (this.surface !== null && p.surface !== null && below.surface !== null) {
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
        if (!handled && this.tip === "")
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
        };
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
            wantsDrag: has("pointerMove"),
            wantsWheel: has("wheel"),
            claimAxis: this.claim,
            wantsContext: has("contextMenu"),
        };
    }
    /** Stand up the draw method as a tracked, re-recording computation. */
    bindDraw() {
        this.drawing = new Constraint(`${this.constructor.name}.draw`, () => record((d) => this.draw(d)), 
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
/** The `scrolls` axis-enum pusher, shared by View and the App's own default
 *  (`"y"` — the App's scroller is the page; the backend realizes the root's
 *  regime as the browser's own scroll). */
const pushScrolls = (v, ax) => {
    // optional-called: a minimal host/mock surface may omit the scroll seam
    v.surface?.setScroll?.(ax === "y" || ax === "both", (y) => { v.scrollY = y; });
    v.surface?.setScrollX?.(ax === "x" || ax === "both", (x) => { v.scrollX = x; });
};
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
    ignoreLayout: { def: false, push: (v) => { const p = v.parent; if (p instanceof View)
            p.childrenMutated(); } },
    ignoreClip: { def: false, push: (v, b) => v.surface?.setIgnoreClip?.(b) },
    ignoreScroll: { def: false, push: (v, b) => v.surface?.setIgnoreScroll?.(b) },
    opacity: { def: 1, push: (v, o) => v.surface?.setOpacity(o) },
    cursor: { def: "", push: (v, c) => v.surface?.setCursor(c) },
    pointerEvents: { def: "", push: (v, c) => v.surface?.setPointerEvents(c) },
    // Scale + pivot ride one transform at the seam: any of the three re-pushes
    // the combined value (transform + transform-origin on the DOM).
    scale: { def: 1, push: (v) => v.surface?.setScale(v.scale, v.pivotX, v.pivotY) },
    pivotX: { def: 0, push: (v) => v.surface?.setScale(v.scale, v.pivotX, v.pivotY) },
    pivotY: { def: 0, push: (v) => v.surface?.setScale(v.scale, v.pivotX, v.pivotY) },
    focusable: { def: false },
    focusTrap: { def: false },
    // `anchor` — the view's name in the reveal namespace (location.md §6). A stored
    // slot the reveal walk reads after settle; "" = not an anchor. No push: it has
    // no surface effect. (Materializes §6's "named view"; heading slugs are the rest.)
    anchor: { def: "" },
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
    selectable: { def: false, prevailing: true },
    fontSize: { def: 16, prevailing: true },
    fontFamily: { def: "sans-serif", prevailing: true },
    fontWeight: { def: "normal", prevailing: true },
    letterSpacing: { def: 0, prevailing: true },
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
/** The cursor in effect at `node`: the nearest ancestor-or-self datapath
 *  (language §9 — "descendants read fields relative to it"). Each level's
 *  slot is a tracked read, so a cursor appearing, changing, or clearing
 *  ANYWHERE on the chain wakes exactly the reads below it. */
export function inheritedCursor(node) {
    for (let n = node; n !== null; n = n.parent) {
        if (n instanceof View) {
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
export function fireEvent(view, event, arg) {
    const h = view[handlerName(event)];
    if (typeof h === "function")
        h.call(view, arg);
}
/** Resolve a reveal anchor name against a settled tree (location.md §6). One
 *  preorder pass builds the namespace: named views (`anchor` attr) first, then
 *  heading slugs (duck-typed: a TextFlow exposes `anchorSlugs()`/`revealAnchor()`),
 *  each in document order, with `-2`/`-3` suffixes on duplicate names — so the
 *  namespace is flat and every name unique, views winning a tie. Returns the reveal
 *  action for `name` (which reports whether it actually revealed — false before the
 *  target is attached/rendered, so the caller keeps holding the intent), or null
 *  when the name is not present in the tree at all. */
function findAnchor(root, name) {
    const views = [];
    const slugs = [];
    const walk = (n) => {
        if (n instanceof View) {
            if (n.anchor !== "") {
                const v = n;
                views.push({ base: v.anchor, fire: () => { if (v.surface === null)
                        return false; v.scrollIntoView(); return true; } });
            }
            const flow = n;
            if (typeof flow.anchorSlugs === "function" && typeof flow.revealAnchor === "function") {
                for (const s of flow.anchorSlugs())
                    slugs.push({ base: s, fire: () => flow.revealAnchor(s) });
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
            return c.fire;
    }
    return null;
}
/** The application root — the single visible tree at the top (OpenLaszlo's
 *  `<canvas>`). R0 treats it as the root View; it fills its host by default and
 *  carries the app's reactive environment (host extent, scroll, pointer). */
export class App extends View {
    /** app→host navigation channel: `navigate(to)` sets it, the host (host-client.js
     *  / a backend) polls it, opens the URL, and clears it to "". A plain field, not
     *  a reactive attribute — nothing in the tree renders from it, and no Declare
     *  source names it: navigation is the CALL, never an observed attribute. */
    pendingNav = "";
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
    createView(tag, parent, props) {
        if (viewCreator === null)
            throw new Error("createView: the instantiation module is not loaded");
        return viewCreator(this, tag, parent, props);
    }
    navigate(to) { this.pendingNav = to; }
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
     *  the intent rides a channel the host owns, so a `{ }` body never touches
     *  the document. */
    inspect(slot = "") { this.pendingInspect = slot; }
    /** openWindow(to) — navigate's NEW-WINDOW sibling (a "View Source" that must
     *  not replace the running app). Same discipline: bodies never touch
     *  `window`, the intent rides a channel the host owns. */
    openWindow(to) { this.pendingOpen = to; }
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
        const fire = findAnchor(this, name);
        // Clear the intent only when the reveal ACTUALLY landed — the name being present
        // in `content` before its element is attached/rendered (the cold-deep-link race)
        // returns false, so we hold and retry next frame.
        if (fire !== null && fire()) {
            this.pendingAnchor = null;
            return name;
        }
        return null;
    }
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
    touchDevice: { def: false },
    hasTouch: { def: false },
    hasPointer: { def: true }, // a plain desktop until the profile says otherwise
    lastPointerType: { def: "mouse" },
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
    // a clean URL. NOT readOnly — navigation IS a write from app code.
    location: { def: "" },
    demoSources: { def: {} },
    liveReport: { def: "" },
    // the size floor (bindExtent) — author-settable, 0 = none
    minWidth: { def: 0 },
    minHeight: { def: 0 },
    // the app's human name (page title etc.) — author-settable, "" = host default
    appName: { def: "" },
});
/** DOMIsland — a foreign-content island (design: the `DOMIsland [ … ]` view). A leaf View
 *  whose box Declare lays out and constrains normally, but whose interior is
 *  host-managed DOM: the `slot` key is reflected onto the element (DOM backend)
 *  so the host can mount an iframe / textarea / any element into the Declare-sized
 *  box — its width/height follow this view's constraints with no coordinate
 *  sync. (Canvas backend realizes the same island as a positioned DOM overlay
 *  — setEmbed is a no-op there for now.) */
export class DOMIsland extends View {
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