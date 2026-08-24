# Rounds — pinned, out-of-tree eval runs

A **round** measures first-time effectiveness with the platform **as distributed**: an
agent that has never seen Declare gets a fresh download of the repo, onboards itself from
README, builds the task, and drives the repo's own checker to green. The round is the
go-forward instrument (decided 2026-08-24); the older in-tree arms (brief-only, corpus,
skill) remain in the harness for experiments but are not the series.

## The regime

- **Distro arm only** (`--distro --solver claude-distro`) — the sandbox is a copy of the
  pinned subject, `evals/` stripped (the answer key never travels), fixtures landed at
  `my-apps/fixtures/`.
- **Opus only**, for now — the model Claude Code users actually default to.
- **Small, deliberate runs.** One cell per task per decision, `--reps 1`. A run is
  launched by a person who has seen the cell count first; a round is not a matrix.
- **The subject is a GitHub download, never the local tree.** A tarball by SHA — no
  `.git`, no uncommitted state, reproducible forever. The pushed commit also guarantees a
  fresh derive (the pre-push gate certified it), so the download runs cold.
- **The subject's own `tools/verify.mjs` is the ruler** (`--subject` wires this) — the
  language the agent wrote in and the ladder that scores it are the same commit.

## Anatomy of a round

```
~/Code/Declare-eval-<NNN>/        untracked, outside every repo
  round.json                      provenance: repo, SHA, version, runs
  subject/                        the downloaded distribution + npm ci   (disposable — the SHA reproduces it)
  results/                        THE PERMANENT RECORD — metrics.jsonl, RESULTS.md draft,
    cells/<cell>/                 per-cell evidence: app.declare · transcript.json · verify.json · metric.json
    report.md                     the round's write-up
  sandboxes/                      agent working copies                   (disposable)
```

## Running one

```sh
node evals/harness/new-round.mjs            # builds the directory, pins the SHA, prints the run command
# …then launch ONE cell at a time with the printed run.mjs invocation
```

Before any tokens: the setup script verifies the subject's own ladder works, and the
`eval-references` gate (in `npm test`, R5 tier in `npm run test:ladder`) should be green —
a red reference means the task, not the solver, needs attention first.

**Reading the numbers:** the `usage` field decomposes spend — `fresh` (context actually
read), `output`, `turns`, `costUsd`. The summed-token figure is dominated by cache reads
(≈ turns × context length); *that* product is the navigation diagnostic that should
shrink as onboarding and docs routing improve. `costUsd` is API-equivalent accounting —
runs on a subscription-authenticated CLI draw plan usage, not billed dollars.

## Merging back — what crosses into this tree, and what never does

**Crosses in (by copy, when the round closes):**
- the round's write-up → `evals/reports/<date>-round-<NNN>.md`
- a platform finding → `docs/system-design/findings-<date>-<slug>.md`
- task repairs the drift check forced (reference/assert refreshes) — committed with their
  provenance stated
- a row in the index below

**Never crosses in:** the round tree itself, sandboxes, transcripts, agent-built
programs (they are evidence, referenced by path; promoting one to `apps/` is a curation
decision, not a merge), or a regenerated `evals/RESULTS.md` (that file belongs to
in-tree harness runs).

## Index

| round | date | subject | arm · model | cells | headline | evidence |
|---|---|---|---|---|---|---|
| 001 | 2026-08-23 | `949200bb` v0.3.1 | distro · opus | 12 (4 tasks × 3) | 12/12 green after shelf-assert fix; drift check caught the pointer-corridor regression pre-spend | `~/Code/Declare-eval-001/results/` · [report](reports/2026-08-23-round-001.md) |
| 001b | 2026-08-24 | `949200bb` v0.3.1 | distro · opus | 1 (shelf) | green first pass · 53 turns · 135k fresh / 55k out · $5.24-equiv · 14.8 min · format-distance 0 · agent self-authored assert/states/baselines | `~/Code/Declare-eval-001/results/round-001b/` |

Round 001's oversize matrix predates the small-runs rule; it is why the rule exists.
