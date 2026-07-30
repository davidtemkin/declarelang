The abstract base of the live-connection sources — `EventStream` (SSE) and `Socket`
(WebSocket) extend it. Not instantiable: write the concrete transport. The one thing to
know: **there is no `connect()` or `disconnect()`** — the declaration decides. A stream is
connected exactly while `active` is true and `url` is non-empty; empty the url (or flip
`active`) and it closes, change the url and it closes and reopens, remove the node and the
connection dies with it. Nothing to unsubscribe, ever. Messages are **transient**: nothing
accumulates unless a handler writes it somewhere — the runtime keeps only `last`. An app
that streams JSON parses in the handler (`JSON.parse(e.data)`) and writes wherever it
wants; accumulation is one line of app code, deliberately not a built-in policy.

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

## url
Where to connect — a literal or a `{ }` constraint. Unlike `DataSource.url`, a change acts
**immediately**: the old connection closes and a new one opens at the new address (there is
no fetch() moment to wait for). `""` means detached — the idiom for "no conversation yet"
is deriving emptiness: `url = { app.chatId != "" ? "/api/chat/" + app.chatId : "" }`.

## active
The gate. `false` closes the connection (and cancels any pending retry); flipping back
`true` reopens it. Bind it to app state — `active = { app.live }` — rather than toggling
imperatively.

## retry
Reconnect policy, **visible in the declaration**: seconds to wait before re-dialing after
the connection is lost and the platform won't bring it back on its own — a `Socket`'s
unexpected close, an `EventStream`'s terminal failure. `0` (the default) means no retry:
the stream lands in `status = "failed"` and the app decides. A declared retry keeps trying
while `active` is true, at a **fixed** interval — no invisible backoff, no give-up count.
A structural failure (the factory itself refuses — headless extraction, a missing host
service) never loops, whatever `retry` says.

## status
The connection lifecycle as **one fact**, like `DataSource.status`: `"closed"`,
`"connecting"`, `"open"`, `"retrying"`, or `"failed"` (down, and will not reconnect).
**Read-only** — computed for you; assigning it is a compile error. `"retrying"` covers
both the platform's own recovery (SSE) and a declared `retry` waiting to re-dial.

## open
The boolean view of `status == "open"`, as `DataSource.loaded` is of its status — one
fact, two spellings, never in disagreement. **Read-only.** The connection dot is
`visible = { feed.open }`.

## error
The last failure reason, `""` when none; cleared when a connection opens. **Read-only** —
the state side of `onError` (the event side). A status line is
`text = { feed.error != "" ? feed.error : feed.status }`.

## last
The most recent message's `data`, reactive. **Read-only.** The zero-handler tier: a ticker
that only shows the latest value needs no handler at all — `text = { feed.last }`.

## onMessage
`onMessage(e: StreamMessage)` — every message. `e.data` is always a **string**: parse it
yourself if it is JSON, concatenate it if it is streamed text; the runtime never guesses.
`e.type` is the SSE named event (`"message"` for unnamed messages and every socket frame);
`e.id` is the SSE last-event-id (`""` on sockets).

## onOpen
The connection is live — fires each time one opens, including reopens after a retry.
Prefer deriving from `open`/`status` for anything a constraint can express; the handler is
for work state cannot do (send a subscription frame, log).

## onClose
A connection that had opened went away — the app closed it (`active`, a url change, node
removal at discard is silent), the server ended it, or it failed. Fires once per
connection, before any retry dials the next one.

## onError
Something failed: a terminal connection loss, a refused transport, a `send` on a socket
that is not open. The reason is in `error` when the handler runs. The platform's own
in-flight retries (SSE) are **not** errors and stay quiet.
