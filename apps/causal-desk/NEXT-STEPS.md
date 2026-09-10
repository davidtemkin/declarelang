# Causal Desk — potential next steps

Updated 2026-09-10. This is a prioritized opportunity list, not an approved implementation
plan. Slices 1–5 are implemented on feature branches; publication is a separate step.
See [current design](DESIGN.md) and [Slice 5 evidence](SLICE-5-EVIDENCE.md).

## 1. Document upload and model exploration

**Outcome:** an analyst supplies a document and a question, reviews an evidence-backed
model proposal, and activates a model only after resolving its execution requirements.

Flow: choose document and outcome → extract evidence → propose model → review against
source → validate → activate a new model. Never silently replace the analyst's current work.

- Separate reported information, proposed mechanisms, and analyst-approved assumptions.
  Every extracted claim needs a source location, period, units where applicable, and review
  status. A cited claim is not proof of causality.
- Preserve source passages and table structure; selecting a node or relationship should
  reveal its evidence. Expose contradictions and missing inputs instead of filling gaps
  with plausible numbers. Allow explicit rejection and an unresolved draft state.
- Start with one English text-based PDF or pasted text, one chosen outcome, and approximately
  10–20 factors. Broaden document formats and domains after measuring review effort.
- Support branching/converging graphs and nonlinear formulas from the start of the generic
  model design. Feedback cycles require time/delay semantics and are a later engine feature;
  never drop a cycle silently to make a model executable.
- A restricted, versioned model-definition format and generic evaluator are prerequisites.
  Validate units, periods, references, supported expressions, finite values, and graph shape.
  Return structured proposals from AI, not executable generated code.
- Keep the UI and app workflow Declare-native. Reusable file access, processing-job lifecycle,
  and storage capabilities belong in the platform; parsing/OCR and model extraction belong
  behind a service boundary. Evaluate parsers against the corpus before selecting one.
- Treat documents as untrusted input, including embedded instructions. Specify upload limits,
  processing location, consent before remote transmission, retention/deletion, and cancellation.
  Original document storage is distinct from Dataset JSON snapshots and references.

### Example documents and evaluation corpus

These are candidate sources, not validated extraction fixtures. Public links were located
on 2026-09-10; full documents have not been downloaded or assessed. Before benchmarking,
pin each selected file's hash, retrieval date, relevant pages/sections, and usage terms.
Do not add third-party documents to the repository without checking redistribution rights.

| Candidate | Exploration question | What it should exercise |
|---|---|---|
| [Delta 2025 results PDF](https://news.delta.com/sites/default/files/2026-01/delta-air-lines-announces-december-quarter-and-full-year-2025-results-vf.pdf) | Which operating drivers explain margin? | Shorter airline source; reported vs. adjusted measures and period alignment |
| [Delta 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/27904/000002790426000013/dal-20251231.htm) | How could fuel-price changes affect expense? | Longer document, table evidence, qualifications, and explicit sensitivity disclosures |
| [Microsoft 2025 annual report](https://www.microsoft.com/investor/reports/ar25/) | What drives cloud revenue and margin? | Cross-industry terminology, segment boundaries, and hypotheses lacking numerical parameters; HTML/pasted excerpts initially |
| [January 2025 FOMC minutes PDF](https://www.federalreserve.gov/monetarypolicy/files/fomcminutes20250129.pdf) | What mechanisms connect policy, demand, and inflation? | Qualitative-only draft, uncertain direction, competing views, and missing equations |
| Authored synthetic operating memo (to create) | Can we recover a known model exactly? | Small ground-truth graph, explicit units/formulas, nonlinear interaction, and known scenario outputs |
| Authored adversarial variants (to create) | Does the system refuse unsupported conclusions? | Contradictory periods, missing units, negative evidence, feedback, poor OCR, and embedded prompt injection |

Start with the synthetic memo and a bounded airline excerpt. Have an analyst annotate expected
claims, source spans, relationships, and deliberate unknowns. Score provenance fidelity,
unsupported assertions, unit/period accuracy, deterministic calculation results, correction
effort, and time to an accepted useful model. A visually plausible graph is not acceptance.

## 2. UI/UX rethink

**Outcome:** a financial analyst can identify the question, change an assumption, and explain
the result without first learning the graph's mechanics.

- Observe a few analysts performing those tasks on the current app before redesigning it.
- Explore an outcome-first workspace: headline result and comparison, assumption editor,
  explanation bridge, and optional graph/evidence detail. Compare it with the current graph-first UI.
- Design a separate document/model review state that shares the same factor inspector and
  provenance vocabulary, rather than adding a second unrelated application inside Causal Desk.
- Revisit visual hierarchy, spacing, typography, progressive disclosure, keyboard navigation,
  and narrow-screen behavior. Preserve selection and context across edits and comparisons.
- Prototype two layouts and evaluate task success, explanation accuracy, and discoverability.
  Do not commit to a visual rewrite before that comparison.

## 3. Reusable model definitions and templates

**Value:** unlock document-created models and a second industry without cloning the app.

Extract the current fixed model into a versioned, typed definition. Prove equivalence with the
existing airline results, then add one non-airline model. Keep formulas, evidence, scenario
overrides, and model revisions distinct. Include resource limits and an attribution policy:
exact Shapley computation over six assumptions cannot be assumed cheap for arbitrary graphs.

## 4. Named scenarios, portable work, and recovery

**Value:** analysts can retain competing theses and move work between devices deliberately.

Explore a small named-scenario library plus validated JSON import/export before accounts or
cloud synchronization. Export model revision, assumptions, and provenance; make unavailable
original documents explicit. Design stale-model handling, duplicate imports, deletion, and
restore semantics. The current single-draft persistence contract is not a library or blob store.

## 5. Sensitivity and uncertainty

**Value:** distinguish important assumptions from those that merely look prominent in the graph.

Start with one-at-a-time sensitivity and break-even questions. Add analyst-declared ranges
before probability distributions. Explain interactions and attribution approximations, if any;
do not label a range a confidence interval or infer real-world causality from model sensitivity.
Probabilistic simulation requires explicit distribution and dependency choices later.

## 6. Shareable decision brief

**Value:** turn exploration into an artifact another analyst can inspect and challenge.

Export a concise scenario comparison with the question, model revision, source dates,
assumptions, result, contribution explanation, unresolved evidence, and limitations.
Begin with a local export rather than public links or collaboration infrastructure.

## Suggested sequence and dependencies

1. Finish source-only review PRs; integrate and derive on current main before publication.
2. In parallel conceptually: evaluate the example corpus and observe current UX usage.
3. Design the model-definition contract and evidence-review interaction together.
4. Prove a second hand-authored model, then the smallest document-to-reviewed-model path.
5. Expand scenarios, sensitivity, and exports according to analyst feedback.

Dependency graph: corpus → extraction evaluation; UX research → workspace/review design;
model definitions → second model and document activation; reviewed model + scenarios → decision
brief. These are not a mandatory linear queue. No new slice numbers or implementation tickets
are assigned until scope is approved.
