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
export class KeysService {
    /** The held-key set (LZX's downKeysHash) — what is pressed right now. */
    heldKeys = new Set();
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
     *  the DOM. */
    listen(alive, target = window) {
        const onDown = (ev) => {
            if (!alive())
                return void target.removeEventListener("keydown", onDown);
            // Declare owns Tab traversal (Layer 2); stop the browser from also moving its
            // own focus, which would fight the focus service (and skip a canvas app's
            // overlay inputs).
            if (ev.key === "Tab")
                ev.preventDefault();
            this.keyDown(normalize(ev));
        };
        const onUp = (ev) => {
            if (!alive())
                return void target.removeEventListener("keyup", onUp);
            this.keyUp(normalize(ev));
        };
        const onBlur = () => {
            if (!alive())
                return void target.removeEventListener("blur", onBlur);
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
export const Keys = new KeysService();
//# sourceMappingURL=keys.js.map