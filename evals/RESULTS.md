# Eval results

_Generated scoreboard — see `docs/system-design/verify-and-evals.md` §3 for the method. Latest run: **frontier2-opus** · solver `claude-skill` · 9 cells._

## Headline

| track | cells | green | compile% | mean rung | mean iters | tokens |
| --- | --- | --- | --- | --- | --- | --- |
| iterated | 9 | 100% | 100% | 5.0 | 3.0 | 4707394 |

## By task

| task | iterated |
| --- | --- |
| collection | ✓ (3) |
| compose | ✓ (1) |
| modes | ✓ (4) |

## Failures by rung

_(none)_

## Format distance

Mean lines off canon: **5.7** · already-canon: **22%** (2/9). A high number with a low semantic-error rate means the formatter is earning its keep; a correlation between the two is a finding (§2.9).

---
_`node evals/harness/run.mjs` regenerates this file. Per-run transcripts + sandboxes live under `evals/runs/frontier2-opus/` (gitignored)._
