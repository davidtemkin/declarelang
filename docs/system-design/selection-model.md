# The selection model (D6)

> **Status: RULED 2026-07-30 (David, in full — §7 is the ledger). B7's
> selection prerequisites are met.** Related: focus-scopes.md (D9,
> adopted in the same conversation) rules how the keyboard ENTERS and LEAVES
> a collection; this doc rules what happens inside.
> Nothing in the record covers selection, and every component in scope needs
> it — Table, DataGrid, Combobox, the Tracker capstone's whole triage flow.
> This doc rules the SEMANTICS; the component briefs (D8) pick the spellings.
> Sources: the capstone brief's selection section (issue-tracker-brief.md
> §3), materialization.md's windowing contract, and the key-retirement
> identity story (materialization.md §4).

## 1. What selection IS (revised in the 2026-07-30 ruling conversation)

The language already has two established interaction patterns, and selection
is not a third: **focus** is a service (one focus per app, the ring, Tab
traversal), and a **control's value** is an attribute the control owns and
gestures deliver up (`checked` on a Checkbox, `text` on a field —
app-ownable, data-bindable). **Selection is the collection control's VALUE.**
A Table's selection is to the Table what `checked` is to a Checkbox: ordinary
reactive attributes on the component, written by its gestures, readable by
any constraint, ownable by the app (derive-down) exactly per the established
value pattern. Nothing new is invented — the model rules what TYPE that
value has and how gestures write it.

## 1a. The decisive constraint

**The value is data-anchored — record identity, never instance identity.**
A selected row that scrolls out of the materialization window and back is
still selected; a sort flip keeps the same records selected (brief criterion
5); an undone delete resurrects the record *and its membership in the
selection* (criterion 8); a bulk operation acts on 200 selected records of
which 30 have instances (criterion 7). None of that is expressible if
selection points at views. Instances *derive* their selected visual from
membership — an instance is a presentation of a selected record, never the
selection itself.

And identity-anchoring is what keeps the model honest PAST the in-memory
premise: the capstone is ruled loaded-once (D2), but real applications page,
and a selection keyed by **identity-field value** stays meaningful when the
record's bytes leave and re-enter memory (a re-fetched copy of issue #4017
is still selected). The model never assumes the dataset is resident — only
that records have identity.

## 1b. Selection without data (raised in the ruling conversation)

Collections have two kinds of members, and selection needs no Dataset:

- A **replicated** member is a *record*; its identity is §2's ladder. The
  record-anchoring above is the REQUIRED specialization here — instances are
  ephemeral under windowing and re-derivation, so pointing at views lies.
- A **written** member is the *authored child itself* — a menu's items, a
  settings list, the desktop's window strip. `selected` yields that child
  view, and pointing at it is honest: written children are permanent,
  named structure that never rebuilds under windowing. The library already
  practices this — **RadioGroup is single-selection over written Radios**
  (group `value`, per-Radio `value`, `checked` derives from the match).

So the general statement: **the selection value holds MEMBERS — a record
when replicated, the written child when authored** — and the two compose in
one collection (replication already splices among written siblings).
Datum-valued conveniences (RadioGroup.value as "the selected member's
value") are DERIVED per component, a D8 brief decision layered on the model,
not part of it.

## 2. Identity (ladder REVISED 2026-07-30 — the invisible version)

David refused declared identity as key-by-another-name; identity needs no
declaration. What identifies a record, in preference order:

1. **The explicit `key = :field` override** — for records whose identity
   has an unconventional name (`:uuid`). Explicit beats convention; it is
   also the migration-path survivor until §4 retires it fully.
2. **The INFERRED convention: a record's own scalar `id` field** — zero
   declaration anywhere; the JSON world's universal spelling. This is what
   Tracker's records carry, and nothing in Tracker's source ever says so.
3. **Structural equality** (the reconciler's fallback, B6-early) — unchanged
   records survive recomputes without identity at all.
4. **Object identity (`===`)** — the floor; sufficient whenever records are
   stable objects (D2's loaded-once world).

The reconciler pools by this exact ladder (replicate.ts idOf), selection
keys by it, and the inspector reports the mode in force
(`windowInfo().identity`) — invisible, but visible when asked. "The row
that stays the same row" and "the record that stays selected" share one
rule by construction.

## 3. The value shape

Selection is the component's value, not data — it does not live in the
Dataset (two tables over one dataset select independently; selection is not
part of the document). On the collection component, per the value pattern:

- `selected` — the PRIMARY selected record (or null): the detail panel's
  anchor, the single-selection value. Reactive, app-ownable (derive-down
  selection is legal, exactly as an app may own `checked`).
- `selection` — the selected records, in presented order. Reactive; equal to
  `[selected]` in single mode.
- The value's CURRENCY: reads yield the RECORD (what a body wants to work
  with); the set inside is keyed by the identity ladder (§2) — by identity-
  FIELD VALUE when a schema/key field exists (the paging-proof form), by
  object identity only in the bare in-memory case.
- Internally: the identity set, plus the **anchor** (where a range starts)
  and the **lead** (the row the keyboard moves — the collection's inner
  cursor). The lead is NOT the app-global focus: the Focus service keeps its
  established meaning (the grid is one tab stop; Tab enters and leaves it),
  and the lead is the component's own state that arrow keys move within it —
  the same relationship tabOrder() traversal already has to inner structure.
  Lead and selection are distinct facts: cmd-arrows move the lead without
  selecting.

Components declare the mode as an attribute — `selection = none | single |
multi` — with `single` the Control-base default where selection means
anything.

## 4. The gesture and keyboard protocol

The standard triad, ruled once so every component agrees:

| gesture | effect |
|---|---|
| click / tap | select exactly this record (anchor + lead here) |
| ⌘-click (ctrl on non-Mac) | toggle this record; anchor moves here |
| shift-click | select the RANGE from anchor to here, in presented order |
| ↑ ↓ (← → on horizontal axes) | move the lead AND selection to the adjacent record |
| shift-arrows | extend the range from anchor to the new lead |
| ⌘-arrows | move the lead alone; Space toggles selection at the lead |
| Home / End (⌘↑ / ⌘↓) | first / last record, same modifiers |

Esc is deliberately ABSENT from this table: under the hierarchical-focus
ruling (focus-scopes.md, D9 — adopted 2026-07-30) Esc universally means
ASCEND ONE LEVEL and never carries collection-specific meanings. Clearing a
selection is an explicit affordance/command — the deselect-all the filter
ruling (§5) already requires.

A **range is a gesture, not a standing constraint**: shift-click computes
"between anchor and lead in the order presented *now*" and commits that SET.
A later sort does not re-derive the range — the selected records simply ride
the new order (criterion 5's exact wording). Platform modifier mapping
(⌘ vs ctrl) is the input layer's existing job, not this doc's.

## 5. Filter narrowing — the brief's open ruling

The capstone brief left one question to D6: a selected record filtered out
of view — dropped, or selected-but-hidden? **Proposal: selected-but-hidden.**
Selection is data-anchored state and a filter is presentation; dropping on
filter would make filter round-trips destructive (narrow to find one issue,
widen, and your careful multi-selection is gone). The honest cost is surfaced
in UX, not semantics: any surface acting on a selection must show the true
count ("200 selected · 40 shown"), and bulk commands act on the WHOLE
selection. A visible deselect-all is required equipment. (If David rules
drop-on-filter instead, only §5 changes — the model is otherwise identical.)

## 6. The reactive integration

- **Derive down**: the detail panel is `datapath = { list.selected }`-shaped
  — a constraint reading the selection state, deriving the master-detail
  relationship with zero navigation code. This is the derive-down half of the
  established idiom.
- **Deliver up**: gestures and keys write selection state through the
  component's own handlers; edits to the RECORD go through the ordinary
  editor sessions to the dataset. Selection changes never mutate data.
- **Efficiency at scale** (implementation only — never user-visible):
  membership is one identity-set lookup; the set carries a version cell so N
  instances tracking "am I selected?" wake once per selection CHANGE, not
  per member. At 100k rows with a window of 30 instances, a select-all
  writes one cell.
- **User-facing numbers are ALWAYS full-dataset**: counts, "N selected",
  "row 4,017 of 100,000" — the window is invisible in every number a user
  or the AT layer sees (the ruled windowing-aware-AT requirement). The only
  second denominator a user ever meets is the FILTER's ("200 selected · 40
  match the filter", §5) — a presentation fact they created, never a
  windowing fact.
- **Windowing (materialization contract)**: everything above is
  instance-free by construction — `selection`, counts, and bulk operations
  read records, and only the ≤window-size instances derive visuals.

## 7. Ruling status (2026-07-30)

1. **RULED** — selection is the collection control's VALUE (§1), holding
   MEMBERS: a record when replicated (identity per §2's ladder, keyed by
   identity-field value when one exists — §1a/§1b), the written child when
   authored (the RadioGroup practice). Datum conveniences derive per
   component (D8). Never stored in the Dataset.
2. **RULED** — selected-but-hidden under filters, with the true-count UX
   obligation (§5). User-facing numbers are always full-dataset; the
   filter's is the only second denominator (§6).
3. **RULED** — modes as the component attribute `selection = none | single
   | multi`, `single` the Control-family default.
4. **RULED (via D9)** — Esc never carries collection meanings; entering and
   leaving the collection is focus-scopes.md's business.
5. **RULED** — the §4 gesture table and the three-facts interaction state
   (selection + keyboard position + anchor), including the ⌘-walk + Space
   discontiguous flow (keyboard parity for discontiguous selection) and
   range-as-gesture. The position concept's NAME is D8's pick.
