<!-- nav: Two renderers -->
<!-- part: In practice -->

# Two renderers — the same program in DOM or on a canvas

Everything you have written so far runs unchanged under two renderers. The
**DOM renderer** — the default — realizes each view as an element and leans on
the browser: CSS paints boxes, native machinery scrolls and selects, real
text sits in real nodes. The **canvas renderer** paints the whole program
into a single `<canvas>`: one element, its own compositor, its own
hit-testing. Switching is a flag, not a port:

```
…/calendar/calendar.declare?render=canvas     (URL)
declare build calendar.declare --render canvas (CLI)
```

The program, the reactive graph, the input router, and every constraint are
identical — only the *realization strategy* changes. That is not a slogan;
it is tested: the perceptual suite proves DOM and canvas renders of one
program agree pixel-for-pixel within anti-aliasing tolerance, and measured
across the real apps the settled first paints differ by **0.2% of pixels or
less** — anti-aliased edges, nothing structural.

## How each one works

**DOM**: every view is a `<div>` whose geometry Declare drives directly.
Box decoration maps to CSS exactly where CSS is measured pixel-stable
against the shared box painter; text is real text; `scrolls = y` is a
native scroller; hit-testing is the browser's own, with the runtime
resolving to the nearest handler-bearing view.

**Canvas**: one shared surface and a scene walk. Paint order is child
order; hit-testing is the same walk in reverse, with the identical
subtraction for a Shape `clip` (`isPointInPath`) that the DOM realization
promises. Scrolling, clipping, opacity, scale — all reimplemented in the
compositor, which is exactly why the perceptual suite exists: the two
pipelines can never be allowed to drift.

`draw()` is the same story twice: your drawing records once into a display
list, and each renderer realizes it its own way — the DOM backend
rasterizes it into that view's own crisp, dpr-aware raster; the canvas
backend replays it straight into the shared surface each paint. Same
recording, two realizations, identical pixels.

## What the numbers say

Measured on the real apps (same machine, same headless Chrome, both
renderers driven with real clicks and drags):

| | DOM | canvas |
|---|---|---|
| settled parity (non-desktop apps) | — | ≤ 0.2% of pixels, 0 structural |
| input latency, real presses (calendar) | ~1 ms avg, 3–4 ms max | same |
| animation (dock magnification sweep, calendar view zoom) | ~120 fps | ~120 fps |
| JS heap (per app) | 2–9 MB | within 0.5 MB of DOM |
| elements on the page | 28–536, tracks app size | **14–18, constant** |
| first paint, light apps | ~100–240 ms | same |
| first paint, scene-heavy apps (calendar grid, desktop wallpaper) | ~100–140 ms | **550–700 ms** |

The shape of the trade: once running, the two are indistinguishable —
latency, frame rate, and memory are the same because the reactive graph
doing the work is the same. The canvas pays its price once, at first paint
(a whole scene rasterized at boot, blur-heavy wallpapers especially), and
holds one advantage forever after: the page itself stays a dozen elements
no matter how large the interface grows.

## Where they genuinely differ

**Accessibility and text.** The DOM renderer is the accessible one today:
text is real text (`selectable = true` opts a region into native
selection), fields are native fields, and assistive technology has a tree
to read. The canvas is one opaque element — a screen reader sees nothing
inside it. Static extraction narrows part of that gap for crawlers and
agents (`?extract` serves the settled content as semantic HTML, either
renderer), but for interactive assistive use, ship DOM.

**Input fields work everywhere — natively.** `TextInput` in the canvas
renderer is not a simulation: a transparent **native** `<input>`/`<textarea>`
overlays the canvas, glued to its view's box every frame, so the caret,
IME, autofill, and selection inside a field are the platform's own in both
renderers. Text selection *outside* editables (a Markdown page) is native
in DOM only.

**Islands are DOM-only.** `DOMIsland` — and therefore `AppIsland` — needs a
real element interior to hand the tenant, which a sealed canvas does not
have. An app that embeds foreign DOM or a child Declare app renders those
boxes empty under `?render=canvas`. The desktop demo is the honest example:
its dock, windows, menus, and wallpaper are fully canvas-capable (the
magnification sweep holds the same ~120 fps), while a window that hosts an
embedded app shows its frame without its tenant.

**Overlay effects are not yet at parity.** Frosted surfaces — the dock
shelf, translucent chrome — use CSS backdrop blur in the DOM renderer. The
canvas compositor can blur what it *draws* (the desktop wallpaper is a
`draw()` blur, identical in both), but it does not yet sample what lies
*beneath* a translucent surface, so canvas frost renders as plain
translucency. This is the one visible gap in the parity numbers above, and
it is scheduled: backdrop sampling is coming to the compositor, and the
perceptual suite will hold it to the same tolerance as everything else.

## Choosing

Default to DOM: accessibility, islands, native selection, and instant first
paint. Reach for canvas when the surface must be sealed and uniform — pixels
you can capture, composite, or ship somewhere a DOM cannot go — or when an
interface is so element-heavy that a constant-size page matters more than
first-paint speed. And hold either choice loosely: the flag is one word,
and the program neither knows nor cares.
