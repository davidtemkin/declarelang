Saving acknowledges a settled **snapshot**, not future edits or permanent retention.
Place one named policy inside a literal-seed Dataset; never attach it to a derived
Dataset or DataSource. The Dataset remains the working value while storage is busy.
Browser DOM and canvas hosts use IndexedDB; a host without a provider reports
`unsupported` and keeps current work usable. Storage is local to the browser origin,
entry-program identity, namespace and key; it is neither a backup nor cloud sync.

```declare
App [
    note: Dataset [ disk: Persistence [ key = "notes/current" ] ] { { "title": "Untitled" } },
    editor: View [ datapath = { app.note.value },
        TextInput [ text <-> :title ]
    ]
]
```

Only portable JSON is accepted: finite numbers, strings, booleans, null, dense
arrays and plain records. Payloads are bounded to 8 MiB; four explicit commands may
wait behind one issued operation, with a 16 MiB total pinned-snapshot budget.
Excess work returns `busy`. App schema and domain/version validation remain separate.
No migration, encryption, browser retention permission, or tab-close save is implied.

## key
Opaque identity, not a filesystem path. Must be nonempty and at most 1024 UTF-8 bytes.
Configuration latches after construction settles, before authored init. **Never change
policy settings on a live owner**: a change fails closed without retargeting storage.
Reconstruct the owner to use another key. Two live owners in one app cannot own the
same scoped key; different tabs use revision conflict checks.

## restoreOn
Automatic adoption happens only when boot found valid saved data and no accepted edit
or explicit save intent intervened. Otherwise the saved value becomes a recovery
candidate. `manual` always asks the application to choose; invalid data is never adopted.

## save
Automatic saves observe accepted Dataset writes, not editor drafts. They capture only
after a successful settle, including its afterSettle waves. Missing storage does not
cause the seed to be written. `manual` requires a command even after edits.

## delay
Quiet time after an accepted edit before an automatic save becomes due. Zero means
the next successful settle, never synchronously inside the editor handler.

## maxDelay
Bounds coalescing during continuous edits, not storage latency. Must be at least
`delay`. A running transaction is never overlapped merely because this deadline passed.

## conflict
`fail` compares the revision observed by the last read or acknowledged write, atomically
inside the storage transaction. A stale writer reports `conflict`; reload before making
a recovery choice. `overwrite` explicitly opts out of that protection.

## loadStatus
`loaded` means a read completed, including an absent record; it does not mean anything
has been saved. A failed read blocks writes until a successful read establishes authority.

## writeStatus
`queued` includes a due/debounced autosave. `committing` and `erasing` remain pending
until the provider confirms a terminal outcome, even if a stall error is visible.

## recovery
`available` exposes a frozen, schema-valid candidate; `invalid` preserves storage
authority without exposing bad data. Resolve recovery before normal commits can proceed.

## candidate
Deeply read-only saved data, separate from the working Dataset. **Never mutate it**.
Validate application version/domain rules before Restore; schema validity alone does
not establish that a scenario or document is meaningful to your app.

## candidateSavedAt
Timestamp from the saved envelope, not evidence of durable retention or a trusted clock.

## exists
Whether the last confirmed storage state contained a document. Invalid payloads still
exist; an acknowledged erase leaves revision metadata but no document.

## revision
Local content revision, advanced once for an accepted edit settle. It is not the
provider's opaque concurrency token and must not be used for cross-tab comparisons.

## savedRevision
Local revision of the acknowledged snapshot. An older write may succeed while newer
edits remain dirty; its success never replaces the working value.

## savedAt
Timestamp of the last acknowledged snapshot. Erase clears it without clearing your work.

## autosavePaused
Erase pauses automatic saving immediately so the next keystroke cannot recreate the
deleted document. A successful explicit commit or chosen restore/replace resumes it.

## error
Stable code, safe message, operation and retryability; no raw exception or document
contents. `stalled` is **not** a conclusive failure: keep waiting, with no overlapping
Retry. Correct invalid content or a failed settle, then explicitly commit.

## pending
Outstanding work, including a debounce timer. Do not infer completion from a command's
numeric return value; use its matching result receipt.

## dirty
Accepted working data differs from the acknowledged local revision. A pristine,
never-saved seed is not dirty, yet is also not saved.

## saved
The current revision is acknowledged, with no pending work, recovery, error or erase
pause. A receipt for an older revision alone cannot make this true.

## failed
An error is visible. May coexist with `pending` during a stalled storage operation.

## commit()
Returns a request ID immediately. Captures current data after the successful settle;
`onResult` later reports acknowledgement or refusal. Same-turn commands see the final
settled revision. A recovery candidate must be resolved first.

## restore()
Consumes a valid candidate synchronously and adopts a mutable copy as working data.
Returns false when no candidate exists or outstanding work makes adoption unsafe.
A second call cannot consume the same candidate twice. Does not write storage.

## replace()
Explicit recovery choice: write the settled working document over the observed saved
candidate. Still checks its revision unless `conflict` is `overwrite`. Failure keeps
the recovery choice; ordinary Retry cannot silently repeat a replacement.

## erase()
Keeps working data, cancels unsent writes and queues deletion after any issued write.
It leaves a revision tombstone, preventing absent/delete/recreate races. No successful
read means no authority to erase. Only an acknowledgement proves deletion completed.

## retry()
For retryable terminal errors only. A failed save retries **current** settled data;
a failed erase retains its original expected revision. A failed read retries the read.
Busy, stalled, invalid, conflict and failed replacement are not generic Retry actions.

## reload()
Reads again without replacing working data; a saved record becomes a recovery choice.
Refuses while operations or an automatic save are pending. Does not unpause erase.

## onResult
An immutable `PersistenceResult`: request ID, operation, success, local revision,
stored revision token, timestamp and optional error. Automatic operations use ID zero.
Delivery follows state publication and is suppressed after owner retirement. For
Save and leave, retain the returned ID and navigate only on that ID's successful
receipt while leaving is still requested. Cancel leaving clears that intent; it does
not cancel an already issued storage transaction.
