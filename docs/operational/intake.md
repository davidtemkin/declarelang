# Intake — starting from a brief

A brief, a mockup, or a working implementation in another stack is **testimony, not
instructions**. It records what someone wants, in the only vocabulary they had. This page is the first rung of
[the working loop](declare-docs:guide:run-check-ship) — what to carry over untouched, what to re-derive,
and what to supply that the brief could not ask for.

Run it before you plan. Its output is a short written restatement; the last step of the loop
checks the program back against it.

## The inversion

> Be **literal** where the brief is authoritative — values, copy, constraints, logic.
> Be **free** where it is merely idiomatic — structure, behavior, motion.

Left alone a model does the reverse: it reproduces the brief's shape faithfully and paraphrases
its content. Every failure below is a special case of that one.

## Sort every line

| kind | looks like | handling |
|---|---|---|
| **Ends** | "prevent double bookings", "feel like a 1970s terminal" | carry over whole — these are the requirements |
| **Tokens** | `#76FF7A`, a font name, 13px, room names, button copy | 1:1 into attributes; exact, fast, no interpretation |
| **Means** | "a booking modal", "toast", "admin panel", "grid layout" | **demote to evidence** — recover the end, then choose the house form |
| **Constraints** | "no payment flow", "nickname only, no email" | absolute; never creatively expand |
| **Absences** | nothing about how the detail arrives, how the month changes, what holds while data loads | the brief is silent because the source stack made it expensive — see [What travels](#what-travels) |
| **Noise** | two palettes; a section describing a different product | resolve explicitly, report in one line |

**On noise.** Briefs assembled by a model contradict themselves. Pick the reading that serves
the stated ends, apply it consistently, and say which you dropped. Averaging two palettes
produces something worse than either.

## Restate before you read twice

Write the **experience spec** — ends, tokens, constraints, resolved conflicts, named absences —
in your own words, *before* re-consulting the brief's organization. Then work from the
restatement. Fifteen lines is enough.

Then derive in this order:

1. **Data** — what exists, what it's shaped like, what changes.
2. **States** — the modes the app can be in ([reversible bundles](declare-docs:guide:motion-and-states)).
3. **Views** — arrangement derived from 1 and 2.

Never screens-first. A brief is always organized by screen, because that is how people picture
software; start there and you inherit the source stack's decomposition intact. Start from data
and states and the screens fall out as arrangements — which is how a month becomes a week
instead of swapping to one ([the calendar](declare-docs:guide:calendar)).

## Demote the vocabulary

Each of these words names a solution in another stack. None of them is a thing here.

| the brief says | it means | the house form |
|---|---|---|
| **modal** | focus on one thing, keep context | a state; the detail grows from what was clicked, interruptible, reversible |
| **page** / **route** | this content, not that | a state bound to the URL ([the loop](declare-docs:guide:run-check-ship)) — not a swapped subtree |
| **toast** | tell them it worked | a view whose presence and offset derive from a value; it travels in and out |
| **hover state** / **active state** | respond to the pointer | a scalar sprung 0↔1, with color, scale, and shadow derived from it |
| **loading spinner** / **skeleton** | something is happening | reserve the space, hold the frame still, derive content from data state |
| **component** | a reusable piece | a view class — and when the brief *enumerates* instances, find the data that generates them |
| **responsive breakpoint** | it should work small | constraints that were already true at every width; writing a breakpoint usually means something upstream was hard-coded |
| **transition** / **animation** | make it move | a spring on the value itself; motion is a consequence of the constraint, not a layer over it |

The [vocabulary in `declare-model.json`](declare-docs:reference:index) carries the exact names
once you know which thing you want. This table is for getting there.

## What travels

For every state change the brief describes, ask one question before writing it: **what does the
user see travel?**

If the answer is "it swaps," the continuous version is available and is usually *shorter*. Ask
it at intake, not at review — by review the discrete version exists and gets defended.

This is the step that acts on **Absences**. A brief will specify decorative motion (a blinking
cursor, a flicker) and say nothing about structural continuity, because in the stack it was
written for, decoration is cheap and continuity is senior-engineer work. Silence is not a
request for absence.

## Never silently drop

A specified visual property gets exactly one of three fates:

1. **realized**, or
2. **substituted** — and the substitution is named, or
3. **reported unavailable**.

Dropping it wordlessly is the failure. Uncertainty about whether an effect can be expressed
resolves *downward* by default, and the result is a flat interface that nobody chose. Check
[Style](declare-docs:guide:house-style) before deciding a thing cannot be said.

## By modality

| what you were handed | first move |
|---|---|
| **prose brief** | sort it (above); the gaps will be data and states |
| **screenshot / mockup** | read tokens and hierarchy off it, then say what it *does* — a static image specifies no behavior and no motion, and both are yours to derive |
| **an implementation in another stack** | extract the data model, the derived values, the user-visible states, the copy and tokens; discard component boundaries, effect wiring, memoization, and state synchronization |
| **a design system / token set** | tokens are Ends, not Means — bind them once at the root and derive |

**On porting.** In a React or Svelte source, most lines are plumbing for a problem this language
does not have: subscribing, diffing, memoizing, keeping two things in sync. A port that comes out
proportionally the same size has transliterated rather than translated. Expect it to be much
smaller, and treat "about the same length" as a finding.

## The gate

Before you call it done, scan your own source for the marks of a plan formed in another language:

- conditional presence where a **state** belonged
- anything shaped like an `isAnimating` guard
- coordinates that do not derive from anything
- a change where **nothing traveled**
- recomputation the cascade would have done for you

Each is countable, which makes this list a review instrument as well as a self-check.

Then check the program against the experience spec you wrote. [`verify`](declare-docs:operational:verify)
proves correctness and [introspection](declare-docs:operational:introspection) proves behavior;
neither can tell you the program is the one the brief asked for. That is what the restatement is
for, and it is the reason intake produces a written artifact rather than a frame of mind.

## What intake cannot do

It cannot supply judgment the brief never contained — an under-specified brief stays
under-specified, and the honest move is to name the gap in the restatement rather than invent
around it. It cannot settle a contradiction that is genuinely the author's to settle; it can only
make the choice visible. And a restatement the finished program then ignores is worse than none:
the closing check is not a formality, it is the only step in the loop that measures the program
against intent rather than against itself.
