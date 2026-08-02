# Tracker: Declare vs. React — same brief, independent builds

Both apps built by an agent against the same functional brief (verbs /
nouns / guarantees, S1–S15), same dataset and generator, same measurement
protocol, same machine and headless Chrome. The React agent had no access
to the Declare app, its design, or its code. Numbers below are production
builds; Declare-side numbers re-measured under the React agent's
definitions where they differed.

## Headline table

| | Declare Tracker | React Tracker |
|---|---|---|
| App code (LOC, no comments/blanks) | **~1,125** (one file) | 1,482 (8 files JS+CSS) |
| Demo-generator apparatus | ~90 | 77 |
| Runtime dependencies | 0 (the platform) | 2 (react, react-dom) |
| Direct dev dependencies | 0 | 3 (vite, plugin, puppeteer-core) |
| Wire, raw JS+CSS | ~316 KB | 184 KB |
| Wire, gzipped | **~98 KB** (platform bundle) | **60 KB** (56.4 JS + 3 CSS) |
| Load 10K (fetch+parse) | ~70 ms | 45.7 ms |
| Ingest 10K | **8 ms** | 9.1 ms |
| Ingest 100K | ~80 ms | 56.1 ms (builds search index) |
| Wheel-scroll frame @100K | 8.4 ms (was 18.7) | 8.3 ms |
| Thumb-drag frame @100K | 8.3 ms (was 126.8) | 8.3 ms |
| Search median/max @100K (warm) | 28.2 / 42.4 ms | **6.8 / 27.2 ms** |
| 1M: ingest | ~1.4 s (generate) | 627 ms |
| 1M: full scroll fidelity | **NO — see finding below** | YES (worked around) |
| Acceptance | 15 scripted criteria green | 118 UI assertions green (S1–S15) |
| Visual/design maturity | multiple review rounds, design system | one-shot, utilitarian (native selects) |

## CORRECTION (2026-08-01, after David observed stalls in Safari)

The "9 ms scrub" figure I reported for the Declare app — in this table's
first draft and in earlier QA rounds — was **measured wrong**. The probe
set `scrollTop` and awaited one `requestAnimationFrame`; the scroll event
(and therefore the reconcile) is dispatched AFTER that frame, so the
probe timed rAF latency and never included the work. Re-measured as
frame-to-frame intervals across a sustained drag:

| | wheel-ish (60px steps) | thumb-drag (teleports) |
|---|---|---|
| Declare @10K | 13.2 ms | 112.1 ms |
| Declare @100K | 18.7 ms | 126.8 ms |
| React @100K | 8.3 ms | 8.3 ms |

**Root cause, found and FIXED (not a deferral).** Instrumenting the
reconciler showed 45 reconciles per scroll step and 1,155 fresh instances
where recycling should have re-pointed existing ones — 499 of 937
candidate rows were rejected as `subtreeDiverged`, the bit that marks a
row as user-touched and therefore unrecyclable. The toucher was the
platform itself: a `Spring` drives its slot with a plain assignment (by
design — an animator must DISPLACE any derive that would overwrite its
rest value), and that write path sets the divergence bit. So **any spring
inside a replicated row silently disabled recycling for that row** — and
the Tracker had just gained one on every row for the in-place expansion.

Two fixes, both principled:
1. `attributes.ts` — an animator's write is a RUNTIME derive, not an
   author's touch (a declared animator toward a declared target is
   reproducible by reconstruction), so it is exempt from the divergence
   bit. `Animator` already used `addBound` and was exempt; only `Spring`'s
   raw assignment was not.
2. `replicate.ts` — the harvest hands the k-th leaver to the k-th arriver
   instead of popping from the end, so a fully-missed window keeps every
   instance at the child index it already holds and re-links nothing.
   Plus `Spring.resnap()`: a recycled instance takes its new target
   outright rather than sliding from the departed record's geometry.

Result: **8.3 ms/frame on a dragged thumb at 100K (from 126.8), 9.4 ms at
10K (from 112)** — parity with React, with the expansion animation intact
(verified: 19 distinct intermediate heights, 44 → 309 px).

## What each side won

**Declare** — expressiveness per line: ~24% less code *while carrying a
far richer surface* (icon system, avatars, springs on data, animated
in-place expansion, design-reviewed chrome vs. native selects). Zero
dependencies, zero build config. Ingest is near-free because search has
no index to build. The virtualization is invisible in the source — the
React app's virtualizer, windowing math, and height bookkeeping are ~1/5
of its code and all of its hardest bugs.

**React** — wire size: 60 KB gz vs. our 98 KB, because Vite ships only
what the app uses while the Declare boot bundle is the whole platform
(un-tree-shaken; a known cost, not a law of nature). Search latency: 4×
faster at 100K by building an index at ingest (a classic space/time trade
our per-keystroke scan doesn't make; both are far under the 50 ms bar).
And 1M fidelity — see below.

## The finding that matters most

The React agent discovered Chrome saturates element layout at ~33.5M px
and **engineered around it** (compressed scroll space). Verifying our app
at 1M: **we have the same bug, live** — the strut clamps at 33,554,428 px,
so the scrollbar can only reach row ~762,000 of 1,000,000. At 100K and
below we are untouched (7.6M px). Filed as a kernel work item: extent
compression + scroll mapping in the windowed reconciler. This is the
single concrete thing the control arm taught us about our own platform.

## On the skeleton convergence

The two apps look structurally alike — toolbar over a list of rows, a
statistics panel, a status line — and that is **prescribed by the brief,
not independently discovered**. Noun 11 names the row's contents
(status, priority, title, labels, assignee, updated); Noun 13 names the
three statistics; the verbs imply a filter/sort/group control cluster;
Nouns 12 and 14 ask for counts and measured numbers to be visible. Any
claim of "independent convergence on the same design" would be false.
What the brief did NOT prescribe — and where the apps genuinely differ —
is form: iconography, avatars, motion, the editor's presentation, and
the whole design system.

## Caveats, honestly

- One run of one agent per side; wire and dependency numbers are stable,
  LOC and perf would vary run-to-run.
- The maturity asymmetry runs BOTH ways: the Declare app had many review
  rounds (design quality reflects it); the React agent spent ~25 minutes
  of wall-clock effort and self-verified 118 assertions we have not yet
  independently re-run one by one.
- Their qualified gaps: 1M short-query search 150–260 ms; undo covers
  deletes only (ours too); no ARIA grid semantics (ours announces
  logical position and count through the windowing seam).
- LOC counts use the same rules both sides (non-blank, non-comment; cloc
  for React, equivalent count for Declare).
