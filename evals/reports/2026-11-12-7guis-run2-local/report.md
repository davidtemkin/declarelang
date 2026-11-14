# 7GUIs run 2: Opus 5.5, Declare, on the LOCAL tree (renames, identityKey, and the Venue/Ledger fixes)

**16.9 min, 100 turns, 78.1k output tokens; 7 of 8 hidden checks delivered, and 7 of 8 at its
first clean boot (8.6 min).** Run 1 (pushed tree): 15.0 min, 6 of 8. The miss, both times, is Cells:
the sheet draws its column letters and row numbers, so a screen reader — and the drive, which reads
the accessibility tree — finds no headers. Part platform: Declare has no `rowHeader` role, so no
Declare program can pass that check today; with text headers (the audit's variant) everything else in
the brief holds.

Timing record: `evals/timings/2026-11-12-7guis-run2-local.txt`.

## Clean bill of health: all four counts fail; friction cost about 6.2k tokens (8%), 2.0 min (12%)

Platform: inside a handler, once a write has left work pending, reading an attribute with a `{ }`
default re-runs it — `{ new Map() }` handed back a fresh empty Map (the agent redesigned the Cells
model around it); a false DECLARE2000 on a local `const x` in a view whose `x` is constrained; a
disabled `TextInput` looks enabled; when a field's `onEnter` moves focus to the view around it, Return
runs again there (every committed cell opens the next); no `rowHeader` role, and a scroller's label is
dropped. Tools: a `drive` path matching two views silently takes the first and then blames motion;
locators are not strict as documented; DECLARE4035 exempts a scroller whose label the runtime drops;
`declare-help` misses `readOnly`, `onPointerLeave`. Names: `Sheet` and `visible` collided; `readOnly`,
`onPointerLeave` unhinted. Reference: three doc-gap reads (what `Table.commit` receives; a field's
error outline; editing a value in place has no worked example). All are being fixed.

## Audit

**Effort.**

| | Wall time | Tool calls | Output tokens |
|---|---|---|---|
| Build | 16.9 min (02:43:51 → 03:00:43 UTC) | 99 | 78.1k (the timing record agrees) |
| Reading and planning, to the first app write (#31) | 5.2 min | 30 | 23.8k |
| Writing the eight files (#31–#40) | 2.8 min | 10 | 26.3k |
| Compiling, looking, scripting, fixing, serving (#41–#99) | 8.9 min | 59 | about 28k |

`#n` is the n-th tool call of the build. Token figures are the output tokens of the turns that produced those calls, taken from the first usage the transcript records for each message. Thinking is redacted (0 characters, except one 166-character note at #69), so I can't split it out.

- **Which tree.** Every repro ran on the agent's platform copy, `~/Code/eval-7guis-2.noindex/work/declarelang`. Its `runtime/src`, `library/`, `tools/`, `compiler/` and `docs/` match `~/Code/Declare`'s working tree; the only differences are untracked extras (`docs/system-design`, `tools/internal/pointer`, sim logs, a tsbuildinfo). So every defect below is present on the uncommitted local tree.
- **Repros** are in `/private/tmp/claude-503/-Users-temkin-Code-declare-overlay/6a505da1-0494-4b83-acec-f4d7f2048458/scratchpad/g2-audit/`. `snap69/` is the app rebuilt from the transcript as it stood at #69 (`rebuild.py`). `plat/` is a scratch copy of the platform holding one variant of the app (`my-apps/7guis-texthead`, headers as `Text` views). To run the hidden drive on that variant I started a dev server on port 8377 and stopped it afterwards. I touched no other port and no Chrome by hand.

### The main lead: the Cells sheet is invisible to assistive technology

**What the drive saw.** At first boot and delivered alike: `FAIL cells … no sheet with column "A" and row "0" visible (last seen: "0 column letters, 0 row numbers")`.

- `colHeads` and `rowHeads` (`cells.declare` ~266–300) paint the letters and numbers with `d.fillText` in `draw(d)`. Drawn text is pixels: it isn't in the accessibility tree, isn't found by `find()` or a locator, and isn't seen by the drive's fallback (visible `StaticText` lined up along the top and left).
- The rest of the sheet says nothing either. `declare-look --semantics` on `app.location=cells` prints only the tab panel, the `A0` label and the help line. The focused `Spreadsheet` is a `DIV` with computed role `generic` and an empty name, although it sets `accessibilityLabel = "Spreadsheet"` (see T3). The cells are role-less views. The selected cell is a fill and a ring, and nothing announces it.
- Run 1 failed the same scenario for the same reason ("no grid, cell or header roles"). Its headers were not drawn, so it reached the role check. This run fails one step earlier.

**Does Declare offer a correct way? Mostly yes, with one hole.**

- **Roles.** `AccessibilityRole` has `grid`, `row`, `cell` (rendered `gridcell`) and `columnHeader`. `View.accessibilityActiveItem` is documented for "a composite of your own that keeps the focus while arrows move a highlight", which is exactly this sheet.
- **A repro shows it works** (`a11y-grid.declare`). A `scrolls = both, focusable` view with `accessibilityRole = grid`, a header `row` of `columnHeader` Texts, virtualized `row`s of `cell`s, and `accessibilityActiveItem` comes out in Chrome as `grid "Spreadsheet"`, `columnheader A/B`, `row`, `gridcell "5" [selected, active]` and `aria-activedescendant`.
- **There is no `rowHeader` role.** The vocabulary in `a11y-vocab.ts` stops at `columnHeader`, though ARIA has `rowheader` and AppKit and UIKit have row headers. A sheet's row numbers can only be `cell`s.
- **The drive's role path needs `rowheader`** (`drive.mjs:920–921`, at least three of each). So a Declare program can't pass Cells by role at all.
- **My variant** (`plat/my-apps/7guis-texthead`) changes only the header views, to `Text`s with `columnHeader` on the letters. The drive reports "accessibility: the sheet has no grid, gridcell, columnheader or rowheader in the tree … (**everything else met**)". With text headers the agent's sheet does the whole brief; the remaining fail is the role gate that `rowHeader`'s absence makes unreachable.

**Is it taught where a sheet builder would look? No.**

- **Guide 17, "Text in a drawing"** teaches `fillText` and `measureText` with no word that drawn text is unread. The nearest line is "Draw the part that is genuinely a shape; leave the box to attributes".
- **Guide 19, "Your own controls"** shows a drawn slider and a `ChoiceControl`. It shows no composite: no grid, rows, cells or active item. The `grid` role appears only in the role list.
- **`DataGrid` and `Table`** expose their structure themselves. The brief forbids a ready-made grid, so an agent never reaches those.
- `declare-help View.accessibilityActiveItem` has the right sentence, but nothing leads a sheet builder to it.

**Did declare-verify say anything? No.**

- The one accessibility result of the run was DECLARE4035 on the Circle Drawer canvas.
- The compiler's drawn-view check (`a11y-check.ts:386`) fires only for a drawn view that takes the focus. Here the drawing views don't take focus, and the focused view doesn't draw.
- DECLARE4035 would have flagged the `Spreadsheet`'s role-less label, but it exempts scrollers (T3).
- The agent never ran `--semantics` on the Cells page; it ran it once, on Counter (#62).

**Was drawing chosen for performance? No evidence.**

- The transcript has no text about it. The account (g4) gives pinned headers as the reason.
- The headers are 26 letters and 100 numbers. The rows are already virtualized views, and the row numbers can be replicated the same way.
- My variant boots at 272 nodes against 244 and verifies clean. I did not measure frame time.

**Verdict.**

- **Platform gap:** no `rowHeader` role. This is decisive for the drive.
- **Doc gap:** drawn text is invisible, and a composite of your own is untaught. This is decisive for the agent's choice.
- **Tool gap:** DECLARE4035's scroller exemption (T3).
- The **agent's own miss:** it never asked `--semantics` about the sheet.

Suggested fixes, smallest first:
1. One sentence in guide 17's "Text in a drawing": words a person reads (a label, a heading, a number) belong in a `Text`, because drawn text reaches no screen reader, no `find()` and no search.
2. A short "a composite of your own" paragraph in guide 19, with `grid`/`row`/`cell`/`columnHeader` and `accessibilityActiveItem`.
3. Add `rowHeader` to the vocabulary.

### Platform defects

**P1. In a handler, once a write has left work pending, reading a `{ }`-defaulted attribute re-evaluates its default live. A `{ new Map() }` default then hands back a fresh, empty Map, so the Cells model computed nothing (account d13).**

- **The app's code** (`snap69/…/cells.declare:42–43, 71–84, 131`):
  - `_exprs: Map<string, Expr> = { new Map() }`.
  - `setFormula` does `_exprs.set(id, e)`, then `this.set([… "f"], f)`, then `recompute(id)`.
  - `evaluate` reads `_exprs.get(id) ?? { kind: "empty" }` and stores "", so every value stayed null.
- **Bisected in the page.**
  - `a = sheet._exprs` keeps its identity across reads.
  - After `sheet.set(["rows",0,"cells",0,"f"], "x")`, `sheet._exprs !== a`.
- **Minimal form** (`map-pending.declare`). It is `_m: Map<…> = { new Map() }` with a method `{ _m.set(k, 1); <any write something reads>; seen = _m.size }`.
  - `seen` is 0, on a `Dataset` subclass and on a plain `View` alike.
  - After the settle, `_m.size` is 1: the mutation landed in the stored Map, and the reads in between saw a throwaway.
  - With no reader of the write, there's no pending work and it's right (`map.declare`, `map2.declare`, `map3.declare`).
- **Cause.** `attributes.ts:566` takes the untracked read path. `declStale(self, name, isSettling())` asks `workPending()` for a read outside a rule (`attributes.ts:1032–1037`: "for a read outside one (a handler), while ANY work is pending — the store lags the world until the settle"), and `evalDefault` runs the `{ }` again. That assumes a default is a pure function of its inputs. An allocating default (`new Map()`, `new Set()`, `[]` as a cache) loses its identity.
- **Docs.** declare.md §script says to "hold that state in a node", which the agent did. Nothing in docs or corpus uses or warns against an object-allocating default.
- **Fix direction.** A default with no reads can never be stale. More generally, don't re-evaluate live when the stored value's inputs haven't changed. Failing that, refuse an allocating `{ }` default and say `= null` plus `onInit`.
- **The account's mechanism is wrong.** In-place mutation isn't lost. Reads during pending work see a fresh object, so its proposed analyser rule (refuse `.set`/`.add` on an attribute's value) would refuse correct code.
- **Cost:** 4.1k tokens and 1.1 min (#67–#71, less #67's `--dblclick` misuse). The agent also redesigned the model around it: a `Record` replaced wholesale, plus a parse memo in script.

**P2. DECLARE2000 refuses a block-local `const x` (or `y`) in any method of a view whose `x` is constrained, as if the method wrote `this.x`. The x/y half of account d5 is right.**

- **Repro** (`shadow.declare`, `shadow2.declare`). `View [ x = { app.off + 10 }, onClick() { const x = 5; console.log(x) } ]` gives "View's own 'onClick(…)' writes x, which it binds with a constraint … [DECLARE2000]".
- **Runtime behaviour is correct.** With `x = 10`, `test() { const x = 77; got = x + 1 }` leaves `x = 10` and `got = 78` (`shadow3.declare`). So this is a false refusal of correct code.
- **Cause.** `check.ts:2051–2052` matches `(?:^|[^.:\w$])(?:this\.)?x\s*=(?!=)` against the method text. `const x =`, `let x =` and `for (let x = 0` all match.
- `x` and `y` are the most natural locals in a `draw()`. The suggested fix (an `edited` attribute) misdirects.
- **Fix.** Skip declarations, or better, ask the TypeScript AST for assignments to the member.
- **Cost:** about 0.2k tokens. It came in one round with four other refusals; the agent renamed to `left` and `top`.

**P3. A disabled `TextInput` looks exactly like an enabled one (account d19).**

- **Repro.** `disabled-field.declare` and `.png`: the enabled and disabled fields are identical, and the disabled button is dimmed.
- **What the docs promise.** `control.declare:46–47` says "Concrete controls also dim themselves against `provided("theme").disabledOpacity`". TextInput never reads `disabled` for its look. It isn't among the 15 library files that read `disabledOpacity`.
- **Cost:** about 0.4k tokens and 0.1 min. The agent added a `State` on `DateField` (part of #80).

**P4. Return handled twice: when a field's own `onEnter` hands the focus to the view around it, that view's `Enter` binding runs too. In the delivered sheet, every Enter that commits a cell opens an editor on the cell below. Nobody noticed, and the account doesn't mention it.**

- **What the docs promise.** `TextInput.keyBindings` says "a form's field, or one whose `onEnter` says what Return does, has answered it, and it goes no further".
- **Repro** (`enter3.declare`). A focusable view with `keyBindings = [Enter → startEdit]` holds a `TextInput` whose `onEnter` counts.
  - With `afterSettle(() => Focus.focus(parent))` in `onEnter`, `gridEnters = 1`.
  - Without it, `gridEnters = 0`.
- **In the app.** A logged stack shows `startEdit` reached from `walkKeys` → `baseKeyDown` after the field's `onEnter` → `stopEdit(true)` → `afterSettle(Focus.focus(this))`. After Enter in F10, F10 = 5, the selection is on F11, and `editing = "F11"` with its field focused.
- **Effect on the drive.** It recorded "Enter didn't end the edit of A1; pressed Tab" for every edit (variant run), as a fallback, not a fail.
- **Why the agent's script missed it.** Every edit there began with a double-click, so the stray editor was blurred unchanged.
- **Cause (unsure of the exact code path).** `_returnAnswered` is asked of the focused view's chain when the walk runs. The settle between the native `onEnter` and the walk has already moved the focus, so the walk starts at the grid.
- **Cost:** 0 tokens during the build. It is an outcome defect.

**Platform gap G1 (not a defect).** There is no `rowHeader` accessibility role (see the main lead).

**Library gap G2. There's no read-only `TextInput`** (account g1). 7GUIs' Counter asks for one.

- `declare-help readOnly` misses with no hint (T4).
- The agent's `admit` returns null, which works. But the field is still announced as editable.
- A platform read-only field exists on the web, AppKit and UIKit. A `Text [ selectable = true ]` is the nearest idiom; nothing points to it.

### Tool defects

**T1. A `drive` path by text silently takes the first of two matches (account d14).**

- **Repro.** In `ambig.declare` + `.mjs`, a `TextInput [ accessibilityLabel = "Count" ]` and a `Button [ label = "Count" ]` share a parent. `drive.click("app.row.Count")` presses the field, and `app.count` stays 0.
- **No ambiguity error.** `verify.md` § view paths doesn't say what happens on two matches.
- **The failure message misleads.** It says "(motion is still in flight … drive.settleMotion() runs it to rest; 2 timers still waiting …)".
  - In this app that tail is on every failure, because the Timer's frame clock always runs.
  - A tail that is always present reads as a cause.

**T2. Locators are not strict, though `verify.md:162` says "strict when two match".**

- **The agent's case (#63).** `expect(page.getByLabel("Count")).toHaveValue("3")` got "".
- **Repro.** `ambig3.mjs` on the delivered app: `getByLabel("Count").count()` is 3: the tab "Counter", the tab panel "Counter" and the field. They match by substring, as Playwright's do. The expectation then read the first (the tab, value "") and appended the same motion tail.
- **The account's guess is wrong.** It hit the tab, not the button.
- Playwright would have thrown a strict-mode violation naming all three.
- **Cost of T1 + T2:** 1.3k tokens and 0.6 min (#61–#64). With a "2 views say 'Count'" error at #60, the probes at #61 and #62 and the failed locator at #63 go away.

**T3. DECLARE4035 exempts a scroller, but the runtime drops a scroller's label.**

- **Where.** `a11y-check.ts:308–313` exempts `scrolls` ("a scroller as a stop") from "has an accessibilityLabel but no role". But `semantics-dom.ts:97–99` writes only `tabindex` for a role-less scroller.
- **Repro.** `scroller-label.declare`: both labelled scrollers are `generic` with an empty name, and verify is silent.
- **In this run.** The `Spreadsheet`'s label never reached anything, and the one warning that would have made the agent decide on a role (`grid`) didn't fire.
- **Two fixes.** Either the runtime names a labelled scroller (it would need a role, since ARIA forbids naming `generic`), or the exemption goes.

**T4. `declare-help` misses foreign names without a hint.**

- `readOnly`: HTML, AppKit and UIKit all have it. Nothing points to `admit` or to a selectable `Text`.
- `onPointerLeave`: the DOM event. Nothing points to `hovered`. The agent found `hovered` by itself.

**T5 (minor; unsure whether by design). A class-name collision stops R1 alone.**

- **Repro.** `r1-split.declare`: `class Sheet` plus a method named `visible` reports only the Sheet error. The other structure errors arrive on the next run.
- **In the run.** #42 got the Sheet collision alone, and #44 then got five DECLARE2000s at once.
- **Cost:** about 0.2k tokens and 0.1 min (one round). The union refusal before it is a parse error, and stopping on that is normal.

**T6 (minor, a message, eval environment).** The dev server's "port 8200 is already taken … `PORT=8201 npm start`" suggests a port without checking it. 8201 was taken too, and the agent waited 30 s on a 404 from that other server (#93–#95).

### Docs and help

**D1. Drawn text and custom composites are untaught.** See the main lead: guide 17 "Text in a drawing" and guide 19 "Your own controls".

**D2. `Table.commit(sel)` doesn't say what `sel` is.**

- Its reference says "the default writes `selectedItem` and `selection`", with the example `commit(sel: object)`.
- It doesn't say that `sel` is the new selection as an array of items in presented order, or null. Nor does it say that `list.commit([item])` is how a program selects.
- The agent learned both from the source (#28: `table.declare:220–222, 267`).

**D3. `ValueControl.error` says the error "is what the field shows" but not how.**

- The brief's "the field is red" needed the fact that a `TextInput` outlines itself in the theme's `error` color while `error != ""`.
- The agent grepped `textinput.declare` for `stroke` to learn it (#28, line 314).

**D4 (teaching, small). The in-place editor isn't shown anywhere.** That is a field that appears over a display, ends on Return or leaving, and cancels on Escape.

- The facts are in guide 08 (`commitOn = "end"`, leave/Return/Escape) and in the reference (`TextInput.keyBindings`, `ValueControl.beginEdit`/`endEdit`/`cancelEdit`), and the agent had read guide 08 whole.
- It confirmed the order in source (#29–#30). The same pattern sent the Ledger run 5 agent to the same files.

### The eval harness (not product tools)

- **The 7GUIs drive doesn't accept Chrome's `image` role** for the canvas (`drive.mjs:248` lists `img`, …, not `image`).
  - The agent's `accessibilityRole = image, accessibilityLabel = "Circles"` is `image "Circles"` in the tree (`computedRole` "image").
  - So "no canvas named in the tree; used the largest area below Undo" is the drive's miss, not the app's. Ledger's drive has both.
- **The drive's Cells role gate needs `rowheader`**, which Declare can't express (G1).
- **The note "Tab never reaches the adjust window's slider" is the app's.**
  - Per `Window`'s reference, a `Window` opened by `open = { … }` doesn't take the keyboard. "A press inside it", `enter()` or F6 does.
  - The agent never called `enter()`.
  - Whether a window the program opens should take the keyboard by itself, as an OS window becomes key, is a design question. I'm unsure.

### Names

**Collisions with Declare names: two, both renamed by the agent.**

- **`class Sheet`** for the spreadsheet's model, refused because the library's `Sheet` is the bottom sheet. It became `Workbook`.
  - "Sheet" is the natural name here, and the collision is unavoidable.
  - The message is clear and offers `MySheet`.
- **A method `visible(p)`** ("p if it is visible under the filter"), refused because `View.visible` is an attribute. It became `ifShown`. The message is clear.

**Not collisions.**

- `valueOf` is JavaScript's, and the catch was right.
- The `x`/`y` local renames were forced by P2, not by a real collision.
- `CircleDoc.draw(x, y, d)` → `add` was the agent's own second thought before compiling. `CircleDoc` is a `Dataset`, so nothing would have refused it.

**Foreign names: two misses, neither with a useful hint.** `readOnly` and `onPointerLeave` (T4).

**Old names: none.** I scanned the app and every tool input for the renamed members: `input(`, the Table `selected =`/`.active` forms, `choices`, `inkColor`, `openAt`, `openFor`, `navigate(`, `onDblClick`, `stretches`, `outline =`, `headerH`, `motion =` and `blend`.

- The current names are used throughout: Table `selectedItem` and `commit`, TabBar `items` and `commit`, `showAt` on the ContextMenu, Window `open`/`commit`, and `onDoubleClick`.
- The only hits were the agent's own `selected` attributes.

### Every refusal, finding and changed behaviour

| # | Written | Platform said or did | Verdict |
|---|---|---|---|
| 41 | `v: number \| string` in a schema | DECLARE5000 | Agent. By design: a schema field is one type. The message names both alternatives. |
| 42, 43 | `class Sheet` | DECLARE5000 (twice: macOS `sed \b` didn't rename) | **Collision** (Names). The second time was the agent's tooling. |
| 44 | method `visible(p)` | DECLARE2000 | **Collision** (Names). |
| 44 | `valueOf(id)` | DECLARE2000 | A correct catch. |
| 44 | `const x`/`const y` in `draw()` | DECLARE2000, "writes x … bind 'x = { edited }'" | **P2**: a false refusal. |
| 44 | `sheet: Workbook [ ]`, filled in `onInit` | DECLARE2000, "a Dataset needs data" | By design (`check.ts:921–932`). A cheap placeholder body. The docs could say that a dataset building itself in `onInit` starts from `{ { "rows": [] } }`. |
| 45 | `fontWeight: semibold` in a `{ }` record | DECLARE4001 | Agent. declare.md: the bare vocabulary stops at the brace. |
| 45 | canvas label, no role | DECLARE4035 | A correct warning. `image` is a fair role. |
| 45 | 4-part `backTooEarly` | DECLARE4025 | Fair lint, and the result reads better. |
| 45, 71 | `{ ({ rows: … }) }`, `{ ({}) }` | DECLARE1002 hint | Correct. The corpus's `({ … })` style inside method bodies and arrays (to-do app) makes it mildly surprising, not wrong. |
| 46 | `as Person?` in a body; `?.value` without `?? null` | DECLARE6001 ×3 | Agent. Documented, and the messages name the fix. |
| 60–63 | `drive.click("…row.Count")`, `getByLabel("Count")` | Wrong view pressed or read; motion tail | **T1, T2.** |
| 64 | locator `.or()` | Not supported; make two locators | A good message. |
| 65–66 | `getByRole("dialog")` mid-motion | "got no element … let it land first" | A correct message. The role is `dialog` (`dialog.declare:226`), so the account's `alertdialog` guess is wrong. |
| 66–71 | `_exprs` `Map` default | Values stay null, silently | **P1.** |
| 67 | `--dblclick PATH X,Y` | "84,36 is not an option" | Agent. `--click-at` takes a point; `--dblclick` doesn't. |
| 71, 73 | typed "7" over "5"; SUM = 35 | Assertions | Agent's test (account d17). |
| 74–88 | Z99 under the scrollbars | Seen in a picture | Agent. `reveal()` ignored scrollbar room; not a platform defect (see item 4 of the next section). |
| 74–80 | menu covers the canvas, so the hover selection drops | Seen | Agent's design; the `held` fix is right. |
| 74–80 | disabled date field looks enabled | Seen | **P3.** |
| 74–80 | CRUD filter shows "Search" | Seen | SearchField's documented default placeholder. |
| 90–98 | `npm start` | 8200, then 8201 taken | Eval environment, plus T6. |
| drive | Cells | 0 column letters, 0 row numbers | Main lead: D1, G1 and T3, and the agent's choice to draw. |
| drive | every Enter in a cell | "Enter didn't end the edit" (variant run) | **P4.** |
| drive | circle canvas | "no canvas named in the tree" | Drive (harness) miss. |
| drive | Tab to the slider | Never reached | App (no `enter()`); a design question. |

### Reads of library/ source

There were four files and no runtime reads. All four were read while planning, before the first write (#31, 02:49:00).

| # | Read | Looking for | Verdict |
|---|---|---|---|
| 24, 28 | `table.declare` (`head -150`, then grep `commit\|selectedItem =`) | What `commit(sel)` receives; how to select a new record | **Doc gap (D2).** The first 150 lines largely repeat the `declare-help Table --all` read at #19; the grep found lines 220–222 and 267, which no reference says. |
| 24 | `tabbar.declare` (all 53 lines) | How TabBar carries items | **Fair, and redundant.** It is the reference prose plus a 4-line class. The answer it used, `location`, came from `declare-help SegmentedItem.location` in the same call. |
| 28 | grep `stroke\|fill =` in `textinput.declare` | Whether a field turns red on error | **Doc gap (D3).** |
| 29–30 | grep and `sed` of `textinput.declare` and `valuecontrol.declare` for `endEdit`/`cancelEdit`/`onBlur`/`beginEdit` | The edit lifecycle for the cell editor | **Doc gap, teaching only (D4); unsure.** Every fact it used is in guide 08 and the reference, which the agent had read. What's missing is the pattern, not a fact. |

### Where the account is wrong against the transcript

1. **d13, the `Map`.** In-place mutation isn't lost: the stored Map gets it. Reads made while work is pending see a freshly evaluated default (P1). The proposed analyser rule would refuse correct code.
2. **d14.** The path didn't "prefer accessible names". Two views matched and the first in child order won, silently (T1). `getByLabel` didn't hit the button; it hit the tab "Counter", by substring, non-strictly (T2).
3. **d16.** The dialog's role is `dialog`, not `alertdialog`. The tool's message ("let it land first") gave the actual cause, and the agent's fix followed it.
4. **d18, "padding didn't extend the scroll range".** It does: `padscroll.declare` shows `grid.height` = rows × 24 + 16 and the scroll limits include it.
   - The Z99 picture came from `reveal()`, which scrolled a cell exactly to the frame's edge, under the classic scrollbars of the verify page.
   - The fix that worked (#87) changed `reveal` to subtract the margin. The explicit size was incidental.
5. **(f) Cells, "untested: clicking another cell mid-edit, Escape".** Both work (`blur-commit.mjs`: A0 = 5 after a click away, A2 = 7 after Tab, A3 empty after Escape). Ledger run 5's P3 (an edit dropped when its field is put away) is fixed on this tree.
   - Untested and broken: Enter opens an editor on the cell below (P4). The account doesn't know.
6. **(a), "Reading the library source answered the two questions the help entries didn't".** It also read `tabbar.declare` and the TextInput `stroke` lines while planning. That makes four library files, as the timing record says.
7. **"R1–R4 … reported all errors in a phase together (five at once in one round)".** True for #44. But the Sheet collision came alone at #42 (T5).

These parts are accurate against the transcript:
- every quoted message in (d) and (i);
- the `const x` false positive (d5);
- the disabled-field look (d19);
- `readOnly` having no hint;
- the port housekeeping.

### Friction cost

**Method.** For each episode I summed the output tokens of the turns from the first call that met the problem to the one that resolved it. Time is from transcript timestamps, so it includes tool run time. Where one turn mixed a defect with the agent's own fixes, I took a share by the edits' size.

| Kind | Episodes | Tokens | Time |
|---|---|---|---|
| **Platform defects** | P1 `Map` default (#67–#71) 4.1k / 1.1 min; P2 `const x` (share of #44–#45) 0.2k / 0.1 min; P3 disabled field (share of #80) 0.4k / 0.1 min; P4 unnoticed, 0 | **4.7k** | **1.3 min** |
| **Tool friction** | T1 + T2 paths and locators (#61–#64) 1.3k / 0.6 min; T5 split R1 (#42) 0.2k / 0.1 min | **1.5k** | **0.7 min** |
| **Total, platform and tools** | | **6.2k (8% of 78.1k)** | **2.0 min (12% of 16.9)** |
| Eval environment | ports 8200/8201 (#93–#96), with T6's message | 0.7k | 0.6 min |
| The agent's own mistakes | `sed \b` (#43) 0.3k; `semibold`, `T?`, `?? null` (share of #45–#47) about 1k; `--dblclick` misuse (#67) 0.5k; test slips (append, 35, `.or()`, role and settle; #64–#66, #72–#73) about 2k / 0.8 min; `reveal` and scrollbars (#80–#88 share) about 2.5k / 1.3 min | about 6.3k | about 2.5 min |
| Legitimate checking | screenshots, the assert script and reruns, `--semantics` on Counter | the rest of #41–#89 | |

The largest cost isn't in tokens. It is the Cells scenario failed at first boot and delivered, which comes from D1, G1, T3 and the agent drawing its headers.

### Clean-bill verdict

1. **Platform — FAIL.**
   - P1: a `{ }` default re-evaluated live mid-handler, so a `Map` was silently replaced.
   - P2: a false DECLARE2000 on a `const x` local.
   - P3: a disabled TextInput isn't dimmed.
   - P4: Return walks on after `onEnter` moves the focus.
   - Gap G1: no `rowHeader` role, which makes the drive's Cells gate unreachable.
2. **Our tools — FAIL.**
   - T1: a drive path by text silently takes the first of two matches, and the failure carries a misleading motion tail.
   - T2: locators aren't strict, though `verify.md` says so.
   - T3: DECLARE4035 exempts scrollers whose label the runtime drops.
   - T4: `declare-help` misses `readOnly` and `onPointerLeave` with no hint.
   - Minor: T5 (R1 split), T6 (port suggestion).
   - Harness, outside this count: the 7GUIs drive lacks the `image` role.
3. **Names — FAIL.**
   - Two collisions: `Sheet` (library class) and `visible` (View attribute).
   - Two foreign names with no useful hint: `readOnly` and `onPointerLeave`.
   - No old names were used.
4. **Reference — FAIL.**
   - Doc gaps: `table.declare` (D2: `commit`'s argument and programmatic selection), the `textinput.declare` stroke read (D3: how an error looks), and the edit-lifecycle reads (D4, teaching only, unsure).
   - Fair: `tabbar.declare`, which was redundant with `declare-help`.
   - Missing outright: D1, the teaching that would have kept the sheet's headers out of `draw()`.


## The agent's account, verbatim

Asked after the build, resuming the session with read-only tools (`impressions.txt`). Where the audit found it wrong, see Audit.

# Building 7GUIs in Declare: an account for the Declare team

One housekeeping note first. The dev server I started on port 8202 has since exited (exit code 143), so the link in my last message no longer works. You asked me not to change anything, so I haven't restarted it. `PORT=8202 npm start` from `declarelang/` brings it back. Ports 8200 and 8201 were held by other Declare servers serving different trees.

---

## (a) Getting up to speed

**What I read, in order**

1. `README.md`, which sent me to `skill/SKILL.md`. My first attempt was a `cat` of README, SKILL.md and AGENTS.md together, and the tool truncated SKILL.md in the middle. I re-read it whole with the file reader. The skill's warning that "if your read tool stops short… read the rest in parts" was accurate.
2. `docs/declare.md`, all 934 lines.
3. Guide chapters 01, 04, 05 and 06, each read whole as the skill asks.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
5. After that, only what I needed, when I needed it:
   - `npx declare-help` on Table, ChoiceControl, Window, ContextMenu, DatePicker, RadioGroup, TabBar, Gauge, ProgressBar, Slider, TextInput, Time, Dataset, `virtualize`, `scrolls`, `shows`, `readOnly` (a miss), `onDoubleClick`, `onContextMenu`, `Floating.closed`, `stroke`, "theme tokens", and a few others.
   - Guide `08-controls.md` and `18-overlays.md`, whole.
   - Partial reads: `17-your-own-views.md` (lines 1–300), `22-time.md` (the Time, onTick and afterDelay sections), `09-pointer-and-keyboard.md` (raw/resolved events, dragging, keyboard), `07-scrolling.md` (panes, fixed headers, moving a scroller).
   - `docs/operational/verify.md`, the assert-script section.
   - Library source: `table.declare` (to learn what `commit(sel)` receives), `tabbar.declare`, and the edit lifecycle in `textinput.declare` and `valuecontrol.declare`.

**What I skipped, and why**

I skipped guide 02 (notation), 03 (constraints), 11 (themes), 12 (text), 14 (data; I only grepped it for `set([]`), 15 (schemas) and 16 (collections). The skill explicitly says to stop after the core set and read the rest on demand, and declare.md seemed to cover the constraint model well enough. I can't rule out that 14 or 15 would have warned me about two things that later bit me: holding a mutable `Map` in an attribute, and the rule against union types in schemas. I didn't check.

**What taught me the most**

- **declare.md**: dense, but it really is the whole model.
- **The to-do app.** It showed me the idioms the reference doesn't spell out:
  - a `Dataset` subclass making every write;
  - `trackChanges`/`onChange`;
  - computed defaults the user later takes over;
  - `stroke = { [null, …] }` per-side strokes;
  - menus as App members.
- **`declare-help`** was the best reference tool I've used for an unfamiliar library. Each class entry lists its members, the theme tokens it reads, and its guide chapters.
- **Reading the library source** answered the two questions the help entries didn't:
  - Table's `commit(sel)` receives an array or null, and `selectedItem` is the last element.
  - TextInput's `onEnter`, `_keyEscape` and blur → `endEdit` ordering.

**What was missing or misleading**

- Nothing told me that mutating a `Map` held in an attribute in place does not persist (see (d)). declare.md says script may hold "stateful helpers, caches, classes", and it says "a new array or record is a change", which implied to me that in-place mutation merely wouldn't *notify*, not that it would be lost.
- declare.md and guide 06 say "an unset size counts the padding". That is true for size from content, but it didn't extend a `scrolls = both` pane's range for me (see (d)). I'm unsure whether this is the scroll range or the harness's classic scrollbars.
- `readOnly` doesn't exist, and declare-help's miss offered no pointer to an alternative. A "read-only field" is a common enough need that a hint-table entry would help.

---

## (b) Expressing what I wanted

**Where Declare fit very well**

- **Timer.** This was the nicest fit of the seven. `running = { elapsed < duration }` on a `Time [ tick = frame ]`, with `onTick(dt)` integrating, gives "stops at d, restarts when d is raised, Reset restarts" with no logic beyond the condition itself.
- **Flight Booker.** The rules are all named constraints: `start`, `back`, `bothDates`, `backTooEarly`, `canBook`. Making both fields start on today's date was a computed default from a `Time [ tick = day ]` (`startText: string = { classroot.today }`), which the user's typing then takes over. That idiom, which I learned from the to-do app's `AddForm`, is elegant. The red outline was `judged = true` plus `validate(v)`, using TextInput's built-in error stroke.
- **Temperature.** The rule that a field shows the person's text while they edit meant the bidirectional conversion never fought the caret. I wrote no guard for it.
- **CRUD.** `Table` gave me single selection, keyboard navigation, and Delete via `deleteRequested()` for free. A derived `shown: Dataset [ contents = … ]` gave live filtering.
- **Navigation.** `TabBar` items carrying `location`, plus `shows = "…"` on each page, gave tabs with real URLs, working Back, and pages that keep their state, in about eight lines.
- **Circle Drawer.** `draw(d)` reading `classroot.selected` meant hover-selection repaints came for free. The Window's `open = { … } / commit(v)` pair made "closing is the commit point" one line: `commit(v) { if (!v) classroot.finishAdjust() }`.

**Where I worked around it**

- **Cells' dependency graph.** Propagation with an explicit graph and a topological order is imperative by nature, and I wrote it as ordinary method code on a `Dataset` subclass. That felt fine. Attribute storage for the graph is where it went wrong (see (d)).
- **Pinned row and column headers** in a two-axis scroller (see (g)).
- **A read-only text field** (see (g)).

---

## (c) The first time it ran

Once the program compiled, it booted cleanly at R4 on the first try. My first screenshots, one per tab via `declare-look --set app.location=…`, showed all seven pages laid out correctly. The visible problems came later:

| Problem | How I found it |
|---|---|
| The disabled Return date field looked identical to the enabled one | Screenshot comparison |
| The CRUD filter field showed a "Search" placeholder (SearchField's default) | Screenshot |
| When the context menu opened, the right-clicked circle lost its grey fill | Screenshot. The menu covers the canvas, so `canvas.hovered` went false and my hover-derived selection went to 0 |
| Scrolled to Z99, the last row and column sat under the scrollbars | Screenshot after 150 arrow presses |
| Cells didn't compute at all: formulas were stored, values were null | The assert script (`expected values to be 15, got null`), then a probe script calling the model's methods through `page.evaluate` |
| The Count button "did nothing" in the test | The assert script. The cause was test-path ambiguity, not the app (see (d)) |

---

## (d) Every refusal and surprise

Each entry gives what I wrote, what the platform said or did, what I changed, and my judgement.

### Compile, structure (R1)

1. **Union-typed schema field**
   - Wrote: `schema SheetCell [ id: string, f: string, v: number | string, err: string, msg: string ]`
   - Said: `'v: number | …' — a schema field has one type; a union is a literal union of strings or of numbers ('status: "open" | "closed"'), or a type with null ('v: number | null') [DECLARE5000] (cells.declare:27:53)`
   - Changed: split into `n?: number` and `t: string`.
   - Judgement: the rule is documented in spirit ("the subset of TypeScript that JSON data can carry"). JSON can carry `3 | "x"`, though, so the restriction surprised me. The message was clear and immediately actionable.

2. **Class name collides with the library**
   - Wrote: `class Sheet extends Dataset [ … ]`
   - Said: `'Sheet' is a library class — a class of the program can't take its name; rename yours, as 'MySheet' … [DECLARE5000] (line 35, col 1)`
   - Changed: renamed it to `Workbook`.
   - Judgement: my code was wrong; the message is excellent. It cost me one extra round because my rename used macOS `sed` with `\b`, which doesn't work there. That was my tooling mistake.

3. **A method named like an attribute**
   - Wrote: `visible(p: Person?) -> Person? { … }` on `CrudTask`
   - Said: `CrudTask.visible is an attribute — a method may not take an attribute's name [DECLARE2000]`
   - Changed: renamed it to `ifShown`.
   - Judgement: my mistake; good catch.

4. **A method named like a built-in**
   - Wrote: `valueOf(id: string) -> CellValue { … }`
   - Said: `Workbook.valueOf: 'valueOf' is a member of every object — choose another name [DECLARE2000]`
   - Changed: renamed it to `valueAt`.
   - Judgement: my mistake; an excellent catch that would have been a nasty runtime bug.

5. **A local `const x` inside `draw()` flagged as a write to the view's `x`**
   - Wrote, in `colHeads` (which has `x = { classroot.headW - classroot.scrollX }`):
     ```
     draw(d: DrawContext) {
         …
         for (let c = 0; c < (classroot.sheet?.columns ?? 0); c++) {
             const x = c * classroot.colW
             if (sel != null && sel.col == c) { d.fillStyle = t.sheetSelection; d.fillRect(x, 0, classroot.colW, d.h - 1) }
     ```
     and the same with `const y = r * classroot.rowH` in `rowHeads`.
   - Said: `View's own 'draw(…)' writes x, which it binds with a constraint (x = { classroot.headW - classroot.scrollX }) — the write is refused when it runs. Hold what changes in a declared attribute … bind 'x = { edited }', and write 'edited' [DECLARE2000] (cells.declare:265:9)`, plus the same for `y`.
   - Changed: renamed the locals to `left` and `top`.
   - Judgement: **the platform looks wrong.** `const x` declares a block-scoped local; it doesn't assign the attribute. The suggested fix (an `edited` attribute) misdirects. I'm fairly confident this is a false positive in the analysis of bare names inside method bodies. It's possibly by design ("built-ins never resolve outward"), but a declaration should shadow.

6. **A Dataset subclass instance with no body**
   - Wrote: `sheet: Workbook [ ],` where `Workbook.onInit()` builds the data with `this.set([], …)`.
   - Said: `a Dataset needs data — a literal JSON body ('sheet: Dataset { … }') or a derived 'contents = { … }' [DECLARE2000] (cells.declare:308:5)`
   - Changed: `sheet: Workbook { { "rows": [] } },`
   - Judgement: the docs were unclear about this case; the rule is reasonable in general. A dataset class that builds its own data is a legitimate pattern, and the placeholder body is noise.

### Resolution (R2)

7. **A bare token inside a `{}` record**
   - Wrote: `measureText(label, ({ fontSize: 12, fontWeight: semibold }))`, and the same in `fillText`.
   - Said: `cannot resolve 'semibold' — not a member of colHeads: View → Spreadsheet, a parameter, or one of the globals … — 2 sites [DECLARE4001]`
   - Changed: `"semibold"`.
   - Judgement: my code was wrong. declare.md says plainly that the bare vocabulary stops at the brace. I'm unsure whether `"semibold"` actually renders semibold in a drawing; the headers looked bold-ish, but I didn't check.

### Warnings that came with R2

8. `warning: canvas has an accessibilityLabel but no role … [DECLARE4035]`. I added `accessibilityRole = image`. This is a good warning. I'm unsure `image` is the right role for an interactive canvas.
9. `warning: backTooEarly decides on one condition of 4 parts … [DECLARE4025]`. I introduced `bothDates`. It's fair lint and made the code read better.
10. `hint: redundant parentheses … [DECLARE1002]` on `contents = { ({ rows: … }) }`. I removed the parentheses. It later fired again on `{ ({}) }`, after the parentheses had become habit from the to-do app's style (`({ id: … })` everywhere). There, the parentheses inside method bodies are necessary or idiomatic, which makes the hint mildly confusing.

### Analysis (R3)

11. **The `?` type shorthand inside a body**
    - Wrote: `classroot.ifShown(classroot.body.list.selectedItem as Person?)`, and `this.read([...]) as SheetCell?`
    - Said: `'?' after a type is the declaration's shorthand …, not a { } body's — a body is TypeScript, so write Person | null — 2 sites [DECLARE6001]`
    - Changed: `as Person | null`.
    - Judgement: my code was wrong, and the docs do say it. The `T?` shorthand being legal in a signature (`-> SheetCell?`) but not in the body one line below is an easy slip, and the message fixes it instantly.

12. **`undefined` assigned to `datapath`**
    - Wrote: `datapath = { classroot.sheet?.value }`
    - Said: `the { } body of 'datapath' does not fit 'datapath', typed DataCursor | object | null — Type '{ rows: SheetRow[]; } | undefined' is not assignable … [DECLARE6001]`
    - Changed: `?? null`.
    - Judgement: correct and clear.

### Behaviour that wasn't what I wrote it to do

13. **Mutated `Map` attributes didn't persist.** This was the most significant problem of the build.
    - Wrote:
      ```
      _exprs: Map<string, Expr> = { new Map() },
      _users: Map<string, Set<string>> = { new Map() },
      …
      setFormula(id: string, f: string) {
          …
          const e = parseFormula(f)
          if (e.kind == "empty") _exprs.delete(id)
          else _exprs.set(id, e)
          for (const r of refsOf(id)) {
              if (!_users.has(r)) _users.set(r, new Set())
              _users.get(r)!.add(id)
              }
          this.set(["rows", p.row, "cells", p.col, "f"], f)
          recompute(id)
          },
      ```
    - Did: no error and no warning. Formulas were stored (`f: "5"`), but values stayed null. A probe calling `s.setFormula("A0","5")` and then reading `[...s._exprs.keys()]` returned `[]`.
    - Changed:
      - `_exprs` was dropped; formulas are re-parsed from the dataset, with a memo `Map` in `formula.ts`.
      - `_users` became `Record<string, string[]>`, replaced wholesale on each change (`_users = users`).
    - Judgement: **unsure of the mechanism.** Possibly the computed default `{ new Map() }` is re-evaluated, or attribute values are cloned or proxied on read. Either way, the platform let me write code that silently did nothing. If it's by design, the analyser could warn when a method calls a mutating method (`.set`, `.add`, `.push`, `.delete`) on an attribute's value, the way it refuses writes to `let`s in script. It cost about four tool calls of probing; with that diagnostic it would have cost zero.

14. **Text paths match accessible names before view names.**
    - Wrote: `drive.click("app.pages.counter.row.Count")`. Inside `row` was a TextInput with `accessibilityLabel = "Count"` and a Button with `label = "Count"`.
    - Did: the click landed on the field. The test failed with `expected app.pages.counter.count = 3, got 0`, with no hint of ambiguity. Then `expect(page.getByLabel("Count")).toHaveValue("3")` got `""`; I assume it also hit the button.
    - Changed: named the children `field:` and `button:`, and used `getByRole("textbox", { name: "Count" })`.
    - Judgement: the tooling could do better. Path-by-text silently picked the first of two matches. Playwright's locators are strict; the docs say so ("strict when two match") for `page` locators, but apparently not for `drive` paths. A "2 views say 'Count'" error would have saved two runs.

15. **`.or()` on a locator.** The tool said: `page.getByRole("menuitemradio", { name: "return flight" }).or() — not on this page's locators: make two locators and check each`. I switched to `getByText`. This was a clear refusal. I had guessed the menu item's role, which was my problem.

16. **Booking dialog not found by role.** `expect(page.getByRole("dialog")).toContainText(...)` gave `got no element (after 5 s)`. I added `drive.settleMotion()` and used `getByText(...)`, which passed. I'm unsure why the role lookup failed: `Dialog.notice` may expose `alertdialog`, or it hadn't finished animating in.

17. **Two mistakes in my own test.** Typing `7` into a cell holding `5` appended, giving `57` and `C0 = 171`. That's correct spreadsheet behaviour, and I added `Mod+A`. I also miscalculated `SUM` as 35 instead of 42.

18. **Padding didn't extend the scroll range.**
    - Wrote: `grid: View [ x = { classroot.headW }, y = { classroot.rowH }, padding = [0, 16, 16, 0], …` inside a `scrolls = both` view.
    - Did: Z99 still sat under the scrollbars in the screenshot.
    - Changed: explicit `width = { columns * colW + margin }`, `height = { rowCount * rowH + margin }`.
    - Judgement: unsure. The grid's children are a virtualized replication, which may size the grid by arithmetic that ignores padding. Or the cause is the verify page's classic scrollbars. I didn't isolate it.

19. **A disabled TextInput doesn't look disabled.** Visible in the flight screenshot. The theme-token list for TextInput doesn't include `disabledOpacity`, while Button, Checkbox and others read it. I added `State [ applied = { parent.disabled }, opacity = { provided("theme").disabledOpacity } ]`. Judgement: this looks like a library gap, though I'm unsure; there may be a look I didn't trigger.

20. **Tab pill out of place in one screenshot.** A `page.screenshot` taken right after clicking a tab showed the pill still on "Counter". That was motion in flight. My mistake; the tooling's "motion is still in flight" messages had told me to settle first.

---

## (e) Verifying it

- **`declare-verify`, rungs R1–R4.** I ran it after each batch of fixes. It caught every compile problem listed above and reported all errors in a phase together (five at once in one round), which made convergence fast. R4 booted clean the first time it was reached, and its layout checks found nothing.
- **`declare-look --set app.location=… --shot`** gave one screenshot per tab. Setting state from the command line was very convenient.
- **The assert script `checks/flows.mjs`** ended with 87 steps and 45 assertions. It caught the Cells `Map` failure, which nothing else would have shown me, plus my own test mistakes. The best features:
  - `drive.wait(3000)` running program time deterministically, which made the Timer testable in milliseconds of real time;
  - `expect.approx`;
  - error messages that say why ("motion is still in flight… 2 timers still waiting").
- **Probe scripts with `page.evaluate(() => window.__declare.find(path)...)`** let me call model methods directly. That was decisive for diagnosing the `Map` problem.
- **A screenshot script** covered the context menu, the adjust window, a cell mid-edit, the scroll to Z99, and dark mode (`--dark`).

Weak spots in the tooling: path-by-text ambiguity (item 14), and having to guess roles for library overlays. Overall the tools served me well. The ladder framing kept me from over-checking.

**What I did not do:** use the app by hand in a visible browser. Everything was headless Chrome through the tools. I never dragged the Circle Drawer slider with a real pointer; I used `doc.preview(2, 90)` plus an ArrowRight. I never pressed the Window's × button; I used Escape. I never hovered for a cell's error tooltip.

---

## (f) Confidence, part by part

- **Counter: high.** One caveat: the "read-only" field is a TextInput that refuses edits, so a screen reader probably announces it as editable.
- **Temperature: high.** The parser accepts `5.` and `-.5` and rejects `1e3`, and results are rounded to two decimals. A tester might object to either.
- **Flight Booker: high.** Book is checked against the brief's message, and both disabling rules are tested. A tester might note:
  - With one-way selected, an invalid return field isn't flagged (deliberate: `validate` returns "" while disabled).
  - The message for a return flight is my wording.
- **Timer: high**, with one point a tester may raise. Lowering d below e leaves e above d: the label shows e (say 12.0s) while the gauge reads full. The brief doesn't say what should happen. The timer also runs while its tab is hidden.
- **CRUD: medium-high.**
  - The case-insensitive filter is a deviation from a literal reading.
  - Update and Create are disabled while both fields are blank, which is my addition.
  - The newly created person being selected (`list.commit([p])`) is untested.
  - The Table's visual highlight when a filter hides and then reshows the selected row is untested.
- **Circle Drawer: medium-high.**
  - The real slider drag and the × close are untested.
  - The adjust window sits at a fixed (40, 70) and can cover circles.
  - Cells downstream of a cycle show `#CYCLE!`, not a propagated error. That's a deliberate simplification, but a tester could reasonably call it wrong.
- **Cells: medium.**
  - Tested: evaluation, propagation-only-to-dependents, the error codes, Enter-to-commit, and scrolling to Z99.
  - Untested: clicking another cell mid-edit (should commit on blur), Escape abandoning an edit, error tooltips, and editing a cell in a row that is virtualized out and back in.
  - A tester probably finds problems first in edit lifecycle edge cases and focus handling: the whole grid gets a heavy focus ring, visible in the Z99 screenshot.
  - Long text is clipped, not overflowed, and numbers show up to 12 significant digits.

---

## (g) Gaps I worked around

1. **A read-only text field.**
   - Wanted: `TextInput [ readOnly = true ]`.
   - Looked: `declare-help readOnly` gave a miss. I didn't search further.
   - Did instead: `admit(t: string) -> string | null { return null }, commit(t: string) { }`.
   - Judgement: possibly truly missing. It might be achievable through `NativeText` or an accessibility attribute I didn't find. Unsure.

2. **A number-or-text value in a schema.** The schema rules refuse a union, so I used two fields. That's a real restriction; there's no gap to find.

3. **Mutable machinery state on a node (the dependency graph).**
   - Wanted: a `Map` living on the dataset class.
   - Did instead: an immutable `Record` replaced on every change, plus a memoized parse cache in script.
   - Judgement: unsure whether there's a sanctioned place for mutable, non-reactive state on a node. The guide's `_underscore` convention for "machinery" suggests attributes are meant for it, but in-place mutation is evidently lost. There may be an answer I didn't read (guide 14 or 30 perhaps).

4. **Frozen row and column headers in a two-axis scroller.**
   - Did: `ignoreScroll = true` with `x = { headW - scrollX }` (and the same on y), drawn with `draw()`.
   - Looked: only `07-scrolling.md` § Fixed headers. DataGrid has a pinned header (`_topInset`), but the brief forbids a ready-made grid and I didn't read its source.
   - Judgement: it works and reads clearly. A `stickyAxis` might exist and I wouldn't know.

5. **A dataset that initialises itself.** Satisfied DECLARE2000 with an empty literal body and filled the data in `onInit`. Probably fine as is; perhaps `contents` with a later takeover is the intended route.

6. **Keeping selection while a menu is open.** Composed from `menu.shown` and `menuFor`. Not a platform gap.

7. **Programmatic table selection.** Used `list.commit([p])`, which I found only by reading `table.declare`. It works as far as I can tell (untested). A `select(item)` verb would be more discoverable.

8. **Scrollbar clearance.** Explicit grid size plus a 16 px margin. Unsure whether there's a fact for a pane's usable inner size, something like `clientWidth`.

---

## (h) Changes of direction

| What it was first | What it became | When | What made me change |
|---|---|---|---|
| `class Sheet` | `class Workbook` | First compile | Refusal (DECLARE5000) |
| `v: number \| string` | `n?: number` and `t: string` | First compile | Refusal (DECLARE5000) |
| `_exprs`/`_users` as `Map`s mutated in place | Re-parse from data, plus an immutable `Record` index | During the assert run | A finding: values stayed null, and the probe showed empty maps |
| Grid `padding = [0,16,16,0]` | Explicit width/height plus `margin`, and `reveal` subtracting it | After the Z99 screenshot | Something I saw running |
| `selected` = adjusting or hover | Added a `held` term covering the open menu | After the menu screenshot | Something I saw running |
| A plain DateField | DateField with a disabled-opacity `State`, plus a format hint line | After the screenshots | Something I saw running |
| Anonymous pages and anonymous Counter children | Named (`counter:`, `field:`, `button:`) | During testing | Test-path needs and ambiguity |
| `CircleDoc.draw(x,y,d)` | `add(...)` | Before compiling | Second thoughts: a confusing name next to View's `draw` |
| Seeding the spreadsheet with a sample table | Left empty | During writing | Second thoughts: the brief's original is empty |

---

## (i) The code, quoted

The exact code and messages are quoted inline in (d), items 1–7, 11–14 and 18. The two worth reproducing first:

**The `const x` false positive (item 5):**
```declare
colHeads: View [ ignoreScroll = true, x = { classroot.headW - classroot.scrollX },
    width = { (classroot.sheet?.columns ?? 0) * classroot.colW }, height = { classroot.rowH },
    draw(d: DrawContext) {
        for (let c = 0; c < 26; c++) {
            const x = c * classroot.colW
            d.fillRect(x, 0, classroot.colW, d.h - 1)
            }
        }
    ]
```
→ `View's own 'draw(…)' writes x, which it binds with a constraint (x = { classroot.headW - classroot.scrollX }) — the write is refused when it runs. … [DECLARE2000]`

**The silent `Map` (item 13):** a `class X extends Dataset` with `_m: Map<string, number> = { new Map() }` and a method `put(k: string) { _m.set(k, 1) }`. After `x.put("a")`, `[...x._m.keys()]` is `[]`. There was no diagnostic at any rung.

I didn't go round in a circle on anything. The closest was items 14 and 15, three test runs to get Counter and Flight Booker addressed correctly.

---

## Surprises

- The compiler caught `valueOf` and an attribute-named method. These are the kind of bug I'd expect to lose an hour to in JavaScript.
- `drive.wait(3000)` completes instantly and deterministically.
- `TabBar` items with `location`, plus `shows`, make routed tabs almost free.
- Silent loss of in-place mutation, in a language that is otherwise loud about everything.
- Text-path matching prefers an accessible name and doesn't flag ambiguity.

## Good

- **Diagnostics name the fix**, and every error in a phase arrives at once. Most refusals cost one edit.
- **`declare-help`** is fast and specific, with token lists per class.
- **The value pattern** (`value`/`commit`, `<->`) is consistent across every control and overlay, including a Window's `open` and a Menu's `shown`.
- **Computed defaults** that the user then takes over.
- **`State`** for "a look while a condition holds".
- **Time as a member**, with `running` as a constraint.
- **The verification ladder** and assert scripts that use real input and hold time still.

## Bad

- The silent failure (item 13).
- The `draw()` local-name false positive (item 5).
- Ambiguous text paths in the test tooling (item 14).
- Small inconsistencies:
  - `T?` is legal in signatures but not in bodies;
  - a dataset class must carry a placeholder JSON body;
  - the parentheses style of the examples collides with the redundant-parentheses hint.
- No obvious read-only field.
- A disabled TextInput doesn't look disabled.
- The skill's required reading is long: about 3,600 lines before writing anything. In fairness, it paid off. Nothing the compiler refused was something the docs failed to cover, except items 5, 6 and 13.

## How it differs, and what it reminded me of

It's closest to **QML** (property bindings, `states`, components with ids) and to **OpenLaszlo/Flex MXML**, which the README names. The dataset-and-datapath replication feels like XForms or Laszlo's datapaths more than React's `map`. Compared with React or SwiftUI:

- there is no render function;
- children never come from expressions;
- a compiler checks dependency extraction, which is the genuinely new part;
- refusals arrive as edits to make.

Working in it felt like writing a spreadsheet of UI facts, which suited 7GUIs, a benchmark about change propagation, unusually well.

## Where I'd most want improvement

1. **A diagnostic for mutating an attribute's object in place.** If such mutations are lost, refuse them, as script `let` writes are refused. That covers item 13.
2. **Shadowing in method bodies:** a `const x` local should not be read as `this.x`.
3. **Strict ambiguity reporting for `drive` paths by text.**
4. **Small library additions:**
   - a documented read-only TextInput;
   - a disabled look for TextInput;
   - a `Table.select(item)` verb;
   - a note in `07-scrolling.md` on what contributes to a two-axis pane's scroll range.

## The hardest part

**The silent `Map`** was one obstacle, not a pattern. It cost about four tool calls and a design change to the Cells model. To have written it right the first time, I'd have needed one sentence in declare.md §5 or §7 saying that attribute values are not live objects you can mutate in place, or a compiler warning.

**Name collisions** with built-ins and the library were a pattern (Sheet, `visible`, `valueOf`), but a cheap one: one edit each, because the messages named the fix.

## What I'd use it for

- Internal tools, dashboards, settings-heavy desktop-style apps, and interactive prototypes, especially written with an LLM. The compiler's refusals and the assert ladder make an LLM's output trustworthy in a way I can't get from React.
- Teaching reactive UI, because the dependency model is visible in the source.

I'd hesitate on anything needing heavy third-party component ecosystems (I didn't evaluate `DOMIsland`). I'd also hesitate on performance-critical large grids until I'd profiled the virtualization myself, which I didn't do here.

## Names ledger

```
NAMES — eval-7guis-2.noindex: 0 missed name(s), 2 collision(s), 2 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

COLLISIONS (min · held by · name)
     8 · library class  · Sheet
     8 · attribute      · visible

DECLARE-HELP MISSES (min · asked for · answered)
     2 · readOnly · no entry for 'readOnly' — searched reference (1954 entries), classes (112), enums, diagnostics, the hint tables, and the concept table.
     4 · onPointerLeave · no entry for 'onPointerLeave' — searched reference (1954 entries), classes (112), enums, diagnostics, the hint tables, and the concept table.

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
