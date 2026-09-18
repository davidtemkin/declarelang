# Developing the platform: edit to push

**This is the one page for working on Declare itself** — the order you do things in,
what each step actually builds, and the trap at each step. Everything else defers to
it: [`CONTRIBUTING.md`](../../CONTRIBUTING.md) holds the norms (what to document, how
to write a commit, what a pull request may carry), [`derive.md`](derive.md) holds the
per-rule contract (what each rule reads and writes), and [`RELEASING.md`](../../RELEASING.md)
holds the separate act of cutting a version. Deploying an *app* you wrote in Declare is
a different page again: [`building.md`](building.md).

## The one fact everything follows from

This repository doesn't just hold sources — it holds the finished product too. The
bundles, the docs model, the prewarm cache, the baked pages are all **committed**, and
GitHub Pages serves whatever lands on `main`. A push isn't just sharing code — **a push
is a deploy**.

That creates exactly one danger: publishing generated files that no longer match the
sources they were generated from. Everything below exists to prevent that, while staying
out of your way the rest of the time.

## What each command builds — and what it leaves alone

The commands are not layers of one build. They build *different things*, and the most
expensive mistake on this page is assuming a green test run means the tree is current.

| you run | it builds | it does **not** build |
|---|---|---|
| `npx tsc -b` (= `npm run build`) | `runtime/dist`, `compiler/dist` — the JavaScript that Node imports | anything in `bundles/` |
| `npm test` | runs `tsc -b` first, then every source suite | anything in `bundles/`; no derive, no artifact gate |
| `npm run derive` | every committed artifact whose inputs moved — `bundles/`, the docs model, the prewarm cache, stamped stats, the build id — and **stages what it owns** | nothing else; it runs no tests |
| `npm run test:derived` | nothing — it *checks* artifacts against a fresh assembly | anything; only meaningful straight after a derive |
| `npm run build:mac` | the Mac app, via `derive --only tsc,bundles` then Swift | the rest of the derive chain |
| `npm run test:ladder` | nothing — it drives real input and real pixels in headless Chromium (rungs 5–6) | anything; minutes, not seconds |
| `npm run test:conform` | nothing — it compares the renderers against each other | anything |
| `npm run test:mac` | the Mac app first (`build:mac`), then the native gate and the three-renderer conformance | the rest of the derive chain |
| `npm start`, `tools/reload-dev.mjs` | serves the tree — and rebuilds a *stale platform bundle in place* when a page asks for one | anything else; it stages nothing |

Two consequences follow, and both have cost real time.

**`tsc` is not the build.** `runtime/dist` and `compiler/dist` are what the tests and the
Node compiler import. `bundles/declare-compiler.js` is a separate, minified artifact that
only derive produces, and the `bundles` rule takes `runtime/dist` and `compiler/dist` as
*inputs*. So the moment you edit `runtime/src` or `compiler/src` and run `tsc`, the bundles
are stale — and the whole suite can pass, because nothing in it imports them for the code
you just changed. A checker change that lives only in `compiler/dist` is enforced by Node
and not by the in-browser compiler until a derive.

**A test run can rewrite `bundles/` under you.** Any suite that boots the dev server serves
pages that import the platform bundles, and the server keeps them fresh the same way the
build does (`rebuildStale`). So `bundles/` can change *during* `npm test`, with no derive
having run, nothing staged, and the ledger untouched. Read `git status` **after** the suite,
not before. (That rebuild judges staleness by mtime, which is a weaker currency than the
content hash derive uses — `git restore` gives old bytes new mtimes — so treat it as a
convenience for the browser, never as the build.)

## The three players

**`npm run derive` — the builder.** Every generated file belongs to exactly one *rule*: a
command, the files it reads, the files it writes. Derive walks the rules in order, asking
each: have this rule's inputs changed since the last time it ran? If no — skip. If yes —
run it, and write down what the inputs looked like afterward. That notebook is the **ledger**
(`.derive/manifest.json`) — private to your clone, never committed, always safe to delete.
Derive also `git add`s the files it regenerates, so a bundle that comes out under a new
hashed filename cannot be forgotten.

Two things to hold about the ledger. It compares **contents, not timestamps**: an edit to a
rule's input makes the rule *stale*, which means **unverified**, not necessarily wrong —
re-running may prove the output byte-identical, and the run then just brings the ledger up
to date. And it is only true if **every rule run goes through derive** — which is why
`build:mac` gets its TypeScript-and-bundles step by calling `derive --only tsc,bundles`
rather than running the same tools by hand: same work, but the ledger hears about it.

**`git commit` — a free checkpoint.** A commit checks almost nothing: only that staged
`.declare` files are formatter-canon. It is *allowed* to leave every artifact stale,
deliberately — commits are local save points, and a stale checkpoint hurts no one. Nothing
regenerates on commit; nothing is written on your behalf.

**`git push` — the gate.** Because a push is the deploy, this is where staleness becomes a
defect. The hook asks two read-only questions and refuses if either fails; it never fixes
anything itself:

1. **Has every rule run since its inputs last changed?** Checked against the ledger — fast,
   writes nothing.
2. **Is what's on disk what you're actually publishing?** A push publishes HEAD, so freshly
   derived files that were never committed would still deploy the old ones. This is a plain
   `git status` over derive's output files.

## The everyday loop

```sh
# 1. edit, keeping .declare files canon
node tools/format.mjs --write <files>

# 2. prove the sources
npm test                        # every source suite; no derive needed
node tools/verify.mjs <file>    # or: one program, six rungs, while iterating
npm run test:ladder             # before a push that touched layout, paint or input

# 3. stage your sources — BEFORE the derive
git status                      # the suite may have rewritten bundles/; look before you stage
git add <your files>

# 4. regenerate + gate the artifacts — AFTER the last source edit
npm run derive                  # rewrites AND STAGES its outputs, beside your sources
npm run test:derived            # the artifact gates — right after a derive

# 5. ONE commit, then push — pre-push asks its two questions, read-only
git add <the stamped files derive rewrote> && git commit
git push
```

Stage your sources before the derive, and the index never holds artifacts of a source state
it does not also hold — derive stages what it writes, so staged sources and staged outputs
describe one tree, whether the commit follows at once or waits. Mid-arc, when you want the
artifacts refreshed to look at and the index left where it is, `npm run derive -- --no-stage`
writes the files and touches nothing else; the staging run above is what a commit wants. Derive **after your last
source edit** and immediately before the commit, and the push sails through: one commit ships
a change, artifacts included. Edit source after the derive — even
a one-line checker message — and the bundles are behind again, invisibly, until pre-push
says so.

## Step by step, with the pitfalls

**1 — Edit.** `.declare` sources must be formatter-canon: the pre-commit hook refuses a
staged file that isn't, and `npm test`'s format suite checks the whole corpus. Run
`tools/format.mjs --write` on what you touched — much cheaper than discovering the drift at
commit time. Never hand-edit a generated file (`docs/declare-model.json` above all — the next
derive silently overwrites it); reference prose lives in `tools/internal/doc/prose/`, and the
reference regenerates from it.

**2 — Test.** `npm test` is the full source chain and needs no derive first. While iterating,
run the suite nearest your change (`node test/<suite>.test.mjs`) and `tools/verify.mjs` on a
program you may have affected — a clean compile is not a working app; rungs 4–6 are where
layout, paint, and input exist. *Pitfalls:* if you filter a long run through `grep`, remember
block buffering, and that one `FAIL` line is easy to miss in a green-looking wall — check the
exit code, not the vibe. And a green suite proves the *sources*, never the bundles.

**3 — Stage your sources, then derive + gate.** Stage what you authored first, by path:
derive stages its own outputs, and outputs staged beside unstaged sources leave the index
describing a tree that exists nowhere. Then `npm run derive` regenerates every committed artifact whose inputs
changed and **stages what it owns** (rewrites, new content-hashed paths, prunes — `git add -A`
per output pathspec, so a `git commit -a` can never publish a page that 404s on its own
bundle). Two boundaries: **stamped** files (README, `docs/declare.md`, the `index.html` pages,
the FAQ — hand-authored around their `<!--stat-->` markers) are rewritten in place but left
for *you* to stage; and staging runs even on a no-op derive, to reconcile an interrupted
earlier run. Then `npm run test:derived`, which is only meaningful straight after a derive.
*Pitfalls:* a stamped file showing as modified is usually derive's stats moving, not a mystery
editor — read the diff before assuming either way. And the ledger is per-clone but shared
across terminals: if a derive reports fewer rules than you expected, another session may have
run it — `derive --dry` tells you the truth, read-only.

**4 — Commit.** The message explains the *why*, names what you verified and what you did not,
and records the decisions ([`CONTRIBUTING.md`](../../CONTRIBUTING.md) has the norms). Include
the stamped files from step 3 — `derive --paths` is the audit list if you are unsure what
belongs. Stage by path; `git add -A` sweeps whatever else the tree is carrying.

**5 — Push, and the refusal you will eventually meet.** A refusal on the first question means
some rule's inputs moved after that rule last ran — a last-minute source tweak, a stamped file
edited by hand, a collaborator or a second session touching an input. The refusal names the
stale rules, and the recovery is one command — `npm run derive` — with two endings, both
stated in the refusal:

- **It regenerated files.** They are already staged; commit them and push again.
  `bundles/version.json` is the usual passenger: it is a content hash over the finished
  platform (the cache-buster), so *any* platform-input edit ripples into bundles, the
  committed dists, and the stats.
- **It reports `0 derived file(s) regenerated`.** Your edit touched a rule's inputs without
  changing its outputs — a prose edit under `docs/` is the classic case: `assemble` re-runs
  and the model comes out byte-identical. The artifacts were fine all along; the run just
  brought the ledger up to date. Push again; there is nothing to commit.

The fix-up commit is the honest shape *for the recovery*: your first commit already exists,
and the hook deliberately refuses to make it for you — a hook-made commit lands after git has
resolved the refs, so it would deploy one commit behind, silently. But it is the recovery,
not the rule: derive after your last edit and the loop stays one commit long. `--no-verify`
exists for the true emergency and for nothing else.

## Working on `main` versus sending a pull request

These are different jobs and the artifact rule inverts between them, which is worth saying
once rather than discovering in review.

**On `main` (this is the deploy):** derive, and commit the artifacts with the change. That is
the loop above.

**In a pull request:** stage only the files you authored. Every artifact is a function of the
*whole tree at one commit*; the moment main moves, regenerated copies describe a tree that no
longer exists and the PR conflicts on files nobody hand-edited. Whoever lands the PR re-runs
the derive chain on top of current main. Quick self-check before pushing a branch: if
`bundles/`, `dist/`, or `declare-model.json` appear in your diff, unstage them.

## The one-glance version

Edit (canon) → `npm test` → `git status` → **stage your sources by path** → **derive after the
last edit** → `test:derived` → stage the stamped files → one commit → push. If pre-push refuses: `npm run derive` — commit what it
regenerates and push, or, if it regenerates nothing, just push.
