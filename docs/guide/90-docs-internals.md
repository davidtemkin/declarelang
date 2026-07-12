# Building the docs — extractor, inline islands, themes, RichText

Notes on how *this* documentation viewer is built. It is not framework API —
none of the classes named here (`Segment`, `RunBlock`, `DocField`, the extractor)
are things you use to build an app; they are the innards of a bundled tool. This
chapter exists so the viewer can be maintained from its own pages.

## The shape

The viewer is one self-hosted Declare app — `examples/docs/docs.declare` — driven
by a build-time `model.json`. It runs in two modes, **Guide** (these narrative
chapters) and **Reference** (the framework classes). The app names no DOM: it is
ordinary Declare over the same runtime it documents, so every fix to the runtime
shows up here first.

## The extractor

`tools/doc/extract.mjs` produces `model.json` by joining several sources:

- **Reference structure** — component list and attribute types from the runtime
  `schema.js`, defaults from each class's `defineAttributes`, and method signatures
  read out of the built `.d.ts` via the TypeScript compiler.
- **Reference prose** — hand-written per class in `tools/doc/prose/<Class>.md`,
  where a `## name` heading documents an attribute, `## name()` a method, and
  `## on<Event>` an event. Structural-only members (no prose) still list, just
  undescribed.
- **Guide** — every `docs/guide/NN-slug.md` becomes a chapter. The leading number
  buckets it into a Part: `<20` Orientation, `<30` Fundamentals, `<90` In Depth,
  `>=90` **Internals** (this one). Parts render in number order, so Internals is
  always last.

```js
// tools/doc/extract.mjs — the part bucketing
const partOf = (num) =>
  num < 20 ? "Orientation" : num < 30 ? "Fundamentals" : num < 90 ? "In Depth" : "Internals";
```

## Inline examples

Prose is not one Markdown blob. `segmentize` splits each chapter at ` ```declare `
fences: the text between them renders as Markdown, and every runnable fence becomes
a live **edit-and-run island** — its source is written to `examples/docs/demos/seg_*.declare`
and rendered by the `Segment` / `RunBlock` pair (an editable `DocField` above, the
compiled child app mounted in an `HTML` slot below).

The subtlety worth remembering: **compile is not run.** A fence is compiled at
extract time to decide whether it is runnable; a bare `View [ … ]` *compiles* but
crashes at runtime (no `App` root, so the line-wrapper has nothing to size against),
so the extractor wraps a bare view in `App [ … ]` before running it. Fences in any
other language — the `js`/`ts` blocks in this very chapter — are never treated as
Declare; they stay static code. A per-page `live` flag gates preview mounting so
only the chapter you are reading compiles its islands, not all of them at once.

## Light and dark

The runtime exposes `app.dark`, a read-only reactive attribute wired to the OS
`prefers-color-scheme` (`wireColorScheme` in `runtime/src/index.ts`). The app reads a
single prevailing `theme` record and lets it flip:

```ts
// docs.declare — one record, chosen reactively; the dark set is the original palette
theme: { app.dark ? DARK : LIGHT }
```

Because `theme` is prevailing, every descendant re-skins the instant the system
theme changes. The live-preview canvas deliberately stays fixed-dark (it is a
sample app, not part of the chrome). Body text scales through `app.fontScale`,
driven by the A− / A / A+ stepper in the rail.

## Prose rendering: Markdown → RichText

Prose you read here is not laid out word-by-word. `Markdown` groups each run of
consecutive paragraphs and headings into a **RichText** — a native flowing block
(real `<p>` / `<h*>` on the DOM backend, via `Surface.setRichContent`) — so browser
selection is contiguous and baselines align the way a document's do. Structural
blocks (lists, code, block-quotes, tables) stay classic sub-views laid out by the
Column machinery. RichText measures its height at attach and keeps it in step with a
`ResizeObserver` (offsetHeight reads 0 while a box is briefly hidden mid-navigation
or before a web font loads); `Markdown` then stacks the block-views with
`SimpleLayout` and auto-extends its own height. The whole point: developers keep
writing `Markdown [ … ]` and get native selection for free.

That mechanism is exactly what renders the block below — and you can select across
its words as one run:

```declare
App [ width = 460, height = 116, fill = #1E3A49,
  Markdown [ x = 20, y = 16, width = { parent.width - 40 }, lineHeight = 1.5, bodyColor = whitesmoke,
             text = "**Markdown** flows as native text — try selecting across *these* words, `code`, and links." ] ]
```

## Build and run

The pipeline has four steps, and they are separate on purpose:

```
npm run build                 # tsc -b — runtime + compiler to their dist/
node tools/build-compiler.mjs # esbuild the browser compiler bundle (NOT part of tsc)
node tools/doc/extract.mjs    # (re)generate model.json
node tools/prebuild.mjs       # prebuilt per-example artifacts for static hosting
```

The dev server (`server/index.mjs`, port 8200) compiles `docs.declare` on request
and holds the runtime in memory — so after any change to the runtime or the schema,
**restart it**, or the page renders against a stale build. The all-pages headless
error sweep is the gate: it navigates every chapter and reference class and fails on
any runtime error or a non-compiling island.
