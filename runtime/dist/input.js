// Input routing — the substrate-neutral half of R5's event slice. A backend
// supplies only RESOLUTION (a platform pointer event → the view-owned sink under
// its point, with view-local coordinates): the DOM backend resolves through
// native event targets, the Canvas backend through its own hit walk.
// Everything above resolution — the press/release pairing, the click rule,
// delivery order (mouseDown · mouseUp · click) — lives here, once, so the two
// backends cannot drift: a *click* IS "press and release resolved to the same
// view, without the pointer wandering", decided by identical code on both. (The
// platform's own `click` event is deliberately unused: its target is the common
// ancestor of press and release, a DOM-ism the canvas backend could only
// imitate approximately.)
//
// TWO LAYERS, one wire. The RAW layer (mouseDown/mouseMove/mouseUp, and the
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
// touch). The sink protocol keeps its mouse-era names (`"mouseDown"`, `"click"`,
// …) so the language's `onMouseDown`/`onClick` handlers are unchanged; only the
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
// scrolling and swiping (UIKit cancels a tap the same way). Relying on the
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
    // The pressed view captures the pointer: while held, `mouseMove` (and the
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
    // tap — also fires dblClick; the third starts a fresh cycle (macOS's rule —
    // triple is double + single, not two doubles).
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
    // different sink (or off all of them) fires mouseOut on the old + mouseOver on
    // the new — the rollover pair, resolved by the same seam as click.
    let hoveredKey = null;
    let hoveredSink = null;
    // Live fingers, by pointerId — the raw touch family's payload. Only
    // maintained while some view under the gesture wants raw touch.
    const fingers = new Map();
    const touchList = () => [...fingers.values()];
    const clearHover = () => {
        if (hoveredSink !== null)
            hoveredSink("mouseOut", 0, 0);
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
    listen("pointerdown", (e) => {
        const t = resolve(e);
        held = t;
        wandered = false;
        pressSlop = e.pointerType === "touch" ? SLOP_TOUCH : SLOP_MOUSE;
        const p0 = rootPoint !== undefined ? rootPoint(e) : { x: e.clientX, y: e.clientY };
        pressX = p0.x;
        pressY = p0.y;
        if (t !== null) {
            // The browser ANCHORS its native text selection at mousedown; flipping
            // user-select off on the first captured move (below) is too late in
            // Safari, which keeps painting the already-anchored selection through a
            // window drag — selecting text in whatever selectable region sits under
            // the drag path. A press that lands on a sink over NON-selectable,
            // non-editable content cancels the default here, so no anchor is ever
            // planted. Selectable regions (user-select: text) and native editables
            // keep their defaults — click-to-select and click-to-focus still work.
            const el = typeof Element !== "undefined" && e.target instanceof Element ? e.target : null;
            const editable = typeof HTMLElement !== "undefined" &&
                el instanceof HTMLElement &&
                (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
            // Safari's computed style exposes only the -webkit- prefixed property
            // (unprefixed `userSelect` reads as undefined there) — probe both.
            const cs = el !== null && typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
            const selectable = cs !== null && (cs.userSelect ?? cs.webkitUserSelect) === "text";
            if (el !== null && !editable && !selectable)
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
                t.sink("touchStart", p0.x, p0.y, { touches: touchList(), changed: [{ id: e.pointerId, x: p0.x, y: p0.y }] });
            }
            t.sink("mouseDown", t.x, t.y);
            if (t.wantsHold === true) {
                const target = t;
                holdTimer = setTimeout(() => {
                    holdTimer = null;
                    // Still the same press, still in place — the hold is real. It does
                    // NOT consume the gesture: the raw stream continues and the eventual
                    // click still fires unless the pointer wanders, so an app can start a
                    // pick-up-drag from the hold, open a menu, or ignore it.
                    if (held === target && !wandered)
                        target.sink("hold", target.x, target.y);
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
        if (key !== hoveredKey) {
            if (onHover !== undefined)
                onHover(t);
            if (hoveredSink !== null)
                hoveredSink("mouseOut", 0, 0);
            hoveredKey = key;
            hoveredSink = t !== null ? t.sink : null;
            if (t !== null)
                t.sink("mouseOver", t.x, t.y);
        }
        if (held === null || rootPoint === undefined)
            return;
        const p = rootPoint(e);
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
        held.sink("mouseMove", p.x, p.y);
    });
    listen("pointerup", (e) => {
        suppressSelection(false);
        disarmHold();
        const t = resolve(e);
        const captor = held;
        held = null;
        if (captor !== null) {
            // The presser captured the pointer, so the release goes to IT (root-space
            // coords) — a drag drops on its owner even released over another view.
            const p = rootPoint !== undefined ? rootPoint(e) : { x: captor.x, y: captor.y };
            if (captor.wantsTouch === true && fingers.has(e.pointerId)) {
                const gone = fingers.get(e.pointerId);
                fingers.delete(e.pointerId);
                captor.sink("touchEnd", p.x, p.y, { touches: touchList(), changed: [gone] });
            }
            captor.sink("mouseUp", p.x, p.y, { canceled: false });
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
            t.sink("mouseUp", t.x, t.y, { canceled: false });
        }
        // A touch pointer ceases to exist on release; drop the hover it carried so a
        // just-tapped view doesn't stay stuck in its rollover (hover) state.
        if (e.pointerType === "touch")
            clearHover();
    });
    listen("pointercancel", (e) => {
        suppressSelection(false);
        disarmHold();
        // The browser reclaimed the gesture (a touch turned into a scroll). End the
        // capture WITHOUT a click — the interaction was interrupted, not completed —
        // so a drag handler still gets its release, and can tell that it WAS an
        // interruption (`e.canceled`) rather than a drop.
        const captor = held;
        held = null;
        if (captor !== null) {
            const p = rootPoint !== undefined ? rootPoint(e) : { x: captor.x, y: captor.y };
            if (captor.wantsTouch === true && fingers.has(e.pointerId)) {
                const gone = fingers.get(e.pointerId);
                fingers.delete(e.pointerId);
                captor.sink("touchCancel", p.x, p.y, { touches: touchList(), changed: [gone] });
            }
            captor.sink("mouseUp", p.x, p.y, { canceled: true });
        }
        if (e.pointerType === "touch")
            clearHover();
    });
}
//# sourceMappingURL=input.js.map