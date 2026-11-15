# Ledger run 10: Opus 5.5, Declare, on the local tree, standard level

The round's final tree (`ab1dfad6` with the uncommitted name-check fixes). **44.1 min, 176
turns, 206k output tokens** (45k thinking). Not scored: the audit is the result. Timing record:
`evals/timings/2026-11-14-ledger-run10-local.txt`.

## Time, against the other standard-level Ledger runs

| | 7 | 9 | 10 |
|---|---|---|---|
| total | 44.5 | 47.8 | 44.1 min |
| turns | 169 | 191 | 176 |
| output tokens (thinking) | 222k (58k) | 229k (56k) | 206k (45k) |
| reading · writing · checking | 6.1 · 7.0 · 31.4 | 5.3 · 0.1 · 42.3 | 4.1 · 6.5 · 33.5 |
| tool time · model time | 11.6 · 32.9 | 14.6 · 33.1 | 14.3 · 29.8 |
| verify calls | 55 | 65 | 62 |
| output per model-minute | 6756 | 6926 | 6913 |
| pace | 1.01 | 0.98 | 0.98 |

The time is in line with runs 7 and 9, and the service rate was normal. About 4 min went to
reading, then one slice was written and compiled, and the rest was built screen by screen
against the live service. Three quarters of the run was checking:
- 14 scripts of its own, 12 at desk size and 2 on the phone;
- 16 screenshots looked at.

Inside verify, R5 took 10.7 min over 82 runs.

## Platform and tooling findings

1. **A frame-rate check counted the pauses between the script's own steps.** On the full
   history (about 4,200 rows), `drive.profile` around four separate 900-px wheel turns
   reported "a new picture reached the screen every 630.9 ms at the 95th percentile, over 50".
   The agent profiled further and found frames at 12.7 ms median and 50 ms p95. It concluded
   that 630 ms was the gap between wheel turns, not jank, and re-measured with forty 120-px
   steps (p95 18.7 ms). **To check:** whether the interval should count only while something
   is changing on screen. As reported, it sent a fast list into a profiling detour.
2. **In-place editing selects nothing on entry.** A DataGrid cell's editor (a `Combobox` or a
   `TextInput`) took focus with its caret after the current value. Typing then appended:
   "Advert" became "SoftwareAdvert", and the PATCH carried it. The agent wrote a
   `SelectOnFocus` node, a constraint on `field.focused` that calls
   `afterSettle(() => f.select(0, …))`, and placed it in five editors. `declare-help` has no
   such option (`TextInput.selectOnFocus`: "no member"). A spreadsheet-style cell editor
   should start with its value selected. **To decide:** whether that is the DataGrid's
   default for its editors, or an option on `TextInput`.
3. **Tab out of a cell editor moved focus but did not commit: not reproduced.** The agent's
   two-field editor (description and contact) moved on with `Focus.focus(classroot.who.entry)`,
   and its script saw no PATCH for the description until it added `this.endEdit()`. A
   two-field editor in a DataGrid, with a Tab binding on the first field that focuses the
   second, commits the first as focus leaves it (probe on the same tree). The miss was most
   likely the script's or the app's own write path. It cost two verify rounds.
4. **A toast over an open sheet is inert: a platform bug.** `getByText("Saved expense ·
   $4.20")` found no element, so the agent read the model instead. **Reproduced** in a
   six-line probe: a Sheet open and `toast.say("Saved expense", undo)`. The toast paints
   above the sheet with its Undo showing, but:
   - its elements sit inside an `inert` subtree, so they are out of the accessibility tree and
     the message is not announced;
   - a real mouse click on Undo does nothing (`picked` never runs).

   The Toast's own prose promises it "stays above an open dialog or sheet, its action still
   clickable". Cause: an open modal makes every sibling up its ancestor chain inert
   (`holdInert`, `runtime/src/semantics-dom.ts`), the toast's layer with them.
5. **The dev server, twice.** `npm start` with no port took the README's 8200, so the first
   look was refused. The agent then read the harness's port from the output. Later its
   background process hit the agent's own time limit and stopped. Both cost a step each.
   Neither is the platform's.
6. **CSV export through a browser script**, as in every Ledger run: `URL.createObjectURL`, an
   `<a download>`. The platform still has no way to hand the person a file.
7. **`errorBody as any`, 7 times.** A write source's refusal body is typed `object`, so every
   `onError` that reads `message` or `problems` casts. Two more casts are on `this.value` of
   write sources with no schema. A typed refusal (the error body's shape declared once on
   the source) would remove them.

## Refusals

Every refusal was fixed in one step from its message:
- `HTMLText` given `wrap` and `text`: the message names `html` and shows `escapeHtml`.
- `accessibilityLiveRegion`: the name is `accessibilityLive`.
- **A script function named `escapeHtml`, the fourth run to collide with it**
  (`docs/system-design/global-names.md`).
- A `classFor` naming a class that does not extend the line's class.
- `accessibilityCurrent` computing `null`: the message names the token `none`.
- `undefined` passed where `number | null` was declared.
- `.label` and `.id` read on `object`.
- A schema field typed `object` (DECLARE5000), changed to `any`.
- `accessibilityRole = img`: the token is `image`.
- A Spring driving a `width` that a constraint already binds.
- `valueOf` as an App member.
- `super.onKeyUp()` under a Combobox.
- `rowIndex` read on a view that is not replicated (a warning).
- A Field's child read through an unnamed view.
- `onPointerLeave` declared (a warning naming `hovered`).

## Source reads

All of them came before writing, and none was of the runtime or compiler:
- **`library/rangeslider.declare`**, read whole after `declare-help RangeSlider --all`.
- **`library/datagrid.declare`**, about 400 lines, after `declare-help DataGrid --all`,
  then its cell and editor classes.
- **`library/table.declare`**, for Space and select-all.
- **`library/themes/sanfrancisco.declare`**, for the grid tokens.
- **`library/combobox.declare`**, grepped for how to select the entry's text (finding 2).

The DataGrid and Table reads are the same questions Ledger 9 read for. The reference answers
for those questions were added in befff628, and this run looked them up first, then read on.
**To check:** which answer the reference gave it, and why it was not enough. The theme and
combobox reads point at gaps: the grid tokens are not listed under DataGrid, and there is no
select-on-entry.

## Idiom

3,807 lines (3,347 non-blank) in 8 files, with two script blocks:
- money and date helpers, the filter as a query string, and the CSV writer;
- chart geometry.

Reviewed against the SKILL's drift list:

- **The time chart is one drawn `Control` with its own hit test**: `pick(x, y)` works out
  which bar or line point is under the pointer. A phone tap inside a bar picked the
  net-profit line passing nearby, and the agent reordered its tests. The SKILL's drift check
  (befff628) now says that what a person presses is a view, whatever its shape. This run is
  the first test of that line, and it did not take for the time chart. The bar list did
  follow it: each row is a `BarLine` view. A chart that is one focus stop with arrow keys has
  a case (as a Slider does), but the hand hit test is the drift.
- **Screens and editor kinds switched with `visible = { … == "…" }`**: four screens (one
  with `exists`), and the editor's expense, sale and refund panels. The panels would read
  better as a class per kind, as noted in Ledger 9.
- **Records:**
  - every request is a `DataSource`;
  - the list is virtualized;
  - the editor is a `Form` whose refusals land on their fields;
  - undo is a service call.
- **Casts:** 23 `as any`, 7 of them on `errorBody` (finding 7).
- **Long lines:** 115 over 150 characters after `declare-format` (Ledger 9: 59).
- **Hand-made controls and overlays:** none beyond the chart.
