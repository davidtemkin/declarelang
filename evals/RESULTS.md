# Eval results

_Generated scoreboard — see `design/verify-and-evals.md` §3 for the method. Latest run: **_sanity** · solver `reference` · 2 cells._

> **This is the reference-solver baseline** — each task scored against its own `reference.declare`. It proves the pipeline (sandbox → solve → score → metrics) and that every task's hidden acceptance is itself green; it is **not** a measure of model performance. Real model runs (`--solver claude`) are exploratory and their artifacts are gitignored; their findings are triaged into `design/language-learnings.md` (the E-series). First real cycle: 2026-07-14, Sonnet one-shot went 1/3 — see E-1..E-3.

## Headline

| track | cells | green | compile% | mean rung | mean iters | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| one-shot | 1 | 100% | 100% | 5.0 | — | — |
| iterated | 1 | 100% | 100% | 5.0 | 1.0 | — |

## By task

| task | one-shot | iterated |
| --- | --- | --- |
| collection | ✓ | ✓ (1) |

## Failures by rung

_(none)_

## Format distance

Mean lines off canon: **0.0** · already-canon: **100%** (2/2). A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).

---
_`node evals/harness/run.mjs` regenerates this file. Per-run transcripts + sandboxes live under `evals/runs/_sanity/` (gitignored)._
