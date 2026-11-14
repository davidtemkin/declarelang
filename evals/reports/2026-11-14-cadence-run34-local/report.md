# Cadence run 34: Opus 5.5, Declare, on the local tree, standard level

The last validation run of the 2026-11-14 round, run alone under the new one-run-at-a-time
rule, on the tree with every fix of the round in it. **23.2 min, 99 turns, 118k output tokens**
(52k thinking): reading 7.0, writing 3.7, checking 12.5 min; tool time 4.9 min, model time 18.4.
Timing record: `evals/timings/2026-11-14-cadence-run34-local.txt`.

## Hidden checks

**9 of 9**, as delivered (Cadence 33: 9 of 9).

## Time

Twice Cadence 33's 11.6 min, and not from load: the load average was high at launch (Spotlight
indexing the fresh run copy, another app), but model time doubled with it (18.4 against 9.7
min), on 99 turns against 64 and 52k thinking tokens against 21k. The agent checked more: a
keyboard-only flow, a type-scale check of its own on the add sheet at both sizes, a desk layout
it reworked (the period's sessions became a scrolling pane beside its figures), and screenshots
at each step. One run each; the difference is the agent's choice of how far to go, not a
platform cost. The compile cache was in this run: `compile` no longer appears among the
verify spans that cost time.

## Friction

All compile refusals one step on the message: a baseline alignment with no `baseline`
declared, `bold` bare inside `{ }`. The R5 failures were the agent's own scripts (a read
before its data arrived, a path that named nothing, a type-scale assertion it wrote and then
met) and motion still in flight when a locator looked, which the message names.

**One source read, a docs gap:** `runtime/src/html.ts`, for how `HTMLText` treats whitespace.
Its line `<span class='F'>1</span>h <span class='F'>24</span>m` looked like "1h24m". Checked
on today's tree: the space is there, as HTML has it, but at the small words' size beside
40-pixel figures, so it reads as no space. Not a bug; the agent widened it with a spacer span
of its own. **FIXED in the reference:** `HTMLText` now says white space behaves as in HTML,
one space in the size of the text around it, and how to space large figures.

## Idiom

1,089 lines of Declare in two files, no script outside helpers, a `State` for the desk pane
(it first wrote three bindings on `app.wide` and replaced them with one `State`). A line-by-line
review was not done.
