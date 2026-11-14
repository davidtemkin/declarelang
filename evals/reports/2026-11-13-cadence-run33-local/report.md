# Cadence run 33: Opus 5.5, Declare, on the local tree, light level

The minimal-verification trial: the prompt asked only that the app build and start with no
errors. **11.6 min, 64 turns, 63k output tokens** (21k thinking). **9 of 9 hidden checks pass**
(the new Cadence drive, `evals/apps/cadence/drive.mjs`). Timing record:
`evals/timings/2026-11-13-cadence-run33-local.txt`.

## What the light level changed

Less than the prompt allows. The agent still wrote flow scripts and looked at the phone: 10
verify calls (0.9 min) and 9 looks (0.7 min), against Ledger 7's 56 and 7. Reading took 4.1
min, writing 2.4, checking 5.1. `look --from-start` caught the count-up on the first look.

## Friction

None from the platform. Five one-step refusals, each fixed on the message: `img` for `image`
(twice), a baseline-aligned layout over a class with no `baseline`, `ChoiceItem`s outside a
`ChoiceControl`, a `width` body that could compute null. No library or runtime source read.
