# Dataset persistence — execution evidence

2026-09-10. Branch: `feat/dataset-persistence`. Source-only conventional commits;
generated outputs remain local per CONTRIBUTING. Unrelated pnpm files are untouched.

## Decision

**PP-00–PP-05 and PLAT-PERSIST-01 are complete on `feat/dataset-persistence`.**
Source, visual and derived gates all pass. The reviewed baseline updates are
explained below; no renderer behavior or comparison tolerance was weakened.
No Causal Desk behavior was changed. Native providers, indexed collections, sync,
retention guarantees and app-level migrations remain out of scope.

## Verified feature surface

- `Persistence` is a named, nonvisual child of a literal-seed Dataset. Compiler
  checks/typed results, provider-neutral lifecycle, transactional IndexedDB, accepted
  Dataset/editor mutations, settled snapshots and node retirement are integrated.
- Browser default installation lives in the host, with canonical entry identity,
  injectable providers/namespaces and unsupported behavior elsewhere. Standalone
  release bundles include storage only when their used-component set requires it.
- The [author guide](../guide/23-saving-data.md),
  [reference prose](../../tools/internal/doc/prose/Persistence.md), and
  [host interface](dataset-persistence-host.md) describe the implemented contracts.

## Commands and results

- `npm run build -- --force`: passed. Local ignored dependency symlink exposes
  the already-installed Node types; no package manifests or lockfiles were changed.
- Contract 10, syntax 6, engine lifecycle 14, queue 13, IndexedDB 11, runtime 13:
  passing targeted suites. IndexedDB tests ran Chrome/152.0.7977.83 on this machine.
- `node test/persistence-browser.test.mjs`: 4 passed. Real native edits and buttons
  in DOM/canvas; exact cold-page recovery; acknowledged erase and absent fresh boot;
  query/hash stability; real cross-tab stale-write conflict and explicit replacement;
  controlled delay/quota, truthful visible state, Retry and canceled leaving.
- `node test/persistence-production.test.mjs`: 2 passed. Actual slim DOM/canvas
  bundles (no debug bridge): keyboard edit/Save, real stored bytes at canonical
  program identity, close page, fresh page, keyboard Restore into the editor.
- Fixture formatted and checked. `node tools/verify.mjs
  test/fixtures/persistence-lifecycle.declare --assert
  test/fixtures/persistence-lifecycle.assert.mjs`: clean through R5. R6 baseline
  comparison not claimed; no baseline was blessed. Mobile screenshots inspected;
  the input text color was corrected for contrast against its native white field.
- Calendar production weight measured 88,160 bytes total gzip (86.1 KiB). Raised
  the accounting ceiling from 86 to 87 KiB for the general mutation/settle seams;
  a new esbuild-metafile assertion proves Calendar ships no persistence module.
- Final `npm test`: all 65 suites pass (6.4 minutes), including 468 unit cases,
  four real-browser integration cases and two production cold-boot cases.
  The earlier error-code catalog and production harness failures remain fixed:
  derive supplies the catalog; production tests drive keyboard UI rather than
  relying on the debug-only inspection API.
- Final `npm run derive`: passed. `npm run test:derived`: all five suites pass (1.0 minute), including
  129 documentation checks, shared/nullable type projection, actual generated error
  codes, guide/skill routing, and reference freshness. `assemble --check` passes.
- Final `npm run test:ladder`: all eight apps pass their declared R5/R6 checks;
  all four eval references pass through R5. Causal Desk baselines are unchanged.
- `6c429994` repairs the unit gate: moving `summarize("unit")` after every case
  first made the unchanged failing expectation exit 1. Correcting that stale
  expectation then produced 468 passed / 0 failed. `wrapLines` intentionally
  counts indentation since `ee0da33d`; no runtime behavior was changed.
- The fixture works with browser reduced motion enabled; no claim is made that
  the runtime exposes an `app.env.reducedMotion` fact (it currently does not).

## Visual baseline review — 2026-09-10

The pre-persistence checkout `cd9e4353`, force-built with the same dependencies
and Chrome, reproduced all seven failing app entries. Representative current and
control captures were byte-identical; Tracker also matched outside its existing
performance-readout masks. The new guide entry accounts for Docs' feature-only
differences, confined to the navigation column below y=649.

Historical-rule probes ran only in that disposable checkout:

| Apps | Cause and evidence |
|---|---|
| Calendar, Controls, Viewer | Restoring pre-`2d58d7d4` drawing density/CSS sizing makes all 6/3/3 old states pass. The current renderer intentionally rasterizes scaled drawings crisply at rest. |
| Docs | The same raster probe makes both pre-feature guide states pass. The current guide additionally includes the intentional “23. Saving data” entry. |
| Sampler, Tracker | Raster rollback alone leaves text differences. Also restoring pre-`5427654a` optical Text centering makes all 11/4 old states pass. Current raw Text deliberately box-centers; TextLabel is the optical alternative. |
| Desktop | Restoring optical Text centering, while retaining its already-updated raster rules, leaves only 294 pixels at y=767, maximum channel difference 6. The remaining wallpaper-edge drift also predates persistence. Window layout and content were visually reviewed. |

Refreshed 32 baselines using each reviewed app's `--states ... --bless` command,
then ran the complete comparison ladder without `--bless`. No tolerance, mask,
runtime implementation or state route was relaxed. The probes were not copied
to the feature branch. The audited disposable checkout was removed afterward.

## Trace ledger

Names below identify executable assertions, not just design sections. Each file is
under `test/` unless otherwise stated. Numeric prefixes in older test names are not
the authority for trace numbering; the review's trace table is.

| Trace | Executable evidence |
|---|---|
| P01 | `persistence-syntax`: legal policies; misplaced/duplicate/unnamed/competing-source cases; ordinary Dataset checks |
| P02 | `persistence-runtime`: dynamic policy changes fail closed; duplicate owners; lifecycle late-success configuration case |
| P03 | `persistence-lifecycle`: opening absent storage never writes seed; runtime accepted-region case; browser empty cold boot |
| P04 | `persistence-runtime`: cold adoption/manual candidate/init edits; lifecycle early-edit delayed-read case |
| P05 | `persistence-lifecycle`: boot commit missing/present; runtime boot commit cannot overwrite discovered record |
| P06 | `persistence-runtime`: accepted region writes and rejected numeric draft |
| P07 | `persistence-runtime`: numeric editor validation and nested afterSettle capture; queue same-turn final revision |
| P07b | `persistence-runtime`: nested afterSettle waves, failed settle, delayed empty boot cannot clear failed settle |
| P08 | `persistence-queue`: same-turn commits final revision/deferred results; runtime correlated receipts |
| P09 | `persistence-queue`: old acknowledgement and due autosave capture after settle |
| P10 | `persistence-queue`: continuous edits/maxDelay; explicit slots; byte budget; oversized autosave |
| P11 | `persistence-queue`: failed save aborts queued IDs; retry current data |
| P12 | `persistence-lifecycle`: invalid payload/schema; `persistence-indexeddb` shared conformance invalid envelopes |
| P13 | Shared conformance in contract/IndexedDB: unreadable control refused, even overwrite |
| P14 | `persistence-lifecycle`: Restore twice/failed replace; runtime frozen candidate and mutable adoption |
| P15 | `persistence-queue`: erase behind active save, unsent cancellation, failure ordering; runtime pause after erase |
| P16 | `persistence-queue`: erase retry retains authority and reload retains pause |
| P17 | IndexedDB conformance same-token races/absent-delete ABA/overwrite; browser real two-tab conflict |
| P18 | `persistence-runtime`: retired/recreated owner; lifecycle provider-scoped lane |
| P19 | `persistence-indexeddb`: abort after put success, no replacement/receipt |
| P20 | IndexedDB blocked/denied/quota/late-open; lifecycle stall; runtime unsupported; browser visible stall/quota/retry |
| P21 | Runtime authored cancellation and browser Save-and-leave controls; no browser-Back guarantee |
| P22 | Browser cold-page and production cold-page tests; IndexedDB scope cleanup sentinel/conformance |
| P23–P26 | Not claimed: Causal Desk integration tickets remain separate |

## Handoff

1. Land the source branch using the repository's derive-on-current-main workflow.
   No push, merge or deployment is claimed by this evidence.
2. Causal Desk CD-S5-01 and later can now use the verified platform API in this
   checkout. Follow the existing ticket DAG; no app integration was implemented here.
3. Keep L-28 open for native adapters and indexed collections, which this browser
   document-persistence implementation does not claim to complete.

Feature logs are under `/private/tmp/declare-persistence-*.log`; final gate and
historical-rule probe logs are under `/private/tmp/declare-gates-*.log`. Screenshots
are the verifier's ignored `.actual.png` outputs beside each app's baselines.
Generated artifacts were audited and removed from staging for the source-only
feature commit; they remain on disk for inspection. The disposable baseline
checkout was removed after comparison; original repo files were not restored/deleted.
