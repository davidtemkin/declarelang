# Dataset persistence — host contract

Design only; companion to the [implementation contract](dataset-persistence.md).
These are proposed internal TypeScript interfaces, not new Declare syntax or an
app-accessible storage API. Browser DOM and canvas use the same provider.

## Scope and injection

Add an optional persistence configuration to the host's app-bootstrap options:
`{ provider, appId?, namespace? }`. The runtime resolves this once per app root.
The browser supplies its IndexedDB provider by default; unsupported hosts supply
an adapter that rejects with `unsupported`. Never silently substitute memory.

Browser identity is the tuple `(origin, appId, namespace, key)`:

- Origin is enforced by browser storage, not supplied by the app.
- `appId` defaults to the canonical absolute **entry Declare program URL**, with
  query and fragment removed, not the containing runner page or current route.
  A deployment can supply a stable nonempty appId to survive program URL changes.
- `namespace` defaults to `default`. Verifier cases supply unique namespaces;
  deleting a fixture namespace must not affect another namespace or normal data.
- App ID and namespace are nonempty, at most 1024 UTF-8 bytes each. Key has the
  same bounds. Treat all three as opaque strings; no slash/path normalization.

Scope is not authentication or a defense against other scripts on the same origin.
Do not embed secrets in identifiers. Changing origin, appId, namespace, or browser
profile selects another store; no automatic copying/migration. A file/opaque-origin
host without supported storage fails explicitly. Duplicate live policy ownership
of the same scoped key within one app root is a configuration error; separate
tabs/roots are independent writers governed by transaction revision checks.

The deterministic adapter is explicitly injected and isolated. Its logs include
operation, request correlation, scope, revision, byte length, and terminal outcome,
never payload contents by default. Fault injection is a test-host capability,
not writable app state. Real cold-boot acceptance still uses IndexedDB.

## Internal interface

```ts
type Scope = { appId: string; namespace: string; key: string };
type Expectation = { revision: string } | { overwrite: true };
type ReadReceipt = { revision: string } & (
  | { kind: "absent" }
  | { kind: "document"; format: number; savedAt: string; json: string }
  | { kind: "invalid"; error: PersistenceError }
);
type WriteReceipt = { revision: string; savedAt: string };
interface PersistenceProvider {
  read(scope: Scope): Promise<ReadReceipt>;
  write(scope: Scope, expected: Expectation,
        document: { format: 1; json: string }): Promise<WriteReceipt>;
  erase(scope: Scope, expected: Expectation): Promise<{ revision: string }>;
}
```

Provider methods reject with normalized errors, not browser exception objects.
An invalid payload with readable control metadata returns kind=invalid, retaining
the token for explicit recovery; it is not a rejected read. Absent includes a
tombstone. The runtime maps invalid receipts to loaded/recovery=invalid and the
reported error. A document receipt is decoded only after format/size validation.
For invalid receipts or runtime validation failures, public load result is ok=false
even though loadStatus=loaded: storage was read, but no usable document was recovered.
The runtime attaches operation/request/local revision, validates schema, handles
the queue, and emits the public result. Public operation is `load`, `commit`, or
`erase` (`reload`/load retry map to load; replace/save retry map to commit).
Successful load results have revision=null unless they adopted into the live
Dataset; successful commits have their captured local revision; erase has null.
An absence has savedAt=null. Failure results have revision=null. Public erase
results include the new tombstone storedRevision and savedAt=null.

The runtime owns a per-scope operation lane for all app roots using a provider in
one host context. Retiring a policy cancels unsent work, not an already issued
transaction. Its replacement's read waits for that transaction's terminal outcome.
Different browser contexts rely on IndexedDB's atomic read/write transactions,
not a cross-tab JavaScript lock. No subscriptions or push reconciliation in v1.

## Record and transaction format

Browser database: `declare-persistence`, version 1, object store `documents`.
Use a compound key `[appId, namespace, key]`. One row contains control metadata
and either a document or a tombstone:

```ts
type Row = {
  control: 1;
  revision: string; // fresh cryptographically random 128-bit token on EVERY mutation
  document: null | { format: number; savedAt: string; json: string };
};
```

Actual absence returns reserved token `absent`, never generated for a mutation.
Erase writes a tombstone, including erasing observed absence. Tokens never derive
from time or local Dataset revision. Keep tombstones in v1: physical deletion
would let a stale writer mistake delete/recreate/delete for original absence.
Host-admin/site-data removal is outside this concurrency guarantee.

Write/erase read the current row and compare expected revision in the SAME
readwrite transaction that writes the new row. A mismatch rejects `conflict`
without changing storage. `overwrite:true` bypasses comparison only, not metadata
validation. Whole-row replacement is atomic. The provider stamps savedAt with
UTC ISO time when preparing the write; it is informational, not a revision or
ordering clock. A receipt is returned only after transaction completion.

Runtime uses the most recent successful receipt for the next expected revision.
An erase queued behind its own in-flight write uses that write's new token if it
succeeded, or the previous token if it failed. A retry of a FAILED erase keeps the
token used by that erase attempt; it does not acquire fresh overwrite authority.
`conflict:overwrite` remains explicit authority on each operation, including erase.

Validate control version and revision before trusting any payload. Unknown or
malformed control metadata is `store_corrupt`: refuse even overwrite/erase because
v1 cannot safely interpret ownership/revision. Valid control metadata with an
unknown document format is `unsupported_format`; invalid document fields/JSON are
`invalid_record`. Preserve its revision, original bytes, and recoverability by
explicit erase/replace; do not “repair” or delete on read. No payload migration.

## Encoding and validation

Format 1 stores JSON text only. Enforce the 8 MiB payload limit on UTF-8 bytes of
the JSON string on read and capture; control metadata is excluded. Reject invalid
values BEFORE JSON.stringify can silently change them: non-finite numbers,
undefined, functions, symbols, bigint, cycles, sparse arrays, accessor properties,
and non-plain objects. Accept null, booleans, finite numbers, strings, dense arrays,
and plain objects with own enumerable string-keyed data properties. Reject symbol
keys/non-enumerable application properties rather than silently losing them.
JSON has no identity/alias preservation. Negative zero is normalized to zero.

Decode as inert data, never code. Do not merge decoded keys into prototypes.
Apply existing Dataset schema validation after JSON validation; schema failure
is `schema_mismatch`. Detach and deeply freeze recovery candidates. Compiler type
exposure is `DeepReadonly<OwnerValue> | null` when a schema exists, otherwise
read-only JSON. Working Dataset data stays mutable through its existing API.
Error messages identify safe field paths/types, not financial payload contents.

## Browser lifecycle and completion

Request strict transaction durability where the browser supports that option;
otherwise request the supported default. Record the transaction's actual hint in
host diagnostics. Neither claims physical retention or power-loss proof; see the
[IndexedDB durability definition](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint).
Never use a request's success event as commit acknowledgement. Transaction abort
rejects the entire operation, even after its put request succeeded.

Opening a connection has a 10-second deadline. Blocked upgrades surface `blocked`;
other timeouts surface `unavailable`. No transaction was started: close any late
connection and allow explicit retry. Do not create a second overlapping attempt.
On versionchange, stop admitting transactions to that connection, allow active
transactions to reach terminal state, close it, and reopen on the next operation.

An issued transaction that has no terminal outcome for 10 seconds is **stalled,
not failed**. Publish error `{code:stalled,retryable:false}` while pending stays
true. Do not emit a terminal result, start another transaction in its lane, or
claim it rolled back. Clear the progress error on eventual terminal completion.
The user may keep working or reload with a warning that the outcome is unknown;
no runtime can promise a receipt after process death. A retry is safe only after
conclusive failure. This avoids duplicate/late writes disguised as timeouts.

The adapter never requests persistent-storage permission automatically and never
equates retention permission with commit completion. Quota, private-profile
restrictions, clearing, and eviction are observable limits. No unload flush,
background synchronization, service worker, or server dependency in this milestone.
Local browser data is not encrypted by Declare and is not a backup.

## Error catalogue and recovery

`PersistenceError` has `{code, message, operation, retryable}`; code and operation
are literal unions for typechecking. Message is nonempty readable text, not an API
branch condition. Retryable means a new attempt is safe, not guaranteed to work.
Operation uses the public load/commit/erase union; configuration errors use load.

| Code | Retryable | Required handling |
|---|---|---|
| `unsupported` | no | Keep editing; explain this host has no persistence. |
| `configuration` | no | Fail closed; never switch scoped targets. Correct source/host config. |
| `blocked` | yes | Explain another tab/connection blocks opening; retry after it closes. |
| `unavailable` | yes | Provider access/open failure; retry only after terminal failure. |
| `quota` | yes | Preserve data; retry after storage space/policy changes. |
| `io` | yes | Terminal transaction/storage failure; preserve live work. |
| `stalled` | no | Nonterminal progress error with pending=true; no terminal result yet. |
| `conflict` | no | Reload and inspect latest record; never auto-retry with a refreshed token. |
| `store_corrupt` | no | Host/site-storage administration; app cannot safely delete. |
| `unsupported_format` | no | Recovery invalid; explicit erase/replace only. |
| `invalid_record` | no | Same when reading; fix current data when capture rejects it. |
| `schema_mismatch` | no | Same; never adopt invalid typed data. |
| `settle_failed` | no | No capture from a failed settle; fix the reactive error and explicitly commit after a clean settle. |
| `too_large` | no | Explicitly reduce data; stored oversize record can be erased/replaced. |
| `busy` | no | Admission refusal; wait for pending work before a new command. |
| `not_ready` | no | Command needs a completed readable load; wait, or resolve/retry that load. |
| `recovery_pending` | no | Explicit restore/replace/erase required. |
| `aborted` | no | Unsent command superseded by erase or earlier failure; no write occurred. |

Capture failures that require edited data are fixed with a new commit, not retry().
`retry()` without a retryable retained operation emits a deferred `aborted` result
and does not change state. A failed explicit replace must be explicitly replaced
again even if its underlying I/O error is retryable. Map browser SecurityError to
unavailable, QuotaExceededError to quota, and terminal unexpected storage failures
to io. Preserve only safe diagnostic exception names in host logs.
