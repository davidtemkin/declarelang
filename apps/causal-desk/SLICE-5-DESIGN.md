# Causal Desk — Slice 5 persistence design

Slice 5 lets an analyst return to one locally saved Working scenario without turning Causal
Desk into a scenario-management product. It preserves the current fixed-model boundary,
keeps data on the analyst's device, and makes restoration explicit so an old draft is never
mistaken for the bundled Base case.

## Status and prerequisite

This slice is **designed but not implementation-ready**.

Declare currently rejects direct access to browser `localStorage`, and persistent Datasets are
still an open language/runtime capability (`L-28` in `docs/system-design/open-items.md`). Causal
Desk production code remains all Declare, so this slice will not add a browser-global call or an
app-specific TypeScript storage shim.

Implementation begins only when Declare provides a persistent Dataset with:

- last-known-value loading at boot;
- an observable loading, ready, and failed lifecycle;
- durable commit acknowledgement before the UI claims a save succeeded; and
- graceful failure for unavailable storage, quota errors, and corrupt records.

The platform capability is a prerequisite, not a Causal Desk ticket. Shared runtime work remains
outside this app's folder and should be designed and accepted independently.

## Product outcome

An analyst can:

1. change one or more assumptions in the Working scenario;
2. see when that draft has been saved locally;
3. close and reopen Causal Desk;
4. explicitly restore the saved draft or discard it; and
5. clear local work without changing bundled scenarios.

The slice succeeds if returning to a draft is trustworthy and unsurprising. It does not need a
scenario library, accounts, synchronization, or collaboration.

## Scope

### Persisted

- Storage schema version
- Model ID and revision
- Working scenario source ID
- Working assumption overrides
- Save timestamp

### Not persisted

- Active or comparison scenario selection
- Selected factor or contribution
- Inspector expansion and graph scroll position
- Numeric-entry drafts or validation errors
- Calculation errors
- Focus, hover, animation, or other presentation state
- Reduced-motion state, which continues to follow the host plus the current-session override

Transient state is cheap to reconstruct and can become misleading across model revisions. The
saved artifact is the analyst's work, not a serialized UI session.

## Storage record

The logical record is versioned independently from the model:

```json
{
  "schemaVersion": 1,
  "modelId": "airline-operating-margin",
  "modelRevision": "1",
  "workingSourceId": "fuelShock",
  "overrides": {
    "jetFuelPrice": 4.25,
    "averageFareGrowth": 0.055
  },
  "savedAt": "2026-09-09T19:42:00.000Z"
}
```

The storage key is namespaced by application and model:

`causal-desk/airline-operating-margin/working-scenario`

Only overrides that differ from the source scenario are stored. This keeps the record small and
makes its meaning explicit. The expected payload is below 2 KB for the fixed six-assumption
model.

## Validation boundary

A stored record is untrusted input even though it came from the same browser. Restore succeeds
only when all of these are true:

- `schemaVersion` is supported;
- `modelId` and `modelRevision` match the running model;
- `workingSourceId` names a bundled scenario;
- every override names a current assumption factor;
- every value is finite and within that factor's inclusive bounds; and
- no constant or derived factor is overridden.

Unknown fields are ignored. Unknown assumptions, invalid values, malformed records, and model
revision mismatches reject the complete record; restoration is atomic and never partially
applies a draft.

Slice 5 does not migrate stale model records. The user may discard one and start from a current
bundled scenario. A migration system would only be justified after multiple model revisions and
real saved work exist.

## Interaction design

### First visit or no saved draft

Causal Desk opens on Base exactly as it does now. No persistence UI competes with the primary
concept loop. The status area may say `LOCAL DRAFT · NONE` when space permits.

### Saving

Every successful Working-scenario mutation writes the complete versioned record through the
persistent Dataset. Slider and numeric entry continue to share the existing assumption mutation
seam, so persistence does not introduce a second editing path.

The save indicator has three text states:

- `Saving locally…`
- `Saved locally · <time>`
- `Local saving unavailable · changes remain in this session`

The interface shows `Saved` only after durable commit acknowledgement. A storage failure never
rolls back or disables the in-memory Working scenario.

### Returning with a saved draft

The app still opens on Base. A compact recovery panel appears above the graph:

`Saved Working scenario from <time>`

It offers two 44px controls:

- **Restore** — validates and atomically replaces the in-memory Working scenario, selects
  Working as active, leaves Base as comparison, and dismisses the panel.
- **Discard** — deletes the stored record after confirmation and leaves the current Base state
  unchanged.

Restoration is explicit because an old local draft must not masquerade as the product's bundled
starting point. The panel is keyboard reachable, does not cover the graph, and participates in
the existing desktop/stacked/mobile vertical flow.

### Clearing current work

When Working is active, a `Clear saved work` action is available near the save indicator. It:

1. confirms the destructive action;
2. deletes the stored record durably;
3. resets the in-memory Working scenario to Base; and
4. selects Base as active and comparison.

Bundled scenarios are immutable and cannot be deleted.

## State ownership

```text
Persistent Dataset
  saved record + lifecycle + commit result
          |
          v validate
Restore candidate --------> existing workingScenario Dataset
                                  |
slider / numeric entry ---------->+----> model values and contributions
                                  |
                                  +----> persistent Dataset commit
```

The persistent Dataset owns only durable bytes and its lifecycle. The existing
`workingScenario` Dataset remains the live editing truth. Model values, contributions, paths,
and formatted values remain derived; none are written to storage.

One app method owns each durable transition:

- `saveWorkingScenario()` builds and commits the versioned record.
- `restoreSavedScenario()` validates first, then performs one Working-scenario replacement.
- `discardSavedScenario()` durably removes the record.

Existing slider and numeric-entry handlers continue to mutate the Working scenario through the
same method they use today, then request a save. No control writes storage directly.

## Failure behavior

| Condition | User-visible result | Model behavior |
|---|---|---|
| Storage loading | `Checking for a local draft…` | Base remains usable |
| Storage unavailable | `Local saving unavailable` | In-memory editing remains usable |
| Save fails | Persistent warning with retry | Current Working values remain intact |
| Corrupt record | `Saved draft could not be read` + Discard | Nothing restored |
| Stale model revision | `Saved draft belongs to an older model` + Discard | Nothing restored |
| Invalid override | `Saved draft is invalid` + Discard | Nothing partially restored |
| Delete fails | Warning remains; retry offered | Current model is not falsely reported cleared |

Persistence failures are distinct from numeric-entry errors and calculation-unavailable states.
The calculation status continues to describe the model only.

## Privacy and trust

- Data stays in the current browser profile; no server request or analytics event contains the
  saved assumptions.
- UI copy says `Saved on this device`, not merely `Saved`.
- Shared computers and browser-profile backups can expose local drafts; the recovery panel and
  clear action make that boundary visible.
- No credentials, user identity, market data, or provenance claims enter the record.
- The serialized record is plain data. It contains no formula or executable expression.

## Concurrency and lifecycle

Slice 5 supports one tab and one Working draft. If multiple tabs edit the same key, the last
durably committed record wins; live cross-tab reconciliation and conflict UI are deferred. The
current tab never replaces its in-memory work merely because storage changes elsewhere.

Closing during a pending commit may lose the final edit. The persistent Dataset prerequisite
must expose commit completion, and tests must prove navigation after acknowledgement retains the
record. Slice 5 does not add unload handlers or polling.

## Responsive and accessible behavior

- Recovery and failure panels are in document flow at every tier.
- Restore, Discard, Retry, and Clear controls are keyboard operable and at least 44px on mobile.
- Save state is expressed in text and does not rely on color or animation.
- Reduced motion applies to panel appearance; persistence never waits for a transition.
- Focus moves to the restored Working scenario control after Restore and returns predictably
  after confirmation dialogs.

## Verification strategy

The persistence capability must be tested through real durable storage, not a second in-memory
Dataset posing as storage.

Slice-level verification covers:

1. edit, receive commit acknowledgement, cold-reload, Restore, and exact value recovery;
2. Discard followed by cold-reload with no recovery panel;
3. source-scenario fidelity and override-only serialization;
4. corrupt, stale-version, unknown-factor, non-finite, and out-of-range records;
5. quota/unavailable/save/delete failures without loss of in-memory work;
6. keyboard-only Restore/Discard/Clear flows;
7. mobile pointer targets and page containment;
8. no regression to calculation, contribution, responsive, keyboard, reduced-motion, or error
   suites; and
9. inspected visual states for recovery available, saved, saving unavailable, stale record, and
   clear confirmation.

Tests use a unique storage namespace and delete only that namespace during cleanup.

## Non-goals

- Multiple named saved scenarios
- Rename, duplicate, import, or export
- Cloud sync, accounts, sharing, or collaboration
- Cross-tab merge or conflict resolution
- Model-version migration
- Persisting bundled scenarios or formulas
- Persisting arbitrary UI state
- Adding a Causal Desk-specific TypeScript storage adapter

## Decisions and trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| Explicit restore instead of automatic activation | Prevents stale assumptions from silently becoming the current analysis | One extra action on return |
| One draft instead of a scenario library | Small, legible product and storage model | Analysts cannot retain alternatives |
| Override-only record | Clear provenance and tiny payload | Restore depends on the matching source revision |
| Reject stale revisions instead of migrate | No silent reinterpretation of financial assumptions | Old drafts must be discarded |
| Persistent Dataset instead of browser globals | Preserves Declare's data model, testability, and portability | Slice waits for the platform capability |
| Durable acknowledgement before `Saved` | Honest failure semantics | Save state is asynchronous |

## Revisit when the product grows

Revisit the design only after evidence supports one of these needs:

- Analysts need more than one draft: introduce named local scenarios and explicit IDs.
- Drafts must move between devices or people: design accounts, authorization, audit history, and
  server storage as a new slice.
- The model changes while saved drafts matter: add explicit revision migrations with preview and
  user confirmation.
- Concurrent tabs are common: add revision checks and conflict handling rather than silent
  last-write-wins.

