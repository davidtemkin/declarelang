# Finding — a green reference went silently red: `pointerEvents = "none"` stopped sealing subtrees

*Round 001 drift check, 2026-08-23. Subject: `949200bb` (v0.3.1, pushed main).*

## What happened

Before spending a token, round 001 verified the four task references against the pinned
subject. Two of four were red:

| task | rung | cause | class |
|---|---|---|---|
| `collection` | R1, then R5 | mandatory parameter types; retired dot-string data paths | task rot (predates 2026-08-08) |
| `shelf` | **R5 behavior** | **platform regression** — see below | **regression** |

`shelf` is the significant one. Its reference was green on 2026-08-08 (it is the only task
in the committed `RESULTS.md`). It is now behaviorally wrong, and nothing said so.

## The regression, bisected

The task files are **byte-identical** since 2026-08-09 (`git diff --stat 0359157b..HEAD --
evals/tasks/shelf/` is empty), so this is the platform, not the task. Cross-testing
confirms it:

| reference | platform | result |
|---|---|---|
| Aug-8 | Aug-8 | green through R5 |
| current | Aug-8 | green through R5 |
| Aug-8 | current | **FAILED at R5** |
| current | current | **FAILED at R5** |

Binary search over the 100 commits in the window (7 steps, ~15s each) lands on:

```
0762f6fb  2026-08-17  a transparent view is a corridor, not a lid
```

## Mechanism

The commit changed `leafAt` in `runtime/src/interaction.ts`. Before, a view with
`pointerEvents = "none"` returned `null` immediately and **sealed its whole subtree** —
the walk fell through to whatever was beneath. After, the view is a *corridor*: the walk
**descends into its children first**, and each child answers for itself; only the
transparent view itself is skipped.

The change is deliberate, measured, and well-argued in its own comment (the three
backends disagreed and the docs described a fourth thing; a chrome overlay that seals its
subtree cannot contain an interactive panel, which is why the Inspector's window worked on
the web and nowhere else). The reference prose for `View.pointerEvents` was correctly
regenerated and now states the new rule plainly, including its consequence: *"`none` on a
container is not a way to disable a subtree; put it where the decoration is."*

What nobody noticed is that the old rule was **load-bearing for the documented drag-ghost
idiom**. The shelf reference:

```declare
// the viewAt walk underneath still answers with the shelf, not the ghost.
ghost: View [ pointerEvents = "none", cornerRadius = 8,
    visible = { app.dragId != "" },
    x = { app.pointerX - this.width / 2 }, y = { app.pointerY - 22 },
    width = { app.dragW }, height = 44, fill = 0x5B7FA8, opacity = 0.85,
    gt: Text [ x = 8, y = 8, … text = { app.dragLabel } ]
    ]
```

The ghost rides under the pointer during a drag. `dragOver` resolves the drop target with
`app.viewAt(x, y)`, then walks up until it finds a view carrying `which` (the Shelf).

- **Before:** `viewAt` skipped the ghost *and its Text*, and answered with the Shelf.
- **After:** `viewAt` descends into the ghost, and the ghost's `Text` — which carries no
  `"none"` of its own — takes the hit. Walking up gives Text → ghost → App: no `which`
  is ever found, so `dropShelf` stays `""`, and `drop()` silently refuses to commit.

The user-visible result: you drag a block across, it appears to move, and nothing happens.
No compile error. No runtime warning. No diagnostic anywhere. The totals simply stay wrong.

**Fix applied to the reference** (one word, exactly what the new prose prescribes):

```declare
gt: Text [ pointerEvents = "none", x = 8, y = 8, … ]
```

The reference is green through R5 again, which confirms the diagnosis.

## Why this matters more than one red cell

1. **It is the project's own thesis, failing.** Declare exists because "a model writing
   React verifies its work by resemblance, and resemblance is not correctness." Here a
   correct, idiomatic, previously-verified program became silently wrong, and every
   static rung stayed green. Only R5 — real input in a real browser — caught it.

2. **The platform's own tests passed.** The commit added `test/probe/pointertransparent.declare`
   and conform assertions for the *new* behavior. Nothing in 46 suites tested the *old*
   contract that user programs depended on, because the corpus (`apps/`, `library/`) does
   not use a transparent container with an opaque child over a hit-tested surface. The
   eval corpus did — and had not been run in fifteen days.

3. **`docs/declare.md` still teaches the superseded model.** §8 reads: *"A view at
   `opacity = 0` is invisible but entirely present — it holds its layout space and still
   takes clicks, **subtree included** … a fully transparent view is the natural
   press-catcher — a scrim behind a modal."* That sentence is about `opacity`, not
   `pointerEvents`, so it is not literally falsified — but it sits three lines above the
   `pointerEvents = "none"` sentence and teaches "transparent things still take clicks,
   subtree included" as the governing intuition. A reader who has just absorbed it will
   write exactly the ghost that no longer works. The generated reference page is correct;
   the hand-authored front door is misleading by adjacency.

4. **The trap is asymmetric for a model.** An LLM told to put a decorative overlay above
   live content will reach for `pointerEvents = "none"` on the *container* — that is what
   every framework's `pointer-events: none` does, and CSS *does* inherit it to children.
   Declare's new rule is a genuine near-miss: familiar spelling, different semantics, no
   diagnostic. This is precisely the "no near-misses" hazard the design record names.

## Recommendations

- **Decide the contract deliberately, then hold it.** Either (a) keep corridors and give
  authors a real seal — a `pointerEvents = "sealed"` value, or make `"none"` inherit to
  children that do not state `"auto"` (the CSS behavior, which is what a reader expects) —
  or (b) keep the current rule and make it un-missable. Today's rule is defensible but its
  only warning is one sentence in a generated reference page.
- **Amend `docs/declare.md` §8.** The "subtree included" intuition needs the corridor
  exception stated where it is taught, not only where it is catalogued.
- **Add the drag-ghost pattern to the corpus.** It is a documented, common idiom with no
  representative in `apps/` or `library/` — which is exactly why the regression survived.
  A `test/probe` case for *the old contract's users* would have failed loudly on 2026-08-17.
- **Run the eval references as a gate.** Four `verify` runs, zero tokens, ~10 seconds
  total. Had `npm test` climbed R5 on the four references, this would have been caught the
  day it landed. It is the cheapest gate in the repository and it does not exist.
- **Consider whether a silent `viewAt` miss deserves a warning.** `dragOver`'s
  `while (t != null && t.which == null) t = t.parent` walking to `null` is the shape of
  this whole failure class. A dev-build warning when a pointer walk terminates at the App
  with an unhandled press would have named it in seconds.

## Reproduction

```sh
# the regression, from a clean tree
git archive 0359157b | tar -x -C /tmp/a && ln -s "$PWD/node_modules" /tmp/a/node_modules
node /tmp/a/tools/verify.mjs /tmp/a/evals/tasks/shelf/reference.declare \
     --assert /tmp/a/evals/tasks/shelf/assert.mjs          # green through R5

node tools/verify.mjs /tmp/a/evals/tasks/shelf/reference.declare \
     --assert /tmp/a/evals/tasks/shelf/assert.mjs          # FAILED at R5
```
