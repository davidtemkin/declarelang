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
     *  the DOM. */
    listen(alive: () => boolean, target?: Window): void;
}
/** A DOM KeyboardEvent → the normalized KeyEvent the core consumes. */
export declare function normalize(ev: KeyboardEvent): KeyEvent;
/** The runtime's keyboard service (LZX's lz.Keys). */
export declare const Keys: KeysService;
export {};
