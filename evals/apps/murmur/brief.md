# Murmur — a conversation app

Build an application for reading and taking part in ongoing conversations.

**The first version of a consumer application** — small on purpose, and
finished on purpose. It has to meet a real interaction, design, and quality
bar: this is the sort of app someone opens forty times a day, on the phone in
their pocket, sitting on a home screen beside the messaging app they already
use and like, and it has to survive that comparison. The code will be assessed
alongside what it produces.

**Small does not mean rough.** Size and standard are independent here, and only
size is being relaxed. Everything that exists is held to §7.

The scope is exactly the eight things in §3. No sign-in, no settings, no
search, no notifications, no contact management, no feature you thought of that
is not on that list. **Reaching beyond the scope counts against you**, because
every hour spent widening it is an hour not spent finishing it.

Nor are you being asked for a hardened production build: no recovery from a
dropped connection, no offline mode, no persistence, no telemetry, no
empty-database first-run flow. The service is always there and the history is
always served.

What *is* being asked is that everything inside that narrow scope be finished
to the standard in §7, with none of the interesting parts left sketched in.
Build less than you might; finish what you build.

The people, the conversations, and their history already exist and are served
to you. New messages keep arriving while the app is open. Your job is the
experience of using it.

**The design is yours.** Nothing below says what anything should look like,
where it should sit, or how it should move. Those are the decisions being
asked of you, not decisions being withheld from you. Where this brief states a
requirement, it states an *end* — what must be true for someone using the app —
and never a means.

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
  other. Some conversations have more than two people in them.
- **Message** — one thing one person said, at one time. A message is written
  text, a photograph, or a recording of a voice.
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

## 4. Guarantees

These are the falsifiable claims. Each must hold for any design. **They are the
floor, not the bar** — see §7.

- **G1 — Authorship is never in doubt.** Who said a thing, and in what order
  things were said, is apparent without effort. This must hold in conversations
  with more than two people in them, and it must hold when consecutive messages
  come from the same person.
- **G2 — The conversation list is ordered by what is happening.** The
  conversation with the most recent activity comes first, and that ordering
  stays true as messages arrive — including while the person is looking at the
  list.
- **G3 — Returning to a conversation returns you to where you were**, not to
  the top and not to the bottom.
- **G4 — Reading history is not interrupted.** When a message arrives while the
  person is reading something further back, the words they are reading do not
  move.
- **G5 — Being current stays current.** When a message arrives while the person
  is looking at the most recent message, the new one comes into view.
- **G6 — Sending is never in question.** What was typed appears as a sent
  message immediately; the app does not appear to lose it, and does not wait on
  the service before showing it.
- **G7 — A reaction changes a message's size without disturbing what is being
  read.**
- **G8 — Photographs are of many shapes.** They range from tall to very wide.
  Every one is legible and undistorted, in the conversation and at full size,
  at every width the app supports.
- **G9 — A voice message declares itself.** Its length is apparent before it is
  played, its progress is apparent while it plays, and a point within it can be
  chosen directly.
- **G10 — Two shapes, one app.** The app is used both on a screen 390 units
  wide and on one 1440 units wide. Both are first-class. Neither is the other
  one stretched.

## 5. What the service does on its own

The feed is live and unbidden. While the app is open, and without anyone
touching it:

- messages arrive, in conversations that are open and in conversations that are
  not;
- people begin and stop composing, before some of their messages arrive;
- reactions are attached to messages already on screen;
- other people read what was sent to them.

All of it is deterministic for a given seed — the same run produces the same
events at the same moments — but the app is told nothing in advance. See
`api/API.md`.

## 6. Scenarios

The behaviour above, stated as things someone does. These are what acceptance
drives.

- **S1** Open the app. Every conversation is listed; those with unread messages
  are distinguishable from those without.
- **S2** Open the longest conversation. Its most recent message is what you see.
- **S3** Scroll back through several days of that conversation. Dates are
  apparent as you pass them.
- **S4** Open a conversation with more than two people. For every message, who
  said it is apparent.
- **S5** Leave a conversation part-way scrolled, open another, and come back.
  You are where you left off. *(G3)*
- **S6** Type and send text. It appears immediately as yours. *(G6)*
- **S7** After sending, someone begins composing, and shortly after that a
  reply arrives and comes into view. *(G5)*
- **S8** Scroll back into history in the conversation the service is slow to
  answer. A message arrives. What you are reading does not move, and you can
  tell something new is below. *(G4)*
- **S9** Attach a reaction to a message in the middle of the visible history.
  The message grows to hold it. What you are reading does not jump. *(G7)*
- **S10** Attach a reaction to a message that already has reactions on it,
  including one that already carries the mark you are attaching.
- **S11** Send a photograph from the ones offered. It appears as yours,
  undistorted. *(G8)*
- **S12** Open a very wide photograph at full size, then a very tall one. Both
  are legible; neither is cropped to unrecognisability nor stretched. *(G8)*
- **S13** Play a voice message. Its length was apparent before you played it;
  its progress is apparent as it plays. Move to a point two-thirds through and
  it plays from there. *(G9)*
- **S14** While in one conversation, a message arrives in a different one. The
  list reflects it, and the order changes. *(G2)*
- **S15** Do all of the above at 390 wide and at 1440 wide. *(G10)*

## 7. The standard

**An application can satisfy every guarantee in §4 and still read as
unfinished.** That outcome is a failure of this brief, so read this section as
carefully as that one.

The measure is not how much the app does — that was fixed at eight verbs. The
measure is whether the part that exists looks and behaves like someone finished
it. Someone should be able to use it for an hour without once thinking about
how it was made.

Concretely, and still as ends rather than means:

- **Nothing appears, vanishes, moves, or changes size in a way the eye cannot
  follow.** Things that are the same thing before and after a change should be
  recognisable as the same thing while it happens. This is the single largest
  difference between an application that feels made and one that feels
  assembled.
- **Everything that answers to touch answers at the moment it is touched**, not
  when the work behind it finishes.
- **The type is doing a job.** A hierarchy someone could describe out loud —
  not one size for everything, and not four sizes doing the same thing.
- **Space is a decision.** Uniform padding everywhere is the absence of a
  decision.
- **The states nobody puts in a demo are designed**: a conversation with one
  message in it; a name longer than the space it was given; a photograph still
  loading; the moment before anything has arrived.
- **The controls that do not come free are designed, not defaulted.** The
  voice scrubber in particular has no off-the-shelf answer, and how it looks
  and behaves at rest, while playing, and while being moved is a visible test
  of how much care went in.
- **Something in it should be a decision only you would have made.** A
  competent app that is indistinguishable from every other app is a middling
  result here, not a safe one.

Two failure modes worth naming, because both are common and both read as
unfinished immediately: motion that snaps between states instead of travelling
between them, and a layout that is uniform where it should be hierarchical —
every element given the same weight, so nothing tells the eye where to go.

## 8. What is being judged

Three things, separately.

**That it works** — the scenarios in §6, driven through the interface.

**How it feels to use** — §7. Continuity between states, the quality of motion,
typographic and spatial judgement, the design of the controls that do not come
free, and whether the two widths are two designs or one design and a casualty.
This is judged by someone using the application, at length, against the intent
you state below. There is no checklist for it, and a program that passes every
scenario while feeling unfinished has not done what was asked.

**The source** — read as a work sample, not scanned for style. How the motion
is expressed, how the two widths are expressed, and whether the shape of the
code follows the shape of the problem. A program that reaches the bar by
hand-building machinery around the language it is written in has said something
about the language, and that will be recorded.

## 9. What to deliver

1. **The application.**
2. **A design statement, no more than 300 words**, written as you build, in
   `DESIGN.md`. State what you were going for: the hierarchy, the motion idea,
   the type and spacing system, how the two widths differ and why, and the one
   decision in it you would defend. It will be read as a claim and checked
   against what you built — an idea you did not execute counts against you more
   than a modest idea executed well.
3. **The source, as a work sample.** It will be read. Ordinary, idiomatic,
   review-clean work in whatever you are writing — not the cleverest thing you
   can make run. If you find yourself building infrastructure, say so in
   `DESIGN.md` and say why nothing available would do.
