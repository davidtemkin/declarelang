# Dataset persistence — implementation tickets

Status: **implementation in progress**, 2026-09-10; see ticket evidence below.
Scope: browser document persistence, shared by DOM and browser canvas. These six
tickets operationalize the reviewed design; they do not authorize native storage,
indexed collections, cloud sync, navigation redesign, or Causal Desk implementation.

## Start here

Before taking a ticket, read [CONTRIBUTING](../../CONTRIBUTING.md), its linked tenets,
the [lifecycle contract](dataset-persistence.md), the
[host contract](dataset-persistence-host.md), and that ticket's acceptance traces in
the [review record](dataset-persistence-review.md). Contracts define behavior;
this file defines ownership, dependencies, and evidence of completion.

1. Verify prerequisite commits and their evidence in the checkout. A design or
   compile-only stub is not a completed prerequisite. All tickets start planned.
2. Work on a feature branch, with one conventional commit per completed ticket.
   Intermediate commits are integration steps, not a shipped persistence feature.
3. Use existing source/test conventions. New paths below are proposed deliverables,
   not files claimed to exist. Keep new files below 500 lines; split by responsibility.
4. Run the ticket's targeted tests after building; register every new suite in
   `tools/internal/run-tests.mjs` so normal testing cannot silently omit it.
5. Record status, commit, commands/results, and any unverified environment-dependent
   checks in this file. Review/stage explicit authored files; leave unrelated pnpm
   files and visual baselines alone. Changes to generated artifacts follow the
   repository's shipping procedure, not ad hoc edits or broad staging.

If code reveals a contract contradiction, record the counterexample and amend the
contract before implementing a different behavior. A missing browser is an
unverified browser gate, not a passing test. Test adapters are never production
fallbacks. No platform gate is complete until PP-05 passes.

## Dependency and ownership plan

| Ticket | Depends on | Status | Commit / evidence |
|---|---|---|---|
| PP-00 | — | complete | `68eb9e65`; PP-00 execution evidence below |
| PP-01 | PP-00 | complete | `b7631bd8`; PP-01 execution evidence below |
| PP-02 | PP-00 | complete | `3622aaad`; PP-02 execution evidence below |
| PP-03 | PP-00 | complete | `d4fcf166`; PP-03 execution evidence below |
| PP-04 | PP-01, PP-02 | complete | `b1093b17`; [final gate evidence](dataset-persistence-evidence.md) |
| PP-05 | PP-03, PP-04 | complete | `9f20db46`; [final gate evidence](dataset-persistence-evidence.md) |

```text
PP-00 ──┬── PP-01 ──┐
        ├── PP-02 ──┴── PP-04 ──┐
        └── PP-03 ───────────────┴── PP-05
                                      └── PLAT-PERSIST-01
                                          └── existing CD-S5-01 onward
```

PP-01/02/03 can develop independently after PP-00 freezes shared interfaces.
PP-04 need not wait for IndexedDB: it integrates using the deterministic adapter.
PP-05 installs the real browser provider and proves the full path.

Single-writer coordination applies even when tickets are developed concurrently:

- PP-00 owns shared types, encoding, errors, and test-provider helpers. Downstream
  changes to those contracts require coordinated updates, not local duplicate types.
- PP-01 owns checking/type exposure and policy construction; PP-02 owns engine
  modules; PP-03 owns the IndexedDB adapter. PP-04 owns their runtime wiring.
- PP-05 owns browser bootstrap/verifier integration and final author documentation.
- The integrator serializes edits to test registration, shared exports, and this
  status table. Full builds, browser suites, and derive run serially: existing
  suites share build outputs, ports, and browser resources.

This DAG permits delegation when requested; it does not require spawning agents.

## PP-00 — Establish shared contracts and deterministic storage fixture

**Depends on:** none. **Complexity:** medium; downstream interfaces must be stable.

### Outcome and scope

A reusable provider seam and portable snapshot codec exist, independently testable
without Declare construction, browser globals, or a persistence lifecycle engine.

1. Implement the host contract's Scope, Expectation, receipts, error catalogue,
   policy configuration, public state/result types, and immutable snapshot types.
2. Implement portable JSON validation/encoding, UTF-8 payload limits, detached
   decoding, and metadata classification. Reuse existing schema validation later
   through an explicit hook; this ticket does not reimplement Dataset schemas.
3. Define the internal engine-to-runtime seam needed by PP-01/02/04: accepted
   mutation notification, successful/failed settle notification, capture/adoption,
   state publication, deferred result delivery, and owner retirement. Record exact
   exported names and ownership in the handoff; keep it internal to the runtime.
4. Add an isolated deterministic provider with controllable completion order,
   terminal failure, CAS/tombstones, and fault/operation logs. Inject time and token
   generation so delay/deadline tests use controlled time, not wall-clock sleeps.
5. Provide a reusable provider-conformance harness for the fixture and PP-03.
   The fixture satisfies the same interface as real storage but is test-only.

### Files and exclusions

- Proposed `runtime/src/persistence/types.ts`, `codec.ts`, `errors.ts`.
- Proposed `test/helpers/persistence-provider.mjs` and
  `test/persistence-contract.test.mjs`; reuse `test/harness.mjs`.
- No Dataset scheduling, compiler admission, browser installation, or app edits.

### Acceptance and verification

- Typed receipt variants distinguish absence, valid document, and invalid payload
  with a trustworthy revision. Stored null is not absence.
- Round trips preserve portable values. Reject every forbidden value category in
  the encoding contract, including getters without invoking them and prototype
  hazards without merging them. Test exact byte-limit boundary and multibyte text.
- Provider conformance covers isolated scopes, CAS mismatch, overwrite, tombstone
  revisions, preserved invalid payload, and unreadable control metadata (P12/P13/P17
  provider portions). Delayed writes change stored state only at terminal success.
- Test fixture logs never include payload by default; teardown touches only its scope.
- `npm run build`, then `node test/persistence-contract.test.mjs` pass; existing
  `test/dataschema.test.mjs` remains green.

**Handoff:** exact exports, codec contract, fixture controls, reusable conformance
entry point, and targeted command. PP-01/02/03 consume these instead of inventing peers.

**Commit:** `feat(persistence): establish snapshot and provider contracts`

### Execution evidence — 2026-09-10

- Implemented shared types and `PersistenceBinding`/`PersistenceEngine` in
  `runtime/src/persistence/types.ts`; runtime supplies capture/validate/adopt,
  publish/deliver/defer/requestSettle; engine receives acceptedMutation/settled/retire.
- `codec.ts` owns portableCopy/encodeSnapshot/decodeSnapshot/freezeCandidate;
  `records.ts` owns policy/scope validation and payload/control classification;
  `errors.ts` owns safe stable errors. No Dataset behavior changed.
- ControlledProvider/ControlledClock and providerConformance live in `test/helpers/`.
  Tests explicitly complete/fail operation IDs and advance controlled time.
- Passed `npm run build`, contract suite (10 cases), existing Dataset-schema suite
  (18 cases). Build initially lacked visible Node types under pnpm; a local ignored
  `node_modules/@types` link to the existing pnpm types fixed resolution without
  changing manifests/lockfiles. Browser verification belongs to later tickets.

## PP-01 — Admit and type the Dataset-owned policy

**Depends on:** PP-00. **Complexity:** high; compiler/runtime structural exception.

### Outcome and scope

The proposed source form checks, has useful types/diagnostics, and constructs one
named nonvisual policy node. Its structural support is independently proven;
live storage scheduling is deliberately integrated in PP-04.

1. Inspect `checkDataNode` and traversal in `runtime/src/check.ts`, `constructData`
   in `runtime/src/instantiate.ts`, runtime schema registration, and compiler
   scaffold/typecheck paths. Introduce exactly the permitted Dataset-child exception.
2. Construct the policy shell with owner, app, classroot, scope, and event bindings.
   Use PP-00's seam rather than a temporary alternative engine. Standalone structural
   tests can supply a test binding; no production path may report fake save success.
3. Expose policy defaults/enums, read-only facts, schema-derived deeply read-only
   candidate type, synchronous numeric commands, restore boolean, and typed onResult.
4. Validate source-known configuration and ownership errors with precise source
   locations. Initial expression evaluation and later config-latch enforcement
   are wired in PP-04, using the shared policy validation rules.

### Files and exclusions

- Existing `runtime/src/check.ts`, `instantiate.ts`, `schema.ts`, relevant runtime
  exports, `compiler/src/scaffold.ts`, `typecheck.ts`; inspect actual registration
  paths before editing rather than modifying every listed file automatically.
- Proposed `runtime/src/persistence/node.ts`, `test/persistence-syntax.test.mjs`.
- No new parser syntax unless an actual parse counterexample requires a reviewed
  amendment. No arbitrary Dataset children, subclass feature, or async handlers.

### Acceptance and verification

- P01: valid typed/untyped literal-seed owner passes; ordinary Dataset unchanged.
  Duplicate/unnamed/misplaced policies, DataSource/contents owners, missing seed,
  invalid enum/delay/key, and disallowed Dataset methods/children fail usefully.
- Assigning facts/candidate fields or misusing result/command types fails checking.
  The legal onResult handler resolves its owner and enclosing app/classroot correctly.
- Construction creates one policy and retains ordinary Dataset datapath behavior.
  No I/O, success receipt, or autosave is attributed to this structural milestone.
- `npm run build`, then `node test/persistence-syntax.test.mjs` and the existing
  `test/scaffold.test.mjs`, `test/declarec.test.mjs`, `test/dataschema.test.mjs` pass.

**Handoff:** registered class, construction hook, generated-type source changes,
diagnostics, and a minimal legal fixture PP-04 can boot.

**Commit:** `feat(persistence): type and construct Dataset policies`

### Execution evidence — 2026-09-10

- Policy schema/registry and `Persistence` node shell are implemented; Dataset
  construction admits one named policy and keeps its physical Dataset parent.
  Compiler candidate typing follows the owner schema, with immutable facts/results
  and synchronous numeric commands. Parent typing now reflects the Dataset owner.
- Passed forced build, 6 syntax cases, 12 scaffold cases, 15 compiler/production
  cases, and 18 existing Dataset-schema cases. Source-known policy errors carry
  positions; invalid embedded schema data retains its existing build-time refusal.
- `bindPersistence`/`publishPersistence` are runtime-only wiring functions. The
  structural shell refuses unbound commands rather than reporting fake success;
  PP-04 supplies the engine before authored init. Generated build outputs remain
  uncommitted under the repository's source-only feature-branch convention.

## PP-02 — Implement bounded lifecycle, recovery, and command ordering

**Depends on:** PP-00. **Complexity:** high; central state-machine work.

### Outcome and scope

One deep runtime module owns all persistence coordination. Tests exercise it
through PP-00's seam using deterministic storage/time; it has no browser or parser
dependency. Build in the following checkpoints within this ticket:

1. Boot/read/recovery and atomic publication: implement the complete decision table,
   dirty/saved/pending facts, protected early edits, restore/replace, and reload.
2. Capture intent/queue: numeric correlation, deferred results, automatic ID 0,
   autosave delay/maxDelay, snapshot/slot limits, FIFO acknowledgements, and current
   data retry. Successful/failed settle is supplied by the seam, not guessed by timers.
3. Erase/retirement/failure: delete barrier and pause, revision authority, aborted
   unsent IDs, generation invalidation, scope-lane serialization, and stalled-versus-
   failed outcomes. Keep the per-scope lane outside the retiring policy instance.
4. Implement all error precedence and operation preconditions from the contracts.
   Rejecting extra work must not overwrite another operation's state or lose live edits.

### Files and exclusions

- Proposed `runtime/src/persistence/lifecycle.ts`, `queue.ts`, and `coordinator.ts`;
  split by responsibility rather than fitting the entire engine into one large file.
- Proposed `test/persistence-lifecycle.test.mjs`, `test/persistence-queue.test.mjs`.
- No Dataset mutation hooks, actual settle scheduler changes, DOM, IndexedDB, or app UX.

### Acceptance and verification

- P03–P05, P08–P11, P14–P16 fully pass at the engine seam. P02, P07b, P12/P13,
  P17/P18/P20 pass their engine portions with controlled callbacks/provider outcomes.
- Assert the whole published state and result IDs at each transition, not only the
  final value. Each live explicit ID terminates exactly once; old failed IDs never
  later succeed. A retired policy emits no result.
- Saturate slots and byte budgets; continuous edits and paused/in-flight edits
  converge to the latest eligible revision without unbounded retained snapshots.
- Erase follows its own successful write's new token or failed write's previous
  token; erase retry retains authority; resumed save cannot strand newer edits.
- A stalled operation remains pending without retry/terminal event until conclusive
  completion. No lower revision writes after a higher acknowledgement.
- `npm run build`, then both new suites plus PP-00 conformance pass. Tests use
  controlled time and explicit completion, not sleeps or polling loops.

**Handoff:** tested engine factory, state publisher/event/adoption callbacks,
retirement procedure, scope coordinator, and runtime wiring checklist for PP-04.

**Commit:** `feat(persistence): implement bounded recovery and save lifecycle`

### Execution evidence — 2026-09-10

- `DocumentPersistence` implements PersistenceEngine over the shared binding;
  `SnapshotQueue` bounds pinned work; `inStorageLane` serializes issued work across
  retiring/replacement owners. No parser, Dataset, or browser imports in the engine.
- Forced build and 27 controlled lifecycle/queue cases pass, plus the 10 shared
  contract cases. Coverage includes boot/edit races, load/replace retry, erase
  barriers, stale receipts, byte/slot saturation, maxDelay, failed settles,
  configuration failures, stalled transactions, and retired-owner suppression.
- Extra counterexamples pin acknowledgement-before-settle ordering and prevent an
  older queued save from clearing a newer capture error. Actual Dataset/init/Editor
  wiring and public event behavior remain PP-04, not claimed by these seam tests.
- Targeted suites: `test/persistence-lifecycle.test.mjs` and
  `test/persistence-queue.test.mjs`; controlled binding in `test/helpers/persistence-engine.mjs`.

## PP-03 — Implement transactional IndexedDB storage

**Depends on:** PP-00. **Complexity:** high; browser transaction correctness.

### Outcome and scope

A browser provider satisfies the shared interface and provider-conformance suite
using real IndexedDB. It can be tested before the Declare lifecycle is wired.

1. Implement scoped database rows, tombstones, revision tokens, atomic CAS/overwrite,
   readable payload-versus-control corruption, and informational timestamps exactly
   as specified in the host contract. Reuse PP-00 codec/errors and fixtures.
2. Resolve write/delete only on transaction completion. Request the supported
   durability hint and expose its actual value in safe host diagnostics.
3. Implement open timeout/blocked handling, late-connection cleanup, versionchange
   draining/reopening, and terminal browser error normalization. Transaction-stall
   progress is owned by PP-02; the provider must leave its Promise pending while
   the transaction's outcome is unknown, not manufacture a timeout rejection.
4. Exercise scope isolation and independent concurrent writers in real browser
   contexts. Provide fixture-only corruption and abort injection for conformance.

### Files and exclusions

- Proposed `runtime/src/persistence/indexeddb.ts` and
  `test/persistence-indexeddb.test.mjs`; reuse repository browser-launch patterns
  such as `test/network-browser.test.mjs` and a test-owned server/fixture.
- No automatic browser boot installation until PP-05; no app shim, storage
  permission prompt, physical-retention guarantee, native adapter, or tombstone GC.

### Acceptance and verification

- P12/P13/P17/P19/P20/P22 provider portions pass with real IndexedDB: same-token
  racing writers, absent/delete ABA, explicit overwrite, invalid payload retained,
  unreadable control refused, and strict/default hint paths.
- Put request success followed by transaction abort produces rejection and no row
  replacement. Open timeout closes a late connection; a new attempt cannot overlap it.
- Versionchange drains active transactions; the next operation reopens. Denied
  access/quota map to stable errors without exposing document contents.
- Closing/reopening a browser page with the same isolated storage profile recovers
  acknowledged bytes. Fixture cleanup preserves unrelated scope sentinel records.
- `npm run build`, then `node test/persistence-indexeddb.test.mjs` and shared
  provider conformance pass. Record actual browser/version and any unsupported paths.

**Handoff:** provider factory/install inputs, diagnostics, test cleanup procedure,
and real-browser conformance results. PP-05 consumes it without reimplementing storage.

**Commit:** `feat(persistence): add transactional IndexedDB provider`

### Execution evidence — 2026-09-10

- `IndexedDBProvider` in `runtime/src/persistence/indexeddb.ts` implements the
  shared provider, with strict/default diagnostics, copied operation arguments,
  open deadline/late cleanup, and terminal-transaction receipts. Browser boot
  installation still belongs to PP-05; no authored Dataset support is claimed.
- Passed forced TypeScript build, shared contract tests, and 11 real-browser
  adapter cases on Chrome/152.0.7977.83. The local-server/browser test required
  sandbox escalation. Scope cleanup preserves sentinel data in another namespace.
- Browser suite verifies concurrent tabs, abort-after-put, cold page recreation,
  denied/quota injection, both durability paths, stalled open/late close, and
  versionchange close/reopen including an active write. Deadline cases use a
  controlled opener/clock; transaction-stall lifecycle remains PP-02/PP-05.
- Targeted command: `node test/persistence-indexeddb.test.mjs`; reusable browser
  driver and scoped fixture operations are in `test/helpers/persistence-browser.mjs`.

## PP-04 — Wire persistence into Dataset and reactive lifetime

**Depends on:** PP-01, PP-02. **Complexity:** high; reactive ordering regression risk.

### Outcome and scope

Real compiled Declare programs exercise the engine through ordinary Dataset/editor
operations, including initialization, successful settle, failed settle, and discard.

1. Attach mutation observation before authored init; latch policy after initial
   construction settle and start read at the specified point. Track accepted root
   and region writes; distinguish seed, adoption, no-op, and editor rejection.
2. Add an internal successful-settle completion seam in `runtime/src/reactive.ts`.
   Capture after every authored afterSettle wave drains; failed settle reports the
   explicit failure instead of persisting partially stabilized data. Keep this seam
   internal, avoiding a second authored scheduling primitive.
3. Connect the policy shell and engine: atomic reactive publication, schema checks,
   mutable live adoption from frozen candidate, typed deferred event delivery, and
   runtime-owned retirement. Clean timers/observers without canceling issued storage.
4. Resolve per-root provider/scope configuration through host options and supply
   explicit unsupported behavior when absent. Browser default installation is PP-05.
5. Test public commands from authored handlers, including owner replacement and
   Save and leave cancellation; retain existing navigation behavior.

### Files and exclusions

- Existing `runtime/src/data.ts`, `reactive.ts`, `instantiate.ts`, `boot.ts`, and
  existing `onDiscard` seam in `node.ts`; touch `editor.ts` only if its normal
  accepted-write path cannot already supply the required mutation notification.
- PP-01 policy binding; proposed `test/persistence-runtime.test.mjs` and
  `test/fixtures/persistence-lifecycle.declare`.
- No browser history redesign, per-app lifetime checks, direct app storage, or
  behavioral/storage dependency for ordinary nonpersistent Datasets.

### Acceptance and verification

- P01–P09 including P07b, P14–P16, P18, and P21 pass through actual compiled
  programs; deterministic storage is acceptable here. Include authored init edits,
  nested afterSettle waves, thrown settle, rejected numeric draft, same-turn double
  commit/restore, and retired/recreated same-key owners.
- Configuration changes fail closed and remain errors after an old in-flight success.
  Duplicate live scoped ownership is refused without interfering with the first owner.
- Leaf/root/insert/remove/move coverage proves root-reference observation alone was
  not used. Ordinary Dataset tests demonstrate unchanged behavior and no storage calls.
- `npm run build`, then new runtime suite plus `test/unit.test.mjs`,
  `test/databinding.test.mjs`, `test/dataschema.test.mjs`,
  `test/datasource-failure.test.mjs`, and `test/materialization.test.mjs` pass.
- Format/check/verify the new Declare fixture using existing tools; assertions read
  real app state/events. Compiler success alone does not satisfy this ticket.

**Handoff:** complete deterministic runtime integration, host injection options,
and legal fixture/commands ready for PP-05's real browser provider.

**Commit:** `feat(persistence): bind Dataset saves to settled node lifetime`

### Execution evidence — 2026-09-10

- Real Dataset root/leaf/insert/remove/move and accepted editor writes now feed
  post-settle snapshots. Policy configuration latches before authored init; node
  retirement removes observers and suppresses old events without canceling issued I/O.
- Forced build passed; runtime (12), syntax (6), engine lifecycle (14), and queue
  (13) cases pass. Databinding, dataschema, datasource-failure, and materialization
  regressions pass. Fixture format/check/typecheck and verify R1–R4 pass.
- Corrected a DataSource diagnostic regression. The unrelated stale wrapLines
  expectation was subsequently repaired in `6c429994`, with the unit summary moved
  after every case so trailing failures cannot produce a green exit. All 468 unit
  cases and all 65 source suites now pass; see the final gate evidence.
- Runtime tests found and prevent delayed boot success clearing a failed-settle
  error. Result delivery cannot be dropped by a later failed afterSettle batch.

## PP-05 — Prove browser conformance and publish author guidance

**Depends on:** PP-03, PP-04. **Complexity:** high; release gate, not just documentation.

### Outcome and scope

Browser DOM and canvas use the same real provider; documentation describes only
landed behavior; evidence satisfies the external `PLAT-PERSIST-01` prerequisite.

1. Install PP-03 through PP-04's per-root options for supported browser entry paths.
   Verify canonical entry-program identity for dev/static hosts and embedding;
   route/query changes must not retarget storage. Keep native unsupported explicit.
2. Add verifier-host namespace/provider injection and deterministic fault control
   using existing host mechanisms. Keep test capabilities inaccessible to authored
   app code and default production scope. Provide cleanup for only the fixture scope.
3. Build a small Declare fixture with visible save/recovery/error state and explicit
   Restore/Replace/Erase/Retry/Save-and-leave actions. Use it for DOM/canvas interaction,
   lifecycle fault coverage, isolated cold reload, and cross-tab checks.
4. Finish source-derived member typing/reference prose and running guide examples.
   Read `tools/internal/doc/prose/STYLE.md` before writing prose. Document limits,
   unsupported hosts, recovery/conflict/deletion behavior, receipts versus retention,
   privacy, and app validation. Update the language map only per CONTRIBUTING rules.
5. Complete the acceptance coverage ledger below. Update design status and L-28 to
   distinguish delivered browser documents from still-open native/indexed work.
   Link the verified platform interface from the Causal Desk platform gate; app
   implementation remains a separate subsequent task.

### Files and exclusions

- Existing browser bootstrap paths (`browser/boot-source.js`, `boot-static.js`,
  shared boot modules as appropriate), runtime host options, and verifier internals.
- Proposed `test/persistence-browser.test.mjs`, browser fixture under `test/fixtures/`,
  `tools/internal/doc/prose/Persistence.md`, and relevant guide/source-schema entries.
- No production Causal Desk behavior changes, invented accessibility attributes,
  automatic baseline blessing, or claims of a guaranteed final tab-close save.

### Acceptance and verification

- P01–P22 including P07b have passing evidence at the specified layer, with browser
  confirmation of actual storage for P17/P19/P22 and visible lifecycle for P20/P21.
- Cold-boot loop: accepted edit → acknowledgement → destroy old app/page → fresh
  app under the same isolated profile → exact recovery → acknowledged erase →
  fresh boot with no candidate. No test carries data across boots in JavaScript memory.
- DOM/canvas present equivalent lifecycle facts. Keyboard/focus, normal-flow status,
  reduced motion, and 44px mobile actions work in the fixture at 390×844, 900×1000,
  and 1280×800. This is platform UX smoke coverage, not Causal Desk P23–P26 completion.
- Run `npm test`, fixture verify/assertions, then the derive/artifact verification
  sequence from `docs/operational/shipping.md` and `npm run test:ladder`.
  Audit auto-staged derived outputs; follow source-only PR rules and preserve user work.
- A missing browser, skipped lifecycle case, failed generated-reference gate, or
  unverified cold boot keeps PP-05 and PLAT-PERSIST-01 incomplete.

**Handoff:** tested public interface, commands/logs, trace-to-test mapping, actual
browser/version, author documentation links, and verified external gate for CD-S5-01.

**Commit:** `feat(persistence): verify browser lifecycle and document author workflow`

## Coverage ledger and release decision

Exact executable cases, results and baseline-review evidence are in the
[execution evidence](dataset-persistence-evidence.md#trace-ledger). The ownership
table below is the routing map. All browser release gates passed on 2026-09-10;
PLAT-PERSIST-01 is complete in this feature checkout, not yet claimed merged/deployed.

| Traces | Primary owner | Integrated confirmation |
|---|---|---|
| P01 | PP-01 | PP-04 |
| P02 | PP-02 + PP-04 | PP-04 |
| P03–P05 | PP-02 | PP-04, browser cold boot in PP-05 |
| P06/P07/P07b/P08 | PP-04 (PP-02 engine portion) | PP-05 fixture |
| P09–P11 | PP-02 | PP-04/PP-05 delayed/failing storage |
| P12/P13 | PP-00 + PP-03 | PP-02 recovery, PP-05 browser |
| P14–P16 | PP-02 | PP-04, PP-05 erase/recovery |
| P17/P19 | PP-03 | PP-05 real browser |
| P18 | PP-02 | PP-04 |
| P20 | PP-02 + PP-03 | PP-05 visible failure state |
| P21 | PP-04 | PP-05 interaction |
| P22 | PP-03 | PP-05 cold boot and host identity |
| P23–P26 | Existing Causal Desk S5 tickets | After PLAT-PERSIST-01; not claimed by PP-05 |

All six tickets passing makes **browser document persistence** available for app
integration. It does not complete all of L-28 or Slice 5. Continue with the existing
[Causal Desk ticket DAG](../../apps/causal-desk/SLICE-5-TICKETS.md#dependency-graph),
whose CD-S5-00 record contract is already complete; verify that commit before reuse.
