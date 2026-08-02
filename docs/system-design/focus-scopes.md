# Hierarchical focus scopes (D9)

> **Status: ADOPTED 2026-07-30 (David — direction and the three core rules
> ruled in the D6 conversation); this doc is the design record, PROPOSED in
> its details. Gates the grid parts of D8/B7.** Origin: the observation that
> a data-entry grid (a government tax form, every spreadsheet) wants Tab to
> move cell-to-cell INSIDE it — while a browse list wants Tab to move PAST
> it — and that "entering into" a control, with the component controlling
> inner focus and Esc exiting, generalizes far beyond grids.

## 1. What exists elsewhere, in pieces

- **ARIA composite widgets** (grid/listbox/tree/toolbar): one tab stop;
  arrows navigate inside; and genuinely two levels — Enter/F2 descends into
  a cell's widget, Esc ascends. The most principled prior art, scoped to
  widgets.
- **Spreadsheets / entry grids**: the grid CAPTURES Tab (next cell), Enter
  moves down, F2 edits, Esc cancels the edit. Right for entry-shaped work;
  the exit is the historic weakness (F6/Ctrl+F6 pane-cycling), and WCAG's
  "no keyboard trap" rule exists because capture-without-exit is a failure.
- **Pane cycling** (F6) and **VS Code's Ctrl+M** ("Tab moves focus"): the
  same tension solved at other levels with bespoke keys.

Nobody ships the uniform rule. Declare can, because the view tree already
provides the hierarchy.

## 2. The model — three ruled rules

**Focus is a SCOPE TREE over the view tree.** A composite control may
declare itself a focus scope; the App is the root scope; dialogs and menus
are scopes; scopes nest (grid → cell → cell's editor).

1. **Tab traverses siblings within the CURRENT scope** (today's `tabOrder()`
   protocol, now applied per-scope instead of flattened).
2. **Entry policy is the COMPONENT'S declaration** (ruled — per-component
   mode, never one global rule):
   - *land-as-one-stop* (browse collections): Tab lands on the composite as
     one stop and moves past it; arrows navigate inside (the
     selection-model.md protocol); an explicit descend (Enter, or
     click/edit) enters a member's own scope when it has one.
   - *auto-descend-and-capture* (entry grids, form grids): Tab entering the
     composite descends immediately and walks the inner stops (cell to
     cell — the spreadsheet/tax-form convention).
3. **Esc universally ASCENDS one level** (ruled): out of the cell's editor,
   then out of the cell, then out of the grid; out of the menu; out of the
   dialog (where the dialog's own semantics allow). Esc never carries
   component-specific meanings — cancel-edit, close-menu, dismiss-dialog
   were always "up" in spirit, and selection-clearing is ruled OFF Esc
   (selection-model.md §4: clearing is an explicit affordance). The
   keyboard-trap problem dissolves by construction: capture is always
   escapable, by the same key, at every level.

## 3. What this touches

- **The Focus service** stays the single owner of "where the keyboard is";
  it gains the scope stack (the path of scopes containing the focus). The
  focus ring keeps working — it draws at the innermost focused stop.
- **`tabOrder()`** becomes per-scope: a scope's order lists its own stops;
  a composite is one stop in its parent's order (land-as-one-stop) or a
  scope boundary Tab flows through (auto-descend).
- **Dialogs and menus** shed bespoke focus code: modality is "the scope you
  cannot Tab out of, only Esc/complete out of."
- **The AT layer**: scope entry/exit is exactly what screen readers model
  (entering a grid announces "grid, 100,000 rows"); the windowing-aware AT
  requirement composes with this unchanged.
- **selection-model.md**: rules what happens INSIDE a collection scope
  (selection, keyboard position, anchor); this doc rules how the keyboard
  gets in and out. The two meet at the boundary and neither reaches across.

## 4. The details, PROPOSED (2026-07-30, with the D8 briefs — one ruling sitting)

- **The descend verb**: **Enter or F2, both** (ARIA practice; F2 is the
  spreadsheet-literate spelling, Enter the general one). Components may
  narrow it; none may invent a third.
- **Capture claims Enter**: **yes** — inside a `capture` scope Enter is the
  scope's (spreadsheet row-advance being the canonical use), per-component
  like the rest of the policy. In a `stop` scope Enter descends (above).
- **The declaration spelling**: **`focusScope = stop | capture`** on the
  composite (absent = an ordinary container, today's flat behavior).
  `stop`: land-as-one-stop, arrows/inner protocol inside, Tab passes.
  `capture`: Tab auto-descends and walks the inner stops — the
  tax-form/spreadsheet convention. ("scope"-free spellings like
  `tabs = through | inside` were considered; `focusScope` names the concept
  this doc rules and greps to it.)
- **F6 / top-level scope cycling**: **not in v1** — Esc + Tab cover the
  corpus; revisit only if a real multi-pane app asks.
- **Shift-Tab**: exits a captured scope BACKWARDS from its first stop
  (never wraps) — strict mirror of Tab's entry, so a keyboard user can
  always retreat the way they came.
