# The data project — ordering and the design work that precedes the build

> **Status: RULED 2026-07-30; the work it schedules was BUILT 2026-07-30 →
> 08-02 and is COMPLETE.** Kept as the plan of record — what the ordering
> argument was, and why. Outcomes live in the sibling docs, not here:
> [data-paths.md](data-paths.md) (paths, pointers, selectors, schemas),
> [materialization.md](materialization.md) (windowing, and the one ceiling
> still open), [selection-model.md](selection-model.md),
> [component-briefs.md](component-briefs.md),
> [focus-scopes.md](focus-scopes.md),
> [jsonpath-spelling.md](jsonpath-spelling.md). The day-to-day tracking file
> this once pointed at (`/DATA-PROJECT.md`) was working-copy scaffolding and
> has been deleted; nothing here depends on it.
>
> The charter was: full JSONPath, JSON Pointer (validated, not
> assumed), materialization/virtualization, retirement of `key`, the
> components that exercise the substrate, and a capstone CRUD exemplar with
> good UX, end to end. This doc answers two questions: what ORDER the work
> must go in (dependency-driven, not preference), and which DESIGN work must
> precede which build work. Sources: [data-paths.md](data-paths.md) (ruled
> build order), [materialization.md](materialization.md) (+ its two research
> companions), the queue's CRUD/drag-claim notes, and the gaps found while
> planning (selection model; mutation authoring surface — data.ts:150 still
> cites language §13's open design).

---

## 1. The one ordering insight that shapes everything

Two chains run through this project, and they meet late:

- **The read chain**: scanner-refusal → compile-time path plans → JSONPath
  segments → (filters) → key retirement move 1 → datagrid-scale replication.
- **The write chain**: Pointer validation → Pointer writes → mutation
  authoring surface → editing components → CRUD.

Materialization sits ON the read chain (the windowed match rides the RFC 9535
slice plan — materialization.md §3.1/§8.1) but its two smallest, most
load-bearing pieces — the divergence bit and the `onInit`-per-membership
ruling — depend on nothing and are wanted by everything. The capstone sits at
the junction of both chains, which is why its BRIEF (not its build) must come
first: it is the requirements oracle every substrate decision gets tested
against.

## 2. Design work that precedes build work

Ordered; D1 is literally first.

**D1. The capstone brief — DONE, RULED 2026-07-30**: an issue tracker,
in-memory loaded-once, search required, no persistence layer. The brief is
[issue-tracker-brief.md](issue-tracker-brief.md) — including the
"not-edge-cases" acceptance roster and the substrate coverage map.

**D2. The persistence seam — RULED 2026-07-30: none.** In-memory
loaded-once won on the merits (a server search would bypass the substrate
under test; §7 of materialization.md keeps wire-paging out; the write story
proves in-session; serverless keeps the exemplar static-hostable as a live
doc showcase). The honest cost — failure-mode UX (optimistic updates,
rollback) — is a different, later exemplar's job. Socket live-feed: noted
post-capstone flourish only.

**D3. Validate JSON Pointer (David's explicit ask).** Before building writes,
a short memo (addendum to data-paths.md) answering: does RFC 6901 cover the
mutation API's real needs — `set`/`insert`/`removeAt`/`move`, array append
(`/-`), the `~0`/`~1` escaping that motivated it, and whether Relative JSON
Pointer (the draft) is wanted for cursor-relative writes or explicitly
refused; AND the author-facing question — where does an author ever SEE a
pointer (answer to propose: they don't write pointers as strings; `<->`
targets and the mutation API compile TO pointers — conformance is the
engine's claim, not the author's burden). Ratified before B2.

**D4. The JSONPath author-facing spelling.** The language-surface ruling the
RFCs don't make for us: how RFC 9535 appears after `:` — root anchoring
(`:$.rows` vs `:rows` as cursor-relative), whether Declare's replication
marker stays `[]` or becomes RFC's `[*]` (proposal: `[]` stays — it means
"replicate here", a Declare fact, not a selection; `[*]` selects), how a
path composes with `datapath` cursors, what of `..` descendant (data-paths §8
questions it: expensive to track, rare — propose: refuse in v1 with a
pointed error), and the v1 subset boundary (index/slice/wildcard per the
corpus; filters behind it). Drafted by me, ruled by David, before B3.

**D5. The materialization ruling.** materialization.md is PROPOSED; its own
open-questions list (§8) needs David: `onInit` fires once per
record-membership (the honesty linchpin); the opt-in spelling and the
threshold; hibernation in v1 or touched-stays-alive (recommend the latter —
simpler, touched counts are human-bounded); whether `childViews` on a
windowed block refuses outright or answers partially (recommend: refuse with
a pointed error naming the derive-from-data idiom — the honest seam made
loud). The observer boundary and §3.5/§3.6 are already ruled (2026-07-30).

**D6. The selection model — the missing design doc.** Nothing in the record
covers selection, and every component in scope needs it: single/multi,
anchor + range extension, keyboard protocol (arrows/shift/cmd), and the
decisive constraint: **selection must be data-anchored (record identity),
never instance-anchored** — a selected row that scrolls out of the window
and back must still be selected, which makes selection design inseparable
from key retirement's identity story and from materialization's contract.
Also: selection as readable reactive state (`table.selected` — a record, or
records), the derive-down/deliver-up idiom for selection-driven detail views.
New doc, drafted by me, ruled by David, before B7.

**D7. The mutation authoring surface.** `data.ts` still cites language §13's
open design: the runtime verbs (`set`/`insert`/`removeAt`/`move`) exist; the
LANGUAGE-level ruling — that handler-called methods on the dataset, now
Pointer-addressed, ARE the authoring surface (plus `<->` for leaf edits) —
was never formally made. The capstone's create/delete/reorder flows force
it. Likely a ratification, not an invention; do it with D3.

**D8. Component briefs + the drag-claim spelling.** Table, DataGrid (column
model: widths, resize, reorder — the datagrid header drag is one of the two
forcing cases for the queue's axis-scoped drag-claim primitive, whose
spelling is David's ruling at that point), Combobox (filter-as-you-type over
a path selection — a JSONPath showcase), context menu. Briefs before build;
the Control-base/value-pattern conventions from the library govern.

## 3. Build order

**B1 — now, no ruling needed (data-paths items 1–2, already ruled):**
refuse-don't-truncate at the path scanner (§2's silent-wrong-programs bug —
`:my-key` compiling to a subtraction dies here), then move path resolution
to compile time (emitted plans; runtime keeps an evaluator only). Pure
correctness + the enabling change for everything after; can start while the
D-docs circulate.

**B2 — Pointer writes** (after D3/D7): the write half, `<->`'s conformance
story, escaping closes the unaddressable-key hole.

**B3 — JSONPath v1 segments** (after D4): index, slice, wildcard — evaluator
+ the §9 reactive tracking (over-approximate, never miss an edge; this is
the actual work, not parsing). Wire the public RFC 9535 compliance suite in
as a test tier scoped to the shipped subset — the conformance claim becomes
checkable, not aspirational.

**B4 — Schema** (parallel-capable after B3): validate-on-receipt, static
`:path` checking, and — new motivation since the ruling — the declared
identity field that materialization prefetch and key retirement can lean on.

**B5 — Materialization** (after B3; ruling D5): in materialization.md §8's
own order — divergence bit + onInit-membership first (small, independently
useful), windowed mode behind the opt-in over uniform extents,
navigate-to-logical-record + windowing-aware AT WITH the windowed match (both
consumers exist before the feature; ruled requirement), the inspector
diagnostic, then the semantic differ (same program + interaction script,
virtualization on/off, assert identical observable state) and frame budgets
at 10³–10⁶ rows.

**B6 — Key retirement** (after B3 selections; full retirement gated on
filters): the structural-equality fallback in the reconciler lands early
(it is independently a robustness win); `key` leaves the surface only when
path selections make the transform-derivation an anti-pattern with a better
home — materialization.md §4's honest migration.

**B7 — Components** (after D6/D8; datagrid after B5): selection model first,
then Table → Combobox → context menus → DataGrid (needs materialization +
the axis-drag claim). Each component is also a substrate test: Combobox
exercises path filtering, Table exercises selection + sort-as-derivation,
DataGrid exercises windowing at scale.

**B8 — The capstone** (everything lands here): the CRUD exemplar against the
D2 backend, styled to the UX bar, with the public proof the field-sentiment
research says wins trust: the 100k-row screen where find-the-record,
selection, keyboard, screen reader, scroll restore, and create/edit/delete
all behave exactly as if fully materialized — written as a plain declaration
with zero virtualization vocabulary in the source. Perceptual + sim-rig
passes; guide chapter and reference prose ride the same increment (the
streams arc's docs-with-the-feature discipline).

## 4. What can start today

1. B1 in full (both halves) — ruled, self-contained, high-value.
2. D1 + D2 drafts for David's ruling (the capstone brief options and the
   persistence recommendation).
3. D3's Pointer-validation memo — it's measurement + a proposal, and David
   asked for the validation explicitly.

Everything else queues behind those three gates.
