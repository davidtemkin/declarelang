---
name: declare
description: Write programs in Declare, a language for user interfaces (.declare files). Use when writing, fixing, or reviewing .declare source, when building a UI in Declare from a spec, mockup, or screenshot, or when porting a UI to Declare from another framework.
---

# Writing Declare

Declare is a language for user interfaces. No model has been trained on it, and it
resembles React, CSS and HTML only on the surface: a rule carried over from them is the
surest way to be wrong.

**Read `docs/declare.md`, then start writing.** It is the whole language — its forms, its
rules, how a program fits together — but not the library or every pattern. A program of any
size will need more, and you are expected to look it up as you go.

## Read only what you need, when you need it

Read nothing else before you start. Every read stays in your context for the rest of the
session, so a read made early, or never needed, is paid for again on every later turn.

- **A name** — a class, attribute, type, enum token or diagnostic code:
  `npx declare-help <name>` (`Slider.value`, `scrollAnchor`, `DECLARE3005`). Ask before
  guessing — a guessed name is a compile error, and the widget you are about to build is
  often already in the library — and before deciding the platform can't do something.
  A miss exits 1; `--example` shows the name in compiled code.
- **How a kind of task is done well** — the brief for it, when you reach that part:
  `npx declare-help brief <name>`. Each is one task: a verified example, the rules that
  bite, where to look next.

<!-- briefs:start -->
```
  shape-of-an-app       starting a program; where state, views and classes go
  lists-from-data       many of something from records; rowIndex, identity, derived lists
  editing-records       toggles, renames, forms, working copies
  kinds-of-rows         different things in one list (classFor), states (State), parts only some rows have (exists)
  loading-and-saving    DataSource: fetch, auto, onLoad, failure, POST, schema
  derived-values        computed values: constraint vs formula, summaries as methods
  layout-and-sizing     layouts first, size per axis, padding and Card, reflow
  scrolling             scrollers, fixed chrome, keeping the reader's place, following the end, scrollTo
  using-controls        the library's controls and the value pattern
  your-own-control      extends Control: press(), hovered/pressed, focus, delivering a value
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

- **More depth** — only the guide section (`docs/guide/`) a brief names.
- **Real code** — the library in `library/`, complete programs in `apps/`.
- **Running and building** — `docs/operational/`.
- **Why the language is shaped as it is** — `docs/tenets/`. (`docs/system-design/` is the
  design record: background, not truth.)

## From a spec

A spec, a mockup, or a program in another stack says what the result should be, not how to
build it here. Take literally what a person experiences, the exact values (copy, colors,
sizes) and the stated requirements. Where it names a technique ("modal", "route", "hover
state"), ask what the technique is for and choose the Declare form that does that.
(`docs/operational/intake.md` covers this at length, for a large or unclear spec.)

## Changes between states

When the program moves between states — a row opens, a panel appears, a list reorders — it
can switch at once, or carry the view from one to the other: the row grows, the panel
slides in, the items travel. In Declare the second costs about the same to write as the
first, so it is an ordinary option, for where it helps a person follow what happened; which
changes should move is a design decision, not a rule. The motion and moving-arrangements
briefs show how.

## Checking and debugging

- **Check as you go** with `npx declare-verify app.declare`: it compiles and tests the
  program without a browser, in a second or two — syntax, names, types, and that it starts.
  Each error names its fix; apply exactly that, change nothing else, check again.
  (`docs/operational/verify.md`: scripted behavior and screenshot comparisons.)
- **Run it and look**, because a clean check does not mean it looks or behaves right —
  layout, fonts, paint and input exist only at run time. `npm start` serves it at its file's
  path (`http://127.0.0.1:8200/my-apps/app.declare`). Without a browser of your own,
  `npx declare-look app.declare --size 390x844 --shot out.png` runs it headless and saves a
  screenshot; it can also click, read a value, and switch to dark mode or touch.
- **When it runs but is wrong**, don't re-read the source to guess: ask the running program
  why a value is what it is, which view is under a point, where a value came from. The
  when-it-misbehaves brief shows how.

## Drift check — read this just before you write code

A program can work and still be written in another framework's shape, which makes it
harder to change. Each of these means it has drifted; the brief in parentheses shows the
Declare form.

- **A long `script` block.** Script is for pure helper functions and glue to a host or
  library API, and many programs have none. A long block usually means the program is being
  written in script rather than in Declare: data, state and logic belong in the tree as
  datasets, attributes, constraints and methods — on the App, or in a `Dataset` or `Node`
  subclass (`declare.md` §4). Two tells: color or font constants (a theme's job), and script
  that places views or times motion (constraints and springs). (shape-of-an-app,
  text-and-themes, motion)
- **`as any` on your own data** — the dataset needs a `schema`. (loading-and-saving)
- **A flag set when data arrives** (`booted = true` in a callback) — derive it:
  `ready: boolean = { app.src.loaded }`. (loading-and-saving)
- **Polling** — a `Time` firing every second to act every five, or a value recomputed on a
  timer that a constraint would recompute when its inputs change. Give the `Time` its
  period (`tick = 5000`) and let a constraint read what it depends on; per-frame work is for
  animation and physics. (time, derived-values)
- **A list built by a loop** where a `datapath` ending in `[]` would replicate it. (One view
  created when the user asks for it, with `createView`, is fine.) (lists-from-data)
- **Every kind of record in one row, the others hidden** (`visible = { :kind == … }`) — each
  kind is its own class, picked by `classFor`. (kinds-of-rows)
- **Something a person presses, built from a `View` with pointer handlers** — it is a
  control: use the library's, or subclass `Control` and put the action in `press()`;
  keyboard, focus and pressed and hover states come with it. (using-controls,
  your-own-control)
- **Placing everything by hand.** A page's cards, rows and insets are a layout's job; `x` and
  `y` are for a diagram's scene or an overlay. Two tells: a container whose height is
  arithmetic over its children (it sizes from its content), and
  `x = { (parent.width - this.width) / 2 }`, which is `x = center`. (layout-and-sizing)
