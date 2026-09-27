# Slimming gates — the 2026-09-26 set

**Status: BUILT, 2026-09-26.** The exclusions added with the swatchbook pass and the rich-text
document flow, listed in one place so a rework of the slimming framework (app-slimming.md)
carries each one over. Every gate here is decided at compile time from the program — never a
runtime lazy load — and each is pinned by a test in `test/slim.test.mjs` (the block headed
"the 2026-09-26 gates"), so losing one fails a test instead of silently shipping the code
again. Sizes are gzipped, measured on production DOM builds.

## Stubbed modules (declarec's `stubFor`)

| Gate | Module | Kept when | Otherwise | Saves |
|---|---|---|---|---|
| `slim-text-clamp` | `text-clamp.ts` — a clamped Text's cut, ellipsis and hidden rest (DOM) | the program names `maxLines` anywhere: an attribute in the tree or a word in a `{ }` body (`usesTextClamp`) | `renderClamped` refuses | ~670 B |
| `slim-rich-views` | `rich-views.ts` — the rich text's view path: the manual flow, the block builders, bidi, the line budget | a **canvas** build, or a DOM build with a clamped **rich text**: `maxLines` on an element whose class chain reaches Markdown/HTMLText, or the word in any `{ }` body, whose receiver no build can see (`usesRichClamp`) | its four exports refuse | ~7.8 KB with the readback below |
| `slim-rich-doc` | `rich-doc.ts` — the block tree as one document flow | a DOM build | `docNodes` refuses (canvas lays documents out from views) | ~0.7 KB on canvas |
| `slim-dom-rich` (extended) | `dom-rich.ts` now also renders lists, quotes, code boxes, rules and tables, and reads back baseline and widest line | a rich text in the program (`usesRichText`, unchanged) | the stub gained `richBlocks = false` and `richMetrics` | — |

A stub must export every value its module does; `declarec.test.mjs` ("the production stubs
mirror every value export") fails otherwise, so a new export needs its stub line.

## Module placement (no stub — the code sits where only its users reach it)

- **Each rich-text component is its own module.** `markdown.ts` (Markdown + the `md.ts` reader),
  `html-text.ts` (HTMLText + the `html.ts` reader), over the shared engine `rich-text.ts`.
  `slim-registry` imports only the classes a program uses, so an HTMLText-only build carries
  no Markdown parser (−3.3 KB) and a Markdown-only build no HTML reader (−1.4 KB). This holds
  only while the two classes stay out of one module: a top-level `defineAttributes` keeps a
  class, and with it everything the class imports.
- **The DOM reads its rich-text facts off its own layout** (`richMetrics`: first baseline via a
  zero-size inline-block probe, widest line via line rects). That is what lets the manual flow
  leave DOM builds with the rest of the view path.
- **Font availability and demand live in `font.ts`**, which a build includes only when the
  program declares a `Font`. `font-value.ts` (in every build) keeps a hook the Font module
  fills (`provideFontDemand`). ~560 B.
- **The mask stencil's image fit (`imagePaintRect`) lives in `dom-effects.ts`**, which rides the
  existing effects gate. ~190 B.
- **The isolated draw replay** (a drawing's composite operations kept to its own layer) is
  canvas-only code in `canvas-backend.ts`, which DOM builds stub. 0 B on the DOM.

## Deliberately not gated

- **CJK and Thai line breaking** (`measure.ts` `breakUnits`, ~727 B): whether it runs depends on
  text that can arrive at run time, which no compile-time fact can see.
- **The `DomSurface` rich-text methods** (`richBlocks`, `richMetrics`): methods on a class,
  unreachable to a tree shaker; ~10 B in every DOM build. Their bodies live in `dom-rich.ts`,
  which is stubbed.

## Cost of rich text on a DOM build

A plain DOM app is 93.2 KB. Adding an HTMLText makes it 103.5 KB (+10.4); a Markdown,
105.4 KB (+12.3). Before this set both were 113.1 KB (+19.9).
