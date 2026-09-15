# Fonts

A typeface is an **object in the tree** — a `Font` owning `Face` children — and a family
slot holds it. This replaced the top-level `font Name [ … ]` declaration (2026-09-14);
the old form still parses so the checker can name the new one. Design background, not
binding: the reference (`Font`, `Face`) and the guide's Fonts section are the contract.

## The shape

```
App [ fontFamily = { [brand, "Helvetica", "sans-serif"] },
    brand: Font [ wait = 800,
        Face [ src = [local("Work Sans"), "ws-400.woff2"] ],
        Face [ src = "ws-700.woff2", weight = bold ] ],
    serif: Font [ Face [ src = "serif-var.woff2", weight = range(200, 900) ] ],
    ui:    Font [ family = "Helvetica Neue" ]            // a system font: no faces
    …
```

- **A family owns its faces** — the container shape OpenLaszlo's `<font><face/></font>`,
  Android's `FontFamily` and Flutter's `pubspec` use, chosen over CSS's flat,
  string-grouped `@font-face` rules because a named container has no hidden grouping rule.
- **Web and system fonts are one object type.** A Font with faces loads them; one with no
  faces names a `family` the machine has. Symmetry is the point: a slot that holds one
  holds the other, and switching between them is an assignment.
- **`Face [ src, weight, italic ]`**: `src` is a URL, `url("…")`, `local("…")`, or a list
  tried in order; `weight` is a token, a number 1–1000, or `range(lo, hi)` for a variable
  file; `italic` marks the slanted face.

## Why an object, not a declaration

The declaration made a font a **name resolved once**, at instantiate, to a family string.
Nothing could depend on it afterwards, so:

- a font could not be chosen in a `{ }`, a method or a style (only the family *string*
  could, bypassing the declaration);
- a face landing late had no value to change — the platform had to track it underneath
  (the face table), invisibly to the compiler;
- a `draw()` or a measurement had no way to follow a font at all.

As an object, a font is an ordinary value with ordinary reactive facts, like an `Image`
or a `DataSource`. `fontFamily = { app.reading }` depends on `app.reading`; a drawing that
reads `app.brand` depends on it; `app.brand.loaded` is a fact a constraint reads. No
special name resolution, no program-scope live values.

**Why not keep it top-level for component libraries?** A component gets its face through
the provided `fontFamily` its App sets, which needs nothing new; a component that truly
owns a face (an icon font) holds a `Font` child. **Why not compile-time visibility?** A
literal `src` is as visible to the build in a tree node as in a declaration, and the build
already runs the app headless to extract it, so it can see exactly which fonts exist at
start.

**Lifetime is placement.** A font on the App lives for the program; inside a view it lives
with the view, and its faces are withdrawn when the view retires (the web's font set has
`delete()`; the native host unregisters).

## Registration

A web Font registers its faces under a name of its own, `declare-font-<id>-<generation>`,
never under an author string: two fonts cannot collide, and a changed `src` loads a new
generation beside the faces it replaces, so text keeps the old face until the new one is
ready. The text machinery asks the font what family it names **now** (font-value.ts) —
its registered name, or a system font's family — and features (OpenType figures) derive
from that name as from any family.

## Loading: `wait` and `late`

Whenever something is about to be drawn in a font whose faces have not arrived, the font
answers two questions:

- **`wait`** (ms, default 500) — how long whatever is about to change to this font keeps
  its current look: the app's **first paint** (the start-up gate waits for the fonts the
  tree starts with, each up to its wait); a **slot switching** to a font still loading
  (the slot holds the new font at once; the text it drives keeps its previous family and
  changes once, when the font settles); a **source change** (text keeps the old face).
- **`late`** — `swap` (a face arriving after the wait is used: one redraw) or `keep` (the
  fallback stays for the run; `loaded` stays `false`).

Per font, because the font being loaded is what knows whether it is worth waiting for (an
icon font's wrong glyphs are worse than a delay; body text's fallback is fine). Text is
never hidden while it waits: controls size themselves from text, so something always stays
drawn.

Alternatives weighed: two CSS-style periods (block + swap: expressive, but two interacting
numbers); CSS's keywords (familiar, but fixed timings); no attributes with the program
gating on `loaded` (the "Nothing waits" model, but it cannot hold the first paint and every
app writes its own timeout — it remains available as an escape hatch).

## Facts: `loaded`, `failed`

Per font, like an `Image`'s pair: `loaded` once every face has arrived (a system font from
the start), `failed` when a face could not be fetched; both `false` while loading. Per family
rather than per face, because text depends on the font as a whole and face selection (weight,
slant) happens inside measurement.

## Measuring and drawing text

`measureText(text, style, width?)` and `d.fillText(text, x, y, style)` take a style record —
a `style` bundle or an inline record of `Text` attribute names. Fields left out take plain
defaults, never inherited ones, so a measurement means the same wherever it is called; a
drawing that wants its panel's face asks with `provided("fontFamily")`. A Font in the style is
a tracked read, so a constraint or drawing re-runs when its faces land or the font changes.

## Not yet

Preloading faces alongside the app's own code (so they usually arrive before first paint) is
proposed, not built. Per-face `stretch`, `unicode-range` subsetting and multiple `url()` format
alternates are further `Face` attributes when needed. Semantic type roles (Dynamic Type) are not
the font primitive's job.
