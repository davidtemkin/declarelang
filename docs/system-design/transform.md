# Transform — rotation, pinch, and the typography surface (SEED)

Status: **scoped, not yet designed** — the next session's arc (David,
2026-08-06). This seed exists so the scope survives the session boundary;
the full plan replaces it, at the grade of `compositing.md`.

## Why one arc

Rotation, the pinch primitive, and font metrics share a motivation — Declare's
focus on creative visual/interactive design ("we not only need to do it, we
need to do it well" — David, on rotation) — and share machinery: pinch drives
scale/rotation of sub-surfaces; rotated text needs the metrics story honest.

## In scope

1. **`View.rotation`** (degrees, painted-only like `scale`, shared pivot
   machinery, composes with scale). The hard part named up front:
   **hit-testing through the inverse transform** in the model walk, so
   `hovered`/`pressed`/claims/`Inspect.at` stay honest under rotation. Three
   backends (CSS transform / canvas ctx / CATransform — the Mac host gets it
   nearly free). Open policy: perceptual-baseline tolerance for rotated
   antialiasing, which differs per backend.
2. **`onPinch` family** (assessment 4.4, deferred here deliberately —
   "roll your own math" over a subtree touch claim works today but is not the
   answer). Declaring `onPinchStart/onPinch/onPinchEnd` IS the claim of the
   two-finger gesture over the subtree — realized as `touch-action:
   pan-x pan-y` (single-finger pan stays the page's; only pinch retires),
   the same narrowing `claim = x` performs for drags. Delivers `e.scale` and
   root-space `e.center`; canvas twin via `claimAt`.
3. **Font metrics exposure** — read-only, reactive `ascent` / `descent` /
   `capHeight` / `xHeight` / `baseline` on `Text`; the measurer already
   computes all of them (measure.ts — it is how `y = center` centers ink).
   Ruling wanted: `Text`-only, or also a per-font query service.
4. `draw()` image sources (assessment 4.3) stays deferred; re-examine after
   rotation lands — a rotated `Image` dissolves the most common want.

## The standing rule

Every item above changes input declarations or gesture claims →
**iOS-simulator validation + a `regress.mjs` case is mandatory**
(claim-surface.md, "The iOS rule for new claims").
