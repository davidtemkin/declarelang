# Cadence run 9 — Declare 224f6940, Opus 5.5

**Run:** 2026-09-25, launched with `evals/craft/launch.sh cadence` against main `224f6940`
("Cadence run 8 followed through" — the docs and fixes from run 8's findings). Opus 5.5
(`claude-opus-5-5`), web tools available, the brief's idiom sentence included. One round.

| | run 8 | run 9 | React (cadence-react-1) |
|---|---|---|---|
| time | 29.9 min | 12.4 min | 15.4 min |
| turns | 145 | 71 | 63 |
| cost | $12.47 | $5.55 | $3.51 |
| output tokens | 149k | 65k | 89k |
| code | 1,606 lines, 6 files | 1,128 lines, 3 files | 2,943 lines (src) |
| DOM elements at rest | — | 317 | 337 |

## What it built, and how

- **Model classes** for the data (`Log`, `Lens`, `Draft`) and a ten-line script; `DataSource`
  for every read and write.
- **Its own theme,** with a `heat` token of its own — it learned not to repoint the library's
  `accent`.
- **Clean through rung 4,** and no bug hunt: the run 8 staleness trap was gone.
- **Recurring:** collisions with built-in names (`Pick`, `surface`).

DT's read at the time: "quite good news."

## Files

`cadence.declare`, `model.declare`, `parts.declare` — the program. `impressions.md` — the
agent's own account of building it (asked for afterwards, read-only). `prompt.txt` — the brief
as given.
