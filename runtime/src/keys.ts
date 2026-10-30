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

/** The modifier glyphs in their display order. */
const MOD_ORDER = ["⌃", "⌥", "⇧", "⌘"];
const MOD_WORDS: Record<string, string> = { ctrl: "⌃", control: "⌃", alt: "⌥", option: "⌥", opt: "⌥", shift: "⇧", cmd: "⌘", command: "⌘", meta: "⌘" };
const KEY_NAMES: Record<string, string> = {
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Enter: "↩", Escape: "⎋",
  Backspace: "⌫", Delete: "⌦", Tab: "⇥", " ": "Space",
};
const IS_MAC = typeof navigator === "undefined" || /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** A key event as a shortcut's spelling: modifiers in display order, then the
 *  key (a letter upper-cased, a named key by its glyph). ⌘ is the command key:
 *  Meta on a Mac, Control elsewhere. */
export function comboOf(e: KeyEvent): string {
  const cmd = e.meta || (!IS_MAC && e.ctrl);
  const k = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  // a typed symbol already says Shift (? is ⇧/): only a letter or a named
  // key spells ⇧ out (⇧⌘Z)
  const shift = e.shift && !(e.key.length === 1 && !/[a-z]/i.test(e.key));
  return (IS_MAC && e.ctrl ? "⌃" : "") + (e.alt ? "⌥" : "") + (shift ? "⇧" : "") + (cmd ? "⌘" : "") + k;
}

/** A declared spelling, normalized: glyphs or words (`"Cmd+Shift+Z"`), any
 *  order, to the one form comboOf produces. */
export function normalizeCombo(spec: string): string {
  let rest = spec.trim();
  const mods = new Set<string>();
  for (;;) {
    const g = MOD_ORDER.find((m) => rest.startsWith(m));
    if (g !== undefined) { mods.add(g); rest = rest.slice(g.length); continue; }
    const w = /^([A-Za-z]+)[+-]/.exec(rest);
    if (w !== null && MOD_WORDS[w[1].toLowerCase()] !== undefined) { mods.add(MOD_WORDS[w[1].toLowerCase()]); rest = rest.slice(w[0].length); continue; }
    break;
  }
  const k = KEY_NAMES[rest] ?? (rest.length === 1 ? rest.toUpperCase() : rest);
  return MOD_ORDER.filter((m) => mods.has(m)).join("") + k;
}

/** The chords a text field answers itself — select all, the clipboard, undo
 *  and redo, and the caret's command moves. While a field has focus they stay
 *  the field's, whatever a program declares: the Mac's first-responder rule
 *  (a field's editing commands come before the menu's key equivalents). */
const FIELD_CHORDS = new Set(["⌘A", "⌘C", "⌘X", "⌘V", "⌘Z", "⇧⌘Z", "⌘Y", "⌘←", "⌘→", "⌘↑", "⌘↓", "⇧⌘←", "⇧⌘→", "⇧⌘↑", "⇧⌘↓", "⌥←", "⌥→", "⇧⌥←", "⇧⌥→", "⌥⌫", "⌘⌫"]);

/** Does a combo carry a command modifier (anything but ⇧)? */
const commanded = (combo: string): boolean => /[⌃⌥⌘]/.test(combo) || /^F\d+$/.test(combo.replace(/^[⇧]/, ""));
let PROGRAMS: KeysPrograms | null = null;
export function setKeysPrograms(p: KeysPrograms | null): void {
  PROGRAMS = p;
}

/** The node whose compiled body is running, while it runs a body that names
 *  `Keys` (expr.ts sets it around exactly those bodies): who is asking
 *  `Keys.isDown`. Returns the previous caller, for the body to restore. */
let CALLER: object | null = null;
export function keysCaller(node: object | null): object | null {
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

/** A held key: the press, and the program that had the keyboard when it went
 *  down (null when there were no programs to choose between). */
interface Held {
  e: KeyEvent;
  program: object | null;
  /** An overlay held the keys when it went down: its release is the overlay's
   *  too, though the overlay may have closed on the press. */
  owned: boolean;
}

interface Chord {
  codes: Set<string>;
  fn: () => void;
  /** Fired-and-held: true from the keyDown that completed the chord until one
   *  of its keys releases, so a held chord (or auto-repeat) fires once. */
  active: boolean;
}

/** The keyboard service. A singleton `Keys` is exported for the runtime; tests
 *  construct their own instance and drive `keyDown`/`keyUp` directly. */
/** Injected by index.ts (keys.ts sits below focus.ts in the module graph):
 *  "does a Declare view hold keyboard focus right now?" — the predicate the
 *  listener uses to claim Space/arrows from the browser's scroll defaults. */
let keysFocusProbe: (() => boolean) | null = null;
export function setKeysFocusProbe(fn: () => boolean): void {
  keysFocusProbe = fn;
}

export class KeysService {
  /** The held keys (LZX's downKeysHash) — what is pressed right now, each
   *  with the program it was pressed in. */
  private readonly heldKeys = new Map<string, Held>();

  /** The program that had the keyboard at the last look, to see it move. */
  private lastProgram: object | null = null;

  /** Polled keys → the views that poll them (Rule 2): a key a shown view of
   *  the keyboard program polls is the program's, and the browser's own use
   *  of it stands down. */
  private readonly claims = new Map<string, Set<object>>();

  /** Views currently claiming the NAVIGATION keys (arrows, Space, Home/End,
   *  PageUp/Down) from the browser's scroll defaults — an open Menu chain,
   *  any overlay that roves with arrows while nothing holds Declare focus.
   *  A Set of claimant owners so overlapping claims (a menu over a menu)
   *  compose; `navClaim(owner, false)` releases only its own. */
  private readonly navClaims = new Set<object>();
  private readonly navHandlers = new Set<(on: boolean) => void>();

  /** Claim (or release) the navigation keys for `owner`. While any claim is
   *  live, the DOM listener prevents the browser's scroll defaults for the
   *  nav keys exactly as it does when a Declare control holds focus — an
   *  open menu's arrows rove the menu, never scroll the page. Idempotent.
   *  0↔1 transitions notify onNavClaim subscribers (the FocusRing stands
   *  down while an overlay owns the keys — the menu's rover is the focus). */
  navClaim(owner: object, on: boolean): void {
    const was = this.navClaims.size > 0;
    if (on) { this.navClaims.delete(owner); this.navClaims.add(owner); }
    else this.navClaims.delete(owner);
    const is = this.navClaims.size > 0;
    if (was !== is) for (const fn of [...this.navHandlers]) fn(is);
  }

  /** Is any navigation-keys claim live right now? */
  navClaimed(): boolean {
    return this._claimant() !== null;
  }

  /** The overlay the keys go to now: the latest claim that holds (focus is not
   *  in another context than its own), or null. */
  _claimant(): object | null {
    this.dropTornDown();
    let top: object | null = null;
    for (const c of this.navClaims) if (PROGRAMS === null || PROGRAMS.claimHolds(c)) top = c;
    return top;
  }

  /** A program is leaving (its island unlinks): the claims its views hold go,
   *  as their closes would have released them. */
  releaseProgram(root: object): void {
    for (const c of [...this.navClaims]) {
      let r = c as { parent?: unknown };
      while (r.parent != null) r = r.parent as { parent?: unknown };
      if (r === root) this.navClaim(c, false);
    }
  }

  /** A claimant torn down while open — a hosted program unmounted with its
   *  menu up — holds nothing any more: its claim goes, as a close would. */
  private dropTornDown(): void {
    for (const c of [...this.navClaims]) if ((c as { $tornDown?: boolean }).$tornDown === true) this.navClaim(c, false);
  }

  /** Was a claim live when the key now being dispatched arrived? Read once,
   *  before any handler runs: the handler that acts on the key (a menu's
   *  Enter picks and closes it) may release the claim mid-dispatch, and the
   *  rest of the same keypress must still see who owned it. */
  private claimedAtDispatch = false;

  /** Does an overlay own this key? While an overlay claims the navigation
   *  keys — an open menu, a popover, a dialog — the arrows, Enter, Space,
   *  Escape and the jump keys are the overlay's: the focused view beneath does
   *  not also receive them (its Enter would re-press the button that opened the
   *  menu; its arrows would move a list's selection under an open context
   *  menu), and neither does a `Keys` member outside the topmost overlay (one
   *  Esc closes the popover and does nothing else — planes.md §9). */
  overlayOwns(e: KeyEvent): boolean {
    return this.claimedAtDispatch && OVERLAY_KEYS.has(e.key);
  }

  /** Subscribe to nav-claim TRANSITIONS (true = an overlay took the keys,
   *  false = the last claim released). Returns the unsubscribe thunk. */
  onNavClaim(fn: (on: boolean) => void): () => void {
    this.navHandlers.add(fn);
    return () => this.navHandlers.delete(fn);
  }
  /** Handlers → the node that owns them (a `Keys` member), or null for the
   *  runtime's own (focus delivery), which hear every key. */
  private readonly downHandlers = new Map<KeyHandler, object | null>();
  private readonly upHandlers = new Map<KeyHandler, object | null>();
  private readonly chords: Chord[] = [];

  /** Is this physical key (KeyboardEvent.code) down right now? The "key
   *  bitmap" query. Asked from a body (expr.ts names the caller), it answers
   *  for the caller's program: a key is down for a program only if it went
   *  down while that program had the keyboard (Rule 1) — and the asking view
   *  claims the key from the browser (Rule 2). */
  isDown(code: string): boolean {
    const h = this.heldKeys.get(code);
    const who = CALLER;
    if (who === null || PROGRAMS === null || MODIFIERS.has(code)) return h !== undefined && h.program !== ORPHAN;
    this.claim(who, code);
    return h !== undefined && (h.program === null || h.program === PROGRAMS.programOf(who));
  }

  /** Every currently-held code (a copy — callers may not mutate the set);
   *  from a body, the ones held in the caller's program. */
  held(): string[] {
    const who = CALLER;
    const p = who !== null && PROGRAMS !== null ? PROGRAMS.programOf(who) : undefined;
    const out: string[] = [];
    for (const [code, h] of this.heldKeys) {
      if (p === undefined || MODIFIERS.has(code) ? h.program !== ORPHAN : h.program === null || h.program === p) out.push(code);
    }
    return out;
  }

  /** Record that `node`'s view polls `code`. The claim lasts until the view
   *  is discarded. */
  private claim(node: object, code: string): void {
    const view = PROGRAMS!.viewOf(node);
    if (view === null) return;
    let set = this.claims.get(code);
    if (set === undefined) this.claims.set(code, (set = new Set()));
    if (set.has(view)) return;
    set.add(view);
    PROGRAMS!.onGone(view, () => { set!.delete(view); });
  }

  /** Does a shown view of the keyboard program poll `code`? */
  claimed(code: string): boolean {
    const set = this.claims.get(code);
    if (set === undefined || set.size === 0 || PROGRAMS === null) return false;
    const kp = PROGRAMS.keyboardProgram();
    for (const v of set) if (PROGRAMS.programOf(v) === kp && PROGRAMS.shown(v)) return true;
    return false;
  }

  /** Subscribe to key-down / key-up. `owner` — the node a `Keys` member is —
   *  hears only the keys of its own program while that program has the
   *  keyboard (Rule 1); without one, every key. Returns an unsubscribe thunk. */
  onKeyDown(fn: KeyHandler, owner: object | null = null): () => void {
    this.downHandlers.set(fn, owner);
    return () => this.downHandlers.delete(fn);
  }
  onKeyUp(fn: KeyHandler, owner: object | null = null): () => void {
    this.upHandlers.set(fn, owner);
    return () => this.upHandlers.delete(fn);
  }

  /** The handlers a key pressed in `program` reaches. A key an open overlay
   *  owns reaches only the `Keys` members inside a claiming overlay. */
  private reached(handlers: Map<KeyHandler, object | null>, program: object | null, e: KeyEvent | null = null): KeyHandler[] {
    const owned = e !== null && this.overlayOwns(e) && PROGRAMS !== null;
    const out: KeyHandler[] = [];
    for (const [fn, owner] of handlers) {
      if (owner !== null && owned && !this.inClaimant(owner)) continue;
      if (owner === null || program === null || PROGRAMS === null || PROGRAMS.programOf(owner) === program) out.push(fn);
    }
    return out;
  }

  /** Is this `Keys` member inside the overlay that claimed the keys last — the
   *  topmost? A dialog's Enter is not also the menu's open over it. */
  private inClaimant(owner: object): boolean {
    const top = this._claimant();
    return top !== null && PROGRAMS!.inside(owner, top);
  }

  /** The keyboard may have moved to another program (focus moved): the one
   *  that had it is told each key it holds went up, and those presses are no
   *  program's any more — the program now holding the keyboard sees only
   *  keys pressed from here on. */
  keyboardMoved(): void {
    if (PROGRAMS === null) return;
    const now = PROGRAMS.keyboardProgram();
    if (now === this.lastProgram) return;
    this.lastProgram = now;
    for (const [code, h] of this.heldKeys) {
      if (h.program === null || h.program === ORPHAN || h.program === now || MODIFIERS.has(code)) continue;
      const was = h.program;
      h.program = ORPHAN;
      const up = { ...h.e, repeat: false };
      for (const fn of this.reached(this.upHandlers, was)) if (this.upHandlers.get(fn) !== null) fn(up);
      for (const c of this.chords) if (c.active && c.codes.has(code)) c.active = false;
    }
  }

  /** Fire `fn` once when every code in `codes` is simultaneously held (LZX's
   *  callOnKeyCombo). Re-arms once any of the keys releases. Returns an
   *  unsubscribe thunk. (v1 matches physical codes; modifier-normalized
   *  chords — "ctrl"+"KeyS" — are a later refinement.) */
  onChord(codes: readonly string[], fn: () => void): () => void {
    const chord: Chord = { codes: new Set(codes), fn, active: false };
    this.chords.push(chord);
    return () => {
      const i = this.chords.indexOf(chord);
      if (i >= 0) this.chords.splice(i, 1);
    };
  }

  // ── Fed by the adapter (or a test) ────────────────────────────────────────

  /** A key went down: record it, fire the down stream, then complete any chord
   *  whose keys are now all held. */
  /** The declared shortcut sets, as their `Shortcuts` nodes register. */
  private readonly shortcutOwners = new Set<ShortcutOwner>();

  /** A `Shortcuts` node declares its set (it registers at init). */
  _declareShortcuts(owner: object): void {
    this.shortcutOwners.add(owner as ShortcutOwner);
  }

  /** The owners in force, nearest scope first: each paired with its depth on
   *  the focus chain. */
  private ownersInForce(): Array<{ owner: ShortcutOwner; depth: number }> {
    if (PROGRAMS === null) return [];
    const chain = PROGRAMS.focusChain();
    const out: Array<{ owner: ShortcutOwner; depth: number }> = [];
    for (const o of [...this.shortcutOwners]) {
      if (o.$tornDown === true) { this.shortcutOwners.delete(o); continue; }
      const scope = o.on != null ? o.on : o.parent;
      const d = scope != null ? chain.indexOf(scope as object) : -1;
      if (d >= 0) out.push({ owner: o, depth: d });
    }
    return out.sort((a, b) => a.depth - b.depth);
  }

  /** The shortcuts in force where focus is now, nearest declaration of each
   *  key first — what a hold-⌘ panel lists: `{ id, key, label, enabled,
   *  origin, group }`, `origin` being the declaring set's `title` and `group`
   *  the menu a menu bar's shortcut sits in (else the origin). */
  shortcutsInForce(): Array<Record<string, unknown>> {
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const { owner } of this.ownersHeard()) {
      const items = Array.isArray(owner.items) ? owner.items as Array<Record<string, unknown>> : [];
      for (const r of items) {
        if (typeof r?.key !== "string" || r.key === "") continue;
        const c = normalizeCombo(r.key);
        if (seen.has(c)) continue;
        seen.add(c);
        out.push({ id: r.id, key: r.key, label: r.label ?? "", enabled: r.enabled !== false,
          origin: typeof owner.title === "string" ? owner.title : "", group: typeof r.menu === "string" ? r.menu : (typeof owner.title === "string" ? owner.title : "") });
      }
    }
    return out;
  }

  /** The sets a key can reach now: those in force where focus is — and, while
   *  an overlay holds the keyboard, only those declared inside it. Its keys are
   *  its own, and the shortcuts it declares are those keys: a form in a sheet
   *  keeps its own, while the page's behind it stand down. */
  private ownersHeard(): Array<{ owner: ShortcutOwner; depth: number }> {
    const all = this.ownersInForce();
    const top = this._claimant();
    if (top === null) return all;
    return all.filter(({ owner }) => {
      for (let n: unknown = owner; n != null; n = (n as { parent?: unknown }).parent) if (n === top) return true;
      return false;
    });
  }

  /** The declared shortcut a key event triggers, if any: the nearest set that
   *  declares its combo, enabled (ownersHeard — an open overlay's own sets
   *  only), and none without a command modifier while a field has focus
   *  (typing is the field's), nor a field's own editing chords (⌘A, ⌘C/X/V,
   *  ⌘Z — FIELD_CHORDS). */
  private shortcutFor(e: KeyEvent): { owner: ShortcutOwner; id: string } | null {
    if (this.shortcutOwners.size === 0 || MODIFIERS.has(e.code)) return null;
    const combo = comboOf(e);
    if (PROGRAMS !== null && (!commanded(combo) || FIELD_CHORDS.has(combo)) && PROGRAMS.typing()) return null;
    for (const { owner } of this.ownersHeard()) {
      const items = Array.isArray(owner.items) ? owner.items as Array<Record<string, unknown>> : [];
      const hit = items.find((r) => typeof r?.key === "string" && normalizeCombo(r.key) === combo);
      if (hit !== undefined) return hit.enabled === false ? null : { owner, id: String(hit.id) };
    }
    return null;
  }

  /** A key went down. Returns whether a declared shortcut took it — the
   *  adapter then stops the browser's own use of the chord. */
  keyDown(e: KeyEvent): boolean {
    this.noteCommandHold(e, true);
    this.dispatching++;
    try {
      const sc = this.shortcutFor(e);
      if (sc !== null) {
        // the shortcut's, and no program's: its release reaches only the runtime
        this.heldKeys.set(e.code, { e, program: ORPHAN, owned: false });
        sc.owner.picked(sc.id);
        return true;
      }
      this.keyDownRaw(e);
      return false;
    } finally { this.dispatching--; }
  }

  /** Whatever a key's handlers do happens while this is true — so focus they
   *  move is keyboard focus (focus.ts `focus()`, the web's :focus-visible rule
   *  for script focus during keyboard use). */
  private dispatching = 0;
  inKeyDispatch(): boolean { return this.dispatching > 0; }

  /** Raw delivery: record the key, fire the down stream, complete chords. */
  private keyDownRaw(e: KeyEvent): void {
    const now = PROGRAMS !== null ? PROGRAMS.keyboardProgram() : null;
    this.lastProgram = now;
    // an auto-repeat belongs where its press went, not where the keyboard is now
    const prev = this.heldKeys.get(e.code);
    const program = e.repeat && prev !== undefined ? prev.program : now;
    this.claimedAtDispatch = this.navClaimed();
    this.heldKeys.set(e.code, { e, program, owned: this.claimedAtDispatch });
    for (const h of this.reached(this.downHandlers, program, e)) h(e);
    for (const c of this.chords) {
      if (!c.active && this.allHeld(c.codes)) {
        c.active = true;
        c.fn();
      }
    }
  }

  /** A key went up: drop it, fire the up stream, then re-arm any chord it broke. */
  // ── the command key held alone (a panel of the shortcuts in force) ───────

  private readonly cmdHandlers = new Set<(on: boolean) => void>();
  private cmdTimer: ReturnType<typeof setTimeout> | null = null;
  private cmdShown = false;

  /** Subscribe to the command key being HELD ALONE for a moment (true) and let
   *  go, or joined by another key (false) — when a panel of the shortcuts in
   *  force shows. Every program hears it, wherever the keyboard is. */
  onCommandHeld(fn: (on: boolean) => void): () => void {
    this.cmdHandlers.add(fn);
    return () => this.cmdHandlers.delete(fn);
  }

  private noteCommandHold(e: KeyEvent, down: boolean): void {
    const cmd = IS_MAC ? e.code === "MetaLeft" || e.code === "MetaRight" : e.code === "ControlLeft" || e.code === "ControlRight";
    if (down && cmd && !e.repeat && this.heldKeys.size === 0) {
      if (this.cmdTimer !== null) clearTimeout(this.cmdTimer);
      this.cmdTimer = setTimeout(() => { this.cmdTimer = null; this.setCommandHeld(true); }, 700);
      return;
    }
    if (down && cmd) return;   // its auto-repeat
    this.endCommandHold();
  }

  private endCommandHold(): void {
    if (this.cmdTimer !== null) { clearTimeout(this.cmdTimer); this.cmdTimer = null; }
    this.setCommandHeld(false);
  }

  private setCommandHeld(on: boolean): void {
    if (this.cmdShown === on) return;
    this.cmdShown = on;
    for (const fn of [...this.cmdHandlers]) fn(on);
  }

  keyUp(e: KeyEvent): void {
    this.dispatching++;
    try { this.keyUpRaw(e); } finally { this.dispatching--; }
  }

  private keyUpRaw(e: KeyEvent): void {
    this.noteCommandHold(e, false);
    const h0 = this.heldKeys.get(e.code);
    this.heldKeys.delete(e.code);
    // On a Mac a key pressed while ⌘ is down sends no key-up of its own (the
    // system keeps it), so ⌘'s release is the last word on it: anything else
    // still held but a modifier was let go then. Without this, ⌘K left K held
    // for good — Keys.isDown("KeyK") stayed true, and ⌘ alone never armed again.
    if (IS_MAC && (e.code === "MetaLeft" || e.code === "MetaRight")) {
      for (const code of [...this.heldKeys.keys()]) if (!MODIFIERS.has(code)) this.heldKeys.delete(code);
    }
    this.claimedAtDispatch = h0 !== undefined ? h0.owned : this.navClaimed();
    // the release goes where the press went; a press the keyboard moved away
    // from was released to its program already, and reaches only the runtime
    const program = h0 !== undefined ? h0.program : PROGRAMS !== null ? PROGRAMS.keyboardProgram() : null;
    for (const h of this.reached(this.upHandlers, program, e)) h(e);
    for (const c of this.chords) {
      if (c.active && !this.allHeld(c.codes)) c.active = false;
    }
  }

  /** Release everything — on app blur, so a key held across a focus-out does
   *  not stick (a key-up may never arrive while the app is unfocused). */
  clearHeld(): void {
    this.endCommandHold();
    this.heldKeys.clear();
    for (const c of this.chords) c.active = false;
  }

  private allHeld(codes: Set<string>): boolean {
    for (const code of codes) if (!this.heldKeys.has(code)) return false;
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
  listen(alive: () => boolean, target: Window = window): void {
    const bound = LISTENING.get(target as object);
    if (bound !== undefined) {
      bound.alive = alive;
      return;
    }
    const box = { alive };
    LISTENING.set(target as object, box);
    const isAlive = (): boolean => box.alive();
    const retire = (): void => {
      LISTENING.delete(target as object);
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      target.removeEventListener("blur", onBlur);
    };
    const focusHolds = (): boolean => keysFocusProbe !== null && keysFocusProbe();
    const onDown = (ev: KeyboardEvent): void => {
      if (!isAlive()) return retire();
      // Declare owns Tab traversal (Layer 2); stop the browser from also moving its
      // own focus, which would fight the focus service (and skip a canvas app's
      // overlay inputs).
      if (ev.key === "Tab") ev.preventDefault();
      // When a Declare CONTROL holds keyboard focus, Space and the arrows are
      // the control's (Space/Enter activate; arrows adjust a slider) — the
      // browser's defaults (page scroll) must stand down. A native editable
      // (its own element focused) keeps every default: typing a space in a
      // field is a space.
      // (A focused view's own element holds the DOM's focus — accessibility.md
      // §5.2 — and is no native editable, so it counts as the control's too.)
      if (!isField(document.activeElement)) {
        const nav = ev.key === " " || ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight";
        const jump = ev.key === "Home" || ev.key === "End" || ev.key === "PageUp" || ev.key === "PageDown";
        if ((nav && (focusHolds() || this.navClaimed())) || (jump && this.navClaimed())) ev.preventDefault();
      }
      // A key a shown view of the keyboard program polls is the program's
      // (Rule 2): the browser's own use of it — scrolling, Firefox's quick
      // find, Safari showing a hidden cursor — stands down. A chord with a
      // command modifier stays the browser's, and so does typing in a field.
      if (ev.key !== "Tab" && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !isField(document.activeElement) && this.claimed(ev.code)) ev.preventDefault();
      if (this.keyDown(normalize(ev))) ev.preventDefault();   // a declared shortcut's chord is not also the browser's
    };
    const onUp = (ev: KeyboardEvent): void => {
      if (!isAlive()) return retire();
      this.keyUp(normalize(ev));
    };
    const onBlur = (): void => {
      if (!isAlive()) return retire();
      this.clearHeld();
    };
    target.addEventListener("keydown", onDown);
    target.addEventListener("keyup", onUp);
    target.addEventListener("blur", onBlur);
  }
}

/** Is the element a native text field — where a key is typing? */
function isField(el: Element | null): boolean {
  if (el === null || typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

/** The keys an overlay holding a navigation claim owns outright. */
const OVERLAY_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Escape", "Home", "End", "PageUp", "PageDown"]);

/** A DOM KeyboardEvent → the normalized KeyEvent the core consumes. */
export function normalize(ev: KeyboardEvent): KeyEvent {
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
const LISTENING = new WeakMap<object, { alive: () => boolean }>();

export const Keys = new KeysService();
