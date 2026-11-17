# 7GUIs run 5: Opus 5.5, Declare, on the local tree, minimal

The first run of the queue after the React round, at minimal ("it must build and start with no
errors. Check that and nothing more"). **6.3 min, 49 turns, 38k output tokens** (13k thinking).
Timing record: `evals/timings/2026-11-16-7guis-run5-local.txt`.

## 1. The score

> **Rescored 2026-11-16 on the fixed drive: still 6 of 8** (`drive-results-rescored.json`). The
> circle failure stands: with the backdrop read correctly, the live reading is taken where the
> centred window covers the circle (the drive's note); after closing, the circle has the slider's
> diameter (36, radius 18.5), so the change is applied but cannot be watched. 7GUIs 4's window
> covers its circle only in part, and it now passes 8 of 8.

**The hidden drive: 6 of 8** (`drive-results.json`): counter, temperature, flight, timer, CRUD
and circle selection pass.

- **`circles_history` — the app, and the same failure 7GUIs 4 (standard) had.** The adjust window
  is a centered modal `Dialog`, and the circle being adjusted (at 835, 140) lies under it
  (`drive-circles.png`); the drive, like a person, cannot watch the diameter change. The slider
  itself is right — `commit` runs on every move by default. Two runs in a row reached for a
  centered modal where a popover beside the circle would leave it in view.
- **`cells` — the drive narrower than the brief.** The sheet opens with its letters and row
  numbers (`seen-cells-open.png`), but its header row scrolls away with the rows: after scrolling
  down to row 99 and right, column Z's letter is off the top (`drive-cells.png`), and the drive
  looks for that letter. The brief does not ask for headers that stay in view; 7GUIs 4 froze them
  by choice (`strip … x = { -parent.parent.body.scrollX }`). Care, not a broken brief — for DT,
  with the other narrow checks.
- Drive notes: the count is shown as text, not a read-only field; the bad dates are marked only
  by color (a hand-made `State`, where the field's own `validate` would also mark it invalid for a
  screen reader); the adjust window covers the circle.

## 2. The comparison

| | 7GUIs 4 (standard) | **7GUIs 5 (minimal)** |
|---|---|---|
| total | 13.9 min | **6.3 min** |
| turns | 86 | 49 |
| output tokens (thinking) | 70k (24k) | 38k (13k) |
| reading · writing · checking | 3.6 · 3.7 · 6.6 | 3.2 · 2.6 · 0.6 |
| cache reads · writes | 13.1M · 288k | 5.6M · 203k |
| context at first write · at end | – | 182k · 213k |
| drive | 8/8 (rescored on the fixed drive, 2026-11-16) | 6/8 (the covered circle, and Cells without frozen headers) |
| code | 868 lines (1,218 raw), 9 files | 759 lines (1,053 raw), 9 files (588 Declare, 171 TS) |
| download (gzip) | 194 KB (built today) | 193 KB |

The time saved is the checking (0.6 min against 6.6). Reading took the same.

## 3. The refusals (each named its fix)

`Sheet` is a library class (DECLARE5000); `valueOf` is a member of every object; a `Sheet`-typed
attribute declared without `?` given `null` ("write 'Sheet?'"); `classroot.sheet` may be absent
(DECLARE6001).

## 4. Findings

1. **`declare.md` §3's example is wrong** (reproduced): `panel: Menu = null` is refused —
   "declared without '?', so never empty; write 'Menu?'" — and `panel: Menu? = null` compiles.
   The agent met the refusal with its own `Sheet` attribute and named the example (account,
   §(a)). A one-character fix.
2. **Two runs, one overlay choice:** 7GUIs 4 and 5 both adjust the diameter in a centered modal
   that hides the circle. The overlays guide could say where a popover anchored to the thing being
   adjusted fits.
3. **Three library source reads** (`valuecontrol.declare`, `textinput.declare`) for the cell
   editor's lifecycle. The reference has it: `ValueControl.method.endEdit` — an edit ends when the
   person leaves the control, presses Return, or the control goes away. The agent did not ask
   `declare-help` about `endEdit`; a discovery miss, not a missing page.

## 5. Is it idiomatic Declare?

| | 7GUIs 4 | 7GUIs 5 |
|---|---|---|
| code | 655 lines Declare, 213 TS | 588 lines Declare, 171 TS |
| colour literals outside theme declarations | 1 | 0 |
| theme reads | 37 | 32 |
| States | 2 | 1 |
| visible switches | 7 | 7 |
| flexes | 11 | 9 |

Read task by task. **In the grain:** Temperature as two text attributes with `commit` that
converts the other; Flight's validity derived from the fields' text; Timer's elapsed time
integrated by a per-frame `onTick` with the clock running only while e < d; CRUD's `People`
dataset class making every write and the list a derived dataset holding the same records; the
circle drawer's undo steps kept in its dataset class; Cells' formulas in a TypeScript script file
of pure functions; the task shown is the App's `location` (an address, and Back), with `page`
derived from it, as 7GUIs 4 did. **Drifts:** the counter is a styled view rather than a read-only
field; the date fields' invalid look is a hand-made `State` instead of `validate`; the adjust
window is a centered `Dialog` (finding 2).

## 6. Seen running (beside 7GUIs 4, for DT's judgment of care)

`seen-g5-*.png` and `seen-g4-*.png` (Flight, CRUD); `seen-cells-open.png`. 7GUIs 4 shows more
care: a sidebar of numbered tasks with each task's challenge stated, and a line on how dates are
written; 7GUIs 5 is plainer, a tab strip and the format in the field labels.

## 7. The agent's account

Asked after the build by resuming the session read-only; answered on the first request (2,827
words).

# Building 7GUIs in Declare: an account for the Declare team

**First, a correction to my hand-over.** I told you the dev server was running at `http://127.0.0.1:8600/…`. Shortly afterwards the background task reported that `npm start` had **exited with code 1**. My shell is now disabled, so I can't read `/tmp/declare-dev.log` to find out why. The server check was also weaker than I made it sound. `curl` got HTTP 200 and 5,502 bytes for `sevenguis.declare`, which is almost certainly the host page; the compile happens in the browser. So "builds and starts with no errors" rests on `declare-verify` passing its first four rungs (R1–R4), not on the server. I don't know why the server exited, or whether it was crashing or being stopped by the harness.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. All of `docs/declare.md`.
4. Guide chapters 01, 04, 05 and 06, whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

That is the list the skill prescribes, about 3,600 lines.

**Then targeted reading:**
- Guide chapters 08 (controls), 18 (overlays) and 17 (your own views), whole.
- Chapter 22 (time), lines 1–140.
- Chapter 07 (scrolling), lines 40–135.
- Chapter 16 (collections), the § Virtualization part.
- Library source in `valuecontrol.declare` and `textinput.declare`, to learn the edit lifecycle.
- About 20 `declare-help` queries.

**What I skipped, and why.** I skipped these to save time and context, and because the skill says "then stop reading":
- 02 (notation) and **03 (constraints)**. I took constraints from `declare.md` §5 alone.
- **09 (pointer and keyboard)**. That was a mistake for Circle Drawer: it holds § Finding what is under the pointer and the key-routing rules that decide whether my ⌘Z binding works at all (see (f)).
- 11 (themes). I copied the shape from `todo-parts.declare`.
- **14 (data, 782 lines)**. I used `declare-help Dataset --all` instead.
- 15 (schemas), 19 (accessibility), 21 (motion).
- The tracker app, even though the skill points to it for "records people list, search, filter and edit", which is exactly CRUD.

**What taught me the most:**
- `declare.md`: it is genuinely the whole language, and its "seven differences" section prevented several React-shaped mistakes.
- The todo app: it showed the `onInit` + `afterSettle(() => Focus.focus(…))` idiom, `trackChanges`, and how a `Dataset` subclass looks.
- `declare-help`. The best single answer was `declare-help readonly`: "'readonly' is not a Declare name — … a value to read and select but not change is a Text with 'selectable = true'". That decided Counter in one query.
- The `Dataset` reference prose, which says how to fill a dataset from code: a body with the shape's empty form, then `set` in `onInit`.

**What was missing or misleading:**
- **`declare.md` §3 shows `panel: Menu = null` as a legal declaration.** The compiler refuses exactly that form (see (d)).
- `declare-help RadioGroup --example` and `TabBar --example` both returned "no guide example uses…", although the sampler uses both. I then grepped `apps/` and pulled 1.1 MB of `apps/docs/*.json` back; that was my clumsy grep.
- Nothing told me `Sheet` is a reserved name for my own classes. I had read about the library's `Sheet` in chapter 18 and still didn't connect the two.
- The guide never says what happens to an open edit when its control is removed. I found the answer in a comment in `valuecontrol.declare`: retiring a control mid-edit commits what was typed.

## (b) Expressing what I wanted

**Where it fit very well:**
- **Temperature.** "While editing, the field shows the person's text, not your value" is precisely the 7GUIs challenge. Two string attributes and two `commit`s that write the other side were the whole task.
- **Timer.** Gating the clock on the condition itself is lovely. `Time [ tick = frame, running = { elapsed < duration }, onTick(dt) {…} ]` gives "stops at d, resumes when d is raised" with no extra code.
- **Flight Booker.** It is a chain of derived booleans: `start`, `back`, `returnBad`, `inOrder`, `bookable`.
- **CRUD.** A filter that holds the source's own records (`shown: Dataset [ contents = … ]`) and a `People` dataset class gave the domain/presentation split almost by default.
- **Cells.** Writes that land in place and wake only the readers of that place matched "recompute only the dependents".

**Where I worked around it:**
- The Circle Drawer's "nearest containing circle" rule.
- The cell editor's lifecycle.
- Headers that stay put while the grid scrolls (I didn't build them).
- Keeping the dependency graph somewhere.

All four are detailed in (g).

## (c) The first time it ran

**I never saw it run.** As you asked, I didn't open a browser, take screenshots or drive it. The only "run" was `declare-verify`'s rung 4, a headless boot ("R4 ✓ boot (320 nodes, in Chrome, real text, a laptop)"), and it reported nothing wrong. So I have no running problems to report, and that is a hole in the evidence, not proof that there are none.

## (d) Every refusal and surprise

There were three `declare-verify` runs to a clean result, plus one after formatting. There were no boot findings and no layout findings.

1. **`class Sheet extends Dataset`** was refused with DECLARE5000: the name belongs to the library. I renamed it `Workbook`.
   - Judgement: my code was wrong, but the docs could list reserved class names. The suggested name, `SevenguisSheet`, was helpful.
2. **A method named `valueOf`** was refused with DECLARE2000: it is a member of every object. I renamed it `cellValue`. My error; a good catch.
3. **`sheet: Sheet = null`** was refused with DECLARE2000: write `Sheet?`. I changed it to `Workbook? = null`.
   - Judgement: the platform is consistent with itself, but **`declare.md` §3 says otherwise**, so that is a doc bug.
   - Unsure: this error was reported in the same pass as the "library class" error. I can't tell whether "a Sheet" in this message meant my class or the library's.
4. **After making it optional**, DECLARE6001 at two sites: "'classroot.sheet' may be absent here — check it … or … declare its type without '?'". I added `?.` at both sites.
   - This was a small circle: one message said add `?`, the next said check for it or remove it. What I actually wanted was "required, supplied by the use site".
   - `declare.md` says `count: number` with no default is "undefined until written". `sheet: Workbook` with no default might be the right form, but I didn't try it.
   - The result is that `classroot.sheet?.edit(...)` would silently do nothing if the sheet were missing. That is worse than an error.
5. **Lint DECLARE1002**, redundant parentheses, on `contents = { ({ … }) }` in `crud.declare` and `cells.declare`. I removed the parentheses. My defensive habit from the todo app's `({ … })`; harmless.

**No result behaved other than I intended, because I observed no results.**

## (e) Verifying it

- **`declare-verify`.** R1 caught refusals 1–3, R3 caught refusal 4, and the lint hints came alongside. Each run took a few seconds. Every message named its fix, and I applied each one literally. This is the best-feeling compiler loop I've used in a new language.
- **`declare-format --write`.** It reformatted five files, and verify was still clean afterwards.
- **`curl` against the dev server.** HTTP 200 for the program and its files, which proves little (see the correction at the top).
- **Not done:** no R5 assert scripts and no `declare-look`, per your instruction.
- **One doubt about the checker.** The skill says verify "lists the classes the boot never built". It listed none, and 320 nodes seems small for seven pages that include the Cells grid. Six of the pages are hidden (`visible = false`). I don't know whether their layout was checked.

## (f) Confidence, task by task

**Counter: high.**

**Temperature: high.** I made one choice: conversions are rounded to two decimals.

**Flight Booker: medium.**
- My message ends with a full stop ("…on 14.11.2026."), which the brief's example doesn't have. I invented the wording of the return-flight message.
- I'm unsure the red `State` override beats the library's own constrained `stroke` on `TextInput`.
- I didn't look up `Field [ label, stacked ]`; it compiled.

**Timer: medium-high.** I'm unsure the `ProgressBar` follows smoothly at 60 fps.

**CRUD: medium.**
- I'm unsure the shape of `Table.selection`'s `commit(sel: object)` is what I assumed (an array of records, whose last item I take). I'm also unsure whether `width = 100%` on the `TableRow` conflicts with the `Table`'s own layout.
- The filter ignores case. That is my choice; the brief doesn't say.
- A person filtered out of the list stays selected underneath and is selected again when they reappear.

**Circle Drawer: lowest.** Where I'd expect a tester to find problems:
- **⌘Z / ⇧⌘Z probably don't work after clicking the canvas.** The bindings sit on `CircleTask`; the canvas can't take focus, so a click there clears focus, and the key walk starts at the App. The Undo and Redo buttons should still work.
- Selection depends on `canvas.hovered`. I'm unsure how it behaves while the context menu opens over the canvas. I stored the target in `menuFor` to guard against that.
- `closed()` on the `Dialog` records the history step. I'm unsure whether overriding it skips something the library does there.
- Redo puts a removed circle back at the end of the list, so it paints on top of the others.

**Cells: medium-low.**
- I'm unsure that virtualization engages inside the two-axis scroller, three levels down.
- I'm unsure whether `onDoubleClick` on a cell view fires reliably with a `TextLabel` inside it.
- The Escape binding relies on the order in which key bindings are read.
- **The header row scrolls away**, so column letters disappear when you scroll down.
- Cells can't be edited from the keyboard, because they aren't focusable.
- My own logic for formulas that refer to each other in a loop marks everything downstream of the loop as `#CYCLE`. That is arguably right.

**The shell (tab bar and pages): high**, apart from the dev-server exit, which I can't explain.

## (g) Gaps I worked around

1. **The circle "nearest the pointer that contains it".**
   - What I wanted: one circle view per record that answers its own presses.
   - The drift check discourages hit-testing by hand, but views answer by topmost circle, not nearest.
   - What I did: a `nearestAt(x, y)` method on the model, a canvas that tracks the pointer, and circle views with `pointerEvents = "none"`.
   - Judgement: the spec's rule really does need geometry over all circles. But I didn't read chapter 09 § Finding what is under the pointer, so `viewAt` or something else there might serve. Unsure.
2. **Headers that stay put along one axis only.**
   - `ignoreScroll` pins both axes. I thought about `y = { scrollY }` and dropped it.
   - Judgement: unsure whether this exists; I didn't search beyond chapter 07.
3. **A non-reactive dependency index.**
   - I avoided a `Map` that is changed in place, because of the rule that "state that changes is an attribute". Instead I store `refs` in each cell record and rebuild the reverse map on every edit, scanning 2,600 cells.
   - Judgement: probably fine, and possibly over-cautious.
4. **In-place editing of a cell.**
   - No guide section covers it. I read library source and chose the `onBlur` / `onEnter` / Escape handling plus `commitOn = "end"` from that reading.
   - Judgement: the platform probably supports this well. The docs are thin here, and an example would help.
5. **A list of 26 column letters to replicate over.** I used a derived dataset fed by a script function. That's probably the intended way: replication needs data.
6. **A required node attribute.** See refusal 4 in (d).

## (h) Changes of direction

All but one happened before the first compile, or because of refusals:

- **Refusals:** `Sheet` became `Workbook`, `valueOf` became `cellValue`, the attribute type became optional, `?.` was added, and the parentheses went.
- **After reading library source:** the cell editor first relied on `onBlur` alone. I worried about the order in which blur and commit happen, read the source, and added the `onEnter` override and the Escape binding.
- **Before writing anything, on second thoughts:**
  - The diameter window: `Window` → `Dialog` (modal fits "close = one step").
  - The flight choice: pop-up button → `RadioGroup`, for simplicity.
  - Grid cells as `Control`s → plain `View`s (2,600 Tab stops).
  - Sticky headers: dropped.

## (i) The code, quoted (reconstructed)

```
class Sheet extends Dataset [ schema = [ rows[]: SheetRow ],
    onInit() { this.set(["rows"], blankSheet()) },
```
> 'Sheet' is a library class — a class of the program can't take its name; rename yours, as 'SevenguisSheet' (the library's is used as 'Sheet [ … ]') [DECLARE5000] (cells.declare:48:1)

```
    valueOf(id: string) -> CellValue {
        const c = this.cell(id)
        return ({ kind: c.kind, num: c.num, shown: c.shown })
        },
```
> Sheet.valueOf: 'valueOf' is a member of every object — choose another name [DECLARE2000] (cells.declare:60:5)

```
class Spreadsheet [ scrolls = both, clip = true, …
    sheet: Sheet = null,
```
> Spreadsheet.sheet's default expects a Sheet — declared without '?', so never empty; write 'Sheet?' to let it be null, got 'null' [DECLARE2000] (cells.declare:125:20)

Compare `declare.md` §3: `panel:    Menu    = null,              //   a class — the attribute holds an instance`.

```
    sheet: Workbook? = null,
    …
        body: View [ datapath = { classroot.sheet.value },
    …
                        commit(t: string) {
                            classroot.sheet.edit(:id, t)
```
> 'classroot.sheet' may be absent here — check it ('if (classroot.sheet != null) …'); or, if it is always there, declare its type without '?' (an attribute or parameter written 'Menu' is never empty, 'Menu?' may be) — 2 sites, also on line 174 [DECLARE6001] (cells.declare:148:35) — hint: TypeScript 18047

```
    shown: Dataset [ schema = [ people[]: Person ],
        contents = { ({ people: classroot.people.all().filter((p) => classroot.matches(p)) }) } ],
```
> hint: redundant parentheses — the { } already delimits the expression, so the outer ( ) do nothing here; { { people: … } } says the same [DECLARE1002] (crud.declare:61:23)

The same hint fired at `cells.declare:131` for `columns: Dataset [ contents = { ({ cols: columnLetters() }) } ]`.

## Overall

**Surprises:**
- How little went wrong at compile time: five issues, all in about four minutes of work.
- That a name I'd just read about in the docs (`Sheet`) was off-limits for my own class.
- That a control removed mid-edit commits what was typed (sensible, but found only in source).

**Good:**
- Diagnostics that name the fix.
- `declare-help`'s answers for foreign names.
- A fast verify ladder.
- A library that already had what 7GUIs needs: `Table`, `Dialog`, `ContextMenu`, `TabBar`, `Field`, `ProgressBar`.
- Value controls that handle "keep showing what the person is typing".
- Clean separation of the model into `Dataset` subclasses.

**Bad:**
- The cost of getting started: roughly 3,600 required lines before writing a line, plus more for anything non-trivial.
- A doc example that the compiler refuses.
- A reserved-name space that isn't documented.
- `--example` covers the guide only.
- The real risks are interaction semantics: where focus goes, which way keys travel, the shape of a selection commit. These are invisible until you drive the app, and the docs for them were exactly the chapters I skipped.

**What it reminded me of:**
- QML most of all: a tree with typed properties, bindings as standing expressions, and `Item`-like views.
- OpenLaszlo's datapaths, as its README says.
- Elm and Rust in its diagnostics.
- It is unlike React: no render, no hooks. The habit I had to suppress was writing things as callbacks.

**The sharpest edge** is a pattern, not one obstacle: **behaviour at the seams between controls.** Examples are what happens to an edit when a control goes away, whether a key reaches a binding after a click on a surface that can't take focus, and what a `Table` hands to `commit`. Each cost me only a few minutes, but together they are most of my uncertainty. To write them right the first time I would want a short "lifecycle and routing" page: edits, focus and keys, each with one diagram-like example. Running R5 scripts would have answered them too.

**Where I'd most want improvement:**
- Fix the `Menu = null` example and list the reserved class names.
- Offer a "required, set by the use site" attribute form.
- Make `--example` search the apps as well as the guide.
- Have verify say plainly which hidden screens it did not lay out.

**What I'd use it for:** internal tools and data-heavy desktop-style web apps (dashboards, record editors, the 7GUIs kind of program), especially where an LLM writes most of the code and the compiler acts as reviewer. I'd hesitate where I need a large ecosystem of third-party components. That judgement rests on one small build, so it is tentative.
## 8. The names ledger

```
NAMES — eval-7guis-5: 0 missed name(s), 1 collision(s), 2 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

COLLISIONS (min · held by · name)
     6 · library class  · Sheet

DECLARE-HELP MISSES (min · asked for · answered)
     2 · readonly · 'readonly' is not a Declare name — the HTML instinct: a value to read and select but not change is a Text with 'selectable = true' (a TextInput is for editing);
     2 · editable · TextInput has no member 'editable' and nothing near it — the member table: declare-help TextInput

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
