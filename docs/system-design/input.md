# Keyboard, focus & text input

**Status:** ratified 2026-07-05 (David). Building in dependency order: raw keys → focus/tab → `TextInput`. Grounded in LZX's `lz.Keys` / `lz.Focus` (`runtime/lfc-src/services/`), which got the layering right; the rulings below take LZX over DOM where LZX is better and DOM where it is the natural reference.

**Progress:** all three layers **implemented + tested 2026-07-05**. Layer 1 (`src/keys.ts`, `Keys`) + Layer 2 (`src/focus.ts`, `Focus` + `deliverKeys`) wired into the runtime entry (`index.ts` `wireInput`: `Focus.setRoot` + `Keys.listen` + `deliverKeys`); Layer 3 (`src/text-input.ts`, `TextInput` + the `setEditable`/`activateEditable` Surface primitive on both backends). Full suite green (unit 298, perceptual 104, scaffold 11) + a two-backend browser smoke for the native element.

## The layering

Bottom-up, each layer a client of the one below — and each useful on its own:

1. **Raw keys** — a global `Keys` service: key up/down, modifiers, a held-key set, chords. Works with **no** focused field (shortcuts, games, key-repeat).
2. **Focus & tab order** — one focused view at a time; tree-order traversal; declarative focus containment.
3. **`TextInput`** — a focus client that consumes keys while focused, over a native editable element (DOM) or a DOM overlay (canvas).

## Layer 1 — raw keys (`Keys` service)

**DOM is the kernel reference** (LZX's `LzKeyboardKernel` is itself a thin wrapper over DOM `keydown`/`keyup`). Keys always originate from the DOM host — canvas included — so the service normalizes ONE DOM source regardless of backend. The service is LZX-shaped on top of the raw events:

- **Events:** `onKeyDown` / `onKeyUp`, carrying the physical `code` (`KeyboardEvent.code`), the produced `key`, and modifier flags (shift/ctrl/alt/meta). No `keypress` (deprecated).
- **Held-key set** (LZX's `downKeysHash` / `isKeyDown`): `Keys.isDown(code)` answers what is pressed *right now* — the "key bitmap". Cleared on blur of the whole app (so a key held across a focus-out doesn't stick).
- **Chords** (LZX's `callOnKeyCombo`): register a handler for a combination (`["control","a"]`), built on the held-set.
- **Delivery:** the global stream fires on `Keys` (focus-independent), AND the focused view receives the same events (Layer 2) — so a field edits while a global shortcut still works.

The service **core is pure** (accepts normalized key events, keeps state, dispatches); a thin DOM adapter feeds it from the host element — so the core unit-tests with synthetic events, no browser.

## Layer 2 — focus & tab order (LZX over DOM)

`Focus` service, one focused view at a time: `focus(view)` / `blur()` / `getFocus()`, `next()` / `prev()`, and `onFocus` / `onBlur` events (on the view and on the service). Opt-in is a declarative `focusable` attribute. The rulings, and why LZX beats DOM here:

**Default order = view-tree preorder of `focusable && visible` views — NO numeric index.** LZX deliberately avoids `tabindex`, the DOM accessibility footgun everyone is told never to use. Tree order is also visual order in a well-built tree, and it handles replicated / runtime-created views for free (they sit at their tree position; replicated instances follow data order).

**Focus containment is declarative — `focustrap`.** A `focustrap` view forms a self-contained focus group: Tab cycles *within* it (wrapping), and an `onEscapeFocus` fires at the boundary. This is the modal/dialog focus-trap as one attribute — the thing DOM took ~20 years to approximate (`inert` / `<dialog>` / focus-trap libraries). Straight from LZX.

**Explicit order = a `tabOrder()` method returning an ordered array of VIEWS.** Two orthogonal things on a view: `focusable` (bool — "am I a stop?") and `tabOrder()` (ordered *members to descend into*; default = my visible children in source order). The focus service produces the flat sequence by a recursive preorder flatten that consults each view's own `tabOrder()`:

```
collect(v, out):
  for m in v.tabOrder():        // v's ordered members — VIEWS, not sequences
    if not m.visible: continue
    if m.focusable: out.push(m)
    collect(m, out)             // recurse via m's OWN tabOrder()
```

Returning *views* (not flattened sequences) is what buys composability: an outer view returns `[header, body, footer]` and stays ignorant of how each composes — the service expands each by calling *its* `tabOrder()`. A parent orders only its own members; it structurally cannot reach into a child's internals. This is not LZX's "weak" version: LZX put `getNextSelection`/`getPrevSelection` on every focusable *leaf* returning next/prev (scattered, awkward relation); this is one method on the *container* returning the whole ordered list — composable, complete.

- **Default (not overridden) → the whole app is tree preorder.** Zero declarations, and a form with invisible structural nesting is tab-navigable out of the box. The common case.
- **Overridden → you return the complete member order for your subtree** — no partial mixing (omit a member → its subtree is excluded; you took over, you own it). Simple case reads like a list: `tabOrder() { return [name, address, submit] }`. Partial reorder is explicit composition, never an auto-append: `tabOrder() { return [submit, ...this.tabDefault().filter(v => v !== submit)] }`.
- **Dynamic-safe:** it runs at traversal time over the live tree, so replicated / runtime children flow through the default (or an override reading live children). You never name instances — you list a container (`[search, ...rows, ok]`) and its own `tabOrder()` expands its instances.

Safety net (dev builds): since `tabOrder()` is dynamic there's no static "you forgot a field" check — after a traversal the service can compare the returned order against the actual focusable descendants and warn on omissions.

**Keyboard delivery to focus:** the focused view receives `onKeyDown` / `onKeyUp` (target-only, per D-2 — no bubbling; replication refills the delegation gap). `Tab` / `Shift-Tab` are consumed by the focus service (advance/retreat) unless a focustrap escapes.

### Mutation during traversal

The tree can change while the user tabs. It works because the sequence is computed **live per Tab**, never cached — three cases:

1. **Focused view survives** — free. Each Tab recomputes from the root/focustrap over the live tree, finds the focused view, and steps. Any add/remove/reorder/visibility change since the last Tab is reflected. (O(focusable) per keystroke; Tab is rare — LZX accepted this.)
2. **Focused view disappears** (a reconcile discards its instance, a state tears down its subtree, or it goes invisible) — handled *proactively*: the focus service hooks the leaving lifecycle (`View.discard()` and `visible → false`) and, if the departing view holds focus, moves focus to the live neighbor computed at that moment, *before* it goes. Lands cheaply because `View.discard()` already exists (replication + states teardown). Focus is never left dangling.
3. **Tree mutates during the focus change itself** (an `onFocus`/`onBlur` handler mutating or calling `focus()`) — a **focus-change lock** serializes it (re-entry remembers the new target, applies it after the current settles — LZX's exact discipline), and `tabOrder()` must be a pure read so the collect walk sees a consistent snapshot.

So the focus service is a small *stateful* service (holds current focus, subscribes to discard/visibility), not a pure per-Tab function — precisely so a moving tree can't strand it. LZX's `LzFocus` validates all three (per-move recompute, visibility walk, focus lock).

## Layer 3 — `TextInput` — **implemented + tested 2026-07-05**

`src/text-input.ts` (component) + a new Surface primitive `setEditable(spec) / activateEditable(active)` on both backends. A focus client (`focusable = true` by default) whose `text` is the **source of truth** — the component's own writable attr that the user's edits mutate and other slots bind to (there is no two-way `<->`; D-6 dropped it). Attrs `text` / `placeholder` / `multiline`; events `onInput` (each edit) / `onEnter` (single-line submit). Rendering (both realized as **real DOM** — the native element owns caret/selection/clipboard/IME/a11y, D-5):

- **DOM backend:** the surface div hosts a native `<input>`/`<textarea>` filling the box (transparent, so the view's own box paint shows through); value ↔ `text`, native events ↔ the Declare events. Nearly free.
- **Canvas backend:** the native element is an **overlay** appended to the host (made a positioning context), glued to the surface's on-screen box (accumulated x/y up the parent chain) and repositioned each paint so it tracks animating ancestors; hidden when an ancestor is invisible. Because a TextInput's `setEditable` runs during the attach walk (before `attachRoot` stores the host), the compositor **remounts** registered editables once the host exists.

**Focus ↔ caret sync, both directions:** Declare focus → native caret via the internal `View.focusChanged(focused)` hook (separate from the author's `onFocus`/`onBlur` so it never steals the event slot) → `activateEditable`; and native focus (a click into the field) → `Focus.focus(this)`. `Tab` is `preventDefault`-ed in the Keys DOM adapter so the browser never fights the focus service. A constraint-owned `text` is a **controlled** field (edits revert). Validated by a two-backend browser smoke (native element renders, positioned at the box, typing round-trips to the model) + 4 unit tests over a mock backend.

`measure.ts`'s native metrics style the overlay to match painted text. The OL5 "static-measured-text idle, overlay on activation" split (a per-input-count optimization) and self-rendered on-canvas editing stay deferred — the always-live native element is simpler and more capable for v1.

## Rulings summary

- **Raw keys:** DOM kernel; LZX-shaped `Keys` service (held-set `isDown`, chords, global + focused delivery, pure testable core).
- **Focus/tab:** tree-order default (no `tabindex`); declarative `focustrap` (LZX); explicit order via a `tabOrder()` method returning ordered **views** (Declare's improvement on LZX's per-leaf next/prev — composable, complete, dynamic-safe); sequence computed live per Tab with a discard/visibility hook + focus lock so a moving tree can't strand focus.
- **Text input:** `text` as source-of-truth (no `<->`); native element (DOM) / overlay-on-activation (canvas); native/overlay owns caret/selection/IME.

## Deferred
- Self-rendered on-canvas editing (caret/selection/IME) — only when dynamically promoting DOM layers out of canvas becomes worthwhile.
- Reactive `{ }` `taborder`; `multiline` / rich text; per-key repeat semantics beyond the browser's.
- `pretext` integration (display-path measurement/i18n), independent of this work.
