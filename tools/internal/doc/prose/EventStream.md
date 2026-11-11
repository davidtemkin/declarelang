Server-Sent Events (`text/event-stream`) as a source: the server
pushes, the app receives, an `onMessage` that concatenates is the whole consumer. See
`Stream` for the shared surface (`url`/`active`/`retry`, the read-only
`status`/`open`/`error`/`last`). Receive-only — there is no `send`.

A stream that is the **reply to a request** — an AI model's answer arriving word by word
from a POST — declares the request as a `DataSource` does: `method`, `body`, `headers`,
`credentials`. It is one request, and its reply is read as it arrives; the stream closes
when the reply ends (`onClose`), and a refusal fails it with the status and what the
server said (`failure` = `rejected` for a 4xx, `serverError` for a 5xx). A reply that is
not `text/event-stream` — a sign-in page, a proxy's notice — is `unreadable`, not read as
events. A request is not sent again on its own — declare `retry` to ask again after a loss.

A plain GET — none of the four — keeps the platform's `EventSource` machinery
**verbatim**: it retries on its own (honoring the server's `retry:` hint) and resumes with
`Last-Event-ID`, during which `status` reads `"retrying"` and no error is reported;
`retry`/`onError` concern only **terminal** failure — the platform giving up. It does not
say why it gave up — a refusal, a wrong content type and a dead network look alike to the
page — so that failure is `networkError`.

A declared stream **holds a live connection** for as long as it is `active` and its node
lives — every open tab is one held server connection (browsers cap ~6 per host over
HTTP/1.1, so a dev server's tabs can exhaust the pool). The lifecycle is the declaration:
`active = { app.jobId != "" }` releases the connection the moment the condition goes
false, and a discarded node closes its own — there is nothing to unsubscribe.

```declare-fragment
output: string = "",
progress: EventStream [ url = { `/api/jobs/${app.jobId}/events` },
    active = { app.jobId != "" },
    onMessage(e: StreamMessage) { app.output = app.output + e.data },
    ]
```

```declare-fragment
answer: string = "",
asked: string = "",
reply: EventStream [ url = "/api/chat", method = "POST", active = { app.asked != "" },
    body = { { prompt: app.asked } }, headers = { { Authorization: "Bearer " + app.token } },
    onMessage(e: StreamMessage) { app.answer = app.answer + e.data },
    ]
```

## method
`"GET"` (the default), `"POST"`, `"PUT"`, `"PATCH"` or `"DELETE"` — the request whose reply
is the stream. Anything but a plain GET is read as the reply to one request (above).

## body
What the request sends, as a `DataSource`'s: an object or array is JSON-encoded with a
JSON `Content-Type`, a string is sent as it is. Ignored for a GET.

## headers
The request's headers — a record, as a `DataSource`'s. An empty value drops the header,
so `Authorization: app.token != "" ? "Bearer " + app.token : ""` sends one only when
signed in. Changing them asks again.

## credentials
Whether the request carries the person's cookies and credentials — `sameOrigin` (the
default), `include`, `omit` — as for a `DataSource`.

## listenTo
The **named** SSE event types to deliver — `listenTo = ["progress",
"done"]`. Required for any stream that labels messages with `event:` lines: the platform's `EventSource` physically cannot deliver a
named event it was not asked to listen for, so an undeclared name is silently invisible —
if `onMessage` sees nothing but the connection is `open`, this is the first thing to
check. The name carries the contract: you hear what you listen to. Unnamed (default)
messages always arrive; `e.type` says which kind each one is.
