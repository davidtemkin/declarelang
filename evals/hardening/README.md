# Hardening — shaking the platform out, layer by layer

Evals keep finding platform bugs at a steady rate: about 2.5 per craft run since October
2026, almost all of them fixed as found, and new ones in every run. The craft runs find them
one at a time and expensively. A hardening round looks for them directly: the platform's
docs and its code, one layer at a time from the bottom of the stack up, with a fixed budget
and a rule for when to stop.

This directory is the record of each round: the process, the exact briefs the agents were
given, the scripts, and what each stage found. Keeping it means a later round, above all a
re-run of the docs cross-check after the docs or the runtime have moved, can be run the
same way and its results compared with these.

```
README.md                  this file: the process, and the log of rounds
explore.mjs                the explorer: random real input, checks after every step
stage0/                    the inventory of what evals found
  brief-reports.md         the brief given to each report reader (one per group of reports)
  brief-commits.md         the brief given to the commit reader
  inventory.jsonl          one line per problem found in a report, classified, with status
  commits.jsonl            one line per defect fix since 2026-10-01
  summary.md               the totals, the rates over time, where the bugs are
small-fixes.md             what stage 0 left open, and what was done about each item
layers/<n>-<name>/         one per stage 1 layer: its claims, its checks, what they found
```

## The process

**Principles.**

- **Checks a program can run come first.** An invariant or a comparison costs machine
  time, not tokens. Agents' tokens go to reading docs, writing checks, and triage.
- **The strongest oracles first.** A crash, a stale value, a disagreement with the reference
  needs no one's judgement. What needs a design decision is collected and put to the
  person deciding, in batches, with the concrete code.
- **A budget and a stopping rule for every stage**, fixed before it starts. A layer stops
  when a full pass finds nothing new, or its budget runs out. Each stage reports tokens,
  confirmed bugs, docs fixed, and false reports, and the next stage starts only on a
  decision.
- **Behaviour before prose.** No docs sentence is written from an agent's account or a
  report; the behaviour is established by a small program first. Accounts misread the
  platform often (stage 0: 71 of 527 problems were not bugs at all).

**Stage 0 — inventory.** Read every eval report and every fix commit in the window;
classify each problem (platform bug, docs wrong, tool gap, design limit, not a bug) and
establish its status today (fixed, changed, still present, unknown) from commits, source,
or a small program. Merge duplicates across runs. The output aims stage 1 and gives the
baseline: platform bugs per run.

**Small fixes.** What stage 0 found still open and small is fixed before stage 1, each
item's behaviour established by experiment first; what needs a ruling is listed for it.

**Stage 1 — layer by layer, bottom up.** Each layer is fixed before the next is examined,
so a higher layer is never triaged on a shaky base:

| # | Layer | declare.md | Guide | Reference and declare-help |
|---|---|---|---|---|
| 1 | Reactive core and data | §1, §3, §5, §7 | 02, 03, 04, 14, 15, 16 | Node, Dataset, DataSource, Socket, EventStream, Stream, State |
| 2 | Layout and text | §6, §9 (text) | 06, 12, 17, 23 | View geometry, Layout, SimpleLayout, WrappingLayout, TweenLayout, Text, RichText, Font |
| 3 | Rendering | §9 (paint) | 11, 24 | View paint and draw, DrawContext, themes |
| 4 | Scrolling | §6 (scrolling) | 07 | View and App scroll members |
| 5 | Input | §8 | 09, 10 | View events, PointerEvent |
| 6 | Focus and keyboard | §8 | 09, 19 | Focus, Keys, View focus members |
| 7 | Forms and text fields | §7 (forms) | 08 | Form, Field, TextInput, NativeText |
| 8 | Library controls | §11 | 08, 18 | each library class |
| 9 | Motion and time | §10 | 21, 22 | Spring, Animator, Time |
| — | The rest | §12 | 20, 25–31 | one pass at the end |

Each layer does the same six things:

1. **Read** everything the system says about the layer: its declare.md sections, its
   guide chapters, its reference entries (`tools/internal/doc/prose/`, the library
   classes' headers), and what `declare-help` answers for its classes.
2. **Extract every testable claim** into a check: a small program and what it should do.
3. **Compare the surfaces with each other.** Where declare.md, the guide, the reference and
   declare-help describe one behaviour differently, one is wrong before anything runs.
4. **Run the checks**, then the explorer over the corpus with the layer's invariants.
5. **Triage**: a platform bug is fixed before moving up; docs that disagree with a correct
   runtime are corrected (`tools/internal/doc/prose/STYLE.md`); a design question is
   collected for a ruling.
6. **Report**: tokens, bugs confirmed, docs fixed, false reports, continue or stop.

The layer's claims and checks are kept in `layers/<n>-<name>/`, so a re-run reads the same
docs afresh, extracts the claims again, and diffs both the claims and the results against
these.

## The explorer

`explore.mjs` is an assert script for `declare-verify --assert`. It presses random controls
on screen (buttons, tabs, checkboxes, options, fields, sliders, sometimes Escape), seeded,
and after each step asks the running program for its invariants. Today: constraints whose
fresh answer disagrees with what their slot holds (`__declare.stale()`), and any page
error. Each layer adds its own.

```
STALE_STEPS=60 STALE_SEED=1 npx declare-verify apps/todo/todo.declare --assert evals/hardening/explore.mjs
```

It reaches only what has an accessible role: a canvas game or a demo with no controls gets
no steps, and is said to.

## Rounds

| Round | Dates | Stages | Tokens | Found |
|---|---|---|---|---|
| 1 | 2026-11-09 – | 0, small fixes; stage 1 in progress | stage 0: ~1.3M | see `stage0/summary.md`, `small-fixes.md` |
