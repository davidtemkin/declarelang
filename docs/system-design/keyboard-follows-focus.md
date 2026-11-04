# Keyboard follows focus — and a polled key is the program's

*Design note, 2026-10-12. Built. No language change: no new syntax, attribute or method.
Two runtime rules, one focus rule for islands, a few lines in each program that hosts
another, and reference prose.*

---

## 1. The problems

**A browser's own use of a key fights the program's.**

- **Safari.** While a page is playing sound, a key press the page leaves uncancelled brings
  the arrow cursor back over `cursor: none`. Asteroids' turn, thrust and fire keys do exactly
  this, so the cursor reappears as soon as the game is played.
  - Static page, no runtime code: uncancelled keys + sound → arrow on 100% of samples;
    cancelled keys + sound → 0%; uncancelled keys, no sound → 0%.
  - Asteroids: cancelling plain key presses takes the arrow from 71–74% of samples to 5–7%
    (the remainder is the pixel check's noise).
- **Firefox.** An uncancelled `'` or `/` opens Quick Find, which then takes every key after it,
  Space included. Asteroids thrusts on `'` and goes to hyperspace on `/`.
- **Every browser.** An uncancelled Space or arrow scrolls the page when nothing claims it.

**Every program on a page hears every key.** All Declare programs on a page share one runtime
and one `Keys` service, so an embedded program's `Keys` members hear the page's whole keyboard
and its `Keys.isDown` answers for it.

- Desktop, headless: with Asteroids open in a window and another window in front, pressing
  Return started a game in the background window.
- Clicking inside the Asteroids window moved neither Declare's focus (`null` throughout) nor
  the browser's (`BODY` throughout).

Out of scope: Escape hiding the cursor in Safari is macOS's hide-while-typing (any key press
hides the cursor until the mouse moves, cancelled or not), which a page cannot change.

## 2. Terms

- **Program** — a tree mounted as an app: the top-level one, or an `AppIsland` tenant.
  Tenants can nest.
- **Focused view** — the one view the focus service holds, or none.

## 3. Rule 1 — which program has the keyboard

The **keyboard program** is:

1. when the focused view is an `AppIsland` view: that island's tenant (and if focus within the
   tenant is itself on an island, that island's tenant, and so on down);
2. when the focused view is any other view: the program whose tree contains it;
3. when nothing is focused: the top-level program.

Only the keyboard program receives the keyboard:

- **`Keys` members** whose owner is in the keyboard program get `onKeyDown`/`onKeyUp`; members
  in other programs get nothing.
- **The focused view** gets `onKeyDown`/`onKeyUp` exactly as today. (It is in the keyboard
  program by definition, unless it is an island, which delivers nothing itself.)
- **`Keys.isDown(code)`** called from a body running in the keyboard program answers whether
  `code` is held; called from any other program it answers `false`. `held()` likewise.
  The modifiers (Shift, Control, Option, Command) are the exception: a held modifier is
  the keyboard's state, not a press — what a click reads to extend a selection — so it
  reads as held in every program, and the keyboard moving does not release it.
- **When the keyboard program changes**, the old one is treated as if every held key were
  released — its `Keys` members get `onKeyUp` for each, and `isDown` goes false — and the new
  one sees only keys pressed after the change. (A game must not go on thrusting after the
  person clicks away.)

Unchanged:

- **Everything within a program.** A `Keys` member still hears keys regardless of which of its
  own program's views has focus, including while one of its native text fields has focus.
- **How focus moves**: Tab, a press on a focusable view, `Focus.focus(view)`. A focusable
  island is a Tab stop in its host, so tabbing to it hands its program the keyboard; Tab
  within a program stays within that program, as before.
- **A page with one program** — every app except Desktop and island hosts: the keyboard program
  is always that program, so nothing observable changes.

**Why the line is drawn at the program, not the view.** A `Keys` member is app-wide by
definition — "shortcuts that work regardless of focus" — and a menu, a dialog and the App may
each hold one. A rule scoped to views ("a `Keys` member hears keys only while focus is inside
its owner") would silence a menu's member whenever the menu does not hold focus, changing
behaviour inside ordinary programs. Drawing the line at the program keeps every in-program
rule as it is and adds only the cross-program one — exactly where the web's rule for embedded
documents (an iframe receives keys while it has focus, its parent does not) applies. In view
terms: *a `Keys` member hears keys while focus is inside its own program's tree, an island
leading into its tenant's tree; when nothing is focused, the top-level program counts as
focused.*

**Modifier keys get no exception.** Focus decides every key, Cmd, Ctrl and Alt included, as
it does for an iframe. A host's own shortcuts over a focused tenant are a separate topic (see
§8). Browsers reserve their window and tab shortcuts (Cmd-W, Cmd-Q, Cmd-T, Cmd-N, Cmd-Tab and
their Ctrl counterparts); no page can take them, whatever this design says.

## 4. Rule 2 — a polled key is claimed by the view that polls it

A body running on view V that calls `Keys.isDown(code)` makes V **claim** `code`. On each
key-down of `code`, the runtime cancels the browser's default when, at that moment:

1. some view claiming `code` is shown (it and every ancestor visible) and is in the keyboard
   program;
2. no Cmd, Ctrl or Alt is held;
3. the browser's focused element is not a native text field;
4. `code` is not Tab (its existing rule stands).

A claim ends when V is discarded; while V is not shown, its claim is inactive. Polling a
modifier claims nothing.

The existing rule that a focused Declare control takes Space and the arrows from the
browser does not count a focused island: an island is not a control, and what its
program claims, it claims through this rule. This is how web
game engines treat the keys a game reads (Phaser captures the keys a game registers); in
Declare, polling a key is registering it.

## 5. What happens in each case

| Case | Keyboard program | Claims |
|---|---|---|
| Asteroids on its own page | Asteroids, always (top-level; nothing focused) | Its polled keys while the game view is shown |
| Asteroids in a Desktop window | Asteroids while its island, or a view inside it, has focus; otherwise Desktop or the front window's program | Asteroids' keys only while it is the keyboard program |
| A Declare app embedded in an ordinary web page | None: an embedded app does not take the page's keyboard (as before) | None |
| A program that never polls keys | Unchanged | None |

**The background-window bug, specifically.** Asteroids asks `Keys.isDown("Enter")` every frame.
Today the answer is yes wherever Return is pressed. Under Rule 1, it answers only while focus
is inside Asteroids: with another window in front (Desktop focuses that window's content on
activation, §6), Asteroids' `isDown` answers `false` and Return does nothing to the game;
clicking the Asteroids window focuses its island, and the game gets the keys.

## 6. The changes

| Where | Change |
|---|---|
| Runtime `keys.ts` | Key events are delivered, and `isDown`/`held` answered, for the keyboard program; held keys are released to the old keyboard program when it changes; claims are recorded from `isDown`, attributed to the calling view; a claimed key's default is cancelled under Rule 2's conditions |
| Runtime `expr.ts` | A body that names `Keys` runs as the keyboard's caller, so `isDown` knows which node asks. Only those bodies pay for it; a production build marks them, since minification hides the name |
| Runtime `focus.ts` | Answers the keyboard program (Rule 1's three cases). Focusing an island whose program already holds focus — its tenant's, or one nested in it — leaves focus where it is, as focusing an iframe keeps the focus inside it |
| Runtime `island.ts` | The tenant link records the island's tenant and the tenant's island, the path between the two trees |
| `apps/desktop/desktop.declare` | However a window comes to the front, it takes the keyboard (`WinManager` tracks `frontWin`; `activate` too): a window that runs a program focuses its island; any other window lets go of focus held outside it; with no window in front, focus is released to the desktop |
| `apps/games/asteroids/asteroids.declare` | The App is `focusable` and takes focus on a press, so it takes the keyboard in any host |
| The other hosts | The docs previews, the homepage's article and live demos, and the viewer: each island is `focusable` and focused on a press |
| Reference prose | `Keys`, `Keys.isDown`, `AppIsland`, and the guide's keyboard section |

## 7. Behaviour that changes

- **An embedded program hears no keys until it, or its host, gives it focus.** Every host in
  the repository gives it on a press: Desktop's windows, the docs previews, the homepage's
  article and live demos, the viewer.
- **The host hears no keys while a tenant has focus** — Desktop's own key handlers included —
  as a page does while an iframe has focus.
- **A focusable App or island is a Tab stop.** Tabbing into an embedded program hands it the
  keyboard, as tabbing into an iframe does. A focus ring drawn around a whole program follows
  from the model; where it should not show, the existing focus-ring styling suppresses it.
- **A claimed key loses its browser default** — Space and the arrows stop scrolling the page,
  Firefox's Quick Find stops opening on `'` and `/` — but only while a shown, polling view's
  program is the keyboard program.

## 8. Not foreclosed: shortcuts resolved along the focus path

A later design may let views register shortcuts, resolved by walking from the focused view up
its ancestors — a text field's cut/copy/paste, then its program's own shortcuts, then a host's
(Desktop's), then the system's — with a held modifier showing every applicable shortcut along
the path. This design leaves room for it:

- **The path is well defined.** It is Rule 1's chain read in reverse: up the focused view's
  ancestors to its program's root, then through the tenant link to the `AppIsland` view in the
  host's tree, and on up, through any further islands.
- **Raw delivery and shortcuts are separate channels.** Rule 1 scopes the raw keyboard —
  `Keys` members, `isDown`, `onKeyDown` — to the keyboard program. A shortcut walk resolves a
  chord along the focus path and calls only the nearest registrant, so it can reach a host's
  views without reopening the raw stream to the host. The constraint to keep: raw delivery
  stays program-scoped; shortcuts walk the focus path.

Left to that design: browser-reserved chords (never registrable in a browser; a native host
can own more), and precedence across programs (nearest wins lets a tenant shadow its host; a
host may need chords it always keeps).

**Recorded 2026-11-03 for that design (Presentify run 3), not yet decided:**

- **A view's own keys belong in the walk, at its front.** Today `Shortcuts` sets already
  resolve from the focused view outward, nearest set first. But a control's built-in keys
  (a Slider's arrows, a list's, a RadioGroup's) live in its `onKeyDown`, outside the walk, so
  an App shortcut on a plain arrow takes the key from a focused Slider. Confirmed with a minimal
  program, and it cost Presentify 3 its corner-radius slider. The runtime's own comment
  (`keys.ts`, the adapter) already states the intent: "when a Declare CONTROL holds keyboard
  focus, Space and the arrows are the control's", but only the browser's defaults stand
  down; shortcuts don't. In the intended model a keystroke resolves like `provided()`: any view
  may have key bindings, and the nearest wins, from the view that has the key, through a dialog,
  the island or App, then the desktop. Unlike `provided()`, which reads from above only, the walk
  starts with the focused view itself, so a control's own keys beat everything above it.
- **Shortcuts that follow the user's keyboard layout.** A chord is a declared intent written
  against a reference layout (US) and mapped to the user's keyboard:
  - **Letters match by character.** ⌘Z is the key that types Z wherever it sits, as on
    QWERTZ.
  - **Punctuation matches by physical key.** ⇧⌘] is the key in the US ] position with Shift
    (`event.code` BracketRight), so pairs like ⌘[ and ⌘] stay side by side on every layout.
  - **Labels come from the user's layout.** The menu and the shortcut panel show what the
    user's key prints: in a browser through the Keyboard Map API
    (`navigator.keyboard.getLayoutMap()`, Chrome only), on the Mac host from the OS, falling back
    to the US glyph.
  - macOS has localized key equivalents this way since Monterey
    (`allowsAutomaticKeyEquivalentLocalization`, with mirroring for right-to-left layouts), and
    VS Code dispatches by key code with a choice of position or character.

  Today the runtime matches by the character a press typed (`keys.ts` `comboOf`), so
  `"⇧⌘]"` never fires: the press arrives as ⌘}. The `Shortcuts.items` reference says to write
  the symbol the keys type (`"⌘}"`), which holds on US-style layouts only. Left to this design:
  the matching rule per key class, the label source per host, and what happens when a
  localized chord collides with another.

## 9. Open

- *(Settled 2026-10-17: the web's rule.)* A press on content where nothing up its chain
  can take focus clears focus — the keyboard returns to the program pressed in — and the
  next Tab starts from the pressed spot (the web's sequential focus navigation starting
  point), so inside a dialog it stays in the dialog. `focus.ts pressAt`, called from the
  router's press hook (`services.ts`). Clicking the page around a docs preview now takes
  the keyboard back from the preview's program.
- **The native host (Mac)** delivers keys through the same service, so Rule 1 applies
  there; Rule 2 concerns browser defaults and has no Mac counterpart.

## 10. Verification

- **Safari:** Asteroids played with the pointer still and sound on shows the arrow on no sample
  while the cursor is hidden. The check matches the arrow's shape at the pointer, not
  brightness, so the game's own drawing cannot register; every hit is kept as a screenshot
  and is a bug to find.
- **Firefox:** `'` and `/` no longer open Quick Find during play (one manual press if Firefox
  cannot be driven here).
- **Desktop, headless:** Return with another window in front no longer starts a background
  Asteroids; after a click into its window, it does.
- **Two-way demo:** unchanged — its programs are embedded in an HTML page and take no keys.
- Key and focus tests, then the full suite.
