# Murmur in React — the comparison run

**Run:** 2026-09-25, `evals/craft/launch.sh murmur … --stack React`, Opus 5.5, web tools on, the
same brief, data service and fixtures as the Declare runs.

| time | turns | cost | code |
|---|---|---|---|
| 18.1 min | 76 | $4.03 | 3,612 lines of TypeScript and CSS in `src/` |

Against Declare run 3 (1,217 lines, 23.3 min, $9.61): about 3× the code, a little faster and
cheaper — the same shape as the Cadence comparison, where the difference is Declare's reading.

## Files

`src/` — the program (no packages or build output). `package.json` — its dependencies.
`prompt.txt` — the prompt as given.
