# Craft runs — an agent builds an app from a brief, in a fresh Declare download

A craft run gives one agent one brief and the Declare distribution, and nothing else, and
lets it build. It measures what the distribution teaches: every document the agent reads,
every command it runs, and what it ships. The reports live in `evals/reports/`.

This is a different instrument from the harness in `evals/harness/` (brief-only, scored
mechanically over many tasks). A craft run is one app, one round, read closely.

## The standard

Every run is launched by `launch.sh`, which is the record of the standard:

```bash
evals/craft/launch.sh cadence ~/Code/eval-cadence-7 claude-opus-5-5 <commit>
```

- **The run directory is fresh and outside every repo.** The agent works in `work/`, which
  holds `declarelang/` — a clone of the published repository at the named commit, with
  `evals/` removed — and `task/` (the brief and the data service, from `evals/apps/<app>/`).
  `logs/` sits beside `work/`, outside anything the agent reads.
- **The prompt is four sentences** (written by the script into `logs/prompt.txt`): the
  distribution was just downloaded into `declarelang/`, the language is not in the
  model's training data and the repository is the only source of truth, start at its
  README, build `task/brief.md`, the service is described in `task/api/API.md` and already
  running on its port. Nothing else — the distribution carries the onboarding, and the
  prompt must not step on it. A defect in a brief is fixed in the brief.
- **The agent starts in `work/`**, where the prompt's paths resolve.
- **The brief asks for code to be read and maintained:** "Write it idiomatically, following
  the platform's established best practices, as code that other people will read and
  maintain." It is in the brief, so every platform gets the same sentence.
- **The model is named by exact id**, never an alias.
- **The tools of a real session, all pre-approved:** Read, Glob, Grep, Bash (package
  installs included), Write, Edit, WebSearch, WebFetch. No subagents, no MCP servers. Edits
  are accepted; any other permission is refused rather than waited on. The web is on for
  every run: less controlled, and closer to how the work is really done (ruled 2026-09-24;
  runs 5–7 had no web).
- **One round.** The run stands as built; a fix pass, if any, is a separate, labelled step.

The data service is started by the script on its port. A dev server already running on
the machine is part of the environment: the agent finds the port taken and picks another,
as a user would.

## The comparison run

`launch.sh --stack React <app> <run-dir> <model-id>` runs the same brief on another
platform: no Declare download, and a prompt of two sentences — build `task/brief.md` as a
React application; the service is described in `task/api/API.md`, running on its port, not
to be modified. Everything else — model, tools, web, brief, service, reports — is the same.
The briefs name no technology, so one brief serves every platform.

## Watching a run

The agent's full event stream is `logs/agent.stream.jsonl`. Three readers sit beside it:

- `report.py` — what the agent read, wrote, and ran since the last report, with elapsed
  time, turns and tokens. The run is reported every five minutes.
- `tail.py [N]` — every tool call in order, or the last N.
- `cost.py [N]` — cumulative tokens, and the tool results ranked by size.

A stream quiet for ten minutes is a stall worth a look.

## Scoring

The app is scored from the main tree — `verify` against the file in the run directory,
never an edit inside it — and the report, the app, its assert script and screenshots are
filed under `evals/reports/<date>-<app>-run<N>/`.

## The report

A Declare run's report has, in order:

1. **The comparison:** time, turns and tool calls, lines of code (raw, and without comments
   and blank lines), tokens (output, fresh input, cache reads, reading before the first app
   write, context at the first write and at the end), and the download (gzip) — beside the
   earlier runs and the React baseline. Build figures come from the build stream's final
   record only.
2. **What it built, and how,** and **findings for the platform.**
3. **Is it idiomatic Declare?** A line-by-line read of the whole program against what the
   distribution teaches (the SKILL drift check, the briefs, declare.md): what it gets right;
   its missteps, each with how it should have been written; and the workarounds the
   platform forced, each with how the platform or its docs should handle it. Cite file and
   line.
4. **The agent's account, verbatim.** Asked after the build by resuming the finished session
   with read-only tools, with the standard questions (the prompt is kept beside the logs as
   `impressions.txt`). Its cost is the session's total minus the build's.

A run with a second phase (a follow-up prompt resuming the same session) gets sections 1, 2
and 4 again for that phase, appended to the first part's report. The idiom review (3) is
written once, upon completion of all phases, over the program as it finally stands.
