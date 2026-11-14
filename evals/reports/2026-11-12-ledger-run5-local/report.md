# Ledger run 5: Opus 5.5, Declare, on the LOCAL tree (the rename release and its fixes)

**41.4 min, 157 turns, 178.9k output tokens; 8 of 8 hidden checks delivered.** First clean boot at
12.6 min scored 1 of 8 — not a defect: Overview, Insights, Budgets, the editor and the filters were
still empty stubs then, their files written 3–6 min later. Run 4 (pushed tree): 36.4 min, 8 of 8.
Moved to after Venue 33 was stopped: the aim is to work defects down across apps, not iterate one brief.

Two drive defects were fixed while scoring (the app was right): the "+" named "Record an expense or
a sale" opens a menu, and the drive treated the button as the editor and never picked its item; and
its item pattern did not allow "New …". The renames caused no friction: `applySort`,
`selectedItem`/`activeItem`, `commit` and `items` used correctly, no old name anywhere.

Timing record: `evals/timings/2026-11-12-ledger-run5-local.txt`.

## Clean bill of health: all four counts fail (below); friction cost about 9.5k tokens, 4.7 min of 41

Platform: a paint rule reading a declared default can stay stale for good (the amber chip outline);
`select("all")` on a just-built field does nothing; a `commitOn = "end"` field removed as it loses
focus drops the edit; `Table.onKeyDown` swallows every plain key but Tab, so a binding further out
never hears Escape. Tools: overlapping labels in a width-less `Segmented` unreported; `declare-help
reducedMotion` answers nothing; a did-you-mean offers an internal `_field`; a misused page API throws a
raw TypeError; the eval's `names.py` and `timing.py` miscount. Names: `key` collided (the agent's own
shortcut key), `reducedMotion` unhinted. Reference: two doc-gap reads, and `Segmented.width`'s entry
contradicts its class. All are being fixed.

## Audit

**Effort.**

| | Wall time | Tool calls | Output tokens |
|---|---|---|---|
| Build | 41.1 min (00:39:21 → 01:20:27 UTC) | 156 | about 177k (the timing record says 178.9k) |
| Reading and planning, to the first app write (#42) | 3.9 min | 41 | 13.2k |
| Writing the first five files (#42–#53) | 8.0 min | 12 | 62.9k |
| Compiling, looking, scripting and fixing (#54–#156) | 29.2 min | 103 | about 101k |

`#n` below is the n-th tool call of the build. Token figures are the output tokens of the turns that produced those calls, taken as the first usage the transcript records for each message, so they may run slightly low. Almost all thinking is redacted (0 characters), so I can't split it out.

The repros are in `/private/tmp/claude-503/-Users-temkin-Code-declare-overlay/6a505da1-0494-4b83-acec-f4d7f2048458/scratchpad/l5-audit/`.

- **Which tree.** Every repro ran on the agent's platform copy, `~/Code/eval-ledger-5.noindex/work/declarelang`. Its `runtime/src`, `library/`, `tools/` and `docs/` match `~/Code/Declare`'s working tree. The only differences are untracked extras (`.DS_Store`, `docs/system-design`, sim logs, `tools/internal/pointer`). So every defect below is present on the uncommitted local tree.
- **No service was needed.** Every defect reproduces in a small standalone program. I started no service, so there was nothing to stop.

### Platform defects

**P1. A paint constraint (`fill`, `stroke`) that reads a declared default keeps a stale value when the instance sets that default's input with a `{ }` constraint. This was the amber outline on every category chip.**

- **The app's code** (`ledger-parts.declare` as of #45; the snapshot is `parts-before.declare`):
  `missing: boolean = { classroot.splitParts == 0 && classroot.categoryId == null }`
  `stroke = { classroot.missing ? stroke(1, warn) : null }`
  The use site is `CatChip [ categoryId = { classroot.txn.categoryId ?? null }, … ]`.
  - Every chip kept the outline, as `/tmp/l1.png` (#63) shows.
  - `fill` came out right in the app only because it also reads `colourIndex`, which changes later and re-runs it.
  - The "!" and dot children read the same `missing` and were right.
- **Minimal form** (`cause/min.declare`, `chain3.declare`, `chain4.declare`). The class is `a: string? = null`, `m: boolean = { classroot.a == null }`, `fill = { classroot.m ? red : green }`. The instance is `K [ a = { "x" } ]`.
  - The result is `a = "x"` and `m = false`, but `fill` is red. `stroke` behaves the same way.
  - These are all right: a literal `a = "x"`; a one-hop `fill = { classroot.a == null ? … }`; `opacity`, `cornerRadius` and `width` reading `m`; a custom `c: Color` reading `m`; a `Text` child; and a later change to `a`.
  - Replication isn't needed. `c: Chip [ categoryId = { "k" } ]` fails too (`stroke-var.declare`).
- **Cause.** I had this traced by a subagent and checked the cited lines.
  - A view's rules install in this order: class attributes (`fill`), then use-site attributes (`a`), then declared-default rules (`m`) last (`instantiate.ts:1364`).
  - `fill` and `stroke` have an `equal` function (`view.ts:2217`), so they are not plain numeric slots. They run as JavaScript constraints rather than in the kernel (`bind.ts:222` → `:495`).
  - Their first run reads `m` before `m`'s rule exists. `declStale` returns true for an unowned slot (`attributes.ts:1026`), so the getter evaluates `m` live. At that moment `a` hasn't landed, so `m` comes out true and `fill` is red. The edge `fill` keeps is on `m`'s table cell, which still holds the default 0.
  - Then `m`'s rule lands, computes false and writes 0 into a cell already holding 0. The equality gate sees no change, so `fill` never re-runs.
  - So the trigger is any JavaScript constraint that reads, during the install batch, a declared default whose final value equals the slot's starting value (`cause/h.declare`).
- **Verdict.** Correct code, painted wrong, with no diagnostic. The agent's `State` rewrite (#66) is a fine form, but it was a workaround.
- **Cost:** 2.3k tokens and 0.7 min (#63–#66). The agent also failed to ask the running program why, and the account half-blames the tool for that (T5).

**P2. `select("all")` called just after `Focus.focus` on a field that has only just come into existence (`exists` turned on in the previous settle) does nothing. Typing then appends.**

- **What the reference promises.** `TextInput.select`: "Applied at once while the field holds focus; otherwise held and applied at the next non-pointer focus (Tab, or a program's)."
- **Repros** (`edit-retire.declare` in mode 1, `edit-select2/3.declare`):

  | Order, in `afterSettle` after `editing = true` | Begun by a click | Begun by Tab + Return |
  |---|---|---|
  | `Focus.focus(f); f.select("all")` (the agent's) | "OriginalTyped" | "OriginalTyped" |
  | `f.select("all"); Focus.focus(f)` (held, then a program's focus) | "OriginalTyped" | "OriginalTyped" |
  | `Focus.focus(f); afterSettle(() => f.select("all"))` | "Typed" | "Typed" |

  A field that always exists works in both orders (`select-perm.declare`). So the cause is the new field, not the pointer.
- **The account's guess is wrong.** (d23b) suspected the click counted as pointer focus. It fails from the keyboard too.
- **Cost:** 1.3k tokens and 0.8 min (#111–#113). It was found only because the earlier run had saved a non-empty description. The first PATCH had worked only because that field had started empty.

**P3. A `commitOn = "end"` field that is removed in the same turn it loses focus drops the person's edit, silently.**

- **The app's code.** The field is `exists = { classroot.editing }` with `onBlur() { super.onBlur(); classroot.editing = false }`. Tab after typing "yesterday" sent no PATCH (#109, #113, #115).
- **Minimal form** (`edit-retire.declare` + `edit-retire.mjs`, `MODE=0`). Click, type "Typed", press Tab. `commit` never runs (`saved = ""`). With `this.endEdit()` before the field is put away (`MODE=1`), it commits.
- **Cause** (`library/valuecontrol.declare`).
  - Commit-on-leave lives in `_member.onChange` (`:829–833`), which runs at the close of the settle.
  - Retiring the control in that same settle runs `onRetire()` → `_member.retire()` (`:791`, `:835`). That never ends the edit.
- **Docs.** 08-controls ("a field saved when it is left") and `ValueControl.endEdit` ("Leaving the control … end the edit this way") promise the commit, and no doc mentions the exception.
  - The person did leave the field: Tab was a real leave. The removal only followed from it.
  - So I count this as a platform defect, not correct-by-docs.
- **Fix direction (unsure of the exact rule).** When a control retires mid-edit after focus has already left it, end the edit, which commits it. A retire with no leave, such as a sheet closing on Cancel, may rightly discard.
- **What doesn't matter here.** The `super.onBlur()`/`super.onFocus()` calls the agent added (d23c) are irrelevant to the commit. `Control.onBlur` only clears `focusVisible` (`control.declare:295`).
- **DataGrid's own path doesn't hit this.** `DataGridEdit`'s field is never retired by an edit ending (`datagrid.declare:911–943`). The trap is specific to the "display, then edit" cell the agent had to build itself (account g6).
- **Cost:** 3.6k tokens and 1.8 min (#110, #114, #116–#121), plus three source reads (#118–#120).

**P4. `Table.onKeyDown` swallows every plain key it doesn't use. Escape (or any plain key) bound in `keyBindings` on the grid itself, a container, or the App never fires while a Table or DataGrid holds the focus.**

- **The library code.** `library/table.declare:315–337` passes only Tab to `super.onKeyDown(e)`. Every other key ends there. `DataGrid.onKeyDown` hands the rest to Table, so the same applies to it.
- **What the docs say.**
  - The key walk is the base `onKeyDown` (`focus.ts:1458`, `baseKeyDown`).
  - `declare.md` §8 says "An `onKeyDown` hands the keys it doesn't take, Tab included, to `super.onKeyDown(e)`."
  - `View.keyBindings` says "A key walks from the focused view outward — the view, then each container, out to the App".
- **Repro** (`table-esc.declare` + `.mjs`). An App binds Escape and Ctrl+K, and the Table has focus.
  - Escape runs nothing (`esc = 0`).
  - Ctrl+K runs (`k = 1`). Chords are walked before the handler.
- **In the run (d24, #126–#132).**
  - The App's Escape binding didn't close the detail.
  - The agent then added `keyBindings` on the `TxnGrid` subclass, which is the documented, nearest-wins form. It didn't help either.
  - The agent ended up overriding `onKeyDown`.
- **The account is right that it couldn't find a binding form; this is why.** It says "I couldn't find a way for an app to say 'my Escape first' short of overriding onKeyDown". The documented way (the grid's own `keyBindings`) is broken by this.
- **Cost:** about 1.4k tokens and 0.8 min: half of #127 (the other half was the agent's focus change) and #132.

### Tool defects

**T1. The layout check is silent about labels running past their segments in a `Segmented` or `TabBar`** (d13).

- **What happened.** With no `width`, both controls are `segmentMinWidth × n` (96 each, so 288 for three).
- **Repro.** `seg.declare` at R4 reports nothing. `seg.png` shows "Gross margin %Number of sales" and "Income vs expensesBreakdown" running into each other.
- **Not clipped.** The text overflows into the next segment. A person sees the overlap; the check doesn't.
- The control's own sizing is by design (see D1).

**T2. `declare-help` has no near-miss for `reducedMotion` (a letter off `reduceMotion`) or for CSS's `prefersReducedMotion`.**

- Both answer "No entry … if it should exist and does not, that absence is worth reporting". There is no pointer to `App.accessibilitySettings`.
- `declare-help reduceMotion` finds it at once.
- **Cost:** 0.4k tokens and 0.3 min (#34–#36), plus one library grep.

**T3 (minor, a message). `declare-verify` offers a library-private member as the fix.** At #73: "'field' is not a member of this MoneyField — did you mean '_field'?".

- `_field` is `Field`'s internal.
- The agent rightly didn't take it, and used `Focus.focusIn(…)` instead.
- A did-you-mean shouldn't propose underscore members to a program.

**T4 (minor, a message). The page API answers misuse with a raw `TypeError`.**

- `__declare.at(x, y)` returns `{ path, kind }`, not a view. `pathOf` of that returns `null` silently, and `explain(null, …)` throws "Cannot read properties of null (reading 'match') findPath (node-path.js:39)".
- `--js "__declare.help()"` documents `at`, but the agent didn't ask.
- **The account is wrong to say the tool gave no detail (d11).** declare-look printed the error on the lines after `R5 ✗ behavior`. The agent's own `| head -5` cut them off. It did the same at #87, #128 and #133.

**T5 (unsure: a tool design question). Lint noise hid a bug warning.**

- Every verify reprints DECLARE4025 lints that run to about 400 characters, so the agent filtered all `^  warn` lines from #73 on. The account says it did so "constantly".
- That filter also hid DECLARE4023, the `rowIndex` warning: "CategoryBox reads rowIndex, but CategoryBox is not replicated …", at three sites. I confirmed it on the #92 snapshot (`snap92-verify.txt`).
- The agent found the bug by `--semantics` instead (#93). So the account's d20 request ("a compiler hint would have saved an iteration") asks for a warning that existed.
- The fault is the agent's filter. But `warn bugs` and `warn lint` share one prefix, so a reader filtering the noise loses the bugs too.
- **Cost:** 0.9k tokens and 0.5 min (#93–#94). I count this as the agent's own mistake, not friction.

**The eval harness, not product tools.**

- The hidden drive needed two fixes during scoring. One was the phone "+" named "Record an expense or a sale", which opens a menu.
- `evals/craft/names.py` reported "0 collisions, 0 declare-help misses". It missed the `key` and `x` renames (DECLARE2000 structure refusals) and the `reducedMotion` miss.

### Docs and help

**D1. `Segmented`'s reference contradicts itself on width.**

- The class prose says "a `Segmented` does not size itself to its labels: set `width`, or accept `segmentMinWidth × items.length`".
- `segmented.declare:136–137` (`## width`) says "Content-sized: every segment at least `segmentMinWidth` wide, so short labels never squeeze."
- The agent read only the members summary (#28), expected content sizing, and got overlap (d13). The fix it settled on, explicit widths, is the documented one.
- **Cost:** about 0.5k tokens and 0.3 min (part of #79–#81).

**D2 (teaching, small). Field width.**

- Every `Field` example has a control of fixed width. None shows a `Field` whose control fills it (d16).
- `View.width` and the layout chapter do state the rule, so this was the agent's mistake. The boot finding was correct.

**D3 (design, not a defect). `Segmented` isn't a form member.**

- It has `value`/`commit` but extends `View`, not `ValueControl`, so it has no `name` and no `Form` membership (d14).
- The refusal was correct. Whether a `Segmented` should join a form is an open design question.

### The renames

**The agent never reached for an old name.** I scanned every tool input of the build (156 calls) for: `input(`, `sortInput`, `arrangeInput`, `resizeInput`, `editInput`, `headerH`, Table `selected =`/`active =`/`.active`, `choices`, `inkColor`, `openAt`, `openFor`, `navigate(`, `motion =`, `stretches`, `onDblClick`, `blend` and `outline =`.

- **New names, used correctly:**
  - `applySort` (2 sites);
  - `selectedItem` and `activeItem` (`TxnGrid`, `ledger.declare`: `g.activeItem = t`);
  - `commit(…)` (37 sites, on TextInput, Segmented, TabBar, Combobox and Table);
  - `items` on Segmented/TabBar/Combobox/Menu;
  - `.open(…)` on menus;
  - `ink` on an icon.
  - `applyEdit`, `applyColumnOrder`, `applyColumnWidth` and `headerHeight` were not needed: the grid uses custom cells, and its columns are fixed.
- **False hits only.**
  - `app.selected` is the agent's own App attribute.
  - `choices` is its own attribute on `CategoryBox`.
  - `inkColor` matched inside `linkColor`.
  - `openAt` matched inside `openAttention`.
- **No friction from the renames.** No refusal touched a renamed member.
- **Collisions with Declare names: two, both renamed by the agent.**
  - A child named `x` was refused ("FilterChip.x is an attribute") and became `close:`. Naming the close button `x` is natural, and `x` is position. The collision is unavoidable, and the message is clear.
  - **An attribute named `key`** (a keyboard shortcut's digit) was refused as "replication metadata" and became `shortcut`. This is the real one: `key` is the natural name for a key in UI code. The message is clear and names alternatives, but they are data names ('field', 'code', 'name'), not 'shortcut'.
- **Foreign names.**
  - `img` (ARIA): the refusal listed the enum, including `image`. A useful hint.
  - `reducedMotion`: no hint (T2).
- **Not a collision: `count` (DECLARE4002).** It was the agent's own member shadowing its own script function. That is a real bug the compiler caught.

### Every refusal, finding and changed behaviour

| # | Written | Platform said | Verdict |
|---|---|---|---|
| 40 | `npm start` | 8200 taken by another tree; use `PORT=8201` | Eval environment (main served on 8200). A good message. |
| 54 | `keyBindings = [ ({…}) ]` | DECLARE1000, a bare list holds literals | Agent. `View.keyBindings`'s example shows `{ [ … ] }`. |
| 56 | child `x:` | DECLARE2000 | Agent. A name collision, unavoidable (Names). |
| 56 | `source: DataSource = null` | DECLARE2000, write `DataSource?` | Agent. |
| 56 | `accessibilityRole = img` | DECLARE2000 with the enum | Agent (ARIA reflex). A useful hint. |
| 56 | attribute `key` | DECLARE2000, replication metadata, 5 sites | Agent. **A name collision** (Names). |
| 57 | `datapath = { ({ chips: … }) }` | DECLARE3006 | Agent. The message names the fix. |
| 57 | field inside a button | DECLARE4020 | A correct warning. |
| 57 | `count` member vs `count()` | DECLARE4002 | A correct warning that caught a real bug. |
| 57 | long `&&` chains, nested `?:` | DECLARE4025 | Fair lint, but repeated noise (T5). |
| 58 | `DescCell` redeclares `show` | DECLARE2000 | Agent. |
| 59 | `as TxnDetail?` in a body | DECLARE6001 | Agent. |
| 59 | `filters.search` | DECLARE6001 | Agent (wrong path). |
| 63–66 | `stroke = { missing ? … : null }` | Amber on every chip, no diagnostic | **P1.** |
| 65 | `--js` with `__declare.at(...)` | `R5 ✗` + TypeError (cut off by `head -5`) | Agent's misuse and truncation. The message is raw (T4). |
| 72 | `Segmented [ name = … ]` | DECLARE2000 | Agent (D3). |
| 73 | spread series in a ternary | TS2322 via DECLARE6001 | Agent; plain TypeScript. |
| 73 | `amountField.field`, `refund.pick` | DECLARE6001; "did you mean `_field`" | Agent. The hint names an internal (T3). |
| 77–81 | TabBar/Segmented without width | Labels overlap; no finding | **D1** + **T1**. |
| 77–81 | future periods drawn as 0 | Seen in a screenshot | Agent (the service returns overlapping periods). |
| 83 | `goBack` compared a title | Assertion | Agent. The message's motion note was apt. |
| 85 | `const page = drive.page` | `page.getByRole is not a function` | Agent. `verify.md` documents the parameter. |
| 88–94 | bare `rowIndex` in `PartRow`'s children | "Part 1 category" found nothing | Agent. DECLARE4023 had said so, but the agent's filter hid it (T5). |
| 92 | `TextInput [ width = 100% ]` in an unsized `Field` | "children need 47 across and it has 35" | Agent. A correct finding (D2). |
| 96 | locator `.or()` | Not supported; make two locators | A good message. |
| 98 | checkbox in a popover mid-motion | "found nothing … settleMotion()" | A good message. |
| 104–106 | small targets on the phone | 9, then 4, then 13 controls under 44×44 | Correct findings. |
| 109, 113, 115 | Tab out of a cell field that `onBlur` removes | No PATCH | **P3.** |
| 110, 112 | `select(0, 99999)` / `select("all")` after `Focus.focus` | Text appended | **P2.** |
| 114 | test against a live service | Already saved | Agent's test. Verify's note about earlier writes was good. |
| 116 | `--click 'app."Date, Nov 12. …"'` | "no node … nearest there: 'Date, Nov 12, 2026 …'" | A good message. |
| 126–131 | single click opens the detail, so a double-click misses | Focus ended on another cell | Agent's design. The driver's two presses are 100 ms apart at one point, as a person's are (T1 of run 32 is fixed: `pressSeries`, `verify-behave.mjs:970`). |
| 127 | arrows after a cell button press | `t04193` for `t04192` | Agent's design. The cell `Control`s take focus, and arrows from a member are the member walk. Documented. |
| 126–132 | Escape via App or grid `keyBindings` | `detailOpen` stays true | **P4.** |
| 137 | "All 1 transaction" | Seen | Agent. |
| 151 | tabs `Math.min(parent.width, 560)` | Runs past the right edge at 390 | Agent. A correct finding. |
| drive | NavItem named "Transactions 2" | The drive matched by a looser name | **The app's doing.** `NavItem` has two `TextLabel`s and no `accessibilityLabel`, so the hint digit joins the name. `View.accessibilityHidden`'s reference names exactly this case ("a button holding a hidden shortcut glyph is named by its words alone"). No library or runtime folding. |

**The first clean boot at 12.6 min (#60, snapshot `2a47c50`) scored 1/8 because the program was only partly written.**

- At that point `ledger-stubs.declare` held empty `OverviewPage`, `InsightsPage`, `BudgetsPage`, `Editor` and filter classes.
- `ledger-reports`, `-filters` and `-editor` were written at #68–#71, 3–6 minutes later.
- The one pass (export_csv) is the one flow the Transactions page alone could do.
- This is not a defect.

### Reads of library/ and runtime/ source

There were eight reads, all of `library/`, and none of `runtime/`. The timing record's "library" is the `ls` at #8, and "library/table.declare" is a `wc -l` at #31; neither is a read.

| # | Read | Looking for | Verdict |
|---|---|---|---|
| 31 | grep of `datagrid.declare` (class, editing, keyBindings, virtualize) | How the grid is built | **Fair.** It came after reading all 142 lines of `declare-help DataGrid --all`. |
| 32 | `datagrid.declare:194–443` | Rows, the keyboard, entering a cell | **Fair.** An example of a pattern. The docs cover the API. The agent wanted to see how a cell turns into a field, to build its own "display, then edit" cell, which the grid doesn't offer (account g6). |
| 33 | `datagrid.declare:783–944` | `DataGridCell`, `DataGridEdit` | **Fair.** Same as #32. |
| 36 | `grep reduceMotion library/*.declare` (with guide 21) | The reduced-motion setting | **Doc gap.** The answer is `App.accessibilitySettings`, which declare-help failed to find from `reducedMotion` (T2). |
| 70 | `grep refusal library/form.declare` | Form's refusal mapping | **Fair, and redundant.** It hit only the doc comment that `declare-help Form.refusal` had already shown at #38. |
| 118 | grep `onBlur`/`endEdit()` in `textinput`/`valuecontrol` | Why Tab doesn't commit | **Doc gap, forced by P3.** No doc says a control retired in the settle it is left drops its edit. The fix belongs in the platform; failing that, in `ValueControl.endEdit`/08-controls. |
| 119 | `textinput.declare:300–315` | Same | Same. |
| 120 | `valuecontrol.declare:305–355` | `_member.onChange` | Same. This read gave the agent the answer (#121). |

### Where the account is wrong against the transcript

1. **d11, "--js failed with no detail".** The tool printed the error. The agent's `| head -5` dropped it. The call itself misused `__declare.at`, which returns `{ path, kind }`.
2. **d20, "a compiler hint would have saved an iteration".** The compiler did warn: DECLARE4023 at three sites. The agent's `grep -v "^  warn"` hid it.
3. **d23b, the pointer-focus guess.** It's wrong: `select` fails from the keyboard too. The cause is the newly created field (P2).
4. **d23c, "my overrides replaced the library's own".** True, but it doesn't bear on the commit. `Control.onBlur` only clears `focusVisible`, and the commit lives in `_member`. The account says so itself at d23d.
5. **d10's hypothesis, "a constraint moving stroke from a value to null doesn't clear the paint".** The value itself is stale, not the paint, and `fill` goes stale the same way (P1). The fill looked right in the app only because `colourIndex` re-ran it.
6. **(a) leaves out two library reads:** the `reduceMotion` grep of `library/*.declare` (#36) and the `form.declare` grep (#70).
7. **The in-place editing thread was about 7 minutes, not 10.** That is 3.1 min on Tab and selection (#109–#121) and 4.1 min on click, double-click and Escape (#124–#132). Its "eight verify runs" is about right: 7 verifies and 2 looks.

These parts are accurate against the transcript:
- every quoted message in (d) and (i);
- d24's account of the double-click and the narrowing grid;
- d16's account of the Field width finding;
- d28 on the live service;
- the request in (Overall) that the platform commit an open edit when the control retires (P3).

### Friction cost

**Method.** For each episode, I summed the output tokens of the turns from the first call that met the problem to the one that resolved it. Time is from transcript timestamps, so it includes tool run time. Where one turn mixed a defect with the agent's own change, I split it by half.

| Kind | Episodes | Tokens | Time |
|---|---|---|---|
| **Platform defects** | P1 chip stroke (#63–#66) 2.3k / 0.7 min; P2 select on a new field (#111–#113) 1.3k / 0.8 min; P3 edit dropped on retire (#110, #114, #116–#121) 3.6k / 1.8 min; P4 Table swallows Escape (½ #127, #132) 1.4k / 0.8 min | **8.6k** | **4.1 min** |
| **Tool and doc friction** | T2 `reducedMotion` (#35–#36) 0.4k / 0.3 min; D1 + T1 Segmented width (part of #79–#81) about 0.5k / 0.3 min | **0.9k** | **0.6 min** |
| **Total, platform and tools** | | **9.5k (5.4% of about 177k)** | **4.7 min (11% of 41.1)** |
| Mixed: lint noise led the agent to drop warnings (T5) | #93–#94 | 0.9k | 0.5 min |
| Eval environment | port 8200 (#39–#40) | 0.2k | 0.1 min |
| The agent's own mistakes | compile fixes #54–#60 4.3k / 0.8 min, #72–#74 3.6k / 0.3 min; script slips (`drive.page`, `.or()`, `settleMotion`, a non-idempotent test) about 5k / 1.5 min; `goBack` 2.5k / 0.3 min; single click edits → double-click design (#124–#131, less P4) about 5k / 3 min; `--js` misuse 0.3k | about 21k | about 6 min |

### Clean-bill verdict

1. **Platform — FAIL.**
   - **P1:** a `fill`/`stroke` constraint reading a declared default goes stale when that default's input is a use-site `{ }` and its final value equals the slot's starting value. It was visible in the delivered build until worked around.
   - **P2:** `select()` on a just-created field doesn't apply, contrary to its reference.
   - **P3:** a `commitOn = "end"` field retired in the settle it is left silently drops the edit.
   - **P4:** `Table.onKeyDown` swallows unhandled plain keys, so `keyBindings` on the grid, containers and the App never see Escape.
   - No correct code was refused at compile or boot.
2. **Our tools — FAIL.**
   - **T1:** the layout check is silent on labels overlapping in an unsized `Segmented`/`TabBar`.
   - **T2:** `declare-help` gives no near-miss for `reducedMotion`/`prefersReducedMotion`.
   - **T3:** a did-you-mean proposes `_field`.
   - **T4:** the page API throws a raw TypeError on misuse.
   - **T5 (unsure):** bug warnings share the `warn` prefix with the lint noise that drove the agent to filter both.
   - The driver itself was faithful in this run. Run 32's dblclick fix held, and no locator passed or refused wrongly.
3. **Names — FAIL.**
   - **`key`:** the agent had to rename its keyboard-shortcut attribute `key` → `shortcut`. A clear message, but a collision with a natural name.
   - **`x`:** `x` → `close` is the same kind of collision, but unavoidable.
   - **`reducedMotion`:** no hint (T2).
   - No old (pre-rename) name was reached for, and the renamed DataGrid/Table/Segmented members caused no friction.
4. **Reference — FAIL.**
   - Two doc-gap source reads: the `reduceMotion` grep (#36, a declare-help miss), and the `valuecontrol`/`textinput` reads (#118–#120, forced by P3).
   - D1: `Segmented.width` contradicts the class prose.
   - The other five reads are fair: DataGrid as an example of cell editing, and a redundant `form.declare` grep.

**Friction:** about 9.5k output tokens and 4.7 min on platform defects and tool/doc friction, out of about 177k tokens and 41 min. Platform defects are 8.6k and 4.1 min of that, with P3, the dropped edit, the largest at 3.6k and 1.8 min.


## The agent's account, verbatim

Asked after the build, resuming the session with read-only tools (`impressions.txt`). Where the audit found it wrong, see Audit.

# Building Ledger in Declare: an account for the Declare team

This covers one session: building the Ledger brief, about 3,800 lines across nine files plus a TypeScript helper file. I've reconstructed the code quotes from the session. Where I'm not sure of exact wording I say so.

---

## (a) Getting up to speed

**What I read, in order**

1. `README.md`. It sent me to the skill.
2. `skill/SKILL.md`, in full. This was the single most useful orienting document. The "What Declare handles for you" table and the "Drift check" kept me off several wrong paths before I wrote anything: no overlay with a hand-built scrim, no key chains in a `KeyListener`, no loops building rows.
3. `docs/declare.md`, in full.
4. Guide chapters 01, 04, 05 and 06, in full.
5. `apps/todo/todo.declare` and `todo-parts.declare`, in full.
6. `apps/tracker/tracker.declare`, in full, in two reads. The skill flags it as "worth reading whole". It was the nearest model: records listed, filtered, sorted, bulk-edited, with undo.
7. `docs/guide/14-data.md`, in full. DataSource, writes, `Form` and refusal mapping were central to the brief.
8. Many `npx declare-help` lookups: `Table`, `TableRow`, `DataGrid --all`, `RangeSlider --all`, `Combobox --all`, `Toast`, `Shortcuts --all`, `Popover --all`, `Sheet`, `Dialog --all`, `TabBar`, `Segmented`, `DatePicker`, `SearchField`, `Tooltip`, `Splitter`, `Menu`, `Text.numeralWidth`, `Accessibility`, `App`, `"theme tokens"`, `SanFrancisco`, `HTMLText`, `DrawContext`, `Focus`, `Form --all`, `Form.refusal`, `Field`, `TextInput`, `TextInput.select`, `TextInput.onEnter`, `Focus.focusIn`, `ValueControl.endEdit`, `Dialog.ask`.
9. Library source, in parts:
   - `library/datagrid.declare`, lines 194–443 and 783–944: how cells, edit cells and keys work.
   - Later, under pressure, `library/valuecontrol.declare` around lines 300–355 and `library/textinput.declare` lines 300–315.
10. `docs/operational/verify.md`. First I only grepped for `drive.`/`expect.`. I read lines 149–210 only after a failure (see (d) #15).
11. A grep of `docs/guide/19-accessibility.md`, to find the reduced-motion setting.

**What I skipped, and why.** I never read most guide chapters: 02 (notation), 03 (constraints), 07 (scrolling), 08 (controls), 09 (pointer and keyboard), 10–13, 15, and 16–31. That includes 16 (collections), 17 (your own views and drawing), 18 (overlays) and 21 (motion). The skill says to stop after the core reading and look things up on demand, and my context budget was finite. In hindsight:

- Chapter 09 (pointer and keyboard) might have saved me the focus, keys and double-click trouble in (d).
- Chapter 08 § "While the person is editing" might have flagged the edit/commit lifecycle that cost me most.

I also never read `operational/intake.md`.

**What taught me the most**
- The tracker app. It showed the whole shape of a records app: a dataset class with every write, derived `shown`, `Table` with selection on the App, toast with undo, `Shortcuts`.
- `declare-help --all` on `DataGrid` and `Combobox`. The `Combobox.creates` entry literally used "Printworks" as its example, which matched the brief's scenario 2 exactly.

**What was missing or misleading**
- **Key bindings.** `declare.md` §8 shows a binding as `({ key: "Ctrl+S", command: "save" })` in prose. I wrote it as a bare list (`keyBindings = [ ({…}) ]`) and was refused (see (d) #2). The rule that bare lists hold literals only is in §2, but the two weren't connected for me.
- **Form widths.** Every `Form`/`Field` example I saw (14-data § "A form") uses fixed widths (`TextInput [ width = 280 … ]`). None shows a control filling a `Field` with `width = 100%`. That is the trap I fell into (see (d) #16).
- **Reduced motion.** `declare-help reducedMotion` returned no entry and no near-miss suggestion. The real name, `reduceMotion` under `accessibilitySettings`, I found only by grep.
- **The assert-script signature.** That `page` is a separate parameter (`{ drive, expect, page }`) is stated in verify.md, but in a section I hadn't read. `drive.page` also exists and is Puppeteer's, which made the mistake easy (see (d) #15).

---

## (b) Expressing what I wanted

**Where it fit well**

- **One set of filters as App attributes, with every read addressed by them.** `fq: string = { filterQuery(app.spec(app.from, app.to)) }`, and each `DataSource` url built from `fq`. Change a filter anywhere and every page re-reads.
  - The documented rule that "a later `fetch()` supersedes an earlier one" gave me "an answer for filters since replaced is never shown" for free.
  - `loaded` vs `loading` gave me "keep the old results dimmed": `opacity = { app.txns.loading && app.txns.loaded ? 0.55 : 1 }`.
- **Derived values everywhere.** Summary line, selection totals, chips, sentences, budget state words: all constraints, with no update code. This genuinely matched how I think about the brief.
- **Library breadth.** `DataGrid` (sort seam, virtualized rows, keyboard), `RangeSlider` (two thumbs, `lowLabel`, `valueText`), `Combobox` (`creates`, `createRequested`), `Form` (judging, first-problem focus, `refusal` override for the service's `problems` shape), `Toast` with an action, `Shortcuts`, `Popover`, `Sheet` (side on desktop, bottom on phone), `Dialog.open`.
- **Mapping service refusals onto fields.**
  ```
  refusal(body: object) -> array { return super.refusal(({ errors: (body as any)?.problems ?? [] })) }
  ```
  With fields named `parts[1].amount`, `lines[0].quantity`, the service's errors would land on the right field. Caveat: I never triggered a real service refusal in a test (see (f)).
- **Themes.** A light and a dark record spread over `SanFrancisco`/`SanFranciscoDark`, with an array token for 12 category colours read as `provided("theme").cats[i]`. Dark mode worked first time.
- **`draw(d)` for charts.** Ordinary Canvas2D, re-run when what it reads changes.

**Where I worked around it**
- **Replicating a computed list needs a `Dataset`.** `datapath = { ({ chips: … }) }` is refused (DECLARE3006). I wrapped seven or eight small computed lists in `Dataset [ contents = { … } ]`: chips, legend, attention items, chart table, top-N lists. It's correct, but it's boilerplate for small views.
- **Animating a chart between data sets.** There's no "spring an array"; I did it by hand (see (g)).
- **Telling a single click from a double-click in a grid cell.** See (d) #24 and (g).
- **Making the whole app re-read after a write.** I put a `rev` counter into every URL. It works only because the service ignores unknown parameters (see (g)).

---

## (c) The first time it ran

The first boot was clean through R4. Things were wrong only when I looked:

1. **Every category chip had an amber outline**, the look meant only for "Uncategorised". Found from a `declare-look --shot` picture. See (d) #10.
2. **Insights → Trends drew days after today as zeros**, a collapsing line across the second half of November. Seen in a screenshot. My bug: the service returns every period that overlaps the range, including future ones.
3. **The Insights segmented controls overlapped their text** ("Income vs expensesBreakdown", "Gross margin %Number of sales"). Seen in a screenshot; no layout finding was reported. See (d) #13.
4. **The editor's fields were tiny** (about 35px wide). Seen in a screenshot, plus a boot layout finding. See (d) #16.
5. **Back from a drill-down didn't navigate.** Caught by my first assert script, which expected `app.page = "overview"`. A plain logic bug of mine.

Everything else surfaced while driving flows; see (d).

---

## (d) Every refusal and surprise

The fixes are in (d); the code exactly as it stood is quoted in (i), with the same numbers.

1. **Dev server port.** `npm start` said: `port 8200 is already taken by another Declare dev server, serving a different tree … PORT=8201 npm start`. I used 8201. *Judgement:* an excellent message.

2. **DECLARE1000 on `keyBindings`.** A bare list holding record expressions is refused; the message names the fix. I changed it to `{ [ … ] }`. *Judgement:* my code was wrong; the message is good. The docs show the record shape in prose without its enclosing form, which invited the mistake.

3. **A child named `x`.** My chip's close button was declared as a child named `x`. Message: `FilterChip.x is an attribute — a child may not take an attribute's name [DECLARE2000]`. I renamed it to `close:`. *Judgement:* my code; a fair rule and a clear message.

4. **A nullable default without `?`.** `source: DataSource = null` was refused: `…declared without '?', so never empty; write 'DataSource?'`. Fixed as told. *Judgement:* my code; good message.

5. **Accessibility role `img`.** Refused with the full enum list. I used `image`. *Judgement:* my ARIA reflex; good message.

6. **An attribute named `key`.** On `NavItem` I wrote `key: string = ""` for the shortcut hint. Message: `'key' is replication metadata — … choose another name ('field', 'code', 'name')`, plus a second error for each use site. I renamed it to `shortcut`. *Judgement:* the platform's choice is defensible and the message is clear, but `key` is a natural name for "keyboard key" in UI code. It's a trap, though a cheap one.

7. **DECLARE3006: a datapath into a literal.** Message: `a datapath is a place in declared data, and a literal is in none … 'items: Dataset [ contents = { … } ]'`. Fixed with a `chipData: Dataset`. *Judgement:* the rule is principled (identity, writes), the message is excellent, and the cost is boilerplate (see (b)).

8. **Warnings in the same run.**
   - DECLARE4020: `field (a textField) is inside EditCell (a button) … Make them siblings in a plain View`. I restructured (see (h)). A valuable catch.
   - DECLARE4002: `bare 'count' means BreakdownRow's member here, not the script { } binding of the same name`. This was a **real bug the compiler caught**: inside that class, `count(…)` would have called the number attribute, not my formatting function. I renamed the attribute to `n`.
   - DECLARE4025 lints (choices nested 3 or more deep): advice. I addressed two.

9. **A subclass re-declaring an inherited child.** `DescCell` (a subclass of `EditCell`) declared its own `show:` child. Message: `'show' is a child DescCell inherits from EditCell — a subclass cannot declare it again … What DescCell declares already goes into EditCell's show`. I rewrote `DescCell` as a plain view containing an `EditCell` plus a contact control. *Judgement:* my code; a clear message.

10. **The chip outline that wouldn't go away.** Every chip, including ones with a category, rendered with the amber outline (and the tint looked off). I replaced the two constraints with a `State`, and it rendered correctly. *Judgement:* **unsure.**
    - It could be a runtime bug where a constraint moving `stroke` from a value to `null` doesn't clear the paint.
    - Or `missing` might have been briefly true while records loaded, and the null didn't take.

    I didn't isolate it. My attempt to ask the running program failed silently (see #11). I'd like the Declare team to try reproducing it: a `stroke` constraint that starts non-null and becomes `null`.

11. **`declare-look --js` failed with no detail.** It reported `R5 ✗ behavior` and nothing else. Probably my JS threw (wrong `__declare` call shape), but the tool gave no error text. *Judgement:* a tool wart. Compare a later lookup by a wrong path, which answered well: `no node at 'app."Date, Nov 12. Press Enter to edit."' … nearest there: "Date, Nov 12, 2026. Press Enter to edit."`.

12. **A type annotation in a body.** In a `{ }` body I wrote `(this.src.value) as TxnDetail?`. Message: `'?' after a type is the declaration's shorthand … write TxnDetail | null`. A wrong path in the same run (`app.shell.main.bar.filters.search`, where the field lives under `controls`) got `'search' is not a member of this FilterBar`. *Judgement:* both mine; both messages good.

13. **Segmented text overlap.** No diagnostic, only the picture. Labels overlapped inside `TabBar` and `Segmented` at their natural size. I gave the controls explicit widths. *Judgement:* **unsure.** It may be my misuse (perhaps `segmentMinWidth`, or a stated width, is expected), but the layout checker, which catches text past a box elsewhere, didn't flag it here.

14. **Segmented has no `name`.** I tried to give the sale's channel picker a form name. Message: `Segmented has no attribute 'name' [DECLARE2000]`. *Judgement:* my assumption that every value control is a form field. That's fine, though `Segmented` as a form field would be natural.

15. **The assert script's `page`.** `unexpected error: page.getByRole is not a function`. I had written `const page = drive.page`; the right form is `async ({ drive, expect, page })`. *Judgement:* my error, but `drive.page` existing (as Puppeteer) makes it easy to make.

16. **Tiny fields in the editor.** Every `TextInput [ width = 100% ]` inside `Field [ … stacked = true ]` came out about 35px wide. The boot finding was: `app.editor._body.0.col.expense.1.2's children need 47 across and it has 35 …`. I added `width = 100%` to every `Field`. *Judgement:* my code. The layout chapter explains exactly this ("a child sized from its parent is not counted"), but nothing said "this `Field` is sized by content and its control by the `Field`". The finding pointed at a symptom deep inside. Field examples with fixed widths contributed.

17. **TypeScript literal widening.** A series built with a spread inside a ternary failed typing: `Type 'string' is not assignable to type '"bar" | "line" | "dashed"'`. Fixed with `as const`. *Judgement:* plain TypeScript; the message was clear.

18. **Reaching a field from the form.** `'field' is not a member of this MoneyField — did you mean '_field'?` and `'pick' is not a member of this View`. I had tried to reach an unnamed `TextInput` inside a `Field` subclass, and a named one through `Field`'s placement. I replaced it with `Focus.focusIn(this.col.expense)`. *Judgement:* my code. The "did you mean `_field`" hint points at a library internal, which is mildly misleading.

19. **Back didn't navigate.** `goBack` compared the page id with a title (`s.page == "Overview"`). Caught by an assertion. Entirely mine.

20. **`rowIndex` inside a row's children.** The `--semantics` output showed `combobox "Part 0 category"` twice. In `PartRow`, the children read `rowIndex`, which is each child's own built-in and always 0. I changed it to `classroot.rowIndex` in three classes. *Judgement:* documented ("built-ins never resolve outward", declare.md §3), but I didn't connect that `rowIndex` is a built-in on every view. A compiler hint would have saved an iteration: reading `rowIndex` on a non-replicated view that sits inside a replicated class's body is almost always this mistake.

21. **Locator `.or()`.** Not supported; the message said what to write instead. Fine.

22. **A checkbox in a popover not found** until motion was settled. The failure text suggested `drive.settleMotion()`. Good message.

23. **The in-place editing circle.** This was the most expensive thread; the code at each step is in (i) #23.
    - **(a) Tab didn't save.** The `commit` guard read `editing`, which `onBlur` had already set false. I removed the guard. No change.
    - **(b) Typing appended instead of replacing** ("Paper and inksPaper and inks"). `select(0, 99999)` and then `select("all")`, called right after focus, had no effect. Moving it into the field's `onFocus` with `afterDelay(0, …)` worked. *Judgement:* **unsure.** The `TextInput.select` docs say "a click into the field keeps the clicked caret"; I suspect my click on the cell counted as a pointer focus.
    - **(c) My `onBlur`/`onFocus` overrides replaced the library's own.** I added `super.onBlur()` and `super.onFocus()`. Tab still didn't save.
    - **(d) The real cause.** Reading `valuecontrol.declare`, the commit-on-leave happens in an internal `_member: Node`'s `onChange` at the close of the settle. My `onBlur` set `editing = false`, which discards the field (`exists = { classroot.editing }`) in the same settle, so that `onChange` never ran and the edit was silently dropped. The fix was to call `this.endEdit()` in `onBlur` before discarding.

    *Judgement:* the platform behaviour is explainable but is a **sharp edge**: a value control retired in the settle it loses focus loses its open edit, with no warning. My `onBlur` override replacing the base handler without `super` was also my fault, but the compiler warns about many subtler things and could warn here: "this override replaces `TextInput.onBlur` and doesn't call `super`".

    Cost: about eight verify runs and two library-source reads.

24. **Single click entered editing.** A design mistake of mine: the cell's `press()` began editing. I changed it so a click selects the row and a double-click edits. Then:
    - **The double-click landed on another cell.** The first click opened the detail panel, which narrowed the grid, so the second click hit a different column. The `--js` probe showed focus ending on `"Category, split. Press Enter to change."`. I delayed opening the detail by 280 ms when it wasn't already open, and skipped it if an edit had just started (a `Date.now()` stamp). *Judgement:* it works but feels like a workaround (see (g)).
    - **Arrow keys stopped working after a cell click.** The cell control had focus and the table's arrows live in the table's `onKeyDown`. I re-added `Focus.focus(grid)` in the row-press handler. *Judgement:* consistent with the docs (`onKeyDown` on the focused view).
    - **Escape didn't close the detail.** The `Table`'s own `onKeyDown` took Escape before my App-level `keyBindings`. Adding `keyBindings` to the grid subclass didn't help either. I overrode `onKeyDown` in `TxnGrid`. *Judgement:* matches the documented order ("comes after a focused control's own keys"). But I couldn't find a way for an app to say "my Escape first" short of overriding `onKeyDown`. Unsure whether one exists.

25. **"All 1 transaction — every transaction the filters match."** My `allMatching` was true for one selected row out of one. My logic.

26. **Touch targets.** Layout findings: `9 control(s) smaller than 44 × 44, a finger's target`, and later 4 in the editor and 13 in Insights on the phone. I fixed them all with `app.tap`/`touchFirst` heights. *Judgement:* an excellent finding; I would have missed most of these.

27. **Text past the window on the phone.** `app.shell.main.pages.insights.col.tabs runs past the window's right edge at 390 wide (it ends at 402)`. Cause: I'd sized the tabs with `Math.min(parent.width, 560)`, and `parent.width` includes the parent's padding. I changed it to `parent.contentBox("width")`. *Judgement:* my code; the guide states this distinction exactly.

28. **Test runs remember.** Several flow failures were the live service remembering earlier runs: a duplicate Printworks expense, an already-edited description, a budget that already existed. Verify said so explicitly ("this run failed after talking to http://127.0.0.1:8370, which earlier runs of this program wrote to…"), which was helpful. I made the scripts take what is there now.

---

## (e) Verifying it

**How I checked**
- **The ladder (R1–R4) after every edit.** It caught all the errors in (d) #2–#9, #12, #14, #17 and #18, usually several per run, each with a fix named. Fast (a few seconds).
- **`declare-look --shot` at milestones**, desktop and phone, light and dark. It caught #10, #13, #16, the future-days bug, the phone overflow, and the single-click-edits problem.
- **`--semantics`.** It caught `rowIndex` (#20), and it confirmed names for locators.
- **Eleven assert scripts (R5):**
  - the seven desk scenarios from the brief;
  - the phone expense;
  - in-place editing;
  - list keyboard travel (detail follows the arrows, End jumps to row 4,195, Escape closes);
  - chart keyboard: one Tab stop, sentence form checked by regex, Enter drills.

  They caught #19, #23, #24, and validated reconciliation: the summary equals the bar's value, the CSV total equals the summary, the Breakdown total equals the list.
- **`expect.request` with body matching.** Ideal for checking what was actually sent (PATCH bodies, bulk `categoryId`).
- **`drive.download`.** Made the CSV check trivial.
- **Manual cleanup of what the tests wrote**, with a Python script against the API. Totals returned to the starting 4,190 transactions and net $34,154.09. The Printworks contact remains, because the API can't delete contacts.

**How well the tools served me:** very well overall. They are better than what I'd normally have for a web app.

Weak spots:
- The `--js` failure with no message (#11).
- No finding for the `Segmented` text overlap (#13).
- R5 runs share and mutate a live service. `--fixtures` exists but needs recordings I didn't make.
- Each verify run reprints the same lint warnings, so I filtered output with `grep -v` constantly.

---

## (f) Confidence, part by part

**High (driven by scripts and seen running)**
- Overview figures, the income-vs-expenses chart and drill-down to the cent; Back.
- The split expense with a new vendor; saving waits while money remains unallocated.
- A sale from product taps; a refund by line; the sale showing what was refunded.
- Filters and chips; search; the amount slider by keyboard; the "Filtered" note on every screen.
- Bulk categorise with undo.
- CSV export reconciling.
- Budgets in words.
- The phone quick entry.
- In-place editing of description, date and amount.
- Row selection and the detail following the keyboard.
- Dark mode.
- The empty-results hint ("Remove '≥ $5,000' to see 22 transactions").
- Errors with Retry while the rest keeps working.

**Medium (built and seen, but not scripted)**
- Choosing a category or contact for a single row from the table (only the bulk path was driven).
- The comparison period dashed on Trends.
- Granularity switching.
- "Show as table".
- The Products table's sort; the Columns menu hiding columns.
- The 1.5-second "Still working…" message.
- Budget "Start from last month's spending" and Return moving down the budget list.
- The phone list grouped by day.

**Low, or likely to surface under a tester**
- **Service refusals inside the editor** ("Refund exceeds the original sale", "Category was archived") landing on the right field. The `refusal` override is written, but I never triggered one. Errors on `parts[i].*` and `lines[i].*` depend on `Form` matching those names exactly.
- **Failed in-place save with Retry.** Single-slot. The pending text also shows in the error colour while still saving, which is arguably wrong.
- **Dragging across a chart** to offer a date filter: untested.
- **Chart animation between filters:** untested. Reduced motion is honoured only in the charts.
- **Search sends a request per keystroke** with no debounce.
- **Typed dates in the editor** ("3 nov"): the parser was exercised only via "today" and "yesterday" in the grid.
- **The 280 ms delay before the detail opens on a first click** will feel slightly laggy.
- **"This month vs Oct"** compares a partial month with a full one, as the brief literally says. Early in a month it reads as a dramatic drop.
- **The bulk category chooser with no single row** lists both income and expense categories. Choosing one skips rows of the other kind; the toast mentions skipped ones.
- **Gross margin's sparkline** uses 0 for months with no revenue.

---

## (g) Gaps I worked around

1. **Saving a file (CSV export).**
   - *Wanted:* a platform way to hand the person a file.
   - *Did:* `script [ host = browser ] { function saveFile(...) { … Blob … a.download … } }`.
   - *Judgement:* **unsure.** `drive.download` in the test tools implies the platform knows the concept "the program gave the person a file", so there may be an API I didn't find. I never ran `declare-help save` or `declare-help download`.

2. **Re-reading everything after a write.**
   - *Wanted:* "these sources depend on server state; refresh them all."
   - *Did:* a `revision` counter on `Writes`, appended as `&rev=N` to every read URL through a shared `Read extends DataSource` class.
   - *Judgement:* idiomatic enough (the address *is* the reactive thing), but it relies on the server ignoring unknown parameters. I can't tell whether the platform lacks a cleaner invalidation.

3. **"Slow service" detection.**
   - *Wanted:* a `DataSource` fact like "loading for more than N ms".
   - *Did:* in `Read`, `trackChanges = ["loading"]` plus `afterDelay(1500, …)`.
   - *Judgement:* probably genuinely absent. Small to write, but every app wants it.

4. **Animating chart data from old values to new.**
   - *Wanted:* "spring this array" or a tween on a data set.
   - *Did:* `trackChanges = ["series"]`, kept `e.changed[0].previousValue` in `before`, sprang a generation counter `t` toward `gen`, and interpolated in `draw`.
   - *Judgement:* the platform's arranged-motion tools (`TweenLayout`, `Spring`) are about views and scalars, and drawn data isn't views. Likely a real gap for charts; unsure.

5. **Single click vs double-click** (see (d) #24).
   - *Wanted:* a click that fires only when it isn't the first half of a double-click, or a way to keep a layout from shifting under the pointer between the two.
   - *Did:* `afterDelay(280)` plus a `Date.now()` stamp set when editing begins.
   - *Judgement:* the docs say a view with `onDoubleClick` "hears its first click at once", which is the opposite of what I needed. Unsure whether an option exists.

6. **Editable custom cells in `DataGrid`.**
   - *Wanted:* display cells (a chip, highlighted text) that turn into fields, with Return saving.
   - *Looked at:* `edit: true` / `DataGridEdit`. It is always a text field, and Return moves down a row, spreadsheet-style.
   - *Did:* my own `EditCell` class (a Control showing the value, with a field that `exists` while editing). That is what led into (d) #23.
   - *Judgement:* the platform offers spreadsheet editing, not "display, then edit in place". A `DataGrid` cell mode for that would help.

7. **Search highlighting.**
   - *Wanted:* a background highlight on matched text.
   - *Did:* `HTMLText` with `<span class='Hit'>` and `style Hit [ fontWeight = semibold ]`.
   - *Judgement:* unsure whether a `style` can carry a background. I didn't check.

8. **Escape priority for the app.**
   - *Wanted:* "close the detail before the table clears its selection".
   - *Did:* overrode `TxnGrid.onKeyDown`.
   - *Judgement:* documented ordering. Possibly there's a better hook I didn't find.

9. **A confirm dialog with custom buttons.**
   - *First looked at:* `Dialog.ask`, which is Cancel/No/Yes.
   - *Did:* `Dialog.open(title, message, buttons, "destructive", cb)`.
   - *Judgement:* present, just one more lookup. Fine.

10. **Phone list grouped by day.**
    - *Did:* a separate `PhoneList` with `virtualize` and `classFor = { :head != null ? DayHead : PhoneRow }`, rather than `DataGrid` heading rows.
    - *Judgement:* this was choice, not a gap; I wanted touch-sized rows that weren't table-shaped.

---

## (h) Changes of direction

1. **`EditCell` as a Control containing its field → a View with a `show: Control` and a sibling field** (`defaultPlacement = show`). Changed early, at the first full compile, because of DECLARE4020.
2. **`DescCell` as an `EditCell` subclass → composition.** Changed at the same time, because of the inherited-child refusal (d #9).
3. **The chip's conditional `stroke`/`fill` constraints → a `State`.** Changed right after first seeing the transactions page (d #10). Also the more idiomatic form, per the lint text.
4. **Filter chips as a computed array → a `chipData: Dataset`.** Changed at the first compile (DECLARE3006). After that I wrote every small replicated list that way from the start.
5. **The editor focusing fields by path → `Focus.focusIn(section)`.** Changed after the refusal (d #18).
6. **Confirm delete: `Dialog` with `buttons`/`picked` → `ask` → `open(…)`.** Changed before first compile, on reading `Dialog --all`.
7. **Slow detection on the App (a `watchLoad: Node` watching `txns.loading`) → a `slow` fact on the shared `Read` class**, used by every panel. Changed late, on my own second thought, when I noticed only the list had it.
8. **Click behaviour in the grid: click edits → click selects and double-click edits → the delayed detail opening.** Changed late, from screenshots and (d) #24. Within this, focusing the grid on a cell press went in, out, and back in.
9. **Selecting the text being edited: `afterSettle` + `select(0, 99999)` → `select("all")` → `onFocus` + `afterDelay(0)`.** Changed late, during (d) #23.
10. **The cell field's blur: plain `editing = false` → `super.onBlur()` → `super.onBlur(); this.endEdit(); editing = false`.** Changed late, during (d) #23.
11. **Insights measure picker: a `Segmented` everywhere → a `Segmented` on desktop and a menu on the phone; shorter tab label on the phone.** Changed at the very end, from a phone screenshot.
12. **`Books.loaded`/`failed` as long `&&`/`||` chains → a `sources` array with `every`/`some`; the Kpi `changeText` nested ternary → a `describe()` method.** Changed at the end, from DECLARE4025 lints.
13. **Fetching only the visible window of transactions → fetching all of them (up to 10,000).** Decided before writing, after measuring 1.1 MB in 15 ms for all time. Never reversed.

---

## (i) The code, quoted

Numbers match the items in (d). Messages are exact where I copied them; code is reconstructed from the session and close but may differ in whitespace.

**#2**
```
keyBindings = [ ({ key: "Escape", command: "escape" }) ],
```
> `expected a value, got '(' — a value written bare is a literal; an expression goes in braces: { ({}) }, { (a + b) / 2 } [DECLARE1000] (line 349, col 21)`

**#3–#6**, reported together in one run:
```
class FilterChip [ …, x: Control [ width = 22, height = 22, … ] ]
class LoadState [ width = 100%, source: DataSource = null, … ]
class TimeChart extends Control [ height = 260, accessibilityRole = img, … ]
class NavItem extends Control [ …, key: string = "", … ]
NavItem [ id = "overview", label = "Overview", key = "1" ],
```
> `FilterChip.x is an attribute — a child may not take an attribute's name [DECLARE2000]`
> `LoadState.source's default expects a DataSource — declared without '?', so never empty; write 'DataSource?' to let it be null, got 'null' [DECLARE2000]`
> `TimeChart.accessibilityRole expects an AccessibilityRole (one of none | button | … | image | …), got 'img' [DECLARE2000]`
> `'key' is replication metadata — 'key = …' where an element is used names a replicated record's identity, so an attribute called 'key' could never be set; choose another name ('field', 'code', 'name') [DECLARE2000]`

**#7, #8**
```
chips: array = { classroot.chipList() },
…
View [ datapath = { ({ chips: classroot.chips }) },
    FilterChip [ datapath = :chips[], … ] ]
```
> `a datapath is a place in declared data, and a literal is in none — … 'items: Dataset [ contents = { … } ]' … [DECLARE3006] (ledger-screens.declare:211:27)`

```
class EditCell extends Control [ …, field: TextInput [ exists = { classroot.editing }, … ] ]
```
> `warning: field (a textField) is inside EditCell (a button): the inner is read as part of the outer's name, and a screen reader that takes the outer as one element (VoiceOver does) never reaches it. Make them siblings in a plain View … [DECLARE4020]`

```
class BreakdownRow extends Control [ …, count: number = 0,
    accessibilityLabel = { … + count(classroot.count) + " transactions" }, … ]
```
> `warning: bare 'count' means BreakdownRow's member here, not the script { } binding of the same name — the script one cannot be reached from a body while the member exists; rename one of them [DECLARE4002]`

**#9**
```
class DescCell extends EditCell [
    show: View [ visible = { !classroot.editing }, … contact: Control [ … ] ] ]
```
> `'show' is a child DescCell inherits from EditCell — a subclass cannot declare it again; give yours another name (DescCell inherits show). What DescCell declares already goes into EditCell's show [DECLARE2000]`

**#10** (no message; the behaviour couldn't be explained)
```
class CatChip [ height = 22, cornerRadius = 11, padding = [0, 9, 0, 7],
    categoryId: string? = null,
    splitParts: number = 0,
    missing: boolean = { classroot.splitParts == 0 && classroot.categoryId == null },
    fill = { classroot.missing ? provided("theme").warnTint : provided("theme").catTints[Math.max(0, classroot.colourIndex)] },
    stroke = { classroot.missing ? stroke(1, provided("theme").warn) : null },
    … ]
// used as: CatChip [ y = center, categoryId = { classroot.txn.categoryId ?? null }, splitParts = { classroot.txn.split?.parts ?? 0 } ]
// inside a DataGrid cell class, txn = { :@ }
```
Observed: every chip outlined in amber. The dot / "!" children, which read the same `missing`, were correct. Replaced with:
```
fill = { provided("theme").catTints[…] },
State [ applied = { classroot.missing }, fill = { provided("theme").warnTint }, stroke = { stroke(1, provided("theme").warn) } ],
```

**#11**
```
npx declare-look ledger.declare --size 1400x900 --set app.location=transactions --wait-real 1500 --wait 300 \
  --js "(() => { const v = __declare.at(1000, 286); const p = __declare.pathOf(v); return [p, JSON.stringify(__declare.explain(p, 'stroke')).slice(0,600)] })()"
```
Output: `R1 ✓ … R4 ✓ boot / R5 ✗ behavior`, with no further text.

**#12**
```
t: TxnDetail? = { this.src.value as TxnDetail? },
searchField: TextInput = { app.shell.main.bar.filters.search },
```
> `'?' after a type is the declaration's shorthand (a slot's or a parameter's: string? is string | null), not a { } body's — a body is TypeScript, so write TxnDetail | null [DECLARE6001]`
> `'search' is not a member of this FilterBar — declare it (search: <type> = …) or fix the name [DECLARE6001]`

**#13** (no diagnostic)
```
tabs: TabBar [ value = { app.insightsTab }, accessibilityLabel = "Insights",
    items = { [ ({ id: "trends", label: "Trends" }), ({ id: "income", label: "Income vs expenses" }),
                ({ id: "breakdown", label: "Breakdown" }), ({ id: "products", label: "Products" }) ] }, … ]
Segmented [ value = { app.trendMeasure }, items = { app.measures.map((x) => ({ id: x.id, label: x.name })) }, … ]
```
Labels rendered overlapping at the natural width; no layout finding was reported.

**#14**
```
chan: Segmented [ width = 100%, name = "channel", value = { classroot.channel }, … ]
```
> `Segmented has no attribute 'name' [DECLARE2000]`

**#15**
```
export default async ({ drive, expect }) => {
  const page = drive.page;
  …
  await page.getByRole("button", { name: "New expense" }).first().click();
```
> `unexpected error: page.getByRole is not a function`

**#16**
```
class DateField extends Field [ label = "Date", stacked = true,
    View [ width = 100%, layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
        TextInput [ flexes = true, name = "date", … ],
        Text [ … ] ] ]
Field [ label = "Vendor", stacked = true, Combobox [ width = 100%, … ] ],
```
> `layout after settleMotion: app.editor._body.0.col.expense.1.2's children need 47 across and it has 35, so app.editor._body.0.col.expense.1.2.1 runs past its end. Let a child give room up (shrinks = true), take what is left rather than the whole (flexes instead of width = 100%), or let app.editor._body.0.col.expense.1.2 scroll or clip.`

**#17, #18**
```
...(app.cmp == null ? [] : [({ id: "was", …, kind: "dashed", tone: … })])
const f = kind == "expense" ? this.col.expense.amountField.field : kind == "sale" ? this.col.sale.chan : this.col.refund.pick
```
> `… Type 'string' is not assignable to type '"bar" | "line" | "dashed"'. [DECLARE6001] (ledger-reports.declare:292:9)`
> `'field' is not a member of this MoneyField — did you mean '_field'? [DECLARE6001]`
> `'pick' is not a member of this View — declare it (pick: <type> = …) or fix the name [DECLARE6001]`

**#19**
```
snapshot(label: string) -> FilterState { return ({ page: page, …, label: label }) },
goBack() { … location = s.page == "Overview" ? "overview" : s.page == "Insights" ? "insights" : … : "transactions" }
```
> `expected app.page = "overview", got "transactions"`

**#20**
```
class PartRow [ width = 100%, editor: Editor? = null,
    CategoryBox [ flexes = true, name = { "parts[" + rowIndex + "].categoryId" },
        accessibilityLabel = { "Part " + (rowIndex + 1) + " category" }, … ],
    … ]
// used as: PartRow [ datapath = :parts[], editor = { classroot } ]
```
`--semantics` showed `combobox "Part 0 category"` twice, which made the test's `getByRole("combobox", { name: "Part 1 category" })` fail with "found nothing within 5 s".

**#23**, at each step:
```
class EditCell [ …,
    begin() { if (!canEdit) return; editing = true
        afterSettle(() => { if (classroot.field != null) { Focus.focus(classroot.field); classroot.field.select(0, 99999) } }) },
    stop() { editing = false; Focus.focus(this.show) },
    show: Control [ visible = { !classroot.editing }, …, press() { classroot.begin() } ],
    field: TextInput [ exists = { classroot.editing }, …, commitOn = "end",
        value = { classroot.start },
        commit(v: string) { if (classroot.editing && v != classroot.start) classroot.accept(v) },
        onEnter() { classroot.stop() },
        onBlur() { classroot.editing = false },
        onKeyDown(e: KeyEvent) { if (e.key == "Escape") { this.cancelEdit(); classroot.stop(); return } super.onKeyDown(e) } ] ]
```
- Step 1: Tab after typing "yesterday" sent nothing.
  > `expected a PATCH /api/transactions/t04191 with {"date":"2026-11-11"} — sent: 1 PATCH … with {"description":"Paper and inks"}`
- Step 2: after removing `classroot.editing &&`, the description PATCH carried `"Paper and inksPaper and inks"`, then `"…inksPaper and inksPaper and inks"` after switching to `select("all")`.
- Step 3: `onFocus() { afterDelay(0, () => this.select("all")) }` fixed the selection. `onBlur() { super.onBlur(); classroot.editing = false }` still sent no PATCH on Tab.
  - Before Tab, `document.activeElement` was the `<input aria-label="Date, Nov 12, 2026">`; after Tab it was a `<div>`.
- Step 4: `onBlur() { super.onBlur(); this.endEdit(); classroot.editing = false }` fixed it.

**#24**
```
show: Control [ …, onClick(e: PointerEvent) { app.rowPressed(classroot.txn, e) },
    onDoubleClick() { classroot.begin() }, press() { classroot.begin() } ],
rowPressed(t: Txn, e: PointerEvent) { … g.rowClick(i, t, e.meta || e.ctrl, e.shift) …
    if (!e.meta && !e.ctrl && !e.shift) detailOpen = true },
```
After `--dblclick 'app."Description, Paper and inks. Press Enter to edit."'`, the probe returned:
> `[true, 1, "DIV", "Category, split. Press Enter to change."]`

Escape with focus on the grid:
> `expected app.detailOpen = false, got true`

That was the result both with the App's `keyBindings = { [ ({ key: "Escape", command: "escape" }) ] }` alone, and with the same added on `TxnGrid` with `escape() -> boolean { return app.escape() }`.

---

## Overall

**Surprises**
- How much of the brief the library already covered: `Combobox.creates`, `Form.refusal`, `RangeSlider` labels, `DataGrid`.
- How far "every read is addressed by the filter" carried. The guarantees I worried about (stale answers, totals reconciling) came almost free.
- In the other direction: how much the lifecycle of focus, edit, settle and retire can bite.

**What was good**
- The diagnostics. Nearly every refusal named its fix, and several warnings caught real bugs (the `count` shadowing above all).
- `declare-help`, and the verify ladder.
- Assert scripts with real input and request assertions; `--semantics`; touch-target findings.
- Derived state everywhere, and themes through `provided`.

**What was bad**
- Silent failures at boundaries: the dropped edit (#23), the stuck stroke (#10, unsure), the opaque `--js` failure.
- Overriding a library handler (`onBlur`, `onFocus`) replaces it silently.
- Small-list boilerplate (a `Dataset` for every computed replication).
- Live-service test state.

**How it differs from what I know, and what it reminded me of**
- Closest to **QML**: property bindings, states, `id`-addressed children.
- Data paths reminded me of **XForms/XPath** (and, I gather, OpenLaszlo).
- The reactivity feels like **MobX**, or a spreadsheet.
- Unlike **React** there's no render function; the shape is fixed and data replicates it. That made the code shorter and more inspectable, but the cost moved into knowing the platform's event ordering.
- Unlike **SwiftUI**, layout has a single decider, and the diagnostics actually explain it.

**Where I'd most want improvement**

1. **The edit and focus lifecycle around `exists`.** This is a pattern, not one obstacle; it cost me the most of any single area, about eight to ten verify runs.

   To write it right the first time I'd have needed:
   - a sentence in 08-controls or 14-data: "a value control that is discarded in the settle it loses focus never commits; call `endEdit()` first";
   - a compiler warning when an override of a library control's `onBlur`/`onFocus`/`onKeyDown` doesn't call `super`;
   - ideally, the platform committing an open `commitOn = "end"` edit when the control retires.

2. **A "display, then edit" cell mode in `DataGrid`**, so apps don't hand-roll `EditCell`.
3. **A hint when `rowIndex` is read on a non-replicated view inside a replicated class.**
4. **A layout finding for text overflowing a `Segmented` segment.**
5. **Fuzzy matching in `declare-help`** (`reducedMotion` → `reduceMotion`).
6. **Error text when `declare-look --js` throws.**

**What I'd use it for:** data-heavy internal tools and dashboards like this one. Records, filters, charts and forms are its sweet spot, and the verify tooling makes them unusually checkable. I'd be cautious about anything heavy on custom text editing until the edit lifecycle is smoother.

## Names ledger

```
NAMES — eval-ledger-5.noindex: 4 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    12 · member    · search               · this FilterBar           · —                  · none         · ×1  ·   13 · resolved
         'search' is not a member of this FilterBar — declare it (search: <type> = …) or fix the name [DECLARE6001] (line 416, col 59)
    19 · attribute · name                 · Segmented                · —                  · none         · ×1  ·   19 · resolved
         Segmented has no attribute 'name' [DECLARE2000] (ledger-editor.declare:201:45)
    19 · member    · field                · this MoneyField          · —                  · did-you-mean · ×1  ·   19 · resolved
         'field' is not a member of this MoneyField — did you mean '_field'? [DECLARE6001] (ledger-editor.declare:121:68)
    19 · member    · pick                 · this View                · —                  · none         · ×1  ·   19 · resolved
         'pick' is not a member of this View — declare it (pick: <type> = …) or fix the name [DECLARE6001] (ledger-editor.declare:121:130)

SUMMARY: 3 of 4 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
