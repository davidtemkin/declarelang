# Murmur — picking this up again

**Paused 2026-08-11 ~10:25 PT.** The Declare arm is done and reported. The React
arm is blocked on an account **weekly usage limit** (resets 7am America/Los_Angeles) —
not a credit balance, so topping up does not help.

## One command to resume

Everything is staged. When the limit resets:

```bash
# 1. the service must be up (it is deterministic; seed 1)
cd ~/Code/OpenLaszlo/declarelang-evals
node evals/apps/murmur/api/server.mjs --port=8330 --seed=1 &
node evals/apps/murmur/api/selftest.mjs --port=8330      # expect 2299/2299

# 2. clean sandbox — exactly two files, nothing else
RUN=~/Code/OpenLaszlo/run-murmur-react-1
rm -rf "$RUN"; mkdir -p "$RUN/task/api"
cp evals/apps/murmur/brief.md    "$RUN/task/"
cp evals/apps/murmur/api/API.md  "$RUN/task/api/"

# 3. run it
node evals/apps/murmur/run-arm.mjs \
  --sandbox "$RUN" --kind open --model opus --arm react-1 --service 8330 --dev 8350
```

**Re-run clean; do not resume a partial.** The Declare arm was one uninterrupted
pass. A "continue what is there" contract measures something else and quietly
breaks the comparison — the same reason the 2026-08-01 tracker arm was discarded.

## Budget, because this is what stopped us

| | output tokens | wall |
|---|---|---|
| Declare arm (complete) | 274,144 | 88.4 min |
| React attempt 1 (rate-limited, unrecorded) | ? | ~36 min |
| React attempt 2 (rate-limited) | 88,164 | 20.1 min |

A finished craft arm costs roughly 275K output tokens. **Two arms in one day is
about a week's cap.** Space them, or run the second on a different account.

> **Note 2026-08-23.** Moved here from the old `~/Code/OpenLaszlo/declarelang-evals`
> tree, which has been deleted. The per-run sandboxes below
> (`run-murmur-declare-1`, `run-murmur-react-1`) and `~/Desktop/murmur-bugs-2026-08-11.md`
> are **gone** — the recovered harness went with them. What survives is this
> directory: brief, API + fixtures (the artifact of record), FINDINGS.md, the
> report, and the four run archives under `runs/`.

## State

- **Declare arm — DONE.** `~/Code/OpenLaszlo/run-murmur-declare-1`, 1,675 lines,
  clean through R4. Its dev server may still be on **:8340**; the app is
  browsable at `http://localhost:8340/my-apps/murmur.declare`.
  - Report: `evals/reports/2026-08-11-murmur-declare-1.md`
  - Findings + evidence: `evals/apps/murmur/FINDINGS.md`
  - Short bug list: `~/Desktop/murmur-bugs-2026-08-11.md`
  - Recovered harness (its own, reconstructed from the transcript):
    `run-murmur-declare-1/harness/` — `shot.mjs` + ten drivers + `lib.mjs`.
    Addresses views by Declare path, so a React arm needs a text/coordinate variant.
- **React arm — BLOCKED.** Two partials archived, both unfinished:
  - `runs/react-1-aborted/` — 30 files, 1,694 lines
  - `runs/react-1-ratelimited/` — 35 files, 2,537 lines, no DESIGN.md

## What the two React partials already established

Neither finished, but both got far enough to settle two things:

1. **The stack is near-deterministic.** Both runs independently chose
   `react` + `motion` + `zustand` + `react-router-dom` + `vite` + `typescript`,
   and both installed `puppeteer-core` unprompted to see their own work. Only the
   display serif and an icon package differed. So "the React arm" is not one
   arbitrary draw — the paved-road clause is doing its job.
2. **Both arms find the same two problems hard.** The React arm gave each its
   own module — `hooks/usePhotoAspect.ts` and `hooks/useTranscriptScroll.ts` —
   which are exactly the photo-natural-dimensions and scroll-anchoring problems
   the Declare arm solved with derived geometry and the `land` heartbeat. That
   cross-arm agreement stands even with both React runs unfinished.
3. **A cost observation worth keeping.** Attempt 1 spent ~12 minutes grepping
   `.d.ts` files inside `node_modules` to work out `motion@13`'s API surface. At
   the moving edge of an ecosystem the training-data advantage thins, and what
   remains is a materially worse lookup instrument than `declare-help`.

## Still open beyond the React arm

- **Motion captured as frames.** "Things travel, nothing switches" is verified in
  source, not in frame sequences. This is the remaining half of the capture rig.
- **G4/G5 undriven** — the Declare agent's own `drive-g4` / `drive-s8` exist in
  the recovered harness and were never run.
- **n = 1.** Cost, LOC and frame timing are fine at this n; craft is not. Nothing
  from this round belongs in `RESULTS.md` as a scoreboard number.
