# Tracker: Declare vs. idiomatic React — same brief, independent builds

The Tracker (`apps/tracker/tracker.declare`) was specified **functionally** —
verbs (what the user can do), nouns (what the user can see), guarantees (what
must hold), plus 15 acceptance scenarios — and handed to a clean-room agent
with no access to Declare, to this repository, or to the Declare app's design.
Same dataset and generator, same measurement protocol, same machine, same
headless Chrome. Design was not specified.

The brief additionally required the code itself to be a deliverable:

> **The source will be read and judged as a work sample.** Write idiomatic,
> maintainable React that a senior React reviewer would call exemplary:
> standard ecosystem choices where they exist, no hand-rolled infrastructure
> where a well-regarded library is the community answer, code-review clean.
> If you deviate from an ecosystem default — including building something
> yourself that a popular library already does — say so in the report and
> justify it. […] If a guarantee turns out to be unreachable on the idiomatic
> path, implement the best idiomatic version you can, MEASURE the shortfall
> honestly, and report it as a shortfall. Do not go off-road to hit a number.

That clause is why this comparison is the valid one. **An earlier arm was run
without it and is discarded** — told the guarantees up front, that agent left
the ecosystem's paved road entirely (no state manager, no virtualization
library) and hand-built a virtualizer that its own report called the cleverest
and most fragile code in either repository. Its numbers bounded a performance
*ceiling*, not the cost of the normal path, so they were never a like-for-like
comparison and are not retained. What it *did* find in our platform is
preserved below, because that part was real.

## Headline table

| | Declare Tracker | React Tracker |
|---|---|---|
| App code (LOC, no comments/blanks) | **~1,125** (one file) | 2,703 (1,602 TS/TSX + 1,176 CSS, 46 files) |
| Demo-generator apparatus | ~90 | 75 (ported) |
| Runtime dependencies | **0** (the platform) | 9 |
| Direct dev dependencies | **0** | 7 |
| Wire, raw JS+CSS | **388 KB** | 354 KB |
| Wire, gzipped | **85 KB** (87 JS + 0.2 HTML) | 108 KB (105 JS + 4.6 CSS + 0.8 HTML) |
| Load 10K (fetch+parse) | ~70 ms | **52 ms** |
| Ingest 10K | **8 ms** | 12 ms |
| Ingest 100K | ~80 ms | **76 ms** |
| Wheel-scroll frame @100K | 8.4 ms | — |
| Thumb-drag frame @100K | 8.3 ms | 8.3 ms |
| Search median/max @100K (warm) | **28.2 / 42.4 ms** | 30 / 35 ms |
| 1M: ingest | ~1.4 s (generate) | **861 ms** |
| 1M: search per keystroke | — | 199 / 225 ms (stated shortfall) |
| 1M: full scroll fidelity | **NO — see platform findings** | YES |
| Acceptance | 15 scripted criteria green | 91/91 checks (S1–S15) |
| Visual/design maturity | multiple review rounds, design system | one shot, ecosystem components |

React 19 + TypeScript + Vite. Its nine runtime dependencies, each the
community's standard answer:

| Package | Why (its own reasoning) |
|---|---|
| `react`, `react-dom` | required; React 19 for `useDeferredValue` on the 100K derivation |
| `zustand` | client state; selector subscription, so a keystroke re-renders the search box and not the stats panel |
| `@tanstack/react-virtual` | row virtualisation with dynamic item measurement — the open editor is a variable-height row in the same scroller |
| `react-hook-form` | the in-row editor; its uncontrolled model *is* the draft semantics the brief asks for |
| `react-hotkeys-hook` | shortcuts; its "ignore keystrokes in form fields" default is the brief's "never while typing" rule |
| `sonner` | the timed-undo toast — timer, action button, stacking, hover-to-pause, SR announcement |
| `lucide-react` | icons; per-icon ESM imports tree-shake to 2.2 kB gz for the 17 used |
| `clsx` | conditional class names (0.24 kB gz) |

Organized as a real codebase — `domain/`, `store/`, `state/`,
`components/{list,filters,shell,stats,toolbar,ui}/`, `styles/tokens.css`,
CSS Modules throughout. Largest single file is the store at 217 lines.

## Wire size: Declare ships less, and its floor is lower

**On the paved road, React costs more: 108 KB gz vs our 85 KB, in 2.4× the
code.** Per-package composition of its bundle (KB gz), from a one-off build
with per-package chunks:

```
react-dom  56.5   app code 12.2   react-hook-form 10.4   sonner 9.6
virtual-core 6.7  react 3.3       react-hotkeys-hook 2.5 lucide 2.2
scheduler 1.7     zustand 1.6     react-virtual 1.0      clsx 0.2
```

**React's platform floor is 61.5 KB gz** — react + react-dom + scheduler,
before a line of app code. Declare's measured floor is **47 KB gz**: a
hello-world production build (`App [ Text [ text = "hello" ] ]`) with the whole
platform in. We are 14 KB *under* React's floor. Their app code is 12.2 KB of
their 108 — **89% of what React ships is framework**; ours is 32 KB of our 85,
so the remaining difference is program representation, not runtime.

**On tree-shaking (audited 2026-08-02).** Declare's production bundle *is*
tree-shaken — generated registry slimming plus eleven fact-gated module
substitutions — and the whole app corpus's runtime range is 47→62 KB gz, so the
residual is kernel, not dead code. An aggressive-stub ceiling measurement puts
the theoretical floor at ~31 KB gz, but the Tracker could claim only ~2 KB of
that: it genuinely uses replication, windowing, datasets, state, animation,
text editing, pointer input, stylesheets and fonts. Capability slimming
therefore cannot move this comparison and is not worth doing on size grounds.
One real defect surfaced and was FIXED: the production entry's bare
`import "index.js"` dragged `image.js` and `text-input.js` past a correct
`slim-registry` exclusion — 1.1 KB gz, and a hole in a mechanism the build
relies on. See [bundle-slimming.md](../../../docs/system-design/bundle-slimming.md).

## What each side won

**Declare** — expressiveness per line: **~58% less code** (~1,125 vs 2,703)
*while carrying a far richer surface*: icon system, avatars, springs on data,
animated in-place expansion, design-reviewed chrome against ecosystem
components. Zero dependencies and zero build configuration against nine
runtime packages and a Vite/TypeScript toolchain. Smaller wire. Ingest is
near-free because search has no index to build. And virtualization is **one
word**: the Tracker's row template says `virtualize = auto` and that is the
entire windowing story in the file — no row heights, no scroll container, no
keys, no overscan tuning, no memoization discipline. The React app delegates
windowing to TanStack Virtual and still pays the dynamic-measurement plumbing at
every call site.

**React** — load and ingest at scale (52 ms vs ~70 ms at 10K; 861 ms vs ~1.4 s
at 1M), 1M scroll fidelity (see below), and the ecosystem itself: nine
problems answered by nine packages the agent did not have to design, each
carrying accessibility and edge-case behaviour it got for free.

Search is a tie: 30/35 ms against our 28.2/42.4, both far under the 50 ms bar.

## What the React arms taught us about our own platform

Three defects, none of which would have been found by building more apps in
Declare. The first two were surfaced by the discarded first arm; they are kept
here because the findings are real regardless of that arm's comparative value.

1. **Browsers saturate element layout at ~2²⁵ px, and we have the bug live.**
   The React agent hit it and engineered around it with a compressed scroll
   space. Ours: the virtual-extent strut clamps at 33,554,428 px, so at 1M rows
   the scrollbar reaches only row ~762,000 of 1,000,000. At 100K and below we
   are untouched (7.6M px). **FILED** as a kernel work item — extent
   compression + scroll mapping in the windowed reconciler. Still open.

2. **A measurement that could not see the thing it measured.** The scrub probe
   used throughout this project set `scrollTop` and awaited one
   `requestAnimationFrame` — but the scroll event, and therefore the reconcile,
   dispatch *after* that frame. It timed rAF latency. Frame-to-frame intervals
   across a sustained drag are the honest measure. Every scrub number in
   earlier QA rounds used the flawed probe and had to be re-taken.

3. **Springs silently disabled row recycling.** Once measured properly, a
   dragged scrollbar ran at ~8 fps (112 ms @10K, 127 ms @100K). Instrumenting
   the reconciler showed 45 reconciles per scroll step and 1,155 fresh
   instances where recycling should have re-pointed existing ones — 499 of 937
   candidate rows rejected as `subtreeDiverged`, the bit marking a row as
   user-touched and therefore unrecyclable. The toucher was the platform
   itself: a `Spring` drives its slot with a plain assignment (by design — an
   animator must displace any derive that would overwrite its rest value), and
   that write set the divergence bit. **Any spring inside a replicated row
   silently disabled recycling for that row** — and the Tracker had just gained
   one on every row for the in-place expansion. **FIXED**, two principled
   changes: `attributes.ts` treats an animator's write as a runtime derive
   rather than an author's touch (exempt from the divergence bit; `Animator`
   already was, only `Spring`'s raw assignment was not), and `replicate.ts`
   hands the k-th leaver to the k-th arriver instead of popping from the end,
   so a fully-missed window keeps every instance at its existing child index
   and re-links nothing — plus `Spring.resnap()`, so a recycled instance takes
   its new target outright rather than sliding from the departed record's
   geometry. Result: **8.3 ms/frame on a dragged thumb at 100K (from 126.8),
   9.4 ms at 10K (from 112)** — with the expansion animation intact (19
   distinct intermediate heights, 44 → 309 px).

## On the skeleton convergence

The two apps look structurally alike — toolbar over a list of rows, a
statistics panel, a status line — and that is **prescribed by the brief, not
independently discovered**. Noun 11 names the row's contents (status, priority,
title, labels, assignee, updated); Noun 13 names the three statistics; the
verbs imply a filter/sort/group control cluster; Nouns 12 and 14 ask for counts
and measured numbers to be visible. Any claim of "independent convergence on
the same design" would be false. What the brief did NOT prescribe — and where
the apps genuinely differ — is form: iconography, avatars, motion, the editor's
presentation, and the whole design system.

## Quoting these numbers in public

Everything below is measured, but not everything is equally durable. Anyone
folding this into the homepage or a talk should know which is which.

**Stable — safe to quote flat.** Byte sizes and dependency counts do not vary
between runs; they are properties of the two artifacts.

| | Declare | React |
|---|---:|---:|
| App code | **~1,125** lines, one file | 2,703 lines, 46 files |
| Runtime dependencies | **0** | 9 |
| Dev dependencies | **0** | 7 |
| Wire, gzipped | **85 KB** | 108 KB |
| Platform floor, gzipped | **48 KB** (hello world, whole platform) | 61.5 KB (react + react-dom + scheduler, before any app code) |

**Variable — quote with the protocol or not at all.** Timings move run to run
and with machine load: scrub 8.3 ms both sides at 100K; search 28.2/42.4 vs
30/35 ms at 100K; load 10K ~70 vs 52 ms; ingest 100K ~80 vs 76 ms; 1M ingest
~1.4 s vs 861 ms. React wins load and ingest. Search is a tie and both sides
sit far under the brief's 50 ms bar. Say so when citing them.

**The sharpest single fact**, and the one worth leading with: of React's
108 KB, its own app code is **12.2 KB** — *89% of what it ships is framework*.
Ours is 32 KB of 85 KB. The rest of their bundle is the nine packages a
disciplined engineer correctly reached for.

**Three framings that hold up:**

1. Half the code, zero dependencies, smaller wire — the three stable columns.
2. We are 13 KB under React's floor before either app writes a line.
3. Virtualization is **one word** — `virtualize = auto` on the row template is
   the Declare Tracker's entire windowing story — against TanStack Virtual plus
   dynamic-measurement plumbing at every call site, and that is React's
   *idiomatic* path. Arm 1 proved that hand-rolling it instead costs you the
   most fragile code in either repository. (Say "one word", never "zero": the
   default is full materialization, so scale is opted into, deliberately.)

**What must travel with any public claim:** one run of one agent per side; the
brief was functional only, with design unspecified; and the maturity asymmetry
runs both ways — the Declare app had many review rounds, the React agent had a
single session. Omitting these turns a measurement into a boast.

**Never cite arm 1's 60 KB.** It is a ceiling bought off the paved road, it was
withdrawn, and its source is no longer in the tree.

**On stamping.** The Declare side of this table can ride the homepage's
`<!--stat:key-->` mechanism (`apps/homepage/stats.json`, machine-stamped by
`tools/internal/stamp-stats.mjs`) so the numbers cannot rot — today that file
carries only `homepage.*` and `calendar.*` keys, so tracker keys would need
adding. **The React side cannot**: it is a frozen measurement of an archived
artifact, not something the build can re-derive. Quote it as dated —
*measured 2026-08-02* — and point at this directory.

## Caveats, honestly

- One run of one agent per side. Wire size and dependency counts are stable
  facts; LOC and timings would vary run to run.
- The maturity asymmetry runs BOTH ways: the Declare app had many review
  rounds (its design quality reflects that); the React agent had one session
  and self-verified its own 91 assertions, which we have not independently
  re-run one by one.
- **Its one stated shortfall, outside the guarantees:** at 1M, search costs
  ~199 ms/keystroke and re-sorting by title ~2.6 s. Guarantee 16 asks only that
  the app remain *usable* at 1M and Guarantee 17 pins latency to 100K, so this
  is not a failed guarantee. It declined to add incremental narrowing (~15
  lines, would take later keystrokes to near-zero) because that would stop
  measuring "a filter recompute over the full dataset", which is what the
  protocol asks for. Nothing in the brief was missed.
- Other qualified gaps on its side: no unit-test layer beneath the acceptance
  driver; the metrics strip is hand-rolled flexbox rather than a chart library
  (its reasoning: the community answers are 80–120 KB gz for fourteen bars in a
  64 px strip).
- LOC counts use the same rules on both sides (non-blank, non-comment; `cloc`
  for React, equivalent count for Declare). The 2,703 excludes its ported data
  generator (75 lines) and its unshipped measurement harness (805 lines).
