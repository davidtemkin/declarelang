# Materialization — logical instances, invisible virtualization

> **Build record (2026-07-30): B5 v1 LANDED, in §8's order, per the D5
> rulings (the RULED block in §8).** What ships: the divergence bit
> (attributes.ts — a WeakSet probe on the author-write path) + membership-
> anchored `onInit` (suppressed reconstruction via the reconciler's
> membership set, general — keyed re-derivations included); the windowed
> match behind the materialization policy slot (`materialize = all | auto |
> window | <count>`, default `all` — renamed from `windowed` in the naming
> ruling), uniform extents with estimate-then-correct measurement,
> the block owning row placement and the parent's logical extent (yielding,
> author-respecting); keep-alive retention of touched instances at their
> logical places; the honest fallbacks (layout strategy present, no
> scroller, selective plans → full materialization, reason inspectable);
> `childViews` refusal on windowed blocks with the live window as kernel API
> (`blocksOf`/`realized()`/`navigateTo`/`materializationInfo`, replicate.ts —
> the API speaks materialization words, never the Window noun);
> navigate-to-logical-record; windowing-aware AT (aria-rowcount/rowindex via
> the Surface seam, DOM backend); the inspector diagnostic (§3.6, on the
> inspect payload); and THE SEMANTIC DIFFER (test/materialization.test.mjs)
> — one script, windowed vs full, identical projection — plus the §5 bench,
> measured: scroll 0.06–0.11 ms/frame flat across 10³–10⁶ rows, offscreen
> edit 0.04 ms, ~20 materialized at every scale; 1M-row boot 587 ms,
> dominated by data adoption (tagTree), not construction.
>
> **The 2026-07-31 QA rounds LANDED four of the five deferrals**: RECYCLING
> (a window shift's clean
> leavers re-point at its arrivers; spares park; eligibility = clean ∧
> unfocused — the thumb-scrub bench forced it: 71→8 ms/frame median);
> FOCUS-COUNTS-AS-TOUCHED (a row holding the keyboard focus retains like a
> diverged one — recycling made the gap visible); a VERTICAL SimpleLayout
> COMPOSES (the pass suspends, spacing folds into the unit — the first
> layout-aware case); and VARIABLE EXTENTS (the measured ladder: an
> estimate baseline + identity-keyed measured heights with Fenwick-indexed
> corrections; offset/indexAt O(log n); prepend/measure corrections above
> the viewport compensate the scroll — the anchoring discipline; uniform
> collections degenerate to the empty-corrections i×unit math). Plus the
> VIRTUAL EXTENT seam (Surface.setVirtualExtent — the scroll range spans
> the logical collection when the block's parent IS the scroller) and
> velocity-adaptive overscan. Still deferred: windowing over selective
> plans; mid-flight animator settle at dematerialization; the full
> VirtualLayout generalization beyond vertical stacks. One nuance made explicit in the build: for a member
> never materialized, `onInit` fires at FIRST materialization (at most once
> per membership) — handlers live on instances, so a lazy member's init is
> lazy; the differ therefore projects per-row state, not global init counts.
>
> **Status: proposed 2026-07-28; core rulings D5 2026-07-30 (see §8).** Grew out of the OL gap audit
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

> **THE EXTENT-SATURATION CEILING — found 2026-08-01 by the React
> control-arm experiment, re-verified against Chrome 150, FIXED 2026-08-02.**
> Browsers saturate element layout at ~2²⁵ px (Chrome:
> 33,554,428), so a windowed list whose logical extent exceeds it can only
> scroll to a fraction of its content — the strut clamps silently, with no
> error and no symptom short of noticing the scrollbar bottoms out early.
> Measured directly: a bare absolutely-positioned strut in an `overflow:auto`
> box, driven to its true bottom.
>
> | rows @ 44 px | intended extent | `scrollHeight` | reachable |
> |---:|---:|---:|---:|
> | 10,000 | 440,000 px | 440,000 | 100% |
> | 100,000 | 4,400,000 px | 4,400,000 | 100% |
> | 1,000,000 | 44,000,000 px | **33,554,428** | **76.3%** |
>
> Two halves, both real: the scroll RANGE clamps, and so do the row
> COORDINATES — an absolutely-positioned `top` past the ceiling stops moving,
> so even with range to spare the rows beyond it would pile at one y.
> The React control arm hit the same ceiling and engineered around it, which
> is how we learned ours was there.
>
> **LANDED 2026-08-02 — extent compression.** A windowed block now keeps two
> coordinate spaces once its content outgrows the cap: LOGICAL (the ledger's
> real row extents — what the app and the AT reason in) and PHYSICAL (what the
> browser is told). `physicalExtent()` caps the published height at **2²⁴**
> (16,777,216 — under every engine's ceiling, Firefox's ~17.9M included), both
> where the extent publishes to the strut and where the block owns the parent's
> `height`. `extentScale()` gives the logical-per-physical ratio, and the match
> converts the scroller's offset through it; placement re-bases against the
> physical viewport (`base = leading + pRel − rel`), so a row's own coordinate
> never leaves the range the browser will honour. Rows keep their REAL size —
> only the scroll range is scaled, never a row. `navigateTo` and the
> prepend-anchor compensation divide through the same scale.
>
> **The identity property is what makes it safe in the hot path:** below the cap
> `extentScale()` returns exactly 1, `pRel === rel`, `base` collapses to
> `leading`, and every expression reduces to its pre-compression form. A 100K
> list is bit-for-bit unaffected.
>
> Verified: at 1M rows the published extent is 16,777,216, the last realized row
> at the physical end is 999,999 of 999,999 (**100%**, from 76.3%), and the
> maximum row y is 16,777,172 — under the ceiling. The semantic differ still
> holds.
>
> **The cost, written down:** the mapping is proportional, so one physical pixel
> becomes `scale` logical pixels. That stays sub-row until the scale exceeds a
> row's height — about 16M rows at 44 px, far past what this is for. If a
> collection ever needs finer control than that, the answer is the
> anchor-plus-offset scheme (keep deltas 1:1, map only absolute positions), not
> a bigger cap.

> **LANDED 2026-08-01 — THE ANIMATOR/RECYCLING INTERACTION. Symptom: a
> dragged scrollbar ran at ~8fps (112 ms/frame at 10K, 127 ms at 100K)
> while wheel scrolling was fine. Cause: a `Spring` drives its slot by
> plain assignment (§5's displacement rule), and that write path set the
> DIVERGENCE BIT — so a row holding any spring read as user-touched and
> the reconciler refused to recycle it (499 of 937 candidates rejected;
> 45 reconciles per scroll step; 1,155 instances constructed where
> re-pointing was correct). A spring had just been added to every Tracker
> row for in-place expansion, which is how a latent rule collision became
> visible. Fixes: (1) an animator's write is a runtime DERIVE, not an
> author's touch — a declared animator toward a declared target is
> reproducible by reconstruction — so it is exempt from divergence
> (`asRuntimeWrite`, attributes.ts; `Animator` already used `addBound`
> and was exempt, only `Spring` was not); (2) the harvest is
> ORDER-PRESERVING (k-th leaver → k-th arriver), so a fully-missed window
> leaves every instance at its existing child index and re-links nothing;
> (3) **`Spring.arrive()`** — an instance presenting a record it was not
> presenting before must APPEAR at that record's geometry, not animate to it,
> since the geometry is a fact about the record rather than a change this row
> lived through. It ARMS rather than snapping: the new target is not known at
> recycle time (the cursor write that produces it invalidates lazily, so
> reading `to` there would pin the DEPARTED record's value), so the next
> target the spring receives is taken outright. The arming expires on the next
> FRAME, not the next microtask — the settle wave's boundary differs per
> engine (Chrome completes it inside the arming task, WebKit does not), and a
> microtask deadline silently disarmed there and let the row animate. A frame
> is long enough for any engine's wave and far shorter than a human gesture,
> so a genuine change a moment later still animates.
> Measured after: 8.3 ms/frame dragging at 100K, 9.4 ms at 10K, expansion
> animation intact. NOTE ON MEASUREMENT: the old scrub probe (set
> scrollTop, await one rAF) timed rAF latency, NOT the reconcile the
> scroll event dispatches afterward — it could not see any of this. Frame
> intervals across a sustained drag are the honest measure; every earlier
> scrub number in this project used the flawed probe.
> (Historical note: this shipped first as `Spring.resnap()`, which snapped
> immediately and therefore pinned the departed record's value; `arrive()`
> replaced it 2026-08-02. `resnap` no longer exists — don't look for it.)**

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

> **RULED 2026-07-30 (David — the D5 gate; B5 is unblocked), with two
> refinements made in the ruling conversation:**
>
> 1. **Lifecycle is MEMBERSHIP-anchored, as a general principle.** `onInit`
>    keeps its name and means "this record's presence began" — once per
>    membership, never refired by window reconstruction. The future
>    pre-destroy hook gets the symmetric meaning — presence ENDING (leave
>    the set / subtree removal), never window eviction — and a departure
>    name (D8 picks the spelling). Instance construct/teardown never becomes
>    language surface. Verified (2026-07-30, post-B5): State
>    apply/unapply already reads this way — a State's children fire init
>    once per PRESENCE EPISODE (apply → membership begins; unapply →
>    ends; reapply → a new membership fires again), the same rule as
>    leave-and-return in a match.
> 2. **The materialization policy is a permanent slot, not a boolean
>    opt-in** — spelled `materialize = all | auto | window | <count>` (RULED
>    as `windowed` 2026-07-30, RENAMED the same day in the naming ruling:
>    "window" stays the mechanism's term of art in prose but leaves the
>    author-facing surface, clearing the word for Window-the-component; the
>    values inverted with the noun — `all` forces full materialization, the
>    differ's forcing switch). The word stays in the language forever
>    (debugging, pinning, the differ); only the DEFAULT migrates: `all` in
>    v1, flipping to `auto` once the differ + bench prove invisibility. The
>    capstone's zero-vocabulary claim rides the default, not the word's
>    absence.
> 3. **Touched instances keep-alive in v1** — no hibernation machinery;
>    touched counts are human-bounded. Hibernation stays available as a
>    later optimization if measurement asks.
> 4. **`childViews` on a windowed block refuses** (app-language read) with a
>    pointed error naming the derive-from-data idiom — a partial answer
>    would be scroll-dependent, the exact observable-difference class §2
>    abolishes. The LIVE WINDOW (realized instances + logical positions) is
>    first-class RUNTIME/LIBRARY API on the windowing kernel — the door the
>    layout strategy, AT traversal, the inspector diagnostic, and
>    navigate-to-logical-record consume — designed as part of B5.
>    Non-windowed blocks keep `childViews` unchanged.
