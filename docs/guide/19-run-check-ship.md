<!-- nav: Run, check, ship -->
<!-- part: Working -->

# Run it, check it, ship it

A program is not finished when it runs — it has an address, gets found, gets checked,
gets shipped. In the stacks you know, each of those is its own subsystem with its own
configuration. Here they hang off one fact:

> **The program URL is the app's address — for running it, editing it, reading it,
> crawling it, and building it.**

With the dev server up, navigating to `…/my-apps/hello.declare` compiles and renders
it — and a directory URL is the same address in short form: `…/apps/calendar/` means
`…/apps/calendar/calendar.declare`, because a directory containing a program that
matches its name *is* that program's address. The *same address* answers
`?viewer=edit` (a live editor beside the running result),
`?viewer=reader` (the source as an annotated, highlighted document), `?render=canvas`
(the own-pixels renderer — [Where it runs](declare-docs:guide:renderers)), and `?extract`
(what a crawler sees — below). No project scaffold, no route config, no build step
between an edit and a reload.

One of those subsystems got its own chapter: which URLs your app answers to, and
what the Back button restores, is the [Location](declare-docs:guide:location)
chapter — an app's *addresses* are language, not tooling. This chapter is the
tooling: what the one URL above does for you as a developer, and how a program
gets checked and shipped.

## Crawlers, without a server

The deeper surprise: this also replaces server-side rendering. A Declare program is
not an empty `<div>` waiting for JavaScript — **static extraction**, built into the
compiler, boots the program headlessly to its settled state and serializes its real
content as semantic HTML: actual headings, paragraphs, links. The crawl follows your
app's own links — literal fragments and handler writes alike — and emits one document
at the program URL: the default location's content, plus a section per reachable
location. Discoverable = linked, exactly like the web. Append `?extract` to any
program URL and read what a crawler gets; ship it baked into the page with one flag.
(Try it on the birds guide. Because every tile is a `link`, the crawl walks the
shelf to all fifty bird pages, prose and all. It also finds the quiz *room* —
that is an address — but not a single question, score, or answer, because a
round lives in a waypoint and the crawl boots every location at its declared
initial — the citizenship rule from [Location](declare-docs:guide:location),
enforced by the build.)

Two honest rules. Crawlable data is **build-time data** — a relative `DataSource`
URL is your app's own material and extracts fine; an absolute URL is the network,
and the crawl refuses *loudly*, naming the fix, rather than emit a silently thinner
document. And the crawl walks **locations only, at the declared initial waypoint**:
content you want indexed must derive from `location`, never from `waypoint` — which
is the stranger test again, because crawlable and shareable are the same property
wearing different hats.

> **From React:** compare the apparatus this retires — SSR, hydration, the
> server/client component split, the rendering service that runs it. Extraction is
> a *compile step*, not a runtime: this site, its live-editing pages included, is
> crawlable from GitHub Pages with no server at all. The simplification isn't a
> missing feature. It's a whole layer the architecture never needed.

## Check it

You have been living the loop all guide: edit, run, read the error, apply the named
fix. The `verify` command is that loop as an oracle — it climbs a ladder, cheapest
rung first, and reports the *first real problem*, not a cascade of downstream noise:

1. **structure** — does it parse?
2. **resolution** — does every name, tag, and datapath resolve?
3. **analysis** — does it typecheck, with every constraint's reads known?
4. **boot** — does it construct and settle, headlessly?
5. **behavior** — does it do what a drive-and-assert script says?
6. **visual** — does it match its named baselines?

Rungs 1–4 need no browser and no flags — typechecking every `{ }` body is part of
every compile, always. Within a rung you get every independent error at once, in
source order, each with its code, its position, and — where the mistake is one the
compiler anticipates — the fix by name. The diagnostics
are the same ones you've been meeting when you break this guide's examples — trust
them, apply them, recompile. That habit is worth more than any chapter of this book.

The last two rungs are worth reaching for once a program does something. Rung 5 opens
the app in a real browser, drives it with real input, and asserts by **view path**
rather than DOM selectors, so a check survives any change to how a view is realized:

```js
export default async ({ drive, expect }) => {
  await drive.click("app.dock.calendar");
  await drive.settleMotion();                       // motion runs to rest, frame-exact
  await expect.visible("app.wins.0");
  await expect.approx("app.dock.calendar", "width", 72, 1);
};
```

`settleMotion` is the interesting one: it takes the app's clock and runs animation to
rest deterministically, so a spring can be asserted at all — otherwise its value at any
instant depends on frame timing.

### When it passes and still misbehaves

A green rung means *that rung* found nothing. The first four run with no browser at
all — approximated text metrics, no CSS, no layout engine, no input routing — so a
whole class of problem is invisible to them: a transparent view swallowing presses, a
size that only goes wrong against real fonts, anything that appears only in a bundled
build. When the checker is happy and the program is not, stop re-reading the source and
**ask the running program**:

```js
__declare.explain("app.dock.calendar", "width")
// → the expression, every read-path it was wired to, and their live values
```

The same answers have a face: press **⌥⌘D** on any page, or add `?inspector` to a program
URL, and the [Inspector](declare-docs:operational:inspector) opens over the running app.
Click a value to see what produced it; click *select* and click the app to find out
which view a press actually reaches; type a new expression at it and watch the program
change. Someone has told you about Smalltalk. They were insufferable about it. They
were also right about one specific thing: the program is a live thing you can ask
questions of, not a file you re-run — and that is what this is for.

Both the assert vocabulary and the bridge are documented in
[Introspection](declare-docs:operational:introspection).

## Ship it

### Three ways to run a program

There is one compiler, and the three ways to run a program differ only in *where the
compile happens* and what sits on the host beside your app:

- **The dev server** compiles each program when it is requested — `declarelang dev` (or
  `npm start` in the distro), then browse to the program URL. Every source is on disk and
  an edit shows on the next reload. This is how you work.
- **A static site** is the same tree served as plain files — GitHub Pages, any bucket, no
  Node anywhere. A service worker makes every program URL work, the curated pages load
  from precompiled programs committed beside them, and anything else compiles in the
  page on first visit, cached after.
- **A package** is one app, built ahead of time into a folder you can put on any static
  host and nothing else. This is what you ship to users, and what the rest of this
  section is about.

### What a package is

```bash
declarelang build apps/calendar/calendar.declare -o dist
```

The folder that comes out is self-contained. It needs nothing outside itself — no
compiler, no component library, no server — and nothing beyond it is ever asked for:

- **`index.html`**, which boots the app;
- **`app.<hash>.js`**, one file carrying the runtime, the program with every `{ }` body
  already a function, and the page host that runs it — the address bar and Back, islands,
  the window title. It holds only the components your program can construct and one
  renderer (DOM, or `--canvas`). For the flagship calendar it is about
  <!--stat:calendar.wireKB-->118<!--/stat--> KB gzipped, the figure the homepage reports;
- **your program's folder, swept in** — its data, images, fonts, anything beside the
  `.declare` file — minus its sources and its `tests/` folder of verify fixtures;
- **`BUILD.json`**, what the package was built from, so a committed build can say whether
  it is current.

On the dev server, `?build` on any program URL builds the same package and serves it,
so you can try it before you deploy it. `--crawler` bakes the extracted document into
`index.html`, for a page that should be indexed.

### What your program says it needs: `ship`

A build reads your source for everything a literal names: the components the tree uses,
the data a `url` names beside the program, the programs an island's `program` names.
What no literal says, your program states in one top-level block. The desktop's reads:

```declare-fragment
ship [
    islands = ["../../../library/platform-apps/viewer/viewer", "../../calendar/calendar",
               "../../birds/birds", "../../marketmap/marketmap"],
    files = ["desktop.declare"]
]
```

Its dock opens those four programs from a computed `program`, so the build could not read
them from the tree; and its Viewer window displays the desktop's own source, which is
not otherwise part of the app. Each member is a fact about the program, never a build
option:

| member | the program | the package carries |
|---|---|---|
| `islands` | mounts these by a computed `program` | each one compiled ahead, in `programs/` |
| `files` | reads these, and no literal names them or they sit outside its folder | a copy of each in `files/`, answered at the address the program asks for — its own paths are untouched |
| `compiler = true` | compiles source while it runs — live editing, programs typed in | the compiler and the component library, fetched on the first compile |
| `inspector = true` | answers questions about itself where it runs | the Inspector, the `__declare` bridge, source positions, and error sentences |

A `.declare` file in `files` arrives ready to read: the build adds its highlighted form,
so the Viewer in the desktop's package shows its source exactly as it does on the site.
A block may sit before or after the root, and a component can carry its own — a help
panel that reads a docs model states that file where it lives — and the program's block
is the union. The dev server and the static site hold every source and a compiler, so
they read none of it. The reference page [ship](declare-docs:language:ship) has the rules.

### Apps inside your app

An `AppIsland` runs another whole program inside yours, in your runtime — the desktop's
windows are the example. Each program your app can mount travels with everything it
would carry if it were packaged alone: its compiled program, its folder's data and
assets, its own `ship` block. That holds however deep the nesting goes, and each program
ships once, however many hosts name it — a program that embeds itself included.

A tenant reads its *own* files through its host. Its relative `url` resolves in its
host's space, so it asks where home is — `hostProvided("base", "")` — and falls back to
beside itself when it runs alone ([Embedding](declare-docs:guide:embedding) has the
pattern). The desktop provides each app window's `base`; the package answers those same
addresses from the copies it carries, so Calendar, Birds, and Market Map open with their
data in the desktop's package as on the site.

A package carries no compiler unless its program says so. An island that names a
program the build never compiled is a reported error at the moment it mounts, naming the
entry to add — never an empty box.

### Checking a package

Serve the folder alone, with any static file server, and use the app:

```bash
cd dist && python3 -m http.server 8000
```

A request that fails is the whole diagnosis: a 404 names a file the program reads that
it did not declare — add it to `files`, or to `islands` if it is a program. Errors in a
package carry a code in place of their sentence; `declare-help <code>` gives the sentence
back. [Building for production](declare-docs:operational:building) is the reference for
the build's flags and layout.

---

**What you can now say:** you can run any program from its one URL, read what a
crawler reads, climb the verify ladder from parse to pixels, question a running
program instead of re-reading its source, and ship the result three ways — all
without a scaffold, a route table, or a build pipeline you had to assemble.

[Next: **Writing with an LLM** →](declare-docs:guide:with-an-llm)
