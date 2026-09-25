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
- The outside world enters as **members**, not host calls: data through `Dataset` and
  `DataSource` (loading *and* saving), the clock through `Time`, a single later call
  through `afterDelay(ms, fn)`. A `{ }` body that names `fetch`, `setTimeout` or
  `globalThis` is refused, with the member named.

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

## Writing it well

Idiomatic Declare looks unlike other frameworks, and drifting back toward their
shapes is the main way it goes wrong. These are the judgments that keep it idiomatic:

- **Structure.** Subclass a component when a child grows too long to read, not only to
  reuse it — a class named for its role makes the tree read as the design. Put a model,
  a service, or any faceless coordinator in a `Node` subclass; don't hang everything
  off `App`. Split a large program across files with `include`. (ch. 5)
- **Data.** Records live in a `Dataset`, loaded and saved through a `DataSource` — its
  `loading` / `failed` drive the screen, its `onLoad()` does what follows a reply. A
  handler writes a record with `:field = v`. Summaries derived from the data (totals, a
  streak) are **methods** on the node that holds it, fed to a derived `Dataset` with a
  `schema`, so results arrive typed — no `as any`. (ch. 14)
- **The look.** A color, size or font list the app repeats is a token in a `theme`, read
  with `provided("theme")`; a repeated text voice is a `style` or a small class. Not
  `script` constants, not the same hex in five places. (ch. 11, 12)
- **Controls.** Use the library where appropriate; subclass `Control`, not `View`, for
  a custom control — focus, keyboard activation, roles and the pressed/hovered facts
  come with it; on bare `View` you rebuild them or ship without them. Don't forget
  hover and pressed states in your custom components. (ch. 8, 17)
- **Layouts are classes.** Use one for any stack or flow; write your own to arrange
  children as they and the space change. A layout owns the slots it places — let it,
  or set `ignoreLayout` on a child you place by hand. (ch. 6, 17)
- **Visual continuity.** Draw on your knowledge of high-polish native app UX to inform
  your interaction design in Declare. In the best native apps one view shifts or
  expands in place to become another; the user sees, visually, where they came from and
  where they're going. These idioms are easily implemented here with `Spring` and
  `Animator`. A click that cuts to a wholly new screen with nothing moving between is a
  sign you are underusing the language. (ch. 20, 22)
- **Use `draw()` for custom visuals** — graphs, iconography, treatments the tree can't
  style — integrated with the view; use it freely but measure frame rate as drawn
  surfaces grow large or change every frame. (ch. 17)

The shapes that mean you have drifted back toward another framework are listed as the
last thing in this file — the **drift check**. Read it immediately before you write code.

Chapter 1 makes the case behind every point here — the fastest way to internalize the
shift rather than pattern-match it.

## Going deeper — read what the task needs

Read the documentation a piece at a time; fetch the part your task calls for.

**The guide teaches the language**, one concept per chapter — read `docs/guide/` in order
to learn it, or jump to the chapter your task needs:

| your task touches | read |
|---|---|
| what an idiomatic app looks like — every layer, start to finish (read before writing one) | `docs/guide/01-what-declare-is.md` |
| program shape, `[ ]` vs `{ }`, member shapes, the top-level declarations | `docs/guide/02-notation.md` |
| a constraint that won't update; setter rules; the settle, `afterSettle`, `onReady` | `docs/guide/03-constraints.md` |
| running a program, reading errors, `declare-verify`, asking a running program | `docs/guide/04-run-and-check.md` |
| classes, model classes (`Node`), content-taking components, scope, `script`, `include` | `docs/guide/05-components.md` |
| layout, sizing, padding, `Card`, position, responsiveness | `docs/guide/06-layout.md` |
| scrolling, fixed chrome (`ignoreScroll`), `scrollTo` | `docs/guide/07-scrolling.md` |
| the standard library, the value pattern, text fields, keyboard focus | `docs/guide/08-controls.md` |
| hover / press / drag & drop, hit-testing (`viewAt`), clicks, keyboard | `docs/guide/09-pointer-and-keyboard.md` |
| touch, gesture ownership, pinch/wheel zoom | `docs/guide/10-touch.md` |
| paint, provided values, themes, dark mode | `docs/guide/11-paint-and-themes.md` |
| text, fonts, Markdown / HTMLText, named styles, views inside prose | `docs/guide/12-text.md` |
| images, video, audio | `docs/guide/13-media.md` |
| datasets, lists from data, writing records (`:field = v`, `:@`), models and derived summaries, loading and saving through `DataSource`, streams, forms | `docs/guide/14-data.md` |
| schemas — typed data, what the compiler and runtime check | `docs/guide/15-schemas.md` |
| big collections, `virtualize`, selection, `Table`, `DataGrid` | `docs/guide/16-collections.md` |
| your own control, `draw()`, icons, your own layout | `docs/guide/17-custom-components.md` |
| menus, dialogs, popovers, tooltips | `docs/guide/18-overlays.md` |
| deep links, the URL, `location`, `waypoint`, history, `onFollow`/`onArrive` | `docs/guide/19-urls.md` |
| springs, animators, states | `docs/guide/20-motion.md` |
| `Time` (the clock, a repeating job), `afterDelay`, and the rare `onChange` | `docs/guide/21-time.md` |
| whole arrangements moving as one — the sprung-scalar idiom, `TweenLayout` | `docs/guide/22-animated-arrangements.md` |
| the canvas renderer, the native Mac host, choosing a target | `docs/guide/23-renderers.md` |
| embedding — an app in a page, foreign DOM in an app, apps in apps | `docs/guide/24-embedding.md` |
| packaging (`declarec`), the `ship` block, crawler extraction | `docs/guide/25-packaging.md` |
| canonical formatting | `docs/guide/28-formatting.md` |
| the word for a thing — the language's own vocabulary, defined once | `docs/guide/29-glossary.md` |

(`docs/guide/` holds the full set; `26-with-an-llm.md` is written for an agent in
particular, and `27-calendar.md` reads the flagship app end to end.)

**For an exact fact** — an attribute's name, an enum's tokens, a flag, a diagnostic code,
a standard-library component — ask the help tool:

```bash
npx declare-help Slider.value     # any dotted name, class, attribute,
npx declare-help rotation         # concept, enum, or diagnostic code
```

It answers in the compiler's register, did-you-mean included — and for a thing that
deliberately does not exist it names the real door in one sentence (exit 0; a true
miss exits 1 and says what was searched, so silence is trustworthy). Treat
**capability claims** the same way as names: before asserting the platform cannot do
something, or that two features do not compose, ask — a limitation you infer from
resemblance to other frameworks is usually wrong here, and the absences that are real
are curated answers, not guesses. Its store is
`docs/declare-model.json` — the whole documentation corpus as one queryable structure,
the single authority for these details, so nothing here restates them. For a shape
the tool doesn't answer (bulk extraction, an unusual join), grep the model's `spine`
and `reference` rather than reading it whole.

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

## Drift check — read this immediately before writing code

Each of these means you have slipped back toward another framework's shape:

- **Long `script` blocks.** They are meant to hold pure functions and foreign glue — many
  programs have none. Two tells: color or font **constants** in script (a theme's job),
  and script functions computing over the app's data (a model's methods).
- **`as any` on your own data** — the dataset is missing a `schema`.
- **A flag you set to say data has arrived** (`booted = true` in a callback) — derive it:
  `ready: boolean = { app.src.loaded }`.
- **A `Time` that fires often and checks the clock** (`if (now % 5 == 0)`) — give it the
  period: `tick = 5000`.
- **Script that positions views or computes motion timing.** These should be constraints
  and springs.
- **Anything that runs every frame**, unless it is a physics or game loop.
- **Hand-building what data should replicate** — a list assembled by a loop where a
  `datapath` ending in `[]` would have made it. (Creating a view on command is fine:
  `createView` is a sanctioned verb, and the desktop opens its windows with it.)
- **An intermediate slot whose only job is to force a re-derivation.**
- **Placing everything by hand.** A few `x`/`y` values place a diagram's scene or an
  overlay, and that is what `x`/`y` are for; a page's cards, rows and insets are a
  layout's job — stack them with `SimpleLayout`, express the narrow case as a
  `ResponsiveLayout` plan (`share: 0` drops a child) rather than a `narrow ? … : …`
  branch, and write a `Layout` subclass when the arrangement is your own. Two tells that
  you are already there: a container whose height is arithmetic over its children
  (`{ Math.max(a.height, b.height) + 44 }` — a container sizes itself from its content),
  and `x = { (parent.width - this.width) / 2 }`, which is `x = center`.
