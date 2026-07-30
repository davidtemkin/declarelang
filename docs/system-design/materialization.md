# Materialization — logical instances, invisible virtualization

> **Status: proposed 2026-07-28, not yet ruled.** Grew out of the OL gap audit
> ([openlaszlo-gaps.md](openlaszlo-gaps.md) §7) under David's challenge: *"how
> can this be solved so giant datasets just look like a regular dataset and the
> developer doesn't need to care?"* The first draft answered with an OL-shaped
> pooled mode plus a state-loss doctrine — a visible surface and a developer
> burden. This doc replaces that: the burden is not inherent, it is an artifact
> of frameworks that don't own enough of the stack. Declare owns enough.
> Companions: [data-paths.md](data-paths.md) (the slice substrate),
> [instantiation.md](instantiation.md) (the construct pipeline),
> `runtime/src/replicate.ts` (the reconciler this extends), and
> [materialization-antecedents.md](materialization-antecedents.md) — the
> NSTableView lineage researched (2026-07-29): 34 years of evidence that
> visibility/lifetime/reuse are absorbable and that identity and extent
> estimation are the two burdens Apple never eliminated (Declare's data
> model is the opening to absorb identity too), and
> [materialization-field-sentiment.md](materialization-field-sentiment.md) —
> the developer complaint corpus across ecosystems (2026-07-30): the ranked
> failure classes, what earned trust (Flutter builder, content-visibility),
> and the reception forecast; its editor's note flags the one live design
> pressure (browser find/selection/AT over uninstantiated rows on the DOM
> backend) that §2's contract should answer explicitly.

---

## 1. The reframe: materialization is the runtime's business

Why is virtualization developer-visible everywhere? React cannot make
windowing transparent because it owns neither layout, nor scrolling, nor row
geometry, nor state — user code renders opaque components, so a windowing
*library* must ask the developer for everything: row heights, the scroll
container, the window math, keys, memoization, and lifted state. The burden is
structural to React's ownership boundary, not to the problem.

Declare's runtime owns the scroll box (`scrolls` is a runtime attribute),
live scroll position (`scrollY`), every instance's geometry, layout itself,
both renderers, focus, and — decisively — the reactive graph, which means
**the runtime can see state**. That last fact is what makes invisibility
possible.

The design move is one sentence added to the language's existing position.
Language §9 already says replication is *"the artifact of the match resolving
to many, not an imperative loop."* Extend it:

> **A record that matches HAS a logical instance. Whether that instance is
> physically constructed right now is the runtime's business — an
> implementation detail, like whether a view has painted.**

Under that ruling, "virtualization" stops being a feature with an API and
becomes an optimization pass with defined observability rules: the runtime
materializes the window (plus buffer), and everything else exists logically —
reconstructible on demand, indistinguishable when reconstructed.

---

## 2. The semantic contract — what must be unobservable

The whole design reduces to one question: when is discarding and later
reconstructing an instance observable? Enumerate the state:

**Derived state — free.** Constraints, `:path` reads, theme, geometry, states
gated on expressions: reconstruction re-derives all of it identically. This is
the reactive graph's core guarantee doing double duty.

**Local divergent state — the runtime knows where it is.** The toggled
`expanded: boolean`, the uncommitted `TextInput` draft, an inner scroll
offset: state that lives in the instance and not in the data. The insight the
first draft missed: the runtime owns the cells, so it can *know* which
instances have diverged — an assignment into a literal-initialized attribute
sets a divergence bit (near-zero cost: a flag on the write path that
`setAttribute`-refusal machinery already walks), and `Editor` already carries
an explicit `dirty`. So:

- Instances with **no divergent state** are discarded and reconstructed
  freely. Semantically indistinguishable, no doctrine required.
- Instances the user actually **touched** are retained — alive, or hibernated
  (surface detached, constraints suspended, cells intact). Memory then scales
  with *user-touched rows*, which is human-bounded — a person can scroll past
  a million rows but can only have half-typed into a few — not with dataset
  size. This is principled, not heuristic: the retained set is exactly the set
  for which reconstruction would be observable.

**`onInit` — one ruling required.** Reconstruction would refire it, which is
observable (an `onInit` incrementing an app counter). Rule: **`onInit` fires
once per record-membership, not once per physical construct.** The reconciler
already decides which records are new to the match; materialization events are
not membership events. This single ruling is what makes "the runtime's
business" honest rather than approximate.

**Edges, each solvable inside the runtime because no user code holds the
machinery:**

- **Focus.** A focused instance counts as touched (retained while focused).
  Tab traversal into an unmaterialized region materializes on demand — the
  runtime owns `Focus` and the preorder walk.
- **Animators.** A Spring mid-flight when its row dematerializes: settle it
  (jump to rest, fire `settled`) at dematerialization. Observable only via
  timing of the settle, which animation already defines as
  runtime-controlled.
- **The crawler / headless boot** materializes everything (it already walks
  every location; virtualization off is one flag).
- **Imperative reach-in.** Code that walks `childViews` of a virtualized
  block sees materialized instances only. This is the one honest seam. The
  idiom already points away from it — derive from data, not from views — but
  the limitation must be documented on the block, not discovered.

### The observer boundary (ruled with David, 2026-07-30)

The contract above is a promise to a specific observer: **the app's own
semantics, and the user's interaction with what exists.** It is deliberately
NOT a promise to the platform's document-level features. On the DOM backend,
unmaterialized rows do not exist for browser find-in-page, text selection
across the collection, or the document's accessibility tree — **by design,
with native precedent**: no platform has ever let system text search
enumerate a native table's unrendered rows (Excel, Finder, Mail all own their
search, over their *data*). Find-in-page is a property of documents, where
the rendered thing IS the data; a replicated block is a *projection* of data,
and the search surface for data is the data — a Declare app searches
`data.value` (fields not displayed, raw values behind formatted ones — more
correct than grepping a rendering) and navigates the window to the hit. The
field evidence agrees: the web's virtualization rage
([materialization-field-sentiment.md](materialization-field-sentiment.md))
comes from document-shaped experiences (articles, feeds) — a shape Declare's
document content (a `Markdown` flow) never virtualizes, because
materialization applies only to replication over data. Extraction drew this
same line a year earlier: indexable content is build-time material; the
projection is not the corpus.

Two consequences are REQUIREMENTS, not options:

- **Navigate-to-logical-record must work** (§3.5): app-level search is only
  viable if the runtime can scroll to a record that is not materialized —
  materializing it on arrival. Without this the reframe collapses.
- **Accessibility does not follow the findability logic** and gets its own
  answer — windowing-aware AT, the natives' solution: expose the *logical*
  extent and position (`aria-rowcount`/`aria-rowindex` on the DOM backend;
  the platform AT protocols on native hosts), and materialize on AT
  traversal. Assistive tech is told "row 500 of 100,000" without 100,000
  nodes existing.

---

## 3. Mechanism

Composed of four parts, all runtime-internal:

1. **The windowed match.** `Replicator.match()` gains a mode where it derives
   a range from the scroll box: tracked reads of `scrollY` and viewport
   extent, a slice of the array region. It is the same standing computation
   that exists today with two more dependencies; one reconcile per settle
   wave and rAF-batched surface work already exist. After the JSONPath build
   lands ([data-paths.md](data-paths.md) order item 4), the range rides the
   RFC 9535 slice plan with compiled, tracked endpoints — the same carve-out
   the filter closures use (the path stays a literal; its two endpoints are
   cells).
2. **Extent without materialization.** The scrollable height must read as
   `~N × rowExtent` while only the window exists. The web platform's
   `content-visibility: auto` + `contain-intrinsic-size` is the precedent:
   estimate, then correct as real rows materialize. Declare goes deeper (skip
   instantiation, not just paint) and can be honest about shape: when the
   arrangement is predictable — uniform-ish rows along the scroll axis under
   a `SimpleLayout`, the overwhelmingly common case — virtualize; when the
   layout is one the runtime cannot predict positions under (an authored
   `place()` with cross-child coupling), **fall back to full materialization
   rather than degrade semantics**. Detection is cheap: the runtime can read
   which layout class governs the block. Measured (non-uniform) extents are a
   later increment on the same seam, as OL's `resize` was to `lazy`.
3. **Recycling — internal only.** Instance reuse across the window edge
   (re-point the cursor via the existing `setBound(v, "datapath", …)` path,
   reset diverged cells to their declared initializers, let equality-gated
   constraints re-derive) is strictly an allocation optimization the runtime
   may apply to *clean* instances. It is not a semantic mode, has no surface,
   and never touches retained (touched) instances. The first draft's "pooled
   reconcile mode with a state doctrine" is thereby demoted to what it should
   have been: a recycling strategy behind the contract of §2.
4. **The threshold.** Below it, full materialization — which is not a
   compromise but the *faster* steady state at small N (§5). Above it,
   windowed. Ship as a one-word opt-in on the replicated element first, with
   the stated ambition of automatic-above-threshold once the invisibility
   claim survives measurement — the browsers' trajectory with rendering
   optimizations, and the trust-building order.
5. **Navigate-to-logical-record** (required by §2's observer boundary): the
   scroll-to machinery must accept a logical target — a record/index beyond
   the window — compute its position from the extent model, move the scroll
   box, and let the windowed match materialize the destination. This is what
   an app-level search lands on; it is also the AT-traversal path (§2's
   windowing-aware accessibility) wearing a different caller. Both consumers
   exist before the feature does, so this ships WITH the windowed match, not
   after it.
6. **The diagnostic** (the trust requirement the field evidence ranks above
   almost everything —
   [materialization-field-sentiment.md](materialization-field-sentiment.md)'s
   "invisible cliffs" class): the inspector answers, for a windowed block,
   *that* it is windowed, the logical count, the materialized count, the
   retained (touched) set, and whether extent is predicted or measured. Not
   surface — introspection, riding the existing `explain()`/inspect
   machinery. An invisible layer is trusted exactly to the degree it can be
   SEEN when someone asks.

---

## 4. Retiring `key`

David asked whether `key = :field` can go away. **Viable — in three moves,
with one residual case that the doctrine authors out.**

Why `key` exists today (`replicate.ts`): a *derived* collection recomputes to
fresh record objects, so identity (`===`) matching would rebuild every
instance; `key` pools by a stable field. But observe where fresh objects
actually come from:

- **Selections preserve identity already.** `filter`, `toSorted`, `slice`
  return new *arrays* of the **same element references**. A derived collection
  that selects/reorders source records keeps `===` matching working today.
- **Fresh objects come from transforms** — `rows.map(r => ({...r, extra}))`,
  parsing, joining: derivations that *manufacture* records.

The three moves:

1. **JSONPath selections land** (data-paths order items 4, 6). The sanctioned
   way to derive a sub-collection becomes a path expression — filter, slice,
   wildcard — and a path selection yields the *source* records, identity
   preserved by construction. The transform-shaped derivation becomes the
   anti-pattern with a better home: **per-record computed values belong in the
   replicated instance's constraints** (each instance derives its own `extra`
   from `:path` reads), not pre-baked into a mapped copy. That is more
   Declare-grained anyway — the record is truth, the instance derives.
2. **Structural-equality fallback in the reconciler.** Where identity misses,
   match by content (hash of the record) — first-fit for duplicates, the
   existing rule. Runs only on misses; cost proportional to the miss set, and
   the equality-gating philosophy already prices value comparison as cheap.
   This catches the remaining fresh-object cases: unchanged rows survive a
   transform recompute without rebuild.
3. **The logical-instance model absorbs the rest.** A transformed record that
   *changed* fails structural match and rebuilds — which §2 makes
   semantically invisible for untouched instances, at a cost proportional to
   records actually edited. Under `key`, that same edit kept the instance and
   flowed the field; the observable difference is nil, the cost difference is
   one construct per genuinely-edited record.

**The residual case:** divergent local state + a transform-derived collection
+ that record edited — no way to re-associate without a key. Under the
doctrine of move 1 (select via paths, derive fields in instances) the
combination cannot be authored; it exists only while transform-derivations
remain idiomatic. So the migration is honest: `key` stays until JSONPath
selections land, then leaves the surface (the reconciler may keep content
hashing internally — bookkeeping, not language).

The React contrast is worth recording, because it explains why this is
possible at all: React's `key` exists because its render model *destroys*
identity every pass — elements are fresh descriptions each render, and `key`
is the developer manually re-threading identity through them, with a
well-known bug class when they get it wrong. Declare's replication is anchored
in the data layer, where identity persists across settles on its own. React
pushed the bookkeeping to developers; Declare's data ownership lets the
runtime keep it.

---

## 5. Performance

Four approaches compared. Figures are order-of-magnitude estimates to be
verified on `apps/bench` + the measure probe before any ruling; the
*asymptotics* are structural.

| | first paint, 10k rows | scroll steady-state | edit one offscreen record | memory | author surface | correctness footguns |
|---|---|---|---|---|---|---|
| **Declare today** (full materialization) | O(N) constructs — the cliff; seconds-class, synchronous, before first paint | **best**: native scroll, zero JS per frame (DOM backend: compositor pans) | that instance's cells wake, equality-gate stops the wave — cheap | O(N) instances + surfaces | none | none — the semantic gold standard |
| **Declare proposed** (windowed) | O(window) — milliseconds-class, independent of N | window recompute + entering-row rebinds per frame, batched into one reconcile; buffer rows hide reconcile latency | **nothing wakes** — no instance, no tracked read on that record | O(window + touched); touched is human-bounded | none, or one word (opt-in) | none if §2 holds — that is the claim to verify |
| **React + windowing lib** | O(window) DOM, but per-row component render + diff; plus hydration where SSR'd | per entering row: full component render, vdom diff, reconciliation; JS-positioned rows | list component re-renders unless memoized by hand — the systemic amplification | O(window) DOM + fiber tree + vdom + closures | heights, keys, scroll container, `itemData` memoization, state lifting | key bugs; state silently lost on unmount; memoization staleness |
| **Updated mirror of OL** (visible pooled lazy manager) | O(window) | pooled rebind — same asymptotics as proposed; worse constants unless it also adopts settle-batching + compiled deps | depends: OL's design woke the manager per data event | O(window) | mask + axis/spacing + pooling flags — the OL surface | positional state leak (the LZX bug class); uniform-size restriction |

Three honest observations the table compresses:

- **At small-to-mid N, full materialization wins steady-state.** A fully
  materialized list scrolls on the compositor with zero JS; a windowed list
  runs a reconcile per frame. This is why the threshold exists and why the
  default stays full materialization — virtualization is the *above-threshold*
  regime, not a universal improvement. (The canvas backend narrows this gap:
  it already repaints the viewport per scroll frame, so windowing's marginal
  scroll cost there is lower.)
- **Against React, the structural edge is what enters a row costs.** An
  entering Declare row is a cursor re-point plus equality-gated re-derives on
  prewired, compiler-extracted reads — no diffing, no sibling re-render, no
  closure churn. And the invisible design eliminates the *developer-paid*
  costs (keys, memoization discipline) that React's realized ecosystem gets
  wrong at scale — the perf issues that are systemic-as-actually-used, which
  is the dimension Declare positions against.
- **Against the OL mirror, invisibility is nearly free.** The extra
  bookkeeping is a divergence bit on the attribute write path, a membership
  set the reconciler already implies, and retention of touched instances
  (human-bounded). OL's design pays the same window math and rebind costs
  *and* a visible surface *and* the state-leak class. There is no perf
  argument for the visible version.
- The first-paint column is also the **synchronous-build insurance**: Declare
  deleted OL's trickle instantiator on the bet that synchronous build is fast.
  Unbounded N is the one place that bet breaks (a delayed first paint with no
  escape valve); windowed materialization is what keeps the bet safe — the
  modern replacement for `initstage="late"` in the only place it recurs.

---

## 6. Why this matters in 2026

OL's optimizations were era-bound — Flash-era memory, bandwidth, and compute
made hundreds of rows a problem. Those motives are dead, and it is fair to ask
whether this construct dies with them. It doesn't, but the reasons are
Declare's own bets, not nostalgia:

- **Where the threshold actually sits today.** A modern machine is untroubled
  by a few thousand live views; real pain starts around tens of thousands of
  nodes — construct time, layout cost, memory (KB-per-node classes of
  overhead). Menus, forms, dashboards, the calendar: never get there. The
  cases that do are a specific, well-known family: feeds, chat histories,
  logs, file lists — and above all **the data grid**, the one component whose
  credibility *is* "100,000 rows, smooth." Every serious grid product
  virtualizes; there is no non-virtualizing grid worth shipping. Since the
  grid sits on the audit's missing-components list
  ([openlaszlo-gaps.md](openlaszlo-gaps.md) §3), materialization is not
  optional infrastructure for it — it is the load-bearing wall.
- **The synchronous-build bet.** OL trickled instantiation over idle time so
  big trees wouldn't block startup; Declare deleted that whole subsystem on
  the bet that synchronous build is fast — true until N is unbounded, at
  which point a 20k-row list is not jank but a delayed first paint with no
  escape valve. Windowed materialization is what keeps the bet safe at scale:
  the modern replacement for `initstage="late"` in the one place construct
  actually recurs (§5's first-paint column).
- **The React contrast cuts the right way.** React's realized performance
  problems on the size/perf dimension are partly structural (re-render
  amplification, diffing) and partly ecosystem-as-actually-used — and its
  list answer is *cultural*: reach for a windowing library, hand-wire
  heights, keys, memoization, lifted state. If Declare's answer is "large
  collections are handled by the runtime; you did nothing," that is a
  **systemic** performance claim — verifiable, architectural, and unavailable
  to frameworks that don't own layout, scrolling, and state. That is exactly
  the dimension Declare positions on, and lists are the most common place
  real apps hit performance walls.
- **Priority, honestly.** The threshold means v1 apps live fine without this;
  it stays sequenced behind slots and the data-paths build (§8). The reason
  to design it now anyway is that the *invisible* version constrains earlier
  work (the `onInit` ruling, the divergence bit, the slice-endpoint
  carve-out) — and the visible version, shipped prematurely, would be API
  debt.

---

## 7. Scope boundary: in-memory data vs. data over the wire

This doc makes **data already resident** look regular, whatever its size. If
"giant" means giant *over the wire*, that is a different problem with a
different owner — a server contract — and deserves its own doc when taken up.
What that doc must answer, noted here so the seam is explicit:

- A paged `DataSource` protocol (range/cursor requests; what of RFC-style
  `Range`, what of an app-defined cursor API).
- What a not-yet-resident record looks like to the reactive graph (a
  placeholder region that is honestly `loading`, per-range, so screens can
  derive skeleton rows — the `data.loaded` idiom, per-window).
- How this composes with materialization: the window asks the data layer for
  a range; the data layer either has it or fetches it. The composition is
  clean precisely because this doc keeps materialization ignorant of where
  records come from.
- What it deliberately will not hide: latency. In-memory materialization can
  be invisible because reconstruction is synchronous; a network fetch is not,
  and pretending otherwise (blocking scroll) would be worse than showing
  honest loading rows.

---

## 8. Sequencing and verification

1. After [data-paths.md](data-paths.md) order items 1–4 (refuse-don't-truncate,
   compile-time plans, Pointer, slices) — the window rides the slice plan.
2. The `onInit`-per-membership ruling and the divergence bit land first
   (small, independently useful — the divergence bit is also what a future
   teardown/inspector story wants).
3. Windowed mode behind the one-word opt-in; `VirtualLayout`-style extent
   handling library-side over the kernel, uniform extents first.
4. Bench: the invisibility claim is testable — a semantic differ that runs the
   same program and interaction script with virtualization on and off and
   asserts identical observable state; plus frame-budget measurements on
   `apps/bench` at 10³–10⁶ rows against the table in §5.
5. `key` deprecation follows JSONPath selections (§4), not before.
6. Automatic-above-threshold: proposed as the destination, gated on 4.

Open questions for the ruling: the opt-in spelling; the threshold (fixed
count vs. measured construct budget); whether hibernation (suspend + keep
cells) ships in v1 or touched instances simply stay fully alive (simpler, and
touched counts are small); whether `childViews` on a virtualized block should
be refused outright rather than partial (the honest-seam question, §2).
