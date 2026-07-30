Server-Sent Events (`text/event-stream`) as a source — the streaming-AI shape: the server
pushes, the app receives, an `onMessage` that concatenates is the whole consumer. See
`Stream` for the shared surface (`url`/`active`/`retry`, the read-only
`status`/`open`/`error`/`last`). Receive-only — there is no `send`; a request that needs a
body is an ordinary `DataSource` POST, and the stream carries the reply. The platform's
`EventSource` machinery is kept **verbatim**: it retries on its own (honoring the server's
`retry:` hint) and resumes with `Last-Event-ID`, during which `status` reads `"retrying"`
and no error is reported; `retry`/`onError` concern only **terminal** failure — the
platform giving up.

```declare-fragment
answer: string = "",
reply: EventStream [ url = { `/api/chat?id=${app.chatId}` },
    active = { app.chatId != "" },
    onMessage(e: StreamMessage) { app.answer = app.answer + e.data },
    ]
```

## listenTo
The **named** SSE event types to deliver — `listenTo = ["content_block_delta",
"message_stop"]`. Required for any stream that labels messages with `event:` lines
(Anthropic-style AI streams do): the platform's `EventSource` physically cannot deliver a
named event it was not asked to listen for, so an undeclared name is silently invisible —
if `onMessage` sees nothing but the connection is `open`, this is the first thing to
check. The name carries the contract: you hear what you listen to. Unnamed (default)
messages always arrive; `e.type` says which kind each one is.
