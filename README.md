# Declare

**Declare is a domain-specific language for user interfaces.** Just as SQL is a DSL for
querying data, Declare is purpose-built for creating modern UIs. Its whole surface fits in
your head — and inside an LLM's context window.

### ▶ [See it live — davidtemkin.github.io/declarelang](https://davidtemkin.github.io/declarelang/)
The homepage is **itself a Declare app** — the whole page you're looking at is written in
the language, by an LLM. So is the calendar it links to, and the desktop, and the
documentation browser.

## The whole model in one program

```declare
App [ width = 400, height = 140, fill = #1E3A49, textColor = whitesmoke,

    count: number = 0,                               // reactive state

    onClick() { count = count + 1 },                 // click anywhere

    Text [ y = 74, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` },         // re-runs whenever count changes
        ],
    ]
```

Two delimiters carry the whole model: **`[ … ]`** is the view tree — components,
attributes, children; **`{ … }`** is TypeScript — a value, a handler body. The `{ }`
lines are *constraints*, standing relationships the runtime keeps true: click and the
text updates, resize and it re-centers — you wrote no update logic for either. There is
no re-render, no diffing, no dependency array, no hook.

It's reactive by construction and statically typed, with all real logic in ordinary
TypeScript. One tree renders to the DOM or directly to pixels on a canvas — WebGL next,
with no rewrite. And the compiler runs in the browser as readily as in a Node server,
which is what removes the build step: a page can edit and re-run itself, every live
example on the homepage is genuinely compiling, and the same program deploys to a static
host with no Node anywhere.

---

## Why a new language?

If an LLM can write code from your English, why create a new programming language?
Because producing code is now nearly free; *trusting* it costs what it always did. A model
writing React verifies its work by resemblance — this looks like the billion lines it
trained on — and resemblance is not correctness. Meanwhile less and less code passes under
human eyes, which leaves the language and its compiler as the one reviewer always present.
Handing the writing to a machine doesn't make the language irrelevant. It makes it
load-bearing.

A language isn't only a cost to learn; it's a *lens*. A user interface has a real
structure — a tree of components, the state they hold, views that must stay current as it
changes, layout relating them in space. In a general-purpose language none of those are
language concepts, so the compiler can't see them and they're kept correct by hand.
Declare makes them first-class. What the compiler can then *see* it checks ahead of time,
optimizes, and rejects when malformed — and every diagnostic names the rewrite that fixes
it, because the primary reader of a compiler message is now a model deciding what to do
next.

That legibility doesn't just help machines: **what makes Declare good for an LLM to write
is what makes it good for a person to read** — the interface's relationships live in the
language, not reconstructed from runtime code. And there's no wall to hit: the declarative
layer is the DSL; the logic inside it is plain TypeScript, riding the largest corpus there
is. Specific where that pays, general everywhere else.

### Everyday interfaces, and the kind you usually only see in the best native apps

Most of what anyone builds is everyday — forms, lists, panels, dashboards, settings — and
Declare is deliberately unremarkable at those: components, attributes, data, events, and a
compiler checking your work. That has to be true first, and it is. Nothing here asks you to
be ambitious to be productive.

What changes is the ceiling. The most prized layer of modern UI — the continuity you feel
in the best native software, where a view doesn't switch so much as become the next one,
where motion carries meaning and everything stays interruptible — has always been bespoke:
specialist craft, one interaction at a time, locked to a platform. It is also the least
machine-writable code there is; the corpus for it is thin, custom, and wrong in ways
nothing catches.

Declare makes continuity the grain, not the garnish. Motion is a `Spring` on an attribute;
layout is a reactive slot; a mode is a reversible `State` — so the continuous version of an
interface is often *less* code than the discrete one, and it is the same declarations you
were already writing. Next-level UX stops being a project of its own: it becomes something
you can reach for casually, and trust, because the compiler checks it like everything else.
The reference app is a calendar whose four views are one surface seen through a moving,
zooming rectangle — normally a bespoke project on its own:

| 494 | lines of Declare — four views, continuous zoom, drag, and edit |
|----:|:---|
| **66 KB** | over the wire, gzipped — the whole app and its runtime |
| **0** | lines written by hand — an LLM wrote it; the compiler kept it honest |

→ How to think in it: [the guide](docs/guide/01-thinking-in-declare.md). The language in
full: [`docs/declare.md`](docs/declare.md).

## What comes with it

- **A compiler that runs anywhere** — Node or the browser. The program URL *is* the app's
  address: browse to a `.declare` file and it compiles and runs, no build step, no route
  config, no scaffold.
- **`verify`** — a six-rung ladder that stops at the first real problem: structure →
  resolution → typecheck → headless boot → behavior under real input → visual baselines.
  The first four need no browser and run in seconds.
- **An Inspector** — press <kbd>⌥⌘D</kbd> on any page, or add `?inspector` to a program
  URL. Click any value and it shows the expression that produced it, every input that
  expression read, and their live values; type Declare at it and watch the program change.
  It is itself a Declare app.
- **Crawlable output with no server** — the compiler boots the program at build time and
  serializes what it renders as semantic HTML, so what a visitor sees and what a crawler
  sees can never drift. No SSR, no hydration. That's why this site runs on GitHub Pages.
- **A small standard library** — controls, menus, and theme records, authored in `.declare`.

## Quick start

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

## Where everything is

- **[docs/declare.md](docs/declare.md)** — the whole language, in one file, for you and your model.
- **[skill/](skill/SKILL.md)** — the agent skill: the resident kernel + routing table a model loads to write Declare (auto-discovered by Claude Code via a gated copy in `.claude/skills/`).
- **[docs/](docs/README.md)** — the guide (start at [getting-started](docs/operational/getting-started.md)), operational pages, and the machine model ([declare-model.json](docs/declare-model.json) — exact facts in its `spine`).
- **[docs/system-design/](docs/system-design/)** — the internal design record (non-authoritative; the docs win).

## Explore & build

```sh
npm install
npm run build       # tsc -b: runtime, then compiler → each area's dist/
npm start           # dev server → http://127.0.0.1:8200/
npm test            # the per-commit suite — 21 files, no browser, seconds
npm run test:ladder # the slow rungs — real input and pixels, in headless Chromium
```

| dir | what |
|-----|------|
| `runtime/` | the framework — parser, reactive core, layout, animation, DOM/Canvas backends (zero external deps) |
| `compiler/` | the thin `.declare` → JS compiler; depends one-way on `runtime/` |
| `library/` | components and theme records authored in `.declare` |
| `apps/` | the runnable corpus — `homepage`, `calendar`, `desktop`, `docs`, `viewer`, `inspector`, and smaller samples |
| `tools/` | `verify`, `format`, `declarec` (production builds), and the internal doc/build pipeline |
| `docs/` | the [guide](docs/guide/), [operational pages](docs/operational/), and the [design record](docs/system-design/) |
| `test/` | the suite `npm test` runs |

**Source & hosting.** Each area co-locates `src/` and committed `dist/`, so the tree runs
and hosts as-is — no build step required. Every host page loads the platform as ONE
committed bundle (`bundles/declare-boot.js`) and compiles the page's own
`.declare` in the browser, caching the output; the in-browser compiler
(`bundles/declare-compiler.js`) is fetched lazily, only when something compiles.
The deployed source is the single source of truth — there is no per-page artifact to
fall stale; see [`docs/system-design/hosting.md`](docs/system-design/hosting.md).
Directory URLs (`…/apps/calendar/`) work on any static host that serves a directory's
`index.html`: each program directory carries a generated cold-start stub
(`tools/internal/bake-app-stubs.mjs`, regenerated by the pre-commit hook, kept fresh
by `test/serve-parity.test.mjs`) that answers the one request no host machinery can —
a first visit before the service worker exists. The dev server shadows these files
(its directory-program rule answers first), and the installed SW supersedes them, so
they serve exactly one navigation per visitor: the cold one.

**Conventions** (for contributors):
- **Format** every `.declare` to the house style — [`docs/system-design/formatting.md`](docs/system-design/formatting.md).
- **Never rebuild the platform bundles by hand**: the pre-commit hook rebuilds a stale
  one before stamping the build id, and the dev server rebuilds on demand
  (`tools/internal/bundle-freshness.mjs`).

## Lineage

Declare is the **heir to OpenLaszlo** — a declarative, reactive UI language that ran at
scale two decades ago — but it is not a port. It's a ground-up redesign: statically typed,
rebuilt for today's web, and shaped from the start with LLMs in mind. The core model is
proven; what's new is the design and the timing — a language built to be *read*, arriving
as the reader becomes, increasingly, a machine.

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 David Temkin. The one notice at the
root covers the whole tree (code, library, apps, documentation); files carry no
per-file headers by design — the sources are the showcase. The distribution bundles
one third-party component — the TypeScript compiler (Apache-2.0), for in-browser
typechecking — attributed in [THIRD-PARTY-NOTICES.md](docs/legal/THIRD-PARTY-NOTICES.md).
