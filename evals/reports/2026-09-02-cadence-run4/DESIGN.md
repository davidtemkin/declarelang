# Cadence — the design statement

Ink on warm paper, one vermilion, and two families with nothing polite between them.
The page is an editorial stack — a masthead, two hairline rules, and three bands — not a
grid of cards. There are no boxes and no borders around content anywhere in the app;
weight, size and spacing do that work. Six claims follow. Each is checkable by looking at
the running app at <http://localhost:8210/my-apps/cadence.declare>, and each names how.

---

### 1. The answer to *where am I* arrives before you decide to read it.

The week's volume is one sentence — **`4 sessions · 3h 40m`**, the brief's copy exactly —
typeset with the numerals as the hero and the words as connective tissue. Measured on the
running app: the largest number is **180px** at 1440×900 and **84px** on a 390pt phone,
against a smallest text of **10px** — a ratio of **18×** and **8.4×**, both well past the
six the brief asks for.

*Check it:* open the app and stand back. Then, if you want the numbers,
`node cadence-checks.mjs` runs inside `verify` and fails the build if that ratio drops
below 6 (see RUNNING.md, "Verify"). Blur the page and you can still read the week.

### 2. Colour is spent on one thing only: effort.

The palette is two neutrals and one vermilion. Nothing else in the app is coloured — not
sports, not sections, not states. A bar's ink runs quiet grey (effort 1) → full ink
(effort ~6) → vermilion (effort 10), so the hard sessions are the ones that shout out of
the year, and the same ramp fills the effort meter in the add sheet and tints a session's
title in its panel. **A hard session literally looks hard.** Sports are told apart
typographically (`RUN` `RIDE` `LIFT` `SWIM`), never by a second colour.

*Check it:* look at the year strip — the rust-brown bars are effort 8–9 and nothing else
in the frame is coloured. Open one and its heading takes the same tint; open a low-effort
one and the heading goes grey.

### 3. The year is something you handle, and it never waits for you to let go.

Two numbers — `camRight` (which day is at the right edge) and `camSpan` (how many days
are on screen) — are the whole camera. Every one of the ~250 bars, every month dateline,
the period label, the summary and the position rail are constraints reading those two
numbers, so a drag is arithmetic, not a redraw. Drag to push through the months; wheel or
pinch to pull it open; on a phone, a sideways thumb drag pans while a vertical swipe still
scrolls the page (`claim = x`). The surface tracks the hand: the springs behind the two
scalars stiffen to 2400 while a hand is on them and relax to 260 for programmatic moves,
so "Today" glides but a drag does not lag.

*Check it:* drag the strip and watch **`6 May – 5 Aug 2026`** and
**`60 sessions · 68h 6m · 1026.1 km`** change under your finger. `node touch.mjs` asserts
the pan, the pinch, and that a vertical swipe scrolls the page instead of dragging the year.

### 4. A tick *becomes* a block; it does not switch into one.

Pull the year open and each session's bar widens continuously until it can carry its own
writing — the sport and the duration fade up inside it as `openness` (a scalar derived from
`camSpan`, not a mode flag) rises from 0 to 1. There is no fortnight view and no month
view; there is one surface at every magnification, and every in-between frame is a real
layout.

*Check it:* scroll-zoom the strip slowly on the desktop. Around 45 days' span the labels
begin to appear; there is no threshold at which anything snaps.

### 5. Numbers travel.

Nothing that changes cuts to its new value. Every headline figure — the week's count and
total, the streak, and the period's sessions/hours/kilometres — is a spring on the value
itself, so adding a session sends the week's total *through* the intervening readings, and
the week's seven bars grow to their new heights. Nothing else in the app moves: there is no
decorative motion anywhere. The one thing that pulses is the live session's dot, and it
pulses to say *this is running*.

*Check it:* `node travel.mjs` adds a 90-minute ride and records the readings the hero
passes through on the way — e.g. `1h 24m → 1h 38m → 2h 15m → 2h 41m → 2h 48m → 2h 51m → …`
— then deletes it and watches it travel back.

### 6. Recording a session is confirming, not filling in — and nothing is typed.

The add sheet arrives already holding what you probably mean: the sport you have been doing
most lately, today's date, a duration at your median for that sport rounded to five
minutes, a distance derived from your own average pace for it, and your usual effort. Every
control is a tap — four sport chips, a date stepper, ±5 minutes, ±distance, a ten-step
effort meter whose hit box is the full column height. **The keyboard is never required**;
it appears only if you choose "add a note". The confirm button is 56pt tall, sits under the
thumb, and states exactly what it will save: `SAVE RIDE · 1H 40M · 41.3 KM`. Nothing
invalid is constructible — the date stepper will not go past today, the duration floors at
5 minutes, effort is 1–10 — so saving never tells you that you got it wrong; if the service
still refuses, its sentence appears directly above the button.

*Check it:* tap **+** on a phone-width window and count the taps to record yesterday's ride
— sport, date-back, save. `node touch.mjs` asserts that every tappable thing in the sheet
is at least 44pt tall.

---

## Two rooms, one tree

The desktop is not a stretched phone. At ≥1180pt the week's shape moves up beside the hero
sentence and the streak and the live session take the row beneath it; at 880–1180 the shape
drops below the sentence with the streak and the live session to its right; below 880 the
whole thing stacks and the page scrolls, with a 64pt round **+** in the thumb's arc
replacing the desktop's `ADD A SESSION` word. All three come from constraints on
`app.width`, not from a second implementation — and there is a keyboard layer for the desk
(`n` new · `←/→` push the year · `+/−` open and close it · `0` back to today · `Esc`).

## Type

Two families, and the scale between them is 18:1. **Antonio** (300/500/700) carries every
number and every heading; **Inter** (400/600) carries every word. The small text is
uppercase at 1.1–1.6px tracking, which is what lets a 10px label sit beside a 180px numeral
without either one apologising. Both are self-hosted in `my-apps/fonts/` — nothing is
fetched from a CDN at run time.

## What I chose, and what I gave up

- **The quoted line is one sentence in two sizes.** `4 sessions · 3h 40m` appears as
  written, in that order, on one line — but the numerals are set large and the words small.
  A single uniform run cannot be both the exact sentence and six times the smallest text at
  a phone's width; the words are unchanged, only their size varies.
- **Effort earns the accent, so sport does not.** The alternative — a colour per sport —
  would have put four tones on the year strip and made the brief's "one thing shouting"
  impossible.
- **Dark mode follows the system** and is a second full palette, not an inversion.
- **The live session takes the "latest" slot** while it is running, with the last finished
  session demoted to one tappable line beneath it.
