# The Venue — a brief

A season of performances is on sale. Build the thing a person uses to find one,
choose where to sit, and book it.

This brief says what should be true for the person using it, and how it should
feel to look at and to handle. Both count, and the second is the part most
likely to be done timidly. It does not say how to build any of it.

---

## 1. The season

About four thousand performances run from September through June, across three
halls of very different sizes. Each has a title, a date and time, a hall, and a
lowest price. Many titles recur; the same work plays dozens of times.

All of it — the season, the halls, the seats, the bookings — lives behind a
local service described in `api/API.md`. It is already written and already
running. You never write a server.

## 2. Finding a performance

Someone arrives knowing roughly what they want: a title, or a month, or nothing
at all. They should be able to see the season, search it by title, and narrow it
to one hall.

Four thousand is a lot of anything. Scrolling the season should feel like
scrolling a piece of paper, not like operating software — no waiting, no
stutter, no page buttons, no "load more". Searching should feel immediate.

The count of what is currently listed is always on screen. It reads exactly:

> **4,000 performances**

and, when a search or a hall narrows it, the number changes to match. One
performance reads `1 performance`.

## 3. Choosing seats

Picking a performance takes the person into that performance's hall, where every
seat in the house is laid out the way the house is laid out: sections, rows
within them, seats along each row.

Seats are chosen by picking them directly, and unchosen the same way. There is
no limit on how many somebody takes. A running summary of what they have chosen
is always visible while they have any, and reads exactly:

> **3 seats · $240**

with the count and the true total of the chosen seats' prices, which differ by
section. When nothing is chosen there is no summary to show.

Other people are buying at the same time. Seats will be taken while this person
is looking at them, and the room must not lie about what is still free.

## 4. Booking

Once seats are chosen, the person gives a name and an email address and
confirms. Nothing is charged and no payment details are ever requested.

A name and a well-formed email are both required, and the requirement should be
apparent *before* they try — saving should never be the thing that tells them
they got it wrong.

Two things can go wrong, and both are ordinary:

- The service refuses the booking. It says why, in a sentence. Show that
  sentence.
- Someone else took the seats first. The service says which, in a sentence —
  show that sentence as it is given, and the seats that were lost must not still
  be sitting in the person's selection as though they had them.

A booking that succeeds comes back with a confirmation code. The person sees it,
along with what they booked, and can start again for another performance.

## 5. How it should look and move

**This is the part that matters most.**

A ticketing app is the easiest thing in the world to make look like a database
with a form attached. Don't. This should be recognisable from a thumbnail with
the words blurred out, and it should be the kind of thing someone screenshots.

- **The house should read as a room, not as a grid of squares.** An auditorium
  has a shape — a stage everything faces, sections at different heights and
  prices, rows that are not all the same length. Someone glancing at it should
  know instantly whether the house is nearly full or nearly empty, and roughly
  where the good seats are, without reading a word.
- **The three states of a seat must be distinguishable with the legend covered.**
  Free, yours, and gone are the only three facts in the room; if a person has to
  consult a key to read them, the design has failed. Colour alone is not enough —
  assume someone cannot tell your two hues apart.
- **Choosing a seat should feel like something.** It is the one moment of
  commitment in the whole app. It should register — in the seat, and in the total.
- **Type carries the design.** At most two families. The scale between the
  things that matter and the things that merely accompany them should be
  dramatic rather than polite; weight, size and spacing should do the work that
  borders and boxes usually do.
- **Colour is earned.** One accent that means something — the person's own
  choices, most likely — rather than decoration. Mostly ink and paper with one
  thing speaking is better than five tones competing.
- **Something should travel when the season becomes a hall.** A person tapped a
  particular row and arrived somewhere; the two are related, and a cut throws
  that away. What travels is your decision.
- **The confirmation is an artifact, not a receipt page.** It is the thing they
  screenshot and show at the door. Treat it as designed rather than as a
  success message.

And the counterweight, equally part of the brief: **restraint.** Something that
moves for no reason is worse than something that doesn't move. Every effect
should be doing a job — showing that a value changed, that a surface is under
the hand, that this thing came from that one. Decoration for its own sake is a
failure of the brief, not a flourish.

## 6. On a phone, and at a desk

Both are the real thing. The phone is not a shrunken desktop and the desktop is
not a stretched phone — the same app, arranged for the room it is in. Nothing
important may depend on hovering, because on a phone there is no such thing,
and nothing should need pinching to read.

**Choosing a seat on a phone is the hard case, and the one to get right.** A
Grand Hall has seven hundred seats and a phone is 390 points wide; seats at true
scale would be four points across and unhittable. Solve it. Whatever you choose —
a way in, a way to move around the room, a different representation at small
sizes — the person must be able to pick the exact seat they mean, first time,
with a thumb, while standing up.

At a desk the whole house can be seen at once and the pointer is precise, so the
same task should be quicker and denser there. It is the same app and the same
data, not a second implementation.

## 7. Constraints

- **No payment flow.** No card fields, no billing address.
- **No server of your own** — the given service is the whole backend.
- **No accounts, no login, no persistence between sessions.**
- Prices are whole dollars, shown as `$240`.
- The copy quoted above — the performance count, the seat summary, the service's
  own sentences — appears as written.
- It works at a phone's width and at a desktop's, without a separate build.

## 8. What done looks like

Someone opens it, finds *Carmen* among four thousand performances, and is taken
into a hall they can read at a glance. They choose three seats scattered across
two sections — on a phone, with a thumb, without mis-tapping once — watch the
total come out right, put in a name and an email, and get back something they
would happily show at the door. And if one of their seats is gone by the time
they confirm, they find out in a way that leaves them able to carry on.

---

## Delivering it

Write the program as a single `.declare` file at `my-apps/venue.declare`. The
development server serves it at `http://localhost:8206/my-apps/venue.declare`.
The service runs separately, on port 8310.

Check your work in the browser — there is no phone or simulator here. Headless
Chrome will emulate one well enough to be useful: a narrow viewport, touch, a
device pixel ratio. That covers layout, reach, tap targets and touch routing. It
does not reproduce a real device's gesture arbitration, so build that part to be
right rather than expecting to prove it by test.
