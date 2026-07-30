WebSocket as a source: the `Stream` surface plus `send(text)` — `send` is a call you make,
`onMessage` is it calling you. See `Stream` for `url`/`active`/`retry` and the read-only
`status`/`open`/`error`/`last`. Unlike SSE the platform has **no native reconnect**, so a
`Socket` that should survive a dropped connection must say so: `retry = 2` re-dials two
seconds after any close the app didn't ask for, for as long as `active` holds — the whole
policy is that one number. Text frames only; a binary frame is dropped (a later attribute
if a real project needs one, not a speculative shape now).

```declare-fragment
live: Socket [ url = "wss://api.example.com/feed", retry = 2,
    onOpen() { this.send('{"subscribe":"prices"}') },
    onMessage(e: StreamMessage) { app.tick(JSON.parse(e.data)) },
    ]
```

## send()
Sends one text frame. **Legal only while `open`** — on a socket that is not open it sends
nothing and reports through the error channel (`error` + `onError`), never a silent queue:
if the app needs buffering-until-connected, that policy belongs in app state, visibly.
Sending the opening frame belongs in `onOpen` (which also covers every reconnect); gate
user-triggered sends on `.open`.
