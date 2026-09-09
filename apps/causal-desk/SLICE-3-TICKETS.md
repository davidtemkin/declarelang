# Causal Desk — Slice 3 tickets

Slice 3 makes an active scenario explainable against a user-selected comparison scenario.
The finished loop is: choose two scenarios, select a derived result, read an exact Shapley
bridge for its modeled delta, then select a contribution to highlight every dependency path
from that assumption to the result.

The dependency structure is an arbitrary directed acyclic graph, not a chain or tree. A
factor may feed several formulas, several branches may merge into one formula, and the same
root assumption may reach a result through multiple branches. Formulas may be non-linear
and may contain interactions between assumptions. Slice 3 must preserve those properties;
only cyclic and time-dependent models remain outside the first-release boundary.

These tickets are deliberately prescriptive. An implementing agent should not redesign the
feature, change the financial model, or move Causal Desk code outside this folder.

## Execution rules

- Execute tickets in order. Each ticket depends on the preceding tickets unless stated
  otherwise.
- Keep production code in `.declare` files. TypeScript inside Declare's native `script {}`
  block is allowed; do not add an application-side JavaScript module.
- Keep each source file below 500 lines. Extract cohesive UI classes into an included
  `.declare` file before either existing source file reaches that limit.
- Preserve the fixed airline model, bundled scenario values, working-scenario behavior,
  graph geometry, and existing Slice 1–2 tests.
- Use `Dataset.set([], value)` when replacing a Dataset document.
- Do not guess replicated or library-generated view paths. Run the app, inspect its public
  view tree, and then record the observed paths in browser tests.
- Run the verification command listed in every ticket. Do not bless visual baselines until
  the rendered image has been inspected.
- Work on `feat/causal-desk`. Review `git status`, stage only named Causal Desk files, and
  make the conventional commit shown on each ticket.

## Dependency order

```text
CD-S3-01 comparison state
    -> CD-S3-02 Shapley engine
        -> CD-S3-03 contribution bridge
            -> CD-S3-04 path selection
                -> CD-S3-05 acceptance and visual coverage
```

## CD-S3-01 — Make the comparison scenario selectable

### Outcome

The active scenario can be compared with any bundled scenario instead of always comparing
with Base. Working remains valid as the active scenario but is not offered as a comparison.

### Files

- `causal-desk.declare`
- `tests/assert.mjs`

### Implementation

1. Add `comparisonScenarioId: string = "base"` to `App`.
2. Add `comparisonScenarioLabel`, derived with the existing `scenarioLabel` helper.
3. Change `CausalModel.comparisonValues` to evaluate `app.comparisonScenarioId`; remove the
   hard-coded `"base"` argument.
4. Add `selectComparison(id: string)`. Accept only IDs present in `scenarioDocument` and
   reject `"working"`. Do not change `activeScenarioId`.
5. Add a compact, clearly labeled comparison `Segmented` control to the header. Its choices
   are Base, Fuel, Downturn, and Squeeze. Keep the existing active-scenario picker and Reset
   action. Rebalance their widths inside the existing header; do not change the app's
   `minWidth` in this ticket.
6. Replace every visible hard-coded `BASE` comparison label with the comparison scenario's
   label. This includes the header subtitle, inspector value label, inspector delta suffix,
   and any graph legend/reference copy.
7. `resetModel()` must reset both active and comparison scenario IDs to `"base"`.
8. Correct percentage-delta wording while touching these labels: a delta between two
   percentage values is expressed in percentage points (`pp`), not percent. For example,
   Fuel Shock operating margin versus Base is `−7.2 pp` after display rounding.

### Acceptance criteria

- On startup, both active and comparison IDs are `base` and all deltas are hidden.
- Selecting Fuel Shock as active leaves the comparison at Base and operating margin is
  approximately `0.1145631`, versus Base at approximately `0.1861222`.
- Selecting Downturn as the comparison changes `comparisonScenarioId` without changing the
  active scenario or selected factor.
- Node reference values, changed styling, edge styling, and inspector delta all react to the
  new comparison.
- Reset All returns both selectors to Base.
- Existing assumption editing still forks into Working.

### Verification

Extend `tests/assert.mjs` to exercise the new selector with real clicks and assert both IDs
and at least one changed comparison value. Then run:

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare \
  --assert apps/causal-desk/tests/assert.mjs
```

### Commit

`feat(causal-desk): add scenario comparison`

## CD-S3-02 — Compute exact Shapley contributions

### Outcome

For a selected derived factor, the model produces deterministic contributions from every
root assumption whose active and comparison values differ. Contributions sum to the exact
modeled delta within floating-point tolerance.

### Files

- `causal-desk-logic.declare`
- `causal-desk.declare`
- `tests/assert.mjs`

### Data contract

Return a document shaped as follows:

```text
{
  rows: [
    {
      id: string,
      label: string,
      value: number,
      formatted: string,
      absoluteValue: number
    }
  ],
  total: number,
  residual: number
}
```

`total` is the sum of row values. `residual` is `selected active value - selected comparison
value - total`. Rows are sorted by descending `absoluteValue`, with model factor order as
the deterministic tie-breaker.

### Implementation

1. Add typed helpers for extracting the fully populated active and comparison assumption
   maps. Reuse `scenarioAssumptions`; do not duplicate its default-merging logic.
2. Determine the changed root assumptions in model factor order. Include only factors with
   `kind == "assumption"` whose two values satisfy `materiallyDifferent`.
3. Implement Shapley attribution with the subset-weight formula. For each changed assumption
   `i`, enumerate subsets `S` of the other changed assumptions and accumulate:

   ```text
   |S|! * (n - |S| - 1)! / n! * (f(S union {i}) - f(S))
   ```

   Start each synthetic case from the comparison assumption map. Applying a member of a
   subset means replacing that assumption with its active value. Evaluate cases with the
   existing `computeModel` function and read only the selected factor.
   This full-case reevaluation is required because formulas can be non-linear and assumptions
   can interact. Do not replace it with derivatives, path weights, proportional allocation,
   or a sum of one-assumption-at-a-time deltas.
4. Return no rows when the selected factor is not derived, no assumptions changed, or either
   selected result is non-finite. Do not silently turn a non-finite result into zero.
5. Format each row in the selected factor's unit. Percentage contributions use signed `pp`.
6. Add `contributionData: Dataset` to `CausalModel`, derived from model data, both scenario
   assumption maps, and `app.selectedFactorId`.
7. Do not round any value before attribution. Rounding is display-only.

### Fixed numerical oracle

For Fuel Shock active, Base comparison, and Operating Margin selected, the unrounded results
must be approximately:

| Contribution | Value |
|---|---:|
| Jet fuel price | `-0.1002507707` |
| Average fare | `+0.0286916616` |
| Total / modeled delta | `-0.0715591091` |

Use tolerance `1e-9` for the sum invariant and `1e-7` for individual oracle values.

### Acceptance criteria

- Fuel Shock produces exactly two contribution rows in the order shown above.
- The contribution total equals active minus comparison for Revenue, Operating Expense,
  Operating Income, and Operating Margin.
- Reversing active and comparison reverses contribution signs without changing their
  absolute magnitudes beyond tolerance.
- Selecting an assumption produces zero rows.
- Active equal to comparison produces zero rows, total zero, and residual zero.
- The algorithm supports all six root assumptions; it is not special-cased for Fuel Shock.

### Verification

Expose the contribution Dataset through the normal app model and extend `tests/assert.mjs`
with the fixed oracle and invariant checks. Use the browser bridge's inspected attributes;
do not copy the attribution algorithm into the test. Run:

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare \
  --assert apps/causal-desk/tests/assert.mjs
```

### Commit

`feat(causal-desk): calculate scenario contributions`

## CD-S3-03 — Render the contribution bridge

### Outcome

The derived-factor inspector shows an explicit, readable bridge from the comparison value
to the active value. Each changed assumption is a real selectable control.

### Files

- `causal-desk.declare`
- Optionally a new included `causal-desk-inspector.declare` if needed to keep files focused
  and below 500 lines
- `tests/assert.mjs`

### Implementation

1. Add a `ContributionRow extends Control` class. It contains the assumption label, signed
   formatted contribution, and a horizontal magnitude bar. Positive and negative values
   must differ by both sign and color.
2. Scale bars against the largest `absoluteValue` in the current contribution document.
   Guard the zero denominator; a zero maximum renders zero-width bars.
3. In the derived-factor inspector, add a section labeled `MODELED DELTA BRIDGE` after the
   formula and before immediate dependencies.
4. Show comparison value, contribution rows, and active value as one semantic sequence.
   Include text stating that the rows explain a modeled scenario delta and are not proof of
   real-world causal impact.
5. Keep immediate dependencies available. Put the inspector's detail content in a clipped
   `scrolls = y` body if the combined formula, bridge, and dependency rows exceed the fixed
   inspector height. Keep the title and current value visible above that scrolling body.
6. For a derived factor with no changed assumptions, show `No modeled delta for this
   comparison.` instead of an empty list.
7. For an assumption selection, preserve the existing editor and do not show the bridge.
8. Add `selectedContributionFactorId: string = ""` and
   `selectContribution(id: string)`. A row press selects its assumption; pressing the
   selected row again clears the selection.
9. Clear contribution selection when the active scenario, comparison scenario, or selected
   factor changes, and when Reset All runs.

### Acceptance criteria

- Fuel Shock versus Base for Operating Margin shows two rows: Jet fuel price `−10.0 pp`
  first and Average fare `+2.9 pp` second.
- The displayed bridge starts at Base `18.6%` and ends at Fuel Shock `11.5%`.
- The unrounded Dataset still satisfies the exact sum invariant; displayed rounding may
  differ by at most `0.1 pp`.
- Every row has pointer and keyboard activation through `Control` behavior.
- The empty state appears when active and comparison are the same.
- No bridge appears for an assumption factor.
- Immediate dependency rows remain reachable and readable at a 1280×800 viewport.

### Verification

Extend `tests/assert.mjs` to assert row count, row order, displayed values, empty state, and
toggle selection with real clicks. Run:

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare \
  --assert apps/causal-desk/tests/assert.mjs
```

### Commit

`feat(causal-desk): show modeled delta bridge`

## CD-S3-04 — Highlight contribution paths

### Outcome

Selecting a contribution highlights every visible dependency edge and factor on every path
from that root assumption to the currently selected result.

### Files

- `causal-desk-logic.declare`
- `causal-desk.declare`
- `tests/assert.mjs`

### Implementation

1. Add a cycle-safe `reachable(document, fromId, toId)` graph helper over the full adjacency
   list. Track visited IDs even though the supported model is a DAG; malformed future data
   must not recurse forever. Do not stop after finding or walking one branch.
2. An edge `(u, v)` is on a contribution path from root `r` to target `t` exactly when
   `reachable(r, u)` and `reachable(v, t)` are both true. Add a named helper for this rule.
   Apply the rule independently to every edge so fan-out, fan-in, and reconverging branches
   are all highlighted.
3. A factor is on the selected contribution path when it is the root, the target, or lies on
   at least one qualifying edge. Add a named helper rather than duplicating traversal logic
   in `FactorCard`.
4. Pass `selectedContributionFactorId` into `drawEdges`. Give contribution-path edges the
   strongest stroke treatment, ahead of selected-adjacency and generic changed-edge styles.
5. Give path factor cards a matching stroke treatment. Preserve the selected target card's
   distinct fill/focus treatment.
6. Clearing a contribution immediately restores the ordinary selected/changed graph styles.
7. Do not claim direction, polarity, or attribution weight on individual edges. The highlight
   means only that the formula dependency is on a path from the attributed assumption.

### Fixed path oracles

- Jet fuel price to Operating Margin:
  `jetFuelPrice -> fuelExpense -> operatingExpense -> operatingIncome -> operatingMargin`.
- Average fare to Operating Margin has two branches after Revenue:
  `averageFareGrowth -> revenue -> operatingMargin` and
  `averageFareGrowth -> revenue -> operatingIncome -> operatingMargin`.
- Capacity growth to Operating Margin includes both the Fuel Expense and Other Expense
  branches before they merge at Operating Expense.

### Acceptance criteria

- Selecting Jet fuel price in the bridge marks exactly its fixed path oracle among visible
  nodes and edges.
- Selecting Average fare marks both branches, not just the first path found.
- A synthetic fan-out/fan-in graph marks all qualifying branches and excludes a disconnected
  branch; the implementation must not assume the fixed airline graph's shape.
- Unrelated assumptions and model lines retain their ordinary styling.
- Changing factor or scenario clears the path selection.
- The graph remains safe if a temporary cyclic dependency is supplied to the helper.

### Verification

Add public boolean attributes such as `onContributionPath` to replicated cards so behavior
tests can assert path membership without testing colors. Inspect the generated card paths,
then extend `tests/assert.mjs` to test the two fixed path oracles. Run:

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare \
  --assert apps/causal-desk/tests/assert.mjs
```

### Commit

`feat(causal-desk): highlight contribution paths`

## CD-S3-05 — Lock the Slice 3 user loop

### Outcome

The complete Slice 3 concept loop has behavior and visual regression coverage, and the
design document accurately reports what is implemented.

### Files

- `tests/assert.mjs`
- `tests/states.mjs`
- `tests/baselines/*.png`
- `DESIGN.md`
- Any Slice 3 `.declare` files only when a verification failure exposes a defect

### Implementation

1. Add one behavior route that performs the full concept loop: open Fuel Shock, keep Base as
   comparison, select Operating Margin, identify Jet fuel price as the largest negative
   contribution, select it, verify its path, then change fuel price and verify the bridge
   recomputes for Working.
2. Add a behavior route that changes the comparison scenario and verifies contribution
   recomputation without changing the active scenario.
3. Add named visual states for:
   - Fuel Shock versus Base with the contribution bridge visible.
   - Jet fuel contribution selected with its path highlighted.
   - A non-Base comparison.
   - Active equal to comparison with the no-delta state.
4. Set every behavior and visual viewport explicitly to 1280×800. Do not rely on the
   runner's default viewport because the app has `minWidth = 1120`.
5. Run visual verification once without `--bless`. If the new states have no baselines,
   bless them, inspect every PNG, correct layout defects, and bless again only after the
   correction passes inspection.
6. Update `DESIGN.md` to say Slices 1–3 are complete. Do not mark Slice 4 complete.

### Acceptance criteria

- The original Slice 1–2 behavior remains covered and passing.
- The full Slice 3 concept loop is driven through public controls, not by directly assigning
  app state in the test.
- All named visual states pass at 1280×800 after inspected baselines are committed.
- No text overlaps, clips unintentionally, or wraps across numeric labels.
- The final contribution order makes the largest driver identifiable without calculation.
- All Causal Desk-specific files remain in `apps/causal-desk/`.

### Verification

Run both commands from the repository root:

```bash
node tools/verify.mjs apps/causal-desk/causal-desk.declare \
  --assert apps/causal-desk/tests/assert.mjs

node tools/verify.mjs apps/causal-desk/causal-desk.declare \
  --states apps/causal-desk/tests/states.mjs
```

Then run the repository-wide app check already used for Slices 1–2:

```bash
node test/verify-apps.test.mjs
```

### Commit

`test(causal-desk): cover delta explanation flow`

## Slice 3 definition of done

Slice 3 is complete only when all five tickets are committed, all three verification
commands pass, visual baselines have been inspected, and the concept acceptance loop in
`DESIGN.md` works without direct state manipulation.
