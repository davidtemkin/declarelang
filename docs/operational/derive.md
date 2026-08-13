# Derived artifacts and the gates — what runs when

This repository commits its generated artifacts — the prewarm cache, the
documentation model, the production builds, the baked static pages, the build id —
so a clone hosts and runs with no build step. Two commands keep those artifacts
true, and both are **incremental by declared dependency**: a step whose inputs are
byte-identical to its last run is skipped, loudly.

```bash
npm run derive                          # regenerate whatever your edits staled
node tools/internal/run-gates.mjs       # run the test suites your edits touch
```

**`npm run derive` is the writer, and you are the only thing that runs it.** No hook
derives; committing writes nothing. That is deliberate: a commit is a local
checkpoint, a push is a publication, and a distro only has to be coherent when it is
published.

One honest exception, so the claim is not overstated: `npm test` is not perfectly
read-only. It runs its own `tsc -b` (writing `compiler/dist` and `runtime/dist`, which
are build outputs, not committed artifacts), and any suite that boots the dev server
calls `rebuildStale()` — which rebuilds a stale `bundles/declare-*.js`, and `bundles`
IS a derived output. So a test run on a tree with stale bundles quietly makes them
fresh, after which the pre-push gate will correctly report them as uncommitted. Left
as is on purpose: the bundle was stale, nothing could serve until it was rebuilt, and
`rebuildStale` is hash-based and idempotent.

## When what runs — the whole contract

| step | needs first | does / writes | reports | what blocks it |
|---|---|---|---|---|
| `npm run derive` | nothing | the writer of record: runs the rules, skipping any whose inputs are unchanged | `N derived file(s) regenerated — M rule(s) ran, K skipped` | a generator failing or exceeding its 300s rule timeout |
| `git commit` | nothing | pre-commit checks the staged `.declare` files are canon. **Writes nothing** — derived artifacts may be stale, which is the expected state | silent on success; on failure, the files and the `format --write` line | a staged `.declare` that isn't canon |
| `npm test` | nothing | every suite that tests the SOURCES. Writes its own `tsc -b` output, and may rebuild a stale bundle via `rebuildStale()` when a suite boots the dev server | per-suite pass/fail | nothing downstream — informational, not a gate |
| `git add $(node tools/internal/derive.mjs --paths)` | `npm run derive` | stages what derive just wrote. `derive` never touches the index itself (the pre-commit rule: the index is yours) | nothing | nothing |
| `npm run test:derived` | `npm run derive` **and the stage above** | the suites whose subject IS an artifact: `docs`, `schema-completeness`, `declare-help`, `prewarm`, `dist-freshness`, `ops`. Read-only | which artifact disagrees with the tree | nothing mechanically — it is what tells you a push will be honest |
| `git push` | artifacts fresh **and committed** | pre-push asks two read-only questions: `--dry` (fresh on disk?) and `git status` on the derived outputs (is what's on disk what you're publishing?). **Writes nothing** | silent on success; on refusal, which check failed and the commands | stale artifacts; derived artifacts uncommitted or untracked. Escape: `--no-verify` |

**The one rule you have to hold in your head:** `test:derived` is only meaningful
straight after `derive` — *and after staging what derive wrote*. Everything else is
free-standing or enforced by a refusal.

**Why the stage comes before the gates.** A content-hashed artifact is a NEW PATH every
build (`apps/homepage/dist/app.<hash>.js`), so it lands untracked; `dist-freshness` asks
whether every asset the published page references is in the tree. Run the gates before
staging and it fails on a file derive had just correctly produced — the process tripping
over itself. (`git commit -am` cannot pick these up either: a new path is not a
modification. That is the same trap pre-push's second question exists to catch, and the
reason `--paths` is a list rather than an instruction to commit everything.)

Why `pre-push` refuses instead of fixing: a commit made inside a pre-push hook is not
part of the push it intercepts — git has already resolved the refs — so a hook-made
commit would deploy one commit behind, silently. Since it must refuse either way,
doing ~20s of writes to your tree first buys nothing.

Why two questions and not one: `--dry` inspects the working tree, and a push publishes
HEAD. "Derived but never committed" passes the first check and still deploys stale
files. The second also catches the content-hash trap — derive writes a *new* path
(`app.<hash>.js`) that `git commit -am` cannot stage, so the deployed page would 404
on its own bundle.

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
| `--dry` | READ-ONLY: exit 1 if anything **is** stale, running nothing (the pre-push probe) |
| `--timing` | per-rule cost, and which rules skipped |
| `--paths` | print the committed derived paths, stamps included — the list to `git add` |
| `--outputs` | …only the files a rule authors whole — the narrower list the pre-push gate compares against HEAD |

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
node tools/internal/run-gates.mjs --derived     # the DERIVED tier (derive first!)
node tools/internal/run-gates.mjs --both        # both tiers
node tools/internal/run-gates.mjs --only docs   # a named subset
node tools/internal/run-gates.mjs --bail        # stop at the first failure
```

Tier selection (`--derived` / `--both`) is a different axis from `--all`, which means
"ignore the skip manifest" and applies within whichever tier is selected.

The rules of trust, in order:

- **An unmapped suite always runs.** Unlisted means unskippable — a missing
  declaration fails safe.
- **Skipping is only as good as the input maps**, which err coarse on purpose. If a
  suite ever misses a regression through a skip, fix its input list — that is the
  whole repair.
- **Run `--all` before a push**, and after structural changes (the toolchain, the
  test harness, anything under `tools/internal/`). `npm test` and
  `npm run test:derived` remain the full, unconditional chains and never skip.

## When something looks wrong

- **"derive --check says stale right after a derive"** — a generator is
  non-deterministic; its outputs move on every run. That is a bug in the generator,
  and this is the mechanism making it visible.
- **"a gate failed about git tracking"** (`dist-freshness`), or **pre-push says the
  artifacts aren't committed** — generated files exist on disk that your commit
  doesn't track, and `git commit -am` cannot pick up a new content-hashed bundle.
  Stage the derived paths explicitly: `git add $(node tools/internal/derive.mjs --paths)`.
- **"pre-push refused and I don't want to derive right now"** — then don't push;
  a push is a deploy. `git push --no-verify` exists and you own the consequence.
- **"I edited a generated file and my edit survived"** — only until its rule's
  inputs change; outputs are regenerated over hand edits. Edit the *source* the
  artifact derives from (the rule's inputs say which).
- **Skip state seems confused** — `rm -rf .derive/` and rerun. Costs one full pass,
  can never cost correctness.

The design record — the intention, the invariants, and an honest account of the
risks this mechanism carries and what backstops each one — is
[`system-design/derivation.md`](../system-design/derivation.md).
