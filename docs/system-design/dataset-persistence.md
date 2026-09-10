# Dataset persistence — implementation contract

Status: **implemented on the feature branch; release verification in progress**, 2026-09-10.
The platform gate is not yet complete. The [review and acceptance record](dataset-persistence-review.md)
records criticisms, decisions, counterexamples, and implementation dependency order.
The [implementation tickets](dataset-persistence-tickets.md) define PP-00–PP-05
ownership, verification, and the external platform gate. See their execution evidence.
`text` fences illustrate proposed source, not executable reference examples.

## 1. Scope and governing rule

**A Dataset owns the working value. Persistence records acknowledged snapshots;
the interface derives from both.** Accepted edits remain available to the model
while storage loads, saves, or fails. Editor drafts remain outside the Dataset;
a disk acknowledgement never replaces the working value.

The first milestone implements atomic JSON documents in browser IndexedDB, shared
by DOM and browser-canvas rendering, plus an isolated deterministic test adapter.
Native hosts report `unsupported` until they implement the same contract. Native
storage and indexed collections are explicit later milestones. L-28 remains open
for those extensions. Cloud sync, remote cache reconciliation, multi-key transactions,
and automatic migrations are excluded. Causal Desk is the first consumer, not the
platform's storage schema. Browser implementation does not complete the app's Slice 5.

Evidence checked: [Dataset](../../runtime/src/data.ts), [Editor](../../runtime/src/editor.ts),
[construction](../../runtime/src/instantiate.ts), [checking](../../runtime/src/check.ts),
[node lifetime](../../runtime/src/node.ts), [navigation](../../runtime/src/view.ts),
[browser history](../../browser/host-client.js), and [capabilities](capabilities.md).
Runtime behavior wins over commentary that suggests otherwise.

## 2. One optional policy on a Dataset

```text
schema Note [ title: string, body: string ]
App [
    note: Dataset [ schema = Note,
        disk: Persistence [ key = "notes/current" ]
        ] { { "title": "Untitled", "body": "" } },
    editor: View [ datapath = { app.note.value },
        TextInput [ text <-> :title ],
        TextInput [ text <-> :body ]
        ]
    ]
```

`Persistence` is a named nonvisual Node directly attached to one Dataset. The
Dataset remains the target of paths, mutations, and editor sessions. The policy's
name is arbitrary; `disk` is conventional. This reuses grammar but DOES extend
Dataset's structural rules: `checkDataNode` and `constructData` currently reject
children. They must admit exactly one Persistence child, construct it, and install
its methods/events with enclosing `app`/`classroot` scope. Do not incidentally allow
arbitrary Dataset children, user Dataset subclasses, or Dataset methods.

A persistent Dataset must have a literal JSON seed, optionally validated by its
existing `schema`. No implicit empty record: an untyped envelope declares
`] { null }`. Reject DataSource owners and all `contents` owners in this milestone;
they have another writer. The diagnostic recommends a separate writable Dataset.
A plain Dataset has no persistence scheduling or storage dependency.

| Policy attribute | Default | Exact meaning |
|---|---|---|
| `key: string` | required | Opaque nonempty document key, at most 1024 UTF-8 bytes, scoped by the host. |
| `restoreOn: "load" | "manual"` | `"load"` | Adopt a valid boot snapshot only if no accepted local edit preceded arrival; manual always offers recovery. |
| `save: "auto" | "manual"` | `"auto"` | Accepted edits schedule a save, or wait for explicit `commit()`. |
| `delay: number` | `250` | Milliseconds of quiet before autosave capture. |
| `maxDelay: number` | `1000` | Maximum batching interval during continuous edits, excluding I/O backpressure. |
| `conflict: "fail" | "overwrite"` | `"fail"` | Compare stored revisions atomically, or explicitly accept last committed writer wins. |

Policies latch after the initial construction settle, before authored init handlers.
Literals and initial constraint evaluation are allowed; later unequal values are
configuration errors and never retarget storage. Equal reevaluation is a no-op.
Fail closed on an unequal update: cancel unsent commands with configuration errors,
allow an issued transaction to terminate, and require owner reconstruction. Retain
the configuration error even if that transaction succeeds; never resume autosave.
Use ordinary expressions, not invented `once` syntax. Require finite
`0 <= delay <= maxDelay`. Dynamic document selection retains or retires an owner
explicitly after resolving its work. Merely opening a Dataset never writes its seed.

## 3. Observable state and the truth of “Saved”

State is one internal record published atomically. Its public facts are:

| Read-only member | Type / meaning |
|---|---|
| `loadStatus` | `"loading" | "loaded" | "failed"`; loaded includes confirmed absence. |
| `writeStatus` | `"idle" | "queued" | "committing" | "erasing" | "failed"`. |
| `recovery` | `"none" | "available" | "invalid"`; any recovery holds automatic writes. |
| `candidate` | Detached deeply read-only JSON, typed from owner schema, or null. `recovery` distinguishes stored JSON null from no candidate. |
| `candidateSavedAt` | Host timestamp of the recovery record, or null. |
| `exists` | Last observed presence; meaningful after successful read/write/delete. |
| `revision`, `savedRevision` | Monotonic local content revision and acknowledged revision; initially 0 and -1. |
| `savedAt` | Last write/adoption acknowledgement timestamp, or null. |
| `autosavePaused` | True after admitted erase, including failure, until a deliberate successful commit/replace/restore resumes it. |
| `error` | `PersistenceError | null`: `{code, message, operation, retryable}`. |
| `pending`, `dirty`, `saved`, `failed` | Derived below; never assigned by callers. |

`pending` means a read or accepted write/delete is outstanding, including autosave
delay. A recovery hold is not pending I/O. `dirty` means an accepted edit occurred
since the last adopted/acknowledged current document, or the retained current
document was explicitly erased. Seed alone is not dirty. Undo is revision-based
and may need another save. After acknowledgement of an older revision, dirty stays true.

`saved = loadStatus == "loaded" && exists && revision == savedRevision &&
recovery == "none" && !pending && error == null && !autosavePaused`.
`failed = error != null`. An unsuccessful redundant save can leave data acknowledged
but saved=false. Seed plus absence is neither dirty nor saved; a tombstone is
absence, never a persisted null. Candidate/value updates and metadata settle together.

A blocking load/recovery error survives rejected commands. Otherwise the latest
admitted operation's error is retained. Admission refusals (`busy`, `recovery_pending`)
report a result without overwriting another operation's state/error. Starting a
retry clears that operation's error; unrelated success cannot clear recovery errors.

## 4. Commands, correlation, and lifetime

Every I/O command returns a positive numeric request ID immediately; a deferred
`onResult(result: PersistenceResult)` delivers its outcome to the live policy node.
There are no app-facing Promises or overlapping success/error events. The host
adapter is Promise-based and awaitable; Declare exposes the same acknowledgement
through reactive facts and a scoped event. IDs increase per instance, including
refusals. Automatic reads/writes use ID 0 and also emit terminal results.

```text
type PersistenceResult = {
    requestId: number
    operation: "load" | "commit" | "erase"
    ok: boolean
    revision: number | null
    storedRevision: string | null
    savedAt: string | null
    error: PersistenceError | null
}
```

On failure, storedRevision/savedAt are null in the result, while reactive state
retains last-known metadata. The result is frozen. State publishes and settles
before delivery, never during the requesting handler. Exactly one result per
explicit ID while its node remains alive, including rejected admission.
Use busy when outstanding work prevents a command, not_ready when its required
read has not succeeded, and recovery_pending when candidate resolution is required.

| Command | Preconditions and effects |
|---|---|
| `commit() -> number` | Save post-settle value, bypass delay; a successful commit resumes paused autosave. Recovery blocks it; an initial read must finish first. |
| `replace() -> number` | Save post-settle value with explicit authority to replace the inspected candidate. Requires recovery and a readable stored revision. |
| `restore() -> boolean` | Adopt valid candidate via normal root replacement; requires no outstanding I/O. No I/O result event. |
| `erase() -> number` | Delete scoped record durably, after a completed read established a revision or absence. Pause autosave at admission. Never reset the live Dataset. |
| `retry() -> number` | Retry a retryable failed load/erase; after failed save, save CURRENT value. A new request, not replay of stale text. |
| `reload() -> number` | With no outstanding I/O, cancel retained failure intent and re-read, preserving live data. A found record always becomes explicit recovery. |

Invalid restore changes no data and returns false; recovery/pending already explains
why. Successful restore increments local revision, sets savedRevision to it, clears
candidate/error/queued autosave and resumes autosave, without a storage write.
Consume the candidate at admission so two restores in one handler cannot apply twice.
Successful replace clears recovery only after acknowledgement; newer local edits
remain dirty. Failed replace preserves the candidate, requiring another explicit
replace (not a plain commit/retry that would conceal recovery authority).

On discard, the runtime invalidates an internal generation, stops timers, cancels
unsent work, and suppresses events. Never resolve a replacement node by tree path.
In-flight storage may finish; serialize a replacement owner's read after the
terminal transaction. App authors need no lifetime check. Owner removal is not a
flush; documents that survive temporary views belong above those views/State nodes.

## 5. Capture, ordering, and bounded work

Hook accepted root/region mutations and Editor write-back before authored init.
Seed/adoption/status are not edits; no-op mutations do not advance revision. One
affected Dataset advances once per content settle. A throwing write does not undo
earlier accepted writes: model-atomic updates validate then replace a root.
No-op means an unchanged scalar/reference or unchanged region operation; a newly
allocated structurally equal root may advance revision. No global deep diff is required.

Capture at the close of the initiating settle, after accepted editor writes and
`afterSettle` callbacks belonging to that input turn have drained, before another
input/task turn. Do not wait for network or animation. `field.commit(); disk.commit()`
includes accepted field data. Several explicit commits in one turn capture that
turn's final revision. Disk cannot infer whole-form validation; the app owns it.
Add an INTERNAL successful-settle completion seam in `reactive.ts`: ordinary
afterSettle callbacks run in batches and can cause further waves, so registering
one capture callback there is insufficient. Capture only after all waves drain.
If settle throws, do not persist its partially stabilized data: fail waiting
captures with settle_failed, preserve accepted live edits, and require a clean
settle plus explicit commit. Boot's local-edit latch still protects those edits.

Allow one I/O operation in flight, four queued explicit operations, and one
coalesced autosave intent per policy; further commands receive busy. Identical-revision
requests may share a transaction but still consume distinct completion slots.
Writes are FIFO by captured revision. Explicit capture consumes any older unsent
autosave; the autosave intent holds only a revision until due AND the write lane
is available, then captures the latest complete value at a successful settle.
No older snapshot can follow a newer acknowledgement.

One encoded payload may be at most 8 MiB; retained encoded write snapshots at most
16 MiB per policy, including the in-flight snapshot. Identical bytes can be shared.
Capture/admission failure reports too_large/busy and preserves live data. An autosave
capture failure halts autosave until explicit commit or an eligible retry;
rejecting an extra command does not halt an already admitted save. Bounds exclude
live/candidate trees and temporary
encoding overhead; they limit the queue, not the entire heap.

Read failure fails waiting explicit commits with the load error and releases their
snapshots. Write failure aborts queued explicit writes, drops unsent snapshots, and
halts autosave. Retain the live document and failed operation KIND only. Retry
saves current data; an old failed ID cannot later receive success. A failed load
retry re-reads before considering any write. Erase is the exception: an admitted
erase still runs after an earlier write's terminal failure.

Acknowledgements advance savedRevision only to the captured revision and update the
next transaction's expected stored revision. They never replace live data. Edits
accepted during recovery/failed/paused states still advance revision and dirty,
but do not enqueue autosave. A valid restore, successful explicit save, or resolved
missing read resumes scheduling where its policy permits.
Resuming schedules the latest dirty revision, including edits made during a paused
commit; its older acknowledgement must not strand those edits. Missing read alone
does not clear an explicit erase pause or configuration error.

### Deletion has an explicit pause

Erase pauses autosave, cancels unsent writes (explicit IDs receive aborted), and
queues behind the running transaction. While erase is pending other commands
receive busy. Memory can change; no edit during OR after erase implicitly resumes
autosave. This prevents both delayed saves and reset-to-defaults from recreating
a deleted record. Success sets exists=false, savedRevision=-1, savedAt=null,
recovery=none, autosavePaused=true; retained data is dirty.

Failure preserves live work and the pause. Retry erases the originally observed
revision. Reload cancels that intent and re-reads but retains the pause. Successful
commit/replace/restore deliberately resumes autosave; failed commit keeps it paused.
A product that closes a deleted document can simply retire its owner.

## 6. Boot and recovery decision table

Revision zero is installed before authored initialization; read starts after the
initial settle. Any local edit or explicit write intent prevents automatic adoption.
A commit waiting on boot cannot silently overwrite an existing record.

| Read result | Untouched boot, restoreOn=load | Manual/reload/early edit or explicit commit |
|---|---|---|
| Missing/tombstone | loaded, keep seed, no write | loaded, keep live data, release eligible queued writes |
| Valid payload | adopt once, increment revision, savedRevision=revision | loaded, recovery=available, retain candidate; waiting commits fail recovery_pending |
| Invalid payload/format | loaded, recovery=invalid, preserve bytes, error set | same; waiting commits fail with validation error |
| Unavailable or unreadable control metadata | loadStatus=failed, preserve live data | same; waiting commits fail; never assume absence |

Recovery holds automatic writes. Candidate is immutable, not a second editor.
Invalid payloads never enter a typed candidate. Optional schema validation uses
existing Dataset rules; business validation/migration belongs to the app, operating
on an untyped candidate when needed. Future-format payloads are preserved until
explicit erase/replace. The host can reject unsupported format without parsing data.

Replace/erase use the revision read for a candidate, including an invalid payload.
Unreadable STORE control metadata is store_corrupt: app erase cannot guess revision
authority. That case needs explicit host/site-storage administration, outside the
Dataset interface. A corrupt JSON payload with intact control metadata remains erasable.

## 7. Adapter and acknowledged durability

The [host contract](dataset-persistence-host.md) fixes the Promise interface, record
format, revision checks, scope, browser lifecycle, and failure classification.
Injection is per app root; browser DOM/canvas and deterministic tests use adapters
at the same seam. Browser support is the first implementation milestone.

A receipt means transaction completion, not request success or permanent retention.
Request IndexedDB's strict hint when supported and record the actual hint in host
diagnostics; fall back to default when absent. The first draft overstated what a
runtime can verify: [IndexedDB defines durability as a hint](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint).
Cold reload after acknowledgement is the functional acceptance test. Data can still
be cleared or evicted; [retention is a separate policy](https://storage.spec.whatwg.org/#persistence).

## 8. UX patterns that fit Declare

Use a reserved status line in normal flow. Precedence: pending erase/read; current
operation error; recovery; paused autosave; pending write; saved; manual unsaved;
untouched seed. An operation that stalls uses the host's readable progress error
instead of an endless generic spinner. Recovery/error panels grow through ordinary
layout. Persistence owns no geometry, theme, focus, or confirmation. Keep editors
usable during ordinary saves/failures; distinguish local saving from sync.

Use existing Button/Control/Dialog semantics, 44px mobile actions, and reduced
motion. Focus stays in the editor; an explicit Restore may move it after the data
settles. Visible semantic status text is required. Live announcements need a
verified accessibility seam; if absent, mark them deferred rather than inventing
an attribute or claiming automatic screen-reader announcements. Avoid per-edit toasts.

For Save and leave, validate the whole form, accept editor commits, make the form
read-only, and correlate the exact command result before navigating:

```text
// App fields: leaving: boolean = false, leaveRequest: number = 0
// Save and leave action, after validation and editor commits:
app.leaving = true
app.leaveRequest = app.note.disk.commit()

// Handler on the named Persistence child:
onResult(result: PersistenceResult) {
    if (app.leaving && result.requestId == app.leaveRequest) {
        app.leaving = false
        if (result.ok && result.revision == this.revision && this.saved)
            app.follow("#library")
    }
}
```

Cancel clears leaving/leaveRequest; stale results cannot navigate. Ordinary in-app
navigation keeps a root-owned document alive so autosave continues. This milestone
does not promise transparent save-before-Back: the browser host rewrites the traversed
entry after an onFollow veto, so a delayed re-follow cannot preserve traversal by
itself. Route-scoped owners requiring this need a separate navigation design. Full
tab close/reload/process death has no guaranteed final save window; no unload timer
or new router is introduced. Editor commit remains distinct from disk commit.

## 9. Causal Desk integration contract

Keep workingScenario live. savedRecord is the versioned override-only recovery
artifact. Manual restore plus AUTOMATIC persistence avoids pinning a write for every
slider event:

```text
savedRecord: Dataset [
    disk: Persistence [ key = "causal-desk/airline-operating-margin/working-scenario",
        restoreOn = "manual", save = "auto", conflict = "overwrite" ]
    ] { null }
```

After a successful Working mutation, advance an app-owned workingGeneration and
schedule one envelope rebuild after that settle. Read the latest source/assumptions,
replace savedRecord, and record stagedWorkingGeneration in the same coordinator.
Display Saved only when disk.saved AND stagedWorkingGeneration == workingGeneration.
An old envelope cannot claim to cover a newer Working edit. Numeric drafts do not
advance the generation. Platform revision tracks savedRecord, not another Dataset.

Hold rebuilds while loading/recovery is unresolved or clearing is active. Early
Working edits remain available. The panel offers confirmed Restore (replaces current
Working edits), confirmed Discard old draft, or Keep current work (validate/stage
current envelope then replace). The overwrite policy explicitly preserves Slice 5's
accepted last-writer behavior across tabs.

Restore validates with CD-S5-00, adopts savedRecord, and reconstructs Working in one
app transition; update both generation markers together. Business-invalid records
offer Discard, not Restore. Discard preserves current Working data; if new work
exists, stage it and explicitly commit after erase acknowledgement. Clear locks
editing, erases, then resets Working and bookkeeping without staging/saving Base.
The next deliberate Working edit stages and explicitly commits once to resume
autosave. Failure preserves work. UI time comes from the receipt; payload savedAt
remains a snapshot timestamp for CD-S5-00 compatibility.

## 10. Readiness and limits

The reviewed contract fixes the interface, node lifetime, bounded queue, recovery,
revision order, erase/resume, browser adapter, and consumer mapping. No unresolved
API choice blocks the browser milestone. Start implementation using the dependency
order and acceptance traces in the [review record](dataset-persistence-review.md).
This design is not evidence of a passing implementation.

The unit is a whole JSON document: load/validation/encoding/writes scale with its
size; view virtualization does not reduce that cost. A catalog plus separate notes
is not atomically updated across keys. Indexed collections need enumeration, index,
query, and materialization contracts; native storage needs its own adapter and the
same conformance suite. Neither is completed by shipping Causal Desk persistence.
