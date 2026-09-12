# The conversation service

One process serves the history, the media, and the live feed. Start it:

```
node api/server.mjs --port=8330 --seed=1
```

Everything it does is deterministic for a given `--seed`: the same seed
produces the same events at the same offsets from the moment a client
connects. Re-running gives you the same run. `--seed` defaults to `1`.

`--live` replaces the seeded schedule with a randomised one. Use it to play
with the app; do not use it to measure anything.

---

## 1. History — `GET /threads.json`

The whole starting state, once, at load.

```jsonc
{
  "me": "p1",                       // which person the app is speaking as
  "people": [
    { "id": "p1", "name": "You",      "avatar": "avatars/p1.jpg" },
    { "id": "p6", "name": "Dana Ruiz", "avatar": null }   // not everyone has one
  ],
  "sendable": [                     // the photographs this person may send
    { "src": "photos/send-1.jpg", "alt": "…" }
  ],
  "threads": [
    {
      "id": "t1",
      "title": null,                // group conversations may carry one; pairs do not
      "participants": ["p1", "p2"],
      "lastSeen": "m0148",          // the last message this person has read
      "messages": [ /* oldest first */ ]
    }
  ]
}
```

A **message** is one of three kinds. All three carry `id`, `from`, `at` (ISO
8601, UTC), and optionally `reactions`.

```jsonc
{ "id": "m0031", "from": "p2", "at": "2026-07-28T14:02:11Z",
  "kind": "text", "text": "…" }

{ "id": "m0032", "from": "p1", "at": "2026-07-28T14:03:40Z",
  "kind": "photo", "src": "photos/12.jpg", "alt": "…" }

{ "id": "m0033", "from": "p2", "at": "2026-07-28T14:06:02Z",
  "kind": "voice", "src": "voice/3.m4a", "durationMs": 8437,
  "peaks": [0.04, 0.31, 0.88, …] }        // 0–1, evenly spaced across the clip

// any message may carry:
"reactions": [ { "person": "p3", "emoji": "❤️" },
               { "person": "p5", "emoji": "❤️" } ]
```

**Photographs do not carry their pixel dimensions.** This is deliberate — the
service does not know them and neither will you until they load. They range
from 9:16 tall to 3:1 wide.

**`peaks`** is a fixed-length array of loudness samples, evenly spaced across
the clip, already computed from the audio. You are not expected to analyse
audio.

Messages within a thread are ordered oldest first. Threads in the array are in
no meaningful order — `G2` is yours to establish.

## 2. Media — `GET /photos/…`, `/voice/…`, `/avatars/…`

Served as ordinary files, at the paths the history gives. Voice clips are AAC
in an MP4 container (`.m4a`).

## 3. The live feed — `WebSocket /live`

Connect to `ws://localhost:<port>/live`. The schedule starts at connect.

### Server → client

Each frame is one JSON object with a `t` field.

| `t` | payload | meaning |
|---|---|---|
| `hello` | `{ me, serverNow }` | first frame, once |
| `composing` | `{ thread, person, state: "start" \| "stop" }` | someone is or has stopped writing |
| `message` | `{ thread, message }` | a new message, same shape as in history |
| `reaction` | `{ thread, message, person, emoji }` | attached to a message already present |
| `seen` | `{ thread, person, through }` | that person has now read up to that message id |

A `composing`/`start` is always followed by a `stop`, and usually — not always
— by a `message` from the same person. Someone may begin writing and think
better of it.

### Client → server

| `t` | payload | server's answer |
|---|---|---|
| `send` | `{ ref, thread, kind: "text", text }` | `sent` |
| `send` | `{ ref, thread, kind: "photo", src }` | `sent` |
| `react` | `{ thread, message, emoji }` | `reaction` broadcast back |

`ref` is any string you choose; it comes back on the `sent` frame so you can
match the answer to the send.

```jsonc
{ "t": "sent", "ref": "<yours>", "message": { /* full message, with its id */ } }
```

**The service does not echo your own message as a `message` frame.** It answers
once, with `sent`. `G6` says the app must not wait for it.

Text frames only — a photograph is sent as one of the `sendable` paths, never
as bytes.

### What the schedule does

Two kinds of events, both seeded.

**Unbidden**, at fixed offsets from connect: messages arriving in several
different conversations, including ones the app is not showing; reactions
attached to messages already in the history; `composing` before some of them;
`seen` from other people. The first lands a few seconds in and they continue
for several minutes.

**In answer to a send**: after you send into a conversation, that conversation
answers — `composing`/`start` shortly after, then a message. One conversation
is slow to answer on purpose, and takes several seconds; the rest are quick.
Which one is slow is stated in `GET /schedule.json`.

## 4. `GET /schedule.json` — for test drivers, not for the app

The full seeded plan: every unbidden event with its offset in milliseconds, and
the answer delays per conversation. It exists so an acceptance driver can wait
for a known event instead of sleeping.

**Do not read it from the application.** An app that knows what is coming is
not the app being asked for.

## 5. Self-test

```
node api/selftest.mjs --port=8330
```

Checks that the history is internally consistent (every `from` and every
`reactions[].person` is a participant, every `src` resolves, every `lastSeen`
exists, every voice clip's `peaks` length and `durationMs` agree with the file)
and that two runs at the same seed produce identical schedules. Run it before
you trust a measurement.
