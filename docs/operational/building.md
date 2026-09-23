# Building for production

For deployment you do not want a compiler on the critical path. `declarec` precompiles an app
at build time and emits a self-contained, static directory — the Declare analogue of a
bundler's production build.

```bash
node tools/declarec.mjs apps/calendar/calendar.declare -o dist
```

## What it emits, and why it's small

The output is a directory with an `index.html`, a content-hashed `app.<hash>.js`, your
data assets copied alongside, and — when the app mounts other programs — a `programs/`
folder with one compiled program per island (below). Deployable to any static host. On the flagship calendar it lands
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

### Apps inside the app

An `AppIsland` mounts another Declare program inside yours — the desktop's windows, a
player in a panel. The tenant runs in your app's runtime, as its own app, so the build
carries two things for it: its compiled program, and any components it uses that yours
doesn't. `declarec` does both for every island program it can name:

- an island whose `program` is a **literal** — `AppIsland [ program = "player" ]` — is
  found directly;
- an island whose `program` is **computed** — `program = { app.current }` — is declared
  at the top of the program, the way `use [ Name ]` declares a component a build can't see:

  ```declare
  islands [ "player", "queue", "../../settings/settings" ]
  ```

  Names are spelled as `AppIsland.program` spells them — a name or a relative path,
  resolved from your program's `demos/` folder.

Each is compiled ahead — the same compile, the same checks — and written as
`programs/<hash>.json`, fetched the first time an island names it and instantiated in
the running app. A build carries no compiler, so an island naming a program the build
did not produce is a reported error at run time, naming the fix (`islands [ … ]`) —
never a blank box. Live editing — the docs' examples, the Viewer's edit tab — ships only
in a build whose program publishes edits; every other build carries none of it.

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
| `--debug` | keep source positions and skip slimming (for debugging a build) |
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
