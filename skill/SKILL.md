---
name: declare
description: Write programs in Declare, a language for user interfaces (.declare files). Use when writing, fixing, or reviewing .declare source, when building a UI in Declare from a spec, mockup, or screenshot, or when porting a UI to Declare from another framework.
---

# Writing Declare

Declare is a language for user interfaces. No LLM has been trained on it, and it
resembles React, CSS and HTML only on the surface: a rule carried over from them is the
surest way to be wrong.

Learning it comes first: the reading below. When there is a program to write, the work
then goes in this order: plan, check the plan against what Declare handles for you,
write, then check the program and look at it running.

## Read first, in order

1. **`docs/declare.md`** — the whole language: its forms, its rules, how a program fits
   together.
2. **Three guide chapters**: `docs/guide/01-what-declare-is.md`, how a Declare program
   works and the shape of a whole app; `docs/guide/04-structure.md`, where the records,
   the user's place, the views and any script each belong; and
   `docs/guide/05-run-and-check.md`, the working loop (run, read an error, check, debug).
3. **The calendar, whole** — `apps/calendar/calendar.declare`, with
   `docs/guide/27-calendar.md` beside it as its commentary. It is <!--stat:calendar.code-->501<!--/stat--> lines of code,
   and it shows a whole program in the grain Declare is designed for: a change of view is
   one assignment, and the screen follows it continuously and interruptibly, with no
   transition code. Read it for how the work divides — the events as a dataset class with
   their own rules, a drag as a class with no view, the user's place on the App, a model
   derived from both, classes for the things it has many of, four springs that every cell
   reads — and for records edited in place. Its month surface is a scene whose geometry is
   mapped through those springs, which is where hand-written `x` and `y` belong; an
   ordinary page's cards and rows are a layout's job (see the drift check).

Then stop reading. Everything else is read when you reach the part that needs it: every
read stays in your context for the rest of the session, so a read made early, or never
needed, is paid for again on every later turn.

If your context is summarized partway through a session, the summary keeps what you
did but not what you read. Read items 1 and 2 again before you write or review any
more Declare.

## Planning a program

**A spec, a mockup, or a program in another stack** says what the result should be, not
how to build it here. Take literally what a person experiences, the exact values (copy,
colors, sizes) and the stated requirements. Where it names a technique ("modal", "route",
"hover state"), ask what the technique is for and choose the Declare form that does
that. (`docs/operational/intake.md` covers this at length, for a large or unclear spec.)

Write the plan down before the first line of the program:

- **The data** — which datasets hold the records. One source of truth; everything a view
  shows is derived from it.
- **The state** — the few attributes that say where the user is (the selection, the mode,
  what is open), on the App.
- **The classes** — one per kind of thing the program has many of, or that is a thing in
  its own right.
- **The changes between states** — a row opens, a panel appears, a list reorders. Each can
  switch at once, or carry the view from one state to the other: the row grows, the panel
  slides in, the items travel. In Declare the second costs about the same to write, so it
  is an ordinary option wherever it helps a person follow what happened; which changes
  move is a design decision, not a rule.

Then check every need in the plan against
[What Declare handles for you](#what-declare-handles-for-you), below.

## What's where

- **The language** — `docs/declare.md`.
- **The guide** — `docs/guide/`, thirty chapters in numbered files. Below, a guide
  reference is the file and a section heading inside it: `16-collections.md` §
  Virtualization.
- **Links inside the docs** are written as symbolic `declare-docs:` addresses, not file
  paths; the docs site resolves them to its pages. Reading the files directly, take them
  this way: `declare-docs:guide:urls` is the guide chapter whose file ends in `-urls.md`
  (`docs/guide/19-urls.md`), and `@slug` after it names a section heading in it;
  `operational:<name>` is `docs/operational/<name>.md`; `spec:core` is
  `docs/declare.md`; anything else is a name to ask `npx declare-help` about, with its
  prefix dropped (`View.width` as it stands, `type:Motion` as `Motion`).
- **The reference** — every class, attribute, type, enum token and error code — is not a
  set of files: ask for a name with `npx declare-help <name>` (`Slider.value`,
  `scrollAnchor`, `DECLARE3005`). Ask before guessing — a guessed name is a compile error,
  and the widget you are about to build is often already in the library — and before
  deciding Declare can't do something. A miss exits 1; `--example` shows the name in
  the guide's working code.
- **Complete programs** — `apps/<name>/<name>.declare`, named below by their folder. Each
  opens with a comment on how it is put together, and the table below cites the class or
  App member to look at.
  - `calendar` — month, week, day and year as one surface that each view change carries
    continuously; events dragged between days and edited in a panel.
  - `tracker` — a million issues: a virtualized list, search as you type, filter and sort
    menus, editing through a draft, create and delete with undo, multi-select, keyboard
    shortcuts. It is <!--stat:tracker.code-->990<!--/stat--> lines of code; read it whole when your
    program is records at scale.
  - `weather` — one app in a phone design and a desktop design: drawn instrument cards in
    a masonry layout, a list row that becomes the city's page, a live clock.
  - `marketmap` — a treemap of a market over time: a data source with its own queries,
    layouts of its own, zoom and drill on springs, drawn sparklines.
  - `desktop` — a window system: windows as records, dragged, resized and minimized to a
    magnifying dock; a menu bar built from records; other programs running in its windows.
  - `birds` — a field guide and quiz whose whole state is its address: back, forward and
    deep links.
  - `sampler` — every library control, under four switchable themes.
  - `swatchbook` — everything a view can look like, one case at a time: type, rich text
    and whole documents, paint, effects, transforms, images, drawing. It is also the test
    that holds the renderers to the same picture.
  - `two-way` — three files rather than one: embedding both ways, a Declare app in an HTML
    page (`dial.declare`, `pulse.declare`) and a Declare app hosting other code
    (`crossings.declare`).

  The other folders in `apps/` are not models to copy: `docs`, `homepage` and
  `architecture` are Declare's own site, and the three `lzx-*` programs are faithful
  ports of 2003-era OpenLaszlo samples.
- **The library** — `library/`: the source of every library class, written in Declare like
  your program.
- **Running, checking and building** — `docs/operational/`.
- **Why the language is shaped as it is** — `docs/tenets/`.

The rest of the repository — `runtime/`, `compiler/`, `kernel/`, `tools/` and the others —
is how Declare itself is built, and is not part of writing a program in it.

## What Declare handles for you

Most of what an interface needs, Declare already does, and building it again by hand
is the most common way a working program ends up wrong. Find each need here before you
build it: the guide section that teaches it, a program that does it, and names to ask
`npx declare-help` about.

| Need | Guide (`docs/guide/`) | See it in | Ask about |
|---|---|---|---|
| Arranging views; sizes that follow content; one program for phone and desktop | `06-layout.md` | tracker: `SimpleLayout` and `padding` throughout; sampler: `Specimen extends Card`; weather: the App's `desk: State [ applied = { !app.phone } ]` | `SimpleLayout`, `ResponsiveLayout`, `Card`, `padding` |
| Scrolling panes; views that stay put while the page scrolls; what is on screen staying still when content above it changes; a log that follows its newest line | `07-scrolling.md` | weather: `HourStrip`'s `scroller` (`scrolls = x`), the App's `pill` and `back` (`ignoreScroll = true`); keeping the reader's place is the default, so the tracker's list has no code for it | `scrolls`, `ignoreScroll`, `scrollTo`, `scrollAnchor` |
| Buttons, fields, toggles; your own control, with keyboard, focus, hover and pressed built in | `08-controls.md`; `17-your-own-views.md` § View or Control | sampler: every library control; tracker: `Chip`, `Facet`, `RailStat`; calendar: `NavArrow` (each `extends Control`, with `press()`) | `Control`, `Button`, `TextInput`, `Segmented` |
| Dragging and dropping; keyboard shortcuts | `09-pointer-and-keyboard.md` § Dragging, § Keyboard events | calendar: `Ev` (`onPointerDown`, `onPointerUp`) and its `Drag` class; desktop: `Window`'s `beginDrag`; tracker: the App's `keys: Keys` | `onPointerDown`, `viewAt`, `Keys` |
| Touch: a drag inside a scrolling page, press and hold | `10-touch.md` § Gesture claims | calendar: `Ev`'s `onHold`; tracker: `IssueRow`'s `onHold` (opens the context menu) | `claim`, `onHold` |
| Themes, dark mode, a value every descendant reads | `11-paint-and-themes.md` | tracker: `theme Tracker`, the App's `theme = { … }` and `appear: AppearanceSwitch`; calendar: `theme CalendarLight` and `CalendarDark`; sampler: four themes | `theme`, `provided`, `AppearanceSwitch` |
| Text, fonts, styled runs, views inside a line, Markdown | `12-text.md` | swatchbook: the Type and Rich text sections; desktop: `ViewerWindow` (a Markdown document in a window) | `Text`, `Font`, `style`, `HTMLText`, `Markdown` |
| Images, video, audio | `13-media.md` | birds: `Plate`'s `pic: Image`; weather: `RowSky`'s `photo` | `Image`, `Video`, `Audio` |
| Where records live; a dataset with its own logic; a list derived from it that edits still write through; a job with no view | `14-data.md` § A Node class on a record, § Data in a whole app | tracker: the App's derived `shown: Dataset`; calendar: the App's `cal: Dataset`; desktop: `WinManager extends Node` and its `list` of window records | `Dataset`, `Dataset.contents`, `Node` |
| Data from a service: loading, failure, typed records | `14-data.md` § Where data comes from; `15-schemas.md` | tracker: `schema Issue` and `class Issues extends DataSource`; marketmap: `class Market extends DataSource` | `DataSource`, `schema` |
| Records edited in place; forms; a draft saved or cancelled | `14-data.md` § Writing a record, § Editing text, and forms | tracker: `EditorCard` (`text <-> :it.title`); calendar: `DetailSection` | `<->`, `TextInput`, `Editor.commitOn` |
| A long list: only the rows near the screen built, rows of different heights and kinds, a heading between records | `16-collections.md` | tracker: the App's `ListRow [ … virtualize = true, classFor = { … } ]` over `GroupRow` and `IssueRow`; desktop: the App's `wins` (a class per kind of window) | `virtualize`, `classFor`, `rowIndex`, `exists` |
| Drawing what attributes can't express: a gauge, a chart, an icon | `17-your-own-views.md` § Custom drawing, § Icons | weather (`weather-art.declare`): `WindDial`, `PressureGauge`; marketmap: `StageTile`'s sparkline | `draw`, `Draw`, `Icon` |
| A layout of your own | `17-your-own-views.md` § Writing a layout | weather (`weather-art.declare`): `MasonryLayout`; marketmap: `MarketLayout` | `Layout`, `place` |
| Menus, context menus and dialogs that close and hold focus correctly | `18-overlays.md` | tracker: the App's `sortMenu`, `facetMenu` and `ctx: ContextMenu`; sampler: `dlg: Dialog` | `Menu`, `ContextMenu`, `Dialog` |
| Addresses, back and forward, deep links | `19-urls.md` | birds: the App's `location` and `waypoint` and what derives from them | `location`, `waypoint` |
| Motion that can be interrupted and redirected; a view's states | `20-motion.md` | tracker: `ListRow`'s height spring; calendar: `DetailSection`'s spring; desktop: `DockIcon`'s `magSpring` | `Spring`, `State` |
| Clocks, a later call, one action when something changes | `21-time.md` | calendar: the App's `clock: Time [ tick = day ]`; tracker: `Toast` (`afterDelay`), the App's `trackChanges` and `onChange` | `Time`, `afterDelay`, `onChange` |
| A whole arrangement moving from one view to another; one view becoming the next | `22-animated-arrangements.md` | calendar: the App's four springs (`c0`, `r0`, `nc`, `nr`) that every cell reads; weather: `CityView`, carried by one spring (`openT`); marketmap: the App's `flight` and `zoomer` | `Spring`, `TweenLayout` |
| Another program inside yours; yours inside a page | `24-embedding.md` | desktop: `AppWindow`'s `island: AppIsland`; two-way: `crossings` — values go down with `provides`, come back up with the method `exposed(…)` (what the tenant `exposes`), and commands cross with `post` | `AppIsland`, `DOMIsland`, `provides`, `exposes`, `DOMIsland.exposed` |

The rows follow the guide's order. For anything else, each chapter opens with a `# ` title
that says what it covers.

## Drift check — before you write, and again once it works

A program can work and still be written in another framework's shape, which makes it
harder to change. Each of these means it has drifted; the guide section in parentheses
shows the Declare form.

- **A long `script` block.** Script is for pure helper functions and glue to a host or
  library API, and many programs have none. A long block usually means the program is being
  written in script rather than in Declare: data, state and logic belong in the tree as
  datasets, attributes, constraints and methods — on the App, or in a `Dataset` or `Node`
  subclass (`declare.md` §4). Two tells: color or font constants (a theme's job), and script
  that places views or times motion (constraints and springs). (`04-structure.md` § What
  script is for; `11-paint-and-themes.md` § Themes; `20-motion.md`)
- **Rebuilding what Declare does** — row heights measured by hand, a scroll position
  saved and restored, a window of rows computed from the scroll offset, a list's records
  copied into a second list to interleave headings. Each is already done for you.
  (`16-collections.md`; `07-scrolling.md` § Keeping the reader's place)
- **`as any` on your own data** — a cast to quiet the checker. Give that dataset a `schema`
  instead, and its values arrive typed. (`15-schemas.md`)
- **A flag set when data arrives** (`booted = true` in a callback) — derive it:
  `ready: boolean = { app.src.loaded }`. (`14-data.md` § Where data comes from)
- **Polling** — a `Time` firing every second to act every five, or a value recomputed on a
  timer that a constraint would recompute when its inputs change. Give the `Time` its
  period (`tick = 5000`) and let a constraint read what it depends on; per-frame work is for
  animation and physics. (`21-time.md`; `03-constraints.md`)
- **A list built by a loop** where a `datapath` ending in `[]` would replicate it. (One view
  created when the user asks for it, with `createView`, is fine.) (`14-data.md` § Datasets,
  cursors and paths)
- **Every kind of record in one row, the others hidden** (`visible = { :kind == … }`) — each
  kind is its own class, picked by `classFor`. (`16-collections.md` § Records of different
  kinds)
- **Something a person presses, built from a `View` with pointer handlers** — it is a
  control: use the library's, or subclass `Control` and put the action in `press()`;
  keyboard, focus and pressed and hover states come with it. (`08-controls.md`;
  `17-your-own-views.md` § View or Control)
- **Placing everything by hand.** A page's cards, rows and insets are a layout's job; `x` and
  `y` are for a diagram's scene or an overlay. Two tells: a container whose height is
  arithmetic over its children (it sizes from its content), and
  `x = { (parent.width - this.width) / 2 }`, which is `x = center`. (`06-layout.md`)

## Checking and looking

- **Check as you go** with `npx declare-verify app.declare`: it compiles and tests the
  program without a browser, in a second or two — syntax, names, types, and that it starts.
  Each error names its fix; apply exactly that, change nothing else, check again.
  (`docs/operational/verify.md`: scripted behavior and screenshot comparisons.)
- **Run it and look at milestones** — once the whole program first runs, and after a change
  to what people see — because a clean check does not mean it looks or behaves right:
  layout, fonts, paint and input exist only at run time. `npm start` serves a program at its
  file's path (`my-apps/app.declare` at `http://127.0.0.1:8200/my-apps/app.declare`).
  Without a browser of your own, `npx declare-look app.declare --size 390x844 --shot
  out.png` runs it headless and saves a screenshot; it can also click, drag, scroll, type
  and press keys, in the order you write them, read values, and switch to dark mode or
  touch (`--help` lists them). A screenshot you read stays in your context for the rest
  of the session, like any read, so look when there is something to see, not after every
  edit.
- **Before you hand it over, use it once as a person would.** Scroll a long list from end
  to end, drag its scrollbar, resize the window, switch to dark mode and to touch. A
  program can pass every check and still fail the first person who does one of these.
- **When it runs but is wrong**, don't re-read the source to guess: ask the running program
  why a value is what it is, which view is under a point, where a value came from
  (`05-run-and-check.md` § Debugging a running program; `docs/operational/introspection.md`).
