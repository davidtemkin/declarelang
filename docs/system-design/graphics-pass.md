# The graphics pass — filters, masks, shadows, gradients, fit, and the transform model

**Status: BUILDING (David, 2026-09-12 — "worth doing literally all of this, in one
pass").** Built in a full copy of the tree (`~/Code/Declare-graphics`, no git; its own
dev server on :8300 and its own `Declare Mac Graphics.app`), to be merged into main by
hand when whole. This file is the design record and the handoff: an agent who has not
seen the conversation can build from it, and the gates say what it missed.

**Where it came from.** A pixel-level mirror of a badge-carousel site
(`my-apps/all-access`) reproduced everything except one CSS line per card —
`filter: blur(d × 1.15px) brightness(1 − d × .13)` — plus an alpha-following
`drop-shadow` on a transparent PNG, a gradient `mask-image`, a radial-gradient page
glow, top/bottom-aligned `object-fit: contain`, and an odometer digit flipping about
the X axis under perspective. The mirror shipped 36 pre-blurred bitmaps to fake the
first; David ruled that unworkable and this pass is the answer. The gap analysis with
the frost semantics is `~/Desktop/declare-view-effect-gap.md` (2026-09-12).

---

## 0. The one model

Every renderer composites a view through the same pipeline, and the pass states it
once so every new attribute has a fixed place in it:

    backdrop (sampled beneath, before paint)
      → paint (fill · stroke · image · text · draw)
      → filter (the view's own painted subtree, as a group)
      → clip
      → mask
      → opacity
      → blend (the landing)

Rules that hold for every stage:

- **Paint, never input.** No stage changes hit-testing, focus, or the crawl document.
  A blurred button is still its box; a masked-out region still takes the press.
- **View units.** Every length (a blur radius, a shadow offset, a mask gradient's
  geometry) is in the view's own units and scales with the view's transform — the
  rule `backdrop` already follows. (`d.filter` inside a drawing keeps Canvas2D's
  device-space contract; replayFiltered documents that discrepancy and it stays.)
- **Bleed.** A filter's output may extend past the box (blur 3σ, a shadow's offset +
  blur) exactly as `rasterPad` states for drawings; layout and auto-size ignore it.
- **Isolation.** A view with a `filter` or a `mask` is a new isolating boundary in
  compositing.md §4.1's list, beside `opacity < 1`: blends inside composite within it
  first, a `backdrop` inside samples its content. (And §4.1's scroller line is
  corrected to what all three renderers do — a backdrop samples THROUGH a plain
  scroller; only a scroller that contains blends forms a group.)
- **Colour space.** Encoded sRGB everywhere (the DrawReplay precedent).

## 1. `filter` — one vocabulary, two tiers

### 1.1 Surface

```declare-fragment
card:  View  [ filter = blur(3) ]
card:  View  [ filter = { [blur(d * 1.15), brightness(1 - d * 0.13)] } ]
badge: Image [ filter = shadow(0, 26, 26, 0x00000047) ]      // follows the bitmap's alpha
panel: View  [ backdrop = [blur(20), saturate(1.4)], fill = #F9F9FBDB ]
panel: View  [ backdrop = frost(20, 1.4) ]                   // the same, as sugar
```

- **`filter: Filter[]`** on `View`, default `null`. One function or a bare list; in
  `{ }` the same names are ordinary functions returning `Filter` values.
- **The functions** (each a value constructor in the `stroke()`/`shadow()` family,
  one shape each): `blur(radius)`, `brightness(k)`, `contrast(k)`, `saturate(k)`,
  `grayscale(k)`, `invert(k)`, `sepia(k)`, `hueRotate(deg)`, `tint(color)`,
  `shadow(dx, dy, blur, color)`. `k` is CSS's number (1 = identity; `saturate(1.4)`).
- **`backdrop`** takes the same `Filter[]`. `frost(radius, saturation?)` stays as a
  constructor returning `[blur(radius), saturate(saturation)]` — every existing
  program compiles unchanged. The `Backdrop` type becomes an alias of `Filter[]`.
- **`d.filter`** additionally accepts a `Filter[]` beside the CSS string (the
  recorder serializes it to the string it already records).
- **`shadow(…)` is one value, three sites.** On a View's `shadow` slot it is the box
  shadow (unchanged). In a `filter` list it shadows the group's alpha. On `Text`,
  `textShadow` is retained as sugar for `filter = shadow(…)` (one line in text.ts,
  documented as such) — no program breaks and the reference says which is canonical.
- **`tint(color)` in a filter list** generalizes `Image.tint`: the group's alpha
  wearing one colour (an icon subtree, a Text, a drawing). `Image.tint` stays as
  sugar for `filter = tint(c)`.

### 1.2 Semantics

Applied to the view's **clipped painted subtree as one group**, children included,
in list order, then clip → mask → opacity → blend. `null`/empty = no group, no cost.
A filtered view isolates (§0). Radii in view units (§0).

### 1.3 Realization

- **DOM** — `filter:` on the element, functions mapped 1:1 (`tint` = the masked
  colour layer the Image tint already builds, generalized to `mask-image` of the
  element's own rendering via `-webkit-mask` … no: `tint` on a subtree is realized as
  `filter: url(#svg)` with an `feColorMatrix` that maps every pixel to the colour and
  keeps alpha — one inline SVG filter per colour, cached). Children are DOM
  descendants, so the group is free; CSS `filter` creates a stacking context and a
  backdrop root, which is the ruling. `backdrop` = `backdrop-filter:` with the same
  function list. Radii scale with the transform.
- **Canvas** — a fourth reason for the offscreen group in `paint()`
  (`opacity < 1`, blending subtree, scroller-with-blends, **filtered**); the landing
  `drawImage(layer)` sets `ctx.filter` with lengths × the transform magnitude
  (device space). `shadow` in a list = the group blit under `shadowBlur`/`shadowColor`
  /`shadowOffset` (a shadow of the group's alpha — CSS `drop-shadow` exactly).
  `tint` = the group blit, then `source-in` fill (the Image tint path, generalized).
  WebKit (no `ctx.filter`): `canvas-filter.ts` gains `hueRotate`, `sepia` (matrices)
  and routes shadow/tint natively. **Prerequisite, built here:** group layers sized
  to the subtree's device bounds + bleed instead of the whole target (the deferred
  policy work canvas-backend names), else five blurred cards are five full-canvas
  blurs a frame. Measure like frost and record the number in §7.
- **Mac** — `layer.filters` on the node's own layer (frostprobe2 candidate A: works
  on macOS 26, unlike `backgroundFilters`), the chain composed as `applyFrostFilters`
  composes it: `CIGaussianBlur` (inputRadius = CSS sigma, unscaled — the frost
  measurement), `CIColorMatrix` for the exact CSS saturate/grayscale/sepia/invert
  matrices, `CIColorControls` for brightness/contrast, `CIHueAdjust`, and the
  encoded-sRGB tone-curve sandwich. `shadow` = the layer's own `shadowOpacity/Radius/
  Offset` with a nil `shadowPath` (follows content alpha; offset negated into y-up).
  `tint` = `CIColorMatrix` mapping RGB to the colour, alpha kept. Clip-then-filter:
  filter on the outer layer, clip on the content layer (the clip-host split).
  **Frost interplay:** Frost.swift's sampler renders nodes with `render(in:)`, which
  ignores CI filters — an effected subtree under glass is rendered through Core Image
  in the walk (a transparency layer + the filter chain), else it samples unfiltered.
- **Headless** — no-op; `NOT_APPLICABLE` seam rows.

## 2. `mask` — a soft alpha mask

```declare-fragment
fade:  Image [ mask = gradient("180deg", 0x00000000, 0x000000FF, 0x000000FF) ]  // alpha of the gradient
badge: Image [ mask = { gradient("180deg", stop(0, 0), stop(0.115, 0xFFFFFFFF), 0xFFFFFFFF) } ]
logo:  View  [ mask = { stencil } ]                                               // another view's alpha
photo: Image [ mask = image("resources/vignette.png") ]
```

- **`mask: Mask | null`** on `View`. A `Mask` is a `Gradient` (its **alpha** channel,
  over the view's box), an image (`maskImage(source, mode?)`, alpha or luminance,
  stretched to the box), or **a view reference** — that view's painted alpha, in its
  own place (it need not be visible; a `visible = false` stencil is the idiom).
- Applied after clip, before opacity (§0). A masked view isolates. Paint only.
- **DOM** — `mask-image: linear-gradient(…)` / `url(…)` with `mask-size: 100% 100%`;
  the view-reference form renders the stencil's subtree into an SVG `<mask>` … no:
  the stencil is realized by cloning nothing — the DOM backend rasterizes the stencil
  view's element to a canvas (`html2canvas` is not available; the stencil form on DOM
  is restricted to stencils that are an `Image`, a `draw()`, or a filled box, whose
  alpha the backend can produce itself) — declared limitation, seam row says so.
- **Canvas** — the group blit through `destination-in` with the mask painted into a
  scratch (gradient fill, bitmap, or the stencil subtree's own paint).
- **Mac** — `layer.mask = CALayer` (a gradient layer, an image layer, or the
  stencil node's layer rendered to a bitmap at commit); CA masks by the mask layer's
  alpha natively.

## 3. Gradients at the view tier

`radialGradient(cx, cy, r, stops…)` and `conicGradient(cx, cy, angleDeg, stops…)`
join `gradient(…)` as `Fill` values; `cx`/`cy`/`r` are fractions of the box (0…1) so
a fill re-derives under resize without a constraint. `Gradient` gains `kind`
(`linear` default); `stop()` unchanged. DOM: `radial-gradient()`/`conic-gradient()`.
Canvas + Mac: the draw tier's primitives, already replayed (`createRadialGradient`,
`createConicGradient`, and DrawReplay's swept conic). `textFill` accepts them too.

## 4. Image fit alignment

`Image.align: enum(center|start|end)` for each axis … one attribute pair: `alignX`,
`alignY` (`center` default), meaningful for `contain` and `cover` (the letterboxed
or cropped axis). DOM `object-position`; canvas the placement arithmetic; Mac
`contentsGravity` (`.resizeAspect` centres — realize via `contentsRect`/frame
placement instead, as the tint path already does).

## 5. 2D affine transform

`scaleX`, `scaleY` (default 1; `scale` stays as the uniform shorthand that sets both),
`skewX`, `skewY` (degrees). The per-view transform becomes one 2×3 matrix built in one
place (`view.ts` `pushTransform` → `setTransform(matrix, pivot)`; the old
`setScale`/`setRotation` pair retained on the seam as the two-field call for backends
that have not adopted the matrix — seam rows say which). The hit walk's inverse
(`toChildLocal`, the canvas/mac `invertTransform` twins) becomes the closed-form
inverse of the matrix — every reader (hovered/pressed/viewAt/claims/Inspector) rides
that one function. `rootTransform()` returns the matrix (the four-field form kept
alongside for callers). `apparentScale` = √|det| (the geometric mean of the axis
scales — what raster density wants). `bounds()` is the transformed box's footprint,
now of a parallelogram. DOM `transform: matrix()`; canvas `ctx.transform`; Mac
`CATransform3D` from the affine.

## 6. 3D transform — LAST

`rotateX`, `rotateY` (degrees), `translateZ`, `perspective` (a length on the PARENT,
CSS's model: the parent supplies the eye), `preserve3d` (children share the space),
`backface: enum(visible|hidden)`. The transform becomes a 4×4. Hit-testing is
projective: the pointer is unprojected along the eye ray and intersected with the
view's plane — the DOM does this natively; the canvas and Mac walks gain the
ray–plane step (Core Animation's `hitTest` already unprojects; the canvas backend
does the arithmetic). Raster density under 3D = the projected scale at the view's
centre. `bounds()` = the projected quad's AABB. Sequenced last because it changes the
walk's TYPE (affine → projective), where §5 only widens it.

**Layout footprint (found by the All Access odometer).** The exact projected box of a 3D
child depends on the parent's centre (the vanishing point) and on the child's x/y — both
outputs of the layout / auto-size that consumes the footprint, so an auto-sized reel of
`rotateX` digits cycled ("SimpleLayout[x] re-evaluated 100 times"). `footprint()` for a
3D view is now position-free by construction: the homography at x = y = 0 with the eye
over the view's own pivot. Hit-testing, `bounds()`, and paint keep the exact homography.

## 7. Verification

- Probes where the absence shows: `filter.declare` (a transparent-edged Image
  blurred over stripes — the case a backdrop cannot pass; a with-children case; a
  shadow-in-list case; a rotated case), `mask.declare` (gradient, image, stencil),
  `gradients.declare` (radial + conic), `fit.declare`, `affine.declare`,
  `transform3d.declare`. Perceptual suite (DOM vs canvas) + the Mac gate per program.
- Seam rows for every new Surface member × four backends from the first commit.
- Conformance oracle: the affine and 3D probes add hit cases (press at a point on a
  skewed / perspective-rotated view, all three renderers must name the same view).
- Cost figures recorded here as measured: canvas group-layer sizing before/after;
  a sprung blur on six cards; Mac `layer.filters` under the scroll process.

## 7a. `drawImage` in `draw()` — built 2026-09-12

The Desktop gap doc asked whether this was blocked or merely never done: never done.
A recording is plain data by construction (it crosses to the raster worker and to
the Mac host), so a live element cannot ride in an op — the op carries a **handle**:

- Source: an `Image` view (`DrawImageSource` structurally — `loaded`, `bitmap`,
  natural size). `Image.bitmap` now holds the loaded element. The body's read of
  `loaded` is the re-record trigger; unloaded → no op.
- Op: `{ op: "drawImage", h, sx, sy, sw, sh, dx, dy, dw, dh }`, always the 9-arg shape
  (the recorder resolves 3/5-arg forms from the natural size). Extent = the
  destination rect, so `exact` stays true, culling and `rasterPad` unchanged; the cost
  model weighs it 1.2× a fill.
- Handle: the Mac env's `<img>` shim already carries the bridge's `__handle`, which is
  what `DrawReplay` resolves (`bridge.image(h)`); a web element gets a registry id
  (`__drawHandle`) once. `imageStore` in draw.ts maps handle → bitmap wherever a list
  replays.
- Worker: raster-client sends `{ t: "image", h, bitmap }` once per handle (an
  `ImageBitmap` clone, transferred) and posts the raster only after the sends resolve;
  the worker registers it. A retired worker clears the sent set.
- Mac: `DrawReplay` case `drawImage` — crop y-up, draw through a local flip, under the
  live shadow/alpha/filter layer like any mark. `LayerDescribe` keeps refusing it (a
  drawn image stays a raster; the "exact under scale as a layer" route is later).
- Scaffold: three overloads on `Draw` over `DrawImageSource`; the Draw-mirror unit
  test covers the member. Probe: `my-apps/gfx/drawimage.declare`.
- Not built: `createPattern(image)`, `putImageData` (same model), `Video` frames.

## 8. Wiring inventory (the §5.0 chain of compositing.md, extended)

schema.ts (attrs, kinds) · value.ts (constructors, types, RESERVED names, equal
helpers, `coerce` arms) · compiler scaffold PRELUDE + `typeFor` · checker bare-slot
shapes · view.ts attribute table + pushers · backend.ts Surface members ·
dom/canvas/mac backends + `OP` codes + `LayerTree.applyOne` arms · Swift
(`LayerTree`, `Frost`, `DrawReplay`, `LayerDescribe`) · headless no-ops ·
test/seam.test.mjs rows · probes + baselines · docs: `View.md`/`Image.md`/`Text.md`
prose, guide ch. 6 (style) and ch. 5 (space, for transform), `assemble.mjs`
VOCAB_NOTE lines, the help hint table (`blur`/`filter`/`mask` did-you-means) ·
declare.md §9 · derive.

## 9. Log

- 2026-09-12 — tree copied; variant identity (`DECLARE_MAC_APP`, `DECLARE_CTL_PIPE`,
  `PORT`) added with unchanged defaults; :8300 serving; app building.
- 2026-09-12 — all six capabilities on DOM, canvas, Mac (probe shots agree); perceptual
  129/0; All Access mirror rewritten onto `filter`/`mask`/`radialGradient`/`alignY`/
  `rotateX`+`perspective` (baked bitmaps deleted, 36 → 6 files), diff vs the live site
  0.75 % at 1440 / 0.44 % at 1100. Found and fixed along the way: a 3D child's layout
  footprint read the parent's centre (cycle under auto-size — now position-free, §6);
  Mac text with a `lineHeight` under the font's rows clipped at the box (TextLayer.fit
  lets the rows overflow downward, as the DOM does); canvas 3D strip seams (1-row
  overlap; the filter lands once on the projected whole). `drawImage` built (§7a).
  Mac gate, 8 gfx probes vs DOM (differing / structural): filter 2.08/0.87, mask
  1.67/0.53, gradients 4.03/1.26, fit 0.23/0.18, affine 0.43/0.29, transform3d
  0.46/0.28, drawimage 0.99/0.77, tightline 0.75/0.67 — blessed as baselines.
  Probes moved to `test/probe/gfx-*.declare` on a synthetic badge
  (`test/probe/assets/badge.png`, no third-party art); my-apps/gfx deleted.

## 7b. Numeric font weights — built 2026-09-12

The mirror needed Archivo at 350 (the site's blurb) and had to cut a static instance
because `fontWeight` knew nine keywords. The keywords are CSS's names for points on
OpenType's 1–1000 `usWeightClass` line, and a variable font's `wght` axis covers it
continuously, so the number is the standard and the names are aliases:

- `fontWeight = 350` — the enum kind gains an optional `numeric: [1, 1000]`
  (`numericEnumType` in value.ts); coerce admits a whole number in range; the scaffold
  alias is `type FontWeight = "thin" | … | "black" | number`; `cssWeight()` passes a
  number through. Mac: LayerTree already parsed numbers; Overlays (rich runs) now does.
- A `Face` weight is a keyword, a number, or `range(lo, hi)` for a variable file, which
  becomes the `100 900` descriptor the FontFace API takes — one file for every weight.
  `faceWeightLiteral()` in font.ts is the single rule the builder and the checker share.
- forms.md gains the forms and two probes; Text.md and guide ch. 6 a sentence each.
- The mirror: one Archivo face `range(100, 900)`, blurb `fontWeight = 350`,
  `archivo-350.woff2` deleted (four font files, 90 KB, one under the site's 93 KB).

**Dev server validators (same day).** Static files carried no ETag/Last-Modified, so a
reload re-downloaded and re-decoded every asset (30 MB of badges). `sendFile` now sends
a weak ETag + `cache-control: no-cache` and answers `If-None-Match` with 304.

## 9a. The capability registry

`rendering-gaps.md`, beside this file in THIS tree (written 2026-09-12, moved
here 2026-09-13 — it merges into main with the rest of this work), is the record of what
every renderer can and cannot draw, including everything built here, marked as
unmerged. It also carries seven verified defects found while auditing for it,
all of which exist in main independently of this tree. Its `(G)` markers were dropped at the
merge (2026-09-14).

## 10. Merge notes (for DT's file-level merge of ~/Code/Declare-graphics into main)

**MERGED 2026-09-14** as a three-way merge (base af07c8b7, the last main commit before the
copy), not the file copy described below — this tree had also gained the text round and fonts as
objects, and main had moved on. The notes below are kept as the record of the original plan.

The copy was taken 2026-09-12 morning; `graphics.env` marks the copy time. Nothing
here was ever under git. Merge = copy the graphics tree's versions of the files
below over main, then run `node tools/internal/derive.mjs` in main.

**Changed in this tree (take the graphics version):**
- runtime/src: `affine.ts`, `projective.ts` (new); `backend.ts`, `boxpaint.ts`,
  `canvas-backend.ts`, `canvas-filter.ts`, `check.ts`, `dom-backend.ts`, `draw.ts`,
  `expr.ts`, `image.ts`, `interaction.ts`, `mac-backend.ts`, `program-schema.ts`,
  `raster-client.ts`, `raster-worker.ts`, `schema.ts`, `teach.ts`, `value.ts`, `view.ts`.
- compiler/src: `scaffold.ts`.
- mac-host/Sources/DeclareMac: `App.swift`, `Control.swift`, `DrawReplay.swift`,
  `Frost.swift`, `LayerTree.swift`, `TextLayer.swift`. **Not** `TextEngine.swift` —
  main changed it after the copy; this tree never touched it.
- mac-host: `app.mjs`, `win.mjs`, `ctl.mjs`, `gate.mjs`, `gate-baseline.json`, the
  rigs that import the variant knobs (`appbench`, `drawconform`, `kindsbench`,
  `parity`, `richbench`, `scaled-check`, `textbounds-check`, `threeway`);
  `macshot.mjs` (new, optional). `tools/internal/build-mac-app.mjs` (variant name,
  identifier suffix, `DeclareCtlPipe` key). All variant knobs default to main's
  values, so main's behaviour is unchanged.
- test: `seam.test.mjs`, `scaffold.test.mjs`, `unit.test.mjs`, `declarec.test.mjs`
  (size band), `perceptual.test.mjs`, `mac-shell.test.mjs`, `conform/*`;
  `test/probe/gfx-*.declare` (8, new) + `test/probe/assets/badge.png` (synthetic).
- docs/prose: `tools/internal/doc/prose/View.md`, `Image.md`, `assemble.mjs`
  (VOCAB_NOTE + type descriptions), `concepts.json`; `docs/guide/05-space.md`,
  `06-style.md`; `docs/declare.md`; `docs/system-design/compositing.md`; this file.
- `my-apps/all-access/` — the acceptance mirror (DT's call whether it stays).

**Three-way merge needed** — main changed these after the copy AND this tree changed
them, so copying the graphics version over main would silently revert main's work:
- `runtime/src/data.ts` — this tree: the `"filter"`/`"mask"` kinds in the value-kind table.
- `runtime/src/schema.ts`, `runtime/src/dom-backend.ts`, `runtime/src/canvas-backend.ts`,
  `runtime/src/mac-backend.ts`, `runtime/src/measure.ts`, `mac-host/Sources/DeclareMac/TextLayer.swift`,
  `mac-host/Sources/DeclareMac/LayerTree.swift` — main added `Text.maxLines` (line clamp
  with ellipsis, all three renderers) after the copy; none of it exists here. This tree
  touched every one of those files (filters, masks, transforms, numeric weights, the
  tight-line-box `TextLayer.fit`). `TextLayer.fit` must keep main's clamp: it sizes the
  layer from `lines.count`, which after the merge is the CLAMPED count.
Diff each against main by hand; take both sides.

**At merge time, uninstall the variant app.** This tree installs
`/Applications/Declare Mac Graphics.app` (its own name, identifier suffix and
control pipe, so it can run beside main's). Once the merge lands, delete that
app, rebuild main's `Declare Mac.app` so it carries this work, and drop
`graphics.env`. Nothing else references the variant.

**Do not take from this tree:** `package.json` (identical to main again),
`graphics.env` (variant identity; delete with the tree), `runtime/src/measure.ts`,
`mac-host/Sources/DeclareMac/TextEngine.swift`, `apps/homepage/stats.json` and the
`<!--stat-->` stamps in README/tenets/guide 19/building/releases (derive in main
re-stamps them from main's own numbers), `runtime/dist`, `bundles/`, `.derive/`.

**An incident to know about:** two rebuilds run here without `graphics.env`
sourced (`build:mac --force` at 11:56 and reload-dev's mac-auto at 12:04) installed
graphics code over `/Applications/Declare Mac.app`. Main's app was rebuilt from
main at 12:07 (`node tools/internal/build-mac-app.mjs --force` in ~/Code/Declare,
which also ran main's derive `--only tsc,bundles` and staged main's bundles).
Rule for the copy tree: `source graphics.env` before ANY rig or build.
