# Building for production

For deployment you do not want a compiler on the critical path. `declarec` precompiles an app
at build time and emits a self-contained, static directory — the Declare analogue of a
bundler's production build.

```bash
node tools/declarec.mjs apps/calendar/calendar.declare -o dist
```

## What it emits, and why it's small

The output is a directory with an `index.html`, a content-hashed `app.<hash>.js`, your
data assets copied alongside (a program's `tests/` folder stays behind — verify fixtures,
never read by the running program), and whatever the program's `ship` block names (below): a
`programs/` folder with one compiled program per island, a `files/` folder for what it reads
from elsewhere, the compiler and the component library when it compiles at run time.
Deployable to any static host, as a folder that needs nothing outside itself. On the flagship calendar it lands
around **<!--stat:calendar.wireKB-->118<!--/stat--> KB gzipped** — and that is the figure the
homepage prints, measured on the build its own calendar page ships. The module carries
everything a page needs and nothing else: the runtime's run path, your program, and the web
host — the URL and history mirror (`app.location` ↔ the fragment, Back and Forward), island
mounting, the page title, and a live edit's compiler fetched lazily should the page ever ask
for one. Five things keep it small:

- **Precompile.** Parse, resolve, and typecheck happen once, now; the program ships as a JSON
  string parsed at boot, with source positions stripped, and every `{ }` body already a
  function — no `new Function` at startup, and no `eval` needed at all.
- **Run-path only.** esbuild bundles the runtime's render path and tree-shakes the rest — the
  parser, checker, and typechecker never ship.
- **One backend.** DOM by default, or `--canvas` for the single-`<canvas>` renderer; only the
  chosen one is bundled.
- **Slim registry.** Only the components the app can actually instantiate are included. If a
  component appears *nowhere* statically (built by name from loaded data), keep it with a
  top-level `use [ Name ]` list, or slimming will drop it.
- **Coded errors.** Error *prose* is developer text — you read it once while building. A
  production build ships the code instead (see below); the sentences stay in dev.

## What the program says it needs: `ship`

A build reads the source and collects what it can see: the components the tree names, the
data a literal `url` names beside the program, the island programs a literal `program`
names. What it cannot see, the program states, in one top-level block — each member a fact
about the program, never a build option:

```declare
ship [
    islands = ["player", "queue", "../../settings/settings"],
    files = ["../../docs/model.json", "app.declare"],
    compiler = true,
    inspector = true,
]
```

| member | says | the build ships |
|---|---|---|
| `islands` | an `AppIsland` may mount these when its `program` is computed | `programs/<hash>.json` per name — compiled ahead, fetched when an island first names one |
| `files` | the program reads these, and no literal names them or they live outside its folder | `files/<hash>.<ext>` per path; the entry maps each URL the program will ask for to its copy, so the program's own paths are untouched. A `.declare` source also ships its highlighted reader segments, so a viewer asking `?segments` reads it as it would on the site |
| `compiler = true` | the program compiles source at run time — live editing, programs typed in | `bundles/declare-compiler.js`, `bundles/compile-worker.js`, `library/` — the distro's layout inside the folder, fetched lazily on the first compile |
| `inspector = true` | the program answers questions about itself in production | the Inspector as a compiled program, the `__declare` bridge, source positions, error prose. Not the compiler: the Inspector's evaluate strip says so when it needs one |

An included component may carry its own block — a help panel that reads the docs model says
so where it lives — and the program's merged block is the union. The dev server and the
static site, which carry every source and a compiler, read none of this.

### Apps inside the app

An `AppIsland` mounts another Declare program inside yours — the desktop's windows, a
player in a panel. The tenant runs in your app's runtime, as its own app, so the build
carries three things for it: its compiled program, any components it uses that yours
doesn't, and everything it would carry if it were packaged on its own — its data and
assets, and whatever its own `ship` block names. `declarec` does both for every island program it can name: a literal
`program = "player"` is found in the tree; a computed one is in the `ship` block. Names are
spelled as `AppIsland.program` spells them — a name or a relative path, resolved from your
program's `demos/` folder. Each is compiled ahead — the same compile, the same checks — and
written as `programs/<hash>.json`, fetched the first time an island names it and
instantiated in the running app. A build carries no compiler unless the block says so, so
an island naming a program the build did not produce is a reported error at run time,
naming the fix — never a blank box.

**Transitively, once each.** A tenant's own islands come along too, with their data, so a
window hosting a program that hosts another works in the package as it does on the site.
Programs are keyed by file: one named by several hosts, or reached through a cycle — a
program that embeds itself — is compiled and shipped once, and the walk ends. A tenant that
compiles at run time (`compiler = true` in its block) puts the compiler aboard its host.

**Where a tenant's data resolves.** An island's relative data urls resolve in its *host's*
space, not its own folder — the desktop hands its viewer a path in the desktop's directory.
A tenant that reads its own file asks its host for its home, `hostProvided("base", "")`, as
Calendar, Birds, and Market Map do; the package maps that address to the copy it carries.
Island program names resolve the same way at every depth: against the page program's
`demos/` folder.

### Errors in a production build

Runtime errors still throw, still stop what they should, and still carry every value they
computed — only the sentence is replaced by a code:

```
[Declare E3A14CE] /nope/deep, '/nope' is missing
```

The path and the reason are right there, and `declare-help E3A14CE` gives the sentence back:

```
E3A14CE — a runtime error. Its message:
  '…' addresses nothing — …
  thrown at data.ts:389
```

A code is derived from the message itself, so it is stable across releases that don't reword
it, and a reworded message gets a new code. `declarec --debug` keeps the full sentences — as
do the dev server, the live-compile pages, and every test run, which is where you meet these
errors in the first place. Text an *app* renders (a `DataSource`'s `.error`) is never coded.

The same treatment covers every developer diagnostic, not only the thrown ones: a contained
`[Declare] …` report (a layout refusing a child, a handler removed from the clock), the
checker's type expectations, a production stub's own refusal when a slimmed-out module is
called, the reasons a hit trace or a virtualizer records. In the runtime source these reach
their reader through a helper rather than a `throw`, so they carry the `diag` tag
(`runtime/src/errors.ts`) — an identity join in dev, and the author's declaration to the strip
that the sentence is a diagnostic. The strip codes what a constructor names, never what a
string looks like, which is what keeps app copy safe. In a shipped calendar the diagnostic
prose that remains is one sentence — the `.error` an app may show.

## Flags

| flag | effect |
|---|---|
| `-o <dir>` | output directory (default `dist`) |
| `--canvas` | canvas backend instead of DOM |
| `--crawler` | bake the extracted static document into `index.html` (crawlers read it; the client clears it at boot) |
| `--extract` | also write the static document standalone as `<name>.extract.html` |
| `--debug` | a developer's build: the program verbatim, positions, prose, the Inspector, no slimming. For a program that needs some of that *in production*, declare it — `ship [ inspector = true ]` |
| `--quiet` | suppress progress output |

## Two ways to deploy

- **Host the distro** — serve the repo as-is; every app compiles on request (Node) or in the
  browser (static host + service worker). This is what runs every program in the tree that
  is not one of the site's pages.
- **Ship a build** — run `declarec`, deploy the `dist/`. One app, no compiler at run time.

**Prewarm** is a third, separate thing: the distro's curated apps also ship *precompiled
program artifacts* (`bundles/cache/`), which the distro's own pages and islands load into
the platform runtime already on the page — no compiler, no parse. It keeps the
compile-on-request model fast; it is not a `declarec` build, and the figure above is not
measured on it. The three arrangements — the standalone build, the dev server, and the
static distro — are laid out in [Running & hosting](../system-design/hosting.md). The
concepts are [Ship it](declare-docs:guide:run-check-ship); this page is the commands.
