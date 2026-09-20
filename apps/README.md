# What's in `apps/`

This directory is the **runnable corpus**: every complete Declare program the
repository ships. Each one is a real application — none is a fixture — and
together they are the working proof of the language: every app here compiles,
typechecks, and boots on every `npm test` (`test/verify-apps.test.mjs` sweeps
the directory automatically).

**Conventions.** A directory named `name/` contains `name.declare` as its
program; the directory URL *is* the app (`…/apps/calendar/` runs the
calendar). `index.html` files are **generated** stubs for cold static hosts —
never edit them (`tools/internal/bake-app-stubs.mjs` regenerates them through
`npm run derive`). `demos.json` and any `*.json` data files are baked inputs.
Append `?viewer` to any program URL to read its source rendered — prose blocks
as prose, code highlighted — which is the intended way to *read* these apps.

Scratch work belongs in `my-apps/` (untracked); an app graduates here when
it's meant to teach.

## Reading order

If you're new to the language: **weather → calendar → tracker**, then whatever
matches your question. Each app's source opens with a prose block saying what
it is and what to notice — this file is the map, those blocks are the
territory.

| app | one line | reach for it when you want |
|---|---|---|
| [weather](weather/) | one program, phone and desktop dialects | your first read; responsive design without forking |
| [calendar](calendar/) | four views as one zooming surface | the reference app; springs, states, geometry |
| [tracker](tracker/) | an issue tracker over a six-figure backlog | data at scale; datasets, derivation, windowing |
| [marketmap](marketmap/) | the S&P 500 treemap, animated through the years | custom layouts, a model class, data-driven structure |
| [desktop](desktop/) | a Mac-style desktop, windows and dock and menus | the widest integration proof; runtime-created views |
| [birds](birds/) | a field guide with a quiz | `location` + `waypoint`: URL, history, back button |
| [homepage](homepage/) | the project site itself | document flow, theming, live compiled examples |
| [architecture](architecture/) | what's under the hood, as a live article | long-form structure; figures that are views, not pictures |
| [docs](docs/) | the reference, self-hosted | data-driven UI over a doc model; Markdown component |
| [two-way](two-way/) | HTML ⇄ Declare embedding, both directions live | putting Declare into an existing page, or a page into Declare |
| [sampler](sampler/) | the library under four switchable stylings | theming as data |
| [textsampler](textsampler/) | every way text is set, on one sheet | rich text, named styles, a view inside a sentence |
| [lzx-weather](lzx-weather/) | the OpenLaszlo weather app, rebuilt | a small, complete port; drawn chrome |
| [lzx-calendar](lzx-calendar/) | the Laszlo calendar, rebuilt from a spec | spec-driven reimplementation |
| [lzx-dashboard](lzx-dashboard/) | a 2003 web desktop with five windows | multi-file programs; media; the ancestry |

---

## The showcases

### weather — the first read

One program, two dialects. Below ~700px it's a phone app — a scrolling list of
cities, each expanding in place into a full page; above, a desktop app — a
sidebar beside a grid of the same cards. **Nothing forks but layout and
input**: one card vocabulary, one set of drawn instruments, one truth. Its
opening prose block is a deliberate primer — the tree, constraints as
relationships, where handlers fit — so it doubles as the guided first read.
Notice: `draw()` for the instruments (marks, not fields), springs for the
in-place expansion, and how little of the file is "responsive code."

### calendar — the reference

Day, week, month, and year are **one surface seen through a moving, zooming
focus rectangle** over the month grid; changing view is one continuous spring
zoom, and each cell is its grid slot mapped through the rectangle. Events
reshape from stacked chips into placed time-blocks as their cell grows; drag
one to reschedule. This is the corpus's reference for geometry-as-constraints,
the house chrome arrangement (top bar, appearance menu), and the `Keys` member
for keyboard reach (arrows page, Escape closes).

### tracker — data at scale

A flat list over a six-figure issue backlog (`issues.json`, ~3MB), searched as
you type, filtered, grouped, edited in place, with bulk operations and undo.
The architectural sentence is in its intro: **not one word of virtualization
vocabulary appears in the file** — the runtime windows, recycles, and measures
the list; the source just declares rows over data. One `db` dataset is the
single truth; every count, bar, and chart is a derivation that re-runs because
it *read* `db`. Also the worked example of the script seam: its data generator
lives in `tracker-data.ts` via `script [ ]`.

### marketmap — the animated treemap

Finviz's S&P 500 map with the years running through it: area is market cap,
color is the day's change, and one sprung scalar (`day`) flies the whole
partition through the trading calendar — scrub it, or click an era chip and
watch the market reshape. Click a sector to zoom it onto a stage; drill an
industry in place. The architecture is the example's real subject: a faceless
`Market extends Node` model owning the data and its queries; **custom Layout
classes** whose live `place()` pass distributes every position per frame; a
**derived Dataset** so stage instances exist exactly when named; transparent
script memos for the geometry. Its data (`marketmap-data.json`, ~3MB) ships
delta-coded — first price in cents, then day-over-day changes — decoded once
in `onLoad`; the app reads its span, and its title, off the data itself.

### desktop — the widest proof

A Mac-style desktop: draggable, resizable windows created **at runtime by
name**, a dock that magnifies by layout (not paint), menus, and an embedded
app — the dock's Calendar opens the real calendar program inside a window.
Built entirely from shapes, gradients, and constraints; no image assets. At
~3,000 lines and 45 classes it's the corpus's largest program and the stress
case for dozens of independent relationships holding true at once.

### birds — the URL, the history, the back button

A 50-bird field guide with a quiz, and the teaching app for **`location` +
`waypoint`** — the three homes a value can live in (address / step /
ordinary), sorted by the stranger test. The whole quiz round derives from one
waypoint string, so every answer is a history entry and Back retraces the quiz
action by action while the URL sits at `#quiz`. The plate flights (shelf tile
zooming to page and home again) are the showcase of continuity across
navigation.

## The platform, about itself

### homepage — the site is an app

The project homepage, written in Declare: a vertical flow of auto-sizing
sections — no absolute-y anywhere — with the palette living once in a `theme`
record on the App. The live examples on the page genuinely compile in the
browser. Figures on the app cards come from `stats.json`, generated from real
production builds, so the page decides how to *say* a number, never what it is.

### architecture — the explanation is the program

An article about what a program compiles to, what ships, and which code runs
where, written as the thing it describes. Nine figures, and every one is a live
view rather than a picture: the hit-testing figure computes nothing and simply
reports each view's own `hovered` fact, the build figure redraws to scale when
you switch builds, and the click figure replays one settle about a thousandfold
slowed. It is also the corpus's **long-form document**: one centred column at a
reading measure, a wider measure that figures break out to, progressive detail
that opens on a spring, and a type kit whose every color is a theme token. The
homepage mounts the whole article in an `AppIsland`, at which point it stops
scrolling itself and hands its height up to the host. Open it with
`?render=canvas` and it is the same article, painted into one element.

### docs — the reference, self-hosted

The class reference rendered as a Declare app: it loads the doc extractor's
model and renders the navigable left-rail/detail-pane browser — Declare
documenting Declare, with every doc string through the runtime Markdown
component. The same view doubles as the live object browser's document mode.

### The platform's own programs live elsewhere

Three programs the hosts boot on their own behalf — the **viewer** (the `?viewer`
machinery behind every "read the source" link: Reader, verbatim Source, and an
Edit workbench), the **inspector** (a live object browser over a running app,
fed only by the `Inspect` service, transparent to the pointer), and the
**error** page (a window's error state, opened in place when a program fails
to load) — are not applications. They live in `library/platform-apps/`, ride
into the Mac app with the library, and stay out of this corpus.

## Integration

### two-way — both embedding directions, live

One HTML page (`index.html` is the entry — the app directories' one
exception), two directions: an ordinary page hosting Declare apps in
`data-declare-embed` divs, writing facts in through the boot handle and
watching facts out with `observe()`; and a Declare app hosting foreign HTML as
an island with the typed `external` fact surface and `post`/`onPost`. Three
small programs and two plain JS files, deliberately mundane — the point is the
seam, not the apps.

## The component library

### sampler — stylings are data

Every library component under four switchable stylings — San Francisco,
Mountain View, Cupertino, Redmond — plus light/dark, accent tints, and focus
flourish, all from the appearance menu. One machinery, four token records:
**the stylings are data, never code paths.**

### textsampler — every way text is set

Four pages of specimens — Text, Rich Text, Effects, Markdown — each one beside
the exact source that produced it. Named `style` bundles declared once and worn
by a `<span class>`, `HTMLText` parsed against its whitelist, `Markdown` with
tables and fenced code, and the newest of them: a self-closing tag naming one
of your own classes puts a **real view inside a sentence**, keeping its own
state, hovering, and re-flowing the line when it changes width.

## The OpenLaszlo ports

Declare's ancestry runs through OpenLaszlo; these three rebuild Laszlo-era
applications against the originals — same look and behavior, none a
transliteration of source. The discipline is "geometry exact, chrome drawn or
better": window frames, tabs, rails, and scrollbars are drawn; bitmaps are
content only.

- **lzx-weather** — the classic weather sample, small and complete; named
  fonts including a downloaded `.woff2`, the sliding tab, drawn bevel bars.
- **lzx-calendar** — rebuilt from `SPEC.md`, extracted from the running
  original; month/week/day with the 500ms slider motion.
- **lzx-dashboard** — the 2003 Dashboard: a web desktop of five windows,
  accordion tabs, chat, contacts, and a media player. The worked example of a
  **multi-file program** (`Include [ ]` splits stage / chrome / applets) and
  of the Media/Audio runtime family.
