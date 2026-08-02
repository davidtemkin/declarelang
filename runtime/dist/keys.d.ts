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
}
type KeyHandler = (e: KeyEvent) => void;
export declare function setKeysFocusProbe(fn: () => boolean): void;
export declare class KeysService {
    /** The held-key set (LZX's downKeysHash) — what is pressed right now. */
    private readonly heldKeys;
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
    /** Subscribe to nav-claim TRANSITIONS (true = an overlay took the keys,
     *  false = the last claim released). Returns the unsubscribe thunk. */
    onNavClaim(fn: (on: boolean) => void): () => void;
    private readonly downHandlers;
    private readonly upHandlers;
    private readonly chords;
    /** Is this physical key (KeyboardEvent.code) down right now? The "key
     *  bitmap" query. */
    isDown(code: string): boolean;
    /** Every currently-held code (a copy — callers may not mutate the set). */
    held(): string[];
    /** Subscribe to key-down / key-up. Returns an unsubscribe thunk. */
    onKeyDown(fn: KeyHandler): () => void;
    onKeyUp(fn: KeyHandler): () => void;
    /** Fire `fn` once when every code in `codes` is simultaneously held (LZX's
     *  callOnKeyCombo). Re-arms once any of the keys releases. Returns an
     *  unsubscribe thunk. (v1 matches physical codes; modifier-normalized
     *  chords — "ctrl"+"KeyS" — are a later refinement.) */
    onChord(codes: readonly string[], fn: () => void): () => void;
    /** A key went down: record it, fire the down stream, then complete any chord
     *  whose keys are now all held. */
    keyDown(e: KeyEvent): void;
    /** A key went up: drop it, fire the up stream, then re-arm any chord it broke. */
    keyUp(e: KeyEvent): void;
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
