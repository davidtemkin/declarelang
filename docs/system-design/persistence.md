# Persistence: the client, the local store, and the server

**Status: OPEN — a design record, 2026-09-11 → 2026-10-04.** Nothing here is built. It records a
discussion between DT and Claude that began with three user requests for local storage and an
outside contribution implementing one of them, and ended with a three-tier model whose first tier
is one platform event and an add-on. The companion piece is
[data-model.md](data-model.md) §7, which reaches this design from the other direction: a
projection and its source, and a client copy and its server, are the same shape. Measured storage
and runtime figures are marked as measured; everything else is design.

The design note this replaces was written as a Declare program and lived in an untracked
directory, which has since been swept. This document is the tracked record.

## 1. What was asked

Three requests arrived independently, and the unanimity is the finding: local storage is the
first wall an app hits when it stops being a demo.

- **GH #23, offline notes.** A fetched dataset should show its last-known value at boot, before
  the fetch resolves. One person, one device, data that also lives on a server.
- **PR #28, working drafts.** A scenario a person is editing survives a reload, with a way to
  inspect and restore the saved copy. One document, one device. Implemented as a `Persistence`
  node inside `Dataset` (§15).
- **A third request**, for local storage in the same shape.

None of the three is collaboration. All three are one person's data surviving a reload, and two
of them assume a server exists somewhere. That is the requirement to design for, under one rule:
whatever serves one person locally must not stop the app from having a shared backend later.

## 2. The statement

A `Dataset` holds the working set in memory. A local store holds a durable replica on the device.
A server, when the app has one, holds the truth. **The same five verbs address the local store
and the server, so the local store is not a special case to be replaced later but the first
implementation of an interface a server also implements.** Changes travel as patches on a path,
keyed by record, each carrying the revision it was based on. A write the authority will not take
is refused, and the refusal arrives as ordinary data rather than as an error path.

Everything else in this document is a consequence of that paragraph, or a boundary on it.

## 3. The vocabulary

Four words carry the design, and Declare already has three of them.

- **Document.** What a `Dataset` holds: a JSON tree.
- **Record.** A node in that tree with an identity, usually an element of a replicated array with
  an id. It is the unit a revision attaches to.
- **Patch.** A change to a path.
- **Revision.** A token the store assigns to a record when it accepts a patch. A write says which
  revision it was based on. This is the only concurrency rule in the design.

The patch vocabulary is not new work. `Dataset`'s verbs already *are* the operations of JSON Patch
(RFC 6902), and its paths already accept JSON Pointer (RFC 6901), which is JSON Patch's own
addressing. The change stream exists inside the runtime; it is simply not exposed.

```
set(["items", 3, "title"], "Fuel")   =  { "op": "replace", "path": "/items/3/title", "value": "Fuel" }
insert(["items"], 0, { id: 9 })      =  { "op": "add",     "path": "/items/0",       "value": { … } }
removeAt(["items"], 2)               =  { "op": "remove",  "path": "/items/2" }
move(["items"], 4, 1)                =  { "op": "move",    "from": "/items/4", "path": "/items/1" }
```

## 4. Three designs, and why the third

The same three parts appear in each: the app with its `Dataset`, a local store on the device, and
a server if the app has one. What differs is which arrows exist and what travels on them.

- **A, whole-document snapshot.** The Dataset serializes itself after edits; at boot the stored
  document is offered back as a candidate. One record in the store: the document.
- **B, store-backed Dataset.** The Dataset becomes a page cache over a row-per-node store. A cold
  read misses, loads, and wakes its readers.
- **C, local backend on one protocol.** The Dataset stays the working set. A local backend holds
  records with revisions and a queue, and speaks the same five verbs a server speaks.

| | A, snapshot | B, store-backed | C, local backend |
|---|---|---|---|
| Dataset semantics | unchanged | changed: cold reads are null, then wake | unchanged |
| unit of change | the document | the node | the record, as a patch |
| larger than memory | no | yes, the purpose | by windowing |
| shared backend | no, excluded by design | no, a second design later | yes, same protocol |
| offline writes | the document persists | rows persist | a queue that drains and reports refusals |
| platform change | one change event | `data.ts` core: cache, eviction, cursor healing | the same one change event |
| engineering size | done, needs re-packaging | weeks, in the most load-bearing file | days for the event and the protocol |
| where it fails | anything shared or large | synchronous reads on the main thread | two people, one field, one instant |

**C, with A's engine re-packaged as its first local adapter, and B held as a later optimisation
over the same provider.** A alone answers the three requests and cannot grow; adding a server
later means a second design. B alone solves scale and not sharing, and it changes what a Dataset
read means. C is the only one whose first version is on the road to the second. Under C, A's
whole-document snapshot is not discarded: it is the degenerate case, a patch that replaces the
root.

## 5. The three tiers

**The client.** A `Dataset` in memory, edited through the verbs, bound and written by views
exactly as it is today. Nothing about its semantics changes, and that is the point of choosing C.
Edits apply immediately; the store is told afterwards.

**The local store.** A node in the app tree, a local socket rather than a storage API: it writes
the Dataset with the ordinary verbs and is written by it. It holds records with revisions, a
monotonic sequence, and a queue of patches not yet acknowledged. Offline, it is the only copy of
the person's intent, which is why it is not a cache in the browser's sense (§11).

**The server.** The authority, when one exists. Per-record revisions, a stale write refused, the
current record returned as data. It need not be a database behind the verbs (§9).

**Per-record semantics.** The record is the unit of identity, of revision, of transfer and of
refusal. A document-shaped app is the degenerate case where the document is the one record. This
is the choice that makes everything above the local store work: a whole-document snapshot cannot
express "your edit to row 3 conflicts and row 7 is fine", cannot sync partially, and transfers the
whole document for a one-field change.

## 6. The one platform primitive: a change event

**Exactly one thing is added to the platform.** A `Dataset` raises an event, once per settle in
which it accepted at least one write, delivered after that settle, carrying the accepted writes in
the order they were applied. Everything else in tier one is an add-on built on it.

It is smaller than it sounds, because the runtime already computes everything the event carries:
each verb walks to its target, keeps the chain of containers it passed, knows the value it
displaced, and wakes the readers of that region. The event is that walk, written down.

```
schema Change [
    op:        "add" | "remove" | "replace" | "move",
    path:      string,        // RFC 6901; "" is the whole document
    value?:    any,           // add, replace
    from?:     string,        // move
    previous?: any,           // replace, remove: what was there
    origin:    "edit" | "document" | "arrival" | "derived"
    ]
```

`previous` is not in RFC 6902 and is dropped on the wire, but a consumer working per record needs
it: after the settle the removed element is gone from the tree, and its id is the only way to name
the record to delete.

**What each write yields.**

| the write | the change | origin |
|---|---|---|
| `set(p, v)` | `replace` at p with `previous`; `add` when the field was new; the `-` append arrives as `add` at the resolved index | edit |
| `set([], v)` | one `replace` at `""`, the old document as `previous` | document |
| `insert(p, i, v)` | `add` at p/i | edit |
| `removeAt(p, i)` | `remove` at p/i, the element as `previous` | edit |
| `move(p, a, b)` | `move` from p/a to p/b | edit |
| a fetch landing | one `replace` at `""` | arrival |
| a derived recompute | one `replace` at `""`; the in-place merge is a wake optimisation, not a semantic | derived |
| a write the equality gate dropped | nothing; a settle with no accepted write raises no event | |

**Delivery.**

- **After the settle**, once constraints are quiescent and the settle's own after-steps have
  drained. A handler reading the value or a `:path` sees the state the changes produced.
- **Coalesced.** Six writes in one settle are one event with six changes. Two Datasets written in
  one settle each raise their own.
- **Reentrant, guarded.** A handler that writes the Dataset back starts another settle and another
  event; the re-arm limit that already stops a self-registering after-step stops a change loop.
- **Contained.** A throwing handler is reported and does not unwind the settle.
- **No rollback to describe.** There is no transactional settle. Writes that were applied were
  applied, and the event says so.

**The spelling is open.** `onChange` has since been taken for a different event. The primitive
needs either another name or a deliberate unification with it; that is a naming decision, not a
design one.

**How the add-on hears it.** Two options, and the smaller one is preferred: the author wires it
(`notes: Dataset [ onChange(c) { disk.take(c) } ]`), which keeps the platform at the event and
nothing else; or the runtime keeps a subscriber list, which is more magic and more surface. Take
the first unless the wiring proves annoying in practice.

## 7. The protocol

Five verbs, implemented identically by the local backend and by a server.

| verb | request | answer |
|---|---|---|
| `get` | a key, or a range on a collection | records, each with its revision |
| `put` | a patch on a path, plus the revision it was based on | the new revision, or a refusal with the current record |
| `delete` | a key plus base revision | a tombstone revision |
| `count` | a collection, optional range | a number, for replication and windows |
| `subscribe` | a collection, from a sequence number | a stream of accepted changes, anyone's |

**Addressing.** A store holds *collections*; a collection holds *records* under string keys.
Nothing in the protocol knows about array indices. A Dataset maps onto that in one of two units,
chosen where the add-on is declared:

- **The document is the record.** One key; the whole value is one record; every change rebases to
  it. This is GH #23 and PR #28 exactly, and it is what the first release ships.
- **The elements of one array are the records.** `records = "/items"`: each element is a record
  keyed by its `id`, the identity convention the schema already relies on. A change under
  `/items/3/title` rebases to that element's record and the path `/title`. An `add` is a create, a
  `remove` is a delete named by the id in `previous`, and a `move` changes nothing in the store.

**Order is not a stored property.** Under the record unit, an array's order is the app's working
arrangement; the store returns records by key or by range. An app whose order is content keeps a
position field and sorts on it. This is the visible cost of records over documents, and the
add-on's guidance must say so rather than let it be discovered.

**Revisions and the sequence.** Two counters, two jobs. A *revision* is an opaque string per
record, assigned when the store accepts a patch; a put carries the revision it was based on, or
none to create, and is refused when that is not the current one. A *sequence* is a monotonic
integer per collection, advanced by every accepted put and delete; a subscription resumes from the
last one seen. CouchDB spells these `_rev` and `update_seq`, which is a sign the pair is right.

**Idempotency.** A queue that replays after a lost acknowledgement will send a put twice. Every
put carries a client-generated id; the store keeps recent ids per record and answers a repeat with
the original receipt. Without this an offline queue cannot be made safe, so it belongs in the
protocol rather than in each adapter.

**On the wire.** The verbs map onto HTTP that already means the right thing, which keeps a
reference server small and lets an ordinary proxy sit in front of it.

| verb | request | reply |
|---|---|---|
| `get` key | `GET /{collection}/{key}` | 200, the record, `ETag` = revision; 404 |
| `get` range | `GET /{collection}?after={key}&limit={n}` | 200, records with revisions, a next cursor |
| `put` | `PATCH /{collection}/{key}`, JSON Patch body, `If-Match` = base revision or `If-None-Match: *` to create, `Idempotency-Key` | 200 `{ revision, seq }`; 412 `{ record, revision, reason }` |
| `delete` | `DELETE /{collection}/{key}`, `If-Match` | 200 `{ revision, seq }`; 412 as above |
| `count` | `GET /{collection}/count?after=&before=` | 200 `{ count }` |
| `subscribe` | `GET /{collection}/changes?since={seq}`, `text/event-stream` | events `{ seq, key, revision, patch \| record \| deleted }` |

Server-sent events rather than a socket is a deliberate choice: `EventStream` already carries it,
and it is what a zero-dependency reference server can serve (§14). A `Socket` carries both
directions when an app prefers one connection.

The local backend implements the same table against IndexedDB, with the sequence kept in the store
and the change feed carried on a `BroadcastChannel` (§10). Authentication is a header, set the way
`DataSource.headers` already sets one.

## 8. Reconciliation, and working while disconnected

**Optimistic locally, authoritative at the server, no merge algorithm.**

A refused put answers with the record as the store currently has it, its revision, and a reason.
The local backend writes that record into the Dataset with the ordinary verbs and drops the queued
patch. The interface follows the data as it follows any data change: no error path, no modal, no
second mechanism. The person's patch is not lost — the add-on exposes a list of refusals, each
holding the patch and the record that displaced it, so an app can offer to re-apply, show both, or
do nothing. **What the platform never does is merge.**

**Offline is a queue that drains.** Nothing special happens while disconnected: the Dataset is
edited as always and patches wait. On reconnect they replay in order, each accepted with a new
revision or refused. The subscription resumes from the last sequence number seen, so changes made
by other people while away arrive too, through the same path.

**A refusal need not mean staleness.** The path exists for a stale revision, but nothing in it
requires that. A server rejecting a write because it breaks a rule answers the same way, and the
client's handling is identical. This is why a refusal carries a reason and not only a record, and
it is what lets server-side validation exist without new protocol.

## 9. Where application logic lives

A protocol of five verbs describes a store, and a store has no opinions. Read alone, that says
Declare apps can only be spreadsheets with a sync engine. The reading is wrong, because the five
verbs are not an app's only path to a server. There are two arrows.

- **The sync arrow** carries data the client legitimately holds a replica of. Patches, offline,
  revision-checked. That is §7.
- **The command arrow** carries operations the server owns, and Declare already ships it: a
  `DataSource` with `method = "POST"` and a `body` is a remote procedure call today. Nothing has
  to be built for it.

**What makes them compose is a rule about what a command returns: an acknowledgement, not the new
state.** The server does its work, writes its records, advances the sequence, and the resulting
changes reach the client through the subscription it already has. The client never applies a
command's result; it observes it, on the same path another person's edit arrives on. One way in
for data, not two.

That gives an author one line to decide by:

> **If the client can compute the new state correctly and alone, it is a patch. If it cannot,
> because the decision needs authority, secrets, an effect in the world, or more than one record
> at once, it is a command.**

Renaming your own draft is a patch. Booking the last seat, charging a card, and posting both
halves of a ledger entry are commands.

**The verbs are a boundary, not a database schema.** A server may satisfy them in front of
whatever it likes, and three things it may do inside them need no protocol change:

- **Refuse for any reason** (§8).
- **Serve virtual collections.** Because there is no query language and no filter push-down, the
  collection is the unit of both authorization and filtering. The server decides what a collection
  contains for this caller. That is how per-user visibility arrives without inventing queries.
- **Return projections.** What the client sees as a record may be assembled from several tables and
  may omit fields the caller must not read. A put it accepts is a request it may transform.

So a backend can be a **store** with no logic, a **store with rules** with validation and
authorization declared server-side, or a **service** that owns the domain and syncs only the
client's own cache and drafts. One app may use all three. When the server is a service, the local
backend still earns its place: the queue of commands waiting to send is the same queue as the
patches waiting to send.

## 10. Several tabs on one device

IndexedDB is already one database per origin, shared by every tab, with serialised transactions,
so two tabs cannot corrupt a record. What it lacks is notification.

**Shared IndexedDB plus a `BroadcastChannel` is the answer.** Each tab runs the backend logic over
the shared store and announces accepted changes on the channel; a late tab reads current data from
the store. Every tab may sync, because puts carry an idempotency id and the server answers a repeat
with the original receipt. A Web Locks leader is needed only when the store is single-handle, as
SQLite over OPFS is. On the Mac host, windows share one process and the store is simply shared.

A service worker as the local backend is rejected (§17).

## 11. Where the bytes actually go: quotas, eviction, and Safari's seven days

The store only has to answer five verbs, so the choice is a question of synchrony, scale, blobs
and tab sharing, not of query power.

| store | reads | comfortable scale | blobs | shared across tabs | use it for |
|---|---|---|---|---|---|
| **IndexedDB** | async | ~10k records per query; GBs on disk | native Blob values | yes, serialised | the default local backend |
| SQLite-wasm on OPFS | sync, in a Worker only | large, near-native queries | BLOB columns | one handle; needs a leader | a local query engine; design B |
| OPFS raw files | sync in a Worker | whatever the format handles | files | exclusive handles | blob bytes |
| native SQLite (Mac host) | sync on the runtime thread | large | BLOB or files | one process | the Mac provider |
| Cache API | async | — | Responses by URL | yes | fetched assets, never records |
| localStorage | sync | ~5 MB of strings | no | yes | nothing in this design |

**Quota is no longer the binding constraint.** One pool covers IndexedDB, the Cache API, OPFS,
localStorage and service worker registrations; cookies and the HTTP cache sit outside it.
Exceeding it throws on the write that needed the space. Under disk pressure every browser evicts
the least recently used origin whole, and `persist()` protects against that.

| browser | per origin | whole browser | notes |
|---|---|---|---|
| Chrome, Edge | 60% of disk | 80% of disk | `estimate()` always reports 60% of disk |
| Firefox | 10% of disk, or 10 GiB per site group | 50% of disk | `persist()` raises the origin to 50%, capped at 8 TiB, and lifts the group cap, with a prompt |
| Safari 17+, macOS 14+ / iOS 17+ | ~60% of disk | 80% of disk | a WKWebView inside another app gets 15% and 20%; cross-origin frames a tenth of their parent |
| Safari 16 and earlier | 1 GiB, then a prompt | | legacy; this is the figure the earlier research memo carried |

### 11.1 Safari's seven days

**This is the constraint that shapes what the feature may promise, and it is not a quota.**

With cross-site tracking prevention on, an origin that has had no user interaction in the last
seven days *of Safari use* loses all of its script-writable storage: IndexedDB, localStorage,
sessionStorage, OPFS, the Cache API, and service worker registrations and cache. It is per origin
and all-or-nothing, so **no local mechanism in this design is safer than another** — a SQLite
database on OPFS goes with the IndexedDB records. Server-set cookies are exempt; script-set cookies
are capped at seven days separately.

Four things narrow it, and none of them rescues a general promise:

- The seven days are days of *Safari use*, not calendar days, and the timer resets on any
  interaction with the site. **An app someone opens weekly never loses anything.**
- A web app added to the Home Screen or the Dock runs outside Safari with its own counter and is
  exempt. That requires an install, which is a large ask.
- Chrome, Edge and Firefox have no time-based eviction at all.
- The Mac host has none of this: native storage, no quota, no eviction.

**It is not a Chrome-versus-Safari split, it is an engine split.** Every browser on iOS and iPadOS
runs WebKit, so Chrome on an iPhone is subject to the same rule. Where durable local storage
actually holds: desktop Chrome, Edge and Firefox, and Chrome on Android. Where it does not: all of
iOS, and desktop Safari outside weekly use or a Dock install.

`navigator.storage.persist()` is granted silently on heuristics by Chrome and WebKit and by prompt
in Firefox. It protects against least-recently-used eviction. **It is not documented to exempt an
origin from the seven-day rule, and this design does not rely on it.**

### 11.2 What follows

**On the web, with a server, the local store is a cache.** That should be said plainly rather than
softened, and "local-first" is not a phrase this feature may use on the web. Only the native host
gives storage that is the truth.

But the conclusion "then it is not worth building" does not follow, for three reasons.

1. **Two of the three requests have a horizon far shorter than seven days.** GH #23 wants a boot
   cache by request; evicted, its failure mode is the loading state it would have had anyway. PR
   #28 wants an edit to survive a reload, measured in seconds. What genuinely dies is a draft
   abandoned and returned to nine days later, and a drafts feature that loses month-old drafts on
   Safari is a bad feature that must be described honestly.
2. **The store is authoritative for unacknowledged writes.** This is the precise claim, and it is
   what separates this from a browser content cache. The durable truth may be the server, but
   between the moment someone types and the moment the server accepts, the only copy of their
   intent is local — and with offline writes that window is however long they are disconnected, not
   milliseconds. Eviction after seven days of neglect attacks the archive. It does not attack the
   queue.
3. **Most of the design's weight is not in local durability at all.** The protocol, the revisions,
   the refusal path and the subscription are sync machinery that lives mostly server-side. Nothing
   in the Safari story touches them.

**A consequence for the authored surface.** With one store, "saved" is one bit. With a queue and a
server there are three states a person can be in, and they are not interchangeable: *in memory
only*, *written locally but not acknowledged by the server*, and *acknowledged by the server*. The
middle one is what this design exists to make survivable. A saved fact should therefore be a level,
not a boolean.

**A consequence for the product.** There are only three durable serverless answers, and browser
storage is not one of them: the native host, an installed web app, or a file the person keeps.
**Export and import of the document therefore belongs in the design**, with browser storage as the
cache in front of it. It costs nothing, because the whole document is already a record, and the
Upload control (§13) pointed the other way is the importer.

## 12. What this assumes, and what it cannot do

In plain words, because these stay invisible until they are wrong.

- **It assumes the client may hold a correct copy of what it edits.** If a value is not the
  client's to know — a price, a score, another tenant's row — it must not be in the Dataset at all;
  it belongs behind a command.
- **It assumes one writer at a time per record.** Different records, freely; the same record at
  different times, freely; the same record in the same instant means one party is refused and told.
- **It assumes changes are small and documents are not.** An app whose every edit rewrites the
  whole document gets no benefit and should use the document unit.
- **It assumes the server decides and the client finds out.** Optimism is a local convenience, never
  a promise; the refusal path exists to walk it back visibly.
- **It assumes an app can name what it wants without a query.** Paths are segments, indexes and
  slices; there are no filters, so every read is a key or a range.

The limits that follow:

- **Nothing is atomic across records.** "Both or neither" cannot be said with per-record
  compare-and-set. Such operations are commands, by construction.
- **There is no query language, and there will not be one.** Ranges over keys, and collections the
  server defines.
- **Browser storage belongs to the browser, not the person.** Another browser, another machine, or
  a cleared profile sees nothing.
- **A record is exactly as private as the server makes it.** Authorization is not in the protocol
  because it is the server's, but it is not optional (§19).
- **Order, under the record unit, is the app's business.**
- **Blobs are references, not values**, and a reference can point at a local copy nobody else can
  resolve yet.

## 13. Blobs and an Upload control

An uploaded image is not data in the document. The document holds a *reference* — a key plus type,
size and dimensions — and the bytes live in a blob store: IndexedDB or OPFS locally, object storage
on the server. The reference is an ordinary field, so it rides the same patch stream as everything
else.

The bytes land locally at once and the record points at them, so the interface shows the picture
immediately and offline. When the upload completes the reference is rewritten to the server URL,
and any view bound to it re-derives with no code. On reconnect **the upload queue drains first**,
because unsent blobs are the one thing with no server backup (§11.1).

Today the only file input in Declare is foreign DOM inside a `DOMIsland`, so the control is a real
gap. Its shape, in the vocabulary `Image` and `Media` already use: opens the picker on click,
accepts a drop, constrains by type and size; reports `pending`, `progress`, `loaded`, `failed` and
the resulting reference; hands the app a reference to put into a record and never writes the
Dataset itself. On the Mac host it is an open panel through the host bridge.

## 14. Nothing in the bundle unless the app uses it

**DT's build constraint, and the hardest acceptance test in this document.** In his words: *"I want
it done in the plan C promised way: that it becomes a component, and that's nearly it — tiny tiny
runtime overhead. Nothing outside the component file. And if we so decide it can be in a
hypothetical `add-ons/` directory, or just `library/` if it's defined as part of the product."*

What that forbids, concretely. Every file PR #28 touched outside its own directory must have a
reason to disappear, and under this design each does:

| what #28 needed | why it goes |
|---|---|
| mutation observation in `data.ts` | becomes the change event, the one conceded change |
| a settle-completion seam in `reactive.ts` | unnecessary; the event is already delivered after the settle |
| materializer support in `instantiate.ts` | a sibling node instantiates like any other |
| checker rules for ranges | range checks move to the component's own construction |
| a schema entry in the compiler and a built-in source-table entry | an ordinary Declare class needs neither |

That leaves the component file plus one event. The pieces all exist: a bare class is a node,
class-typed attributes are legal, timers are in scope for the coalescing window, and the sanctioned
home for IndexedDB code is a script file outside reactivity.

**The byte count is the acceptance test, because this is exactly where #28 failed, and it failed
structurally rather than carelessly** — the host client statically imported the browser adapter, so
every app paid whether or not it persisted.

| measured on #28 | gzipped |
|---|---|
| calendar production wire | +653 B |
| `declare-boot.js` | +8.7 KB |

**An app that never mentions persistence must pay zero, not a little.** Measure the base bundle
before and after, and treat any non-zero delta as a failed build. This also matches the standing
slimming rule: exclude a runtime feature only when compile time can prove it unused, never by
lazy-loading at runtime.

Placement: `add-ons/` if it stays optional, `library/` if it is declared part of the product. Not
core.

## 15. A reference server

Three ways to get a server, in the order they matter: **a reference server shipped with the
platform**, because it is what the first users will run; **CouchDB**, whose per-document revisions,
changes feed and replication are this protocol almost verbatim, so an adapter rather than an
implementation; and **a hosted store** such as Firestore or Supabase, adapters again.

**Shape, after DT's correction.** His words: *"this kind of thing needs to be some optional setup
process post-download/install of declare. We don't need added complexity at the start of the setup,
for a feature that is not mainstream."* So:

- **Nothing at install.** A fresh download has no data server, no database, and no new Node
  requirement.
- **One opt-in step later** — a setup command, or a line in `declare.json` — turning it on per
  project.
- **Served in-process** by the dev server the user already runs. No second process and no proxy;
  the cost is a small conditional hook in the dev server to load it when configured.
- **The Node check happens only at opt-in**, never on a default install.
- **Zero dependencies.** The existing dev server is the template: pure `node:*` builtins, plain
  `.mjs`, no build step. HTTP is `node:http`; the subscription is server-sent events over plain
  HTTP, which is also why §7 chose SSE, since Node ships a WebSocket client but no server;
  revisions and idempotency keys come from `node:crypto`. JSON Patch application has to be written,
  but the runtime already applies the same operations over RFC 6901 pointers, so the pointer
  handling and operation rules carry over even though the verbs themselves are entangled with
  reactivity.

**Storage is the one real decision, and it is gated on the Node version.** `node:sqlite` is the
right store and it is built in: compare-and-set is a transaction; the sequence is an autoincrement
on a changes table and the feed is one query since a sequence number; a range is an index; its
synchronous-only API gives serialized compare-and-set for free inside one process; an in-memory
database runs the same code for the test suite; and it is the schema the Mac host would use with
native SQLite, so server and native host share one table design.

| Node | status | `node:sqlite` |
|---|---|---|
| 20 | end-of-life 2026-04-30 | absent |
| 22.13+ | maintenance LTS to 2027-04-30 | built in, unflagged, experimental |
| 24 | active LTS to 2028-04-30 | built in, experimental |
| 25.7+ | current line | release candidate |

**Declare a Node 24 floor and ship `node:sqlite` as the only store.** The tempting hedge — a
JSON-file backend so the server also runs on Node 20 — is a second store to keep correct for a
runtime nobody should deploy on. Keep the storage interface narrow enough for CouchDB or Postgres
adapters later, but ship one implementation.

Two things zero dependencies does not fix: `node:sqlite` is still experimental on the LTS lines,
which is acceptable for a reference server but must be said out loud; and authorization remains the
hole (§19).

## 16. What PR #28 tells us

**Read as a statement of technical needs, not as code to take.** It is careful, well-specified work
from an outside contributor, and the reason it does not carry forward is that the design moved after
it was written, not that it was done badly.

**What it is.** A `Persistence` node declared as a child of a writable `Dataset`, snapshotting that
Dataset's whole value into IndexedDB and acknowledging the write:

```declare
note: Dataset [ disk: Persistence [ key = "guide/note", save = "manual" ] ] {
    { "title": "Untitled" }
},
Button [ label = "Save", onClick() { app.note.disk.commit() } ],
Text [ text = { app.note.disk.saved ? "Saved" : "Working copy" } ]
```

Six settable attributes (`key`, `save`, `restoreOn`, `delay`, `maxDelay`, `conflict`), fifteen
read-only facts, six commands (`commit`, `replace`, `restore`, `erase`, `retry`, `reload`), one
event, and eighteen error codes with a retryable subset.

**The needs it demonstrates, all of which survive into this design.** This is the list to check a
new implementation against:

- **Capture after the settle, and acknowledge the right snapshot.** An acknowledgement of an older
  snapshot must not overwrite newer edits or mark them saved. With a queue there are two
  acknowledgers, so this matters more here, not less.
- **Coalescing with a ceiling.** A quiet period of 250 ms bounded by 1000 ms during continuous
  editing, described as coalescing limits rather than promises about storage latency.
- **Recovery as a decision, not an automatic load.** A saved document is adopted at boot only if the
  person has not edited or requested a save while the read was in flight; otherwise it is exposed
  frozen, beside the live Dataset, and a normal save refuses until that is resolved. What survives
  of this is narrower than #28's version — the general "your copy and the authority disagree" case
  is §8's refusal path — but the **boot race** it solves is real and must be solved.
- **Erase must not be undone by the next keystroke.** Deleting the saved copy pauses autosave, so
  typing does not silently recreate it.
- **A receipt protocol for leaving.** `commit()` returns a request id immediately, not a promise;
  leaving safely means correlating that id. Closing a tab is not a guaranteed final-save
  opportunity. With two acknowledgers there are two receipts to wait for.
- **A revision check against a second writer.** Another tab changing the same document is refused as
  a conflict, with a way to inspect the newer candidate — the same compare-and-set §7 needs, applied
  to tabs instead of devices.
- **Stalled is not failed.** An operation whose outcome is unknown stays pending rather than being
  retried or reported, and the retryable error classes are marked. Offline is precisely this case,
  and distinguishing it is what lets a queue wait instead of giving up.
- **Storage identity must be explicit.** Origin, entry-program URL, host namespace and policy key;
  moving the program can change its identity, and embedders need a stable app id.
- **Hard limits stated.** Portable JSON capped at 8 MiB; a schema check at the boundary; a host with
  no provider reports `unsupported` with no silent in-memory fallback.

**What we keep, in order of value.** Its ~1274 lines of tests, which encode boot and edit races,
abort-after-put, stalled transactions, versionchange during an active write, quota and denial
injection, and byte and slot saturation — that is the expensive knowledge, and it is portable in a
way the code is not; **new code should pass their suite**. Its ~147-line transactional IndexedDB
adapter, which implements a narrow contract the new protocol also needs. Its error taxonomy. And
its lifecycle state chart read as a specification of which races exist, rather than as 307 lines to
port.

**What does not carry, and why.** The unit is a whole-document snapshot where this design settled on
the record and the patch, which is the data model rather than a setting. It attaches to a
completion hook in the reactive scheduler where this design attaches to a change event. Its four
save booleans are a one-party view of what becomes a two-party question (§11.2). It is a child of
`Dataset` rather than a sibling, and its policy is latched for one owner lifetime rather than live.
Mechanically it also predates provided values and touches a materializer that has since changed.

**Size, for scale.** 8711 added lines across 133 files, but it sits on PR #26 and that prerequisite
is most of it: ~4681 lines of app, ~1411 of docs, ~1274 of tests, ~986 in `runtime/src/persistence`,
~161 elsewhere in runtime and compiler. The platform increment is about 1150 lines.

## 17. Rejected alternatives, and why

- **Design A as the destination** (whole-document snapshot). Kept as the degenerate case — a patch
  replacing the root — and as tier one's shipping unit; rejected as the shape, because it cannot
  express partial conflict, cannot sync partially, and transfers a whole document for a one-field
  change.
- **Design B as tier one** (store-backed Dataset). Weeks of work in the most load-bearing file, and
  it changes what a Dataset read means: cold reads return null and wake later. Held as a tier-three
  optimisation over the same provider.
- **A service worker as the local backend.** Rejected: it is the platform's serving trick, not
  something an app author asked for; a local backend that works only once a worker is installed is
  not local to the app; and because the worker is stopped when idle, all state would have to live in
  the store anyway.
- **CRDTs.** Out of scope. Two people editing one field in the same instant is the case this design
  does not solve, and solving it is a different design.
- **"Single user" as the real backend.** Rejected: per-user is only the local replica. The server is
  the authority.
- **`Persistence` as a child of `Dataset`, or in the platform core.** Rejected: it is an add-on
  presented beside a Dataset (`disk: Persistence [ data = { app.notes }, … ]`), and tier one must not
  grow platform surface (§14).
- **A frozen or latched key.** Rejected: the key is live, like a `DataSource`'s url. Range rules move
  to construction; enums and types stay static.
- **A separate reference-server process mounted by proxy.** Rejected as added setup complexity for a
  feature that is not mainstream (§15).
- **A JSON-file store so the reference server also runs on Node 20.** Rejected: a second store to
  keep correct, for an end-of-life runtime.
- **Two code paths, durable on Chrome and cache-only on Safari.** Rejected: it doubles the surface and
  puts the app author in the business of explaining their own storage differently per browser. One
  behaviour — cache semantics promised everywhere, durability as an environment bonus — and "your
  data lives on this device" reserved for the native host, where it is true without qualification.
- **Relying on `navigator.storage.persist()` to survive Safari's rule.** Rejected: not documented to
  do so (§11.1).

## 18. Delivery, in tiers

| tier | in the platform | as add-ons or protocol | answers |
|---|---|---|---|
| **1, now** | the change event (§6) and the guidance with it | a `Persistence` node beside its Dataset, document unit only, live key, file export and import | all three requests as asked |
| **2, next** | a push direction on `DataSource`; the protocol written down; `EventStream` and `Socket` already carry the subscription | the record unit; the shared-IndexedDB local backend with its `BroadcastChannel` feed; a reference server with an authorization story; CouchDB and hosted adapters; the offline queue and the refusals fact | a shared backend, offline, several tabs |
| **2, with it** | an `Upload` control | blob stores local and remote; the upload queue | files and images |
| **3, if ever** | the store-backed Dataset (design B) over the same provider | SQLite-wasm and native SQLite adapters | data larger than memory |

**The thing to resist is letting tier one grow surface.** Tier two is where the shape gets decided,
and it should be decided by the protocol rather than by the first storage adapter.

## 19. Open questions

1. **Authorization on the reference server.** The hole. Five verbs pointed at a database with no
   rules in front is an open database, and "a few hundred lines" is the claim that breaks first.
   Declared rules in the Firestore style, or a handler per collection? The zero-dependency answer is
   a plain function hook receiving the caller, the collection and the operation. This decides whether
   the reference server is a real thing or a demo.
2. **How the backend tells its own writes from the person's.** Inbound records and other people's
   patches land in the Dataset through the same verbs, so they come back out of the change event as
   edits. Either the add-on remembers what it applied and drops the matching head of the next event —
   echo matching, which works today — or the Dataset gains `apply(changes)`, a batch spelling of the
   four verbs whose changes carry their own origin. The second is cleaner and arguably still one
   primitive; it is also new surface, which §14 resists.
3. **Whether `previous` belongs on the event** (§6). It is the only way to name a removed record
   after the settle and the runtime holds the value anyway; against it, the event stops being pure
   RFC 6902 and a large removed subtree is retained until the handler returns.
4. **Whether arrivals and derived recomputes raise the event at all.** The origin field handles
   not pushing them back. The alternative is that the event means edits only, which costs the add-on
   a second listener for restore-after-fetch and makes GH #23 harder to write.
5. **Array order under the record unit** (§7). A position field, or an ordered key list stored as its
   own record? The latter keeps `move` meaningful at the cost of a second write per reorder and a
   record every tab contends on.
6. **The authored surface of the add-on.** Which of #28's facts and commands survive the move from
   child to sibling, and whether its result event stays a method or becomes a fact. Note §11.2: the
   saved fact wants to be a level, not a boolean.
7. **The event's name** (§6), given the collision with the shipped `onChange`.
8. **The Mac host's place in the schedule.** Native SQLite on the runtime thread is the natural
   provider and windows share the process, and it is the only environment where "your data lives
   here" is true. Whether the first release ships IndexedDB through the web view or waits for the
   bridge is a scheduling question, not a design one.
9. **The unifying direction** from [data-model.md](data-model.md) §7: projection-to-source and
   client-copy-to-server as one concept, a derived document with a declared way back. To be taken up
   once the data-model decisions lock, and after §5 there is built.
