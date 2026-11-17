# Presentify run 16: Opus 5.5, Declare, on the local tree, minimal

The retest of the color change (DT, 2026-11-16): `Color` out of the data schema's field types,
`Color.from(s)` added, the compile's literal step on Declare's `Color` only. Same level as run 15
("it must build and start with no errors. Check that and nothing more"). **26.7 min, 62 turns,
172k output tokens** (86k thinking). Timing record: `evals/timings/2026-11-16-presentify-run16-local.txt`.

## 1. The score

**The hidden drive: 16 of 19**, as handed over (`drive-results.json`) — against run 15's **5 of 19**
and its audit probe's **16 of 19**. Every save reached the service: `saving_and_retry`,
`undo_is_one_step`, `slides_add_duplicate_delete`, `present_and_return` and the drawing checks all
pass.

**The three failures are one platform defect, and run 15 failed the same three the same way:**
`draw_each_kind` (the rectangle 466×311, drawn 300×200), `move_and_nudge` (dragged to 444,329,
not about 357,283), `rounded_corners_hold` (the side-handle resize). 466 ÷ 300 = 1.553 = 1280 ÷ 824,
the slide's width over its width on screen: a pointer's travel scaled once too often.

**Reproduced** (`repro-deltax.declare.txt`): a view inside a stage at `scale = 0.5`; a drag of 100
screen pixels. `rootX` moves 150 → 250 (100, root space); `deltaX` reads **200** — the view's own
frame. The reference (`declare-help PointerEvent`) says "`deltaX`/`deltaY` are how far the pointer
has moved, **in root space**, since the press". The agent read that and divided by its zoom
(`onDrag(e) { app.ed.drawBy(e.deltaX / app.zoom, …) }`), as run 15's agent did. **The runtime and
its reference disagreed. Resolved the same day (DT): the runtime is right by design** — on a
drag, `dragDeltas` (drag-autoscroll.ts) gives the travel in the frame the dragged view's own `x`
is set in, scrolling included, so `x = startX + e.deltaX` holds under any zoom — and the
reference, a per-member entry for each `PointerEvent` field, and guide 9 § Dragging now say so (the guide 10 pan example reads `deltaX`
against `this.width`, i.e. as the view's own frame). The reference has no entry for
`PointerEvent.x` or `PointerEvent.deltaX` on their own (`declare-help PointerEvent.deltaX` misses).

## 2. The color change, as this run met it

- **Data:** its schemas typed colors `string` from the first write — `schema Outline [ color:
  string, width: number ]`, `background: string` — with no refusal: guide 15's field list no
  longer names `Color`. Records went to the service as written.
- **Into views:** the type check refused three string colors with the new hint ("a string is text,
  not a color: read it as one with Color.from(s)") [DECLARE6001], and the agent wrapped them in
  `Color.from(…)` in one round (art.declare:190, 196; parts.declare:302, 327).
- **The gap that remains:** four lines paint a data color straight from a `:path` read —
  `fill = { :fill ?? null }`, `fill = { :background ?? "#FFFFFF" }`,
  `Stroke(:stroke.width, :stroke.color)`, `fill = { :stroke?.color ?? "#1E1A2E" }` (art.declare:48,
  105, 106, 161). A `:path` inside `{ }` is not type-checked (guide 15's table: "nobody yet"), so
  the strings reach the slot unchecked, and the runtime's leftover tolerance reads the hex there.
  They paint (the thumbnails, `seen-p16-home.png`), through exactly the implicit conversion the
  design set out to remove. The agent saw it: "`fill = { :fill ?? null }` … *not* flagged. That is
  presumably because `:path` reads inside `{ }` are untyped" (account, d10). **For DT:** either
  `:path` reads inside bodies get their schema's types (the table's open row), or a color slot
  stops reading strings at run time and says "use Color.from" — or both.

## 3. Seen running (beside runs 15 and 14, at 1440×900)

`seen-p16-*.png` here; run 15's are in its report folder (`seen-p15-*.png`; its app no longer
compiles on today's tree, which refuses its schema's `Color` fields — as intended).

- **Editor, rectangle selected; Edit menu:** finished, the inspector fuller than 15's (fill and
  outline wells, radius slider, text and arrange sections greyed when they don't apply).
- **One small loss:** the presentation's title field in the editor's bar is too narrow —
  "Untitled presentation" shows as "Untitled preser".
- **The delete dialog regressed:** Delete is the filled default and Cancel secondary
  (`buttons = [ { id: "cancel", label: "Cancel", cancel: true }, { id: "delete", label: "Delete",
  default: true } ]`, presentify.declare:498), with no `destructive`. Runs 14 and 15 had it right.
- **Phone:** the home screen's cards run off the right edge, as in runs 14 and 15.

## 4. The comparison

| | 14 (standard) | 15 (minimal) | **16 (minimal)** |
|---|---|---|---|
| total | 38.1 | 21.6 | **26.7 min** |
| turns | 146 | 64 | 62 |
| output tokens (thinking) | 194k (70k) | 139k (61k) | 172k (86k) |
| reading · writing · checking | 4.4 · 0.0 · 33.7 | 9.4 · 7.9 · 4.3 | 10.3 · 13.1 · 3.3 |
| drive | – | 5/19 | **16/19** |

- **Tokens:** 172k output, 114 fresh input, 377k cache writes, 13.2M cache reads; context **257k at
  the first app write, 386k at the end**.
- **Code:** 3,505 lines in 7 Declare files, 2,753 without comments and blank lines. **Download:**
  218 KB gzip (Presentify 14, built today: 216 KB).
- **Source reads:** one — a grep of `library/menu.declare` for "submenu", to learn whether menus
  nest. The reference says so (`Menu.items` lists `submenu?`; `Menu.hasSubs`). Unneeded.

## 5. The refusals (read in the stream; each named its fix)

`El` declared twice (DECLARE5001); a child's `y` under a layout that places it; an attribute and a
child both named `fill`; an App attribute `clip`; statements where one expression belongs; `white`
bare inside braces (DECLARE4004); the three string colors (§2). Warnings, each an improvement: a
`Swatch` showing "chosen" without `accessibilityPressed`; a button in a button (`more` in
`DeckCard`); a label with no role; a script binding shadowed by a member (DECLARE4002); three
three-deep `? :`.

## 6. Recurring missteps (runs 10–15)

| | Run 16 |
|---|---|
| Menu keys spelled Mac-only | **Gone:** `"Ctrl+Z"`, `"Ctrl+Shift+Z"` |
| A string switch on item ids | **Mostly gone:** 79 rows carry `command:`; 6 `picked(id)` remain |
| A home-made type for `afterDelay`'s handle | Gone |
| Delete as the dialog's default, unmarked | **Back** (§3) |
| Colors typed `string` because `Color` failed as data | **Moot:** strings are now the rule for data |

Its undo is a `History` Node of whole-deck snapshots, its own — there is no library undo (its
account: "probably genuinely absent as a feature … Unsure"). Its zoom is computed from window
arithmetic, not measured from the stage, which it flags itself.

## 7. Findings for the platform

1. **`deltaX` is in the view's own frame; the reference says root space** (§1). Three of this
   run's three failures, and the same three in run 15.
2. **`:path` reads inside `{ }` are untyped**, so a data string reaches a color slot unchecked and
   the runtime reads it (§2).
3. **The reference's `PointerEvent` has no per-member entries** (`PointerEvent.x`, `.deltaX`).
4. Its ask: a guide section on a zoomable canvas — coordinate frames under `scale`, `e.x` against
   `deltaX`.

## 8. The agent's account

Asked after the build by resuming the session read-only; answered on the first request (3,267
words).

# Building Presentify in Declare: an account for Declare's makers

First, a correction to my handover. I said the dev server was "running at http://127.0.0.1:8600/…". Since then that background process has exited with code 1. I tried to read its log for this report, but my shell is now disabled, so I don't know why it exited. It may have been stopped when my turn ended, or it may have crashed. What I did see was the startup banner and a 200 response for the program URL. Treat "starts" as true at that moment and unconfirmed now.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`
2. `AGENTS.md` and `skill/SKILL.md`
3. `task/brief.md` and `task/api/API.md`
4. `docs/declare.md`, whole
5. Guide chapters 01, 04, 05 and 06, whole
6. `apps/todo/todo.declare` and `todo-parts.declare`, whole

Then I read selectively, as the skill prescribes:
- `14-data.md`, about the first 480 lines, for DataSource writes and errors
- `09-pointer-and-keyboard.md`, lines 60–471
- `18-overlays.md`, whole
- `08-controls.md`, most of it
- `17-your-own-views.md`, lines 16–345
- `12-text.md`, lines 15–149
- `15-schemas.md`, whole
- `desktop.declare` lines 430–680 (drag and resize), found through `declare-help map`
- About 60 `declare-help` lookups

**What I skipped, and why:** the rest of the guide (scrolling, touch, themes, media, collections, URLs, motion, time, animated arrangements, renderers, embedding, packaging) and the other apps. The skill says to stop reading after the core and look things up as needed. For a desktop-only editor most of those chapters seemed peripheral.

In hindsight, skipping `21-motion.md` and `23-animated-arrangements.md` was a gamble. I used `Spring` and `TweenLayout` only by imitating the to-do app's `Glide`. I never read `16-collections.md` either, so I don't know whether a 100-slide rail should virtualize.

**What taught the most:** `declare.md` §5 (constraints, owned vs declared) and §8 (`onClick` activates, `onPointerDown` manipulates). After those, the to-do app read whole. The "Drift check" list in SKILL.md shaped real decisions:
- hit-testing via views, with an ellipse's `clip` path and a line as a rotated band
- no hand-built overlays
- `keyBindings` instead of key-test chains

`declare-help` was excellent. Its "No ColorPicker… A color is chosen from swatches…" and "No `<select>`…" entries answered questions before I asked them.

**What was missing or misleading:**
- Nothing told me schemas and classes share one namespace. I found out from an error.
- Nothing said `classFor` can't call a member. The error's suggested fix was precise, though.
- Undo isn't covered in one place. SKILL.md says the to-do app shows "shortcuts and undo" coming "with the language", but that undo is a Toast plus a hand-written restore. For an editor I had to build undo myself. That's fine, but "undo" is not a platform feature, and the skill's wording implied more.
- I found no statement of whether `disabled` set on a plain View reaches the controls inside it. `08-controls.md` says "Set on a container, it reaches every control inside." But declaring `disabled: boolean` on my `Section` compiled fine, which suggests View has no such attribute. I'm unsure which is true.

## (b) Expressing what I wanted

**Where it fit well:**
- One `SlideArt` class rendering the editor canvas, the rail thumbnails, the deck cards and the presenter, just by changing `scale`. Each "live picture" was free.
- `classFor` over a recursive `:children[]` for groups. I verified this in a spike first.
- `exists` for the in-place `TextInput`.
- `trackChanges`/`onChange` to wire Sync to `app.deck.rev`.
- Overlays as standing members (`Menu`, `ContextMenu`, `Popover`, `Dialog`, `Toast`).
- Menu `command:` resolving to App `keyBindings`, so the menus and the keys share one table.
- `pointerEvents = "none"` cascading to a subtree, which turned thumbnails inert in one line.

**Where I worked around it:**
- **Imperative engines.** The save engine is a sequential request queue with retry and backoff. I wrote it as a `Node` driving one `DataSource` whose `url`, `method` and `body` are attributes set before `fetch()`. It works, but it's an imperative engine wearing Declare clothes. That is honest to the problem, and I think it's the right shape.
- **Drags.** Every drag is "record history, snapshot `startEls`, rewrite from the snapshot on each move". That is a lot of method code in `Editor`, around 600 lines.
- **Geometry.** Pure geometry lives in a ~300-line `script` block, which SKILL.md's drift check warns about. I judged it legitimate (functions of their arguments over JSON trees), but a reviewer might disagree.

## (c) The first time it ran

I was told not to drive it, screenshot it or view it, and I didn't. "Ran" here means the R4 boot in `declare-verify`. On first boot nothing was wrong:

> clean through R4 (859 of 998 constraints statically wired…)

with a note that EditorScreen, Rail, Stage, ToolTab, ColorWell and others were "not built at boot". So I have never seen any of the editor run. Everything in (d) was found by the compiler, not by running the app.

## (d) and (i) Every refusal and surprise, with the code and the exact messages

These are reconstructed from the session, and the quotes are close to verbatim.

**1. Spike: `classFor` calling a member.**

What I wrote:
```
class Layer [ …, kindClass(k: string) -> any { return k == "group" ? GroupEl : BoxEl } ]
ElBase [ datapath = :children[], classFor = { this.parent.kindClass(:kind) } ]
ElBase [ datapath = :els[], classFor = { app.top.kindClass(:kind) } ]
```
What it said:
> classFor reads the record and names classes — 'app' is neither (… a function in script { } can, called with the fields it needs and returning the class's name as a string — classFor = { shapeClass(:kind) } with return "RectShape", and use [ RectShape, … ] to keep classes named only by a string) [DECLARE4000]

- **What I changed:** a script `kindClass()` returning names, plus `use [ BoxEl, GroupEl ]`.
- **Judgement:** my code was wrong. The diagnostic is superb; it contains the whole fix.

**2. `'El' is declared twice — in "art.declare" and "geometry.declare" [DECLARE5001]`.**

- **What I wrote:** `schema El [ … ]` in geometry, and `class El [ … ]` in art.
- **What I changed:** renamed the class to `Piece`.
- **Judgement:** my error, but the docs never say schemas and classes share one namespace. `15-schemas.md` says a schema is "in the classes' namespace" only in passing in `declare.md` §7. A doc gap, not a platform fault.

**3. A layout's child setting `y`.**

What I wrote:
```
frame: View [ width = 268, height = 151, …, y = { -3 * classroot.lift }, ignoreLayout = false, … ]
```
This was inside `DeckCard extends Control` with `layout: SimpleLayout [ axis = y ]`. It said:
> View.y — DeckCard's SimpleLayout places its children, so this child does not declare its y. Remove it … or set 'ignoreLayout = true'

- **What I changed:** wrapped it in a `plate` View so the inner frame can lift.
- **Judgement:** my code was wrong; I had even half-anticipated it. The message is good.

**4. `accessibilityRole = alert`.**

It said:
> got 'alert' — an alert is `accessibilityRole = status` with `accessibilityLive = assertive`

- **What I changed:** exactly that.
- **Judgement:** my error; excellent message.

**5. A child named after an attribute.**

- **What I wrote:** `Inspector [ fill = {…}, … fill: Section [ … ] ]`.
- **What it said:** "Inspector.fill: 'fill' is already set … a child may not take an attribute's name; rename the child (e.g. 'fillSection')".
- **What I changed:** renamed it as suggested.
- **Judgement:** my error.

**6. App already has `clip`.**

- **What I wrote:** `clip: El[] = []` on the App, meaning a clipboard.
- **What it said:** "App already has an attribute 'clip' … name it otherwise".
- **What I changed:** renamed it to `clipboard`.
- **Judgement:** my error, and an easy one to make. Common words like `clip` are taken by built-ins.

**7. A statement body as a value.**

What I wrote:
```
card: DeckCard? = { let v: View? = this.opener; while (…) v = v.parent; return v as DeckCard | null },
```
What it said:
> Menu.card's default = { … } is not a valid expression — an attribute value is one expression, not statements; move the logic into a method

- **What I changed:** `cardOf() -> DeckCard?`.
- **Judgement:** my error. The rule is documented in §2.

**8. A named color inside braces.**

- **What I wrote:** `stroke = { Stroke(1.5 / classroot.z, white) }`.
- **What it said:** "'white' is a named color — inside { } a color is a string or a number: write "white" (or 0xffffff). [DECLARE4004]"
- **Judgement:** my error. The rule is documented and I still slipped.

**9. Warnings in the same run, all real:**
- A Swatch has a `chosen` state but no `accessibilityPressed` (DECLARE4022).
- The `more` button sits inside DeckCard, itself a button, so a screen reader never reaches it (DECLARE4020).
- The presenter's slide has `accessibilityLabel` but no role (DECLARE4035).
- Lint: "bare 'contentOf' means Deck's member here, not the script { } binding" (DECLARE4002).

What I did about each:
- I fixed all of them.
- The DeckCard one forced a real restructure: the card became a View holding an `opener: Control` plus a sibling `more` button.
- The `contentOf` shadowing was a latent bug, not style. Inside `Deck`, any call to `contentOf(bg, els)` would have resolved to the one-argument member.

The accessibility checks found genuine design mistakes. That is the platform being right.

**10. Strings where colors are expected.**

What I wrote, in `art.declare`:
```
textColor = { classroot.run?.color ?? "#1E1A2E" }
```
and in `parts.declare`:
```
fill = { classroot.value.startsWith("#") ? classroot.value : 0xFFFFFF }
fill = { classroot.color }
```
What it said:
> the { } body of 'textColor' computes a string, but 'textColor' is typed Color — … read it as one with Color.from(s)

- **What I changed:** wrapped them in `Color.from(…)`.
- **Surprise:** `fill = { :fill ?? null }` on `RectEl` and `Stroke(:stroke.width, :stroke.color)` were *not* flagged. That is presumably because `:path` reads inside `{ }` are untyped (`15-schemas.md`'s table says "nobody yet"), even though the dataset has a schema.
- **Judgement:** my code was loose and the check is right. The asymmetry (typed via an attribute, untyped via `:path`) is a platform inconsistency to be aware of.

**11. A name that doesn't exist.**

- **What I wrote:** `'railList' is not a member of this App`. I had referenced `app.railList` and never declared it.
- **Judgement:** my error.

**12. A member through `parent`.**

What I wrote:
```
visible = { parent.showHandles && … }
```
What it said:
> 'showHandles' is not a member of View — declare it … or fix the name

- **What I changed:** moved it to `Editor.handles`.
- **Judgement:** my error. `parent` is typed View. That is reasonable, and it pushed me toward a cleaner design.

**13. Lint DECLARE4025 (three nested `? :`) on IconButton, ToolTab and PillButton `fill`, plus ColorWell `words`.**

- **What I changed:** converted the fills to base value + `State`, and `words` to a record lookup.
- **Judgement:** good advice. The code reads better.

**14. A slip that was my own tooling:** a Python patch failed because `declare-format` had rewritten a line I was matching, so a batch of fixes didn't apply. Formatting between edit passes made literal text matching brittle. That's my tooling, not the platform.

I never went round in a circle. Every diagnostic converged in one edit.

## (e) Verifying it

**Checks run:**
- `declare-verify` R1–R4, about seven times
- `declare-format --write`
- curl of the program URL (200)
- curl of the API (200)

**What each caught:**
- R1–R3 caught everything in (d).
- R4 caught nothing, because the start screen is the deck list. Its own report said what it couldn't check ("not built at boot, so not checked here: … EditorScreen, TopBar, Rail, … Stage"). That honesty is very useful.
- One R4 note surprised me: "3 data source(s) fed a sample of their schema at boot". Boot invents data for schema'd sources. That is clever, but I'm unsure what it implied for `deckSrc`. `openId` was empty, so its `url` was `""`.

**How well the tools served me:** very well for static correctness. Fast (seconds), and each diagnostic names its fix. The gap is the instruction-imposed one: R5 asserts and `declare-look` would have exercised the editor, and I was told not to use them.

## (f) Confidence, part by part

- **Builds and boots:** high. Verified.
- **Deck list, create, open, rename, delete:** moderate. Rename depends on a two-source chain (`reader` → `renamer`). Delete is optimistic via `gone`.
- **Slides — add, duplicate, delete, keyboard navigation:** moderate.
  - Drag-reorder computes the drop index from `e.rootY - parent.rootOrigin().y - 4`. I'm unsure `parent` there is the list view and not something in between.
  - The `TweenLayout` glide is untested.
- **Drawing, moving and resizing with handles:** low to moderate. I expect a tester to find:
  - `e.x`/`e.y` on the scaled `SlideArt` assumed to be in slide points
  - deltas divided by `app.zoom`, which is computed from window arithmetic rather than measured from the stage. If the stage isn't the size I assumed, the handles drift from the pointer.
  - the drawing catcher view swallowing presses meant for handles
- **Text in place:** low. These all depend on runtime behaviour I never observed:
  - focus via `afterSettle(() => Focus.focus(this))` in `onInit`
  - `onBlur` ending the edit
  - the height-sync `onChange` writing data during a settle
  - `TextInput` matching `Text` metrics (padding, line height)
- **Groups with double-click to enter:** moderate in the logic, low in the interaction. Leaf `onClick` and `onDoubleClick` sequencing is untested.
- **Align, distribute, order, group:** fairly high. These are pure functions.
- **Inspector with mixed values:** moderate. The Stepper and Slider commit semantics are untested.
- **Undo:** moderate. The snapshot design is simple, but coalescing and `forget()` ordering could leave a stray step. Undo history now clears on every reload from the service.
- **Saving, offline and retry:** moderate. The reconciliation logic is sound on paper.
  - **Unsure:** how `DataSource` reports a network failure's `statusCode`, and whether `format = "text"` still parses `errorBody` JSON. I wrote `parseReply` to handle both.
- **Conflicts:** moderate to low. The probe races my own saves, and I guarded only the obvious case.
- **Presenting:** low to moderate. `Dialog presentation="full"` plus `app.fullScreen` plus key bindings on the Dialog subclass. Whether keys reach the Dialog's `keyBindings` depends on where focus lands.
- **Polish (§9):** unknown. I never saw it.

## (g) Gaps I worked around

1. **Undo/redo.**
   - *Wanted:* a dataset history ("one entry per settle" in `declare.md` §5 made me hope there was one).
   - *Looked at:* `declare-help undo`, `History`, grep of the guide. Found only `waypoint` (Back) and Toast patterns.
   - *Did instead:* a `History` Node with whole-deck snapshots.
   - *Judgement:* probably genuinely absent as a feature. `waypoint` is Back-button history, not edit history. Unsure.
2. **Color picker.** `declare-help` said it doesn't exist and gave the recipe. I built `ColorWell` + `Popover` + `Swatch` Controls, not the suggested ChoiceControl. The warning then nudged me to `accessibilityPressed`. *Judgement:* absent by design; documented well.
3. **Sequential request queue with retry.** I used one `DataSource` with attribute-driven url, method and body, plus `afterDelay` for backoff. *Judgement:* there's no queue primitive, as far as I found. It might be fine that there isn't. Unsure.
4. **Cancelling a pending `afterDelay`.** I used a generation counter. `declare-help afterDelay` later showed the call returns a `DelayHandle` with `cancel()`, so the platform has it and I simply didn't use it.
5. **Recursive-group selection scope.** I wrote it all myself (`aim()`). This is app logic, not a platform gap.
6. **Rendering the slide 1280×720 at any window size.** I computed `app.zoom` from `app.width`/`app.height` minus panel constants, because aliasing into a conditionally existing child (`app.editor?.body.stage`) looked fragile. The better way was probably to read the stage's own size. That is likely there and I avoided it.

## (h) Changes of direction

1. **`classFor` via a member became a script function returning names.** In the spike, forced by refusal 1.
2. **View class `El` became `Piece`.** At the first full compile, forced by refusal 2.
3. **DeckCard went from one `Control` with a nested "more" button to a View holding an opener Control plus a sibling button.** At the second compile, forced by warning DECLARE4020 in (d)9. A genuine accessibility improvement.
4. **The inline `showHandles` on SelectionChrome became `Editor.handles`.** Forced by refusal 12.
5. **Control looks went from nested ternaries to `State`s.** Lint-driven, at the end.
6. **⌘S went from scheduling a pass to running it synchronously.** My own review: I saw a one-frame "Saving…" flicker coming.
7. **History went from clearing only on a fresh deck to clearing on every reload.** My own review: stale local ids could re-post duplicate slides.
8. **The `rootOrigin` source for slide drag went from an `app.railList` alias to `parent`.** Forced by refusal 11, and simpler.

## Surprises; what was good, what was bad

**Surprises:**
- Recursion in `classFor` with a recursive schema just worked.
- `pointerEvents = "none"` covers the whole subtree.
- Boot synthesizes sample data from schemas.
- The compiler's fix suggestions were correct every time.

**Good:**
- The diagnostics. Every one named the rewrite, and I never needed a second attempt.
- `declare-help` as the reference, including its "no such thing, here's the idiom" entries.
- The accessibility checks found real design flaws.
- One class drawing every picture of a slide.
- Overlays as members.

**Bad:**
- I couldn't learn whether runtime interaction semantics would behave as I assumed (drag coordinates in scaled views, focus timing, `onBlur` ordering), short of running the app. The docs describe each piece but not their interplay in an editor. That's partly inherent, partly my constraint.
- Typing is weaker through `:path` reads than through attributes.
- Ordinary names (`clip`, `fill`) are reserved by built-ins, discoverable only by collision.

**How it differs, and what it reminded me of:**
- It is closest to OpenLaszlo/LZX, as the README says.
- QML (property bindings, states, a declarative tree with JS inside) is the nearest modern cousin.
- MobX-style tracked reactivity, but with static dependency extraction and a refusal (DECLARE7001) where React would silently re-render.
- Unlike React there is no render function at all. Unlike SwiftUI, layout is explicit objects and there are no view modifiers.

**The sharpest edge:** not knowing, without running it, how pointer coordinates and focus behave inside a scaled, nested editor surface. This was a pattern, not one obstacle. It touches handles, drawing, marquee, text editing and the rail drag. It cost nothing at compile time, and it's where I expect most of the real bugs. To have written it right the first time, I'd want:
- a guide section or sample, "a zoomable canvas editor", covering coordinate frames under `scale`, `e.x` versus `deltaX`/zoom, and focus hand-off to an in-place field
- or permission to run R5 against my own drags

**Where I'd most want improvement:**
- A worked canvas-editor example.
- A first-class edit history over datasets, if it fits the model.
- A note that schemas and classes share a namespace.
- Typed `:path` reads under a schema'd dataset.

**What I'd use it for:** data-heavy desktop tools and internal apps where correctness matters. Also interfaces with lots of continuous motion, where springs and constraints replace hand-written transitions. I'd hesitate on a heavily imperative editor without a second pass in a browser. The language handled it, but the parts I couldn't verify statically are exactly the parts an editor lives on.
## 9. The names ledger

```
NAMES — eval-presentify-16: 4 missed name(s), 2 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     2 · attribute · fontStyle            · Text                     · CSS                · foreign hint · ×1  ·    2 · resolved
         Text has no attribute 'fontStyle' — the CSS instinct: italics are Text's 'italic = true'
    24 · value     · alert                · View.accessibilityRole   · browser/Node global · foreign hint · ×1  ·   24 · resolved
         View.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | row |
    24 · member    · railList             · this App                 · —                  · none         · ×1  ·   24 · resolved
         'railList' is not a member of this App — declare it (railList: <type> = …) or fix the name [DECLARE6001] (screens.declare:358:64)
    24 · member    · showHandles          · View                     · —                  · none         · ×1  ·   24 · resolved
         'showHandles' is not a member of View — declare it (showHandles: <type> = …) or fix the name — 2 sites, also on line 559 [DECLARE6001] (screens.declare:535:24)

COLLISIONS (min · held by · name)
    24 · attribute      · fill
    24 · attribute      · clip

SUMMARY: 2 of 4 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
