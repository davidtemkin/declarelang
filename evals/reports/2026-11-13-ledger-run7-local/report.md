# Ledger run 7: Opus 5.5, Declare, on the local tree

Built on the local working tree after the build-list batches (2026-11-13), at the standard
level. **44.5 min, 169 turns, 222k output tokens** (58k thinking). Run 6, on the bare prompt,
took 37.9 min. **8 of 8 hidden checks pass**, after one drive fix (below); run 6's app scores
8 of 8 on the corrected drive too. Timing record: `evals/timings/2026-11-13-ledger-run7-local.txt`.

## The hidden drive

The first full drive gave 7 of 8: `budget_words` failed. The fault was the drive's. The app's
category picker is a combobox named "Add a budget", and the drive looked only for a field named
for a category. `evals/apps/ledger/drive.mjs` now also takes a field named for adding or setting
a budget. Rerun with `--only=budget_words`: pass.

## Where the time went

| Minutes | Segment | Class |
|---|---|---|
| 0–6.1 | Reading the skill, the guide, the reference; DataGrid source | Legitimate (source read audited below) |
| 6.1–13.1 | Writing eight files | Legitimate |
| 13.1–14.3 | **DatePicker crash on a malformed date** | **Platform, ~1.2** |
| 14.3–33.9 | Compile fixes, flow scripts 1–7, looks, phone | Legitimate; checking 31.4 min of the run |
| 33.9–37.3 | **Tab out of its own DataGrid editors** | **Platform, ~3.4** |
| 37.3–44.5 | States script, fixes, cleanup of the service, the account | Legitimate |

Verify took 10.6 min in 56 calls (median 8.6 s); R5 scripts were 7.1 min of it.

## Platform findings, fixed

- **P1. A DatePicker crashed the program on a malformed value.** The agent's preset ranges ran
  before `today` was known and produced `"NaN-NaN-NaN"`; `MonthCalendar._weeks` threw
  "Invalid time value" and the program did not boot. The agent first dropped `min`/`max`, then
  guarded its own helper. Fix: `MonthCalendar._dateOf` answers today for a string that names no
  day (`library/datepicker.declare`).
- **P2. Tab did not leave a DataGrid editor.** The agent's columns used `editor:` classes of
  its own; Tab moved the focus out of the rows instead of to the next cell. It read
  `datagrid.declare` twice and built its own handling. Fix: the grid binds Tab and Shift-Tab
  when editing (as it binds Escape and Enter), and the grid's text editor takes them too: the
  edit ends a cell along, wrapping rows. Tests: `test/library.test.mjs`,
  `test/key-bindings.test.mjs`.

## Source reads

The library was read in 7 files, `datagrid.declare` 10 times. The first reads (at 2.9–5.0 min)
were for the editor protocol: what `editor:` gives the keyboard, and how a cell is left. The
reference (`declare-help DataGrid`) states the protocol but not Tab; with P2 fixed and the class
prose naming Tab, the second round (33.9–36.4) has no reason left. The DatePicker read was the
crash. The others (toast, table, combobox, theme) were models for the agent's own controls.

## Its code, one-step refusals

`img` for `image` (named by the message), `?` after a type inside a `{ }` body (four times —
`T?` is the declaration shorthand, refused in TypeScript with a message that says what to
write), `HTMLText.wrap`, a percentage inside a body, a library class name taken
(`ToolButton`), a datapath into a literal. Three raw TypeScript messages reached it without a
Declare gloss: `Argument of type 'number' is not assignable to parameter of type 'never'` (an
empty array literal), `Index signature for type 'string' is missing in type 'ProdRow'`, and
`Type 'undefined' is not assignable to type 'number | null'`.

## Open, for the user

- Four `T?`-in-a-body refusals in one run: the declaration shorthand leaks into bodies. Accepting
  it there (as `T | null`) would be a base-language change; not made.
- The three raw TypeScript messages above could each get a Declare gloss.

## Not established, by its account

Charts by mouse (hover, drag a range, bar motion), scrolling all 4,196 rows, sorting and hiding
columns, the toast's Undo button, a real screen reader.
