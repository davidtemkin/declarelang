// Input routing — the substrate-neutral half of R5's event slice. A backend
// supplies only RESOLUTION (a platform pointer event → the view-owned sink under
// its point, with view-local coordinates): the DOM backend resolves through
// native event targets, the Canvas backend through its own hit walk.
// Everything above resolution — the press/release pairing, the click rule,
// delivery order (mouseDown · mouseUp · click) — lives here, once, so the two
// backends cannot drift: a *click* IS "press and release resolved to the same
// view", decided by identical code on both. (The platform's own `click` event
// is deliberately unused: its target is the common ancestor of press and
// release, a DOM-ism the canvas backend could only imitate approximately.)
//
// The source events are POINTER events (`pointerdown`/`move`/`up`/`cancel`), not
// mouse events: pointer events fire uniformly for touch, pen, and mouse, so one
// path drives desktop and mobile — a tap is a real pointerdown+pointerup (mobile
// browsers only *synthesize* mouse events unreliably, which left taps dropping on
// touch). The sink protocol keeps its mouse-era names (`"mouseDown"`, `"click"`,
// …) so the language's `onMouseDown`/`onClick` handlers are unchanged; only the
// wire is pointer. `pointercancel` (the browser reclaimed the gesture for a
// scroll) ends a capture without a click.
//
// Listeners live on `window`, not on the backend's own element, so a press or
// release *outside* the tree still updates the pairing state — a down on the
// background must not leave a stale press for a later release to pair with.
// They self-retire: once `alive` goes false (the root was destroyed), the
// next event removes them — the same guard discipline as onDprChange.
//
// The LZX kernels split this per platform (LzMouseKernel × 4 backends, with
// per-sprite clickable state and a global event broker); read for intent —
// deliver input to the view the user sees under the pointer — and rewritten
// as one shared rule over one resolution seam.

import type { InputSink } from "./backend.js";

/** A resolved input point: the sink of the view under it, that view's
 *  identity (`key`, for the click pairing — any stable per-view object),
 *  and the point in the view's local space. */
export interface HitTarget {
  key: object;
  sink: InputSink;
  x: number;
  y: number;
}

/** Start routing window pointer input through `resolve`. `alive` gates the
 *  whole route (false = the tree is gone; the listeners remove themselves
 *  on the next event). */
export function routeInput(
  alive: () => boolean,
  resolve: (e: MouseEvent) => HitTarget | null,
  rootPoint?: (e: MouseEvent) => { x: number; y: number },
): void {
  // The pressed view captures the pointer: while held, `mouseMove` (and the
  // eventual release) go to IT, not to whatever is under the pointer — the
  // capture a drag needs. (For touch the browser already implicitly captures the
  // pointer to the pressed element; window listeners cover mouse.) Move
  // coordinates are in ROOT space (app-relative), so a handler can hit-test the
  // whole tree; down/up stay view-local.
  let held: HitTarget | null = null;
  // Hover: the sink the pointer was last OVER, so a move that crosses into a
  // different sink (or off all of them) fires mouseOut on the old + mouseOver on
  // the new — the rollover pair, resolved by the same seam as click.
  let hoveredKey: object | null = null;
  let hoveredSink: InputSink | null = null;
  const clearHover = (): void => {
    if (hoveredSink !== null) hoveredSink("mouseOut", 0, 0);
    hoveredKey = null;
    hoveredSink = null;
  };
  const listen = (
    type: "pointerdown" | "pointerup" | "pointermove" | "pointercancel",
    handle: (e: PointerEvent) => void,
  ): void => {
    const listener = (e: Event): void => {
      if (!alive()) {
        window.removeEventListener(type, listener);
        return;
      }
      handle(e as PointerEvent);
    };
    window.addEventListener(type, listener);
  };
  listen("pointerdown", (e) => {
    const t = resolve(e);
    held = t;
    if (t !== null) t.sink("mouseDown", t.x, t.y);
  });
  // While a press is CAPTURED and moving (a drag), suppress the browser's
  // text selection — a window drag crossing a selectable region (a Markdown
  // viewer) otherwise starts painting a selection mid-drag. Restored on
  // release/cancel; a plain click never trips it.
  let selectionSuppressed = false;
  const suppressSelection = (on: boolean): void => {
    if (typeof document === "undefined" || on === selectionSuppressed) return;
    selectionSuppressed = on;
    document.body.style.userSelect = on ? "none" : "";
    (document.body.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = on ? "none" : "";
    if (on) document.getSelection()?.removeAllRanges();
  };
  listen("pointermove", (e) => {
    // Hover tracking runs on every move (not just while dragging): resolve the
    // sink under the pointer and, when it changes, fire the out/over pair.
    const t = resolve(e);
    const key = t !== null ? t.key : null;
    if (key !== hoveredKey) {
      if (hoveredSink !== null) hoveredSink("mouseOut", 0, 0);
      hoveredKey = key;
      hoveredSink = t !== null ? t.sink : null;
      if (t !== null) t.sink("mouseOver", t.x, t.y);
    }
    if (held === null || rootPoint === undefined) return;
    suppressSelection(true);
    const p = rootPoint(e);
    held.sink("mouseMove", p.x, p.y);
  });
  listen("pointerup", (e) => {
    suppressSelection(false);
    const t = resolve(e);
    const captor = held;
    held = null;
    if (captor !== null) {
      // The presser captured the pointer, so the release goes to IT (root-space
      // coords) — a drag drops on its owner even released over another view.
      const p = rootPoint !== undefined ? rootPoint(e) : { x: captor.x, y: captor.y };
      captor.sink("mouseUp", p.x, p.y);
      // Click rule: press and release resolved to the same view (an excursion
      // in between is fine; releasing elsewhere clicks nothing).
      if (t !== null && t.key === captor.key) captor.sink("click", t.x, t.y);
    } else if (t !== null) {
      t.sink("mouseUp", t.x, t.y);
    }
    // A touch pointer ceases to exist on release; drop the hover it carried so a
    // just-tapped view doesn't stay stuck in its rollover (hover) state.
    if (e.pointerType === "touch") clearHover();
  });
  listen("pointercancel", (e) => {
    suppressSelection(false);
    // The browser reclaimed the gesture (a touch turned into a scroll). End the
    // capture WITHOUT a click — the interaction was interrupted, not completed —
    // so a drag handler still gets its release (e.g. a slider freezes its value).
    const captor = held;
    held = null;
    if (captor !== null) {
      const p = rootPoint !== undefined ? rootPoint(e) : { x: captor.x, y: captor.y };
      captor.sink("mouseUp", p.x, p.y);
    }
    if (e.pointerType === "touch") clearHover();
  });
}
