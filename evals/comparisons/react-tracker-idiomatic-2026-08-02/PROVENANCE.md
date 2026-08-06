# React control arm 2 — the IDIOMATIC arm (2026-08-01)

Rescued from `/private/tmp/tracker-react-std/` on 2026-08-02, where it had
been left after the run and was never archived. `node_modules/` and the 3 MB
`issues.json` fixture are excluded; `gen-issues.mjs` regenerates the fixture
and `package-lock.json` pins the exact dependency versions that produced every
number below.

## What this is

The second React control arm for the Tracker comparison. **Arm 1 was not
retained** (ruling, 2026-08-06): it hand-rolled its own store, virtualizer and
infrastructure, so it benchmarks one agent's cleverness rather than React and
its ecosystem — the numbers below and the notes in this file are what survives
of it, and they are the useful part.

Both arms got the **same functional brief** (verbs / nouns / guarantees,
S1–S15), the same dataset, the same measurement protocol, the same machine,
and a clean room with no access to Declare. Arm 2's brief adds exactly one
section — *"The code is a deliverable, not just the app"* — requiring
idiomatic, code-review-clean React with standard ecosystem libraries and no
hand-rolled infrastructure where the community has an answer. Everything else
is byte-identical, so the arms are directly comparable.

**Why arm 2 exists.** Arm 1, told the guarantees up front, left the paved road
entirely — no state manager, no virtualization library, a hand-built
virtualizer that arm 1's own archive calls "the cleverest and most fragile
code in either repository." That bounds a performance *ceiling*, not the cost
of the normal path. Arm 2 is the matched experiment: what does this app cost
in practice?

## The result

| | Declare | Arm 1 (hand-rolled) | **Arm 2 (idiomatic)** |
|---|---:|---:|---:|
| Wire, gzipped | **~98 KB** | 60 KB | **108 KB** |
| Runtime dependencies | 0 | 2 | 9 |
| App code (LOC) | **~1,125** | 1,482 | 2,703 (1,602 TS + 1,176 CSS) |
| Scrub @100K (frame-to-frame) | 8.3 ms | 8.3 ms | 8.3 ms |
| Search @100K, median / max | 28 / 42 ms | 6.8 / 27 ms | 30 / 35 ms |
| Ingest @100K | ~80 ms | 56 ms | 76 ms |
| Acceptance | 15 criteria green | 118 assertions | 91/91 checks |

**On the paved road, React ships more than Declare and takes 2.4× the code to
do it.** Arm 1's 60 KB was bought with cleverness; it is a ceiling, not a cost.

Nothing in the brief was missed. The one shortfall arm 2 states plainly is
outside the guarantees: at 1M, search costs ~199 ms/keystroke and re-sorting
by title ~2.6 s.

## The floor comparison

Arm 2's own bundle composition, per-package gzip:

```
react-dom  56.5   app code 12.2   react-hook-form 10.4   sonner 9.6
virtual-core 6.7  react 3.3       react-hotkeys-hook 2.5 lucide 2.2
scheduler 1.7     zustand 1.6     react-virtual 1.0      clsx 0.2
```

**React's platform floor is 61.5 KB gz** (react + react-dom + scheduler)
before a line of app code. Declare's measured floor is **48 KB gz** — a
hello-world production build, whole platform included. We are 13 KB under
React's floor. Arm 2's own app code is 12.2 KB gz of its 108.

## Reproducing

```
npm install
node gen-issues.mjs 10000 > issues.json   # the fixture, regenerated
npm run build
npm run preview                            # http://localhost:5175
node scripts/acceptance.mjs                # S1–S15 → 91/91
node probe.mjs                             # PROTOCOL.md numbers at 10K/100K/1M
```

`REPORT.md` is the agent's own report: stack choices, every deviation from an
ecosystem default with its justification, the guarantee-by-guarantee table,
and its honest gaps.

## Caveats

One run of one agent per side. Wire size and dependency counts are stable
facts; LOC and timings would vary run to run. The maturity asymmetry runs both
ways — the Declare app had many review rounds; arm 2 was a single session and
self-verified its own 91 assertions, which have not been independently re-run.
