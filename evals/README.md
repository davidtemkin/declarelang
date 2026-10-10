# Evals — how well agents write Declare

Declare is not in any model's training data, so the question that matters is whether an
agent can learn it from this repository alone and write good programs in it. These evals
answer that, and keep the record: what each agent was asked, what it built, what it cost,
and what it got wrong.

There are two instruments.

**Craft runs: one app, read closely.** One agent gets one brief and a fresh download of the
repository, with `evals/` removed, and builds the app from the README onward. The standard
is `craft/launch.sh`, which sets up the run, writes the four-sentence prompt, starts the
app's data service and launches the agent; [`craft/README.md`](craft/README.md) describes
it. The briefs, the data services and their fixtures are in `apps/` — Cadence (a training
log) and Murmur (a conversation app) are the current two, run against Declare and against
other stacks with the same brief.

**Task cells: many small tasks, scored mechanically.** `harness/run.mjs` gives a model a
small task's brief and the language reference alone, and scores what it writes with the
verify ladder. The tasks are in `tasks/`; the frozen reference the model gets is in
`baselines/`; a pinned series against the published download is a round
([`ROUNDS.md`](ROUNDS.md)). [`harness/README.md`](harness/README.md) has the harness in full,
including `measure.mjs`, which prices any run — tokens by class, cost, and time by activity
— the same way every time.

```
apps/<app>/         brief.md · api/ (the data service) · fixtures/ — what a craft run is given
craft/              launch.sh and its helpers — how a craft run is run
tasks/<id>/         a task cell: brief, reference solution, acceptance
harness/            the task-cell runner, scorer and cost measure
baselines/          the frozen language reference the harness's brief-only solver gets
ROUNDS.md           how a pinned round is run
reports/            one folder per run: what it was asked, what it built, how it went
findings/           what the runs taught: language-learnings.md is the friction log
runs/               local only (git ignores it): transcripts, sandboxes, apps kept to run again
```

## Filing a run

A run's report goes in `reports/<date>-<app>-<stack>-<n>/`: `report.md`, the
`prompt.txt` it was given, its impressions if it wrote any, and the code it wrote — sources
only. Screenshots, transcripts and installed packages stay out of the repository. An app
worth running again, with its `package.json`, can be kept in `runs/`.

**Never hand an agent this directory.** It holds the briefs' hidden acceptance, reference
solutions and every earlier agent's program, so a sandbox is built by deleting `evals/`
outright ([`apps/README.md`](apps/README.md)).
