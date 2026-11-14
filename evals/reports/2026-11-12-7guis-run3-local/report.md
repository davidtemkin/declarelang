# 7GUIs run 3: Opus 5.5, Declare, on the local tree

Built on the local working tree, the same subject as Venue run 33 plus that run's fixes.
**13.2 min, 88 turns, 66.2k output tokens. 6 of 8 hidden checks, both delivered and at first
boot (7.6 min).** Run 2 took 16.9 min, 100 turns, and passed 7/8. **No regression:** both
failures are the app's own. With four role attributes and a case-insensitive filter, the
delivered app passes 8/8 (`audit/full-drive-variant/`). Not clean on any count. Timing
record: `evals/timings/2026-11-12-7guis-run3-local.txt`.

## Figures

| | Run 2 | **Run 3** |
|---|---|---|
| time, turns | 16.9 min, 100 | **13.2 min, 88** |
| output tokens | 78.1k | **66.2k (22.2k thinking)** |
| phases: reading · writing · checking | | **2.5 · 0.7 · 10.0** |
| first clean boot | 8.6 min | **7.6 min** |
| hidden checks, delivered / first boot | 7/8 / 7/8 | **6/8 / 6/8** |

## The hidden-check failures

- **CRUD (lower-case "t"): the app's choice, not a regression.** `crud.declare` filters with
  `p.surname.startsWith(classroot.prefix)`, case-sensitive in all 19 snapshots. Run 2's app,
  and the to-do app the agent read, lowercase both sides. A copy of the drive typing "T" and
  "Tis" passes the whole scenario: create, update, delete, selection exposed and layout. So
  the derived Dataset (copy-on-adopt), Table, schemas and settle all behave. The brief says
  "starts with" and says nothing about case; the case expectation is the drive's (design 5).
- **Cells (no header roles): the app, plus a doc-routing gap.** The headers are `Text` now (run
  2 drew them). Guide 17's new sentence worked. The agent put `grid` on the body but gave no
  row, cell or header roles. The pattern lives only in guide 19 § Your own controls, which the
  agent skipped. Guide 17's sentence reads as if Text alone were enough. `declare-help grid`,
  `spreadsheet` and `table roles` don't reach the pattern. Verify said nothing about a `grid`
  with no rows.

## The deep audit

Repros are in `audit/`.

| # | What | Verdict |
|---|---|---|
| 36 | `press()` on a Button, DECLARE4013 | Correct; the SKILL drift-check line led it there (**D4**) |
| 46 | `class Sheet`, DECLARE5000 | A fair collision, the second Cells build in a row (design 4) |
| 46 | `sheet: SheetModel [ ]` filled in `onInit`, "a Dataset needs data" | By design; filling a dataset from code is untaught (**D6**, repeat) |
| 45–47 | 4025 ×2, 4035 + 4018, 1002 | Correct |
| 24 | `declare-help readOnly` | Fits; not misleading |
| 58 | `Field` caption misaligned | **P2** |
| 63–66 | `--drag adjuster.0.1` silent | Index paths reach a library class's parts; undocumented; partly the agent's |
| 71 | `drive.click` on a hidden view pressed nothing, silently | **T1** |
| 76 | `beginEdit(e.key)` gave "55" | **P1** |
| drive | Flight bad dates marked by colour only | App; `validate` + `judged = true` exposes `[invalid]`, but under-taught (**D3**) |

**Platform:**
- **P1.** A key answered by `onKeyDown` (without `super`) also types into the field that focus
  moves to while answering it. Same family as run 2's P4 (one Return, two actions).
- **P2.** `FieldLayout` puts the caption at a fixed `y: 6`, so it sits off a TextInput's text and
  below a ProgressBar.
- **P3.** `rowsUnder` adds up nested replications: 3 rows of 4 cells report "15 rows".

**Tools:**
- **T1.** `drive.click` on a hidden view doesn't refuse: a hit on an ancestor counts as reaching it.
- **T1b.** The "motion in flight / timer waiting" tail is still attached to unrelated failures.
- **T2.** `declare-help grid` and `spreadsheet` don't route to the composite pattern.

**Docs:**
- **D1.** Table selection contradicts itself: the reference's own `commit(sel) { app.chosen =
  sel }` leaves nothing shown selected. The form that works, `selection = { app.chosen }` plus
  `commit`, is one the prose seems to forbid.
- **D2.** The composite-with-roles pattern isn't routed: guide 17's sentence and the SKILL map
  row don't lead to it.
- **D3.** `judged = true` is stated only in `ValueControl.error`.
- **D4.** A Button's action slot is `onClick`.
- **D5 (stale, not met).** `verify.md` says virtualized rows are "in no data order".
- **D6.** A dataset a program fills itself starts from `{ { "rows": [] } }`.

**Source reads:**
- `textinput.declare`: a doc gap (D3).
- `segmented.declare`, `tabbar.declare`: fair; redundant with help already read.
- `table.declare`: a doc gap (D1).

### Clean bill

| Count | Verdict |
|---|---|
| Platform | **Not clean.** P1, P2, P3 |
| Tools, incl. the driver | **Not clean.** T1, T1b, T2 |
| Names | **Not clean.** The `Sheet` collision |
| Reference | **Not clean.** D1–D4, D6 met |

**Friction cost: about 6.9k output tokens (≈10%) and about 2 min (≈15%).** The larger cost is
two failed checks that five edits would have passed.

### Against run 2

Run 2's fixes hold:
- the Map default, the `const x` refusal and the disabled field are all fixed;
- both R1 errors arrive in one round;
- the `readOnly` hint works, and the guide 17 sentence stopped the drawn headers.

CRUD lost its pass to a case choice that run 2's agent happened to get right.

## Fixed on the local tree after this run

The full suite passes (`silent-failures` failed once under load, on fling timing, and passes
2 of 2 alone).

- **P1:** a key a handler answers without `super` is consumed (`focus.ts` `deliverDown`). On a
  non-field, every plain key is consumed. On a text field, typing stays the field's own, but
  text is dropped if focus leaves the field during its handler (`keys.ts`, a capture
  `beforeinput` listener). The repro gives "5", not "55". DataGrid's type-to-edit passes the key
  itself and still works ("Zq"). **The delivered sheet's `beginEdit("")` loses its first
  character**: it relied on the leak (see design 1).
- **P2:** `FieldLayout` sits the caption on the control's baseline, or centres it. Stacked fields
  are unchanged; side-by-side ones move 1–3 px.
- **P3:** `rowsUnder` counts only the outermost replication (`isReplica`). Test added.
- **T1:** a press on a hidden view is refused by name. Regression test in `verify-requests`.
- **T1b:** the motion/timers tail is kept only where waiting matters (`visible`, `hidden`, "no
  node at", a `settleMotion` timeout).
- **T2:** `grid` keeps the layout sense and adds the role sense; a concept entry covers
  `spreadsheet` and the "… roles" terms; a token of one closed vocabulary (`rowHeader`) answers
  with that vocabulary.
- **D1:** the Table reference and guide 16 teach `selection = { app.chosen }` plus `commit`.
- **D2–D6:**
  - D2: guide 17 and the SKILL map route to guide 19.
  - D3: `judged = true` is in guide 08 and TextInput.
  - D4: SKILL names `onClick` as a Button's action slot.
  - D5: `verify.md` says virtualized rows are in data order.
  - D6: the Dataset reference says a self-filled dataset starts from its shape's empty form; the
    "needs data" message uses the program's class.

**Noticed:** `tools/internal/doc/prose/Table.md` still shows `selection <-> app.chosen`. It may
be unused, since Table's reference comes from `library/table.declare`.

## Deferred: design

1. Should a key a handler answers be consumed? It's the principle behind P1 and run 2's P4, but
   the delivered sheet's type-to-edit relies on the leak. *(Fixed as a defect, one key, one action. The open question: should a sheet of
   your own be taught to pass the key on, as DataGrid does?)*
2. Should boot check role structure (a `grid` with no rows)? That would be a new diagnostic.
3. Should a `Field` name any control it holds (ProgressBar, Gauge)?
4. Library classes take common nouns: `Sheet` has collided in both Cells builds.
5. Should the 7GUIs brief say "ignoring case", or the drive only note it?
6. Should a Table with an overridden `commit` but no derived `selection` still show its selection?

## Is it idiomatic Declare?

The line-by-line read wasn't done.

## The agent's account

Pasted whole. Where the audit contradicts it, the audit's reading is above.

# Building 7GUIs in Declare: an account for the people who make it

I'll start with a correction to what I told you when I handed over the build. I said the app was being served at `http://127.0.0.1:8201/my-apps/7guis/7guis.declare`. When I started the server, that URL did answer 200. Since then the background task has reported that the server exited with code 1, so **nothing is serving it now**. Running `PORT=8201 npm start` from `declarelang/` brings it back. You asked me not to change anything, so I haven't restarted it.

Throughout, "my fault" means I wrote it wrong, "docs" means the documentation led me there, "platform" means I think the platform's behaviour is questionable, and "unsure" means I can't tell.

---

## (a) Getting up to speed

**What I read, in order**
1. `README.md`. It sent me to `skill/SKILL.md` and `AGENTS.md`.
2. `skill/SKILL.md`, the whole file.
3. `docs/declare.md`, the whole file (942 lines).
4. Guide chapters 01 (what Declare is), 04 (structure), 05 (running and checking) and 06 (layout), each in full.
5. `apps/todo/todo.declare` and `todo-parts.declare`, both in full.

That is exactly the reading list the skill prescribes, and I followed it.

**What I read later, when a task needed it**
- `declare-help` entries: TabBar, TextInput, Slider, Gauge, ProgressBar, RadioGroup, Segmented, Window, Dialog, ContextMenu, Time, Table, TableRow, Dataset, Field, `readOnly`, `shows`, `location`, `provided`, `SegmentedItem.location`, `onContextMenu`, `onDoubleClick`, `Floating.closed`, `ignoreScroll`, and "theme tokens".
- Guide chapters in full: 08 (controls), 16 (collections), 17 (your own views), 18 (overlays), 22 (time).
- Parts of chapters: 07 (scrolling panes, fixed headers), 09 (pointer and keyboard, up to key bindings) and 20 (`location`).
- Library source: `segmented.declare` (to see how the `location` links work), the top of `textinput.declare`, and the `Table` class in `table.declare`.
- Parts of `docs/operational/verify.md`: the drive/expect table and the note about reading values.

**What I skipped**
- Chapters 02 (notation) and 03 (constraints). `declare.md` seemed to cover them.
- Chapter 14 (data, 767 lines). This is the one I most regret skipping. CRUD and Cells are both data-heavy, and I worked from the `Dataset` reference entry instead.
- Chapter 15 (schemas), 11 (paint and themes), 12 (text) and 19 (accessibility).
- The tracker app. The skill names it as the model for "records people list, search, filter and edit", which is exactly CRUD, and I didn't open it.

I skipped all of these to save time. The skill told me to stop reading after the core set, and I took that literally even when a task's shape matched one of the recommended models.

**What taught me the most**
- `declare.md` §5 (constraints, the settle, "derived state is never assigned") and §11 (the value pattern). These gave me the mental model that made the controls easy.
- The `Table` source. It showed me that I could own the selection by constraining `selection` and overriding `commit`.
- The "Drift check" list in SKILL.md, which changed my code before I compiled anything (see h1).

**What was missing or misleading**
- **Button and `press()`.** The drift check says "The use site overrides `press()` itself", and chapter 04 shows a `Swatch` (a Control) doing that. I applied it to `Button`, and it's wrong for Button, as warning DECLARE4013 then told me (d3). The skill's advice should carve out Button, or at least mention it.
- **Overlay paths in checks.** I found no place that explains how to address a Window's body children by path. My `--drag app.body.circles.adjuster.0.1` silently did nothing (d11).
- **Building a dataset's data from code.** Nothing tells you how to do it. A literal body or a derived `contents` are the documented forms, and derived data is read-only. My answer was an empty literal plus `set([], …)` in `onInit`. I'm unsure that's the intended way.

## (b) Expressing what I wanted

**Where Declare fit very well**
- **Counter, Temperature and Flight Booker.** They are almost pure constraints. In Flight Booker, every rule is one named boolean (`startValid`, `backBeforeStart`, `canBook`), and `disabled = { !classroot.canBook }` reads exactly like the brief.
- **Computed defaults.** `startText: string = { classroot.today }` was elegant: the field starts as today, and once the person types, the value is theirs.
- **Timer.** `Time [ tick = frame, running = { elapsed < duration }, onTick(dt) … ]` *is* the spec. Stopping at d and resuming when d is raised needed no extra code.
- **Editing behaviour came for free.** Because a field shows the person's text while they edit, the two Temperature fields never fight each other.
- **CRUD's list.** `Table` with a constrained `selection` and an overridden `commit` gave me "only a visible person can be selected" by derivation.
- **Opening a TabBar tab by URL.** `location` plus items carrying `location` gave every task an address almost for free.

**Where I worked around the language**
- **The spreadsheet's dependency graph.** I hand-wrote it as mutable `Map` attributes on a `Dataset` subclass, mutated only inside handlers (g4).
- **Sticky headings in a pane that scrolls both ways.** I built them by hand (g2).
- **The Circle Drawer's adjust window.** I placed it by hand, imperatively, in `beginAdjust`. This is the one place where I assign `x` and `y` from a handler.

## (c) The first time it ran

**Before any screenshot**
- The first partial verify (Counter, Temperature and Flight Booker only) passed rungs 1–4 with two warnings: DECLARE4013 and DECLARE4025.
- The first full verify failed at R1 on two structural errors (d1, d2). After fixing those it booted, with accessibility warnings to clear (d6).

**What looked or behaved wrong once running**
1. **Field labels sat off-centre beside their controls.** In Timer, the "Elapsed time" label sat lower than the thin progress bar. Found by looking at a screenshot (`declare-look --shot`).
2. **The adjust window covered the circle it adjusts.** Found by screenshot.
3. **The adjust window's slider didn't move when dragged.** Found because `--read app.body.circles.selected` still showed `d: 40`.
4. **Typing a character to start editing a cell doubled it.** Typing 5 gave "55", and typing `=sum(A0:A1)` gave `==sum…`, which shows `#SYNTAX`. Found by screenshot.
5. **The arrows could move the selection off screen.** I realised this while reading the scrolled screenshot, not from any visible symptom.
6. **The adjust window still overlapped a large circle** after my first repositioning. Found by screenshot.

## (d) Every refusal and surprise

**d1. DECLARE5000, a library class name**
- I wrote: `class Sheet extends Dataset [ … ]`
- The platform said: `'Sheet' is a library class — a class of the program can't take its name; rename yours, as 'MySheet' … [DECLARE5000] (cells.declare:32:1)`
- I changed it to `SheetModel`.
- Judgement: my fault. It's a sharp edge, though: the library takes common words (`Sheet`, `Window`, `Field`, `Table`) out of the program's namespace. The message was excellent.

**d2. DECLARE2000, a Dataset needs data**
- I wrote: `sheet: Sheet [ ],` on a `Dataset` subclass whose `onInit` calls `this.set([], { rows })`.
- The platform said: `a Dataset needs data — a literal JSON body ('sheet: Dataset { … }') or a derived 'contents = { … }' [DECLARE2000] (cells.declare:164:5)`
- I changed it to `sheet: SheetModel { { "rows": [] } },` and kept the `onInit` fill.
- Judgement: docs and platform, mildly. The rule is clear, but a placeholder `{ "rows": [] }` that is immediately replaced feels like a workaround. Unsure whether `onInit` + `set([])` is idiomatic.

**d3. DECLARE4013 (warning), `press()` on a Button**
- I wrote: `Button [ label = "Count", primary = true, press() { classroot.count = classroot.count + 1 } ]`, and the same for Book.
- The platform said: `press() on Button replaces Button's activation path — … its own press() delivers to onClick, which is the use site's action slot … Put the action in onClick() — 2 sites, also on line flight.declare:86 [DECLARE4013]`
- I changed both to `onClick()`.
- Judgement: my code was wrong for Button, but the docs led me there (see a). This was the most useful warning of the build. If it had been a gentler lint I might have shipped a Count button that did nothing when clicked.

**d4. DECLARE4025 (lint), raised twice**
- I first wrote: `backBeforeStart: boolean = { classroot.isReturn && classroot.start != null && classroot.back != null && classroot.back < classroot.start }`
- I split it into `startValid` and `backValid`, wrote `{ classroot.isReturn && classroot.startValid && classroot.backValid && classroot.back! < classroot.start! }`, and got the same lint again.
- I then added `bothValid`.
- Judgement: fine. I went round once because I fixed it by naming parts without reducing the number of conditions.

**d5. DECLARE1002 (hint), redundant parentheses**
- I wrote: `contents = { ({ people: classroot.people.all().filter(…) }) }`
- I removed the extra parentheses.
- Judgement: harmless. I'd copied the `({ … })` habit from the todo app's method bodies, where it's needed or at least customary.

**d6. DECLARE4035 and DECLARE4018 (accessibility)**
- I wrote: `canvas: View [ … focusable = true, accessibilityLabel = "Drawing: click to draw a circle, right-click a circle to adjust it", draw(d) {…} ]`
- The platform said: `canvas has an accessibilityLabel but no role, so nothing reads it …` and `canvas draws itself and takes the focus, but has no accessibilityRole …`
- I added `accessibilityRole = image`.
- Judgement: my fault for omitting a role. My fix is probably the wrong role: `image` for an interactive drawing surface is doubtful. I didn't read chapter 19 to find a better one. Unsure.

**d7. declare-look path, a class is not a name**
- I wrote: `--click 'app.body.CounterTask.row.Button'`
- The platform said: `'CounterTask' is a class, not a name: in 'app.body' that child is '0' … Give it a name where it is written`
- I named the task views (`counter: CounterTask [ … ]`).
- Judgement: a very good message.

**d8. My own shell error.** `L="npx declare-look …"; $L …` failed in zsh. Not the platform.

**d9. A raw JavaScript error from `--call`**
- I wrote: `--call 'app.body.circles.menu.showAt(null, null)'`
- The platform said: `unexpected error: Cannot read properties of null (reading 'x')`
- Judgement: my misuse. It surfaced as a raw JS error rather than a Declare-register message, which is the one place a diagnostic felt foreign.

**d10. `--read` does not call methods**
- I wrote: `--read app.body.circles.circles.all()`
- The platform said: `'app.body.circles.circles' has no 'all()'`
- Judgement: my misuse; `--call` was the tool. The message could say "use `--call` for a method".

**d11. A slider drag that silently did nothing**
- I wrote: `--call 'app.body.circles.beginAdjust({…})' --drag app.body.circles.adjuster.0.1 80,0`
- Afterwards `selected.d` was still 40. There was no error.
- I tried `declare-verify --outline app.body.circles.adjuster`, which printed nothing about the window, probably because it is closed at boot.
- I named the window's content view `panel` and the slider `dial`. In the assert script, `drive.drag("app.body.circles.adjuster.panel.dial", 60, 0)` worked.
- Judgement: unsure. Most likely `adjuster.0` addressed a part of the Window's own frame rather than my content view, and a drag on that did nothing. A drag that hits no draggable thing could say so. I never found out what `.0.1` actually named.

**d12. Field label alignment**
- I wrote: `Field [ label = "Start", labelWidth = 60, DateInput [ … ] ]`, and `Field [ label = "Elapsed time", labelWidth = 100, ProgressBar [ … ] ]`
- In the screenshot, the label text sat a few pixels from the field's vertical centre. Beside a ProgressBar the mismatch was obvious.
- I replaced every Field with `View [ layout: SimpleLayout [ axis = x, spacing = 8, align = center ], Text [ width = 60, … ], control ]`.
- Judgement: unsure. I suspect Field aligns by baseline and ProgressBar has none. That's possibly a platform rough edge, or I used Field outside its intended form-row use.

**d13. Typing to start a cell edit doubled the character**
- I wrote: `onKeyDown(e) { if (e.key.length == 1 && …) classroot.beginEdit(e.key) else super.onKeyDown(e) }`. `beginEdit` sets `draft` and `editing = true`. The editor focuses itself with `onInit() { afterSettle(() => Focus.focus(this)) }`.
- The key also reached the newly focused field, so the cell got "55".
- I changed it to `beginEdit("")`.
- Judgement: my code was wrong given that behaviour. But it now depends on focus moving before the key's native input happens, which I did not see documented. It works in Chrome. Unsure it's guaranteed.

**d14. Selection could leave the screen.** A design omission of mine. I added `trackChanges = ["selected"], onChange() { if (selected) this.scrollIntoView("nearest") }` to `GridCell`.

**d15. "0.3333333333" was clipped in its cell.** Mine. I switched formatting to `toPrecision(10)`.

**d16. Assert script: a hidden child shifts indices**
- I wrote: `drive.click(`${f}.form.3`)`, intending Book. `form.3` is actually the hidden "return date is before…" Text.
- The platform said: `expected 'app.body.flight.confirm' text to contain "You have booked a one-way flight on 13.11.2026", got "" (1 timer still waiting — drive.wait(ms) runs them)`
- Judgement: my fault for using indices. The "timer still waiting" hint was a red herring here. Clicking a hidden view didn't fail. It could have, and that would have pointed straight at the problem.

**d17. Dev server port.** `npm start` said: `port 8200 is already taken by another Declare dev server, serving a different tree … PORT=8201 npm start`. That was clear. The 8201 server answered 200, then exited (code 1), and I didn't notice until now.

## (e) Verifying it

- **`declare-verify`, rungs 1–4.** Caught d1–d6. They run in seconds, and every message named its fix.
- **`declare-look --shot`.** Caught the visual problems: d12, d13, the window overlaps, and d15. This was the indispensable tool. Several bugs were only visible in pictures.
- **`declare-look --read` and `--call`.** Useful for quick probes. I misused both once (d9, d10).
- **`declare-verify --assert checks/flows.mjs`.**
  - 166 steps and 57 assertions across all seven tasks.
  - On the first run it caught only my own index mistake (d16). Then it passed.
  - It never caught a real app bug. Everything the script tested was already right by then.
- **`declare-format --write`.** Reformatted three files, and the checks still passed afterwards.

**How well the tools served me.** Very well overall. The weak spots:
- the silent no-op drag (d11);
- `--outline` showing nothing for a closed window;
- raw JS errors leaking through `--call` (d9).

The deterministic clock (`drive.wait`) made the Timer test exact, which was a pleasure.

## (f) Confidence

Ordered from most to least confident:

- **Counter: high.**
- **Temperature: high.** The conversion is rounded to 2 decimals, so typing −40.123 °F shows a rounded °C. A tester might call that lossy.
- **Flight Booker: high on the rules.**
  - The booking message repeats the text as typed (trimmed), so "4.1.2026" isn't normalised to "04.01.2026".
  - The dates start at the local machine date.
- **Timer: high.**
  - The duration slider allows 0.
  - If you lower the duration below the elapsed time, the label shows elapsed greater than duration while the gauge shows full. That's defensible, but a tester may flag it.
- **CRUD: high on the brief's points.**
  - Create allows empty names, and Update to empty names too.
  - A newly created person who doesn't match the filter is invisible and unselected.
  - Selecting a person fills the fields. That isn't in the brief.
- **Circle Drawer: medium-high.**
  - The right-click was simulated (`button: "right"`), not done with a real mouse.
  - The adjust window is non-modal; I guard the canvas and Undo/Redo while it's open.
  - Selection is driven by hover, so keyboard-only users can't select a circle. The canvas is focusable but has no keyboard drawing.
- **Cells: medium.** The formula paths I tested work: arithmetic, SUM over ranges, propagation, `#DIV/0`, `#CYCLE`, `#SYNTAX`, text, double-click, Escape with no changes. Places I'd expect a tester to find problems:
  - Clicking another cell in the middle of an edit. I rely on `commitOn = "end"` committing on blur, plus `onBlur` clearing `editing`, and I never tested that order.
  - Escape after actually typing.
  - The 220-px editor covering the cells beside it.
  - Header sync during fast scrolling. I saw stills only, never motion.
  - The typed-character start (d13) on other browsers.
- **"Only dependents recompute": true by construction, but no test measures it.**

## (g) Gaps I worked around

**g1. A read-only field (Counter)**
- What I wanted: a read-only text field.
- Where I looked: `declare-help readOnly`, which redirected me: "a Text with `selectable = true`…".
- What I did: a boxed, selectable Text.
- Judgement: a deliberate design, not a gap, and the redirect was great.

**g2. Sticky row and column headings in a pane that scrolls both ways**
- What I wanted: headings that stay put while the body scrolls.
- Where I looked: `ignoreScroll` pins against both axes, as far as I could tell.
- What I did: a heading strip with `x = { -classroot.grid.main.body.scrollX }`, and the same for y.
- Judgement: unsure whether something per-axis exists. It works in stills; it may lag by a frame.

**g3. Per-cell editing in the grid**
- What I wanted: each cell editable in place.
- What I did: instead of an editor in each cell, one `TextInput` with `exists = { editing }`, placed at `selCol * colW`.
- Judgement: a fine design either way; not a platform gap.

**g4. Reactive dependency propagation in Cells**
- What I wanted: each cell's value as a constraint, with the runtime doing propagation.
- Where I looked: `declare.md` §5 says a `script` call is opaque, and my evaluator lives in `formula.ts`, so a constraint would only see the formula string.
- What I did: an explicit graph (`_reads`/`_readers` Maps, topological order, `#CYCLE` for leftovers) inside `SheetModel`.
- Judgement: the platform might have supported the reactive approach. `Dataset.read(path)` is documented as a *tracked* read for paths computed at run time. A Node per cell, whose value calls a Declare *method* that evaluates the AST via `read`, could probably have had its dependencies tracked by the runtime. Cycles would then be the runtime's cycle detection, which I don't know how it reports. Unsure; I didn't try it. It would arguably be the more Declare-native answer, and a good guide example.

**g5. A dataset filled from code (Cells)**
- What I wanted: to generate 100 rows × 26 cells.
- What I did: an empty literal body plus `set([], …)` in `onInit` (d2).
- Judgement: unsure if there's a better idiom.

**g6. Undo/redo (Circle Drawer)**
- What I did: wrote my own two stacks.
- Judgement: I didn't look for a library undo facility. The todo app does undo by hand with a toast, so probably none exists. Unsure.

**g7. Date entry (Flight Booker)**
- What I did: deliberately skipped `DatePicker` (ISO dates) in favour of a text field with my own format and red marking, because the brief wants the format shown and invalid text marked.
- Judgement: not a gap.

**g8. Red marking while typing (Temperature, Flight Booker)**
- Where I looked: ValueControl's `validate`/`error` only marks a field once it has been judged (when the person leaves it).
- What I did: `State [ applied = { parent.invalid }, stroke = { stroke(1.5, provided("theme").error) } ]` on a TextInput subclass.
- Judgement: possibly there is a "judge as you type" switch I didn't find. Unsure.

**g9. Where to place the adjust window**
- What I did: set `Window.x`/`y` imperatively in `beginAdjust`.
- Judgement: the docs say a Window's position is its own to set as literals, so this is presumably fine. A way to anchor a Window near a point would be nicer; unsure if one exists.

## (h) Changes of direction

**h1. Temperature fields** (before the first compile; my own second thoughts after rereading the drift check)
- First: `class TemperatureField [ … entered(t: string) { }, field: TextInput [ commit(t) { classroot.entered(t) } … ] ]`, with the use site overriding `entered`.
- Became: `class TemperatureInput extends TextInput [ invalid: …, State [ … ] ]`, with the use site writing `commit` directly.

**h2. Button actions** (after the first partial verify; warning d3)
- First: `press()` overrides on Buttons.
- Became: `onClick()`.

**h3. `backBeforeStart`** (lint d4)
- First: one four-part condition.
- Became: named facts: `startValid`, `backValid`, `bothValid`, `returnOk`.

**h4. Labelled rows** (after the Flight Booker and Timer screenshots; d12)
- First: `Field` rows.
- Became: plain SimpleLayout rows with `align = center`.

**h5. Adjust window placement** (two screenshots)
- First: fixed at `x = 80, y = 120`.
- Then: placed beside the circle at its current size.
- Finally: offset by the slider's maximum radius, after seeing the circle grow under the window.

**h6. Typed start in Cells** (screenshot; d13)
- First: `beginEdit(e.key)`.
- Became: `beginEdit("")`.

**h7. Number display in Cells** (screenshot)
- First: rounded to 10 decimal places.
- Became: `toPrecision(10)`.

**Considered but rejected before writing:**
- `Dialog` versus `Window` for the adjust window. I chose Window as "a small window".
- `Segmented` versus a pop-up Button for the flight type. I chose the pop-up, as closer to the original's combo box.

## (i) The code, quoted

These are reconstructed from this session.

**DECLARE5000 and DECLARE2000:**
```declare
class Sheet extends Dataset [ schema = SheetData,
    _parsed: Map<string, Formula> = { new Map() },
    …
    onInit() { … this.set([], ({ rows: rows })) },
    …
    ]
class CellsTask [ padding = 24,
    sheet: Sheet [ ],
    …
```
```
'Sheet' is a library class — a class of the program can't take its name; rename yours, as 'MySheet' (the library's is used as 'Sheet [ … ]') [DECLARE5000] (cells.declare:32:1)
a Dataset needs data — a literal JSON body ('sheet: Dataset { … }') or a derived 'contents = { … }' [DECLARE2000] (cells.declare:164:5)
```

**DECLARE4013:**
```declare
Button [ label = "Count", primary = true, press() { classroot.count = classroot.count + 1 } ]
```
```
warning: press() on Button replaces Button's activation path — every other control routes the pointer through press(), and Button inverts that: its own press() delivers to onClick, which is the use site's action slot. An override here answers Space and Enter, and a click still runs the untouched onClick — so the action never fires from the pointer. Put the action in onClick() — 2 sites, also on line flight.declare:86 [DECLARE4013] (counter.declare:23:51)
```

**DECLARE4025, the second time:**
```declare
startValid: boolean = { classroot.start != null },
backValid: boolean = { classroot.back != null },
backBeforeStart: boolean = { classroot.isReturn && classroot.startValid && classroot.backValid && classroot.back! < classroot.start! },
```
```
warning: backBeforeStart decides on one condition of 4 parts — give the facts it decides on names of their own … [DECLARE4025] (flight.declare:57:32)
```

**DECLARE4035 and DECLARE4018:**
```declare
canvas: View [ width = 100%, flexes = true, clip = true, focusable = true, cornerRadius = 6,
    accessibilityLabel = "Drawing: click to draw a circle, right-click a circle to adjust it",
    … draw(d: DrawContext) { … } ]
```

**The silent drag (d11).** No message was produced.
```declare
adjuster: Window [ ignoreLayout = true, x = 80, y = 120, width = 320, height = 130, title = "Adjust diameter",
    open = { classroot.adjusting }, commit(v: boolean) { if (!v) classroot.endAdjust() },
    View [ width = 100%, padding = 16, layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ … ],
        Slider [ width = 100%, min = 4, max = 200, step = 1, value = { classroot.selected?.d ?? classroot.diameter },
            commit(v: number) { classroot.circles.setDiameter(classroot.adjustingId, v) } ] ] ]
```
Command: `npx declare-look my-apps/7guis/7guis.declare --size 1100x700 --set app.location=circles --click-at app.body.circles.canvas 200,150 --call 'app.body.circles.beginAdjust({"id":1,"x":200,"y":150,"d":40})' --drag app.body.circles.adjuster.0.1 80,0 --read app.body.circles.selected`, which printed `{"id":1,"x":200,"y":150,"d":40}`.

**The doubled keystroke (d13).** No message; the cell showed "55".
```declare
onKeyDown(e: KeyEvent) {
    if (e.key.length == 1 && !e.ctrl && !e.meta && !e.alt) classroot.beginEdit(e.key)
    else super.onKeyDown(e)
    },
…
editor: TextInput [ exists = { classroot.editing }, … commitOn = "end", value = { classroot.draft },
    onInit() { afterSettle(() => Focus.focus(this)) } ]
```
Command: `--click …body.rows.0.0 --type 5 --key Enter`.

**Field misalignment (d12).** No message; seen in a picture.
```declare
Field [ label = "Elapsed time", labelWidth = 100,
    ProgressBar [ width = 240, min = 0, max = { Math.max(classroot.duration, 0.001) }, value = { … } ] ]
```

---

## Surprises

- How much was free: the settle model, editing that doesn't fight its own value, `Table` selection, `location` routing, and the focus ring.
- That `Button` inverts `press()` compared with every other control.
- That the formatter and checker were trustworthy enough that I never doubted them.

## Good

- The diagnostics. Nearly every message named its fix; the best were DECLARE4013 and the "class, not a name" path error.
- `declare-help`'s redirects from foreign names (`readOnly`).
- The deterministic clock in tests.
- `exists` and `State`.
- The one-file language spec, which really is enough to start.

## Bad

- Paths into library composites (a Window's body) are opaque, and a mis-aimed drag fails silently.
- The skill's advice to override `press()` at the use site, which is wrong for Button.
- Building data from code is awkward.
- Hidden siblings shift index paths, which encourages fragile test scripts. Naming everything fixes it, but nothing nudges you to.

## How it compares, and what it reminded me of

It reminded me most of **OpenLaszlo/Flex MXML** (which the README cites as its lineage), with **SwiftUI's** value-flow discipline and **spreadsheet-style** dependency tracking. Unlike React, there was no render or update code at all. Unlike CSS, layout is a small model I could hold in my head after one chapter.

## Where I'd most like to see improvement

**1. Docs on the gap between a library component's internals and a test path.** This was a pattern rather than one obstacle: d11, `--outline` on a closed window, and d16. It cost me perhaps a fifth of the verification time. What would have made it right first time: a documented rule that composites put their content under a named body, or a warning when an action lands on nothing interactive.

**2. A worked example of a self-populating dataset.** Ideally also a reactive per-cell formula pattern, which would have answered g4 and g5.

## What I'd use it for

Internal tools, forms, dashboards and data editors, where its constraints, checker and library carry most of the weight. I'd also try it for interactive explanatory figures. I'd hesitate on anything needing a big ecosystem of third-party widgets, though `DOMIsland` suggests a path there.

## The hardest part

The **Cells change propagation**. It was one obstacle, not a pattern, and it cost roughly a quarter of the build. It was hard mainly because I chose to write the graph by hand instead of finding out whether the runtime's tracked `read` could do it for me. To write it right first time I would have needed one guide example of a formula cell whose dependencies are only known at run time.


## The names ledger

```
NAMES — eval-7guis-3: 0 missed name(s), 1 collision(s), 1 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

COLLISIONS (min · held by · name)
     7 · library class  · Sheet

DECLARE-HELP MISSES (min · asked for · answered)
     2 · readOnly · 'readOnly' is not a Declare name — the HTML instinct: a value to read and select but not change is a Text with 'selectable = true' (a TextInput is for editing);

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
