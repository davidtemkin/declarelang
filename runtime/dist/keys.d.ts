/** One normalized key event — the physical `code` (KeyboardEvent.code, layout-
 *  independent, the right key for shortcuts/games), the produced `key`
 *  (KeyboardEvent.key), the modifier flags, and whether it is an auto-repeat.
 *  No `keypress` (deprecated). */
export interface KeyEvent {
    code: string;
    key: string;
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
    repeat: boolean;
    /** An IME is composing: the key belongs to the composition, not to a binding. */
    isComposing?: boolean;
    /** The legacy key code — 229 is Safari's keydown during and just after composition. */
    keyCode?: number;
    /** AltGr is down (Windows layouts): the chord types a character. */
    altGraph?: boolean;
}
/** One key press on its way through the walk (key-bindings.md): what the walk
 *  has done with it so far. Read by the base `onKeyDown` and the DOM adapter. */
export interface KeyDispatch {
    e: KeyEvent;
    /** Something took the key: the platform's default is prevented. */
    prevent: boolean;
    /** The tables already walked this key (a chord): the base `onKeyDown` does not walk it again. */
    walked: boolean;
    /** The focused view's `onKeyDown` reached the base (the walk). */
    reachedBase: boolean;
    /** The key skips the tables — composition, or a chord that types into a field. */
    skipTables: boolean;
    /** The focus layer took the key in hand (focus.ts deliverKeys): it decides
     *  whether the walk runs. Without one (a headless service), keyDown walks. */
    delivered: boolean;
}
/** The walk (focus.ts walkKeys), injected — keys.ts sits below the view layer.
 *  `from` null = start where the key starts (the focused view, or an overlay).
 *  Returns whether something took the key, and whether to prevent its default. */
export type KeyWalk = (e: KeyEvent, mode: "tables" | "all") => {
    taken: boolean;
    prevent: boolean;
};
export declare function setInForce(fn: (() => Array<Record<string, unknown>>) | null): void;
export declare function setKeyWalk(fn: KeyWalk | null): void;
type KeyHandler = (e: KeyEvent) => void;
/** What the keyboard needs to know about the program tree, injected by
 *  services.ts (keys.ts sits below the view layer and stays node-free). A
 *  PROGRAM is a tree mounted as an app — the top-level one or an island's
 *  tenant — named here by its root. */
export interface KeysPrograms {
    /** The program a node belongs to (the root of its tree). */
    programOf(node: object): object;
    /** The program the keyboard goes to now (keyboard-follows-focus.md, Rule 1):
     *  the focused view's, the tenant of a focused island, else the top-level
     *  one. Null when there is no top-level program to fall back on. */
    keyboardProgram(): object | null;
    /** The view a node's claim belongs to: the node itself, or its nearest view. */
    viewOf(node: object): object | null;
    /** Is the view shown — itself and every ancestor visible? */
    shown(view: object): boolean;
    /** Run `fn` when the node is discarded. */
    onGone(node: object, fn: () => void): void;
    /** Is `node` in `ancestor`'s subtree (the node itself included)? */
    inside(node: object, ancestor: object): boolean;
    /** Does an overlay's claim hold now? Not while focus is in another context
     *  than the overlay's — a sheet open in one window does not hold the keys
     *  typed in another. */
    claimHolds(owner: object): boolean;
    /** Where a shortcut is looked for (planes.md §9): the focused view and its
     *  ancestors, on through each island into its host, nearest first — or the
     *  keyboard program's root when nothing is focused. */
    focusChain(): object[];
    /** Is someone typing — a text field has focus? Then a key with no command
     *  modifier is the field's, not a shortcut. */
    typing(): boolean;
}
/** A declared set of shortcuts (library `Shortcuts`): records with a `key`
 *  (`"⌘S"`, `"⇧⌘Z"`, `"F5"`), an `id` and a `label`, covering the subtree of
 *  `on` (else its parent), and `picked(id)` the action. */
interface ShortcutOwner {
    items?: unknown;
    on?: unknown;
    title?: unknown;
    parent?: unknown;
    $tornDown?: boolean;
    picked(id: string): void;
}
export declare const KEYS_ON_MAC: boolean;
/** A key event as a shortcut's spelling: modifiers in display order, then the
 *  key (a letter upper-cased, a named key by its glyph). ⌘ is the command key:
 *  Meta on a Mac, Control elsewhere. */
export declare function comboOf(e: KeyEvent): string;
/** A declared spelling, normalized: glyphs or words (`"Cmd+Shift+Z"`), any
 *  order, to the one form comboOf produces. */
export declare function normalizeCombo(spec: string): string;
/** A key as the platform says it, for showing (a menu, the hold-⌘ panel): a
 *  Mac's glyphs in the Mac's order (`"Ctrl+Shift+S"` → `⇧⌘S`), and elsewhere
 *  the words (`Ctrl+Shift+S`) — what the person sees on their own keyboard. */
export declare function keyLabel(spec: string): string;
/** The same press spelled from its physical key (`code`): KeyS → S, Digit1 → 1.
 *  A letter or digit on a non-Latin layout, or under ⌥ on a Mac (⌥A types å),
 *  still matches its binding this way. Null when the code names no letter or digit. */
export declare function comboOfCode(e: KeyEvent): string | null;
/** The chords a text field answers itself — select all, the clipboard, undo
 *  and redo, and the caret's command moves. While a field has focus they stay
 *  the field's, whatever a program declares: the Mac's first-responder rule
 *  (a field's editing commands come before the menu's key equivalents). A
 *  focused text field's table ends with these as `native` (focus.ts). */
export declare const FIELD_CHORDS: Set<string>;
/** Does a combo carry a command modifier (anything but ⇧)? */
export declare const commanded: (combo: string) => boolean;
/** Does this press type a character into a field rather than name a chord —
 *  AltGr on Windows, ⌥ on a Mac? (key-bindings.md: such keys skip the tables
 *  while a text field has focus.) */
export declare function typesCharacter(e: KeyEvent): boolean;
/** Is the press part of an IME composition (Safari reports 229 just after)? */
export declare const composing: (e: KeyEvent) => boolean;
export declare function setKeysPrograms(p: KeysPrograms | null): void;
export declare function keysCaller(node: object | null): object | null;
export declare function setKeysFocusProbe(fn: () => boolean): void;
/** Does a Declare view hold keyboard focus right now? */
export declare function keysFocusHeld(): boolean;
export declare class KeysService {
    /** The held keys (LZX's downKeysHash) — what is pressed right now, each
     *  with the program it was pressed in. */
    private readonly heldKeys;
    /** The program that had the keyboard at the last look, to see it move. */
    private lastProgram;
    /** Polled keys → the views that poll them (Rule 2): a key a shown view of
     *  the keyboard program polls is the program's, and the browser's own use
     *  of it stands down. */
    private readonly claims;
    /** Views currently claiming the NAVIGATION keys (arrows, Space, Home/End,
     *  PageUp/Down) from the browser's scroll defaults — an open Menu chain,
     *  any overlay that roves with arrows while nothing holds Declare focus.
     *  A Set of claimant owners so overlapping claims (a menu over a menu)
     *  compose; `navClaim(owner, false)` releases only its own. */
    private readonly navClaims;
    private readonly navHandlers;
    /** Claim (or release) the navigation keys for `owner`. While any claim is
     *  live, the DOM listener prevents the browser's scroll defaults for the
     *  nav keys exactly as it does when a Declare control holds focus — an
     *  open menu's arrows rove the menu, never scroll the page. Idempotent.
     *  0↔1 transitions notify onNavClaim subscribers (the FocusRing stands
     *  down while an overlay owns the keys — the menu's rover is the focus). */
    navClaim(owner: object, on: boolean): void;
    /** Is any navigation-keys claim live right now? */
    navClaimed(): boolean;
    /** The overlay the keys go to now: the latest claim that holds (focus is not
     *  in another context than its own), or null. */
    _claimant(): object | null;
    /** A program is leaving (its island unlinks): the claims its views hold go,
     *  as their closes would have released them. */
    releaseProgram(root: object): void;
    /** A claimant torn down while open — a hosted program unmounted with its
     *  menu up — holds nothing any more: its claim goes, as a close would. */
    private dropTornDown;
    /** Was a claim live when the key now being dispatched arrived? Read once,
     *  before any handler runs: the handler that acts on the key (a menu's
     *  Enter picks and closes it) may release the claim mid-dispatch, and the
     *  rest of the same keypress must still see who owned it. */
    private claimedAtDispatch;
    /** Does an overlay own this key? While an overlay claims the navigation
     *  keys — an open menu, a popover, a dialog — the arrows, Enter, Space,
     *  Escape and the jump keys are the overlay's: the focused view beneath does
     *  not also receive them (its Enter would re-press the button that opened the
     *  menu; its arrows would move a list's selection under an open context
     *  menu), and neither does a `Keys` member outside the topmost overlay (one
     *  Esc closes the popover and does nothing else — planes.md §9). */
    overlayOwns(e: KeyEvent): boolean;
    /** Subscribe to nav-claim TRANSITIONS (true = an overlay took the keys,
     *  false = the last claim released). Returns the unsubscribe thunk. */
    onNavClaim(fn: (on: boolean) => void): () => void;
    /** Handlers → the node that owns them (a `Keys` member), or null for the
     *  runtime's own (focus delivery), which hear every key. */
    private readonly downHandlers;
    private readonly upHandlers;
    private readonly chords;
    /** Is this physical key (KeyboardEvent.code) down right now? The "key
     *  bitmap" query. Asked from a body (expr.ts names the caller), it answers
     *  for the caller's program: a key is down for a program only if it went
     *  down while that program had the keyboard (Rule 1) — and the asking view
     *  claims the key from the browser (Rule 2). */
    isDown(code: string): boolean;
    /** Every currently-held code (a copy — callers may not mutate the set);
     *  from a body, the ones held in the caller's program. */
    held(): string[];
    /** Record that `node`'s view polls `code`. The claim lasts until the view
     *  is discarded. */
    private claim;
    /** Does a shown view of the keyboard program poll `code`? */
    claimed(code: string): boolean;
    /** Subscribe to key-down / key-up. `owner` — the node a `Keys` member is —
     *  hears only the keys of its own program while that program has the
     *  keyboard (Rule 1); without one, every key. Returns an unsubscribe thunk. */
    onKeyDown(fn: KeyHandler, owner?: object | null): () => void;
    onKeyUp(fn: KeyHandler, owner?: object | null): () => void;
    /** The handlers a key pressed in `program` reaches. A key an open overlay
     *  owns reaches only the `Keys` members inside a claiming overlay. */
    private reached;
    /** Is this `Keys` member inside the overlay that claimed the keys last — the
     *  topmost? A dialog's Enter is not also the menu's open over it. */
    private inClaimant;
    /** The keyboard may have moved to another program (focus moved): the one
     *  that had it is told each key it holds went up, and those presses are no
     *  program's any more — the program now holding the keyboard sees only
     *  keys pressed from here on. */
    keyboardMoved(): void;
    /** Fire `fn` once when every code in `codes` is simultaneously held (LZX's
     *  callOnKeyCombo). Re-arms once any of the keys releases. Returns an
     *  unsubscribe thunk. (v1 matches physical codes; modifier-normalized
     *  chords — "ctrl"+"KeyS" — are a later refinement.) */
    onChord(codes: readonly string[], fn: () => void): () => void;
    /** A key went down: record it, fire the down stream, then complete any chord
     *  whose keys are now all held. */
    /** The declared shortcut sets, as their `Shortcuts` nodes register. */
    private readonly shortcutOwners;
    /** A `Shortcuts` node declares its set (it registers at init). */
    _declareShortcuts(owner: object): void;
    /** The owners in force, nearest scope first: each paired with its depth on
     *  the focus chain. */
    private ownersInForce;
    /** The shortcuts in force where focus is now, nearest declaration of each
     *  key first — what a hold-⌘ panel lists: `{ id, key, label, enabled,
     *  origin, group }`, `origin` being the declaring set's `title` and `group`
     *  the menu a menu bar's shortcut sits in (else the origin). */
    shortcutsInForce(): Array<Record<string, unknown>>;
    /** The sets a key can reach now: those in force where focus is — and, while
     *  an overlay holds the keyboard, only those declared inside it. Its keys are
     *  its own, and the shortcuts it declares are those keys: a form in a sheet
     *  keeps its own, while the page's behind it stand down. */
    private ownersHeard;
    /** The `Shortcuts` sets declared on `view` — each a table the walk reads
     *  at that view, after the view's own `keyBindings` (key-bindings.md). */
    _setsOn(view: object): ShortcutOwner[];
    /** The press now being dispatched, while it is (null between presses). */
    current: KeyDispatch | null;
    /** A key went down. Returns whether to prevent the platform's own use of it:
     *  something took it (key-bindings.md). A chord — a command modifier, or a
     *  function key — walks the tables first, before any `onKeyDown`, so a
     *  handler that forgets `super` can't swallow it; a plain key goes to the
     *  focused view's `onKeyDown`, whose base is the walk. */
    keyDown(e: KeyEvent): boolean;
    /** Whatever a key's handlers do happens while this is true — so focus they
     *  move is keyboard focus (focus.ts `focus()`, the web's :focus-visible rule
     *  for script focus during keyboard use). */
    private dispatching;
    inKeyDispatch(): boolean;
    /** Raw delivery: record the key, fire the down stream, complete chords. */
    private keyDownRaw;
    /** A key went up: drop it, fire the up stream, then re-arm any chord it broke. */
    private readonly cmdHandlers;
    private cmdTimer;
    private cmdShown;
    /** Subscribe to the command key being HELD ALONE for a moment (true) and let
     *  go, or joined by another key (false) — when a panel of the shortcuts in
     *  force shows. Every program hears it, wherever the keyboard is. */
    onCommandHeld(fn: (on: boolean) => void): () => void;
    private noteCommandHold;
    private endCommandHold;
    private setCommandHeld;
    keyUp(e: KeyEvent): void;
    private keyUpRaw;
    /** Release everything — on app blur, so a key held across a focus-out does
     *  not stick (a key-up may never arrive while the app is unfocused). */
    clearHeld(): void;
    private allHeld;
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
    listen(alive: () => boolean, target?: Window): void;
}
/** A DOM KeyboardEvent → the normalized KeyEvent the core consumes. */
export declare function normalize(ev: KeyboardEvent): KeyEvent;
export declare const Keys: KeysService;
export {};
