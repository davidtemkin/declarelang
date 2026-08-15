<!-- nav: Renderers & hosts -->
<!-- part: Where it runs -->

# Three renderers, two hosts

Everything you have written so far runs unchanged in more places than you have
been told. This part of the guide is that story, and it needs one distinction
drawn cleanly first, because they are different claims:

> **A renderer paints the program. A host runs it** — owns the process, the
> window, and the input devices. Declare has three renderers across two hosts,
> and the program neither knows nor cares which it woke up in.

In the **browser host** there are two renderers. The **DOM renderer** — the
default — realizes each view as an element and leans on the browser: CSS paints
boxes, native machinery scrolls and selects, real text sits in real nodes. The
**canvas renderer** paints the whole program into a single `<canvas>`: one
element, its own compositor, its own hit-testing. Switching is a flag, not a
port:

```
…/calendar/calendar.declare?render=canvas     (URL)
declare build calendar.declare --render canvas (CLI)
```

And then there is the claim that sounds impossible until you watch it: **Look
ma, no browser!** The **Mac host** is a native macOS application — its own
process, its own window, real menus — that runs the same program file on a
third renderer, a Core Animation layer tree. No WebView. The runtime speaks to
it over a thin bridge of drawing and input operations; everything above that
seam — the reactive graph, layout, hit-testing, every constraint you wrote — is
the identical code the browser runs. A trackpad pinch arrives on the same wheel
stream with the same `pinch` flag; a scroll consults the same `onWheel` claims;
`rotation` and `backdrop = frost(…)` land on the layer tree like they land on
CSS. The host is solid at what it does — the entire app corpus runs on it
compatibly, held by its own visual gate and by a three-way conformance oracle
that requires byte-identical behavioral answers from all three renderers (run
before release rather than on every commit). What it does not yet attempt is
the other half of desktop software: integration and distribution — installers,
signing, updates, file dialogs, the dock — the problem Electron actually
solves. Today it is a proof about the language, at full fidelity; the
interesting potential is what it points at: an Electron-shaped shell with no
Chromium in it.

## The program, the graph, and the seam

The realization strategy is the *only* thing that changes. **DOM**: every view
is a `<div>` whose geometry Declare drives directly; hit-testing is the
browser's own, with the runtime resolving to the nearest handler-bearing view.
**Canvas**: one shared surface and a scene walk — paint order is child order,
hit-testing is the same walk in reverse, with the identical subtraction for a
Shape `clip` that the DOM realization promises. **Mac**: the same scene, as a
tree of native layers, with input walked by the same rules on the runtime's
side of the bridge.

`draw()` is the same story three times: your drawing records once into a
display list, and each renderer realizes it its own way — the DOM backend
rasterizes it into that view's own crisp, dpr-aware raster; the canvas backend
replays it straight into the shared surface; the Mac host replays it into its
layer. Same recording, three realizations, the same pixels.

None of this is a slogan; it is *tested*, three ways. The **perceptual suite**
holds DOM and canvas renders of one program pixel-for-pixel within
anti-aliasing tolerance. The **Mac gate** holds the native host to per-program
baselines across a corpus of real apps — blends, frost, rotation, rich text,
the whole desktop. And the **conformance oracle** — run before release rather
than per commit, since it needs the live host — asks all three the same
behavioral questions — where does this press land, what does this scroll move,
what does the wheel-claim walk decide, where does keyboard focus go — and
requires byte-identical answers.

## What the numbers say

Measured on the real apps (same machine, both browser renderers driven with
real clicks and drags):

| | DOM | canvas |
|---|---|---|
| settled parity (non-desktop apps) | — | ≤ 0.2% of pixels, 0 structural |
| input latency, real presses (calendar) | ~1 ms avg, 3–4 ms max | same |
| animation (dock magnification sweep, calendar view zoom) | ~120 fps | ~120 fps |
| JS heap (per app) | 2–9 MB | within 0.5 MB of DOM |
| elements on the page | 28–536, tracks app size | **14–18, constant** |
| first paint, light apps | ~100–240 ms | same |
| first paint, scene-heavy apps (calendar grid, desktop wallpaper) | ~100–140 ms | **550–700 ms** |

The shape of the trade: once running, the two are indistinguishable — latency,
frame rate, and memory are the same because the reactive graph doing the work
is the same. The canvas pays its price once, at first paint (a whole scene
rasterized at boot, blur-heavy wallpapers especially), and holds one advantage
forever after: the page itself stays a dozen elements no matter how large the
interface grows. The Mac host's corpus runs the same apps within the gate's
tolerance; its performance story is the platform's own compositor.

## Where they genuinely differ

**Accessibility and text.** The DOM renderer is the accessible one today:
text is real text (`selectable = true` opts a region into native
selection), fields are native fields, and assistive technology has a tree
to read. The canvas is one opaque element — a screen reader sees nothing
inside it. Static extraction narrows part of that gap for crawlers and
agents (`?extract` serves the settled content as semantic HTML, whichever
renderer), but for interactive assistive use, ship DOM.

**Input fields are native everywhere.** `TextInput` in the canvas renderer
is not a simulation: a transparent **native** `<input>`/`<textarea>`
overlays the canvas, glued to its view's box every frame, so the caret,
IME, autofill, and selection inside a field are the platform's own. The Mac
host holds the same discipline with the platform's own field machinery.
Text selection *outside* editables (a Markdown page) is native in DOM only.

**Islands split by what they host.** `AppIsland` embeds a child Declare
program; `DOMIsland`, which it extends, embeds foreign web content. The first
needs only a place to put a view tree, and the second needs a real browser.

| | a child Declare app (`AppIsland`) | foreign web content (`DOMIsland`) |
|---|---|---|
| DOM | yes | yes |
| Mac | **yes** | no — the native host embeds no web engine |
| canvas | no | no |

The desktop demo shows both halves. Its dock, windows, menus, and wallpaper are
fully canvas-capable (the magnification sweep holds the same ~120 fps), and on
the Mac host opening Calendar from the dock renders the whole app inside its
window — a child program, its own reactive graph, hosted natively with no DOM
anywhere. On canvas that same window paints its frame, title bar and shadow
around an empty interior: nothing there can take a tenant yet. That is an
unbuilt path rather than an impossible one — the Mac host proves a tenant needs
no element, and what canvas lacks is the mounting seam, not the capability.


### Getting the Mac host

It is not shipped with this repo and not committed to it — the Swift sources are
tracked, the built application is a per-machine artifact. You build it:

```bash
bash mac-host/bundle.sh
```

It installs to `/Applications` when that is writable, else `~/Applications`, else
beside its sources in `mac-host/`. An Applications directory is what lets macOS
offer it as a document handler, so that is where a double-click starts working.

Once installed it opens a program three ways: a URL served by the dev server (the
server compiles, nothing is downloaded), a directory holding a built artifact, or
a `.declare` file **anywhere on disk** — double-clicked, dropped on the app, or
`open`ed from a shell. A file outside the tree still resolves its own `include`s
beside itself and its library components from the Declare tree the app was
stamped with, so you can copy a program's folder to the Desktop and run it.

What it is not is a way to *ship* an application. It runs Declare programs with
the whole language and the standard library, but it is a runtime environment, not
a packaging story: no standalone signed app with its own identity, no system
integration, no per-program installer. `declarec --render mac` refuses for that
reason. The full operational detail — stamps, `DECLARE_ROOT`, the gates — is in
[`operational/mac-host.md`](../operational/mac-host.md).

**Overlay effects are at parity.** Frosted surfaces — a menu's panel, a
dock shelf, translucent chrome — are the `backdrop` attribute
(`backdrop = frost(radius, saturation)`), and every renderer realizes it
natively: the DOM as compositor `backdrop-filter`, the canvas compositor by
sampling what has already painted beneath the view at composite time (the
painter's model makes that natural), the Mac host by sampling its layer
tree through the same blur, in the same color space. The perceptual suite
holds the three to the same tolerance as everything else, and the measured
cost of a frosted header over a scrolling canvas list is about a tenth of a
millisecond per frame.

## Why this matters even if you never leave the DOM

A language that owns its whole semantics — with no substrate assumptions
leaking into programs — can retarget. That property already bought you the
canvas renderer and a native Mac application without a rewrite, and it is the
door to hosts that do not exist yet. But it pays inside the browser too: it is
*why* the perceptual and conformance suites can exist at all, and they are what
keeps every behavior in this guide meaning exactly one thing. The discipline
that makes the program portable is the same discipline that makes it
trustworthy.

## Choosing

Default to DOM: accessibility, islands, native selection, and instant first
paint. Reach for canvas when the surface must be sealed and uniform — pixels
you can capture, composite, or ship somewhere a DOM cannot go — or when an
interface is so element-heavy that a constant-size page matters more than
first-paint speed. The DOM is the vehicle; the canvas keeps it honest —
pixel-parity against a second realization is what stops substrate assumptions
from leaking into the language. The Mac host is the experiment with the most
interesting potential: it already runs everything, natively; what it awaits is
the integration story that would make it a way to ship desktop software rather
than a way to prove the language. And hold every choice loosely: the flag is
one word, and the program neither knows nor cares.

[Next: **Crossing boundaries** →](declare-docs:guide:embedding)
