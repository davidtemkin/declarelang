# Slice 5 — local Working drafts

Implemented 2026-09-10 on `feat/causal-desk-saved-drafts`, based on the verified platform
persistence branch. All production application code is Declare and remains in this folder.
This records browser-local persistence, not cloud storage, a deployment, or a merge.

## Delivered behavior

- One versioned envelope stores only the source scenario and assumption overrides.
- Accepted edits stage a complete snapshot after reactive settlement. The platform coalesces
  writes; “Saved on this device” requires an acknowledgement covering the latest edit.
- Boot starts at Base. A validated candidate offers Restore or Discard. Early session edits
  are retained and offer Keep current work; Restore over those edits requires confirmation.
- Clear confirms, erases durably, then resets Working. An issued older write cannot recreate
  the erased record. The next deliberate edit explicitly resumes paused autosave.
- Unavailable, quota, I/O, stalled, corrupt and incompatible states preserve analysis.
  Retry stages current accepted work for saves and preserves failed erase authority for deletes.
  Corrupt payloads are discardable; unreadable control metadata requires host storage repair.

`causal-desk-draft.declare` owns this coordination. `causal-desk-draft-panel.declare` presents
status, recovery and standard Dialog confirmation. `workingScenario` is still the sole live
editing truth. No derived model output is persisted.

## Reproduce

From the repository root, with the platform/compiler bundles built and Chrome available:

```bash
node apps/causal-desk/tests/verify.mjs
node test/verify-apps.test.mjs
```

The first command runs every app behavior, pure-record, arbitrary-DAG and visual gate.
It never blesses baselines. The second checks all runnable repository examples and library
components through compiler/typecheck/boot (46 checks in this checkout).

## Evidence

Final verification passed: 39 browser behavior cases, both pure harnesses, 31 visual states
and 46 repository compiler/boot checks. The aggregate run passed every behavior/pure/model
visual gate; after correcting the new visual comparison to the standard R6 pixel contract,
all 15 persistence snapshots passed in a fresh comparison run. No application change or
baseline re-blessing was needed for that comparison correction.

| Suite | Cases | What it proves |
|---|---:|---|
| Persistence lifecycle | 2 | Empty boot, candidate-only cold boot; no seed overwrite |
| Save | 2 | Accepted/invalid edits, reset, exact source delta, stale receipt coverage |
| Recovery | 5 | Restore, Discard, early edits, Keep current, incompatible record |
| Clear | 2 | Cancel, acknowledged deletion, in-flight save ordering, resume after erase |
| Storage errors | 15 | Delayed initial read, failed read/write/delete, retry, stalled transaction, actual corrupt IndexedDB rows |
| Accessibility | 4 | DOM/canvas keyboard flows, safe default, focus trap/return, Retry, resize and reduced motion |
| Durable return | 3 | Native numeric entry, two edits, cold restore, exact model/bridge and Clear in both renderers; default browser-host clock smoke |
| Prior behavior | 6 | Model, responsive layout, numeric input, keyboard, reduced motion, calculation errors |

The pure-record harness separately rejects `NaN`, both infinities, unsupported versions,
unknown/non-assumption factors and out-of-range values atomically. Non-finite JSON numeric
payloads are also tested through real IndexedDB and rejected by the platform before restoration.
The arbitrary-DAG harness remains an independent formula-dependency/path gate.

Visual review covers 16 existing model states and 15 new persistence states: recovery, saved,
unavailable storage, stale draft and Clear confirmation at 1280×800, 900×1000 and 390×844.
Reviewed human-readable UTC timestamps, separate status/error regions, 44px draft actions,
mobile wrapping and modal layout. Mobile recovery omits unused space when Keep current work
is not available. The model state's screenshots use the existing document-origin capture;
the new persistence screenshots capture the visible viewport. Behavioral tests separately
exercise scrolled native editing and the graph's horizontal scroll region.
Both visual suites use Declare's standard per-channel tolerance of 4, with no masks. A
first comparison caught only 1-level GPU rounding in a dimmed mobile confirmation background;
the new suite was corrected from PNG byte equality to the existing rendered-pixel contract.

## Test isolation and clock discipline

Every host gets a fresh Chrome profile and unique verifier namespace. Most browser tests use the
platform's real IndexedDB provider, with its existing controlled-clock/failure wrapper; one
smoke case also exercises the ordinary browser host and its real clock. The
app-specific test-only wrapper can hold the first read or corrupt the exact compound key in
that isolated namespace. None of these adapters ship with the application.

Persistence deadlines and animation time are different clocks. Tests advance the persistence
clock explicitly; a wall-clock poll cannot fire a virtual timer. Model visual states pin Date
and explicitly commit their already-staged envelope rather than pretending a frozen Date can
advance a debounce deadline. Autosave itself is exercised by the separate clock-driven tests.
Resize and focus assertions wait for painted/deferred state, not just reactive settlement.

## Deliberate boundaries

- One draft, one device/browser storage scope; clearing site data removes it.
- No scenario library, cloud sync, account sharing, migration or multi-tab conflict UI.
- Native/indexed platform storage remains outside this browser milestone.
- Standard Dialog dismisses before delivering its action. Pending delete lives in the panel;
  Working is locked until acknowledgement and preserved on failure.
- TextInput has no disabled property, so the editor is hidden during pending Clear; the
  surrounding edit/scenario actions are disabled. Nothing is reset until erase succeeds.
- Existing `DECLARE4000` link warning in the graph helper remains unrelated to persistence.

Unrelated generated build outputs and root pnpm files are not included in Slice 5 commits.
