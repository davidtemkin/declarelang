# Dataset persistence — design review and implementation gates

Reviewed 2026-09-10. **Ready to implement the browser document milestone, not
implemented or verified as working.** The normative documents are the
[public/lifecycle contract](dataset-persistence.md) and [host contract](dataset-persistence-host.md).
App-specific integration remains in [Causal Desk Slice 5](../../apps/causal-desk/SLICE-5-DESIGN.md).

## Criticism and disposition

| Finding in the first proposal | Why it blocked implementation | Amendment |
|---|---|---|
| “Existing grammar” implied Dataset accepts a policy child | `checkDataNode` and `constructData` explicitly reject children | Specify a narrow structural exception, compiler typing, and construction work. |
| App Promise callbacks assumed an owner-lifetime check | Node exposes no public alive/disposed fact; late callbacks can act on retired state | Correlated numeric request IDs and one node-scoped result event; runtime owns cancellation/generations. |
| Queue and memory bounds were open | Repeated manual saves could retain arbitrarily many full documents | One in-flight operation, four explicit slots, one coalesced autosave; 8 MiB payload/16 MiB snapshot bounds. |
| “Latest retry” conflicted with retained old snapshots | A stale retry can save an old scenario after the analyst keeps editing | Save retry captures current accepted data; failed erase retains its revision authority. |
| Subscribing to Dataset.value looked sufficient | Leaf mutation/Editor write-back do not necessarily replace the root reference | Observe accepted root/region mutation before authored init; revise once per content settle. |
| Capture timing was ambiguous | Dependent afterSettle envelope rebuild or invalid editor commit could save the wrong data | Specify turn-end capture, validation boundary, and same-turn command semantics. |
| Boot read could overwrite early edits | “Load then autosave” misses edits/init/commit while read is delayed | Early edits/write intent force recovery; missing read releases eligible saves. |
| Erase relied on a hidden autosave suspension | Delayed writes or resetting Base could recreate a cleared draft | Explicit autosavePaused fact, erase barrier, deliberate resume rules. |
| Cross-tab revision/absence semantics were incomplete | Delete/recreate can fool stale CAS writers; corrupt payload still needs discard | Atomic CAS, tombstones, separate trusted control metadata from invalid payload. |
| Native/file/browser adapters were all in milestone one | Unspecified native transactions and locations made readiness misleading | Browser DOM/canvas plus deterministic adapter first; native explicitly unsupported pending its own design. |
| Strict durability was treated as a guarantee | IndexedDB exposes a hint, not a portable physical-retention proof | Acknowledge transaction completion, disclose actual hint, separate eviction/retention. |
| Navigation recipe implied transparent save-before-Back | Browser host has already traversed/replaced history before a veto is resumed | Root-owned datasets and explicit Save and leave supported; history-preserving guard deferred. |
| Causal Desk Saved could describe an old envelope | Platform revision covers savedRecord, not live workingScenario | App generation coverage is required as well as platform acknowledgement. |
| App tickets conflicted on recovery, clear, and retry | Implementers would need to choose competing semantics | Reconcile Slice 5 design/tickets with this contract; keep the unshipped-platform gate. |

### Code evidence inspected

- [runtime/src/instantiate.ts](../../runtime/src/instantiate.ts): `constructData`,
  `initNodeTree`, `initTree`; Dataset ownership/construction and init ordering.
- [runtime/src/check.ts](../../runtime/src/check.ts): `checkDataNode` and traversal
  short-circuit; new child must be checked rather than silently skipped.
- [runtime/src/data.ts](../../runtime/src/data.ts): Dataset `set`, `insert`,
  `remove`, `move`, root assignment, and region wake paths.
- [runtime/src/editor.ts](../../runtime/src/editor.ts): `commitDraft` validates
  before `$setData`; invalid drafts do not become persisted data.
- [runtime/src/reactive.ts](../../runtime/src/reactive.ts): `settle` drains
  afterSettle batches through repeated reactive waves. Capture needs an internal
  successful-completion seam, not just another callback in a batch.
- [runtime/src/node.ts](../../runtime/src/node.ts): internal `onDiscard`/retirement
  hooks, not a public lifetime property.
- [compiler/src/typecheck.ts](../../compiler/src/typecheck.ts): synchronous authored
  handler boundary; no need to introduce async handlers for persistence.
- [runtime/src/view.ts](../../runtime/src/view.ts) and
  [browser/host-client.js](../../browser/host-client.js): `follow`, `onPop`, and
  `syncByReplace`; current veto cannot transparently resume browser traversal.

## Adversarial acceptance traces

These are prospective executable-test requirements, **not tests run in this review**.
Use the same provider seam for deterministic ordering/faults and real browser tests.
Assert live values, stored bytes/tokens, reactive state, and terminal result IDs.

| ID | Arrange / action | Required observation |
|---|---|---|
| P01 | Compile ordinary Dataset, one policy child, duplicate/misplaced/unnamed children, contents/DataSource owners | Existing programs unchanged; only the named legal policy form passes; useful source diagnostics. |
| P02 | Policy expressions settle initially, then key/config changes | Initial config latched; unequal update is configuration error, never a second target. |
| P03 | No stored row; open and close without edits | No seed write; loaded, dirty=false, saved=false. |
| P04 | Existing valid record; delay read; edit from authored init or editor | Live edit preserved; candidate offered; no automatic overwrite. |
| P05 | commit during boot, both missing and present records | Missing permits captured save; present refuses with recovery_pending and preserves candidate. |
| P06 | Root, leaf, insert/remove/move, editor accepted/rejected writes | Accepted changes observed once per settle; rejected drafts never saved. |
| P07 | field.commit; disk.commit; afterSettle derived update | Final accepted turn data captured; invalid editor draft remains app validation's responsibility. |
| P07b | A later afterSettle wave changes data, or throws | Capture includes every successful wave; thrown settle cannot leak partially stabilized data to storage. |
| P08 | commit; edit; commit in one handler | Both IDs refer to final settled revision; events arrive after requesting handler, once each. |
| P09 | Delay save of revision 1, accept revisions 2–20 | Receipt 1 never replaces live 20 or says saved; eventual autosave captures latest; no stale write follows 20. |
| P10 | Continuous edits; saturated queue; oversized payload | MaxDelay triggers bounded intent, not unbounded snapshots; explicit refusals are correlated and live data remains. |
| P11 | Fail save 1 with queued saves; then edit again and Retry | Queued IDs terminate aborted; retry saves current data, not the failed snapshot; no false success for old ID. |
| P12 | Invalid JSON/schema/future format with valid control metadata | Nothing adopted; original record preserved; explicit erase or replace works with observed token. |
| P13 | Corrupt control metadata | store_corrupt, no guessing absence/revision; even overwrite cannot silently delete it. |
| P14 | Recovery candidate; Restore twice; replace fails; retry | Only first Restore applies; failed replace preserves candidate and requires explicit replace again. |
| P15 | In-flight save, unsent saves, erase, further edits/reset | Unsent IDs aborted; erase follows terminal save and its resulting token; record stays absent until deliberate resume. |
| P16 | Failed erase; edit; retry; reload | Work and pause preserved; retry keeps erase authority; reload cancels failed intent without silently resuming autosave. |
| P17 | Two tabs read same revision; first writes/deletes then second writes | Default fails conflict, including absent/delete ABA; overwrite mode deliberately accepts last committed writer. |
| P18 | Retire owner during I/O, create replacement for same key | No retired callback/event; replacement reads after terminal transaction, not stale pre-write data. |
| P19 | Put request succeeds then transaction aborts | No success receipt, Saved, navigation, or partial row replacement. |
| P20 | Blocked open, denied storage, quota, native unsupported, stalled transaction | Stable safe errors; no silent memory fallback; stall remains pending and cannot be retried until terminal. |
| P21 | Save and leave, then cancel; old receipt arrives | Canceled action cannot navigate; current matching successful receipt can. No claim of browser-Back restoration. |
| P22 | Different app IDs/namespaces, actual browser context cold restart after ack | Isolation and real persistence proven; deterministic adapter alone does not satisfy this gate. |
| P23 | Causal Desk edit while previous envelope is acknowledged | Saved badge requires current workingGeneration coverage; never briefly labels a newer Working edit saved. |
| P24 | Early Causal Desk edit; recovery Restore/Discard/Keep current | Confirmation protects live edits; Discard preserves them and commits new work only after deletion ack. |
| P25 | Clear while a save is in flight; reset Base; next deliberate edit | Clear locks editing and waits for erase; Base reset does not save; next edit deliberately resumes autosave. |
| P26 | DOM and canvas; keyboard at desktop/tablet/mobile; failure and recovery text | Same lifecycle; flow layout, visible text, focus and 44px controls; no unverified accessibility-API claim. |

## Implementation dependency graph

Execute the bounded [PP-00–PP-05 tickets](dataset-persistence-tickets.md) for scope,
file ownership, prerequisite evidence, checks, and conventional commit names.

Each work package lands with its contract tests and documentation. No package is
authorized by this design review itself; this is the recommended implementation order.

```text
PP-00 shared types + adapter seam + deterministic fault fixture
  ├── PP-01 compiler/checker + Dataset policy construction
  ├── PP-02 lifecycle/queue/recovery engine
  └── PP-03 IndexedDB scope/CAS/transaction adapter
          PP-01 + PP-02 ──> PP-04 runtime mutation/init/discard wiring
          PP-03 + PP-04 ──> PP-05 browser conformance + author docs
                                  └── PLAT-PERSIST-01 gate satisfied
                                      └── CD-S5-01 onward (existing app DAG)
```

PP-02 tests the state machine via the deterministic provider without needing the
parser or IndexedDB. PP-03 runs adapter conformance independently. PP-04 brings
the engine into real Declare lifecycle and editor settles. PP-05 must run P01–P22
through appropriate boundaries, with P22 using a fresh browser page/context sharing
the isolated storage profile, not a reused runtime or in-memory fixture. Browser
DOM/canvas status smoke checks precede app integration. Causal Desk P23–P26 are
app acceptance gates and do not delay independent platform conformance.

Deliver compiler type exposure, help/scaffold reference entries, guide examples,
unsupported-host behavior, storage limits/security notes, and diagnostics with the
platform, not as a follow-up. No test fixture may write default production scope.

## Readiness decision and accepted tradeoffs

Proceed with the browser milestone once implementation is requested. The interface,
scope, acknowledgement boundary, queue limits, failure outcomes, concurrency, and
consumer coordination have explicit decisions and falsifiable acceptance traces.
There are no remaining product/API questions for that milestone. Actual runtime
constraints discovered while coding must amend this contract, not be hidden by an
app workaround or silently weakened test.

Accepted costs: whole-document encoding/copying; local nonencrypted storage;
nontransactional multi-key updates; tombstone retention; bounded refusal instead
of unlimited manual-save backlog; last-writer-wins only by explicit policy; no
guaranteed close-time save. Native storage, indexed collections, cloud sync,
schema migration, history-preserving navigation guards, and automatic live-region
announcements without a verified seam remain separate work, not implied features.
