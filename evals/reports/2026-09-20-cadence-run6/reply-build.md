Cadence is built and checked. `my-apps/cadence.declare` — 1,788 lines, one file, clean through `verify` rung 5.

## The restatement I worked from

**Ends** — a morning glance that answers *where am I* from across the room; the fourteen months as one surface you *handle*; a session's full story and where it sits; add/correct/delete with everything derived instantly true.
**Tokens (literal)** — `4 sessions · 3h 40m`, `12 days` / `no streak`, `3h 40m` / `45m`, `12.4 km`, `148 bpm`, largest number ≥ 6× the smallest text.
**Constraints** — no accounts/settings, the :8320 service is the whole backend and the clock, one build for both widths.
**Choices I made where the brief left it open** — the accent *means effort* (sport is carried by type and a drawn mark, not by five competing colours); the year plots duration as height with effort as the accent ramp. §9's "last week" was read as §2's "this week", which the copy actually specifies. Counts pluralise (`1 day`, not `1 days`).
**Absences I filled** — what travels on every change: figures spring to new values, the detail card *flies out of the bar or card you touched*, the sheet grows from the + button, the ribbon glides for buttons and keys but is 1:1 under a finger, the live session breathes.

## How it's built

`Log extends Node` owns the three sources, one writer for POST/PUT/DELETE, and every query. Views hold no copies, so a write into `hist` makes the week, the streak, the week's shape, the ribbon and its summary true at once — nothing refreshes. The writer sets url/method/body then hands the send to `afterSettle`, and the server's own returned record goes straight into the dataset.

The year is two scalars, `center` and `span`. A hand writes them outright (drag pans, `claim = x` so a vertical swipe still scrolls the page; wheel and trackpad pinch zoom; two-finger pinch zooms about its midpoint); a button or key writes only their targets and springs carry them. Pulling it open past ~16px/day fades in each day's duration and date, thinning the labels rather than colliding them. 250 bars are `draw()`n — a graph, not a tree — and the ruler stays real text.

## Checked, not assumed

`tools/verify.mjs … --rung=5 --assert my-apps/tests/assert.mjs` passes 25 steps of real input: the copy, a drag that moves the frame and only the frame, zoom in/out, Today, a tap landing on a session, the detail opening and Escape closing it, the sheet opening pre-filled with nothing outstanding, a save that moves the week from 2 to 3 — proved to *travel* by taking the animation clock and watching the digits lag — and a delete that puts the history back. The service ends every run with its original 248 sessions. I also drove touch pan/scroll arbitration, the keyboard path, and a deliberate server refusal (the service's sentence appears beside Save and the button stays live so a retry is possible).

Two things to flag:

- **The dev server is on 8201, not 8200.** Port 8200 is held by a long-running Declare dev server out of your main `~/Code/Declare` checkout; I left it alone. The app is at `http://127.0.0.1:8201/my-apps/cadence.declare`.
- **Gesture arbitration on a real device is built to be right, not proven.** Headless Chrome confirms the app doesn't steal the vertical swipe and does take the horizontal one, but synthetic touch doesn't exercise the browser's scroll/pinch upgrade path, and a real two-finger pinch was never dispatched.