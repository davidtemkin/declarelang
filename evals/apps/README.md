# App-scale eval tasks

Each directory is one task: a brief written as **ends and constraints, naming no
technology**, a deterministic fixture service the solving agent is given rather than
writes, and — where one exists — a hidden acceptance plus a reference solution.

```
venue/     seat booking. brief · api/ · accept.mjs (12 phases) · reference.declare
cadence/   training log, design-led. brief · api/          (no acceptance yet)
```

**What the solving agent sees:** `brief.md` and `api/` only. `accept.mjs`,
`reference.declare` and `api/selftest.mjs` are withheld — an acceptance written or shown
after a solution exists grades on a curve.

**Running a task.** Clone the repo fresh, stage only the brief and `api/`, start the
fixture, and give the agent the distro framing (*this repository is the only source of
truth; start at README.md*). Score afterwards with `accept.mjs` from a tree the agent
never touched.

```
node evals/apps/venue/api/server.mjs                 # :8310
node evals/apps/cadence/api/server.mjs               # :8320
node evals/apps/venue/api/selftest.mjs               # 36 checks — the fixture keeps its promises
node tools/verify.mjs <app>.declare --assert evals/apps/venue/accept.mjs
```

The acceptance addresses a program by what is on screen and what happens when you click
it, never by the identifiers a particular solution chose, so any implementation shaped to
the brief can pass. It resets the fixture before it looks at anything.

**Known brief defect (venue, cadence):** Cadence §2 requires the literal copy
`4 sessions · 3h 40m` while §6 requires the largest number to be 6× the smallest text on
the same screen. At 390px those collide, and one run resolved it by demoting the week
line. Say explicitly that a line may be set as differently-sized runs before using this
brief again.

Reports from past runs, with screenshots and validated findings: `evals/reports/`.
