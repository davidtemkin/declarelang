# Tracker — build report

React 18 + Vite. Everything below was measured by me on this machine,
headless Chrome at `/Applications/Google Chrome.app/...`, viewport
1560×950 @2x, against the **production build** served by `vite preview`
on port 5174 (5173 is the dev server; 8200 untouched).

```
npm install
npm run build      # -> dist/
npm run preview    # production build on :5174
npm run dev        # dev server on :5173
```

---

## 1. Lines of code

`npx cloc src/` (cloc 2.06):

| Language | files | blank | comment | code |
|---|---:|---:|---:|---:|
| JSX | 7 | 49 | 28 | 690 |
| JavaScript | 3 | 39 | 53 | 588 |
| CSS | 1 | 14 | 14 | 281 |
| **SUM** | **11** | **102** | **95** | **1559** |

Per file:

| File | code | what it is |
|---|---:|---|
| `src/store.js` | 499 | data model, sort-order caches, filter/derivation, mutations, undo |
| `src/styles.css` | 281 | theme tokens + all layout |
| `src/List.jsx` | 211 | the virtualizer (offsets, windowing, expansion animation) |
| `src/App.jsx` | 154 | shell, keyboard layer, selection bar, toasts, dialogs, footer |
| `src/Editor.jsx` | 93 | draft-semantics issue form (inline + create dialog) |
| `src/Toolbar.jsx` | 81 | search, filters, sort, group, scale, theme |
| `src/Row.jsx` | 80 | list row + group header |
| `src/gen.js` | 77 | port of `gen-issues.mjs` |
| `src/Sidebar.jsx` | 65 | live statistics |
| `src/hooks.js` | 12 | store subscription hook + re-exports |
| `src/main.jsx` | 6 | entry |

Split as the brief asks:

- **App code: 1482** (everything above except `gen.js`).
- **Ported generator: 77** (`src/gen.js` — transcription of the supplied
  `gen-issues.mjs`, chunked with `await`s so 1M rows generate without
  freezing the UI; same seeds, same draw order, verified equal to
  `issues.json` in S12).
- **Config: 40** (`vite.config.js` 7, `index.html` 13, `package.json` 20).
- **Measurement harness: 869**, not shipped (`probe.mjs`, `measure.mjs`,
  `scenarios.mjs`). Counted separately because it is test code, but it is
  the evidence for section 5.

---

## 2. Dependencies

**Direct dependencies: 2. Direct devDependencies: 3.**
`du -sh node_modules` → **86M** (114 packages transitively, dominated by
Vite's toolchain and `puppeteer-core`).

### dependencies (2)

| Package | Why |
|---|---|
| `react` | The brief mandates React. |
| `react-dom` | Required to render React to the DOM; `flushSync` keeps the virtualizer's scroll update in the same frame as the scroll event. |

### devDependencies (3)

| Package | Why |
|---|---|
| `vite` | Build tool and dev server: fast HMR, ~370ms production build, zero-config ES-module output. |
| `@vitejs/plugin-react` | JSX transform + Fast Refresh for Vite. |
| `puppeteer-core` | Required by PROTOCOL.md to drive the supplied Chrome. `-core` so it does **not** download a second Chromium. |

### Deliberately not used

No state manager (Redux/Zustand/Jotai): the store is one module with
`useSyncExternalStore`, which is what those libraries wrap. No virtual-list
library (`react-window`, `@tanstack/virtual`): none handle a 40M-px virtual
space, mid-list variable-height expansion, and group headers at once — see
§6. No UI kit, no date library (`Intl`/`Date` suffice), no CSS framework
(281 hand-written lines with custom properties).

---

## 3. Production bundle

`npm run build`; sizes from `wc -c` and `gzip -c -9 | wc -c`:

| Asset | raw | gzipped |
|---|---:|---:|
| `dist/assets/index-*.js` | 173,213 B (169.2 KB) | 56,396 B (55.1 KB) |
| `dist/assets/index-*.css` | 10,876 B (10.6 KB) | 2,956 B (2.9 KB) |
| `dist/index.html` | 703 B | 454 B |
| **Total** | **184,792 B (180.5 KB)** | **59,806 B (58.4 KB)** |

React + react-dom are ~137 KB raw / ~44 KB gz of the JS; the application
itself is roughly **36 KB raw / 12 KB gz**. `dist/` also contains
`issues.json` (3.07 MB), fetched at boot, not part of the bundle.

---

## 4. PROTOCOL.md measurements

Median of 5 fresh browser sessions against the production build.
Reproduce with `node measure.mjs http://localhost:5174 5`; raw JSON of the
reported run is in `final-measure.json`.

| | 10K | 100K |
|---|---:|---:|
| **load ms** (fetch + parse `issues.json`) | **45.7** | n/a (100K is generated in memory, not fetched) |
| **ingest ms** (parsed → model ready) | **9.1** | **56.1** |
| **search ms** — median keystroke | **0.6** | **6.8** |
| **search ms** — p90 keystroke | 1.6 | 17.7 |
| **search ms** — worst keystroke observed | 2.8 | **27.2** |
| **search ms** — worst *first* keystroke (cold, full pass) | 1.6 | 13.0 |
| **scrub median** (30 teleports, one frame each) | **8.3** | **8.3** |
| **scrub p90** | 8.9 | **8.8** |

At **1M** (same build, same machine): ingest **627 ms**, scrub median
**8.3 ms** / p90 **8.9 ms**, JS heap ~**681 MB**, search 150–260 ms for
1–2-character queries falling to 6–30 ms from the third character on.

### Boundaries I measured

- **load ms**: `performance.now()` around `await fetch("issues.json")` and
  `await res.json()` together, exactly as the protocol defines
  (`src/store.js`, `boot()`).
- **ingest ms**: parsed objects in hand → model ready to render: search
  haystacks built and flattened, assignee/label option lists derived,
  dataset horizon computed, active sort order built, and the first full
  filter/group/stats derivation completed. It stops immediately before
  `notify()` dispatches the first render.
- **search ms**: the filter derivation only — the loop that walks the sort
  order producing the visible index array, plus the regroup and stats
  recompute that follow it. React rendering is **not** included (the
  protocol says "the derivation itself, not the render"). Shown live in the
  footer, always measured, never hardcoded.
- **scrub**: the protocol's probe verbatim (`probe.mjs`), scroll container
  `.list`, 30 teleports, `median = sorted[15]`, `p90 = sorted[27]`.

### Guarantee check

- *Search under ~50ms at 100K*: worst single keystroke across 5 sessions ×
  4 words = **27.2 ms**; median 6.8 ms. PASS
- *Smooth scrolling at 100K including scrollbar teleports*: scrub median
  8.3 ms, p90 8.8 ms — inside one 16.7 ms frame at the 90th percentile. PASS
- *Usable at 1M*: yes for scrolling, filtering, sorting and editing;
  qualified honestly in §7. PASS with caveats.

---

## 5. Scenario verification

`node scenarios.mjs http://localhost:5174` drives the **production build**
through real mouse clicks, real `page.keyboard` events, real viewport
changes and real `<select>` interactions, asserting against both the DOM
and the model. Final run: **118 assertions, 118 passed, 0 failed**, no page
errors.

| | Result | How it was verified |
|---|---|---|
| **S1** | PASS (8) | Totals; independently recomputed per-status and per-assignee open counts from a second `fetch` of `issues.json` and compared to the app's stats (exact: open 4020 / in-progress 2536 / blocked 996 / closed 2448); footer text; load and ingest both non-zero. |
| **S2** | PASS (5) | Typed a query; compared the narrowed count against a brute-force scan of all 10K records (equal); footer count updated; search ms populated; clearing restored 10,000. |
| **S3** | PASS (8) | status=open + assignee=Ada + "login": count matched an independent triple-predicate scan; every rendered row checked in the DOM for assignee=Ada. Drove to zero matches: "Nothing matches" with a one-click clear that restored everything. Also verified the *other* empty state by deleting all 10,000 records: "No issues exist" with a create action, then undo restored all 10,000. |
| **S4** | PASS (6) | Sorted by updated / priority / title and toggled direction on each; scanned the whole visible order for inversions against record values — 0 inversions in all 6 combinations. |
| **S5** | PASS (10) | Group counts sum to shown; each group's count equals a recount of its members; headers show counts; collapsing removed exactly that group's row count from the flat list and rendered none of its rows; a bulk status change on 5 rows moved them out of `open` (−5) into `blocked` (+5) with both group counts and the stats panel updating. |
| **S6** | PASS (9) | Double-clicked a row: sampled `.editrow` height on 14 consecutive animation frames, required ≥3 distinct intermediate heights (it animates, it does not jump); confirmed the editor is inside `.list`; rows below measurably shifted down; scrolled 900px with the editor open and it stayed open with rows still rendering; opening another row closed the first (exactly one `.editor` in the DOM); Esc closed it. |
| **S7** | PASS (13) | Edited title and status, then asserted the *record* was untouched mid-draft; Cancel → record byte-identical to a pre-edit deep copy. Re-opened, edited all six fields, Save → each field committed, `closedAt` set on the move to closed, editor closed, closed-count incremented by exactly 1, edited title present in the list. |
| **S8** | PASS (4) | Created via the dialog: total +1, the new issue is the sole selection, present in the visible list, at position 0 under the active sort (updated desc) — placed per the sort, not appended. |
| **S9** | PASS (10) | Selected 5, bulk set-status: all 5 records moved, stat rose by exactly the number that actually changed. Deep-copied the 5 records, deleted them (total −5, absent from the list, undo toast present), undid, compared restored records to the copies — exact. Also confirmed the undo expires on its own after its window. |
| **S10** | PASS (3) | At 100K, 12 scrollbar teleports across the range; at each stop rows are exactly 40px apart on screen (no gaps/overlaps), rendered titles form a contiguous slice of the model's visible order at the index the scroll position implies, and the rendered band fully covers the viewport (no blank frames at rest). 374 rendered rows checked. |
| **S11** | PASS (4) | Selected 5 records, switched sort field, flipped direction, switched field again, applied a status filter, then scrolled — the selected id set was identical at every step. |
| **S12** | PASS (11) | Scaled to 100K and 1M through the UI; totals correct; ingest re-measured; list still renders; search works and is <50ms at 100K; worst scroll frame at 1M <50ms; **and** the in-app generator's output was compared against `issues.json` for the shared 10K prefix (every 7th record, all fields) — identical, so the port is faithful. |
| **S13** | PASS (13) | Real key events: `/` focuses search, Esc blurs it, ⌘K focuses it; typing "abc" then Backspace/Delete edited the query and deleted **nothing**; Esc cleared the query; click then Enter opened that row; Esc closed the editor while keeping the selection; a second Esc cleared the selection; Delete on a selection deleted it, and that delete was undoable. |
| **S14** | PASS (7) | All three modes (light / system / dark) applied; computed WCAG contrast of row text against row background ≥4.5:1 in each; dark background luminance verified genuinely dark. Screenshot: `shot-dark.png`. |
| **S15** | PASS (7) | At 400×780: no horizontal page overflow, all 11 primary controls present, sized and inside the viewport, zero overlapping toolbar controls, rows fit; the inline editor opens and fits; the stats drawer opens fully on-screen. Also checked 2500px ultrawide (no overflow). Screenshots: `shot-mobile.png`, `shot-mobile-edit.png`, `shot-400.png`, `shot-wide.png`. |

---

## 6. Architecture, briefly

**Store** (`src/store.js`). One module, `useSyncExternalStore`. Every action
recomputes derived state eagerly then notifies, so no displayed statistic
can be stale — stats panel, counts and group headers all read from one
derivation produced by one function.

**Sort orders are cached, not recomputed per keystroke.** Each sort key owns
an index array; searching is a single predicate pass over the pre-sorted
order, so filtering never sorts. Mutations splice the affected index out of
and back into each cached order by binary search.

The typed-array sort needed a caveat I got wrong once and fixed: a Float64
packed key cannot hold a millisecond timestamp *and* a 21-bit index in 53
mantissa bits, so the packed key is coarsened (to seconds) and a second pass
re-sorts each tie run with the exact comparator. Without it the "updated"
order was wrong for records sharing a second — caught by S4.

**Deletes are tombstones.** A `dead` set marks records; ids are never reused
and issues are never spliced, so `index === id - 1` always holds, sort caches
survive delete/undo untouched, and undo restores the *exact* record objects
rather than reconstructing them.

**Search.** Per-record lowercase haystacks built at ingest. A keystroke that
extends the previous query filters the *previous result* rather than the
dataset (exact: a string containing "abc" contains "ab"), which is why the
median keystroke at 100K is 6.8ms. The cold full pass has a query-only fast
path that never touches the issue objects. Haystack flattening and the
loop's JIT warm-up are both forced once at ingest — that cost belongs to
index construction, not to the user's first keystroke, and moving it cut the
worst 100K keystroke from ~57ms to ~27ms.

**Virtualizer** (`src/List.jsx`), hand-written for three reasons no
off-the-shelf list handles together:

1. *Offsets are arithmetic, not arrays.* Rows are fixed height with at most
   five irregularities (up to 4 group headers + one expanded editor), so an
   offset is `f*40 + headers_before(f)*Δ + expansion`, and position lookup is
   a binary search over that formula. No per-row height array at 1M.
2. *The scrollbar is compressed above 15M virtual px.* 1M rows is 40M px and
   browsers cap scroll heights; real `scrollTop` maps linearly onto virtual
   space and rows carry a correction shift.
3. *Chrome saturates layout geometry near 2^25 px (~33.5M).* My first version
   positioned rows in absolute virtual space, and rows silently collapsed on
   top of each other past ~84% of a 1M list — my geometry probe caught it.
   Rows are now positioned against a chunk origin that tracks the viewport in
   100,000px steps, so row transforms stay small and only re-render when the
   chunk changes.

**Row expansion** interpolates an `extra` height on the editing row inside
the virtualizer's own offset math, so every row below shifts consistently and
the scrollbar stays honest while it animates. The editor stays mounted
through the closing animation and even when scrolled out of the rendered
window, so a draft is never destroyed by scrolling.

---

## 7. Honest notes

**What was hard.**

- *The 1M layout saturation.* Scrub numbers looked perfect at 1M while the
  list was actually broken past ~84% of the range: rows stacked at a single
  position, which a timing probe cannot see. Only a probe comparing rendered
  geometry and text against the model found it. Recorded here because the
  timing number alone would have been a false pass.
- *Animating the expansion inside a virtualized list.* The row's height
  changes every frame, which changes every subsequent row's offset, which
  changes the total scroll height. Making that smooth without scrollbar
  jitter or viewport drift took the most iterations.
- *Getting the cold 100K keystroke under budget.* Warm passes were always
  ~20ms; the first was ~57ms, because V8 leaves concatenated strings as lazy
  cons-strings and the loop starts un-JITed. Diagnosing that as an index-time
  cost rather than a search-time cost was the fix.
- *Exact sort order under a packed-key sort* (§6) — a real correctness bug
  that only a full inversion scan surfaced.

**What is unfinished or qualified.**

- **1M search is not under 50ms for 1–2 character queries** (150–260ms). It
  is fine from the third character on (6–30ms) thanks to incremental
  narrowing. The brief's latency bar is at 100K, met with ~2x headroom, but I
  would rather state this plainly than bury it. The fix is a trigram or
  suffix index built at ingest; I did not build one because it would cost
  more ingest time and memory for a scale the guarantee does not cover.
- **1M costs ~680MB of JS heap** and ~2.5s to generate + ingest, with a
  progress overlay during the switch. It works; it is not free.
- **Undo is per-delete, not a general undo stack.** The brief asks for timed
  undo of deletion, which is what exists — edits and bulk status changes are
  not undoable.
- **No tests in the repository sense.** `scenarios.mjs` is a scenario
  harness, not a unit suite; there is no CI, no coverage, and it asserts
  behaviour at the UI level only.
- **Accessibility is partial.** Controls have `aria-label`s, the chart has a
  text alternative, focus rings are preserved and the keyboard layer is
  complete, but the virtualized list is not a proper `grid`/`listbox` with
  `aria-rowcount` and roving tabindex, and filter results are not announced
  to screen readers. That is what I would do next.
- **`window.__tracker` is exposed in the production bundle.** It is how the
  protocol probe sets the dataset scale and how the scenario harness reads
  model state. In a real product it would be dev-only.
- The `.list` container is the scroll element and row heights are fixed at
  40px; a genuinely variable-height design (wrapping titles) would need the
  measured-offset path I deliberately avoided.

**With more time**, in priority order: a trigram index so 1M search matches
the 100K guarantee; proper ARIA grid semantics on the list; an undo stack
covering edits; and moving generation + ingest into a Web Worker so the 1M
switch never occupies the main thread at all.
