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
export const holdCaptureActive = () => holdCapture;
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
/** Start routing window pointer input through `resolve`. `alive` gates the
 *  whole route (false = the tree is gone; the listeners remove themselves
 *  on the next event). */
export function routeInput(alive, resolve, rootPoint, onHover) {
    // The pressed view captures the pointer: while held, `pointerMove` (and the
    // eventual release) go to IT, not to whatever is under the pointer — the
    // capture a drag needs. (For touch the browser already implicitly captures the
    // pointer to the pressed element; window listeners cover mouse.) Move
    // coordinates are in ROOT space (app-relative), so a handler can hit-test the
    // whole tree; down/up stay view-local.
    let held = null;
    // Where and how the current press began — the origin the slop test measures
    // from, and the pointer kind that picks the threshold.
    let pressX = 0;
    let pressY = 0;
    let pressSlop = SLOP_MOUSE;
    let wandered = false;
    // Double-click pairing (platform-level, both backends): a second click on
    // the SAME view within the interval — and, on touch, within slop of the first
    // tap — also fires dblClick; the third starts a fresh cycle (the classic
    // desktop rule — triple is double + single, not two doubles).
    let lastClickKey = null;
    let lastClickAt = 0;
    let lastClickX = 0;
    let lastClickY = 0;
    // A click withheld pending the double-click window (see HitTarget.wantsDbl):
    // fired by the timer if no second tap arrives, dropped if one does.
    let pendingClick = null;
    const flushPendingClick = () => {
        const p = pendingClick;
        pendingClick = null;
        if (p !== null) {
            clearTimeout(p.timer);
            p.fire();
        }
    };
    const dropPendingClick = () => {
        if (pendingClick !== null) {
            clearTimeout(pendingClick.timer);
            pendingClick = null;
        }
    };
    // The hold timer for the current press — armed at down on a view that wants
    // holds, disarmed by movement past slop, by release, or by cancellation.
    let holdTimer = null;
    const disarmHold = () => {
        if (holdTimer !== null) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    };
    // The current press began over selectable/editable content (set at
    // pointerdown): selection suppression stands down for this gesture.
    let pressOnSelectable = false;
    // Hover: the sink the pointer was last OVER, so a move that crosses into a
    // different sink (or off all of them) fires pointerOut on the old + pointerOver on
    // the new — the rollover pair, resolved by the same seam as click.
    let hoveredKey = null;
    let hoveredSink = null;
    let hoveredCursor = undefined;
    // Live fingers, by pointerId — the raw touch family's payload. Only
    // maintained while some view under the gesture wants raw touch.
    const fingers = new Map();
    const touchList = () => [...fingers.values()];
    /** The view hearing the touch family this session — set at the first
     *  touchStart, cleared when the last finger lifts. Deliberately SEPARATE from
     *  `held` (the pointer capture): a multi-finger release arrives as one
     *  pointerup per finger, and only the FIRST still holds the capture — `held`
     *  is nulled by it — so touch bookkeeping keyed on the captor leaked every
     *  simultaneously-released finger. touchList() then carried a phantom, and the
     *  next one-finger tap read as two: every pinch poisoned the next tap until
     *  reload. */
    let touchSink = null;
    // The live PINCH (compositing.md §II.2): fingers over pinch-declaring
    // subtrees, tracked by pointerId with the OWNER each landed in. The
    // gesture starts when two fingers share an owner, delivers cumulative
    // scale (distance now / distance at start) and the root-space center, and
    // ends when either finger lifts. Separate from `fingers` (the raw touch
    // family's payload) for the same reason touchSink is separate from held:
    // the two facts have different lifetimes and different owners.
    const pinchPts = new Map();
    let pinchGesture = null;
    const endPinch = () => {
        const g = pinchGesture;
        if (g === null)
            return;
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
    let pressId = null;
    let pressFinger = false;
    let pressEl = null;
    let lastX = 0;
    let lastY = 0;
    // A pointerId whose release was already synthesized (scroll takeover): the
    // browser's trailing clean pointerup must not deliver a second release.
    let swallowUp = null;
    const clearHover = () => {
        if (hoveredSink !== null)
            hoveredSink("pointerOut", 0, 0);
        hoveredKey = null;
        hoveredSink = null;
    };
    const listen = (type, handle) => {
        const listener = (e) => {
            if (!alive()) {
                window.removeEventListener(type, listener);
                return;
            }
            handle(e);
        };
        window.addEventListener(type, listener);
    };
    // The platform's CONTEXT gesture (right-click / two-finger tap): resolved
    // through the same seam as every press; delivered — and the browser's own
    // menu suppressed — exactly where an onContextMenu handler is declared.
    // Touch context rides onHold instead (the hold gate), so nothing here
    // touches the touch stream.
    {
        const ctxListener = (e) => {
            if (!alive()) {
                window.removeEventListener("contextmenu", ctxListener);
                return;
            }
            const t = resolve(e);
            if (t !== null && t.wantsContext === true) {
                e.preventDefault();
                t.sink("contextMenu", t.x, t.y);
            }
        };
        window.addEventListener("contextmenu", ctxListener);
    }
    listen("pointerdown", (e) => {
        const t = resolve(e);
        held = t;
        wandered = false;
        pressSlop = e.pointerType === "touch" ? SLOP_TOUCH : SLOP_MOUSE;
        const p0 = rootPoint !== undefined ? rootPoint(e) : { x: e.clientX, y: e.clientY };
        pressX = p0.x;
        pressY = p0.y;
        pressId = e.pointerId;
        pressFinger = e.pointerType !== "mouse";
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
            const editable = typeof HTMLElement !== "undefined" &&
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
            const selectable = el !== null &&
                typeof el.closest === "function" &&
                el.closest("[data-declare-selectable]") !== null &&
                (cs === null || (cs.userSelect ?? cs.webkitUserSelect) !== "none");
            if (el !== null && !editable && !selectable && e.pointerType !== "touch")
                e.preventDefault();
            // A press that BEGINS on selectable/editable content is (potentially) a
            // text-selection gesture: the captured-move suppression below must stand
            // down for this gesture, or dragging across a Markdown body clears the
            // selection the browser is painting (an enclosing sink — a window's
            // activate-on-press — still captures, so events flow as ever).
            pressOnSelectable = editable || selectable;
            // A press elsewhere ends any click still waiting on the double window:
            // the user moved on, so the withheld single click fires now rather than
            // arriving after whatever this press does.
            if (pendingClick !== null && t.key !== lastClickKey)
                flushPendingClick();
            if (t.wantsTouch === true) {
                fingers.set(e.pointerId, { id: e.pointerId, x: p0.x, y: p0.y });
                touchSink = t;
                t.sink("touchStart", p0.x, p0.y, { touches: touchList(), changed: [{ id: e.pointerId, x: p0.x, y: p0.y }] });
            }
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
                        }
                    }
                }
            }
            t.sink("pointerDown", t.x, t.y);
            if (t.wantsHold === true) {
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
                        if (touch && target.wantsDrag === true)
                            holdCapture = true;
                        target.sink("hold", target.x, target.y);
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
    const suppressSelection = (on) => {
        if (typeof document === "undefined" || on === selectionSuppressed)
            return;
        selectionSuppressed = on;
        document.body.style.userSelect = on ? "none" : "";
        document.body.style.webkitUserSelect = on ? "none" : "";
        if (on)
            document.getSelection()?.removeAllRanges();
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
            if (hoveredSink !== null)
                hoveredSink("pointerOut", 0, 0);
            hoveredKey = key;
            hoveredSink = t !== null ? t.sink : null;
            if (t !== null)
                t.sink("pointerOver", t.x, t.y);
        }
        // Pinch moves ride EVERY tracked finger, captured or not — the second
        // finger never holds the capture (`held` is the first press's), so this
        // runs before the capture gate below.
        if (rootPoint !== undefined && pinchPts.has(e.pointerId)) {
            const pp = rootPoint(e);
            const rec = pinchPts.get(e.pointerId);
            rec.x = pp.x;
            rec.y = pp.y;
            const g = pinchGesture;
            if (g !== null && (e.pointerId === g.a || e.pointerId === g.b)) {
                const fa = pinchPts.get(g.a);
                const fb = pinchPts.get(g.b);
                if (fa !== undefined && fb !== undefined) {
                    const d = Math.hypot(fb.x - fa.x, fb.y - fa.y);
                    if (d > 0)
                        g.scale = d / g.startDist;
                    const cx = (fa.x + fb.x) / 2;
                    const cy = (fa.y + fb.y) / 2;
                    g.owner.sink("pinch", cx, cy, { scale: g.scale, center: { x: cx, y: cy } });
                }
            }
        }
        if (held === null || rootPoint === undefined)
            return;
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
        if (!pressOnSelectable)
            suppressSelection(true);
        if (held.wantsTouch === true && fingers.has(e.pointerId)) {
            fingers.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y });
            held.sink("touchMove", p.x, p.y, { touches: touchList(), changed: [{ id: e.pointerId, x: p.x, y: p.y }] });
        }
        held.sink("pointerMove", p.x, p.y);
    });
    listen("pointerup", (e) => {
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
        // a pinch ends when EITHER of its fingers lifts (the gesture is the pair)
        if (pinchGesture !== null && (e.pointerId === pinchGesture.a || e.pointerId === pinchGesture.b))
            endPinch();
        pinchPts.delete(e.pointerId);
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
            if (fingers.size === 0)
                touchSink = null;
        }
        if (captor !== null) {
            // The presser captured the pointer, so the release goes to IT (root-space
            // coords) — a drag drops on its owner even released over another view.
            const p = rootPoint !== undefined ? rootPoint(e) : { x: captor.x, y: captor.y };
            captor.sink("pointerUp", p.x, p.y, { canceled: false });
            // Click rule: press and release resolved to the same view, and the
            // pointer never wandered past slop (a moved finger was swiping, whatever
            // it started on). An excursion that returns still counts as wandering —
            // the gesture declared itself a drag when it left.
            if (t !== null && t.key === captor.key && !wandered) {
                const now = Date.now();
                // The pair must also land in about the same PLACE — a view can be
                // large, and two taps at opposite corners are not a double-tap.
                const dx = p.x - lastClickX;
                const dy = p.y - lastClickY;
                const near = dx * dx + dy * dy <= (pressSlop * 3) * (pressSlop * 3);
                const isSecond = lastClickKey === captor.key && now - lastClickAt < DBL_MS && near;
                if (isSecond) {
                    // The second tap of a pair: drop the withheld first click if this
                    // view arbitrates, then fire the pair's own event.
                    const held1 = pendingClick !== null;
                    dropPendingClick();
                    if (!held1)
                        captor.sink("click", t.x, t.y);
                    captor.sink("dblClick", t.x, t.y);
                    lastClickKey = null;
                }
                else {
                    lastClickKey = captor.key;
                    lastClickAt = now;
                    lastClickX = p.x;
                    lastClickY = p.y;
                    const fire = () => captor.sink("click", t.x, t.y);
                    if (captor.wantsDbl === true) {
                        // This view answers double-clicks, so its single click waits out
                        // the window — otherwise a double-click would perform the single
                        // action first. Nothing else pays this latency.
                        dropPendingClick();
                        pendingClick = { timer: setTimeout(() => { pendingClick = null; fire(); }, DBL_MS), fire };
                    }
                    else {
                        fire();
                    }
                }
            }
        }
        else if (t !== null) {
            t.sink("pointerUp", t.x, t.y, { canceled: false });
        }
        // A touch pointer ceases to exist on release; drop the hover it carried so a
        // just-tapped view doesn't stay stuck in its rollover (hover) state.
        if (e.pointerType === "touch")
            clearHover();
    });
    listen("pointercancel", (e) => {
        if (swallowUp !== null && e.pointerId === swallowUp) {
            swallowUp = null;
            return;
        }
        suppressSelection(false);
        disarmHold();
        holdCapture = false;
        // a canceled finger ends its pinch exactly as a lifted one does
        if (pinchGesture !== null && (e.pointerId === pinchGesture.a || e.pointerId === pinchGesture.b))
            endPinch();
        pinchPts.delete(e.pointerId);
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
            if (fingers.size === 0)
                touchSink = null;
        }
        if (captor !== null) {
            const p = rootPoint !== undefined ? rootPoint(e) : { x: captor.x, y: captor.y };
            captor.sink("pointerUp", p.x, p.y, { canceled: true });
        }
        if (e.pointerType === "touch")
            clearHover();
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
    // then is programmatic and must not break the claimed drag); containment
    // (another pane's programmatic scroll is not this gesture's takeover).
    // A press landing DURING deceleration gets canceled by the tail's scroll
    // events — matching the platform: a touch that stops a scroll is the
    // scroll's, and clicks nothing.
    {
        const scrollListener = (e) => {
            if (!alive()) {
                window.removeEventListener("scroll", scrollListener, true);
                return;
            }
            if (held === null || !pressFinger || holdCapture)
                return;
            const s = e.target;
            const isEl = typeof Element !== "undefined" && s instanceof Element;
            if (isEl && pressEl !== null && !s.contains(pressEl))
                return;
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
                if (fingers.size === 0)
                    touchSink = null;
            }
            captor.sink("pointerUp", lastX, lastY, { canceled: true });
            clearHover();
        };
        window.addEventListener("scroll", scrollListener, true);
    }
}
//# sourceMappingURL=input.js.map