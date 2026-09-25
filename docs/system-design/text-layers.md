# Text in layers — styled runs without the document engine

**Status: PROPOSAL, 2026-09-25 — not ruled, nothing built.** Worth a closer look later.
It grows out of the Cadence run-7 eval (`evals/reports/2026-09-24-cadence-run7/`) and a
design conversation the same day. It builds on, and in one place revisits, the settled
[`text-and-markdown.md`](text-and-markdown.md) (2026-07-08). Code facts below are from
`52bfadcd`.

---

## 1. The problem

A program that wants **one line of mixed styles** — a large figure with small unit
letters, "4 sessions · 4h 11m" — has one documented tool: `HTMLText` with `textStyles`,
which is what the style guidance recommends ("a number and its unit are one run of text")
and what the Cadence agent did, correctly. It pulls in the whole rich-text engine to
set three spans:

| module (minified, in Cadence's production package) | bytes |
|---|---|
| `markdown.js` — the rich-text component and its engine | 31,164 |
| `md.js` — the Markdown parser | 10,090 |
| `html.js` — the HTML parser | 4,316 |
| `dom-rich.js` — the DOM realization of rich text | 3,906 |
| **total** | **49,476** — about 10% of the package's code, ~15 KB of its 144 KB gzipped |

Almost none of it is used: no parsing is needed, no blocks, no lists or quotes.

## 2. How it is built today

`RichText` (in `markdown.ts`) is an abstract base that does all the work. `Markdown` and
`HTMLText` are about eight lines each: a source key, and a parser that turns their source
(`text`, `html`) into the **same block tree** (`Block[]`/`Inline[]`, `md.ts`'s types). The
HTML reader's whitelist is itself block-shaped — `p`, `h1`–`h6`, `blockquote`, `ul`/`ol`/`li`,
`pre`, `hr`, `div`, plus inline tags — so `HTMLText` needs block layout as much as
`Markdown` does; only tables are Markdown's alone.

Inside the engine, three layers are already distinct:

- **The run layer** — a run model (`RichRun`, `RichBlock` in `backend.ts`), style bundles
  resolved to run styles (`RunStyle`, `bundleToRunStyle`, `richRunsOf`), and the renderer
  seam `setRichContent`. The DOM realization (`dom-rich.ts`) emits each paragraph as a real
  `<p>`/`<h*>` with its runs in normal browser flow; canvas and the Mac host flow runs
  themselves (`flowRichCanvas`).
- **The block layer** — block geometry, prose defaults, and builders for code blocks, lists,
  tables, quotes and rules; each block becomes Declare views, stacked by a `Layout`.
- **The document layer** — the reactive render keyed on the source, `textStyles` and named
  span styles, inline views in a sentence (`SlotHost`), links, anchors, clamping.

Registry slimming already drops all of it from a program that constructs no rich text (the
`dom-rich` stand-in on DOM builds). The cost is all-or-nothing: use any rich text and every
layer rides, because the block layer is referenced from the same module the run layer lives
in.

## 3. The proposal: a hierarchy by capability

```
View
 └ Text              one run, one style                       (unchanged)
    └ RichText       one paragraph of styled runs             (new class, existing code)
       └ Document    blocks: the document engine              (today's RichText base, renamed)
          ├ Markdown     + the Markdown parser, tables
          └ HTMLText     + the HTML parser, the unsupported-tag policy
```

| class | owns |
|---|---|
| **Text** | a string; the face (size, family, weight, colour, spacing, line height, wrapping, alignment); measurement; the baseline and cap-height facts |
| **RichText** | `runs` — a list of plain strings and `{ style, text }` records naming `style` bundles; resolving bundles into run styles; wrapping and one shared baseline across runs; the same measured facts as `Text`; the DOM realization of one paragraph of runs |
| **Document** | the block tree and its layout; prose defaults; `textStyles` and span styles; inline views; links; anchors; clamping; the reactive render keyed on its source; one abstract hook — parse the source into blocks |
| **Markdown** | its parser (`md.ts`) and tables |
| **HTMLText** | its parser (`html.ts`) and `unsupported` |

```declare-fragment
style Unit [ fontSize = 40, fontWeight = medium ]

RichText [ fontSize = 96, fontWeight = bold,
    runs = { [ "" + app.count, { style: Unit, text: " sessions" } ] } ]
```

**Why a class, not a `runs` attribute on `Text`.** A program cannot be known in advance not
to set a `Text` to styled content at run time, so an attribute on `Text` would put the run
layer in every program. A class is known: a tag in the tree is static (and `createView` by
name already needs `use [ … ]`), so **registry slimming gates the run layer by construction**
— a program using only `Text` carries nothing new. It also keeps the settled rule that "`Text`
is never secretly formatted": styled runs are an explicit choice, one level up.

**Why runs are guaranteed small.** A `RichText`'s runs can come from loaded data, but a list
of strings and styled strings can never produce a block. So the block layer is structurally
unreachable below `Document` — the guarantee that lets the build leave it out. (The same is
not true of `Markdown` or `HTMLText`: their sources can arrive at run time, so they must
always carry every block kind.)

**No duplication.** Each piece of the engine sits at the lowest class that needs it and is
inherited above. The work is a refactor of `markdown.ts` — moving the run layer down into
`RichText` and splitting the block layer out of the module the run layer lives in — not new
code.

**Expected cost to a DOM program:** `Text` — nothing new; `RichText` — the run layer, roughly
4–6 KB minified (estimated from line counts; see §6); `Markdown`/`HTMLText` — as today.

## 4. An option for the DOM: let the browser lay out documents

Today the browser lays out lines *within* a paragraph, and Declare lays out the *blocks* —
each list, quote, code block and rule is Declare views. The whitelist is exactly what a
browser lays out natively. On a DOM build, `Document` could emit `<p>`, `<h2>`, `<ul><li>`,
`<blockquote>`, `<pre>`, `<hr>` into one element and let the browser stack them — a parser,
an emitter and a measured height, with no Declare block engine. The engine would ride only
in canvas and Mac builds, which already slim by renderer.

**It removes nothing a program can use on the DOM**, because what a program reaches inside
rich text already relies on the browser there:

- **Inline views** — the DOM realization emits a placeholder in the flow, reads its box back,
  and a `Layout` places the view from that geometry fact. The read-back does not care who
  stacked the blocks.
- **Anchors** — a heading carries `data-anchor`; a reveal finds the element and scrolls
  natively. Only canvas computes anchor offsets itself.
- **Clamping and the first baseline** — already applied to, or read from, the DOM element.

**What it changes, all internal:**

- **Inspection** — the Inspector's tree shows each block as a view today; a browser-flowed
  document is one element with its content inside. Tooling, not a program capability.
- **Parity** — canvas and the Mac host keep the Declare engine, so block spacing and wrapping
  can drift from the DOM's. The remedy is the usual one: one definition of the block
  defaults, rendered by both.
- **Where block styling lives** — generated CSS on the DOM, the engine's defaults elsewhere;
  it needs one source that feeds both.

**This revisits a settled ruling.** `text-and-markdown.md` specifies that the block tier
renders "through Declare's own layout/components". This option keeps that on canvas and Mac
and gives it up on the DOM. It is independent of §3: the hierarchy stands either way; this
only changes what `Document` does on the DOM.

## 5. What it would mean for programs

- **Cadence-style hero lines** use `RichText` and carry the run layer instead of the whole
  engine — on Cadence's package, roughly 15 KB gzipped becomes roughly 5.
- **The style guidance** ("a figure and its units are one run of text") would point at
  `RichText` rather than `HTMLText`.
- **Documents** — `Markdown`, `HTMLText` — are unchanged for programs; with §4, lighter on the
  DOM.

## 6. Open questions

1. **Names.** Giving `RichText` to styled runs means renaming today's base — `Document`,
   `Prose`, `RichDocument`. The alternative keeps `RichText` for documents and calls the runs
   class `StyledText`.
2. **`RichText` extends `Text`?** It would inherit the face as the base run style and be a
   `Text` wherever one is accepted; `text` and `runs` then coexist — simplest rule: `text` is
   shorthand for a single run.
3. **What a run may carry.** Style bundles only, or also links (`{ link: …, text: … }`)?
   Inline views stay out — views in a sentence belong to the deferred text-layout design.
4. **The canvas flow's shape.** Can `flowRichCanvas` be split so a one-paragraph `RichText`
   reaches only its run path, not block handling?
5. **Measure before building.** The §3 cost is estimated from line counts. Build a variant with
   the run layer split out and read its real size from the build's own module breakdown; for
   §4, measure a DOM `Document` with no block engine.
