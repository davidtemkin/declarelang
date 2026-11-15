# Presentify run 10: Opus 5.5, Declare, on the local tree, standard level

The round's final tree, run after Ledger 10. **51.3 min, 153 turns, 221k output tokens**
(93k thinking). Not scored: the audit is the result. Timing record:
`evals/timings/2026-11-14-presentify-run10-local.txt`.

## Time, against the other standard-level Presentify runs

| | 8 | 9 | 10 |
|---|---|---|---|
| total | 41.7 | 43.0 | 51.3 min |
| turns | 142 | 143 | 153 |
| output tokens (thinking) | 188k (62k) | 217k (84k) | 221k (93k) |
| reading · checking | 7.2 · 34.5 | 3.8 · 39.2 | 4.4 · 46.9 |
| tool time · model time | 13.6 · 28.2 | 10.4 · 32.6 | 17.9 · 33.4 |
| verify calls | 39 | 38 | 55 |
| R5 runs · drag moves | – | 40 · 170 | 51 · 658 |
| output per model-minute | 6678 | 6652 | 6604 |
| pace | 0.98 | 1.00 | 1.00 |

Model time and pace match run 9. The extra 8 minutes are tool time, and they are the agent's
own choice of how far to check, not slower tools:
- **Per call, the tools cost what they did in run 9:** a drag move 0.38 s (0.38 in run 9), a
  settle 0.20 s (0.19).
- **It did much more checking:**
  - four kept scripts, with 39 and 51 assertions in the two largest;
  - a 100-slide profile;
  - window sizes, and snapping mid-drag;
  - four times the drag moves of run 9.

My own test runs shared the machine for part of this run. The per-call figures show they did
not slow the tools.

## Platform and tooling findings

1. **FIXED: a profile left recording after a failed script refused the next one.** Chrome
   holds one trace at a time, shared by the browser's pages. A script that failed inside
   `drive.profile`, or after `profileFromBoot`, never ended its trace. The next script's
   profile failed with "Tracing has already been started", twice in this run. Now:
   - a profile ends its trace when the function it runs throws;
   - the runner ends any trace a failed script left behind
     (`tools/internal/verify-behave.mjs`).

   Checked by a probe: a failed profiled script, then a profile in the next call.
2. **To decide: two `drive.click`s on one view pair as a double-click.** The program's clock
   moves only when the script moves it, by design: a Time, an `afterDelay` and a click's pairing
   read one clock. So two separate clicks, with no `drive.wait` between them, arrive 0 ms apart,
   and the runtime pairs them. The agent found this and added a pause, after a failed run.
   `drive.click` reads as one click, and `drive.dblclick` exists for two. **Proposal:** a
   `drive.click` never pairs with the click before it. The harness would tell the runtime the
   press starts a new cycle, and moving no time keeps the clock deterministic.
3. **`errorBody` cast to a schema of its own.** The app declared `schema Refusal [ error,
   message?, current? ]` and wrote `src.errorBody as Refusal` three times. `errorSchema`
   (added after Ledger 10) types it with no cast.
4. **Colors from the service are hex strings, and the app parsed them itself.** A `colorOf(hex)`
   uses `parseInt(…, 16)` and `colorWithAlpha` for `#RRGGBBAA`. This is evidence for stage 1
   of the color proposal (`docs/system-design/global-names.md`).
5. **`.or()` on a locator is not supported.** The message said so and named the way round.
6. **Leftover decks on the service.** Failed scripts left decks behind, which made later
   locators ambiguous. The agent cleaned the service twice. Its scripts write to the live
   service by design; that is the brief's.

## Refusals

All one step from the message:
- **`schema Stroke` and `schema TextStyle`, Declare's own type names, renamed `Pen` and
  `TextSpec`**: the sixth Presentify run on `Stroke` (global-names.md).
- A class `ToolButton`, a library class (renamed `ToolChoice`).
- An attribute `on` that `IconButton` already has.
- A schema field typed `object`.
- Embedded data on a class.
- A `Doc` default of `null` without `?`.
- A width set on a child its layout sizes.
- `accessibilityRole` written in `{ }`.

The accessibility warnings named fixes the agent applied: a text field with no name, and a
swatch that shows a choice without saying it.

## Source reads

None of the library, runtime or compiler.

## Idiom

3,233 lines in 7 files.

- **The canvas is views.** Every element on a slide is a view with its own
  `onPointerDown`, handing the press to a `gesture` class with no view. That class owns the
  drag, resize and marquee. There is no hit test against the data; the marquee intersects
  frames, which is its job.
- **The machinery is classes with no view:** `ed` for the verbs, `gesture`, and `hist` for
  undo. The header describes them, as the SKILL asks.
- **Two long script blocks, 181 and 69 lines.** They hold pure helpers (frame geometry,
  element tree edits, colors), which is what a script is for. But they redeclare the data
  shapes as TypeScript interfaces (`Elt`, `Pn`, `Tx`) beside the schemas `El`, `Pen` and
  `TextSpec`, which a script can name. The guide said a schema "works in any type position"
  but never named a script. Guide 15 now does.
- **Casts:** none of `as any`; three `as Refusal` (finding 3).
- **Lines over 150 characters:** 36.
