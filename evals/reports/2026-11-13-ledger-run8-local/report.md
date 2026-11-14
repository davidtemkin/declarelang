# Ledger run 8: Opus 5.5, Declare, on the local tree, minimal level

The first run at the `minimal` level: the prompt asked that the app build and start with no
errors, and that nothing more be checked — no driving it, no scripts, no screenshots, no
browser. **20.6 min, 54 turns, 139k output tokens** (42k thinking), against Ledger 7's 44.5
min, 169 turns and 222k at the standard level. **8 of 8 hidden checks pass**, the same as
Ledger 7. Timing record: `evals/timings/2026-11-13-ledger-run8-local.txt`.

## It kept to the level

Every verify call stopped at R4 (boot), at laptop and phone sizes: types, the layout and
accessibility analysis, a boot with the service running. No R5 script, no `declare-look`. Its
hand-over says what was and wasn't established: "nothing reached only after a click or
keypress has run".

So "minimal" is not "unchecked": the compiler and the boot checks did their part, and only the
driving was skipped. The finding is that Declare's built-in checks carried an agent to an app
whose main flows all work, without driving it. One data point, on an app whose earlier runs fed
platform fixes (DataGrid most of all); Cadence at minimal, against Cadence 33, is the next one.

## The hidden drive

The first full drive gave 7 of 8: `sale_refund` failed on the drive's own lookup. Its pattern
for the Refund button (`/^refund\b/`) also matched a list row named "Refund — Order #2764…",
which came first. `evals/apps/ledger/drive.mjs` now looks for that control among buttons and
menu items only. Rerun: pass; Ledger 7 still passes it.

## What the skipped checking cost, so far

Against Ledger 7, on what the drive does not score:

- **Screen reader, transaction rows.** Ledger 8's list is a Table of options, each named by one
  sentence: "Studio supplies, Ace Hardware, −$12.27, 13 Nov 2026". The category is left out of
  it, and a row with no contact reads ", ,". Ledger 7's DataGrid reads as rows of cells. A
  screen-reader pass on the list would have caught both.
- **States coded, never run — and they work.** Driven in the audit (2026-11-14), forced from
  the browser: a search that matches nothing shows "No transactions match", names the filter
  and offers a way back; a list request that fails shows Retry; an in-place edit the service
  refuses (a 422) is marked "Not saved" with Retry. Ledger 7, which drove each, behaves the same.
- **Its own compromises, stated:** split-part and line refusals show under the form, not at the
  part; a running-total point opens from the range's start.

Idiom: the same shape as Ledger 7 — two `script` blocks (helpers and formatting), data through
`DataSource` throughout, a class per kind of thing (54 against 62), little hand placement — in
15% fewer lines. A line-by-line review was not done.

So what the minimal level cost, on this app: the screen-reader sentence on each row, and the
assurance — the states held, but nothing had shown that they would.

## Refusals

All one step, on the message. Two recur from Ledger 7:
- `null` for an enum that has a `none` token (`accessibilityCurrent`, `accessibilitySort`).
  **Fixed on the local tree:** the message now names it — `"no value" is the token "none"
  here: { on ? "page" : "none" }` (`compiler/src/typecheck.ts`).
- `T?` inside a `{ }` body, twice (four times in Ledger 7). **Accepted on the local tree** (the
  user's ruling, 2026-11-14): a body takes `T?` as `T | null`, as a declaration does.

Others: `accessibilityLive = "polite"` as a string (the message names the token), an object
literal as a `{ }` default (three times; the message gives the double braces), `cursor` already
a Control attribute, a script helper named like the shared `escapeHtml`.

## Source reads

None.
