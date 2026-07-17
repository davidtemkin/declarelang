# Eval results

_Generated scoreboard — see `docs/system-design/verify-and-evals.md` §3 for the method. Latest run: **preamble-c-editorial** · solver `claude` · 9 cells._

## Headline

| track | cells | green | compile% | mean rung | mean iters | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| one-shot | 9 | 56% | 67% | 3.3 | — | 8947680 |

## By task

| task | one-shot |
| --- | --- |
| collection | R1→✗2 |
| compose | R4→✗5 |
| modes | ✓ |

## Failures by rung

| failed at | count | codes |
| --- | --- | --- |
| rung 2 (resolution) | 2 | DECLARE4001 |
| rung 5 (behavior) | 1 | — |
| rung 1 (structure) | 2 | DECLARE2000, DECLARE1000 |

## Format distance

Mean lines off canon: **4.4** · already-canon: **25%** (2/8). A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).

---
_`node evals/harness/run.mjs` regenerates this file. Per-run transcripts + sandboxes live under `evals/runs/preamble-c-editorial/` (gitignored)._
