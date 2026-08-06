# Derived artifacts and the gates — what runs when

This repository commits its generated artifacts — the prewarm cache, the
documentation model, the production builds, the baked static pages, the build id —
so a clone hosts and runs with no build step. Two commands keep those artifacts
true, and both are **incremental by declared dependency**: a step whose inputs are
byte-identical to its last run is skipped, loudly.

```bash
node tools/internal/derive.mjs          # regenerate whatever your edits staled
node tools/internal/run-gates.mjs       # run the test suites your edits touch
```

You rarely run `derive` by hand: **the pre-commit hook runs it and stages its
outputs**, so a commit self-heals. It costs well under a second when your commit
touches nothing a generator reads.

## derive — the build rules

Every generated artifact belongs to exactly one **rule** with declared inputs and
outputs (`tools/internal/derive.mjs` — the rule table is the file). A rule runs when
the content hash of its inputs differs from its last run, or when one of its outputs
was edited by hand (regeneration wins). Skip state lives in `.derive/` — untracked,
per-clone, always safe to delete; a fresh clone simply runs everything once.

| flag | effect |
|---|---|
| *(none)* | run stale rules, skip the rest |
| `--all` | ignore the skip state, run every rule |
| `--check` | exit 1 if anything **was** stale (nothing should move after a clean derive) |
| `--timing` | per-rule cost, and which rules skipped |
| `--paths` | print the committed derived paths (what the hook stages) |

Two mistakes are **build errors**, not conventions — the driver refuses the graph
and names the rule and the file:

- two rules declaring the same output (every committed artifact has one author);
- a rule reading a file that a *later* rule produces (a forward read is a cycle
  waiting for its second edge).

If you hit one of these after changing a generator, the graph is telling you about
a real edge. Declare it — move the read, split the rule, or reorder — rather than
widening an exclude to quiet it; the last three "false positives" were all real
bugs, one of them a week old and invisible.

**Adding a generated artifact** means adding a rule: its command, what it reads
(including the generator's own source), what it writes. Order is declaration order,
and the validator will tell you if the order you chose contradicts the edges you
declared.

## run-gates — the test suites, same mechanism

A suite is a rule whose output is a green result. Each mapped suite declares its
inputs (`SUITE_INPUTS` in `tools/internal/run-gates.mjs`, plus a core set — runtime,
compiler, library, the harness — that every suite depends on). A suite whose inputs
are unchanged **since its last green run** is skipped with a `skip` line; a suite
that failed is never recorded, so red suites always rerun.

```bash
node tools/internal/run-gates.mjs               # what your change-set touches
node tools/internal/run-gates.mjs --all         # every suite, unconditionally
node tools/internal/run-gates.mjs --only docs   # a named subset
node tools/internal/run-gates.mjs --bail        # stop at the first failure
```

The rules of trust, in order:

- **An unmapped suite always runs.** Unlisted means unskippable — a missing
  declaration fails safe.
- **Skipping is only as good as the input maps**, which err coarse on purpose. If a
  suite ever misses a regression through a skip, fix its input list — that is the
  whole repair.
- **Run `--all` before a push**, and after structural changes (the toolchain, the
  test harness, anything under `tools/internal/`). `npm test` remains the full,
  unconditional chain and never skips.

## When something looks wrong

- **"derive --check says stale right after a derive"** — a generator is
  non-deterministic; its outputs move on every run. That is a bug in the generator,
  and this is the mechanism making it visible.
- **"a gate failed about git tracking"** (`format`, `dist-freshness`) — generated
  files exist on disk that the last commit doesn't track. Commit; the hook stages
  them. Don't hand-stage.
- **"I edited a generated file and my edit survived"** — only until its rule's
  inputs change; outputs are regenerated over hand edits. Edit the *source* the
  artifact derives from (the rule's inputs say which).
- **Skip state seems confused** — `rm -rf .derive/` and rerun. Costs one full pass,
  can never cost correctness.

The design record — the intention, the invariants, and an honest account of the
risks this mechanism carries and what backstops each one — is
[`system-design/derivation.md`](../system-design/derivation.md).
