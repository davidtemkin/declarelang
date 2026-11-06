# The Venue — a brief

A season of performances is on sale. Build the thing a person uses to find one,
choose where to sit, and book it.

This brief says what should be true for the person using it. It does not say how
to build it — those decisions are yours.

---

## 1. The season

About four thousand performances run from September through June, across three
halls of very different sizes. Each has a title, a date and time, a hall, and a
lowest price. Many titles recur through the season; the same work plays dozens
of times.

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

Picking a performance takes the person to that performance's hall, where every
seat in the house is laid out the way the house is laid out: sections, rows
within them, seats along each row. It should be recognisable as a room, and it
should be obvious from looking which seats can be had and which cannot.

Seats are chosen by picking them directly, and unchosen the same way. A chosen
seat is plainly distinct from an unchosen one. There is no limit on how many
somebody takes.

A running summary of what they have chosen is always visible, and reads exactly:

> **3 seats · $240**

with the count and the true total of the chosen seats' prices, which differ by
section. When nothing is chosen there is no summary to show.

Other people are buying at the same time. Seats will be taken while this person
is looking at them, and the room must not lie about what is still free.

## 4. Booking

Once seats are chosen, the person gives a name and an email address and
confirms. Nothing is charged and no payment details are ever requested — this is
a hold on seats, not a checkout.

A name and a well-formed email are both required. Someone should not be able to
send an incomplete booking and be told off afterwards; the requirement should be
apparent before they try.

Two things can go wrong, and both are ordinary. Each is told plainly, in these
exact words:

- The booking is incomplete or the email is malformed. Caught before it is ever
  sent, so nobody is told off after the fact:

  > **Add a name and an email address.**

- Someone else took the seats first. The service says which, in a sentence —
  show that sentence as it is given. And the seats that were lost must not
  still be sitting in the person's selection as though they had them.

A booking that succeeds comes back with a confirmation code. The person sees it,
along with what they booked.

They can then start again for another performance.

## 5. Constraints

- **No payment flow.** No card fields, no billing address, no prices to pay
  beyond showing what the seats cost.
- **No server of your own.** The given service is the whole backend.
- **No accounts, no login, no persistence between sessions.**
- Prices are whole dollars, shown as `$240`.
- The copy quoted above — the performance count, the seat summary, the
  incomplete-booking sentence — appears as written; the service's own sentence
  is shown as the service words it.

## 6. What done looks like

A person can arrive, find *Carmen* among four thousand performances, see the
hall it plays in, choose three seats scattered across two sections, watch the
total come out right, put in a name and an email, and get back a code — and if
one of their seats is gone by the time they confirm, they find out in a way that
leaves them able to carry on.

---

## Delivering it

Write the program as a single `.declare` file. Put it at `my-apps/venue.declare`
and it will be served at `http://127.0.0.1:8200/my-apps/venue.declare` by the
development server (`npm start`). The fixture service runs separately, on port
8310.
