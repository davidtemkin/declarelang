# Engine-native CSS interaction states: `:hover`, `:active`, `:focus`

*Design spec. Status: approved for planning (2026-07-18), revised after a
three-lens review. Builds on the standard-CSS styling channel
(`design-docs/css-engine-and-screen-update.md`;
`css-parse.ts`/`css-match.ts`/`css-apply.ts`). Origin: the CSS playground demo
hand-hacked hover with DOM `getBoundingClientRect`; interaction state belongs in
the engine — the runtime already tracks the pointer and hit-tests for input, so
"which view is hovered / pressed / focused" should be engine-owned reactive state
that CSS matches on. Lands in PR #3 (the CSS-engine branch).*

## Why

declarelang's input layer (`input.ts` `routeInput`) already resolves *which view
is under the pointer* and fires `mouseOver`/`mouseOut`/`mouseDown`/`mouseUp` to
that view's sink (capturing the pressed view so `mouseUp` reaches it even
off-view), and the focus service (`focus.ts`) already tracks the focused view.
Expose that as reactive state the CSS engine reads, and `.card:hover { … }` works
with zero app code, re-cascading through the same `settle`, and
**backend-agnostically** — the sink protocol serves DOM *and* Canvas (both feed
one `routeInput`), where the demo's `getBoundingClientRect` was DOM-only.

## Decisions (locked)

- **Surface:** the `:hover` / `:active` / `:focus` pseudo-classes. The parser
  learns them; any other `:foo` still rejects. Pseudos are ordinary conditions:
  they combine with compound (`.card.on:hover`), AND with each other
  (`:hover:focus`), and may sit on any simple selector in a descendant chain.
- **State:** three engine-owned reactive boolean slots on `View` — `hovered`,
  `pressed`, `focused` — `def: false`, no push, not prevailing. Absent from
  `schema.ts`, so the checker rejects a `.declare` author write. They use the
  ordinary reactive machinery; the matcher's reads are tracked.
- **Hit-testability (`:hover`/`:active`):** **automatic** — the CSS applier
  installs a lightweight interaction sink for a view iff a `:hover`/`:active`
  rule can target it. `:focus` gets **no** sink.
- **`:focus`:** matches only `focusable` views (the existing `View.focusable` +
  `focus.ts`, which only ever focuses `focusable && visible` views). No
  auto-focusability.
- **`:active` semantics:** `pressed` is set on `mouseDown` and cleared on
  `mouseUp`/`pointercancel` only — **not** on `mouseOut`. So dragging off a
  pressed view keeps `:active` until release, matching CSS (and `routeInput`'s
  press-capture model).
- **`focused` is written by `FocusService`** directly (override-proof), not via
  `View.focusChanged` (which subclasses like `TextInput` override).
- **Pseudo specificity:** each pseudo contributes **+10** (CSS rule; falls out of
  `specificityOf`'s existing else branch for free).
- **Scope:** all three states, one mechanism.

## Architecture

### The pseudo condition (parser + matcher)

`css-parse.ts`:

```ts
type Condition =
  | … existing tag/id/class/attr …
  | { kind: "pseudo"; name: "hover" | "active" | "focus" };
```

`parseSimple`'s `:` branch (today a hard `throw`) instead regex-matches
`^:([\w-]+)`, accepts `hover`/`active`/`focus` as a `pseudo` condition, and
throws `CssUnsupported` for any other name. Because `parseSimple` appends
conditions in a loop, pseudos combine freely (compound, multiple, any position);
`specificityOf`'s `else → 10` already gives +10.

`css-match.ts`:
- `MatchView` gains `pseudo(name): boolean`.
- `simpleMatches`/`matches` gain an optional `forcePointer = false` parameter.
  A `pseudo` condition matches: if `forcePointer` and name is `hover`/`active`
  → `true`; else `view.pseudo(name)`. (Focus is never forced.)
- `containsPointerPseudo(selector): boolean` — a **static** AST scan (no view):
  does any simple selector carry a `hover`/`active` pseudo? Used only for the
  tracking decision.

The `css-apply` adapter implements `pseudo` by reading the reactive slots through
the tracked getters:

```ts
pseudo: (name) => name === "hover" ? v.hovered : name === "active" ? v.pressed : v.focused
```

so any state change invalidates the applier and re-cascades — identical to
`styleclass`/`[attr]`. (Note: since `hovered`/`pressed`/`focused` are real View
properties, `[hovered]` attribute selectors would also match them — harmless, and
the `pseudo()` path is the intended surface.)

### The reactive slots (`view.ts`)

`hovered`/`pressed`/`focused` join `defineAttributes(View, …)` as `{ def: false }`
(mirroring `focusable`), and are **not** added to `schema.ts`.

### Hit-testability: the interaction sink (`view.ts`)

Today `inputSink()` (private) returns a sink only when author pointer handlers
exist, and `flush` installs it once via `setInput` (never called again). Refactor
to one path:

- **`refreshInputSink()`** builds the combined sink and calls
  `this.surface?.setInput(sink)` — **always** calling `setInput` (with `null`
  when neither condition holds, so untracking flips `pointer-events` off).
  `flush` calls `refreshInputSink()` instead of its inline `inputSink()` + guard,
  so attach-time and post-attach paths converge, and a view that gains handlers
  *or* tracking later still gets wired.
- **A sink installs when** `has-author-pointer-handlers` **OR**
  `interactionTracked`. The combined sink, per event:
  - `mouseOver` → `hovered = true`
  - `mouseOut`  → `hovered = false` (leaves `pressed`)
  - `mouseDown` → `pressed = true`
  - `mouseUp`   → `pressed = false`
  and always forwards to the author handler via `fireEvent` (no-op if absent), so
  click/capture semantics (all in `routeInput`, above the sink) are unchanged.
- **`setInteractionTracked(on)`** compares-and-returns when unchanged; on a true
  transition it calls `refreshInputSink()`. On `on === false` it **also clears
  `hovered`/`pressed`** (no `mouseOut` fires once the sink is gone). `discard`
  clears them too (belt-and-suspenders).

### Where tracking is decided (`css-apply.ts`)

The applier's `compute` already reads the view/ancestors/`cssRules` under
tracking. It additionally computes `tracked = ruleSet.rules.some(r =>
containsPointerPseudo(r.selector) && matches(v, r.selector, /*forcePointer*/true))`
and returns `{ offers, tracked }`. The **side effect** runs in `apply`:
`view.setInteractionTracked(tracked)` (idempotent), then install/withdraw offers
as today. Keeping the decision in `compute` (tracked reads) and the `setInput`
mutation in `apply` (tracking off) avoids side effects during dependency
discovery and re-runs live as `cssRules`/`styleclass` change.

**Pre-attach guard:** `ensureCssApplier` can run (via `cssRulesArrived`) before a
surface exists; `refreshInputSink` is surface-guarded (no-op), and `flush` calls
`refreshInputSink()` at attach — so the sink lands whichever order they occur.

### Focus (`focus.ts`)

`FocusService.focus(view)` already sets `current` and calls `focusChanged` on the
old/new views. Add, in `focus()` directly: `old.focused = false` /
`view.focused = true` (guarded for null). Override-proof, since it doesn't rely on
subclass `focusChanged` calling `super`. `reset()`/blur clear it. `:focus` needs
no extra gate — only `focusable && visible` views are ever focused.

## Modules touched

| File | Change |
|---|---|
| `css-parse.ts` | `pseudo` condition; parse `:hover`/`:active`/`:focus`, reject others; (+10 is free) |
| `css-match.ts` | `MatchView.pseudo`; `simpleMatches`/`matches` `forcePointer` param; `containsPointerPseudo` |
| `css-apply.ts` | adapter `pseudo` (tracked reads); `compute` returns `{offers, tracked}`; `apply` calls `setInteractionTracked` |
| `view.ts` | `hovered`/`pressed`/`focused` slots; `refreshInputSink` (+ `flush` routes through it); combined interaction sink; `setInteractionTracked` (idempotent, clears state on untrack); `discard` clears state |
| `focus.ts` | set `focused` on the focused/blurred view in `focus()` |
| `test/css.test.mjs` | flip the `:hover`-throws test to accept; extend `fakeView` with `pseudo`; new pseudo/tracking/state tests |
| `demo/css-playground.html` | delete the JS hover hit-test; `.card.hover` → `.card:hover` (+ `.card:active`) in the three skins |

## Milestones

- **M1 — parser + matcher (pure).** `pseudo` condition + parse (compound,
  multiple, descendant-position) + reject unknown; specificity; `MatchView.pseudo`
  + `forcePointer` + `containsPointerPseudo`. Unit-tested with the extended
  `fakeView`.
- **M2 — reactive slots + adapter.** Slots on `View`; `css-apply` `pseudo`
  adapter; `compute` returns `{offers, tracked}`. Integration test: `v.hovered =
  true; settle()` restyles per a `:hover` rule; toggling **false** reverts to the
  base `.card` value (re-offer, not default); precedence (author `$set`/class-dict
  still outrank) unchanged; no-thrash still holds.
- **M3 — pointer wiring + auto-sink (`:hover`/`:active`).** `refreshInputSink`,
  combined sink, `setInteractionTracked`, applier marking. **Tested in node** by
  driving the sink function directly (invoke `mouseOver` → `hovered` true →
  settle → re-cascade; `mouseDown`/`mouseUp` → `pressed`; drag-off keeps
  `pressed`; untrack clears state). End-to-end confirmed with a **real mouse** via
  the existing puppeteer perceptual harness (or the Playwright MCP), asserting the
  DOM restyles.
- **M4 — focus (`:focus`).** `focus()` sets `focused`; test focusing a focusable
  view matches `:focus`, blurring reverts; a non-focusable view never matches.
- **M5 — demo.** In `css-playground.html`: delete the `addHover`/`dropHover`/
  `pointermove`/`pointerleave` block; rewrite `.card.hover` → `.card:hover` in the
  three SKIN strings and add a `.card:active`; update the "Selectors seen here"
  copy. Leave the controls' own `button.skin:hover` (real DOM CSS) untouched.
  Verify with a real mouse.

## Testing

Concrete red targets: M1 — `parseSelectorText(".card:hover")` deep-equals
`[{conditions:[{kind:"class",name:"card"},{kind:"pseudo",name:"hover"}]}]`;
`specificityOf(".card:hover")` = 20; `:bogus` throws; `.card:hover:focus` → two
pseudo conditions; **flip** the existing `parseSelectorText("a:hover")`-throws
assertion (`test/css.test.mjs`). Extend the shared `fakeView` with `pseudo: (n)
=> (over.pseudo ?? {})[n]`. M2/M3/M4 use `new View()` + `settle()` (slots are
writable from test code — the checker, not the slot, gates author writes). The
sink-driven M3 node tests need no browser; the real-mouse pass is end-to-end
confirmation.

## Non-goals

- Other pseudo-classes (`:first-child`, `:disabled`, …) and pseudo-elements
  (`::before`) — rejected.
- Auto-focusability — `:focus` needs `focusable`.
- Ancestor `:hover` (real CSS hovers the whole ancestor chain). v1 matches the
  resolved sink view only (matching `routeInput`'s single-hovered-sink model); a
  later refinement if wanted.

## Review resolutions

- Tracking decision in `compute` (returns `tracked`), side-effect in `apply`;
  `setInteractionTracked` idempotent (no per-settle `setInput` churn / thrash).
- `matchesAssumingPseudo` split → `matches(..., forcePointer)` +
  `containsPointerPseudo` (static). Focus never forced.
- `:active` kept through press-drag-off (clear `pressed` on up/cancel only).
- Stale-state cleared on untrack/discard.
- `refreshInputSink` refactor: `flush` routes through it; `setInput` always
  called (so untrack flips pointer-events off); surface-guarded for pre-attach.
- `focused` written in `FocusService.focus()` (override-proof).
- M3 real-mouse test uses the existing **puppeteer** harness (perceptual), not a
  new Playwright setup; sink logic is node-testable by driving the sink directly.
- Flip the existing `:hover`-throws parse test; extend `fakeView`; add the
  hover-revert-to-base test. Enumerated demo edits (leave control `:hover`).
- `[hovered]` attribute selectors also match the new slots — harmless, noted.
