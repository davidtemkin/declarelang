# Murmur — a conversation app

Build an application for reading and taking part in ongoing conversations.

**The first version of a consumer application** — small on purpose, and
finished on purpose. It has to meet a consumer-grade bar for interaction,
design and quality: this is the sort of app someone opens forty times a day, on
the phone in their pocket, sitting on a home screen beside the messaging app
they already use and like, and it has to survive that comparison.

**Small does not mean rough.** Size and standard are independent here, and only
size is being relaxed.

The scope is exactly the eight things in §3. No sign-in, no settings, no
search, no notifications, no contact management, no feature you thought of that
is not on that list. **Reaching beyond the scope counts against you**, because
every hour spent widening it is an hour not spent finishing it.

Nor are you being asked for a hardened production build: no recovery from a
dropped connection, no offline mode, no persistence, no telemetry, no
empty-database first-run flow. The service is always there and the history is
always served.

The people, the conversations and their history already exist and are served
to you. New messages keep arriving while the app is open. Your job is the
experience of using it.

**The design is yours.** Nothing below says what anything should look like or
where it should sit. Where this brief states a requirement, it states an *end*
— what must be true for someone using the app — and never a means.

---

## 1. The data

A conversation service supplies everything: the people, the conversations, the
message history, the photographs that can be sent, and a live feed of what
happens next. Its contract is `api/API.md`. Read it before you plan.

Nothing is persisted. When the app restarts, it restarts from the served
history — anything sent during a session is expected to be gone.

## 2. Nouns

- **Person** — a name, and usually but not always a picture of them.
- **Conversation** — two or more people, and everything they have said to each
  other.
- **Message** — one thing one person said, at one time: written text, a
  photograph, or a recording of a voice.
- **Reaction** — a small fixed mark one person attaches to one message. A
  message may carry several, from several people, and the same mark may be
  attached by more than one person.
- **Unread** — messages that have arrived in a conversation since the person
  using the app last looked at it.

## 3. Verbs

Someone using this app can:

1. See every conversation they are part of, and tell at a glance which have
   something new in them.
2. Open a conversation and read back through its history, however long it is.
3. Move to a different conversation and return to the first.
4. Send written text.
5. Send one of the photographs the service offers.
6. Attach a reaction to any message, their own or anyone else's.
7. Listen to a voice message, and move to a chosen point within it.
8. Look at any photograph in a conversation at its full size, and stop doing so.

## 4. What must be true

- Who said each thing, and in what order, is apparent without effort — in
  conversations of more than two people, and when one person sends several
  messages in a row. Dates are apparent when reading back through history.
- The conversation list is ordered by most recent activity, and stays so as
  messages arrive, including while someone is looking at it.
- Returning to a conversation returns you to where you were — not to the top,
  and not to the bottom.
- When a message arrives while someone is reading further back, the words they
  are reading stay put, and they can tell something new is below. When they are
  at the most recent message, the new one comes into view.
- What was sent appears as sent immediately; the app does not wait on the
  service before showing it.
- A reaction that makes a message larger does not disturb what is being read.
- Photographs range from tall to very wide. Every one is legible and
  undistorted, in the conversation and at full size.
- A voice message's length is apparent before it plays, its progress while it
  plays, and a point within it can be chosen directly.
- The app is used on a screen 390 units wide and on one 1440 units wide. Both
  are first-class; neither is the other one stretched.

## 5. What the service does on its own

While the app is open, and without anyone touching it: messages arrive, in
conversations that are open and in conversations that are not; people begin and
stop composing; reactions are attached to messages already on screen; other
people read what was sent to them. All of it is deterministic, but the app is
told nothing in advance. See `api/API.md`.

## 6. The standard

An application can satisfy everything in §4 and still read as unfinished. The
measure is not how much the app does — that was fixed at eight verbs — but
whether the part that exists looks and behaves like someone finished it.

- **The type is doing a job.** A hierarchy someone could describe out loud.
- **Space is a decision.** Uniform padding everywhere is the absence of one.
- **The states nobody puts in a demo are designed**: a conversation with one
  message in it; a name longer than the space it was given; a photograph still
  loading; the moment before anything has arrived.
- **The controls that do not come free are designed, not defaulted.** The voice
  scrubber in particular has no off-the-shelf answer.
- **Something in it should be a decision only you would have made.** A
  competent app indistinguishable from every other app is a middling result
  here, not a safe one.

## 7. What to deliver

1. **The application.**
2. **A design statement of no more than 150 words**, in `DESIGN.md`: what you
   were going for, and the one decision in it you would defend. It will be read
   against what you built.
3. **The source.** It will be read as a work sample. If you find yourself
   building infrastructure, say so in `DESIGN.md` and say why nothing available
   would do.

---

## Delivering it

Write it idiomatically, following the platform's established best practices, as code
that other people will read and maintain.

The service runs separately, on port 8330.

Check your work in the browser — there is no phone or simulator here. Headless
Chrome will emulate one well enough to be useful: a narrow viewport, touch, a
device pixel ratio. That covers layout, reach, tap targets and touch routing.
It does not reproduce a real device's gesture arbitration, so build that part to
be right rather than expecting to prove it by test.
