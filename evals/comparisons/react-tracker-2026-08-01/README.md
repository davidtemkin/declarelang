# The React control arm — Tracker, built twice

**2026-08-01.** The Tracker (`apps/tracker/tracker.declare`) was specified
functionally and handed to a clean-room agent with no access to Declare,
to this repository, or to the Declare app's design — same dataset, same
measurement protocol, same machine. The point was to put a number on
claims this project had only been making from folklore, and to see what
an independent implementation would surface.

## What is here

| file | what it is |
|---|---|
| `BRIEF.md` | the functional spec the React agent received — verbs / nouns / guarantees + 15 acceptance scenarios. Design was NOT specified |
| `PROTOCOL.md` | the measurement definitions and scrub probe, framework-neutral |
| `comparison.md` | **the results**: LOC, dependencies, wire weight, load/ingest/search/scroll, and what each side won |
| `react-REPORT.md` | the React agent's own report — stack choices, dependency justifications, its self-verification of S1–S15, and its honest gaps |
| `react-src/` | its source (React 18 + Vite, 2 runtime deps, hand-rolled virtualizer) |
| `design-a-calm.html`, `design-b-expressive.html` | the two clean-room DESIGN explorations that preceded the Tracker's visual pass — clickable mockups, no engineering constraints |
| `design-critique.md` | an adversarial review of both, plus its proposed uses of Declare's physics |

## Why it was worth doing

The headline numbers are in `comparison.md`, but the durable value was
what the control arm found in OUR platform:

1. **Browsers saturate element layout at ~2²⁵ px.** The React agent hit
   it and engineered around it; the Declare app had the same bug live at
   1M rows (the scrollbar reached ~76% of the collection). Filed in
   materialization.md.
2. **A measurement that could not see the thing it measured.** The scrub
   probe used throughout the project set `scrollTop` and awaited one
   animation frame — but the scroll event, and the reconcile, dispatch
   AFTER that frame. It timed rAF latency. Frame-to-frame intervals over
   a sustained drag are the honest measure.
3. **Springs silently disabled row recycling.** Once measured properly,
   a dragged scrollbar ran at ~8fps. Cause: a `Spring` drives its slot by
   plain assignment (it must displace competing derives), and that write
   set the divergence bit — so any row holding a spring read as
   user-touched and was refused recycling. Fixed: an animator's write is
   a runtime derive, not an author's touch (`asRuntimeWrite`).
   Dragged-thumb frames went 126.8 ms → 8.3 ms at 100K.

None of the three would have been found by building more apps in
Declare. A second implementation with different assumptions found them
in an afternoon.

## Reading the comparison honestly

`comparison.md` states its own caveats; the two that matter most:

- One run per side. Wire size and dependency counts are stable facts;
  LOC and timing would vary run to run.
- The React app is **not exemplar React**. Told the guarantees up front,
  the agent left the ecosystem's paved road entirely — no state manager,
  no virtualization library — and hand-built a virtualizer with the
  cleverest and most fragile code in either repository. That establishes
  a performance CEILING, not the cost of the normal path. A second arm,
  briefed to produce idiomatic, code-review-clean React, is the
  experiment that would answer "what does this app cost in practice".
