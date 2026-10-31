// Input routing — the substrate-neutral half of R5's event slice. A backend
// supplies only RESOLUTION (a platform pointer event → the view-owned sink under
// its point, with view-local coordinates): the DOM backend resolves through
// native event targets, the Canvas backend through its own hit walk.
// Everything above resolution — the press/release pairing, the click rule,
// delivery order (pointerDown · pointerUp · click) — lives here, once, so the two
// backends cannot drift: a *click* IS "press and release resolved to the same
// view, without the pointer wandering", decided by identical code on both. (The
// platform's own `click` event is deliberately unused: its target is the common
// ancestor of press and release, a DOM-ism the canvas backend could only
// imitate approximately.)
//
// TWO LAYERS, one wire. The RAW layer (pointerDown/pointerMove/pointerUp, and the
// touch family) reports what the pointer physically did, immediately — the
// layer a drag, a slider, or an app running its own gesture physics needs. The
// RESOLVED layer (click, dblClick, hold) reports what the user MEANT, which the
// router decides by watching the whole gesture. Apps activate on the resolved
// layer and manipulate on the raw one; the guide's input chapter is the long
// version.
//
// The source events are POINTER events (`pointerdown`/`move`/`up`/`cancel`), not
// mouse events: pointer events fire uniformly for touch, pen, and mouse, so one
// path drives desktop and mobile — a tap is a real pointerdown+pointerup (mobile
// browsers only *synthesize* mouse events unreliably, which left taps dropping on
// touch). The sink protocol keeps its mouse-era names (`"pointerDown"`, `"click"`,
// …) so the language's `onPointerDown`/`onClick` handlers are unchanged; only the
// wire is pointer. `pointercancel` (the browser reclaimed the gesture for a
// scroll) ends a capture without a click, and says so: the release carries
// `canceled: true`, so a drag handler can distinguish "dropped here" from
// "interrupted" instead of committing a drop the user never made.
//
// SLOP is why a click means activation rather than "some press and some release
// landed on you". A gesture whose pointer wandered past the threshold is a drag
// or a swipe, whatever it started on, and clicks nothing. The thresholds differ
// by pointer kind for a reason that is not arbitrary: with a mouse, movement
// inside a target is meaningless (the user is still pointing at it — AppKit's
// track-inside rule), while a finger's movement is the entire vocabulary of
// scrolling and swiping (native scroll views cancel a tap the same way). Relying on the
// browser to tell us instead — `pointercancel` — cannot work, because it only
// arrives when the movement matches a direction something can scroll.
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
import { dragScrolling } from "./drag-autoscroll.js";
import { noteModifiers } from "./modifiers.js";

// ── The HOLD-GATED drag claim (ruled 2026-07-29) ─────────────────────────────
// A view declaring `onHold` ALONGSIDE its raw drag handlers claims the finger
// AT THE HOLD, not at touchdown — the least-claim rule read precisely: the
// drag needs nothing until the hold fires (a hold requires a stationary
// finger, which never competes with panning). A quick swipe scrolls, exactly
// as the user expects, and reaches the app as `e.canceled`; a finger that
// presses and waits picks the thing up, and every move after the hold is the
// app's. Delivery never changes — pre-hold there is either nothing to deliver
// (the finger is still) or the browser took the gesture (the cancel path).
// This flag is the claim's LIVE half: it goes up when a hold fires on such a
// view with a touch finger down, and the backends' non-passive touchmove
// listeners suppress the browser's pan takeover exactly while it is up (the
// finger was stationary through the hold, so no pan is latched to un-take).
let holdCapture = false;
/** Is a hold-gated drag capture live right now? (Backends consult this in
 *  their non-passive touchmove listeners.) */
export const holdCaptureActive = (): boolean => holdCapture;

// A finger the program's drag has whole — claimed on both axes at touchdown
// (the browser was told at once it may not pan there), or handed to such a
// drag — cannot be scrolling anything for the user; with a hold-gated claim,
// that is true from the hold (holdCapture). Whatever moves a scroller under it
// is the program's: the backend's scroll watcher does not take it for the
// user's scroll, and the takeover detector does not take it for the browser's.
let dragFinger = false;
/** Is a finger held whole by the program's drag right now? */
export const fingerHeldByDrag = (): boolean => dragFinger || holdCapture;

/** Movement past which a gesture is no longer an activation, by pointer kind.
 *  Touch is looser: a fingertip is wide, jitters on contact, and its motion is
 *  how a user scrolls. (The calendar hand-rolled exactly the mouse figure for
 *  its drag threshold before the runtime owned this rule.) */
const SLOP_MOUSE = 4;
const SLOP_TOUCH = 10;
/** A second click within this window on the same view is a double-click. */
const DBL_MS = 400;
/** A press held this long, in place, is a hold (the tap-hold / click-hold). */
const HOLD_MS = 500;

/** A resolved input point: the sink of the view under it, that view's
 *  identity (`key`, for the click pairing — any stable per-view object),
 *  and the point in the view's local space. */
export interface HitTarget {
  key: object;
  sink: InputSink;
  x: number;
  y: number;
  /** The view's `cursor` attribute, when set — the canvas backend resolves it
   *  on the hover walk (its host is one element; the DOM brushes per-element
   *  style.cursor instead and leaves this unset). */
  cursor?: string;
  /** True when this view declares `onDblClick` — the second click of a pair
   *  then reaches it as `dblClick` alone, not as a second `click` too. The
   *  first click is delivered at once, as the platforms do: the view's single
   *  click is something its double builds on. (Resolution knows this because a
   *  sink's existence and its declared handlers are the same fact — view.ts
   *  inputSink.) */
  wantsDbl?: boolean;
  /** True when this view declares `onHold`. */
  wantsHold?: boolean;
  /** True when this view (or an ancestor) declares the raw touch family — the
   *  gesture belongs to the app, so the router delivers the whole multi-finger
   *  stream and never interprets it. */
  wantsTouch?: boolean;
  /** True when this view declares `onPointerMove` — its claim on the
   *  single-finger drag (realized by the backend, not the router). */
  wantsDrag?: boolean;
  /** True when this view declares `onWheel` — its claim on the wheel stream
   *  (delivered by the backend directly; wheels never enter this router). */
  wantsWheel?: boolean;
  /** True when this view declares `onContextMenu` — the platform context
   *  gesture is delivered and the browser's own menu suppressed, exactly
   *  there (D8's ContextMenu brief). */
  wantsContext?: boolean;
  /** The nearest PINCH OWNER over this point — the closest view (self
   *  included) up the hit chain declaring the onPinch family — resolved by
   *  the backend because the claim covers a SUBTREE: two fingers may land on
   *  different interactive children of one pinching view, and the gesture
   *  belongs to the ancestor that declared it. Absent = nothing over this
   *  point pinches. */
  pinch?: { key: object; sink: InputSink };
  /** The nearest HOLD OWNER over this point — the closest view (self
   *  included) up the hit chain declaring `onHold`. Each gesture goes to the
   *  nearest view that wants it, as pinch does: a child that takes the click
   *  does not take the long-press, so a hold anywhere on a message bubble —
   *  its photo, its label — reaches the bubble. Absent = nothing holds here. */
  hold?: { key: object; sink: InputSink };
  /** The nearest CONTEXT-MENU OWNER (onContextMenu), resolved the same way. */
  context?: { key: object; sink: InputSink };
  /** The nearest DRAG OWNER (onPointerMove), resolved the same way, with the
   *  axis it claims and whether it claims from a hold (it declares onHold too).
   *  A press that stays put is the pressed view's; once it travels it is this
   *  owner's, when the owner is not the pressed view itself (DRAG HANDOFF). */
  drag?: { key: object; sink: InputSink; axis: "both" | "x" | "y"; fromHold: boolean };
}

/** One finger, as the raw touch family reports it. `id` is stable for the
 *  life of that finger's contact, so an engine can track it across events. */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

/** Start routing window pointer input through `resolve`. `alive` gates the
 *  whole route (false = the tree is gone; the listeners remove themselves
 *  on the next event). */
/** The open overlays' say over a press in the top-level program (outside.ts):
 *  true = swallow it. Installed by the runtime. It hears the press where the
 *  browser reports it — the window point, the frame the walk reads, as hover
 *  does — and the root point beside it, for a step into a hosted program. No
 *  scroll offset converts one into the other: the browser's own pair is exact
 *  at the moment of the press, where an offset may lag the page. */
type OutsideHook = (x: number, y: number, rootX: number, rootY: number) => boolean;
let OUTSIDE_PRESS: OutsideHook | null = null;
let OUTSIDE_SCROLL: OutsideHook | null = null;
export function setOutsidePressHook(fn: OutsideHook | null, scroll: OutsideHook | null = null): void {
  OUTSIDE_PRESS = fn;
  OUTSIDE_SCROLL = scroll;
}

/** What a context menu asked for from the keyboard (Shift+F10, the Menu key) is
 *  for: the focused view, or the item it names as the one the keys are on. The
 *  focus service provides it; without one, the keys open nothing of ours. */
let KEY_CONTEXT: (() => { $surface?: unknown } | null) | null = null;
export function provideKeyContextTarget(fn: () => { $surface?: unknown } | null): void { KEY_CONTEXT = fn; }

export function routeInput(
  alive: () => boolean,
  resolve: (e: MouseEvent) => HitTarget | null,
  rootPoint?: (e: MouseEvent) => { x: number; y: number },
  onHover?: (t: HitTarget | null) => void,
  // the top-level program's router — the one that answers the open overlays
  // (an embedded program's own router leaves it to the page's)
  topLevel = true,
): void {
  // The pressed view captures the pointer: while held, `pointerMove` (and the
  // eventual release) go to IT, not to whatever is under the pointer — the
  // capture a drag needs. (For touch the browser already implicitly captures the
  // pointer to the pressed element; window listeners cover mouse.) Move
  // coordinates are in ROOT space (app-relative), so a handler can hit-test the
  // whole tree; down/up stay view-local.
  let held: HitTarget | null = null;
  // EVERY sink call hands the ROOT point: the view builds its local x/y from
  // it (view.ts pointerPayload), so both frames come from one conversion.
  const rootOf = (e: MouseEvent): { x: number; y: number } => rootPoint !== undefined ? rootPoint(e) : { x: e.clientX, y: e.clientY };
  // …and a pointer event's movement since the press, in root space.
  const moved = (x: number, y: number): { deltaX: number; deltaY: number } => ({ deltaX: x - pressX, deltaY: y - pressY });
  // Where and how the current press began — the origin the slop test measures
  // from, and the pointer kind that picks the threshold.
  let pressX = 0;
  let pressY = 0;
  let pressSlop = SLOP_MOUSE;
  let wandered = false;
  /** Whether this press's drag handoff has been decided (DRAG HANDOFF, below):
   *  it is decided once, the first time the press travels. */
  let dragDecided = false;
  /** A hold fired on an ancestor of the pressed view (HitTarget.hold): the
   *  release is not also that view's click. */
  let heldAbove = false;
  /** The press came from a mouse's secondary button: not a click (the web's
   *  rule — a right-click is the context gesture, and fires no click). */
  let pressAux = false;
  // Double-click pairing (platform-level, both backends): a second click on
  // the SAME view within the interval — and, on touch, within slop of the first
  // tap — also fires dblClick; the third starts a fresh cycle (the classic
  // desktop rule — triple is double + single, not two doubles).
  let lastClickKey: object | null = null;
  let lastClickAt = 0;
  let lastClickX = 0;
  let lastClickY = 0;
  // The hold timer for the current press — armed at down on a view that wants
  // holds, disarmed by movement past slop, by release, or by cancellation.
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const disarmHold = (): void => {
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
  };
  // The current press began over selectable/editable content (set at
  // pointerdown): selection suppression stands down for this gesture.
  let pressOnSelectable = false;
  // Hover: the sink the pointer was last OVER, so a move that crosses into a
  // different sink (or off all of them) fires pointerOut on the old + pointerOver on
  // the new — the rollover pair, resolved by the same seam as click.
  let hoveredKey: object | null = null;
  let hoveredSink: InputSink | null = null;
  let hoveredCursor: string | undefined = undefined;
  // Live fingers, by pointerId — the raw touch family's payload. Only
  // maintained while some view under the gesture wants raw touch.
  const fingers = new Map<number, TouchPoint>();
  const touchList = (): TouchPoint[] => [...fingers.values()];
  /** The view hearing the touch family this session — set at the first
   *  touchStart, cleared when the last finger lifts. Deliberately SEPARATE from
   *  `held` (the pointer capture): a multi-finger release arrives as one
   *  pointerup per finger, and only the FIRST still holds the capture — `held`
   *  is nulled by it — so touch bookkeeping keyed on the captor leaked every
   *  simultaneously-released finger. touchList() then carried a phantom, and the
   *  next one-finger tap read as two: every pinch poisoned the next tap until
   *  reload. */
  let touchSink: HitTarget | null = null;
  // The live PINCH (compositing.md §II.2): fingers over pinch-declaring
  // subtrees, tracked by pointerId with the OWNER each landed in. The
  // gesture starts when two fingers share an owner, delivers cumulative
  // scale (distance now / distance at start) and the root-space center, and
  // ends when either finger lifts. Separate from `fingers` (the raw touch
  // family's payload) for the same reason touchSink is separate from held:
  // the two facts have different lifetimes and different owners.
  const pinchPts = new Map<number, { x: number; y: number; owner: { key: object; sink: InputSink } }>();
  let pinchGesture: { owner: { key: object; sink: InputSink }; a: number; b: number; startDist: number; scale: number } | null = null;
  // A press a pinch has taken: from the pinch's start until every finger has
  // lifted, its fingers' moves are the pinch's — no pointerMove — so a drag
  // handler on the same view never writes what the pinch is writing, and the
  // finger left after the pinch does not jump the drag from where it began
  let pinchedPress = false;
  const endPinch = (): void => {
    const g = pinchGesture;
    if (g === null) return;
    pinchGesture = null;
    const fa = pinchPts.get(g.a);
    const fb = pinchPts.get(g.b);
    const cx = fa !== undefined && fb !== undefined ? (fa.x + fb.x) / 2 : (fa ?? fb)?.x ?? 0;
    const cy = fa !== undefined && fb !== undefined ? (fa.y + fb.y) / 2 : (fa ?? fb)?.y ?? 0;
    g.owner.sink("pinchEnd", cx, cy, { scale: g.scale, center: { x: cx, y: cy } });
  };
  // The live press's identity beyond `held`: its pointerId, whether it is a
  // finger (pen included — both pan), the DOM element it landed on, and its
  // last root-space point. These exist for the scroll-takeover detector below:
  // iOS Safari (measured 2026-08-06, iOS 18.2 sim) takes an interior pane's
  // pan mid-gesture with NO pointercancel and NO touchcancel — the pan just
  // starts, and the finger later lifts with a CLEAN pointerup. Chrome says
  // pointercancel, and the `e.canceled` contract rode on it; on iOS the
  // takeover fact must be read from the scroll itself.
  let pressId: number | null = null;
  let pressFinger = false;
  let pressEl: Element | null = null;
  // the last finger lift: where, when, and on what it pressed (trailing, below)
  let lastTap: { x: number; y: number; at: number; el: Element | null } | null = null;
  let lastX = 0;
  let lastY = 0;
  // A pointerId whose release was already synthesized (scroll takeover): the
  // browser's trailing clean pointerup must not deliver a second release.
  let swallowUp: number | null = null;
  const clearHover = (): void => {
    if (hoveredSink !== null) hoveredSink("pointerOut", 0, 0);
    hoveredKey = null;
    hoveredSink = null;
  };
  // ── DRAG HANDOFF ─────────────────────────────────────────────────────────
  // A drag is claimed by declaring onPointerMove, and the claim covers the
  // declaring view's subtree — so a press that lands on a control inside it (a
  // Button on a Carousel's page) and then travels is the claimant's drag, as
  // hold and pinch already go to their nearest owner. A press that stays put is
  // the control's. When the press travels, the control's press ends canceled,
  // as it does when the browser takes a finger for a scroll, and the owner's
  // drag begins where the press landed: its pointerDown at that point, its moves
  // measured from it. One owner per gesture, chosen once; nothing propagates.
  // When it travels: a finger or a pen, past the slop (as a scroll takes it);
  // a mouse, when it leaves the control (a mouse inside a control is still
  // pointing at it). Not when the pressed view claims a drag itself (a Slider,
  // a Switch's thumb: its own nearest owner), not across the owner's axis, not
  // when a mouse press began on text or a field (that drag selects), and, for
  // an owner that claims from a hold, at the hold rather than here — for a finger
  // or a pen only: the hold is there so a swipe still scrolls, and a mouse drag
  // never competes with scrolling, so a mouse leaving the control hands off at once.
  const handOff = (from: HitTarget, to: NonNullable<HitTarget["drag"]>): void => {
    dragDecided = true;
    disarmHold();
    from.sink("pointerUp", lastX, lastY, { canceled: true, ...moved(lastX, lastY) });
    held = { key: to.key, sink: to.sink, wantsDrag: true, x: 0, y: 0 };
    if (pressFinger && to.axis === "both" && !to.fromHold) dragFinger = true;
    to.sink("pointerDown", pressX, pressY, { deltaX: 0, deltaY: 0 });
  };
  const travelled = (under: HitTarget | null, x: number, y: number): void => {
    const h = held;
    const to = h?.drag;
    if (h === null || to === undefined || to.key === h.key || h.wantsDrag === true) { dragDecided = true; return; }
    if (to.fromHold && pressFinger) return;   // a finger's is decided at the hold
    if (pressFinger ? !wandered : under !== null && under.key === h.key) return;
    dragDecided = true;
    if (!pressFinger && pressOnSelectable) return;
    const dx = Math.abs(x - pressX), dy = Math.abs(y - pressY);
    if ((to.axis === "x" && dx <= dy) || (to.axis === "y" && dy <= dx)) return;
    handOff(h, to);
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
      noteModifiers(e as PointerEvent);
      handle(e as PointerEvent);
    };
    window.addEventListener(type, listener);
  };
  // The platform's CONTEXT gesture (right-click / two-finger tap): resolved
  // through the same seam as every press; delivered — and the browser's own
  // menu suppressed — exactly where an onContextMenu handler is declared.
  // Touch context rides onHold instead (the hold gate), so nothing here
  // touches the touch stream.
  {
    const deliverAt = (e: Event, at: MouseEvent): boolean => {
      const t = resolve(at);
      const owner = t === null ? undefined : t.context ?? (t.wantsContext === true ? t : undefined);
      if (owner === undefined) return false;
      e.preventDefault();
      const cp = rootOf(at);
      owner.sink("contextMenu", cp.x, cp.y);
      return true;
    };
    // the context menu asked for from the keyboard (Shift+F10, the Menu key) opens
    // where the keys are — the focused view, or the item it names — as a press
    // there would: the nearest owner of that point takes it. The browser may send
    // its own contextmenu for the same key after; that one is not delivered twice.
    let keyTook = -1;
    const keyListener = (e: KeyboardEvent): void => {
      if (!alive()) { window.removeEventListener("keydown", keyListener, true); return; }
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      const el = (KEY_CONTEXT?.()?.$surface as { element?: Element } | null | undefined)?.element;
      if (el === undefined) return;
      // the point a press would land on: inside the target, near its start — and
      // the event a press there makes, so it takes the right-click's own route
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 24), y = r.top + r.height / 2;
      const under = el.ownerDocument.elementFromPoint(x, y) ?? el;
      const ctx = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 });
      under.dispatchEvent(ctx);
      if (ctx.defaultPrevented) { e.preventDefault(); keyTook = performance.now(); }
    };
    window.addEventListener("keydown", keyListener, true);
    const ctxListener = (e: Event): void => {
      if (!alive()) { window.removeEventListener("contextmenu", ctxListener); return; }
      // the browser's own menu for a key already answered
      if (e.isTrusted && performance.now() - keyTook < 500) { keyTook = -1; e.preventDefault(); return; }
      deliverAt(e, e as MouseEvent);
    };
    window.addEventListener("contextmenu", ctxListener);
  }
  // a scroll aimed past an open overlay: `scrollBelow = block` swallows it
  // (wheel and touch alike); listened in the capture phase, ahead of every
  // scroller, and not passive, so the browser's own scroll can be refused
  if (topLevel && typeof window !== "undefined") {
    const refuse = (e: Event, x: number, y: number): void => {
      if (OUTSIDE_SCROLL === null) return;
      const p = rootPoint !== undefined ? rootPoint({ clientX: x, clientY: y } as MouseEvent) : { x, y };
      if (OUTSIDE_SCROLL(x, y, p.x, p.y)) { e.preventDefault(); e.stopPropagation(); }   // the canvas scrolls in its own handler
    };
    const onWheel = (e: Event): void => {
      if (!alive()) { window.removeEventListener("wheel", onWheel, true); return; }
      const w = e as WheelEvent;
      noteModifiers(w);
      refuse(e, w.clientX, w.clientY);
    };
    const onTouchMove = (e: Event): void => {
      if (!alive()) { window.removeEventListener("touchmove", onTouchMove, true); return; }
      // a live pinch is the declaring view's whole two-finger gesture: its
      // touch-action already retires the browser's zoom, and this refuses the
      // two-finger pan that would otherwise move the page under the pinch
      if (pinchGesture !== null && e.cancelable) { e.preventDefault(); return; }
      const t = (e as TouchEvent).touches[0];
      if (t !== undefined) refuse(e, t.clientX, t.clientY);
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    // A TAP'S TRAILING MOUSE EVENTS. After a finger lifts, the browser sends the
    // mouse events a tap stands for (mousedown, mouseup, click) at the same
    // point. When the tap changed what is there — Continue opens the next
    // screen — they land on the new view: a text field there takes the focus
    // and a phone raises its keyboard, though no one touched it. They are this
    // gesture's, and the gesture is over, so each one that lands on something
    // other than what the finger pressed is swallowed. (A touch press cannot be
    // canceled up front: that stops the page panning — see pointerdown.)
    const trailing = (e: Event): void => {
      if (!alive()) { for (const k of ["mousedown", "mouseup", "click"]) window.removeEventListener(k, trailing, true); return; }
      const tap = lastTap;
      if (tap === null || !e.isTrusted) return;
      const m = e as MouseEvent;
      if (performance.now() - tap.at > 800 || Math.hypot(m.clientX - tap.x, m.clientY - tap.y) > 24) { lastTap = null; return; }
      const el = e.target instanceof Node ? e.target : null;
      const same = el !== null && tap.el !== null && (tap.el === el || tap.el.contains(el) || el.contains(tap.el));
      if (same) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "click") lastTap = null;
    };
    for (const k of ["mousedown", "mouseup", "click"]) window.addEventListener(k, trailing, true);
  }
  listen("pointerdown", (e) => {
    // a press aimed past an open overlay: its policy first (planes.md §8.1)
    if (topLevel && OUTSIDE_PRESS !== null) {
      const op = rootPoint !== undefined ? rootPoint(e) : { x: e.clientX, y: e.clientY };
      if (OUTSIDE_PRESS(e.clientX, e.clientY, op.x, op.y)) {
        held = null;
        swallowUp = e.pointerId;
        e.preventDefault();
        // the native click that would follow (a link beneath) is not this gesture's
        const stop = (ev: Event): void => { ev.preventDefault(); ev.stopPropagation(); window.removeEventListener("click", stop, true); };
        window.addEventListener("click", stop, true);
        setTimeout(() => window.removeEventListener("click", stop, true), 1000);
        return;
      }
    }
    const t = resolve(e);
    held = t;
    wandered = false;
    dragDecided = false;
    pressAux = e.pointerType === "mouse" && typeof e.button === "number" && e.button !== 0;
    pressSlop = e.pointerType === "touch" ? SLOP_TOUCH : SLOP_MOUSE;
    const p0 = rootPoint !== undefined ? rootPoint(e) : { x: e.clientX, y: e.clientY };
    pressX = p0.x;
    pressY = p0.y;
    pressId = e.pointerId;
    pressFinger = e.pointerType !== "mouse";
    {
      const own = t !== null && t.drag !== undefined && t.drag.key === t.key ? t.drag : undefined;
      dragFinger = pressFinger && t !== null && t.wantsDrag === true && (own?.axis ?? "both") === "both" && !(own?.fromHold ?? t.wantsHold === true);
    }
    pressEl = typeof Element !== "undefined" && e.target instanceof Element ? e.target : null;
    lastX = p0.x;
    lastY = p0.y;
    swallowUp = null;
    if (t !== null) {
      // The browser ANCHORS its native text selection at mousedown; flipping
      // user-select off on the first captured move (below) is too late in
      // Safari, which keeps painting the already-anchored selection through a
      // window drag — selecting text in whatever selectable region sits under
      // the drag path. A press that lands on a sink over NON-selectable,
      // non-editable content cancels the default here, so no anchor is ever
      // planted. Selectable regions (user-select: text) and native editables
      // keep their defaults — click-to-select and click-to-focus still work.
      // MOUSE/PEN ONLY: a touch press must never be canceled here — Chrome
      // cancels the whole touch sequence's defaults on a canceled pointerdown
      // (a swipe starting on any interactive view could then never pan the
      // page, and touchmove stops dispatching entirely), while Safari ignores
      // it — so touch gesture ownership stays where the model puts it: the
      // claims (touch-action), never a blanket cancel. Selection anchoring is
      // a mouse-drag fact anyway; touch selection rides long-press, untouched.
      const el = typeof Element !== "undefined" && e.target instanceof Element ? e.target : null;
      const editable =
        typeof HTMLElement !== "undefined" &&
        el instanceof HTMLElement &&
        (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      // Selectable content carries the realization's stamp (dom-backend:
      // `data-declare-selectable` on exactly the leaves whose effective
      // `selectable` is true) — the press landed on selectable text iff the
      // target sits under one. (AMENDED 2026-08-06, selection edges: stamped
      // leaves now ALSO wear explicit `user-select: text` over the page's
      // inherited <html> `none` baseline; the stamp stays the fact this
      // check reads.) The computed check that remains is the veto: a drag
      // view's element-level `none` (setInput) inherits over stamped content
      // beneath it, and the claim wins there by design.
      const cs = el !== null && typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      const selectable =
        el !== null &&
        typeof el.closest === "function" &&
        el.closest("[data-declare-selectable]") !== null &&
        (cs === null || (cs.userSelect ?? (cs as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect) !== "none");
      if (el !== null && !editable && !selectable && e.pointerType !== "touch") e.preventDefault();
      // A press that BEGINS on selectable/editable content is (potentially) a
      // text-selection gesture: the captured-move suppression below must stand
      // down for this gesture, or dragging across a Markdown body clears the
      // selection the browser is painting (an enclosing sink — a window's
      // activate-on-press — still captures, so events flow as ever).
      pressOnSelectable = editable || selectable;
      if (t.wantsTouch === true) {
        fingers.set(e.pointerId, { id: e.pointerId, x: p0.x, y: p0.y });
        touchSink = t;
        t.sink("touchStart", p0.x, p0.y, { touches: touchList(), changed: [{ id: e.pointerId, x: p0.x, y: p0.y }] });
      }
      // the finger's own press first; a second finger recognized as a pinch
      // then starts it, so onPinchStart has the last word over what the press began
      t.sink("pointerDown", p0.x, p0.y, { deltaX: 0, deltaY: 0 });
      // The pinch recognizer (compositing.md §II.2): a touch finger landing
      // under a pinch owner is tracked; the SECOND finger sharing that owner
      // starts the gesture. Cumulative scale anchors on the starting spread.
      if (t.pinch !== undefined && e.pointerType === "touch") {
        pinchPts.set(e.pointerId, { x: p0.x, y: p0.y, owner: t.pinch });
        if (pinchGesture === null && pinchPts.size >= 2) {
          const pair = [...pinchPts.entries()].slice(-2);
          const [[ida, fa], [idb, fb]] = pair;
          if (fa.owner.key === fb.owner.key) {
            const d = Math.hypot(fb.x - fa.x, fb.y - fa.y);
            if (d > 0) {
              pinchGesture = { owner: fa.owner, a: ida, b: idb, startDist: d, scale: 1 };
              const cx = (fa.x + fb.x) / 2;
              const cy = (fa.y + fb.y) / 2;
              fa.owner.sink("pinchStart", cx, cy, { scale: 1, center: { x: cx, y: cy } });
              // two fingers in one gesture: this press is no longer a
              // candidate click/hold, and the pointer capture must not drag
              disarmHold();
              wandered = true;
              pinchedPress = true;
            }
          }
        }
      }
      heldAbove = false;
      const holder = t.hold ?? (t.wantsHold === true ? t : undefined);
      if (holder !== undefined) {
        const target = t;
        const touch = e.pointerType === "touch";
        holdTimer = setTimeout(() => {
          holdTimer = null;
          // Still the same press, still in place — the hold is real. It does
          // NOT consume the gesture: the raw stream continues and the eventual
          // click still fires unless the pointer wanders, so an app can start a
          // pick-up-drag from the hold, open a menu, or ignore it.
          if (held === target && !wandered) {
            // The HOLD-GATED claim engages here (see holdCaptureActive): on a
            // view that also drags, a held touch finger now belongs to the
            // app — the backends keep the browser's pan out from this moment.
            if (touch && target.wantsDrag === true) holdCapture = true;
            // held on an ancestor's behalf: the long-press was the gesture, so
            // the release does not also click the child it began on
            if (holder.key !== target.key) heldAbove = true;
            // …and an ancestor that drags from the hold takes the press now
            // (DRAG HANDOFF): the finger is its, and the claim engages
            const to = target.drag;
            if (!dragDecided && to !== undefined && to.fromHold && to.key === holder.key && to.key !== target.key && target.wantsDrag !== true) {
              handOff(target, to);
              if (touch) holdCapture = true;
            }
            holder.sink("hold", lastX, lastY, moved(lastX, lastY));
          }
        }, HOLD_MS);
      }
    }
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
    // The cursor can change WITHOUT the target changing (deepest-wins: eight
    // sinkless resize zones over one halo sink — sliding along the band keeps
    // the same target while the zone cursor flips), so the brush re-fires on
    // either difference. The out/over pair stays keyed to the TARGET alone.
    const cur = t !== null ? t.cursor : undefined;
    if (onHover !== undefined && (key !== hoveredKey || cur !== hoveredCursor)) {
      onHover(t);
      hoveredCursor = cur;
    }
    if (key !== hoveredKey) {
      if (hoveredSink !== null) hoveredSink("pointerOut", 0, 0);
      hoveredKey = key;
      hoveredSink = t !== null ? t.sink : null;
      if (t !== null) { const op = rootOf(e); t.sink("pointerOver", op.x, op.y); }
    }
    // Pinch moves ride EVERY tracked finger, captured or not — the second
    // finger never holds the capture (`held` is the first press's), so this
    // runs before the capture gate below.
    if (rootPoint !== undefined && pinchPts.has(e.pointerId)) {
      const pp = rootPoint(e);
      const rec = pinchPts.get(e.pointerId)!;
      rec.x = pp.x;
      rec.y = pp.y;
      const g = pinchGesture;
      if (g !== null && (e.pointerId === g.a || e.pointerId === g.b)) {
        const fa = pinchPts.get(g.a);
        const fb = pinchPts.get(g.b);
        if (fa !== undefined && fb !== undefined) {
          const d = Math.hypot(fb.x - fa.x, fb.y - fa.y);
          if (d > 0) g.scale = d / g.startDist;
          const cx = (fa.x + fb.x) / 2;
          const cy = (fa.y + fb.y) / 2;
          g.owner.sink("pinch", cx, cy, { scale: g.scale, center: { x: cx, y: cy } });
        }
      }
    }
    if (held === null || rootPoint === undefined) return;
    const p = rootPoint(e);
    lastX = p.x;
    lastY = p.y;
    // The slop test: once the pointer has wandered past the threshold this
    // gesture can no longer activate anything, and any pending hold is off.
    if (!wandered) {
      const dx = p.x - pressX;
      const dy = p.y - pressY;
      if (dx * dx + dy * dy > pressSlop * pressSlop) {
        wandered = true;
        disarmHold();
      }
    }
    if (!dragDecided) travelled(t, p.x, p.y);
    if (!pressOnSelectable) suppressSelection(true);
    if (held.wantsTouch === true && fingers.has(e.pointerId)) {
      fingers.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y });
      held.sink("touchMove", p.x, p.y, { touches: touchList(), changed: [{ id: e.pointerId, x: p.x, y: p.y }] });
    }
    if (!pinchedPress) held.sink("pointerMove", p.x, p.y, moved(p.x, p.y));
  });
  listen("pointerup", (e) => {
    // a finger's lift: the browser's trailing mouse events for it follow (see trailing)
    if (e.pointerType === "touch") lastTap = { x: e.clientX, y: e.clientY, at: performance.now(), el: pressEl };
    // A release the scroll-takeover detector already synthesized: the gesture
    // was resolved as canceled when the browser took it; this clean up is the
    // browser closing its books, not a second release for the app.
    if (swallowUp !== null && e.pointerId === swallowUp) {
      swallowUp = null;
      return;
    }
    suppressSelection(false);
    disarmHold();
    holdCapture = false; // a hold-gated drag ends with its finger
    dragFinger = false;
    // a pinch ends when EITHER of its fingers lifts (the gesture is the pair)
    if (pinchGesture !== null && (e.pointerId === pinchGesture.a || e.pointerId === pinchGesture.b)) endPinch();
    pinchPts.delete(e.pointerId);
    if (pinchPts.size === 0) pinchedPress = false;
    const t = resolve(e);
    const captor = held;
    held = null;
    // EVERY finger strikes off, captured or not (see touchSink above) — and the
    // session owner hears its touchEnd even when the capture already ended.
    const gone = fingers.get(e.pointerId);
    if (gone !== undefined) {
      fingers.delete(e.pointerId);
      if (touchSink !== null) {
        const tp = rootPoint !== undefined ? rootPoint(e) : { x: gone.x, y: gone.y };
        touchSink.sink("touchEnd", tp.x, tp.y, { touches: touchList(), changed: [gone] });
      }
      if (fingers.size === 0) touchSink = null;
    }
    if (captor !== null) {
      // The presser captured the pointer, so the release goes to IT (root-space
      // coords) — a drag drops on its owner even released over another view.
      const p = rootOf(e);
      captor.sink("pointerUp", p.x, p.y, { canceled: false, ...moved(p.x, p.y) });
      // Click rule: press and release resolved to the same view, and the
      // pointer never wandered past slop (a moved finger was swiping, whatever
      // it started on). An excursion that returns still counts as wandering —
      // the gesture declared itself a drag when it left.
      if (t !== null && t.key === captor.key && !wandered && !heldAbove && !pressAux) {
        const now = Date.now();
        // The pair must also land in about the same PLACE — a view can be
        // large, and two taps at opposite corners are not a double-tap.
        const dx = p.x - lastClickX;
        const dy = p.y - lastClickY;
        const near = dx * dx + dy * dy <= (pressSlop * 3) * (pressSlop * 3);
        const isSecond = lastClickKey === captor.key && now - lastClickAt < DBL_MS && near;
        if (isSecond) {
          // The second tap of a pair. A view that answers double-clicks hears
          // the pair as `dblClick` alone — the double is what the second click
          // meant — and any other view hears a second click too, then the pair.
          if (captor.wantsDbl !== true) captor.sink("click", p.x, p.y, moved(p.x, p.y));
          captor.sink("dblClick", p.x, p.y, moved(p.x, p.y));
          lastClickKey = null;
        } else {
          // The first click is delivered at once, as the platforms do: a view
          // that also answers double-clicks makes its single click something the
          // double builds on (select, then open), so nothing waits out the window.
          lastClickKey = captor.key;
          lastClickAt = now;
          lastClickX = p.x;
          lastClickY = p.y;
          captor.sink("click", p.x, p.y, moved(p.x, p.y));
        }
      }
    } else if (t !== null) {
      const up = rootOf(e);
      t.sink("pointerUp", up.x, up.y, { canceled: false, ...moved(up.x, up.y) });
    }
    // A touch pointer ceases to exist on release; drop the hover it carried so a
    // just-tapped view doesn't stay stuck in its rollover (hover) state.
    if (e.pointerType === "touch") clearHover();
  });
  listen("pointercancel", (e) => {
    if (swallowUp !== null && e.pointerId === swallowUp) {
      swallowUp = null;
      return;
    }
    suppressSelection(false);
    disarmHold();
    holdCapture = false;
    dragFinger = false;
    // a canceled finger ends its pinch exactly as a lifted one does
    if (pinchGesture !== null && (e.pointerId === pinchGesture.a || e.pointerId === pinchGesture.b)) endPinch();
    pinchPts.delete(e.pointerId);
    if (pinchPts.size === 0) pinchedPress = false;
    // The browser reclaimed the gesture (a touch turned into a scroll). End the
    // capture WITHOUT a click — the interaction was interrupted, not completed —
    // so a drag handler still gets its release, and can tell that it WAS an
    // interruption (`e.canceled`) rather than a drop.
    const captor = held;
    held = null;
    const gone = fingers.get(e.pointerId);
    if (gone !== undefined) {
      fingers.delete(e.pointerId);
      if (touchSink !== null) {
        const tp = rootPoint !== undefined ? rootPoint(e) : { x: gone.x, y: gone.y };
        touchSink.sink("touchCancel", tp.x, tp.y, { touches: touchList(), changed: [gone] });
      }
      if (fingers.size === 0) touchSink = null;
    }
    if (captor !== null) {
      const p = rootOf(e);
      captor.sink("pointerUp", p.x, p.y, { canceled: true, ...moved(p.x, p.y) });
    }
    if (e.pointerType === "touch") clearHover();
  });
  // ── The scroll-takeover detector (iOS's missing cancel) ────────────────────
  // Measured on the simulator (iOS 18.2, 2026-08-06, tools/internal/sim +
  // ?probe): when an interior `scrolls` pane takes a live finger's gesture,
  // iOS Safari sends NO pointercancel and NO touchcancel — scroll events
  // simply begin mid-gesture, and the finger later lifts with a clean
  // pointerup. Chrome announces the same takeover with pointercancel, which
  // the listener above turns into the documented `e.canceled` release; on iOS
  // that contract silently failed. The takeover FACT is still observable: a
  // scroll arriving from a container of the pressed element, while a finger's
  // press is live and unclaimed, is the browser declaring the gesture its own.
  // Resolve the press as canceled right there — same delivery as a real
  // pointercancel — and swallow the finger's trailing clean pointerup.
  //
  // Guards, each load-bearing: `held !== null` (no live press, nothing to
  // cancel — momentum scroll after a lift lands here); `pressFinger` (a mouse
  // drag never competes with scrolling — wheeling mid-drag must not cancel
  // it); `!holdCapture` (past the hold the app owns the finger; any scroll
  // then is programmatic and must not break the claimed drag — and the same for a
  // finger a drag has whole from touchdown, fingerHeldByDrag); `!dragScrolling()`
  // (the drag's own edge scrolling moved it — the program's motion, the same);
  // containment
  // (another pane's programmatic scroll is not this gesture's takeover).
  // A press landing DURING deceleration gets canceled by the tail's scroll
  // events — matching the platform: a touch that stops a scroll is the
  // scroll's, and clicks nothing.
  {
    const scrollListener = (e: Event): void => {
      if (!alive()) {
        window.removeEventListener("scroll", scrollListener, true);
        return;
      }
      if (held === null || !pressFinger || fingerHeldByDrag() || dragScrolling()) return;
      const s = e.target;
      const isEl = typeof Element !== "undefined" && s instanceof Element;
      if (isEl && pressEl !== null && !(s as Element).contains(pressEl)) return;
      suppressSelection(false);
      disarmHold();
      const captor = held;
      held = null;
      swallowUp = pressId;
      const gone = pressId !== null ? fingers.get(pressId) : undefined;
      if (gone !== undefined && pressId !== null) {
        fingers.delete(pressId);
        if (touchSink !== null) {
          touchSink.sink("touchCancel", gone.x, gone.y, { touches: touchList(), changed: [gone] });
        }
        if (fingers.size === 0) touchSink = null;
      }
      captor.sink("pointerUp", lastX, lastY, { canceled: true, ...moved(lastX, lastY) });
      clearHover();
    };
    window.addEventListener("scroll", scrollListener, true);
  }
}

/** Does a wheel scroll pass a view whose `claim` covers only one axis — a
 *  scroll mostly along the other, which goes on to the page as a finger's does
 *  (a chart that pans sideways leaves a vertical wheel scrolling past it)? */
export function passesWheel(axis: "both" | "x" | "y" | undefined, deltaX: number, deltaY: number): boolean {
  if (axis === "x") return Math.abs(deltaY) > Math.abs(deltaX);
  if (axis === "y") return Math.abs(deltaX) > Math.abs(deltaY);
  return false;
}
