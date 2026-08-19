# Shipping a change

The whole loop, from edit to push — what the scheme is *for*, the order you do
things in, and the pitfalls at each step. For the per-gate contract (what each
check reads and writes), see [`derive.md`](derive.md). (Deploying an *app* you
wrote in Declare is a different page: [`building.md`](building.md).)

## The one fact everything follows from

This repository doesn't just hold sources — it holds the finished product too.
The bundles, the docs model, the prewarm cache, the baked pages are all
**committed**, and GitHub Pages serves whatever lands on `main`. A push isn't
just sharing code — **a push is a deploy**.

That creates exactly one danger: publishing generated files that no longer
match the sources they were generated from. The whole scheme below exists to
prevent that, while staying out of your way the rest of the time.

## The three players

**`npm run derive` — the builder.** Every generated file belongs to exactly one
*rule*: a command, the files it reads, the files it writes. Derive walks the
rules in order, asking each one: have this rule's inputs changed since the last
time it ran? If no — skip. If yes — run it, and write down what the inputs
looked like afterward. That notebook of "what things looked like last time" is
the **ledger** (`.derive/manifest.json`) — private to your clone, never
committed, always safe to delete (a fresh clone simply runs everything once).
Derive also `git add`s the files it regenerates, so a bundle that comes out
under a new hashed filename cannot be forgotten.

Two things to hold about the ledger. It compares **contents, not timestamps**:
an edit to a rule's input makes the rule *stale*, which means **unverified**,
not necessarily wrong — re-running may prove the output byte-identical, and the
run then just brings the ledger up to date. And it is only true if **every rule
run goes through derive** — which is why `build:mac` gets its
TypeScript-and-bundles step by calling `derive --only tsc,bundles` rather than
running the same tools by hand: same work, but the ledger hears about it.

**`git commit` — a free checkpoint.** A commit checks almost nothing (only that
staged `.declare` files are formatter-canon). It is *allowed* to leave every
artifact stale, deliberately: commits are local save points, and a stale
checkpoint hurts no one. Nothing regenerates on commit; nothing is written on
your behalf.

**`git push` — the gate.** Because a push is the deploy, this is where
staleness becomes a defect. The hook asks two read-only questions and refuses
if either fails — it never fixes anything itself:

1. **Has every rule run since its inputs last changed?** Checked against the
   ledger — fast, writes nothing.
2. **Is what's on disk what you're actually publishing?** A push publishes
   HEAD, so freshly derived files that were never committed would still deploy
   the old ones. This is a plain `git status` over derive's output files.

## The everyday loop

```sh
# 1. edit, keeping .declare files canon
node tools/format.mjs --write <files>

# 2. prove the sources
npm test                        # every source suite; no derive needed
node tools/verify.mjs <file>    # or: one program, six rungs, while iterating

# 3. regenerate + gate the artifacts
npm run derive                  # rewrites AND STAGES its outputs
npm run test:derived            # the artifact gates — right after a derive

# 4. ONE commit, then push — pre-push asks its two questions, read-only
git add <your files> && git commit
git push
```

Derive right before the commit, and the push sails through: **one commit**
ships a change, artifacts included. If something touched a rule's inputs
between your derive and your push, pre-push refuses and prescribes the
recovery (step 5 below).

## Step by step, with the pitfalls

**1 — Edit.** `.declare` sources must be formatter-canon: the pre-commit hook
refuses a staged file that isn't, and `npm test`'s format suite checks the
whole corpus. Run `tools/format.mjs --write` on what you touched — it is much
cheaper than discovering the drift at commit time. Never hand-edit a generated
file (`docs/declare-model.json` above all — the next derive silently overwrites
it); reference prose lives in `tools/internal/doc/prose/`, and the reference
regenerates from it.

**2 — Test.** `npm test` is the full source chain and needs no derive first.
While iterating, run the suite nearest your change (`node test/<suite>.test.mjs`)
and `tools/verify.mjs` on a program you may have affected — a clean compile is
not a working app; rungs 4–6 are where layout, paint, and input exist.
*Pitfall:* if you filter a long run's output through `grep`, remember block
buffering — and that one `FAIL` line is easy to miss in a green-looking wall.
Check the exit code, not the vibe.

**3 — Derive + gate.** `npm run derive` regenerates every committed artifact
whose inputs changed and **stages what it owns** (rewrites, new content-hashed
paths, prunes — `git add -A` per output pathspec, so a `git commit -a` can
never publish a page that 404s on its own bundle). Two boundaries: **stamped**
files (README, `docs/declare.md`, the `index.html` pages, the FAQ — hand-
authored around their `<!--stat-->` markers) are rewritten in place but left
for *you* to stage; and staging runs even on a no-op derive, to reconcile an
interrupted earlier run. Then `npm run test:derived`, which is only meaningful
straight after a derive. *Pitfalls:* a stamped file showing as modified is
usually derive's stats moving, not a mystery editor — read the diff before
assuming either way. And the ledger (`.derive/`) is per-clone but shared
across terminals: if a derive reports fewer rules than you expected, someone
(or another session) may have already run it — `derive --dry` tells you the
truth read-only.

**4 — Commit.** The message explains the *why*, names what you verified and
what you did not, and records the decisions (see CONTRIBUTING). Include the
stamped files from step 3 — `--paths` is the audit list if you are unsure what
belongs.

**5 — Push, and the refusal you will eventually meet.** A refusal on the
first question means some rule's inputs moved after that rule last ran — a
last-minute source tweak, a stamped file edited by hand, a collaborator or a
second session touching an input (the ledger is per-clone, so their derive
doesn't cover your push). The refusal names the stale rules, and the recovery
is one command — `npm run derive` — with two endings, both stated in the
refusal:

- **It regenerated files.** They are already staged; commit them
  (`git commit -m 'derived artifacts'`) and push again.
  `bundles/version.json` is the usual passenger: it is a content hash over
  the finished platform (`stamp-version` — the cache-buster), so *any*
  platform-input edit ripples into bundles, the committed dists, and the
  stats.
- **It reports `0 derived file(s) regenerated`.** Your edit touched a rule's
  inputs without changing its outputs — a prose edit under `docs/` is the
  classic case: `assemble` re-runs and the model comes out byte-identical.
  The artifacts were fine all along; the run just brought the ledger up to
  date. Push again; there is nothing to commit.

The fix-up commit is the honest shape *for the recovery*: your first commit
already exists, and the hook deliberately refuses to make it for you — a
hook-made commit lands after git has resolved the refs, so it would deploy
one commit behind, silently. But it is the recovery, not the rule: re-derive
before you commit and the loop stays one commit long. `--no-verify` exists
for the true emergency and for nothing else.

## The one-glance version

Edit (canon) → `npm test` → `derive` → `test:derived` → commit → push.
One commit, when nothing moved after the derive. If pre-push refuses:
`npm run derive` — commit what it regenerates and push, or, if it regenerates
nothing, just push. And next time, derive last.
