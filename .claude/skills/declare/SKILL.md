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
write, then check the program and look at it running — and when a whole program was
built to a brief, have a checker test it against the brief before you hand it over
(§ Checking and looking).

## Read first, in order

1. **`docs/declare.md`** — the whole language: its forms, its rules, how a program fits
   together.
2. **Three guide chapters**: `docs/guide/01-what-declare-is.md`, how a Declare program
   works and the shape of a whole app; `docs/guide/04-structure.md`, where the records,
   the user's place, the views and any script each belong; and
   `docs/guide/05-run-and-check.md`, the working loop (run, read an error, check, debug).
3. **The to-do app, whole** — `apps/todo/todo.declare` and the parts it includes,
   `apps/todo/todo-parts.declare`, read together: <!--stat:todo.codeWithParts-->848<!--/stat--> lines of code, with
   comments written for a first reader. It is a familiar program written in the grain
   Declare is designed for, one program for phone and desktop. Read it for how the work
   divides — the tasks as a dataset class that makes every write, the user's place on the
   App (`location`, what is open, what is being added), the list derived from both as lines
   of more than one class, a row that opens in place and travels when its group changes —
   and for what comes with the language rather than being built: layout that follows
   content, swipes, a drawer, a sheet and a popover, search, menus, shortcuts and undo,
   two themes.

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
- **The guide** — `docs/guide/`, thirty-one chapters in numbered files. Below, a guide
  reference is the file and a section heading inside it: `16-collections.md` §
  Virtualization.
- **Links inside the docs** are written as symbolic `declare-docs:` addresses, not file
  paths; the docs site resolves them to its pages. Reading the files directly, take them
  this way: `declare-docs:guide:urls` is the guide chapter whose file ends in `-urls.md`
  (`docs/guide/20-urls.md`), and `@slug` after it names a section heading in it;
  `operational:<name>` is `docs/operational/<name>.md`; `spec:core` is
  `docs/declare.md`; anything else is a name to ask `npx declare-help` about, with its
  prefix dropped (`View.width` as it stands, `type:Motion` as `Motion`).
- **The reference** — every class, attribute, type, enum token and error code — is not a
  set of files: ask for a name with `npx declare-help <name>` (`Slider.value`,
  `scrollAnchor`, `DECLARE3005`). Ask before guessing — a guessed name is a compile error,
  and the widget you are about to build is often already in the library — and before
  deciding Declare can't do something. A miss exits 1; `--example` shows the name in
  the guide's working code.
- **Complete programs** — each opens with a comment on how it is put together, and the
  table below cites the class or App member to look at. Beyond the to-do app, read a
  program by its parts, not whole: its header, then `npx declare-help map <file>`, which
  lists each class and App member with its lines and what it is, and the parts your plan
  needs. Find the one nearest what you are building:
  - **A list of things to tick off, on phone and desktop** — tasks, reminders, a reading
    list. → `apps/todo/todo.declare` with `todo-parts.declare`, read first (above).
  - **Records people list, search, filter and edit** — most applications: issues, mail,
    tickets, listings, transactions, a catalog. → `apps/tracker/tracker.declare`, ten
    thousand records and a million on demand: one dataset class holds them and makes every
    write; the list is a dataset derived from it, virtualized, with headings as a second
    row class; editing through a draft; menus, shortcuts, undo. It is
    <!--stat:tracker.code-->982<!--/stat--> lines of code, and worth reading whole.
  - **A surface over time, or things dragged between places** — a schedule, a timeline, a
    board, a grid you zoom from years to a day (to pan and zoom a surface about the
    fingers — drag, pinch, trackpad, wheel — see `10-touch.md` § Pan and zoom about the
    fingers). → `apps/calendar/calendar.declare`, with
    `docs/guide/28-calendar.md` beside it as its commentary: a change of view is one
    assignment, and the screen follows it continuously, with no transition code. The
    events as a dataset class with their own rules, a drag as a class with no view, four
    springs that every cell reads, records edited in place. Its month surface is a scene
    whose geometry is mapped through those springs, which is where hand-written `x` and
    `y` belong; an ordinary page's cards and rows are a layout's job (see the drift
    check). It is <!--stat:calendar.code-->540<!--/stat--> lines of code.
  - **Status to take in at a glance, on phone and desktop alike** — conditions, a dashboard
    of instruments, a list whose rows open into pages. → `apps/weather/weather.declare` and
    its drawn instruments in `weather-art.declare`: one program in two designs, a row that
    grows into a page on one spring, swipe paging, a masonry layout of its own.
  - **Data drawn and changing, zoomed into** — charts, a map of many tiles, values
    scrubbed through time. → `apps/marketmap/marketmap.declare`: a data class that answers
    queries, a layout of its own that reshapes as a sprung value moves, zoom and drill on
    springs, drawn sparklines.
  - **Pages with addresses, or steps in a sequence** — a guide or gallery whose pages can
    be linked, a quiz or lesson where Back undoes a step. →
    `apps/birds/birds.declare`: `location` for the page you could hand a stranger,
    `waypoint` for each step, links throughout, a picture that flies from its tile to its
    page and back.
  - **A content site** — a landing page, documents, a long article. →
    `apps/homepage/homepage.declare`: sections in one column, documents fetched as Markdown
    at their own addresses, a header and nav built from records, a narrow-screen sheet,
    embedded live programs (`live.declare`); `apps/architecture/architecture.declare`: a
    long article with live figures, standalone or hosted inside another page.
  - **Objects people move and resize on a surface; windows** — a canvas, a board of
    cards, a window system. → `apps/desktop/desktop.declare`, the largest program, best
    read a class at a time: windows as records whose order is their stacking, drag and
    resize, a window manager and launcher as classes with no view, menus and shortcuts
    from one set of records, other programs running in windows.
  - **Another library's widget inside your program** — a map, a video player, a code
    editor, a chart library. → `apps/two-way/crossings.declare` hosts two plain-JavaScript
    apps in `DOMIsland`s: values go down with `provides`, come back with `exposed(…)`, and
    commands cross with `post`. (`dial.declare` and `pulse.declare` are the other
    direction: Declare programs inside an HTML page.)

  Two programs are references rather than models: `apps/sampler` shows every library
  control under four themes, and `apps/swatchbook` shows everything a view can look like,
  one case per card: look a control or an appearance up there to see it rendered and how
  it is spelled.

  `apps/games/` holds games, which are not typical Declare programs. Three of them,
  `asteroids`, `stargate` and `tempest`, are written to mimic the classic arcade games
  exactly, and are not models of how to write Declare. The fourth, `vortex`, is
  structured more typically.
- **The library** — every library class is written in Declare, in `library/`. Look a class
  up with `npx declare-help`, not in its source: the reference is the place for what a class
  does and takes. Read the source as a model when you write a control or a layout of your
  own (`17-your-own-views.md`).
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
| Arranging views; sizes that follow content; one program for phone and desktop; a view that changes with where the user is | `06-layout.md`; `04-structure.md` § A view in each of the user's places | tracker: `SimpleLayout` and `padding` throughout; sampler: `Specimen extends Card`; weather: the App's `desk: State [ applied = { !app.phone } ]` | `SimpleLayout`, `ResponsiveLayout`, `Card`, `padding`, `State` |
| Scrolling panes; views that stay put while the page scrolls; what is on screen staying still when content above it changes; a log that follows its newest line | `07-scrolling.md` | weather: `HourStrip`'s `scroller` (`scrolls = x`), the App's `pill` and `back` (`ignoreScroll = true`); keeping the reader's place is the default, so the tracker's list has no code for it | `scrolls`, `ignoreScroll`, `scrollTo`, `scrollAnchor` |
| Buttons, fields, toggles; your own control, with keyboard, focus, hover and pressed built in | `08-controls.md`; `17-your-own-views.md` § View or Control | sampler: every library control; tracker: `Chip`, `Facet`, `RailStat`; calendar: `NavArrow` (each `extends Control`, with `press()`) | `Control`, `Button`, `TextInput`, `Segmented` |
| Dragging and dropping; keys; keyboard shortcuts | `09-pointer-and-keyboard.md` § Dragging, § Keyboard events, § Keyboard shortcuts | calendar: `Ev` (`onPointerDown`, `onPointerUp`) and its `Drag` class; desktop: `DeskWindow`'s `beginDrag`, and its menu bar's records, whose `key:` fields are the program's shortcuts | `onPointerDown`, `viewAt`, `Keys`, `Shortcuts` |
| Touch: a drag inside a scrolling page, press and hold; a surface panned and zoomed about the fingers (pinch, drag, wheel) | `10-touch.md` § Gesture claims, § Pan and zoom about the fingers | calendar: `Ev`'s `onHold`; tracker: `IssueRow`'s `onHold` (opens the context menu) | `claim`, `onHold` |
| Themes, dark mode, a value every descendant reads | `11-paint-and-themes.md` | tracker: `theme Tracker`, the App's `theme = { … }` and `appear: AppearanceSwitch`; calendar: `theme CalendarLight` and `CalendarDark`; sampler: four themes | `theme`, `provided`, `AppearanceSwitch` |
| Text, fonts, styled runs, views inside a line, Markdown | `12-text.md` | swatchbook: the Type and Rich text sections; desktop: `ViewerWindow` (a Markdown document in a window) | `Text`, `Font`, `style`, `HTMLText`, `Markdown` |
| Images, video, audio | `13-media.md` | birds: `Plate`'s `pic: Image`; weather: `RowSky`'s `photo` | `Image`, `Video`, `Audio` |
| Where records live; a dataset with its own logic; a list derived from it that edits still write through; a job with no view | `14-data.md` § A Node class on a record, § Data in a whole app | tracker: the App's derived `shown: Dataset`; calendar: the App's `cal: Dataset`; desktop: `WinManager extends Node` and its `list` of window records | `Dataset`, `Dataset.contents`, `Node` |
| Data from a service: loading, failure, typed records | `14-data.md` § Where data comes from; `15-schemas.md` | tracker: `schema Issue` and `class Issues extends DataSource`; marketmap: `class Market extends DataSource` | `DataSource`, `schema` |
| Records edited in place; forms; a draft saved or cancelled | `14-data.md` § Writing a record, § Editing text, and forms | tracker: `EditorCard` (`text <-> :it.title`); calendar: `DetailSection` | `<->`, `TextInput`, `TextInput.commitOn` |
| A form that checks itself and sends: required fields and rules, every problem shown on submit, the first focused, a service's refusal shown on the field it names, sending once while pending; fields that start from the signed-in account; one of many chosen; money and dates written out | `14-data.md` § Editing text, and forms (§ A form, § A form with no service, § Errors shown your own way, § A form in a sheet); `08-controls.md` § Choosing one of many, § Keyboard focus; `12-text.md` (numbers, money and dates) | tracker: `EditorCard` | `Form`, `Field`, `TextInput.required`, `validate`, `Form.source`, `Form.method.refusedWith`, `ValueControl`, `RadioGroup`, `Combobox`, `globals` (for `Intl`) |
| A long list: only the rows near the screen built, rows of different heights and kinds, a heading between records | `16-collections.md` | tracker: the App's `ListRow [ … virtualize = true, classFor = { … } ]` over `GroupRow` and `IssueRow`; desktop: the App's `wins` (a class per kind of window) | `virtualize`, `classFor`, `rowIndex`, `exists` |
| Drawing what attributes can't express: a gauge, a chart, an icon | `17-your-own-views.md` § Custom drawing, § Icons | weather (`weather-art.declare`): `WindDial`, `PressureGauge`; marketmap: `StageTile`'s sparkline | `draw`, `DrawContext`, `Icon` |
| A layout of your own | `17-your-own-views.md` § Writing a layout | weather (`weather-art.declare`): `MasonryLayout`; marketmap: `MarketLayout` | `Layout`, `place` |
| Anything that opens over the interface — a menu, a context menu, a popover, a dialog, a sheet, a toast — closing when it should, holding focus and keys while open, staying with its window | `18-overlays.md` | tracker: the App's `sortMenu`, `facetMenu`, `ctx: ContextMenu` and its undo `Toast`; sampler: the Overlays page, every kind opened from a card; desktop: a Files window's row menu, which opens in the window's layer | `Menu`, `ContextMenu`, `Popover`, `Dialog`, `Sheet`, `Toast`, `Window` |
| A screen reader and the keyboard alone: names for what shows none, your own drawn control's role, announcements; what a field holds, for autofill and a phone's keyboard | `19-accessibility.md`; `08-controls.md` § Text fields | tracker: its icon buttons' `accessibilityLabel`; library: `Toast` (`Accessibility.announce`), `Slider`'s role contract | `accessibilityLabel`, `accessibilityRole`, `Accessibility`, `TextInput.purpose` |
| Addresses, back and forward, deep links | `20-urls.md` | birds: the App's `location` and `waypoint` and what derives from them | `location`, `waypoint` |
| Motion that can be interrupted and redirected | `21-motion.md` | tracker: `ListRow`'s height spring; calendar: `DetailSection`'s spring; desktop: `DockIcon`'s `magSpring` | `Spring` |
| Clocks, a later call, one action when something changes | `22-time.md` | calendar: the App's `clock: Time [ tick = day ]`; tracker: `Toast` (`afterDelay`), the App's `trackChanges` and `onChange` | `Time`, `afterDelay`, `onChange` |
| A whole arrangement moving from one view to another; one view becoming the next | `23-animated-arrangements.md` | calendar: the App's four springs (`c0`, `r0`, `nc`, `nr`) that every cell reads; weather: `CityView`, carried by one spring (`openT`); marketmap: the App's `flight` and `zoomer` | `Spring`, `TweenLayout` |
| Another program inside yours; yours inside a page | `25-embedding.md` | desktop: `AppWindow`'s `island: AppIsland`; two-way: `crossings` — values go down with `provides`, come back up with the method `exposed(…)` (what the tenant `exposes`), and commands cross with `post` | `AppIsland`, `DOMIsland`, `provides`, `exposes`, `DOMIsland.exposed` |

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
  script is for; `11-paint-and-themes.md` § Themes; `21-motion.md`)
- **Rebuilding what Declare does** — row heights measured by hand, a scroll position
  saved and restored, a window of rows computed from the scroll offset, a list's records
  copied into a second list only to put a heading over each section (the heading belongs
  to the row that starts one; a group row the reader collapses is a kind of record of its
  own). Each is already done for you.
  (`16-collections.md`; `07-scrolling.md` § Keeping the reader's place)
- **`as any` on your own data** — a cast to quiet the checker. Give that dataset a `schema`
  instead, and its values arrive typed. (`15-schemas.md`)
- **A flag set when data arrives** (`booted = true` in a callback) — derive it:
  `ready: boolean = { app.src.loaded }`. (`14-data.md` § Where data comes from)
- **Polling** — a `Time` firing every second to act every five, or a value recomputed on a
  timer that a constraint would recompute when its inputs change. Give the `Time` its
  period (`tick = 5000`) and let a constraint read what it depends on; per-frame work is for
  animation and physics. (`22-time.md`; `03-constraints.md`)
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
- **An overlay built by hand** — a full-window view with a scrim, shown by a flag; a panel
  positioned from a snapshot of its anchor, with its own flip and clamp; an empty `onClick`
  to stop presses falling through; Esc handled as a chain of checks in a `Keys` member. A
  full-window view with a scrim is a `Dialog` or a `Sheet`; a panel at a control is a
  `Popover` or a `Menu`, opened with `openFor`. Each closes itself on Esc and on a press past
  it, holds back what is behind it as its kind should, keeps Tab inside while open, and
  animates out before it goes. (`18-overlays.md`)
- **Shortcuts as a chain of key tests** in a `Keys` member — `if (e.meta && e.key == "s")`.
  A command with a key is a record in a `Shortcuts` member, or a `key:` on a menu bar item:
  it gets a label a panel can list, stays out of a text field's typing, and stands down
  while a menu is open. (`09-pointer-and-keyboard.md` § Keyboard shortcuts)
- **Placing everything by hand.** A page's cards, rows and insets are a layout's job; `x` and
  `y` are for a diagram's scene or an overlay. Four tells: a container whose height is
  arithmetic over its children (it sizes from its content);
  `x = { (parent.width - this.width) / 2 }`, which is `x = center`; equal widths by
  arithmetic, `width = { (parent.width - 24) / 4 }`, which is `flexes = true` on each; and
  `width = { app.wide ? parent.width - 280 : parent.width }` with its like on several
  siblings, which is a layout of your own: one `place()` that divides the room.
  (`06-layout.md`)
- **A method per control that only passes the press on** — `picked() { }` declared on the
  class, `press() { this.picked() }`, the use site overriding `picked`. The use site overrides
  `press()` itself. (`04-structure.md` § Reaching other parts of the tree)

## Checking and looking

Climb from the cheapest check to the dearest, and stop as soon as one answers:

- **Check as you go** with `npx declare-verify app.declare`: in a second or two it compiles
  the program, checks it, and boots it in a browser at a laptop's size and a phone's —
  syntax, names, types, that it starts, and what it can see wrong in the layout (a child
  spilling out of a box sized by its content, text past its box or the window, a target too
  small for a finger). A program that never finishes is stopped, and its line quoted. Each error names its fix;
  apply exactly that, change nothing else, check again. It also lists the classes the boot
  never built — screens that appear later — which it could not check.
- **Ask where things are before you look.** `npx declare-verify app.declare --size 390x844
  --touch --read app.list.height --outline app.sheet` answers from that boot: a value, and
  every view under a path with its place and size, as text. It costs a fraction of a picture.
- **Look at milestones** — once the whole program first runs, and after a change to what
  people see — because paint, fonts and real text exist only in a browser.
  `npx declare-look app.declare --size 390x844 --touch --shot out.png` runs it in a browser
  and saves a picture; it can click, drag, hold, pinch, scroll, type and press keys, in the
  order you write them, and read values (`--help` lists them). Under `--touch` every press
  is a finger. `--shot-of PATH file.png` pictures one view instead of the window. A picture you read stays in your context for the rest of the session, like
  any read, so look when there is something to see, not after every edit. `look` is for
  reaching a state to see it; whether a sequence of actions does what it should is a flow,
  and a flow is an assert script.
- **Check a whole flow with an assert script** for `npx declare-verify app.declare --assert
  flow.mjs` (`docs/operational/verify.md`): `drive` presses, types and waits as a person
  does, `expect` checks what is shown and what the program sent (`expect.request`). End
  each flow by expecting what it should have done — R5 says when a script asserted nothing.
  A view is named by its path or by what it says — `app.form."Pay $40.00"`. Don't build a
  browser harness of your own; `page` in an assert script, and `declare-look --js`, answer
  what the vocabulary doesn't. Keep the scripts, and run them again after a change.
- `npm start` serves a program at its file's path (`my-apps/app.declare` at
  `http://127.0.0.1:8200/my-apps/app.declare`) for a person to use.
- **Before you hand it over, use it once as a person would.** Scroll a long list from end
  to end, drag its scrollbar, resize the window, switch to dark mode and to touch. A
  program can pass every check and still fail the first person who does one of these.
- **A whole program built to a brief or a spec: have a checker test it against it** before
  you hand it over — not for a change, an experiment or a small request. `npx declare-check --brief <the brief>
  --program app.declare --url <its address>` (and `--service <url>` for a service it talks
  to). A second agent, started fresh and knowing nothing of how you built it, reads the
  brief, checks each requirement it can — most important first — and reports each as
  passed, failed or unchecked, with the program line for what failed. It takes some
  minutes: it waits up to 100 s, then prints an id for `npx declare-check --wait <id>`.
  Fix what failed, rerun the scripts it saved (`checks/`), and for what it did not reach,
  ask again with `--continue <id>`. (`docs/operational/checking.md`)
- **When it runs but is wrong**, don't re-read the source to guess: ask the running program
  why a value is what it is, which view is under a point, where a value came from
  (`05-run-and-check.md` § Debugging a running program; `docs/operational/introspection.md`).
