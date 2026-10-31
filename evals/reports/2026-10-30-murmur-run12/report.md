# Murmur run 12: Declare 585c768d, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh murmur ~/Code/eval-murmur-12 claude-opus-5-5 585c768d`. React Venue run 2 was building
alongside it. It is the first Murmur run since run 11, with the verify, `npx` and kernel fixes of the last week in.

**Files beside this report:** the app's two files and its five assert scripts (`tests/`). No account was asked for.

## Figures

| | Murmur 11 | **Murmur 12** | React Murmur 2 |
|---|---|---|---|
| time | 20.9 min | **18.2 min** | 17.6 min |
| turns · tool calls | 108 · 107 | **102 · 101** | |
| first app write at | 7.5 min | **5.6 min** | |
| model · tool time | | **14.4 · 3.8 min** | |
| thinking (reading · writing · checking) | | **3.4 · 1.5 · 1.8 = 6.6 min** | |
| verify calls · their time | | **20 · 2.4 min** | |
| `declare-look` calls · their time | | **18 · 1.0 min** | |
| `declare-help` calls · their time | | **7 · 0.2 min** | |
| output tokens · cached input re-read | | **90.4k · 19.9M** | |
| correctness | its five scripts pass from main | **its five scripts pass from main** | |

Its own five assert scripts were run from main: `desk`, `history`, `live-phone`, `phone-touch` and `voice`.
All pass at R5.

The fastest Murmur in Declare so far, 0.6 min behind React's. Tool time is now a fifth of the run.
