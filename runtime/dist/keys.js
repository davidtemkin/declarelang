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
let WALK = null;
/** The bindings in force where focus is, read along the walk (focus.ts): what
 *  the hold-⌘ panel lists. Injected, as the walk is. */
let IN_FORCE = null;
export function setInForce(fn) {
    IN_FORCE = fn;
}
export function setKeyWalk(fn) {
    WALK = fn;
}
/** The modifier glyphs in their display order. */
const MOD_ORDER = ["⌃", "⌥", "⇧", "⌘"];
// Spelled the Windows way (key-bindings.md): Ctrl is the command key — ⌘ on a
// Mac, Ctrl elsewhere — and MacCtrl the Mac's own Control key (⌃).
const MOD_WORDS = { ctrl: "⌘", control: "⌘", macctrl: "⌃", alt: "⌥", option: "⌥", opt: "⌥", shift: "⇧", cmd: "⌘", command: "⌘", meta: "⌘" };
const KEY_NAMES = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Enter: "↩", Escape: "⎋", Esc: "⎋",
    Backspace: "⌫", Delete: "⌦", Tab: "⇥", " ": "Space",
};
const IS_MAC = typeof navigator === "undefined" || /Mac|iPhone|iPad/.test(navigator.platform ?? "");
export const KEYS_ON_MAC = IS_MAC;
/** A key event as a shortcut's spelling: modifiers in display order, then the
 *  key (a letter upper-cased, a named key by its glyph). ⌘ is the command key:
 *  Meta on a Mac, Control elsewhere. */
export function comboOf(e) {
    const cmd = e.meta || (!IS_MAC && e.ctrl);
    const k = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    // a typed symbol already says Shift (? is ⇧/): only a letter or a named
    // key spells ⇧ out (⇧⌘Z)
    const shift = e.shift && !(e.key.length === 1 && !/[a-z]/i.test(e.key));
    return (IS_MAC && e.ctrl ? "⌃" : "") + (e.alt ? "⌥" : "") + (shift ? "⇧" : "") + (cmd ? "⌘" : "") + k;
}
/** A declared spelling, normalized: glyphs or words (`"Cmd+Shift+Z"`), any
 *  order, to the one form comboOf produces. */
export function normalizeCombo(spec) {
    let rest = spec.trim();
    const mods = new Set();
    for (;;) {
        const g = MOD_ORDER.find((m) => rest.startsWith(m));
        if (g !== undefined) {
            mods.add(g);
            rest = rest.slice(g.length);
            continue;
        }
        const w = /^([A-Za-z]+)[+-]/.exec(rest);
        if (w !== null && MOD_WORDS[w[1].toLowerCase()] !== undefined) {
            mods.add(MOD_WORDS[w[1].toLowerCase()]);
            rest = rest.slice(w[0].length);
            continue;
        }
        break;
    }
    const k = KEY_NAMES[rest] ?? (rest.length === 1 ? rest.toUpperCase() : rest);
    return MOD_ORDER.filter((m) => mods.has(m)).join("") + k;
}
/** A key as the platform says it, for showing (a menu, the hold-⌘ panel): a
 *  Mac's glyphs in the Mac's order (`"Ctrl+Shift+S"` → `⇧⌘S`), and elsewhere
 *  the words (`Ctrl+Shift+S`) — what the person sees on their own keyboard. */
export function keyLabel(spec) {
    const c = normalizeCombo(spec);
    if (KEYS_ON_MAC)
        return c;
    let rest = c;
    const words = [];
    for (const [g, w] of [["⌃", "Ctrl"], ["⌘", "Ctrl"], ["⌥", "Alt"], ["⇧", "Shift"]]) {
        if (rest.includes(g)) {
            if (!words.includes(w))
                words.push(w);
            rest = rest.split(g).join("");
        }
    }
    const order = ["Ctrl", "Alt", "Shift"];
    return [...order.filter((w) => words.includes(w)), rest].join("+");
}
/** The same press spelled from its physical key (`code`): KeyS → S, Digit1 → 1.
 *  A letter or digit on a non-Latin layout, or under ⌥ on a Mac (⌥A types å),
 *  still matches its binding this way. Null when the code names no letter or digit. */
export function comboOfCode(e) {
    const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code);
    if (m === null)
        return null;
    return comboOf({ ...e, key: m[1] ?? m[2] });
}
/** The chords a text field answers itself — select all, the clipboard, undo
 *  and redo, and the caret's command moves. While a field has focus they stay
 *  the field's, whatever a program declares: the Mac's first-responder rule
 *  (a field's editing commands come before the menu's key equivalents). A
 *  focused text field's table ends with these as `native` (focus.ts). */
export const FIELD_CHORDS = new Set(["⌘A", "⌘C", "⌘X", "⌘V", "⌘Z", "⇧⌘Z", "⌘Y", "⌘←", "⌘→", "⌘↑", "⌘↓", "⇧⌘←", "⇧⌘→", "⇧⌘↑", "⇧⌘↓", "⌥←", "⌥→", "⇧⌥←", "⇧⌥→", "⌥⌫", "⌘⌫", "⌃A", "⌃E", "⌃K"]);
/** Does a combo carry a command modifier (anything but ⇧)? */
export const commanded = (combo) => /[⌃⌥⌘]/.test(combo) || /^F\d+$/.test(combo.replace(/^[⇧]/, ""));
/** Does this press type a character into a field rather than name a chord —
 *  AltGr on Windows, ⌥ on a Mac? (key-bindings.md: such keys skip the tables
 *  while a text field has focus.) */
export function typesCharacter(e) {
    if (e.altGraph === true)
        return true;
    if (IS_MAC)
        return e.alt && !e.meta && !e.ctrl && (e.key.length === 1 || e.key === "Dead");
    // Windows: Ctrl+Alt that types something other than the key's own letter
    if (e.ctrl && e.alt && e.key.length === 1 && typeof e.keyCode === "number" && e.keyCode >= 48 && e.keyCode <= 90) {
        return e.key.toUpperCase() !== String.fromCharCode(e.keyCode);
    }
    return false;
}
/** Is the press part of an IME composition (Safari reports 229 just after)? */
export const composing = (e) => e.isComposing === true || e.keyCode === 229;
let PROGRAMS = null;
export function setKeysPrograms(p) {
    PROGRAMS = p;
}
/** The node whose compiled body is running, while it runs a body that names
 *  `Keys` (expr.ts sets it around exactly those bodies): who is asking
 *  `Keyboard.isDown`. Returns the previous caller, for the body to restore. */
let CALLER = null;
export function keysCaller(node) {
    const prev = CALLER;
    CALLER = node;
    return prev;
}
/** The modifier keys. A held modifier is the keyboard's state rather than a
 *  press — what a click reads to extend a selection — so every program sees
 *  it, the keyboard moving does not release it, and polling it claims nothing. */
const MODIFIERS = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);
/** A held key whose press no program can claim any more: the keyboard moved
 *  to another program while it was down, and the program that had it was
 *  told it went up. */
const ORPHAN = {};
/** The keyboard service. A singleton `Keys` is exported for the runtime; tests
 *  construct their own instance and drive `keyDown`/`keyUp` directly. */
/** Injected by index.ts (keys.ts sits below focus.ts in the module graph):
 *  "does a Declare view hold keyboard focus right now?" — the predicate the
 *  listener uses to claim Space/arrows from the browser's scroll defaults. */
let keysFocusProbe = null;
export function setKeysFocusProbe(fn) {
    keysFocusProbe = fn;
}
/** Does a Declare view hold keyboard focus right now? */
export function keysFocusHeld() {
    return keysFocusProbe !== null && keysFocusProbe();
}
export class KeysService {
    /** The held keys (LZX's downKeysHash) — what is pressed right now, each
     *  with the program it was pressed in. */
    heldKeys = new Map();
    /** The program that had the keyboard at the last look, to see it move. */
    lastProgram = null;
    /** Polled keys → the views that poll them (Rule 2): a key a shown view of
     *  the keyboard program polls is the program's, and the browser's own use
     *  of it stands down. */
    claims = new Map();
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
        if (on) {
            this.dropTornDown();
            this.navClaims.delete(owner);
            this.navClaims.add(owner);
        }
        else
            this.navClaims.delete(owner);
        const is = this.navClaims.size > 0;
        if (was !== is)
            for (const fn of [...this.navHandlers])
                fn(is);
    }
    /** Is any navigation-keys claim live right now? */
    navClaimed() {
        return this._claimant() !== null;
    }
    /** The overlay the keys go to now: the latest claim that holds (focus is not
     *  in another context than its own), or null. */
    _claimant() {
        this.dropTornDown();
        let top = null;
        for (const c of this.navClaims)
            if (PROGRAMS === null || PROGRAMS.claimHolds(c))
                top = c;
        return top;
    }
    /** A program is leaving (its island unlinks): the claims its views hold go,
     *  as their closes would have released them. */
    releaseProgram(root) {
        for (const c of [...this.navClaims]) {
            let r = c;
            while (r.parent != null)
                r = r.parent;
            if (r === root)
                this.navClaim(c, false);
        }
    }
    /** A claimant torn down while open — a hosted program unmounted with its
     *  menu up — holds nothing any more: its claim goes, as a close would. */
    dropTornDown() {
        for (const c of [...this.navClaims])
            if (c.$tornDown === true)
                this.navClaim(c, false);
    }
    /** Was a claim live when the key now being dispatched arrived? Read once,
     *  before any handler runs: the handler that acts on the key (a menu's
     *  Enter picks and closes it) may release the claim mid-dispatch, and the
     *  rest of the same keypress must still see who owned it. */
    claimedAtDispatch = false;
    /** Does an overlay own this key? While an overlay claims the navigation
     *  keys — an open menu, a popover, a dialog — the arrows, Enter, Space,
     *  Escape and the jump keys are the overlay's: the focused view beneath does
     *  not also receive them (its Enter would re-press the button that opened the
     *  menu; its arrows would move a list's selection under an open context
     *  menu), and neither does a `Keys` member outside the topmost overlay (one
     *  Esc closes the popover and does nothing else — planes.md §9). */
    overlayOwns(e) {
        return this.claimedAtDispatch && OVERLAY_KEYS.has(e.key);
    }
    /** Subscribe to nav-claim TRANSITIONS (true = an overlay took the keys,
     *  false = the last claim released). Returns the unsubscribe thunk. */
    onNavClaim(fn) {
        this.navHandlers.add(fn);
        return () => this.navHandlers.delete(fn);
    }
    /** Handlers → the node that owns them (a `Keys` member), or null for the
     *  runtime's own (focus delivery), which hear every key. */
    downHandlers = new Map();
    upHandlers = new Map();
    chords = [];
    /** Is this physical key (KeyboardEvent.code) down right now? The "key
     *  bitmap" query. Asked from a body (expr.ts names the caller), it answers
     *  for the caller's program: a key is down for a program only if it went
     *  down while that program had the keyboard (Rule 1) — and the asking view
     *  claims the key from the browser (Rule 2). */
    isDown(code) {
        const h = this.heldKeys.get(code);
        const who = CALLER;
        if (who === null || PROGRAMS === null || MODIFIERS.has(code))
            return h !== undefined && h.program !== ORPHAN;
        this.claim(who, code);
        return h !== undefined && (h.program === null || h.program === PROGRAMS.programOf(who));
    }
    /** Every currently-held code (a copy — callers may not mutate the set);
     *  from a body, the ones held in the caller's program. */
    held() {
        const who = CALLER;
        const p = who !== null && PROGRAMS !== null ? PROGRAMS.programOf(who) : undefined;
        const out = [];
        for (const [code, h] of this.heldKeys) {
            if (p === undefined || MODIFIERS.has(code) ? h.program !== ORPHAN : h.program === null || h.program === p)
                out.push(code);
        }
        return out;
    }
    /** Record that `node`'s view polls `code`. The claim lasts until the view
     *  is discarded. */
    claim(node, code) {
        const view = PROGRAMS.viewOf(node);
        if (view === null)
            return;
        let set = this.claims.get(code);
        if (set === undefined)
            this.claims.set(code, (set = new Set()));
        if (set.has(view))
            return;
        set.add(view);
        PROGRAMS.onGone(view, () => { set.delete(view); });
    }
    /** Does a shown view of the keyboard program poll `code`? */
    claimed(code) {
        const set = this.claims.get(code);
        if (set === undefined || set.size === 0 || PROGRAMS === null)
            return false;
        const kp = PROGRAMS.keyboardProgram();
        for (const v of set)
            if (PROGRAMS.programOf(v) === kp && PROGRAMS.shown(v))
                return true;
        return false;
    }
    /** Subscribe to key-down / key-up. `owner` — the node a `Keys` member is —
     *  hears only the keys of its own program while that program has the
     *  keyboard (Rule 1); without one, every key. Returns an unsubscribe thunk. */
    onKeyDown(fn, owner = null) {
        this.downHandlers.set(fn, owner);
        return () => this.downHandlers.delete(fn);
    }
    onKeyUp(fn, owner = null) {
        this.upHandlers.set(fn, owner);
        return () => this.upHandlers.delete(fn);
    }
    /** The handlers a key pressed in `program` reaches. A key an open overlay
     *  owns reaches only the `Keys` members inside a claiming overlay. */
    reached(handlers, program, e = null) {
        const owned = e !== null && this.overlayOwns(e) && PROGRAMS !== null;
        const out = [];
        for (const [fn, owner] of handlers) {
            if (owner !== null && owned && !this.inClaimant(owner))
                continue;
            if (owner === null || program === null || PROGRAMS === null || PROGRAMS.programOf(owner) === program)
                out.push(fn);
        }
        return out;
    }
    /** Is this `Keys` member inside the overlay that claimed the keys last — the
     *  topmost? A dialog's Enter is not also the menu's open over it. */
    inClaimant(owner) {
        const top = this._claimant();
        return top !== null && PROGRAMS.inside(owner, top);
    }
    /** The keyboard may have moved to another program (focus moved): the one
     *  that had it is told each key it holds went up, and those presses are no
     *  program's any more — the program now holding the keyboard sees only
     *  keys pressed from here on. */
    keyboardMoved() {
        if (PROGRAMS === null)
            return;
        const now = PROGRAMS.keyboardProgram();
        if (now === this.lastProgram)
            return;
        this.lastProgram = now;
        for (const [code, h] of this.heldKeys) {
            if (h.program === null || h.program === ORPHAN || h.program === now || MODIFIERS.has(code))
                continue;
            const was = h.program;
            h.program = ORPHAN;
            const up = { ...h.e, repeat: false };
            for (const fn of this.reached(this.upHandlers, was))
                if (this.upHandlers.get(fn) !== null)
                    fn(up);
            for (const c of this.chords)
                if (c.active && c.codes.has(code))
                    c.active = false;
        }
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
    /** The declared shortcut sets, as their `Shortcuts` nodes register. */
    shortcutOwners = new Set();
    /** A `Shortcuts` node declares its set (it registers at init). */
    _declareShortcuts(owner) {
        // a set that left (its row rebuilt) goes as a new one comes, so the sets
        // held never outgrow the live ones, keys pressed or not
        for (const o of this.shortcutOwners)
            if (o.$tornDown === true)
                this.shortcutOwners.delete(o);
        this.shortcutOwners.add(owner);
    }
    /** The owners in force, nearest scope first: each paired with its depth on
     *  the focus chain. */
    ownersInForce() {
        if (PROGRAMS === null)
            return [];
        const chain = PROGRAMS.focusChain();
        const out = [];
        for (const o of [...this.shortcutOwners]) {
            if (o.$tornDown === true) {
                this.shortcutOwners.delete(o);
                continue;
            }
            const scope = o.on != null ? o.on : o.parent;
            const d = scope != null ? chain.indexOf(scope) : -1;
            if (d >= 0)
                out.push({ owner: o, depth: d });
        }
        return out.sort((a, b) => a.depth - b.depth);
    }
    /** The shortcuts in force where focus is now, nearest declaration of each
     *  key first — what a hold-⌘ panel lists: `{ id, key, label, enabled,
     *  origin, group }`, `origin` being the declaring set's `title` and `group`
     *  the menu a menu bar's shortcut sits in (else the origin). */
    shortcutsInForce() {
        if (IN_FORCE !== null)
            return IN_FORCE();
        const seen = new Set();
        const out = [];
        for (const { owner } of this.ownersHeard()) {
            const items = Array.isArray(owner.items) ? owner.items : [];
            for (const r of items) {
                if (typeof r?.key !== "string" || r.key === "")
                    continue;
                const c = normalizeCombo(r.key);
                if (seen.has(c))
                    continue;
                seen.add(c);
                out.push({ id: r.id, key: r.key, keyLabel: keyLabel(r.key), label: r.label ?? "", enabled: r.enabled !== false,
                    origin: typeof owner.title === "string" ? owner.title : "", group: typeof r.menu === "string" ? r.menu : (typeof owner.title === "string" ? owner.title : "") });
            }
        }
        return out;
    }
    /** The sets a key can reach now: those in force where focus is — and, while
     *  an overlay holds the keyboard, only those declared inside it. Its keys are
     *  its own, and the shortcuts it declares are those keys: a form in a sheet
     *  keeps its own, while the page's behind it stand down. */
    ownersHeard() {
        const all = this.ownersInForce();
        const top = this._claimant();
        if (top === null)
            return all;
        return all.filter(({ owner }) => {
            for (let n = owner; n != null; n = n.parent)
                if (n === top)
                    return true;
            return false;
        });
    }
    /** The `Shortcuts` sets declared on `view` — each a table the walk reads
     *  at that view, after the view's own `keyBindings` (key-bindings.md). */
    _setsOn(view) {
        const out = [];
        for (const o of this.shortcutOwners) {
            if (o.$tornDown === true) {
                this.shortcutOwners.delete(o);
                continue;
            }
            const scope = o.on != null ? o.on : o.parent;
            if (scope === view)
                out.push(o);
        }
        return out;
    }
    /** The press now being dispatched, while it is (null between presses). */
    current = null;
    /** A key went down. Returns whether to prevent the platform's own use of it:
     *  something took it (key-bindings.md). A chord — a command modifier, or a
     *  function key — walks the tables first, before any `onKeyDown`, so a
     *  handler that forgets `super` can't swallow it; a plain key goes to the
     *  focused view's `onKeyDown`, whose base is the walk. */
    keyDown(e) {
        this.noteCommandHold(e, true);
        this.dispatching++;
        const prev = this.current;
        const d = { e, prevent: false, walked: false, reachedBase: false, delivered: false, skipTables: composing(e) || (PROGRAMS !== null && PROGRAMS.typing() && typesCharacter(e)) };
        this.current = d;
        try {
            if (!d.skipTables && WALK !== null && !MODIFIERS.has(e.code) && commanded(comboOf(e))) {
                d.walked = true;
                const r = WALK(e, "tables");
                if (r.taken) {
                    // the binding's, and no program's: its release reaches only the runtime
                    this.heldKeys.set(e.code, { e, program: ORPHAN, owned: false });
                    return r.prevent;
                }
            }
            this.keyDownRaw(e);
            // no focus layer delivered it: the walk runs from where the key starts
            if (!d.delivered && !d.walked && !d.skipTables && WALK !== null && !MODIFIERS.has(e.code)) {
                d.walked = true;
                const r = WALK(e, "all");
                if (r.prevent)
                    d.prevent = true;
            }
            return d.prevent;
        }
        finally {
            this.current = prev;
            this.dispatching--;
        }
    }
    /** Whatever a key's handlers do happens while this is true — so focus they
     *  move is keyboard focus (focus.ts `focus()`, the web's :focus-visible rule
     *  for script focus during keyboard use). */
    dispatching = 0;
    inKeyDispatch() { return this.dispatching > 0; }
    /** Raw delivery: record the key, fire the down stream, complete chords. */
    keyDownRaw(e) {
        const now = PROGRAMS !== null ? PROGRAMS.keyboardProgram() : null;
        this.lastProgram = now;
        // an auto-repeat belongs where its press went, not where the keyboard is now
        const prev = this.heldKeys.get(e.code);
        const program = e.repeat && prev !== undefined ? prev.program : now;
        this.claimedAtDispatch = this.navClaimed();
        this.heldKeys.set(e.code, { e, program, owned: this.claimedAtDispatch });
        for (const h of this.reached(this.downHandlers, program, e))
            h(e);
        for (const c of this.chords) {
            if (!c.active && this.allHeld(c.codes)) {
                c.active = true;
                c.fn();
            }
        }
    }
    /** A key went up: drop it, fire the up stream, then re-arm any chord it broke. */
    // ── the command key held alone (a panel of the shortcuts in force) ───────
    cmdHandlers = new Set();
    cmdTimer = null;
    cmdShown = false;
    /** Subscribe to the command key being HELD ALONE for a moment (true) and let
     *  go, or joined by another key (false) — when a panel of the shortcuts in
     *  force shows. Every program hears it, wherever the keyboard is. */
    onCommandHeld(fn) {
        this.cmdHandlers.add(fn);
        return () => this.cmdHandlers.delete(fn);
    }
    noteCommandHold(e, down) {
        const cmd = IS_MAC ? e.code === "MetaLeft" || e.code === "MetaRight" : e.code === "ControlLeft" || e.code === "ControlRight";
        if (down && cmd && !e.repeat && this.heldKeys.size === 0) {
            if (this.cmdTimer !== null)
                clearTimeout(this.cmdTimer);
            this.cmdTimer = setTimeout(() => { this.cmdTimer = null; this.setCommandHeld(true); }, 700);
            return;
        }
        if (down && cmd)
            return; // its auto-repeat
        this.endCommandHold();
    }
    endCommandHold() {
        if (this.cmdTimer !== null) {
            clearTimeout(this.cmdTimer);
            this.cmdTimer = null;
        }
        this.setCommandHeld(false);
    }
    setCommandHeld(on) {
        if (this.cmdShown === on)
            return;
        this.cmdShown = on;
        for (const fn of [...this.cmdHandlers])
            fn(on);
    }
    keyUp(e) {
        this.dispatching++;
        try {
            this.keyUpRaw(e);
        }
        finally {
            this.dispatching--;
        }
    }
    keyUpRaw(e) {
        this.noteCommandHold(e, false);
        const h0 = this.heldKeys.get(e.code);
        this.heldKeys.delete(e.code);
        // On a Mac a key pressed while ⌘ is down sends no key-up of its own (the
        // system keeps it), so ⌘'s release is the last word on it: anything else
        // still held but a modifier was let go then. Without this, ⌘K left K held
        // for good — Keyboard.isDown("KeyK") stayed true, and ⌘ alone never armed again.
        if (IS_MAC && (e.code === "MetaLeft" || e.code === "MetaRight")) {
            for (const code of [...this.heldKeys.keys()])
                if (!MODIFIERS.has(code))
                    this.heldKeys.delete(code);
        }
        this.claimedAtDispatch = h0 !== undefined ? h0.owned : this.navClaimed();
        // the release goes where the press went; a press the keyboard moved away
        // from was released to its program already, and reaches only the runtime
        const program = h0 !== undefined ? h0.program : PROGRAMS !== null ? PROGRAMS.keyboardProgram() : null;
        for (const h of this.reached(this.upHandlers, program, e))
            h(e);
        for (const c of this.chords) {
            if (c.active && !this.allHeld(c.codes))
                c.active = false;
        }
    }
    /** Release everything — on app blur, so a key held across a focus-out does
     *  not stick (a key-up may never arrive while the app is unfocused). */
    clearHeld() {
        this.endCommandHold();
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
            target.removeEventListener("pointerdown", onPress, true);
        };
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
            // (A focused view's own element holds the DOM's focus — accessibility.md
            // §5.2 — and is no native editable, so it counts as the control's too.)
            // An open overlay owns its navigation keys outright (key-bindings.md):
            // prevented whether or not it binds them, as before — except while a
            // native field holds focus, whose text keys stay its own. Every other
            // key is prevented only when something took it (keyDown's answer).
            if (!isField(document.activeElement)) {
                const nav = ev.key === " " || ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight";
                const jump = ev.key === "Home" || ev.key === "End" || ev.key === "PageUp" || ev.key === "PageDown";
                if ((nav || jump) && this.navClaimed())
                    ev.preventDefault();
            }
            // A key a shown view of the keyboard program polls is the program's
            // (Rule 2): the browser's own use of it — scrolling, Firefox's quick
            // find, Safari showing a hidden cursor — stands down. A chord with a
            // command modifier stays the browser's, and so does typing in a field.
            if (ev.key !== "Tab" && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !isField(document.activeElement) && this.claimed(ev.code))
                ev.preventDefault();
            if (this.keyDown(normalize(ev)))
                ev.preventDefault(); // a declared shortcut's chord is not also the browser's
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
        // a press while ⌘ is down is a ⌘-click or a ⌘-drag, not a look at the
        // shortcuts: the hold ends
        const onPress = () => {
            if (!isAlive())
                return retire();
            this.endCommandHold();
        };
        target.addEventListener("keydown", onDown);
        target.addEventListener("keyup", onUp);
        target.addEventListener("blur", onBlur);
        target.addEventListener("pointerdown", onPress, true);
    }
}
/** Is the element a native text field — where a key is typing? */
function isField(el) {
    if (el === null || typeof HTMLElement === "undefined" || !(el instanceof HTMLElement))
        return false;
    return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}
/** The keys an overlay holding a navigation claim owns outright. */
const OVERLAY_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Escape", "Home", "End", "PageUp", "PageDown"]);
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
        isComposing: ev.isComposing,
        keyCode: ev.keyCode,
        altGraph: typeof ev.getModifierState === "function" && ev.getModifierState("AltGraph"),
    };
}
/** The runtime's keyboard service (LZX's lz.Keys). */
/** Targets this service is already listening on → the liveness box a repeat
 *  `listen` swaps its probe into (see listen's idempotence note). Weak: a
 *  discarded shim window carries its registration away. */
const LISTENING = new WeakMap();
export const Keys = new KeysService();
//# sourceMappingURL=keys.js.map