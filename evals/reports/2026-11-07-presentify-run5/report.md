# Presentify run 5: round 1, Opus 5.5, Declare, at 81d494e0

**37.3 min, 126 turns; 19 of 19 hidden checks delivered, and 19 of 19 at its first clean boot
(21.2 min)**, the first Presentify run to be fully right at first boot. Run 4 was 1 of 19
there (18 with a role added); React run 2 reached 19 of 19 at its first run, at 26.9 min.

## Figures

| | Run 4 | **Run 5** | React 2 |
|---|---|---|---|
| time | 34.2 min, 136 turns | **37.3 min, 126 turns** | 35.2 min, 133 turns |
| model · tools | 28.7 · 5.6 min | **27.8 · 9.5 min** | 31.8 · 3.4 min |
| output tokens (thinking) | 184.0k | **178.8k (66.5k)** | 212.6k |
| code | 3,373 lines: Declare 2,933, TS 440 | **3,307 lines: Declare 2,996, TS 311 · 2,553 non-blank Declare** | 8,375 lines: TS 3,049, TSX 3,015, CSS 2,311 |
| first app file · first clean boot | | **5.5 · 21.2 min** | 3.4 · 21.8 min |
| hidden checks at first boot | 1 of 19 (18 with the stage's role) | **19 of 19** | 19 of 19 at first run |
| hidden checks delivered | 19 of 19 | **19 of 19** (with the check fixed, below) | 19 of 19 |
| its own checks | 2 assert scripts, 75 assertions | **2 flows, 71 assertions**, plus a 100-slide responsiveness check | 15 Vitest tests, 10 Playwright scripts |

### Where the time went

| What | Minutes |
|---|---|
| Reading, and a scratch probe of the risky parts (recursive schemas, coordinates and a text field on a scaled slide, the service) | 6.6 |
| Writing seven files in one pass (geometry helpers, theme and parts, model with undo, one slide renderer, editor, home and presenter, the App) | 13.5 |
| Compile fixes and the first boot | 1.1 |
| First look, drawing and saving end to end | 1.3 |
| The "what done looks like" scenario script: Shift-click (the driver's `clickAt` has no modifiers) and the double-click edit that ended itself | 6.6 |
| The second flow, the colour picker, the inspector's blank fields | 3.5 |
| In-progress states, the 100-slide deck (about 6 ms a drag frame), the final pass and clean-up | 4.7 |

## The hidden checks, and their audit

`drive.mjs`, the same 19 flows, against the delivered app copied unedited into the main tree
and served on 8290. First pass: 18 of 19, failing `slides_add_duplicate_delete` ("never
stored: a third slide, a duplicate"). **The check's fault.** The brief says "duplicate a
slide" and names no chord; this app offers Duplicate slide in its Slide menu (⌥⌘D) and on a
thumbnail's context menu, and Delete slide there too, while the check tried only a visible
control and ⇧⌘D / ⌘D (then ⌫ / ⌦). The check now also opens the thumbnail's context menu, for
both steps (`evals/apps/presentify/drive.mjs`); every earlier route is tried first, so apps it
already passed are unaffected. With that: **19 of 19** delivered, and **19 of 19** for the
snapshot at the first clean boot. Results in `drive/`.

## Is it idiomatic Declare?

`idiom.py`: 2,227 lines Declare without comments plus 311 TS (geometry helpers), 66 colour
literals outside a theme (the sample decks' and the palette's own colours, which are content),
93 theme reads, 2 `State`s, 1 visible switch, no width branches (a desktop editor), 6
`flexes`, 1 browser script (full screen, the clipboard, the unload warning). One slide
renderer drawn at every scale, recursive `classFor` for groups, a `History` node with
whole-document snapshots for undo.

## Findings for the platform

**Fix now (tools, docs):**
1. `drive.clickAt` takes no modifiers, though `drive.click` does; the agent read
   `verify-behave.mjs` to find out.
2. `declare.md` §9 teaches themes but never names `npx declare-help "theme tokens"`; the agent
   read `library/themes/sanfrancisco.declare` to learn the token names.

**Gaps, for a decision:**
3. **Undo for app data**: no history facility; every editor writes its own (snapshots here).
4. **A colour well or picker**: absent.
5. **Full screen**: no request and no reactive fact; it needed a browser script, and reading
   `runtime/src/keys.ts` to see where keys are heard.
6. **The system clipboard across windows**, and **a warning before closing with unsaved
   work**: both needed browser scripts.
7. A number field that can show "Mixed" and be empty.

**Unconfirmed defect:**
8. **Focus moved off a newly focused field.** After a long scenario in which focused fields had
   been removed with `exists`, a text field focused in `onInit` with `afterSettle` lost focus a
   moment later through `FocusService.apply` (the agent logged the stack), so its `onBlur`
   ended the edit. A short script never showed it. If focus recovery for a removed view can land
   after the program has moved focus, that is a defect; it cost about 20 minutes.

## Its account, word for word

# Building Presentify in Declare: an account for the Declare team

I built a complete slide editor: a presentations grid, an editor with a slide rail, canvas and inspector, drawing and handles, groups, undo, saving to the service with conflict detection, and presenting. It came to about 2,000 lines across six `.declare` files and one `.ts` script. Two scenario scripts pass against the live service, with 37 and 34 assertions. Below is what that was like. Where I'm guessing, I say so.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, whole.
4. Guide chapters 01, 04, 05 and 06, whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

After that I stopped reading cover to cover, as the skill says to, and read the chapters my plan needed, also whole:
- `09-pointer-and-keyboard`
- `14-data`
- `17-your-own-views`
- `18-overlays`
- `21-motion`
- `23-animated-arrangements`
- `12-text`

I asked `declare-help` about roughly forty names. These included `undo`, `History`, `UndoStack`, `Clipboard`, `Color`, `fullscreen`, `ColorPicker`, `colorWithAlpha`, `TextInput`, `cursor`, `schema`, `DataSource` (with `.method` and `.body`), `Dataset.contents`, `DrawContext`, `MenuBar`, `Shortcuts`, `Popover`, `Dialog`, `Time`, `KeyEvent`, `Segmented`, `Switch` and `App`. For `apps/desktop/desktop.declare` I ran `declare-help map` and read `DeskWindow` (lines 430–680) for its drag, resize and cursor patterns.

**What I skipped:**
- Guide chapters 02, 03, 07, 08, 10, 11, 13, 15, 16, 19, 20, 22 and 24–31. The skill told me to stop, and declare.md plus the to-do app covered what those chapters would have given me.
- `tracker.declare`, except a grep for its undo. The skill recommends reading the tracker whole; I didn't, because I saw its undo was a toast. That may have been a mistake: its `DataSource` class pattern is closer to my `Library` than anything I did read.

Skipping chapter 08 (Controls) probably cost me. I never learned about `ChoiceControl`/`ChoiceItem` until the compiler raised DECLARE4026, and I never adopted them.

**What taught me the most:**
- **declare.md §5 ("What you can assign").** The table separating set-with-constraint from declare-with-default shaped almost every attribute I wrote.
- **The to-do app.** It's where I absorbed the habits: name every decision, use a `Node` with `trackChanges`/`onChange`, use `classroot`, and use `exists` versus `visible`.
- **A ten-minute scratch program.** Before writing anything real I tested four risks: a recursive schema, pointer coordinates inside a scaled view, a `TextInput` inside a scaled view, and a PUT with a 404 reply. That bought more confidence than any page of the docs. `e.x` turned out to be in the scaled view's own unscaled coordinates. That one fact decided the canvas architecture, and I couldn't find it stated anywhere.

**What was missing or misleading:**
- **Pointer coordinates under a scaled ancestor.** `View.scale` says every reader agrees on the geometry. It doesn't say what `e.x` is under scale.
- **Theme tokens.** I opened `sanfrancisco.declare` to see token names, though a `declare-help "theme tokens"` hint was printed right in front of me (see (i)).
- **Name shadowing.** Built-in method names (`bounds`) silently shadow script functions. The docs state the scoping rule, but they never warn that `View` already owns common words.

---

## (b) Expressing what I wanted

**Where it fit very well:**

- **One `SlideView`, scaled.** The slide is 1280×720 and shown at any size with `scale`. The editor, the rail thumbnails, the home cards, the conflict banner's preview, and the presenter are all the same class. That gave live thumbnails and "the presentation looks exactly as in the editor" for free. This was the best moment of the build.

- **Replication with `classFor`, recursively.** A group's view contains another `ShapeView [ datapath = :children[], classFor = {…} ]`, which can pick `GroupView` again. I half expected a refusal; it just worked.

- **Constraints for chrome.** Handles, outlines and the size tag are pure constraints over `app.selBox`, so "handles follow what they hold" needed no code.

- **Springs and `TweenLayout`.** Two pieces of motion cost almost nothing:
  - The editor grows out of the card that opened it: one `Spring` on `openT`, with `x`, `y`, `scale` and `cornerRadius` all reading it.
  - Rail reordering glides because `RailLayout extends TweenLayout`, and moving the record is enough.

- **Overlays and menus as records.** `MenuBar` doubling as the shortcut table was exactly right. It meant every command was on screen and had a key with one declaration. Popover, Dialog, Toast and ContextMenu all behaved without wiring.

- **Several `DataSource`s, one job.** Each takes its `url` and `body` from a single `job` attribute, and `fetch()` settles first. That made the save loop simple.

**Where I worked around it:**

- **Most of the app's logic lives in methods and a script file.** Hit testing, resize maths, snapping, align/distribute, grouping and restacking are about 400 lines of TypeScript in `shapes.ts`. I think that's legitimate ("functions of their arguments"). Still, it means the most interesting part of a slide editor isn't Declare.

- **Imperative handlers.** The canvas gesture is a `Node` with imperative handlers, and every edit writes a whole new `elements` array to the Doc. Declarative layout doesn't apply to a free-form canvas, which the docs say outright.

- **Undo, colour picking, full screen and a shared clipboard** were all mine to build (see (g)).

---

## (c) The first time it ran

The first boot (R4) succeeded after about ten compile fixes. The home screen looked right on the first screenshot. The editor rendered the sample deck faithfully. Drawing a rectangle produced a correct PUT. What was wrong only showed up later, through scripts and screenshots:

1. **The new presentation's title wasn't focused.** The scenario script typed "Quarterly review" and the title stayed "Untitled presentation".
2. **The test window was narrower than my `minWidth`.** The first assert said an inspector field was "outside the window at (1034, 174)".
3. **Shift-click didn't add to the selection.** The cause was my test driver, not the app (see (d)).
4. **Double-click editing ended immediately** (see (j)).
5. **Text drawn over the dark title bar was invisible.** It defaulted to dark ink because the slide behind it is white. A screenshot caught this; no assertion did.
6. **The inspector showed "0" and "None"** in sections that didn't apply, and its Buttons used a large font.
7. **The closing animation showed "Opening…".**
8. **The presenter's hint pill never appeared.**
9. **Merely viewing a deck wrote to it.** A curl showed sample slide `s1` had gone to version 2.

Items 5–8 came from screenshots. Item 9 came from checking the service directly. The rest came from assertion failures.

---

## (d) Every refusal and surprise

### Compile, structure (R1)

| What I wrote | What the platform said | What I changed | My judgement |
|---|---|---|---|
| `schema Job [ …, body?: object, … ]` | DECLARE5000: a shape field can't be `object` | `any` | **Docs a little unclear.** declare.md §3 says "`object`/`array` stand for a record or list of no declared shape", so I assumed schemas accepted it too. The message was clear. |
| `key: string` on `ToolChip`, and `SlideThumb`'s own `key` attribute | DECLARE2000: `key` is replication metadata | `shortcut`, `slideKey` | **My code wrong, platform reasonable.** Good message, and it named alternatives. |
| A member named `outline` (a stroke value) | DECLARE2000: `outline` is a value constructor and can't be a member name | `edge` | **Fine.** I hadn't realised `outline()` was in that set. It's in §12 text treatments, which I'd read. |
| `y = 0` on a child of `SimpleLayout` | The exact message the layout guide quotes | Removed | **My code wrong.** Message excellent. |
| `opacity = {…}` together with a `Spring` on opacity | DECLARE2005 | Dropped the binding | **My code wrong.** Very clear. |
| `doc: Doc [ ]`, a `Dataset` subclass with no body | "a Dataset needs data" | Gave it an empty JSON body | **Mildly surprising.** For a class whose data is loaded later, an empty default would be friendlier. Not wrong. |

### Analysis (R3)

| What I wrote | What the platform said | What I changed | My judgement |
|---|---|---|---|
| A call to `bounds(e)`, a script function | TS2554 ("passes 1 argument but declares 0"), TS2339 ("'w' is not a member of {x, y, width, height}"), and lint DECLARE4002 ("bare 'bounds' means App's member here") | Renamed it `extent` | **The sharpest edge of the build, though only one instance.** DECLARE4002 diagnosed it exactly, but it came as a lint warning beneath two confusing TypeScript errors. It cost perhaps ten minutes. Separately, my first rename silently failed because macOS `sed` doesn't support `\b`; that was my tooling, not yours. |
| `deckCountLine` | Not a member of the App | Added it | **My omission.** |

What I would have needed to get the `bounds` clash right first time: a sentence in §3 ("every view already has methods such as `bounds`, `raise`, `scrollTo`; a script function by the same name is unreachable from a body"), or DECLARE4002 promoted to an error and listed first.

I also renamed things *preemptively*, before compiling:
- `group`/`align`/`distribute`/`restack` in script became `groupEls` and so on, because my App has methods with those names.
- The script's `Outline`, `TextSpec` and `Box` types became `ShOutline` and so on, to avoid my schema names.

I never confirmed the type names would actually have clashed. **Unsure.**

### Warnings I acted on

- **DECLARE4031** (onKeyDown on TextInput replaces Control's own): I added `else super.onKeyDown(e)` in three places. A good catch I wouldn't have made.
- **DECLARE4022**: added `accessibilityPressed = { on }` to `IconButton` and `Swatch`.
- **DECLARE4035** (a label but no role): `group` on the paper and presenter slide, `region` on the presenter.
- **DECLARE4020** (a button inside a button, in `DeckCard`): restructured the card (see (h)).

### Warnings I left

- **DECLARE4026**: the text-alignment IconButtons should be a `ChoiceControl`.
- **DECLARE4025**: nested ternaries in `cursor`, `classFor` and `weightName`.
- **DECLARE1002**: redundant parentheses.

I left 4025 deliberately. For `classFor`, a four-deep ternary over `:kind` really is the clearest form, and a lookup table would mean a record of classes. I'm unsure how to write one that typechecks.

### Things the docs warned me off before compiling

- I nearly redeclared the `Grip`'s child `knob` at the use site. Chapter 17's rule ("a subclass cannot declare a child the base already has") stopped me, and I added an attribute instead.
- `MixedNote` had a nonsense attribute I'd invented. I caught it reading my own code.

### Runtime and layout findings

- **Title focus on a new deck.** `afterSettle(() => Focus.focus(titleField))` inside `arrived()` did nothing. My guess was that the editor was still invisible (`openT ≈ 0`, so `visible = false`) and an invisible view can't take focus. I moved it into a `Node` whose `go = focusTitle && ready && opening.arrived` drives it through `trackChanges`. That works. I never looked at the console, which the `Focus.focus` reference says would explain a refused focus. **Probably my code; unsure of the exact cause.**
- **Removing `onEnter() { Focus.focus(app.canvas.stage) }`.** I removed it, assuming a plain View isn't focusable. **Unverified.**
- **"Opening…" shown while closing.** My condition: `!ready` should have been `inEditor && !ready`.
- **The hint pill never appeared.** `Presenter` is always built (`visible`, not `exists`), so its `onInit` idle timer ran at boot, long before anyone presented. **My code.** It's a nice illustration of the docs' `exists`-versus-`visible` distinction biting.
- **Viewing wrote to the deck.** My `TextView` reported its laid-out height through `trackChanges = ["height"]` on first layout. The sample data's heights were approximate, so opening a deck dirtied it. **My design error.** The platform did exactly what I wrote. I restored `s1`'s heights by hand; it is now at version 3.
- **Text pressed through the paper.** `declare-look --dblclick` on the paper was refused because the press "would reach `app.editor.body.canvas.stage`". That was correct: the paper takes no presses. **Tool behaviour right, and its message was excellent.**

---

## (e) Verifying it

**`declare-verify` R1–R4** took a couple of seconds a run and caught every structural and type error. It reported all of them at once, and each message named the fix.

**`declare-look`** produced screenshots that found the visual bugs (invisible text, inspector padding, the "Opening…" overlay, the hint). Two limits:
- `--dblclick` takes only a path, not a point, so I couldn't double-click a particular text box from the command line.
- Paths by accessible name follow *current* labels. My `"Fill colour"` lookup failed because nothing was selected at that moment, so the well was labelled "Background colour". The error listed the nearest names, which made the cause obvious.

**`--assert` scripts with `--url` against the dev server** did the real verification, and this is where the tools shone:
- `drive.press`/`moveBy`/`release` for drags.
- Program-time control, so a six-second debounce takes no real time.
- `drive.waitReal` for the service.
- `expect.request` for checking what was sent.
- The note "this run failed after talking to a service which earlier runs wrote to", which was thoughtful.
- `drive.profile`, which showed ~6 ms per drag frame on a 100-slide deck and named `Sync.pending` (JSON-comparing every slide, ~4.7 ms) as the costliest rule. I didn't act on that.

**Friction with the tools:**
- The default window was narrower than my `minWidth`. The failure message ("swiping did not bring it in") was accurate, but I had to work out the cause myself. I fixed it with `export const device`.
- `drive.clickAt` takes no `modifiers`, though `drive.click` does. I read `tools/internal/verify-behave.mjs` to confirm, then held Shift through `page.keyboard`. The table in verify.md documents `click`'s modifiers; it should say `clickAt` lacks them, or `clickAt` should take them.
- To read app state from a script, I evaluated `new Function("app", "return "+expr)` against `__declare.find("app")`. It works, but it's a hack. A documented `drive.read(path, attr)` that returned JSON would be nicer. `expect.attr` exists, but I wanted values back.

**What none of my checks covered:**
- `--semantics`. I never ran a screen-reader view, though the brief asks for labels.
- Real two-window editing. The colleague was simulated with a `fetch` PUT.
- The full-screen Escape path, which can't be tested headless.
- Real clipboard behaviour across browser windows.

---

## (f) Confidence, part by part

1. **Presentations: high.** Opening, creating, renaming and deleting (with a confirmation) are all scripted, and the thumbnail is live. Untested: a very long title on a card. I set `maxLines = 2`, but never looked at it with a long title.

2. **Slides: medium-high.**
   - Adding, duplicating, deleting, the last-slide guard, reordering by drag, live thumbnails, and "Slide N" labels all work.
   - **Risk: dragging in the rail.** The ghost and drop slot use fixed-pitch arithmetic from `rootOrigin()` plus `scrollY`. I only tested it unscrolled, with two slides. With 100 slides scrolled halfway I'd expect an off-by-some drop slot. The ghost's placement also looked slightly off in the screenshot.
   - **Risk: keyboard movement through slides.** It depends on my `focusArea` heuristic, and the arrow keys are also nudge keys. A tester who clicks a thumbnail, then the canvas, then presses ↓ with nothing selected will move slides. That's what I intended, but it's arguable.

3. **Shapes: high** for drawing, Shift for squares and circles, a click-made text box, the corner radius staying fixed through a resize, and the radius handle.
   - **Risk: text alignment while typing.** The `TextInput` overlays the `Text`, and the two may differ in line height, so the caret and the text can sit a pixel or two apart, or more for some fonts.
   - **Risk: fonts.** The font list names Mac system fonts (Avenir Next, Didot…), which fall back elsewhere.

4. **Selecting and changing: medium-high.**
   - Click, Shift-click, marquee, Escape, moving, nudging, resizing with Shift, keep-proportions, handles on both ends of a line, groups (including double-click into one), align, distribute and order are all scripted.
   - **Untested:**
     - snapping guides (never asserted, only visible in my head);
     - resizing a group that contains text;
     - Delete when focus is in an inspector field;
     - the `⌥⌘]`/`⌥⌘[` menu keys.
   - **Paste across presentations** reads `localStorage` and prefers it over memory. A stale clipboard from another window will win. I think that's correct, but it's untested.

5. **Inspector: medium.** Mixed values say "Mixed", and the panel's shape is fixed. The fill, outline-width, corner-radius and text-size *fields* were exercised by the scripts, as were the italic and align *buttons*. The colour picker's swatches and its "No colour" button weren't, and neither were the font and weight menus. A tester may find the dimmed-but-present sections confusing rather than reassuring.

6. **Undo: medium-high.**
   - Snapshots of the whole document, coalesced by key (a drag is one step, a run of nudges is one step, a run of typing is one step), and the selection is restored.
   - **Risk:** undo history clears when you switch presentations.
   - **Risk:** inspector colour changes coalesce per popover session, which may merge two deliberate changes into one step.

7. **Saving: high for the three status strings and retrying; medium for conflicts.**
   - Saving is diff-based, so undo and retries are free.
   - **Conflict on the deck itself is handled thinly.** If another window *adds* slides, my window never shows them; I only append their ids to `slideOrder` so the PATCH stays valid.
   - **"Saving…" while a conflict is unresolved.** I show "Saving…" until the person chooses. That's arguably not one of the three true states.
   - **The probe can race the save.** It reads the current slide every few seconds, and I guarded against my own in-flight writes being reported as someone else's. A tester hammering edits in two windows might still find a false or missed conflict. **Unsure.**

8. **Presenting: medium.**
   - It starts on the current slide, the arrow keys, Space and a click advance, and Escape returns you to the slide you ended on (scripted).
   - **Full screen uses `requestFullscreen` plus a synthetic Escape** dispatched to `window` when the browser exits full screen. **I never tested that path**, because headless mode can't. It's the part I'd most expect to break: the person's Escape may leave the app still in presenting mode inside a normal window.

9. **The bar (polish):** Brand, motion, and designed empty and loading states are there. There's no snapping feedback beyond lines, no hover preview on swatches, and no onboarding beyond the empty-slide hint. Screen-reader quality hasn't been checked.

---

## (g) Gaps I worked around

1. **Undo and redo for app data.**
   - *Wanted:* a history of document changes.
   - *Looked:* `declare-help undo`, `History`, `UndoStack`. I found `waypoint` (Back-button history), `Slider.commitOn` ("one undo step"), and the tracker's toast undo.
   - *Did:* a `History extends Node` with whole-document snapshots.
   - *Judgement:* the platform lacks it, I'm fairly sure. The "one entry per settle" machinery behind `waypoint` hints that a general snapshot or transaction history would fit the runtime naturally.

2. **A colour picker or colour well.**
   - *Looked:* `ColorPicker`, `ColorWell`, `ColorSwatch`; all absent.
   - *Did:* a drawn `ColorWell` Control, a `Popover` palette, and a hex `TextInput`.
   - *Judgement:* lacking. I'm fairly sure.

3. **Full screen.**
   - *Looked:* `declare-help fullscreen` (no entry) and grepped the runtime (only Video mentions it).
   - *Did:* a `script [ host = browser ]`, plus a synthetic Escape on exit.
   - *Judgement:* lacking. I'd want a `requestFullscreen` and a reactive `app.fullscreen` fact.

4. **System clipboard across windows.**
   - *Looked:* `declare-help Clipboard`, which pointed only to `TextInput`'s native clipboard.
   - *Did:* `localStorage` via a browser script.
   - *Judgement:* probably lacking. Unsure.

5. **A warning before closing with unsaved work.**
   - *Did:* `window.onbeforeunload` in a script, toggled by a `Node` with `trackChanges`.
   - *Judgement:* lacking, as far as I could find. I didn't search hard.

6. **A number field that can show "Mixed" and be empty.**
   - *Looked:* `Stepper`, which has a numeric `value` and nowhere to say "mixed".
   - *Did:* `NumberField extends TextInput` with `admit`, plus a `deliver(v)` method that the use site overrides. That seam is close to the "a method that only passes the press on" drift the skill warns about.
   - *Judgement:* there may be a better shape, perhaps a `ValueControl` with a nullable value. Unsure.

7. **Hit testing shapes.**
   - *Wanted:* "which element is under this point", with true shapes for lines and ellipses, unfilled rectangles, and group paths.
   - *Looked:* `viewAt` in chapter 09. Its walk is box-based, and the `cornerRadius` reference says the radius doesn't affect hit testing.
   - *Did:* a geometric `hitPath` in script.
   - *Judgement:* correct for an editor. `viewAt` with a path clip might have covered ellipses, but not lines with tolerance.

8. **Ellipses.** `cornerRadius` can only make a pill, so `EllipseView` draws itself with `draw()`. This is fine, but an elliptical radius would let ellipses be plain views.

9. **Debouncing the save.** `afterDelay` plus a generation counter. `afterDelay` returns a `DelayHandle` with `cancel()`, which I noticed in the reference and didn't use. **The platform had it; I chose the clumsier way.**

10. **Popover placement.** Only `"below"` or `"above"`. I wanted the colour picker beside the inspector (to the left). I accepted below.

11. **Reorder-by-drag in a list.** I computed the drop slot by hand from `rootOrigin()`, `scrollY` and a fixed pitch. Chapter 09 says rearranging is a data change and the layout glides, which is what happened on drop. But nothing helps with the slot during the drag. **Unsure whether something exists;** I didn't read chapter 16.

12. **Text height.** The format stores the laid-out height. I let the `Text` size itself and reported it through `trackChanges`. `measureText` measures runs but, as far as I saw, not wrapped blocks. **Unsure.**

---

## (h) Changes of direction

1. **Ending an edit on blur → ending it on presses and keys** (late in the build, scenario script; see (j)). The brief only asks for "a click elsewhere or Escape", so nothing was lost.

2. **Focusing the title in `arrived()` with `afterSettle` → a `Node` gated on `opening.arrived`** (mid-build, from a script failure).

3. **Writing every text height → only for text being worked on** (late; I noticed sample data changing after viewing it).

4. **New text inked against the slide background → against the shape under its corner (`groundAt`)** (late, from a screenshot).

5. **`DeckCard` as one `Control` with a nested "more" button → a View holding an "open" Control, with "more" as a sibling** (early; DECLARE4020).

6. **Grip with a child override → a `warm` attribute** (before the first compile; chapter 17's rule).

7. **Inspector rows dimmed by opacity → dimmed captions only** (after the first editor screenshot, where the disabled controls were dimmed twice).

8. **Script `bounds()` → `extent()`** (first R3 run).

Before writing code, I also weighed and rejected:
- an explicit save outbox with dirty flags, in favour of comparing the document with what the service last accepted;
- flattening groups for rendering, in favour of recursive `classFor`;
- a `Keys` member for the arrows, in favour of a `Shortcuts` set, because plain keys stand down in text fields;
- building the editor with `exists`, in favour of `visible`, so that the App's aliases (`app.canvas`, `app.gesture`) are never null.

The `Shortcuts` choice came straight from chapter 09.

---

## (i) Source reads

**`library/themes/sanfrancisco.declare`.**
- *Looking for:* which token names a complete theme carries, so my `Presentify` theme could override the right ones (`accent`, `accentHovered`, `control*`, `menuHighlightFill`, `segmentedSelectedFill`…).
- *Docs first:* declare.md §9 and the to-do app's `PaperLight`. Both say "start from a preset and spread", but neither lists the tokens.
- *Did the reference have it?* Yes, I now think so. Every class's help entry ends with "every token: `declare-help "theme tokens"`", and I never ran it.
- *What would have helped:* naming that command in declare.md §9, where themes are taught: "the tokens the library reads: `npx declare-help "theme tokens"`".

**`runtime/src/keys.ts`.**
- *Looking for:* where `Keys` and `Shortcuts` listen, so a synthetic `KeyboardEvent("keydown", {key: "Escape"})` dispatched when the browser leaves full screen would reach my `⎋` shortcut. (The browser consumes the Escape that exits full screen.)
- *Docs first:* chapter 09 and `declare-help fullscreen`. Neither says what target the keyboard is heard on, and there's no full-screen entry.
- *Found:* `listen(…, target: Window = window)`.
- *What would have helped:* better than documenting the listener, a full-screen facility with a reactive fact. If that's out of scope, a sentence in chapter 09: "the keyboard is heard on the window; a full-screen exit by Escape is not delivered as a key".
- I never confirmed the synthetic dispatch actually works.

**`tools/internal/verify-behave.mjs`** (not on your list, but I read it).
- *Looking for:* whether `drive.clickAt` takes modifiers.
- *Docs first:* the verify.md table, which shows `click(path, { modifiers })` and `clickAt(path, x, y)`.
- *What would have helped:* the table saying `clickAt` has no modifiers, or `clickAt` taking them.

---

## (j) Double-click editing that worked alone but failed in the scenario

**What I saw.** In `done.mjs`, after "Duplicate slide" from the menu bar, the script clicked the title text, then double-clicked it. Afterwards the text was selected, but `editingId` was `""`.

**What I tried.**
1. A minimal script on a seeded slide: a double-click started editing correctly.
2. The same script, preceded by "Slide → Duplicate slide" through the menu bar: still correct. That ruled out my first theory, that the menu restoring focus "a turn late" (as chapter 18 describes) was stealing it.
3. Debug prints in `done.mjs` confirmed the right element was selected and the tool was Select.
4. Wrapping `app.beginTextEdit` and `app.endTextEdit` in `page.evaluate` to log their stacks gave the answer:
   - `beginTextEdit` was called from `Gesture.open` through `View.onDblClick`. Editing *did* start.
   - Then `endTextEdit` was called from `TextInput.onBlur` through `FocusService.apply`. Something moved focus off the new field just after my `onInit` focused it with `afterSettle`.

**What fixed it.** Removing `onBlur() { app.endTextEdit() }`. Editing now ends on a press on the canvas, Escape, a tool change or a slide change.

**What I now think caused it: unsure.** I didn't log `document.activeElement` after the blur, which would have answered it.

My best hypothesis involves the earlier part of the scenario. Several text fields had been created and then removed with `exists` (each new text box's field, discarded on Escape), and inspector buttons had been pressed. Chapter 18 says that when the view that had focus is gone, focus moves to the next Tab stop after where it was. I suspect a press on the stage (a non-focusable view) left a focus decision pending in `FocusService`. If that decision was applied on the turn after my `afterSettle` focus, it would undo it. The minimal script had no history of focused or discarded controls, which would explain why it passed.

That's inference, not evidence. Either way, the lesson for the docs is this:
- "Focus the field in `onInit` with `afterSettle` and end the edit on blur" is the natural first version of in-place editing.
- It's fragile in a way that only shows up after a long session.
- An `onBlur` that can be caused by the platform's own focus bookkeeping deserves a note in chapter 08, or a `Focus` API that can say *why* focus moved.
- It cost me about twenty minutes.

---

## Surprises

- **Recursive `classFor` just worked**, and so did a `TextInput` inside a scaled view: it scaled, kept its caret, and kept its font.
- **`e.x` in a scaled view is in that view's own coordinates.** Delightful once known, but undocumented.
- **Common words are already taken.** `key`, `outline` and `bounds` are all reserved or owned by `View`.
- **The verifier's prose is unusually good.** Notes like "fed a sample of their schema at boot", "never built, so never checked: LineView", and "would reach stage: covered there" told me what a check did *not* establish, which most tools never do.

## What was good

- **The diagnostics.** Almost every one named the fix, and the fix was right.
- **One class for every view of a slide.**
- **Assignment as the whole update model.** The save loop could simply recompute "what's different", with no events.
- **Overlays as standing members.** I wrote no dismissal code at all.
- **Scripts that drive the real app in program time**, which made a 135-step scenario a sub-minute run.
- **The skill file's structure.** "Read these, then stop" was the right instruction.

## What was bad

- **Name collisions.** `View`'s built-in members shadow script functions, and the warning about it is a lint rather than an error.
- **No undo, colour picker or full-screen facility** for an app category the README specifically courts ("objects people move and resize on a surface").
- **Focus is opaque.** I couldn't tell who moved it, or why a `Focus.focus` call did nothing.
- **`declare-look` has no `--dblclick` at a point.**
- **The default check window is laptop-sized, below a desktop app's `minWidth`,** and the failure doesn't say so directly.

## Compared with what I know

It reminded me most of three things:
- **OpenLaszlo/Flex**, which it names as its lineage: tree, constraints, states.
- **SwiftUI**, without the view-rebuild model.
- **A spreadsheet**, in how attributes depend on one another.

Compared with React, there's far less ceremony for derived state and motion, and nowhere to put stale state. The price is that imperative editor logic (gestures, undo, a write queue) feels like visiting another language: handlers and script. Then again, it feels that way in every framework.

## Where I'd most want improvement

1. **A document-history primitive.** Snapshot-or-transaction undo over datasets, tied into "one entry per settle".
2. **Name-collision errors** that list the built-in members a declaration or script function would shadow.
3. **Focus transparency.** `Focus` should explain why focus moved and why a focus request was refused, in the diagnostics or in `__declare`.
4. **A few missing controls**: a colour well and picker, a number field that can be mixed, full screen, and a clipboard.
5. **Documentation of coordinate systems under `scale`**, and of the theme-token listing.

Of these, the first was the biggest single cost. It was one obstacle, roughly an hour of design and code, and it's also where I'm least sure my version is right.

## What I'd use it for

I'd use it for interactive tools with rich, continuous UI: editors, boards, dashboards and calendars. It's especially strong where the same content shows at several scales, and where motion should carry meaning. I'd hesitate for apps whose core is heavy imperative editing logic until there's undo support. Even then, building this app in it was more pleasant than I'd expect the same build to be in React.

## Names

```
NAMES — eval-presentify-5.noindex: 3 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    20 · member    · deckCountLine        · this App                 · —                  · none         · ×1  ·   21 · resolved
         'deckCountLine' is not a member of this App — declare it (deckCountLine: <type> = …) or fix the name [DECLARE6001] (home.declare:30:51)
    20 · member    · w                    · { x: number; y: number;  · —                  · none         · ×1  ·   21 · resolved
         'w' is not a member of { x: number; y: number; width: number; height: number; } — declare it (w: <type> = …) or fix the name [DECLARE6001] (line 252, col 35)
    20 · member    · h                    · { x: number; y: number;  · —                  · none         · ×1  ·   21 · resolved
         'h' is not a member of { x: number; y: number; width: number; height: number; } — declare it (h: <type> = …) or fix the name [DECLARE6001] (line 252, col 61)

SUMMARY: 3 of 3 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
