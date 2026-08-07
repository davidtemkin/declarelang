# The visual arc — compositing, transform, and the typography surface

One consolidated plan (David, 2026-08-06: "consolidate the transform and
compositing documents into one, add in the text piece") for the whole
visual-capability build: **Part I — compositing** (`blend`, `backdrop`, `tint`
— ratified to build), **Part II — transform** (`rotation`, the `onPinch`
family), and **Part III — the text piece** (author-facing font metrics).
Every part obeys the two standing rules at the end of this file.

# Part I · Compositing — view-level blending and the backdrop, across all three renderers

**Status: PLAN, RATIFIED TO BUILD (David, 2026-08-06 — "I am going to want all of
this implemented").** One unified plan for the compositing surface: `blend` (the
`mix-blend-mode` analogue, a View attribute) and `backdrop` (the frost — backdrop
sampling with blur), realized on DOM, canvas, and the native Mac host, with the
headless renderer a declared no-op. Two semantic rulings are called out in §4;
everything else is buildable as specified. Phasing in §7.

**Handoff contract.** This document is written to be self-contained for an
implementing agent that has not seen the conversation behind it. Two things bind:
(1) **phase 1 blocks on David** — the §4 leans are analysis, not authorization; do
not build on them without his word ("we'll come back to this" is the standing
state); (2) the wiring inventory in §5.0 is the end-to-end touch list — follow it
rather than rediscovering the chain, and let the gates name anything it missed.

---

## 0. Why this is one plan and not two features

Blend and backdrop are the same subsystem seen at two depths: both are questions
about **what a view composites against when it paints**. Blend changes the *operator*
a view lands with; backdrop *samples* what is already there and filters it before the
view lands. They share the isolation semantics (§4.1), the Surface seam shape (§5),
the verification pattern (§6), and most of their per-renderer machinery. Building
them separately would mean designing the isolation model twice.

## 1. The foundation that already ships — the draw tier

Nothing in this plan starts from zero. Inside a `draw(d: Draw)` recording, the full
compositing vocabulary already works and is **held to cross-renderer parity by the
gates**:

- `d.globalCompositeOperation` and `d.filter` are typed in the scaffold, recorded as
  display-list ops (`runtime/src/draw.ts`), and replayed natively by both web
  contexts and by the Mac host (`DrawReplay.swift` — `CGBlendMode` for compositing,
  CoreImage for filters).
- The Mac replay blurs in **encoded sRGB, not linear light**, a deliberate decision
  so its result matches the web's — the color-space precedent this plan inherits.
- The perceptual gate pins it: `test/probe/blend.declare` is *lighten compositing of
  a blurred source over an opaque ground* and sits at **0.26 % differing** against
  Chrome; `blur` at 2.75 %; `vignette` at 0.01 %. `mac-host/blurcal.mjs` is the
  calibration tooling from that work.

What does **not** exist is the view tier: a `View` cannot blend against its siblings,
and nothing can sample what lies beneath it. Guide ch. 20 records canvas frost as
"the one visible gap in the parity numbers"; `library/menu.declare` renders
`theme.menuMaterial` as plain translucency with the comment *"a `backdrop` blur is
pending"*; Cupertino's theme says the same twice. This plan is that pending work,
plus the blend tier that shares its bones.

## 2. The enabling fact: one vocabulary, three native substrates

The W3C compositing-and-blending modes are natively shared by every renderer this
platform targets:

| mode family | CSS (`mix-blend-mode`) | Canvas2D (`globalCompositeOperation`) | Quartz (`CGBlendMode`) | Core Animation (macOS `compositingFilter`) |
|---|---|---|---|---|
| multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity | ✓ | ✓ | ✓ | ✓ (`CIFilter` — `CIMultiplyBlendMode` …) |
| plus-lighter | ✓ | `lighter` | `.plusLighter` | ✓ |

So `blend` needs **no emulation anywhere** — every backend maps the token to a native
operator. (`compositingFilter` accepts `CIFilter` objects on macOS — public API
there, ignored on iOS; the iOS caveat is recorded in §8 and changes nothing for the
Mac host.) The draw-tier gate already proves the three agree on the *rendering* of
these operators; the view tier reuses the same operators one level up.

## 3. The language surface

### 3.1 `blend` — a View attribute

```declare-fragment
badge: View [ blend = multiply, fill = #CC3344, … ]
```

- Schema: `blend: enumType("Blend", "normal", "multiply", "screen", "overlay",
  "darken", "lighten", "colorDodge", "colorBurn", "hardLight", "softLight",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
  "plusLighter")` on `View`, default `normal`. A bare enum literal like `scrolls`
  and `claim`; a `{ }` constraint like any attribute, so a blend can be state.
- Spelling: camelCase tokens (`colorDodge`, not `color-dodge`) — enum tokens are
  identifiers in this language, and the hyphenated forms are CSS's, not ours.

### 3.2 `backdrop` — the frost

```declare-fragment
panel: View [ backdrop = frost(20), fill = #F9F9FBDB, cornerRadius = 12, … ]
```

- **Proposed spelling, needs the §4.3 ruling:** a `frost(radius, saturation?)` value
  constructor in the `stroke()`/`shadow()` family, yielding a `Backdrop` value;
  `null` (default) means none. `saturation` defaults to 1 (macOS-style materials run
  ~1.4–1.8; the themes will elect their own). Extensible later (brightness, tint)
  without a new attribute.
- The sampled region is the view's own painted shape — box, `cornerRadius`, or shape
  clip — so a rounded panel frosts a rounded region, with the sample over-scanned by
  the blur radius so edges do not bleed dry.
- The view's own `fill` then paints **over** the frosted sample, which is exactly how
  every platform's material works (a translucent wash over a blurred backdrop) and
  what `theme.menuMaterial`'s translucent colors are already shaped for.

### 3.3 Theme integration

The themes already carry the wash (`menuMaterial`); frost adds the sampling. One new
optional token pair per consumer, elected like every other material fact:
`menuBackdrop` (a `frost(…)` value or null) first, then the scrim/window consumers as
adoption reaches them (§7.4). Tokens are measured into the reference by the
theme-token spine automatically; the required-vs-optional split stays honest because
every read will be guarded.

### 3.4 `tint` — an Image attribute (ADDED 2026-08-06, assessment 4.2)

```declare-fragment
icon: Image [ source = "glyph.png", tint = { theme.accent } ]
```

A color multiplied over the bitmap's alpha — the one-mask-asset, many-colors
idiom the 4.2 field report hit (an agent shipped two pre-recolored PNGs for
want of it). It is a compositing operation, which is why it lives in this plan
and not as an Image one-off: DOM realizes it as a masked background
(`mask-image: url(...)` + `background: color`) or `filter`, canvas as a
`source-in` fill over the drawn bitmap in an offscreen group (the §5 machinery),
Mac as `CIColorMultiply`/template-image rendering. `tint = null` (default) is
the untouched bitmap. Rides whatever phase lands the canvas offscreen groups,
since `source-in` needs them; needs no new ruling.

## 4. Semantics — the two rulings, and the defaults proposed

### 4.1 What a view blends against (RULING 1)

**Proposal:** a blending view composites against *what has already painted beneath it
within the nearest isolating ancestor* — the painter's model the renderers already
share, so declaration order (the language's own z-order) is also the blending order.
The isolating boundaries, v1:

- the App root (nothing blends against the page behind an embedded island),
- a group-opacity subtree (`opacity < 1` — already an offscreen group on canvas),
- a scroller's content group,
- an `AppIsland` / `DOMIsland` boundary.

Everything else is transparent to blending: a plain container does not isolate, so a
`multiply` chip inside three nested layout Views blends against the card under them —
which is what an author means. This matches CSS closely enough that DOM realizes it
almost for free, while staying statable in Declare's own terms (no `isolation`
attribute in v1; add one later only if a real program needs to *force* a group).

Two clauses that are part of this ruling, stated so no implementer has to guess:

- **A blending view blends as a unit, children included** — its subtree composites
  internally first (normal operators), and the finished group lands with the blend
  op, exactly CSS's `mix-blend-mode` behavior. On canvas this is the existing
  opacity-group path (§5.2); a blending *leaf* skips the group. Leaf-only blending
  would pass a naive probe and be wrong in real programs — the probe in §6 includes
  a with-children case for exactly this.
- **Compositing is paint, never input.** Neither `blend` nor `backdrop` changes hit
  testing, focus, or the crawler document in any way.

### 4.2 What a backdrop samples (same ruling, same list)

`backdrop` samples everything painted beneath the view within the same isolating
ancestor, at the moment the view paints. Content moving under the frost re-samples —
that is the point of frost — and the cost model for that is §5.2's.

### 4.3 One semantic, or the platform's material? (RULING 2)

Is `frost(20)` defined as *CSS semantics everywhere* (Gaussian blur + saturation,
one look, three implementations) or as *the platform's material where one exists*
(NSVisualEffectView vibrancy on the Mac host, CSS `backdrop-filter` on the web)?

**Lean: one Declare semantic, per-host realization, held by per-program perceptual
baselines** — the exact policy that already governs text metrics and the 2.75 % blur
kernel difference. The Mac host realizes it with `NSVisualEffectView`
(`CABackdropLayer` is private; the effect view is the public path, and the overlay
discipline in `Overlays.swift` already hosts platform views this way). Where the
platform material's look diverges from the web's blur, the baseline absorbs it, and
a theme that wants *platform-true* vibrancy can still say so with its own tokens —
material-as-data, the city-preset philosophy, rather than a semantic fork.

## 5. Per-renderer implementation

### 5.0 The wiring inventory — every file a new attribute and constructor touch

The chain below is the platform's standing pattern (walked and verified 2026-08-05
during the seam work); following it is faster than rediscovering it, and the gates
enforce the docs half automatically.

For **`blend`** (a new View enum attribute):

1. `runtime/src/schema.ts` — the attr on `ViewSchema` via `enumType(…)`; the enum
   reaches the spine's vocabulary page with no further work.
2. `runtime/src/view.ts` — the attribute table entry with its push:
   `blend: { def: "normal", push: (v, b) => v.surface?.setBlend?.(b) }` (the
   `ignoreScroll` pattern — optional-chained, so backends adopt independently).
3. Backends: `dom-backend.ts`, `canvas-backend.ts`, `mac-backend.ts` (+ a new `OP`
   code in its numeric table and the matching `LayerTree.swift` `applyOne` arm —
   ops are `[opcode, id, …args]`, batched per settle). Headless: nothing.
4. `test/seam.test.mjs` — a `setBlend` row for all four backends, gaps with reasons.
5. Prose: `tools/internal/doc/prose/View.md` gains `## blend` (schema-completeness
   will demand it); the guide names it (backlink gate) — ch. 6 is the home.

For **`frost()`** (a new value constructor) additionally:

6. `runtime/src/value.ts` — the constructor + its value type, and the **RESERVED
   list**: value-constructor names are refused as member names by `checkMethod`, so
   `frost` must join `gradient/stroke/stop/shadow` there or the guard has a hole.
7. `compiler/src/scaffold.ts` — the PRELUDE `declare function frost(…)` (the
   shared-vocabulary projection gate fails until it is projected — that is the gate
   doing its job) and the `typeFor` arm for the schema's new value kind.
8. `tools/internal/doc/assemble.mjs` — a `VOCAB_NOTE` line so the Types-and-functions
   page says what it is rather than only its signature.

New Surface members, **optional, with seam-table rows for all four backends from day
one** — declared gaps, never inferred silence (the `setIgnoreScroll` lesson):

```
setBlend?(mode: string): void
setBackdrop?(spec: { blur: number; saturate: number } | null): void
```

### 5.1 DOM

- `setBlend` → `mix-blend-mode` on the element; isolation boundaries get
  `isolation: isolate` where Declare's §4.1 list demands one CSS would not create
  (and note where CSS creates one Declare doesn't want — group opacity and
  `backdrop-filter` both isolate in CSS, which matches the §4.1 list, so the
  expected delta is zero; verify, don't assume).
- `setBackdrop` → `backdrop-filter: blur(Npx) saturate(S)` — compositor-native,
  effectively free.

### 5.2 Canvas

- **Blend:** the backend already composites a translucent subtree through an
  offscreen group layer (`canvas-backend.ts` ~1211) — `blend` is the same landing,
  with the composite op set when the view (or its group) lands on the parent
  surface. A blending *leaf* needs no group at all; a blending *subtree* reuses the
  opacity-group path.
- **Backdrop:** the sample-under technique, which the single-surface painter's model
  makes natural — at the moment the frosted view paints, everything beneath it is
  already on the surface: capture the view's region over-scanned by the radius,
  redraw it through `ctx.filter = blur(…) saturate(…)` clipped to the view's shape,
  then paint the view. Region-bounded; re-runs on frames where anything beneath the
  region repainted.
- **Cost discipline:** measure before shipping (the `adaptive-draw-cache.md`
  method): a frost over a scrolling list is the worst case — budget it, and record
  the figure. Interaction with the adaptive draw cache must be stated: a frosted
  region invalidates on under-content change, not on its own state.
- **MEASURED (2026-08-06, phase 3 landing):** an 800×90 frosted header
  (`frost(20, 1.4)`) riding a scrolling 800×600 60-row list, dpr 2, headless
  Chrome on an M-series: mean compositor paint **0.25 ms/frame without frost →
  0.36 ms with**, worst frame 0.7 → 1.0 ms — the sample-under adds ~0.1 ms
  mean at this size and stays an order of magnitude inside a 120 Hz budget.
  The invalidation statement holds as built: the compositor repaints the scene
  on any invalidate, so a frosted region follows under-content change with no
  bookkeeping of its own.

### 5.3 Mac

- **Blend:** `layer.compositingFilter = CIFilter(name: "CIMultiplyBlendMode")` (and
  kin) — public on macOS. Inside drawings the same operators are already proven
  through `CGBlendMode`. The restack/`clipHost` machinery in `LayerTree.swift` is
  unaffected: a compositing filter rides the layer, not the order.
- **Backdrop:** an `NSVisualEffectView` overlay (`.withinWindow` blending), hosted by
  the `Overlays.swift` discipline, shaped by the view's cornerRadius via its mask.
  Held to the perceptual baseline per §4.3. If the material's look ever fails the
  baseline badly, the fallback is CPU sampling (`CALayer.render(in:)` of the layers
  beneath), recorded here so the option is on the table without being the plan.
- **AS BUILT (2026-08-06, phase 4): the recorded fallback, not the effect view —
  for a structural reason found before a line was written.** An
  `NSVisualEffectView` is an AppKit *subview*, and a subview always draws above
  the whole CALayer tree (the `RichOverlay` lesson, stated in `Overlays.swift`) —
  so the material would have painted over the frosted panel's own children (a
  menu's items, behind its own glass). The build is therefore
  `CALayer.render(in:)` of the tree minus the frosted node, over-scanned by the
  blur radius, filtered by `CIGaussianBlur` + `CIColorControls` in **encoded
  sRGB** (the DrawReplay context and its measured inputRadius-is-CSS-sigma
  convention), landed as a masked layer under the node's fill (the solid fill
  moves to a `frostFill` sublayer — `backgroundColor` paints behind sublayers,
  and the contract is wash over blur). Resampled once per commit — under-content
  changes only happen in a settle. Gate: **`frost` 2.34 % differing / 0 %
  structural** vs Chrome — the kernel-difference class (`blur` is 2.75 %), which
  is exactly what the §4.3 baseline absorbs; blessed 2026-08. v1 scope, stated:
  content stacked *above* a frosted panel joins its sample; the corpus's frosted
  surfaces (menus, sheets) are topmost, where the two readings coincide.

### 5.4 Headless

No-op for both members, `NOT_APPLICABLE` in the seam table — headless paints
nothing, so there is nothing to composite or sample. The crawler document is
unaffected (compositing is paint, never content).

## 6. Verification

- **Probes where the absence shows** (the `ignorescroll` lesson — a likeness test is
  blind to a missing feature unless the scene makes it visible):
  - `blendview.declare` — a `multiply` view over a gradient *sibling* (not its own
    drawing), so a backend that ignores `setBlend` renders visibly flat-wrong — and
    a with-children case (a blending view containing a child), so leaf-only
    blending fails too (§4.1's group clause);
  - `frost.declare` — a frosted panel over a high-contrast field, offset so the
    panel's region is unambiguous; no-frost renders as plain translucency, a large
    localized diff.
- **Seam rows** for both members × four backends, from the first commit — gaps
  declared with reasons while phases land.
- **Perceptual gate:** both probes join the Mac gate corpus and the DOM/canvas
  perceptual suite; per-program baselines absorb kernel/material deltas (precedent:
  blur at 2.75 %, text metrics policy).
- **Docs pipeline obligations, which the gates enforce automatically:** the two new
  attributes need reference prose (schema-completeness), a guide home
  (backlink — ch. 6's style chapter for `blend`, ch. 20's gap paragraph *retired* for
  frost), the `Blend` enum reaches the spine's vocabulary on its own, and
  `frost()` joins the shared-vocabulary constructors (the PRELUDE gate will demand
  its projection).

## 7. Phasing — each phase lands whole, gates green

1. **Rulings.** §4.1 scope list and §4.3 semantics — David. Everything below assumes
   the leans; a different ruling moves work, not feasibility.
2. **`blend`, everywhere at once.** Schema + scaffold + reference prose + guide
   line; `setBlend` on DOM (mix-blend-mode + isolation), canvas (op at landing,
   group path for subtrees), Mac (compositingFilter); seam rows; `blendview` probe
   into perceptual + mac gates. This is the small phase and proves the seam shape.
3. **`backdrop` on DOM + canvas.** The attribute + `frost()` constructor + prose;
   `backdrop-filter` on DOM; sample-under on canvas with the measured cost figure
   recorded; `frost` probe; seam rows say the Mac gap out loud.
4. **`backdrop` on Mac.** NSVisualEffectView overlay + mask; mac gate baseline;
   the §4.3 baseline policy exercised for real. **Before driving the mac gate, read
   `native-host.md` §0's operational traps** — piping the launch into `head`
   SIGPIPEs the app, two instances stack two windows and fake a catastrophic
   regression, and liveness is a *window* (`mac-host/winb`), never a pid.
5. **Adoption.** `Menu` reads `theme.menuBackdrop` (the "pending" comments come
   out); Cupertino elects true frost; `Dialog` scrim and the desktop's windows
   follow as design wants them; guide ch. 20's gap paragraph is rewritten to the
   new truth.

## 8. Risks, stated

- **Canvas frost cost** is the only real performance risk: region copy + filtered
  redraw per under-content-dirty frame. Mitigations: region-bounded capture,
  over-scan only by radius, dirty-tracking from the draw cache, and a measured
  budget before adoption (if a frosted menu over the desktop costs frames, the
  number goes in this file and the adoption decision is made on it).
- **Blend kernel/material deltas** across engines are absorbed by per-program
  baselines — but a *semantic* divergence (isolation behaving differently on DOM
  than the §4.1 list) would be a conformance bug, not a tolerance; the blendview
  probe must include a nested-container case for exactly that.
- **DOM stacking contexts:** `mix-blend-mode` and `backdrop-filter` both create
  them. Declare owns paint order through declaration order, so this should be
  invisible — verify against the overlay machinery (`raise()`, travelWith) rather
  than assuming.
- **iOS:** `compositingFilter` is ignored there. Nothing in this plan targets iOS;
  recorded so a future host does not discover it as a surprise (native-host.md §11
  already carries the iOS register).
- **Color space:** blending happens in encoded sRGB on every backend (the Mac blur
  precedent). Stated once here as the contract; a future linear-light mode would be
  a new token, never a silent change.

## 9. Cross-references

`draw()` tier and calibration: `runtime/src/draw.ts`, `DrawReplay.swift`,
`mac-host/blurcal.mjs`, probes `blend`/`blur`/`vignette`. The recorded gap this plan
closes: `docs/guide/20-renderers.md` (frost paragraph), `library/menu.declare`
(material comment), `library/themes/cupertino.declare` (both "pending" notes),
`docs/system-design/native-host.md` §4 and §9. Overlay hosting: `Overlays.swift`.
Offscreen groups: `runtime/src/canvas-backend.ts`. Seam discipline:
`test/seam.test.mjs`. Baseline policy: `mac-host/gate.mjs` header.

# Part II · Transform — rotation and the pinch primitive

**Status: scoped (David, 2026-08-06 — on rotation: "we not only need to do it,
we need to do it well"); design details to be settled in-build, hard parts
named here so none is discovered late.**

## II.1 `View.rotation`

Degrees, **painted-only** like `scale` (layout untouched — the box the tree
reasons about never rotates); shares scale's pivot machinery (schema.ts:108
region — pivot points, painted-vs-layout, per-backend realization — every hard
decision rotation needs was already made for scale) and composes with it
(one order, documented: scale then rotate about the same pivot).

- **The hard part, named**: hit-testing through the INVERSE transform in the
  model walk (interaction.ts leafAt + the canvas backend's reverse painter's
  walk), so `hovered`/`pressed`/claims/`Inspect.at`/`explainHit` stay honest
  under rotation. CSS-only approaches fake this; Declare's walk must not.
- Three backends: CSS `transform` / canvas `ctx` transform (text crispness at
  fractional angles needs care at dpr) / `CATransform3D` on the Mac host —
  which gets it nearly free, but consumes it via the op protocol (TEXTSTYLE
  discipline: forward the field, seam-row the gap until the host reads it).
- **Open policy to rule in-build**: perceptual-baseline tolerance for rotated
  antialiasing (it differs per backend); `draw()`-tier interplay (a rotated
  view's drawing rotates with it — the recording replays under the transform).
- 4.3 (draw() image sources) stays deferred; re-examine once rotation lands —
  a rotated `Image` dissolves the most common want.

## II.2 The `onPinch` family (assessment 4.4 — deferred here deliberately)

Declaring `onPinchStart/onPinch/onPinchEnd` IS the claim of the two-finger
gesture over that subtree — realized as `touch-action: pan-x pan-y`
(single-finger pan stays the page's; only pinch retires — the same narrowing
`claim = x` performs for drags). The router recognizes two fingers and
delivers `e.scale` (cumulative) and root-space `e.center`; the canvas backend
gets its `claimAt` twin. "Roll your own math over a subtree touch claim"
works today and is not the answer. Pinch nearly always DRIVES scale/rotation
of a sub-surface — which is why it lives in this part.

## II.3 As built (2026-08-06)

**Rotation** landed exactly on scale's bones: `rotation` (degrees, clockwise,
painted-only) shares the pivot, pushes through one composed-transform pusher
(view.ts `pushTransform` — setScale always accompanies the optional
`setRotation`, so a backend keeps ONE transform), and is realized as CSS
`transform` / `ctx.rotate` / `CATransform3D` (sign flipped for the layer
tree's y-up space, the SHADOW-negation precedent). **The hard part is done
honestly**: the inverse joined `toChildLocal` as the walk's fourth term, and
the canvas/mac reverse walks share an `invertTransform` helper — probes,
`hovered`/`pressed`, `viewAt`, and the conformance oracle all ride it. The
two open policies RULED in-build: (1) rotated-edge AA tolerance = soft bands
in the DOM/canvas suite (mean ≤ 4 blurred), per-program baseline on the mac
gate (the text-metrics policy, applied); (2) draw()-tier interplay = a
recording replays under the transform on all three renderers (the rotation
probe's text case pins it — nothing special was needed, which is the point).
`paintFrost` was hardened to corner-mapped device bounds so frost composes
under rotation.

**The onPinch family** is the recognized layer over the raw one: declaring
`onPinchStart/onPinch/onPinchEnd` claims the two-finger gesture
(`touch-action: pan-x pan-y` on DOM; second-finger `preventDefault` in the
canvas arbitration — claim-surface.md carries both rows), the shared router
recognizes the pair (resolution attaches the nearest pinch OWNER up the hit
chain, so fingers landing on interactive children still pinch the declaring
ancestor), and delivers cumulative `e.scale` + root-space `e.center`.
Composition with an unheld drag claim retires pinch-zoom and keeps the
drag's pan axis (`none` / `pan-y` / `pan-x`). iOS rule satisfied:
`tools/internal/sim/pinchlab.declare` + two regress cases, full suite 26/26
green on the simulator (2026-08-06), stamp written. The Mac host joined the
wheel stream the day after (2026-08-07): `scrollWheel` and a new
`magnify(with:)` both route through `__declareWheel`, which consults
`onWheel` claims FIRST (`MacSurface.wheelTo` mirrors the canvas walk —
nearest scroller still beats a farther claimant, rotated subtrees inverted,
pinned chrome read in frame coordinates via a retained `ignoresScroll`) and
falls back to the scroller walk only when nothing claims. Desktop pinch
keeps its one spelling everywhere: ctrl+wheel or `magnify` arrives as a
wheel with the `pinch` flag set, so a program written against the browser's
trackpad hears the identical stream natively — three conformance cases pin
claim delivery, nested-scroller delegation, and the pinch flag three-way.
The remaining true gap is only touch-screen two-finger `onPinch`, which no
Mac hardware surfaces; `wantsPinch` rides the wire for symmetry exactly as
`wantsTouch` does.

# Part III · The text piece — author-facing font metrics

**Status: scoped; the measurement machinery already exists** (measure.ts —
`fontMetrics()` reads `fontBoundingBoxAscent/Descent`, `capHeight()` probes
the ink of "H"; it is how `y = center` centers the cap-to-baseline band).
This part is language SURFACE, not new measurement:

- Read-only, reactive `ascent` / `descent` / `capHeight` / `xHeight` /
  `baseline` on `Text` (baseline = the y of the first baseline inside the
  view — what cross-font/cross-size baseline alignment needs; the homepage
  badge exercise did this by hand arithmetic). Re-derive when the effective
  font changes (the prevailing slots).
- Why measurement, not font tables: no web API reads a font's tables; the
  binary is unreachable for system fonts and carries THREE competing
  ascent/descent sets (hhea, OS/2 typo, OS/2 win) that browsers disagree on —
  canvas `measureText` reports what THIS engine will actually render.
- **Ruling wanted in-build**: `Text`-only, or also a per-font query service.
- Adjacent, found by the coverage sweep (evals/README.md §Coverage): the four
  prevailing typography tokens `headingColor`/`headingWeight`/`codeColor`/
  `codeFamily` are absolute zeros — no theme, sample, doc example, or test
  touches them. Their first real user is their first integration test; light
  them up (or retire them deliberately) as part of this part.

## III.1 As built (2026-08-06)

The five metrics landed as read-only, REACTIVE getters on `Text` (schema'd
with `readOnly`, measured through `fontString(this)` whose slot reads are
tracked — so a constraint riding `label.baseline` follows the effective font
wherever it changes, a re-rooted provider included). `xHeight` joined
measure.ts beside `capHeight`, probed from "x" with the 0.5 em stub
fallback. `baseline` = the font ascent — both renderers place the first
line's baseline there, and a declared `lineHeight` changes only the stride
(the natural-box rule, now stated as surface). The homepage badge's hand
arithmetic is `y = { title.y + title.baseline - this.baseline }` now; the
unit suite pins the idiom reactively. **The in-build ruling taken:
Text-only v1** — no per-font query service until a real program needs one a
hidden Text cannot serve. The four zero-coverage typography tokens
(`headingColor`/`headingWeight`/`codeColor`/`codeFamily`) got their first
real users: richtext.test renders a provided container's prose and asserts
all four are worn (they were — the machinery was sound, only unexercised;
lit up, not retired).

# The standing rules (all parts)

1. **The iOS rule** (claim-surface.md, RULED 2026-08-06): any change to input
   declarations or gesture claims — all of Part II — requires iOS-simulator
   validation and a `tools/internal/sim/regress.mjs` case, run green; the
   stamp quiets the run-gates advisory.
2. **Each phase lands whole**: schema + check + both web backends + mac
   forward-or-seam-row + prose (the completeness gate demands it) + pins +
   derive; gates green before the next phase starts.
