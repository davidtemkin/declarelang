# Eval results

_Generated scoreboard — see `docs/system-design/verify-and-evals.md` §3 for the method. Latest run: **preamble-b-new** · solver `claude` · 9 cells._

## Headline

| track | cells | green | compile% | mean rung | mean iters | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| one-shot | 9 | 33% | 100% | 4.3 | — | 11646660 |

## By task

| task | one-shot |
| --- | --- |
| collection | ✓ |
| compose | R4→✗5 |
| modes | R4→✗5 |

## Failures by rung

| failed at | count | codes |
| --- | --- | --- |
| rung 5 (behavior) | 6 | — |

## Format distance

Mean lines off canon: **3.7** · already-canon: **22%** (2/9). A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).

---
_`node evals/harness/run.mjs` regenerates this file. Per-run transcripts + sandboxes live under `evals/runs/preamble-b-new/` (gitignored)._
