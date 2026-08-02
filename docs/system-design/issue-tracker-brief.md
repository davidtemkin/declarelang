# Tracker — the capstone brief (D1)

> **Status: ruled 2026-07-30 (David: issue tracker, in-memory loaded-once, no
> persistence layer, search required).** This is the requirements oracle for
> the data project ([data-project-plan.md](data-project-plan.md)): every
> substrate decision downstream gets tested against "does Tracker need it?".
> It is a brief in the intake sense — ends and constraints, not means; the
> implementing session derives data → states → views from here.

## 1. What it is

An issue tracker good enough to triage with: a large flat list of issues,
searched, filtered, sorted, grouped; a detail panel; create, edit, delete,
bulk operations. The whole dataset lives in memory, loaded once — **no
persistence layer, no server search, no wire paging** (ruled; the write
story is proven in-session, and materialization.md §7 keeps remote paging
out of scope). Because it needs no backend, Tracker must remain
**static-hostable**: it ships as a live doc-site exemplar, boots anywhere,
and survives the crawl/extract story like the calendar does.

The deeper purpose: Tracker is the public proof the field evidence says wins
trust ([materialization-field-sentiment.md](materialization-field-sentiment.md))
— a six-figure row count behind a plainly-written declaration, where
everything mundane behaves exactly as if fully materialized, and the source
contains **zero virtualization vocabulary**.

## 2. Data

- **Shape**: issues with `id`, `title`, `description` (length varying from
  empty to several paragraphs — this drives mixed-height rows), `status`
  (open / in-progress / blocked / closed), `priority`, `labels` (0–5 of ~30),
  `assignee` (~50 people, some issues unassigned), `created`/`updated`
  timestamps, `comments` count. **Deliberately ragged**: a few percent of
  records missing optional fields, odd unicode in titles, the occasional
  absurdly long unbroken token — the data you actually get.
- **Scale, two-tier**: the shipped asset is **~10,000 issues** (a few hundred
  KB gzipped — snappy as an embedded doc example); an in-app control
  regenerates at **100k or 1M** from a seeded deterministic generator
  (reproducible benches without shipping megabytes). 10k must feel instant;
  100k is the invisibility proof; 1M is the bench ceiling.
- **Arrival**: one `DataSource` fetch of the served JSON; the entry screen
  derives from `.loading`/`.loaded`; the cold-load parse-to-first-paint at
  each tier is a measured budget, not a hope.
- **Identity**: records carry `id`, but the app must NOT need to say so —
  key-free replication (materialization.md §4) is part of what Tracker
  proves. If a `schema` is declared, it is for validation and static `:path`
  checking, not busywork.

## 3. The experience

**Triage screen** — the list, master side: virtualized (invisibly), rows of
genuinely mixed height (title + wrapping labels + optional description
preview), grouped-by-status as a switchable view (group headers = non-uniform
extents, the stretch case for the extent model). Sort by updated / priority /
title. Filter chips: status, assignee, label — composable, live counts.

**Table view — the datagrid, in the capstone (ruled 2026-07-30).** A
switchable presentation of the same list: columns (status, priority, title,
assignee, labels, updated), sortable by header click, **columns draggable to
reorder** and edge-draggable to resize — the datagrid header drag is one of
the two forcing cases for the axis-scoped drag-claim primitive (D8), and it
must work on touch: dragging a column claims the x-axis without stealing the
page's vertical pan. Same virtualization, same selection, same records —
the view is presentation, the data is the truth.

**Search — required, and first-class.** An omnibox (⌘K focuses it) searching
the in-memory set as you type: title, description, labels, assignee. It is a
*derived selection over the data* — never a server call, never a scan of
rendered rows (the observer-boundary doctrine: the search surface for data is
the data). Results: live count; Enter jumps the list to the first hit —
which may be thousands of rows away and unmaterialized, so this is
**navigate-to-logical-record exercised for real** (materialization.md §3.5);
n/p (or ↑↓ in the box) cycle hits; hit rows highlight. Typing must never
jank: the derive over 100k rows is frame-budgeted and measured.

**Detail panel** — selection-driven master-detail: the selected issue's full
record, editable fields (title, description, status, priority, labels,
assignee) through the editor session (`<->`, commit semantics — a working
copy committed on save, not autosave, so cancel is honest). Edits reflect
everywhere instantly: the list row, the counts, the group membership (a
status edit MOVES the issue between groups — reconcile, not rebuild).

**Mutation** — create (a new-issue form; lands at the top of its sort),
delete (with confirm; **single-level undo of a delete is in scope** — it
resurrects the record and, per the identity story, everything that pointed
at it), bulk operations over a multi-selection (set status, add label,
delete). All through the dataset mutation surface — the app writes data and
the UI follows; no view-side bookkeeping anywhere.

**Selection** — single click selects; ⌘-click toggles; shift-click extends a
range; arrows move it; it is **record-anchored**: it survives scrolling out
of the window and back, sort flips, filter changes (a selected row filtered
out stays selected-but-hidden or is dropped — the selection design doc D6
rules which; Tracker takes the ruling).

**Keyboard, end to end**: full triage without a pointer — navigate, open,
edit, commit, search, bulk-select. And the windowed list must be honest to
assistive tech: logical position and count exposed, traversal materializing
rows on demand (the ruled AT requirement).

## 4. The not-edge-cases (acceptance criteria)

Each of these is a named, demonstrable scenario — the "edge cases that
aren't": every one is Tuesday in a real tracker, and every one is a
documented failure class somewhere else
([materialization-field-sentiment.md](materialization-field-sentiment.md)).

1. **Mixed-height scroll, both directions, fast** — no jump, no jitter, no
   scrollbar oscillation, at 100k.
2. **Insert at top while scrolled deep** — a created issue (or 50, via the
   generator) prepends without yanking the viewport.
3. **Edit an unmaterialized row** — change status from the detail panel while
   its row is scrolled far away; scroll back; the row is right.
4. **Filter narrows under you** — scrolled deep, apply a filter that shrinks
   10k rows to 40: position lands somewhere sane and stated, never NaN-land.
5. **Sort flip with selection held** — the same records stay selected;
   the viewport follows the primary selection.
6. **Search-jump to a distant record** — Enter on a hit 80k rows away lands
   on a materialized, highlighted, selected row.
7. **Bulk status change on a cross-window selection** — 200 selected rows,
   30 materialized; all 200 move groups correctly.
8. **Undo a delete** — the record returns; selection, group counts, and any
   detail panel pointing at it recover.
9. **Ragged data renders** — missing assignee, empty description, the
   500-char token: layouts hold, defaults apply, nothing throws.
10. **Keyboard-only full pass** and **screen-reader pass over the windowed
    list** — the AT hears "row N of 100,000".
11. **Cold loads within budget** — measured parse-to-interactive at
    10k / 100k / 1M, published in the app (a stats corner, like the
    homepage's).
12. **The differ passes** — the same interaction script with virtualization
    forced off (10k tier) produces identical observable state.
13. **Column drag on touch** — reordering a table column on a touch device
    claims the horizontal drag and never steals the vertical pan; resize
    likewise (the axis-scoped claim, proven where it was designed for).

## 5. UX bar (extended by David, 2026-07-30)

Exemplar-grade, not demo-grade — and specifically:

- **The header treatment Declare Viewer and the Calendar share** — Tracker
  joins the family of flagship apps and must read as one of them: the same
  app-chrome header conventions (brand rendition, controls placement),
  adapted, not reinvented.
- **Light / dark mode** on the existing theme system, both first-class.
- **Responsive design — emphatically.** Narrow-window behavior is designed,
  not endured: list-only with push-in detail on narrow; the table view
  degrades deliberately (column priority, not squish); the header adapts.
- **Keyboard-navigable via tabbing** as the baseline: the Tab order
  traverses every control and into the grid through the standard traversal
  protocol (`tabOrder`, the focus ring), with the triage keys (⌘K, arrows,
  Enter, Esc) layered on top. Focus is always visible and never trapped.
- 60fps scroll on device (sim-rig verified); animation where it earns its
  place (group collapse, detail slide, undo toast).

It should read as "someone would use this," because the claim it defends is
that the *language* reaches this quality without contortion.

## 6. Substrate coverage map

| Tracker element | proves |
|---|---|
| the list at 100k | invisible materialization, extent model, recycling |
| grouped view | non-uniform extents |
| search + Enter-to-hit | derived selection; navigate-to-logical-record |
| filter chips / sort | JSONPath selections (slice/filter), reactive membership (§9) |
| key-free rows | key retirement (§4), identity from the data layer |
| detail edit + commit | `<->`, editor session, Pointer writes |
| create/delete/undo/bulk | mutation authoring surface (D7) |
| selection everywhere | the D6 selection model, record-anchored |
| the table view's draggable/resizable columns | the axis-scoped drag claim (D8), on touch |
| AT + keyboard | the ruled accessibility requirements |
| stats corner | the measured-claims culture |

## 7. Out of scope (ruled)

Persistence, server search, wire paging, auth, multi-user. A `Socket`
live-feed ("issues arriving from elsewhere") is a **post-capstone flourish**,
noted only because insert-under-scroll (criterion 2) already builds the
machinery it would ride.

## 8. Verification

The acceptance criteria above are the test plan: each becomes a scripted
scenario (the semantic differ + browser tier), the budgets in criterion 11
are measured in CI like the homepage's stats, the sim rig covers touch
scroll feel, and the perceptual tier pins the visual design. Tracker ships
with its guide/docs treatment in the same increment — the docs-with-the-
feature discipline the streams arc set.
