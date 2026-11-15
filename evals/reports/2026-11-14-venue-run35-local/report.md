# Venue run 35: Opus 5.5, Declare, on the local tree, standard level

The round's final tree (`ab1dfad6` with the name-check fixes), run after Cadence 35. **23.5
min, 98 turns, 120k output tokens** (52k thinking). Not scored: the audit is the result.
Timing record: `evals/timings/2026-11-14-venue-run35-local.txt`.

## Time

| | 34 (standard) | 35 (standard) |
|---|---|---|
| total | 25.5 | 23.5 min |
| turns | 100 | 98 |
| output tokens (thinking) | 135k (64k) | 120k (52k) |
| reading · writing · checking | 7.4 · 7.5 · 10.6 | 5.2 · 6.0 · 12.3 |
| tool time · model time | 4.6 · 20.9 | 4.5 · 19.0 |
| verify calls | 17 | 24 |
| pace | 0.96 | 0.97 |

The time is in line with every Venue run since 30 (21.3 to 25.5 min). The run went as
follows:
- **About 5 minutes of reading.**
- **One draft of the app, written in a single turn.** It compiled after one round of fixes.
- **Three kept scripts:** a desk flow by keyboard, the service's refusals, and the brief's
  phone story with 26 assertions.

## Platform and tooling findings

None that needs a change. Every refusal and every R5 failure was answered in one step from its
message:
- `focusShape()` returned `"circle"`. The message named the shape it takes.
- A seat named "outside the window" when the performance list could not scroll. That was the
  app's own frame, and the agent fixed it.
- A locator that matched two elements. The test's seat name also matched a "Remove"
  button's.

The dev server answered on 8602, the port the harness gave, after a first look at the README's
8200 was refused. This is the third run to try 8200 first (Ledger 9 and 10 too), and costs a
step each time. **FIXED in the teaching:** guide 05 had given 8200 as the address to browse to;
it now says to use the address the server prints (another when `PORT` is set or 8200 is
taken).

## Refusals

- **A schema named `Card`, the library's class**, renamed `VenueCard`
  (`docs/system-design/global-names.md`).
- `Seat` and `SeatRow` declared twice: in the hall file, and in the app, after a move.
- `semibold` and `regular` bare inside `{ }`. The message says to write them as strings.
- A width on a child its layout sizes.
- A `{ }` default that did not parse.
- `placed` typed `Order` while its body can be null.
- A warning: a member `codeLength` hides a script binding of the same name.

## Source reads

None of the library, runtime or compiler.

## Idiom

1,685 lines in 5 files.

- **Screens are views switched with `visible = { app.screen == "…" }`** (four), as in earlier
  Venue runs.
- **The script block, 165 lines, is pure helpers.** It covers money and dates, card brands
  and the Luhn check, expiry and postal rules, and a Code 39 barcode. The money and dates are
  formatted by hand where `Intl` (through `globals`) would do it.
- **Casts:** no `as any`.
- **Lines over 150 characters:** 17.
- **Seats are views, each a `Control` with its own role and name.** The phone's zoomed hall
  is a surface of them, with a focus shape per seat.
