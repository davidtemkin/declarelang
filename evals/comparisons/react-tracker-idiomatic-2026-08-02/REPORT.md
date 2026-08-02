# Tracker — build report

React 19 + TypeScript + Vite. Everything below was measured on this machine, in
headless Chrome (`/Applications/Google Chrome.app`), viewport 1560×950 @2x,
against the **production build** served by `vite preview`.

```
npm install
npm run build
npm run preview            # http://localhost:5175
npm run dev                # http://localhost:5174

node scripts/acceptance.mjs   # drives S1–S15 through the UI  → 91/91 checks pass
node probe.mjs                # PROTOCOL.md numbers at 10K / 100K / 1M
node scripts/screenshots.mjs  # regenerates screenshots/
```

---

## 1. Lines of code

`npx cloc` (v2.06).

| Scope | Files | Code |
|---|---:|---:|
| **App — TypeScript/TSX** (`src/**`) | 28 | **1,602** |
| **App — CSS** (`src/**`, CSS Modules + tokens) | 19 | **1,176** |
| **src/ total** | 47 | **2,778** |
| of which: `src/data/generate.ts` — port of the supplied `gen-issues.mjs` | 1 | 75 |
| **App code excluding the ported generator** | 46 | **2,703** |
| Test/measurement harness (`scripts/`, `probe.mjs`) — not shipped | 4 | 805 |
| Config (`vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`) | 4 | ~110 |

Largest single file is the store at 217 lines; nothing else in `src/` exceeds
140. Generated code: none (no codegen step).

## 2. Direct dependencies

**Runtime (9)**

| Package | Ver | Why |
|---|---|---|
| `react`, `react-dom` | 19.2.8 | Required by the brief. React 19 specifically for `useDeferredValue` on the 100K derivation and context-as-provider. |
| `zustand` | 5.0.14 | Client state. Selector-subscription out of the box, so a keystroke re-renders the search box and not the stats panel; no provider, no reducer boilerplate, no Immer proxies wrapping a 1M-element array. |
| `@tanstack/react-virtual` | 3.14.9 | Row virtualisation. The de-facto answer for a headless virtualiser with dynamic item measurement — needed because the open editor is a variable-height row inside the same scroller. |
| `react-hook-form` | 7.84.0 | The in-row editor. Its uncontrolled model *is* the draft semantics the brief asks for: edits live in the form's own store and reach the app only on submit, so Cancel/Esc discard by unmounting. |
| `react-hotkeys-hook` | 5.3.3 | Keyboard shortcuts. Its default "ignore keystrokes originating in form fields" is exactly the brief's "never while typing" rule for Enter and Delete, with an explicit opt-in for ⌘K and Esc. |
| `sonner` | 2.0.7 | The timed-undo toast. Handles the timer, the action button, stacking, hover-to-pause and screen-reader announcement. |
| `lucide-react` | 1.28.0 | Icons; per-icon ESM imports tree-shake to 2.2 kB gz for the 17 icons used. |
| `clsx` | 2.1.1 | Conditional class names. 0.24 kB gz. |

**Dev (7)**: `vite` 6.4.3, `@vitejs/plugin-react` 4.7.0, `typescript` 7.0.2,
`@types/react`, `@types/react-dom`, `@types/node`, `puppeteer-core` 25.4.0
(drives the acceptance suite and the probes).

`du -sh node_modules` → **164M** (puppeteer-core and the TypeScript compiler
dominate; nothing is shipped from there but the 9 runtime packages).

## 3. Bundle size

`npm run build`, then `gzip -k -9`:

| Asset | Raw | Gzip |
|---|---:|---:|
| `assets/index-*.js` | 332,689 B (325 kB) | **105,021 B (103 kB)** |
| `assets/index-*.css` | 19,711 B (19.2 kB) | 4,733 B (4.6 kB) |
| `index.html` | 1,510 B | 803 B |
| **Total code payload** | **353,910 B** | **110,557 B (108 kB)** |
| `issues.json` (the supplied fixture, emitted as a static asset) | 3,073,019 B | 360,150 B |

Composition, from a one-off build with per-package chunks (gzip):

```
react-dom  56.5   app code 12.2   react-hook-form 10.4   sonner 9.6
virtual-core 6.7  react 3.3       react-hotkeys-hook 2.5 lucide 2.2
scheduler 1.7     zustand 1.6     react-virtual 1.0      clsx 0.2
```

React DOM is 55% of it. My own code is 12.2 kB gz.

## 4. PROTOCOL.md measurements

Production build, `vite preview`, headless Chrome, 1560×950 @2x, `node probe.mjs`.

| | 10K | 100K | 1M |
|---|---:|---:|---:|
| **load** (records in hand) | **52 ms** | **68 ms** | 906 ms |
| **ingest** (→ first list render committed) | **12 ms** | **76 ms** | 861 ms |
| **search** median / max, per keystroke | **4.1 / 5.5 ms** | **30 / 35 ms** | 199 / 225 ms |
| **scrub** median / p90 (30 teleports) | 8.2 / 8.6 ms | **8.3 / 8.6 ms** | 8.3 / 8.5 ms |
| **glide** median / p90 (30 × 900 px) | 8.3 / 8.7 ms | 8.3 / 8.8 ms | 8.3 / 8.6 ms |
| re-sort: direction flip | 32 ms | 82 ms | 891 ms |
| re-sort: by title | 34 ms | 175 ms | 2,633 ms |
| group on/off | 33 ms | 42 ms | 166 ms |

**Boundaries I measured**, stated explicitly because the protocol asks:

- **load** — `performance.now()` around obtaining the records. At 10K that is
  `await fetch("issues.json")` + `await res.json()`, exactly as defined. At 100K
  and 1M there is no such file: the scale control regenerates in memory (Verb 9),
  so *load* is the `generate(n)` call. For comparison I separately measured
  fetch+parse of a real 100K `issues.json` (30.9 MB) in the same browser:
  **326–433 ms**, i.e. ~5× slower than regenerating it.
- **ingest** — from records in hand to the store committed *and* the first list
  render committed: `performance.now()` at the point of hand-off, then one
  `requestAnimationFrame` after `set(...)`, which fires after React has rendered
  and committed the new list. It therefore includes the horizon scan, React's
  render/commit, and the virtualiser's first measurement pass.
- **search** — `performance.now()` around `selectVisible(...)` inside the
  `useMemo` that derives the visible list: the derivation itself, not the render.
  Displayed in the footer (Noun 14). The probe types 15 characters and reads the
  app's own number after each one.
- **scrub** — the protocol's script verbatim, container `[data-testid='list']`.

The scrub median sits at 8.3 ms at every scale, which is the frame interval of
this headless display; the max never exceeded 10.3 ms. In other words the row
work fits inside a frame with room to spare, and nothing about 100K or 1M
changes that — the virtualiser renders ~30 rows regardless.

## 5. Scenarios verified

`node scripts/acceptance.mjs` drives all of S1–S15 through the real UI in
headless Chrome against the production build: **91 checks, 91 pass**. It never
reaches into app internals — it clicks, types and reads the DOM, and checks
counts against an independent recomputation from `issues.json` in Node.

| | How it was verified |
|---|---|
| **S1** | Totals read from the toolbar; per-status, per-assignee-open and the 14-day closed histogram read out of the stats panel and compared element-by-element against a recount of `issues.json` done in Node. `load`/`ingest` asserted present and numeric. |
| **S2** | Types `cache layer`; count compared against an independent per-field substring filter (311 = 311); every rendered row asserted to contain the query; search ms asserted present; clear restores 10,000; Esc clears an active search. |
| **S3** | Status=Open + Assignee=Grace + `cache` → 8 rows, matching an independent triple filter; every row asserted `open`. Extends the query to no matches → asserts the *"Nothing matches"* state (distinct from *"No issues exist"*), then the single **Clear search & filters** button restores all 10,000. |
| **S4** | Each of updated / title / priority, both directions: rendered order asserted monotonic under the corresponding key (title via `Intl.Collator`, matching the app's comparator). |
| **S5** | Group on; a group collapsed (22 rows → 0) and re-expanded; with all four collapsed, every header's count compared against the stats panel; then, under a narrowing query so all groups fit on screen, three `open` rows bulk-set to `blocked` — asserts open −3, blocked +3, and that the moved rows now render under the blocked header. |
| **S6** | Collapsed rows measured at a uniform 52 px; the opened row grows to 346 px; the row below is asserted to sit at exactly `top + height` of the opened one; the scroller is driven to 600 px while the editor is open and reads back 600; closing restores uniform 52 px. |
| **S7** | Edit title + priority, **Cancel**, reopen → original values still there. Then edit all six fields and **Save** → closed count +1 in the stats panel on the same commit, the new title is findable by search (exactly 1 hit) and the new assignee is searchable. |
| **S8** | **New issue** → total +1, exactly one row selected, that row on screen and scrolled into view, and its id is the newest so it sits first under the current sort (updated desc). |
| **S9** | Five rows selected via ⌘-click → bulk status → blocked count moves by exactly the number that changed. Then five selected, deleted (total −5, ids gone from the list), **Undo** → total restored, all five ids back, and re-selected. |
| **S10** | 100K, six scrollbar teleports (13/37/50/76/91/100%): ≥16 rows covering the viewport at every stop, zero pixels of gap between consecutive rows at rest, and a different first index at each stop. |
| **S11** | Five records selected, direction flipped twice, sort key changed to title, then a status filter toggled on and off — the selection count stays 5 throughout, and the checkboxes that are checked on screen are the same record ids as before. |
| **S12** | Scale to 100K (total 100,000, load/ingest update, search narrows correctly and reports ms) and to 1M (total 1,000,000, search returns 161 rows, list still renders 29 rows after a deep scroll). |
| **S13** | ⌘K focuses search; `/` focuses search without leaking the character; Delete and Backspace do nothing while the caret is in the search field; Enter opens the single selected row; Delete deletes the selection and Undo restores it; Esc walks back one layer at a time — editor → selection → search → filters. |
| **S14** | All three modes clicked; asserts `data-theme` on `<html>`, and that the computed body background *and* foreground actually differ between light and dark. Screenshots in `screenshots/light.png`, `dark.png`. |
| **S15** | Viewport 400×820: `scrollWidth == clientWidth` on both `<html>` and `<body>` (no horizontal overflow); search, sort, direction, group, new-issue and the scale control all present; filters and stats reachable through the panel drawer; the in-row editor's right edge asserted inside the viewport. Screenshots `narrow.png`, `narrow-panel.png`. |

## 6. Architecture, briefly

```
src/
  data/        types, the ported seeded generator
  domain/      pure functions: sortOrder / selectVisible / buildRows, computeStats
  store/       one zustand store: dataset + view spec + selection + metrics
  state/       ViewModelProvider — the single derivation of the visible list
  hooks/       theme, keyboard, delete-with-undo
  components/  shell / toolbar / filters / list / stats / ui
```

The whole app is one derivation:

```
issues ──sortOrder(issues, sort)──▶ order: Uint32Array
                                        │
issues, order, query, facets ──selectVisible──▶ visible: Issue[]
                                        ├──buildRows──▶ rows  (virtualiser)
                                        └──computeStats──▶ stats (panel)
```

`ViewModelProvider` computes it once per change and hands it to the toolbar
counts, the list and the stats panel, so those three cannot disagree — the same
array produces all of them. Nothing is incrementally maintained (Guarantee 19):
every statistic is a fresh pass over `visible`.

A few consequences worth naming:

- **Selection is a `Set<number>` of record ids** (Guarantee 18). Sorting and
  filtering rebuild arrays of the same objects; nothing selection-related is
  positional, so a sort flip cannot disturb it.
- **The editor is the only variable-height row.** Collapsed rows are exactly
  `--row-h` (52 px) by construction — the 1 px separator is subtracted from the
  inner box — so the virtualiser's estimates are exact for every row but one,
  and `measureElement` is attached only to the row being edited. The size cache
  is dropped whenever the open row changes.
- **`useDeferredValue` on the query.** The input updates at high priority and
  the 100K-row derivation at low priority, so typing never waits on filtering;
  the toolbar count dims while a recompute is in flight.
- **Undo restores records, not copies.** `deleteIssues` returns the removed
  objects *and* the indices they occupied; undo splices them back into the same
  slots.

## 7. The idiomatic-path report

### Library choices, and what I deliberately did *not* build

| Concern | Choice | Alternative I rejected |
|---|---|---|
| Virtualisation | `@tanstack/react-virtual` | Writing a windowing loop. `react-window`/`react-virtualized` were the other candidates; both are weaker at dynamic item heights, which is the whole point here. |
| State | `zustand` | Redux Toolkit (more ceremony for a single-store app), or `useReducer` + context (would re-render every consumer on every keystroke). |
| Form / draft | `react-hook-form` | Hand-rolled `useState` draft object. RHF is 10.4 kB gz for a six-field form, which is the one place I paid real bytes for an ecosystem default — but it gives the draft isolation the brief asks for without me writing the isolation. |
| Toast + timed undo | `sonner` | A timer + a portal + a stack, hand-written. |
| Shortcuts | `react-hotkeys-hook` | A `keydown` listener with my own "is the user typing?" test. The library's form-tag policy is the rule the brief states. |
| Icons | `lucide-react` | Inline SVGs. |

### Deviations from an ecosystem default, and why

1. **CSS Modules + custom-property tokens, not Tailwind or a CSS-in-JS
   library.** CSS Modules are Vite's built-in, zero-runtime, zero-dependency
   option; a two-theme design driven entirely by custom properties means every
   component is written once and is correct in both themes by construction.
   Tailwind would have been an equally defensible ecosystem answer; it would have
   added a build dependency and a config file for no capability I needed. Cost:
   1,176 lines of CSS, 4.6 kB gz.

2. **No chart library for the 14-day closed histogram.** Recharts/visx/nivo are
   the community answers for charts, but they are 80–120 kB gz, and this is
   fourteen bars in a 64 px strip. It is 25 lines of flexbox with an accessible
   `role="img"` label listing every value. Bringing in a charting runtime for
   this would have been the less defensible call.

3. **No theme library.** `next-themes` is the standard, and is Next-specific;
   there is no comparably well-regarded framework-agnostic equivalent. The
   replacement is ~40 lines: `zustand/middleware`'s `persist` for the preference,
   a `matchMedia` listener for `system`, and a pre-paint script in `index.html`
   that reads the same storage key so the first frame is never the wrong colour.

4. **No search library, and a two-pass filter instead of a one-liner.** This is
   the deviation that deserves the most explanation.

   The brief specifies case-insensitive **substring** matching over four fields.
   MiniSearch, FlexSearch and Lunr index *tokens* (prefix at best), so
   `"che lay"` would stop matching `"cache layer"` — a semantic change, not an
   optimisation. Fuse.js is fuzzy and an order of magnitude too slow at 100K. So
   the community's search packages do not answer this question, and the filter
   is application code.

   The shape of that code is where I deviated from the obvious. The natural
   pipeline is `sort → filter`: keep a memoised sorted array, filter it on every
   keystroke. I built that first, and it measured **~48–52 ms median per
   keystroke at 100K** — right on the guarantee's line. Profiling in the browser
   showed why: a sorted array is a *shuffled* array of object references, so the
   filter takes a cache miss per record. Running the identical filter over the
   records in allocation order measured **~28 ms**; running it twice in a row,
   the second pass cost ~18 ms.

   So the pipeline is `sortOrder → selectVisible`: sorting produces a
   `Uint32Array` permutation instead of a re-ordered copy, the filter walks the
   dataset in memory order marking survivors into a `Uint8Array`, and a second
   pass projects them through the permutation. Two loops and thirty lines, in one
   pure function, with the measurement in the doc comment. Result: **30 ms
   median at 100K** — a comfortable margin rather than a coin-flip. I also tried
   memoising a lower-cased haystack per record in a `WeakMap`; it helped at 10K
   (5.5 → 3.7 ms) but not at 100K once the traversal order was fixed, so I
   dropped it rather than carry the memory.

   I want to be clear that this is the *only* place I optimised past the obvious
   version, that it is a measured 40% and not a guess, and that the code it
   replaced is described above so a reviewer can judge the trade.

5. **`fetch("issues.json")` is served by a 15-line Vite plugin.** The fixture
   lives at the project root; rather than keep a duplicate copy under `public/`,
   the plugin serves it in dev and emits it into `dist/` at build time. One file,
   one source of truth.

6. **Pinned to Vite 6, not 7 or 8.** This machine runs Node 20.11.1; Vite 7
   requires ≥20.19 and Vite 8 requires ≥22. Vite 6 is the newest release that
   runs here. Not a design choice — an environment constraint, recorded so it
   isn't mistaken for one.

7. **Two `data-*` attributes on each row** (`data-issue-id`, `data-status`) and
   `data-role="title"` on the title span exist partly so the acceptance driver
   can read the list without reaching into app internals. They are stable,
   meaningful hooks rather than test-only noise, but they are there for the
   harness as much as for styling.

### Guarantees: where the idiomatic path landed

| # | Guarantee | Result |
|---|---|---|
| 16 | Smooth at 100K including scrollbar drags; usable at 1M | **Met.** Scrub median 8.3 ms / p90 8.6 ms / max 8.8 ms at 100K — the frame interval, i.e. no dropped frames. Identical at 1M. |
| 17 | Search < ~50 ms/keystroke at 100K | **Met, at 30 ms median / 35 ms max** — see deviation 4 for what the unoptimised version cost (~48–52 ms), because that number is the interesting one. |
| 18 | Selection means records | **Met.** Ids in a `Set`; verified through two sort flips, a sort-key change and a filter change (S11). |
| 19 | Derivation honesty | **Met.** Every statistic is a fresh pass in `computeStats`; there is no incremental counter anywhere in the codebase. |
| 20 | Light / system / dark | **Met.** Verified in-browser, both themes and the resolved system value. |
| 21 | 400 px → 2500 px | **Met.** Zero horizontal overflow at 400 px, all verbs reachable (S15). |

**Nothing in the brief was missed.** The one place worth stating plainly as a
shortfall is *outside* the guarantees:

> **At 1M, search costs ~199 ms per keystroke and re-sorting by title costs
> ~2.6 s.** Guarantee 16 asks only that the app "remain usable" at 1M and
> Guarantee 17 pins the latency target to 100K, so this is not a failed
> guarantee — but it is where the linear full-recompute architecture stops being
> pleasant. Typing stays responsive because of `useDeferredValue` (the input
> never blocks), and scrolling stays at 8.3 ms, but the list lags the caret by
> about one keystroke. Fixing it properly means either an inverted index built
> off the main thread or incremental narrowing (exploiting the fact that
> extending a query can only shrink the result set) — the latter is ~15 lines and
> would take the second-and-later keystrokes to near-zero, but it would also mean
> the number the protocol asks me to report is no longer "a filter recompute over
> the full dataset", so I did not do it.

## 8. Honest notes

**What was hard.**

- *Finding where 100K search time actually goes.* The same filter measured 16 ms
  in Node, 22 ms in a bare Chrome page, and 52 ms inside the app. Chasing that
  gap — rather than accepting the number — is what turned up the shuffled-array
  cache behaviour. Three A/B runs with both implementations timed back-to-back in
  the live app, in both orders, were needed to separate the effect from
  measurement warm-up.
- *Enter-to-open silently submitting the editor.* Pressing Enter opened the row,
  React committed synchronously, the editor autofocused its title field, and the
  `keypress` from the *same* physical key then triggered implicit form
  submission — so the editor opened and closed within one keystroke, with no
  error anywhere. `preventDefault` on the hotkey's keydown suppresses the
  keypress and fixes it. I would not have found this without driving the app
  through a real browser.
- *Keeping the virtualiser's estimates exact.* A 1 px border made every row 53 px
  against a 52 px estimate — invisible on screen, but 2% of scroll range wrong at
  100K. The fix (subtract the border from the inner height) is one line, but the
  discipline it encodes — collapsed rows are a known constant, exactly one row is
  measured — is what keeps deep scrolling honest.
- *Group headers under virtualisation.* Verifying "per-group counts are correct"
  through the DOM is awkward when only one header is ever on screen at 10K. The
  acceptance driver collapses all four groups so every header is visible at once,
  then narrows with a query so headers *and* rows fit together for the
  rows-move-between-groups check.

**What I would want more time for.**

- **Tests that are not the acceptance driver.** There is no unit-test layer.
  `domain/query.ts` and `domain/stats.ts` are pure and would take Vitest suites
  in an afternoon; that is the first thing I would add before anyone else touched
  this code.
- **Off-main-thread dataset work.** Regenerating 1M blocks for ~900 ms behind a
  spinner, and the 2.6 s title re-sort at 1M has no progress indication at all. A
  worker + a comlink-style boundary is the idiomatic answer; structured-cloning
  1M records back may well cost more than generating them, so it needs measuring
  before it is worth building.
- **Editor expansion animation.** The editor fades and slides in over 160 ms, but
  the row's height change is instant — animating it would mean the virtualiser
  re-measuring on every frame of the transition, and I chose a crisp snap over a
  smooth-but-jittery reflow. With more time I would drive the height from a
  spring and feed the virtualiser explicitly rather than through its
  `ResizeObserver`.
- **Accessibility beyond the basics.** Roles, labels, `aria-expanded`,
  `aria-pressed`, `aria-live` on counts and a text alternative for the histogram
  are all in place, and focus is visible throughout. What is missing is real
  roving-tabindex keyboard navigation *within* the virtualised list — arrow keys
  move the scroll container, not a focused row.
- **Persisting the view.** Sort, filters and grouping are not in the URL, so a
  view cannot be shared or survive a reload. That is a product gap, not a
  technical one, but it is the first thing a real user would ask for.

## 9. Screenshots

`screenshots/` — `light.png`, `dark.png`, `editor.png` (grouped, row open for
editing, dark), `selection.png` (bulk bar at 100K), `narrow.png` and
`narrow-panel.png` (400 px). All produced by `node scripts/screenshots.mjs`
against the production build.
