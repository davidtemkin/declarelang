# Presentify run 3: round 1, branded and in motion, Opus 5.5, Declare

**Run:** 2026-11-03, launched with
`evals/craft/launch.sh presentify ~/Code/eval-presentify-3 claude-opus-5-5 b276f9ce 8360`. The brief is the same
as run 2's (`evals/apps/presentify/brief.md`, unchanged since b4db3189): round 1, with §9's branded look and "motion
and continuity throughout", desktop only. The service starts with the same three presentations. Between the two
runs the skill and the docs changed by three lines; the test runner changed a great deal (480d8f9e, 271f14df,
b276f9ce: one program time held between steps, a step that waits for what the world owes, one way to press).
This run is mostly a test of those changes. The machine was much more heavily loaded than for run 2.

**Files beside this report:**
- the app (`app/`: six source files and its own assert script in `app/tests/`);
- the hidden checks' results (`drive/`): as delivered, and with the stage's role added (see the audit), at delivery
  and at first boot;
- the prompt and the questions it was asked (`prompt.txt`, `impressions.txt`).

Its account is near the end, word for word, followed by the names ledger. The side-by-side page with run 2
(timelines, phases, the hidden checks flow by flow, the two accounts) is the Artifact
https://claude.ai/artifact/Ebys9YafYFFCS87GBBpBrC.

## Figures

| | Presentify 2 | **Presentify 3** |
|---|---|---|
| time | 51.4 min, 140 turns | **32.3 min, 128 turns** |
| model · tools | | **27.2 · 5.2 min** |
| output tokens | 209.3k | **170.8k** |
| cached input re-read | 42.1M | **34.3M** |
| first app file written · first clean boot | 19.1 · 20.7 min | **6.6 · 21.5 min** |
| first clean boot to the end | 30.7 min | **10.8 min** |
| its own behaviour script | 2 scripts, 30 R5 rounds | **1 script (73 steps, 35 assertions), passing after 6 rounds, 3.2 min** |
| verify · look calls | ~40 · — | **16 · 20** |
| code | 2,705 lines of Declare | **2,374 lines of Declare, 331 of TypeScript** (144 KB) |
| hidden checks at first boot | 12 of 19 | **16 of 19** (with the stage's role added) |
| hidden checks delivered | 18 of 19 | **1 of 19 as delivered; 16 of 19 with the stage's role added** |

## Where the time went, and why it was shorter

**Not in reading or in writing the app.** Both runs read the same required material and then chose chapters as
needed; the skill and docs were the same to within three lines. Run 3 wrote a 45-line probe of its riskiest
constructs first and then built the app up file by file from 6.6 min. Run 2 read longer and wrote the app in one
pass at 19.1 min. The two arrived at a clean boot at the same moment: 20.7 and 21.5 min.

**All of the difference is after the first clean boot: 10.8 minutes against 30.7.** Run 2 spent those 30
minutes in its behaviour scripts, 30 verify rounds. Its account names four runner episodes and their cost:
`waitReal` not letting `afterDelay` fire (about 30 min), a DELETE missing from `drive.requests()` (about 40, its
largest single sink), ⌥⌘D opening the inspector over the app (about 20), and no double-click (about 15). Those
estimates overlap and exceed the run, but they say where the time went. All four are gone:
- held program time made its five-second conflict check and its autosave "fast to test", in the agent's words
  (`drive.wait(5000)` takes a fraction of a second, and timers due in it fire);
- a step now waits for the requests it made, so nothing a script asserts is a request still in flight;
- the program's ⌥⌘D wins over the inspector;
- `drive.dblclick` exists.

Run 3's six failing R5 rounds were all the app's own bugs, found by its script: a third click landing on a
resize handle (distribute gaps of −230 against −420), the id a new slide gets from the service, a path to a tile,
and pressing a tile still arriving. None was a clock, a wait or an input path. That is the change the runner work
was for, and it is the main reason this run was shorter.

**The load cost little.** Tools took 5.2 of 32.3 minutes: verify runs averaged 9.8 s, `declare-look` 4.5 s,
`declare-help` 1.6 s. The other 27.2 minutes were the model's, and it wrote fewer tokens (170.8k against
209.3k) because it debugged less. Run 2's tool time can't be measured (its logs were deleted when it was filed),
so the load's effect on run 2 against run 3 is not known exactly; on this run it was small either way.

**Caution.** This is one run against one run, with a different agent process each time. The structural part,
no runner episodes in R5, is the part I would expect to hold; the minutes will vary.

## How the verification tools are doing

**What worked.** The agent's verdict: "very well, the best I've had in an unfamiliar stack".
- **R1–R3** caught every naming, role and type problem, each with a fix it could apply mechanically, in about
  two seconds a run. Its two most valuable catches were the platform's: DECLARE4002 found a method shadowing a
  script function it called, which would have recursed forever, and DECLARE4020 found a button nested in a
  button.
- **R4** booted clean early, said which data sources it fed with samples, and named the classes no boot built.
- **R5's layout questions** caught a top bar running past its end at the laptop width the agent hadn't looked at.
- **Held time** is listed under *what was good*. Run 2 lost about a third of its debugging to the runner;
  run 3 lost none.
- **`declare-look`** was "the workhorse": about 20 runs, with `--set`, `--call`, `--read` and `--js` reaching
  any state, and its screenshots found the visual bugs no check reports.

**What the tools missed, in order of cost:**
1. **The stage's label never reached the page, and nothing said so.** The brief asks for the slide to be labelled
   "Slide", and the app wrote `accessibilityLabel = "Slide"`. On a view with no role the runtime drops the label
   (ARIA forbids naming a generic element), silently. No rung, no lint and no screenshot shows it, and it cost
   18 of the 19 hidden checks. This is the largest gap this run found: a stated intention that has no effect
   should be a warning. **Fixed (uncommitted):** see below.
2. **Behaviour the compiler can't see,** in the agent's own summary: a `TweenLayout` that didn't re-place on a
   width change, drawings that don't clip, a slider drawing past its track, handles taking presses, and a held
   save window. It put these at 30–40% of its debugging, each found only by a screenshot or a failing assertion.
   Some are platform faults (below); the general point is that the ladder's layout questions are the right
   mechanism, and they could ask more.
3. **`declare-look` ends a run with program time held,** so a debounced save the app scheduled never fired, and
   the next run found the slide unsaved (its bug 21). The tool behaved as designed. But a person closing a tab a
   second after an edit would have had the save, so `look` loses work a person wouldn't (to decide; see the open
   items).
4. **Smaller:** no `--dblclick` on `declare-look`; reading a value into a script still means `page.evaluate`; a
   path by index (`scroller.1`) picked another row; a covered press didn't say the target was still arriving; and a
   `--no-settle` shot's covered-control findings gave no hint they were temporary.
5. **The hidden checks found three real bugs its 73-step scenario missed** (below): its own script covered the
   brief's "what done looks like" end to end, but not the corners a second tester probes.

**Overall.** The runner is no longer where the time goes. What remains is mostly the ladder not yet seeing
certain silent failures (a dropped label, a field that undoes typing), and the edges of `declare-look`.

## The hidden checks, and their audit

`evals/apps/presentify/drive.mjs`, the same 19 flows as runs 1 and 2. As delivered, **1 of 19** passed: every flow
that needs the slide failed at its first step, "not found: the slide labelled Slide". Audited:

- **The app did what the brief asks; the platform dropped it.** `editor.declare:383` sets
  `accessibilityLabel = "Slide"` on the stage, a view of the app's own class with no role. A minimal program
  confirms the runtime emits no `aria-label` for a role-less view, and the compiler says nothing. To score the rest
  of the app, the checks were run on a copy with one line added (`accessibilityRole = image`, the role the stage
  is). That copy scores **16 of 19** at delivery and also at the first clean boot.
- **Two faults in the checks, fixed** (uncommitted, `drive.mjs`):
  1. The conflict banner's choice is "Use this version"; the checks knew "use theirs", "latest", "reload" and others
     but not "use this". Widened.
  2. A value set only by a slider is now stepped with the arrow keys to the value, as a person with a keyboard
     sets one exactly, instead of typed into.
- **Three real failures:**
  1. **Corner radius.** The only control is a slider, and the slider never moves under the arrow keys: the app's
     `Shortcuts` bind plain ← → for nudging, and a plain-key shortcut takes the key from a focused slider. A
     minimal program confirms it (a focused `Slider`, an App shortcut on `→`: the shortcut fires, the slider
     stays). The runtime's own comment says "when a Declare CONTROL holds keyboard focus, Space and the arrows are
     the control's", but only the browser's defaults stand down, not shortcuts. **A platform bug, open for
     decision.**
  2. **Fill colour by hex.** The hex field's `text` is one-way (`text = { … }`) with `commitOn = "enter"`, which
     only applies to a two-way `text <-> :path` field. So `onInput` runs on every keystroke, declines to write a
     partial colour, and the field reverts each key. The app's bug, and the platform's trap for the second run in a
     row (run 2: "48 over 32 gave 328"). **A warning for `commitOn` without two-way text is fixed; the trap itself
     is open for decision.**
  3. **Deleting a slide from the list.** With a slide selected, Delete does nothing (the app has Delete Slide in the
     slide's menu). A convention gap of the app's, as run 2's ⌘D was.

## The design

Not yet reviewed by eye: the screenshots taken while auditing (the presentation list, the editor, the conflict
banner) show a warm, coherent identity with its own serif headings and illustrated slides. The motion asked for
is present but partial; the agent's own account says "panels slide in and out" is only the library's overlay
motion, and handles track the selection without a spring.

## Is it idiomatic Declare?

| | run 3 | run 2 |
|---|---|---|
| code | 2,374 lines Declare, 331 lines TS | 2,705 lines Declare |
| bytes | 144 KB | 142 KB |
| lines over 150 characters | 24 | 19 |
| colour literals outside theme declarations | 79 | 60 |
| theme reads | 113 | 110 |
| States | 3 | 4 |
| visible switches (`visible = { x == '…' }`) | 1 | 5 |
| branches on width or phone | 1 | 0 |
| flexes | 13 | 10 |
| browser scripts (`host = browser`) | 1 | 1 |
| page lookups (`document.querySelector…`) | 0 | 0 |

The display is declared: one `SlideView` bound to a slide record renders the stage, the thumbnails, the cards, the
conflict preview and the presenter; the inspector is declared facts over the selection; the editor grows out of its
card from one sprung number. The verbs are TypeScript: a gesture state machine, a save queue, an undo history, and
331 lines of pure tree arithmetic in `doc.ts` (hit-testing, group, align, distribute, snapping). The agent asks
whether the drift check means to flag a file of pure functions like this; I'd say it doesn't, as the to-do app's
date helpers aren't flagged. The one browser script is full screen and the unload guard, for which there is no
Declare API.

## Findings for the platform, audited

**Fixed (uncommitted):**
1. **A label on a view with no role is warned of.** It reaches no screen reader and no `aria-label`. The warning
   names the roles that would carry it (an image, a group, a region…), or `accessibilityHidden` if it is
   decoration. Cost here: 18 hidden checks.
2. **`commitOn` on a field without two-way text is warned of.** It has no effect there: `onInput` runs on every
   edit, and the field shows only what `onInput` writes.
3. **`classFor` is exempt from DECLARE4025.** The lint asked for "a lookup in data" in the one place the language
   forbids one (a `classFor` reads only the record and names classes).
4. **A Slider draws within its track** when its value is past `max` (the track fill ran past the panel).
5. **`declare-help Shortcuts` names the keys:** ← → ↑ ↓ ↩ ⎋ ⌫ ⌦ ⇥ `Space` (or the browser's names), and the rule
   for a symbol: spelled as what the keys type, without ⇧ (`"⌘}"` for ⇧⌘]). The agent had to read
   `runtime/src/keys.ts` for both.
6. **`declare-look --dblclick PATH`**, as `drive.dblclick`.

**To check before deciding:**
7. **A `TweenLayout` that doesn't re-place when its width changes** without `retarget(false)`, while
   `17-your-own-views` says `place()` reruns "whenever anything it read changes — the room". Either a bug or the
   docs.
8. **A path index (`scroller.1`) that picked the first row:** possibly a non-view member counted among the children.
9. **A shortcut declared `"⇧⌘]"` can never fire** on a US keyboard: the press arrives as ⌘}, which the declared
   spelling never matches. The docs now say to write `"⌘}"`; making the ⇧ spelling work depends on the keyboard
   layout.

**For you to decide (discussed separately):**
10. A focused control's keys against App shortcuts (the corner-radius failure).
11. The partial-draft trap: should a focused field keep the person's draft while they type?
12. `declare-look` closing with program time held (debounced saves never fire).
13. "A request finished, either way" on a `DataSource`: the third run running to invent it.
14. Host gaps: full screen, the clipboard, "the page is leaving".

## Its account, word for word

# Building Presentify in Declare: an account for the Declare team

I didn't change anything for this. What follows comes from the session as it happened. Where I'm reconstructing or unsure, I say so.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `skill/SKILL.md` and `AGENTS.md`.
2. `docs/declare.md`, all of it.
3. Guide chapters `01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, each whole.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole, as the skill asks.
5. At that point I stopped reading front to back. After that I read only when I needed something:
   - **Guide chapters, whole:** `09-pointer-and-keyboard`, `14-data`, `17-your-own-views`, `12-text`, `18-overlays`, `21-motion` and `15-schemas`.
   - **Guide chapters, in part:** the TweenLayout half of `23-animated-arrangements`, the assert-script sections of `operational/verify.md`, and the first 80 lines of `29-formatting`.
   - **Library sources:** `sanfrancisco.declare` (for token names), `dialog.declare` lines 200–403 (to see whether `presentation = "full"` would work as a presenter), and `segmented.declare` (to see whether icon segments get tooltips; they don't).
   - **The desktop app:** `apps/desktop/desktop.declare` lines 430–680 (drag, resize halo, cursors). I found that range with `declare-help map`.
   - **The runtime:** `runtime/src/keys.ts` lines 60–140. I couldn't find shortcut key names any other way.
   - **`declare-help`**, around 40 times, for: DataSource, Dataset, TextInput, Text.italic, View.cursor, App.pointerX, afterDelay, Focus, Keys, TweenLayout, measureText, TextMetrics, TextStyle, DrawContext (with `--all`), Color, colorWithAlpha, View.stroke, Stepper, Segmented, Slider, Checkbox, Popover, Dialog, Menu, Shortcuts (`--all`), Animator.repeat, Animator.started, Time, RadioGroup, onBlur, View.scale, and others.

**What I skipped:**
- `02-notation`
- `03-constraints`. This was a real gap. I leaned on `declare.md` §5 instead.
- `07-scrolling`
- `08-controls`
- `11-paint-and-themes`. I learned themes from the to-do app and the SanFrancisco source.
- `16-collections`
- `19-accessibility`. The compiler then taught it to me one warning at a time.
- `20`, `22`, `24` onward
- The tracker and the calendar

I skipped them because of the context budget and because the skill says to read on demand. I would read `19` first next time; it would have saved about five fix-and-recompile rounds.

**What taught me the most:**
- **A 45-line probe program I wrote before the app.** It tried a recursive schema, `classFor` replication inside a group class, a scaled 1280×720 "world" view, a script file and `measureText`, against the real service. One screenshot settled the whole rendering design: every element is a view bound to its record, and the slide is scaled as a whole. I'd recommend the skill tell agents to do this: probe the riskiest constructs before the plan hardens.
- **`declare.md`.** It's dense but trustworthy. §5 (what you can assign, the residue rule) and §7 (replication, derived datasets) carried most of the weight.
- **The to-do app.** It's where I learned the idioms the docs mention only in passing:
  - `trackChanges` + `onChange`
  - `afterSettle(() => Focus.focus(...))`
  - an overlay with `shown` + `input(open)`
  - a `TweenLayout` subclass with `retarget(false)` on a width change. I read that line and still didn't apply it to my own grid; see (d).

**What was missing or misleading:**
- **Host APIs:** `declare-help fullscreen` and `declare-help clipboard` both had no entry. Fullscreen I fell back to a `script [ host = browser ]`. For clipboard I asked `localStorage`, which says persistence "is not in the language yet". That was honest, but it left me guessing. I used an app-level clipboard, so pasting doesn't work between browser windows.
- **Shortcut key spellings:** the `Shortcuts` reference shows `"⌘S"`, `"⇧⌘Z"`, `"⌥⌘←"` and `"F5"`, but not that ↑ ⌫ ⌦ ⎋ ↩ are the names for the arrows, Backspace, Delete, Escape and Enter. I read that in `keys.ts` (`KEY_NAMES`).
- **⇧ with symbols:** `comboOf` drops ⇧ when the key is a typed symbol, so ⇧⌘] arrives as "⌘}". The code comment explains it, but no doc I read does. I declared `"⌘}"` and `"⌘{"` for front and back, while the menus show ⇧⌘] and ⇧⌘[. I never confirmed that those chords fire.
- **Text in drawings:** `DrawContext.fillText` has no wrapping, and `measureText` returns a height but not line breaks. That ruled out drawing whole slides on one canvas. It was the right call anyway, but the docs never say a drawing can't wrap text.
- **Ending a request:** I found no `DataSource` event for "a request finished, either way". `onLoad` fires only on success. I used `trackChanges = ["loading"]` and checked `failed` and `statusCode` when `loading` went back to false. It worked, but I invented it.

---

## (b) Expressing what I wanted

**Where it fit well:**
- **Rendering.** A `SlideView` is bound to a slide record. Each element is a view chosen by `classFor = { :kind == … }`, and a group class replicates `:children[]` with the same `classFor`, so groups nest to any depth with no code. The stage, the 100 thumbnails, the deck cards, the conflict preview and the presenter are all the same class at a different `w`. "Thumbnails update live" came for free, because typing writes the record and every view of it follows.
- **Things that are derived:**
  - The selection frame and handles are constraints on `app.selBox`, so "handles follow what they hold" needed no code.
  - Every inspector fact (`fillInfo`, `strokeInfo`, `textInfo`, and so on, each with "applies" and "mixed") is a declared attribute with a `{ }` default over `selLeaves`.
  - The save-status words are one constraint over `sync.status`.
- **Overlays:**
  - A colour picker that is one `Popover` opened with `showFor(well)`.
  - The rename `Dialog`.
  - The presenter as `Dialog [ presentation = "full", shown = { app.presenting }, input(open) … ]`. Esc, holding focus, and keeping presenter shortcuts separate from the editor's all came with it, and it worked the first time.
- **Motion:**
  - The editor grows out of its card from one sprung number, `openT`: `x`, `y`, `scale` and `cornerRadius` are lerps on it.
  - Card hover lift is a spring.
  - Slide reorder glides through a `TweenLayout` with no animation code.
- **`Shortcuts` as data.** A plain key standing down in text fields was exactly right for V/R/O/L/T and the arrows, and the scoped set on the slide list (↑ and ↓ move between slides when a tile has focus) was clean.

**Where I worked around it:**
- **Most of the program is imperative TypeScript in methods.** These are the gesture state machine (`Gesture extends Node`, about 300 lines), the save queue (`Sync`), the undo history (`Doc`), and about 450 lines of pure tree arithmetic in `doc.ts` (hit-testing, remap, group, ungroup, align, distribute, restack, snapping).
  - I think that's honest for an editor. Constraints carry the display, and the verbs are code.
  - The drift check warns about "a long script block". I'd argue `doc.ts` is "functions of their arguments", like the to-do app's date helpers, but a reviewer applying the drift check literally would flag it. I'm unsure which reading you intend.
  - Declare gave the queue and the gesture code no help, and didn't get in the way either.
- **Talking to the service.** I wrote one `sender: DataSource` whose `url`, `method` and `body` come from a `req` attribute, and fed it from a queue. It works, but the fact I relied on most ("`fetch()` settles first", so the request carries the `req` I just set) took a careful reading of `14-data`.
- **Text wrapping and height.** Wrapping has to match between the stage `Text` and the in-place `TextInput`, and the saved height has to equal the height as laid out. I measured heights with `measureText` in a `Doc.fitted()` method. I'm fairly but not fully sure the `TextInput` breaks lines the same way as the `Text` at `fontSize × k`.
- **Hiding the text box being edited.** I declared `hideId` on `SlideView` and read `provided("hideId")` in `TextEl`. Nothing I read says a plain declared attribute is "provided". I guessed, and the screenshot showed it works.
- **`classFor` and lint disagree.** `classFor` may read only the record (DECLARE4000). Then lint DECLARE4025 asks me to replace the nested ternary with "a lookup in data". I can't do that inside `classFor`, so the warning stayed in.

---

## (c) The first time it ran

The first `declare-verify` failed at R1, then R3, before booting at all; those failures are in (d). The first booted look, at `/tmp/home.png`:

- **The home screen was nearly right, except the grid.** It had three columns at 1440 px with a fourth card wrapped onto a second row. From the card x positions (64, 404, 744, a pitch of 340) I worked out that `CardGrid` had placed itself once at a narrower width and never again. I copied the to-do app's `trackChanges = ["width"]` / `retarget(false)`, and it was fixed.
- **The editor** (`--set app.location=d1`) **was right first time.** Slides, list, inspector, top bar. The only problems were cosmetic: dimmed inspector sections looked faint, and Arrange was pushed below the fold.
- **The first interaction test (click, then drag the circle) worked:** a snap guide, one history step, "saved". It also wrote to the real "Field notes" deck. I restored the circle by hand with `curl`, and later restored three text heights that my `fitted()` had re-measured. That's a lesson about my process, not the platform. The note "this run failed after talking to … which earlier runs wrote to" is genuinely useful.

---

## (d) Every refusal and surprise

| # | What I wrote | What the platform said or did | What I changed | Judgement |
|---|---|---|---|---|
| 1 | `classFor = { app.kindClass(:kind) }` (probe) | DECLARE4000: "classFor reads the record and names classes — 'app' is neither" | An inline ternary on `:kind` | My code was wrong; the message was clear. The follow-up lint 4025 about nesting contradicts the rule, which is a platform wart. |
| 2 | `schema Stroke [...]` | DECLARE4015: clashes with Declare's own `Stroke`; suggested a rename | `StrokeSpec` | A good catch; I'd never have known. My code. |
| 3 | `accessibilityRole = alert` | DECLARE2000: not a role; "an alert is `status` with `accessibilityLive = assertive`" | As suggested | I guessed from ARIA; the fix was named exactly. My code. |
| 4 | `key: string` on `SlideTile` | DECLARE2000: `key` is replication metadata | `slideKey` | My code; excellent message. |
| 5 | `accessibilityRole = tab` with `accessibilityPressed` | DECLARE2006: the tab role reads `accessibilitySelected` | `accessibilitySelected` | My code. |
| 6 | `IconButton` with `on` and no a11y state | DECLARE4022 warning | `accessibilityPressed = { on }` | My code. |
| 7 | Tools and text-align as rows of toggles | DECLARE4026: "one choice among several"; use Segmented or RadioGroup | First a `Choice` subclass with `role = radio`, which drew DECLARE4032 ("a radio outside a RadioGroup"). Then real `RadioGroup`s whose `Choice` children call `parent.pick`. | Right on the platform's part, and the RadioGroup reference spells out how to write your own radio. I went with RadioGroup because `Segmented` icon segments carry no `tooltipLabel`, and the brief needs tooltips. That gap is the platform's. Two rounds for one issue; reading `19` first would have made it zero. |
| 8 | `DeckCard extends Control` holding the ⋯ `IconButton` | DECLARE4020: a nested button is unreachable to VoiceOver | Restructured: a plain view holding a `face: Control` and a sibling `more` | My code; a valuable warning. |
| 9 | An App method named `setKeep` | DECLARE4002: shadows the `doc.ts` function of the same name | Renamed to `keepShape` | This would have been infinite recursion, because that method calls `setKeep(e, on)` from `doc.ts`. The most valuable warning of the build. |
| 10 | `e.changed("location")` | R3 DECLARE6001: not callable; "`e.changed.some((c) => c.name == …)`" | As suggested | I guessed instead of asking `declare-help`. My code. |
| 11 | Top bar at the laptop width | R5 layout: "children need 1077 across and it has 1058 … `app.editor.top.12` runs past its end" | Narrowed the title box | Correct, and caught at a size I hadn't looked at. |
| 12 | `CardGrid extends TweenLayout` | Placed once at a narrower width; never re-placed | `trackChanges = ["width"]`, `retarget(false)` | Partly mine: the to-do app shows the fix. But `17` says the runtime reruns `place()` "whenever anything it read changes — the room", which reads as if a width change is handled. For `TweenLayout` it apparently isn't. **I'd call the docs unclear, and possibly the platform's behaviour surprising.** |
| 13 | Distribute-across test | Gaps came out -230 vs -420 | Debug prints showed the third click hadn't made a box. It had landed on the previous box's resize handle. I hid handles unless the Select tool is active. | A real UX bug in my code, found only by the assert script. |
| 14 | `drive.press("…scroller.1")` | Dragged the first tile (`listDrag.from == 0`) | Addressed the tile by label: `scroller."Slide 2"` | **Unsure.** I expected `.1` to be the second replica; maybe the non-view `Shortcuts` member counts. Index addressing over mixed children surprised me. |
| 15 | Pressing the freshly duplicated tile | "would reach `app.editor.body.list.scroller`: it is covered there, or takes no presses" | `settleMotion()` first | Documented behaviour: a `TweenLayout` arrival waits hidden. The refusal was right, but it didn't mention that the target was mid-arrival. |
| 16 | Corner-radius `Slider` showing a "Mixed" value | Track fill ran past the panel edge | Clamped `value` to `max` | The value was bigger than `max`. **Unsure:** I'd expect `Slider` to clamp its own drawing. |
| 17 | Striped "mixed" swatch drawn in `draw()` | Stripes spilled outside the chip's rounded box | `clip = true` on the chip | I assumed a drawing clips to its view. It doesn't by default, and I don't recall reading that either way. Docs unclear. |
| 18 | The Fill section's note under a text selection | Wrapped to two lines and shifted the inspector | A fixed 30 px slot | My code; seen only in a screenshot. |
| 19 | The presenter test | Worked | — | — |
| 20 | `declare-look --dblclick` | "not an option" | `--call 'app.dive(…)'` | A tool gap: `drive.dblclick` exists in assert scripts but not in `look`. |
| 21 | A look run that drew a line and a rectangle | The next run found the slide unsaved | Added a `beforeunload` guard via a browser script plus `onChange` on `unsaved`; cut the debounce from 900 to 500 ms | `look` closes the page while program time is held, so my debounce never fired. That's the tool's model. It also exposed a real data-loss window, which is my design. |
| 22 | A mid-animation `--no-settle` shot | Layout: 8 home controls "covered by `app.editor.body.stage`" | Nothing | Expected during the grow animation. Reporting it under no-settle is defensible, but the report gives no hint that the cover is temporary. |

Left as they are: eight DECLARE4025 nesting warnings and nine DECLARE1002 redundant-parentheses hints. The hints come from habit: `({ … })` is what `declare.md`'s own examples write, so I'd question why the hint exists.

---

## (e) Verifying it

The ladder (`declare-verify`):
- **R1–R3** caught every naming, role and type problem in (d), each with a fix I could apply mechanically. Each run took about two seconds.
- **R4 boot** went clean early. It told me which data sources it fed with schema samples, and which classes it never built (`LineEl`, `SlideTile`).

`declare-look` was the workhorse, with about 15 runs. A shot after each milestone found the grid bug, the inspector overflow, the swatch spill, the slider overrun, and the banner copy wrapping too much. `--set app.location=…`, `--call`, `--read` and `--js` made almost any state reachable. Dropping the service by setting `app.base` to a dead port and then restoring it tested the offline status and recovery in one run.

The assert script (`tests/assert.mjs`):
- **What it covers:** the brief's "what done looks like", end to end, at 73 steps and 35 assertions.
- **Runs:** it took six until it passed.
- **What it caught:** bug 13, the tile-path confusion and the arrival timing.
- **Time:** holding program time and moving it with `drive.wait` made autosave and the 5-second conflict check fast to test.
- **Ergonomics:** reading values took a hand-written `page.evaluate(() => window.__declare.find(p)[a])` with a JSON round-trip, because `evaluate` returns transcript objects. That's documented, but clumsy. A `drive.read(path, attr)` would help.

How well the tools served me: very well, the best I've had in an unfamiliar stack. The exceptions were the missing `--dblclick`, path-by-index, and a slow understanding of "held time vs. real time" (it caused bug 21).

**What is still unchecked:**
- `LineEl` was never built in any checked state. ("Never built … LineEl" was printed on every run; I only saw a line in a screenshot.)
- Line endpoint handles.
- Marquee selection.
- Cut, copy, paste and restack.
- ↑/↓ navigation in the slide list.
- Hover cursors.
- The context menus and the delete-confirmation dialog.
- Real fullscreen in a real browser.

---

## (f) Confidence, part by part

**High:**
- Rendering identical across stage, thumbnails, cards and presenter.
- Drawing with Shift.
- Moving with snapping.
- Resizing that keeps corner radii.
- The radius knob.
- Grouping and undo, including the selection coming back.
- Align and distribute.
- Duplicating and reordering slides.
- The three save states and recovery after being offline.
- The conflict banner and "Use this version".
- Presenting with the arrows.

**Medium:**
- **"Keep mine".** It works in code but was never run.
- **Keyboard navigation in the slide list.**
- **Shift-resize changing proportions once.** It's an XOR in code and never exercised.
- **Esc ending presenting.** Inside fullscreen the browser takes Esc. I end presenting when the window shrinks, using `wentFull`/`isFullscreen()` in `onChange`. That's a heuristic, untested in a headed browser.
- **The hover outline and cursors.** They rely on `onPointerMove` firing on hover, which the reference says it does. Not verified.

**Low, and where I'd expect a tester to find problems:**
1. **Renaming may not persist.** The decks my failed runs left behind were all still "Untitled presentation", even though those runs typed "Quarterly review". My passing run checked `doc.title` locally and never the server. The deck PATCH waits until no creates or deletes are pending, and perhaps it simply hadn't fired before those runs died. I didn't confirm that. **Test this first.**
2. **Reordering can be lost if another window added slides.** The comment says we "send our order of the slides it has". The code just retries with our order, which the service will refuse as 422, and then the op is dropped. The reorder would be lost quietly.
3. **Slides created while offline.** The local-key-to-server-id mapping is untested.
4. **The in-place text field's metrics.** Line height in the `TextInput` may not match the `Text`, so the text could jump slightly when editing ends.
5. **Hard-coded tile pitch.** The pitch 118 is written in three places (`TileStack` and `dragTile` among them). Change one and drop targets drift.
6. **Brief items only partly met:**
   - "Panels slide in and out": only the library's overlay motion; nothing of mine slides.
   - "Handles follow": they track instantly, with no spring.
   - Copy/paste between browser windows: not done.

---

## Surprises
- **The compiler's accessibility diagnostics.** They taught a protocol, ARIA radio groups, better than most docs, and every one named its fix.
- **DECLARE4002 caught a recursion bug** before it ever ran.
- **`Dialog` with `presentation = "full"` worked as a presenter** with almost no code.
- **Recursive `classFor`** "just worked".
- **Drawings don't clip to their box.**
- **`TweenLayout` doesn't follow its own width** without help.
- **Shortcut key names live only in `keys.ts`.**

## What was good
- The diagnostics, every single time.
- `declare-help` as a reference.
- The speed of the verify ladder.
- Program time held by the driver.
- Constraint-derived chrome. The whole inspector is declared facts.
- One renderer at many sizes.
- Overlays as standing members opened with a verb.

## What was bad
- **Host gaps:** fullscreen, clipboard, page-unload.
- **A "request finished" event for `DataSource`** that I had to invent.
- **The `classFor` and DECLARE4025 contradiction.**
- **Doc tension** between "place() reruns when the room changes" and `TweenLayout`'s `retarget`.
- **Test-path index semantics.**
- **The share of the app that is plain imperative TypeScript.** An editor is mostly verbs, and Declare's strengths are mostly in display. That's not a flaw so much as a limit on how much it helped here.

## How it compares
- **Closest to QML:** a declarative tree, embedded script, bindings, states. Also MXML/Flex, and OpenLaszlo, which the README cites.
- **Unlike React:** there are no renders to reason about. Arrays in attributes have to be reassigned (`this.ops = [...]`), which felt like Svelte 3.
- **Unlike SwiftUI:** a `State` here is a named bundle, not a property wrapper.
- **The compiler-as-reviewer stance** felt more like Elm's error messages than any UI framework's.

## Where I'd most want improvement
1. **Host APIs as Declare members:** fullscreen, clipboard, "page is leaving".
2. **A request-completion event** on `DataSource`, or an explicit queue idiom in `14-data`.
3. **Fixing `classFor`/4025** so `classFor` can use a lookup, or the lint stops asking.
4. **Documenting `TweenLayout` re-placement and drawing clip** in the reference itself.
5. **A key-name table in `declare-help Shortcuts`,** including the ⇧-with-symbols rule.
6. **`declare-look --dblclick`** and a `drive.read`.
7. **`Segmented` icon segments with tooltips.**

## The hardest part
It was a pattern, not one obstacle: **behaviour the compiler can't see.** The `TweenLayout` width, drawing clips, slider overrun, handles intercepting presses, test-path indexing, and the held-time save window are all instances.

Together they cost perhaps 30–40% of the debugging time, a dozen look or assert runs. None was hard once seen; each needed a screenshot or a failing assertion to see.

To have written it right the first time, I would have needed:
- the reference to state, on `TweenLayout` and `draw`, what each does on resize and at its edges;
- a "Writing an editor" note covering drawing tools against handles, and save queues against unload.

## What I'd use it for
Desktop-grade tools with real interaction and motion:
- editors, boards and dashboards;
- internal apps where accessibility and checking matter;
- prototypes I want to be correct, not just plausible.

I'd hesitate where I need a large third-party ecosystem, or where most of the logic is imperative state machines. There Declare adds little over TypeScript, though it never got in the way.

## Names

```
NAMES — eval-presentify-3: 1 missed name(s), 1 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     2 · global    · localStorage         ·                          · browser/Node global · foreign hint · ×1  ·    3 · resolved

COLLISIONS (min · held by · name)
     7 · Declare's type · Stroke
```
