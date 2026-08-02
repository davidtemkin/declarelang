# The React control arm — Tracker, built idiomatically

**2026-08-02.** The Tracker (`apps/tracker/tracker.declare`) was specified
functionally and handed to a clean-room agent with no access to Declare, to
this repository, or to the Declare app's design — same dataset, same
measurement protocol, same machine. The brief additionally required the source
to be a work sample: idiomatic React, ecosystem libraries where the community
has an answer, no hand-rolled infrastructure, code-review clean.

The point was to put a number on claims this project had only been making from
folklore, and to see what an independent implementation would surface.

## What is here — SOURCE ONLY

Nothing generated and nothing vendored. With `npm install` this builds; without
it, every file here is authored input.

| file | what it is |
|---|---|
| `comparison.md` | **the results** — LOC, dependencies, wire weight, load/ingest/search/scroll, what each side won, and the three platform defects the experiment found in *our* runtime |
| `REPORT.md` | the React agent's own report: stack choices, every deviation from an ecosystem default with its justification, the guarantee-by-guarantee table, its honest gaps |
| `BRIEF.md` | the functional spec it received — verbs / nouns / guarantees + 15 acceptance scenarios, plus the "code is a deliverable" clause. Design was NOT specified |
| `PROTOCOL.md` | the measurement definitions and probes, framework-neutral |
| `src/` | its source: 46 files, 1,602 lines TS/TSX + 1,176 CSS |
| `scripts/`, `probe.mjs` | its own acceptance driver (S1–S15, 91 checks) and the PROTOCOL probes — unshipped harness |
| `gen-issues.mjs` | the supplied dataset generator |
| `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` | the scaffolding needed to build |

**Deliberately absent:** `node_modules/`, `dist/`, `package-lock.json`,
`issues.json`, `screenshots/`. All derivable.

## Building it

```
npm install
node gen-issues.mjs 10000 > issues.json    # the fixture
npm run build                              # production build
npm run preview                            # http://localhost:5175
node scripts/acceptance.mjs                # drives S1–S15 through the UI → 91/91
node probe.mjs                             # PROTOCOL.md numbers at 10K / 100K / 1M
```

`package.json` carries caret ranges, so a rebuild resolves to whatever npm
serves that day. The versions behind every number in `comparison.md` are
recorded exactly in `REPORT.md` §2 — React 19.2.8, @tanstack/react-virtual
3.14.9, zustand 5.0.14, react-hook-form 7.84.0, react-hotkeys-hook 5.3.3,
sonner 2.0.7, lucide-react 1.28.0, clsx 2.1.1; vite 6.4.3, typescript 7.0.2.
Pin those to reproduce the measurements rather than merely re-run the app.

## The headline

**~1,125 lines and 85 KB gz (Declare) against 2,703 lines, 9 runtime
dependencies and 108 KB gz (React)** — at parity on scrub (8.3 ms/frame at
100K) and search (28/42 vs 30/35 ms at 100K), with React ahead on load and
ingest. React's platform floor alone (react + react-dom + scheduler) is
61.5 KB gz against Declare's measured 47 KB whole-platform floor.

## Why it was worth doing

The numbers are in `comparison.md`, but the durable value was what the
experiment found in OUR platform:

1. **Browsers saturate element layout at ~2²⁵ px.** The React agent hit it and
   engineered around it; we have the same bug live at 1M rows (the scrollbar
   reaches 76% of the collection). Filed in `materialization.md`. **Still open.**
2. **A measurement that could not see the thing it measured.** Our scrub probe
   timed rAF latency, not the reconcile. Every earlier scrub number had to be
   re-taken.
3. **Springs silently disabled row recycling** — a dragged scrollbar ran at
   ~8 fps. A `Spring`'s raw slot assignment set the divergence bit, so any row
   holding a spring read as user-touched and was refused recycling. **Fixed**
   (`attributes.ts`, `replicate.ts`, and `Spring.arrive()` — which superseded the
   first `resnap()` attempt): 126.8 → 8.3 ms/frame.

None of the three would have been found by building more apps in Declare.

## A note on the discarded first arm

An earlier arm was run on 2026-08-01 with an identical brief *minus* the
"code is a deliverable" clause. Told the guarantees up front, that agent left
the ecosystem entirely — no state manager, no virtualization library — and
hand-built a virtualizer it described as the cleverest and most fragile code in
either repository. It measured 1,482 LOC and 60 KB gz, and those figures
circulated for a day as "what React costs". **They are not.** They bound a
performance ceiling reachable only off the paved road, bought with code that
would fail an ordinary review, against a Declare app explicitly held to
exemplar standards. Comparing them was comparing exemplar Declare to
non-exemplar React.

That arm's source and report were removed 2026-08-02 (recoverable from git
history at `evals/comparisons/react-tracker-2026-08-01/`, commit `2ba1e33`).
Findings 1 and 2 above originated with it and are retained on their own merits.
