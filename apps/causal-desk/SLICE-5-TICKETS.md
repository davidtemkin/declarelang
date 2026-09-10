# Causal Desk — Slice 5 tickets

Slice 5 persists one local Working scenario and restores it only after explicit analyst
confirmation. The application remains all Declare. Tests may use JavaScript to drive the real
runtime, storage lifecycle, cold boots, and failure injection.

The product and storage decisions are authoritative in
[SLICE-5-DESIGN.md](SLICE-5-DESIGN.md). These tickets translate that design into bounded work;
they do not reopen its scope.

## Platform gate

Slice 5 depends on Declare open item `L-28`: persistent Datasets. Direct browser storage and a
Causal Desk-specific TypeScript adapter are outside the accepted architecture.

`PLAT-PERSIST-01` is an external prerequisite, not a Causal Desk implementation ticket. It is
tracked by [platform PP-00–PP-05](../../docs/system-design/dataset-persistence-tickets.md) and is
complete only when the Declare repository exposes and documents:

- a persistent Dataset that loads its last-known value at boot;
- observable loading, ready, committing, and failed states;
- acknowledged durable writes and deletes;
- typed/inspectable failure information for unavailable storage, quota, corrupt data, and
  failed commit/delete;
- a test-isolated namespace; and
- verifier support for cold-boot persistence and deterministic lifecycle failure injection.

2026-09-10: that interface is implemented on `feat/dataset-persistence`; see the
[author guide](../../docs/guide/23-saving-data.md) and
[verified cases / gate results](../../docs/system-design/dataset-persistence-evidence.md).
The external gate is **complete in this checkout**: all source, visual and derived
gates passed. This is not a claim that the branch is merged or that CD-S5 is implemented.
The app tickets are unblocked; no app storage shim is authorized or needed.

The platform work must include compiler/runtime documentation and its own conformance tests. An
app agent must read the landed API and use it exactly; it must not infer syntax from this plan.

## Execution rules

- Implement `CD-S5-00` immediately if desired. Do not start `CD-S5-01` or later until
  `PLAT-PERSIST-01` is verified in the checkout.
- Keep production application code in `.declare` files and every source file below 500 lines.
- Keep every Causal Desk-specific file inside `apps/causal-desk/`.
- Preserve one live `workingScenario` Dataset as the editing truth. Persist a versioned record,
  never derived values or a serialized UI tree.
- Keep storage errors distinct from numeric validation and calculation availability.
- Inspect generated paths before browser tests. Tests must use a unique storage namespace and
  delete only that namespace during cleanup.
- Run every existing Slice 1–4 gate after each ticket that touches production behavior.
- Review `git status`, stage named Causal Desk files only, and leave unrelated root pnpm files
  untouched.
- Use the ticket's conventional commit after its acceptance checks pass.

## Dependency graph

```text
PLAT-PERSIST-01 persistent Dataset ─────┐
                                        ├─> CD-S5-01 storage integration
CD-S5-00 record contract + validation ──┘              |
                                                       +─> CD-S5-02 durable autosave ──┐
                                                       |                               ├─> CD-S5-04 clear saved work
                                                       +─> CD-S5-03 recovery panel ────┘              |
                                                                        |                              v
                                                                        └──────────────> CD-S5-05 failure states
                                                                                                       |
                                                                                                       v
                                                                                            CD-S5-06 responsive a11y
                                                                                                       |
                                                                                                       v
                                                                                            CD-S5-07 final gate
```

`CD-S5-02` and `CD-S5-03` may run in parallel after `CD-S5-01` because one owns save lifecycle
and the other owns boot recovery. They converge before destructive clearing and failure-state
coverage.

## CD-S5-00 — Define the saved-record contract

Status: complete on `feat/causal-desk`. `PLAT-PERSIST-01` is now verified on
`feat/dataset-persistence`; the remaining app tickets can proceed in that checkout.

### Outcome

The storage record can be built and validated without any storage implementation. Invalid or
stale records are rejected atomically with stable reason codes.

### Files

- New `causal-desk-persistence.declare`
- `causal-desk.declare` only to include the new helper file
- New `tests/persistence-record-harness.declare`
- New `tests/persistence-record-assert.mjs`

### Implementation

1. Define the version-1 record type and constants for schema version, model ID, model revision,
   and logical storage key.
2. Add a pure builder that accepts model/scenario/Working documents, `workingSourceId`, and an
   ISO timestamp. Emit only overrides that differ from the source scenario.
3. Add one pure validator returning a stable result such as
   `{ ok, code, message, record }`. Codes cover valid, malformed, unsupported schema, wrong
   model, stale revision, unknown source, unknown/non-assumption factor, non-finite value, and
   out-of-range value.
4. Validate the complete record before returning an accepted record. Do not filter bad entries
   into a partially valid draft.
5. Ignore unknown envelope fields for forward compatibility. Treat missing required fields as
   malformed.

### Acceptance and verification

- Base-sourced and Fuel-Shock-sourced records contain the exact override delta.
- Round-tripping a valid record recovers the same source and Working assumption values.
- Every invalid class returns its specified code and no accepted record.
- Constants, derived factors, `NaN`, infinities, and inclusive-bound violations are rejected.
- Input objects are not mutated.
- The main application still passes all Slice 1–4 gates.

```bash
node tools/verify.mjs apps/causal-desk/tests/persistence-record-harness.declare \
  --assert apps/causal-desk/tests/persistence-record-assert.mjs
```

### Commit

`feat(causal-desk): define saved scenario record`

## CD-S5-01 — Integrate the persistent Dataset

### Depends on

`PLAT-PERSIST-01`, `CD-S5-00`

### Outcome

Causal Desk has one deep persistence module that owns durable storage and exposes a small
app-facing lifecycle. The initial Base experience remains usable while storage loads or fails.

### Files

- `causal-desk-persistence.declare`
- `causal-desk.declare`
- New `tests/persistence-lifecycle.mjs`

### Implementation

1. Read the landed persistent-Dataset documentation and verify its behavior with the smallest
   probe before editing Causal Desk. Record the exact API used in a comment beside the Dataset.
2. Add one persistence node/class containing the persistent Dataset. Keep the logical key from
   `CD-S5-00` unchanged; supply test isolation through the host namespace, not key concatenation.
3. Expose app-facing derived state for checking, no draft, recoverable draft, committing, saved,
   and failed. Derive these states from Dataset lifecycle and validated content; do not maintain
   a competing status flag.
4. Keep the existing in-memory `workingScenario` as the live editing truth. Loading storage must
   not mutate it or change active/comparison selection.
5. A corrupt or stale loaded value becomes a rejected recovery candidate with its validation
   code; it never reaches model calculation.
6. Establish the shared coordinator seams and generation bookkeeping here: stage latest Working,
   hold/release staging during recovery, and explicit commit after erase. CD-S5-02 wires normal
   edits/status to them; CD-S5-03 wires recovery. Neither parallel ticket invents a second coordinator.

### Acceptance and verification

- Cold boot with empty storage opens Base and reports no draft after loading.
- Cold boot with a valid record exposes a recovery candidate without activating Working.
- Loading and failure states do not block scenario exploration or editing.
- No storage API leaks into header, graph, inspector, or model classes.
- The test uses real persistent storage under an isolated namespace.

### Commit

`feat(causal-desk): integrate local draft storage`

## CD-S5-02 — Persist successful Working edits

### Depends on

`CD-S5-01`

### Outcome

Every successful slider, direct-entry, or reset mutation durably saves the current Working draft
and reports honest progress without delaying model interaction.

### Files

- `causal-desk.declare`
- `causal-desk-persistence.declare`
- `causal-desk-layout.declare`
- New `tests/persistence-save.mjs`

### Implementation

1. Wire the CD-S5-01 `saveWorkingScenario()` coordinator to schedule an after-settle rebuild
   of the stored envelope from latest accepted Working data. Use the reviewed
   [platform contract](../../docs/system-design/dataset-persistence.md#9-causal-desk-integration-contract):
   manual recovery, automatic saving, explicit overwrite policy. Do not issue a pinned
   commit command for every slider event.
2. Call it after the existing shared Working-scenario mutation seam succeeds. Rejected numeric
   input and bundled-scenario selection must not write storage.
3. Advance workingGeneration on accepted Working mutations and stagedWorkingGeneration with
   envelope replacement. Show Saved only when both match AND platform saved is true. Receipt
   time supplies the UI timestamp. Use text, not color alone.
4. Coalesce superseded writes using the persistent Dataset's supported semantics. Do not add
   polling, timers, unload handlers, or a second copy of Working values.
5. A save failure leaves the in-memory scenario and all calculations intact; detailed recovery
   behavior is completed in `CD-S5-05`.
6. Hold staging during load, unresolved recovery, and clearing. Support explicit commit to
   resume after erase without recreating a draft from the Clear-to-Base reset itself.

### Acceptance and verification

- Slider, Apply, Enter, and reset edits each persist the final exact value.
- Rapid successive edits end with the newest acknowledged record.
- Stored content is override-only and carries the correct source and timestamp.
- The UI never says Saved before acknowledgement.
- An older envelope acknowledgement never labels a newer Working generation Saved.
- Invalid entry performs no durable write.
- A cold boot after acknowledgement exposes the exact record as a recovery candidate.

### Commit

`feat(causal-desk): save working scenario locally`

## CD-S5-03 — Add explicit Restore and Discard

### Depends on

`CD-S5-01`

### Outcome

A returning analyst sees a compact recovery panel and deliberately restores or discards the
saved Working draft. Nothing stale silently becomes the active analysis.

### Files

- `causal-desk.declare`
- `causal-desk-persistence.declare`
- `causal-desk-layout.declare`
- New `tests/persistence-recovery.mjs`

### Implementation

1. Add a recovery panel in normal document flow above the graph. It displays the saved timestamp
   and 44px Restore and Discard controls.
2. `restoreSavedScenario()` validates again, confirms if early Working edits would be replaced,
   adopts the platform candidate and atomically replaces `workingScenario`, sets
   `workingSourceId`, activates Working, uses Base comparison, and dismisses the candidate.
3. Preserve the selected factor when valid; clear contribution selection because its rows may
   change. Do not restore any other UI state.
4. `discardSavedScenario()` confirms, durably deletes, and dismisses the panel only after delete
   acknowledgement. Preserve current in-memory work; if early Working edits exist, stage and
   explicitly commit them after delete acknowledgement. Discard must not erase new work.
5. Move focus predictably: Restore focuses the Working scenario choice; Discard returns focus to
   the main scenario control.
6. With early Working edits and a valid candidate, offer Keep current work: validate/stage the
   current envelope and explicitly replace the candidate. Update generation coverage with each
   restore/stage transition; no automatic adoption or silent replacement.

### Acceptance and verification

- Cold boot never activates Working before Restore.
- Restore recovers exact assumptions/source and recomputes values/contributions.
- Discard without new Working edits followed by a second cold boot shows no recovery panel.
- Early edits survive read arrival and Discard; Keep current saves them, Restore confirms replacement.
- A rejected candidate offers Discard but never Restore.
- Keyboard-only and mobile pointer flows reach both actions.
- The panel does not overlap header, status, graph, summary, or inspector at any tier.

### Commit

`feat(causal-desk): restore saved scenario explicitly`

## CD-S5-04 — Clear saved work safely

### Depends on

`CD-S5-02`, `CD-S5-03`

### Outcome

An analyst can deliberately remove both the durable draft and current Working scenario without
affecting bundled scenarios.

### Files

- `causal-desk.declare`
- `causal-desk-persistence.declare`
- `causal-desk-layout.declare`
- New `tests/persistence-clear.mjs`

### Implementation

1. Show `Clear saved work` only when a local record exists or Working contains overrides.
2. Use the library Dialog for confirmation. State that the action removes work from this device
   and cannot be undone.
3. Confirm first deletes durably. Only after acknowledgement reset Working to Base, set active
   and comparison to Base, clear contribution selection and validation draft, and close Dialog.
   Lock editing during deletion; do not stage/save the reset. Preserve the platform autosave
   pause until the next deliberate Working edit stages and explicitly commits once.
4. Cancel changes nothing and restores focus to the opener.
5. Do not alter `modelDocument`, `scenarioDocument`, bundled values, or formulas.

### Acceptance and verification

- Cancel preserves durable and in-memory work exactly.
- Confirm removes the storage record and resets only Working/transient dependent state.
- A cold boot after confirmed clear has no recovery candidate.
- The Dialog traps/restores focus and works at 390×844 with 44px actions.
- Delete failure does not falsely reset or claim success.
- In-flight/queued saves cannot recreate the deleted record; the next deliberate edit resumes saving.

### Commit

`feat(causal-desk): clear saved work safely`

## CD-S5-05 — Expose persistence failures

### Depends on

`CD-S5-02`, `CD-S5-03`, `CD-S5-04`

### Outcome

Unavailable storage, corrupt/stale records, and failed saves or deletes have distinct readable
states. The analyst can keep working in memory and retry safe operations.

### Files

- `causal-desk-persistence.declare`
- `causal-desk-layout.declare`
- Existing persistence tests as needed
- New `tests/persistence-errors.mjs`

### Implementation

1. Map persistent-Dataset and record-validation failures to the exact product states in
   `SLICE-5-DESIGN.md`; retain stable machine-readable codes beside readable copy.
2. Keep the persistence status separate from `calculationStatus` and numeric-entry validation.
3. Add Retry for failed save/delete when the platform marks the operation retryable. For save,
   stage the latest complete accepted Working snapshot before retrying current data. For delete,
   preserve the failed delete intent and revision authority. Never replay a stale save snapshot.
4. Corrupt, stale, and invalid records offer only Discard. Nothing invalid enters
   `workingScenario`.
5. Storage-unavailable state explains that current-session changes still work.
6. Distinguish corrupt payload (Discard allowed) from unreadable platform control metadata
   (host/site-storage repair required). A stalled transaction remains pending with no Retry
   until its outcome is known. Clear failure releases the editing lock but preserves the pause.

### Acceptance and verification

- Deterministically inject unavailable, quota, corrupt, stale revision, unknown factor,
  non-finite/out-of-range override, save failure, and delete failure through the platform test
  seam.
- Every state has distinct text and code; no state relies on color.
- Save/delete retry resolves only after acknowledgement.
- Failures never erase current in-memory work or trigger calculation unavailable.
- Restoring ordinary storage returns the app to a truthful saved/no-draft state.

### Commit

`feat(causal-desk): expose local storage failures`

## CD-S5-06 — Lock responsive and accessible persistence UX

### Depends on

`CD-S5-03`, `CD-S5-04`, `CD-S5-05`

### Outcome

Recovery, save status, clearing, and failure handling are usable by keyboard and pointer at all
three viewport tiers without displacing the model unpredictably.

### Files

- `causal-desk-layout.declare`
- `causal-desk.declare`
- Existing persistence tests as needed
- New `tests/persistence-accessibility.mjs`

### Implementation

1. Integrate recovery/status regions into desktop, stacked, and mobile vertical calculations.
   Their presence changes flow once; graph cards and edges retain their shared stage coordinates.
2. Keep every action at least 44×44px on mobile and every status readable at 390px without page
   horizontal overflow.
3. Verify tab order, Dialog focus trap/return, Restore focus destination, visible focus treatment,
   and screen-readable status/error text.
4. Reduced motion removes any recovery-panel transition. Persistence lifecycle never waits for
   animation.
5. Resizing preserves live Working data, storage lifecycle, and a pending recovery choice.

### Acceptance and verification

- Complete Restore, Discard, Retry, Cancel, and Clear flows without a pointer.
- Repeat the primary flows with pointer input at 390×844.
- No page-level horizontal overflow or overlapping status/recovery/model regions at 1280×800,
  900×1000, and 390×844.
- Storage operations do not move graph scroll or reset valid factor selection unexpectedly.
- Existing responsive, keyboard, numeric, reduced-motion, and calculation-error suites pass.

### Commit

`feat(causal-desk): make saved drafts accessible`

## CD-S5-07 — Prove durable return and finish the slice

### Depends on

`CD-S5-00` through `CD-S5-06`

### Outcome

Slice 5 has cold-boot, failure, behavior, and inspected visual evidence, and the design accurately
records what shipped and what remains deferred.

### Files

- All persistence tests as needed
- `tests/states.mjs`
- `tests/baselines/*.png`
- `DESIGN.md`
- `SLICE-5-DESIGN.md`
- Production files only when the final gate exposes a defect

### Implementation

1. Add an end-to-end durable loop: create a Fuel Shock-derived Working scenario, edit multiple
   assumptions, wait for acknowledgement, cold boot, Restore, verify the outcome and largest
   contribution, Clear, cold boot again, and verify no draft remains.
2. Add visual states at desktop, tablet, and mobile for recovery available, saved, storage
   unavailable, stale record, and clear confirmation.
3. Inspect every baseline for overlap, clipping, unreadable timestamps/errors, numerical wrap,
   focus visibility, target size, and page overflow before blessing.
4. Run a keyboard-only durable loop and mobile pointer durable loop through public controls.
5. Update both design documents to mark Slice 5 complete. Keep scenario libraries, cloud sync,
   model migration, and multi-tab conflict handling deferred.

### Definition of done

- The cold-boot loop proves real persistence across app instances under an isolated namespace.
- Record, lifecycle, save, recovery, clear, error, and accessibility tests pass.
- Every Slice 1–4 test and the arbitrary-DAG path harness passes.
- All named visual states pass after inspection.
- `node test/verify-apps.test.mjs` passes repository-wide.
- Every Declare source remains below 500 lines and all Causal Desk files remain in one folder.
- Production Causal Desk code contains no browser storage global or TypeScript storage adapter.

### Commit

`test(causal-desk): cover durable working scenarios`

## Slice 5 definition of done

Slice 5 is complete only after the external persistent-Dataset gate is available, every app
ticket is committed, a real cold boot recovers acknowledged data, every failure degrades safely,
all visual states have been inspected, and all prior Causal Desk behavior remains green.
