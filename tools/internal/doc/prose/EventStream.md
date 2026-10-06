Server-Sent Events (`text/event-stream`) as a source: the server
pushes, the app receives, an `onMessage` that concatenates is the whole consumer. See
`Stream` for the shared surface (`url`/`active`/`retry`, the read-only
`status`/`open`/`error`/`last`). Receive-only — there is no `send`; a request that needs a
body is an ordinary `DataSource` POST, and the stream carries the reply. The platform's
`EventSource` machinery is kept **verbatim**: it retries on its own (honoring the server's
`retry:` hint) and resumes with `Last-Event-ID`, during which `status` reads `"retrying"`
and no error is reported; `retry`/`onError` concern only **terminal** failure — the
platform giving up.

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

## listenTo
The **named** SSE event types to deliver — `listenTo = ["progress",
"done"]`. Required for any stream that labels messages with `event:` lines: the platform's `EventSource` physically cannot deliver a
named event it was not asked to listen for, so an undeclared name is silently invisible —
if `onMessage` sees nothing but the connection is `open`, this is the first thing to
check. The name carries the contract: you hear what you listen to. Unnamed (default)
messages always arrive; `e.type` says which kind each one is.
