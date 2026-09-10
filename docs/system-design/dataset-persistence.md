# Dataset persistence — local work that survives returning

Status: **proposed, design only**, 2026-09-10. No API below is implemented or
ratified. This is the proposed document-persistence part of
[L-28](open-items.md#l-28--dataset-persistence-indexeddb-shaped--design--gh-23).
Examples use `text` fences deliberately: they illustrate proposed Declare source
and must not enter the compiler-tested reference as shipped syntax.

## 1. The user experience and the governing rule

An author adds persistence to the Dataset their application already edits.
Typing, selection, derived values, replication, and layout retain their existing
behavior. Returning can either reopen that document or present it for explicit
recovery. Saving status describes the actual storage operation, and a storage
failure leaves the current work usable.

**A Dataset holds the working value; persistence records acknowledged snapshots
of that value. The interface derives from both facts.**

Persistence must feel like Declare's other nonvisual capabilities: declare the
relationship, read its state, issue a verb for a deliberate action. Applications
must not install subscriptions, synchronize a browser mirror, poll for completion,
or manage storage connections. The host supplies storage; the renderer has no role.

The initial scope is local JSON documents, one atomic document per key. This serves
preferences, forms, offline documents, and Causal Desk's single saved scenario.
Keyed collection queries and secondary indexes are a separate extension (§11).
Cloud synchronization, authentication, conflict merging, and multi-document
transactions are outside this proposal.

## 2. Fit with the existing language

The inspected checkout establishes these constraints:

| Existing contract | Consequence for persistence |
|---|---|
| Dataset owns `value`, optional `schema`, and `set`/`insert`/`removeAt`/`move` | Observe those mutation boundaries; keep all editor bindings intact. |
| `contents = { … }` owns a derived Dataset's value | A live projection cannot also be a storage-owned editable document. |
| DataSource extends Dataset and owns HTTP arrival/status | Local storage gets a distinct lifecycle; do not turn `.loaded` into a synonym for saved. |
| Editor `commit()` validates a draft and writes to data | Editor commit and durable commit remain separate boundaries. |
| Handlers are synchronous; relationships settle before painting | Capture storage snapshots after the initiating settle, including editor commits in that turn. |
| `onFollow(ref)` is synchronous and may return `""` to veto | Save-dependent navigation uses a veto plus an acknowledged continuation; no async hook is invented. |
| Headless execution supplies host capabilities explicitly | Extraction must never read the developer's local drafts. |

Evidence: [data guide](../guide/09-data.md),
[relationship guide](../guide/03-relationships.md),
[location guide](../guide/13-location.md),
[Dataset implementation](../../runtime/src/data.ts),
[handler diagnostics](../../compiler/src/typecheck.ts), and
[capability design](capabilities.md). The data mutation implementation has both
region writes and root replacement; subscribing only to `value` would miss edits.

## 3. Proposed authoring surface

Attach one nonvisual `Persistence` child directly to a writable Dataset. Its
parent is its target, as a layout or motion policy has an owning place in the tree.
Its member name is ordinary; `disk` is a convention in these examples.

```text
schema Note [ title: string, body: string ]

App [
    note: Dataset [ schema = Note,
        disk: Persistence [ key = "notes/current" ]
        ] { { "title": "Untitled", "body": "" } },

    editor: View [ datapath = { app.note.value },
        TextInput [ text <-> :title ],
        TextInput [ text <-> :body ]
        ],
    status: Text [ text = { app.note.disk.loadStatus == "loading" ? "Opening local work…"
        : app.note.disk.recovery != "none" ? "Saved work needs a recovery decision"
        : app.note.disk.failed ? app.note.disk.error
        : app.note.disk.saved ? "Saved on this device"
        : app.note.disk.pending ? "Saving on this device…"
        : app.note.disk.dirty ? "Not saved on this device" : "" } ]
    ]
```

This adds one registered Node class, without a new operator, grammar form, or
special storage widget. The compiler verifies its parent and uniqueness. Plain
Datasets incur no storage scheduling and should not pull a storage backend into
their bundle. Persistence remains a Dataset capability, expressed by composition
rather than another collection type or a second data-binding system.

### Declared policy

| Attribute | Default | Meaning |
|---|---|---|
| `key: string` | required | Nonempty, stable logical document key within the host's application scope. |
| `restoreOn: "load" | "manual"` | `"load"` | Load adopts a valid snapshot only if no local edit has occurred. Manual always offers recovery first. |
| `save: "auto" | "manual"` | `"auto"` | Auto queues accepted Dataset edits; manual requires `commit()`. |
| `delay: number` | `250` | Autosave quiet period, milliseconds; zero means after the current settle. |
| `maxDelay: number` | `1000` | Maximum autosave batching delay during continuous edits, not a promise of disk completion. |
| `conflict: "fail" | "overwrite"` | `"fail"` | Fail on a different stored revision; overwrite explicitly opts into last committed writer wins. |

Key and policies are fixed for the instance, evaluable once at construction.
Reject live bindings to them; document selection creates a new scoped Dataset
after resolving pending work. Do not silently retarget a dirty Dataset when a URL
or account changes. Reject negative/non-finite delays and `maxDelay < delay`.

Opening storage is automatic when this explicit policy is declared. Initial JSON
is the fallback value, never an automatic first write. Merely opening the app must
not overwrite an existing draft or create a record the user has never edited.

### Reactive facts, all read-only

| Member | Meaning |
|---|---|
| `loadStatus` | `"loading"`, `"loaded"`, or `"failed"`; loaded includes a confirmed missing key. |
| `writeStatus` | `"idle"`, `"queued"`, `"committing"`, `"blocked"`, or `"failed"`. |
| `pending` | A requested write/delete is queued or in flight. A blocked request is reported separately. |
| `dirty` | Accepted local edits are newer than the last acknowledged/adopted snapshot. Revision-based; undo may need another save. |
| `saved` | A record exists, current local revision is acknowledged, no recovery decision/error/pending operation remains. |
| `exists` | Last observed storage record exists; meaningful after load/acknowledgement, not a live cross-tab query. |
| `recovery` | `"none"`, `"available"`, or `"invalid"`; a decision that holds automatic writes. |
| `candidate` | Detached, read-only, schema-validated recovery document, or null. It is not the Dataset's live value. |
| `candidateSavedAt` | Recovery record's host timestamp, or null when absent/unreadable; lets a recovery panel describe a draft before adoption. |
| `revision`, `savedRevision` | Instance-local mutation revision and last acknowledged revision; counters, not content hashes or cross-tab versions. |
| `savedAt` | Host-generated ISO timestamp of last acknowledged/adopted record, or null. |
| `error` | Readable explanation, `""` if none. |
| `errorCode`, `errorOperation`, `retryable` | Machine-readable reason, `"load"`/`"restore"`/`"commit"`/`"erase"`/null, and whether retrying the same intent is meaningful. |
| `failed` | Boolean view of the maintained error state. |

These facts come from one internal lifecycle record, published atomically. Separate
load and write axes are necessary: loading can have succeeded while a later save
fails. The common UI needs only `saved`, `pending`, and `failed`; recovery UI adds
`loadStatus` and `recovery`. A control's `dirty` remains its uncommitted edit-session
state, while `disk.dirty` describes accepted edits awaiting storage.

### Verbs and completion

| Method | Contract |
|---|---|
| `commit()` | Capture this settle's complete working value and request an acknowledged write. Bypasses autosave delay. Refuses unresolved recovery. |
| `restore()` | Adopt a valid candidate into the parent in one normal root replacement, without writing storage. Explicitly replaces any local edits. |
| `replace()` | Explicitly authorize replacing a recovery record with the current working value; durable result required. |
| `erase()` | Durably delete this key; retain current in-memory data. Confirmation/reset are application decisions. |
| `retry()` | Retry a retryable failed operation with its retained intent. Does not authorize an overwrite. |
| `reload()` | Re-read storage only while no write/delete is pending; retain live data and expose any newly read record for an explicit decision. |

`restore()` is synchronous and returns success/failure; refusal is also represented
as an error fact. The I/O verbs return `Promise<PersistenceResult>`. Operational
failures resolve an `ok: false` result so an ignored autosave Promise cannot create
an unhandled rejection. Programming errors retain the existing pointed diagnostic
behavior. Async handlers and `await` remain outside Declare's authoring surface.

A result contains `ok`, `operation`, `requestId`, `revision`, `storedRevision`,
`savedAt`, and `errorCode`. `onLoad()`, `onCommit(result)`, `onErase(result)`, and
`onError(result)` follow existing event conventions. Success events run after the
corresponding data and lifecycle settle together; errors do not fire success events.
Promises and events describe the same operation. UI normally derives from facts;
one-off actions such as closing after a save can use an event or `.then()`.

## 4. Boot, recovery, and edits during loading

At boot, install the ordinary JSON fallback, record revision zero before authored
initialization handlers, and mark loading. Begin the host read after construction,
outside the settle. Any accepted edit since that seed, including `onInit` edits,
prevents automatic adoption. Loading never blocks painting or unrelated interaction.

| Read result | No intervening edit, auto restore | Manual restore or an intervening edit |
|---|---|---|
| Missing | Keep fallback; no write until an edit or explicit commit. | Keep current data; queued edits may save once absence is known. |
| Valid document | Atomically adopt and mark saved. | Keep current data; expose candidate and hold automatic saves. |
| Invalid document/schema | Keep current data; expose invalid recovery, retain stored bytes. | Same. |
| Read unavailable | Keep current data; publish load failure. | Same. |

An edit while loading is accepted immediately but cannot be saved until the read
establishes whether a record exists. An explicit commit requested during loading
waits for this same check; an existing candidate returns `recovery_pending`.
There is no timeout-based assumption that the key was empty.

`restore()` applies only a validated candidate and clears recovery without causing
autosave. `replace()` consumes the candidate only after its write succeeds; failure
preserves both the candidate and current work. `erase()` consumes it only after
delete acknowledgement. Invalid candidates cannot be restored or exposed as typed
values; an app can delete them or explicitly replace them.

Restore is a root replacement and has the existing Dataset wake/reconciliation
semantics. It does not restore selection, camera, scroll, focus, or numeric drafts.
The application owns those choices. Persistence internally clones on adoption;
editing cannot mutate a recovery snapshot through a shared object reference.

## 5. The save boundary and ordering

The runtime observes accepted root and region mutations, including those from
Editor `<->`, once per Dataset per settle. Seed installation, loading, restoration,
and persistence status changes are not edits. Rejected editor drafts do not create
revisions. Direct mutation of raw objects is not a supported persistence path;
existing Dataset verbs remain the authoring surface.

Snapshot capture happens after the initiating settle and editor validation have
finished. `field.commit(); note.disk.commit()` therefore includes the accepted
field value. Several writes in a handler are one snapshot. This is a durability
boundary, not a rollback transaction over the handler: if one application write
throws after another succeeded, persistence does not undo the earlier write.
Applications requiring atomic semantic changes validate and replace one document.

Autosave coalesces pending edits using the declared delay/maxDelay. Only one host
operation runs per scoped key. An automatic snapshot waiting behind a write may be
replaced by the newest snapshot; an explicit commit pins its revision and must not
be acknowledged as a different snapshot. Explicit requests retain FIFO order;
bounded admission reports `busy` rather than silently dropping a request. The
implementation must publish its queue limit before this API is marked shipped.
An explicit commit absorbs older unsent autosaves; no lower local revision may be
written after a newer one. Each successful operation updates the expected stored
revision used by the next queued transaction, including after a retried write.

```text
edit r1 → commit r1 starts → edit r2 → acknowledgement r1 → commit r2 → acknowledgement r2
           pending=true      dirty=true       saved=false                 saved=true
```

An acknowledgement advances only the corresponding saved revision. It never
replaces the live Dataset, clears newer edits, or makes a newer value look saved.
Captured snapshots must be immutable, detached JSON. Cloning/encoding cannot take
place as an untracked side effect of a UI constraint.

On a write failure, suspend automatic retry and retain the failed snapshot plus
the latest queued edits. `retry()` first retries that snapshot, then drains newer
work if successful; a new explicit `commit()` may replace a failed save intent
with the latest revision. Its result still identifies exactly what was stored.
Blocked recovery and revision conflicts require an explicit decision, not retry.

### Deletion is a queue barrier

`erase()` cancels unsent writes (explicit requests receive `aborted`) and queues
after any transaction already in flight, even if that write fails. New durable operations
while erasing return `busy`; memory can still change. Thus an old completion cannot
recreate a draft after successful deletion. On success mark `exists=false`,
`saved=false`, and suppress autosave of retained data, including edits accepted
during the erase. A new edit after acknowledgement or an explicit commit opts in
again. If retained edits exist, `dirty` stays true: show “Not saved on this device.”

Delete failure preserves the current model and retryable erase intent, with the
queue still held. To abandon that failed deletion, `reload()` explicitly cancels
its retained intent and re-reads the key. Never treat deletion failure as success.
A product can lock its editor during confirmation/deletion when that is clearer.

## 6. How the UX composes

**Autosave editor.** Keep the editor visible and focused while saving. A reserved
status line changes text in place. A delayed spinner is presentation policy;
`pending` becomes true immediately. Show “Saved on this device” only for `saved`,
and a persistent, actionable error after failure. Do not generate a toast for
each keystroke or disable the whole screen while IndexedDB opens.

**Manual form.** Keep editor sessions for incomplete input; use a working Dataset
for whole-form buffering. Validate all fields/model first, commit accepted editor
drafts, and request persistence. A Submit/Done action may be disabled until its
specific revision is acknowledged. `commitOn="manual"` is not a disk-save policy.

**Recovery.** A normal-flow panel derives from `recovery`. It offers Restore and
Discard, with Replace current work only where the product calls for that choice.
Keep the prior work visible while choosing. Panel height belongs to layout, so the
graph or document moves coherently rather than being covered by an overlay.

**Save and leave.** An ordinary in-app navigation need not wait if its Dataset
stays alive at the app root. A transition that discards that owner must either
preserve it or complete an explicit save first. For a one-off Done action:

```text
onClick() {
    app.note.disk.commit().then((result) => {
        if (result.ok && app.note.disk.saved) app.follow("#library")
    })
}
```

For general links/Back, the existing `onFollow` veto can retain the intended
destination in app state and return `""`; acknowledgement resumes the same intent
only if it has not been cancelled/replaced and no newer edit exists. Keep the
editor temporarily read-only for a deliberate Save and leave operation, or ask
for another commit when it has changed. Do not navigate on an old success event.
No Promise is returned from `onFollow`. Full tab close, process kill, and external
navigation do not acquire a guaranteed async save window; unload handlers are not
part of the contract.

**Accessibility and motion.** Status and failures are text, with an accessible
status announcement on meaningful transitions, not every queued revision.
Announcements need a verified host accessibility path; do not invent an ARIA
attribute in Declare. Action controls use the existing Control/Button/Dialog
semantics and 44px mobile targets. Recovery must not steal focus. Explicit Restore
returns focus to the app's chosen editing control after its data/layout settle.
Springs may animate panel layout; reduced motion skips animation and acknowledgements
never wait on it. Persistence owns no layout, theme, focus, or confirmation UI.

## 7. Errors, schema, and version boundaries

| Code | Typical action | Data guarantee |
|---|---|---|
| `unavailable`, `unsupported`, `quota` | Keep working; retry when the host condition permits. | Session data stays available; never report an in-memory fallback as durable. |
| `corrupt`, `incompatible_format`, `schema_mismatch` | Explain; offer explicit erase or replacement. | Stored record retained, no invalid typed candidate adopted. |
| `not_serializable` | Fix the authored value; diagnostic includes a pointer path. | No lossy conversion or partially written record. |
| `recovery_pending` | Restore, discard, or deliberately replace. | Neither live work nor stored candidate silently wins. |
| `conflict` | Reload for review, or explicitly replace. | Current local work is retained. |
| `busy`, `aborted`, `io` | Retry the known failed intent when retryable. | Completion refers to a specific operation; failure is not a save. |

Provider errors are normalized before reaching the language. Quota retryability
means “after freeing space,” not “loop until it works.” No hidden background retry
policy. Programmer schema violations on mutation retain existing semantics; load
validation failures are resource state, consistent with DataSource's last-good-value
behavior. Store portable JSON only: finite numbers, strings, booleans, null,
arrays, and plain records; reject cycles, functions, undefined, BigInt, host objects,
and unsupported prototypes instead of silently stringifying/coercing them.

The host stores an envelope `{formatVersion, storedRevision, savedAt, payload}`.
Format version belongs to the platform; app schema/model revision remains in the
payload. Optional Dataset `schema` validates shape before adoption. Business rules
and migrations are app methods: persistence must never reinterpret a financial
assumption to fit a new model. An app can load an untyped envelope under manual
restore, validate/migrate into a separate typed working Dataset, and explicitly
commit the accepted result. Future-format data is preserved and refused.

## 8. Host storage and durability

Use a root-scoped injected storage provider, following Declare's existing host
capability seams. A proposed internal interface needs three atomic operations:
`read(address)`, `write(address, snapshot, expectedRevision)`, and
`erase(address, expectedRevision)`. Each returns structured metadata/results;
backend transactions, handles, and exceptions never enter application source.
Provider policy is bound to the app root, not a last-installed global singleton.

The browser provider uses IndexedDB, with a versioned records store keyed by the
tuple `(applicationScope, documentKey)`. Payload and metadata are one transaction.
Resolve writes/deletes on transaction completion, never request success. Request
strict transaction durability; expose unsupported durability as a capability
failure rather than quietly claiming the same guarantee. IndexedDB defines
transaction completion and durability hints separately; this proposal requires
the stricter hint for authored work. [IndexedDB specification](https://www.w3.org/TR/IndexedDB/#transaction-durability-hint)

Acknowledged means the host completed the requested storage transaction and the
record is available to a new app instance. It does not promise an eternal backup,
immunity to device failure, or immunity to storage clearing. Browser retention is
a separate policy; do not automatically request eviction protection or label a
successful commit “synced.” [Storage Standard](https://storage.spec.whatwg.org/#persistence)

DOM and browser canvas share this provider. Native Mac needs an equivalent
transactional provider through its existing host bridge; SQLite is the proposed
backend, subject to host design review. A native host cannot claim support until
it passes the same acknowledgement/reload/error contract. Headless builds receive
an explicitly refusing provider or isolated fixtures; unsupported hosts expose
failure honestly. No Node filesystem path is inferred from a document key.

Scope is a host-supplied stable application identifier plus storage partition.
Default browser scope uses the canonical program URL without query/fragment,
resolved by the boot host; renaming/moving it creates a new scope. A deployment
may explicitly pin an application ID across moves. Different apps on one origin
get distinct defaults. Browser and native installations do not share bytes.
Logical scope is collision isolation, not a security boundary against same-origin
code. Preview islands get ephemeral scopes by default, stable only for that preview
session; persisting real user data requires explicit host opt-in.

## 9. Conflicts, identity, and lifetime

Store an opaque revision per key. With `conflict="fail"`, comparison against the
last observed revision and the write/delete occur in the same transaction. Missing
is a real expected state, so two first-time writers cannot both succeed unnoticed.
Use revision-bearing tombstones for deletion to prevent stale writers recreating
deleted records through an absent→present→absent ambiguity. Tombstones contain no
payload; compaction must invalidate old revision tokens.

`replace()` authorizes overwriting the candidate revision the app last inspected;
another intervening writer still causes conflict under the default policy.
`conflict="overwrite"` opts out of that check for commits/replacements/deletes,
with the documented risk of overwriting another tab's work. There is no automatic
cross-tab merge or replacement of a live Dataset. An acknowledgement describes the
writer's transaction, not a promise that no later tab has written.

Two Persistence owners for the same scoped key in one live app are a configuration
error: share the Dataset instead. Distinct app instances are separate writers.
On node discard, cancel queued unsent work, resolve those requests with `aborted`,
and detach events. An in-flight host transaction may already commit; never claim
it was rolled back without a confirmed abort. Late results must not address a new
node at the same tree path; Promise continuations must check their owner's lifetime.
A replacement instance waits for the host's per-key
serialization before reading. Owners belong outside transient State children when
their work must survive those views disappearing.

## 10. Causal Desk as the first consumer

Keep `workingScenario` as live editing truth. Add an untyped saved-record Dataset
with manual save and restore policies, holding the versioned record produced by
the existing helper. It is a distinct recovery artifact, not another live scenario.

```text
savedRecord: Dataset [
    disk: Persistence [ key = "causal-desk/airline-operating-margin/working-scenario",
        restoreOn = "manual", save = "manual", conflict = "overwrite" ]
    ]
```

The logical key stays as specified by CD-S5-00; the host adds app/test scope.
`conflict="overwrite"` explicitly preserves Slice 5's accepted last-writer policy.
The save method runs after the Working mutation settles, builds the override-only
record with the current source, replaces `savedRecord`, and requests `disk.commit()`.
Never build from a stale `workingScenario.value` inside the original edit handler.

While loading or awaiting recovery, Working can still change, but saving is held.
If an analyst edits a new scenario before resolving the old draft, the panel must
say that Restore replaces current session work and offer a deliberate discard or
replacement path. Neither Base initialization nor slider input authorizes replacing
the recovery candidate. This closes an interaction not resolved in the Slice 5 plan.

On Restore, validate `disk.candidate` using CD-S5-00, adopt it into `savedRecord`,
then reconstruct source-plus-overrides into `workingScenario` in the same user
transition. Activate Working and reset dependent selection as the app design states.
A schema-valid but business-invalid record remains a rejected candidate in app
state. On Clear, confirm, lock relevant edits, erase durably, then reset the live
scenario. On failure keep the live scenario and provide Retry/Cancel. App-level
`savedAt` is snapshot metadata; UI save success/time follows the host receipt.

The platform gate can unlock CD-S5-01 after conformance and docs land. The app
design/tickets will need a small reconciliation for boot-time editing, save timing,
and explicit conflict policy; this proposal does not silently amend them.

## 11. Document storage versus keyed collections

The first persistence unit is one whole Dataset document. This guarantees atomic
source-plus-overrides recovery and avoids imposing record identity on ragged JSON.
It has a cost: cold load and snapshot encoding are O(document size), and writes
replace the document. Virtualized views do not reduce this storage work.

The backing store is already keyed per document, so an offline notebook can keep
one document per filename without rewriting every note. A catalog can be a separate
Dataset, but its update is not atomic with a note; this version must not pretend
otherwise. Large indexed mirrors need a collection resource with key enumeration,
secondary-index declarations, query/loading state, partial materialization, and
multi-record transactions. That requires its own authored contract against the
existing selection/virtualization model, not hidden path-to-index heuristics.

Do not close all of L-28 when document persistence ships. Record the single-value
milestone complete and retain the indexed-collection requirement. Measure cold
load, clone/encode time, memory, and write amplification for 2 KB, 100 KB, and 5 MB
documents before publishing supported sizes; Causal Desk's small record is not
evidence that an entire large mirror can be saved every keystroke.

## 12. Verification and documentation acceptance

These are design acceptance criteria, not tests added or run in this change.

- Compiler: exactly one policy on a writable Dataset; reject DataSource and live
  `contents` projections initially with a diagnostic showing the separate writable
  Dataset pattern. Static defaults may seed; no dependency cycle or hidden write.
- Reactivity: root/leaf/insert/remove/move and editor commits all schedule correctly;
  save status never wakes unrelated data regions; captured snapshots do not alias.
- Time: use a controllable scheduler for quiet-period/maxDelay, slow load + early
  edits, out-of-order callbacks, old acknowledgements, retries, erase barriers, and
  discard/recreation at an identical tree path. Explicit commits preserve their data.
- Durability: write, acknowledge, destroy the app/browser page, cold boot on the
  same isolated profile, and read exact values; repeat for delete. Real browser
  IndexedDB is mandatory evidence, alongside a deterministic failure provider.
- Failures: quota, denied storage, corrupt bytes/envelope, schema mismatch, stale
  revisions, serialization errors, failed deletes, unsupported host/durability,
  and shutdown during commit. Two-tab tests include conflicting creates/deletes.
- UX: ordinary editor, manual form, recovery, and Save and leave on desktop/mobile;
  keyboard/focus and reduced-motion coverage; no per-keystroke announcement spam,
  hidden dirty data, jumping graph coordinates, or false Saved state.
- Isolation: two apps, two preview islands, and two tests cannot collide. Static
  extraction uses declared public fixtures/fallback data, never profile storage.
  An ephemeral provider identifies itself and cannot pass the durable-storage gate.
- R4 boot remains a bounded initial-state check; R5 drives load/commit completions;
  R6 receives deterministic storage fixtures and inspected recovery/failure states.
  Motion settling is not storage settling. Add a named storage-completion driver.
- Native and browser providers share conformance traces; shipping one backend is
  not proof of the other. Inspector shows policy, revision, queue, and error metadata;
  telemetry and default traces do not dump saved payloads.

At implementation, document attributes/events through the runtime schema and
generated reference; teach one data-guide example and the editor/disk boundary.
Declare each getter's reactive reads and each mutator's effect in compiler metadata.
Update capability help and the headless environment contract only when shipped.
Keep this proposal in Category A system-design documentation until then.

## 13. Decisions to review before implementation

The recommended decisions are composition via `Persistence`; auto-save/restore
defaults with an early-edit recovery safeguard; strict acknowledged local writes;
manual recovery as an explicit policy; conflict detection by default; and a
whole-document first release. The trade is a slightly richer recovery lifecycle
in exchange for preserving both existing work and accurate save status.

The main alternatives rejected here are a second persistent collection replacing
Dataset (breaks normal binding composition), a boolean `persist=true` (cannot name
identity or recovery policy), invisible fetch caching (leaves write ownership
undefined), and an application-owned storage mirror (repeats lifecycle code in
every app). A future DataSource cache can use the provider, but must separately
define remote-versus-local authority and refresh policy.

Before implementation, ratify the child-policy API and document-first boundary,
confirm native-host backend ownership, and specify the bounded explicit queue
limit. No library UI component is required initially: prove the patterns with
ordinary Declare controls first, then extract shared presentation if consumers
actually repeat it.
