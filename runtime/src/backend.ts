// The render seam — the single boundary between the view model and whatever
// draws it. This is Declare's answer to LZX's view→"sprite" contract, kept but
// cleaned of Flash-era baggage (no frames/play, rotation/scale, capability
// probing, or Flash a11y attributes).
//
// Two implementations sit behind it: the DOM backend (dom-backend.ts, R0) and
// the Canvas backend (R1). A View talks only to a Surface and never learns
// which one it has; the runtime injects the backend, so the application never
// names a substrate (APPROACH §4) — the property that lets a later optimizing
// runtime choose a backend per view / per hierarchy.

import type { Fill, Shadow, Stroke } from "./value.js";
import type { TextStyle, FontWeight } from "./measure.js";
import type { DisplayList } from "./draw.js";

/** One styled run of rich text (or a hard line break). Fully RESOLVED — the
 *  RichText component bakes the effective font/color into each run so a backend
 *  just realizes what it is told (no palette knowledge across the seam). */
export type RichRun =
  | { text: string; size: number; weight: FontWeight; italic: boolean; family: string; strike: boolean; color: number; tracking: number; fill?: Fill; chipBg?: number; href?: string }
  | { br: true };
/** One block of a rich-text flow — a paragraph or heading (`tag` = "p" | "h1"…
 *  "h6" for native semantics), its inline runs, the space above it, and its line
 *  leading. A flow is an ordered list of these; the browser (DOM) or the manual
 *  layout (Canvas) flows the runs and stacks the blocks. `align` shifts each
 *  finished line (a table cell's GFM column alignment); absent/`"left"` is the
 *  default, so a plain paragraph carries nothing. */
export interface RichBlock { tag: string; runs: RichRun[]; gapBefore: number; lineHeight: number; fontSize: number; align?: "left" | "center" | "right"; pre?: boolean; anchor?: string }

/** How an Image scales its bitmap into the view box — the language's
 *  `value Stretch = none | width | height | both` (§6). */
/** What can cross the bitmap seam: a decoded still, or a video element whose
 *  current frame is the picture. Both answer `drawImage`; both place as an
 *  absolutely-positioned child on the DOM. */
export type Bitmap = HTMLImageElement | HTMLVideoElement;

export type Stretch = "none" | "width" | "height" | "both";

/** The pointer events a view can answer at R5 (`onPointerDown` / `onPointerUp` /
 *  `onClick`). A click is not a platform event here — the shared router
 *  (input.ts) synthesizes it as "press and release resolved to the same
 *  view", so both backends decide it identically by construction. */
export type PointerType = "pointerDown" | "pointerUp" | "click" | "dblClick" | "pointerMove" | "pointerOver" | "pointerOut"
  | "hold"                                     // a press held in place — the tap-hold / click-hold fact
  | "contextMenu"                              // the platform's context gesture (right-click / two-finger tap); touch context rides onHold
  | "touchStart" | "touchMove" | "touchEnd" | "touchCancel"    // RAW multi-finger, for an app owning its own gestures
  | "wheel";                                   // the wheel stream over this view (trackpad pinch included)
export const POINTER_TYPES: readonly PointerType[] = ["pointerDown", "pointerUp", "click", "dblClick", "pointerMove", "pointerOver", "pointerOut", "hold", "contextMenu", "touchStart", "touchMove", "touchEnd", "touchCancel", "wheel"];

/** The raw-touch member of the family: declaring one of these is a view's
 *  statement that it owns multi-finger gestures in its subtree (the backend
 *  then stops the browser from claiming them — dom-backend setGestureOwner). */
export const TOUCH_TYPES: readonly PointerType[] = ["touchStart", "touchMove", "touchEnd", "touchCancel"];

/** A view's input route across the seam — one call per delivered event,
 *  with the point in the receiving view's own coordinates. Having a sink is
 *  also the surface's *hit-test presence* (see Surface.setInput): route and
 *  flag are deliberately one thing, so they cannot disagree. */
export type InputSink = (type: PointerType, x: number, y: number, extra?: Record<string, unknown>) => void;

/** What a view's DECLARED handlers tell the router — and the backend — about
 *  arbitrating its gestures (view.ts inputWants → input.ts HitTarget). Travels
 *  with the sink because it is the same fact: a sink exists because handlers do.
 *
 *  `wantsDrag`/`wantsTouch`/`wantsWheel` are also the backend's GESTURE CLAIMS
 *  (the language rule: declaring a handler claims from the browser exactly what
 *  that handler needs to fire, nothing more). The DOM backend realizes a claim
 *  as the element's `touch-action` (setInput); the canvas backend arbitrates
 *  per gesture at its shared element. A claim covers the declaring view's
 *  subtree and runs one way — measured on Chrome and iOS Safari (2026-07-27),
 *  a descendant cannot hand a claimed pinch back to the browser. */
export interface InputWants {
  wantsDbl: boolean;
  wantsHold: boolean;
  wantsTouch: boolean;
  /** Declares `onPointerMove` — claims the single-finger drag over this view
   *  (a finger that lands here drags instead of panning); pinch stays the
   *  user's. A mouse drag was never the browser's, so desktop is unchanged. */
  wantsDrag: boolean;
  /** The AXIS the drag claim covers (`claim = x | y | both`, D8 RULED
   *  2026-07-30 — claim-surface.md): `both` is today's whole-gesture claim;
   *  `x`/`y` scope it, leaving the CROSS axis to the enclosing regime (a
   *  column drag owns horizontal while the page keeps vertical pan).
   *  Meaningful only with wantsDrag. */
  claimAxis: "both" | "x" | "y";
  /** Declares `onContextMenu` — the platform's context gesture over this
   *  view (right-click, two-finger tap). The router suppresses the browser's
   *  own menu exactly where the handler is declared, nowhere else. */
  wantsContext: boolean;
  /** Declares `onWheel` — claims the wheel stream over this view, trackpad
   *  pinch included (it arrives as wheel deltas). ⌘+/− dispatches no event
   *  and stays out of everyone's reach. */
  wantsWheel: boolean;
}

/** A native editable text field over a surface's box (input.md, Layer 3). The
 *  backend owns the native element (`<input>`/`<textarea>`) — its creation,
 *  geometry sync, and DOM focus — and reports the user's edits and focus
 *  changes back through these callbacks; the TextInput component owns the model
 *  `text`. Both backends realize it as real DOM (the DOM surface hosts it
 *  in-box; the Canvas backend overlays it on the shared canvas at the surface's
 *  screen box) — native caret, selection, IME, and a11y for free (the ruled
 *  D-5 approach). */
export interface EditableSpec {
  value: string;
  multiline: boolean;
  /** Native spellcheck/red-squiggle underlines — off for a code field. */
  spellcheck: boolean;
  /** Soft-wrap long lines (true) vs. keep them on one line and scroll
   *  horizontally (false) — a code field wants no-wrap + h-scroll. */
  wrap: boolean;
  /** Inner text inset in px (all four sides) — a code field wants breathing
   *  room off the box edge. 0 = flush (the default). */
  padding: number;
  placeholder: string;
  style: TextStyle;
  /** The user typed — carry the native element's value to the model. */
  onInput: (value: string) => void;
  /** The native element gained / lost DOM focus (a click in, or focus moving
   *  away) — for syncing Declare focus with the platform. */
  onFocus: () => void;
  onBlur: () => void;
  /** Enter pressed on a single-line field (submit). */
  onEnter?: () => void;
}

/** One view's handle on the rendering substrate — the Declare "sprite".
 *
 *  Setters are fine-grained (one platform mutation each, not a batched
 *  setBounds) so that when reactivity arrives (R4) a constraint on a single
 *  attribute updates exactly that, in proportion to what changed.
 *
 *  R0 covers geometry + background + visibility; R3 adds the visual-leaf and
 *  drawing capabilities (clip, drawing, text, image). Each is one capability,
 *  substrate-neutral, and pay-per-use: a view that never draws, says nothing,
 *  and shows no image only ever exercises the R0 seven. */
export interface Surface {
  setX(v: number): void;
  setY(v: number): void;
  setWidth(v: number): void;
  setHeight(v: number): void;

  /** The box paint (styling rung): a solid Color (null = nothing) or a
   *  Gradient, plus the box's decoration — corner rounding (paint-only, the
   *  ruled lean), an INSIDE border, and a drop shadow cast by the border box
   *  (CSS semantics: never painted under the box). Each backend realizes
   *  them with its own paint primitives — the Canvas walk branches its box
   *  paint, the DOM brushes CSS properties (the ruled firewall precision:
   *  CSS as paint primitive, never as styling model) — pinned identical by
   *  the cross-backend suite. */
  setFill(fill: Fill): void;
  setCornerRadius(r: number): void;
  setStroke(stroke: Stroke | null): void;
  setShadow(shadow: Shadow | null): void;

  setVisible(visible: boolean): void;
  setOpacity(opacity: number): void;

  /** The pointer cursor shown while the pointer is over this surface (a CSS
   *  cursor keyword; "" = inherit). The DOM brushes style.cursor on the
   *  view's element; the canvas resolves it on the hover walk and brushes
   *  the host element. Applies to views that take input (a sink is the hit
   *  target on both backends). */
  setCursor(cursor: string): void;
  /** "none" = this element and its subtree are transparent to the pointer;
   *  "" / "auto" = normal. Overlay chrome (the Inspector) relies on it. */
  setPointerEvents(mode: string): void;

  /** Uniform scale about a pivot in the view's own coordinates (paint-only,
   *  never layout). scale 1 = identity; the DOM brushes a CSS transform, the
   *  Canvas walk applies ctx.scale about the pivot (and its inverse on the hit
   *  walk, so a scaled view stays clickable). */
  setScale(scale: number, pivotX: number, pivotY: number): void;

  /** Clip this surface's subtree to a shape (SVG path data, view-local
   *  coordinates); null = unclipped. Applied at composite time — moving or
   *  re-clipping never re-rasterizes content (rendering model rule 3). */
  setClip(pathData: string | null): void;

  /** The BOX-clip (`clip = true`): clip the subtree to this surface's OWN box
   *  (rounded by cornerRadius), tracking the box as it animates — no re-derive.
   *  Semantically CONTAINMENT, not just paint: on the DOM backend this is
   *  `overflow: clip`, so children positioned outside the box also contribute
   *  no scrollable overflow to the document and cannot be focus-scrolled into
   *  view — matching the canvas backend, whose frame physically cannot reveal
   *  or scroll to off-box content. (A shape clip, by contrast, is paint+hit
   *  only.) This is what lets an app park a panel beyond a clipped container
   *  — or declare `clip = true` on the App itself to pin every interaction
   *  in-window — without the browser growing a scroll extent. */
  setBoxClip(on: boolean): void;
  /** Mark this surface as exempt from its PARENT's box-clip (`ignoreClip`):
   *  outside the parent's clip it still paints AND still hits — frame chrome
   *  that straddles the frame (a window's resize halo, a badge poking out of a
   *  clipped card). Parent-scoped: an ancestor's clip above still applies.
   *  Optional — a host/mock backend without clipping may omit it. */
  setIgnoreClip?(on: boolean): void;

  /** Make this surface a scroll container (`on`) or a plain one. When on, it
   *  clips to its box and scrolls the vertical overflow; `onScroll` is called
   *  with the current offset whenever the user scrolls it (DOM: the native
   *  scroll event; canvas: the wheel/touch the compositor routes here), so the
   *  runtime can mirror it into the view's reactive `scrollY`. */
  setScroll?(on: boolean, onScroll: (y: number) => void): void;
  /** Windowing-aware AT (materialization.md §2, ruled): expose the LOGICAL
   *  extent and position of a windowed replication so assistive tech hears
   *  "row N of 100,000" without 100,000 nodes existing. `setRowCount` lands
   *  on the block's container surface (null clears when windowing
   *  disengages); `setRowIndex` on each materialized instance (1-based,
   *  null clears). DOM realizes them as aria-rowcount/aria-rowindex;
   *  backends without an AT story may omit them. */
  setRowCount?(n: number | null): void;
  setRowIndex?(i: number | null): void;
  /** Make this surface a HORIZONTAL scroll container (`on`): it clips its box and
   *  scrolls overflowing width, keeping over-wide content (a code block, a wide
   *  table) inside its box instead of spilling. Vertical overflow stays clipped.
   *  No reactive offset is mirrored (unlike `setScroll`) — it is presentation-only. */
  setScrollX?(on: boolean, onScroll?: (x: number) => void): void;
  /** Mark this surface as opted OUT of its nearest enclosing scroll regime
   *  (`ignoreScroll` — the third member of the opt-out family): it rides the
   *  scroll frame instead of the content, and contributes nothing to the
   *  scroll range. Realized per altitude: against the viewport when the page
   *  is the regime (top level), against the pane's frame inside a scrolling
   *  view. Optional — a host/mock backend may omit it. */
  setIgnoreScroll?(on: boolean): void;
  /** ROOT surface only: the App's CONTENT EXTENT (the bounding reach of its
   *  visible, non-ignoreScroll children), fed reactively by the App
   *  (view.ts bindPageScroll). The realization of the page scroll: the DOM
   *  root element sizes itself to max(frame, extent) along each declared
   *  scroll axis — the box itself is the scroll range, the document scrolls
   *  it natively, and `overflow: clip` keeps exact frame containment on
   *  every other axis with no per-axis overflow pairs (WebKit collapsed
   *  those — measured on iPad, 2026-07-29). The canvas compositor sizes its
   *  extent strut from the same numbers. The root's gesture default derives
   *  from the realized sizes against the viewport. Optional. */
  setPageExtent?(w: number, h: number): void;
  /** Render a rich-text FLOW into this surface as native content (RichText, the
   *  read-only sibling of setEditable): the DOM backend builds real flowing HTML
   *  — one element per block, inline runs in normal flow — so selection, copy,
   *  find, a11y, and baselines are the platform's, and returns the measured
   *  content height. A backend that can't (Canvas, today) returns -1, and the
   *  RichText component falls back to laying the runs out as child views itself.
   *  `selectable` mirrors the prevailing slot onto the native content; `width`
   *  is the flow width (px) the runs wrap within — passed explicitly so the
   *  measure never depends on the surface's box width having been flushed.
   *  `onResize` is called with the flowed height whenever it later changes —
   *  a web font finishing loading, or the content becoming visible after being
   *  attached inside a momentarily zero-sized ancestor (a page transition) —
   *  since the synchronous return can be 0 in exactly those cases; the RichText
   *  keeps its own height in step so the surrounding stack re-flows. `onLink` is
   *  called with a run's href when a link is activated — the DOM backend makes
   *  link runs real `<a href>` (native affordances) but routes a plain click here
   *  so the app's navigation policy, not the browser, decides. */
  setRichContent(blocks: RichBlock[], selectable: boolean, width: number, onResize: (height: number) => void, onLink: (href: string) => void): number;
  /** OPTIONAL width-only follow-up to `setRichContent`: adopt a new flow width
   *  without re-flowing content — for flows whose layout provably cannot change
   *  (an all-`pre` flow; its lines never rewrap) but whose host box still bounds
   *  the native horizontal scroller. A backend without it gets a full render. */
  setRichWidth?(width: number): void;
  /** Scroll this surface to the top of its nearest scrolling ancestor — the
   *  imperative companion to `setScroll`, behind `View.scrollIntoView()` (a click-to-
   *  jump index, "scroll this into view"). No-op when nothing above scrolls.
   *  DOM defers to the element's native scrollIntoView (it walks to the scroll
   *  ancestor and does the offset math); the Canvas backend walks to the scroll
   *  container itself, clamps to its content extent, and sets the offset.
   *  `align` "nearest" scrolls the MINIMUM distance that makes the surface
   *  visible — and not at all when it already is (the web's focus-reveal
   *  behavior; keyboard traversal uses it so Tab never lands offscreen). */
  scrollIntoView(align?: "start" | "nearest", smooth?: boolean): void;

  /** OPTIONAL — a windowed block's LOGICAL extent when this surface IS the
   *  scroller (rows as direct children of a scrolling Table/DataGrid): the
   *  scroll RANGE must span all N logical rows while only a window of them
   *  exists. DOM realizes it as a zero-width strut; null clears. Without it
   *  the range ends at the last materialized row — the scrollbar treadmill. */
  setVirtualExtent?(h: number | null): void;

  /** OPTIONAL — travel with a scroller: re-host this surface's element inside
   *  `host`'s scroll container so the PLATFORM carries it with the scrolled
   *  content (zero-lag chrome that belongs to content — the focus ring around
   *  a row in a pane; the inverse of setIgnoreScroll's sticky frame). null
   *  restores the natural parent. DOM realizes it by reparenting; a backend
   *  without it leaves callers on reactive root-space positioning. */
  travelWith?(host: Surface | null): void;
  /** Set this scrolling surface's own offset — the write half of the
   *  `scrollY`/`scrollX` attributes (setScroll's callback is the read half:
   *  user scrolling mirrors in; a program write pushes out through these).
   *  The schema never listed the pair as readOnly, so a program could always
   *  SAY `strip.scrollX = 200` — it just silently did nothing. Clamped by the
   *  backend to the contained content extent, exactly like a user scroll; a
   *  no-op on a surface that does not scroll that axis. Optional: a minimal
   *  host/mock omits them, so callers optional-call. */
  scrollToY?(v: number): void;
  scrollToX?(v: number): void;
  /** Reveal a heading anchor INSIDE a native rich-text flow (location.md §6). A
   *  flow coalesces its headings into one element/region, so revealing one is not
   *  a whole-surface `scrollIntoView`. `slug` names the heading; `within` is its
   *  y offset inside this flow (the Canvas renderer knows it; -1 when unknown, the
   *  DOM path, which finds the tagged element instead). DOM: the heading is a real
   *  element carrying `data-anchor` — native `scrollIntoView`. Canvas: clamp the
   *  scroll ancestor to the flow's top plus `within`. Returns whether it revealed
   *  (false ⇒ the anchor isn't in this flow's realized content yet). */
  revealRichAnchor(slug: string, within: number): boolean;
  /** Reflect an `embed` marker onto the surface so a HOST can find this view's
   *  element (data attribute on DOM) and mount foreign content (an editor, a
   *  preview iframe) inside it — the sanctioned seam for embedding non-Declare UI
   *  that must track the view as the page scrolls. No-op off the DOM. */
  setEmbed(id: string, view?: unknown): void;

  /** The view's recorded drawing (draw.ts); null clears it. The Canvas
   *  backend replays it during the composite walk; the DOM backend
   *  rasterizes it into this view's own <canvas>, sized by the recording's
   *  bounds. The same list renders identically either way (rule 5). */
  setDrawing(list: DisplayList | null): void;

  /** This view's text run ("" = none) and its style, separately: text is the
   *  hot reactive path (R4 constraints), style the cold one. Text is a
   *  first-class capability — NOT a recording — precisely so the DOM backend
   *  can use real DOM text (native selection/a11y/AA) while the Canvas
   *  backend uses fillText: same metrics and geometry (measure.ts), each
   *  substrate's own rasterizer. */
  setText(text: string): void;
  setTextStyle(style: TextStyle): void;

  /** The view's image — a loaded element (the Image view owns loading, so
   *  the model sees natural size and load timing) — and how it stretches
   *  into the view box. */
  /** The bitmap seam takes a VIDEO as readily as an image: a <video> places
   *  like an <img> on the DOM and `drawImage` accepts it unchanged on canvas,
   *  so a moving picture is the same content kind, not a second one. */
  setImage(image: Bitmap | null): void;
  setImageStretch(stretch: Stretch): void;

  /** Route pointer input to this surface (null stops it). A surface with a
   *  sink is *interactive*: it owns its geometry box for hit-testing, and
   *  the backend delivers events through the sink in view-local
   *  coordinates. One without a sink is transparent to input — the point
   *  falls through to whatever lies beneath — which is what lets a
   *  decorative child sit over an interactive parent without stealing its
   *  clicks. Pay-per-use: the runtime only calls this for views that
   *  declare pointer handlers, so a handler-free tree never pays for input
   *  beyond the walk that skips it. */
  setInput(sink: InputSink | null, wants?: InputWants): void;

  /** Make this surface a native editable text field (spec), or clear it (null).
   *  The backend creates/positions/styles the native element and wires its
   *  edit/focus callbacks; geometry follows the surface box. Layer 3. */
  setEditable(spec: EditableSpec | null): void;

  /** Give (true) or remove (false) DOM focus to the editable element, driven by
   *  the Declare focus service so keyboard focus and the platform caret agree.
   *  No-op if this surface is not editable. */
  activateEditable(active: boolean): void;

  /** Parent `child`'s surface beneath this one, before `before` (null = at
   *  the end), mirroring the view tree — child order is paint order, and
   *  since R8 the tree mutates (replication), so parenting is positional.
   *  Re-inserting a surface that is already a child MOVES it (a data
   *  reorder moves live subtrees; it never rebuilds them). */
  insertChild(child: Surface, before: Surface | null): void;

  /** Detach and release this surface. */
  destroy(): void;
}

/** Creates surfaces and roots the tree on the page. A new backend (Canvas,
 *  or off-web, a native kernel) is added by implementing this and Surface —
 *  View and Node do not change. */
export interface RenderBackend {
  /** Create an unparented surface for one view. */
  createSurface(): Surface;

  /** Root the tree's top surface into a host element on the page. (DOM:
   *  append the element. Canvas: host a <canvas> and start its render loop.) */
  attachRoot(host: HTMLElement, root: Surface): void;
}
