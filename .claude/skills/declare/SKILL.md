---
name: declare
description: Write Declare programs — a domain-specific language for user interfaces. It is new and not in your training data; do not extrapolate from React, CSS, or HTML. Use when writing, fixing, or reviewing .declare source.
---

# Writing Declare

Declare is a domain-specific language for user interfaces — you compose a tree of
components, set their attributes, bind them to data, and handle events. You will reach for
it where you'd reach for React, CSS, or HTML, but it is none of them: it is new, no model
has been trained on it, and the surest way to be wrong is to assume a rule from one of them
carries over. This file is not the language; it is the map. Take the small model below,
then read the one artifact your task needs.

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

## Going deeper — read what the task needs

Read the documentation a piece at a time; fetch the part your task calls for.

**The guide teaches the language**, one concept per chapter — read `docs/guide/` in order
to learn it, or jump to the chapter your task needs:

| your task touches | read |
|---|---|
| program shape, the two brackets | `docs/guide/02-two-brackets.md` |
| a constraint that won't update; setter rules | `docs/guide/03-relationships.md` |
| scope — `this` / `parent` / `classroot` / `app`, classes, composition | `docs/guide/04-tree.md` |
| layout, sizing, position, responsiveness | `docs/guide/05-space.md` |
| color, type, borders, shadows, themes | `docs/guide/06-style.md` |
| the standard library (buttons, inputs), hover / press / drag, keyboard | `docs/guide/07-interaction.md` |
| lists, datasets, editing data, loading documents | `docs/guide/08-data.md` |
| states, springs, animation | `docs/guide/09-motion-and-modes.md` |
| deep links, the URL, run / verify / ship | `docs/guide/11-loop.md` |

(`docs/guide/` holds the full set; `12-with-an-llm.md` and `evals/declare-for-llms.md` are
written for an agent in particular.)

**For an exact fact** — an attribute's name, an enum's tokens, a flag, a diagnostic code,
a standard-library component — go to `docs/declare-model.json`. It is the whole
documentation corpus as one queryable structure (the reference, the vocabulary, the
standard library, even the guide and tenets); for a fact, grep its `spine` and `reference`
rather than reading it whole. It is the single authority for these details, so nothing
here restates them.

**For the intentions behind the shape** — why the language is the way it is, when a choice
is a judgment call rather than a fact — `docs/tenets/`.

**To run, verify, or debug** — `docs/operational/`: `getting-started.md` to run,
`verify.md` to check, `introspection.md` to question a running program.

## The working loop

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
