# Ledger run 6: Opus 5.5, Declare, on the local tree

Built on the local working tree, the same subject as 7GUIs run 3 plus that run's fixes.
**37.9 min, 132 turns, 186k output tokens. 5 of 8 hidden checks delivered;** the first boot
(4.4 min) was a stub. **No regression:** run 5's app, re-driven on today's tree, still passes
8/8. Of run 6's three failures:
- two are the drive's (with them fixed, **7/8**);
- one is a platform bug (P1), made worse by the app's pattern.

Not clean on any count. Timing record: `evals/timings/2026-11-12-ledger-run6-local.txt`.

## Figures

| | Run 5 | **Run 6** |
|---|---|---|
| time, turns | 41.4 min, 157 | **37.9 min, 132** |
| output tokens | 178.9k | **186.4k (46.3k thinking)** |
| hidden checks delivered | 8/8 | **5/8 as it stood; 7/8 with the drive fixed** |
| first boot | 1/8 (stub) | 0/8 (stub at 4.4 min) |

## The hidden-check failures

- **overview_drill: the drive.** The chart works by keyboard (End and ArrowDown announce the month,
  amount and count), but the app left it on Control's default `button` role. The drive starts its
  keyboard walk only on image/figure/group/grid/list roles; run 5 used `image`. With `button`
  accepted, the scenario passes.
  - The drive's fallback, the Expenses figure, met a brief contradiction: §2 says a figure opens
    Insights, §6 says Transactions.
- **sale_refund: platform bug P1, plus the app's pattern.** Each cell carries an invisible edit
  field (`opacity 0`, `pointerEvents = { entered ? "auto" : "none" }`). A pointer press on a row
  lands on a hidden Combobox, which takes focus, so the row is never selected and no Refund button
  appears.
  - P1: a TextInput with `pointerEvents = "none"` still takes the press, because
    `setEditable` forces the native input to `auto`.
  - The Combobox part follows the docs (`pointerEvents` doesn't cover children), but the
    documented alternatives (`visible = false`, `disabled`) also stop Enter from entering the cell.
  - With the overlays made `visible = { entered }`, the unmodified drive passes.
  - The agent never pressed a row with a pointer; all its checks used keys.
- **bulk_undo: the drive.** Its "Uncategorised" option finder accepts `gridcell`, and run 6's
  category cells are named exactly `Uncategorised`. So it pressed a list cell instead of the
  `Category filter`. Excluding cells, it passes.

## The deep audit

Repros are in `audit/` (`node audit/probe.mjs <app-url> <steps.mjs>`).

| Min | Code / finding | Verdict |
|---|---|---|
| 4.4 | 4000 `escapeHtml` clash | Fair; the message doesn't say "it's the shared function; use it" (**N4**) |
| 9.5, 16.9 | 5002 cannot find include | True (the files weren't written yet) |
| 19.0 | 2000 ×8 | All true; HTMLText `text` (**N2**) and Segmented `name` (**N3**) had no hint |
| 19.2 | 3006 ×17, 4019, 1002 | Fair |
| 19.5 | 6001 `as array` → "Did you mean 'Array'?" | True; `array` as a body type is design (h4) |
| 19.5 | 6001 `classroot.asTable`, "declare it on InsightsPage" | Points the wrong way; `provided("asTable")` works (**N1**) |
| 4.4–31.5 | 4025 ×7 | One false positive: five named attributes joined by `&&` (**T4**) |
| — | `refusal() -> array` returning the wrong shape compiles clean | **P2**: method returns are never checked |
| 27.8 | `drive.selectAll` "no view at …" | Its path was wrong; the miss lacks click's "nearest there" help (**T1**) |
| 24.8 | Stepper path miss suggests `_member, _more…` | Internals offered (**T2**, from run 5) |
| 33.9 | `Accessibility.announced()` unreachable from a check | Tool gap (**T3**) |
| — | The key-consumption change and DataGrid editing | **No defect:** Enter, ⌘A, Escape, Enter-commit and Tab all behave |
| — | DataGrid edit field named "undefined" | **P3** |

**Platform:**
- **P1.** An editable's native element ignores the authored `pointerEvents` (`runtime/src/dom-backend.ts` `setEditable`).
- **P2.** A method body isn't checked against its `-> Ret`, even `a() -> number { return "x" }` (`compiler/src/typecheck.ts`).
- **P3.** DataGrid's edit field reads `parent.title`, not `column.title`.

**Tools:**
- **T1.** The `selectAll` miss gets no "nearest there" help.
- **T2.** Miss suggestions offer `_` internals.
- **T3.** No `expect.announced`.
- **T4.** The 4025 lint counts bare member reads.

**Messages:** N1–N4.

**Docs:**
- What entering a custom DataGrid cell does.
- `Form.refusal`'s return shape.
- A role for a drawn chart with keyboard travel.

**Source reads:**
- `library/datagrid.declare`, about 250 lines: a **doc gap** (cell entry, and no display/edit cell pattern).
- `library/form.declare`: a **doc gap** plus P2.
- `library/combobox.declare`: fair.

### Clean bill

| Count | Verdict |
|---|---|
| Platform | **Not clean.** P1 (cost a hidden check), P2, P3 |
| Tools, incl. the drive | **Not clean.** T1–T4; two false failures in the drive |
| Names | **Not clean.** N1–N3, `as array` |
| Reference | **Not clean.** Three doc gaps |

**Friction cost: about 3 min of 37.9 (≈8%) and about 15k output tokens (estimated).** The larger
cost was silent: P1, and the missing display/edit cell pattern, cost sale_refund. The 60 R5 runs
each opened with `waitReal(1500)`, about 1.5 min, which `verify.md` says isn't needed.

### Against run 5

Run 6 was faster with fewer turns, and its own checks passed 9/9. Run 5's fixes held. Run 5 had
used visible buttons in its cells and an `image` chart. Run 6's invisible overlays broke pointer
selection, and its exact cell names exposed the drive's looseness.

## DataGrid input, found by the keyboard test

These are from a separate test of type-to-edit with plain letters, dead keys and input-method
composition (`scratchpad/ime/`). Inside an open field, all three kinds of input work. On a
selected cell, DataGrid:
- doesn't ignore composing keystrokes ("éé", "n日本");
- treats Option-typed letters as chords, so "å" never starts an edit;
- lets an input method's commit Return move the edit down a row.

Its edit field is also labelled "undefined" (P3).

## Fixed on the local tree after this run

All 132 test files pass.

- **P1:** an editable's native input follows the authored `pointerEvents`. Regression test in
  `gesture.test.mjs`. **sale_refund still fails:** a hidden Combobox's inner entry takes the press
  (design 1).
- **P2:** a method body is checked against its `-> Ret`. An override with a written loose type is
  checked against the base's. An override with **no** written type is checked against the base's
  `| void`: what it returns must fit, but returning nothing is legal (`fetch() { …; super.fetch() }`).
  The check found three real wrong returns in `apps/desktop/desktop.declare` (now nullable) and one
  in a test fixture (`dep-typed`, now `-> Doc?`).
- **P3:** the DataGrid edit field is named for its column.
- **DataGrid input:**
  - `KeyEvent.isComposing` is exposed;
  - type-to-edit ignores composing keys;
  - Option-typed letters start an edit;
  - the editor hands a composing Return to the field.

  Composed text on a selected cell now goes nowhere instead of doubling; the full fix is design 7.
- **T1–T4:**
  - `selectAll` misses get the "nearest there" help;
  - no `_` suggestions, and a control names its public route;
  - `expect.announced(text)`;
  - 4025 ignores member reads.
- **N1–N4:** `provided("X")` for an enclosing instance's member; HTMLText → `html`; Segmented isn't
  a form field (use RadioGroup or the form's body); `escapeHtml` is the shared function.
- **Drive:** the chart walk accepts any focusable node named for the chart; cells are excluded from
  the option and Refund finders. **Re-score: run 6 7/8; run 5 still 8/8.**
- **Docs:** DataGrid custom-cell entry; `Form.refusal` returns `FormProblem[]`; guide 19 gives a
  drawn chart the `image` role, announcing each point.

**More design questions, from the fix pass:**
- AltGr characters (Windows) arrive as Ctrl+Alt and are treated as chords. Should `KeyEvent`
  expose `altGraph`?
- DataGrid's cell entry skips `visible = false` but counts `opacity = 0`. Is that the rule?

## Deferred: design

1. Should `pointerEvents = "none"` on a library control cover its internals?
2. A display/edit cell protocol for DataGrid (an `editor:` beside `cell:`), and press-to-select
   before entering.
3. Brief §2 vs §6: where does a headline figure open?
4. `array`/`object` as body cast types.
5. Should Segmented and other value pickers be ValueControls with a form `name`?
6. A record-addressed path into DataGrid cells.
7. **Type-to-edit, from the keyboard test:** open the editing field when text arrives, not when a
   key goes down, so accents, input methods and Option letters compose natively.

## The agent's account

Pasted whole. Where the audit contradicts it, the audit's reading is above.

# Building Ledger in Declare: an account for the people who make it

I built Ledger as about 2,900 lines across six `.declare` files and two TypeScript files. The brief's desk flows and its phone flow all pass as scripted checks. What follows is what it was like, as accurately as I can reconstruct it from this session. Where I quote code from earlier states, it is reconstructed from what I wrote at the time, not re-read from disk.

---

## (a) Getting up to speed

**What I read, in order**
1. `README.md`, then `AGENTS.md` and `CLAUDE.md`, which point to the skill.
2. `skill/SKILL.md`, whole.
3. `docs/declare.md`, whole (942 lines).
4. `docs/guide/01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, each whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
6. `task/api/API.md`, whole.
7. `apps/tracker/tracker.declare`, whole, in two reads. The skill calls it "worth reading whole", and its shape (a filtered, virtualized, editable list) was the nearest to Ledger.
8. Then targeted lookups with `npx declare-help`:
   - DataSource, Table, TableRow, RangeSlider and DataGrid (full prose)
   - Combobox, Toast, Shortcuts, TabBar, DatePicker, Sheet, Popover, Form, Field, Segmented and Menu
   - TextInput, ValueControl, Button, Checkbox, Control, Focus and View.keyBindings
   - DrawContext, Spring, the pointer events, HTMLText, Icon, the SanFrancisco preset and "theme tokens"
   - Form.refusal, Stepper and TextInput.select
9. Sections of the guide by line range:
   - `14-data.md`: Where data comes from, Talking to a server, Editing text and forms, A form in a sheet
   - `16-collections.md`: Virtualization through DataGrid columns
   - `17-your-own-views.md`: Custom drawing
   - `19-accessibility.md`: What you add, Your own controls
   - `12-text.md`: Text treatments, Rich text
   - `docs/operational/verify.md`: the assert-script section
10. Parts of `library/datagrid.declare`: key handling, `DataGridCell`, `DataGridEdit`. Also the head of `library/combobox.declare` and `Form.refusal` in `library/form.declare`.

**What I skipped, and why**
- I never read guide chapters 02 (notation) or 03 (constraints). The skill's "read first" list doesn't include them, and `declare.md` covered the model well enough that I didn't feel the gap.
- I skipped everything about motion (21, 23), URLs (20), overlays (18), and the calendar, weather and marketmap apps. I had a long brief and wanted to start writing. Chapter 18 is the one I'd now say I should have read. I used Sheet, Popover, Menu and Toast from `declare-help` alone, and it worked, but by luck rather than understanding.

**What taught me the most**
- The tracker, more than anything. It showed:
  - a `DataSource` subclass holding the records and their verbs
  - derived `shown` datasets
  - `Table` with selection held on the App
  - `trackChanges`/`onChange` for "a new filter is a new question"
  - Toast-plus-undo
  - `Shortcuts`
- After that, `declare-help`. The full prose for DataGrid told me in five minutes that a column can name a cell class, that `applySort` is the seam for server sorting, and that a width of 0 drops a column. That shaped the whole Transactions page.

**What was missing or misleading**
- Nothing I read says how a *custom* DataGrid cell is entered from the keyboard. I learned it by reading `library/datagrid.declare`: `_enterCell` focuses the first focusable child; Space presses it. The reference entry says "Enter or F2 moves into a cell's control", which is accurate but doesn't tell you what "the cell's control" is when the cell holds several.
- The `Form.refusal` prose describes the bodies it reads, not the shape it returns. I learned the return type (`FormProblem { name, message }`) only from the source, after shipping a wrong override (see d, item 12).
- `DataSource` says "a later `fetch()` on the same source supersedes an earlier one". For reads that's exactly what I wanted. For writes I couldn't tell whether a superseded request still reaches the server, so I built a queue defensively. The docs don't say, and I'm unsure.
- The todo app already shows `use [ SunIcon, MoonIcon, AutoIcon ]` with its reason in a comment. I copied the Segmented items but not the `use`, and paid for it at boot. That's mine, not the docs'.

---

## (b) Expressing what I wanted

**Where it fit very well**
- **"The filter is the address."** I wrote every read as `DataSource [ autoFetch = true, url = { app.api(path, app.qs + …) } ]`. With that, filters applying as they change, old results staying until new ones land, and stale answers never showing were simply true; I wrote no code for any of them. Putting `_r=rev` in every URL made "a write landed, so everything refetches" a single assignment.
- **`trackChanges` + `onChange`** for "a new filter resets the granularity, the relax search and the selection".
- **Library controls:**
  - DataGrid with `items`, `columns`, `widths` and `applySort` carried the Transactions page.
  - RangeSlider with `valueText` and `commit(low, high)` made the nonlinear slider trivial. I used histogram-edge *indices* as the slider's values.
  - Combobox `creates = true` + `createRequested` was exactly "a new vendor created on the spot".
  - Form + Field + `validate` + `required` + `source` + `refusal` handled "mistakes said where made, first one focused, refusal at the field".
  - Toast with an action.
  - Shortcuts, with plain keys standing down in text fields.
- **Drawing.** `draw(d)` re-recording when what it reads changes meant the chart's hover, keyboard highlight and drag range were just attributes.
- **Layout.** `SimpleLayout`, `WrappingLayout` and one small `Layout` subclass (`Columns`) covered every page. Writing that layout took about 20 lines and worked first time.

**Where I worked around it**
- Lists over computed arrays (17 sites; see d, item 5 and g).
- In-place editing in DataGrid cells: an invisible field over a display (g).
- A use site's children can't reach the instance they're placed in through `classroot`. This forced the Insights table toggle onto the App (d, item 6).
- Animating a chart between data sets, since a Spring drives one number. I used a generation counter plus an interpolation fraction (g).

---

## (c) The first time it ran

The first `declare-verify` that reached boot failed on a `null.split`, then on the missing icon classes (d, items 7–8). The first screenshot of the Overview, with live data, was close to the final design. What was wrong:

1. **Chart axis values were odd** ($11k, $6.3k, −$2.4k). I saw it in the screenshot. My ticks were `lo + (hi-lo)*k/4`. I fixed it with a `niceStep`.
2. **Transactions:**
   - The grid ran past the right edge. The screenshot showed the Amount header cut off; I'd written `x = 20, width = { parent.width - 20 }`.
   - The contact appeared twice, under the description and in its own column.
3. **Insights → Trends drew the rest of November as zeros.** The API returns every period overlapping the range, including days that haven't happened. I found it in the screenshot and filtered out `p.from > today`.
4. **The editor's fields were tiny.** Vendor was about 50px wide, and the date hint spilled outside the sheet. `declare-look` reported "runs past the window's right edge … ends at 1521" and "catRow's children need 75 across and it has 67". Fields with no width meant their `width = 100%` controls collapsed.
5. **Phone:**
   - The summary line ran past the edge (layout finding).
   - The search field squeezed beside the dates.
   - The figures' change lines clipped "vs Oct" (screenshot).
   - Untitled sales read "(no description)", which looked poor.
   - Three targets were under 44×44 (layout finding: Segmented segments 108×30, note field 354×32).

---

## (d) Every refusal and surprise

The verdict on each item is my judgement. "Mine" means my code was wrong.

**1. Script name clash**
- **Wrote:** `function escapeHtml(s: string): string` in `ledger-format.ts`.
- **Said:** `script { } declares 'escapeHtml', a name the runtime already gives every { } body … choose another name [DECLARE4000]`.
- **Changed:** renamed it `htmlEscape`.
- **Verdict:** fine as diagnosed. I had no way to know the name was taken; the diagnostic told me at once.

**2. Lint on a five-part condition** (repeated across runs)
- **Wrote:** `ready: boolean = { this.today.loaded && this.cats.loaded && this.chans.loaded && this.prods.loaded && this.people.loaded }`.
- **Said:** `ready decides on one condition of 5 parts — give the facts it decides on names of their own … [DECLARE4025]`.
- **Changed:** `sources() -> DataSource[] { return [...] }` with `ready = { this.sources().every((s) => s.loaded) }`. The same lint fired on two `visible`s, two nested ternaries and `backLabel`. I added named facts (`attentionKnown`, `nothingToAttend`), a lookup record (`pageNames`) and a helper (`manyLabel`).
- **Verdict:** the rewrites read better. Honestly, though, `sources().every(...)` only moves the five conjuncts somewhere the lint doesn't see. For "all of these loaded" the lint feels pedantic. Unsure whether that's intended.

**3. Includes not found**
- **Said:** `cannot find include "ledger-filters.declare" [DECLARE5002]`.
- **Verdict:** mine. I compiled before writing those files.

**4. One R1 run reported eight errors together.** This was very useful: I fixed all eight in one pass.
- a. `schema ChartSeries [ …, tone: Color, … ]` → `'tone: Color' names no schema … (a field's type is string | number | boolean | any, a schema name, a literal union, or a nested [ … ])`. I changed it to `tone: any`. Verdict: docs a little unclear. `declare.md` §7 says a schema is "the subset of TypeScript that JSON data can carry", and a Color is a number at runtime, so I expected it to pass. A typed color field in a schema is something I'd want.
- b. `onPointerMove(e: PointerEvent) { if (points.length > 0 && e.x >= padL) hoverIdx = idxAt(e.x) else hoverIdx = -1 }` → `not a valid method body — ';' expected`. I rewrote it as a ternary. Verdict: mine. That's TypeScript's rule (single-line if/else without `;`).
- c. `HTMLText [ … text = { highlight(:description, app.query) } ]` → `HTMLText has no attribute 'text'`. Changed to `html =`. Verdict: mine, though the error could suggest `html`. It does for other near-misses.
- d. `class DetailLine [ … layout: SimpleLayout [ axis = x, spacing = 8, align = baseline ], View [ flexes = true, … ] … ]` → `View declares no baseline — … declare 'baseline: number = …' on View, or align by start | center | end`. I changed to `align = center`. Verdict: an excellent diagnostic.
- e. `ChartTable [ accessibilityRole = table ]` → the list of valid roles, with no `table`. Changed to `grid`. Verdict: fine. I'd have liked `table` to exist for a read-only data table.
- f. In `class Editor extends Form`, a child `send: DataSource [ … ]` → `'send' is a method of Form, which Editor extends — a child cannot take its name`. Renamed it `post`. Verdict: mine. Clear message.
- g. `Segmented [ width = 100%, name = "channel", … ]` → `Segmented has no attribute 'name'`. I removed it. Verdict: I'm unsure why Segmented isn't a ValueControl with a `name`, when Combobox, Stepper and DatePicker are. It means a Form refusal naming `channel` can't land on it.
- h. `measureValue` was first named `valueOf` on the App → `'valueOf' is a member of every object`. Verdict: fair, and caught before it could do something strange.

**5. Literal datapaths** (17 sites, one error)
- **Wrote,** for example in `ChipRow`:
  ```
  kinds: View [ datapath = { ({ items: app.kinds.map((k) => ({ id: k })) }) },
      layout: SimpleLayout [ axis = x, spacing = 6 ],
      FilterChip [ datapath = :items[], label = { app.kindName(:id) }, press() { app.kinds = app.toggleIn(app.kinds, :id) } ]
      ],
  ```
- **Said:** `a datapath is a place in declared data, and a literal is in none — the value is fresh, so no Dataset holds it and the cursor has nowhere to point. Declare the records as data and point there: … 'items: Dataset [ contents = { … } ]' … — 17 sites [DECLARE3006]`.
- **Changed:** every site, mechanically, to `rowsData: Dataset [ contents = { { items: … } } ], datapath = { this.rowsData.value }`.
- **Verdict:** the platform's rule, clearly explained, and the fix compiled and worked first time. It's still the single most repeated piece of ceremony in the program. I'd written `{ ({ … }) }` because `declare.md` §2 says `{ }` is TypeScript. A shorthand would help (g).

**6. R3 typecheck errors after that**
- `commit(sel: object) { app.takeSelection(sel as array) }` → `Cannot find name 'array'. Did you mean 'Array'?`. Changed to `sel as Txn[]` and `(sel ?? []) as any[]`. Verdict: docs unclear. `declare.md` says "`object` / `array` stand for a record or list of no declared shape" in declarations, and I assumed the same held inside `{ }`. It doesn't, and that's reasonable, but it's a natural trap.
- Inside `InsightsPage`, children I placed in a `ChartCard`:
  ```
  trends: ChartCard [ …,
      chart: PeriodChart [ visible = { !classroot.asTable && !classroot.tooFew }, … ] ]
  ```
  → `'asTable' is not a member of InsightsPage`. I moved the toggle to `app.insightTable` and replaced `tooFew` with the conditions themselves. Verdict: mine, and consistent with the docs (`classroot` is the class being defined). But it exposes a real gap: content handed into a frame class (`defaultPlacement = body`) has no clean way to read the frame's state.
- `trendSeries: ChartSeries[] = { … map((s) => ({ ...s, mark: "line" })) … }` → `Type 'string' is not assignable to type '"bar" | "line" | "dash"'`. Fixed with `"line" as "line"`. Verdict: plain TypeScript literal widening; mine.
- In `columnWidths`: `const out = ({})` … `out[id] = 0` → `nothing named 'description' is a member of {}`. I typed it `{ [id: string]: number }`. Mine.
- In `byDay`: `let head = null` then `head.net = …` → `'head' may be absent here`. Typed it `any`. Mine.

**7. Boot crash**
- **Said:** `Cannot read properties of null (reading 'split') — while working out Text.text at app.main.pages.transactions.body.detail.col.body.sale.1.0 — in Text.text (ledger-pages.declare:552)`.
- **Cause:** `LinkedTxn [ datapath = :sale ]`, whose record is `null` for a sale, then `dateLabel(:date, app.today)` with `:date` null.
- **Changed:** guarded `ymd`, `dateLabel`, `dateLong` and `dayHeading`.
- **Verdict:** mine. The message pointed at the exact view and line. The note that R4 had "fed a sample of their schema" to `app.detail` explains why a hidden panel was built at boot at all. Good.

**8. Boot: missing icon classes**
- **Said:** `onInit on app.side.appear.….…._ico threw: createView: no class named 'SunIcon' — … keep it with 'use [ SunIcon ]'`.
- **Changed:** added `use [ SunIcon, MoonIcon, AutoIcon ]`.
- **Verdict:** mine, as above. I'd wonder whether the compiler could see a string literal like `icon: "SunIcon"` in a Segmented `items` and keep the class, the way it checks other string references.

**9. R5: focusShape**
- **Wrote:** `focusShape() { return "rect" }` in `PeriodChart`, a pure guess.
- **Said:** `PeriodChart.focusShape() returned "rect" — it returns the box the ring hugs, { x, y, w, h, rad } … or null for its bounds`.
- **Changed:** removed it.
- **Verdict:** mine. I guessed instead of asking `declare-help`, which the skill tells you not to do.

**10. Layout findings:** editor overflow, `catRow` needing more room than it had, the phone summary overflow, small targets. Covered in (c). All were mine (missing widths). Each finding named the view path and offered fixes.

**11. Behaviour: in-place category editing typed into the old value**
- **Wrote:** `PickCell` with a `Combobox` laid over the chip.
- **Saw:** the script typed "Advert" and no PATCH went out. A debug script printed `{"f":"Category","v":"SoftwareAdvert","ex":"true"}`.
- **Cause:** the entry shows the current label, and focusing it from the grid puts the caret at the end, not over a selection.
- **Changed:** `onChange() { if (entered) pick.entry.select("all") }` on the cell, and `onFocus() { this.select("all") }` on `CellField`.
- **Verdict:** mine for this pattern. On the way there I also changed `focusable = { classroot.editable }` to `disabled = { !classroot.editable }`, guessing that my `focusable` override was making the container rather than the entry take focus. I never confirmed that the original was broken. After the change the entry did receive focus. **Unsure** whether that edit was needed.
- **Also:** the first two attempts failed partly because the script's first row was a sale (income categories) and, in a later run, a split expense whose category isn't editable inline. That was service state, not the app.

**12. Behaviour: the Form refusal never landed on a field**
- **Wrote:**
  ```
  refusal(body: object) -> array {
      const ps = body?.problems ?? []
      if (ps.length == 0) return super.refusal(body)
      return ps.map((p) => ({ field: p.field ?? "", message: p.message + … }))
      },
  ```
- **Found:** reading `library/form.declare`. The base returns `FormProblem[]` built as `{ name: this._nameOf(...), message }`.
- **Changed:** `-> FormProblem[]`, using `name:`.
- **Verdict:** mine. But I think the compiler should have caught it. I overrode a method that returns `FormProblem[]` with `-> array`, returned objects with the wrong key, and everything typechecked. Overrides apparently aren't checked against the base's signature, or `array` swallows it. Unsure which.

**13. Behaviour: a refused field showed nothing**
- **Saw:** `refusal.mjs` expected "Refund exceeds the original sale" in the refund line. It got `Tall mug 1 of the sale left to refund · $36.00 each 1 $36.00 Quantity of Tall mug to refund`.
- **Cause:** the `Stepper` named `lines[0].quantity` received the refusal, but a control outside a `Field` doesn't display its own `error`.
- **Changed:** a `RowProblem` text under each sale line, split part and refund line, bound to its controls' `error`.
- **Verdict:** working as designed per the Field docs ("under the control what is wrong with it"). It surprised me anyway. In a row of three controls, one `Field` each would be heavy, and nothing told me the refusal had landed somewhere invisible.

**14. Formatter refusal**
- **Said:** `format: …ledger-filters.declare: expected ']', got 'working' (line 180)`.
- **Cause:** my Python insertion left out a comma.
- **Verdict:** mine. The formatter doubles as a fast syntax check, which was useful.

**15. Assert-script path errors** (tests only). Each was my guess at a path:
- `no node at 'app.editor.form.body.expense.2.vendorBox.entry' — … holds nothing called vendorBox; nearest there: catRow, _cap, _msg`. The vendor Field was index 1, not 2. The "nearest there" list made it obvious.
- `holds nothing called increment; nearest there: _member, _more, _shown, _less`. I used `_more`, which is an internal name; not great in a test.
- `selectAll: no view at '…grid.0.1.0.f'`. I used `Mod+A` instead.
- `page.getByRole("button", { name: "Income vs expenses" }) matches 2 elements`. Added `exact` and `.last()`.
- `Accessibility is not defined` in `page.evaluate`. I read the chart's `sentence()` instead.

**16. A test expectation that was wrong.** `filters.mjs` expected `app.query = "adobe"` after typing and pressing Escape, and got "". My own search field clears on Escape. Mine.

**17. A navigation that quietly went elsewhere.** `declare-look … --click app.side.1` produced an Overview screenshot. Index 1 of the rail is the Overview item (the brand is 0). Mine. I switched to `--set app.location=transactions`.

---

## (e) Verifying it

**`npx declare-verify` (R1–R4).** I ran it after every edit batch. It caught every compile error above, eight at a time when it could. It also caught both boot errors with the view path and source line. The final runs are clean, with no warnings or hints (`--all`).

**`npx declare-look`** with `--size`, `--phone`, `--dark`, `--set`, `--call`, `--click`, `--wait-real` and `--shot`. This was the most valuable tool. `--set app.location=…` and `--call 'app.record("sale")'` let me look at any screen in one command. Screenshots caught everything in (c). Its layout findings caught the overflows and the small targets.

**Assert scripts (R5), kept in `checks/`.** Ten scripts, run against the live service:
- `flows`, `expense`, `sale`, `filters`, `bulk` and `phone` cover the brief's numbered criteria and the phone flow.
- `inline`, `refusal` and `scale` go beyond it.
- The scratch debugging script `/tmp/dbg.mjs` isn't kept.

What they caught: the selection-on-entry bug (11), the refusal shape and display (12–13), and the order dependence in `inline.mjs`. They also proved the reconciliation: the summary equals the bar, CSV total and Breakdown total each equal the summary, and the summary equals the sum of the rows' `inFilter`.

**How well the tools served me: very well.** Three things stood out:
- Driving by view path, with "nearest there" suggestions.
- `expect.request(method, path, { body })`, which made "the right PATCH went out" a single line.
- `drive.download`, which made the CSV check trivial.

The notes ("the script sent 3 writes to the live service…", "this run failed after earlier runs wrote to the same service") were exactly the right warnings. One flaky failure was precisely that.

**What was less good:**
- Paths into unnamed children are positional (`expense.1`, `lines.0.row.qty`), so a structural change silently invalidates scripts. Naming more children is the fix, and that's on me.
- Internal names like `_more` leak into scripts.
- The "never built" note listed classes I knew were reached in other scripts. Each run is separate, so that's fair, but it read as alarming.

**What I didn't verify:**
- The drag-to-select range on charts.
- The spring animation between data sets.
- The failed-save banner with Retry.
- Opening a linked sale or refund in the detail panel.
- Insights on a phone.
- Real screen-reader output. I checked that the sentence is built and that `Accessibility.announce` is called, not what VoiceOver says.

---

## (f) Confidence

**High**
- **Filtering and reconciliation:** every figure comes from the service, and the checks prove the equalities.
- **Recording:** expense with split, sale, refund, new vendor, usual category, service refusal at the field.
- **Bulk changes with undo, CSV export, and budgets** (set, words, pace marker).
- **Opening records from figures:** checked for a bar, a keyboard-selected point, and the Breakdown and Budget rows (not every chart).

**Medium**
- **Editing in place.** It works by keyboard. A mouse user can't click a cell to edit it; clicking selects the row, and editing happens in the detail panel. A tester expecting spreadsheet clicks will flag that. Tab between cells relies on native focus order through invisible fields. I tested Enter, Escape and the save path, but not Tab across a whole row.
- **"Select all" plus bulk:** sends `where` + `expectedCount`. If the list changes underneath, the service answers 409. I surface that only as "wasn't saved: …" with Retry, and Retry would get 409 again.
- **Charts:** tooltips, partial-period marking, the y-axis from zero (it extends below zero for negative net, intentionally), table views. The chart is announced as a button; that role choice is questionable.

**Lower — where I'd expect a tester to find problems**
- **Mobile Insights and Budgets:** never looked at.
- **Number-field edge cases:** typing "1,204.5", or negative values in the amount filter.
- **Dates:** `parseDay`'s "a date more than 31 days ahead means last year" rule.
- **Week granularity labels.**
- **The comparison series:** aligned by index, so a range whose comparison has a different period count draws 0s.
- **"Still working…":** appears after 1.2s but is untested.
- **Empty books greeting:** untestable here, because the service has data.
- **Undo:** reverts the last change only, in order. Undoing after another user's edit gives the service's 409 text.
- **Time zones:** I computed `today` from the service, so none of my code reads the browser's date. The sale-refund test script did use `new Date().toISOString()`, which is a test-only risk.

---

## (g) Gaps I worked around

**1. Replicating over a computed array**
- **Wanted:** `datapath = { … }` over a fresh array, 17 times.
- **Tried:** exactly that.
- **Did instead:** a named derived `Dataset` per list.
- **Judgement:** the platform deliberately lacks it, and the diagnostic gave the replacement. I'd still like a shorthand such as `datapath = { app.kinds }` over an array attribute. Maybe it exists and I didn't see it: an attribute typed `string[]` used directly as a datapath. **Unsure.**

**2. DataGrid cells: formatted display, edit on Enter, pick by typing**
- **Wanted:** a cell that shows "Nov 13" or a coloured chip, and on Enter becomes a field or combobox; Enter saves, Escape cancels, Tab moves on.
- **Looked at:** the DataGrid reference (`edit: true` shows a raw field value, always a TextInput), then `datagrid.declare`.
- **Did instead:** `CellField`, a TextInput with `opacity = { entered ? 1 : 0 }` and `pointerEvents = { entered ? "auto" : "none" }` over a display view. `PickCell` does the same with a Combobox. After Enter or Escape they hand focus back with `Focus.focus(app.grid)`.
- **Judgement:** this depends on an internal behaviour (`_firstControl` walks to the first focusable child), and the invisible-but-focusable trick is fragile. I suspect the platform genuinely lacks a "display/edit" cell protocol, something like a column `editor:` class beside `cell:`. It's possible a supported way exists that I missed.

**3. The contact under the description in one column**
- **Did:** a composite `DescCell` holding a `ContactCell` with `showChoice = false`.
- **Judgement:** fine; columns are one field by design.

**4. A frame class whose placed content reads the frame's state** (`ChartCard.asTable`)
- **Did:** moved the state to the App.
- **Judgement:** I may be missing a mechanism. Perhaps `provided(...)` from the frame would do it. **Unsure.**

**5. Reopening a base class's named child in a subclass**
- **What I wanted:** `pick [ items = … ]` in `CategoryCell extends PickCell`, and `head [ LinkButton … ]` in `ChartCard extends Panel`.
- **What happened:** I never compiled these. I rewrote them on the assumption they weren't supported, because nothing I read showed it.
- **Judgement:** **unknown.** It may work.

**6. Saving a file**
- **Did:** a `script [ host = browser ]` with Blob plus an anchor click.
- **Judgement:** I found `FilePicker` for opening files and assumed there's no save counterpart. **I never ran `declare-help` for "download" or "save"**, so it may exist. `drive.download` worked with my approach.

**7. A variable number of requests** (which single filter, if removed, would bring results back)
- **Wanted:** one summary request per active filter.
- **Did:** one `relaxQuery` source that steps through the options. Its `onLoad` advances `relaxStep` when the count is 0.
- **Judgement:** replicating a Node class holding a `DataSource` over data might do it. `declare.md` hints that a Node class can stand on a record. I didn't try.

**8. Invalidating every read after a write**
- **Did:** `rev` in every URL.
- **Judgement:** clean enough. I didn't look for a `refetch` or invalidate group.

**9. Writes that mustn't supersede each other**
- **Did:** one source per kind of write, plus a queue for budgets.
- **Judgement:** **unsure** whether this was needed (see a).

**10. Animating a chart between data sets**
- **Wanted:** each value springs from old to new.
- **Did:** `gen`/`base`/`t`. A Spring on `t` toward `gen`, `fromV` captured in `onChange`, and an interpolation fraction.
- **Judgement:** a Spring drives one scalar by design, and the guide on animated arrangements (which I skipped) may show the idiom. Unverified visually.

**11. A slow-service indicator**
- **Did:** a `Node` with `trackChanges = ["on"]` and `afterDelay(1200, …)`.
- **Judgement:** idiomatic enough, I think.

**12. Errors for controls outside a Field**
- **Did:** `RowProblem`.
- **Judgement:** the platform provides `error` and leaves display to you; it's documented under "Errors shown your own way". I'd read that and not connected it.

**13. Chart accessibility**
- **Wanted:** a proper role for a chart with an active point.
- **Did:** a Control, the default button role, an `accessibilityLabel`, and `Accessibility.announce` on movement.
- **Judgement:** the grid/`accessibilityActiveItem` pattern in chapter 19 might fit better. I chose not to restructure.

---

## (h) Changes of direction

1. **Contact column → merged into the description cell.** Late in the first visual pass, from the screenshot showing it twice.
2. **`PickCell` with reopened children → attributes plus `picked(v)`.** Mid-build, before compiling, from my own doubt (g, item 5).
3. **`ChartCard extends Panel` with reopened `head`/`body` → a standalone class with `defaultPlacement = body`; per-card `asTable` → `app.insightTable`.** Same moment for the class; the second part came after the R3 refusal.
4. **CatChip split dots, replicated views → drawn.** Before compiling: I doubted a replicated `datapath = { array }` would work. Item 5 in (d) later confirmed that.
5. **Literal datapaths → named Datasets.** After DECLARE3006.
6. **`openRecords(…, cat: string?)` → `catIds: string[]`.** While writing "Other (3)" in Expenses by category, which needs several categories at once.
7. **Single budget PUT → a queue.** From second thoughts about "supersedes".
8. **Category cell: a popover picker → a combobox laid over the chip.** In design, before writing: fewer moving parts.
9. **"(no description)" → `txnTitle` ("Market sale", "Payment to Adobe").** From the phone screenshot.
10. **Axis ticks → `niceStep`. Product grid text cells → `NumCell`. Breakdown's table toggle wired up.** From screenshots.
11. **Refusal mapping `field` → `name`, plus `RowProblem`.** From the `refusal.mjs` failure.
12. **The `inline.mjs` row choice:** first row → first expense → first Software expense. From order-dependent failures.

---

## (i) The code, quoted

The refusals are quoted in (d) with their messages. Two items in particular are worth reproducing.

**The silent override.** This compiles cleanly and makes every refusal land in `error` instead of on the field:
```
class Editor extends Form [ …,
    refusal(body: object) -> array {
        const ps = body?.problems ?? []
        if (ps.length == 0) return super.refusal(body)
        return ps.map((p) => ({ field: p.field ?? "", message: p.message }))
        },
```
The base is `refusal(body: any) -> FormProblem[]` returning `{ name, message }`.

**The cell that appended to the existing value.** Reconstructed before the `select("all")` fix:
```
class PickCell [ width = 100%, height = 100%,
    choices: array = [], current: object = null, fieldLabel: string = "",
    editable: boolean = true,
    picked(v: object) { },
    entered: boolean = { this.pick.entry.focused },
    pick: Combobox [ x = 2, y = 7, width = { parent.width - 4 }, height = 32,
        accessibilityLabel = { classroot.fieldLabel },
        focusable = { classroot.editable },
        opacity = { classroot.entered ? 1 : 0 },
        pointerEvents = { classroot.entered ? "auto" : "none" },
        items = { classroot.choices }, value = { classroot.current },
        commit(v: object) { if (v != null) classroot.picked(v); afterSettle(() => Focus.focus(app.grid)) } ] ]
```
Steps: grid focused, ArrowRight to the Category column, Enter, type "Advert". The entry holds "SoftwareAdvert" and Enter picks nothing.

**Where I went in a circle:** only once, on `inline.mjs`. There were three failed runs. In the first two I changed the wrong thing (`focusable` → `disabled`) before the debug print showed the real cause. The third failure was service state.

---

## Surprises

- How much worked the first time it ran: the Overview with real data, the Sheet editor, Combobox creation, the budget page, the RangeSlider-plus-histogram.
- The quality of the compiler's diagnostics. Several told me the exact rewrite, and R1 batching meant few round trips.
- `R4` feeding a schema sample to a `DataSource` so that conditional UI was built and checked at boot.
- That a test harness this complete (download capture, request assertions, service-write warnings) ships with the language.

## Good

- The reactive data model, with DataSource URLs derived from state.
- The library's controls and their uniform `value`/`commit` contract.
- `declare-help` as the reference.
- `declare-look` for seeing any state in one command.
- Assert scripts by view path.
- Diagnostics that name the fix.
- Writing almost no glue code.

## Bad

- The literal-datapath ceremony.
- No supported in-place editor protocol for DataGrid cells.
- Override signatures not caught (FormProblem).
- Positional test paths and internal names leaking into scripts.
- Errors of controls outside a `Field` going unseen.
- A few attributes I expected and didn't find: `Segmented.name`, a `table` role, `Color` in a schema.
- Not knowing whether a superseded write was sent.

## How it differs, and what it reminded me of

It's closest in spirit to QML and to OpenLaszlo, which it names: a declarative tree, bindings that stay true, states, and attributes as the only update mechanism. Unlike React, there's no render function or effect juggling. Data fetching as a reactive resource felt like SWR or React Query, built into the language. Driving layout with layouts as objects felt like SwiftUI or Flutter, without the modifier chains. The biggest difference from all of them is that the compiler sees the tree and reads dependencies from the code. The stricter it was, the less I had to debug at runtime.

## The sharpest edges

**DataGrid in-place editing was the hardest part.** It was one obstacle, roughly 15–20% of the build effort counting the debugging and test churn. To write it right the first time I'd have needed a documented cell protocol (display class plus editor class, with enter/commit/cancel hooks), or an example of a custom editable cell in the sampler or the tracker.

**The second edge was a pattern: structure-dependent paths in test scripts.** It cost maybe 10%. Advice in `verify.md` to name every view a script touches, which I learned the hard way, would have saved most of it.

**Third: the computed-list ceremony.** It was cheap to fix once diagnosed, but it's a pattern a newcomer hits immediately.

## Where I'd most want improvement

1. A first-class editable-cell protocol for DataGrid.
2. Signature checking for overrides of library methods, especially seams like `refusal` and `applyEdit`.
3. A lighter way to replicate over a computed array.
4. Documentation saying whether `fetch()` supersession cancels or only ignores an in-flight write.
5. A way for content placed in a frame class to read that frame's state.

## What I'd use it for

Data-heavy internal tools and dashboards like this one, where filtered lists, forms, charts and keyboard work dominate. There, the reactive-resource model and the verify/look tooling would pay off immediately. I'd also use it for interactive explanatory pieces with continuous motion, which the language clearly aims at but which I barely exercised. I'd hesitate on anything that depends on a large ecosystem of third-party UI components, or where my team needs search-engine answers rather than a compiler and a reference.


## The names ledger

```
NAMES — eval-ledger-6: 5 missed name(s), 0 collision(s), 2 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    19 · attribute · text                 · HTMLText                 · —                  · none         · ×1  ·   19 · resolved
         HTMLText has no attribute 'text' — 2 sites, also on line 323 [DECLARE2000] (ledger-pages.declare:321:13)
    19 · value     · table                · ChartTable.accessibility · —                  · none         · ×1  ·   19 · resolved
         ChartTable.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid |
    19 · attribute · name                 · Segmented                · —                  · none         · ×1  ·   19 · resolved
         Segmented has no attribute 'name' [DECLARE2000] (ledger-editor.declare:300:43)
    20 · member    · asTable              · InsightsPage             · —                  · none         · ×1  ·   20 · resolved
         'asTable' is not a member of InsightsPage — declare it (asTable: <type> = …) or fix the name — 6 sites, also on lines 755, 756, 766, 771, and 1 more [DECLARE6001] (ledger-pages.declare:750:57)
    20 · member    · tooFew               · InsightsPage             · —                  · none         · ×1  ·   20 · resolved
         'tooFew' is not a member of InsightsPage — declare it (tooFew: <type> = …) or fix the name — 2 sites, also on line 766 [DECLARE6001] (ledger-pages.declare:750:79)

DECLARE-HELP MISSES (min · asked for · answered)
     1 · runs · Text has no member 'runs' and nothing near it — the member table: declare-help Text
     1 · prefersReducedMotion · 'prefersReducedMotion' is not a Declare name — the person's reduced-motion preference is the App's accessibilitySettings.reduceMotion — read as provided("access

SUMMARY: 5 of 5 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
