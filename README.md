# Declare

**Declare is a domain-specific language for user interfaces.** Just as SQL is a DSL for
querying data, Declare is purpose-built for creating modern UIs.

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


It's reactive by construction and statically typed, with all real logic in ordinary
TypeScript. One tree renders to the DOM or directly to pixels using Canvas, and it compiles *in the
browser* — so a page can edit and re-run itself.

### ▶ [See it live — davidtemkin.github.io/declarelang](https://davidtemkin.github.io/declarelang/)
The homepage is **itself a Declare app**: the whole page you're looking at is written in the language.

---

## Why a new language?

If an LLM can write code from your English, why create a new programming language? Because a language isn't only a cost to learn; it's a *lens*. A user
interface has a real structure — a tree of components, the state they hold, views that
must stay current as it changes, layout relating them in space. In a general-purpose
language none of those are language concepts, so the compiler can't see them and they're
kept correct by hand. Declare makes them first-class. What the compiler can then *see* —
the interface's actual structure and dependencies — it checks ahead of time, optimizes,
and rejects when malformed. The very same logic applies to an LLM: it is better able to reason about Declare code, and to write it, because the language is designed to directly express a user interface's structure.

That legibility doesn't just help machines, though: **what makes Declare good for an LLM to write is what
makes it good for a person to read** — the interface's relationships live in the language,
not reconstructed from runtime code. And there's no wall to hit: the declarative layer is
the DSL; the logic inside it is plain TypeScript. Specific where that pays, general
everywhere else.

→ How to think in it: [the guide](docs/guide/00-overview.md). The language in full:
[`docs/system-design/declare-language.md`](docs/system-design/declare-language.md).

## The whole model in one program

```declare
App [ width = 400, height = 140, fill = #1E3A49, textColor = whitesmoke,

    count: number = 0,                               // reactive state

    add: View [ x = 20, y = 20, width = 108, height = 34, cornerRadius = 8, fill = #2E6BE6,
        onClick() { classroot.count = classroot.count + 1 },
        Text [ x = 16, y = 8, text = "Add one" ],
        ],

    Text [ y = 74, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` },         // re-runs whenever count changes
        ],
    ]
```

Two delimiters carry the whole model: **`[ … ]`** is the view tree — components,
attributes, children; **`{ … }`** is TypeScript — a value, a handler body. The `{ }`
lines are *constraints*, standing relationships the runtime keeps true: click the view
and the text updates, resize and it re-centers — you wrote no update logic for either.
(There's no built-in `Button` — a button is a `View` with a fill and an `onClick`.)

## Lineage

Declare is the **heir to OpenLaszlo** — a declarative, reactive UI language that ran at
scale two decades ago — but it is not a port. It's a ground-up redesign: statically typed,
rebuilt for today's web, and shaped from the start with LLMs in mind. The core model is
proven; what's new is the design and the timing — a language built to be *read*, arriving
as the reader becomes, increasingly, a machine.

---

## Explore & build

```sh
npm install
npm run build     # tsc -b: runtime, then compiler → each area's dist/
npm start         # dev server → http://127.0.0.1:8200/
npm test          # unit + perceptual + scaffold
```

| dir | what |
|-----|------|
| `runtime/` | the framework — parser, reactive core, layout, animation, DOM/Canvas backends (zero external deps) |
| `compiler/` | the thin `.declare` → JS compiler; depends one-way on `runtime/` |
| `library/` | components authored in `.declare` |
| `apps/` | runnable apps — the `site` homepage, `weather`, `calendar-sample` |
| `docs/` | the [guide](docs/guide/) + generated [reference](docs/reference/) |
| `design/` | design docs — [language](docs/system-design/declare-language.md), [constraints](docs/system-design/constraints.md), [hosting](docs/system-design/hosting.md), … |

**Source & hosting.** Each area co-locates `src/` and committed `dist/`, so the tree runs
and hosts as-is — no build step required. Every host page loads the platform as ONE
committed bundle (`bundles/declare-boot.js`) and compiles the page's own
`.declare` in the browser, caching the output; the in-browser compiler
(`bundles/declare-compiler.js`) is fetched lazily, only when something compiles.
The deployed source is the single source of truth — there is no per-page artifact to
fall stale; see [`docs/system-design/hosting.md`](docs/system-design/hosting.md).

**Conventions** (for contributors):
- **Format** every `.declare` to the house style — [`docs/system-design/formatting.md`](docs/system-design/formatting.md).
- **Never rebuild the platform bundles by hand**: the pre-commit hook rebuilds a stale
  one before stamping the build id, and the dev server rebuilds on demand
  (`tools/internal/bundle-freshness.mjs`).

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 David Temkin. The one notice at the
root covers the whole tree (code, library, apps, documentation); files carry no
per-file headers by design — the sources are the showcase.
