# Building 7GUIs in Declare: an account for the people who make it

**A correction first.** At the end of the build I said the app was running at `http://127.0.0.1:8201/…`. That was true when I checked: `curl` returned 200. Afterwards, the background job that ran that server reported that it had exited with code 1. So the server is probably not running now. I haven't restarted it, because you asked me not to change anything. If anyone wants to look, they need to run `PORT=8201 npm start` again. Port 8200 was held by another Declare dev server "serving a different tree".

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`.
2. `skill/SKILL.md`, all of it.
3. The required reading, each file whole:
   - `docs/declare.md` (938 lines).
   - `docs/guide/01-what-declare-is.md`.
   - `04-structure.md`.
   - `05-run-and-check.md`.
   - `06-layout.md`.
   - `apps/todo/todo.declare` and `todo-parts.declare`.
4. Reference lookups with `npx declare-help`, in batches:
   - `TabBar`, `Window`, `Dialog`, `ProgressBar`, `Gauge`, `RadioGroup`, `Segmented`, `TextInput`, `DatePicker`, `Slider`, `ContextMenu`, `Table`, `Time`, `afterDelay`.
   - Later: `Table --all`, `Window --all`, `Time --all`, `readOnly`, `onEnter`, `pointerX`, `scrollX`, `onPointerMove`, `onContextMenu`, `onDblClick`, `TableRow`, `Dialog.notice`, `"theme tokens"`, `link`, `shows`, `rootOrigin`, `Field`, `Card`, `stroke`, `Focus`, `scrollIntoView`.
5. Guide chapters, whole:
   - `08-controls.md`.
   - `18-overlays.md`.
   - `17-your-own-views.md`.
   - `16-collections.md`.
6. Guide chapters, in part:
   - `14-data.md`, lines 20–255: cursors, writing records, "A Node class on a record".
   - `03-constraints.md`, from line 40.
   - `09-pointer-and-keyboard.md`, lines 60–260.
7. Library source, by grep and partial reads:
   - `library/table.declare`: the `Table` class.
   - `library/textinput.declare`, lines 225–285.
   - `library/datagrid.declare`, around `_enterCell` and its `_ed: TextInput`.
8. `docs/operational/verify.md`, by grep for the `drive.` and `expect.` API.

**What I skipped, and why:**
- `22-time.md`: the `Time --all` reference entry told me enough.
- `07-scrolling.md`.
- `11-paint-and-themes.md`.
- `12-text.md`.
- `19-accessibility.md`.
- `21-motion.md` and `23-animated-arrangements.md`.
- `02-notation.md`.
- `14-data.md` from line 255 on (forms, DataSource).
- Every app beyond todo.
- `docs/operational/intake.md`.

None of these looked needed for 7GUIs. The skill also says outright to stop reading after the required set. In hindsight, skipping `07-scrolling` was the one I'd reconsider. Cells needed two-axis scrolling, sticky headings and scroll-to-cell, and I worked all three out from reference entries.

**What taught me the most:**
- `docs/declare.md`, especially §5. It covers the settle, "what you can assign", and the table separating *set with a constraint* from *declare with a computed default*. I relied on that distinction directly: `startText: string = { classroot.today }` in the flight booker is a default the user's typing then takes over.
- The todo app, as a model of where things go. `Tasks extends DataSource` holds all the writes, and `rowMenu: ContextMenu` is a member opened with a verb. I copied both patterns (`People`, `Drawing`, `circleMenu`).
- The library source. The two things that unblocked me came from library code, not docs:
  - `Table`'s `input`/`selection` declarations.
  - `DataGrid`'s editor `TextInput`, which handles Enter in `onKeyDown`.

**What was missing or misleading:**
- `Table.selection`'s reference says "`null` when nothing is selected", and the source declares `selection: array = null`. But constraining it to null is a type error. Details in (d).
- `TextInput.onEnter` is described as "what Return does once it has ended the edit: on a single-line field". My single-line field's `onEnter` never ran. I am unsure why; see (d).
- `14-data.md` says, in a parenthesis: "(A class like this stands on *one* record. Replicating it over a collection … is not supported; only views replicate.)" That sentence decided the whole Cells design. It sits in a parenthesis in a chapter the skill doesn't tell you to read. Anyone building a model over many records will run into it, so it deserves more prominence.
- Nothing I read says that `Dataset.set` on a nested path changes the record object in place, or that this matters if you keep a reference to that record elsewhere. This produced a real bug; see (d).

## (b) Expressing what you wanted

**Where Declare fit my intent well:**
- **Timer.** This was the best fit of the seven:
  ```
  clock: Time [ tick = frame,
      running = { classroot.elapsed < classroot.duration },
      onTick(dt: number) { classroot.elapsed = Math.min(classroot.duration, classroot.elapsed + dt) } ]
  ```
  "Runs while e < d, resumes when d is raised, Reset restarts" fell out of one gate with no extra logic. It worked first time.
- **Flight booker.** Every rule is a named derived value: `start`, `back`, `bothDates`, `backTooEarly`, `canBook`, `problem`. Book's `disabled = { !classroot.canBook }` and the red `State` read those names.
- **Temperature.** Each field's `commit` writes its own text and, if that text is a number, the other field's text. The "while the person is editing, the control shows their text, not your value" rule meant there was no fight between the two fields.
- **Navigation.** `location` plus `shows = "counter"` on each page, plus `link = { "#" + classroot.id }` on each sidebar item, gave addressable tasks and a working Back button for about five lines.
- **Overlays.** `ContextMenu.open(this, e)`, `Dialog.notice(...)`, a `Menu` on a `Button` as a pop-up, and a library `Window` whose `open = {…}` / `input(v)` pair let me run "closing the window commits a history step" through one method. These matched intent almost exactly.
- **Error reporting in the compiler.** Every message named the fix, and every fix I applied worked.

**Where I had to work around it:**
- **Cells change propagation.** This is the big one. The 7GUIs Cells task tests whether the toolkit's reactivity can propagate changes between cells. I could not see how to give 2,600 cells each a reactive value with dependencies decided at run time:
  - only views replicate;
  - the rows are virtualized, so off-screen cell views don't exist;
  - indexing an attribute by a runtime key is refused (DECLARE7001 territory).

  So I wrote an explicit dependency graph in a `Dataset` method: a breadth-first search over a readers map, then Kahn's algorithm for ordering, then one `set` per affected cell. That works, and Declare then wakes only the views bound to the changed records. But the core of the exercise is hand-written, not the language's.
- **Read-only field.** There's no read-only `TextInput`, so I built a field-shaped `View` around a `TextLabel`.
- **Sticky row and column headings** in a pane that scrolls both ways:
  - `x = { classroot.headW - classroot.frame.pane.scrollX }` on the heading strip;
  - `ignoreLayout = true, x = { classroot.frame.pane.scrollX }` on each row's number.
- **Scroll-to-cell.** I wrote it as arithmetic with `scrollTo` and `scrollToX`.

## (c) The first time it ran

The first clean boot was the fifth `declare-verify` run. I then looked at each task with `declare-look`, one at a time.

| Task | What was wrong | How I found it |
|---|---|---|
| Counter | Nothing functional. The field was 30 px tall next to a 40 px button. | Looking at the screenshot. |
| Temperature | Correct. "5" gave −15, and "5x" left Celsius alone with a red outline. | `--read` plus screenshot. |
| Flight Booker | Correct in all four states I drove: menu open, return date before start, 31.02, booked. Nothing showed the date format once a field had text in it (the placeholder disappears). I added a caption. | Screenshots. |
| Timer | Correct. | `--wait` and `--read elapsed`: 3.08, then 10 (stopped), then 11.98 after raising the duration to 15, then 0.52 after Reset. |
| CRUD | Correct for filter and select. Field labels sit slightly off the fields' text line. I left that. | Screenshot. |
| Circle Drawer | Circles drew, but the hovered one wasn't filled. That turned out to be the tool, not the app; with press and move it filled. A real bug showed up later: redo of "draw" came back at the resized diameter. | `--read canvas.hovered/pointerX/pointed`; `--read drawing.done`. |
| Cells | Rendered and evaluated correctly, but Return didn't close the editor. Later, arrow keys scrolled the pane instead of moving the selection. Cell and heading fills were the wrong way round. | `--read editingId` after `--key Enter`; screenshot after 54 arrow presses showed scroll offsets with `selectedId = "A0"`. |
| Adjust window | Opened over the circle being adjusted. | Screenshot. |

## (d) Every refusal and surprise

Code is as it stood when the message appeared. Messages are quoted exactly from the tools' output.

**1. Library class name taken (R1)**
- **I wrote:** `class Sheet extends Dataset [ schema = [ rows[]: SheetRow ], …`
- **The platform said:** `'Sheet' is a library class — a class of the program can't take its name; rename yours, as 'MySheet' (the library's is used as 'Sheet [ … ]') [DECLARE5000] (line 44, col 1)`
- **I changed:** renamed it to `Spreadsheet`.
- **Judgement:** my error, and a fair rule. A namespace or a warning-level shadow would be friendlier, but the message is excellent.
- **Related, caught myself before compiling:** my schema `SheetCell` had the same name as my view class `SheetCell`. I had read that schemas live "in the classes' namespace", so I renamed the schema to `CellRecord`.

**2. Four R1 errors in one batch**

*2a.*
- **I wrote:** on a `TextInput` subclass,
  `State [ applied = { classroot.invalid }, stroke = { stroke(1.5, provided("theme").error) }, textColor = { provided("theme").error } ]`
- **The platform said:** `State.textColor: a state override sets a declared attribute of the view, not a provided value — 2 sites, also on line flight.declare:42 [DECLARE2000] (temperature.declare:28:72)`
- **I changed:** dropped the red text and kept the red stroke.
- **Judgement:** consistent with §9 (text colour is provided, not set), but surprising on a text field, where text colour is the obvious thing to change. `TextInput` must take its colour from somewhere. I didn't look for the right attribute, so I'm unsure whether one exists. The message doesn't say what to write instead, which is unusual for this compiler.

*2b.*
- **I wrote:** `picked(id: string) { if (id == "undo") classroot.drawing.undo() else classroot.drawing.redo() }`
- **The platform said:** `Shortcuts.picked(…) is not a valid method body — ';' expected. [DECLARE2000] (circles.declare:125:28)`
- **I changed:** added braces.
- **Judgement:** my code was simply invalid TypeScript.

*2c.*
- **I wrote:** `valueOf(id: string) -> CellValue { … }` on `Spreadsheet`.
- **The platform said:** `Spreadsheet.valueOf: 'valueOf' is a member of every object — choose another name [DECLARE2000] (cells.declare:71:5)`
- **I changed:** renamed it to `current`.
- **Judgement:** my error. A good catch that plain TypeScript would have let through, to my cost later.

*2d.*
- **I wrote:** `sheet: Spreadsheet [ ],` and filled it in the class's `onInit() { … this.set([], ({ rows: rows })) }`.
- **The platform said:** `a Dataset needs data — a literal JSON body ('sheet: Dataset { … }') or a derived 'contents = { … }' [DECLARE2000] (cells.declare:176:5)`
- **I changed:** `sheet: Spreadsheet [ ] { { "rows": [] } },`
- **Judgement:** unsure. I wanted generated-once, then mutable data, and neither offered form is that: `contents` is read-only, and a literal is static. The empty literal plus `onInit` works, but it caused the boot crash in item 5.

**3. Font weight token inside braces (R2)**
- **I wrote:** `Text [ fontSize = 14, fontWeight = { classroot.here ? semibold : regular }, text = { classroot.name } ]`
- **The platform said:** `'semibold' is one of fontWeight's values — bare only as the whole value (fontWeight = semibold); inside { } write it as a string: "semibold" [DECLARE4005] (line 46, col 59)`, plus the same for `regular`.
- **I changed:** a `State [ applied = { classroot.here }, fontWeight = semibold ]`.
- **Judgement:** my error. `declare.md` §2, "The vocabulary stops at the brace", says exactly this, and I still did it.

**Warnings in the same run:**
- **DECLARE4023:**
  - **I wrote:** `Text [ …, text = { "" + (rowIndex + 1) } ]` inside `TaskLink`.
  - **The platform said:** `Text reads rowIndex, but Text is not replicated — that is its own rowIndex, never the row's … classroot.rowIndex …`
  - **I changed:** `classroot.rowIndex`.
  - **Judgement:** a real bug, caught before it ran. Excellent.
- **DECLARE4035:**
  - **I wrote:** `accessibilityLabel = "Canvas"` with no role.
  - **I changed:** added `accessibilityRole = group`.
  - **Judgement:** unsure that `group` is the right role for a surface you draw on.
- **DECLARE4025:**
  - **I wrote:** `backTooEarly: boolean = { isReturn && start != null && back != null && back < start }`
  - **The platform said:** `backTooEarly decides on one condition of 4 parts — give the facts it decides on names of their own …`
  - **I changed:** split out `bothDates`.
  - **Judgement:** fine advice, mildly fussy.
- **DECLARE1002:**
  - **I wrote:** `contents = { ({ people: … }) }`.
  - **The platform said:** redundant parentheses.
  - **Judgement:** I had copied the `({ … })` habit from the todo app's method bodies. The examples are inconsistent about it, which is how I picked it up.

**4. Type errors (R3)**

*4a.*
- **I wrote:** `selection = { classroot.selected == null ? null : [classroot.selected] },` on a `Table`.
- **The platform said:** `the { } body of 'selection' computes a null, but 'selection' is typed any[] — make the expression yield a any[] [DECLARE6001] (crud.declare:93:56)`
- **I changed:** `? [] :`.
- **Judgement:** **the platform looks wrong, or its docs do.** The reference says `selection` is "`null` when nothing is selected", and `table.declare` declares `selection: array = null`.

*4b.*
- **I wrote:** `input(sel: object) { classroot.choose(sel as Person[]?) }`, and in a method body `let best: Circle? = null`.
- **The platform said:** `'?' after a type is the declaration's shorthand (a slot's or a parameter's: string? is string | null), not a { } body's — a body is TypeScript, so write Person[] | null [DECLARE6001]`, with the same for `Circle | null`.
- **I changed:** `Person[] | null` and `Circle | null`.
- **Judgement:** my error, and a very good message. Still, the boundary is easy to cross: `choose(sel: Person[]?)` is legal one line above.

**5. Boot crash (R4)**
- **I wrote:**
  - in the formula bar, `text = { classroot.sheet.value == null ? "" : classroot.sheet.cell(classroot.selectedId).formula }`;
  - `cell(id)` returned `this.value.rows[at.row].cells[at.col]`.
- **The platform said:** `boot: the program did not come up — Cannot read properties of undefined (reading 'cells') — in Spreadsheet.cell (cells.declare:67), from Text.text (cells.declare:211)`
- **What was happening:** the literal `{ "rows": [] }` existed during the first settle, before `onInit` had filled it.
- **I changed:** `cell()` returns `this.value.rows[at.row]?.cells[at.col] ?? this.blank(id)`.
- **Judgement:** my bug, caused by the workaround in 2d. The diagnostic named both the method and the constraint, which made it a 30-second fix.

**6. Return didn't end the cell edit (runtime)**
- **I wrote:**
  ```
  editor: TextInput [ exists = { classroot.editing }, …, value = { :formula }, commitOn = "end",
      commit(src: string) { classroot.edited(src) },
      onEnter() { classroot.stopEditing() },
      onBlur() { classroot.stopEditing() },
      onKeyDown(e: KeyEvent) {
          if (e.key == "Escape") { this.cancelEdit(); classroot.stopEditing(); return }
          super.onKeyDown(e)
          },
      onInit() { afterSettle(() => Focus.focus(this)) } ]
  ```
- **What happened:** after `--dblclick … --type "5" --key Enter`, `--read …editingId` still gave `"A0"`. The value had been committed: the formula bar showed it. The editor stayed open.
- **I changed:** removed `onEnter` and added `if (e.key == "Enter") { this.endEdit(); classroot.stopEditing(); return }` at the top of `onKeyDown`. I copied this from `DataGrid`'s `_ed`.
- **Judgement: unsure.** Either my `onKeyDown` override stops the path that fires `onEnter` (`TextInput.onKeyDown` itself does `if (e.key == " " || e.key == "Enter") return`), or `onEnter` doesn't fire for this kind of field. The reference implies it should. If overriding `onKeyDown` stops `onEnter`, that deserves a sentence in the reference. This cost one look-run-grep-fix loop.

**7. Undo/redo brought circles back at the wrong size (runtime)**
- **I wrote:**
  ```
  draw(x, y, d) { … const c = ({ id: lastId, x: x, y: y, d: d }); this.set(["circles", "-"], c)
                   record(({ kind: "draw", circle: c, from: 0, to: d })) },
  preview(id, d) { … this.set(["circles", i, "d"], d) },
  redo() { … if (s.kind == "draw") this.set(["circles", "-"], s.circle) … }
  ```
- **What happened:** after resizing circle 2 from 40 to 149, `--read drawing.done` showed the *draw* step's circle with `"d":149`. So the object I inserted is the one the dataset later modified in place. Undo-undo-redo would have brought circle 2 back at 149 before its resize step was redone.
- **I changed:** a step now holds plain values: `schema Step [ kind, id, x, y, from, to ]`.
- **Judgement:** my code relied on the inserted object staying frozen, so my code was wrong. But the docs say "a new array or record is a change" and stop there. Nothing warns that nested `set` changes records you may still be holding a reference to. One sentence in `14-data.md` § Writing a record would have prevented this.

**8. Arrow keys scrolled the pane (runtime)**
- **I wrote:** cells as plain views with `onClick() { classroot.select(:id) }`, and the arrow handling in `onKeyDown` on the `focusable = true` pane.
- **What happened:** after clicking a cell and pressing the arrows 54 times: `selectedId = "A0"`, `scrollX = 560`, `scrollY = 1400`. The browser's own scrolling had taken the keys.
- **I changed:** `select()` now calls `Focus.focus(frame.pane)`.
- **Judgement:** my error. `08-controls.md` says plainly that "a click on anything that can't take focus clears it". I read it and didn't connect it.

**9. Tool-side surprises while verifying**
- `--click-at` produced no hover. Only `--press … --move` updated `pointerX` and `hovered`. That's the tool, not the app. Unsure whether it's intended.
- `--dblclick app.page.6.body.0.frame.pane.rows.0.0` failed with: `a press on '…rows.0.0' — (272, 131) in the window — would reach 'app.page.6.body.0.frame.pane': it is covered there, or takes no presses`. Index 0 is the row-number spacer `View`, so my path was wrong. The message told me exactly where the press would land, which was enough to work it out.
- `--read app.page.6.body.0.sheet.value.rows[0].cells[1]` failed with: `'app.page.6.body.0.sheet' has no 'rows[0]'`. Paths don't take bracket indexing. That's reasonable, but the message could say so.
- `drive.selectAll('…middle.fields.0.1')` failed with: `is not a text field — it has no select()`. Addressing the fields by label (`"Name:"`) worked.
- `drive.clickAt(…, { button: "right" })` failed with: `not an option — modifiers`. The table in `verify.md` gives `button` to `drive.click` only. I used `page.mouse.click(..., { button: "right" })` at `canvas.rootOrigin()` plus an offset, and that worked.
- A shell quoting mistake (all the `--key` flags passed as one string) produced `… is not an option — see --help`. That one was mine.

## (e) Verifying it

**The checks I used:**
- **`declare-verify`, rungs R1–R4,** after every edit batch. It caught every compile and type issue above, and the boot crash, each with a fix I could apply. R4 noted that it "never built" `SheetCell` because the data arrived after boot. True, and honestly reported.
- **`declare-look`,** with `--set app.location=…`, `--read`, `--call`, `--shot` and `--shot-of`. This was the most useful tool overall:
  - `--read` of model attributes found the history aliasing bug and the Return bug;
  - screenshots found the overlapping window, the inverted fills and the missing format caption.

  Being able to write `--set app.location=cells` and `--call app.page.5.body.0.adjust(2)` made it fast to reach deep states.
- **An assert script (`flows.mjs`, R5): 67 steps, 22 assertions, all passing.** It covers:
  - the counter;
  - Temperature in both directions, plus junk input;
  - CRUD filter, select, update, create and delete;
  - Circle Drawer: real right-click, menu, slider drag, window close, undo×2, redo×2;
  - Cells: values, propagation through two levels, a self-reference error, Delete.

  Its layout checks also reached `SheetCell` once the script built it.

**What I did not verify:**
- The ⌘Z / ⇧⌘Z shortcuts in Circle Drawer.
- Ending a Cells edit by clicking away, where `onBlur` and the commit-on-blur interact.
- Keyboard use of the sidebar links.
- Window resizing.
- Canvas rendering (`?render=canvas`).
- Behaviour in a real, non-headless browser. The server was up only briefly, and I never used it by hand.
- That Cells recomputes *only* dependents. I trust the algorithm, but I didn't measure it, for example with `declare-profile` or a counter.

**How well the tools served me:** very well. Path-based addressing is the right idea, though I tripped over replicated-child numbering twice. What I missed most were a right-click in both `declare-look` and `drive.clickAt`, and bracket indexing in `--read`.

## (f) Confidence, part by part

| Task | Confidence | Where a tester might find problems |
|---|---|---|
| Counter | High | — |
| Temperature | High | Conversion rounds to two decimals. Unicode minus (−) and comma decimals aren't accepted as numbers. The red outline is the only marking. |
| Flight Booker | High | The disabled return field keeps whatever it held. Dates must be exactly DD.MM.YYYY with a four-digit year, though one-digit days and months are accepted. |
| Timer | High | `dt` is clamped to about 1/15 s per frame, so a stalled tab under-counts elapsed time. That's arguably correct for a visible timer. A duration of 0 shows a full gauge. |
| CRUD | Medium-high | Create accepts empty names. A person hidden by the filter is deselected but stays in the fields. The label alignment is slightly off. |
| Circle Drawer | Medium | Shortcuts are untested. Hover selection after the context menu closes depends on the next pointer move. The menu opens for the circle under the pointer, which by construction is the selected one. Dark mode uses a fixed `0x9A9A9A` fill. The window is placed at fixed coordinates. |
| Cells | Medium | Blur-to-commit is untested. There's no type-to-edit. In SUM/PROD, text inside a range is an error, not skipped. Errors all show `#ERROR`, with the reason only in the formula bar and tooltip. The sticky headings could lag a frame behind fast scrolling; that's unseen in headless runs, and I'm unsure. The whole-grid focus ring is heavy. |

## (g) Gaps I worked around

**1. A read-only text field.**
- **Looked for:** `npx declare-help readOnly` (a miss); grepped `library/textinput.declare` for read-only (found only `readonly text:`, a declaration).
- **Did instead:** a styled `View` with `accessibilityRole = status`.
- **Judgement:** probably a real gap. `admit()` returning `null` for everything might give a selectable read-only native field. I didn't try it.

**2. Per-cell reactive values with run-time dependencies.**
- **Looked at:** `14-data.md` (Node on a record: one record only), `16-collections.md` (only views replicate, and virtualization), and DECLARE7001's rules.
- **Did instead:** an explicit graph and topological recompute in `Spreadsheet.setFormula`, with formula parsing and evaluation in `formula.ts`.
- **Judgement: unsure.** If a `{ }` reading `this.value.rows[r].cells[c]` through a recursive method is tracked by region, a constraint per cell view might have worked. But off-screen cells wouldn't exist under virtualization, and a model must not live in views anyway. I think the platform lacks a "keyed collection of reactive nodes" or a "computed field per record". This is the most significant gap I hit, because Cells is the task meant to show off reactivity.

**3. Frozen headings in a pane that scrolls both ways.**
- **Looked for:** `scrollX` and `ignoreScroll` in the reference.
- **Did instead:** headings positioned by constraints on `scrollX`.
- **Judgement:** it may exist in `07-scrolling.md`, which I skipped. Unsure.

**4. Bring a grid cell into view.**
- **Looked at:** `scrollIntoView` (it aligns to the top, and the cell view may not exist under virtualization) and `Table.showRow` (my grid isn't a `Table`).
- **Did instead:** arithmetic with `scrollTo` and `scrollToX`.
- **Judgement:** a small real gap, something like a "reveal this rectangle" request.

**5. Data generated once, then mutable.** See (d) item 2d. An empty literal plus `onInit`.

**6. A red text colour on an invalid field.** Refused in a `State`; I used only the stroke. Unsure whether there's a proper way.

**7. Right-click in testing.** Used Playwright's mouse directly. A real tool gap.

**8. Hover position on a drawn canvas.**
- **Did:** `onPointerMove` storing `pointerX` and `pointerY`, read in a constraint.
- **Judgement:** it works and seems intended. It also "claims" drags, which I didn't need.

**9. Dates.** I deliberately didn't use `DatePicker`. The brief needs a free-text field that can hold an invalid value and be marked red.

## (h) Changes of direction

- **Cells model.** Before writing any code, I planned per-cell reactive nodes, possibly `Cell extends Node` replicated over records. I dropped that after reading "only views replicate" in `14-data.md`, and wrote explicit propagation instead. Cause: the docs.
- **Undo history steps.** First they held the circle record; then plain values. This came mid-verification, from a `--read` of `drawing.done`. Cause: a finding at runtime.
- **Ending a cell edit.** First `onEnter`; then Enter handled in `onKeyDown` with `endEdit()`. Found running the app; the fix came from `DataGrid`'s source.
- **Invalid-field marking.** First stroke plus text colour; then stroke only. Cause: refusal 2a.
- **Sidebar bold.** First a ternary inside `fontWeight = {}`; then a `State`. Cause: DECLARE4005.
- **Table selection.** First `null` for "none"; then `[]`. Cause: DECLARE6001.
- **Names.** `Sheet` became `Spreadsheet` (refusal). The `SheetCell` schema became `CellRecord` (my own second thoughts).
- **Small fixes from looking at the running app:**
  - adjust window moved from (80,90) to (24,300);
  - Cells fills swapped;
  - the error reason added to the formula bar;
  - the date-format caption added;
  - counter field height from 30 to 38;
  - cell clicks now focus the grid (bug 8).
- **Sticky headings.** I considered a separate synced pane, but chose in-content positioning without trying the other.

## (i) Code, quoted

The quotes for each refusal and finding are in (d) above, inline. The only loop that went round more than once was test paths, not the app. Assert and look paths into replicated children (`rows.0.0` → `rows.0.1`; `fields.0.1` → `fields."Name:"`) each took one retry.

---

## Overall

**Surprises:**
- How often a diagnostic named the exact fix: every compile-time one did.
- That the whole language really does fit in `declare.md`.
- That a spreadsheet, the task most about reactivity, ended up the least reactive code I wrote.
- That library source is the real documentation for edge behaviour, especially around editing.

**What was good:**
- Constraints with named intermediate values. The flight booker reads like its spec.
- `Time` with a `running` gate.
- The overlays-as-members model.
- `location` / `shows` / `link`.
- `declare-look` with `--read`, `--set` and `--call`.
- The R1–R5 ladder.
- Precise errors, including DECLARE4023, which caught a real bug.

**What was bad:**
- The `TextInput` editing protocol (`commit`, `commitOn`, `endEdit`, `onEnter`, `onBlur`, `onKeyDown`) is the **sharpest edge**. It was one obstacle, cost one debugging loop of roughly 10–15% of the verification time, and I'm still not sure why `onEnter` didn't fire. A reference section on "a field you open and close yourself", using the DataGrid editor as the worked example, would have got me there first time.
- The model gap for many reactive records. This was a **pattern**, not a one-off: it shaped the whole Cells design. To write it "right" first time I'd need either a documented idiom for a computed per-record value in a large collection, or explicit guidance that hand-written propagation in a Dataset class is the intended answer.
- Small doc and source mismatches: `Table.selection` and null; in-place record changes.

**How it compares:** it is closest to **QML** (property bindings, states, declarative tree with imperative handlers) and to **OpenLaszlo and Flex MXML**, as the lineage section says. The reactivity feels like Solid or MobX: fine-grained, not diffing. The environment-style `provided()` resembles SwiftUI's `@Environment`. Unlike React, nothing re-renders, and moving lists, conditionals and data into datapaths and `exists` changes how you think. That change is the point, and it mostly worked for me.

**Where I'd most want improvement:**
1. An idiom, or a feature, for reactive per-record derived values over large or virtualized collections.
2. One authoritative page on the text-field edit lifecycle and how overrides interact with it.
3. Right-click (and other buttons) in `declare-look` and in `drive.clickAt`.
4. Bracket indexing in `--read` paths.
5. Docs: state that nested `set` changes records in place, and promote the "only views replicate" sentence.

**What I'd use it for:** internal tools and data-entry apps, and anything with rich, animated state transitions where the constraint model pays off. The todo, calendar and tracker apps are good evidence of that. I'd hesitate for compute-heavy, dynamically wired models like spreadsheets or node editors until the gap in point 1 is closed.
