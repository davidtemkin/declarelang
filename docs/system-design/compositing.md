# Compositing — view-level blending and the backdrop, across all three renderers

**Status: PLAN, RATIFIED TO BUILD (David, 2026-08-06 — "I am going to want all of
this implemented").** One unified plan for the compositing surface: `blend` (the
`mix-blend-mode` analogue, a View attribute) and `backdrop` (the frost — backdrop
sampling with blur), realized on DOM, canvas, and the native Mac host, with the
headless renderer a declared no-op. Two semantic rulings are called out in §4;
everything else is buildable as specified. Phasing in §7.

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

### 5.4 Headless

No-op for both members, `NOT_APPLICABLE` in the seam table — headless paints
nothing, so there is nothing to composite or sample. The crawler document is
unaffected (compositing is paint, never content).

## 6. Verification

- **Probes where the absence shows** (the `ignorescroll` lesson — a likeness test is
  blind to a missing feature unless the scene makes it visible):
  - `blendview.declare` — a `multiply` view over a gradient *sibling* (not its own
    drawing), so a backend that ignores `setBlend` renders visibly flat-wrong;
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
   the §4.3 baseline policy exercised for real.
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
