# A compositor thread for the Mac host

**Status: DEFERRED (2026-09-27).** Main keeps compositing for now. A browser-like compositor
thread is clean only when nothing on the page is a separate OS view, and today the editables
(and a selectable rich flow while mounted) are `NSTextView`s placed over the layers, which would
trail them during scrolling. Browsers avoid this by owning text editing: the engine draws text,
caret and selection in its own layers and takes input through `NSTextInputClient` and
`NSAccessibility` on one view. So the order, if this is taken up, is **owned text editing first,
then this thread**. Video already fits (it is an `AVPlayerLayer` in the tree). A `WKWebView` in a
DOMIsland could never be composited by us — its pixels arrive through a private remote layer — so
it would be an overlay under any architecture.

What was done instead, on main: bitmaps made in the display's colour space where they are made,
and frost backdrops repainted only when what lies beneath them changed.

The design below is kept as the map for when owned text editing exists.

## The line

A browser runs three roles on three threads, and the Mac host should run the same three:

| role | browser | Mac host today | Mac host after |
|---|---|---|---|
| window, events, chrome | the browser's UI thread | **main** | **main** |
| the program: settle, layout, `draw()` | the page's main thread | the runtime thread | the runtime thread |
| the compositor: applying the frame, backdrop filters, scrolling, the frame clock | the compositor thread + GPU | **main** | **the compositor thread** |

Today the compositor's work shares main with AppKit. On weather's live resize, frost alone is
~21 ms of main time per step (1.7 s over 80 steps: painting what lies beneath each frosted view
on the CPU, then a GPU blur), and commits land ~23 ms apart on an 8.3 ms display. Nothing about
that work is AppKit's; it runs on main only because the layer tree does.

Moving it keeps every commit exactly what it is now — applied whole, frost resampled in the same
transaction — so nothing a program or a rig can observe changes. What changes is which thread
does it, and so what it can block.

## Who owns what, after

- **Main (AppKit only).** NSEvents; the title bar, menus, window moves and resizes; the automation
  label; the native text views (editables, a selectable rich flow while it is mounted); the
  cursor. It never applies a layer op, paints a frost or runs the scroll physics.
- **The compositor thread** (new; its own run loop). The layer tree (`LayerTree`, every op), frost,
  blends and masks (`Frost.swift`), rich-text bands, image and media layers, the frame clock (a
  `CADisplayLink` scheduled on this thread's run loop), and the host's scroll process (`tickScroll`,
  `wheel`, momentum, scroll facts to the runtime). Core Animation is thread-safe; the tree commits
  its own explicit transactions here.
- **The runtime thread.** Unchanged. Its commits go to the compositor instead of to main.

## Every place the tree and AppKit touch

Found by reading `LayerTree`, `Frost`, `Scrollbars`, `Media`, `App` (DeclareView), `ProgramWindow`,
`Control` and `Bridge`.

| # | touchpoint | today | after | risk |
|---|---|---|---|---|
| 1 | a commit from the runtime | `DispatchQueue.main.async { tree.apply }` | posted to the compositor | low |
| 2 | frame clock + scroll process (`onFrame`: `tickScroll`, `flushScrollFacts`, `pump`) | display link on main | display link on the compositor's run loop | medium |
| 3 | wheel / magnify (`DeclareView.scrollWheel` → `tree.wheel`) | main, synchronous | main posts the event to the compositor | low |
| 4 | scrollbar hover, hit and drag (`scrollbarHit`, `setHotBar`, `dragScrollbar` from mouse events) | main asks the tree synchronously | the compositor publishes scrollbar rects (a locked snapshot per commit); main hit-tests the snapshot and posts the drag | medium |
| 5 | native overlays placed over layers (`repositionOverlays`: editables, mounted rich flows; called after ops, scrolls, resizes) | same transaction as the layer move | the compositor publishes each overlay's rect; main places the views | **high** — see hard part B |
| 6 | editable ops (EDIT, EDITFOCUS, EDITSEL) create and drive NSTextViews | in `apply`, on main | the compositor forwards them to main | medium |
| 7 | rich-text layout (`richLayout`, `richClamp`: TextKit, called synchronously by the runtime) | runtime → `main.sync` | unchanged: TextKit stays on main; the band bitmaps it produces go to the compositor | medium |
| 8 | cursor op, window background colour | in `apply` | forwarded to main | low |
| 9 | root layer install (`view.setRoot`), view bounds, backing scale | read from `view` inside the tree | installed once on main; bounds and scale handed to the compositor on every change | low |
| 10 | live resize (`windowDidResize` → `syncSize` + wait ≤ 50 ms for the commit) | main waits for the runtime's commit | main waits for the compositor's commit, same bound | **high** — see hard part A |
| 11 | image loaded, media player events | `main.async` into the tree | posted to the compositor | low |
| 12 | control channel reads (`geom`, `trace`, `who`, `boxes`, `frame`, `lines`, stats…) | read the tree on main | the channel runs on its own thread and asks the compositor | low (rig-only) |
| 13 | rich-flow hit for selection (`richFlow(atModel:)`) | main reads the tree | from the published overlay snapshot | low |
| 14 | mask stencil capture (`renderStencil`, `CALayer.render(in:)`) | main | compositor | low |

## The hard parts

**A. Live resize.** AppKit resizes the window in main's transaction, and the content must land in
the same one, or right- and bottom-anchored content trails the edge by a step. Today main holds
the frame for the runtime's commit (≤ 50 ms). After, it holds it for the compositor's commit.
The question is whether a layer tree committed from another thread lands in the same displayed
frame as AppKit's resize. The answer is not certain until measured; if it does not, the fallback
is to apply the commits made during a live resize on main (resize only), which is today's
behaviour for that one gesture.

**B. Native views over scrolled layers.** An editable text field, or a selectable rich flow while
it is mounted, is a real NSView drawn above the whole layer tree, placed each time the layers
move. Today the move and the placement share a transaction. After, the layers scroll on the
compositor and main places the view a moment later, so a field can trail its row by a frame
while scrolling. The browser does not have this problem because everything is in its
compositor. Options: accept the trail; or, as a browser engine effectively does, show an
unfocused editable as layers (its text drawn like any other text) and mount the native view only
while it has focus, which also removes most views from the problem. The second is a separate
piece of work; this design works either way.

**C. Core Animation from two threads.** The tree's layers hang under the view's layer, which
AppKit owns and commits on main. The compositor must only ever change layers under its root,
always inside its own explicit transaction, and never touch the view's own layer; main must never
touch the tree's layers. Everything in the table above is placed so that holds.

## Also in this piece

**Colour conversion.** Every bitmap the host makes is sRGB, and on a P3 display Core Animation
converts each new one on the thread that commits it. After this, that is the compositor, not
main. Doing the conversion where each bitmap is made (the runtime thread for drawings, the
compositor for frost) makes the commit cheaper again. Pixels stay the same: the conversion is the
one Core Animation would do.

## Considered and not chosen

- **A frost worker** (snapshot on main, paint and blur elsewhere, land a frame later). Smaller, but
  the frost trails motion by a frame, a visible difference from Chrome.
- **`NSVisualEffectView`.** The system blurs for free, but not at a program's radius and
  saturation, so frost would stop matching the other renderers.
- **`CABackdropLayer`** (what `NSVisualEffectView` uses). Private API.
- **`CARenderer`** capture. It detaches a window-attached tree (frostprobe3).

## Order of work

1. **A baseline for performance.** A measurement app built from the pushed commit (runbook:
   `comparative-benchmarking.md`), so every later number has something to stand against.
2. **The thread and the move.** Touchpoints 1–4, 8, 9, 11, 12, 14, with overlays (5, 6, 13) placed
   from the published snapshot.
3. **Live resize** (10), measured against today's edge tracking.
4. **Colour conversion.**
5. **The checks:** the gate, conformance, `mac-shell`, crossrender's Mac pass; the watchdog over the
   corpus; then the benchmark round against the baseline.

## Decisions for DT

1. Hard part B: accept a one-frame trail for native views while scrolling for now, or do
   layer-drawn unfocused editables first?
2. Hard part A: if the compositor's commit cannot share AppKit's resize frame, is applying
   resize-time commits on main (today's behaviour, resize only) acceptable?
