# Cadence — run 5 · 2026-09-11

**Subject:** GitHub `ada29762` (v0.4.4 line), downloaded fresh — `evals/` stripped, brief and fixture staged at `task/`.
**Model:** Opus (`claude -p --model opus`), headless, `--output-format stream-json --verbose`, tools Read/Glob/Grep/Bash/Write/Edit.
**Prompt:** `prompt.txt` — four sentences; no port, no tool, no checking, no "React resemblance" line. The distro carries all of that (ruling 2026-09-11: the prompt must not step on the onboarding path).
**Brief:** as committed at `4de76155` — the §2 "reads exactly" vs §6 six-times collision fixed in the brief, not the prompt.
**Ruler:** `tools/verify.mjs` from the same commit, run from a tree the agent never touched, with the agent's own `app.assert.mjs`.

## Headline

**Clean through R5** (18 driven steps, real input) · **1,789 lines** in one file + a 74-line assert · **50.1 min** · **149 turns** · **$26.41** list.

| usage | tokens |
|---|---|
| output | 204,926 (thinking 117,898) |
| fresh input written to cache | 394,627 |
| cache reads, summed over turns | 34,672,388 |
| uncached input | 296 |

## Where the time went (from the event stream)

| phase | minutes | tool calls | reads & lookups | program writes | screenshots read |
|---|---|---|---|---|---|
| read & set up | 13.5 | 56 | 49 | 0 | 0 |
| write the program | 13.4 | 18 | 3 | 11 | 0 |
| drive, look, fix | 23.2 | 73 | 14 | 19 | 22 |

Reading: 58 tool results, 317 KB returned (≈79k tokens once) — `docs/declare.md` 53 KB in three slices (a whole-file `cat` hit the 52 KB tool cap first: one wasted turn; the file stays one file — the Read tool takes it whole), `apps/calendar` 48 KB, guide chapters 5/9/14/15/16 ≈60 KB, README 14, intake + getting-started 14, skill 11. Writing: the program in appended sections, each headed by a design comment; first compile succeeded. Driving: its own puppeteer shot/touch/pinch/zoom drivers in `/tmp/cad`, `format --write`, a dead-helper sweep, then `verify --assert`.

## The port collision, as designed

`npm start` found :8200 held by another Declare tree and got the new refusal (`PORT=8201 npm start`); 8201 was held by a stranger; it settled on 8210 unaided. (It did `lsof` and curl the 8200 homepage's first 300 bytes — saw that a Declare homepage exists on the machine, did not pursue it.)

## What the checker said (the whole friction record — no findings report was asked for)

- `Amount` joined a baseline-aligned row without declaring a baseline — refused twice with the exact line to add; the second attempt used the wrong form; third landed.
- A `:path` read inside a `Spring` — refused (DECLARE6001: a Spring is not a view, has no cursor); moved to an attribute as the message said.
- A 15px text field — DECLARE3005 iOS zoom warning; resized.
- One R5 failure it caught itself: the Today button left the period at "30 May – 25 Jul"; fixed.
- Console sweep on DOM and canvas: clean.

## Defects visible at the end (reviewer's, not the agent's)

- The week's-shape bars collapsed to slivers after its `weekPeak` rescale, so a two-session week reads as empty. It never re-looked.
- Everything else it flagged in its own reply: no time-of-day in the data → weekday-weighted default sport; no dark palette, by choice.

## Comparison

| run | wall | tokens | program |
|---|---|---|---|
| Aug 5 run 1 | ~50 min (one stall) | 348k summed | 1,487 lines |
| Aug 5 run 2 | 56 min | 451k summed | 1,617 lines |
| Sep 2 run 4 (`../2026-09-02-cadence-run4/`; `evals/` NOT stripped, prompt unrecorded) | ~56 min by file times | — | 1,348 lines + 4 write-ups |
| **this run** | **50 min** | **205k out / 395k fresh / 34.7M cache-read** | **1,789 lines + assert** |

## Evidence

Run directory `~/Code/eval-cadence-4/` — `logs/agent.stream.jsonl` (every event, incl. every read), `logs/tail.py` (tool calls in order), `logs/cost.py` (results by size + usage), the clone, the fixture log. Here: `app.declare`, `app.assert.mjs`, `prompt.txt`, `shots/`.

## The agent's own closing reply

Built and verified. The program is at `declarelang/my-apps/cadence.declare`, 1789 lines of Declare in one file.

**Running it.** Port 8200 is already held by a different Declare tree on this machine, so I started the dev server on 8210:

```
cd declarelang && PORT=8210 npm start
open http://127.0.0.1:8210/my-apps/cadence.declare
```

**What it is.** One surface in two arrangements, switched on window width alone. At a desk the answers stand in a left rail and the year fills the rest of the room; on a phone the same blocks stack and the page scrolls. Nothing forks but geometry, and a live resize across the boundary re-derives correctly.

- **Today.** This week reads `2 sessions · 1h 24m`, the streak `2 days`, both set at seven to nine times the smallest text on the screen. The week's shape is seven columns scaled against the person's own big days, so a light week is visibly light rather than renormalised to look full. A session in progress takes the top of the rail with a breathing dot and a clock counting up.
- **The year.** Fourteen months as one drawn surface over two sprung scalars, the day at the middle and the number of days across. A drag writes the value and its spring target together, so the surface is exactly under the hand and never waits for release; a release writes only the target and the spring carries the flick. Pinch, wheel, trackpad pinch, two buttons and the arrow keys all reach the same two numbers. Pulled open past about six weeks, each session names its duration and sport, and the labels thin out instead of colliding.
- **Adding one.** Six taps from cold on a phone, including opening and confirming, with no keyboard unless a note is wanted. Sport, duration, effort and distance are all predicted from the history and re-aim when the sport changes.
- **Writes.** A save goes into a derived book in the same settle it happened in, so the week total, the streak, the shape and the year all move before the round trip finishes. A failure keeps the optimistic row and offers retry or undo.

**One thing I read differently from the brief.** It suggests defaulting to "the sport they always do at this hour," but the service stores no time of day. I default to the sport they most often log on this weekday over the last eighteen weeks, weighted toward recent months.

**Checks.** `node tools/verify.mjs my-apps/cadence.declare --assert my-apps/cadence-checks.mjs` is green through rung 5, which drives real input in headless Chromium. I separately drove the add, correct and delete round trips against the live service and left it at its original 248 sessions. Touch pan, pinch and tap were driven on a 390-wide touch viewport, and the band carries `touch-action: pan-y` so the browser keeps vertical scrolling. As the brief notes, real-device gesture arbitration is not provable here.

**Deliberate omission.** There is no dark palette. The brief asks for ink and paper with one thing shouting, and a half-tuned second palette would weaken that more than its absence costs.
