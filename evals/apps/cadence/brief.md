# Cadence — a brief

A training log for someone who runs, rides, lifts and swims. Build the thing
they open in the morning to see where they are, and open again after a session
to put it in.

This brief says what should be true for the person using it, and how it should
feel to look at. It does not say how to build any of it.

---

## 1. The material

Fourteen months of sessions — a few hundred of them — behind the local service
described in `api/API.md`. Each session has a date, a sport, a duration, an
effort from 1 to 10, an average heart rate, sometimes a distance, and sometimes
a note. Lifting sessions have no distance. Some weeks are empty.

Occasionally a session is **in progress**: the service reports one that started
and hasn't finished, and keeps reporting its elapsed time and heart rate while
it runs.

## 2. Today

The first thing on screen answers *where am I*, at a glance, from across the
room:

- **This week** — how much has been done. It reads exactly:

  > **4 sessions · 3h 40m**

- **The streak** — consecutive days with a session, reading exactly `12 days`,
  or `no streak` when there isn't one.
- **The week's shape** — seven days, each showing how much was done that day,
  so a light week and a heavy one are told apart without reading a number.
- **The last session** — what it was, when, and how it went.

If a session is in progress, this is where it lives, and it is unmistakably
*running* rather than finished.

## 3. The year

All fourteen months as one continuous surface — effort or duration over time,
however you think it reads best.

It is something the person **handles**, not a picture they look at: they push it
left and right through the months, and they pull it open to see a fortnight in
detail or squeeze it shut to take in a season. It should stay with the hand the
whole time, and never wait for them to let go before responding.

Whatever period is on screen, the app says what it is looking at and what
happened in it.

## 4. A session

Picking a session shows what it was: sport, date, duration, distance where there
is one, effort, average heart rate, the note if it has one — and where it sits
against everything else. A hard session should look hard.

## 5. Adding one

The person can record a session that already happened: sport, date, how long,
how far, how it felt. It joins the history, and everything derived from the
history — this week, the streak, the week's shape, the year — is immediately
true of it. Nothing is stale and nothing needs a refresh.

They can also correct or delete one.

## 6. How it should look

**This is the part that matters most, and the part most likely to be done
timidly.**

The app should be recognisable from a thumbnail with the numbers blurred out. It
should not read as a settings screen, a generic dashboard, or a form with a
chart bolted on.

- **The numbers are the hero.** The largest number on a screen is at least
  **six times** the size of the smallest text on that same screen. Big enough
  that the answer arrives before you've decided to read it.
- **Type carries the design.** At most two families, and the scale between them
  dramatic rather than polite. Weight, size and spacing should be doing the work
  that borders and boxes usually do.
- **Colour is earned.** One accent that *means* something — effort, sport,
  whichever you choose — rather than decoration. A screen that is mostly ink and
  paper with one thing shouting is better than five competing tones.
- **Numbers travel.** When a figure changes because something was added or the
  period moved, it moves to its new value rather than cutting to it.
- **It is for glancing at.** Someone checking in for four seconds should leave
  with the answer. Depth is available underneath; it is not in the way.

And the counterweight, which is equally part of the brief: **restraint**.
Something that moves for no reason is worse than something that doesn't move.
Every effect should be doing a job — showing that a value changed, that a
surface is under the hand, that this thing came from that one. Decoration for
its own sake is a failure of the brief, not a flourish.

## 7. On a phone, and at a desk

Both are the real thing. The phone is not a shrunken desktop and the desktop is
not a stretched phone — the same app, arranged for the room it is in.

It is used one-handed in a gym, standing up, mid-conversation, and it is used at
a table with a big screen and a mouse. Neither should feel like the compromise.
Nothing important may depend on hovering, because on a phone there is no such
thing; and nothing should need pinching to read.

**Adding a session on a phone is the case to get right.** Someone has just
finished; they want it recorded before they've left the building. That should
take a few seconds and a few taps.

- The keyboard is the most expensive thing you can ask for. Anything that could
  be a choice, a step, or a nudge should not be typing.
- What they are most likely to mean should already be there — today's date, the
  sport they always do at this hour, a duration near what they usually do — so
  the common case is confirming rather than filling in.
- Everything they must touch should be reachable with a thumb, and big enough to
  hit without looking carefully.
- It should be obvious at every moment what remains before it can be saved, and
  saving should never be the thing that tells them they got it wrong.

On a desk, the same task can be denser and quicker for someone with a keyboard —
but it is the same app and the same data, not a second implementation.

## 8. Constraints

- **No accounts, no login, no settings screen.**
- **No server of your own** — the given service is the whole backend.
- Durations read as `3h 40m` and `45m`; distances as `12.4 km`; heart rate as
  `148 bpm`.
- Dates are the person's own — no timezone cleverness required.
- The copy quoted above appears as written.
- It works at a phone's width and at a desktop's, without a separate build.

## 9. What done looks like

Someone opens it on a Monday morning, sees in one glance that last week was four
sessions and three hours forty, that they are twelve days into a streak, and
that Thursday was the big one. They push back through the autumn to find the
month they were training hardest, pull it open, and land on a session from
October — a 14 km run at effort 8. They come back to today, add yesterday's ride
that they forgot to log, and watch the week's total and the streak both move to
take it in.

Later, standing in the gym with one hand on a phone, they finish a session and
record it in about five seconds — a couple of taps and a confirm, no keyboard
unless they want to leave a note.

---

## Delivering it

Write the program as a single `.declare` file at `my-apps/cadence.declare`. The
development server (`npm start`) serves it at
`http://localhost:8200/my-apps/cadence.declare`. The service runs separately, on
port 8320.

Check your work in the browser — there is no phone or simulator here. Headless
Chrome will emulate one well enough to be useful: a narrow viewport, touch, a
device pixel ratio. That covers layout, reach, tap targets and touch routing.
It does not reproduce a real device's gesture arbitration, so build that part to
be right rather than expecting to prove it by test.
