# Tracker — build brief

Build a production-quality issue tracker as a web application in **React**
(your choice of build tooling, libraries, and architecture — every
dependency is yours to justify in the report). This is a serious
engineering benchmark: the app will be measured for correctness against
the acceptance scenarios below, and for size, weight, and speed under the
attached protocol.

## The product

"Tracker" triages a large issue backlog. An issue has: `id` (number),
`title`, `description` (0–3 sentences, may be empty), `status` (one of
`open`, `in-progress`, `blocked`, `closed`), `priority` (`P0` urgent …
`P3` low), `labels` (0–5 short strings), `assignee` (a first name, or
null), `created` / `updated` (epoch ms), `closedAt` (epoch ms or null),
`comments` (a count). The dataset ships as `issues.json` (10,000 issues),
regenerable at other scales with `gen-issues.mjs` (seeded — identical
data every run). Load it over HTTP at boot; no backend beyond static
serving.

The spec below is deliberately split: **verbs** (what the user can do),
**nouns** (what the user can see), and **guarantees** (what must hold).
Everything else — layout, arrangement, iconography, styling, motion
design — is yours. Aim for clean, professional, commercial-grade UI, but
do not gold-plate: function is the comparison axis.

## The code is a deliverable, not just the app

**The source will be read and judged as a work sample.** Write idiomatic,
maintainable React that a senior React reviewer would call exemplary:
standard ecosystem choices where they exist, no hand-rolled
infrastructure where a well-regarded library is the community answer,
code-review clean. If you deviate from an ecosystem default — including
building something yourself that a popular library already does — say so
in the report and justify it.

This is a real constraint, not a preamble. A faster app made of clever,
fragile, hard-to-maintain code is a WORSE answer here than a slightly
slower one a team could own. If a guarantee below turns out to be
unreachable on the idiomatic path, that is a legitimate and valuable
finding: implement the best idiomatic version you can, MEASURE the
shortfall honestly, and report it as a shortfall. Do not go off-road to
hit a number.

## Verbs

1. **Search as you type** — the query narrows the visible list (matching
   title, description, labels, assignee; case-insensitive substring is
   sufficient). Clearing restores. Esc clears an active search.
2. **Filter** by status, by assignee, by label — combinable with search
   and each other.
3. **Sort** by updated / priority / title, with a separate direction
   toggle.
4. **Group by status** — on/off; groups have headers with per-group
   counts and collapse/expand individually.
5. **Open an issue for editing IN PLACE, inside the scrolling list** —
   the issue's row expands to hold the editor; the list stays smooth
   while row heights change. Editing uses **draft semantics**: changes
   stage into a working copy; **Save commits and closes; Cancel (and
   Esc) discards and closes**. No autosave, real or pretended. Opening a
   different row closes the current one.
6. **Create** an issue (appears per current sort; selected after
   creation).
7. **Delete** (single or bulk) with a **timed undo** (several seconds);
   undo restores the exact records.
8. **Multi-select** (click modifiers and/or checkboxes — your choice)
   with bulk actions: at minimum set-status and delete. A multi-selection
   and an open editor are mutually exclusive.
9. **Scale control** — 10K / 100K / 1M: regenerates the dataset in
   memory at that size (port of the generator logic, or bundle it).
10. **Keyboard**, minimum: focus search (⌘K or /), open the selected
    row (Enter), delete the selection (Delete/Backspace, never while
    typing in a field), Esc closes/clears by layer.

## Nouns

11. Every list row shows: status, priority, title, labels, assignee
    identity, last-updated — in whatever form you design.
12. Always visible somewhere: total issue count and currently-shown
    count.
13. Live statistics, updating immediately on any mutation or filter
    change: per-status counts; per-assignee count of OPEN work (closed
    excluded), including unassigned; issues closed per day over the last
    14 days of dataset time (derive "today" from the dataset's newest
    `updated` — the data is synthetic and has no relation to the wall
    clock).
14. The app's own measured performance: initial data load (fetch+parse)
    ms, data-ingest ms, and last-search ms — displayed quietly in the UI.
    Measured, never hardcoded.
15. Distinct empty states: "nothing matches" (with a one-step clear)
    vs. "no issues exist".

## Guarantees

16. **Scale**: the full list scrolls smoothly (target 60fps) at 100K
    rows, including fast scrollbar drags to arbitrary positions; the app
    remains usable at 1M.
17. **Search latency**: under ~50ms per keystroke at 100K on a modern
    laptop.
18. **Selection identity**: selection survives sort flips, filter
    changes, and scrolling; it means records, not list positions.
19. **Derivation honesty**: every displayed statistic recomputes from
    the data on every change; no stat may be stale or hand-maintained.
20. **Appearance**: light and dark, correct in both, switchable
    (light / system / dark), defaulting to the system preference.
21. **Responsive**: usable and uncrowded from 400px phone width to
    2500px ultrawide.

## Acceptance scenarios

A run of the app passes if, driven through the UI:

- S1 Boot at 10K: totals correct, list renders, stats agree with data.
- S2 Type a query: list narrows live; count updates; clearing restores.
- S3 Combine a status filter + assignee filter + query: counts and rows
  agree; one-step clear exists (empty state path).
- S4 Sort by each field; toggle direction; rows re-order correctly.
- S5 Group on: correct per-group counts; collapse hides a group's rows;
  a bulk status change MOVES rows between groups and both counts update.
- S6 Open a row in place: the row expands smoothly; rows below shift;
  the list scrolls normally while open.
- S7 Edit title/status/priority/assignee/labels/description in the
  editor; Cancel: no data changed. Re-open, edit, Save: data changed,
  list and stats reflect it immediately.
- S8 Create: issue appears per current sort, selected.
- S9 Select 5 rows, bulk set status: all 5 move; stats update; select 5,
  delete, undo: records return exactly.
- S10 Deep-scroll at 100K via scrollbar drag: no blank frames at rest,
  correct rows at every stop.
- S11 Selection: select rows, flip sort twice, change a filter — the
  same records remain selected.
- S12 Scale to 100K and to 1M: the app remains responsive; measured
  numbers update.
- S13 Keyboard: ⌘K/-slash focuses search; Enter opens; Delete deletes
  selection (but never while typing); Esc walks back by layer.
- S14 Dark mode: all surfaces legible; toggle all three modes.
- S15 400px width: all verbs reachable; nothing overlaps.

## Deliverables

- A runnable project in this directory (dev server + **production
  build**). Include everything needed to `npm install && npm run build`.
- `REPORT.md` with, measured by you:
  - LOC via `npx cloc src/` (or equivalent, stated) — split app code vs
    generated/config;
  - direct dependency list with one-line justification each;
  - production bundle sizes, raw and gzipped;
  - the PROTOCOL.md measurements at 10K and 100K;
  - which scenarios S1–S15 you verified, and how;
  - honest notes: what was hard, what you'd need more time for;
  - **the idiomatic-path report**: which libraries you chose and why;
    every place you deviated from an ecosystem default, with the
    justification; and any guarantee the idiomatic path could not meet,
    with the measured shortfall stated plainly.

You have full authority to iterate: run the app, drive it with the
headless browser (see PROTOCOL.md), find your own failures, fix them,
re-measure. Prefer a correct, verified subset over an unverified whole —
but the scenarios above are the bar.
