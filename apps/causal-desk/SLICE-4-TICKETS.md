# Causal Desk — Slice 4 tickets

Slice 4 turns the complete desktop scenario explorer into a resilient analytical instrument:
responsive down to a phone viewport, fully keyboard-operable, directly editable, motion-safe,
and explicit about invalid input or unavailable calculations.

These tickets preserve the Slice 3 calculation model. The dependency structure remains an
arbitrary fan-in/fan-out DAG, formulas may be non-linear, and attribution remains exact Shapley
subset evaluation. Slice 4 changes presentation and input behavior, not model semantics.

## Execution rules

- Execute tickets in order and complete each ticket's verification before starting the next.
- Keep production code in `.declare` files and every source file below 500 lines.
- Keep all Causal Desk files inside `apps/causal-desk/`.
- Preserve all 36 Slice 3 behavior steps, eight visual states, and the path harness.
- Use current Declare library controls and platform APIs. A shared runtime change requires a
  separately demonstrated language/runtime defect and is not part of these tickets.
- Inspect generated view paths before recording browser tests. Set every viewport explicitly.
- Bless screenshots only after inspecting the rendered images at all three width tiers.
- Review `git status`, stage only named Causal Desk files, and use the conventional commit on
  each ticket. Leave unrelated root pnpm files untouched.

## Responsive contract

| Tier | Width | Arrangement |
|---|---:|---|
| Desktop | `>= 1220px` | Existing graph and inspector side by side |
| Stacked | `720–1219px` | Full-width graph, selected-factor summary, inspector below |
| Mobile | `360–719px` | 16px gutters, scrollable graph viewport, inspector below |

At every tier the document itself has no horizontal overflow. On mobile, only the graph's own
viewport scrolls horizontally; its internal stage stays at least 820px wide so the DAG does not
collapse into overlapping cards.

## Dependency order

```text
CD-S4-00 region extraction
    -> CD-S4-01 responsive frame
        -> CD-S4-02 narrow inspector behavior
            -> CD-S4-03 direct numeric entry
            -> CD-S4-04 keyboard graph traversal
            -> CD-S4-05 reduced motion
            -> CD-S4-06 unavailable and validation states
                -> CD-S4-07 final accessibility and visual gate
```

Tickets 03–05 may be implemented in either order after 02, but sequential execution is safer
because they touch overlapping view classes and tests.

## CD-S4-00 — Extract stable application regions

### Outcome

The current behavior is unchanged, but the main file has room for Slice 4 state and the major
regions can evolve independently.

### Files

- `causal-desk.declare`
- New `causal-desk-model.declare`
- New `causal-desk-layout.declare`
- Existing `causal-desk-inspector.declare`

### Implementation

1. Move `CausalModel`, `FactorCard`, and `EdgeField` into `causal-desk-model.declare`.
2. Extract the existing header, graph, and inspector declarations into `CausalHeader`,
   `CausalGraph`, and `CausalInspector` classes in `causal-desk-layout.declare`.
3. Leave application state, handlers, fixed model/scenario Datasets, and the three region
   instances in `causal-desk.declare`.
4. Include files in dependency order. Reuse the existing inspector helpers and row classes;
   do not duplicate them.
5. Preserve every public path used by `tests/assert.mjs` where practical. If extraction must
   alter a path, update only that path and prove the behavior is unchanged.

### Acceptance and verification

- Every `.declare` file is below 500 lines.
- The main app behavior and all eight screenshots are byte/tolerance-equivalent to the current
  baselines.
- The path harness remains green.

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare --assert apps/causal-desk/tests/assert.mjs
node tools/verify.mjs apps/causal-desk/causal-desk.declare --states apps/causal-desk/tests/states.mjs
node tools/verify.mjs apps/causal-desk/tests/path-harness.declare --assert apps/causal-desk/tests/path-assert.mjs
```

### Commit

`refactor(causal-desk): extract instrument regions`

## CD-S4-01 — Add the responsive frame

### Outcome

Causal Desk preserves its desktop layout and becomes usable at tablet and phone widths without
page-level horizontal overflow or compressed graph geometry.

### Files

- `causal-desk.declare`
- `causal-desk-layout.declare`
- `causal-desk-model.declare`
- `tests/responsive.mjs`

### Implementation

1. Replace the `1120px` app floor with `minWidth = 360`. Add derived tier flags from
   `app.width`: desktop at `>= 1220`, stacked below it, and mobile below `720`.
2. Keep the current desktop coordinates unchanged.
3. In stacked mode, place the header first, graph second, and inspector region after the graph.
   Make the root vertically scrollable when its content exceeds the host height.
4. Reflow the header into labeled rows. Reset stays at the upper right. Put each scenario
   `Segmented` inside its own clipped horizontal rail so its labels retain usable widths.
5. In mobile mode, use 16px outer gutters. Give the graph a fixed internal stage width of at
   least 820px and make the graph viewport `scrolls = x`. The column positions and DAG topology
   remain unchanged inside that stage.
6. Keep the legend inside the graph's content width. Scrolling the graph must move cards and
   edges together.
7. Center the stacked inspector and cap it at 560px. Below that cap, derive all inner widths
   from the inspector width instead of hard-coding `292`.

### Acceptance criteria

- At 1280×800, the existing layout remains unchanged.
- At 900×1000, graph and inspector stack with no overlap.
- At 390×844, the page has no horizontal overflow; the graph alone scrolls horizontally.
- All scenario and comparison choices plus Reset remain reachable at every tier.
- Horizontal graph scrolling keeps card-to-edge alignment exact.
- Selecting scenarios and factors still updates values and the inspector.

### Verification

Create `tests/responsive.mjs`. Assert geometry, internal versus document overflow, and real input
at 1280×800, 900×1000, and 390×844.

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare --assert apps/causal-desk/tests/responsive.mjs
```

### Commit

`feat(causal-desk): add responsive instrument layout`

## CD-S4-02 — Add narrow selected-factor details

### Outcome

On stacked and mobile layouts, selecting a graph card reveals a nearby detail region while the
selected card remains visibly connected to it.

### Files

- `causal-desk.declare`
- `causal-desk-layout.declare`
- `tests/responsive.mjs`

### Implementation

1. Add `inspectorExpanded: boolean`, initially true so Operating Margin still teaches the app
   on first load.
2. Between the stacked graph and inspector, render a compact selected-factor summary containing
   label, current value, signed comparison delta when present, and a Show/Hide Details control.
3. Selecting any factor in stacked mode sets `inspectorExpanded = true`. Hiding details leaves
   the selected card and summary visible and removes the inspector from the vertical flow.
4. The desktop inspector is always visible; the expansion flag does not alter desktop geometry.
5. Keep the inspector's fixed heading/value area and native vertical detail scroller. Ensure its
   notice never overlays scrollable content.
6. Keep selection stable while resizing across tiers. Do not automatically scroll the page when
   a card is selected.

### Acceptance criteria

- A mobile card press opens details for that exact factor.
- Hide Details collapses only the inspector; Show Details restores it with the same selection.
- Resizing desktop → mobile → desktop preserves factor, scenario, comparison, and contribution
  selection when still valid.
- The selected summary and inspector never disagree about label, value, unit, or delta.
- All stacked controls have at least a 44×44px pointer target.

### Verification

Extend `tests/responsive.mjs` with real card selection, collapse/expand, state-preserving resize,
and minimum-target assertions at 900×1000 and 390×844.

### Commit

`feat(causal-desk): add narrow factor details`

## CD-S4-03 — Add direct numeric assumption entry

### Outcome

An analyst can type an exact assumption value, commit it with Enter or Apply, and recover cleanly
from invalid input without corrupting the working scenario.

### Files

- `causal-desk-logic.declare`
- `causal-desk-inspector.declare`
- `causal-desk.declare`
- New `tests/numeric-entry.mjs`

### Input contract

- Percent assumptions are entered in human units: `5.5` or `5.5%` becomes `0.055` internally.
- Jet fuel price accepts `4.25` or `$4.25`. Commas and surrounding whitespace are ignored.
- Empty, partially numeric, non-finite, and out-of-range values are rejected.
- Bounds are inclusive and come from the selected factor's existing `min` and `max`.
- Enter and Apply use one commit method. Escape restores the current modeled value.

### Implementation

1. Add one parsing helper returning `{ ok, value, message }`; keep parsing separate from scenario
   mutation and do not use `parseFloat` acceptance of trailing garbage.
2. Add app-owned draft text and validation message. Synchronize them when factor, scenario,
   slider value, reset action, or successful commit changes the selected assumption.
3. Add a labeled `TextInput` and Apply button beside or immediately below the existing slider.
   Preserve the slider; both controls call the same assumption mutation seam.
4. A valid commit forks a bundled scenario into Working exactly as the slider does. An invalid
   commit keeps the previous scenario/value and exposes an inline text error.
5. Give the field an accessible unit hint and keep the error visible without relying on color.

### Acceptance criteria

- Fuel Shock fuel price entered as `$4.25` produces Working value `4.25`.
- Demand growth entered as `5.5%` produces `0.055`.
- Boundary values succeed; one-step-beyond values, `NaN`, infinity, empty text, and `4.2abc` fail.
- Invalid input changes neither active scenario nor model values.
- Escape clears the error and restores the current formatted draft.
- Entry works at desktop and mobile widths and never falls below a 44px touch target on mobile.

### Verification

Drive the field with real typing, Enter, Apply, and Escape in `tests/numeric-entry.mjs` at
1280×800 and 390×844.

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare --assert apps/causal-desk/tests/numeric-entry.mjs
```

### Commit

`feat(causal-desk): add direct assumption entry`

## CD-S4-04 — Add dependency-order keyboard traversal

### Outcome

The complete model graph can be traversed, selected, and explained without a pointer.

### Files

- `causal-desk-logic.declare`
- `causal-desk-model.declare`
- `causal-desk.declare`
- New `tests/keyboard.mjs`

### Keyboard contract

- Tab and Shift+Tab visit visible factor cards in model document order, which is topological.
- Enter and Space select the focused factor through `FactorCard.press()`.
- Arrow Down/Up move to the next/previous visible factor in topological order.
- Arrow Right moves to the closest visible immediate dependent by `rowY`.
- Arrow Left moves to the closest visible immediate dependency by `rowY`.
- Ties use model document order. Boundaries are no-ops; traversal does not wrap.

### Implementation

1. Add pure helpers that return ordered visible IDs and the next ID for a key. Use model data,
   not screen coordinates or hard-coded card indexes.
2. In the cards container, find the replicated `FactorCard` whose `factorId` matches the helper
   result, call `Focus.focus(card)`, and update selection so the inspector follows focus.
3. Override `FactorCard.onKeyDown` with the stated arrows plus the existing non-repeating
   Enter/Space activation behavior.
4. Hidden constants never receive focus. Horizontal graph scrolling must reveal the newly
   focused card with `scrollIntoView("nearest")` on mobile.
5. Preserve the standard app-level focus ring and visible keyboard modality.

### Acceptance criteria

- A keyboard-only route can choose Fuel Shock, focus Jet Fuel Price, select it, change its
  slider, focus Operating Margin, and select the largest contribution.
- Average Fare Arrow Right reaches Revenue. Revenue Arrow Right deterministically reaches
  Operating Income, the closest dependent by `rowY`.
- Operating Margin Arrow Right and Demand Growth Arrow Left are no-ops.
- Mobile traversal scrolls the graph internally without moving the page horizontally.

### Verification

Implement `tests/keyboard.mjs` entirely with Tab, Shift+Tab, arrow, Enter, and Space events after
the initial viewport setup; assert both focus and selection.

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare --assert apps/causal-desk/tests/keyboard.mjs
```

### Commit

`feat(causal-desk): add keyboard graph traversal`

## CD-S4-05 — Add reduced-motion mode

### Outcome

Scenario propagation can update instantly without spring interpolation or overshoot.

### Files

- `causal-desk.declare`
- `causal-desk-model.declare`
- `causal-desk-layout.declare`
- New `tests/reduced-motion.mjs`

### Implementation

1. Add `reducedMotionOverride: boolean = false` and derive effective reduced motion as
   `reducedMotionOverride || app.env.reducedMotion == true`. Add a clearly labeled user control
   for the override in the header/settings area. When the host supplies no environment signal,
   the visible override is the source of truth; a host-requested reduction cannot be turned off.
2. Split each card's animated scalar from its displayed scalar. In normal mode the display reads
   the spring-driven value; in reduced mode it reads `currentValue` directly.
3. Bind the card spring's `paused` state to reduced motion so hidden animation work also stops.
4. Toggling reduced motion while a spring is active must snap immediately to the current value.
   Toggling it off resumes future transitions from a coherent value.
5. Do not add timers or duplicate calculation state.

### Acceptance criteria

- Normal mode still produces observable intermediate `shownValue` values before settling.
- Reduced mode exposes the final displayed value in the first settle after a scenario change.
- Reduced mode produces no overshoot and `settleMotion()` has nothing app-authored to wait for.
- The preference works at all viewport tiers and does not change calculated values.

### Verification

Test both an environment-seeded state and the visible toggle in `tests/reduced-motion.mjs`.

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare --assert apps/causal-desk/tests/reduced-motion.mjs
```

### Commit

`feat(causal-desk): honor reduced motion`

## CD-S4-06 — Make validation and calculation failures explicit

### Outcome

Invalid analyst input and non-finite model results produce distinct, readable states; neither is
silently presented as zero or as an ordinary no-delta comparison.

### Files

- `causal-desk-logic.declare`
- `causal-desk-layout.declare`
- `causal-desk-inspector.declare`
- `tests/numeric-entry.mjs`
- New `tests/error-state.mjs`

### Implementation

1. Add a helper that verifies every shown active and comparison factor is finite. Derive one
   calculation status from model values rather than storing a second status flag.
2. Add a persistent status line: model scope, illustrative-data notice, and either `CALCULATION
   OK` or `CALCULATION UNAVAILABLE` with explanatory text.
3. When the selected result is non-finite, show `Unavailable`, hide its delta, suppress ordinary
   contribution rows, and show `Contribution unavailable because the scenario calculation did
   not produce a finite result.`
4. Keep `No modeled delta for this comparison.` exclusively for two finite equal results.
5. Keep direct-entry parse/range errors local to the field. They must not trigger the model-level
   unavailable state because rejected input never enters the model.
6. Fault-inject a zero-revenue working case only inside `tests/error-state.mjs` by replacing the
   test instance's Dataset document. Do not add a production debug command or broaden input ranges.

### Acceptance criteria

- Rejected text shows a field error while global calculation status remains OK.
- A fault-injected zero-revenue case shows the unavailable state in its card, inspector, bridge,
  and status line without displaying `NaN`, `Infinity`, or a false zero.
- Returning to Base restores calculation OK without reload.
- All error copy is visible as text and does not rely on red color alone.

### Verification

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare --assert apps/causal-desk/tests/numeric-entry.mjs
node tools/verify.mjs apps/causal-desk/causal-desk.declare --assert apps/causal-desk/tests/error-state.mjs
```

### Commit

`feat(causal-desk): expose calculation errors`

## CD-S4-07 — Lock the responsive accessible instrument

### Outcome

Slice 4 has complete behavior, accessibility, and inspected visual coverage at desktop, tablet,
and mobile widths, with the design status accurately recorded.

### Files

- All Causal Desk test scripts as needed
- `tests/states.mjs`
- `tests/baselines/*.png`
- `DESIGN.md`
- Production files only when a final gate exposes a defect

### Implementation

1. Add named visual states at 1280×800, 900×1000, and 390×844 covering Base, Fuel Shock bridge,
   contribution path, assumption entry, validation error, no delta, and unavailable calculation.
2. Add a mobile state with the graph horizontally scrolled and another with details collapsed.
3. Inspect every baseline for overlap, accidental clipping, unreadable text, numerical wrapping,
   focus visibility, touch-target size, and page-level overflow before blessing.
4. Run a keyboard-only concept loop and a mobile pointer concept loop through public controls.
5. Update `DESIGN.md` to mark Slices 1–4 complete. Keep optional persistence explicitly deferred.

### Definition of done

- The original 36-step behavior contract and path harness pass.
- Responsive, numeric-entry, keyboard, reduced-motion, and error-state scripts all pass.
- Every named visual state passes after its baseline has been inspected.
- `node test/verify-apps.test.mjs` passes repository-wide.
- Every source file remains below 500 lines and Causal Desk files remain in one folder.
- No known Slice 4 defect is hidden behind a baseline update.

### Commit

`test(causal-desk): cover responsive instrument`

## Slice 4 definition of done

Slice 4 is complete only when all eight tickets are committed, every ticket-specific verifier is
green, all three viewport tiers have inspected visual baselines, the repository-wide app suite
passes, and the updated `DESIGN.md` leaves only optional persistence outstanding.
