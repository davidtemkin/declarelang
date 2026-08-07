# App-scale eval tasks

Each directory is one task: a brief written as **ends and constraints, naming no
technology**, a deterministic fixture service the solving agent is given rather than
writes, and — where one exists — a hidden acceptance plus a reference solution.

```
venue/     seat booking. brief · api/ · accept.mjs (12 phases) · reference.declare
cadence/   training log, design-led. brief · api/          (no acceptance yet)
```

**Setting up a sandbox — the whole rule.** These artifacts are committed, so a clean
clone of this repository contains the hidden acceptance, a worked reference solution,
three prior agents' complete programs under `evals/reports/`, and a bug report naming
every known defect with reproductions. An agent given an unmodified clone can read the
test it is graded on, copy a solution, and route around every trap.

So the sandbox is built by **deleting `evals/` outright** and staging the task
somewhere else. A denylist of individual files is not sufficient and has already failed
once:

```bash
git clone <repo> run-<task>
cd run-<task>
rm -rf evals                          # unconditionally, the whole directory
mkdir -p task/api my-apps
cp <source>/evals/apps/<task>/brief.md        task/
cp <source>/evals/apps/<task>/api/API.md      task/api/
cp <source>/evals/apps/<task>/api/server.mjs  task/api/
npm install && npm run build
node task/api/server.mjs --port=<8310|8320>
```

The brief lives at `task/` in the sandbox precisely so that `rm -rf evals` cannot take
it with it. Verify before launching — the agent should have exactly three files, and
none of these should exist anywhere in the tree:

```bash
find . -name accept.mjs -o -name reference.declare -o -name 'app.declare' -o -name '*-bugs.md'
```

Give the agent the distro framing (*this repository is the only source of truth; start
at README.md*), the path to `task/brief.md`, the fixture's port, and a dev-server port
that no other run is using. One tool line rides the contract: *facts about components
and attributes: `node tools/declare-help.mjs <name>`* — so the next round measures the
tool. Nothing else about the language, and nothing about known defects.

**Scoring happens elsewhere.** Keep a separate checkout that still has `evals/`, copy
the finished program into it, and run the acceptance there — from a tree the agent
never touched.

```
node evals/apps/venue/api/selftest.mjs      # 36 checks — the fixture keeps its promises
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
