# Engine-native CSS interaction states: `:hover`, `:active`, `:focus`

*Design spec. Status: approved for planning (2026-07-18). Builds on the
standard-CSS styling channel (`design-docs/css-engine-and-screen-update.md`,
`css-parse.ts`/`css-match.ts`/`css-apply.ts`). Origin: the CSS playground demo
hand-hacked hover with DOM `getBoundingClientRect`; interaction state belongs in
the engine — the runtime already tracks the pointer and hit-tests for input, so
"which view is under the pointer / pressed / focused" should be engine-owned
reactive state that CSS matches on.*

## Why

The demo bolted hover on with per-element bounding-box hit-testing because the CSS
engine had no notion of interaction state. But declarelang's input layer
(`input.ts` `routeInput`) already resolves *which view is under the pointer* and
fires `mouseOver`/`mouseOut`/`mouseDown`/`mouseUp` to that view's sink, and the
focus service (`focus.ts`) already tracks the focused view. That data should be
exposed as reactive state the CSS engine reads — so `.card:hover { … }` works
with zero app code, re-cascading through the same reactive `settle` the rest of
the engine already uses, and **backend-agnostically** (the sink protocol serves
DOM *and* Canvas; the demo's `getBoundingClientRect` was DOM-only).

## Decisions (locked)

- **Surface:** the standard `:hover` / `:active` / `:focus` pseudo-classes
  (`.card:hover`). The parser learns them; any other `:foo` still rejects.
- **State:** three engine-owned reactive boolean slots on `View` — `hovered`,
  `pressed`, `focused` — default `false`, written only by the runtime (absent
  from `schema.ts`, so a `.declare` program cannot set them). They use the
  ordinary reactive-cell machinery, so the matcher's reads are tracked and a
  change re-cascades in one settle.
- **Hit-testability (`:hover`/`:active`):** **automatic** — when the CSS applier
  sees a view could match a `:hover`/`:active` rule, the engine installs a
  lightweight interaction sink for it (making it hit-testable). Exactly the views
  those rules can affect, no author wiring.
- **`:focus`:** matches only views that are already `focusable` (the existing
  `View.focusable` + `focus.ts`). No auto-focusability — making arbitrary views
  focusable would corrupt tab order; `:focus` on a non-focusable view simply
  never matches (correct).
- **Scope:** all three states in this slice, sharing one mechanism.
- **Pseudo specificity:** each pseudo contributes **+10** (CSS rule — same as a
  class).

## Architecture

### The pseudo condition (parser + matcher)

`css-parse.ts` gains a condition kind:

```ts
type Condition =
  | … existing (tag/id/class/attr) …
  | { kind: "pseudo"; name: "hover" | "active" | "focus" };
```

`parseSimple` accepts `:hover`/`:active`/`:focus` after a simple selector
(`.card:hover`, `Button:active`, `#field:focus`) → a `pseudo` condition. Any
other `:name` throws `CssUnsupported` (unchanged rejection for the rest). Each
pseudo adds 10 to `specificityOf`.

`css-match.ts`: `MatchView` gains `pseudo(name): boolean`; `simpleMatches`
handles the `pseudo` kind by calling it. The `css-apply` adapter implements
`pseudo` by reading the matching reactive slot **through the tracked getter**:

```ts
pseudo: (name) =>
  name === "hover" ? v.hovered : name === "active" ? v.pressed : v.focused
```

so any state change invalidates the applier and re-cascades — identical to how
`styleclass`/`[attr]` changes already work. Nothing new in the reactive path.

### The reactive state slots (`view.ts`)

`hovered`, `pressed`, `focused` join `defineAttributes(View, …)` as plain
reactive slots (`def: false`, no push, not prevailing). They are **not** added to
`schema.ts`, so the checker rejects an author write — they are engine state. The
runtime writes them (below); reads (by the matcher adapter) are tracked.

### Hit-testability: the interaction sink (`view.ts` + `input.ts`)

Today `View.inputSink()` returns a sink only when the view has author pointer
handlers; a non-null sink flips its surface to hit-testable (`setInput` →
`pointer-events: auto` on DOM / joins the Canvas hit-walk). Two changes:

1. **A view can be marked interaction-tracked.** `View.setInteractionTracked(on)`
   sets a flag and calls a new `refreshInputSink()` that installs a sink when
   *either* author handlers exist *or* the view is interaction-tracked (else
   `setInput(null)`). Pay-per-use: an untracked view with no handlers stays
   transparent.
2. **The sink sets the pointer pseudo-states.** The combined sink, per event:
   - `mouseOver` → `hovered = true`
   - `mouseOut`  → `hovered = false`, `pressed = false`
   - `mouseDown` → `pressed = true`
   - `mouseUp`   → `pressed = false`
   and always forwards to the author handler via `fireEvent` (a no-op when
   absent), so existing input behavior is unchanged. (`routeInput` already
   captures the pressed view and delivers `mouseUp` to it, so a press that ends
   off the view still clears `pressed`.)

**Who marks a view interaction-tracked:** the CSS applier. During its cascade it
already tests each rule against the view. It additionally computes, via a match
that treats `:hover`/`:active` pseudos as **satisfied** (a "would this rule match
if the pointer-pseudo were active" pass — distinct from the real cascade match,
which honors live pseudo *state*): does any such rule carry a `:hover`/`:active`
pseudo and otherwise match this view? If yes → `view.setInteractionTracked(true)`;
if a re-cascade finds none → `setInteractionTracked(false)`. Concretely,
`css-match` exposes a `matchesAssumingPseudo(view, selector)` the applier uses
only for this tracking decision. So exactly the views a pointer-pseudo rule can
affect become hit-testable, and it updates live as `cssRules`/`styleclass`
change. The applier runs after attach (`initTree`), so the surface exists.

### Focus (`focus.ts` + `view.ts`)

`FocusService.focus()` already calls `view.focusChanged(true)` on the newly
focused view and `focusChanged(false)` on the previous. `focusChanged(on)` gains
one line: set the reactive `focused` slot. A focus change then invalidates the
applier (which read `focused` via the pseudo adapter) → re-cascade. `:focus`
requires the view be `focusable` because `focus.ts` only ever focuses focusable
views — no extra gate needed.

## Modules touched

| File | Change |
|---|---|
| `runtime/src/css-parse.ts` | `pseudo` condition; parse `:hover`/`:active`/`:focus`; reject other pseudos; specificity +10 |
| `runtime/src/css-match.ts` | `MatchView.pseudo`; `simpleMatches` pseudo case |
| `runtime/src/css-apply.ts` | adapter `pseudo` (tracked slot reads); mark `setInteractionTracked` from pointer-pseudo rules |
| `runtime/src/view.ts` | `hovered`/`pressed`/`focused` slots; `setInteractionTracked` + `refreshInputSink`; interaction sink sets pointer states; `focusChanged` sets `focused` |
| `runtime/src/focus.ts` | (via `focusChanged`) no direct change beyond the `view.ts` hook |
| `demo/css-playground.html` | delete the JS hover hit-test; add `.card:hover`/`.card:active` CSS |

## Milestones

- **M1 — parser + matcher (pure):** `pseudo` condition, parse the three pseudos,
  reject others, specificity; `MatchView.pseudo` + `simpleMatches`. Fully unit
  tested with fakes.
- **M2 — reactive slots + adapter:** add `hovered`/`pressed`/`focused` to `View`;
  wire `css-apply`'s `pseudo` adapter. Integration test: toggling a slot
  re-cascades a `:hover`/`:active`/`:focus` rule in one settle.
- **M3 — pointer wiring + auto-sink (`:hover`/`:active`):** `setInteractionTracked`
  + `refreshInputSink` + the state-setting sink; the applier marks views from
  pointer-pseudo rules. Real-browser (Playwright) test: a real mouse over a
  `.card:hover` view restyles the DOM; press sets `:active`.
- **M4 — focus (`:focus`):** `focusChanged` sets `focused`; test that focusing a
  focusable view matches `:focus` and blurring reverts.
- **M5 — demo:** replace the playground's `getBoundingClientRect` hover code with
  `.card:hover`/`.card:active` CSS; verify in a real browser.

## Testing

Pure parser/matcher tests (pseudo parse, specificity, reject unknown, `pseudo()`
matching). Integration tests toggling the reactive slots and asserting one-settle
re-cascade + author-provision precedence unchanged. A Playwright test driving a
**real** mouse (not synthetic `dispatchEvent`) over a `:hover`-styled view,
asserting the real DOM restyles — the exact thing the demo hand-hacked, now
engine-native. A `:focus` test via the focus service.

## Non-goals

- Other pseudo-classes (`:first-child`, `:nth-child`, `:disabled`, …) — still
  rejected.
- Auto-focusability — `:focus` needs `focusable`.
- Pseudo-elements (`::before`) — out of scope, rejected.

## Open knobs (deferred)

- `:hover` on the app root / bubbling semantics: v1 matches the resolved sink
  view only (the innermost hit), matching `routeInput`'s single-hovered-sink
  model; ancestor `:hover` (as in real CSS, where hovering a child also hovers
  the parent) is a later refinement if wanted.
