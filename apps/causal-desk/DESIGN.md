# Causal Desk

Product and interaction design, version 0.1.

Implementation status (2026-09-08): Slices 1 and 2 are complete. The app includes the
fixed model, factor inspection, bundled scenarios, a working scenario editor,
active-versus-base deltas, affected-path highlighting, and spring-driven value changes.

## Product restatement

Causal Desk is an experimental scenario-modeling tool for financial analysts. It lets an
analyst change a small set of assumptions, see those changes propagate through an explicit
financial model, and inspect why an outcome moved.

The first model examines airline operating margin. It is intentionally bounded: the app is
not a forecasting platform, a general-purpose spreadsheet, or proof that a modeled
relationship is causal. It makes the assumptions and formulas visible so a result can be
questioned rather than merely consumed.

The central experience is:

1. Start from a named base case.
2. Change one or more operating assumptions.
3. Watch affected paths and values move in place.
4. Select an outcome.
5. See an exact bridge from the base case to the scenario result.

## Audience and job

The initial user is a financial analyst exploring the sensitivity of a company or thesis to
a handful of operating assumptions.

They need to answer:

- What assumptions drive this result?
- What changes between the base case and this scenario?
- Which paths carry that change through the model?
- Can I explain the result to another analyst without reconstructing the workbook?

## Product principles

### Show the model

Every derived value has a named formula and visible upstream dependencies. An edge means
"this formula reads that value," not an unspecified degree of causality.

### Preserve the analyst's place

Changing a scenario does not replace the graph or navigate to another screen. Nodes move to
their new values, changed paths illuminate, and the selected factor remains selected.

### Explain deltas, not just levels

The inspector leads with the difference from the comparison scenario and accounts for that
difference by changed root assumptions.

### Separate facts from model choices

Baseline values, user overrides, formulas, and explanatory notes are visually distinct.
The bundled numbers are illustrative inputs, not current market data.

### Keep the first model small

The first release is a polished, fixed model. Editing formulas, creating nodes, importing
workbooks, collaboration, and live data are later questions.

## First model: airline operating margin

The model uses explicit formulas over a small set of root assumptions. Values below are
illustrative and will be labeled as such in the application.

### Baseline constants

| Factor | Unit | Illustrative base |
|---|---:|---:|
| Base revenue | USD millions | 10,000 |
| Base fuel gallons | millions | 750 |
| Base labor expense | USD millions | 2,700 |
| Base other expense | USD millions | 3,500 |

### Editable assumptions

| Factor | Unit | Base case | Initial range |
|---|---:|---:|---:|
| Demand growth | percent | 3.0% | -10% to 15% |
| Average fare growth | percent | 2.0% | -10% to 15% |
| Capacity growth | percent | 2.0% | -10% to 15% |
| Jet fuel price | USD/gallon | $2.70 | $1.50 to $5.00 |
| Labor cost growth | percent | 4.0% | -2% to 15% |
| Non-fuel inflation | percent | 3.0% | -2% to 12% |

### Derived factors

The model is a directed acyclic graph. Percent inputs are represented as decimal values in
calculations.

```text
revenue = baseRevenue * (1 + demandGrowth) * (1 + averageFareGrowth)

fuelExpense = baseFuelGallons * (1 + capacityGrowth) * jetFuelPrice

laborExpense = baseLaborExpense * (1 + laborCostGrowth)

otherExpense = baseOtherExpense
             * (1 + capacityGrowth)
             * (1 + nonFuelInflation)

operatingExpense = fuelExpense + laborExpense + otherExpense
operatingIncome = revenue - operatingExpense
operatingMargin = operatingIncome / revenue
```

These formulas are deliberately legible rather than comprehensive. The UI must call the
model illustrative and expose each formula in the inspector.

## Domain model

### Factor

A value in the model.

- `id`: stable identifier
- `label`: analyst-facing name
- `kind`: `constant`, `assumption`, or `derived`
- `unit`: `usdMillions`, `percent`, `usdPerGallon`, or `millionGallons`
- `baseValue`: the unmodified base-case value
- `value`: the value in the active scenario
- `formula`: human-readable expression for a derived factor
- `description`: what the value represents
- `sourceNote`: provenance or an explicit "illustrative" label

### Dependency

A directed edge from a factor read by a formula to the derived factor that reads it.
Dependencies carry no hidden weight or polarity. Direction and magnitude come from the
formula.

### Scenario

A named set of overrides to assumption factors.

- `id`
- `name`
- `description`
- `overrides`: factor ID to value

Constants and formulas do not vary by scenario in the first release.

### Contribution

One root assumption's attributed share of the difference between the active and comparison
scenario for a selected derived factor.

## Calculation semantics

- The graph must remain acyclic.
- Only assumption factors can be overridden.
- Derived values are pure functions of their dependencies.
- Display rounding never feeds back into calculations.
- Invalid or non-finite results produce an explicit unavailable state rather than zero.
- Every displayed result identifies its unit and comparison scenario.

### Explaining "why it moved"

For a selected derived factor, Causal Desk compares the active scenario with a comparison
scenario, initially Base Case.

The contribution bridge uses Shapley attribution over the assumptions that changed. It
evaluates the selected factor across the possible orders in which changed assumptions could
be applied, then averages each assumption's marginal effect. With six root assumptions this
is small enough to compute locally.

This gives the bridge two useful properties:

- Contributions sum to the exact modeled delta, subject only to display rounding.
- Results do not depend on an arbitrary ordering of assumptions.

The app describes these as contributions to the **modeled scenario delta**, never as proof
of real-world causal impact.

## Bundled scenarios

The first release includes:

- **Base Case** — the default assumptions.
- **Fuel Shock** — materially higher jet fuel price with modest fare recovery.
- **Demand Downturn** — lower demand and fare growth with reduced capacity.
- **Capacity Squeeze** — constrained capacity, stronger fares, and higher labor growth.

Scenario values will be finalized alongside the executable model so every label and
explanation can be checked against the actual output.

## Primary interaction

### 1. Orient

The app opens on Base Case. The graph shows inputs on the left, expenses and revenue in the
middle, and operating income and margin on the right. Operating Margin is selected, so the
inspector immediately teaches the graph's purpose.

### 2. Choose or create a scenario

A scenario switcher changes the active scenario without replacing the graph. "New
Scenario" creates a working scenario copied from Base Case. Persistence is not required in
the first technical slice.

### 3. Change an assumption

Selecting an assumption opens its control in the inspector. Dragging the control updates its
formatted value continuously. Downstream values follow, affected edges brighten, and values
move toward their new positions with restrained spring motion.

The control also supports keyboard changes and direct numeric entry. A reset action removes
that assumption's override.

### 4. Inspect an outcome

Selecting a derived factor changes the inspector from editing to explanation:

- Current value
- Difference from the comparison scenario
- Formula
- Immediate dependencies and their values
- Contribution bridge by changed root assumption
- Illustrative-data or source note

Selecting a contribution highlights every dependency path from that assumption to the
selected result.

### 5. Compare

Base Case is the default comparison. The analyst may compare any two bundled scenarios. The
graph continues to show the active scenario; comparison values appear as compact reference
marks within nodes rather than as a duplicate graph.

## Information architecture

### Application frame

- **Top bar:** product name, active scenario, comparison scenario, and reset action.
- **Model stage:** dependency graph and compact legend.
- **Inspector:** editing for assumptions; explanation for derived factors.
- **Status line:** model scope, illustrative-data notice, and calculation state.

Wide layouts place the inspector to the right of the model. Narrow layouts keep the model as
the primary surface and reveal the inspector as an in-place expansion from the selected
node, preserving the connection between selection and detail.

## State model

### Persistent model data

- Factors and formulas
- Dependencies
- Bundled scenarios

### Mutable application state

- Active scenario ID
- Comparison scenario ID
- Working scenario overrides
- Selected factor ID
- Selected contribution factor ID
- Inspector expansion state on narrow layouts

### Derived presentation state

- Every factor's active and comparison values
- Changed factors
- Reachable downstream paths
- Selected factor contributions
- Formatted values
- Graph geometry
- Narrow or wide arrangement

Presentation state is derived from model and application state; it is not independently
synchronized.

## Visual direction

Causal Desk should feel like an analytical instrument rather than a generic node editor.

- Deep ink background with warm off-white type.
- Assumptions use a cool accent; derived factors remain neutral.
- Positive modeled deltas use restrained green and negative deltas muted red, always paired
  with signs and numbers rather than color alone.
- Nodes resemble compact analytical cards, not flowchart boxes.
- Edges remain quiet until relevant to a change or selection.
- Tabular numerals keep values stable as they move.
- A subtle grid and column alignment make dependency direction readable without arrows on
  every dormant edge.

Motion communicates propagation:

- The edited assumption responds directly to input.
- Direct dependents settle first, followed by later graph levels with a slight stagger.
- Changed edges brighten along the affected path.
- Scenario switching moves existing values and reference marks; it does not cross-fade to a
  replacement screen.
- Reduced-motion mode removes stagger and spring overshoot.

## Accessibility and input

- Every assumption is operable by pointer, keyboard, and direct text entry.
- Graph traversal follows dependency order with a visible focus treatment.
- Selection and delta direction never rely on color alone.
- Formulas and contribution values are available as text outside custom drawing.
- Touch targets meet the component library's normal control sizing.
- The graph may be drawn, but interactive nodes are real controls with roles and focus.

## First-release boundary

### Included

- One fixed airline model
- Four bundled scenarios
- One editable working scenario
- Reactive graph values
- Active-versus-comparison deltas
- Factor inspector with visible formulas
- Shapley contribution bridge
- Path highlighting
- Responsive wide and narrow arrangements
- Keyboard-accessible assumption controls

### Deferred

- Creating or deleting factors and dependencies
- Editing formulas
- Cyclic or time-dependent models
- Probability distributions and Monte Carlo simulation
- Live market or company data
- Workbook import or export
- Accounts, sharing, and collaboration
- Persistent storage
- Multiple company models

## Delivery slices

Each slice remains a complete, runnable Declare application.

### Slice 1: executable model

Render the fixed graph, evaluate Base Case, select factors, and show formulas and immediate
dependencies in the inspector. This proves the data model and graph geometry.

### Slice 2: scenario propagation

Add bundled scenarios, editable overrides, active-versus-base deltas, affected-path
highlighting, and value motion. This proves the central interaction.

### Slice 3: explain the delta

Add comparison selection, Shapley contributions, the contribution bridge, and path
highlighting from a contribution to the selected result.

### Slice 4: responsive instrument

Complete narrow-layout behavior, keyboard traversal, reduced motion, direct numeric entry,
empty/error states, and visual polish.

### Slice 5: optional persistence

Save and restore the working scenario locally only if the preceding slices demonstrate that
analysts want to return to a model rather than treat it as a disposable exploration.

## Acceptance test for the concept

The concept succeeds when a new user can complete this loop without instruction:

1. Open Fuel Shock.
2. Identify that operating margin declined from Base Case.
3. Determine which changed assumption contributed most to the decline.
4. Select that contribution and see how it reaches operating margin.
5. Adjust the assumption and predict the direction of the next change.

The application should make every answer visible in the model, not require trust in hidden
logic.

## Folder contract

Everything specific to Causal Desk remains in `apps/causal-desk/`.

Planned contents:

```text
apps/causal-desk/
  DESIGN.md
  causal-desk.declare
  model.json                 # only if external data proves clearer than inline records
  index.html                 # generated by the repository derivation process
```

No Causal Desk utility scripts or design artifacts should be placed elsewhere. Shared
runtime changes are out of scope unless implementation exposes a genuine language or library
gap.
