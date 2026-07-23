# SEO & semantics — the brochureware domain

**Status:** DRAFT / exploration 2026-07-10 (David). Not settled — captured to return to.
Grew out of a live SEO experiment (a headless prerender of the homepage) + the realization
that "brochureware" (marketing/content sites, of which the homepage is the first) is now a
supported domain, so crawlable content and document semantics matter.

Related: [`hosting.md`](hosting.md) (static hosting), [`text-and-markdown.md`](text-and-markdown.md)
(the native Markdown content type), [`doc-system.md`](doc-system.md).

---

## The problem

A Declare page ships a thin HTML shell + JS that, when run, builds the DOM. A crawler that
doesn't execute JS sees no content — the empty `#host`. Find-on-page and basic accessibility
are fine once the DOM exists, but SEO (and any no-JS reader) gets nothing. Acceptable while
Declare was "for apps"; not acceptable now that it renders content sites.

## Reframe: what SEO actually needs

The headless prerender solved a *harder* problem than SEO requires — it reproduced the exact
rendered DOM including pixel layout. Crawlers index **text and structure in reading order**;
they don't care about `left`/`top`. So the real target is *content*, not *geometry* — which is
a near-static property of the tree the runtime already builds.

## Prerender mechanism (compiler/build-time, no browser)

The runtime is already ~90% headless: `test/unit.test.mjs` runs `build(source)` in Node today
and gets a fully instantiated, typed, constraint-resolved tree. Its comment names the only two
things that need a browser: **rendering** and **text/image measurement**.

So the path is **an `SsrBackend`** — a third backend implementing the existing `Surface`
interface (`runtime/src/backend.ts`), alongside `DomBackend`/`CanvasBackend`, that runs in Node
and appends to an HTML string instead of touching DOM nodes. Then:

```
renderToString(source) = build(source) → settle() the reactive graph → walk via SsrBackend → HTML
```

Wire it into `prebuild.mjs`; inject the result into the page shell. Deterministic, fast, no
Chrome, no puppeteer, no new deps. The language's own discipline makes this work: **no DOM in
`{ }` bodies** (every reactive expression is pure/Node-portable), **static constraint deps**
(the graph is analyzable off-browser), **backend neutrality** (the seam exists).

### The measurement wall — deferred, not blocking

`measure.ts` measures text via `canvas.measureText` — the one browser dependency, needed only
for **layout** (wrapping, `contentWidth`/`contentHeight`). For SEO we don't lay out — we emit
**flow HTML in tree order**, so measurement is simply not invoked.

If a faithful *visual* no-JS render is ever wanted, measurement is solvable offline: the
`system-ui` stack resolves to a small, enumerable set (SF Pro / Segoe UI / Roboto + fallbacks),
each measurable **once** into a baked advance-width table (via `opentype.js` on the font file,
or a one-time measurement pass), then `measure.ts`'s primitive is swapped for the table in Node.
Residual imperfection is per-viewer-OS variance + hinting — fine, and the live app re-lays-out on
load anyway. **Deferred:** first paint from the precompiled artifact is already effectively
instant, so a build-time visual render buys little today. Parked until it doesn't scale.

## Semantics without DOM-think (the crux)

Forcing authors to write `<h1>`/`as="h1"`/`outline: 1` is the CSS/DOM regression Declare exists
to avoid. But three things get us most of the way with **zero developer annotation**:

**1. Links are free.** The compiler already knows which components `navigate` (a URL is in the
tree), so `<a href>` is emitted automatically. Links are disproportionately valuable to crawlers.

**2. Semantics lives in STANDARD components, carried by base classes, inherited.** You can't map
an arbitrary user class to a tag — but you don't have to. A small set of semantic **content
components** in the standard library carry the role; a user's `class Heading extends Title`
inherits it and just restyles. The role is authored **once**, by the library, never per use.
The corollary is a quality bar: the standard components must be good enough that people reach
for them instead of raw `View`.

**3. Outline from STRUCTURE, not numbers.** This is the piece that removes the annotation
entirely. A **sectioning** component establishes document depth; a `Title` takes its level from
how deeply its section is nested — computed at emit time, never written:

```
Section [                                   // level 1
  Title [ text = "Read it. Generate it. Run it." ]   →  <h2>
  Body  [ text = "…" ]                               →  <p>
  Section [                                 // nested → level 2
    Title [ text = "Analyzable" ]           →  <h3>
  ]
]
```

Nobody writes `1`/`2`/`3`. You nest content the way you already do; the outline falls out and
stays correct under reordering. (This is the HTML5 outline algorithm browsers never shipped —
deliverable here because Declare controls the whole render.) Authors steer the outline by *which
container they choose*: only a few components (`Section`/`Article`) are "sectioning"; layout
grouping (`Row`/`Card`) is not, so it doesn't bump heading levels. Decorative pieces (an eyebrow,
a section-number `01`) carry **no** role and stay `<span>`/`aria-hidden` — the model shouldn't
pretend everything is semantic.

## The brochureware content-component family

A **document/content** family distinct from the app-widget family. Dual-purpose: people use it
because it's the natural way to author content, and semantics + accessibility fall out for free.

| Component | Emits | Role |
|---|---|---|
| `Section` / `Article` | `<section>`/`<article>` | sectioning — deepens the outline; a landmark |
| `Title` | `<h1>`–`<h6>` | level from enclosing section depth |
| `Body` / `Prose` | `<p>` | paragraph text |
| `Link` | `<a href>` | (also inferable from `navigate`) |
| `List` + `Item` | `<ul>`/`<ol>` + `<li>` | |
| `Nav` / `Header` / `Footer` / `Main` | landmarks | screen-reader + crawler regions |
| `Figure` / `Quote` | `<figure>`/`<blockquote>` | richer content |

The app family (buttons, inputs, bars) stays as-is → divs, with ARIA where interactive
(`role="button"`, etc.) — a parallel a11y win. Two families, one library, both building on
`Text`/`View`.

### Prose escape hatch: the `Markdown` component

For blog/docs/long-form, the existing `Markdown` component (see `text-and-markdown.md`) is the
zero-effort semantic path: the Markdown source is inherently structured (`#`→h1, `-`→li,
`[](…)`→a), the parser already has the AST, so on the SSR path it emits semantic HTML directly.
Brochureware thus has two content modes — **designed layouts** (the content family) and **flowed
prose** (`Markdown`) — neither needing a tag or a number.

## Coexistence with the live app

The prerendered content and the live app must not both render. Options, cheapest first:
- **Hidden crawlable block** removed on boot — a `visibility:hidden` node the crawler reads and
  the human never sees (no flash). Sufficient for SEO.
- Visible snapshot removed on boot (the experiment) — gives a pre-JS first paint but flashes on
  a viewport that isn't the capture width.
- True **hydration** (the live runtime adopts the server DOM instead of rebuilding) — a larger
  runtime change; only worth it if the SSR HTML should *be* first paint. Not needed for SEO.

## Fidelity ladder

| Rung | What | Effort | Dynamic text? |
|---|---|---|---|
| A. Static extraction | compiler emits literal text + structure, no runtime run | small | literals only |
| **B. SSR, text+structure** ⭐ | run runtime in Node via `SsrBackend`, settle, emit flow HTML | medium | ✅ |
| C. SSR + approx layout | + baked font metrics; emit rough geometry | large | ✅ |
| D. Pixel-exact no-JS | infeasible for system fonts | — | — |

**Target: rung B**, plus the semantic content family + auto-links. That solves SEO with no new
deps and no DOM-think. C is deferred (see measurement note); D is a non-goal.

## Open questions

- The **sectioning set + defaults** — get it right so the common case yields a sensible outline
  with no thought, and any "force a level" case is expressible structurally, never with a number.
- **Naming/scope** — `Section`/`Article`/`Region`, `Title`/`Heading`, `Body`/`Prose`; how much
  ships in the standard library vs. stays app-specific.
- **Two families, one library** — how the document family and the app-widget family coexist and
  where they share.
- **Landmarks** — components (`Nav`/`Main`) vs. a lightweight region marker; lean toward
  components ("use the thing, get the semantics").
- **The `SsrBackend`** is the easy part — it's just the reader of whatever semantic signal the
  component family carries. Design the family first.

## Non-goals / deferred

Visual no-JS render, font-metrics bake, pixel layout, hydration. All parked; revisit if the
"content in the initial HTML" floor proves insufficient or first paint stops being instant.
