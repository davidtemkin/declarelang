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
job: View [
    output: string = "",
    progress: EventStream [ url = { `/api/jobs/${classroot.jobId}/events` },
        active = { classroot.jobId != "" },
        onMessage(e: StreamMessage) { classroot.output = classroot.output + e.data },
        ],
    out: Text [ width = { parent.width }, text = { parent.output } ]
    ]
```

## url
Where to connect — a literal or a `{ }` constraint. Unlike `DataSource.url`, a change acts
**immediately**: the old connection closes and a new one opens at the new address (there is
no fetch() moment to wait for). `""` means detached — the idiom for "no job yet"
is deriving emptiness: `url = { app.jobId != "" ? "/api/jobs/" + app.jobId + "/events" : "" }`.

## active
The gate. `false` closes the connection (and cancels any pending retry); flipping back
`true` reopens it. Constrain it to app state — `active = { app.live }` — rather than toggling
imperatively.

## retry
Reconnect policy, **visible in the declaration**: seconds to wait before re-dialing after
the connection is lost and the platform won't bring it back on its own — a `Socket`'s
unexpected close, an `EventStream`'s terminal failure. `0` (the default) means no retry:
the stream lands in `status = "failed"` and the app decides. A declared retry keeps trying
while `active` is true, with no give-up count, by this rule:

- **The wait grows.** The first is `retry` seconds; each failure in a row doubles it, up to
  a minute, and each wait is drawn from its upper half, so the clients a server restart
  dropped together don't all return in the same second. A connection that then stays open
  ten seconds starts the count over.
- **A refusal is not retried** — the server saying no (`failure = rejected`: a WebSocket's
  policy close, an event stream's 4xx) or answering with something that is not a stream
  (`unreadable`): asking again asks for the same no.
- **Offline, it waits the longest; back online, it dials at once** — after a moment's
  jitter — and so it does when the page is shown again after being in the background.
- `onClose` runs before a retry is scheduled: a program that reads `closeCode` there (its
  own 4000–4999, an expired session) and turns `active` off stops it.

A structural failure (the factory itself refuses — headless extraction, a missing host
service) never loops, whatever `retry` says.

## connectTimeout
Seconds to wait for the connection to open before giving it up (`failure = timedOut`, then
the `retry` rule). The platform has no limit of its own: a dial into a network that drops
packets can wait minutes. 30 by default; `0` waits without limit.

## idleTimeout
Seconds an open connection may go with nothing arriving before it is taken for dead and
closed (`failure = timedOut`, then the `retry` rule). A link left half-open — after the
computer slept, or the network changed — looks open and delivers nothing, and nothing else
notices. `0` (the default) is off. Set it a little longer than the server's own heartbeat:
the page sees neither a WebSocket's pings nor (from the platform's `EventSource`) an event
stream's `:` comments, so the server must send real messages; an `EventStream` that is the
reply to a request does count its comments.

## failure
Why the last connection failed — the closed set a `DataSource` uses: `offline` or
`networkError` (it could not be reached, or it broke; a browser tells a WebSocket's refusal
apart from neither), `timedOut` (`connectTimeout` or `idleTimeout`), `rejected` (a policy
close, an event stream's 4xx), `serverError` (an event stream's 5xx, a WebSocket's 1011–1014),
`unreadable` (a reply that is not an event stream), `unsent` (the connection could not be
made at all); `none` while all is well. **Read-only.**

## closeCode
The last close's code — a WebSocket's (`1000` a normal end, `1001` going away, `1006` lost
with no word, `1008` refused by policy, `1012` restarting, 4000–4999 the server's own); `0`
before any. **Read-only.** Read it in `onClose` to decide what an application's own code
means.

## closeReason
The text that came with the last close, `""` when none. **Read-only.**

## status
The connection lifecycle as **one fact**: `"closed"`,
`"connecting"`, `"open"`, `"retrying"`, or `"failed"` (down, and will not reconnect).
**Read-only** — computed for you; assigning it is a compile error. `"retrying"` covers
both the platform's own recovery (SSE) and a declared `retry` waiting to re-dial.

## open
The boolean view of `status == "open"` — one fact, two spellings, never in
disagreement. **Read-only.** The connection dot is
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
