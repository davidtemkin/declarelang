# Eval results

_Generated scoreboard — see `docs/system-design/verify-and-evals.md` §3 for the method. Latest run: **distro-baseline2** · solver `claude-distro` · 9 cells._

## Headline

| track | cells | green | compile% | mean rung | mean iters | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| agentic | 9 | 89% | 100% | 4.9 | — | 37203527 |

## By task

| task | agentic |
| --- | --- |
| collection | ✓ |
| compose | ✓ |
| modes | ✓ |

## Failures by rung

| failed at | count | codes |
| --- | --- | --- |
| rung 5 (behavior) | 1 | — |

## Format distance

Mean lines off canon: **2.1** · already-canon: **44%** (4/9). A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).

---
_`node evals/harness/run.mjs` regenerates this file. Per-run transcripts + sandboxes live under `evals/runs/distro-baseline2/` (gitignored)._
