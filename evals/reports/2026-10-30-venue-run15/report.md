# Venue run 15: Declare 3cc1d76c, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-15 claude-opus-5-5 3cc1d76c` against GitHub main,
alongside Cadence run 20. It was the first run on the fixed kernel: Venue 14's hang and stale field were caused by
a dependency node orphaned when a rule linked to a freed cell.

**Files beside this report:**
- the app's five files and its assert scripts (`tests/`);
- the hidden acceptance result (`drive/`);
- the agent's account (`account.md`, asked with `impressions.txt`), filed word for word.

## The comparison

| | Venue 14 | **Venue 15** | Venue 16 |
|---|---|---|---|
| time | 31.2 min | **38.1 min** | 25.2 min |
| turns | 130 | **125** | 110 |
| code, excluding blanks and `//` lines | 1,333 | **1,272** (5 files) | 1,407 |
| output tokens | 138.6k | **123.1k** | 120.5k |
| cached input re-read | 29.9M | **26.2M** | 23.7M |
| first app write at | 8.1 min | **5.9 min** | 8.2 min |
| tool time · model time | | **20.3 · 17.8 min** | 5.7 · 19.5 min |
| thinking (reading · writing · checking) | | **4.0 · 1.9 · 4.0 = 9.8 min** | 5.5 · 1.4 · 3.0 = 9.8 min |
| verify calls · their time | | **30 · 16.3 min** | 25 · 4.1 min |
| hidden acceptance | 11 of 11 | **11 of 11** | 11 of 11 |

## Where the time went

**Tool time was more than half the run, and verify was nearly all of it: 16.3 of 20.3 minutes.** One check took
53 s, but only 4 s of that was CPU.
- **Where it went:** 42 of the 53 s were `settleData` waiting out its 10 s limit on the app's seat stream. The
  stream is an `EventStream` with `credentials = include`, which the runtime opens with `fetch`, and verify counted
  that never-ending request as pending. Nothing said so.
- **The fix (f62e9876):** a `text/event-stream` response is settled once its headers arrive, and a settle that waits
  its whole limit now says what it waited on. The same check then took 15.5 s, and the agent's five-check loop fell
  from 181 s to 58 s.

**Thinking was 26% of wall time.** The longest pauses (36–72 s) came while planning and writing, not debugging.

## Correctness

11 of 11 hidden flows pass. The service was reset first, because earlier checks had used up the free seats near the
script's tap point.

## What the agent said (`account.md`)

Its account was positive about how well the library fit the brief: `Form.source`, `judged`, `purpose` and
`concealed`. It praised computed defaults, which made "nothing typed is lost" one line per field. Its improvement
list, in its order:
1. A supported pattern for dense targets on touch.
2. A way to get from a record to its replicated view.
3. Replication over a computed array without wrapping it in a `Dataset`.
4. Sticky positioning.
5. Layout checks that understand scale and clipping. Fixed in 585c768d.
6. "Did you mean" in `declare-help`. Fixed in 585c768d for members.
7. Shorter failure output from `expect.text`.
8. A note in declare.md on percentages and enum words inside conditions.

It also found that a `Combobox` exposes two elements named "Country". That is valid in ARIA 1.1 and was left as it
is.
