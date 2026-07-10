# Worker rasterization — lessons from Mesa client

*Extracted 2026-07-01 from `~/Code/Mesa/client` (human-flagged: "difficult to land"; constraints not identical to ours but the pacing problem is the same). Reference for the future worker-rasterization deployment of the ruled rendering model (HANDOFF §"The rendering model" — recording stays main-thread, rasterization offloads, composite tolerates a producer slower than frame rate). File:line refs are into Mesa client's source.*

## Architecture in one paragraph

Worker owns the canonical scene and renders into a persistent `OffscreenCanvas`; it does **not** use `transferControlToOffscreen`. Pixels come back as `getImageData().data.buffer` — a raw RGBA `ArrayBuffer` in the postMessage **transfer list** (zero-copy) — and the main thread paints them with `putImageData` into a plain canvas that is permanently GPU-layered via `will-change: transform` (`worker-core.ts:296-386`, `render-layer.ts:73,167-217`). The main thread then **reprojects the last-good bitmap with a CSS transform every frame** (`cssScale = viewportZoom/renderedZoom`, `cssTx = (renderedX−viewportX)·viewportZoom`, `render-layer.ts:114-128`), so input stays at frame rate on stale-but-valid pixels while the worker catches up. Rendered coordinates travel **with** the pixels (`renderedX/Y/Zoom`).

## The pacing/backpressure mechanism (the part that was hard to land)

- **One in-flight request per layer** (`renderPending` guard, `shell-core.ts:538-548`) + **one coalesced dirty flag** (`viewportDirty`); the rAF loop emits at most one render request per frame (`shell-raf-loop.ts:168-173`). No queue, no sequence numbers on the hot path.
- **Single pending slot, overwrite-on-arrive** (`render-layer.ts:148`): a newer bitmap simply replaces the buffered one — stale frames drop for free, no backlog.
- **Receive ≠ apply**: incoming pixels are only buffered; application happens at the top of the rAF loop — the compositor is vsync-driven (`render-layer.ts:133-161`).
- **High-frequency messages coalesce to latest-wins behind a worker-busy flag** (`pendingDragMove`, flushed on worker-idle, `shell-core.ts:252-280`).
- **Input never awaits the worker**: handlers mutate viewport state, reposition the existing bitmap via CSS, set the dirty flag, and return.
- Epoch/generation counters (`rootDirtyEpoch`, `_dirtyEpoch`) are used **only** in the async data-fetch layer to drop superseded payloads mid-flight — not in the render loop (`render-worker.ts:366-416`).

## Failure modes they hit (design against these)

1. **Silent stale-freeze** — any state where a bitmap is buffered-but-not-applied (mode/animation gating) can freeze the canvas forever if no follow-up arrives. Fix: a deterministic **drain on return-to-idle** + skip-with-reason telemetry (`shell-core.ts:181-192`, `shell-bitmaps.ts:61-95`). Slow clients widen the window.
2. **GPU-memory leak → Safari OOM-reload** — `ImageBitmap`/`OffscreenCanvas` without explicit `close()`. They instrument allocation vs disposal and use a `FinalizationRegistry` to catch handles GC'd unclosed (`image-alloc-tracker.ts`).
3. **Readback is the real cost** — "`getImageData` forces GPU flush" (`worker-core.ts:337`); they time it separately (`transferMs`). Use `willReadFrequently: true` on readback contexts.
4. **Resize storms** — debounce (~150ms) and keep the old-sized canvas until a correctly-sized bitmap lands (`resizePending`, `shell.ts:997-1044`); adopt the worker's rendered viewport when it does.
5. **Layer budget** — each `will-change: transform` element is its own GPU layer; budget against `detectMaxTextureSize()` (`mover-budget.ts`).
6. **Init race** — drop render requests before worker init completes (`render-worker.ts:581`).

## Staleness made measurable

**Visual debt**: the fraction of the viewport showing background because the reprojected stale bitmap no longer covers it, accumulated as fraction×dt with a peak stat, emitted on motion-stop (`shell-core.ts:480-531`). Turns "feels laggy" into a metric that says when reprojection stops being good enough.

## Deltas for Declare

Mesa ships *pixels* because its worker owns the scene. In neo the recording (display list) is the transferable artifact and the main thread owns state — so our handoff can be ops-down / bitmaps-up (`ImageBitmap` or buffer, cost-measured per lesson 3), and Mesa's reprojection trick maps to our composite-time transform: a stale layer bitmap composites at the *current* transform by construction (the rendering model's lock-in #3 buys Mesa's `positionLayer` behavior for free). The single-slot/one-in-flight/latest-wins pacing and all six failure modes carry over directly.
