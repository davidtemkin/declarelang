# render=gpu — Declare on WebGPU, in workers

Add `?render=gpu` to an app's address and it runs on this renderer: the program in one dedicated
worker, its renderer in another, drawing with WebGPU through an OffscreenCanvas; the page's
thread only relays input and carries out what only a page can do. A scroll moves and is drawn
in the renderer's worker while the program is busy, as the browser's compositor does for the DOM. Nothing here is in the core DOM
bundle — the boot loads `gpu/dist/shell.js` by address (one line in browser/boot-uniform.js,
43 bytes gzipped).

## How it is put together

```
page (shell.ts)     canvas → transferred to the compositor · pointer, wheel, touch to the
                    compositor (touches to the runtime too), key, resize, appearance,
                    visibility to the runtime · cursor, title, page colour · the window's
                    scroll for a whole-page app (a strut; wheels and fingers outside the
                    compositor's page map are the browser's) · a text field
                    as a real DOM field over the canvas while it has focus (a press in its
                    box makes it there, caret at the press); otherwise the compositor draws
                    its value or placeholder
runtime worker      the runtime (unchanged) + MacBackend (runtime/src/mac-backend.ts,
 (worker.ts)        unchanged): the retained-layer backend — scene model, hit testing,
                    scroll model — declared here, as the DOM's is, to defer a view that
                    attaches hidden (no surface, no drawing recorded until first shown;
                    `&eagerhidden` makes every surface at once); its host is the compositor's
  env.ts            the page-shaped globals the runtime probes (window, document,
                    matchMedia), fed by the shell's messages
  remote-host.ts    the MacHost the runtime calls: measures with an engine of this worker's
                    own (same fonts, no GPU; a line's ink, read from glyph outlines, only
                    when asked: `ink`); records drawings into a stand-in engine; sends
                    each flush to the compositor as one message (the commit, the drawings'
                    engine calls, 3D views' projections); a finger's claim at touchstart
  drawing.ts        a view's draw() recording replayed into the engine as a picture
                    (encoded once per change, placed by transform every frame)
compositor worker   the engine on the canvas, and the host's platform side:
 (compositor.ts)
  host.ts           lays out the Texts the engine's host asks for (the runtime's own
                    wrapping), runs the touch session's physics, the wheel's quiet timer,
                    glides' ticks; draws a commit when it arrives and anything else at the
                    display's tick (a tick's frame waits up to 8 ms for the runtime's commit
                    while the runtime is sending them)
  fonts.ts          the fallback table: every family name resolves to a face the engine has
engine (Rust→wasm)  the host (engine/src/host/: the tree the ops build, the paint walk,
                    damage, the scroll process and scroll layers, frames — what the Mac host
                    is to share); Parley (shaping, per-character fallback, bidi), skrifa
                    (metrics), wuff (WOFF/WOFF2); the quads (paint.rs: boxes, borders,
                    shadows, gradients, text from a glyph atlas, images, clips, opacity
                    groups) and Vello (paths, drawings, blend groups, shape clips, and the
                    rasters the quads lay: glyphs, drawing sprites) on WebGPU through wgpu.
                    Built for speed (opt-level 3, wasm-opt -O3): 893 KB brotli
fonts/              Inter, Source Serif 4, JetBrains Mono — variable, with italics (OFL)
```

## Building and looking

```
node gpu/build.mjs [--no-engine]      → gpu/dist (engine wasm, worker.js, compositor.js, shell.js);
                                      NOMINIFY=1 keeps names, for a profile
npm start                             the dev server (:8200)
node gpu/look.mjs apps/calendar/ [--dom d.png] [--click x,y] [--drag x1,y1,x2,y2]
                  [--type text] [--key Key] [--wheel x,y,dy[,steps]] [--probe text|#id|app:path]
                  [--dark] [--size WxH] [--clip x,y,w,h]
node gpu/perf.mjs                     view changes timed on both renderers
node gpu/check.mjs [--dom]            Escape, cursor, live resize
```

gpu/dist is built on each machine and not committed, as the Mac app is; a page asking for
`?render=gpu` in a tree without it says so and names this command. The build needs
runtime/dist (derive), rustup (the toolchain, with the wasm32 target, is pinned in
engine/rust-toolchain.toml and installed by rustup on first use), wasm-bindgen-cli at the
version engine/Cargo.toml names (`cargo install wasm-bindgen-cli --version 0.2.129`), and
binaryen's wasm-opt (`brew install binaryen`). `node gpu/build.mjs` checks for each before it
starts and names what is missing.

## State (2026-10-13)

Calendar runs whole: every view, the springs between them, dragging events, the event
panel with its text fields (typing, Enter, Escape), sections that open, dark mode, the
narrow layout, live resize. Shots match the DOM renderer apart from the face (Inter where
the DOM uses the system font).

Measured (six view changes, 1440×900 at 2×): the page's thread 18 ms against the DOM
renderer's 778 ms; the worker 299 ms in all, of which 263 ms encoding and submitting 187
frames (median 1.1 ms, p95 2.5 ms).

Sizes: engine 815 KB gz (622 br), worker 196 KB gz (166 br, the runtime included), shell
2 KB, fonts ~2.1 MB (all six faces, loaded at boot).

Timing rig (gpu/src/bench.ts, run in the page): `node gpu/bench-chrome.mjs`, and in Safari
`node gpu/bench-safari.mjs` (a tab of its own through `safaridriver --mcp`; outside the
sandbox). Per view switch it reports the press to the first changed frame, the motion's
frames and longest gap, the worker's CPU, encode and GPU time, and the worker's own
animation-frame ticks; per event type, the page-to-worker crossing.

Measured 2026-10-13 (calendar, view switches): every event type crosses page → worker in
~0–1 ms (p95 ≤ 5 ms; one 57 ms outlier in Safari); a switch's first changed frame comes one
tick after the press (~17 ms; Year ~60–70 ms); 60 fps through every switch on both
browsers, longest gap ~17–22 ms; GPU per frame ~4–5 ms Chrome, ~9 ms Safari; GPU setup at
boot ~7 ms Chrome, ~350–400 ms Safari. No pixels are read back: the worker draws into the
page canvas's own texture.

A/B against the DOM renderer in Chrome (`node gpu/compare.mjs`, Chrome's own trace of every
thread; interleaved rounds; calendar 1440×900 @2x; 2026-10-13):

| per frame shown | DOM | GPU |
|---|---|---|
| view switches: page main thread | 2.7–3.0 ms | 0.15 ms |
| view switches: worker | — | 1.65 ms |
| view switches: renderer's other threads | 1.8–2.0 ms | 1.0–1.2 ms |
| view switches: GPU process | 1.2–1.4 ms | 1.0–1.2 ms |
| view switches: critical thread per 16.7 ms slot, median / p95 | 1.8–1.9 / 5.1–5.9 ms | 1.3 / 2.5 ms |
| drag: all processes | ≈3.3 ms | ≈3.9 ms (the whole scene redrawn for one moving event) |
| hover over a still program | 1 frame | 0 frames |

Startup (`node gpu/startup.mjs`, warm): DOM paints its first frame at ~149 ms; the GPU
renderer submits its first at ~253 ms — the boot hands over at ~61, the worker is running
at ~75, engine ~93, fonts ~144 (52 ms decoding and registering all six faces), GPU ~154,
program built ~213. The page's own thread does ~45 ms of startup work against the DOM's
~140.

Three renderers, frame by frame (`node gpu/profile.mjs [--headed]`; Chrome trace, µs; the
worker's phases marked with console.time under `?render=gpu&trace`; DOM / canvas / GPU interleaved;
busy calendar unless noted; per frame shown, all processes):

| workload | DOM | canvas | GPU |
|---|---|---|---|
| busy switches, headless | 12.2 ms | 26.3 ms | 8.0 ms |
| busy switches, on screen (120 Hz) | 10.8 ms | 18.6 ms | 6.7 ms |
| rapid switches, headless | 16.0 ms | 42.6 ms | 8.7 ms |
| rapid switches, on screen | 15.1 ms | 33.0 ms | 12.4 ms |
| light calendar switches, on screen | 5.8 ms | 9.1 ms | 4.2 ms |

Where the GPU renderer's time goes (busy switches, on screen): page 0.15 ms · worker 4.5 ms
(runtime 0.25, encode 1.8, Vello submit 2.3) · GPU process 0.9 ms; WebGPU execution
8.4 ms median per frame — close to the 120 Hz budget, so a full-frame redraw is the next
limit. DOM: page 7.1 ms (script 2.2, style 0.8, layout 0.7, paint 3.0). Canvas: page 7.5 ms
(script, including the drawing, 6.0), GPU process 6.0.

## The same program, three renderers, the same rows (2026-10-14)

`node gpu/apples.mjs [--headed]`: Chrome's trace of every thread plus V8's sampling profiler
(~150 µs), each JS sample attributed through the bundles' source maps to what the work IS;
GPU execution from Metal System Trace on Chrome's GPU process (every renderer's GPU work runs
there). Interleaved rounds; ms per frame shown. After culling, one-call command encoding and
damage-limited redraw.

| busy calendar, view switches | DOM | canvas | GPU |
|---|---|---|---|
| program (identical code) | 1.85 | 2.31 | 1.90 |
| renderer: script | 0.51 | 2.15 | 0.45 |
| renderer: engine (DOM lifecycle / Canvas2D / Vello+WebGPU) | 4.59 | 4.05 | 1.85 |
| gc (thread + V8 background) | 1.86 | 9.81 | 1.14 |
| compositing (compositor, GPU process CPU) | 2.83 | 9.21 | 1.11 |
| **total CPU** headless / on screen | **12.1 / 11.7** | **28.2 / 22.2** | **6.8 / 6.1** |
| GPU execution headless / on screen | 1.8 / 5.1 | 3.0 / 4.2 | 4.9 / 5.7 |
| critical thread busy, on screen (median / p95 of a frame) | 80% / 100% | 70% / 100% | 26% / 51% |
| frames shown on screen (120 Hz) | 797 | 689 | 868 |

Rapid (interrupted) switches, on screen: total CPU DOM 17.3 / canvas 39.4 / GPU 7.4; frames
594 / 287 / 737; DOM page thread 100% busy. Light calendar, on screen: DOM 5.0 / canvas 9.5 /
GPU 3.5 CPU, GPU execution 1.2 / 1.6 / 5.3. Drag (small changes), headless: 3.2 / 4.3 / 4.3
CPU, 1.2 / 2.0 / 1.7 GPU. Hover (totals): 179 / 1172 / 218 ms.

Two findings that shaped the worker:
- MacBackend's flush returned early when its JSON op list was empty, so a frame that only
  moved things (binary geometry records) was never committed — the first ~220 ms of every
  calendar view switch drew nothing, here and on the Mac host. Fixed in MacBackend
  (flushOps; test/mac-geom-binary.test.mjs), in main too.
- MacBackend's flush, scheduled by a requestAnimationFrame made during the tick's changes,
  landed a tick late in Safari: every other tick drew (30 fps). The worker flushes and
  draws in a task queued behind each tick's callbacks (env.ts setAfterTick), so a tick's
  changes are its frame — in Chrome too, a frame sooner than before.

## Other apps (2026-10-14)

Every app in apps/ now starts under ?render=gpu. What was added for them:

- **Images**: env.ts's `<img>` stand-in fetches and decodes in the worker and hands the
  pixels to the engine under a handle (engine `add_image`, command 11); stretch, alignment,
  tint and `imageRendering = pixelated` are drawn as the canvas renderer draws them.
- **Scrolling** is the host's process, as on the Mac host: a wheel finds the innermost
  scroller (or `onWheel` claimant) under the point, the offset moves here, the frame shows
  it, and the runtime hears it afterwards (macScrollFacts). Scrollers clip; pinned children
  (ignoreScroll) stay put and sit above the content; requested glides run on the worker's
  frames. A mouse wheel's notches glide (160 ms ease-out, a further notch adding to where the
  glide is going), as the browser animates them. A trackpad's deltas move the pane at once:
  the shell tells them apart by `wheelDelta` = -3 × `delta`. `&smoothwheel` glides every
  wheel, `&nosmoothwheel` none. Under look.mjs's 2x emulation Chrome hands script half
  the wheel delta its own scrolling uses, so ?render=gpu scrolls half as far there as the DOM does.
- **A program's own fonts** load through font.ts's FontHost seam into the engine;
  device names the table lacked (Geneva, Arial Narrow, Avenir Next Condensed, SFMono-Regular
  and others) map to the bundled families.
- **Rich text and Markdown** are the runtime's own flow of views (the canvas renderer's
  path): the host answers richLayout with -1.
- **Video and audio** are a media element that never loads, so a Video's poster stays up.
- **Drawings**: compositing operators are Vello blend layers, the drawing isolated in a group
  of its own so they act on its own marks; `clearRect` is a destination-out rectangle;
  `drawImage` draws the image's engine handle. A drawing with shadows, filters or stroked
  text is replayed whole by the runtime's own `replay` onto a worker 2D context at the density
  it is seen at, and drawn as an image (the Mac host's rule for what it cannot describe).
- **Views**: blend modes, shape clips (SVG path data, kurbo; hit-tested through Path2D) and
  masks (a gradient's alpha, or a stencil view painted destination-in).
- **Text**: underline and strike, outlines (stroked glyphs under the fill), and text shadows
  (the lines' own glyphs in the shadow's colour, offset, in a layer of their own at the scale
  the view is seen at, blurred by the layer passes, kept until the text, style or scale
  changes).
- **Images** are copied on the GPU from their decoded bitmaps (Engine.add_image_bitmap, as a
  video's frames are), into textures kept apart from layers; their pixels are read back only
  for one larger than a texture can be.
- Conic gradients turn their stops rather than Vello's sweep start, which does not wrap.
- A view's picture is dropped only with the view: a DRAW null queued earlier in the same
  flush no longer drops a drawing drawRaster has just made (Asteroids' rocks).

- **Layers** (engine/src/layers.rs): what one Vello scene cannot do is done on a texture of
  its own. A view's filters: its subtree rendered into a layer, then compute passes —
  separable Gaussian blur, the CSS colour matrices, drop shadow, colorize — and the result
  drawn where the subtree was. Frost: the frame's commands so far (open groups closed),
  rendered under the view's region, blurred and saturated (edges clamped), drawn under its
  box. 3D: the view painted flat at the scale it is seen at, through its filters there,
  then projected by the runtime's own homography (projective.ts). Layer images are
  registered with the renderer (override_image), one texture per layer while its size holds.
  While any is on screen, frames are drawn whole. A layer blurred whole is made at a scale
  that leaves about 6 texels of σ and drawn stretched (a wide blur leaves no detail to
  lose), and a layer's commands that land outside its texture are skipped — together they
  took Weather's frost from 37 ms of GPU a frame to under 10.
- **Frost in a frame**: frosted views share one snapshot of the frame behind them, taken at
  the finest scale any of them needs. A view reads from it unless something drawn since it
  was taken overlaps that view's box; if something does, a new snapshot is taken. Damage-limited frames
  keep working with frost on screen: a region that touches a frosted or filtered view
  grows to take it in whole. Weather's main area scrolls in Safari at about 20 ms of GPU a
  frame (was 44–63); `&nofrost` and `&imgq=N` are diagnostic switches, and
  gpu/scroll-safari.mjs drives a scroll in Safari and prints the worker's timing.
- **Filters in drawings**: each filtered op is recorded into a scratch picture and run
  through a layer with the views' passes, then composited in its place; only a filter the
  passes do not run (an SVG `url()`) is rastered. (Desktop's wallpaper —
  five full-screen fills under blur(96px) — went from 1.24 s on a 2D context to a few ms.)
- **AppIslands**: the worker mounts each tenant by surface composition (mountEmbeddedApp);
  its program comes from the page (boot-uniform's compileIsland: a prewarmed build, else
  compiled — the dev server's compile, or the external compiler).
- **Video and audio** play on the page (shell-media.ts); media.ts is the worker's stand-in
  for the element, the Mac env's shape. A video's frames come over as ImageBitmaps and are
  copied on the GPU into a texture of the video's own. In-memory sounds are the runtime's
  Web Audio clip host on the page, behind `__declareClipHost`.
- **Addresses** (address.ts): host-client's (location, waypoint) ⟷ history rules in the
  worker, the page carrying out the verbs; deep links, Back and Forward. Scroll places per
  entry are not kept yet.
- **Keys**: a key pressed and released between two frames is held until the next frame has
  run, so a program reading `Keys.isDown` once a frame sees it.
- **Scrollbars**: a whole-page app's is the browser's (the window scrolls). An inner pane's is
  the fallback overlay bar (scroll.rs, the same numbers as canvas-backend.ts's `BAR`): under
  a mouse the Mac's — hidden at rest, a 6 px thumb while the pane moves, fading 500 ms after
  over 240; on a showing bar the pointer widens it to 10 px on a 16 px track and holds it; the
  thumb drags, the track jumps, a press on a hidden bar is the program's; both axes. Under a
  finger iOS's indicator — 3 px, fading 1.2 s after; held still 100 ms it grows to 8 px and
  scrubs. A dark thumb, or a light one over dark content.
- **Touch**: the runtime's scroll physics (drag, momentum, rubber band) over the pane under
  an unclaimed finger; a whole-page app's root is the browser's to pan; the claim rule is the
  canvas renderer's.
- **Embedding**: `boot({ host })` runs the app in that element, sized to it; `boot` resolves
  to a stand-in for the app whose reads are tracked by the page's own runtime (the hook hands
  over `externalValue`, runtime/src/host-api.ts) and whose writes go to the app. DOMIslands
  are elements over the canvas, marked `data-declare-slot`, whose `__declareIsland` handle
  crosses to the real one in the worker. apps/two-way runs as it does on the DOM renderer.

Where the user was on each entry (scroll places) is noted and landed as host-client does,
the table in the page's sessionStorage. A page's `provides` (the host's data-declare-provide,
then `boot({ provides })`) reach the program, and `el.__declareApp.provide(…)` changes them.
Frost samples only what is beneath the box, mirrored past its edges, as backdrop-filter does. Each is reported once in the console when a
program uses it. A page that boots apps into its own elements (apps/two-way) gets one
full-window canvas instead: ?render=gpu takes over the page.

## The compositor (2026-10-14)

A frame is no longer one Vello scene. It is a sequence of steps onto the kept frame texture,
in paint order (engine/src/compose.rs, host.ts `cut`):

- **Passes**: the ordinary content between layers, drawn at the frame's region over what is
  there (by the quads; with `&noquads`, a Vello render each). The frame is cut into passes where a layer's tiles go and where a
  frost needs the frame as it stands; the clips open at a cut are reopened in the next pass.
- **Tiles**: a scroller whose content a layer can keep (no frost, filters, 3D, masks, blends,
  video, nor another scroller — the innermost scrollers are the layers) draws its content
  once into tiles, 512-pixel bands, kept as plain textures and laid as rectangles under its
  clip. A change inside the content (a hover, a spring) draws again only the rectangle it
  touches, copied into the tile; a tile is drawn whole when that is half of it or more. The
  tiles are drawn at the scroller's own place within a device pixel, so laying them on whole
  pixels moves nothing; only the scroll offset is rounded. A scroller is a layer while it
  moves and for a second after: at rest it is drawn with the frame, since a layer costs a
  pass of its own. No ancestor may fade, blend, mask or round-clip a layer.
- **Snapshots**: frost reads the frame texture itself (halved 2×2 to its scale), not a
  re-render.
- **Frames about one layer**: when all a frame's changes are one layer's scroll or changes
  inside it, the first such frame keeps what lies under the layer and what lies over it in
  its region; the frames after lay those, the tiles and the scrollbar (drawn by the
  compositor) — no paint walk and no Vello pass, unless a band of tiles comes into view.

Scrolled in headless Chrome, medians per frame, layers against `&nolayers`:

| | encode | GPU |
|---|---|---|
| Tracker's list | 0.6 ms against 2.5 | 1.5 ms against 3.4 |
| Weather's city list | 0.6 against 2.3 | 4–6.6 against 5.5–6.8 |
| Birds (a card's hover spring running) | 0.8 against 0.6 | 2.0 against 2.7 |
| Docs (live demos inside) | 0.35 against 1.5–3.2 | 1.5 against 3.1–3.6 |
| Weather's main area | the same | the same |

Weather's main area has no layer yet: its cards are frosted. A third of the city list's
frames are drawn whole either way, because the background picture under everything moves.

`node gpu/baseline.mjs` holds ?render=gpu to its own pictures (57 cases: every app, scrolled
cases, every swatchbook tab); `--save` takes them, `--learn` widens a case's allowance for
what changes on its own (a clock, a game). `node gpu/scroll-chrome.mjs <app> <x,y> [--rounds N]`
scrolls and prints frame timing beside `&nolayers`, after a page it does not measure (the
first page in a browser runs cold). `node gpu/census.mjs [scenarios.json] [app] [--json out]`
runs gpu/census-scenarios.json (clicks, drags, wheels, keys on every app) with `&census`, which
makes the host classify each frame's changed views by kind of change, and prints per scenario
what changed, how frames were drawn and what they cost (PATTERNS.md has the findings). With
`--stages` it adds `&gpustages`, and prints each scenario's GPU time a frame by stage (below).
`node gpu/ab.mjs <dirA> <dirB> [app] [--rounds N] [--scenarios f] [--a "&sw"] [--b "&sw"]`
compares two builds (copies of gpu/dist), or one build a switch apart, back to back: the
census's scenarios with each in turn, alternating, medians per build — the only fair comparison
on a machine whose load varies. Its compositor column is the compositor worker's busy time a
frame. `GPU_SWITCHES="&sw"` adds switches to every page of census.mjs and baseline.mjs.
my-apps/desktop-dense (gpu/census-dense.json) is the desktop with the tracker and the market
map open at boot and a frosted band over them: whole frames over a thousand unchanged views.

**Kept walks and plans.** A subtree with two children or more that holds no scroller, frost,
filter, 3D view or mask keeps what its walk wrote (host walk.rs) while its generation (bumped up
the ancestors by any change under it), its transform, the clip and the engine's text generation
stand; the painter keeps its plan between the marks the walk writes around it (17, 18) while the
same entry stands (paint.rs Kept) — not when it holds a Vello item, an opacity group, a
drawing, gradient stops, a layer or text drawn from the size ladder — and lays it again as one
block. Either serves any clip inside the one it was made under (what it holds past the clip, the
frame's region cuts), and a kept walk whose reach misses the clip is skipped. A view moved (not
resized) keeps its generation; its kept walk, if it culled nothing, is laid again with its
transforms translated (walk.rs KeptWalk::moved; `walkMoved` in the stats). Moved a second frame
in a row, a subtree of 8 views or more is a moving layer: the walk wraps it in a group keyed by
the view (command 19, with the rect it draws in), the painter draws it once into a texture and
lays that texture at each new place, and the frame after it rests draws it exactly
(`motionLayers`; off with `&nolayers`). `&nokeep` turns
both off, `&nokeepplans` the plans.

**Kept groups and filter layers.** A view's opacity group is drawn into a texture kept while its
own generation (every change to it but its opacity) and its children's stand, with its transform,
cull and the text generation (paint.rs KeptGroup; the walk writes command 19, the view and that
generation, before the group): a fade lays the same texture at each alpha, and a move by whole
device pixels (a scroll) lays it moved, the same pixels. A group holding a layer (frost reads
what is beneath it) or a video frame is drawn each time. A filtered view's layer is made again
only when its subtree, text generation or pixelation changed, its transform changed other than
by whole device pixels, or it needs more than it holds (walk.rs `filter_made`). Both off with `&nokeep`; the census prints
them a frame (`kept: groups … (made …), filters …`).

`node gpu/versus.mjs [scenarios.json] [app] [--rounds N] [--base URL]` runs the same
scenarios in the DOM renderer and in ?render=gpu, alternating, and prints the CPU each frame
costs (renderer and GPU processes, the thread that makes the frame, render=gpu's GPU
execution) and late frames (BENCHMARKS.md has the results). `&gpucalls` counts WebGPU calls
by name in the stats; `&gpumem` counts WebGPU textures and buffers made, destroyed and freed by
the collector, in MB (`gpuMem`, and `gpuMade` by label: a pool texture's label names the line
that took it); the stats' `tex` is what the engine holds, by holder, with the pool's hits,
misses and textures let go of; `&timing` turns on the frame timestamps (the census's GPU column; off by default, as their
readback costs the GPU process about 0.3 ms a frame). A worker's busy time covers
each callback and the runtime's settle after it (a microtask), once when one callback runs
another; the stats' `busy` is both workers' together (`busyRuntime`, `busyCompositor` each),
so the census's runtime column, busy less encode, takes in the crossing between them (sending,
replaying a flush's drawing calls, applying the commit, laying out its Texts).

`node gpu/threads.mjs <scenarios.json> <app> <scenario> [--dom]` traces one scenario and
prints each thread's CPU per frame in every process, and the busiest thread's time by trace
event (script, style, layout, paint). `node gpu/worker-profile.mjs <scenarios.json> <app>
<scenario> [--dom] [--compositor] [--switches "&a"]` samples the runtime's worker (`--compositor`:
the one that draws; `--dom`: the page's main thread) with V8's profiler: self and inclusive time
by function and file, and how often each of the program's own functions ran; `ROOTS=n` prints
the call tree n deep. Build with NOMINIFY=1 first; the engine's functions keep their names when
it is built with `CARGO_PROFILE_RELEASE_STRIP=false` and wasm-bindgen `--keep-debug` (wasm-opt `-g`).
costs.mjs counts both of render=gpu's workers by layer.

`node gpu/costs.mjs <scenarios.json> [app] [scenario] [--modes dom,canvas,gpu,mac] [--json out]`
runs each scenario in the DOM renderer, the canvas renderer, render=gpu and the Mac host, and
splits its CPU time into the layers they share: app, runtime core, drawing, text measure, GC,
adapter, renderer, native, crossing, background threads, and the GPU process (WindowServer on
the Mac). The runtime's settle meter (`globalThis.__declareMeter`, reactive.ts) is the same
counter in every mode; it exists only in a build with the development switches
(mac-host/profile/build-runtime.mjs), and reads 0 elsewhere. `--summary a.json [b.json]
[--totals]` prints one line per scenario in five groups. Its header says how each layer is
measured. The Mac column runs the Mac app (`npm run build:mac`; another tree's variant with
`DECLARE_MAC_APP`, mac-host/app.mjs), launched with DECLARE_METER, as an accessory app that
never takes the foreground; its `stats` LAYERS line gives each thread's CPU and, with
DECLARE_METER, the time in text measuring and decoding commits (Bridge.swift). The DOM bundle's
source map needs `BOOT_SOURCEMAP=1 node tools/internal/build-boot.mjs`.

**Marketcharts** (my-apps/marketcharts) is marketmap with a trailing-year chart drawn in every
map tile with room for one, redrawn as the day and the tiles move; its scenarios (the scrub,
an era flight) are gpu/census-stress.json.

Two test programs live in my-apps, each with its own service and scenarios:
- **Atlas** (my-apps/atlas): a map zoomed without end, tiles drawn with `draw()`. Its tile
  service is fixture/server.mjs (port 8340), over Natural Earth layers that fixture/fetch.mjs
  downloads (81 MB, public domain), with streets and buildings made up around cities past
  Natural Earth's detail. Scenarios: gpu/census-atlas.json.
- **Murmur** (my-apps/murmur): the eval's conversation app (my-apps/murmur-virt, with its
  store's `value` read non-null for this tree's compiler). It reads its service's
  `/threads.json`, `/live` and media at its own origin, so a second dev server proxies them:
  `node evals/apps/murmur/api/server.mjs --port=8330 --seed=1 [--scale=100]` and
  `node server/index.mjs 8221 --proxy /threads.json=http://127.0.0.1:8330` (and the same for
  `/live`, `/photos`, `/avatars`, `/voice`). Scenarios: gpu/census-murmur.json, run with
  `--base http://127.0.0.1:8221` (Atlas runs from there too).

Census numbers vary between runs, at times two to one (docs' scroll measured 1 or 2 ms
whatever was changed): compare by alternating the two sides over several rounds.

Vello is vendored (engine/vendor/vello) for one fix: a render whose scene has no images,
gradients or glyphs replaced the persistent image atlas, and the next render's images drew
blank. It also has an encoder hook (`Renderer::set_encoder_hook`), through which the stage
timing stamps the start and end of each Vello render. (engine/vendor/vello_encoding is an unused copy from the investigation.)

## The quads (2026-10-14)

Ordinary UI is drawn by the engine's own instanced quads (engine/src/paint.rs), Vello only
for what they cannot draw. Every pass, tile, layer and snapshot goes through a plan of the
same command stream `run` reads:

- **One shader, every kind**: rounded boxes (fill, linear/radial/conic gradient), borders
  (per-side widths: command 16, which the host sends for sides of one colour), box shadows
  (Vello's blurred-rect formula), glyphs, images (nearest, bilinear and Mitchell bicubic, as
  Vello samples), and 1:1 texture copies. Coverage is the pixel's area for straight edges and
  the distance for corners. A plan is one render pass; the shader reads its instance once per
  vertex and hands the fragment flat values.
- **Clips** are records the instances point to: plain rectangles fold into one box per
  instance; rounded or turned clips chain, and the fragment walks the chain.
- **Text** comes from a glyph atlas that Vello rasterizes (only glyphs not yet in it), so
  shapes are Vello's. Glyphs are keyed by face, device size and quarter-pixel phase; text whose
  size is changing (a spring) is drawn from a ladder of sizes 4% apart, scaled under 2%, until
  it holds still. Gradient text fills its glyphs with the gradient.
- **Opacity groups** are planned on their own, drawn into a texture of their bounds, and laid
  with their alpha under the clips around them.
- **Drawings** whose recording has not changed since the last frame are rastered by Vello
  into a sprite texture (4096², a drawing up to 1100 pixels a side; the engine gathers each
  drawing's reach as it is recorded), and one larger, up to 4096 pixels a side, into a texture of
  its own (desktop's wallpaper: rastered once, then one quad a frame). Held still, a drawing is laid 1:1 from a raster at its
  scale and quarter-pixel phase. Moving on the frame, it is laid from its last raster at the
  new place, sampled bilinearly (kind 8), while its scale stays within a quarter of that
  raster's, else rastered anew at the new scale; the host then draws its area once more
  (`take_sampled`), where, held still, it is rastered exactly. Drawn into anything kept (a
  tile, a kept pass), a drawing is always rastered exactly. A drawing re-recorded every
  frame stays Vello's. When the sprite texture has no room it is cleared at the next plan.
- **Batches**: an item — quads or a Vello item (paths, changing drawings, outlined text,
  shape clips, blend groups) — joins the earliest segment of its kind it can reach from the
  end without passing one that draws where it does (a border's inside does not count, so an
  icon in a bordered button passes), looking back at most 64 segments; each segment keeps its
  items in a 128-pixel grid for the test. So a map of tiles, each a fill, a chart and labels,
  is three segments, not three per tile. Only the clips that cut into a Vello item are opened
  around it. A batch renders into a texture of its bounds, laid in its place.
  A blend group is drawn over a copy of what lies beneath it.
- Colours are premultiplied. Tiles are kept premultiplied and drawn in place; layers and
  snapshots, which Vello and the filter passes read, are written straight.

- **Shadows and filters in a drawing** run on the GPU: an op drawn with a Canvas2D shadow or a
  filter is drawn into a layer of its own over its reach and run through the filter passes
  (the shadow as a drop shadow, its lengths in drawing units, as the DOM's canvas draws them).
  Stroked text is drawn by the engine (`text_stroke_brush`). Only a filter the passes cannot
  run (an SVG `url()`) rasters the drawing on the worker's 2D canvas, read back
  (`getImageData`) and uploaded.

`&noquads` draws everything with Vello, for an A/B; `&oldsprites` rasters every drawing
exactly at every place and scale, at most 512 pixels; `&nosharpen` leaves a drawing laid
while moving as it was. The worker's stats carry `paint` (glyphs rastered, atlas draws, Vello
batches, instances, plans, drawings rastered as sprites, sprite-texture resets, drawings
drawn by Vello, why drawings were not sprites, sprites laid moving) and `gpuExec`: each frame's GPU time
from timestamp queries (engine/src/timing.rs), the frame's own work without queueing — the
measure to compare by, since `gpu` (submit to done) moves with the GPU's load. It is a span,
from the frame's start to its end on the GPU's clock, so it includes the GPU waiting for the
worker: before the frame's first submission (the walk, the plan) and between submissions (a
Vello render encoded on the worker).

`&gpustages` splits that span (timing.rs): each stage of the frame writes a timestamp as it
ends, named for its work — `quads` (a plan's passes), `vello batch`, `vello backdrop`, `glyph
raster`, `sprite raster`, `slot copies`, `layer filters`, `unpremul copy`, `tiles`, `cache
copy`, `frame snapshot`, `scrollbars`, `present copy` — and each submission's start writes
`gap`, so the span `gap` closes is the GPU waiting, not working (`gap: first submit` is the
wait before the frame's first submission). The worker's stats carry `gpuStages`: per stage,
milliseconds and spans since the last stats. The stamps are empty render passes, and they
cost GPU time of their own (calendar month→week: a span of 5.0 ms with them, 4.0 without);
read them for where time goes, and `gpuExec` without them for totals.

GPU execution per frame, headless Chrome, medians, quads against `&noquads`, interleaved:

| | quads | Vello |
|---|---|---|
| calendar → week | 4.1–4.7 ms | 5.1–6.6 |
| calendar → year | 4.3–4.6 | 5.0–8.6 |
| calendar → month (glyphs already in the atlas) | 2.0–4.0 | 5.0–5.6 |
| calendar → month (first, ~450 glyphs rastered) | 5.6–6.2 | 4.5–6.3 |
| Tracker scroll, layers / whole frames | 0.85–0.98 / 2.75 | 0.92–1.25 / 3.8 |
| Docs scroll, layers / whole frames | 1.31 / 2.82 | 1.64 / 3.21 |
| Weather main area | 6.8–7.2 | 9.4–9.8 |
| Weather city list (p95) | 1.2–2.1 (9) | 1.2–2.0 (17) |
| Birds, layers / whole frames | 1.51 / 1.25 | 1.9 / 1.9 |

The pictures match Vello's to edge antialiasing (gpu/baseline.mjs was saved anew from the
quads; mid-scroll shots with and without layers are identical).
