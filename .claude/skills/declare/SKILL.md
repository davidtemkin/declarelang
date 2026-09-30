---
name: declare
description: Write programs in Declare — a domain-specific language for user interfaces. It is new and not in your training data; do not extrapolate from React, CSS, or HTML. Use when writing, fixing, or reviewing .declare source; when building a UI from a brief, spec, mockup, or screenshot; or when porting one from another framework.
---

# Writing Declare

Declare is a domain-specific language for user interfaces — you compose a tree of
views, set their attributes, bind them to data, and handle events. You will reach for
it where you'd reach for React, CSS, or HTML, but it is none of them: it is new, no model
has been trained on it, and the surest way to be wrong is to assume a rule from one of them
carries over. This file is not the language; it is the map. Take the small model below,
then the **brief** for your task (the index is below). If what you were handed is a spec, a mockup,
or an implementation in another stack, start at **Starting from a spec** — before you plan.

## The model

- A program is one tree of nodes: `App [ … ]` at the root, every child nested inside
  `[ ]`.
- Two brackets, two worlds. `[ ]` holds structure — a node's attributes and its
  children. `{ }` holds a TypeScript expression.
- A `{ }` value is a **constraint**: the runtime re-evaluates it whenever anything it
  reads changes, and keeps doing so. `width = { parent.width - 40 }` stays true on its
  own — you never subscribe, diff, or re-render. A handler assigns the facts that
  changed (`onClick() { count = count + 1 }`) and never their consequences; every
  constraint that reads them follows. That is the whole update model.
- `name = value` sets an attribute that already exists; `name: Type = value` declares a
  new reactive one.
- The outside world enters as **members**, not host calls: data through `Dataset` and
  `DataSource` (loading *and* saving), the clock through `Time`, a single later call
  through `afterDelay(ms, fn)`. A `{ }` body that names `fetch`, `setTimeout` or
  `globalThis` is refused, with the member named.

`docs/declare.md` is the entire language in this same voice — terse and complete. It is
the best single thing to read before writing anything real.

## Starting from a spec

A spec, a mockup, or an implementation in another stack is **testimony, not
instructions**. Take its **ends** (what a person should experience), **tokens** (values,
copy, colors) and **constraints** literally; treat its **means** ("modal", "route",
"hover state") as evidence of an end, and choose the form here; and treat its silences
as questions — for each change, ask what the user sees *travel*. Then restate it and
derive **data → states → views**, never screens first. `docs/operational/intake.md` is this
in full — read it before you plan.

## Writing it well

Idiomatic Declare looks unlike other frameworks; drifting back toward their shapes is the
main way it goes wrong. The brief `shape-of-an-app` shows them together in a working app.

- **Structure.** A class with no `extends` is a view; any other base is named
  (`extends Node`, `extends Dataset`, `extends Control`). Name a class for a part of the design, not only for reuse. State and
  logic can live on the App; when a group of it becomes a thing in its own right, it moves
  out — onto its document (`extends Dataset`) or into a `Node` subclass for machinery and
  shared rules. Split files with `include`. (shape-of-an-app)
- **Data.** Records live in a `Dataset` in the tree, loaded and saved through a `DataSource`;
  views bind to it and a handler writes `:field = v` — also on a row of a derived dataset that
  selects records, since it holds the source's own. A row's position is `rowIndex`; a
  field computed across records goes in a wrapper that holds the record (`{ ev: e, lane }`),
  never a copy. Summaries are **methods** feeding a
  derived `Dataset` with a `schema` — no `as any`, no wrapper class around the data.
  (lists-from-data, editing-records)
- **Kinds.** Records that are different things are different classes — `classFor` on the
  replicated view; what state a row is in is a `State`. (kinds-of-rows)
- **The look.** A repeated color, size or font list is a `theme` token read with
  `provided("theme")`; a repeated text voice is a `style` or a small class. (text-and-themes)
- **Controls.** Use the library. Anything that would be a button — anything a keyboard
  user must be able to reach and press: a tab, a chip, a delete mark — is a control even
  with no value: subclass `Control`, not `View`, and put the action in `press()` — focus,
  keyboard, `hot`/`down` and a non-selecting label come with it. A `View` with pointer
  handlers is for drag surfaces and dismissing scrims. (using-controls, your-own-control)
- **Layout.** Stacks and flows are layout classes; a layout owns what it places, or the
  child says `ignoreLayout`. (layout-and-sizing)
- **Continuity.** One view should become the next — a `Spring` or `Animator` on the
  attributes that change — not cut to a new screen. (motion, moving-arrangements)
- **`draw()`** for graphs, icons and treatments the tree can't express; watch frame rate on
  large surfaces. (drawing)

The shapes that mean you have drifted are the **drift check**, the last section of this file.
Read it immediately before you write code.

## Briefs — take the one for your task

Before writing, read the brief for what you are building: `npx declare-help brief <name>`,
or `docs/briefs/<name>.md`. Each is one task: a verified example, the rules that bite, the
names to look up, example code in the apps, and the guide sections behind it. Start with
`shape-of-an-app` before a whole program.

<!-- briefs:start -->
```
  shape-of-an-app       starting a program; where state, views and classes go
  lists-from-data       many of something from records; rowIndex, identity, derived lists
  editing-records       toggles, renames, forms, working copies
  kinds-of-rows         different things in one list (classFor) vs one thing in states (State)
  loading-and-saving    DataSource: fetch, auto, onLoad, failure, POST, schema
  derived-values        computed values: constraint vs formula, summaries as methods
  layout-and-sizing     layouts first, size per axis, padding and Card, reflow
  scrolling             scrollers, fixed chrome, following new content, scrollTo
  using-controls        the library's controls and the value pattern
  your-own-control      extends Control: press(), hot/down, focus, delivering a value
  pointer-and-drag      hover, press, click vs drag, touch claims, drop targets, pinch
  keyboard-and-focus    keys, shortcuts, focus order, focus traps
  motion                springs toward a target, animators, states, arrival
  moving-arrangements   a few sprung scalars driving a whole layout; TweenLayout
  overlays              menus, context menus, dialogs, tooltips
  urls-and-navigation   location, shows, links, deep links, back and forward
  time                  clocks, repeating jobs, afterDelay, one-time actions on change
  text-and-themes       theme tokens, dark mode, fonts, rich text, named styles
  drawing               draw(), icons, when attributes can't say it
  tables-and-selection  Table and DataGrid: selection as items, sorting, editable columns
  when-it-misbehaves    compiles but wrong: verify, explain, explainHit, the wake trace
```
<!-- briefs:end -->

**The guide** (`docs/guide/`) is the long form, one concept per chapter. A brief names the
sections worth reading; go there when a brief isn't enough, not first. `26-with-an-llm.md`
is written for an agent in particular, and `27-calendar.md` reads the flagship app end to
end.

**For an exact fact** — a name, a type, an enum's tokens, a diagnostic code — ask; it is
cheaper than reading, and a guessed name is a compile error:

```bash
npx declare-help Slider.value     # any dotted name, class, attribute, concept, enum, or code
```

A true miss exits 1, so silence is trustworthy. Ask before asserting the platform *can't* do
something: the real absences are curated answers there, not guesses. To see a name in real,
compiled code, add `--example` — the guide's shortest examples that use it, not a whole app.

**For the intentions behind the shape** — why the language is the way it is, when a choice
is a judgment call rather than a fact — `docs/tenets/`.

**To run, verify, or debug** — `docs/operational/`: `intake.md` to start from a spec,
`getting-started.md` to run, `verify.md` to check, `introspection.md` to question a
running program.

## The working loop

**Start from the spec** (above) when there is one, and write down the restatement — it is
what the last step checks against.

Write the complete program — the whole thing, not fragment by fragment — and run it
through the checker (`docs/operational/verify.md`). It reports every syntax and structure
error at once, and each diagnostic names its fix: apply exactly that, change nothing else,
and re-check.

When it compiles clean but behaves wrong, stop re-reading the source. A clean compile
means the checker found nothing — not that nothing is wrong: layout, fonts, paint, and
input routing don't exist until the program runs. Instead, **query the running program**.
Declare lets you ask a live program about itself in a structured way — why a value is what
it is, which view actually sits under a point, where each attribute's value came from — and it
answers as data you can act on. That reaches the two failures source-reading can't: a value
derived from something you didn't expect, and a press landing on a view you didn't expect.
See `docs/operational/introspection.md`.

Then close the loop: check the program back against the restatement. The checker proves it
is correct and introspection proves it behaves; neither can tell you it is the program the
spec asked for.

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
  `createView` is a sanctioned verb, and the library's menus build their `kind:` rows with it.)
- **An intermediate attribute whose only job is to force a re-derivation.**
- **A class wrapping a dataset in getters and verbs**, or a row sending its record's id to
  a method to change one field — the view binds the data and writes `:field = v`, on a
  projection too.
- **Every kind of record built into one row and the others hidden** (`visible = { :kind ==
  … }`) — each kind is its own class, picked by `classFor`.
- **Placing everything by hand.** A few `x`/`y` values place a diagram's scene or an
  overlay, and that is what `x`/`y` are for; a page's cards, rows and insets are a
  layout's job — stack them with `SimpleLayout`, express the narrow case as a
  `ResponsiveLayout` plan (`share: 0` drops a child) rather than a `narrow ? … : …`
  branch, and write a `Layout` subclass when the arrangement is your own. Two tells that
  you are already there: a container whose height is arithmetic over its children
  (`{ Math.max(a.height, b.height) + 44 }` — a container sizes itself from its content),
  and `x = { (parent.width - this.width) / 2 }`, which is `x = center`.
