# Slimming gates — the 2026-09-26 set, in the capability manifest

**Status: BUILT.** The exclusions added with the swatchbook pass and the rich-text document
flow, now expressed as capabilities in the one manifest, `compiler/src/capabilities.ts`
([app-slimming.md](app-slimming.md) is the scheme). Each is decided at compile time from the
program — never a run-time load — and each is pinned by a test in `test/slim.test.mjs` (the
block headed "the 2026-09-26 gates"), so losing one fails a test. Sizes are gzipped,
measured on production DOM builds when the gates were added.

## The capabilities

| capability | modules | kept when | saves |
|---|---|---|---|
| `text-clamp` | `text-clamp` — a clamped Text's cut, ellipsis and hidden rest (DOM) | the program sets or writes `maxLines` | ~670 B |
| `rich-views` | `rich-views` — rich text laid out as views: the manual flow, the block builders, bidi, the line budget | a **canvas** build, or a clamped **rich text**: `maxLines` on an element whose class chain reaches Markdown/HTMLText, or named in a body of a program that constructs one (the `scoped` trigger) — a clamped plain Text does not keep it | ~7.8 KB |
| `rich-doc` | `rich-doc` — the block tree as one document flow | a DOM build | ~0.7 KB on canvas |
| `rich-dom` | `dom-rich` — lists, quotes, code boxes, rules and tables as native DOM; baseline and widest line read back | the program constructs a rich text | — |
| `font-features`, `faces` | `font-derive`, `face-literal` | an OpenType feature is set; a Face is declared | — |
| `dom-effects` | `dom-effects` — tint, mask, and the mask stencil's image fit | the program uses them | ~190 B of the fit |

A theme preset named as a literal (`theme = SanFranciscoDark`) needs no capability: the
compile resolves it to its record (`lowerThemeNames`), so the build carries that one record
and not the `themes` table, which rides only when a body names a preset.

## Module placement (no capability — the code sits where only its users reach it)

- **Each rich-text component is its own module**: `markdown.ts` (Markdown + the `md.ts`
  reader), `html-text.ts` (HTMLText + the `html.ts` reader), over the shared engine
  `rich-text.ts`. The generated registry imports only the classes a program constructs, so an
  HTMLText-only build carries no Markdown parser (−3.3 KB) and a Markdown-only build no HTML
  reader (−1.4 KB). This holds only while the two classes stay in separate modules: a
  top-level `defineAttributes` keeps a class, and with it everything the class imports.
- **The DOM reads its rich-text facts off its own layout** (`richMetrics`: first baseline via a
  zero-size inline-block probe, widest line via line rects), which is what lets the view path
  leave DOM builds.
- **Font availability and demand live in `font.ts`**, which a build includes only when the
  program declares a `Font`; `font-value.ts` (in every build) keeps the hook the Font module
  fills. ~560 B.
- **The isolated draw replay** is canvas-only code in `canvas-backend.ts`, which a DOM build
  leaves out.

## Deliberately not gated

- **CJK and Thai line breaking** (`measure.ts` `breakUnits`, ~727 B): whether it runs depends
  on text that can arrive at run time, which no compile-time fact can see.
- **The `DomSurface` rich-text methods** (`richBlocks`, `richMetrics`): methods on a class,
  unreachable to a tree shaker; ~10 B in every DOM build. Their bodies live in `dom-rich.ts`.

## Cost of rich text on a DOM build (when the gates were added)

A plain DOM app was 93.2 KB. Adding an HTMLText made it 103.5 KB (+10.4); a Markdown,
105.4 KB (+12.3). Before this set both were 113.1 KB (+19.9).
