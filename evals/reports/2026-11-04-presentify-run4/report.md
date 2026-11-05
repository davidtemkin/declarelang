# Presentify run 4: round 1, branded and in motion, Opus 5.5, Declare

**Run:** 2026-11-04, launched with
`evals/craft/launch.sh presentify ~/Code/eval-presentify-4 claude-opus-5-5 30785964 8360`, at the same moment as
React Presentify run 2 (`evals/reports/2026-11-04-presentify-react-run2`), so both built under the same machine load.
The brief is the same as runs 2 and 3 (`evals/apps/presentify/brief.md`). Since run 3 (b276f9ce), 30785964 added:
a warning for a label on a role-less view (DECLARE4035) and for `commitOn` on one-way text (DECLARE4036);
`DataSource.onError()`; a `TweenLayout` that re-places when what `place()` read changes; numeric path steps that
count views; the key names in `declare-help Shortcuts`; `declare-look --dblclick`; and `declare-look` closing the
page as a person would, so a pending save runs.

**Files beside this report:**
- the app (`app/`: five Declare files, one TypeScript file, its own two assert scripts in `app/checks/`, its
  `README.md`);
- the hidden checks' results (`drive/`): delivered, at first boot as is, and at first boot with the stage's role
  added;
- the prompt and the questions it was asked (`prompt.txt`, `impressions.txt`).

Its account is near the end, word for word, followed by the names ledger. The side-by-side page with React run 2
is the Artifact https://claude.ai/artifact/Xau1B7K1P2MQ6KWhkadp4w.

## Figures

| | Presentify 3 | **Presentify 4** | React Presentify 2 (same moment) |
|---|---|---|---|
| time | 32.3 min, 128 turns | **34.2 min, 136 turns** | 35.2 min, 133 turns |
| model · tools | 27.2 · 5.2 min | **28.7 · 5.6 min** | 31.8 · 3.4 min |
| output tokens | 170.8k | **184.0k** | 212.6k |
| cached input re-read | 34.3M | **36.4M** | 15.7M |
| first app file · first clean boot | 6.6 · 21.5 min | **3.4 (a probe) · 21.8 min** | 3.9 · 26.9 min (first run) |
| first passing behaviour script | | **25.4 min** | |
| verify · look · declare-help calls | 16 · 20 · — | **29 · 19 · 20** | |
| code (all lines) | 2,705 Declare, 331 TS | **2,933 Declare, 440 TS** | 8,375 (TS 3,049, TSX 3,015, CSS 2,311) |
| its own checks | 1 script, 35 assertions | **2 scripts, 75 assertions** | 15 unit tests, 10 Playwright scripts |
| download, gzipped (fonts apart) | | **201 KB: program 58, runtime 130, kernel 13** | 190 KB to open the list; +57 KB the editor |
| hidden checks at first boot | 16 of 19 (role added) | **1 of 19 as is; 18 of 19 with the role** | 19 of 19 |
| hidden checks delivered | 1 of 19 as is; 16 with the role | **19 of 19** | 19 of 19 |

**The shape of the build.** It read the required material and the chapters it chose (15 guide chapters and the
to-do app), wrote a probe of its riskiest constructs at 3.4 min, then the app file by file. First clean boot at
21.8 min, the same moment as run 3. It wrote two behaviour scripts and had the first passing at 25.4 min; the rest
was fixing what they and its screenshots found.

**Against run 3:** the same time to within two minutes, and a better app: 19 of 19 delivered against 16 (with the
role added), and fewer colour literals (21 against 79). The gains are where 30785964 aimed:
- **DECLARE4035 fired at 21.2 min** on the stage's label, and the agent gave the stage a role. Run 3 lost 18
  hidden checks to the silent drop. (The first-boot snapshot predates the fix, hence 1 of 19 as is.)
- **`onError()`** carried its save queue's failures; run 3 invented "a request finished, either way".
- **Run 3's three real failures** (corner radius, hex fill, deleting a slide) all pass here. Its number fields still
  fell into the typing trap during the build (below); its own `flow.mjs` caught it ("the 48 I typed never landed")
  and it added a draft and a typing flag.

**Against React, same moment:** the same time and the same score. React wrote for 23 minutes before running
anything and was complete when it did (19 of 19 at its first run); Declare booted earlier and reached 19 of 19 by
iterating. React wrote 15% more output tokens and 2.5 times the code; Declare re-read twice the cached input
(its reading and its longer tool results). The downloads are about the same size; React's is split in two.

## How the verification tools are doing

**What worked.** R1–R3 and the two new warnings: DECLARE4035 found the label that would have cost 18 checks, the
moment it was written. Held time and `drive.wait` made its save debounce and conflict check fast to test, as in
run 3. Its failing R5 rounds were the app's own bugs; none was the runner.

**What it missed, by its account (word for word below):**
1. **Silent no-ops,** its sharpest edge: a `Control` method overridden without `super` (the control stopped
   working, nothing said), `Focus` sent to a view that was hidden, and the field-typing trap again: an `onInput`
   that writes nothing while `text` reads a constrained value, so the field undoes each key.
2. **`declare-look`'s time model:** look settles timers forward; `--no-settle` applies to the whole run, not one
   step; whether a glide had settled in a shot.
3. **Units:** `drive.press` positions are in the view's local units, `drive.moveBy` in screen pixels.
4. **No documented way to read an app value into a script,** so it used `page.evaluate`.

## The hidden checks, and their audit

`evals/apps/presentify/drive.mjs`, the same 19 flows. The first pass scored this app and React run 2 both 18 of
19, failing the same flow, duplicating a slide. **The check's fault, in two places,** fixed for every app
(uncommitted):
1. With a slide selected and no visible duplicate control, the check pressed ⌘D only. This app, React run 2 and
   Declare run 2 all bind ⌘D to duplicating the selected shapes and ⇧⌘D to duplicating the slide, as Keynote does.
   The check now tries ⇧⌘D, then ⌘D.
2. To delete a slide it pressed forward delete. A Mac's delete key is ⌫ (Backspace to the browser). The check now
   presses ⌫, then forward delete.

With the fixed checks: **19 of 19** delivered. At first boot (21.8 min), **1 of 19** as is: the stage had no role
yet, so every flow that finds "the slide labelled Slide" failed at its first step; with the role added, **18 of
19**, the one failure being rounded corners (its slider came later).

## Is it idiomatic Declare?

| | run 4 | run 3 |
|---|---|---|
| code | 2,272 lines Declare, 341 lines TS | 2,374 lines Declare, 331 lines TS |
| bytes | 138 KB | 144 KB |
| lines over 150 characters | 26 | 24 |
| colour literals outside theme declarations | 21 | 79 |
| theme reads | 112 | 113 |
| States | 2 | 3 |
| visible switches (visible = { x == '…' }) | 4 | 1 |
| branches on width or phone | 0 | 1 |
| flexes | 18 | 13 |
| browser scripts (host = browser) | 1 | 1 |
| page lookups (document.querySelector…) | 0 | 0 |

(Code lines without blanks and comments, from `evals/craft/idiom.py`; the figures table counts all lines.)

An independent reviewer, given only the code and the question (read-only, nothing run), read the whole app. The
verdict: **accept after one round of changes, not as it stands; the architecture is right, and the problems are in
a few places rather than spread through the code.**

**Credited:** the guide's structure (the open deck a `Document` dataset class with verbs; where the person is on the
App; undo, saving, the gesture and the row drag each a non-visual class); derived state as real constraints
(selection, handles, the inspector's summary); one `SlideArt` renderer for stage, thumbnails, cards, presenter and
conflict banner; motion from one Spring and a `TweenLayout`; controls following the value pattern; the menu bar as
the shortcut table; two behaviour checks driving real input against the live service.

**Flagged:**
- **A data bug in the title field** (`presentify.declare:900–904`). **Confirmed** with a minimal program: a
  `draft: string = { app.doc.value?.title ?? "" }` that `onInput` writes stops following the document at the first
  keystroke (the write takes the attribute over, silently). Open another deck and the field shows the old title; a
  focus-and-blur there renames it. The hidden checks rename only the first deck, so they pass. Its own
  `NumberField` had the right pattern. The same family as the field-typing trap.
- **Saving depends on a hand-bumped counter:** every `Document` verb must call `touched()`; one that forgets
  silently doesn't save.
- **The App is about 983 lines** (the to-do app's about 480): deck create/rename/delete, every inspector write, a
  55-line menu record and about 160 lines of inline editor tree.
- **The stage hit-tests in TypeScript what its views already know** (`handleAt` repeats the handles' geometry; the
  hover outline recomputes from the pointer instead of reading `hovered`).
- Smaller: a string-typed `run(id)` command switch; about 40 colour literals outside the theme (the reviewer's count,
  wider than the table's); shortcut hints typed twice and already disagreeing (inspector "⌥⌘]", menu "⇧⌘F"); library
  classes rebuilt by hand (`Rule` for `Divider`, −/+ buttons for `Stepper`, about 14 Tab stops where `Toolbar` gives
  one); dead code; no unit tests for `geometry.ts`.

**Figures (the reviewer's):** 42 classes; the App about 983 lines, `Sync` 246, `Inspector` 195, `Gesture` 135,
`Stage` 108; about 566 constraints against about 230 imperative writes (2.5 to 1); 4 Springs, 1 Animator, 2 States,
6 `onChange` handlers.

**The three changes it asks for first:** fix the title field and have `Sync` watch the document, not a counter;
split the App (an `Editor` view class, element verbs onto `Document` or a selection class, a `Decks` class); handles
as press targets built from data, stray colours into the theme, and the library's `Divider`, `Stepper` and
`Toolbar`.

The review in full is at the end.

## Findings for the platform

From its account, sorted by what they cost it. **Not yet audited against the runtime**; each needs a minimal
program before it is called a platform fault.

**Silent no-ops** (its sharpest edge, "about four extra test and debug cycles, maybe 10–15% of the build"):
1. A `Control` subclass overriding `onPointerDown` without `super`: the control stopped taking focus on press, so the
   slide list's ⌫ never fired. The rule is in the `Control` reference; nothing enforces it.
2. `Focus` sent to a view not yet visible (the editor still opening): nothing happened, nothing said.
3. The field-typing trap, the third run in a row: a constrained `text` with an empty `onInput` satisfies the
   compiler's rule and undoes each key. DECLARE4036 (`commitOn` on one-way text) doesn't cover it. NumberField
   (designed, awaiting a decision) is the fix at the cause.

**The tools' time model** (about three wasted investigations):
4. `declare-look` carries timers forward when it settles, so a 700 ms save had already run when the status was read.
5. `--no-settle` applies to the whole run, so panels' springs never ran in its shots.
6. A `TweenLayout` glide in a mid-drag shot looked frozen until `--wait 500`: either the glide isn't counted as
   motion when look settles, or a misreading. **To check.**

**Smaller:**
7. `drive.press(path, x, y)` takes the view's local units; `drive.moveBy` screen pixels. A scaled view makes the two
   disagree (a 2,490-point rectangle).
8. No documented way to read an app value into an assert script (it used `page.evaluate` on `__declare.find`).
9. `super.onPointerDown(e)`: the docs say an override "may take the event", the analysis says the base takes none.
10. A ring-of-change-handlers note (`rev` changed again in one settle chain) it judged harmless, unsure.
11. Its program's ids contained "." because the held clock gives a fractional `Date.now()`. Reasonable, but a
    person's clock never does; worth a look.

**Library and docs gaps it names:**
12. No undo history and no clipboard primitive: "every editor will rebuild them".
13. Writes to a server need a hand-rolled queue.
14. `declare.md` should state where a `datapath` may point, and the reserved type names (it hit `Stroke` and
    `TextStyle`; see the names ledger).
15. The App grew to about 1,100 lines "with nothing pushing back".

**Found by the code review, confirmed:**
16. A declared attribute bound by `{ }` that the program then writes is taken over by the write, silently, and stops
    following what it read. In this app that is the title field showing a previous deck's title (see the review).
    Not warned of; the same family as the silent no-ops above.

## Its account, word for word

## Building Presentify in Declare: an account for the Declare team

Short version: I wrote a slide editor of about 2,900 lines: five `.declare` files and a 420-line `geometry.ts`. It covers a gallery, an editor with a slide list and an inspector, undo, a save engine with conflict handling, and a presenter. After about six compile rounds it booted, and two assert scripts with 75 assertions now pass against the live service. The diagnostics were the best part of the experience. The worst was a run of mistakes that produced no error at all: code that compiled, ran, and did nothing. Most of them were mine, but none of them was flagged.

---

### (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `skill/SKILL.md` and `AGENTS.md`.
2. `docs/declare.md`, all 931 lines.
3. Guide chapters `01-what-declare-is`, `04-structure`, `05-run-and-check` and `06-layout`, each whole, as the skill directs.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
5. After that, only what the plan needed:
   - guide chapters 14 (data), 09 (pointer and keyboard), 18 (overlays), 12 (text), 17 (your own views), 21 (motion), 11 (paint and themes) and 15 (schemas), mostly whole;
   - `declare-help map` of `desktop.declare`, then only its drag and resize section (lines 430–700);
   - `operational/verify.md` (the rungs, then the assert-script API) and the top of `operational/introspection.md`;
   - about 40 `declare-help` lookups.

**What I skipped, and why:**
- **The notation and constraints chapters (02, 03), and scrolling, controls, touch, collections and animated arrangements (07, 08, 10, 16, 23).** I skipped these to save time. Skipping 03 was probably a mistake. Later I hit a runtime note about "a ring of change handlers" in the same settle chain, and I couldn't fully judge it. Chapter 03 likely explains settle chains.
- **The tracker and calendar apps.** The todo app and the relevant part of the desktop app were enough.

**What taught me the most:**
- **`declare.md`.** The "seven differences" section, the table of what you can assign, and "count the data, not the tree" set my model correctly. I made almost none of the React-habit mistakes the documentation warns about.
- **The todo app.** It shows a dataset class, App-level state, `classFor`, Springs and Shortcuts in a real program. I copied its whole shape: a header comment, `// ── Section` markers, and a theme laid over a `SanFrancisco` preset.
- **`declare-help`.** It answered quickly and precisely: `Color`, `KeyEvent`, `PointerEvent`, `Shortcuts.items`, `MenuBar`, `TextInput --all`.

**What was missing or misleading:**
- **Colour with alpha.** `declare.md` says a colour inside braces is `0x4169E1`, and the todo theme writes `0x0000002E` for a shadow. That suggested `0xRRGGBBAA` packing, and I first wrote a converter that way. `declare-help Color` says alpha uses "the runtime's own encoding (see `colorWithAlpha`)". I caught this before it ran, but the 8-digit literal invites the wrong idea.
- **Where `datapath` may point.** Nothing I read stated that it must point into a Dataset or DataSource. I learned it from a runtime error (item 11 in (d)).
- **Reserved type names.** That `Stroke` and `TextStyle` are reserved isn't discoverable until R2 refuses them.
- **Whether schema types can be used inside a `script` file.** Unclear; I wrote a probe to find out (they can).
- **Volume.** About 3,500 lines of reading came before my first line of code. It was worth it, but it is a lot.

### (b) Expressing what I wanted

**Where it fit well:**
- **Derived state.** The selection's box, the inspector's summary of the selection (`st: Summary = { app.summarize(app.selEls) }`), the hover outline, handle positions and the "Mixed" displays were all one-line constraints. I wrote no update code for any of them.
- **One class drawn everywhere.** `SlideArt` is used, scaled, by the editor, the slide list, the gallery cards and the presenter. "Looks exactly as it does in the editor" was true by construction. The `scale` attribute behaving consistently for paint, hit-testing and pointer coordinates made this easy (I verified with a probe that `e.x` arrives in local, unscaled coordinates).
- **`MenuBar` doubling as the shortcut table.** One records list gave me menus, key bindings and enabled states.
- **Shortcuts looked up from the focused view outward.** This let the slide list's ↑/↓/⌫ override the App's own bindings with no extra code.
- **Motion was nearly free.** Springs drive the panels sliding in, the editor growing from the card that opened it, and the lift on card hover. A small `TweenLayout` subclass (`ListGlide`) handles slides gliding apart during a drag.
- **`Dialog` with `presentation = "full"`.** The presenter worked the first time: Escape closes it, and it holds the keyboard while open.
- **`classFor`** gave me one class per element kind.
- **Schemas are checked inside `geometry.ts`.**

**Where I worked around it:**
- **Undo.** There is no undo facility. I wrote a `History` node that stores whole-slide snapshots (`structuredClone`) with begin/end around gestures. It works, but every app will rebuild this.
- **Saving.** One `DataSource` is re-aimed per request: `reqUrl`, `reqMethod` and `reqBody` attributes, then `fetch()`, with `format = "text"` and my own `JSON.parse` in case of a 204 reply. Writing a sequential queue in `onLoad`/`onError` was workable but felt like pushing against a declarative tool.
- **Clipboard, full screen and the unload guard.** These needed `script [ host = browser ]`. `whenFullscreenEnds` hands a closure from Declare into a DOM listener. I'm unsure that is sanctioned, and I never saw it run in a real browser.
- **No colour picker in the library.** I built a swatch popover with a hex field.
- **Gestures without event bubbling.** I put all canvas pointer handling on one pane and hit-test by geometry, not by views. That was the right call for an editor, but it means element views can't take the pointer themselves. I relied on the documented rule that a view with only a `cursor` passes presses through.
- **Reactive maps.** `Sync.remote` is a `Record` that I copy and reassign for every change so that readers are notified.
- **The App grew to about 1,100 lines.** Its commands, undo and inspector writes should probably live in an `Editor extends Node`. That is my drift, and nothing told me so.

### (c) The first time it ran

It booted cleanly at R4. The first screenshot of the gallery was right. Thumbnails, Bricolage Grotesque and the cards all rendered as intended.

The editor was mostly right. One thing was visibly wrong: the title field was cut off ("Field notes from"). I had used `contentWidth` on the `TextInput`, which apparently isn't the width of its text. I switched to a hidden `Text` used only to measure the title.

Driving it through `declare-look` showed that the title never got typed after "New presentation". I traced that to focus being moved while the editor was still invisible (item 15 in (d)). I briefly thought nothing was saving, because `sync.status` read "saved" straight after a draw. `curl` against the service showed the data had in fact saved. The tool had already run the 700 ms timer (item 16).

### (d) Every refusal and surprise

Unless I say otherwise, the error messages named the fix and the fix worked first time.

1. **`key` is reserved (R1, DECLARE2000).**
   - Wrote: `key: string` on `SlideRow` and `RowDrag`.
   - Platform said: `key` is replication metadata.
   - Changed: renamed the attributes `slideKey` and `dragKey`.
   - Judgement: my mistake; the docs mention `key = :email`, but I didn't connect it. Fair rule, clear message.

2. **A layout child declaring its own width (R1).**
   - Wrote: `SlideRow [ width = 100% ]` under my own `ListGlide`, which returns a width (`w`) for each child.
   - Platform said: the layout sizes its children, so the child must not.
   - Changed: removed the width.
   - Judgement: my code was wrong.

3. **`accessibilityRole = alert` (R1).**
   - Platform said: there is no alert role; use `status` with `accessibilityLive = assertive`.
   - Changed: did exactly that.
   - Judgement: an excellent diagnostic.

4. **The tab role needs `accessibilitySelected` (R1, DECLARE2006).**
   - Wrote: `accessibilityPressed`.
   - Changed: to `accessibilitySelected`.
   - Judgement: my mistake; good message.

5. **Accessibility warnings, a chain of them.**
   - DECLARE4022 (shows `on` but tells a screen reader nothing): added `accessibilityPressed` on `IconButton` and `Swatch`.
   - DECLARE4020 (a button inside a button): restructured `DeckCard` into a plain view holding the card and its "more" button as siblings. I wouldn't have spotted that myself.
   - DECLARE4035 (a label with no role): added roles to the tools, the canvas pane and the stage.
   - DECLARE4026 (five toggles that are really one choice):
     - I tried `accessibilityRole = radio`. DECLARE4032 then said a radio outside a `RadioGroup` doesn't work.
     - I moved them into a `RadioGroup` through a subclass named `ToolButton`. DECLARE5000 said that name belongs to a library class, so I renamed it `ToolChoice`.
   - Judgement: the warnings were all correct and taught me something. The chain took four rounds.

6. **Schema names that clash with Declare's types (R2, DECLARE4015).**
   - Wrote: `schema Stroke` and `schema TextStyle`.
   - Platform said: Declare already has types with those names.
   - Changed: renamed them `ElStroke` and `ElText`.
   - Hidden consequence: my `strokeOf` had been returning my own record where a view's `stroke` expects Declare's `Stroke`. I had to make it call `stroke(w, c)` instead.
   - Judgement: a real trap, well caught. Listing reserved names in `declare.md` would avoid it.

7. **Type errors (R3).**
   - `reqMethod: string` where `DataSource.method` is a literal union of HTTP methods: fair.
   - Overriding `Slider.onPointerUp` with an incompatible signature: fair. I switched to `trackChanges = ["dragging"]` and acting in `onChange`, which is cleaner anyway.
   - `Deck | null` passed where a `Deck` was required: fair.

8. **Calling `super.onPointerDown(e)`.** The analysis said it passes one argument but the method takes none. The `Control` docs say an override "may take the event", so it was ambiguous whether the base takes one. A minor documentation gap.

9. **Lint, DECLARE4025** (a condition of four parts, or `? :` nested three deep).
   - Changed: named the facts (`boxed`, `roomy`, `typing`) and turned the palette's choices into lookups in a record.
   - Judgement: mildly fussy, but the result reads better.
   - I left eleven DECLARE1002 hints (redundant parentheses) alone.

10. **Typed numbers never reached the inspector's number fields.**
    - Wrote: a `TextInput` subclass with `text = { constraint }` and an empty `onInput`, reading `this.text` on Enter.
    - Platform did: the 48 I typed never landed; the field read back the constrained 32. Found by `flow.mjs`.
    - Changed: added a `draft` attribute and a `typing` flag.
    - Judgement: my code was wrong. But the compiler rule "a constrained `text` with no `onInput` is an error" was satisfied by an empty `onInput`. A warning for an empty one would have caught it.

11. **A `datapath` into data that isn't a dataset (runtime, R5).**
    - Wrote: a `datapath` on the conflict banner's preview picture pointing at a plain attribute.
    - Platform said: the value "belongs to no Dataset/DataSource", and named the fix.
    - Changed: added a small derived Dataset for the preview.
    - Judgement: the rule makes sense and the message was perfect. It would be better checked at compile time, or stated in `declare.md` §7.

12. **Runtime note: "onChange: 'rev' changed again in the same settle chain — a ring of change handlers."**
    - Cause: a text box reporting its new height writes to the document again within the same settle chain.
    - Changed: nothing. I judged it harmless, because a single scheduled save compares everything when it runs.
    - Judgement: **unsure.** Some edit could in principle be the second, undelivered change with no pending save. I didn't prove that can't happen.

13. **A test write refused: "Sync.api is bound by a constraint."** My test's mistake; fair.

14. **Slide-list keys did nothing until I clicked the canvas.**
    - Wrote: an `onPointerDown` override on the slide row (a `Control`), for dragging.
    - Platform did: the override silently removed the `Control`'s own focus-on-press, so the list's ⌫ never fired.
    - Found by: `editing.mjs` failing, then `document.activeElement` showing BODY.
    - Changed: called `super.onPointerDown()`.
    - Judgement: my mistake. The rule is in the `Control` reference ("An override calls `super.onPointerDown()`"). A lint for a `Control` subclass that overrides it without calling `super` would have saved a debugging round.

15. **Focus sent to a view that wasn't visible yet.**
    - Wrote: `afterSettle(focusTitle)` straight after creating a presentation, while the editor's opening animation was still at about 0, so the editor was still invisible.
    - Platform did: the focus silently did nothing.
    - Changed: waited for `opening.arrived` instead.
    - Judgement: my design. A development-time warning when focus targets a view that isn't visible would help.

16. **The status read "saved" right after an edit.** I thought the save engine's `onChange` wasn't firing and wrote a probe to test it; `onChange` was fine. `declare-look` had already moved the program's clock past my 700 ms delay. The tool behaved as designed, but I didn't know it carries timers along when it settles. It cost one probe and some minutes.

17. **`--no-settle` turned out to apply to the whole run.** The panels were missing from my screenshots because their springs never ran. I briefly took it for a bug. The documentation could say this more plainly.

18. **Slide reordering looked frozen in a mid-drag screenshot** until I added `--wait 500`. Either `TweenLayout`'s glide doesn't count as motion when the tool settles, or I misread what I saw. **Unsure.**

19. **Ids contained a "."** because the test's controlled clock gives a fractional `Date.now()`. I added `Math.floor`. Reasonable platform behaviour; my sloppiness.

20. **Mixed units in the drive tool.** `drive.press(path, x, y)` took the view's local, unscaled coordinates, while `moveBy` took screen pixels. My test sizes came out wrong as a result: a 2,490-point-wide rectangle. **Unsure** whether this is intended; "a point inside it, from its top-left" is ambiguous for a scaled view.

21. **Design misses, mine, found by looking at screenshots:**
    - text drawn dark on the dark rectangle beneath it (fixed by picking the colour from what's underneath the click);
    - a text box's frame using its stale stored height rather than its laid-out height (fixed by writing the height back while it is selected);
    - the in-place text field clipping the overhang of italic letters at its right edge. **Not fixed; unsure** whether this is the native field or my sizing.

### (e) Verifying it

- **`declare-verify` R1–R4, after every change.** It caught every structural, name and type error above in seconds. The R4 boot ran in real Chrome and also fed sample data into data sources that had schemas.
- **`declare-look` screenshots.** These caught the cut-off title, the invisible text and the stale text frame. It was also my main way of judging the look. `--js` and `--read` were very useful for debugging. Its time model (timers advancing, `--no-settle`) misled me twice.
- **Assert scripts:**
  - `flow.mjs` replays the brief's scenario: 91 steps, 35 assertions.
  - `editing.mjs`: 68 steps, 40 assertions.
  - Between them they caught the number-field bug, the `datapath` error, the slide-list focus bug, and two mistakes in my own tests.
  - `drive.settleData()`, `drive.wait()` and real keyboard chords like `"Shift+Meta+D"` made it feel like testing a real app.
  - The note warning that earlier runs had written to the same live service was genuinely helpful.
- **Gaps:**
  - There was no documented way to read an App value from a script, so I wrote `page.evaluate` with `__declare.find("app")` plus `new Function`, which is clumsy.
  - I nearly modified the sample deck "Field notes from the coast" with a test drag. The tool closing the page before my save delay is the only reason it didn't. That was my process failure.
- **`curl`** to confirm what the service actually held.

Overall the tools served me well. Rungs 1–4 are excellent; rungs 5 and 6 are good, once you know how their time model works.

### (f) Confidence, part by part

- **§1 Presentations.** Open, new and delete were tested; the confirmation before deleting was tested. Rename is **untested**: it fetches the version and then patches, and I'd expect a tester could find a bug there. Thumbnail refresh is medium confidence.
- **§2 Slides.** High. Add, duplicate, delete, reorder by drag and keyboard navigation were all tested, and the thumbnails are live. One reading risk: I made the list glide apart during a drag. A strict reading of "does not reflow under the pointer" might disagree. There's no auto-scroll when dragging near the list's edge.
- **§3 Elements.** High for drawing, Shift-drawing and click-to-create text. Weak spots:
  - text boxes can't be resized vertically (height follows the words), so their corner handles only change the width;
  - "keep proportions" means little for text.
- **§4 Selecting and changing.** High; most of it is under test. "Unmistakable on any colour" relies on a white halo under the violet outline. It may be weak on pale violet slides.
- **§5 Inspector.** Medium-high. The "Mixed" displays are verified by eye. I didn't test every setter across a mixed selection.
- **§6 Undo.** High for the listed actions, and the selection is restored. Holding an arrow key creates one undo step per repeat. One slider drag being one step is **untested**.
- **§7 Saving.** High for the normal path and for going offline and recovering.
  - ⌘S is untested.
  - The order and title conflict path (a 409 on the presentation itself) is untested.
  - Real risk: if the service *rejects* a save as invalid (a 422), the app shows "Not saved: can't reach the service" and retries forever. That is a misleading message.
  - An unresolved conflict with local edits shows "Saving…" indefinitely.
  - Conflicts are only checked when you go to a slide, or when the window regains visibility.
- **§8 Presenting.** Medium-high. Ending with Escape in real browser full screen is **untested**; it depends on the `fullscreenchange` callback. Click-to-advance is untested.
- **§9 Polish.** Subjective; I'd say good but not finished. A tester will likely notice:
  - during the opening animation the editor is scaled from a card with a different shape;
  - the inspector needs scrolling on short windows;
  - long titles scroll inside the title field;
  - there is no zoom and no dark mode.
- **§10 Labels.** High: the tool names, "Slide N" and "Slide" are all there with roles.

---

### Overall

**Surprises:** how many of my mistakes the compiler caught before anything ran. And, the other way round, that my real bugs were all silent no-ops.

**The good:**
- diagnostics that name the fix, often with the exact rewrite;
- `declare-help`;
- a ladder of checks that runs in real Chrome;
- constraints and Springs that make derived interface and motion close to free;
- `MenuBar` doubling as the shortcut table;
- schemas checked even inside script files.

**The bad:**
- no undo or clipboard primitive (every editor will rebuild them);
- writes to a server that need a hand-rolled queue;
- silent no-ops, as above;
- a heavy reading load before writing anything;
- an App that grows large with nothing pushing back.

**What it resembled:** strongly **QML**: property bindings, states, a tree of objects with ids. A bit of SwiftUI's declarative state, and OpenLaszlo (as the README says). Unlike React, nothing re-renders and there are no hooks; it really is "set a value and everything follows". Unlike CSS, layout has a single decider per value, which made "why is it here" questions answerable.

**The sharpest edge** was a pattern, not one obstacle: code that compiles but quietly does nothing. Three cases:
- a `Control` override without `super`;
- focus moved to a view that isn't visible;
- an empty `onInput` alongside a constrained `text`.

It cost about four extra test and debug cycles, maybe 10–15% of the build. To get these right first time I'd have needed three development-time warnings: a `Control` handler override that doesn't call `super`, `Focus.focus` on a hidden view, and an empty `onInput` paired with a constrained `text`.

The second edge was the testing tools' time model (timers running when it settles, `--no-settle` applying to the whole run, glides), about three wasted investigations.

**Where I'd most want improvement:**
1. Warnings for the silent no-ops.
2. A library undo history over a Dataset (snapshots or patches, with begin/end for gestures).
3. A `DataSource` pattern for a queue of writes, or documented guidance.
4. Rules stated up front in `declare.md`: where a `datapath` may point, and the reserved type names.
5. A documented way for assert scripts to read app values.

**What I'd use it for:** interactive, data-backed desktop tools and dashboards with a lot of derived state and motion, especially when an AI is writing the code and the compiler is doing the review. I'd hesitate for apps that depend heavily on browser APIs, or where a large team expects the npm ecosystem inside the interface layer.

## Names

```
NAMES — eval-presentify-4: 0 missed name(s), 3 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

COLLISIONS (min · held by · name)
    22 · Declare's type · Stroke
    22 · Declare's type · TextStyle
    32 · library class  · ToolButton

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```

## The independent code review, in full

## Code review: Presentify (Declare)

Reviewed: `eval-presentify-4/work/declarelang/my-apps/presentify/`, which holds five `.declare` files, `geometry.ts`, `checks/*.mjs` and `README.md`. I read it against `docs/declare.md`, guide chapters 01, 04 and 06, and `apps/todo/todo.declare`. This was a read-only review. Nothing was compiled or run, so anything I call a bug comes from reading the code and needs confirming in the running app.

---

### 1. What it uses

**Library classes.** `SanFrancisco` (with its own theme spread over it), `Font`/`FontFace`, `Control` (the base of every pressable thing), `Icon` (the base of `Glyph`), `ChevronIcon`, `TextLabel`, `Spacer`, `SimpleLayout`, `WrappingLayout` (including `columns = 8` for the swatches), `TweenLayout` (`ListGlide`), `RadioGroup` (the tools), `MenuBar`, `Menu`, `ContextMenu` (three of them), `Popover` (the palette), `Dialog` (rename, `confirmDelete.open(...)`, and `Presenter extends Dialog [ presentation = "full" ]`), `Slider`, `Checkbox`, `TextInput`, `Shortcuts` (four sets), `Control.menu` (`MenuButton`).

**Runtime facilities.** `Dataset` (one subclass, plus derived `contents =` sets), `DataSource` (nine), `Time [ tick = minute ]`, `Spring` ×4, `Animator` ×1, `State` ×2, `trackChanges`/`onChange` ×6, `afterDelay` ×3, `afterSettle` ×1, `Focus.focus`, `location` (the URL fragment holds the open deck), `pageVisible`, `pointerX/pointerHovering`, `rootOrigin()`, `scrollIntoView`, `draw(d)` ×7, `classFor`, `exists`, `cursor`, `tooltipLabel`, `accessibility*`. `script [ "geometry.ts" ]` holds the geometry, and a `script [ host = browser ]` block covers the clipboard (localStorage), fullscreen and `beforeunload`.

**Hand-rolled where the library has a class:**

| app class | library | verdict |
|---|---|---|
| `IconButton`, `PillButton`, `ToolChoice` (look.declare:196–243) | `Button`, `Toolbar` + `ToolButton` | Partly justified by the brand. But `bar2` (presentify.declare:929–970) is about 14 separate Tab stops, and `Toolbar` would make it one stop with arrow keys between commands. The brand look belongs in theme tokens (`segmentedHeight`, `trackFill`, …) on the library classes. |
| `Rule` (look.declare:333) | `Divider [ axis = y ]` / `ToolbarDivider` | Swap it. |
| `NumberField` + −/+ `IconButton`s for font size (panels.declare:417–428) | `Stepper` | This is exactly a stepper, and `Stepper` adds keyboard stepping and a spin-button role. |
| `Row` / `Section` (look.declare:292–315) | `Field` (`labelWidth`) | Either is fine. `Row` is small and clear. |
| `Glyph`, 100 lines of `if (shape == …)` (look.declare:85–184) | `icons/core.declare` | The brief asks for its own icons, and the model app draws `Glyph` the same way, so this is acceptable. |
| Hit testing and the hover outline (`hitLeaf`, `app.hoverOf(app.pointerX, …)`, `app.handleAt`) | the runtime's hit chain, `hovered`, per-view handlers | A trade-off, see §3. |

`History` (undo), `Sync` (autosave and conflicts) and the clipboard have no library equivalent, so building them is right.

---

### 2. Structure

**Files.** `presentify.declare` holds the App. `model.declare` holds the schemas, `Document`, `History` and `Sync`. `stage.declare` holds the element views, `SlideArt`, `Gesture` and `Stage`. `panels.declare` holds the gallery, slide list, inspector, palette, conflict banner and presenter. `look.declare` holds the theme, the mark, the icons and the small controls. `geometry.ts` holds pure functions. Every file opens with a "how to read it" comment in the voice of the model app, and the README has a file table. This partition is good, and it is the one the guide recommends (theme / data classes / parts / App).

**Where state lives.**
- *Records.* The open deck is `doc: Document extends Dataset` with verbs (`setEls`, `insertAfter`, `moveTo`, …), which is the dataset-class idiom done properly. The gallery's list is a `DataSource` (`decks`).
- *Where the person is* lives on the App: `location` → `openId`, `current`, `sel`, `scope`, `tool`, `editingId`, `presenting`, `showList`, `showInspector`. Deriving the open deck from `location`, so that Back works, is good.
- *Machinery* is in `Node` classes: `History`, `Sync`, `Gesture`, `RowDrag`. This is the right decomposition.
- *Derived* values are a long run of `{ }` declarations on the App (presentify.declare:232–310): `els`, `selEls`, `selBox`, `showHandles`, `radiusHandle`, `canGroup`, `st: Summary`, … This is good.

**Saving.** `Sync` keeps the server's last accepted JSON for each slide, debounces 700 ms after `doc.rev` changes, and sends one request at a time through a single `req: DataSource` whose `url`, `method` and `body` are written before each `fetch()` (model.declare:270–285, 441–445). It retries with backoff and records conflicts. The status line derives from three facts (model.declare:221). The design is careful and correct in shape. It is also the least Declare-like code in the app, a hand-written request queue in a `Node` (see §3).

**Undo.** Each step is a whole-deck snapshot (`structuredClone(doc.slides())`, the current slide and the selection). `app.change(fn)` makes one-shot steps, and a gesture brackets itself with `history.begin`/`end`. A Slider drag becomes one step through `trackChanges = ["dragging"]` (panels.declare:401–402). This is simple and obviously correct. The selection is restored on undo, as the brief asks.

**Keyboard.** The `menus` record (presentify.declare:734–788) is both the MenuBar and the shortcut table, which is a good single source. Extra `Shortcuts` sets cover nudging, the slide list and the presenter.

**Styling.** `PresentifyTheme` is spread over `SanFrancisco` and maps the library's roles (`accent*`, `control*`, `tooltip*`) to the brand, so library controls match. There are 112 `provided("theme")` reads. Fonts are tree objects, as taught.

**Motion.** The editor grows out of the deck card it was opened from, using one Spring (`openT`) and constraints on `scale/x/y/cornerRadius` (presentify.declare:864–872). That is the guide's "animation from the same relationships" applied directly. The panels slide on `listW`/`inspW` springs. Slide rows glide through `ListGlide extends TweenLayout` with a `slot` per row, the same pattern as todo's `Glide`. Cards lift on a Spring.

**Script.** `geometry.ts` is 440 lines of pure functions over `El` records. The browser block is six small host wrappers, each marked `host = browser`, which is the correct way to do it.

---

### 3. Idiom

#### Done well
- **`SlideArt` is the single renderer** (stage.declare:126–134). The editor, thumbnails, gallery cards, presenter and conflict banner all bind it to a slide record and scale it, so "looks exactly as in the editor" holds by construction. Element kinds are separate classes chosen by `classFor` over a derived `leaves` dataset. This is the best idea in the codebase.
- **Derived datasets for repeated marks.** `selBoxes` and `guides` (presentify.declare:300–310) are `contents = { … }` datasets replicated as `Outline`/guide views. This is "children come from data" done correctly.
- **The value pattern** is followed everywhere: `Checkbox [ checked = { app.st.keep }, input(v) { app.setKeep(v) } ]`, `RadioGroup [ value = { app.tool }, input(v) { … } ]`, the stage editor's `text = { … }` with `onInput`. `NumberField` (panels.declare:322–344) shows the bound value until the person types, then commits on Enter or blur. That is the correct shape for an editable mirror.
- **Lookups instead of `? :` chains** in some places: `paletteTitles[app.paletteFor]`, `paletteNow` (presentify.declare:700–703).
- **Aliases for far-off views** (`stage`, `stagePane`, `titleField`) follow the guide's idiom. `afterSettle` is used to focus the in-place editor only after it exists (presentify.declare:425).
- **`exists`** for the in-place editor and the lifted row, and **`visible`** for panels that should keep their state.
- **The `onChange` uses are mostly legitimate.** Crossing into `landed` to focus the title, `syncIdle` to arm `beforeunload`, `here` to `scrollIntoView`, `dragging` to bracket an undo step, and `sig` to `retarget` the list are all "a crossing the program must act on once", which is what the diagnostics recommend.

#### Drift

1. **The title field drops its formula, which is probably a bug** (presentify.declare:900–904). `draft: string = { app.doc.value?.title ?? "" }` is a computed default, and `onInput` and the `onBlur` else-branch both *assign* it, which removes the formula (§5: "lands, and the formula is gone"). Any focus-and-blur therefore stops the field following the document. After that, opening a different presentation keeps showing the old title. A later focus-and-blur would then call `setTitle` with that stale title and rename the second deck. Fix it with the `NumberField` shape the app already has: `text = { typing ? draft : app.doc.value?.title }`. Separately, `titleSizer` reaches its sibling as `app.editor.top.bar1.titleBox.draft` (line 893) when `parent.titleBox` would do.

2. **`Document.rev` is notification by hand** (model.declare:72–127, 248–250). Every verb has to remember `this.touched()` so that `Sync` hears about the change. A future verb that forgets it will silently not save. The dataset's own writes already notify. `Sync` should watch the document (`trackChanges` on a value derived from `doc.value`, or the slides array itself) rather than a counter the verbs must bump. The file's own header says "Sync compares, it is never told", and then the code tells it.

3. **The stage hit-tests by hand when it has real views** (presentify.declare:286–298, 314–342; stage.declare:175–216). Elements, handles and the radius knob are all real views with `cursor`s, yet the pane claims every pointer event and recomputes in TypeScript which handle or element is under the point. `handleAt` repeats the handle geometry that `Stage.handles` already declares, so the two can drift apart. The hover outline recomputes a hit test from `pointerX/pointerY` on every move instead of reading `hovered`. A slide editor has fair reasons for some of this: a hit tolerance that scales with zoom, ellipse and line shapes, and group scoping. But handles, at least, should be press targets that start their own gesture ("claim the least you need, on the smallest view"). That would delete `handleAt`.

4. **The eight handles are written out by hand** (stage.declare:401–408), while outlines and guides replicate from data. A `handles` derived dataset of `{ id, x, y, cursor }` would make them consistent and give `handleAt` (if it stays) a single source.

5. **`Sync` uses a `DataSource` as a mutable request slot** (model.declare:270–285). `send()` writes `reqUrl/reqMethod/reqBody` and then calls `req.fetch()` in the same handler. The guide describes a `DataSource` as a resource whose lifecycle is reactive state, and this is a hand-rolled queue that happens to use one. It evidently works, since the checks pass, but it relies on `fetch()` reading inputs that a constraint has not yet re-derived inside the handler (§5, the settle). Either confirm that this is the runtime's contract and say so in a comment, or give each kind of request its own `DataSource`, as the gallery already does with `creating`, `renameDeck` and `deleteDeck`.

6. **`run(id)` is a stringly-typed dispatcher** (presentify.declare:533–573, a 40-line `switch`). The menu records, toolbar buttons, inspector buttons and context menus all call `app.run("…")` with string literals, so a typo is a silent no-op. Type the parameter as a union (`run(id: Command)`), or call the verbs directly from buttons (`press() { app.duplicate() }`) and keep `run` only for `picked(id)` from menus.

7. **Model logic sits on the App instead of the dataset class.** `change`, `setTextField`, `withRadius`, `setStrokeWidth`, `applyColor`, `setBox`, `setSize`, `setKeep`, `place`, `drawn` and `summarize` (presentify.declare:372–725) are rules about the document's records. The guide puts those on the dataset class (`Document`) or on a `Node` that owns selection editing, leaving the App with "where the person is" and the verbs it adds around them.

8. **Script holds the model** (geometry.ts). `boxOf`, `flatten`, `mapEls`, `alignEls`, `restack` and `groupEls` are derivations over the app's data, which §5 says belong in methods so the compiler can read through them. The way they are called here is safe, because constraints pass the arrays in (`boxOfIds(app.els, app.sel)`), so this costs precision rather than correctness: every selection constraint depends on all of `app.els`. Keeping it in script is a defensible choice. It still goes against the docs and should be a conscious decision, not a default.

9. **Nested ternaries where a lookup belongs.** The save status repeats `status == "offline" ? … : status == "saving" ? … : …` four times (presentify.declare:908–915), which should be one record keyed by status. `classFor` in `SlideArt` is three levels deep (stage.declare:132, which can trigger the DECLARE4025 lint). `selIcon` (line 272) and the `ToolChoice` reach-up `(parent as RadioGroup)` (look.declare:220–221) are smaller cases of the same drift.

10. **Repeated resets.** `sel = []; scope = ""` follows navigation in about eight verbs (`opened`, `goTo`, `addSlide`, `deleteSlide`, `moveSlide`, `restore`, …). A `select(ids)` verb, or `scope` derived from the selection's path, would remove the repetition.

---

### 4. Maintainability

**The App is too large.** The App instance is about 983 lines of a 1,049-line file. todo's App is about 480 lines and holds only where the user is, the menus and the tree. Presentify's App also carries deck CRUD (5 DataSources), the opening animation, undo plumbing, drawing, text editing, slide verbs, the clipboard, every inspector write, palette state, a 55-line menu record, three context menus, and about 160 lines of inline editor view tree (lines 864–1026). Each part is readable and has a comment heading, so this is not unreadable. But it is the one place every change will touch. Three extractions would bring it to about 400 lines: `class Editor` (bars and body) into its own file, element-editing verbs onto `Document` or a `Selection` node, and a `Decks extends DataSource` holding the gallery's create, rename and delete.

**Other large classes.** `Sync` (246 lines) is cohesive, but `refused()` has two identical `not_found` branches (model.declare:393–403), and `Record<string, any>` casts drop the types the schemas provide. The `Inspector` (195 lines) repeats `opacity = { … ? 1 : 0.45 }` and `disabled = { … }` on each section and control. Give `Section` an `applies: boolean` and a `State [ applied = { !applies }, opacity = 0.45 ]`. The six align buttons and four order buttons could replicate from records.

**Duplication and drift.**
- Shortcut hints are typed twice and already disagree. The inspector says "⌥⌘]" and "⌥⌘[" for front and back (panels.declare:527, 536), while the menu binds "⇧⌘F" and "⇧⌘B" (presentify.declare:774, 777). The nudge set's delete key is "⌦", but the menu's is "⌫". Hints should be read from the `menus` record.
- Panel widths `216` and `280` appear in both the Spring targets and the panel classes (presentify.declare:979–985, 981/1023, panels.declare:347).
- Row height `108` appears three times (ListGlide, SlideRow, RowDrag), and RowDrag's `8` is SlideList's padding written again.
- `1280`/`720` appear about 30 times across the `.declare` files, plus a bleed constant in `hoverOf` (`1288`/`728`) and in guides (`1328`/`768`/`-24`). `geometry.ts` exports `SLIDE_W`, but no `.declare` file uses it, and `SLIDE_H` is unused anywhere.
- Hit tolerances `6/k` and `7/k` are scattered, and the 700 ms debounce appears twice in `Sync`.

**Colour literals outside the theme.** About 26 `0x…` and about 15 `#…` literals live outside `PresentifyTheme`:
- default shape fills `"#6C4CF1"` and `"#FF6B4A"` (presentify.declare:390), which duplicate `brand` and `coral`;
- `"#1F2328"` and `"#FFFFFF"` in `inkAt`, `applyColor` and `TextBody`;
- shadow and hairline inks `0x1E1B2E14/1F/24/2E/40`, `0x00000059`, `0x0000002A`, `0xFFFFFFB3`;
- `0xB5720B40` (a `warn` variant);
- `CardSkeleton`'s `0xE9E6DF` (which is `backdrop`), `ShelfArt`'s `0xFFF3DC`, and `EmptySlideArt`'s default `0x6C4CF1`;
- `PillButton`'s `0xFFFFFF`, where `accentTextColor` belongs.

Default slide content colours can reasonably be data rather than theme. The UI shadows and tints should be tokens.

**Dead code.** `Sync.stop()`, `Document.clearAll()`, `schema Guide` (stage.declare:151, superseded by `BoxItem`), `RowDrag.y0` (written, never read), the glyph shapes `link`, `close` and `rename`, and the theme token `brandInk`. `geometry.ts`'s header says "nothing is mutated", but `reId` pushes into its `taken` argument.

**Naming.** Mostly clear and in the docs' voice (`landed`, `wanted`, `boxed`, `roomy`). Some are terse: `st` for the inspector summary, `k` for zoom on both App and Stage, `els`/`selEls`/`selOne`. The `nudges` shortcut trick (`id == id.toUpperCase()` meaning a ten-point nudge, presentify.declare:801) is clever enough to need a comment.

**Performance to watch.** Every `change()` serialises the slide twice with `JSON.stringify`. Each undo step clones the whole deck (with `limit = 200`, a 100-slide deck holds 200 copies). `Sync.flush()` re-serialises every slide on each pass. All fine at brief scale. The brief's "a hundred slides" is where these costs will show first.

**Tests.** `checks/flow.mjs` walks the brief's "what done looks like" with real input against the live service, and `checks/editing.mjs` covers handles, keys, clipboard, groups, slide undo and offline. That is good coverage of behaviour for 34 minutes of work. They reach into internals through `__declare.find("app")` and `new Function`, which is acceptable for end-to-end checks. There are no unit tests for `geometry.ts`, which is pure functions and the easiest code here to test. `resizeBox` with proportions kept, `distributeEls` and `restack` deserve table tests.

---

### 5. Figures

| file | lines | non-blank, non-comment |
|---|---|---|
| presentify.declare | 1,049 | 884 |
| panels.declare | 641 | 529 |
| stage.declare | 464 | 355 |
| model.declare | 446 | 330 |
| look.declare | 333 | 251 |
| geometry.ts | 440 | 341 |
| **total** | **3,373** | **2,690** |
| checks (flow + editing) | 428 | |

- **Classes:** 42 (look 13, stage 13, panels 13, model 3), plus the App, 10 schemas and 1 theme.
- **5 largest:** App ≈ 983 lines · `Sync` 246 · `Inspector` 195 · `Gesture` 135 · `Stage` 108 (then `Glyph` 100, `Document` 74).
- **`{ }` values (rough brace-scan estimate):** about 476 constraints on existing attributes plus about 90 computed declarations, so about **566 `{ }`**.
- **Imperative writes (estimate):** about **200 assignments** in handlers and methods, plus about 30 dataset-verb writes. By file: model 68 (mostly `Sync`), App 66, stage 44 (mostly `Gesture`), panels 21, look 0. That is about 2.5 constraints per imperative write, and the writes sit where Declare expects them: gestures, the request queue, verbs.
- **Springs:** 4 (`opening`, `DeckCard.lift`, `listW`, `inspW`). **Animator:** 1 (skeleton shimmer). **TweenLayout:** 1.
- **States:** 2 (`IconButton.on`, `PillButton.primary`). That is low: the inspector's "not applicable" dimming and several `hovered ? : pressed ? :` fills are States written as ternaries.
- **`onChange` handlers:** 6 (App with 4 tracked names, Sync, TextBody `fit`, SlideRow `here`, SlideList `sig`, Slider `dragging`). `afterDelay` 3, `afterSettle` 1.
- **Other:** `visible =` 34, `exists =` 2, `draw()` 7, `provided("theme")` 112, DataSources 9, Datasets 6 (5 derived).

---

### 6. Verdict

I would accept this into a Declare codebase after one round of changes, not as it stands. The architecture is right. Records live in a `Dataset` class with verbs, where the person is lives on the App, the machinery is in `Node` classes, and the derived state is real constraints. One `SlideArt` draws every slide everywhere, and the motion comes from springing a few scalars that constraints read. A Declare maintainer would recognise the shape immediately, and the comments are written in the house voice. The drift is concentrated, not spread through the code: an App that has become a catch-all, a stage that hit-tests in TypeScript what the view tree already knows, and change notification bumped by hand. One likely data bug, the title field, comes from the single place the app forgot its own good pattern.

**The three changes I'd ask for first:**
1. **Fix the title field** so the text derives from the document unless the person is typing (the `NumberField` pattern), and **remove `rev`/`touched()`** so `Sync` watches the document itself. These are the two places where a later change can silently lose or corrupt work.
2. **Split the App.** Move the editor view tree into `class Editor`, the element-editing verbs and `summarize` onto `Document` or a `Selection` node, and the deck CRUD into a `Decks` DataSource class. Type `run`'s command ids as a union.
3. **Let the views take their own presses.** Make the handles press targets replicated from a derived dataset, drop `handleAt`'s duplicate geometry, and read `hovered` for the hover outline where shape allows. At the same time, move the stray colour literals into `PresentifyTheme`, replace `Rule` with `Divider` and the font-size pair with `Stepper`, and read the shortcut hints from the `menus` record.
