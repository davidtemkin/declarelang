---
name: declare
description: Write programs in Declare — a domain-specific language for user interfaces. It is new and not in your training data; do not extrapolate from React, CSS, or HTML. Use when writing, fixing, or reviewing .declare source; when building a UI from a brief, spec, mockup, or screenshot; or when porting one from another framework.
---

# Writing Declare

Declare is a domain-specific language for user interfaces — you compose a tree of
components, set their attributes, bind them to data, and handle events. You will reach for
it where you'd reach for React, CSS, or HTML, but it is none of them: it is new, no model
has been trained on it, and the surest way to be wrong is to assume a rule from one of them
carries over. This file is not the language; it is the map. Take the small model below,
then read the one artifact your task needs. If what you were handed is a brief, a mockup,
or an implementation in another stack, start at **Starting from a brief** — before you plan.

## The model

- A program is one tree of components: `App [ … ]` at the root, every child nested inside
  `[ ]`.
- Two brackets, two worlds. `[ ]` holds structure — a component's attributes and its
  children. `{ }` holds a TypeScript expression.
- A `{ }` value is a **constraint**: the runtime re-evaluates it whenever anything it
  reads changes, and keeps doing so. `width = { parent.width - 40 }` stays true on its
  own — you never subscribe, diff, or re-render. Handlers only assign attributes
  (`onClick() { count = count + 1 }`), and every constraint that reads them follows. That
  is the whole update model.
- `name = value` sets an attribute that already exists; `name: Type = value` declares a
  new reactive one.

`docs/declare.md` is the entire language in this same voice — terse and complete. It is
the best single thing to read before writing anything real.

## Starting from a brief

A brief, a mockup, or a working implementation in another stack is **testimony, not
instructions** — it records what someone wants, in the vocabulary they had. Sort it before
you plan:

- **Ends** (what a person should experience), **tokens** (colors, type, copy, exact
  values), and **constraints** ("no payment flow") carry over whole and literally.
- **Means** — "modal", "route", "toast", "hover state", "breakpoint" — name solutions in
  another stack. Demote them to evidence: recover the end, then choose the form here.
- **Absences** are the part that matters. A brief says nothing about how a detail arrives
  or how a month changes, because where it was written that work is expensive. Silence is
  not a request for absence: for each change, ask what the user sees *travel*.

Be **literal** where the brief is authoritative — values, copy, constraints, logic — and
**free** where it is merely idiomatic — structure, behavior, motion. Left alone a model
does the reverse, and that inversion is the whole failure.

Then write the restatement, and derive in this order: **data → states → views**. Never
screens-first; a brief is organized by screen because that is how people picture software,
and starting there inherits the other stack's decomposition intact.

`docs/operational/intake.md` is this in full — the vocabulary table, the per-modality
first moves, and the checks.

## Going deeper — read what the task needs

Read the documentation a piece at a time; fetch the part your task calls for.

**The guide teaches the language**, one concept per chapter — read `docs/guide/` in order
to learn it, or jump to the chapter your task needs:

| your task touches | read |
|---|---|
| program shape, the two brackets | `docs/guide/02-two-brackets.md` |
| a constraint that won't update; setter rules | `docs/guide/03-relationships.md` |
| scope — `this` / `parent` / `classroot` / `app`, classes, composition | `docs/guide/04-tree.md` |
| layout, sizing, position, responsiveness, scrolling, fixed chrome (`ignoreScroll`) | `docs/guide/05-space.md` |
| color, type, borders, shadows, themes | `docs/guide/06-style.md` |
| hover / press / drag, clicks, keyboard | `docs/guide/07-interaction.md` |
| the standard library (buttons, inputs), the value pattern | `docs/guide/08-controls.md` |
| lists, datasets, editing data, loading documents | `docs/guide/09-data.md` |
| states, springs, animation | `docs/guide/10-motion-and-modes.md` |
| touch, gesture ownership, pinch/wheel zoom, `Frames` | `docs/guide/12-gestures.md` |
| deep links, the URL, run / verify / ship | `docs/guide/13-loop.md` |

(`docs/guide/` holds the full set; `14-with-an-llm.md` and `evals/declare-for-llms.md` are
written for an agent in particular.)

**For an exact fact** — an attribute's name, an enum's tokens, a flag, a diagnostic code,
a standard-library component — go to `docs/declare-model.json`. It is the whole
documentation corpus as one queryable structure (the reference, the vocabulary, the
standard library, even the guide and tenets); for a fact, grep its `spine` and `reference`
rather than reading it whole. It is the single authority for these details, so nothing
here restates them.

**For the intentions behind the shape** — why the language is the way it is, when a choice
is a judgment call rather than a fact — `docs/tenets/`.

**To run, verify, or debug** — `docs/operational/`: `intake.md` to start from a brief,
`getting-started.md` to run, `verify.md` to check, `introspection.md` to question a
running program.

## The working loop

**Start from the brief** (above) when there is one, and write down the restatement — it is
what the last step checks against.

Write the complete program — the whole thing, not fragment by fragment — and run it
through the checker (`docs/operational/verify.md`). It reports every syntax and structure
error at once, and each diagnostic names its fix: apply exactly that, change nothing else,
and re-check.

When it compiles clean but behaves wrong, stop re-reading the source. A clean compile
means the checker found nothing — not that nothing is wrong: layout, fonts, paint, and
input routing don't exist until the program runs. Instead, **query the running program**.
Declare lets you ask a live program about itself in a structured way — why a value is what
it is, which view actually sits under a point, where each slot's value came from — and it
answers as data you can act on. That reaches the two failures source-reading can't: a value
derived from something you didn't expect, and a press landing on a view you didn't expect.
See `docs/operational/introspection.md`.

Then close the loop: check the program back against the restatement. The checker proves it
is correct and introspection proves it behaves; neither can tell you it is the program the
brief asked for.
