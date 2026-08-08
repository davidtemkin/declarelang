# Eval results

_Generated scoreboard — see `docs/system-design/verify-and-evals.md` §3 for the method. Latest run: **2026-08-08T15-21-38** · solver `claude` · 2 cells._

## Headline

| track | cells | green | compile% | mean rung | mean iters | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| one-shot | 1 | 100% | 100% | 5.0 | — | 3777580 |
| iterated | 1 | 100% | 100% | 5.0 | 1.0 | 2612168 |

## By task

| task | one-shot | iterated |
| --- | --- | --- |
| shelf | ✓ | ✓ (1) |

## Failures by rung

_(none)_

## Format distance

Mean lines off canon: **0.0** · already-canon: **100%** (2/2). A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).

## Idiom

Mean idiom score: **10.0/10** across 2 cell(s). 10 = no anti-markers (timers for motion, geometry computed into data, stored coordinate tables); `pro` column is informational — which declared-way markers appeared.

| task | track | score | anti hits | pro |
| --- | --- | --- | --- | --- |
| shelf | one-shot | 10/10 | — | layout-declared, spring-or-animator, tree-asked, pointer-bound |
| shelf | iterated | 10/10 | — | layout-declared, spring-or-animator, tree-asked, pointer-bound |

---
_`node evals/harness/run.mjs` regenerates this file. Per-run transcripts + sandboxes live under `evals/runs/2026-08-08T15-21-38/` (gitignored)._
