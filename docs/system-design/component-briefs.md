# The data-component briefs (D8)

> **Status: RULED 2026-07-30, ALL FOUR BUILT 2026-07-31** — Table
> (library/table.declare, test/table.test.mjs), then Combobox, ContextMenu,
> and DataGrid/Column/GridRow (library/combobox.declare,
> library/contextmenu.declare, library/datagrid.declare;
> test/components.test.mjs), shown together in the redesigned
> apps/component-sampler. Build notes worth keeping: DataGrid's header rides
> the windowing kernel's leading anchor (a vertical SimpleLayout composes
> with windowing — the two-halves suspension in replicate.ts/layout.ts);
> aria-colcount/colindex and the narrow-width priority degrade are the
> noted v1 deferrals.
>
> **Ruling record: RULED 2026-07-30 (David: "I accept all of the
> recommendations in the doc") — all seven §7 points ratified; B7 was
> unblocked and built in §7.6's order.** Four briefs — Table, Combobox, ContextMenu, DataGrid — in the intake
> sense: ends and constraints, not means; the implementing sessions derive
> structure from here. Plus the three decisions earlier rulings parked at
> D8's doorstep: the axis-scoped drag-claim spelling (proposed in
> [claim-surface.md](claim-surface.md) §New-claims), the departure hook's
> name, and the keyboard-position name. §6 lists everything this asks David
> to ratify, so the whole component layer can be ruled in one sitting.

## 1. The shared ground (all ruled — briefs inherit, never re-litigate)

Every component here rides the ruled contracts and the data substrate as-is:

- **Control base** (components-baseline.md Contract 3): `hot`/`down`,
  `disabled`-inert, keyboard activation, press-cancel.
- **Value exposure** (Contract 1): data-agnostic; semantic value names; the
  three-form gradient; `input(v)`-style delivery where the app owns state.
- **Selection** (selection-model.md, RULED): selection is the collection's
  VALUE holding members; the identity ladder (key > inferred id >
  structural > object); the three-facts protocol; selected-but-hidden with
  true counts.
- **Materialization** (materialization.md, BUILT): the `materialize` policy
  slot; the invisibility contract; the kernel window API; windowing-aware
  AT. Collections here are its consumers, never re-implementers.
- **Focus scopes** (focus-scopes.md, ADOPTED): Tab-within-scope, Esc
  ascends, per-component entry policy — §5 below carries the D9 details as
  concrete proposals.
- **Sizing** (Contract 4), **theming** (Contract 2), and the **Process**
  discipline (literate source, prose, guide fence, eval questions).

## 2. Table — the list collection, componentized

**What it is.** The styled, selection-bearing, scroll-owning frame around a
replicated (or written) collection — the thing every app hand-rolls today
with a scroller + a `datapath = :rows[]` block. Tracker's triage list is a
Table.

**Ends.**
- One member child is the ROW TEMPLATE (replicated over the collection) —
  or the rows are written children (selection-model.md §1b); Table treats
  both as members.
- `selection = none | single | multi` (default single); `selected` /
  `selection` per the ruled model; the full §4 gesture/keyboard protocol,
  including the ⌘-walk; the keyboard position exposed as the component's
  inner cursor (its name — §4 below).
- Owns its scroll box (`scrolls = y`); passes `materialize` through to the
  block; at scale the AT hears logical counts (already landed).
- **Sort is a derivation, never a view-side act**: a Table displays the
  order its collection has; sorted views are derived datasets (or, later,
  path selections). Table MAY expose a `sortOn` convenience that *names*
  the derivation, but the truth stays in data.
- Focus policy: **land-as-one-stop** (browse); Enter descends into a row's
  own scope where one exists (§5).

**Constraints.** Zero materialization vocabulary in the row template;
selection survives sort/filter/windowing by construction (it rides the
ruled model, not Table code); no aggregation over instances anywhere (the
counts come from data).

**Substrate it proves:** the selection model end to end; membership
lifecycle under keyed/inferred identity; the focus-scope stop policy.

## 3. Combobox — filter-as-you-type over a collection

**What it is.** A text field owning a QUERY plus a dismissable option list
owning a CHOICE — the canonical "derived selection over data" control, and
the path-machinery showcase once filters land.

**Ends.**
- Composition, not invention: Field/TextInput for the entry; the Menu
  machinery (overlay, raise, light-dismiss, Escape-ascends) for the list;
  a derived collection for the matches (`Dataset [ contents = { … } ]`
  today; the filter selector when B-filters land — the brief's design must
  not care which).
- Value pattern: `value` is the chosen member (record or written option —
  the selection model's currency); the field's text is the query, seeded
  from the choice, editable; `input(v)` delivery for app-owned use.
- Keyboard: typing filters live; arrows move the option-list's keyboard
  position; Enter picks (delivers + closes); Esc ascends (closes the list,
  then leaves the control — the focus-scope rule). The list is never a tab
  stop of its own.
- Touch: tap opens, tap picks; the list respects the enclosing scroll
  regime (no claim beyond the overlay's own).

**Constraints.** Filtering is a data derivation (live count available for
free); no scan of rendered rows; the option list is a collection like any
other — `materialize` applies if someone binds 100k options to it.

**Substrate it proves:** derived-selection reactivity at typing speed;
single-selection as the collection value; overlay + focus-scope
composition.

## 4. ContextMenu — the right-click/long-press menu

**What it is.** Menu's machinery (already shipped: overlay, raise, the Mac
light-dismiss rule, Escape chains) with a GESTURE-opened entry and
pointer-anchored placement.

**Ends.**
- Opens on the platform's context gesture: `contextmenu` (right-click /
  two-finger tap) on fine pointers; **hold** on touch — the hold gate
  exists (claim-surface); this brief makes long-press-for-context its
  second consumer (Contract 3 deferred it "until a consumer forces it";
  this is that consumer).
- Anchors at the pointer, flips at viewport edges (Menu's own placement
  discipline).
- Items are written children (the menu practice) or replicated over data
  (bulk actions over a selection — Tracker's row menu); picking delivers
  through the ordinary activation path and closes.
- Esc ascends; outside-click closes-and-swallows (the resolved Mac rule).
- The OPENING view declares it: a `contextMenu:`-shaped member on the view
  it serves (exact spelling at build; the brief's constraint is that it is
  declared where it applies, discoverable in source).

**Constraints.** No new overlay machinery — if ContextMenu needs something
Menu lacks, Menu grows it and both ride; the hold-to-open claim follows the
claim-surface rule (derives from the declaration; engages at the hold,
never at touchdown).

**Substrate it proves:** the hold gate as a semantic gesture; menu
machinery under replication.

## 5. DataGrid — columns, headers, and the drag claims

**What it is.** The capstone-grade component: the Table contract plus a
COLUMN MODEL — headers, sortable, reorderable and resizable by drag,
touch-correct — over a windowed collection. "100,000 rows, smooth" is this
component's credibility bar (materialization.md §6), and the header drag is
the forcing case the axis-scoped claim was designed for.

**Ends.**
- **Columns are written members** of the grid: `Column [ title = …, … ]`
  declaring what a cell shows (a `:path` for the common case; a cell
  template for the rich case). Written members ride selection-model §1b
  semantics: permanent, authored, identity = the child.
- **Column order and widths are the grid's value-pattern state** (Contract
  1 form b): reorder and resize deliver up (`input`-style) so an app may
  own them (persisted layouts); standalone grids own them locally. Widths
  are plain values — the Field `labelWidth` discipline; no aggregation.
- **Header interactions**: click sorts (naming a derivation, per Table's
  rule); horizontal drag REORDERS; edge drag RESIZES — all three on touch,
  where the drag **claims the x axis only** and the page keeps vertical
  pan: `claim = x` (the axis-scoped drag claim, proposed in
  claim-surface.md — brief criterion 13 of the Tracker verbatim).
- Windowed via `materialize` (auto at Tracker scale); the grid is the
  layout-aware-windowing customer if uniform extents don't suffice —
  otherwise it positions rows the way the kernel already does.
- Focus policy: **land-as-one-stop, browse mode** in v1 (arrows navigate
  rows; the D6 protocol whole). Entry-mode grids (`focusScope = capture`,
  the tax-form convention) are §5's ruling and a later increment — the
  brief only requires that nothing in DataGrid v1 forecloses it.
- AT: rows already speak logical position; the grid adds the column
  dimension (`aria-colcount`/`colindex` on the DOM backend — the same
  Surface seam).

**Constraints.** Same virtualization invisibility as everywhere (the
differ runs against the grid too); the column model must degrade
deliberately at narrow widths (priority, not squish — the Tracker UX bar);
zero instance aggregation (a column's width never derives from measuring
cells — measured auto-fit, if ever, is a later, explicitly-designed
increment).

**Substrate it proves:** the axis-scoped claim on real hardware; windowing
under a column model; selection at 100k; the whole Tracker table view.

## 6. The parked namings (proposals)

- **The departure hook** (D5 delegated the name): **`onRetire`** — fires
  when the member's PRESENCE ends (leaves the match, subtree removal, State
  unapply), never on window eviction; the exact symmetric of the
  membership-anchored `onInit`. "Retire" is the runtime's own teardown
  vocabulary (`runRetire`, node.ts), and `onRemove` risks reading as
  "removeChild happened" while `removeAt` is a data verb. Alternatives
  considered: `onRemove`, `onLeave`.
- **The keyboard position** (D6 delegated the name): **`active`** — the
  member the keyboard is standing on: `table.active`, distinct from
  `selected`. It is ARIA's own word for exactly this (active descendant),
  reads as a noun-adjective in source, and "lead" is platform-internal
  jargon while `cursor` is taken by datapaths. Noted collision: streams use
  an `active` attribute (connection gating) — different class families,
  never one element; judged acceptable. Alternatives: `lead`, `current`.
- **The axis-scoped drag claim**: `claim = x | y | both` on the
  drag-declaring view — full proposal and deference table in
  [claim-surface.md](claim-surface.md), where all claims live by rule.

## 7. What this asks David to ratify

1. The four briefs (§2–§5) as the B7 build contracts — ends and
   constraints as written.
2. `claim = x | y | both` as the axis-scoped drag-claim spelling
   (claim-surface.md's proposed row and deference).
3. `onRetire` as the departure hook's name.
4. `active` as the keyboard-position name on collections.
5. The §5-adjacent D9 details as proposed in focus-scopes.md §4 (descend =
   Enter or F2; capture claims Enter for row-advance; the
   `focusScope = stop | capture` spelling; shift-Tab exits backwards;
   no F6 in v1).
6. Build order within B7: selection substrate → Table → Combobox →
   ContextMenu → DataGrid — each landing with its docs and eval questions
   per the Process discipline.
