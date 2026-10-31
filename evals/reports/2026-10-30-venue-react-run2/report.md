# React Venue run 2: Opus 5.5, recorded

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh --stack React venue-checkout ~/Code/eval-venue-react-2 claude-opus-5-5 585c768d 8351`.
Murmur run 12 was building on the same machine at the time.
The prompt: "Build the app described in `task/brief.md` as a React application. The data service is described in
`task/api/API.md` and is already running on port 8351; do not modify it." The run was recorded with
`evals/craft/record.sh` (66 snapshots). The side-by-side page with Declare Venue 17 is the Artifact
https://claude.ai/artifact/EjUbFsLNTsBq3pXhzRLFJ1.

**Files beside this report:**
- the app's source (`src/` and its config);
- the agent's own Playwright scripts (`agent-qa/`);
- the hidden acceptance results, as delivered and at first boot (`drive/`).

## Figures

| | React Venue 1 | **React Venue 2** |
|---|---|---|
| time | 31.4 min | **30.9 min** |
| turns | 101 | **108** |
| model · tool time | | **20.3 · 10.6 min** |
| thinking | | **9.7 min** |
| output tokens · cached input re-read | | **135.5k · 9.8M** |
| hidden acceptance at first boot | | **6 of 11** |
| hidden acceptance as delivered | 11 of 11 | **11 of 11** |
| code, excluding blank and comment lines | | **2,666** |

## Process

1. **Setup (0–3.9 min).** It probed the service with `curl`, the event stream included, and scaffolded Vite, React
   Router, TanStack Query and react-hook-form. It read no documentation.
2. **Writing (3.9–15.7 min).** The whole app, with no build in between.
3. **First build (15.7 min).** Six type errors: two unused names and four mismatched props on one field component.
   All were fixed in one round.
4. **First boot (16.1 min).** Its own Playwright screenshot script.
5. **Checking (16–30.9 min).** About 20 runs of three Playwright scripts of its own (181 lines), 8.2 min in total.
   Nine builds took 1.9 min, plus ESLint. It looked at 10 screenshots.

**At first boot** it passed 6 of 11 flows. One bug failed the other five: the route guarding the confirmation sent the
person away once paying emptied the chosen seats. Its Playwright scripts found the bug, and it was fixed at 22.9 min.

## The hidden drive

`wrong_password` first failed with "Node is detached from document", intermittently. React replaces the header's
"Sign in" button when the account request returns, and the drive pressed the element it had found before the
replacement. The drive now finds a replaced control again before pressing it, as a person's eye would. With that
change all 11 flows pass.
