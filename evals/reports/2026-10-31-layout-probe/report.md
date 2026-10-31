# Layout comprehension probe 1: declare.md §4, old text and new

**Run:** 2026-10-31, eight fresh agents (Opus 5.5), four per arm.
- **Old arm:** `declare.md` as committed in c5a44f81.
- **New arm:** the rewritten §4, the corrected §6 and the amended difference #5 (committed in 4fcc732e).

Each agent had only `README.md` and `docs/declare.md`, and the tools Read, Write, Glob and Grep. It could not run
anything, so what it wrote is its first attempt. The task (`evals/probes/layout/task.md`) has six predictions and
three generic programs. Scoring follows `evals/probes/layout/KEY.md`. The page published for this probe is
`page.html` (Artifact https://claude.ai/artifact/WxNMcix3kf9RPrLeQ9SZEm). Each agent's answers and programs are in
`old-*/` and `new-*/`, the programs as written (`.declare.txt`, so the format hook leaves the first attempts
unchanged).

## Results

| | Old text | New text |
|---|---|---|
| Q1–Q3, Q5, Q6 | all correct | all correct |
| Q4: 300 when wide, else the content's width | 2 of 4 a `State`; 2 `{ wide ? 300 : contentWidth }` | 4 of 4 a `State` |
| frame, as first scored | 2 correct, 2 refused at boot | 4 boot, side panel 34 tall (wrong) |
| frame, after the runtime fixes | 4 of 4 | 4 of 4 |
| form | 4 of 4 | 4 of 4 |
| menu | 4 of 4 | 3 of 4 (one border-colour syntax error) |

Geometry was read with `verify --size 1280x800 --outline app` and `--size 390x844`, against the key.

## What it found

1. **A size stated by a constraint was refused under `align = stretch`;** a constant was kept. The constraint
   bound after the layout's stretch claim and was treated as a conflict. This refused the two old-text frames,
   whose code (`width = { narrow ? parent.width : 240 }`) was correct. Fixed: an author's size takes the slot from a
   stretch claim (`attributes.ts`, flag `fillsContent`).
2. **A size released by a `State` was not stretched under a computed axis.** The layout installed while the
   narrow-screen `State` held the height, and nothing reinstalled it when the state let go. This affected every
   new-text frame. Fixed: an unclaimed size a state releases has the parent's layout install again after the settle
   (`state.ts`).

Both have regression tests in `layout-facts` that fail on the old runtime.

## What it says about the docs

On focused questions both texts taught the rules. The new text steered every agent to `State` for a size that
holds only sometimes. Two new-text agents read "a constraint always decides" as saying "otherwise the content's
width" cannot be written; `contentWidth` does work, so that sentence could be softened. Venue 17's first-boot
layout failures did not reproduce here. They belong to a full build, or to bugs like these two.
