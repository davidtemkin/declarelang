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

# 4. ONE commit, then push — pre-push re-checks 3 read-only
git add <your files> && git commit
git push
```

That is the whole loop: **one commit** ships a change, artifacts included —
IF nothing touched a rule's inputs between your derive and your push. When
something did, pre-push refuses and prescribes the recovery (step 5 below).

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

**5 — Push, and the refusal you will eventually meet.** Pre-push asks two
read-only questions: is every artifact fresh on disk (`derive --dry`), and is
everything on the derived paths committed (`git status` over `--paths`)? Both
pass when nothing changed since your derive, and the single commit ships.

A refusal means something DID change between your derive and your push — a
last-minute source tweak, a stamped file edited by hand, a collaborator or a
second session touching an input (the skip manifest is per-clone, so their
derive doesn't cover your push). `bundles/version.json` is the sensitive one:
it is a content hash over the finished platform (`stamp-version` — the
cache-buster), so *any* platform-input edit ripples into bundles, the
committed dists, and the stats. The recovery is what the hook prints:

```sh
npm run derive
git add $(node tools/internal/derive.mjs --paths)
git commit -m 'derived artifacts'
git push
```

The second commit is the honest shape *for the recovery*: your first commit
already exists, and the hook deliberately refuses to make the fix-up commit
for you — a hook-made commit lands after git has resolved the refs, so it
would deploy one commit behind, silently. But it is the recovery, not the
rule: re-derive before you commit and the loop stays one commit long.
`--no-verify` exists for the true emergency and for nothing else.

## The one-glance version

Edit (canon) → `npm test` → `derive` → `test:derived` → commit → push.
One commit, when nothing moved after the derive. If pre-push refuses,
something did: derive again, stage `--paths`, commit `derived artifacts`,
push — and next time, derive last.
