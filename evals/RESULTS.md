# Eval results

_Generated scoreboard — see `docs/system-design/verify-and-evals.md` §3 for the method. Latest run: **distro-shakedown** · solver `claude-distro` · 1 cells._

## Headline

| track | cells | green | compile% | mean rung | mean iters | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| agentic | 1 | 0% | 100% | 4.0 | — | 902538 |

## By task

| task | agentic |
| --- | --- |
| compose | R4→✗5 |

## Failures by rung

| failed at | count | codes |
| --- | --- | --- |
| rung 5 (behavior) | 1 | — |

## Format distance

Mean lines off canon: **1.0** · already-canon: **0%** (0/1). A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).

---
_`node evals/harness/run.mjs` regenerates this file. Per-run transcripts + sandboxes live under `evals/runs/distro-shakedown/` (gitignored)._
