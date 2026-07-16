// The render seam — the single boundary between the view model and whatever
// draws it. This is neo's answer to LZX's view→"sprite" contract, kept but
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
 *  RichText component bakes the effective font/colour into each run so a backend
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
export type Stretch = "none" | "width" | "height" | "both";

/** The pointer events a view can answer at R5 (`onMouseDown` / `onMouseUp` /
 *  `onClick`). A click is not a platform event here — the shared router
 *  (input.ts) synthesizes it as "press and release resolved to the same
 *  view", so both backends decide it identically by construction. */
export type PointerType = "mouseDown" | "mouseUp" | "click" | "mouseMove" | "mouseOver" | "mouseOut";
export const POINTER_TYPES: readonly PointerType[] = ["mouseDown", "mouseUp", "click", "mouseMove", "mouseOver", "mouseOut"];

/** A view's input route across the seam — one call per delivered event,
 *  with the point in the receiving view's own coordinates. Having a sink is
 *  also the surface's *hit-test presence* (see Surface.setInput): route and
 *  flag are deliberately one thing, so they cannot disagree. */
export type InputSink = (type: PointerType, x: number, y: number) => void;

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
   *  away) — for syncing neo focus with the platform. */
  onFocus: () => void;
  onBlur: () => void;
  /** Enter pressed on a single-line field (submit). */
  onEnter?: () => void;
}

/** One view's handle on the rendering substrate — the neo "sprite".
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

  /** Make this surface a scroll container (`on`) or a plain one. When on, it
   *  clips to its box and scrolls the vertical overflow; `onScroll` is called
   *  with the current offset whenever the user scrolls it (DOM: the native
   *  scroll event; canvas: the wheel/touch the compositor routes here), so the
   *  runtime can mirror it into the view's reactive `scrollY`. */
  setScroll(on: boolean, onScroll: (y: number) => void): void;
  /** Make this surface a HORIZONTAL scroll container (`on`): it clips its box and
   *  scrolls overflowing width, keeping over-wide content (a code block, a wide
   *  table) inside its box instead of spilling. Vertical overflow stays clipped.
   *  No reactive offset is mirrored (unlike `setScroll`) — it is presentation-only. */
  setScrollX(on: boolean): void;
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
  /** Scroll this surface to the top of its nearest scrolling ancestor — the
   *  imperative companion to `setScroll`, behind `View.scrollIntoView()` (a click-to-
   *  jump index, "scroll this into view"). No-op when nothing above scrolls.
   *  DOM defers to the element's native scrollIntoView (it walks to the scroll
   *  ancestor and does the offset math); the Canvas backend walks to the scroll
   *  container itself, clamps to its content extent, and sets the offset. */
  scrollIntoView(): void;
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
   *  preview iframe) inside it — the sanctioned seam for embedding non-neo UI
   *  that must track the view as the page scrolls. No-op off the DOM. */
  setEmbed(id: string): void;

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
  setImage(image: HTMLImageElement | null): void;
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
  setInput(sink: InputSink | null): void;

  /** Make this surface a native editable text field (spec), or clear it (null).
   *  The backend creates/positions/styles the native element and wires its
   *  edit/focus callbacks; geometry follows the surface box. Layer 3. */
  setEditable(spec: EditableSpec | null): void;

  /** Give (true) or remove (false) DOM focus to the editable element, driven by
   *  the neo focus service so keyboard focus and the platform caret agree.
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
