// Keys — the raw keyboard service (docs/system-design/input.md, Layer 1). The bottom
// of the input stack: key up/down, modifier state, a held-key set, and chords —
// useful with NO focused field (shortcuts, games, key-repeat). DOM is the
// kernel reference (LZX's LzKeyboardKernel is itself a thin wrapper over DOM
// keydown/keyup); keys always originate from the DOM host — canvas included —
// so this service normalizes ONE DOM source regardless of backend, and the
// focus layer (focus.ts, next) subscribes to it to deliver to the focused view.
//
// The CORE is pure: it accepts already-normalized KeyEvents, keeps state, and
// dispatches — so it unit-tests with synthetic events, no browser. `listen()`
// is the thin DOM adapter that feeds the core from a host, self-retiring on the
// `alive` gate exactly like routeInput (input.ts).
/** The keyboard service. A singleton `Keys` is exported for the runtime; tests
 *  construct their own instance and drive `keyDown`/`keyUp` directly. */
/** Injected by index.ts (keys.ts sits below focus.ts in the module graph):
 *  "does a Declare view hold keyboard focus right now?" — the predicate the
 *  listener uses to claim Space/arrows from the browser's scroll defaults. */
let keysFocusProbe = null;
export function setKeysFocusProbe(fn) {
    keysFocusProbe = fn;
}
export class KeysService {
    /** The held-key set (LZX's downKeysHash) — what is pressed right now. */
    heldKeys = new Set();
    /** Views currently claiming the NAVIGATION keys (arrows, Space, Home/End,
     *  PageUp/Down) from the browser's scroll defaults — an open Menu chain,
     *  any overlay that roves with arrows while nothing holds Declare focus.
     *  A Set of claimant owners so overlapping claims (a menu over a menu)
     *  compose; `navClaim(owner, false)` releases only its own. */
    navClaims = new Set();
    navHandlers = new Set();
    /** Claim (or release) the navigation keys for `owner`. While any claim is
     *  live, the DOM listener prevents the browser's scroll defaults for the
     *  nav keys exactly as it does when a Declare control holds focus — an
     *  open menu's arrows rove the menu, never scroll the page. Idempotent.
     *  0↔1 transitions notify onNavClaim subscribers (the FocusRing stands
     *  down while an overlay owns the keys — the menu's rover is the focus). */
    navClaim(owner, on) {
        const was = this.navClaims.size > 0;
        if (on)
            this.navClaims.add(owner);
        else
            this.navClaims.delete(owner);
        const is = this.navClaims.size > 0;
        if (was !== is)
            for (const fn of [...this.navHandlers])
                fn(is);
    }
    /** Is any navigation-keys claim live right now? */
    navClaimed() {
        return this.navClaims.size > 0;
    }
    /** Subscribe to nav-claim TRANSITIONS (true = an overlay took the keys,
     *  false = the last claim released). Returns the unsubscribe thunk. */
    onNavClaim(fn) {
        this.navHandlers.add(fn);
        return () => this.navHandlers.delete(fn);
    }
    downHandlers = new Set();
    upHandlers = new Set();
    chords = [];
    /** Is this physical key (KeyboardEvent.code) down right now? The "key
     *  bitmap" query. */
    isDown(code) {
        return this.heldKeys.has(code);
    }
    /** Every currently-held code (a copy — callers may not mutate the set). */
    held() {
        return [...this.heldKeys];
    }
    /** Subscribe to key-down / key-up. Returns an unsubscribe thunk. */
    onKeyDown(fn) {
        this.downHandlers.add(fn);
        return () => this.downHandlers.delete(fn);
    }
    onKeyUp(fn) {
        this.upHandlers.add(fn);
        return () => this.upHandlers.delete(fn);
    }
    /** Fire `fn` once when every code in `codes` is simultaneously held (LZX's
     *  callOnKeyCombo). Re-arms once any of the keys releases. Returns an
     *  unsubscribe thunk. (v1 matches physical codes; modifier-normalized
     *  chords — "ctrl"+"KeyS" — are a later refinement.) */
    onChord(codes, fn) {
        const chord = { codes: new Set(codes), fn, active: false };
        this.chords.push(chord);
        return () => {
            const i = this.chords.indexOf(chord);
            if (i >= 0)
                this.chords.splice(i, 1);
        };
    }
    // ── Fed by the adapter (or a test) ────────────────────────────────────────
    /** A key went down: record it, fire the down stream, then complete any chord
     *  whose keys are now all held. */
    keyDown(e) {
        this.heldKeys.add(e.code);
        for (const h of [...this.downHandlers])
            h(e);
        for (const c of this.chords) {
            if (!c.active && this.allHeld(c.codes)) {
                c.active = true;
                c.fn();
            }
        }
    }
    /** A key went up: drop it, fire the up stream, then re-arm any chord it broke. */
    keyUp(e) {
        this.heldKeys.delete(e.code);
        for (const h of [...this.upHandlers])
            h(e);
        for (const c of this.chords) {
            if (c.active && !this.allHeld(c.codes))
                c.active = false;
        }
    }
    /** Release everything — on app blur, so a key held across a focus-out does
     *  not stick (a key-up may never arrive while the app is unfocused). */
    clearHeld() {
        this.heldKeys.clear();
        for (const c of this.chords)
            c.active = false;
    }
    allHeld(codes) {
        for (const code of codes)
            if (!this.heldKeys.has(code))
                return false;
        return true;
    }
    /** Wire this service to a DOM host: keydown/keyup feed the core, blur clears
     *  the held set. Listeners live on `window` (a key released outside the tree
     *  must still update state) and self-retire once `alive` goes false — the
     *  same discipline as routeInput. Node-free core; only this method touches
     *  the DOM.
     *
     *  IDEMPOTENT PER TARGET. A browser calls this once per document, so
     *  stacking never showed there — but a LONG-LIVED host re-mounts app after
     *  app into one process, and wireInput calls this per mount. Un-guarded,
     *  each mount stacked another listener trio whose `alive` (the old app's)
     *  never went false, so every keydown fed the core once per mount ever
     *  made: N listeners × N delivery handlers = N² focus advances per Tab on
     *  the native host, with N² 's parity alternating per boot — measured
     *  2026-08-01 as nextCalls 9, 16, 25, 36 on four consecutive boots, and
     *  presenting for two days as a focus "coin toss". A repeat call now
     *  REPLACES the previous registration's liveness probe instead of adding
     *  listeners: the newest app owns the wire, exactly re-mount semantics. */
    listen(alive, target = window) {
        const bound = LISTENING.get(target);
        if (bound !== undefined) {
            bound.alive = alive;
            return;
        }
        const box = { alive };
        LISTENING.set(target, box);
        const isAlive = () => box.alive();
        const retire = () => {
            LISTENING.delete(target);
            target.removeEventListener("keydown", onDown);
            target.removeEventListener("keyup", onUp);
            target.removeEventListener("blur", onBlur);
        };
        const focusHolds = () => keysFocusProbe !== null && keysFocusProbe();
        const onDown = (ev) => {
            if (!isAlive())
                return retire();
            // Declare owns Tab traversal (Layer 2); stop the browser from also moving its
            // own focus, which would fight the focus service (and skip a canvas app's
            // overlay inputs).
            if (ev.key === "Tab")
                ev.preventDefault();
            // When a Declare CONTROL holds keyboard focus, Space and the arrows are
            // the control's (Space/Enter activate; arrows adjust a slider) — the
            // browser's defaults (page scroll) must stand down. A native editable
            // (its own element focused) keeps every default: typing a space in a
            // field is a space.
            if (document.activeElement === document.body || document.activeElement === null) {
                const nav = ev.key === " " || ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight";
                const jump = ev.key === "Home" || ev.key === "End" || ev.key === "PageUp" || ev.key === "PageDown";
                if ((nav && (focusHolds() || this.navClaimed())) || (jump && this.navClaimed()))
                    ev.preventDefault();
            }
            this.keyDown(normalize(ev));
        };
        const onUp = (ev) => {
            if (!isAlive())
                return retire();
            this.keyUp(normalize(ev));
        };
        const onBlur = () => {
            if (!isAlive())
                return retire();
            this.clearHeld();
        };
        target.addEventListener("keydown", onDown);
        target.addEventListener("keyup", onUp);
        target.addEventListener("blur", onBlur);
    }
}
/** A DOM KeyboardEvent → the normalized KeyEvent the core consumes. */
export function normalize(ev) {
    return {
        code: ev.code,
        key: ev.key,
        shift: ev.shiftKey,
        ctrl: ev.ctrlKey,
        alt: ev.altKey,
        meta: ev.metaKey,
        repeat: ev.repeat,
    };
}
/** The runtime's keyboard service (LZX's lz.Keys). */
/** Targets this service is already listening on → the liveness box a repeat
 *  `listen` swaps its probe into (see listen's idempotence note). Weak: a
 *  discarded shim window carries its registration away. */
const LISTENING = new WeakMap();
export const Keys = new KeysService();
//# sourceMappingURL=keys.js.map