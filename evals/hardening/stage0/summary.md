# Stage 0, round 1 — what evals found, 2026-10-17 to 2026-11-08

Sources: the 53 eval reports in that window (`inventory.jsonl`, 527 problems, duplicates
across runs merged) and the 223 commits since 2026-10-01 (`commits.jsonl`, 340 defect
fixes). Four report readers and one commit reader (`brief-reports.md`,
`brief-commits.md`), about 1.3M tokens in all. Statuses are as of 2026-11-09, each with
its evidence; about 25 were settled by running a small program.

## What the reports contain

| Kind | Problems | Fixed or changed | Still present | Unknown |
|---|---|---|---|---|
| Platform bug (runtime, library, compiler wrong) | 94 | 81 | 2 | 11 |
| Tool gap | 164 | 118 | 14 | 32 |
| Docs wrong or missing | 84 | 50 | 28 | 6 |
| Design limit (an intended restriction that cost time) | 114 | 38 | 55 | 19 |
| Not a bug (agent error, misdiagnosis, works as designed) | 71 | — | — | — |

## Per Declare craft run, over time

| Period | Runs | Platform bugs | Docs | Tool gaps | Design limits | Not a bug |
|---|---|---|---|---|---|---|
| Oct 17–26 | 14 | 2.6 | 3.0 | 5.4 | 5.8 | 1.5 |
| Oct 27–31 | 17 | 2.4 | 2.2 | 5.2 | 4.2 | 2.4 |
| Nov 1–8 | 13 | 2.4 | 2.2 | 3.5 | 4.0 | 3.8 |

- Platform bugs are fixed as they are found, and new ones arrive at the same rate. The
  newer briefs (Presentify, NYT, Ledger, 7GUIs) reach new parts of the platform, which
  raises the rate.
- Tool and docs gaps fall: the fix-and-rerun loop works there.
- "Not a bug" rises: agents blame the platform for their own errors, and the reports audit
  more strictly. A raw count of a report's problems overstates the platform's share.
- The commit log agrees: 216 platform-bug fixes since October, about 200 of them found by
  evals.

## Where the platform bugs are

| Area | In reports | Fix commits | Note |
|---|---|---|---|
| Library controls | 21 | 33 | Combobox 9 fixes; Form, Slider, Sheet, Carousel |
| Compiler and checker | 20 | 43 | mostly October; a few in November |
| Layout | 15 | 21 | the rule for a class's placed children changed three times |
| Reactive and data | 6 | 31 | about 8 silent-staleness fixes; the stale check finds none left (2026-11-09) |
| Renderer, input, focus, scrolling | 4–6 each | 10–20 each | the scroll offset model fixed 6+ times |

## Open on 2026-11-09

See `../small-fixes.md` for what was done about each.
