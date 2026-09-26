<!-- nav: Packaging for production -->
<!-- part: Shipping and working -->

# Packaging for production

During development a program is an address: the dev server compiles it when you ask for
it ([Running and checking](declare-docs:guide:run-and-check)). To ship it to users, you
package it: `declarec` builds one program, ahead of time, into a folder you can put on any
static host, with no compiler, no library and no server behind it. This chapter covers
what goes in that folder, what crawlers read from it, and how a program states what its
package must carry.

> **A package is self-contained. What the source names travels automatically; what it
> does not name, the program declares in `ship`.**

## Three ways to run a program

There is one compiler, and the three ways to run a program differ only in *where the
compile happens* and what sits on the host beside your app:

- **The dev server** compiles each program when it is requested — `npm start` in the
  repository, `npx declare-dev` in your own project — and you browse to the program URL. Every source is on disk and
  an edit shows on the next reload. This is how you work.
- **A static site** is the same tree served as plain files — GitHub Pages, any bucket, no
  Node anywhere. A service worker makes every program URL work, the curated pages load
  from precompiled programs committed beside them, and anything else compiles in the
  page on first visit, cached after.
- **A package** is one app, built ahead of time into a folder you can put on any static
  host and nothing else. This is what you ship to users, and what the rest of this
  chapter is about.

## What a package is

```bash
npx declarec apps/calendar/calendar.declare -o dist
```

The folder that comes out is self-contained. It needs nothing outside itself — no
compiler, no component library, no server — and nothing beyond it is ever asked for:

- **`index.html`**, which boots the app;
- **`app.<hash>.js`**, one file carrying the runtime, the program with every `{ }` body
  already a function, and the page host that runs it — the address bar and Back, islands,
  the window title. It holds only the components your program can construct and one
  renderer (DOM, or `--canvas`). For the flagship calendar it is about
  <!--stat:calendar.wireKB-->119<!--/stat--> KB gzipped, the figure the homepage reports;
- **your program's folder, swept in** — its data, images, fonts, anything beside the
  `.declare` file — minus its sources and its `tests/` folder of verify fixtures;
- **`BUILD.json`**, what the package was built from, so a committed build can say whether
  it is current.

On the dev server, `?build` on any program URL builds the same package and serves it,
so you can try it before you deploy it. `--crawler` bakes the extracted document into
`index.html`, for a page that should be indexed.

## What your program says it needs: `ship`

A build reads your source for everything a literal names: the components the tree uses,
the data a `url` names beside the program, the programs an island's [`program`](declare-docs:AppIsland.program) names.
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
they read none of it. The reference's page for the `ship` form has the rules.

## Apps inside your app

An [`AppIsland`](declare-docs:AppIsland) runs another whole program inside yours, in your runtime — the desktop's
windows are the example. Each program your app can mount travels with everything it
would carry if it were packaged alone: its compiled program, its folder's data and
assets, its own `ship` block. That holds however deep the nesting goes, and each program
ships once, however many hosts name it — a program that embeds itself included.

A tenant reads its *own* files through its host. Its relative `url` resolves in its
host's space, so it asks where home is — `hostProvided("base", "")` — and falls back to
beside itself when it runs alone ([Embedding](declare-docs:guide:embedding@a-tenant-that-loads-itself) has the
pattern). The desktop provides each app window's `base`; the package answers those same
addresses from the copies it carries, so Calendar, Birds, and Market Map open with their
data in the desktop's package as on the site.

A package carries no compiler unless its program says so. An island that names a
program the build never compiled is a reported error at the moment it mounts, naming the
entry to add — never an empty box.

## Checking a package

Serve the folder alone, with any static file server, and use the app:

```bash
cd dist && python3 -m http.server 8000
```

A request that fails is the whole diagnosis: a 404 names a file the program reads that
it did not declare — add it to `files`, or to `islands` if it is a program. Errors in a
package carry a code in place of their sentence; `npx declare-help <code>` gives the sentence
back. [Building for production](declare-docs:operational:building) is the reference for
the build's flags and layout.

## What crawlers see

A Declare page is not an empty `<div>` waiting for JavaScript. **Static extraction**, built into the
compiler, boots the program headlessly to its settled state and serializes its real
content as semantic HTML: actual headings, paragraphs, links. The crawl follows your
app's own links — literal fragments and handler writes alike — and emits one document
at the program URL: the default location's content, plus a section per reachable
location. Discoverable = linked, exactly like the web. Append `?extract` to any
program URL and read what a crawler gets; `declarec --crawler` bakes it into the package's
`index.html`.
(Try it on the birds guide. Because every tile is a [`link`](declare-docs:View.link), the crawl walks the
shelf to all fifty bird pages, prose and all. It also finds the quiz *room* —
that is an address — but not a single question, score, or answer, because a
round lives in a waypoint and the crawl boots every location at its declared
initial — the rule from [URLs, links and history](declare-docs:guide:urls@what-the-crawler-sees-is-what-a-stranger-sees),
enforced by the build.)

Two honest rules. Crawlable data is **build-time data** — a relative [`DataSource`](declare-docs:DataSource)
URL is your app's own material and extracts fine; an absolute URL is the network,
and the crawl refuses *loudly*, naming the fix, rather than emit a silently thinner
document. And the crawl walks **locations only, at the declared initial waypoint**:
content you want indexed must derive from [`location`](declare-docs:App.location), never from [`waypoint`](declare-docs:App.waypoint) — which
is the stranger test again, because crawlable and shareable are the same property
wearing different hats.

> **From React:** compare the apparatus this retires — SSR, hydration, the
> server/client component split, the rendering service that runs it. Extraction is
> a *compile step*, not a runtime: this site, its live-editing pages included, is
> crawlable from GitHub Pages with no server at all. The simplification isn't a
> missing feature. It's a whole layer the architecture never needed.

---

**What you can now do:** build a self-contained package, bake in the document crawlers
read, declare what a package must carry beyond what the source names, and check that it
runs on its own.

[Next: **Writing with an LLM** →](declare-docs:guide:with-an-llm)
