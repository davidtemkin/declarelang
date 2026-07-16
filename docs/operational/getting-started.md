# Getting started

Browse to a Declare source file and the server compiles it and returns the
running app — the program's URL *is* its address, with no build output in
between. Clone the repo and, in about a minute, you have the homepage running
locally and your own first app answering at
`http://127.0.0.1:8200/my-apps/hello.declare` — no build step, no scaffold, no
config. This page gets you there and hands you the edit-and-reload loop that is
the rest of the work.

## 1. Get it

<!-- generated:setup-commands -->
```bash
git clone https://github.com/davidtemkin/declarelang.git && cd declarelang
```
Get the repository.

```bash
npm install
```
Install the toolchain's dependencies (TypeScript; esbuild and puppeteer-core for builds and visual tests). The clone ships prebuilt — no build step before first run.

```bash
npm start
```
Start the dev server on http://127.0.0.1:8200/ — browse to any .declare file's URL and the server compiles and returns the running app.

Write a program to my-apps/hello.declare and browse to http://127.0.0.1:8200/my-apps/hello.declare — the program URL is the app's address.
<!-- /generated:setup-commands -->

`npm start` serves the distribution. The compiler, runtime, and library are
all in the repository — there is nothing else to install or configure.

## 2. Make a home for your apps

Create one directory at the repo root:

```sh
mkdir my-apps
```

It must be at the **root**, because a program's URL resolves against the served
tree: `my-apps/hello.declare` is reachable exactly because `my-apps/` sits under
the root the server hands out. `my-apps/` is gitignored, so everything you write
there rides across every `git pull` and never collides with the repo.

Start with one file per app — `my-apps/hello.declare`. When an app outgrows a
single file (its own data, images, components), graduate it to the directory
convention the bundled apps use, `my-apps/<name>/<name>.declare`; relative paths
inside it — a `data/` folder, say — resolve against the program URL for free.

## 3. Your first program

Put this in `my-apps/hello.declare`:

```declare
App [ width = 360, height = 200, fill = #14181F,

    count: number = 0,

    onClick() { count = count + 1 },

    Text [
        x = 24, y = 28,
        fontSize = 28, textColor = #E8EDF2,
        text = { "Clicks: " + count } ],

    bar: View [
        x = 24, y = 92,
        height = 16, cornerRadius = 8,
        fill = #4C8DFF,
        width = { Math.min(count * 24, 312) } ],
    ]
```

Browse to **http://127.0.0.1:8200/my-apps/hello.declare**. The URL *is* the app:
click anywhere and the count rises, the label follows, the bar grows to its cap
and stops.

Four lines carry the whole idea. `count: number = 0` declares a piece of reactive
state. `onClick() { count = count + 1 }` is a handler — `on` plus this node's own
event. The two `{ … }` expressions are **constraints**: the label's `text` and the
bar's `width` are not *set once* but *kept true* — change `count` and everything
that reads it updates, with no wiring on your part. That standing relationship is
the language.

## 4. The loop

You already have the whole development loop:

1. **Edit** `my-apps/hello.declare` on disk.
2. **Reload** the page. The server compiles on request; there is no build to run
   and nothing to restart.

Then break it on purpose. Change `count` to `kount` in the label and reload:

```
cannot resolve 'kount' — not a member of Text → App, a parameter, or a global [DECLARE4001] (line 5, col 31)
```

The diagnostic names the fix: the name is not in scope, and it shows the exact
chain it searched. You will spend more time reading diagnostics than chasing
misbehavior — they are written to be trusted, applied, and recompiled. That loop
*is* the first lesson.

## 5. The address does more

The program URL takes modifiers, one query parameter each:

- `?view=source` — read the compiled source beside the running app; `?view=edit`
  edits it in the browser.
- `?render=canvas` — render to a single canvas instead of the DOM: the same
  program, a different backend.
- `?build` — produce the standalone production bundle for this program.

Each is one axis of the same address. [The dev server](declare-docs:operational:dev-server)
covers the full request surface; [Shipping](declare-docs:operational:building)
covers `declarec` and hosting.

## Where next

- **Learn it properly** — [the guide](declare-docs:guide:shape), in order.
  It teaches you to think in Declare, starting from an app just like this one.
- **Hold the whole language at once** — [`declare.md`](declare-docs:spec:core),
  the complete surface stated once.
- **Look something up** — the [reference](declare-docs:reference:index).
