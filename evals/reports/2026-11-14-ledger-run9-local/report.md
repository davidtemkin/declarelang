# Ledger run 9: Opus 5.5, Declare, on the local tree, standard level

The validation round after the 2026-11-13/14 fixes, run beside Presentify 9. **47.8 min, 191
turns, 229k output tokens** (56k thinking): reading 5.3, checking 42.3 min; tool time 14.6 min,
of it `declare-verify` 12.3 min over 65 calls. Timing record:
`evals/timings/2026-11-14-ledger-run9-local.txt`.

## Hidden checks

| | first clean boot (13 min in) | as delivered |
|---|---|---|
| Score, on today's tree | 2/8 | **8/8** |

The first boot came before the forms and the overview were written: 2/8 is a partial build,
not wrong code.

## Platform findings

1. **FIXED — a pinned child of a padded scrolling view painted the padding twice.** The editor
   sheet's foot (`ignoreScroll`) sat 24 px right and down from where the model put it; the
   agent measured the model as right and the paint as wrong, and finally put the foot in flow.
   Cause: the DOM backend's sticky frame, which holds `ignoreScroll` children, sat inside the
   pane's CSS padding (the inset), so a child already shifted by the inset got it again.
   `seatScrollFrame` (`runtime/src/dom-backend.ts`) cancels the start padding, flowing and
   stuck, and re-seats on a padding change. Test: `gesture.test` ("a padded pane's pinned
   child…"). Canvas paints from the model and was right.
2. **FIXED — a constraint cycle on the phone only.** The App (no height of its own, a row with
   `align = stretch`, a `main` column whose body flexes) cycled at 390×844, not at 1280×800.
   Cause: an App's unset size is its host's, but the layout asked before attach, found the
   height unset and unowned, and took it as measured from the children, so `stretch` fell
   back to the tallest child, and nothing it tracked moved when the host's size took the
   slot. A row stayed as tall as its tallest pane (a two-pane case showed `main` 50 tall in an
   800 window), and on the phone, with one pane left in the row, that pane's height came back
   round as the line. Not caused by this round's first-size change (it cycled with that
   change off). `sizedByChildren` now answers no for an App (`runtime/src/layout.ts`); the
   pane stretches to the window, and the run's snapshot no longer cycles. Test: `unit.test`
   ("an App's unset height is its host's…"). The agent had fixed it in one step,
   `height = { app.hostHeight }`.

## The DataGrid reads

`library/datagrid.declare` and `table.declare` were read for cell formatting, row height, and
select-all; `rangeslider.declare` for where the track starts; `sheet.declare` for the body's
padding (finding 1). The run's copy of the tree was made before this round's DataGrid
reference additions (formatting with a `MoneyCell` example, `gridRowHeight`, select-all through
`commit(records)`, Tab), which answer the first three. This run is the evidence for them, not a
test of them.

## Refusals

All one step on the message: an `accessibilityCurrent` of `null` (the message names `none`), a
`datapath` on computed rows (boot), a child named like the form's `error` attribute, `valueOf` as
a member name, a meter role without its values, `globalAlpha` read back from the draw context,
`parent.padding` typed as a readonly tuple where the agent wanted `number[]`.

**Round note — `datapath` on a computed value**, three apps this round (Venue 34's Carousel,
this list, Presentify 8's `errorBody`), each fixed on the message. **FIXED in the teaching:**
`declare.md` §7 and `14-data.md` now say a datapath points into declared data, never at a value
computed in `{ }`, and that computed records are a derived `Dataset`.

## Other

- CSV export was written as a browser script, as in every Ledger run: the platform has no way
  to hand the person a file.
- The agent started its dev server with `PORT=8200`, the README's default, overriding the port
  the harness gave it; Presentify 9, running beside it, found 8200 answering with this run's
  tree.

## Idiom

3,268 lines of Declare (Ledger 7: 3,099 and a 324-line script; here one browser script for the
download). 16 views switched by `visible = { x == "…" }` (Ledger 7: 9): the four screens, the
Insights tabs, and the editor's expense / sale / refund panels — the last would read better as
a class per kind. 59 lines over 150 characters (88 in run 7). Reviewed against the SKILL's drift list: two casts, every request a `DataSource`, no
hand-made controls or overlays. The charts read the pointer's `x` as a period index (a
drawing scrubbed across and brushed; not the hand hit-testing found in Presentify 9).
