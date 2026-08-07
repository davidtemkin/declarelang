import type { Surface, RenderBackend, InputSink, EditableSpec, RichBlock, Stretch, InputWants } from "./backend.js";
import type { DisplayList } from "./draw.js";
import type { TextStyle } from "./measure.js";
import { type Fill, type Shadow, type Stroke } from "./value.js";
import { type HitTarget } from "./input.js";
export declare const OP: {
    readonly CREATE: 1;
    readonly DESTROY: 2;
    readonly INSERT: 3;
    readonly ROOT: 4;
    readonly GEOM: 5;
    readonly FILL: 6;
    readonly GRADIENT: 7;
    readonly RADIUS: 8;
    readonly STROKE: 9;
    readonly SHADOW: 10;
    readonly VISIBLE: 11;
    readonly OPACITY: 12;
    readonly SCALE: 13;
    readonly CLIP: 14;
    readonly BOXCLIP: 15;
    readonly TEXT: 16;
    readonly TEXTSTYLE: 17;
    readonly DRAW: 18;
    readonly IMAGE: 19;
    readonly STRETCH: 20;
    readonly SCROLL: 21;
    readonly SCROLLPOS: 22;
    readonly CURSOR: 23;
    readonly EDIT: 24;
    readonly EDITFOCUS: 25;
    readonly RICH: 26;
    readonly RICHSCROLL: 27;
    readonly EMBED: 28;
    readonly IGNORECLIP: 29;
    readonly SCROLLX: 30;
    readonly SCROLLXPOS: 31;
    readonly PAGEFILL: 32;
    readonly IGNORESCROLL: 33;
    readonly RICHWIDTH: 34;
    readonly BLEND: 35;
    readonly BACKDROP: 36;
    readonly TINT: 37;
};
/** The host side of the bridge — provided by the Swift shell before boot. */
export interface MacHost {
    /** Apply one settle's ops (a JSON array of arrays) inside one CATransaction. */
    commit(json: string): void;
    /** Measure text: returns [width, ascent, descent, capAscent]. Cold path. */
    measure(text: string, font: string, letterSpacing: number): number[];
    /** Natural size of a loaded image handle: [w, h]. */
    imageSize(handle: number): number[];
    /** Read back a native editable's current value (focus/blur sync). */
    editValue?(id: number): string;
    /** Lay a rich-text flow out natively and answer its height (cold path). */
    richLayout(id: number, blocksJson: string, selectable: boolean, width: number): number;
}
/** How many ops the current (unflushed) settle produced — benchmarks only. */
export declare function countOps(): number;
/** The serialized size of the pending buffer, for measuring the crossing. */
export declare function peekOps(): number;
export declare function flushOps(): void;
/** One view's retained state. The fields are the SCENE MODEL (the same one the
 *  canvas backend keeps) — every setter both records the value and emits the
 *  op that mirrors it into the layer tree. */
declare class MacSurface implements Surface {
    readonly id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    opacity: number;
    cursorStyle: string;
    scaleK: number;
    pivotX: number;
    pivotY: number;
    scrolls: boolean;
    scrollOffset: number;
    private onScrollCb;
    parent: MacSurface | null;
    readonly children: MacSurface[];
    ignoresClip: boolean;
    sink: InputSink | null;
    /** What the view declared it wants (dbl / hold / touch) — see setInput. */
    wants: InputWants | undefined;
    /** Shape clip (path data) and box clip — kept for the HIT walk, which must
     *  subtract exactly what the paint does. */
    private clipData;
    private boxClip;
    scrollsX: boolean;
    scrollXOffset: number;
    /** Set when this surface hosts native rich content: its height is answered
     *  by the host's text layout, and its hit region is the box (the overlay
     *  owns interior selection). */
    private richHeight;
    constructor();
    setX(v: number): void;
    setY(v: number): void;
    setWidth(v: number): void;
    setHeight(v: number): void;
    private geom;
    /** The last realized SOLID fill, as css — attachRoot reads it to paint the
     *  page behind a top-level app (the DOM/canvas attachRoot rule, mirrored).
     *  Solid fills only, exactly like the canvas mirror: a gradient app ground
     *  gets no page echo there either. */
    fillCss: string | null;
    setFill(fill: Fill): void;
    setCornerRadius(r: number): void;
    setStroke(s: Stroke | null): void;
    setShadow(sh: Shadow | null): void;
    setVisible(v: boolean): void;
    setOpacity(o: number): void;
    /** The schema token rides the wire verbatim; the Swift side maps it to a
     *  CIFilter for `layer.compositingFilter` (public on macOS — LayerTree
     *  case 35). A compositing filter rides the layer, not the order, so the
     *  restack/clipHost machinery is untouched. */
    setBlend(mode: string): void;
    /** The frost, natively (LayerTree case 36): the Swift side samples the
     *  layers beneath the node's padded region (CALayer.render(in:)), filters
     *  in encoded sRGB (the DrawReplay color-space precedent) and lands the
     *  result as a masked layer under the node's own fill. [blur, saturate]
     *  ride the wire; null clears. */
    setBackdrop(spec: {
        blur: number;
        saturate: number;
    } | null): void;
    setCursor(c: string): void;
    /** No CSS pointer-events natively: the hit walk is ours, so an inert
     *  surface simply drops its sink (setInput(null)) — this is a no-op kept
     *  for protocol completeness. The carved-sink rule needs nothing here
     *  because nothing but our own walk ever hit-tests. */
    /** Consulted by hit() below — the walk decides, so the walk must know. */
    pe: string;
    setPointerEvents(mode: string): void;
    setScale(scale: number, px: number, py: number): void;
    setClip(pathData: string | null): void;
    setBoxClip(on: boolean): void;
    setIgnoreClip(on: boolean): void;
    /** Fixed chrome: this surface does not ride its scroller's content. The host
     *  realizes it by hosting the layer on the scroller's OWN layer rather than
     *  the content layer that translates — the same escape shape `setIgnoreClip`
     *  uses, one property over.
     *
     *  Was absent entirely until 2026-08-05, which the seam table (test/seam.test.mjs)
     *  had recorded as a GAP and gate-baseline.json had sized: `ignorescroll`'s
     *  1.17% structural figure WAS this hole, since no pixel test can see an
     *  absence unless something is actually scrolled under the pinned thing. */
    setIgnoreScroll(on: boolean): void;
    /** An app ROOT (top-level or an island tenant) — roots keep to their frame
     *  and never self-scroll (the DOM's applyScrollStyle root branch). Stamped by
     *  attachRoot / mountEmbed, which run AFTER attach's scrolls push — so the
     *  push guards on it for any later re-push. */
    appRoot: boolean;
    setScroll(on: boolean, onScroll: (y: number) => void): void;
    /** Horizontal scroll is not yet realized natively (code blocks clip). */
    setScrollX(on: boolean): void;
    /** The widest a child reaches — the horizontal twin of contentExtent().
     *
     *  RECURSES, because this stands in for the DOM's `scrollWidth`, which
     *  measures where the content actually ends rather than what the immediate
     *  child declares. The Files strip is exactly that case: its row's declared
     *  width lags the columns inside it, so a shallow sum said the content fit
     *  and no column ever slid into view. A child that clips (or scrolls on this
     *  axis) contains its own overflow, so the walk stops there — again as the
     *  DOM does. */
    contentExtentXPublic(): number;
    /** Set the vertical offset and notify, for the smooth-reveal animation. */
    setScrollOffset(v: number): void;
    private contentExtentX;
    /** Reveal this surface within its nearest HORIZONTALLY scrolling ancestor. */
    private revealX;
    setText(text: string): void;
    setTextStyle(style: TextStyle): void;
    setDrawing(list: DisplayList | null): void;
    setImage(image: unknown | null): void;
    setImageStretch(stretch: Stretch): void;
    /** Tint (compositing.md §3.4): the color rides as CSS text; the Swift side
     *  re-derives the bitmap as an alpha-mask fill (LayerTree case 37). */
    setImageTint(color: number | null): void;
    /** Native rich text: the host lays the blocks out (Core Text) and answers
     *  the flowed height, which the runtime treats exactly as the DOM
     *  backend's measured height. `selectable` mounts a real NSTextView so
     *  selection is the platform's own. */
    setRichContent(blocks: RichBlock[], selectable: boolean, width: number, onResize: (height: number) => void, onLink: (href: string) => void): number;
    /** Width-only: an all-`pre` flow cannot re-wrap, so its lines and height are
     *  unchanged — but the host box must still adopt the width, because it bounds
     *  the pre's native horizontal scroller and a box left at its boot-time width
     *  clips the flow to nothing. No blocks cross the bridge: the host holds the
     *  laid-out state and only re-sizes its container. */
    setRichWidth(width: number): void;
    /** Called from the host when a rich flow's laid-out height is known. */
    applyRichHeight(h: number): void;
    /** The write half of scrollY/scrollX — clamped like every other write, and
     *  emitted so the layer tree moves this frame. */
    scrollToY(v: number): void;
    scrollToX(v: number): void;
    scrollIntoView(align?: "start" | "nearest", smooth?: boolean): void;
    revealRichAnchor(_slug: string, _within: number): boolean;
    /** An embed marker (DOMIsland's `slot`, and so AppIsland's `run:…` key).
     *  Natively nothing mounts into an element — the host reads the pending
     *  markers and inserts a child app's ROOT SURFACE here, so the tenant
     *  lands in this very layer tree (mountEmbed below). */
    setEmbed(id: string, view?: unknown): void;
    /** The sink, plus WHAT THIS VIEW ASKED FOR.
     *
     *  `wants` is not decoration: the shared router reads `wantsDbl` off the hit
     *  target to decide whether to HOLD a click for the double-click window, and
     *  `wantsHold` to arm the hold timer. A backend that drops it silently loses
     *  onDblClick and onHold — the DOM backend keeps the same fact in a WANTS map
     *  and spreads it onto every hit target, so this mirrors it exactly.
     *  `wantsTouch` is recorded for symmetry; a Mac mouse never reports fingers. */
    setInput(sink: InputSink | null, wants?: InputWants): void;
    setEditable(spec: EditableSpec | null): void;
    activateEditable(active: boolean): void;
    insertChild(child: Surface, before: Surface | null): void;
    destroy(): void;
    /** Content extent for scrolling: the furthest child bottom. */
    /** The DOM's `scrollHeight`: where the content ends, descendants included
     *  (see contentExtentX for why the walk has to go deeper than the children). */
    /** A windowed block's LOGICAL extent — the DOM backend's strut, as a floor.
     *
     *  A virtualized collection materializes ~a viewport of rows, so the walk
     *  below measures the WINDOW and the scroller's range would cover only the
     *  rows currently realized: dragging the thumb to the end lands mid-collection.
     *  The DOM realizes the floor as an inert zero-width strut child whose height
     *  IS the range; there is no reason to fake a child here, because the extent
     *  is computed rather than measured — a floor says the same thing directly.
     *  `null` clears it (the block stopped virtualizing). */
    private virtualExtent;
    setVirtualExtent(h: number | null): void;
    contentExtent(): number;
    /** Hit-test a point in this surface's parent coordinates. The canvas
     *  backend's walk, kept identical so the two renderers resolve the same
     *  target for the same point: scale inverted, shape clip subtracted (only
     *  ignoreclip children survive outside it), scroll frame corrected,
     *  children probed in reverse paint order, then this surface's own sink. */
    hit(px: number, py: number): HitTarget | null;
    /** Inside this surface's clip? The box clip is the rounded box; a shape
     *  clip asks the host (Core Graphics owns the path) — cached per path so
     *  the walk stays cheap. */
    /** The cursor the pointer should show at a point.
     *
     *  NOT the same walk as hit(). On the web a cursor comes from CSS on
     *  whatever element is under the pointer, whether or not it takes events —
     *  the window's resize band is exactly that: eight strips that style a
     *  cursor and carry no handlers, sitting inside one halo that owns the
     *  press. Reading the cursor off the hit TARGET therefore found nothing, and
     *  the window edges showed no resize cursor at all. */
    cursorAt(px: number, py: number): string;
    /** Walk the tree the way hit() does, narrating each step. */
    trace(px: number, py: number, depth?: number): void;
    private insideClip;
    /** Does this surface contain the point (its clip respected)? A wheel
     *  belongs to the topmost surface under the pointer and then to ITS
     *  ancestors — never to an occluded sibling, which is what let a scroll
     *  over the front window drive a scroller in the window behind it. */
    private ownsPoint;
    /** Route a HORIZONTAL wheel delta to the innermost surface that scrolls on
     *  that axis. A trackpad reports both deltas and the DOM routes each to
     *  whichever ancestor scrolls that way; only the vertical half existed here,
     *  so the Files strip could be revealed programmatically but never dragged. */
    scrollByX(px: number, py: number, dx: number): boolean;
    /** Route a wheel delta to the innermost scrolling surface under the point
     *  (the canvas backend's scrollBy, verbatim + the op emit). */
    scrollBy(px: number, py: number, dy: number): boolean;
}
/** A surface's absolute origin in the ROOT app's coordinate space.
 *
 *  An embedded child needs this to convert the host's pointer into its own
 *  space — the web reads `host.getBoundingClientRect()` for exactly this, and
 *  natively there is no element to ask, so the surface tree answers instead.
 *  A scrolling ancestor shifts everything inside it, so its offset comes off
 *  the sum (the same arithmetic LayerTree.absY does). */
export declare function surfaceOrigin(id: number): [number, number];
/** Publish a mounted child app's `appName` onto its island's `childName`.
 *
 *  The reverse of the `env` channel: the desktop's AppWindow titles itself by
 *  the child, so the Viewer's window is named for the file it is showing and
 *  follows in-app navigation. The DOM backend does this from one self-retiring
 *  rAF loop over the slot boxes; natively the island runner already has a
 *  per-tenant follow loop, so it calls this. */
export declare function publishChildName(islandId: number, name: string): void;
/** The island markers currently declared — the host mounts a child program
 *  into each (AppIsland), and re-reads because a slot is a constraint. */
export declare function embedsPending(): {
    id: number;
    slot: string;
}[];
/** Insert a child app's root surface into an island's surface. No coordinate
 *  sync and no second input router: the tenant is an ordinary subtree, so the
 *  paint and hit walks reach it exactly as they reach anything else. */
export declare function mountEmbed(islandId: number, childRoot: Surface): void;
/** Tear down whatever tenant an island is already hosting.
 *
 *  `mountEmbed` INSERTS, so a remount used to stack a second copy of the app on
 *  top of the first — the Viewer changes its env when you switch Reader/Source,
 *  which is a remount, so its document ended up drawn two and three times over
 *  itself at different sizes. An island hosts one tenant; evicting the old one
 *  is part of mounting the new. */
export declare function clearEmbed(islandId: number): void;
/** The scene model for a surface id (the host reads box geometry to size a
 *  mounted tenant). */
export declare function surfaceById(id: number): {
    width: number;
    height: number;
} | null;
export declare function provideHitPath(fn: (d: string, x: number, y: number) => boolean): void;
export declare class MacBackend implements RenderBackend {
    root: MacSurface | null;
    createSurface(): Surface;
    /** No HTMLElement here: the "host" is the native window's root layer. The
     *  root surface is named to the Swift side, and input routing starts. */
    attachRoot(_host: unknown, root: Surface): void;
}
/** Set a NAMED surface's scroll offset — the scrollbar drag.
 *
 *  Dragging a thumb is not a wheel gesture: it addresses one specific scroller,
 *  the one the thumb belongs to. Routing it as a delta at a point would re-run
 *  the geometric wheel walk and could land on a nested scroller that happens to
 *  sit under the bar. The clamp is the same one every other write uses, so the
 *  offset stays inside the content however far the pointer is dragged. */
export declare function macScrollTo(id: number, y: number, x?: number | null): void;
/** Narrate the hit walk at a point — a diagnostic for "nothing is hittable here". */
export declare function macTraceHit(x: number, y: number): void;
export declare function macScroll(x: number, y: number, dy: number, dx?: number): void;
export declare function macRichHeight(id: number, h: number): void;
export declare function macRichLink(id: number, href: string): void;
export declare function macEditInput(id: number, value: string): void;
export declare function macEditFocus(id: number, focused: boolean): void;
export declare function macEditEnter(id: number): void;
export {};
