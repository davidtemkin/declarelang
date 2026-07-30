# Streams — SSE and WebSocket as sources

> **Status: RULED 2026-07-29 (David); §7 records the rulings.** Tactical
> driver: showing AI responses as they arrive (an external project needs SSE
> now); the same construct must cover WebSocket. Deliberately independent of
> the data-system upgrade ([data-paths.md](data-paths.md), ruled;
> [materialization.md](materialization.md), proposed) — see §6 for why the
> two must not entangle. The transport seam (§4) is where the mac-host
> merge's host services plug in (native-host.md host-services inventory).

---

## 1. The shape is already in the language

A stream is a **source** — the ch. 7 family (`Keys`, `Frames`, `Tip`,
`Dataset`): a non-visual member whose handlers are called by something
outside the tree, whose lifetime is its node's, with nothing to unsubscribe.
Nothing new is needed in the reactive model: a message arrives, a handler
assigns, every constraint that read the changed state updates. Streaming AI
text into a view is *one line of handler* precisely because the hard half —
propagation — is the language's existing job.

```declare-fragment
chat: View [
    answer: string = "",
    reply: EventStream [ url = { `/api/chat?id=${classroot.chatId}` },
        active = { classroot.chatId != "" },
        onMessage(e: StreamMessage) { classroot.answer = classroot.answer + e.data },
        ],
    out: Text [ width = { parent.width }, text = { parent.answer } ]
    ]
```

## 2. The ruled surface

One family, three names — the `Editor` arrangement (documented, inheritable,
uninstantiable base):

- **`Stream`** — the abstract base. Carries the entire shared surface below;
  in the schema table (so the reference documents it once and the subclasses
  inherit it checkably), absent from the tag registry (so it cannot be
  instantiated) — exactly as `TextInput extends Editor`.
- **`EventStream extends Stream`** — SSE (`text/event-stream`). Receive-only.
- **`Socket extends Stream`** — WebSocket. Adds `send(text)`.

The `Stream` surface:

| member | kind | meaning |
|---|---|---|
| `url` | attribute, reactive | where to connect; a change closes and reopens (push-driven, exactly `Dataset.url`); `""` = detached |
| `active` | attribute, default `true` | the gate: `false` closes; flipping back reopens (the `AppIsland.program=""` detach idiom) |
| `retry` | attribute, default `0` | seconds between reconnect attempts after the connection is lost and the platform won't bring it back on its own; `0` = no retry. Keeps trying while `active` is true — the whole policy is the one number in the declaration |
| `onMessage(e: StreamMessage)` | handler | every message; `e.data` (string), `e.type` (SSE named events; `"message"` default), `e.id` (SSE last-event-id, `""` on sockets) |
| `onOpen()` / `onClose()` / `onError()` | handlers | connection lifecycle facts (the event side; the state side is below) |
| `status` | read-only intrinsic | the lifecycle as one fact, like `DataSource.status`: `"closed"` \| `"connecting"` \| `"open"` \| `"retrying"` \| `"failed"` (failed = down and will not reconnect) |
| `open` | read-only intrinsic | the boolean view of `status == "open"` — like `DataSource.loaded`; declaring or assigning it is a compile error |
| `error` | read-only intrinsic | the last failure reason, `""` when none; cleared on open |
| `last` | read-only intrinsic | the most recent `e.data`, reactive — the zero-handler tier: a status ticker is `text = { feed.last }` with no handler at all |
| `send(text)` | method, `Socket` only | a call you make; `onMessage` is it calling you. On a closed socket: a reported error (the `onError` channel), not a silent queue |

`EventStream` adds one attribute of its own, forced by the platform's API
shape: **`listenTo`** — the named SSE event types to deliver, as a bare list
literal (`listenTo = ["content_block_delta", "message_stop"]`, the
styles/fontFamily list form). `EventSource` has no catch-all: named events
reach only a listener registered for that exact name, so a stream that uses
`event:` lines (Anthropic-style SSE does) must say which names it wants —
and omission is silent, which is why the name carries the contract: you hear
what you listen to. Unnamed (default) messages always arrive; `e.type`
distinguishes them. (An "all" default is not implementable over EventSource —
hearing everything would mean hand-parsing SSE over fetch and forfeiting
native retry/Last-Event-ID, rejected under §3's delegation principle.)

**What is deliberately absent:**

- **No accumulated-text slot.** Accumulation is app semantics (tokens
  concatenate; JSON messages don't), and the accumulating handler is one
  line. `last` covers the handler-free case without guessing a policy.
- **No parsing.** `e.data` is a string. An app that streams JSON parses in
  the handler and writes wherever it wants — including into a `Dataset`'s
  value through the ordinary mutation surface.
- **No binary frames in v1.** Text frames only; binary is a later attribute
  on `Socket` if a real project needs it, not a speculative one.

## 3. Reconnection: delegate what the platform owns; declare the rest

The same principle as the gesture claims — the platform's own machinery is
the best implementation of the platform's own behavior — plus David's ruling
(2026-07-29): where the platform has no machinery, the policy is **declared,
never invisible**.

- **SSE reconnects natively** — `EventSource` retries with the server's
  `retry:` hint and resumes via `Last-Event-ID`. `EventStream` keeps that
  behavior verbatim; while the platform retries, `status` reads `"retrying"`
  and the error channel stays quiet (`onError` reports terminal failures —
  the platform giving up — not each retry).
- **Beyond that, `retry = seconds`.** One number in the declaration: how long
  to wait before reconnecting after the connection is lost and the platform
  won't bring it back on its own — for a `Socket`, any close the app didn't
  ask for; for an `EventStream`, after `EventSource` gives up terminally.
  `0` (the default) means no retry: the stream lands in `"failed"` and the
  app decides. A declared `retry` keeps trying while `active` is true; the
  interval is fixed — no invisible backoff curves, no jitter, no give-up
  count. The whole policy is visible in the declaration, which is exactly
  why it may exist at all. (Backoff/attempt-limit knobs are POSSIBLE later
  spellings if real projects measure the need; they were consciously not
  taken now.)
- A **synchronous factory failure** (no transport at all — the headless
  refuser, a missing host service) is structural, not transient: straight to
  `"failed"`, no retry loop.

## 4. The host seam

`data.ts` already models it: `provideTransport(fn)` — browser default is
platform `fetch`; HEADLESS installs a **refusing** transport so extraction
can never initiate a request (capabilities: network is "fixtures, or honestly
absent"). Streams get the same seam:

```ts
provideStreams({ eventSource, socket })   // factories, injected
```

The seam lives in its own side-effect-free module (`stream-seam.ts`), split
from the classes deliberately: `index.ts` exports the seam (refusers, stubs,
the mac host's pair), but the production entry imports index wholesale — so
the `Stream`/`EventStream`/`Socket` classes are reachable **only through
`registry.js`**, which declarec's slim substitution prunes. An app that
declares no stream ships none of the machinery; only its schema-table row
rides along (as every component's does).

- Browser default: `EventSource` / `WebSocket`.
- Headless: refusers — a stream source under extraction lands in `onError`
  with the reason, by construction.
- **The mac host injects its native implementations here** — this seam is a
  row in native-host.md's host-services inventory, which is why
  implementation waits for that merge to land rather than racing it.
- Tests: stub factories drive deterministic message sequences (the unit
  tier); the dev server grows a tiny SSE fixture route for the browser tier;
  the sim rig replays the real project's shape over LAN on a device.

## 5. Lifecycle, exactly the source contract

Node removal closes the connection; `active = false` closes it; a `url`
change closes and reopens. Nothing to unsubscribe, ever — the promise the
source family already makes. `Socket.send` on a closed socket is a reported
error (the `onError` channel), not a silent queue.

## 6. Why this must NOT entangle with the data upgrade

Streams are **event-shaped**: ordered arrivals, append-mostly, transient.
Datasets are **record-shaped**: navigable state, paths, mutation. The bridge
between them is ordinary app code (parse a message, write into a dataset) —
not a construct. Keeping them orthogonal means:

- SSE ships now, unblocked by JSONPath (ruled, unbuilt) and materialization
  (unruled).
- Virtualized datasets later choose their own paging transport at
  `Dataset`'s existing `provideTransport` seam — streams impose nothing.
- Neither design has to anticipate the other's evolution.

## 7. The rulings (David, 2026-07-29)

1. **Names**: `EventStream` / `Socket` as proposed, PLUS an abstract
   **`Stream`** base carrying the shared surface — David: the commonality
   must be public and named, not an implementation detail. This also
   resolves the naming tension: `Stream` overclaimed as the SSE class's
   name but is exactly right for the family.
2. **`last` intrinsic**: KEEP (the zero-handler ticker tier).
3. **`open` intrinsic**: KEEP, as the boolean view of `status` (below).
4. **Reconnect**: NOT app-owned — David: "this will need error states, and
   if that's happening, retry policy can be encoded in attributes specified
   in the declaration." Hence `retry = seconds` on `Stream` (§3) and the
   one-fact error surface: read-only `status`
   (`closed|connecting|open|retrying|failed`) + `error` (last failure
   reason) + `open` — the `DataSource.status`/`.loaded` design, transplanted.
5. **Binary frames**: CONFIRMED deferred (text only in v1; a later `Socket`
   attribute if a real project needs it).

One post-ruling addition, implementation-forced and RULED 2026-07-30:
`EventStream.listenTo` (§2) — `EventSource` physically cannot deliver named
`event:` types it was not asked to listen for, and the tactical driver
(AI-response SSE) uses named events; the alternative was silently dropping
them. David ruled the spelling: `listenTo`, a bare list literal (not the
first draft's space-delimited string), the name chosen because the
attribute's omission fails silently and the name states the consequence.

## 8. Build plan (one short session, post-merge)

schema.ts entries + typed `StreamMessage` in the curated lib → the runtime
source (the `Dataset` source is the template; ~one file) → the seam +
headless refusers → unit tests on stub factories + a dev-server SSE fixture
route + a serve-browser pin → reference prose (`EventStream.md`,
`Socket.md`) and one guide paragraph in the data chapter. The external
project's streaming case then runs against the dev server directly.
