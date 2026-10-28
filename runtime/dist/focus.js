// Focus — the keyboard-focus service (docs/system-design/planes.md §13). One
// focused view at a time; Tab moves through the view tree in preorder, each
// view's own `tabOrder()` deciding the order it is descended into (default =
// visible children in source order — so an all-default tree is pure preorder,
// no numeric tabindex, LZX over DOM). A view's `focusScope` says what Tab does
// at its edge: `stop` is one entry in its parent's order (arrows inside are the
// view's own), `region` is one entry from outside and a cycle inside, `modal` is
// a cycle Tab never leaves, `capture` walks straight in. An island is
// transparent: its tenant's stops take its place. Each scope remembers what last
// had focus inside it. The sequence is recomputed LIVE per move over the current
// tree, and the service subscribes to the discard lifecycle so a moving tree can
// never strand focus.
//
// It is a small STATEFUL service (holds the current focus, the root, a
// reentrancy lock) rather than a pure per-Tab function — see input.md
// §mutation. Keyboard delivery to the focused view (Keys → onKeyDown/onKeyUp)
// is wired by the runtime entry, not here, keeping this layer independent.
import { inPointerDispatch } from "./pointer-dispatch.js";
import { View, fireEvent, setFocusDiscardHook, setKeyDefaultHook, noteFocused } from "./view.js";
import { radiusMax } from "./value.js";
import { isSet, ownerOf, providedRead } from "./attributes.js";
import { Cell, Constraint, afterSettle } from "./reactive.js";
import { rootFrameBox, rootTransform } from "./interaction.js";
import { apply as applyAffine } from "./affine.js";
import { provideKeyContextTarget } from "./input.js";
import { pathOf } from "./node-path.js";
export class FocusService {
    current = null;
    rootView = null;
    /** Whether the LAST focus change was keyboard-driven (Tab traversal). The
     *  focus-visible modality: a ring/indicator shows only for keyboard focus —
     *  a pointer press focuses silently (the click itself is the feedback).
     *  A REACTIVE fact: `byKeyboard()` is a tracked read, so a class's
     *  styling constraint (a Tab header's focus edge) re-derives when the
     *  modality flips — same slot, event handlers and constraints alike. */
    keyboard = false;
    keyboardCell = new Cell();
    setKeyboard(v) {
        if (this.keyboard === v)
            return;
        this.keyboard = v;
        this.keyboardCell.changed();
    }
    /** Subscribers to focus CHANGES (`Focus [ onFocusChange(v) { … } ]`) —
     *  called with the newly focused view (or null on blur) after the change
     *  settles. What the traveling focus indicator rides. */
    changeHandlers = new Set();
    /** Subscribers to the focused control's LIVE GEOMETRY
     *  (`Focus [ onGeometry(g) { … } ]`). A standing runtime constraint follows
     *  the target: tracked reads
     *  of the parent chain's x/y and the control's focusShape() mean an
     *  arrow-keyed slider thumb, a reflowing layout, or a resized ancestor
     *  moves the resting ring WITH its control — no re-focus needed. */
    geometryHandlers = new Set();
    follower = null;
    /** Watches that the focused view stays reachable (rewatch). */
    watch = null;
    /** Reentrancy lock: a focus change fires onFocus/onBlur handlers that may
     *  call focus() again; remember the latest target and apply it after the
     *  current change settles (LZX's discipline). */
    changing = false;
    queued = false;
    queuedTarget = null;
    /** The tree root, for traversal when nothing is focused (set at attach). */
    setRoot(view) {
        this.rootView = view;
    }
    /** The focused view — a tracked read: a constraint that reads it re-runs
     *  when focus moves. */
    getFocus() {
        this.currentCell.track();
        return this.current;
    }
    currentCell = new Cell();
    /** The top-level program's root — the program that has the keyboard while
     *  nothing is focused (null before one is mounted). */
    getRoot() {
        return this.rootView;
    }
    /** The program the keyboard goes to (keyboard-follows-focus.md, Rule 1):
     *  focus on an island hands it to the island's tenant; focus anywhere else,
     *  to the program whose tree holds the focused view; no focus, to the
     *  top-level program. */
    keyboardProgram() {
        const f = this.current;
        if (f === null)
            return this.rootView;
        return f.$tenant ?? rootOf(f);
    }
    /** True when the current focus arrived by KEYBOARD (Tab/Shift-Tab) — the
     *  focus-visible modality gate an indicator reads: show for keyboard focus,
     *  stay hidden for pointer/programmatic focus. */
    byKeyboard() {
        this.keyboardCell.track();
        return this.keyboard;
    }
    /** Test/lifecycle reset. */
    reset() {
        this.current = null;
        this.lastInputKeyboard = false;
        noteFocused(null);
        this.rootView = null;
        this.changing = false;
        this.queued = false;
        this.follower?.dispose();
        this.follower = null;
    }
    /** Focus a view (null = blur). A non-focusable or invisible view is ignored
     *  (never becomes the focus). Fires onBlur on the old, onFocus on the new.
     *  This public entry is the POINTER/PROGRAMMATIC path — it clears the
     *  keyboard modality; Tab traversal (move) sets it. Called from a key's
     *  handler (arrows roving a Segmented's segments, a shortcut focusing a
     *  field), it is keyboard focus: the web's :focus-visible rule for script
     *  focus during keyboard use. */
    focus(view) {
        this.calls++;
        // the web's :focus-visible rule for focus moved by code: it shows when the
        // person's last input was the keyboard — a key's handler roving a group,
        // or an overlay giving focus back a turn after Esc — and not after a press
        const was = this.keyboard;
        this.setKeyboard(this.keys?.inKeyDispatch() === true || this.lastInputKeyboard);
        // a press on what already has focus changes no focus, but may change how it
        // was reached: those watching (the ring) hear it, as a change to the same view
        if (view !== null && view === this.current && was !== this.keyboard) {
            for (const h of [...this.changeHandlers])
                h(this.current);
            return;
        }
        // a program asking for focus on what cannot take it is told, once per view:
        // the call does nothing, and nothing else would say so (a control focusing
        // itself as it is pressed is not the program asking)
        if (view !== null && !canFocus(view) && !(inPointerDispatch() && typeof view.press === "function"))
            warnOnce(view, `Focus.focus(${where(view)}): it is not focusable, so focus did not move — set focusable = true on it, or focus a control inside it`);
        this.apply(view);
        // Focus a program moves is shown, as Tab's is and as the web's
        // element.focus() is: scrolled into view, clear of pinned chrome. Focus a
        // press takes is not — the person is pointing at it already.
        if (view !== null && this.current === view && !inPointerDispatch())
            reveal(view);
    }
    /** Calls to focus() and blur(): a recovery waiting a frame (recover) stands down
     *  when the program has moved focus since, even to where it already was. */
    calls = 0;
    /** Was the person's last input a key (true) or a press (false)? Set as each
     *  arrives (deliverKeys, pressAt). */
    lastInputKeyboard = false;
    /** The key service delivering to this one (deliverKeys) — asked whether a
     *  focus call comes from a key's handler. */
    keys = null;
    apply(view) {
        // a linked view is a focus stop by that fact alone (location.md §0.4) —
        // the <a> contract: keyboard reaches every link, Enter follows it
        if (view !== null && !canFocus(view))
            return;
        if (this.changing) {
            this.queued = true;
            this.queuedTarget = view;
            return;
        }
        if (view === this.current)
            return;
        // Focusing an island whose program already holds focus — its tenant's, or
        // a program nested in that — leaves focus where it is, as focusing an
        // iframe keeps the focus inside it.
        if (view !== null && this.current !== null && within(this.current, view))
            return;
        this.changing = true;
        const old = this.current;
        this.current = view;
        if (view !== null)
            this.startPoint = null;
        noteFocused(view, this.keyboard);
        this.currentCell.changed();
        if (old !== null) {
            old.$focusChanged(false); // internal (native element) before the user event
            fireEvent(old, "blur");
        }
        if (view !== null) {
            view.$focusChanged(true);
            fireEvent(view, "focus");
        }
        this.changing = false;
        if (view !== null)
            remember(view);
        this.retargetFollower();
        this.rewatch();
        for (const h of [...this.changeHandlers])
            h(this.current);
        if (this.queued) {
            this.queued = false;
            this.apply(this.queuedTarget); // re-entry keeps the initiating modality
        }
    }
    /** Subscribe to focus changes. Returns the unsubscribe thunk — the `<-`
     *  wiring's contract (sources.ts). */
    onFocusChange(fn) {
        this.changeHandlers.add(fn);
        return () => this.changeHandlers.delete(fn);
    }
    onGeometry(fn) {
        this.geometryHandlers.add(fn);
        return () => this.geometryHandlers.delete(fn);
    }
    /** (Re)install the follower for the current focus. The constraint's body
     *  reads TRACKED slots (ancestor x/y AND every scroll offset on the chain —
     *  the shared walk's reads; the focusShape's inputs), so any change,
     *  scrolling included, re-fires it; its push notifies the geometry
     *  subscribers. Geometry is the root's CONTENT space — the FocusRing is a
     *  child of the App and scrolls with the page like the control it rings, so
     *  the root's own scroll is added back onto the frame-space origin;
     *  an intermediate pane's scroll (which moves the control on screen while
     *  the ring's coordinate space stands still) stays subtracted. Hand-rolled
     *  x/y accumulation here was the scroll-blind focus ring (found 2026-07-31,
     *  the same missing term as the pointer walk's — ONE WALK, everywhere). */
    retargetFollower() {
        this.follower?.dispose();
        this.follower = null;
        const v = this.current;
        if (v === null || this.geometryHandlers.size === 0)
            return;
        const k = new Constraint("Focus.follower", () => {
            const root = rootOf(v);
            const fsFn = v.focusShape;
            const fs = typeof fsFn === "function" ? fsFn.call(v) : null;
            const rect = fs !== null ? { x: fs.x, y: fs.y, w: fs.w, h: fs.h } : undefined;
            const cr = radiusMax(v.cornerRadius); // the ring follows the largest corner
            const radLocal = fs ? fs.rad : (cr > 0 ? cr : 4);
            // The composed root-frame BOX (interaction.ts) — origin + local w/h
            // boxed a scaled control at its unscaled size (the 2026-08-13 audit);
            // rad rides the composed scale so the ring's corners match the
            // painted ones.
            const fb = rootFrameBox(v, rect);
            const x = fb.x + root.scrollX;
            const y = fb.y + root.scrollY;
            // the nearest scrolling ancestor (exclusive) — the travel home; the
            // home box walks the SAME transform composition but stops at the
            // scroller's content space (its own translate and — deliberately
            // unread — scroll offset are not crossed, so a traveled indicator
            // never re-derives per scroll tick)
            // A scroller with nothing to scroll is passed over: it never moves its
            // content, so a ring outside it rides nothing it needs, and is not cut
            // off by its clip (planes.md §14 — the tracker's filter chips). Its
            // extent is a tracked read, so the home changes when it starts to.
            // A scroller does not carry what its pinned chrome holds (a pane's
            // ignoreScroll header): that control rides the next scroller out.
            let scroller = root;
            for (let c = v, n = v.parent; n instanceof View; c = n, n = n.parent) {
                if (n.scrolls !== "none" && !c.ignoreScroll && overflows(n)) {
                    scroller = n;
                    break;
                }
            }
            const hb = scroller === root
                ? { x, y, width: fb.width, height: fb.height, scale: fb.scale }
                : rootFrameBox(v, rect, scroller);
            // a turned view (a tilted window, a control in a turned panel the
            // ring does not ride) is ringed turned, not by its upright bounds
            const ht = rootTransform(v, scroller === root ? null : scroller);
            const turned = Math.abs(ht.rotation) > 1e-4;
            const [ox, oy] = turned ? applyAffine(ht.matrix, rect?.x ?? 0, rect?.y ?? 0) : [0, 0];
            const lx = scroller === root ? root.scrollX : 0, ly = scroller === root ? root.scrollY : 0;
            return {
                x, y,
                w: fb.width, h: fb.height,
                rad: radLocal * fb.scale,
                view: v, root, scroller,
                homeX: turned ? ox + lx : hb.x, homeY: turned ? oy + ly : hb.y,
                homeW: turned ? (rect?.w ?? v.width) * ht.scale : hb.width,
                homeH: turned ? (rect?.h ?? v.height) * ht.scale : hb.height,
                homeRad: radLocal * hb.scale,
                homeRot: turned ? ht.rotation * 180 / Math.PI : 0,
                theme: providedRead(v, "theme", true, null),
            };
        }, (g) => { if (g != null)
            for (const fn of [...this.geometryHandlers])
                fn(g); });
        // kept, so the next focus change disposes it: an unkept follower went on
        // pushing the geometry of a view that had lost focus, and the ring
        // answered every one of them
        this.follower = k;
        k.run();
    }
    blur() {
        this.focus(null);
    }
    /** Focus does not stay on what the person can no longer reach. A standing
     *  constraint over the focused view's reachability — it or an ancestor
     *  hidden, it made unfocusable, or an ancestor's `tabOrder()` no longer
     *  naming it (a pane that closed) — clears focus once the change has
     *  settled, and the next Tab starts from where it was, as the web does when
     *  a focused element stops being rendered; then `recover` gives it to the
     *  nearest container that says where. A control DISABLED while focused keeps
     *  focus (focus-place.md): a disable is often brief, and moving would put a
     *  neighbour under the next Enter. (A view torn down is noteDiscarded's,
     *  before it goes.) */
    rewatch() {
        this.watch?.dispose();
        this.watch = null;
        const v = this.current;
        if (v === null)
            return;
        const k = new Constraint("Focus.reachable", () => reachable(v) || keepsDisabled(v), (ok) => {
            if (ok !== false || this.current !== v)
                return;
            afterSettle(() => {
                if (this.current !== v || reachable(v) || keepsDisabled(v))
                    return;
                // shown and focusable, yet out of reach: a container's tabOrder() leaves it out
                if (shownChain(v) && canFocus(v))
                    warnOnce(v, `focus on ${where(v)} was dropped: a container's tabOrder() leaves it out, so Tab cannot reach it — list it there (compose with tabDefault()) or focus a view Tab reaches`);
                this.apply(null);
                this.startPoint = v;
                const p = parentAcross(v);
                if (p !== null)
                    this.recover(v, p);
            });
        });
        this.watch = k;
        k.run();
    }
    /** Where the next Tab starts when nothing has focus: the spot a press on
     *  content that takes no focus left (the web's sequential focus navigation
     *  starting point). Cleared as soon as anything is focused. */
    startPoint = null;
    /** A press landed on `leaf` (the view under it, across islands). The web's
     *  rule: when nothing on its chain can take focus, focus is cleared — the
     *  keyboard goes back to the program the press was in — and the next Tab
     *  starts from the pressed spot. A press on something focusable, or inside
     *  it, leaves focus to that view (a control focuses itself on press). */
    pressAt(leaf) {
        this.lastInputKeyboard = false;
        // A press is pointing: the ring is for focus reached by keyboard, and goes.
        // Not only when focus moves — a control that takes no focus on a press
        // left focus, and a keyboard ring, where they were (2026-10-25).
        // Those watching (the ring) hear it as a change to the same view, as in
        // focus() when a press lands on what already has focus.
        if (this.keyboard && this.current !== null) {
            this.setKeyboard(false);
            for (const h of [...this.changeHandlers])
                h(this.current);
        }
        for (let v = leaf; v !== null; v = parentAcross(v))
            if (canFocus(v))
                return;
        if (this.current !== null) {
            this.setKeyboard(false);
            this.apply(null);
        }
        this.startPoint = leaf;
    }
    next() {
        this.move(1);
    }
    prev() {
        this.move(-1);
    }
    /** The ordered focus stops of the cycle a view's Tab moves in (planes.md
     *  §13.7) — the views Tab lands on, a scope's entry standing for the scope.
     *  Exposed for tooling/tests. */
    sequenceFor(view) {
        const cyc = view !== null ? cycleOf(view) : this.rootView;
        return cyc !== null ? sequence(cyc).map((e) => e.view) : [];
    }
    move(dir) {
        const start = this.current === null && this.startPoint !== null && spotView(this.startPoint).$root !== null ? shownSpot(this.startPoint) : null;
        const cyc = this.current !== null ? cycleOf(this.current) : start !== null ? cycleOf(start.from) : this.rootView;
        if (cyc === null)
            return;
        const seq = sequence(cyc);
        if (seq.length === 0)
            return;
        let idx = this.current !== null ? entryIndex(seq, this.current) : dir === 1 ? -1 : 0;
        // from a pressed spot: Tab goes to the first stop after it, Shift-Tab to
        // the last one before it
        if (start !== null) {
            const after = seq.findIndex((e) => afterSpot(start.spot, e.view));
            idx = after < 0 ? (dir === 1 ? seq.length - 1 : seq.length) : (dir === 1 ? after - 1 : after);
        }
        // a focused island stands where its program's stops are spliced: Tab goes
        // into the program, Shift-Tab to the stop before it
        const tenant = this.current !== null && idx < 0 ? tenantOf(this.current) : null;
        if (tenant !== null) {
            const first = seq.findIndex((e) => insideAcross(e.view, tenant));
            if (first >= 0)
                idx = dir === 1 ? first - 1 : first;
        }
        // focus on a view that is not a stop (a quiet heading, a control disabled
        // while focused): Tab goes on from its place, as from a pressed spot
        else if (this.current !== null && idx < 0) {
            const f = this.current, after = seq.findIndex((e) => afterSpot(f, e.view));
            idx = after < 0 ? (dir === 1 ? seq.length - 1 : seq.length) : (dir === 1 ? after - 1 : after);
        }
        const nidx = (((idx + dir) % seq.length) + seq.length) % seq.length; // cyclic
        this.land(seq[nidx].view);
    }
    /** Keyboard-focus `v` and show it: the focus-visible modality, and the web's
     *  focus-reveal contract (a keyboard-focused control is scrolled into view,
     *  minimum distance, through app scrollers and the document alike). */
    land(v) {
        this.setKeyboard(true);
        this.apply(v);
        if (this.current === v)
            reveal(v);
    }
    /** Give focus back as an overlay that took it closes (Floating's _closing):
     *  to the view that had it, while the person can still reach it; else to the
     *  first Tab stop after its place — the index it held among its parent's
     *  children when it has been discarded since — as Tab from there would go,
     *  passing over the closing overlay. The web leaves focus on nothing when a
     *  dialog's opener is gone; the dialog pattern asks for a logical place. */
    _giveBack(overlay) {
        const held = overlay;
        const back = held._savedFocus ?? null, parent = held._savedParent ?? null, at = held._savedAt ?? -1;
        held._savedFocus = null;
        held._savedParent = null;
        // a discarded view is the top of a tree of its own
        const top = (v) => { let n = v; for (let p = parentAcross(n); p !== null; p = parentAcross(p))
            n = p; return n; };
        const home = top(overlay);
        // where the program says, read now: the answer can depend on what the closing did
        const told = overlay.restoresFocusTo;
        if (told instanceof View && top(told) === home && reachable(told) && !insideAcross(told, overlay)) {
            this.focus(told);
            return;
        }
        if (back === null)
            return;
        if (top(back) === home && reachable(back)) {
            this.focus(back);
            return;
        }
        const spot = top(back) === home ? back : parent !== null && top(parent) === home && at >= 0 ? { parent, at } : null;
        if (spot === null)
            return;
        const start = shownSpot(spot);
        const seq = sequence(cycleOf(start.from)).filter((e) => e.view !== overlay && !insideAcross(e.view, overlay));
        if (seq.length === 0) {
            this.startPoint = spot;
            return;
        }
        const after = seq.findIndex((e) => afterSpot(start.spot, e.view));
        this.focus(seq[after < 0 ? 0 : after].view); // past the last stop, the first, as Tab cycles
    }
    /** Enter the focused region (Enter on a window focused as one stop): focus
     *  what last had focus inside it, else its first stop. True when it entered. */
    enter() {
        const f = this.current;
        if (f === null || scopeOf(f) !== "region")
            return false;
        const t = entryOf(f);
        if (t === null || t === f)
            return false;
        this.land(t);
        return true;
    }
    /** Focus into `view`: what last had focus inside it, else its first stop —
     *  how an overlay that takes focus takes it on opening. False when it holds
     *  nothing to focus. */
    focusIn(view) {
        const t = entryOf(view);
        if (t === null || t === view && !canFocus(view))
            return false;
        this.apply(t);
        return this.current === t;
    }
    /** Close the member scope focus has entered inside a `stop` (Esc in a cell's
     *  editor, in a list row's controls): focus goes back to the stop. True when
     *  it did. Esc never leaves a region (planes.md §13.3). */
    leaveMember() {
        const f = this.current;
        if (f === null)
            return false;
        const s = enteredStop(f);
        if (s === null)
            return false;
        const t = canFocus(s) ? s : entryOf(s);
        if (t === null || t === f)
            return false;
        this.land(t);
        return true;
    }
    /** The region keys (F6 / Shift-F6): move among the regions and stops of the
     *  context around the region focus is in, entering a region it moves to. */
    /** Is focus in `v` — on it, or inside it, a program hosted in an island
     *  inside it included? A window asks it to know whether it has the keyboard
     *  when what holds focus is a control of the program it hosts. */
    /** Is focus inside the overlay that holds the keys? Then the keys the
     *  overlay owns are still the focused view's. */
    focusInClaimant(keys) {
        const c = keys.claimant();
        return c instanceof View && this.holds(c);
    }
    /** Can the person still reach `v` — focusable, shown, and in Tab's reach? A
     *  native field asks before it reports its own blur. */
    reaches(v) {
        return reachable(v);
    }
    holds(v) {
        return this.current !== null && insideAcross(this.current, v);
    }
    /** Is focus inside a region (a window, a pane)? */
    inRegion() {
        for (let v = this.current; v !== null; v = parentAcross(v))
            if (scopeOf(v) === "region")
                return true;
        return false;
    }
    nextRegion(dir) {
        const f = this.current ?? this.rootView;
        if (f === null)
            return;
        let r = null;
        for (let v = f; v !== null; v = parentAcross(v))
            if (scopeOf(v) === "region") {
                r = v;
                break;
            }
        const cyc = r !== null ? cycleOf(r) : cycleOf(f);
        const seq = sequence(cyc).filter((e) => e.scope !== null);
        if (seq.length === 0)
            return;
        const idx = entryIndex(seq, r ?? f);
        const next = seq[(((idx + dir) % seq.length) + seq.length) % seq.length];
        const t = next.scope !== null && scopeOf(next.scope) === "region" ? entryOf(next.scope) ?? next.view : next.view;
        this.land(t);
    }
    /** The focused view's subtree is being discarded: focus is cleared before it
     *  goes, and the next Tab starts from where it was — the web's rule for a
     *  focused element taken out of the page, and the one `rewatch` keeps for a
     *  view hidden or disabled. It does not jump to some other stop: a search
     *  field closed with Esc once sent focus, and its ring, to the first tile
     *  of a sidebar across the window (2026-10-25). The spot is the dying
     *  view's parent, which stays; a program torn down whole (an embedded app
     *  re-rendered) leaves no spot, and focus is simply dropped. Called from
     *  View.discard() via the seam in view.ts. */
    noteDiscarded(view) {
        if (this.current === null || !isInSubtree(this.current, view))
            return;
        this.current = null; // the old focus is dying; drop it without a blur into a dead view
        noteFocused(null);
        this.setKeyboard(false);
        this.currentCell.changed();
        this.retargetFollower();
        this.rewatch();
        for (const h of [...this.changeHandlers])
            h(null);
        const p = view.parent instanceof View ? view.parent : null;
        this.startPoint = p !== null ? { parent: p, at: p.childViews.indexOf(view) } : null;
        if (p !== null)
            this.recover(view, p);
    }
    /** Focus was lost from `lost` (hidden, made unreachable, or torn down — its
     *  subtree's root). On the next frame, if focus is still nowhere and nothing
     *  has called focus() or blur() since, give it to the nearest container above
     *  the place, from `from` up, that says where (restoreTarget). Else it stays
     *  cleared and the next Tab starts from the place, as today. Whatever the last
     *  input was — the program asked; after a press the ring stays hidden. */
    recover(lost, from) {
        const calls = this.calls;
        from.$afterDelay(0, () => {
            if (this.current !== null || this.calls !== calls)
                return;
            const t = restoreTarget(from, lost);
            if (t !== null)
                this.focus(t);
        });
    }
}
/** Where lost focus goes (focus-place.md Rule 2): the first container from
 *  `from` up whose `restoresFocusTo` answers a view that can hold focus now; a
 *  `stop` group (a list, a grid) that says nothing answers its own entry, so the
 *  arrows go on working. A target that can't hold focus is passed over and the
 *  walk goes on up. It ends at an overlay — a Floating, whose own value is for
 *  its close (Floating._closing → _giveBack), and a modal, which focus does not
 *  leave — and at the program's root: nothing answers, null. The runtime's own
 *  search, once, at the loss: never a provided() read made for the program. */
function restoreTarget(from, lost) {
    if ("_savedAt" in lost)
        return null; // an overlay that held focus itself (a menu) gives it back itself
    for (let c = from; c !== null; c = parentAcross(c)) {
        if ("_savedAt" in c)
            return null; // a Floating
        const r = c.restoresFocusTo;
        if (r instanceof View) {
            if (r !== lost && reachable(r))
                return r;
        }
        else if (scopeOf(c) === "stop" && shownChain(c)) {
            const t = entryOf(c);
            if (t !== null && reachable(t))
                return t;
        }
        if (scopeOf(c) === "modal")
            return null;
    }
    return null;
}
/** A text field: its arrows move the caret, and the browser itself takes focus
 *  from a disabled one. */
function isTextField(v) {
    const t = v;
    return typeof t.placeholder === "string" && typeof t.multiline === "boolean";
}
/** A control disabled while it has focus keeps it: still in the program and
 *  shown — not a native text field, whose element the browser blurs. */
function keepsDisabled(v) {
    return v.disabled === true && v.$root !== null && shownChain(v) && !isTextField(v);
}
// ── scopes (planes.md §13) ──────────────────────────────────────────────────
const scopeOf = (v) => v.focusScope ?? "none";
/** May `v` take focus: a focusable view, a link (location.md §0.4), or a region
 *  (focused as one stop in its parent's cycle) — and shown. */
/** Room left around a revealed control for the ring drawn outside it. */
const REVEAL_ROOM = 6;
/** Show a keyboard-focused view (planes.md §14): each scroller that carries it,
 *  innermost first, scrolls the least that shows it with room for its ring. A
 *  scroller does not carry it past a view that ignores scroll (an overlay
 *  layer fixed to the viewport), and the walk ends at a modal scope: focus in
 *  a dialog scrolls the dialog's panes, never the page behind it. A scroller
 *  the user is scrolling takes the reveal when that scroll ends, measured
 *  then. Within the focused view's own program. */
function reveal(v) {
    let child = v;
    for (let s = paintParent(v); s !== null; child = s, s = paintParent(s)) {
        if (child !== v && scopeOf(child) === "modal")
            return;
        if (s.scrolls === "none" || child.ignoreScroll)
            continue;
        if (s.userScrolling) {
            s.$pendingScroll = () => reveal(v);
            return;
        }
        const b = rootFrameBox(v, undefined, s);
        const ax = s.scrolls;
        const fh = frameExtent(s, "height"), fw = frameExtent(s, "width");
        const pin = pinnedEdges(s, child, b);
        if (ax === "y" || ax === "both") {
            const top = b.y - REVEAL_ROOM - pin.top, bottom = b.y + b.height + REVEAL_ROOM + pin.bottom;
            if (top < s.scrollY)
                s.scrollTo(Math.max(0, top));
            else if (bottom > s.scrollY + fh)
                s.scrollTo(Math.min(top, bottom - fh));
        }
        if (ax === "x" || ax === "both") {
            const left = b.x - REVEAL_ROOM - pin.left, right = b.x + b.width + REVEAL_ROOM + pin.right;
            if (left < s.scrollX)
                s.scrollToX(Math.max(0, left));
            else if (right > s.scrollX + fw)
                s.scrollToX(Math.min(left, right - fw));
        }
    }
}
/** The extent of a scroller's visible frame. A pane's is its own size; the
 *  App scrolling as the page is seen through the window, so a page App as tall
 *  as its content (`height` follows the content) is framed by `hostHeight`. */
function frameExtent(s, size) {
    const host = s[size === "width" ? "hostWidth" : "hostHeight"];
    const own = size === "width" ? s.width : s.height;
    return s.parent === null && typeof host === "number" && host > 0 ? Math.min(own, host) : own;
}
/** How far a scroller's pinned chrome covers each edge of its frame, over the
 *  span a revealed box `b` (in the scroller's content coordinates) occupies:
 *  a visible child that ignores the scroll, stands against an edge and takes
 *  the pointer — a header bar, a footer, a side rail — hides what scrolls
 *  under it, so a reveal lands clear of it (CSS's scroll-padding, read from
 *  the tree). A layer spanning more than half the frame (an overlay stratum)
 *  is not chrome, and `skip` is the branch the revealed view is in. */
function pinnedEdges(s, skip, b) {
    const out = { top: 0, bottom: 0, left: 0, right: 0 };
    const fx = b.x - s.scrollX, fy = b.y - s.scrollY; // the box in the frame
    const sh = frameExtent(s, "height"), sw = frameExtent(s, "width");
    for (const k of s.childViews) {
        if (k === skip || !k.ignoreScroll || !k.visible || k.pointerEvents === "none")
            continue;
        const kx = k.x, ky = k.y, kw = k.width, kh = k.height;
        const acrossX = kx < fx + b.width && kx + kw > fx; // over the box's columns
        const acrossY = ky < fy + b.height && ky + kh > fy; // over the box's rows
        if (acrossX && kh < sh / 2) {
            if (ky <= 0.5)
                out.top = Math.max(out.top, ky + kh);
            else if (ky + kh >= sh - 0.5)
                out.bottom = Math.max(out.bottom, sh - ky);
        }
        if (acrossY && kw < sw / 2) {
            if (kx <= 0.5)
                out.left = Math.max(out.left, kx + kw);
            else if (kx + kw >= sw - 0.5)
                out.right = Math.max(out.right, sw - kx);
        }
    }
    return out;
}
/** The view a view paints in: its `paintsIn` when that is set, else its parent. */
function paintParent(v) {
    const p = v.paintsIn;
    if (p instanceof View && p !== v.parent)
        return p;
    return v.parent instanceof View ? v.parent : null;
}
/** Does a scroller have anything to scroll, on an axis it scrolls? */
function overflows(n) {
    const ax = n.scrolls;
    return ((ax === "x" || ax === "both") && n.contentWidth > n.width + 0.5)
        || ((ax === "y" || ax === "both") && n.contentHeight > n.height + 0.5);
}
/** Can the person still reach `v`: focusable and shown, every ancestor shown,
 *  and — for a Tab stop — named by each ancestor's own `tabOrder()` where one
 *  gates its members.
 *  Read inside a constraint, so each of those is tracked. */
function reachable(v) {
    if (!canFocus(v) || v.$root === null)
        return false;
    for (let c = v, p = parentAcross(v); p !== null; c = p, p = parentAcross(p)) {
        if (!p.visible)
            return false;
        if (c.parent !== p)
            continue; // crossed an island: its tenant is its whole content
        const own = p.tabOrder;
        // a quiet view is never a stop, so no tabOrder() lists it: shown is enough
        if (typeof own === "function" && v.focusable !== "quiet") { // a view has one only where a program gates its members
            if (!tabOrderOf(p).includes(c) && !gatedBelow(p, c))
                return false;
        }
    }
    return true;
}
/** `tabOrder()` may name a descendant deeper than the direct child on the
 *  path (a bar naming `top.brand`): the path still counts as named when any
 *  named member holds the child. */
function gatedBelow(p, c) {
    for (const m of tabOrderOf(p)) {
        for (let n = m; n !== null && n !== p; n = n.parent instanceof View ? n.parent : null)
            if (n === c)
                return true;
    }
    return false;
}
function spotView(s) {
    return s instanceof View ? s : s.parent;
}
/** The spot Tab starts from, in what is shown. A spot inside a view that is now
 *  hidden — the place a form held in a popover that has since closed — has no
 *  stops around it: Tab starts from the outermost hidden view's place instead,
 *  in the cycle around it, as the web's starting point falls back when its node
 *  goes away. `from` is the view whose cycle Tab moves in. */
function shownSpot(s) {
    let hidden = null;
    for (let v = spotView(s); v !== null; v = parentAcross(v))
        if (!v.visible)
            hidden = v;
    if (hidden === null)
        return { spot: s, from: spotView(s) };
    return { spot: hidden, from: parentAcross(hidden) ?? hidden };
}
/** Does `v` come after the spot, in the tree's order? */
function afterSpot(s, v) {
    if (s instanceof View)
        return precedes(s, v);
    if (v === s.parent || !insideAcross(v, s.parent))
        return precedes(s.parent, v) && !insideAcross(v, s.parent);
    let c = v;
    while (c.parent !== s.parent && parentAcross(c) !== null)
        c = parentAcross(c);
    return s.parent.childViews.indexOf(c) >= s.at;
}
function precedes(a, b) {
    if (a === b)
        return false;
    const chain = (v) => { const out = []; for (let n = v; n !== null; n = parentAcross(n))
        out.unshift(n); return out; };
    const ca = chain(a), cb = chain(b);
    let i = 0;
    while (i < ca.length && i < cb.length && ca[i] === cb[i])
        i++;
    if (i === ca.length)
        return true; // a holds b
    if (i === cb.length)
        return false; // b holds a
    if (i === 0)
        return false; // different programs: no order
    const kids = ca[i - 1].childViews;
    return kids.indexOf(ca[i]) < kids.indexOf(cb[i]);
}
/** A view's address, for what the runtime says about it. */
function where(v) {
    let r = v;
    while (r.parent instanceof View)
        r = r.parent;
    return pathOf(r, v);
}
/** Is the view and everything above it visible? */
function shownChain(v) {
    for (let n = v; n !== null; n = parentAcross(n))
        if (!n.visible)
            return false;
    return true;
}
const WARNED = new WeakMap();
function warnOnce(v, said) {
    const seen = WARNED.get(v) ?? new Set();
    const key = said.slice(0, 24);
    if (seen.has(key))
        return;
    seen.add(key);
    WARNED.set(v, seen);
    console.warn(`[Declare] ${said}`);
}
function canFocus(v) {
    return ((v.focusable || v.link !== "" || scopeOf(v) === "region") && v.visible) || bareScroller(v);
}
/** What last had focus inside each scope (§13.2: a scope remembers). */
const MEMORY = new WeakMap();
function remember(f) {
    for (let v = parentAcross(f); v !== null; v = parentAcross(v)) {
        if (scopeOf(v) !== "none")
            MEMORY.set(v, f);
    }
}
/** The view one level up, crossing from a tenant's root to its island. */
function parentAcross(v) {
    if (v.parent instanceof View)
        return v.parent;
    return v.$hostIsland ?? null;
}
/** The tenant root an island view leads to, when it has one mounted. */
function tenantOf(v) {
    const t = v.$tenant ?? null;
    return t instanceof View ? t : null;
}
function insideAcross(node, ancestor) {
    for (let v = node; v !== null; v = parentAcross(v))
        if (v === ancestor)
            return true;
    return false;
}
/** Where focus lands entering a scope: for a `stop`, its own choice
 *  (`focusEntry()` — the selected segment, the checked radio), else the scope
 *  itself when it takes focus (a list), else what last had focus in it, else its
 *  first stop; for a `region`, what last had focus in it, else its first stop. */
function entryOf(s) {
    if (scopeOf(s) === "stop") {
        const fe = s.focusEntry;
        if (typeof fe === "function") {
            const r = fe.call(s);
            if (r instanceof View && canFocus(r) && insideAcross(r, s))
                return r;
        }
    }
    // a stop that holds focus itself (a list, a grid) is entered at itself; its
    // rows' controls are reached by Enter, never by Tab
    if (scopeOf(s) === "stop" && canFocus(s))
        return s;
    const m = MEMORY.get(s);
    if (m !== undefined && m !== s && canFocus(m) && insideAcross(m, s))
        return m; // a discarded view is no longer inside
    const first = sequence(s)[0];
    return first !== undefined ? first.view : canFocus(s) ? s : null;
}
/** The entries of `root`'s cycle: preorder over each view's `tabOrder()`; a
 *  `stop` or `region` is one entry; a `modal` is reached only from inside; an
 *  island's tenant splices its own entries in, or stands as one stop. */
function sequence(root) {
    const out = [];
    for (const m of tabOrderOf(root))
        visit(m, out);
    const t = tenantOf(root);
    if (t !== null)
        visit(t, out);
    return out;
}
function visit(m, out) {
    if (!m.visible)
        return;
    const k = scopeOf(m);
    if (k === "modal")
        return;
    if (k === "region") {
        out.push({ view: m, scope: m });
        return;
    }
    if (k === "stop") {
        const t = entryOf(m);
        if (t !== null)
            out.push({ view: t, scope: m });
        return;
    }
    const tenant = tenantOf(m);
    if (tenant !== null) {
        const inner = [];
        visit(tenant, inner);
        if (inner.length > 0)
            out.push(...inner);
        else if (canFocus(m))
            out.push({ view: m, scope: null });
        return;
    }
    if (m.focusable === true || m.link !== "")
        out.push({ view: m, scope: null }); // links are stops (§0.4); a quiet view is not
    const at = out.length;
    for (const c of tabOrderOf(m))
        visit(c, out);
    // a scroller nothing inside it takes focus is a stop of its own, so the keyboard
    // can scroll what it holds (bareScroller)
    if (out.length === at && !m.focusable && m.link === "" && m.scrolls !== "none")
        out.push({ view: m, scope: null });
}
/** A scroller with nothing inside it that takes focus — a pane of text, a strip
 *  of pictures — is a Tab stop of its own, as Firefox and Chrome make it, so a
 *  keyboard can scroll it (WCAG 2.1.1): focused, the arrows, Page Up/Down, Space,
 *  Home and End scroll it. A scroller that holds anything focusable is not: Tab
 *  reaches into it, and what it focuses is revealed. */
export function bareScroller(v) {
    if (v.scrolls === "none" || v.focusable || v.link !== "" || !v.visible)
        return false;
    // `focusable = false` said outright (or bound) is the author's word: the
    // scroller is not a stop, whatever it holds — the default false is not a word
    if (isSet(v, "focusable") || ownerOf(v, "focusable") !== null)
        return false;
    const inner = [];
    for (const c of tabOrderOf(v))
        visit(c, inner);
    return inner.length === 0;
}
/** The entry `f` is at: the entry itself, or the scope entry it is inside. */
function entryIndex(seq, f) {
    const i = seq.findIndex((e) => e.view === f);
    if (i >= 0)
        return i;
    return seq.findIndex((e) => e.scope !== null && insideAcross(f, e.scope));
}
/** The `stop` `f` is one of the members of — its nearest stop, with no
 *  focusable view between them, and not one that takes focus itself (a list's
 *  rows are reached by Enter) — or null. */
function memberStop(f) {
    for (let v = parentAcross(f); v !== null; v = parentAcross(v)) {
        const k = scopeOf(v);
        if (k === "stop")
            return canFocus(v) ? null : v;
        if (k === "region" || k === "modal" || v.focusable)
            return null;
    }
    return null;
}
/** The base `onKeyDown` (view.ts): in a stop, Right/Down move focus to the
 *  next member and Left/Up to the previous, wrapping, and Home/End to the
 *  first and last — the members in the stop's Tab order, a nested scope one
 *  member. Not with a modifier, and never in a text field (its arrows move the
 *  caret). */
function arrowDefault(f, ev) {
    const e = ev;
    if (Focus.getFocus() === f && !e.ctrl && !e.alt && !e.meta && scrollKeys(f, e))
        return;
    if (e.ctrl || e.alt || e.meta || e.shift || Focus.getFocus() !== f)
        return;
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (d === 0 && e.key !== "Home" && e.key !== "End")
        return;
    if (isTextField(f))
        return;
    const s = memberStop(f);
    if (s === null)
        return;
    const seq = sequence(s).filter((x) => canFocus(x.view));
    const i = entryIndex(seq, f);
    if (i < 0 || seq.length < 2 && d !== 0)
        return;
    const n = e.key === "Home" ? 0 : e.key === "End" ? seq.length - 1 : (i + d + seq.length) % seq.length;
    if (n !== i)
        Focus.land(seq[n].view); // as Tab lands: keyboard focus, revealed
}
/** The keys a focused bare scroller (bareScroller) takes: a line with the arrows,
 *  a page with Page Up/Down and Space (Shift-Space back), the ends with Home and
 *  End — along the axis it scrolls. True when the key scrolled it. */
const LINE = 40;
function scrollKeys(f, e) {
    if (f.scrolls === "none" || !bareScroller(f))
        return false;
    const v = f.scrolls !== "x", h = f.scrolls !== "y";
    const page = (v ? f.height : f.width) * 0.9;
    const by = (d) => { if (v)
        f.scrollTo(f.scrollY + d);
    else
        f.scrollToX(f.scrollX + d); };
    switch (e.key) {
        case "ArrowDown":
            if (!v)
                return false;
            f.scrollTo(f.scrollY + LINE);
            return true;
        case "ArrowUp":
            if (!v)
                return false;
            f.scrollTo(f.scrollY - LINE);
            return true;
        case "ArrowRight":
            if (!h)
                return false;
            f.scrollToX(f.scrollX + LINE);
            return true;
        case "ArrowLeft":
            if (!h)
                return false;
            f.scrollToX(f.scrollX - LINE);
            return true;
        case "PageDown":
            by(page);
            return true;
        case "PageUp":
            by(-page);
            return true;
        case " ":
            by(e.shift ? -page : page);
            return true;
        case "Home":
            if (v)
                f.scrollTo(0);
            else
                f.scrollToX(0);
            return true;
        case "End": {
            // the far edge of what it holds
            let far = 0;
            for (const c of f.children)
                if (c instanceof View && c.visible)
                    far = Math.max(far, v ? c.y + c.height : c.x + c.width);
            if (v)
                f.scrollTo(Math.max(0, far - f.height));
            else
                f.scrollToX(Math.max(0, far - f.width));
            return true;
        }
        default: return false;
    }
}
/** The `stop` whose member scope focus has entered — focus inside a stop on a
 *  view that is not one of the stop's own members (a field in a list's row, an
 *  editor in a grid's cell) — or null. A stop's own members are the views its
 *  arrows move among: the stop itself when it takes focus (a list), else its
 *  focusable views with no focusable view between them and it (segments). */
function enteredStop(f) {
    let below = false; // a focusable view between f and the scope
    for (let v = parentAcross(f); v !== null; v = parentAcross(v)) {
        const k = scopeOf(v);
        if (k === "stop")
            return canFocus(v) || below ? v : null;
        if (k === "region" || k === "modal")
            return null;
        if (v.focusable)
            below = true;
    }
    return null;
}
/** The cycle Tab moves in from `f`: the innermost `region` or `modal` around
 *  it, or the member scope it has entered inside a `stop` (the stop's child on
 *  the way down — a row), or the outermost program. A view that is itself a
 *  region moves in its parent's cycle. */
function cycleOf(f) {
    // a modal overlay holding focus itself (nothing inside it to focus) is its
    // own cycle: Tab has nowhere to go, and does not leave it
    if (scopeOf(f) === "modal")
        return f;
    const s = enteredStop(f);
    let child = f;
    for (let v = parentAcross(f); v !== null; child = v, v = parentAcross(v)) {
        if (s !== null && v === s)
            return child;
        const k = scopeOf(v);
        if (k === "region" || k === "modal")
            return v;
    }
    return child;
}
/** A view's ordered traversal members: its `tabOrder()` override if it defines
 *  one (an instance method, installed by the language), else `tabDefault()`.
 *  Non-View entries are dropped defensively. */
function tabOrderOf(v) {
    const fn = v.tabOrder;
    const members = typeof fn === "function" ? fn.call(v) : v.tabDefault();
    return Array.isArray(members) ? members.filter((m) => m instanceof View) : [];
}
function rootOf(view) {
    let v = view;
    while (v.parent instanceof View)
        v = v.parent;
    return v;
}
/** Is `node` in a program embedded, at any depth, by `island`? */
function within(node, island) {
    for (let p = rootOf(node); p !== null;) {
        const host = p.$hostIsland ?? null;
        if (host === null)
            return false;
        if (host === island)
            return true;
        p = rootOf(host);
    }
    return false;
}
function isInSubtree(node, ancestor) {
    for (let v = node; v !== null; v = v.parent instanceof View ? v.parent : null) {
        if (v === ancestor)
            return true;
    }
    return false;
}
/** Wire a Keys service to a Focus service: `Tab` / `Shift-Tab` are consumed by
 *  focus traversal; every other key is delivered to the focused view as
 *  `onKeyDown` / `onKeyUp` (target-only, no bubbling — D-2). Returns an
 *  unsubscribe thunk. The runtime entry calls this; a test drives it with a
 *  fresh KeysService. (v1: Tab is always the traversal key; a field that wants
 *  a literal Tab is a later refinement.) */
/** Pairs already delivering → their off(). The browser calls deliverKeys once
 *  per document; a long-lived host calls it per MOUNT (boot.ts wireInput), and
 *  each un-guarded call stacked another pair of handlers that nothing ever
 *  removed — the other half of the native host's N² Tab advances (keys.ts
 *  `listen` has the full account). A repeat call on the same pair now returns
 *  the existing off. Weak on the keys service; tests constructing fresh
 *  services are untouched. */
const DELIVERING = new WeakMap();
export function deliverKeys(keys, focus) {
    const perFocus = DELIVERING.get(keys) ?? new WeakMap();
    DELIVERING.set(keys, perFocus);
    const existing = perFocus.get(focus);
    if (existing !== undefined)
        return existing;
    focus.keys = keys;
    // Esc then Tab leaves a region (planes.md §13.3): an Esc with nothing open
    // to close arms a one-shot, and a Tab that comes next moves to the next
    // region — Shift-Tab the previous — as F6 does. Any other key disarms it.
    // The way out that every browser leaves to the page (CodeMirror's rule).
    let escArmed = false;
    const offDown = keys.onKeyDown((e) => {
        if (!/^(Shift|Control|Alt|Meta)(Left|Right)?$/.test(e.code))
            focus.lastInputKeyboard = true;
        // a modifier going down on its own (Shift, for Shift-Tab) keeps it armed
        const lone = /^(Shift|Control|Alt|Meta)(Left|Right)?$/.test(e.code);
        const armed = escArmed;
        if (!lone)
            escArmed = false;
        if (e.code === "Tab" && armed && !e.ctrl && !e.alt && !e.meta && !keys.navClaimed() && focus.inRegion()) {
            focus.nextRegion(e.shift ? -1 : 1);
            return;
        }
        if (e.code === "Escape" && !e.repeat && !keys.navClaimed())
            escArmed = true;
        if (e.code === "Tab") {
            // an open overlay that holds the keys while focus is outside it, or that
            // holds the focus itself rather than anything inside it (a menu, naming
            // the row its keys are on): Tab closes it as Esc would, then moves on from
            // its opener — the web's menu-button rule; focus never goes behind a menu
            // left open
            const c = keys.claimant();
            if (c instanceof View && (!focus.holds(c) || (focus.getFocus() === c && c.focusScope !== "modal"))) {
                const held = c;
                const back = focus.getFocus() === c ? held._savedFocus ?? null : null;
                if (back !== null)
                    held._savedFocus = null; // it goes back now, not after the close
                if (typeof held.escape === "function")
                    held.escape.call(c);
                if (back !== null)
                    focus.focus(back);
            }
            if (e.shift)
                focus.prev();
            else
                focus.next();
            return;
        }
        // the region keys move among windows, panes and bars — not while an
        // overlay holds the keyboard (planes.md §13.3)
        // — F6, fixed for now; some browsers take it (conventions-record.md)
        if (e.key === "F6" && !keys.navClaimed()) {
            focus.nextRegion(e.shift ? -1 : 1);
            return;
        }
        // an open overlay owns the navigation keys: they are not also the focused
        // view's when focus is outside it (a menu roves while focus stays on its
        // opener) — focus inside it (a dialog's field, a popover's slider) keeps
        // its keys (keys.ts overlayOwns)
        if (keys.overlayOwns(e) && !focus.focusInClaimant(keys))
            return;
        const f = focus.getFocus();
        if (f !== null) {
            // Enter on a region focused as one stop enters it
            if (e.code === "Enter" && f.focusScope === "region" && focus.enter())
                return;
            // Enter on a focused LINKED view follows the reference — the <a>
            // contract's keyboard half (location.md §0.4). The handler still fires
            // (coexistence rule: handler, then follow — same order as a click).
            fireEvent(f, "keyDown", e);
            if (e.code === "Enter" && f.link !== "") {
                const app = f.$root;
                app?.followLink?.(f.link, f.replace);
            }
            // Esc closes a member scope entered inside a stop — after the focused
            // view has had it (an editor cancels its edit first)
            if (e.code === "Escape" && focus.getFocus() === f)
                focus.leaveMember();
        }
    });
    const offUp = keys.onKeyUp((e) => {
        if (e.code === "Tab")
            return;
        if (keys.overlayOwns(e) && !focus.focusInClaimant(keys))
            return;
        const f = focus.getFocus();
        if (f !== null)
            fireEvent(f, "keyUp", e);
    });
    const off = () => {
        perFocus.delete(focus);
        offDown();
        offUp();
    };
    perFocus.set(focus, off);
    return off;
}
/** The runtime's focus service (LZX's lz.Focus). */
export const Focus = new FocusService();
// A context menu asked for from the keyboard is for the focused view, or for the
// item it names as the one the keys are on (a list's active row).
provideKeyContextTarget(() => { const f = Focus.getFocus(); return f === null ? null : f.accessibilityActiveItem ?? f; });
// Register the discard hook (input.md §mutation): keeps focus off a subtree
// that is being torn down. One-directional — focus.ts imports view.ts, not the
// reverse — so no import cycle.
setFocusDiscardHook((view) => Focus.noteDiscarded(view));
setKeyDefaultHook(arrowDefault);
//# sourceMappingURL=focus.js.map