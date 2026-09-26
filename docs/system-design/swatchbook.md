# Swatchbook — one sampler that is also the rendering conformance test

**Status: BUILT, v2 (2026-09-25).** `apps/swatchbook/` — ten sections, each with its
own switch between sub-pages, and a matrix (`#matrix`) of all 683 swatches; checked by
`test/swatchbook.test.mjs` (DOM against canvas: layout exactly, pixels per swatch
against `apps/swatchbook/tests/pixels.json`) in about eight seconds, and on the Mac by
`tools/crossrender.mjs --mac`. The sections are files (`sections/*.declare`) over one
set of shared parts (`swatches.declare`). "Swatchbook" is the working name, to be
reconsidered now it exists. What follows is the design it was built from; where the
build differs, it says so.

## The problem

Rendering, measurement and layout are checked today by many small tests, each
booting a browser, building a program, rendering it and tearing it down to make
one assertion — and by gates that compare a renderer against a recorded baseline
of itself. Two things follow, and the capability pass of 2026-09-25
(rendering-gaps.md §11d) met both:

- **Coverage is accidental.** A capability is checked if someone once wrote a
  test for it. The Mac painted no per-side stroke and laid `sans-serif` out
  shorter than the browser, for as long as either existed; canvas laid mixed-size
  rich lines out taller. No test covered any of it, and an ordinary app found all
  three in a morning.
- **The gates are slow for what they check.** Most of a small test's time is the
  boot, not the check.

## The idea

One program, **Swatchbook**, that is two things from one source:

1. **The user-facing sampler** — the specimen sheet for everything a view can
   look like: type, lines, rich text, paint, effects, transforms, drawing,
   images. It replaces `textsampler` and goes wider. Each capability is shown
   and captioned, and — as `textsampler` does today — the fragment that draws it
   sits beside it.
2. **The conformance corpus** — the same cells, expanded to the full cross
   product, rendered on DOM, canvas and the Mac and compared cell by cell.

A designer's swatchbook holds every material and finish in one place.

## Cells

Everything is a **cell**: a fixed-size box holding one combination, with a
stable name (`type.helvetica.bold.64`, `effect.shadow×rich×rotate15`). A cell is
the unit of display, of comparison and of failure: a regression reads *"canvas:
`rich.mixed.lh1` 12px taller"*, never *"4.4 % of the frame"*.

Cells are **data**. Each section is a `Dataset` of rows — the axes of that
section and their values — and a replicated `Cell` class draws a row. That is
what lets one source serve both views:

- **Section view** (what a person sees): one section at a time, and within it one
  sub-page at a time, chosen by the section's own switch — Transforms has Scale,
  Rotate, Skew, Pivot, Combined and 3D. (Built this way in v2, in place of the
  `featured` rows first proposed: every case is on some sub-page, so nothing a
  person can see is left out of the gate, or the other way round.)
- **Matrix view** (what the gate runs): every row — the cross product of the
  section's axes. A route (`#matrix`, or `#matrix/effects`) switches to it; it is
  visible to anyone who asks, since it is also the most complete demonstration
  of what renders where.

## Sections and axes

| section | axes (each a column in the section's data) |
|---|---|
| Type | family (generic `sans-serif`/`serif`/`monospace`, `system-ui`, a named system face, a declared web face) × weight × italic × size × letterSpacing × textTransform × smallCaps × numerals |
| Lines | lineHeight (tight, 1, open) × wrap × maxLines × align × `align = baseline` across faces and sizes |
| Rich | Markdown and HTMLText: mixed sizes on one line, styled runs, solid and gradient fills, links, lists, tables, code, inline views, a natural-width line |
| Paint | fill (solid, linear, radial, conic) × cornerRadius (none, one, four) × stroke (none, uniform, per-side) × shadow |
| Effects | filter (each function, a chain) × backdrop × blend (all modes) × mask (gradient, view) × opacity |
| Transforms | scale × rotation × affine × 3D |
| Drawing | the `draw()` vocabulary, op by op (today's drawconform rig) |
| Images | stretches (all six) × align × tint |
| Combinations | a content axis (Text, rich, image, drawing) × an effect axis × a transform axis — where the renderers' paths actually meet |

The combination section is the one no set of single-feature tests can reach, and
the one the capability pass could not afford to write by hand.

## What the gate checks

Two instruments, both per cell:

1. **Layout — exact.** `tools/crossrender.mjs` (built, see below) dumps every
   view's box, and every text view's first baseline, from the running model on
   each renderer and diffs them against the DOM's. A measurement difference is a
   number with a name; nothing is lost to anti-aliasing. Default tolerance 1px.
2. **Pixels — per cell.** Each cell's region compared across renderers (canvas
   against DOM, Mac against DOM), each against a recorded per-cell baseline.

**Sensitivity is measured, not assumed.** A cell earns its place by showing that
removing its capability changes it past the tolerance — the check the pass ran
on `seams-box`/`seams-text`, where the first draft was too small to see a missing
6px bar. The harness can run it mechanically: render the cell with the feature
stripped, confirm the diff trips.

**Deterministic by construction.** No clock, no randomness, no network. The web
faces are shipped with the program. System faces differ between machines, so
they are one section with its own tolerance, not threaded through the rest.

## What it replaces

Once a cell covers what a small test asserts, the small test goes — after the
mapping is written down, never on the assumption. First candidates, each to be
checked cell by cell:

- `perceptual.test.mjs` — 97 hand-built pixel checks of DOM against canvas
- `text.test.mjs`, `richtext.test.mjs`, `canvas-filter.test.mjs`, the
  paint-side cases of `inline-views.test.mjs`
- the Mac gate's single-feature probes (`seams-*`, `gfx-*`, `textfixes`, `text`)

Logic tests — the compiler, the reactive core, parsing — stay; this replaces
rendering checks only. Gate time is measured before and after; the claim that one
boot per renderer beats one per assertion is to be shown, not asserted.

## The harness (built)

`tools/crossrender.mjs <file | dir>… [--mac] [--tol px] [--json out]` loads each
program from the dev server on DOM and canvas (`?render=canvas`) and, with
`--mac`, in the native host; walks the model through the inspector
(`__declare.inspect`: real class names, declared names in the path, boxes in root
coordinates); and reports each view whose box or baseline differs from the DOM's,
with its path, text and deltas. A view that moved only because its parent moved
is reported once, at the parent. Rich text's internal pieces are skipped — the
canvas lays a flow out as child views where the DOM and the Mac flow it
natively — so the flow's own box is what is compared.

Its first job, before Swatchbook existed, was the sweep of every app and guide demo.
With `--pixels` it renders a 3000×16000 page, so the whole matrix is on screen at
once, and reads every swatch out of one screenshot per renderer.

## What v1 found

Its first run found three renderer defects no test had (rendering-gaps.md §11d,
E16–E18): canvas left an image blank whose bitmap landed inside a plain or
blending parent; the DOM dropped `capitalize`'s first capital after any other text;
a DOM gradient text fill spanned the letters instead of the box.

v2 (every primitive, the combinations, 683 swatches) found fifteen more, E19–E33:
a drawing's compositing operator reaching the scene under it on canvas; a drawing's
`setTransform` escaping its placement; no line break inside CJK or Thai text in the
shared measurer (so the DOM's measured heights were short as well), and a break after
`/` neither engine makes; no bidi reordering in the canvas rich flow; a filtered
clipping view's shadow cut off on canvas; a 3D view's box shadow dropped and its
strips banding; `translateZ` composed in a different order by the homography than by
the DOM and the Mac; and five smaller ones. Three findings wait for a decision (the
DOM clamp's ellipsis under centre or right alignment, features on the system face,
rich text's body colour), listed there.

The Mac pass (`--mac --pixels`: the matrix paged on the host's window against a
Chrome page of the same size at 2×, the window captured by its own number, P3
converted to sRGB) found twenty-one Mac defects, M1–M21 — blend modes
and every gradient in linear light, frost sampling past its box, a radius past half
the box painting nothing, a drawing's filter and `setTransform` ignored, Core Text's
line breaks, a per-family weight scale that picked condensed faces — all fixed; and
two places where Chrome, not the Mac, is the outlier (emoji advances, system-face
features), established with WebKit as the third reference (`mac-host/webkitshot`).
It needs an unlocked session: WindowServer gives no window images while the screen is
locked, and the host's display link stops, so nothing animated advances. Its baseline is
`apps/swatchbook/tests/pixels-mac.json`:

    node tools/crossrender.mjs apps/swatchbook/swatchbook.declare --hash matrix --mac --pixels \
      --baseline apps/swatchbook/tests/pixels.json --mac-baseline apps/swatchbook/tests/pixels-mac.json

## Open questions

1. The name.
2. Does Swatchbook also absorb `apps/sampler` (the component sampler), or only
   `textsampler`? The component sampler is about controls and states, not
   rendering; my inclination is to leave it.
3. Is the matrix view a user-facing route, or gate-only? (Proposed: visible.)
4. Where does the per-cell pixel comparison run for the Mac — inside `gate.mjs`
   (which already drives the native host), or in crossrender with `--pixels`?
