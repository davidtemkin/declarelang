# The Venue — a brief

*The Marriage of Figaro* plays twenty performances in the Grand Hall this season. Build
the thing a person uses to pick a performance, choose their seats, pay for them, and come
away with tickets they can show at the door.

This brief says what should be true for the person using it and how it should feel to
look at and to handle. It does not say how to build it. Most of it is what every shop
needs — an account, a card, an address — and ordinary is not the same as unconsidered:
the ordinary parts are where people give up and leave. It is important that this is a
truly polished, consumer-grade experience, on a phone and at a desk.

Everything — the performances, the hall, the seats, the accounts, the payments — lives
behind a local service described in `api/API.md`. It is already written and already
running. You never write a server.

---

## 1. Picking a performance

The person sees the twenty performances — date, time, the lowest price, and how full each
is — and picks one. Some are nearly sold out; that should be apparent before they pick.

## 2. Choosing seats

Picking a performance takes the person into the hall, where every seat in the house is laid
out the way the house is: a stage everything faces, four sections at different heights and
prices, rows within them that are not all the same length, seats along each row. Someone
glancing at it should know at once whether the house is nearly full or nearly empty, and
roughly where the good seats are, without reading a word.

Seats are chosen by picking them directly, and unchosen the same way. A seat has three
states — free, theirs, gone — and the three are distinguishable with any legend covered
and by someone who cannot tell your two colours apart. A running summary of what they have
chosen is always visible while they have any, and reads exactly:

> **3 seats · $240.00**

(**1 seat · $80.00** for one), with the count and the true total of the chosen seats' prices, which
differ by section.

Other people are buying at the same time. Seats will be taken while this person is looking
at them, and the room must not lie about what is still free. A seat they had chosen that
someone else takes leaves their choice, and they are told which.

## 3. Signing in — optional

Nobody needs an account to buy. Someone who has one can sign in at any time, including
halfway through paying, and nothing they have chosen or typed is lost by doing so.

Signing in is an email address and a password, and the password field behaves like one:
what is typed is hidden, the person can choose to see it, and the browser's password
manager recognises the form and offers to fill it and save it. A wrong password is
answered with the service's own sentence.

Signed in, the app knows who they are: their name and email fill in at checkout, their
saved billing address is used, and their saved cards are offered, each shown the way a
person recognises a card — its kind, its last four digits, its expiry. A saved card that
has expired is shown as expired and cannot be chosen. The session lives with the service:
reloading keeps them signed in, and signing out signs them out.

## 4. Paying

Tickets are delivered electronically; there is nothing to ship and no delivery address.

Checkout shows each seat with its price and booking fee, and the total, to the cent and
always agreeing.

**Paying with a saved card** asks only for that card's security code.

**Paying with a new card** asks for an email address (where the tickets are sent), the
name on the card, the card number, its expiry, its security code, and a billing address:
street (with an optional second line), city, postal code and country — the United States,
Canada or the United Kingdom.

The form helps rather than polices:

- The card number is grouped as it is typed, the way it is printed on the card, and its
  kind is recognised from its first digits and shown. A number that cannot be a card
  number is caught before the person tries to pay.
- The security code is three digits or four, according to the kind of card.
- An expiry in the past is caught, and so is a month that isn't one.
- The postal code is checked against the country's format.
- What is required is apparent before anyone tries. A field is not marked wrong while the
  person is still typing in it for the first time — only once they have left it, or tried
  to pay. Something that can be caught here never reaches the service.
- On a phone each field brings up the keyboard that suits it, and the browser's own card
  and address autofill works, as it does in any shop.

The pay button names the amount and reads exactly:

> **Pay $261.00**

Pressing it shows that payment is under way, and nothing the person does — a second
press, a double tap, Enter twice — sends a second payment.

Then one of these happens, and each is ordinary:

- **It is accepted.** See §5.
- **The card is declined**, or has insufficient funds. The service says so in a sentence;
  show it. Everything the person typed is still there except the security code, and they
  can try again or use another card.
- **One field is wrong** — the service says the security code or the postal code doesn't
  match. That field is marked with the service's sentence, and the person is taken to it.
- **A seat was taken** before the payment went through. The service names it in a
  sentence; show it. Nothing is charged, the lost seat leaves their choice, and they are
  back in the hall with the rest of their choice intact.

## 5. The tickets

A successful payment comes back with a confirmation code and one ticket per seat, each
with its own code to be scanned at the door, and a line saying where they were sent:

> **Sent to ada@example.com**

The tickets are the thing someone holds up at the door with a queue behind them: one at a
time, legible at arm's length, with the performance, the seat and when to arrive. Treat
them as designed, not as a success message. The person can then start again.

## 6. How it should look and move

A ticketing app is the easiest thing in the world to make look like a database with a
form attached. Don't. It should be recognisable from a thumbnail with the words blurred.

- **The hall reads as a room** (§2), not as a grid of squares.
- **Choosing a seat should register** — in the seat, and in the total. It is the one moment
  of commitment in the room.
- **Checkout is calm**: quiet, orderly, nothing competing with the fields, the seats being
  bought and the total never out of sight. A person should feel this place is careful with
  their card.
- **Type carries the design.** At most two families; weight, size and spacing do the work
  that borders and boxes usually do. Amounts line up. One accent colour, and it means
  something.
- **Restraint.** Something that moves for no reason is worse than something that doesn't.
  Every effect does a job: a value changed, this came from that, an error arrived at its
  field.

**Anyone can buy a ticket**, with the keyboard alone or with a screen reader. A seat says
where it is, what it costs and whether it is free; every field says what it is; every
error is announced and can be reached; focus is never lost after an action.

## 7. On a phone, and at a desk

Both are the real thing — the same app arranged for the room it is in. Nothing depends on
hovering, and nothing needs pinching to read.

**Choosing a seat on a phone is the hard case.** The Grand Hall has about six hundred and
fifty seats and a phone is 390 points wide; at true scale a seat is too small to hit.
Solve it: the person must be able to pick the exact seat they mean, first time, with a
thumb.

**Paying on a phone**: the field being typed in is never hidden behind the keyboard, the
next field is one step away, and the total and the pay button are in reach.

## 8. How it will be checked

Besides being looked at and used, the app will be driven by an automated test that finds
things the way a screen reader does — by role and accessible name — and checks what the
service is asked. So:

- Each seat's accessible name is its section, row and number, as **Orchestra, row C,
  seat 14**.
- Each field is named by its visible label, and the buttons by what they say.
- The service is at `http://127.0.0.1:8350`, as `api/API.md` says; nothing about it is
  cached between reloads.

## 9. Constraints

- **The scope is §1 to §5.** No account creation, password reset, order history, refunds
  or settings.
- **No server of your own**; card numbers go only to the service.
- Amounts read `$240.00`; dates `Fri 13 Nov`; times `7:30pm`.
- The copy quoted above, and the service's own sentences, appear as written. *Reads
  exactly* fixes the words and their order, not their size.

## 10. What done looks like

Someone on a phone picks Friday's performance, reads the hall at a glance, and chooses
three seats across two sections with a thumb, without a mis-tap. One is taken by someone
else while they decide; they see it go and choose another. At checkout they sign in
without losing a thing, their Visa ending 4242 is offered beside an expired card they
can't choose, they type the code, press *Pay $261.00* and are told the bank declined it.
They switch to a new card, watch the number group itself, mistype the postcode and are
told when they move on, fix it, and pay. Three tickets arrive, one at a time.

At a desk, someone with no account books two seats with the keyboard alone, and their
browser fills the card and the address.

---

## Delivering it

Write it idiomatically, following the platform's established best practices, as code that
other people will read and maintain. Use the ecosystem's established libraries where one
fits, as a maintainer would expect.

The service runs separately, on port 8350. It keeps the session in a cookie.

Check your work in the browser — there is no phone or simulator here. Headless Chrome
emulates one well enough to be useful: a narrow viewport, touch, a device pixel ratio. It
does not reproduce a phone's on-screen keyboard or a browser's autofill, so build those to
be right rather than expecting to prove them by test.
