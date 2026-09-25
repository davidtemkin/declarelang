# Rendering capability registry

What the three renderers can and cannot draw, as of 2026-09-12. Written when the
graphics pass was set aside, so the state of the work survives the pause.

**Scope.** Everything visual: box paint, compositing, transforms, images, text,
and the `draw()` vocabulary. Input, layout and data are out of scope except
where they change pixels.

**Sources.** Two read-only audits of the code plus hand verification of every
defect listed in §11. Where a claim was not verified by running it, it says so.

## How to read this

| column | meaning |
|---|---|
| status | `done`, `partial`, `absent` |
| DOM / canvas / Mac | that renderer's state: ✓, partial, ✗ |
| P | priority for anything not `done`: P1 next, P4 someday. Absent for `done` rows |

**The graphics pass and the text round merged into main on 2026-09-14** (they were built in a
tree copy, `~/Code/Declare-graphics`); rows once marked `(G)` for that tree are ordinary rows now.

**The priority rubric,** applied the same way in every category:

1. **Application value.** Does an ordinary app break, jitter, or look wrong
   without it? Highest weight. A missing capability that shows up as a bug report
   outranks one that shows up as a preference.
2. **Web utility.** How often real sites reach for it. Measured against the
   All Access mirror, which is one honest sample of a design-led site: every gap
   it forced is marked **[mirror]** below.
3. **Reach.** Whether it is missing everywhere or on one renderer. A one-renderer
   hole is cheaper to close and more embarrassing to leave.
4. **Cost.** Plumbing versus design. Anything needing a new measurement path,
   a new value type, or a decision about semantics costs more than a pass-through.

There is no separate "editorial versus app" axis. Declare is positioned for
design-intensive applications, and typography is where that positioning is tested,
so a capability that serves content-heavy interfaces counts as application value.

---

## 1 · Box paint

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| fill, solid | done | ✓ | ✓ | ✓ | | |
| fill, linear gradient | done | ✓ | ✓ | partial | | Mac resamples stops into 64 steps because Core Animation interpolates straight and CSS premultiplies |
| fill, radial gradient | done | ✓ | ✓ | partial | | Mac maps the circle onto Core Animation's ellipse, so a non-square box diverges. **[mirror]** |
| fill, conic gradient | done | ✓ | ✓ | partial | | Mac reverses the stop list to undo its counter-clockwise sweep; worst Mac baseline of the pass at 4.03% differing |
| cornerRadius, uniform and per-corner | done | ✓ | ✓ | partial | | four distinct radii leave the Mac compositor for a shape layer |
| stroke, width and color | done | ✓ | ✓ | ✓ | | DOM realizes it as an inset zero-blur shadow, not a border, so children do not shift |
| shadow, single outer | done | ✓ | ✓ | ✓ | | Mac uses blur/2 as an approximation of the CSS radius |
| shadow escapes the view's own clip | done | ✓ | ✓ | ✓ | | |
| cursor | partial | ✓ | ✓ | partial | P3 | Mac maps a keyword subset and sends everything else to the arrow. One-renderer hole, small fix, low blast radius |
| multiple shadows | absent | ✗ | ✗ | ✗ | P2 | Layered shadows are the standard way to build elevation in a design system. One value-type change, then three pass-throughs |
| inset shadow | absent | ✗ | ✗ | ✗ | P2 | Inset is how pressed states, wells, and inputs read as recessed. Same change as above, so they land together |
| shadow spread | absent | ✗ | ✗ | ✗ | P2 | Third field of the same record; pointless to defer separately |
| background images and tiling | absent | ✗ | ✗ | ✗ | P3 | Textures, noise, and repeating patterns. Needs a new Fill arm and a tiling rule on three renderers |
| per-side borders | done | ✓ | ✓ | ✓ | — | `stroke = [top, right, bottom, left]`; each side is the box minus a copy shifted in by its width (stroke-sides.ts), so on a rounded box a band tapers into the corner arc. The Mac paints the bands as shape layers under the content |
| border style (dashed, dotted) | absent | ✗ | ✗ | ✗ | P3 | Dashed and dotted rules appear in editors, tables and empty states. Today the workaround is a drawing |
| repeating gradients | absent | ✗ | ✗ | ✗ | P4 | Rare outside decorative work, and a drawing covers it |
| border-image | absent | ✗ | ✗ | ✗ | P4 | Rare in application UI |

## 2 · Compositing

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| opacity, group semantics | done | ✓ | ✓ | ✓ | | |
| blend, the seventeen modes | done | ✓ | ✓ | partial | | Mac approximates plus-lighter with an addition filter |
| backdrop (frost) | done | ✓ | ✓ | ✓ | | Mac cannot use `backgroundFilters` on this macOS and runs its own capture and blur |
| backdrop, full filter list | done | ✓ | ✓ | partial | | a `shadow(…)` inside a backdrop list is silently skipped on Mac |
| filter, ten functions | done | ✓ | ✓ | ✓ | | **[mirror]** the gap that stopped the mirror |
| filter, `shadow(…)` in a list | done | ✓ | ✓ | partial | | Mac honours only the first shadow and always as the layer's own |
| filter, `colorize` | done | ✓ | ✓ | ✓ | | canvas always applies it first, ignoring its position in the list |
| mask, gradient | done | ✓ | ✓ | ✓ | | **[mirror]** |
| mask, stencil view | partial | partial | ✓ | ✓ | P3 | DOM accepts only an Image or a drawing as the stencil and warns once. Canvas ignores the stencil's own transform; Mac ignores filters on it |
| clip, box and path | done | ✓ | ✓ | ✓ | | canvas does not apply a shape clip to a 3D view |
| filter on WebKit | partial | — | partial | — | P2 | `ctx.filter` is accepted and ignored by WebKit, so canvas runs a pyramid fallback that is resample-only while moving and exact at rest. Safari is a first-class target |
| mask from an image file | absent | ✗ | ✗ | ✗ | P3 | Designed in the graphics pass and not built. A PNG alpha mask is the common asset-driven case |
| luminance masks and mask-composite | absent | ✗ | ✗ | ✗ | P3 | Add, subtract and intersect compose two masks; today the workaround is a stencil view |
| clip-path shape functions by name | absent | ✗ | ✗ | ✗ | P3 | `inset()`, `circle()`, `polygon()` are readable where raw path data is not. Pure sugar over an existing capability |
| isolation as an author attribute | absent | ✗ | ✗ | ✗ | P4 | Deliberate for v1; implicit boundaries exist |
| SVG filter graphs | absent | ✗ | ✗ | ✗ | P4 | Turbulence, displacement, lighting, morphology. Real design work, no Mac equivalent, large surface |

## 3 · Transforms

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| scale, rotation, pivot | done | ✓ | ✓ | ✓ | | |
| scaleX, scaleY, skewX, skewY | done | ✓ | ✓ | ✓ | | one matrix, one seam call |
| rotateX, rotateY, translateZ | done | ✓ | partial | ✓ | | canvas projects in up to 120 strips: exact along rows for rotateX, close otherwise |
| perspective on the parent | done | ✓ | ✓ | ✓ | | **[mirror]** the odometer |
| backface hidden, paint and hit | done | ✓ | ✓ | ✓ | | |
| hit testing under every transform | done | ✓ | ✓ | ✓ | | one inverse shared by paint, hit walk and bounds |
| 3D view keeps shadow, backdrop, clip | partial | ✓ | ✗ | ✓ | P2 | canvas loses the box shadow and the backdrop sample on a 3D view, and cuts children to the box. Silent divergence between renderers of the same program |
| nested 3D sharing one space (preserve-3d) | absent | ✗ | ✗ | ✗ | P2 | Card flips, carousels and any composed 3D scene. Each child flattens into its parent's plane today |
| perspective-origin | absent | ✗ | ✗ | ✗ | P3 | Hard-coded to the parent centre. One number, three renderers, unlocks off-centre scenes |
| rotate3d, matrix3d, scaleZ | absent | ✗ | ✗ | ✗ | P3 | Arbitrary-axis rotation. The common cases are covered by X and Y |
| motion along a path | absent | ✗ | ✗ | ✗ | P4 | Animation surface, not a transform primitive |

## 4 · Image and media

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| stretches: cover, contain | done | ✓ | ✓ | ✓ | | |
| stretches: none, width, height, both | partial | ✓ | ✓ | ✗ | P1 | **Defect D4.** Mac tests for a token the runtime never sends, so all four become aspect-fit. Wrong pixels for ordinary images, one line to fix |
| alignX, alignY | done | ✓ | ✓ | ✓ | | **[mirror]** |
| tint | done | ✓ | ✓ | ✓ | | |
| tint on video | absent | ✗ | ✓ | ✗ | P4 | DOM says out loud that a video frame is not a mask source |
| load facts | done | ✓ | ✓ | ✓ | | |
| video placement | done | ✓ | ✓ | ✓ | | Mac keeps frames native; they never cross the bridge |
| object-position as a percentage | absent | ✗ | ✗ | ✗ | P3 | Alignment covers start, centre and end. Arbitrary focal points are the remaining case |
| srcset and density selection | absent | ✗ | ✗ | ✗ | P3 | Bandwidth, not looks, but it is what ships a 30 MB page instead of a 6 MB one |
| image-rendering: pixelated | absent | ✗ | ✗ | ✗ | P4 | Sprite art and zoomed inspection |

## 5 · Text: the face

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| color, size, family, letterSpacing, italic | done | ✓ | ✓ | ✓ | | |
| web fonts (`Font` objects) | done | ✓ | ✓ | ✓ | | 2026-09-14: a font is an object in the tree (the top-level `font` declaration is retired); each web `Font` registers its faces under its own generated name (`declare-font-<id>-<generation>`), and that name is the key on every renderer. FIXED 2026-09-13 (`FontRegistry.swift`): Core Text reads WOFF2 directly and a descriptor built from the bytes needs no process registration, so nothing is installed system-wide; a subset file often carries no name and a variable file reports one name for every instance, which is why the registered name, not the file's, is the key |
| fontWeight keywords | done | ✓ | ✓ | partial | | Mac approximates named-font weights through the font manager |
| fontWeight numeric, 1 to 1000 | done | ✓ | ✓ | ✓ | | **[mirror]** |
| Face `weight = range(lo, hi)` | done | ✓ | ✓ | ✓ | | variable-font descriptor; the Mac host varies the file's `wght` axis (FontRegistry) |
| smallCaps | done | ✓ | ✓ | ✓ | | FIXED 2026-09-13 (D1): the Mac parser consumes the CSS variant slot, so measure and paint agree. Still SYNTHESIZED on Mac where the web pair uses the face's own feature — §12 |
| underline, strike | done | ✓ | partial | partial | | canvas draws its own lines; Mac loses them under a gradient text fill |
| textShadow, outline | done | ✓ | ✓ | partial | | Mac loses both under a gradient text fill |
| textFill, gradient | done | ✓ | ✓ | ✓ | | canvas spreads the ramp over the box, Mac clips to glyph outlines |
| textFill, solid | absent | ✗ | ✗ | ✗ | P3 | **Defect D5.** The schema promises it and no renderer implements it. Either build it or correct the schema |
| tabular and lining numerals | done | ✓ | ✓ | ✓ | | **[mirror]** BUILT 2026-09-13 as `numerals` / `numeralWidth` / `slashedZero`, on Text and on rich-text runs. The features ride the FAMILY NAME, which is how the shared measurer comes to see what paints — §11c |
| other numeric variants, ligatures, stylistic sets, alternates | absent | ✗ | ✗ | ✗ | P2 | Now genuinely cheap: one row in `featureTags` each, since the measurement path exists and both sides read tags. Held until something asks |
| variable axes beyond weight | absent | ✗ | ✗ | ✗ | P2 | Width and optical size. Optical sizing visibly improves display text, and the axis machinery now exists for weight |
| all-small-caps, petite caps, unicase | absent | ✗ | ✗ | ✗ | P3 | |
| font-stretch, synthesis control, kerning off | absent | ✗ | ✗ | ✗ | P3 | |
| font-size-adjust | absent | ✗ | ✗ | ✗ | P4 | Keeps a fallback face optically matched to the intended one |

## 6 · Text: layout and truncation

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| wrap, textAlign left/center/right | done | ✓ | ✓ | ✓ | | three different line breakers: browser, shared `wrapLines`, Core Text |
| lineHeight on Text | done | ✓ | ✓ | ✓ | | FIXED 2026-09-13 (D7): the Mac host reads it and pitches its lines by it; pinned by the gate's `test/probe/text.declare` |
| maxLines, clamp with ellipsis | done | ✓ | ✓ | ✓ | | three different truncation rules: browser line-clamp, whole words, Core Text characters |
| `maxLines` on RichText | done | ✓ | ✓ | ✓ | | BUILT 2026-09-13: one budget apportioned across a document's flows and structural blocks; canvas drops views, DOM and Mac clamp natively through `setRichClamp`. §11b |
| a fact reporting that truncation happened | done | ✓ | ✓ | ✓ | | BUILT 2026-09-13: `truncated`, read-only, on `Text` and on `RichText` — what a "Show more" binds to |
| middle truncation | absent | ✗ | ✗ | ✗ | P2 | File names, paths and addresses in lists. CSS has no equivalent, so this is a place Declare can be better rather than equal |
| break long unbroken strings | absent | ✗ | ✗ | ✗ | P2 | URLs and tokens overflowing their box is a bug report in chat and data apps |
| balanced and pretty wrapping | absent | ✗ | ✗ | ✗ | P2 | Headlines, dialogs, buttons. Native on DOM; canvas and Mac need a width search |
| preformatted whitespace and tab size | absent | ✗ | ✗ | ✗ | P2 | Code and log views today lose their indentation |
| full justification | absent | ✗ | ✗ | ✗ | P3 | **Named 2026-09-14 (DT's ruling, replacing `justified` of 2026-09-13): the value is `textAlign = justify`,** CSS's word, so CSS knowledge carries over. Weighed and accepted: `WrappingLayout` already uses `justify` as an ATTRIBUTE (`justify = fill`), so the one word is an attribute there and a value here; and "left-justified" is ordinary speech for `left`. Not `fill`. `declare-help justify` currently answers only with the WrappingLayout attribute; once built, it needs the `textAlign` value too. Needs hyphenation or it opens rivers: native on DOM and Mac, a dictionary on canvas, so the three would agree on breaks and differ in quality. Meaningless without a bounded width — the guard `wrap` already has. On canvas a plain `Text` needs word-by-word painting; inside a flow the line's free space is already computed for centre and right. |
| text indent, hanging punctuation | absent | ✗ | ✗ | ✗ | P3 | |
| sub and superscript | absent | ✗ | ✗ | ✗ | P3 | Units, footnotes, formulae |
| right-to-left and bidirectional text | absent | ✗ | ✗ | ✗ | see note | Not ranked with the rest. It touches layout, selection, caret movement and mirroring, so it is its own arc. Any app shipping to Arabic or Hebrew readers needs it, which makes it a strategic decision rather than a line item |
| vertical writing modes | absent | ✗ | ✗ | ✗ | P4 | |
| decoration style, thickness, offset, color | absent | ✗ | ✗ | ✗ | P3 | Link styling and wavy validation marks. Ubiquitous in design systems, easy to live without |

## 7 · Text: rich and HTML

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| markdown structure and styling | done | ✓ | ✓ | ✓ | | resolved in the model, so most attributes cannot diverge |
| inline images | done | ✓ | ✓ | ✓ | | |
| links and the link event | done | ✓ | ✓ | ✓ | | |
| selection | partial | ✓ | ✗ | ✓ | P3 | canvas lays prose out as separate views and cannot select across them |
| run colors with alpha | partial | ✓ | ✓ | ✗ | P2 | **Defect D6.** Mac rich runs decode a translucent color with the wrong decoder, shifting the channels |
| run weights | partial | ✓ | ✓ | partial | P2 | Mac rich runs recognise four weights; the rest render at 400 |
| paragraph line height | partial | ✓ | ✓ | partial | P3 | one large span sets the line height for its whole paragraph on Mac |
| heading anchor reveal | partial | ✓ | ✓ | ✗ | P3 | |
| HTMLText tag set | partial | ✓ | ✓ | ✓ | P3 | No `img`, `u`, `sub`, `sup` or `table`. Same everywhere, which makes it a surface decision rather than a divergence |

## 8 · Drawing: `draw(d: Draw)`

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| paths, rects, fills, strokes, dashes | done | ✓ | ✓ | ✓ | | one shared path implementation on the Mac side |
| gradients, linear and radial | done | ✓ | ✓ | ✓ | | the Mac layer path refuses the two-circle focal form and rasterizes instead |
| conic gradient | done | ✓ | ✓ | partial | | swept by hand as wedges on Mac |
| shadows | done | ✓ | ✓ | ✓ | | |
| clip, save, restore | done | ✓ | ✓ | ✓ | | |
| text | done | ✓ | ✓ | partial | | see D2 |
| `drawImage` from an Image view | done | ✓ | ✓ | ✓ | | |
| `d.transform(a…f)` | partial | ✓ | ✗ | ✗ | P1 | **Defect D3.** Both Mac readers look for the wrong keys and get a zero matrix. Silent collapse |
| `d.rotate()` through the layer path | partial | ✓ | ✓ | partial | P1 | **Defect D3.** The layer describer reads the wrong key, so the same drawing rotates when rastered and not when described |
| `strokeText` | partial | ✓ | ✓ | ✗ | P2 | **Defect D2.** Mac fills instead of stroking |
| `globalCompositeOperation` | partial | ✓ | ✓ | partial | P2 | Mac maps 22 tokens; lighter, destination-over, source-out and destination-atop fall back to normal |
| `d.filter` beyond blur | partial | ✓ | ✓ | partial | P2 | Mac parses only `blur()`. Brightness, contrast, saturate and drop-shadow are ignored |
| `d.filter` taking a value list | absent | ✗ | ✗ | ✗ | P3 | The design record claims this is built; it is not. Correct the record or build it |
| `setTransform`, `resetTransform` | partial | ✓ | ✗ | ✗ | P3 | Ignored on Mac rather than corrupted, deliberately |
| `imageSmoothingEnabled` | partial | ✓ | ✓ | ✗ | P3 | |
| `createPattern`, `putImageData` | absent | ✗ | ✗ | ✗ | P3 | Same handle model `drawImage` now uses |
| canvas reads: `measureText`, `getImageData`, hit tests, getters | absent | ✗ | ✗ | ✗ | n/a | Excluded by the recording model, not a gap |
| `Path2D` objects | absent | ✗ | ✗ | ✗ | n/a | Same reason: a recording is plain data |

## 9 · Color and output

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| 8-bit sRGB color with alpha | done | ✓ | ✓ | ✓ | | one packed number end to end |
| wide gamut: display-p3, oklch, lab, color-mix | absent | ✗ | ✗ | ✗ | P3 | Every modern display shows more than sRGB, and Apple hardware is where Declare's native renderer runs. The cost is a new color representation through the whole seam, which is why it is not higher |

## 10 · Motion and scroll-driven visuals

| capability | status | DOM | canvas | Mac | P | notes |
|---|---|---|---|---|---|---|
| springs and animators | done | ✓ | ✓ | ✓ | | the house model; keyframes are deliberately absent |
| keyframe timelines with per-segment easing | absent | ✗ | ✗ | ✗ | P2 | **[mirror]** The odometer flip had to be hand-built from curve arithmetic. Multi-stage entrances are ordinary design work and the current answer is "write the maths" |
| scroll-driven animation | absent | ✗ | ✗ | ✗ | P3 | Progress bars, parallax, reveal-on-scroll |
| sticky positioning as an author surface | absent | ✗ | ✗ | ✗ | P3 | Exists internally as the DOM realization of `ignoreScroll` |
| scroll snap | absent | ✗ | ✗ | ✗ | P3 | Carousels and paged views |
| view transitions | absent | ✗ | ✗ | ✗ | P4 | |

---

## 11 · Verified defects — ALL SEVEN FIXED 2026-09-13 (in this tree)

Each was found by reading the code, confirmed by hand, then fixed and re-proved
against `test/probe/textfixes.declare` and `test/probe/text.declare`, both
now in the Mac gate corpus (blessed at 1.05 % and 1.21 %). Unit 448/0, seam 31/0,
perceptual 129/0 after.

| id | what it was | the fix |
|---|---|---|
| D1 | the Mac font parser could not read the `small-caps` token, so a small-caps run measured at the 13 px fallback in the wrong family while drawing at its real size | the parser consumes the CSS variant slot and the resolved face carries it, so measure and paint agree |
| D2 | `d.strokeText` filled on the Mac; the flag was threaded in and never read | the context's text drawing mode is set to stroke, with `strokeStyle` and `lineWidth` |
| D3 | `d.transform` collapsed to a zero matrix and `d.rotate` was dropped by the layer describer — both read key names the recorder never writes | both read `m` and `angle` |
| D4 | Image `stretches` of none, width, height and both were all aspect-fit on the Mac, because the code tested for a token the runtime never sends | each mode computes its drawn size the way the canvas renderer does, from the box's top-left |
| D5 | a solid `textFill` did nothing on any renderer, though the schema has always documented it | all three treat a solid fill as overriding `textColor` |
| D6 | Mac rich-text runs decoded a translucent colour raw, shifting every channel and dropping alpha | they decode through `declColor`, which knows the encoding |
| D7 | Text `lineHeight` reached the Mac and was never read, so lines bunched inside a box sized for open leading | the layer spaces baselines by the declared pitch, `round(fontSize × multiplier)`, and splits the difference from the face's box evenly above and below each line, the DOM's line-height rule |

**Found while proving D1, not yet fixed:** Chrome SYNTHESIZES small caps for a
face that has no small-caps feature; Core Text does not, so the Mac draws that
run in ordinary case. It is most of the 1.05 % residual on the defect probe.
Synthesizing means drawing the lowercase run at a reduced size, which is real
work and a separate decision.

## 11a · The original defect list (for the record)

Each was confirmed by reading the code in both trees on 2026-09-12. All are in
main, not only in the graphics tree.

| id | defect | evidence |
|---|---|---|
| D1 | The Mac font-string parser cannot read `small-caps`, so a small-caps Text measures at 13px in a fallback family while drawing at the real size. Width, height, wrapping and the metric facts are all wrong on that renderer | `TextEngine.swift:33-55` against `measure.ts:89` |
| D2 | `d.strokeText` renders filled on Mac. The stroke flag is passed in and never read | `DrawReplay.swift:483-509` |
| D3 | `d.transform(a…f)` collapses to a zero matrix on Mac, and `d.rotate()` is dropped by the layer describer. The recorder writes `m` and `angle`; the Swift readers look for `a`…`f` and `a` | `draw.ts:444,453` against `DrawReplay.swift:360-362` and `LayerDescribe.swift:212` |
| D4 | Image `stretches` of none, width, height and both all become aspect-fit on Mac, because the code tests for a `fill` token the runtime never sends | `LayerTree.swift:1217` against `backend.ts:64` |
| D5 | A solid `textFill` does nothing on any renderer, though the schema documents it | `schema.ts:563` against `dom-backend.ts:2164` and `canvas-backend.ts:1333` |
| D6 | Mac rich-text runs decode a translucent color with the wrong decoder, shifting channels and dropping alpha | `Overlays.swift:356-360` against `value.ts:31` |
| D7 | Text `lineHeight` is sent to the Mac host and never read, so paint and layout disagree there | `mac-backend.ts:551`, no reader in `LayerTree.swift` |

## 11b · Truncation — DONE on all three, 2026-09-13

`Text.maxLines` is ported into this tree from main (it was main-only) and works
on all three renderers, with `truncated` added beside it — the read-only fact a
"Show more" binds to, and the reason a clamp is a fact about the text rather than
a look you infer from a clip.

`RichText.maxLines` clamps the WHOLE FLOW, counting lines across blocks in
document order. It now works on **all three renderers**, and the shape of the
answer is worth recording, because the three do genuinely different things:

* **Canvas** splits the runs into single-line `Text` views itself, so it spends
  the budget while it lays them out (`BUDGET` in `markdown.ts`), drops the views
  past it, and rewrites the last kept run with `ellipsize`.
* **DOM and Mac** lay the flow out in their own engines — a real `p`/`h1` tree
  under one host div, a real `NSTextView` — so the model cannot drop laid-out
  views there. What it can do is the one thing the engines cannot: apportion ONE
  budget across a document made of several flows AND structural views. So it
  counts each flow with the shared measurer (`flowRichCanvas` in measure-only
  mode — the same pass canvas lays out by), spends the budget, and hands the
  engine the count through the new optional seam member `setRichClamp(maxLines)`,
  which returns the clamped height. DOM realizes it with `-webkit-line-clamp` on
  the flow host (it clamps ACROSS the block children, which is the point); Mac
  sets `maximumNumberOfLines` + `.byTruncatingTail` on the text container and
  re-measures with `usedRect`.

Two rules had to be stated to make the three agree, and both are now pinned by
`test/probe/text.declare` (the Mac gate's one text row, both cuts in one frame):

1. **The ellipsis marks a line that was cut short, not a document that was cut.**
   When the budget runs out exactly at a block boundary, the last kept line is a
   whole line and nothing marks it — which is what `-webkit-line-clamp` and
   `CTLineCreateTruncatedLine` already did, so canvas was changed to match rather
   than the reverse. A "Show more" is the honest signal that more exists, and
   `truncated` is what it binds to.
2. **A block reached with the budget spent shows nothing at all** — not its
   flows, and not the chrome around them either (a list's markers, a table's
   rules, a quote's bar), and not the stack gap that would have preceded it. That
   is why the whole block view is hidden in `RichText.rebuild()`, where the
   document loop is: only it knows a block began after the budget ran out.

The residual divergence is which characters survive on the cut line: DOM and Core
Text cut mid-word (`…stops whe…`), the shared measurer's `clampLines`/`ellipsize`
drops to the word boundary (`…stops…`). Same rule as plain `Text`; recorded in
§12.

Still to consolidate: a fixed height plus `clip`, and a bottom gradient mask, both
reach a similar look today without an ellipsis and without the app knowing
anything was cut. They should keep working and stop being the way anyone reaches
for a preview.

## 11c · The measurement question, answered by measurement (2026-09-13)

OpenType features (tabular figures, lining figures, a slashed zero, small caps as
a FEATURE rather than a synthesis) all raise the same question before any of them
can be built: **a feature changes advance widths, so how does the shared measurer
come to see exactly what paints?** Declare's layout, wrapping, clamping and the
`ascent`/`capHeight` facts all go through `measure.ts`, which measures with canvas
`measureText` against a CSS font shorthand — and the shorthand has no slot for
features. Set a feature only where it paints (a CSS `font-feature-settings` on the
DOM element, a Core Text descriptor on Mac) and paint and layout disagree on that
renderer — which is defect D1 exactly, the small-caps bug fixed this same day.

**The answer: a feature belongs to a DERIVED FAMILY, not to a run.** A
`FontFace(name, src, { featureSettings: '"lnum" 1' })` registers a family whose
every glyph already has the feature applied, so the shorthand `16px Hoefler_lnum`
carries it and `measureText` returns the features' own widths.

Measured in headless Chrome on this machine, `"1234567890"` at 32px:

| family | plain | `lnum` via CSS on the element | `lnum` via a derived FontFace, measured with canvas `measureText` |
|---|---|---|---|
| Hoefler Text | 152.08 | 182.41 | **182.40** |
| Georgia, Palatino, Baskerville, Helvetica | — | no change | no change (those faces have no `lnum`) |

Two things follow, and the second was the real question:

1. The derived family is honoured by `measureText`, so **the shared measurer sees
   what paints** with no new plumbing in the measurer at all — the family name is
   already part of every font string and every cache key.
2. The source may be **`local("Hoefler Text")`** — an INSTALLED system face, not
   only a declared web face. So features are not restricted to fonts the program
   ships. (Verified above: the 182.40 row was built from `local()`.)

**BUILT 2026-09-13, on all three renderers.** The attributes are `numerals`
(`normal | lining | oldstyle` — the digit SHAPE), `numeralWidth`
(`normal | tabular | proportional` — the digit ADVANCE) and `slashedZero`, which
sit beside `smallCaps` and follow the same rule the rest of the face follows: one
idea per attribute, plainly named, `normal` meaning the face's own default. Both
values on each axis are sayable because faces disagree about which one they
default to — Helvetica's figures are tabular, the system font's proportional,
Baskerville's lining, Hoefler Text's oldstyle. They reach a rich-text RUN through
the same named-style bundle that carries `smallCaps`.

How it travels: `featureFamily` turns a family list into a derived-then-plain
list, `Hoefler_Text--ot--lnum, Hoefler Text`. The plain name always follows its
derived twin, so a derivation that fails degrades to the plain face rather than
to the system default — CSS's own fallback does the work. The web side registers
the derived family as a `FontFace` (from the declared faces' own sources, or
`local(base)`); the **native host reads the suffix off the name** and applies the
tags through a Core Text descriptor instead, since it has no FontFace to register.
`test/text.test.mjs` holds the two halves against each other, because
nothing at compile time can: a changed marker would render every figure plain on
Mac and correct on the web, silently.

Probe: the figures corner of `test/probe/text.declare` in the Mac gate (the retired numerals probe read 1.52% differing). Its
faces were chosen by measuring which features are real on this machine, so the
probe can actually fail: Hoefler `lnum` +28.5px, Baskerville `onum` −30.5px,
system-ui `tnum` +17.6px, Helvetica `pnum` −18.9px at 32px.

**The late-face question, answered by making the face table reactive**
(`runtime/src/face-table.ts`). A derived family is registered DURING a render, so
it lands a beat after the text that asked for it — the classic "measured in the
fallback, painted in the real face" bug, and the canvas probe showed it as a run
overlapping the next word. The fix is not specific to features: every measurement
in Declare already happens inside a tracked computation (Text's auto-size
constraints, the metric getters), and the one thing that was not a tracked read
was the FACE TABLE itself. Now it is: one `Cell` per family, tracked by
`fontString`, rung by `noteLoadedFaces`. A face arriving after boot re-measures
and re-lays-out the text that asked for it — which was silently wrong before, for
island tenants and late apps as much as for derived families.

One wrinkle worth its own line: `RichText` measures its whole flow inside its
APPLY (`rebuild`), where reads are deliberately untracked, so the per-family read
never reaches it. Its render key carries `faceGeneration()` instead — a single
number that changes whenever any face lands. Coarser on purpose.

**Tested by ASSIGNMENT, not by a load race** (`test/text.test.mjs`). The face
table is a slot, so the honest test writes to it: a stub measurer reads a plain
object of per-family advances, the test assigns to it, rings the family's cell, and
settles. No fonts, no network, no clock. A first attempt used a real derived face
in a real browser and could not fail: the face was added at 95.8 ms and the text
that asked for it first measured at 99.3 ms, already correct. The assignment test
pins four things — an unrung write is invisible (the stale state a late face used
to leave); a rung one re-measures an auto-sized `Text`; a `Text` in an unrelated
family does not wake; and **a `Text` with both dimensions set re-pushes its style.**

That last one FAILED on first run, and it was a real hole: with width and height
both set there is no auto-size constraint to notice the face, and the style push
read only slots, so canvas and Mac kept the fallback's line breaks for good (DOM
re-lays its own element, so it never showed there). The style compute now reads
`fontString(this)` first, which subscribes the push to exactly that `Text`'s
families.

A PROGRAM cannot drive this by assignment today, only the runtime can: no
author-visible slot holds the face table, and `font` declarations are static (they
resolve to a plain family string at instantiate). Assigning `fontFamily` is an
ordinary slot write and never touches this path. The natural program-level
surface, if one is wanted, is a reactive `Face` — assign its `src` and every run
in that family re-measures through exactly this mechanism. That is a language
change and is not built.

What this does NOT change: `boot.ts` still awaits every declared face before
first paint (CSS's `font-display: block`, with no timeout), so no existing
program moves. What it makes possible for the first time is a POLICY — wait a
bounded time, paint in the fallback, and swap when the face lands — which is a
language decision, and would belong on the `font` declaration (per family, as CSS
scopes it) rather than as a global switch.

Still open here:

* A named style that sets its OWN `fontFamily` alongside figures composes
  correctly, but a style that sets only figures inherits the flow's family — both
  intended; worth a test.
* Features on a family the program did not declare go through `local(base)`,
  which reaches that family's REGULAR face; a bold run in such a family gets the
  browser's synthetic bold. A declared face is exact per weight. Divergence, §12.
* Ordinals, fractions and superior/inferior figures are the same mechanism plus
  one row in `featureTags` — deliberately not added until something asks.

## 11d · The capability pass (2026-09-25)

A top-to-bottom check of what each renderer does with every value the seam
carries, set off by a per-side stroke the Mac had never painted — silently,
because the slot is legal, and invisibly to a likeness gate, which cannot see a
feature that is simply absent.

**Method.** The optional members of `Surface` were already held by
`test/seam.test.mjs`, which fails when a backend's members and the declared
table disagree. The gap below that is a value ARM dropped inside a member that
exists, so each value type was read arm by arm against each consumer: box paint
(fill and gradient kinds, radii, stroke, shadow), compositing (all 17 blend
modes, all ten filter functions in both tiers, both mask kinds), images (all six
stretch modes), text (every `TextStyle` field, every rich-run and rich-block
field), and editables (every field). Then two probes joined the native gate,
`seams-box` and `seams-text`, each drawn so that any one capability going missing
changes more of the frame than the gate's 0.75-point tolerance. That was
MEASURED, not assumed: each capability was removed from the probe in turn and
the render diffed (1.5–4.7 % each).

**Found and fixed:**

| | defect | fix |
|---|---|---|
| E1 | Mac painted no per-side stroke at all | four bands as shape layers under the content, each the box minus a copy shifted in by that side's width (stroke-sides.ts's rule) |
| E2 | Mac restack assigned `sublayers` from a list that left out the four-radii fill layer, so a box with four distinct radii lost its fill on the next restack | the fill and the side bands are in the list |
| E3 | Mac mapped CSS weight to AppKit's 0–15 scale linearly, so 700 took a family's Heavy, 600 its Bold and 400 its Medium | the CSS→AppKit table (400 → 5, 500 → 6, 600 → 8, 700 → 9, 800 → 10) |
| E4 | Mac lacked the browsers' ascent rule for Times, Helvetica and Courier (+15 % of the line box), so every `sans-serif` and `serif` line box was shorter than the browser's — 64 against 74 at 64px — with the glyphs that much higher | `TextEngine.webMetrics`, used by the measurer and by rich text |
| E5 | Mac rich text gave each paragraph one fixed line height and put the whole difference at the top: a tight `lineHeight` clipped figure tops, and a paragraph whose lines differ in size gave every line the biggest one's height | a layout-manager delegate builds each line's box as CSS does (each run's half-leading box, the block's own font as the strut); the band rasters, and the flow clips, with the ink bleed a tight line throws past its box |
| E6 | Mac rich text ignored a SOLID run fill | a solid fill is the run's colour |
| E7 | canvas and Mac put a `Text`'s first baseline at the ascent whatever its `lineHeight`; the DOM splits the difference (ruled: the browser's rule) | canvas `halfLead`, Mac `TextLayer.overTop`, `Text.baseline` |
| E8 | the canvas rich flow took each line's strut from the LONGEST run, so a line of big figures with a longer caption in a small face ("55 sessions") was laid out taller than the browser's | the block carries its own font (`RichBlock.family`/`weight`) and the strut is that |
| E9 | a gradient run fill restarted at every word wherever the manual flow paints words separately (canvas; the DOM with inline views) | each piece takes its slice of one ramp across the run (`sliceGradient`) |
| E10 | `RichRun.chipBg` was painted by two renderers and set by nothing | removed |

Confirmed complete on every renderer: gradient kinds, the filter vocabulary, the
blend table, stretch modes, the text style fields, the editable fields.

**Not a defect:** Mac window captures are tagged Display P3, so an sRGB colour
reads as different numbers (#2E6FE0 → 64,110,217) though it displays the same.

## 12 · Cross-runtime divergence register

Things that render differently depending on which renderer runs the same program.
The defects above are excluded; these are design divergences or accepted
approximations.

| divergence | shape |
|---|---|
| Line breaking | Browser on DOM, shared `wrapLines` on canvas and in layout, Core Text on Mac |
| Figures on an undeclared family | The features are applied through `local(base)`, which reaches that family's REGULAR face — a bold run in such a family gets synthetic bold on the web. A family the program DECLARES derives per face, so its weights stay exact. Mac has neither limit: it applies the tags to whatever it resolved |
| Clamp truncation | Browser line-clamp, whole words, Core Text characters — the same three breakers as above, one step further in. All three now clamp to the SAME line count (§11b); what differs is which characters survive on the cut line: DOM and Core Text cut mid-word, the shared measurer drops to the word boundary |
| Gradient text fill on Mac | Suppresses shadow, outline, underline and strike |
| A gradient run that wraps | The DOM continues one ramp across the line break; canvas lays one ramp per line; the Mac lays one over the run's whole enclosing box |
| 3D on canvas | Strip approximation; loses box shadow, backdrop and shape clip; cuts children to the box; drops `colorize`; skips projections over 16 megapixels |
| Filter order | canvas applies the mask before the filter, against the stated pipeline; `colorize` is always applied first on canvas but in list order on Mac |
| Filter `shadow(…)` | Any number, any position on the web; first only, always as the layer's shadow, on Mac |
| Backdrop | A `shadow(…)` in the list is skipped on Mac; the isolation floors differ on all three; Mac reads "beneath" as z-order, so content above a frosted panel joins its sample |
| Mask stencils | DOM restricted to Image and drawing stencils; canvas ignores the stencil's transform; Mac ignores filters on it |
| Safari | `ctx.filter` is accepted and ignored, so canvas falls back to a pyramid that is resample-only during motion and exact at rest. **MEASURED 2026-09-13 and far worse than "inexact": the fallback stalls and corrupts.** See below |
| Selection | Plain Text selects only on DOM; RichText selects on DOM and Mac, never on canvas |
| Cursor | Mac supports a keyword subset |
| Corner radii | Four distinct radii leave the Mac compositor for a shape layer |
| Box shadow radius | Mac uses blur/2 as an approximation |
| Blend isolation | Explicit at scrollers and root on DOM and canvas, absent on Mac |

**Safari + canvas + a view `filter` is unusable** (measured 2026-09-13, the All
Access mirror, six filtered cards, 1440×980). Safari produced ONE frame in a
4.2-second window — a single 3514 ms frame, 0.3 fps — and the frame it produced
was wrong: the story copy rendered nearly invisible and the front card at the
wrong size. The same program in Safari with only the card `filter` removed runs
20.4 fps and renders correctly, which places both the stall and the corruption in
the WebKit filter fallback rather than anywhere else. For scale, on the same
machine and program: Chrome canvas 57 fps, Chrome DOM 57, Safari DOM 44 with the
filter and 59 without. The fallback's cost is structural — canvas group layers are
still full-canvas sized, so each filtered card blurs the whole viewport — and it
runs per filtered view per frame. Until that is fixed, a view filter on the canvas
renderer should be treated as Chrome-only.

**Why Safari's canvas collapses, measured 2026-09-13.** WebKit has no
`ctx.filter`, so the canvas renderer runs its own fallback (`canvas-filter.ts`),
and the fallback is paid PER FILTERED VIEW PER FRAME over a group layer that is
still sized to the whole canvas. Isolation probes (`test/probe/sf-f*.declare` in
the graphics tree, plain coloured cards, no images) make the shape plain:

| filtered views | Safari canvas | Chrome canvas |
|---|---|---|
| 0 (six plain views) | 58 fps | 60 fps |
| 1 | 60 fps | 60 fps |
| 3 | 25–28 fps | 60 fps |
| 6 | 14 fps | 60 fps |
| 6, each 4× the area | 14 fps | 60 fps |

Cost tracks the NUMBER of filtered views and is flat in their size, which is the
signature of a full-canvas group layer: a 200×260 card blurs 1880×1320 pixels.
Chrome is flat at 60 because its `ctx.filter` is native. Two further facts: the
bitmaps are not the cause on Safari (the mirror at 1.3 MP per badge is still
0.3 fps), and removing only the card filter takes the mirror to ~20 fps and
correct rendering. The fallback's calibrated path also reads back
(`getImageData` → a JS box blur → `putImageData`) and, below about 9 px of blur,
does not downsample first, so it is a full-canvas CPU pixel pass.

**The mirror's 3.7-second frame, isolated 2026-09-13.** It is the fallback's
CALIBRATED path, and nothing else. Removing the badge mask, the badge shadow, or
the 3D odometer each left the spike untouched; removing only the card filter
removed it. The median frame is 17 ms in every case — the app is at 60 fps and
then one frame takes 3.7 seconds. Forcing the resample-only path
(`__declareFilterGpuOnly`) on the shipped mirror drops the worst frame from
3696 ms to 409 ms, 1.9 fps to 10.

| the shipped mirror, Safari canvas | worst frame | fps |
|---|---|---|
| default (calibrated allowed) | 3696 ms | 1.9 |
| resample-only forced | 409 ms | 10 |

So the design — approximate while moving, exact once at rest — costs about 600 ms
per filtered view on this engine, and the mirror settles six of them in one
frame. Two fixes follow, both already named as deferred in the code's own
comments: size group layers to the subtree plus bleed, which is roughly a 25×
cut for a 260 pt card in a 1440 pt window and helps Chrome's memory too; and
never run the calibrated pass for N views in a single frame — amortize it one
view per frame, or let the cost model decline it.

**Group layers are subtree-sized — BUILT 2026-09-13** (canvas renderer, graphics
tree). A group layer is allocated whenever a subtree has `opacity < 1`, a filter,
a mask, a blend with children, or a scroller containing blends, and it used to be
allocated at the window's full size whatever it held. `groupDeviceBox` now walks
the subtree for its device-space ink — each box plus what reaches past it: the
filter's bleed, a box shadow's offset and blur, a drawing's bounds plus
`rasterPad`, and a text run's ascent, since glyphs exceed a tight line box. A
clipping surface bounds its children, so the walk stops there and follows only
the ones that opt out. It returns "use the whole window" for a 3D descendant,
whose projection is not its box, and when the union would save nothing.

| measured | before | after |
|---|---|---|
| one small fading view, scratch pixels/s (Chrome) | 148 Mpx | 13 Mpx |
| six, scratch pixels/s | 893 Mpx | 76 Mpx |
| six filtered, Safari | 1.6–14 fps, unstable | 60 fps |
| six filtered at 4× area, Safari | 14 fps | 33 fps |
| the All Access mirror, Safari | 1.9 fps | 2.2 fps |
| canvas build, gzipped | 99,281 B | 99,829 B |
| DOM build | unchanged | unchanged |

The mirror barely moves, and that is the honest shape of this fix: it pays in
proportion to how small the group is. The probes' cards are 8 % of the window;
the mirror's are 640×558 points in a 1440×900 window, and each carries a 78 pt
shadow bleed and up to 16° of rotation, so its layer legitimately needs most of
the window. Small groups — a toast, a menu, a hovered thumbnail, anything fading
— are the common case and they are now 10× cheaper. The mirror needs something else — but NOT, on inspection, the
filter memo: each transition ends with new blur values per card, so a memo keyed
on the filter and its subtree would miss on every settle, which is exactly when
the spike lands. Nor colour-as-composite, since its filter includes a blur and
the blur is what forces the readback. The right follow-up for that shape is
narrower and cheaper than either: govern exactness by COST, not by motion alone.
The rule today is approximate while moving, exact once at rest; it should be
approximate while moving, exact at rest UNLESS the exact pass would blow the
frame budget — a question the existing cost model can already answer.

Cost: +548 bytes gzipped on a canvas build, nothing on a DOM build, verified by
building both and confirming neither the walk nor the group path appears in the
DOM bundle. Perceptual suite 129/0 both before and after.

**Which apps this helps, measured across the shipped corpus** (canvas renderer,
1280×820, groups counted while stirring the app):

| app | groups seen | average size vs the window |
|---|---|---|
| controls | 53 | 1 % (a 99×40 chip at `opacity = 0.45`) |
| tracker | 25 | 1 % (a 774×78 row) |
| desktop | 0 | — |
| calendar | 25 | 100 % (a 1280×731 sheet fading) |
| weather | 612 | 56 % (full-bleed glass, plus mid-size panels) |

Two shapes, both ordinary. Small groups — a chip, a row, a thumbnail, a menu —
come in NUMBERS, dozens per frame, and each is now about a hundredth of what it
was. Window-spanning groups — a modal scrim, a full-bleed sheet, a page fade —
come one at a time and gain nothing, correctly falling back. All Access sits near
the second shape, which is why it barely moved.

**The canvas 3D strip projection is visible on translucent content.** In the same
mirror, a flipping odometer digit shows horizontal banding across the glyph and
its ink is cut at the projected box while the flip is in progress, resolving when
the flip ends. Both follow from the strip approximation and from `paint3D` cutting
children to the box; on DOM the same digit flips cleanly.

**Large bitmaps on the Mac host — FIXED 2026-09-13, two defects.** The symptom
was the All Access mirror running at 11 commits a second with the site's own
12-megapixel badges while Chrome held 57 fps on the same machine with the same
files. Image size looked like the cause and was only the multiplier; `sample(1)`
named both real defects, one after the other.

1. **Lazy decode.** `CGImageSourceCreateImageAtIndex` returns an image that keeps
   the compressed bytes and decodes on demand, and Core Animation's demand is
   every commit: 2957 of 3004 commit samples sat in `PNGReadPlugin::decodeImageImp`
   under `CA::Render::prepare_image`. The host re-ran the PNG decoder for six
   badges on every frame. `Bridge.decode` now draws once into a bitmap context, so
   the pixels are resident and the decode happens off the main thread at load.
2. **No image cache.** A view that comes and goes asks for the same bitmap
   again, and the host re-fetched and re-decoded it every time — 26 loads of 7
   files in one short session, because each card is re-made per step. `Bridge`
   now keeps a url-keyed cache of decoded images (capped at 16). Loads per
   session went 26 → 8.
3. **Oversized contents.** CA does not hand an oversized image to the GPU and let
   it scale: `prepare_contents` renders a scaled copy on the main thread, again
   per commit whose geometry moved. After fix 1, 1360 of 1531 commit samples were
   `CA::Render::create_image_by_rendering → CGContextDrawImage`. `LayerTree` now
   scales an oversized bitmap once per layer per power-of-two size bucket, with
   2× headroom for scale-up — a decode cache, which is what the browser has.

| | commits/s | commit p50 | commit p95 | worst |
|---|---|---|---|---|
| before | 11.5 | 0.16 ms | 115–286 ms | 639 ms |
| after lazy-decode fix | 38.8 | 0.74 ms | 43 ms | 45 ms |
| after all three | 50.4 | 0.75 ms | 2.24 ms | 94 ms |
| with the resample off-thread | 76.2 | 0.76 ms | 2.10 ms | 2.6 ms |

The last row is a single continuous transition rather than three with idle
between them, which also settles a red herring: the ~780 ms "gap" that survived
every fix is the display link correctly idling between animations, not a stall.
Setup improved with it too — the worst boot commit fell from 362 ms to 86 ms —
because scaling inline had merely moved the cost into the first frame.

**Setup cost, measured warm** (content already in memory, so this is
initialization alone): the mirror reaches its first full frame about 20 ms after
its content on Chrome, 8 ms on Safari's DOM, 478 ms on Safari's canvas, and
448 ms on the Mac host. The Mac figure is not compilation — a warm re-boot hits
the compile cache in 1 ms — it is instantiation, layout and layer-tree build, of
which one 362 ms commit is the bulk. That is the next thing to profile there.

The full Mac gate is unchanged at 19 programs, 0 failing, so none of the fixes
moved a pixel. The lesson is worth keeping: **the native host is not allowed to be more
size-sensitive than Chrome, which runs on the same machine with the same
frameworks.** Both defects were the host asking Core Animation to redo per frame
what a browser does once.

The Mac gate's blessed baselines are the standing size of the Mac-versus-DOM gap
per capability: filter 2.08% differing, mask 1.67%, gradients 4.03%, fit 0.23%,
affine 0.43%, transform3d 0.46%, drawImage 0.99%, tight line boxes 0.75%.

## 13 · Open questions, not yet verified

Each is reachable with the existing `test/probe/gfx-*.declare` probes and the Mac
gate; none was confirmed by running it.

- Whether Mac applies `layer.filters` before or after `layer.mask`.
- Whether `mask` and `clip` on the same view collide on Mac, since both drive
  `layer.mask`.
- Whether nested 3D on Mac flattens the way DOM and canvas do.
- Whether a Mac scroller isolates blending.
- Whether transforms and clips under a live `d.filter` land on a throwaway layer
  on Mac.
- Whether canvas 3D really loses the box shadow and backdrop sample in pixels, as
  the code reading says.

## 14 · What the priorities come to

Reading across the categories, the first rank is short and mostly repairs:

1. ~~The seven verified defects, D1 and D3 and D4 first~~ — **ALL SEVEN FIXED
   2026-09-13**, each with a probe and a gate baseline (§11).
2. ~~Text `lineHeight` on the Mac host~~ — **FIXED 2026-09-13** (D7). (Web fonts,
   the other half of this item, landed the same day.)
3. ~~Tabular and lining numerals, which unblock every other OpenType feature by
   forcing the measurement question to be answered once~~ — **BUILT 2026-09-13 on
   all three renderers** (§11c), and with it the face table became a tracked read,
   so a font that lands late re-measures instead of rendering wrong forever.
4. ~~The clamp family completed: RichText `maxLines` and a fact saying truncation
   happened~~ — **BUILT 2026-09-13 on all three renderers** (§11b).

After that the ordering is elevation shadows, the text-breaking group, balanced
wrapping, and keyframe timelines. Right-to-left text sits outside the ranking as
its own arc, and wide-gamut color and SVG filter graphs are the two items that
need design before they need plumbing.
