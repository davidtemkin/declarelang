# Evals — measuring how well models write Declare

The harness that runs the eval loop from `design/verify-and-evals.md` §3: give a
model a task brief and the language reference **alone** (no repo, no spec), have it
write a program, and score that program mechanically with the verify ladder. The
numbers tune the brief, the diagnostics, and — with receipts — the language.

## Run it

```
node evals/harness/run.mjs [flags]
  --tasks compose,collection,modes   which tasks (default: all under evals/tasks/)
  --tracks one-shot,iterated         (default: both)
  --models <label>[,<label>]         labels for the run; passed to the solver
  --solver reference|claude          generation seam (default: reference)
  --budget N                         iterated-track iteration cap (default: task budget.json)
  --run <name>                       run directory name (default: timestamp)
```

- **`--solver reference`** returns each task's own `reference.declare`. It spends **no
  model budget** — it's the shakedown/CI path that proves the pipeline (sandbox →
  solve → score → metrics → RESULTS) and that every task's hidden acceptance is
  itself green. Run it after touching the harness or a task.
- **`--solver claude`** invokes `claude -p` headless with the brief-only context and
  reports token usage. This is the real eval. The **harness owns the verify loop**
  (the iterated track re-prompts the model with the failure report each round), so
  scoring is deterministic and every solver is model-agnostic.

Results land in `evals/RESULTS.md` (committed scoreboard). Per-run transcripts,
sandboxes, and `metrics.jsonl` live under `evals/runs/<name>/` (gitignored).

## Layout

```
tasks/<id>/
  brief.md          framework-neutral: intent, copy, behavior — NO technology named
  reference.declare a known-good solution (canon-formatted); the reference solver + self-test
  assert.mjs        rung-5 acceptance, written against the brief (addresses views by role)
  rubric.json       falsifiable visual questions for the future multimodal judge (unused until phase 6/7)
  budget.json       iterated-track caps (provisional until the post-shakedown tuning)
  fixtures/         data the app consumes (optional)
harness/
  run.mjs           orchestrator: sandbox × solve × score × record, per task/track/model
  sandbox.mjs       builds the hermetic session dir (reference + brief + fixtures + tool contract)
  solvers.mjs       the generation seam: reference | claude
  score.mjs         wraps tools/verify.mjs → the structured score (the mechanical oracle)
  results.mjs       metrics.jsonl → RESULTS.md
runs/               per-run artifacts (gitignored)
RESULTS.md          generated scoreboard (committed)
```

## What's scored

Every cell is judged by the verify ladder (`tools/verify.mjs`), not by taste:
rungs 1–3 (compile, resolve, typecheck), rung 4 (headless boot), rung 5 (behavioral
asserts with real input and deterministic motion). Rung 6 (visual judge) arrives with
the multimodal-judge phase; `rubric.json` is authored now so tasks are ready for it.
The **format-distance** metric (raw output vs. its canonical form) rides along free.

## Adding a task

1. Write `brief.md` as intent + behavior, naming no technology (so it stays
   baseline-ready and translation-trap-immune).
2. Write `reference.declare` and format it to canon (`node tools/format.mjs --write`).
3. Write `assert.mjs` against the brief — address views by **role/structure**, so any
   solution shaped to the brief scores, not just the reference's exact tree.
4. Self-test: `node tools/verify.mjs evals/tasks/<id>/reference.declare --assert evals/tasks/<id>/assert.mjs`
   must be green through R5. (A failing reference means the acceptance is wrong.)
5. `node evals/harness/run.mjs --tasks <id> --solver reference` — the cell must be green.
