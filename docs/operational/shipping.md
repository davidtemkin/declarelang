# Shipping a change

The whole loop, from edit to push — including the step nearly everyone is
surprised by the first time. For what each *gate* checks, see
[`derive.md`](derive.md); this page is the **order you do things in**, and the
pitfalls at each step. (Deploying an *app* you wrote in Declare is a different
page: [`building.md`](building.md).)

```sh
# 1. edit, keeping .declare files canon
node tools/format.mjs --write <files>

# 2. prove the sources
npm test                        # every source suite; no derive needed
node tools/verify.mjs <file>    # or: one program, six rungs, while iterating

# 3. regenerate + gate the artifacts
npm run derive                  # rewrites AND STAGES its outputs
npm run test:derived            # the artifact gates — right after a derive

# 4. commit the work
git add <your files> && git commit

# 5. the SECOND derive turn — the commit you just made stales the stamps
npm run derive
git add $(node tools/internal/derive.mjs --paths)
git commit -m 'derived artifacts'

# 6. push — pre-push re-asks 3 and 5 read-only, and refuses if either is off
git push
```

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
assuming either way. And the skip manifest (`.derive/`) is per-clone but
shared across terminals: if a derive reports fewer rules than you expected,
someone (or another session) may have already run it — `derive --dry` tells
you the truth read-only.

**4 — Commit.** The message explains the *why*, names what you verified and
what you did not, and records the decisions (see CONTRIBUTING). Include the
stamped files from step 3 — `--paths` is the audit list if you are unsure what
belongs.

**5 — The second derive turn.** This is the step that surprises: **your commit
itself just staled four rules.** `bundles/version.json` bakes the commit id
(`stamp-version`), and bundles, the committed dists, and the stats cascade
from it — so the distro can say exactly which commit it is. Run `derive`
again, stage `--paths`, and commit as `derived artifacts`. It cannot be
folded into your commit (the id doesn't exist until the commit does), and the
pre-push hook deliberately refuses to make the commit for you: a hook-made
commit lands *after* git has resolved the refs, so it would deploy one commit
behind, silently. Two commits is the honest shape.

**6 — Push.** Pre-push asks two read-only questions: is every artifact fresh
on disk (`derive --dry`), and is everything on the derived paths committed
(`git status` over `--paths`)? A refusal prints the exact recovery — follow
it; it is always shorter than debugging a stale deploy. `--no-verify` exists
for the true emergency and for nothing else.

## The one-glance version

Edit (canon) → `npm test` → `derive` → `test:derived` → commit → `derive` →
commit `derived artifacts` → push. Two derives, two commits, every time the
first commit touches anything a rule reads — which is nearly always.
