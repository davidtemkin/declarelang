# 7GUIs run 4: Opus 5.5, Declare, on the local tree, standard

The first 7GUIs run at `standard` (runs 2–3 had the bare prompt, so the comparison is across
levels), on the global-names tree with the settle's rounds and the fixes since Venue 37.
**13.9 min, 86 turns, 70k output tokens** (24k thinking). Audited, and the hidden drive run as
a guard. Timing record: `evals/timings/2026-11-15-7guis-run4-local.txt`.

> **Rescored 2026-11-16 on the fixed drive: 8 of 8** (`drive-results-rescored.json`). The
> `circles_history` failure below was the drive's: its radius scan took the modal window's dimmed
> backdrop for the circle. It now reads the background from the same picture, and the circle,
> only partly under the window, follows the slider live (20.5 → 34.5) and keeps the size after
> Done; undo and redo pass. The window still covers part of the circle (the drive's note).


> **Corrected in the fix round (2026-11-15):** with the drive's two bugs fixed — its clipped
> screenshots resized the page and dropped the hover (`captureBeyondViewport: false` now), and its
> CRUD list read a sidebar subtitle as a person — this app passes **7 of 8**. Circle selection
> passes: the hover rule worked all along. The one failure left, `circles_history`, is the app's
> own layout: the modal Adjust window covers the circle, so the drive (like a person) can't see it
> change; the diameter follows the slider exactly underneath (20 → 68 over the drag, measured).
> Findings 1–3 below are superseded by this.

## 1. The comparison

| | 1 | 2 | 3 (bare) | **4 (standard)** |
|---|---|---|---|---|
| total | 15.0 | 16.9 | 13.2 | **13.9 min** |
| turns | 105 | 100 | 88 | 86 |
| output tokens (thinking) | 72k (27k) | 78k (31k) | 66k (22k) | 70k (24k) |
| reading · writing · checking | 4.7 · 2.7 · 7.6 | 5.2 · 2.8 · 8.9 | 2.5 · 0.7 · 10.0 | 3.6 · 3.7 · 6.6 |
| verify calls · help · images | 13 · 6 · 17 | 22 · 8 · 15 | 9 · 10 · 13 | 17 · 8 · 19 |
| hidden drive | – | 7/8 | 6/8 | **5/8** (two of the three failures are not the app's; below) |

- **In line with every earlier run.** The `standard` level added little: the agent wrote three
  scripts (`simple`, `crud-circles`, `cells`) and looked at every task.
- **Code:** 963 lines of Declare in 8 files plus `formula.ts` (255 lines), 655 lines of Declare
  by `idiom.py`. **Download:** 193 KB gzip as a production build.
- **Names:** one miss (`readOnly` on TextInput, answered by its hint), one collision (`Sheet`, a
  library class — the third Cells build in a row to take it), `declare-help Tabs` → TabBar.

## 2. The hidden drive, and findings for the platform

**Drive: 5 of 8** (counter, temperature, flight, timer, cells pass).

1. **CRUD failed on the drive, not the app.** The drive gathers every accessible item whose name
   looks like "Surname, Name" (`evals/apps/7guis/drive.mjs:665`), and the sidebar's subtitle
   "Seven tasks, one program" matched. The list itself showed exactly the three people.
   **Harness fix:** look for the items inside the list or grid, not anywhere on the page.
2. **Circle selection failed — the hover-routing edge Presentify 13 found.** The app selects
   "the circle under the pointer" while `canvas.hovered` (circles.declare:178). `hovered` is the
   topmost view under the pointer; over a circle that is the circle, never the canvas, so nothing
   is ever selected by hovering and the drive saw no grey. The agent tested with press/release
   pairs, which pass (account, f). Second run in a row this edge costs a correct-looking program.
   **To decide** with Presentify 13's finding 6: `hovered` on a view whose descendant is under the
   pointer (as presses bubble), or a separate `pointerInside`.
3. **The diameter slider moved the circle only 41 → 43 for a drag 40 → 68.** The `Slider` is
   controlled (`value = { adjusted?.d }`) and commits each move into the dataset
   (`drawing.preview`), inside a `Dialog`. `Slider.commit` is documented to run at every move. To
   reproduce: a controlled slider whose commit round-trips through a dataset may be restarting or
   losing its drag. **Possible platform bug.**
4. **Cells' change propagation is written by hand — the second run in a row.** A `readers` index
   and a Kahn-ordered recompute (cells.declare:58–110) beside a language whose core is
   propagation. Run 3's account asked for "one guide example of a formula cell whose
   dependencies are only known at run time"; this run's agent felt Cells "slightly recursive".
   **For the fix round:** settle whether a cell's value can be a constraint over the cells it
   reads (dependencies known only when its formula is parsed), and teach it once — or say why not.
5. **A layout finding fires on the library's own Menu** — "kinds._panel.body scrolls on y, but its
   height comes from what it holds" — for a two-item Menu and a one-item ContextMenu. Second run
   in a row (Presentify 13 too). Menu or the check is wrong; a finding on `_panel` internals the
   program can't touch is noise.
6. **`drive.wheel(path, dy, dx)` scrolled only x** for `(900, 700)` and logged "by (700, 900)".
   The driver's two-axis wheel looks wrong (argument order in the log at least).
7. **`raise()` reorders path indices** (paint order), so `body.1.2` named another cell after an
   edit raised one. verify.md should say indices count paint order.
8. **Smaller, repeated:** schema optionals arrive in script as `T | null | undefined` (third
   account to ask for the sentence in §7 or guide 15); held time versus Playwright's 5 s retry
   (the settleMotion note handled it); no per-axis `ignoreScroll` for headers pinned on one axis
   (the agent synced strips by hand — DataGrid's way may exist; to check).

The branch's new rules: none fired.

## 3. Is it idiomatic Declare?

| | Run 4 |
|---|---|
| code | 655 lines Declare, 213 lines TS |
| bytes | 42 KB |
| lines over 150 characters | 1 |
| colour literals outside theme declarations | 1 (`0x9AA3AD`, the selected circle) |
| theme reads | 37 |
| States | 2 |
| visible switches | 7 (one per task) |
| browser scripts · page lookups | 0 · 0 |

**What it gets right.** The best-shaped 7GUIs build so far.
- **Timer:** `running = { classroot.visible && classroot.elapsed < classroot.duration }` — restart
  on raising the duration and on Reset fall out of the gate (timer.declare:16).
- **Flight Booker:** every rule a named derived boolean; the red outline from `validate` +
  `judged = true`; `Field` for the label and the sentence.
- **Temperature:** two strings, each `commit` writing its own and, when it parses, the other — no
  loop to break.
- **CRUD:** `People extends Dataset` makes every write; `shown` is a derived dataset of People's
  own records; the selection counts only while visible.
- **Circle Drawer:** history in a dataset class; `Dialog.closed()` makes one step however the
  window closes; circles clipped to their outline.
- **The tasks stay built** (`visible`, not `exists`), on purpose, so switching keeps what was typed
  — the header says so, which accounts for the seven visible switches.

**Missteps.**
- **Cells' propagation by hand** (finding 4).
- **Hover selection over children** (finding 2) — the program's code reads right; the platform's
  `hovered` defeats it.
- **`Table.commit(sel: object)` with a cast** to `Person[]` (crud.declare:91): the selection's type
  is the rows' schema; to check whether Table can type it.
- **`readers: Map` mutated in place** on a dataset class: bookkeeping no view reads; the agent
  asked whether that's idiomatic. It is a fair use, but nothing says so.
- **Drawing.settle()** — a method named for the platform's word, as Venue 37's `Hall.settle()`.

## 4. Names

**Misses:** `readOnly` (CSS/HTML; the hint answered "a Text with selectable = true").
**Collisions:** `Sheet` (library class). **Lookups that missed:** `Tabs` → TabBar.

## 5. The agent's account

Asked after the build by resuming the session read-only; 13k output tokens, 299k cache reads.

# Building 7GUIs in Declare: an account for the people who make it

First, a correction to my hand-over. The dev server I started has since exited with code 1, after I had confirmed the app loaded at `http://127.0.0.1:8600/…` with a 200. That address may not answer now; `npm start` from `declarelang/` brings it back. As you asked, I've changed nothing.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `skill/SKILL.md` and `AGENTS.md`.
2. The skill's required reading, each file whole:
   - `docs/declare.md` (943 lines)
   - guide chapters 01, 04, 05 and 06
   - `apps/todo/todo.declare` and `todo-parts.declare` (about 1,360 lines together)
3. Reference lookups with `npx declare-help` for the classes I expected to need: TextInput, Slider, RadioGroup, Segmented, DatePicker, Window, Dialog, ContextMenu, ProgressBar, Table, TabBar, Gauge, Field, Stroke, ClipPath, and members such as `View.onPointerMove`, `App.pointerX`, `View.scrolls`, `View.ignoreScroll`, `Floating.closed`, `Time.running` and `ValueControl.validate`.
4. More guide chapters, read whole or in large parts because a task needed them:
   - 08 Controls, whole
   - 18 Overlays, whole
   - 17 Your own views, whole
   - 09 Pointer and keyboard, roughly lines 60–390
   - 16 Collections, from Virtualization onwards
   - 22 Time, the first part
   - 07 Scrolling, the panes and fixed-headers sections
5. `docs/operational/verify.md`, whole, before writing any assert script.

**What I skipped, and why.**
- I didn't read `tracker.declare`, `calendar.declare` or `desktop.declare`. The skill says to read programs "by their parts", and the to-do app plus the guide examples covered my shapes.
- In hindsight, the tracker (a Table with app-owned selection) and the desktop (windows) were the nearest models for CRUD and the Circle Drawer's window. Both came out fine without them.
- I skipped chapters 10–15, 19–21 and 23–31. Nothing in 7GUIs needed touch, media, URLs beyond `location`, motion or packaging.
- I didn't read `library/` source, except one grep of `library/textinput.declare` for how errors are drawn.

**What taught me the most.**
- *declare.md §5* (constraints, and the set-versus-declare table) and *§11's value pattern*. Every control I wrote follows the "derive down, deliver up through `commit`" shape, and it was right first time in every case.
- *17-your-own-views § Custom drawing / the chart example*, together with the *drift check in SKILL.md*. Between them they decided how I built the Circle Drawer.
- The **to-do app** taught me idiom more than any rule: `classroot`, `exists` versus `visible`, a dataset class making every write, use-site `press()`.

**What was missing or misleading.**
- **Enum tokens inside `{ }`.** Nothing I read up front said that a choice between two enum tokens must be written as strings (`"end"`, `"semibold"`). §2 says "the vocabulary stops at the brace", which implies it, but I still wrote `textAlign = { … ? end : start }`. The compiler caught it at once (DECLARE4005).
- **Optional schema fields.** I didn't know they arrive in TypeScript as `T | null | undefined`. §7 does say "`km: number | null` is `km?: number`", but I read that as a statement about schema spelling, not as "your script types must accept null."
- **Tool behaviour I learned only by tripping on it.** `verify.md` documents view paths by index, but not that `raise()` changes the order those indices count. I also found nothing on whether one `drive.wheel` call can scroll both axes.

## (b) Expressing what I wanted

**Where the language fit my intent:**
- **Temperature Converter.** Two strings of state; each `commit` writes its own text and, when it parses, the other's. There's no loop to break, because nothing is derived both ways. The editing model ("while an edit is open, the control shows the person's change") meant I didn't fight the field.
- **Flight Booker.** Every rule became a named derived boolean (`startDay`, `backDay`, `backBeforeStart`, `canBook`). The red outline came free from `validate` plus `judged = true`, and the sentence came free from `Field`. This was the best fit of the seven.
- **Timer.**
  ```declare
  clock: Time [ tick = frame, running = { classroot.visible && classroot.elapsed < classroot.duration },
      onTick(dt: number) { classroot.elapsed = Math.min(classroot.duration, classroot.elapsed + dt) } ]
  ```
  "Raising d restarts it" and "Reset restarts it" fall out of the gate as a constraint, with no code for either. This is the purest expression of a 7GUIs task I've seen in any framework.
- **CRUD.** The `People extends Dataset` class makes every write. A derived `shown` dataset holds People's own records. `Table` with `selection = {…}` / `commit(sel)` took the selection. Domain and presentation separated themselves.
- **Circle Drawer.** Undo/redo history went into a dataset class (`Drawing`) with `done` and `undone` arrays. `Dialog.closed()` was exactly "however the window closes, make one step".

**Where I worked around it:**
- The **Cells editing lifecycle**: several hooks stitched together (§g).
- **Headers frozen on one axis each**: hand-synced strips (§g).
- **Nearest-centre selection**: a geometric calculation, which the drift check discourages (§g).
- **Seeding a writable dataset** with 2,600 generated records: `onInit` plus `set` (§g).

## (c) The first time it ran

The first `declare-verify` failed at R1, then R2, then R3 (details in (d)). Once it booted clean, the first `declare-look` screenshot of each task showed nothing broken, but several things that weren't good enough:

- **Flight Booker** had no visible labels on the two date fields and no visible statement of the date format. The placeholder only shows when a field is empty. I saw this in `flight.png`.
- **CRUD's filter** read "Search", the SearchField default, and Create was enabled with both fields empty. Seen in `crud.png`.
- **The Cells editor** cut a formula off at the cell's width (`=SUM(D1:D` in `cells-edit.png`). This was found later, in the mid-flow screenshots.

One problem I found by thinking rather than by running: the Timer's `Time` ran from boot while its task was hidden. A person opening the Timer after 15 seconds would have found it already full. I noticed this while writing the timer assertions and added `classroot.visible` to the gate.

## (d) Every refusal and surprise

| # | What I wrote | What the platform said or did | What I changed | Judgement |
|---|---|---|---|---|
| 1 | `class Sheet extends Dataset [ … ]` | R1: `'Sheet' is a library class — a class of the program can't take its name; rename yours, as 'MySheet' … [DECLARE5000] (cells.declare:44:1)` | Renamed it `Spreadsheet` | My code. A clear, fair message. I didn't know there was a library `Sheet` (the overlay); the reserved library names are a hazard you can only learn by hitting them. |
| 2 | `valueOf(id: string) -> CellValue { … }` on that class | R1: `Sheet.valueOf: 'valueOf' is a member of every object — choose another name [DECLARE2000] (cells.declare:62:5)` | Renamed it `cellValue` | My code; a good catch. |
| 3 | `textAlign = { classroot.isNumber \|\| classroot.isError ? end : start }` and `fontWeight = { classroot.here ? semibold : regular }` | R2: `'end' is one of textAlign's values — bare only as the whole value (textAlign = end); inside { } write it as a string: "end" [DECLARE4005]`, the same for start, semibold and regular | Quoted the four tokens | My code. The docs imply it; the message made the fix mechanical. |
| 4 | `Text [ … text = { "" + (rowIndex + 1) } ]` inside `class TaskLink` | Warning: `Text reads rowIndex, but Text is not replicated — that is its own rowIndex, never the row's … classroot.rowIndex inside a class whose instances are the rows [DECLARE4023] (line 45, col 84)` | Changed it to `classroot.rowIndex` | My code, and the warning saved a silent bug. I had read that built-ins never resolve outward and still did it. |
| 5 | `contents = { ({ rows: classroot.people.withSurnamePrefix(classroot.prefix) }) }` | Lint: `redundant parentheses … [DECLARE1002] (crud.declare:60:65)`, and the same at `cells.declare:155` | Removed the parentheses | Harmless. I copied the `({ … })` habit from the to-do app, which uses it inside method bodies. |
| 6 | In `formula.ts`: `type CellValue = { num?: number; text?: string; error?: string; message?: string }`, and in the Sheet: `cellValue(id) -> CellValue { … return ({ num: c.num, text: c.text, error: c.error, message: c.message }) }`, where `c` is a `SheetCell` with `num?: number` etc. | R3: `Type 'number \| null \| undefined' is not assignable to type 'number \| undefined'. Type 'null' is not assignable … [DECLARE6001] (cells.declare:64:38)`, plus `3 sites on this line` for the strings | Widened the script type to `num?: number \| null` etc. | Docs somewhat unclear. Schema optionals being nullable is reasonable, but the interop with script types deserves a sentence in §7 or chapter 15. |
| 7 | `accessibilityCurrent = { here ? "page" : null }` | R3: `the { } body of 'accessibilityCurrent' computes a null, but 'accessibilityCurrent' is typed AccessibilityCurrent — "no value" is the token "none" here: { on ? "page" : "none" } [DECLARE6001]` | Used `"none"` | My code; an excellent message. |
| 8 | Script: `await book.click(); await expect(page.getByRole("dialog")).toContainText("You have booked a one-way flight on 14.11.2026.");` | R5: `got no element (after 5 s) — motion is still in flight on the program's clock, which the script holds (Spring on openT of app.main.stage.flight.booked); … let it land first (drive.settleMotion())` | Added `drive.settleMotion()` after each opening click | My script. The message diagnosed held time exactly. Note that Playwright's 5 s auto-retry can never succeed under held time; a newcomer will hit this every time. |
| 9 | `page.getByLabel("Name")` | R5: `matches 2 elements … app.main.stage.crud.body.fields.0.2 (TextInput) … fields.1.2 (TextInput)` | Added `{ exact: true }` | My script; "Surname" contains "name". Fine. |
| 10 | `await drive.wheel(body, 900, 700);` (documented as `wheel(path, dy, dx?)`) | My own assertion failed: `body should scroll both ways: 700, 0`. The step log said `wheel … by (700, 900)`, and `scrollX` came back 700 with `scrollY` 0 | Two calls: `wheel(body, 900)` then `wheel(body, 0, 700)` | **Unsure.** Either one two-axis wheel event is reduced to its dominant axis by the browser or the driver, or the y part was lost. The log printing `(700, 900)` (x first?) for a call written `(900, 700)` (dy first) made me doubt the argument order. Worth a look. |
| 11 | In the cell editor: `onInit() { parent.raise(); afterSettle(() => Focus.focus(this)) }`; in the script, `const cellPath = (col, row) => \`${body}.${row}.${col}\``, then `drive.dblclick(cellPath(2, 1))` after B1 had been edited | R5: `page.getByRole("textbox", { name: "Formula of C1" }) found nothing within 5 s`. Probing with `--read body.1.1.x` (168) and `body.1.2.x` (252) showed the cells hadn't moved. My reading, which I didn't confirm: the raised B1 now came last in child order, so index 2 named D1 | Addressed cells by accessible name: `page.getByRole("gridcell", { name: /^C1(,\|$)/ })` | Platform behaviour that's surprising rather than wrong: a path index counts paint order while the layout places by flow. The verify doc's "a replicated row by its index among the views" should warn that `raise()` reorders those indices. |
| 12 | Nothing of mine: the library `Menu` behind the flight-type pop-up button, and the library `ContextMenu` in the Circle Drawer | Layout finding: `app.main.stage.flight.kinds._panel.body scrolls on y, but its height comes from what it holds, so it has nothing to scroll: it grows, and the page scrolls instead. Give it room …` (and the same for `circles.menu._panel.body`) | Nothing. Both menus render and work in screenshots and scripts | **The platform looks wrong**: either the library menu or the checker. A finding about `_panel` internals that the program can't act on is noise. |
| 13 | Rung 4 boot | `note not built at boot, so not checked here: CircleMark, CellBox` | Covered both by the R5 scripts; the final runs reported them checked | Useful, and honest. |

**Results that weren't what I meant:**
- The truncated cell editor. My design; I widened it to `Math.max(parent.width + 3, 240)` and raised the cell.
- The timer running while hidden. My design.
- Neither was a platform fault.

## (e) Verifying it

- **Rungs 1–4.** Every edit went through `npx declare-verify my-apps/7guis/7guis.declare`. This caught every compile-level mistake in one or two rounds. The messages named their fixes, and I applied them without reading further docs, which is as advertised.
- **R4 at three sizes:** 1280×800 by default, plus `--size 1024x640` and `--size 1440x900`. All clean.
- **`declare-look` pictures** of every task and of the reached states: menu open, invalid dates, booking dialog, selected circle, Adjust diameter window, cell editing, sheet scrolled, CRUD in dark mode, three tasks at 1024×640. `--set app.location=…` and `--call 'app.main.stage.circles.beginAdjust()'` made reaching states cheap. This caught the three design problems in (c). Nothing else would have.
- **Three R5 scripts:** `tests/simple.mjs` (25 steps, 23 expects), `tests/crud-circles.mjs` (54 steps, 29 expects) and `tests/cells.mjs` (83 steps, 10 expects).
  - The counts understate them. Most of the Cells checks are my own `eq()` helper, which throws, and the tool doesn't count those.
  - The Cells script checks `sheet.lastRecomputed` equals `{B1, B4, D1, D4}` with B1 first and D1 before D4. That is my evidence for "only those, not every cell".
  - Held time (`drive.wait(1000)` running exactly a second of the Timer) made the timer assertions deterministic. That's a genuinely strong feature.

**How well the tools served me.** Very well overall. `drive.read`, `drive.set`, view paths and the Playwright locators together covered everything I needed. The friction points were the held-clock-versus-retry trap (#8), index paths shifting under `raise()` (#11), the two-axis wheel (#10), and the library-internal layout finding (#12).

**What I did not run:**
- `--phone` (the brief is desktop-only, and I set `defaultFlags [ devices = desktop ]`)
- `--semantics`, and any Tab-order walk
- dark mode for any task except CRUD
- the R6 visual baselines

## (f) Confidence, part by part

- **Counter, Temperature Converter: high.** Scripted end to end. A tester might argue about the converter rounding to two decimals; the brief doesn't specify.
- **Flight Booker: high.** All rules are scripted. The initial "today" date wasn't asserted as today, only as DD.MM.YYYY and equal across both fields. The flight-type control is a pop-up button rather than a combo box.
- **Timer: high.** Scripted with held time. Two caveats: I raised the duration with the keyboard, not with a mouse drag, so "the gauge follows while dragged" is untested by drag. And if d is lowered below e, the label keeps showing e (above d) while the gauge shows full, which some may read as odd.
- **CRUD: high** for the brief. Keyboard selection inside the Table is untested.
- **Circle Drawer: medium-high.** The flows are scripted, but selection was exercised with press/release pairs at points, not with pure hover. The grey fill is a fixed colour (`0x9AA3AD`), not a theme token, and I didn't look at the Circle Drawer in dark mode. A right-click where the topmost circle and the nearest-centre circle differ opens the menu for the nearest one, by design but untested.
- **Cells: medium.** This is where I'd expect a tester to find problems:
  - **Clicking another cell while editing.** `select()` clears `editing`, which removes the field. Whether the field's `commitOn = "end"` commit runs before it is discarded is **untested**; an edit could be lost.
  - **I bound Tab and Shift+Tab inside the grid** to move between cells. That probably traps keyboard users in the grid, which is an accessibility regression I introduced.
  - **Frozen headers** follow `scrollX`/`scrollY` through a constraint and may trail the body by a frame during a fast scroll. I didn't look frame by frame.
  - **Text in a `SUM`/`PROD` range is skipped, but text referenced directly is `#VALUE!`.** That's a choice a tester might question.

## (g) Gaps I worked around

1. **A read-only text field.**
   - *Wanted:* `TextInput [ readOnly = true ]`.
   - *Tried:* `npx declare-help TextInput.readOnly`, which answered: "a value to read and select but not change is a Text with 'selectable = true'".
   - *Did:* a `View` with a field's stroke and fill around a `TextLabel [ selectable = true ]`, `accessibilityRole = status`.
   - *Judgement:* the platform deliberately lacks it, and the help said so. That's fine, but I had to draw the field look myself.
2. **Headers frozen on one axis each,** for a pane that scrolls both ways.
   - *Wanted:* a sticky column-header row (fixed in y, scrolling in x) and a sticky row-header column.
   - *Looked:* chapter 07 § Fixed headers. `ignoreScroll` pins against both axes.
   - *Did:* strips outside the scroller, clipped, with `x = { -parent.parent.body.scrollX }` and `y = { -parent.parent.body.scrollY }`.
   - *Judgement:* **unsure.** I didn't find a per-axis `ignoreScroll` and didn't read `DataGrid`'s source to see how it pins its header. It may already solve this.
3. **"The circle nearest the pointer that contains it."**
   - *Wanted:* the platform to answer it.
   - *Looked:* 09 § Finding what is under the pointer, `viewAt`, `hovered`. Those answer the *topmost* view, not the nearest centre.
   - *Did:* circles are views clipped to their outline (so clicks inside them never reach the canvas, and they take the context menu), plus a `nearestAt(x, y)` method over the records, fed by the canvas's `onPointerMove`.
   - *Judgement:* the platform reasonably lacks it. This is the spec's own geometric definition, though it brushes against the drift check's "hit-testing by hand".
4. **A bookkeeping index that no view reads.**
   - *Wanted:* non-reactive state on a node: the "who reads whom" map.
   - *Did:* `readers: Map<string, string[]> = { new Map() }`, mutated in place.
   - *Judgement:* **unsure** whether that's idiomatic. §5 forbids script `let`s that change, and I found no statement about mutating an attribute's object in place.
5. **A large writable dataset built by code.**
   - *Wanted:* 100 × 26 blank records, writable.
   - *Did:* derived `contents` holds read-only records, so I wrote `sheet: Spreadsheet { { "rows": [] } }` plus `onInit() { this.set(["rows"], blankSheetRows()) }`.
   - *Judgement:* **unsure.** It works; there may be a cleaner seed.
6. **"Edit ended" for a field, however it ended.**
   - *Wanted:* one hook.
   - *Did:* `commitOn = "end"` + `commit`, `onEnter`, `onBlur`, and an Escape key binding calling `this.cancelEdit()`.
   - *Judgement:* **it's probably there and I missed it.** `ValueControl.editing` exists, so `trackChanges = ["editing"]` with `onChange` might have been the one place.
7. **A small window with a slider.**
   - *Did:* used `Dialog` (modal, with `closed()`) rather than `Window`.
   - *Judgement:* the platform has both. `Window` might be the more literal reading of "small window", but I'd have needed my own close-to-commit wiring.
8. **An editor wider than its cell, painting over neighbours.**
   - *Did:* `parent.raise()`.
   - *Judgement:* that works, but it has the path side effect in (d)#11. `paintsIn` might have been the better tool; I didn't try it.

## (h) Changes of direction

- **Circle hit-testing, before any code.** I first planned circles with `pointerEvents = "none"` and the canvas handling everything. I switched to clipped circle views carrying `onContextMenu` after rereading the drift check and finding (in `View.onPointerMove`'s help) that the canvas still hears moves over children. My own second thoughts.
- **Class and method names,** right at the first verify. `Sheet` became `Spreadsheet` and `valueOf` became `cellValue`, after refusals (d)#1–2.
- **Flight Booker error text,** after the first screenshots. It was a bare `problem: Text` showing `startField.error` or `backField.error`. It became each `TextInput` wrapped in `Field [ label = "Start", labelWidth = 60, … ]` with a format hint line. Driven by what I saw running.
- **CRUD,** after the first screenshots. Added a placeholder ("Start of a surname"), a `blank` guard on Create, and trimming. Seen running.
- **Timer gate,** while writing tests. `running = { e < d }` became `running = { classroot.visible && e < d }`. My own second thoughts, before seeing the problem.
- **Cells editor geometry,** after the mid-flow screenshot. `width = { parent.width + 3 }` became `Math.max(parent.width + 3, 240)` plus `parent.raise()`. Seen running.
- **Cells test addressing,** near the end. Index paths became gridcell-by-name locators, after the R5 failure (d)#11.

## (i) The code, quoted

The formula-level ones are quoted inline in (d). The three I couldn't fully explain:

- **The two-axis wheel (#10).**
  ```js
  await drive.wheel(body, 900, 700);   // body = "app.main.stage.cells.grid.body", scrolls = both
  await drive.settleMotion();
  const sx = await drive.read(`${body}.scrollX`), sy = await drive.read(`${body}.scrollY`);
  ```
  Result: `unexpected error: body should scroll both ways: 700, 0 (after: settleMotion → wheel app.main.stage.cells.grid.body by (700, 900) → settleMotion)`.

  The body view at that moment:
  ```declare
  body: View [ x = { classroot.headW }, y = { classroot.rowH },
      width = { parent.width - classroot.headW }, height = { parent.height - classroot.rowH },
      scrolls = both, focusable = true, … datapath = { classroot.sheet.value },
      layout: SimpleLayout [ axis = y ],
      View [ datapath = :rows[], virtualize = true, accessibilityRole = row,
          layout: SimpleLayout [ axis = x ], CellBox [ datapath = :cells[], … ] ] ]
  ```
- **Path indices after `raise()` (#11).**
  ```declare
  editor: TextInput [ exists = { classroot.editing == :id }, ignoreLayout = true,
      x = -4, y = -1, width = { Math.max(parent.width + 3, 240) }, height = { parent.height + 1 },
      … onInit() { parent.raise(); afterSettle(() => Focus.focus(this)) }, … ]
  ```
  ```js
  const cellPath = (col, row) => `${body}.${row}.${col}`;
  await drive.dblclick(cellPath(1, 1)); /* edit B1, Enter */ 
  await drive.dblclick(cellPath(2, 1));
  await page.getByRole("textbox", { name: "Formula of C1" }).fill("999");
  ```
  Result: `page.getByRole("textbox", { name: "Formula of C1" }) found nothing within 5 s`.
- **The library menu finding (#12).**
  ```declare
  kinds: Menu [ items = { [ ({ id: "oneway", label: "one-way flight", group: "kind", checked: !classroot.isReturn }),
                            ({ id: "return", label: "return flight", group: "kind", checked: classroot.isReturn }) ] },
      picked(id: string) { classroot.kind = id == "return" ? "return" : "oneway" } ],
  Button [ width = 100%, accessibilityLabel = "Flight type", menu = { classroot.kinds },
      label = { classroot.isReturn ? "return flight" : "one-way flight" } ],
  ```
  Opening it reports `app.main.stage.flight.kinds._panel.body scrolls on y, but its height comes from what it holds …`. A one-item `ContextMenu [ items = { [ ({ id: "adjust", label: "Adjust diameter…" }) ] } ]` opened with `showAt(this, e)` reports the same.

I never went round in a circle. Every refusal was fixed in one round.

---

## Overall

**Surprises.**
- How little went wrong. Seven tasks compiled after four fix rounds, and every behavioural script passed on the program's logic first time. Every R5 failure was in my test script, not the app.
- That the flight validation red-outline was free.
- That held time makes timer tests exact.
- That `raise()` reorders paths.

**Good.**
- The diagnostics are the best I've worked with: each one named its rewrite, and several (DECLARE4023, the `accessibilityCurrent` "none" hint, the settleMotion hint) prevented real bugs.
- The value pattern is one rule that holds everywhere.
- Datasets with classes give domain separation for free.
- `Time.running` as a constraint.
- `declare-look --set/--call` for reaching states.
- `declare-help` answering both "what is this" and "this doesn't exist; do this instead".

**Bad.**
- The up-front reading is large: around 3,600 lines before writing a line, and about as much again by the end. It was worth it, but it's the dominant cost.
- Some edges show up only in the tools: index paths, the two-axis wheel, held time versus Playwright retry.
- A layout finding fires on library internals.
- Composite-widget plumbing (frozen headers, the edit lifecycle) is where I was least sure I was writing it "the Declare way".

**The hardest part.** It wasn't one obstacle but a pattern: building a composite widget (Cells) out of primitives where I couldn't tell whether a library mechanism already existed (per-axis pinning, an edit-ended event, painting above siblings). It cost perhaps a quarter of the build's effort, plus my least confident code. What would have made it right first time: a guide section, or a model program, for "a grid of your own": pinned headers on a two-axis scroller, an in-place editor and its lifecycle, an active-cell keyboard model. The `DataGrid` source may be exactly that, and I didn't read it.

**Compared with what I know.** It most resembles **QML** and **OpenLaszlo/Flex MXML** (a declarative tree with bound expressions), with **SwiftUI**'s state-to-view direction and a spreadsheet's dependency model underneath. That last part made Cells feel slightly recursive. Unlike React there is no render: I never thought about re-rendering, keys or memoisation. Unlike SwiftUI, controls own their editing state politely rather than fighting a binding.

**Where I'd most want improvement:**
1. Fix or silence layout findings inside library overlays.
2. Document the `raise()` / path-index interaction, and how to wheel both axes.
3. Write up composite-widget patterns, as above.
4. Add a sentence in §7 about schema optionals arriving as nullable in script types.

**What I'd use it for:** internal tools, dashboards, editors and desktop-style utilities, especially anything with derived state and undo, where its constraint model removes most of the bug surface. I'm less sure about heavy content sites or anything that leans on a large third-party component ecosystem, though `DOMIsland` suggests a path for that.
## 6. The names ledger

```
NAMES — eval-7guis-4: 1 missed name(s), 1 collision(s), 1 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     3 · attribute · readOnly             · TextInput                · CSS                · foreign hint · ×1  ·    3 · resolved
         TextInput has no attribute 'readOnly' — the HTML instinct: a value to read and select but not change is a Text with 'selectable = true' (a TextInput is for editing); 'disabled = true' dims a field and

COLLISIONS (min · held by · name)
     7 · library class  · Sheet

DECLARE-HELP MISSES (min · asked for · answered)
     0 · Tabs · 'Tabs' is not a Declare name — the Declare concept is TabBar:

SUMMARY: 0 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
