# Cadence in React — the comparison run

**Run:** 2026-09-25, `evals/craft/launch.sh cadence … --stack React`, Opus 5.5, web tools on,
the same brief (with its idiom sentence) and the same data service as the Declare runs.

| time | turns | cost | output tokens | code |
|---|---|---|---|---|
| 15.4 min | 63 | $3.51 | 89k | 2,943 lines of TypeScript and CSS in `src/` (3,008 with config) |

- **Stack it chose:** React 19, TypeScript, Vite, TanStack Query (idiomatic data handling,
  unprompted), the Archivo face, plain CSS. No web searches.
- **Against Declare:** about 2.3–2.4× the code of Declare run 7 (1,302 lines). DT: "similar;
  not quite as nicely designed", and "in some ways did validate Declare". The cost gap is about
  what Declare's documentation reading costs.

## Files

`src/` — the program (no packages or build output). `package.json` — its dependencies.
`prompt.txt` — the prompt as given.
