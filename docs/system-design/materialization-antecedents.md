# Row materialization in the Apple lineage — NSTableView and its successors

> **Status: research notes, 2026-07-29.** Commissioned by David for the
> [materialization.md](materialization.md) thread: NSTableView is a clear
> antecedent with the same requirements — display a row per record over
> datasets too large to instantiate — and its 34-year evolution is the best
> longitudinal record of which burdens a framework can absorb and which it
> cannot. Web-researched (dates, API names, WWDC sessions cited inline).

## 1. Origins

Apple's table-view lineage predates the Mac's involvement. The original
NeXTSTEP AppKit (1988) had no general table; lists were `Matrix`/`NSMatrix` (a
grid of reusable Cells) and `NSBrowser` (columns of cell-drawn lists). The
direct antecedent of NSTableView was **DBTableView in NeXT's Database Kit**,
shipped with NEXTSTEP 3.0–3.2 (1992–93) — a table built specifically to scroll
through database record sets far too large to instantiate, fed by adaptors and
designed to work in Interface Builder. The generalized, database-independent
**NSTableView** entered the OpenStep specification (1994), shipped in OPENSTEP
4.0, and passed architecturally unchanged into Cocoa on Mac OS X. The shaping
problem was exactly materialization.md's: a row per record, arbitrary dataset
size, machines where a UI object per row was unthinkable.

## 2. Cell-based NSTableView: the flyweight era

The original design stacked two virtualization mechanisms:

- **Data pull.** The table owns no data. A `dataSource` answers exactly two
  questions — `numberOfRowsInTableView:` and
  `tableView:objectValueForTableColumn:row:` — and the table asks only for
  rows it is about to draw. A million-row table costs the same as a ten-row
  table until you scroll.
- **Flyweight drawing.** Each `NSTableColumn` holds **one `NSCell`** (its
  `dataCell`). To draw row N, the table stamps the row's value into that
  single cell and tells it to draw in the row's rect, then reuses the same
  cell for row N+1. `NSCell` exists precisely because `NSView` was too heavy
  for 1988-era machines — no window backing, no responder status, no
  hierarchy node.

Memory cost was O(columns) — essentially perfect. The **developer burden was
high**: any non-trivial row appearance meant subclassing `NSCell` and writing
`drawWithFrame:inView:` by hand — manual hit-testing, manual editing, no
per-row subviews, no animation. The system's efficiency was bought with the
developer's rendering labor.

## 3. View-based NSTableView (Mac OS X 10.7 Lion, 2011)

WWDC 2011 Session 120 introduced the alternative: each visible row gets a real
`NSTableRowView` of real `NSTableCellView`s. The delegate answers
`tableView:viewForTableColumn:row:` by calling
**`makeViewWithIdentifier:owner:`** — check the **reuse queue** for a view
with that identifier, else instantiate from the design-time NIB. Views
scrolling out are enqueued, not destroyed.

Why the move: cells couldn't hold subviews, animate with Core Animation, be
laid out in IB, or match what iOS developers knew. Virtualization was
preserved by switching strategy — **from flyweight (one drawer, zero row
objects) to recycling (a screenful of row objects, rebound on scroll)**. Live
objects went from O(columns) to O(visible rows): a price Apple judged
acceptable in 2011 that it had not in 1994. Cell-based tables were formally
deprecated in macOS 10.10.

## 4. UITableView / UICollectionView (iPhone OS 2.0, 2008)

iOS started where the Mac ended up: recycling was the founding design —
`tableView:cellForRowAtIndexPath:` calls `dequeueReusableCellWithIdentifier:`,
and only ~a screenful of cells ever exists. Refinements:
`registerClass:/registerNib:` (iOS 5), non-nil `dequeue…forIndexPath:` (iOS
6), `estimatedRowHeight` (iOS 7), **self-sizing cells** via Auto Layout (iOS
8), and `UITableViewDataSourcePrefetching` (iOS 10) to warm data ahead of the
scroll.

Where the contract leaks — both canonical bug classes are consequences of
recycling being *visible* to the developer:

- **Stale reused state.** A dequeued cell arrives carrying its previous row's
  content; anything not explicitly reset bleeds through. `prepareForReuse`
  exists solely to patch this.
- **Async completion into a recycled cell.** Start an image load for row 5,
  scroll, the cell now shows row 40, the load completes and stamps row 5's
  image onto row 40. Every iOS developer has shipped this bug once.
- Estimated heights diverging from real heights cause scroll-jump — the
  estimation burden was reduced, never removed.

## 5. Diffable data sources (WWDC 2019, iOS 13 / macOS 10.15)

`performBatchUpdates:` required hand-computed insert/delete/move deltas that
exactly reconciled with the data source's new answers — get it wrong, get the
infamous `NSInternalInconsistencyException`. `UITableViewDiffableDataSource` /
`NSDiffableDataSourceSnapshot` inverted the contract: hand the framework a
complete snapshot of **stable, Hashable item identifiers**, call `apply(_:)`,
and it diffs and animates. From *"answer queries about row N"* (pull,
index-addressed) to *"declare the identity set; I'll figure out what changed"*
— **identity became the explicit currency of the API for the first time**,
foreshadowing SwiftUI.

## 6. SwiftUI: List / LazyVStack / LazyVGrid (2019–2020)

SwiftUI made virtualization fully declarative: `List(items) { Row($0) }` over
`Identifiable` data, `ForEach(items, id: \.key)`, lazy stacks (iOS 14) for
arbitrary scroll layouts. The developer never sees a reuse queue, never
dequeues, never resets stale state — row views are value-typed *descriptions*,
so the recycled-cell bug class is structurally impossible. Mechanics differ
underneath: `List` recycles (originally UITableView-backed); **lazy stacks
instantiate on viewport entry but do not recycle**, and can accumulate memory
over long scrolls.

The residual burden is **stable identity**. Generate `id: UUID()` in the view
body and every update treats all rows as new — animations break, scroll
position resets, everything rebuilds. `ForEach(0..<count)` derives identity
from offset and is legal only for *constant* ranges — even the range shortcut
is a disguised identity contract, not an escape from it. Other cliffs:
expensive per-row `body`, `AnyView` erasure, and un-estimable row heights
still causing jumpy scrolling — the estimated-size problem survives, merely
hidden.

## 7. The through-line (34 years of invariants)

1. **Visibility is never the developer's problem.** From DBTableView to
   LazyVGrid, no generation ever asked "which rows are on screen?" That
   question is the framework's monopoly.
2. **Live-object cost is O(viewport), never O(dataset).** The *strategy*
   changed — flyweight → recycling → lazy value re-creation — the invariant
   never did.
3. **The developer's obligation shrank monotonically**: draw row N on demand
   (1994) → configure a recycled view for row N (2008/2011) → provide identity
   and a row description (2019). Each step traded a little memory for a lot of
   developer burden.
4. **Identity never became automatic.** It was implicit (the index) in the
   pull era — and indices are precisely what made batch updates crash-prone.
   Diffable and SwiftUI made identity explicit instead of eliminating it.
5. **Size estimation is the other unkilled burden.** Variable-height rows over
   unmaterialized data force the system to guess total extent; every
   generation shipped a bandage (`estimatedRowHeight`, self-sizing, SwiftUI's
   internal estimates), and scroll-jump artifacts leak whenever the guess is
   bad.

## Lessons for invisible materialization

- **Pull for content, push for identity.** The stable endpoint of the whole
  lineage: the developer declares the identity set, the system pulls row
  content lazily by identity. Index-addressed pull was the original sin behind
  the batch-update crash class — don't build on indices.
- **Identity is the one thing Apple always had to extract from the developer**
  — 25 years of trying to get by on indices, then surrender. But UIKit never
  had a data model; **Declare does** (the dataset, its keys, the region-cell
  identity anchoring in data.ts) — deriving stable identity from the data
  layer is the one place this design can beat the antecedent, and it aligns
  with the queue's "remove `:key` by making the compiler smarter" item.
- **Recycling must be invisible or absent.** Every leak in UIKit's contract
  (stale state, async-into-recycled-cell) comes from the developer *seeing*
  the reused object. SwiftUI killed the bug class by making row descriptions
  values that are re-created, with recycling a hidden optimization. If
  Declare's materialized rows are rebuilt from the declaration, the entire
  reuse bug-class vanishes by construction.
- **Solve extent estimation up front.** Variable row extents over
  unmaterialized data is the problem every generation bandaged. Fixed extents
  (fast, honest), estimate-and-correct (accept artifacts), or measure-lazily
  with placeholder extents — choose deliberately, in the design, not in a
  patch release.
- **Leave a prefetch seam.** iOS 10's prefetching exists because data latency,
  not view creation, became the scroll bottleneck. The invisible design should
  over-ask the data layer beyond the viewport without the developer opting in
  — which is a `Dataset`/transport concern, one more reason streams and
  materialization stay orthogonal.
- **What Apple never eliminated:** identity and size estimation. Everything
  else — visibility, object lifetime, reuse hygiene, diffing — was absorbed.
  Expect to absorb those too, and spend the cleverness on making identity and
  extent fall out of declarations the developer was writing anyway.

Sources (retrieved 2026-07-29): kevra.org's DBKit archive; the OpenStep
Programming Reference (Sun/NeXT, 1994); WWDC 2011 Session 120 ("View Based
NSTableView Basic to Advanced"); Brian Webster's `makeViewWithIdentifier:`
teardown; Apple's TableView Programming Guide and
`UITableViewDataSourcePrefetching` docs; WWDC 2019 Session 220 ("Advances in
UI Data Sources"); Donny Wals on diffable data sources; Use Your Loaf on
self-sizing cells; theswift.dev and diyoraharshit.com on SwiftUI List vs lazy
stack performance.
