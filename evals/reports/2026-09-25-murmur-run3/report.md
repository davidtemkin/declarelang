# Murmur run 3 — Opus 5.5

**Run:** 2026-09-25, launched with `evals/craft/launch.sh murmur`, Opus 5.5 (`claude-opus-5-5`),
web tools available, the brief's idiom sentence included. One round. (A first attempt a few
minutes earlier was stopped before it built anything; it is not reported separately.)

| | run 2 (2026-09-12) | run 3 | React (murmur-react-1) |
|---|---|---|---|
| time | 80 min | 23.3 min | 18.1 min |
| turns | — | 122 | 76 |
| cost | $57 | $9.61 | $4.03 |
| code | 1,892 lines | 1,217 lines, 7 files | 3,612 lines (src) |

## What cost it time (from its own account, `impressions.md`)

- **A `Socket` inside a model class never connected** — no error, `status` stayed `closed`.
  Members of a view-less model class were not started. The most expensive problem of the build.
  (Fixed since: a model class starts its members, `fa6fcc86`.)
- **Horizontal `padding` on a `Text` had no effect;** it wrapped the text in a padded view.
  (Fixed since: Text honours padding, `fa6fcc86`.)
- **A `Spring` following a constraint failed inside replicated rows** ("bound by a constraint —
  a direct write would be silently overwritten"); the chapter 7 example reads as if it should
  work. It switched to `Spring [ to = { … } ]`.

## Files

`murmur.declare`, `conversation.declare`, `inbox.declare`, `message.declare`, `model.declare`,
`overlays.declare`, `theme.declare` — the program. `DESIGN.md` — its own design notes.
`impressions.md` — its account of building it. `prompt.txt` — the prompt as given.
