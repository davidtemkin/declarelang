import { type MaskSpec, type Bitmap, type EditableSpec, type InputSink, type InputWants, type RenderBackend, type RichBlock, type Stretch, type Surface } from "./backend.js";
import { type Affine } from "./affine.js";
import { type Fill, type Radius, type Shadow, type Stroke, type Filter } from "./value.js";
import { type TextStyle } from "./measure.js";
import { type DisplayList } from "./draw.js";
/** Client point → el's view-local (pre-transform layout) coordinates.
 *  Exported for the embedded-app environment wiring (boot.ts): an island's
 *  box-relative pointer must come through the same inversion, or a child app
 *  inside a transformed host subtree hears skewed coordinates. */
export declare function localPoint(el: HTMLElement, cx: number, cy: number): {
    x: number;
    y: number;
};
export declare class DomBackend implements RenderBackend {
    /** Fragment-href realization base (location.md §0.9). null (the default,
     *  top level) = this document's own page. "" = an EMBEDDED app: fragment
     *  refs realize no native anchor at all (they would target the HOST page's
     *  fragment; routing still follows in-app). A URL = an embedder that knows
     *  the child's true program address, restoring the native affordances. */
    linkBase: string | null;
    createSurface(): Surface;
    attachRoot(host: HTMLElement, root: Surface): void;
}
type VisibilityCb = (v: {
    on: boolean;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    scale: number;
}) => void;
export declare class DomSurface implements Surface {
    readonly element: HTMLDivElement;
    private textEl;
    private editEl;
    private edit;
    private richEl;
    private richObserver;
    private onRichResize;
    /** package-private: a mask stencil's users read these (applyMask) */
    imgEl: Bitmap | null;
    drawEl: HTMLCanvasElement | null;
    drawing: DisplayList | null;
    private stretch;
    private alignX;
    private alignY;
    setImageAlign(ax: string, ay: string): void;
    /** The box's retained paint state — cornerRadius/stroke/shadow that decorate()
     *  brushes onto the div as CSS. `fillV` keeps the raw Fill for the gradient
     *  string. (The box is the div itself, painting beneath its children — no
     *  per-view canvas.) */
    private readonly box;
    private fillV;
    /** `visible` as this surface last set it. A hidden view's drawing is not
     *  rasterized — see setDrawing — and the raster it would have made is OWED
     *  until it shows. */
    private shown;
    private drawOwed;
    /** The composed scale (ancestor scales, NOT dpr) the drawing was last told
     *  it is seen at — from setRasterScale, at rest. 1 until the feed speaks. */
    private composedScale;
    /** Device px per view unit of the raster currently in the canvas; 0 = none. */
    private rasterK;
    private rasterBytes;
    /** The densest raster the platform has NOT refused for this view. A blank
     *  at density k sets this to k/2 for the life of the surface: the ceiling was
     *  discovered once, and every later re-record lives under it rather than
     *  re-discovering it with a blank raster and a check apiece. */
    private maxK;
    /** Set once the drawing raster has ever existed (arms the dpr watch once). */
    private watching;
    private gone;
    constructor();
    private posX;
    private posY;
    setX(v: number): void;
    setY(v: number): void;
    private placeSelf;
    setWidth(v: number): void;
    setHeight(v: number): void;
    /** The view-model frame (setWidth/setHeight, verbatim) — the ROOT element
     *  may realize LARGER than it along a declared scroll axis (applyRootSize). */
    /** package-private: a mask stencil's bitmap reads its box (dom-effects.ts) */
    frameW: number;
    frameH: number;
    /** ROOT only, stamped by attachRoot: this app is an EMBEDDED island in a
     *  host page — its gesture default is `manipulation`, never the geometry
     *  read (refreshTouchAction). */
    embeddedRoot: boolean;
    /** A scrolling pane's browser-drawn scrollbar follows the pane's own fill
     *  (the editable-scheme rule, applied to scrollers). */
    private applyScrollScheme;
    setFill(f: Fill): void;
    setCornerRadius(r: Radius): void;
    setStroke(st: Stroke | null): void;
    setShadow(sh: Shadow | null): void;
    /** Box decoration — pure CSS, ALWAYS (fill/gradient = background, cornerRadius
     *  = border-radius, shadow + inset ring = box-shadow). A rounded box is a
     *  plain composited div, NOT a per-view canvas raster: resizing it each frame
     *  then costs one cheap relayout instead of a GPU re-rasterization + command-
     *  buffer flush per box per frame (the jank that capped the zoom's frame rate).
     *  The old raster pinned corner AA to the Canvas backend's path AA pixel-for-
     *  pixel; border-radius corner AA differs by a few pixels per corner — absorbed
     *  by the suite's AA-tolerant compare (same class of difference as DOM text vs
     *  fillText), invisible to the eye, and the price of a 120fps zoom. One CSS
     *  property carries the drop shadow AND the inside border (an inset zero-blur
     *  ring — a CSS `border` would shift absolutely-positioned children). */
    private decorate;
    /** Arm the shared dpr watch once (the drawing raster must stay crisp across
     *  zoom / display moves; box decoration is CSS and text/<img> re-render
     *  natively, so neither needs it). */
    private watchDpr;
    setVisible(v: boolean): void;
    setCursor(c: string): void;
    private peOverride;
    setPointerEvents(m: string): void;
    setOpacity(o: number): void;
    private scaleK;
    private rotationDeg;
    /** The whole paint transform about the pivot (affine.ts); the similarity
     *  setters rebuild it, setTransform hands it over whole. */
    private xform;
    setTransform(m: Affine, px: number, py: number): void;
    /** The third dimension (graphics-pass.md §6): CSS rotateX/rotateY/translateZ
     *  about the pivot, seen through the parent's `perspective`; the registry
     *  keeps the homography for the pointer inverse. */
    private spec3D;
    setTransform3D(spec: typeof this.spec3D): void;
    setPerspective(px: number): void;
    private pivotXCache;
    private pivotYCache;
    setScale(scale: number, pivotX: number, pivotY: number): void;
    setRotation(deg: number, pivotX: number, pivotY: number): void;
    private applyTransform;
    setBlend(mode: string): void;
    setBackdrop(spec: readonly Filter[] | null): void;
    /** The view's own painted subtree, filtered as a group (graphics-pass.md
     *  §1): CSS `filter` on the element. Children are DOM descendants, so the
     *  group is the element's rendering — and CSS `filter` creates a stacking
     *  context and a backdrop root, exactly the isolation §4.1 rules. Lengths
     *  are CSS px, which scale with the element's transform as view units do. */
    setFilter(list: readonly Filter[] | null): void;
    /** The soft mask (graphics-pass.md §2): CSS `mask-image`, realized in
     *  dom-effects.ts. package-private: the realization reads these. */
    maskSpec: MaskSpec | null;
    /** Surfaces masked by THIS one's raster (a draw() stencil re-exports on re-raster). */
    maskUsers: Set<DomSurface> | null;
    /** A stencil asked twice with nothing to give is not still loading — warn then. */
    stencilSettled: boolean;
    setMask(spec: MaskSpec | null): void;
    applyMask(): void;
    setClip(d: string | null): void;
    /** The Shape clip's path data / lazily-built Path2D (carved-hit testing). */
    private clipData;
    private clipObj;
    /** Selection phase 2 (RULED 2026-08-06, David — "the normal web page
     *  thing" inside selectable regions): a container the author declared
     *  `selectable = true` becomes a SELECTION SURFACE — pointer-hittable and
     *  explicitly `text`, stamped, region-flipped — so a press on the gaps
     *  BETWEEN its blocks anchors a native selection exactly as it would on a
     *  page. Leaves keep winning where they exist (deepest hittable element);
     *  this only catches what used to fall through to the inert body. */
    private selectableRegion;
    setSelectableRegion(on: boolean): void;
    /** Reconcile carved-sink state (see CARVED): membership, and the element's
     *  effective pointer-events — authored override > carved-inert > sink default
     *  (a declared selection surface counts as a pointer target). */
    private updateCarved;
    /** Does the viewport point fall in this carved sink's clipped region?
     *  Local coords unwind a uniform scale (rect vs layout box ratio), then the
     *  Path2D answers with the canvas walk's default nonzero rule. */
    carvedHit(cx: number, cy: number): boolean;
    /** True when this surface opts out of its parent's box-clip (ignoreClip). */
    ignoresClip: boolean;
    /** The lazy inner clip container (see setBoxClip), discovered BY SELECTOR so
     *  either side of the seam can find or materialize it — the parent (a clip
     *  arriving over exempt children) or the child (ignoreClip flushed after the
     *  insert). Every ordinary child lives inside it, the exempt ones stay on
     *  the outer element, and the outer keeps ALL decoration exactly as before
     *  (radius rounds paint; the box-shadow silhouette is the outer's).
     *  Pay-per-use: an app that never writes ignoreClip keeps today's
     *  single-element realization untouched. */
    private get clipBox();
    setIgnoreClip(on: boolean): void;
    setBoxClip(on: boolean): void;
    /** ROOT only (backend.ts): the App's reactive content extent. The page
     *  realization sizes the root ELEMENT to max(frame, extent) along each
     *  declared scroll axis — the box itself is the scroll range and the
     *  document scrolls it natively — and refreshes the gesture default. */
    setPageExtent(w: number, h: number): void;
    private extentW;
    private extentH;
    /** Realize the ROOT element's box: the model frame, stretched to the
     *  content extent along a declared scroll axis (the page realization —
     *  the element IS the scroll range; `overflow: clip` everywhere else keeps
     *  exact frame containment with no per-axis overflow pairs). The view
     *  MODEL's width/height are untouched — this is realization only. */
    private applyRootSize;
    /** The write half of scrollY/scrollX: drive the element's own native offset.
     *  The browser clamps to the scrollable range itself; the half-pixel guard
     *  breaks the mirror echo (scroll event → attribute → push → here). The
     *  offset is REMEMBERED whether or not the write lands, because a hidden
     *  element takes neither the write nor an honest read (setVisible). */
    scrollToY(v: number, glide?: {
        duration?: number;
        motion?: string;
    }): void;
    scrollToX(v: number, glide?: {
        duration?: number;
        motion?: string;
    }): void;
    /** The window a TOP-LEVEL app root scrolls through, or null for anything
     *  that owns a scroll box (a pane, an embedded root). */
    private pageScroller;
    scrollIntoView(align?: "start" | "nearest", smooth?: boolean, inset?: number): void;
    /** Does any scroller above this element scroll HORIZONTALLY? Inner panes
     *  carry Declare's own truth as their inline `overflow-x` (applyScrollStyle:
     *  `auto` iff `scrolls` includes x); the page root scrolls the document, whose
     *  width exceeds the viewport only when the App declared an x axis
     *  (applyRootSize sizes the clipped root to its extent on declared axes only). */
    private inlineAxisScrolls;
    /** Rich text measures ASYNCHRONOUSLY here — the ResizeObserver in
     *  setRichContent reports the flowed height after layout (§12.1's measured
     *  mechanism). The reveal machinery holds anchored arrivals while any
     *  flow's measurement is outstanding (location.md §0.5.3). */
    get deferredRichMeasure(): boolean;
    /** The linked view's REAL anchor (location.md §0.4): an `<a href>` overlay
     *  filling the box — a sibling-overlay above the content, never a wrapper,
     *  so interactive children stay valid HTML (the ruled card pattern). It buys
     *  the native contract: status-bar preview on hover, ⌘/middle-click
     *  open-in-tab, right-click copy-link. A PLAIN left click is
     *  preventDefault-ed — the input walk owns routing and follows the
     *  reference; modified clicks belong to the browser (the rich-text link
     *  rule, applied to views). The scheme allowlist is enforced HERE, at
     *  emission — a disallowed href never enters the document, so the native
     *  paths that bypass follow stay shut. `linkBase` (set by the backend for
     *  EMBEDDED apps, §0.9) prefixes fragment refs with the app's own program
     *  URL so copy-link copies the truth; null = this document's own page. */
    linkBase: string | null;
    private linkEl;
    setLink(href: string, label?: string): void;
    revealRichAnchor(slug: string, _within: number, inset?: number): boolean;
    private scrollYOn;
    private scrollXOn;
    /** Reconcile the scroller styling with the axis pair. A scrolling axis is
     *  native `auto` (the OS overlay scrollbar, momentum, edge bounce); the
     *  other axis of a scroller is `hidden` (out of frame — the axis rule);
     *  no axes = not a scroller at all.
     *
     *  THE CROSS AXIS BELONGS TO THE ENCLOSING REGIME (ruled 2026-07-31). Both
     *  gesture properties here are per-axis facts, and both used to be written
     *  as if the DECLARED axis were the only one that existed:
     *
     *    - `touch-action` is `manipulation` — pan on BOTH axes plus pinch (the
     *      concise spelling of `pan-x pan-y pinch-zoom`). The old
     *      `pan-<declared> pinch-zoom` forbade panning on the undeclared axis
     *      outright, which is the very mistake the old comment here already
     *      named for the other gesture ("plain `pan-y` would silently forbid
     *      the user's pinch — a claim nobody made"): the cross axis was the
     *      same claim nobody made. Measured on the desktop (2026-07-31): a
     *      `scrolls = y` Files column inside an 800px stage on a 402px phone
     *      forbade the horizontal pan that was the ONLY way to reach the rest
     *      of the stage. Permitting both lets the browser route each axis to
     *      the nearest ancestor that scrolls it — which IS scroll chaining.
     *    - `overscroll-behavior` is per-axis too: `contain` on the axes this
     *      pane actually scrolls (the keeps-to-its-frame ruling — its own
     *      rubber-band, never a flash of the page behind), `auto` on the axis
     *      it does not, where there is no scroll of its own to contain and
     *      `contain` only severed the outer regime.
     *
     *  Double-tap zoom stays retired (`manipulation` excludes it), matching the
     *  root default — a separate question from the axis one. */
    applyScrollStyle(): void;
    private scrollListener;
    setRowCount(n: number | null): void;
    setRowIndex(i: number | null): void;
    setScroll(on: boolean, onScroll: (y: number) => void, onScrolling?: (active: boolean) => void): void;
    private scrollEndListener;
    private scrollWheelListener;
    private wheelLast;
    private scrollIdleTimer;
    private scrollActive;
    private wheelXListener;
    private scrollXListener;
    setScrollX(on: boolean, onScroll?: (x: number) => void, _onScrolling?: (active: boolean) => void): void;
    /** Native rich-text flow (RichText). Build ONE flowing content element — a block
     *  per RichBlock (real `<p>`/`<h*>` for a11y), inline runs in NORMAL flow (a
     *  `<span>`/`<code>`) — so the browser wraps, aligns baselines, and lets the user
     *  select/copy/find contiguously. Returns the measured (flowed) height. */
    /** Width-only follow-up to setRichContent: the host tracks the flow's width
     *  (it bounds a pre block's native horizontal scroller) without re-flowing —
     *  the cheap half the all-`pre` reflow early-out still needs. */
    setRichWidth(width: number): void;
    /** Clamp the flow to `maxLines` (0 lifts the clamp), and answer its new height.
     *
     *  `-webkit-line-clamp` on the flow HOST rather than on a block: the host is
     *  one `-webkit-box` and a clamp there counts lines ACROSS its block children,
     *  which is the cross-block semantics the model wants and not the usual use of
     *  the property. Measured on the probe flow: 209px unclamped, 126px at five
     *  lines, 81px at three, later blocks gone. The browser ends the last kept line
     *  with its own ellipsis, because it is the one that wrapped it. */
    setRichClamp(maxLines: number): number;
    setRichContent(blocks: RichBlock[], selectable: boolean, width: number, onResize: (height: number) => void, onLink: (href: string) => void): number;
    setEmbed(id: string, view?: unknown): void;
    setInput(sink: InputSink | null, wants?: InputWants): void;
    private wheelListener;
    private holdGateListener;
    /** Realize this element's gesture CLAIM as its `touch-action` — the language
     *  rule "the browser owns a gesture until a view claims it, and declaring
     *  the handler is the claim", compressed to one CSS property per element:
     *    - the raw touch family → `none` (every finger is the app's; the app
     *      owes its own zoom);
     *    - `onPointerMove` → `pinch-zoom` (the single-finger drag is the app's;
     *      pinch stays the user's — and by the measured one-way ratchet this is
     *      the MINIMUM suppression for the handler to fire at all);
     *    - no claim → inherit, except the APP ROOT's default: `pinch-zoom` for
     *      a clipped (fixed-window) app, `manipulation` (pan + pinch) for one
     *      the browser scrolls — both retire double-tap zoom, which a painted
     *      UI can never concede (two quick taps on a control must not lurch
     *      the page).
     *  A scroll pane owns its own value (applyScrollStyle's `manipulation` —
     *  both axes delegated, the cross axis to the enclosing regime) and is
     *  left alone. */
    refreshTouchAction(): void;
    /** `ignoreScroll` (backend.ts): this surface rides its nearest enclosing
     *  scroll FRAME. Realization by altitude, read off the element's ancestry:
     *  under the page regime (the app root), `position: fixed` — pinned to the
     *  viewport, contributing no document extent, exactly the platform's own
     *  meaning; under a pane, the element moves into the pane's STICKY FRAME
     *  (a zero-size in-flow `position: sticky` child of the scroller), which
     *  the compositor holds at the pane's frame origin — no per-frame JS, no
     *  lag. Idempotent; re-run when the root is stamped (attachRoot sweeps). */
    setIgnoreScroll(on: boolean): void;
    /** The virtual-extent strut (setVirtualExtent) — a zero-width, inert,
     *  invisible child whose height IS the scroll range's floor. */
    private strutEl;
    private strutH;
    setVirtualExtent(h: number | null): void;
    /** Where this element lived before travelWith moved it (null = at home). */
    private travelHomeEl;
    travelWith(host: Surface | null): void;
    isTraveling(): boolean;
    setEditable(spec: EditableSpec | null): void;
    /** The caret/selection write half (TextInput.select, #22): land the range on
     *  the native element. For a collapsed range at either extreme, bring the
     *  caret's end of the box into view — the platform reveals mid-text carets
     *  itself once typing starts. */
    setSelection(start: number, end: number): void;
    activateEditable(active: boolean): void;
    setText(text: string): void;
    setTextStyle(st: TextStyle): void;
    /** The text run element, created on first use. A positioned <span> — not a
     *  bare text node — so it paints in element order with the other content
     *  (in-flow text would paint *under* positioned siblings), matching the
     *  Canvas walk's content order. */
    private textRun;
    /** Insert a content element at its slot in the fixed content paint order —
     *  box raster, image, drawing, text, then child surfaces (the Canvas
     *  walk's order) —
     *  by anchoring after the last present content element that precedes it
     *  (or at the very front). Appending would be wrong for content that
     *  arrives LATE: an <img> lands asynchronously on load, after the child
     *  surfaces attached, and must not cover them (found by weather's
     *  topBar, whose bitmap covered the zip Text child). */
    private placeContent;
    setImage(image: Bitmap | null): void;
    setImageStretch(stretch: Stretch): void;
    /** Tint (compositing.md §3.4): the bitmap becomes a MASK — its own pixels
     *  hide, and a color layer wearing `mask-image: url(src)` takes its exact
     *  geometry, so the result is the tint color shaped by the bitmap's alpha
     *  (template-image rendering). Bitmaps only — a <video> frame is not a
     *  CSS mask source, so a tinted video keeps its own pixels. */
    private tintColor;
    private tintEl;
    setImageTint(color: number | null): void;
    private applyTint;
    /** `100%` tracks the view box natively (a later resize costs no image
     *  bookkeeping); the un-stretched axis is pinned to the NATURAL dimension —
     *  CSS `auto` would preserve the intrinsic ratio and drag it along with the
     *  stretched axis, which is not what a single-axis stretch means (the
     *  canvas walk draws the un-stretched axis at natural size; found by
     *  weather's `stretches=width` tab art). The element is always loaded
     *  when it crosses the seam, so the natural size is known. */
    private applyStretch;
    setDrawing(list: DisplayList | null): void;
    /** Rasterize the recording into this view's canvas at DENSITY k — device
     *  pixels per view unit. The CSS box stays the recording's bounds in view
     *  units, so a CSS transform above this element scales the canvas's box
     *  exactly as it scales everything else; what k decides is how many device
     *  pixels stand behind that box. k = dpr is a 1:1 raster; k = dpr × the
     *  composed scale is EXACT under the transform, which is what the at-rest
     *  feed asks for (setRasterScale). Until that feed speaks, dpr.
     *
     *  THE DOM HALF OF THE ADAPTIVE DRAW CACHE (task #28). The canvas backend
     *  replays under the live transform and the Mac host describes, so both were
     *  already exact at any scale; this backend held pixels at bounds × dpr and
     *  let CSS stretch them forever — the one renderer where a scaled drawing
     *  stayed soft. Now: stretched for the beat, exact at rest. The bytes are
     *  OBLIGATORY (retained-mode — the canvas IS the content), so the entry cap
     *  is honoured by CLAMPING density back to dpr, never by refusing to draw:
     *  a scaled drawing past the cap is soft, which is what it was before. */
    private rasterize;
    /** The at-rest composed scale, from the view's visibility feed (backend.ts).
     *  A change re-rasterizes at the new density; the same value is a no-op. */
    setRasterScale(scale: number): void;
    insertChild(child: Surface, before: Surface | null): void;
    watchVisibility(cb: VisibilityCb): () => void;
    refreshVisibility(): void;
    private unwatchVisibility;
    destroy(): void;
}
export {};
