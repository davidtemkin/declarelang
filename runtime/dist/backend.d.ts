import type { Fill, Shadow, Stroke } from "./value.js";
import type { TextStyle } from "./measure.js";
import type { DisplayList } from "./draw.js";
/** How an Image scales its bitmap into the view box — the language's
 *  `value Stretch = none | width | height | both` (§6). */
export type Stretch = "none" | "width" | "height" | "both";
/** The pointer events a view can answer at R5 (`onMouseDown` / `onMouseUp` /
 *  `onClick`). A click is not a platform event here — the shared router
 *  (input.ts) synthesizes it as "press and release resolved to the same
 *  view", so both backends decide it identically by construction. */
export type PointerType = "mouseDown" | "mouseUp" | "click" | "mouseMove";
export declare const POINTER_TYPES: readonly PointerType[];
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
    /** Clip this surface's subtree to a shape (SVG path data, view-local
     *  coordinates); null = unclipped. Applied at composite time — moving or
     *  re-clipping never re-rasterizes content (rendering model rule 3). */
    setClip(pathData: string | null): void;
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
