# Riff: habits — Declare run 3 and React run 1

*2026-10-29. Engagement mode **riff** (`evals/modes/`): a simulated person asks for a habit
tracker and riffs on it over seven turns; the builder answers each turn. The same person and
prompts, once in Declare (run 3) and once in React (run 1, Vite).*

## Totals

| | Declare 3 | React 1 |
|---|---|---|
| wall time | 20m55s | 9m10s |
| builder's own time | 18m33s | 6m00s |
| fresh input | 237k | 49k |
| cached input | 17.11M | 1.43M |
| output | 85k | 37k |
| tool calls | 102 | 45 |
| turns done | 7/7 | 7/7 (turn 1 first reported not done; see below) |
| program | `habits.declare` 879 lines, 2 behaviour scripts | `App.jsx` 408 + `styles.css` 561 lines |

## Where the Declare builder's time went

| activity | uses | time in tool | context re-read |
|---|---|---|---|
| its own tests (`declare-verify`) | 18 | 1:47 | 3.31M (19%) |
| `declare-look` | 14 | 1:23 | 2.57M (15%) |
| reading Declare docs | 32 | 0:38 | 4.57M (26%) |
| reading pictures | 25 | — | 2.22M (13%) |
| install | 1 | 0:06 | 124k (1%) |
| everything else | 30 | — | 4.3M (25%) |

By turn (seconds in tool: verify / look / docs): 1: 20/22/18 (plus install) · 2: 4/11/1 ·
3: 7/16/0 · 4: 7/19/3 · 5: 9/4/11 · 6: 30/11/4 · 7: 30/0/0. Turn 1 is the first reading and
the first build; the rest are changes, each checked by look and by a behaviour script.

The React builder spent its tool time on install (0:25) and its dev server (13 uses); it took
no pictures and ran no tests. Its cost is mostly writing (39 edits, 30% of context re-read).

## What it means

- **Declare's cost is verification, not language.** Its builder looked at every change on a
  desktop and a phone and wrote behaviour scripts; the React builder did neither. The
  Declare app is the checked one. A fair comparison of the language alone would hold the
  checking equal; this run does not.
- **The first reading** (26% of re-read context) is the floor; it is not to be cut.
- **React's turn 1** first reported "not done": a port clash on its dev server opened another
  site, which it then noticed and fixed.

## Issues found in the Declare run, and where they went

1. **`npm install` / build friction in a fresh checkout** — fixed (SKILL: "run `npm install`
   once first… no build step"; `declare-verify` names a missing package before a missing
   build).
2. **No built-in device storage** for the habits — deferred.
3. **Smooth reorder needs a layout of one's own** — on the layout design queue.
4. Dev server answers on localhost only — as intended.

## Files

- `turns-declare.md`, `turns-react.md`: the two conversations, turn by turn.
- `declare/`: the final program and its behaviour scripts.
- `react/`: the final program's sources.
