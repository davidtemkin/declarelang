# The native host — the fastest possible runtime environment for Declare

**Status: DESIGN, exploratory, from discussion 2026-07-25 (David + assistant).
Pre-implementation; no code exists.** A complete analysis of what a wholly
native Declare runtime would involve — first target: a native Mac app host —
written against the measured baseline of the two web renderers (guide ch. 15,
same-day measurements). Background, not truth: nothing here is promised.

## 1. Why, and why now

The DOM/canvas comparison put numbers to what the renderers cost. Once
running, the two are indistinguishable — ~1 ms input latency, ~120 fps under
real interaction, equal heap — because the work is done by the same reactive
graph. The differences are structural: DOM carries a page of elements that
tracks app size (28–536 across the corpus) and wins accessibility, native
text, and instant first paint; canvas holds the page at ~16 elements but pays
550–700 ms first-raster on scene-heavy apps and gives up the browser's text,
selection, and assistive tree.

Both renderers also pay a tax neither can shed: **the browser re-derives what
Declare already knows.** The constraint graph computes final geometry; the
DOM backend then hands it to an engine built to *discover* geometry — style
resolution, cascade, reflow, paint invalidation heuristics — generality
Declare never asked for. The canvas backend sheds that tax but must then
re-own compositing, scrolling, and text on the CPU-visible side of a single
surface.

The fastest environment is the one that keeps the browser's retained-
compositor advantages and deletes the generality: a host where Declare
writes final geometry directly into the platform's compositor and the
platform does only what platforms are uniquely good at — compositing,
text, scrolling, input, accessibility.

## 2. The thesis: a third realization of an existing seam

This is not a rewrite. The architecture has been shaped for it all along:

- **Thin backend over fat runtime.** Everything hard — constraints, layout,
  interaction intrinsics, animation, data — lives above the `Surface`
  protocol (runtime/src/backend.ts): ~30 small setters (geometry, fill,
  corner radius, shadow, clip, opacity, scale, child order, input sink,
  scroll, editable, rich content) plus `attachRoot`. Both existing backends
  are complete realizations of it.
- **The canvas backend is the existence proof.** It already re-implements
  compositing, hit-testing (the reverse-paint walk with `isPointInPath`
  clip subtraction), its own scroll, and native editable overlays behind
  that seam. A native backend walks the same path with the platform doing
  the heavy lifting instead of a 2D context.
- **The input router is host-pluggable.** `routeInput(alive, resolve, …)`
  takes any event source; the canvas mode proves the runtime can own the
  entire hit walk (carved sinks included).
- **Programs are data.** The compiled program — now with a production
  compaction + hydrate contract locked by tests — travels as JSON with
  bodies as strings. Any host with a JS engine can run it; the closure
  freshness, prewarm tiers, and live-edit channels are transport-level and
  carry over unchanged.

So "a wholly native experience" decomposes into: (a) a host shell, (b) a JS
engine hosting the **unmodified runtime**, (c) a `NativeBackend` implementing
the Surface protocol over the platform compositor, (d) platform overlays for
the two things that must be genuinely native (text input, scroll feel),
(e) an accessibility projection — plus the oracle discipline to hold a third
renderer to the same output as the first two.

## 3. Foundation layers — the choice and the rejections

**Chosen: JavaScriptCore + Core Animation.**

- **Core Animation (`CALayer`)** is the Surface protocol at platform scale.
  A CALayer is a rectangle with position, bounds, background color, corner
  radius, border, shadow, opacity, transform, and GPU compositing — the
  setters map essentially one-to-one. It is retained (damage tracking is
  the render server's), it costs a fraction of a DOM element, it has no
  style system and no layout opinions to fight, and its animations run on
  the render server **off the app's main thread**. `CATransaction` is
  `flush()` with platform semantics: batched, atomic commit.
- **JavaScriptCore** ships with macOS, JITs, supports bytecode caching (fast
  cold start), and needs no bundling of an engine. The runtime and the
  constraint bodies (`new Function` today; JSC equivalent) run unmodified.

**Rejected:**

- *WKWebView shell* — that is the web app in a costume; nothing is gained.
- *AppKit/SwiftUI views as the realization* — too high. NSViews and SwiftUI
  bring their own layout systems, styling opinions, and update models;
  Declare owns geometry and would fight them at every setter. (They return
  as **overlays** where their nativeness is the point — §4.)
- *Raw Metal / wgpu immediate mode* — too low. Own compositing, own damage
  tracking, own text shaping (the decade-deep part), own accessibility
  bridge. This is Flutter's road; Flutter proves it is feasible and proves
  what it costs. Metal returns as an *escape hatch* for hot `draw()`
  surfaces (`CAMetalLayer`), never as the foundation.
- *Compile bodies to native (no JS engine)* — not yet. Bodies are analyzable
  by design (static dep extraction, effect signatures), so an AOT subset is
  imaginable — but it is an optimization of a working JSC host, not the
  first move. Recorded as an open item (§11).


**Engine selection and the JIT boundary.** On the Mac there is no dilemma:
an in-process JSC JITs with the `allow-jit` entitlement (routine under the
hardened runtime, Mac App Store included) — browser-class speed, zero bytes
shipped. The constraint is iOS, and it is a *platform rule*, not an engine
property: no third-party in-process engine may JIT there. That also answers
V8 — it ships a "JIT-less" mode for exactly this, so on iOS it buys nothing
while costing ~40 MB of binary and a build/update treadmill against a
zero-byte ABI-stable system framework. The interesting iOS candidate is
**Hermes** (Meta; React Native's default engine): AOT-compiles JS to
bytecode at build time, memory-maps it at launch (no parse, instant start),
interprets by design — *and* still compiles source on device, so the AOT is
a tier, not a cage. That maps one-to-one onto the prewarm ladder, natively:
bundled bytecode (the validated tier) → on-device bytecode cache → on-the-fly
compile of a freshly fetched program, same freshness contract. **Static
Hermes** (typed AOT → native via LLVM) points the same direction as
Declare's analyzability bet: the runtime kernel — typed TypeScript, the
actual hot code — compiles native while dynamic program bodies interpret.
Decision protocol: phase 1 measures. Settles run ~1 ms under a JIT; the
workload is property-heavy graph evaluation (interpreter penalty historically
3–5×, not the 10–20× of numeric kernels); if the iOS interpreter misses the
frame budget, Hermes gets auditioned. The host-services shim (§4) already
isolates the engine, so the choice stays swappable.

## 4. Architecture

```
┌────────────────────────────────────────────────────────┐
│ Mac app shell (AppKit window, menu bar, lifecycle)      │
│  ┌──────────────────┐   ┌───────────────────────────┐  │
│  │ JavaScriptCore    │   │ NativeBackend (Swift/ObjC)│  │
│  │  runtime core     │──▶│  Surface → CALayer tree   │  │
│  │  (unmodified JS)  │◀──│  NSEvent → routeInput     │  │
│  │  constraint graph │   │  CATransaction per settle │  │
│  │  layout kernel    │   │  CGContext draw() replay  │  │
│  │  animators        │   │  Core Text measurement    │  │
│  └──────────────────┘   └───────────────────────────┘  │
│        │ program JSON (compacted → hydrated)            │
│        ▼ same transport: dev server / static host       │
│  overlays: NSTextField/NSTextView · NSScrollView        │
│  projection: NSAccessibility from the MODEL tree        │
└────────────────────────────────────────────────────────┘
```

Component by component:

- **Bridge discipline (the one performance risk that matters).** The seam is
  chatty if crossed per-setter and cheap if crossed per-frame. The settle
  loop already batches: one settle → one command buffer (layer id, property,
  value triples) → one JSC↔native crossing → one `CATransaction`. The rule
  is architectural, not aspirational: the native Surface implementation
  *records*, and only `flush()`/settle transmits.
- **`draw()`** records the same display list it records today; the native
  backend replays it into layer contents via CGContext, dpr-aware, mirroring
  the DOM backend's per-view rasterization (and its adaptive cache rules).
  Blur, gradients, and compositing modes map to Quartz directly — including
  **backdrop sampling**, where CA's native facilities close the frost gap
  that the web canvas renderer still has open.
- **Text** renders and measures through Core Text. This is the fidelity
  frontier (§9): metrics parity with the browser decides whether the
  cross-renderer oracle stays byte-perceptual or becomes tolerance-based.
  The pending pretext evaluation (portable text measurement) is load-bearing
  here: one measurement library across all three renderers would make text
  geometry a shared fact instead of three opinions.
- **Input** feeds NSEvents into the shared router. Hit resolution is the
  model walk the canvas backend already uses — one implementation, now with
  two consumers, which argues for hoisting it from canvas-backend into the
  runtime proper.
- **Text fields and scroll: platform overlays, first-class.** The canvas
  backend's overlay pattern (transparent native `<input>` glued to the
  surface box per frame) promotes to NSTextField/NSTextView — except now
  the overlay is not an imitation-adjacent workaround but the platform's
  own control: caret, IME, dictation, autofill. `scrolls = true` becomes an
  embedded NSScrollView so inertia, rubber-band, and scroll-bar behavior are
  macOS's own — scroll *feel* is the first thing a Mac user notices and the
  last thing benchmarks capture, so it is bought, not built.
- **Islands.** `DOMIsland` has no meaning without a DOM; its native analogue
  is an **NSViewIsland** (same slot contract, tenant is an NSView), and
  `AppIsland` — a Declare program in a box — works natively by mounting a
  second layer subtree from a second program, likely *cheaper* than the web
  version since there is no iframe-adjacent machinery at all.
- **Toolchain: unchanged.** The host fetches compiled programs over the
  existing transport with the existing freshness closure. The dev loop —
  edit a `.declare`, the running native app updates — reuses the live-edit
  channel; the toolchain realm keeps compiles fresh. `declare build --host
  mac` would emit an app bundle whose resources are the same artifacts the
  static host serves.


### The host services inventory

JSC is a bare ECMAScript engine; everything the browser supplied must arrive
as injected host services. The runtime's measured environment surface (grep
over runtime + web client) and its native realization:

- `fetch` (25 uses) → **URLSession** — which single-handedly covers the
  networking stack: HTTP/2+3, TLS, the cookie jar (`NSHTTPCookieStorage`),
  the HTTP cache (`URLCache`), and WebSocket (`URLSessionWebSocketTask`;
  not yet a runtime primitive — the shim lands when the language grows one).
- `requestAnimationFrame` (24) + timers → one **CADisplayLink**, doubling as
  the Animator clock.
- `URL`/`URLSearchParams` (41) → a small shim (not in bare JSC).
- `FontFace`/`document.fonts` (17) → `CTFontManager` registration + a
  readiness promise.
- `Image()` (9) → ImageIO/`CGImage` via URLSession — which also supplies the
  decoded-bitmap **image-handle model** draw()'s deferred `drawImage` names
  as its follow-on.
- `caches.*` (the compiled-program tier) → a file cache under
  `Library/Caches`, freshness probed by file mtimes — the Node `diskProbe`
  pattern, reused rather than reinvented.
- `matchMedia`/`navigator` → `effectiveAppearance` (dark), device signals.
- `location`/`history` → an internal history stack + URL-scheme deep links
  (`NSUserActivity`).
- `performance.now`, `console` → mach time, `os_log`.

Beyond the grep: filesystem loading of programs and data (bundle resources;
security-scoped bookmarks under sandboxing) with **FSEvents watching** so
the live-edit loop works against files as well as the dev server; clipboard
(selection copy); OS-level drag-and-drop; multi-window (`openWindow` maps to
a real `NSWindow` — an upgrade, not a shim); and one language-level gap the
host makes concrete: Declare has **no write-side storage primitive** yet
(DataSource reads) — a capability to design, not improvise. Threading rule:
JS runs off the main thread and posts each settle's command buffer to the
main thread for its `CATransaction`.

### draw() on Quartz — ancestry, not translation

Canvas2D is not a foreign API ported to Quartz; it is Quartz's grandchild.
The `<canvas>` element was invented at Apple (Dashboard/Safari, 2004) and
WebKit implements `CanvasRenderingContext2D` *on CoreGraphics* to this day —
the imaging model (stateful context, save/restore stacks, winding rules,
per-op shadows, Porter-Duff compositing) is the Quartz model with JS
ergonomics. The recorded op set (draw.ts: the full path vocabulary, rects,
`roundRect`, gradients including conic, text ops with kerning/spacing,
shadows, `filter`, compositing, transforms, dashes) maps ~90% one-to-one;
`globalCompositeOperation` ≈ `CGBlendMode` nearly completely. The enumerable
deltas: **conic gradients** (no CG primitive; `CAGradientLayer .conic` or a
shading callback), **`ctx.filter`** (no CG equivalent — a CoreImage detour;
the wallpaper blur is the consumer), CSS font-string → CTFont parsing,
gradient color-space interpolation discipline, and AA/pixel-snapping — which
is precisely where the perceptual tolerance already lives. And the contract
to satisfy is not "the browser's canvas API" but **our recorded subset**,
defined operationally by the corpus and the oracle: semantic drift is diff
pixels in a test run, not spec debate.

### Web content islands — the system webview, never a bundled engine

`DOMIsland`'s native realization for web content is **WKWebView**, managed
exactly like the other overlays: the island's box drives its frame per
transaction; transforms, opacity, and corner-radius masks applied on our
side compose correctly because its layer is composited by the same render
server. Input inside it is its own — which *is* the island contract. The
slot protocol extends naturally (`url:` tenants), and
`WKScriptMessageHandler` provides the `childName`-style reverse channel.

Ruled: **no bundled Blink.** Chromium-in-app is Electron re-entering through
the side door (~100 MB + a security-update treadmill, for minority content),
and iOS forbids third-party engines regardless. A hypothetical Windows host
uses WebView2 — the OS's own Chromium. The Tauri pattern: the system
webview, everywhere, always.

Caveats, ruled into the model: the webview renders **out of process** — the
app cannot read its pixels per frame (`takeSnapshot` is an async one-shot:
right for thumbnails and minimize-morph stills, never a texture stream).
Platform backdrop **materials** (`NSVisualEffectView`) still frost over
islands — the render server has the pixels even though the app does not.
Custom draw()-side effects therefore treat islands as **effect-opaque**:
compose over and around them, never read them. And `WKWebsiteDataStore`'s
cookie jar is separate from URLSession's — bridge the two deliberately or an
authenticated origin sees two sessions (register, §11).

## 5. Benefits that might be realized

Ordered by confidence:

1. **Cold start in tens of milliseconds** (high confidence). No browser
   boot, no bundle parse (JSC bytecode cache), program JSON already
   compacted. Baseline: web warm ~130 ms, canvas-heavy first paint 550–700
   ms. A native host should beat the *warm* web number from cold.
2. **Constant-weight scene at native element cost** (high). The canvas
   renderer's "16 elements forever" property, but with retained compositing
   — no full-surface re-raster, damage tracked by the render server.
3. **Off-thread animation** (high, and web-impossible). Declare's motion is
   declarative data — Animators, Springs, motion tokens. Declared motion
   can be *handed whole* to the render server (`CASpringAnimation` et al.)
   and run at 120 Hz on ProMotion while JS does anything or nothing. No web
   renderer can fully offload; the language's no-scripted-motion stance
   becomes a hardware advantage.
4. **The frost gap closes for free** (high). Backdrop blur is a CA
   primitive; the web canvas TBD becomes a native day-one feature.
5. **Interaction latency at or below the web's ~1 ms** (medium-high). The
   web number is already excellent; native removes event-loop layers but
   adds a bridge crossing. Expect parity or modest wins, not drama.
6. **Memory below either web renderer** (medium). No browser process
   overhead per window; heap comparable (same JS graph), platform layers
   cheaper than DOM nodes.
7. **Accessibility that surpasses the web version** (medium — it is work,
   §8, but the ceiling is higher): the assistive tree projected from the
   *model*, not recovered from divs.
8. **Distribution as a real Mac app** (certain but not perf): dock, menu
   bar, file associations, offline by construction, no server dependency at
   run time.

Non-benefits, stated honestly: steady-state frame rate will not improve
(already ~120 fps); JS execution speed will not improve (same engine class);
nothing about the language gets easier — this is a host, not a compiler
change.

## 6. The competitive landscape

Every mainstream way of shipping a fast, native-feeling app has picked a
position on two axes: **who computes layout** and **who owns the pixels**.
The proposal above occupies a corner none of them hold: the framework
computes *final geometry* (no layout negotiation crosses the boundary at
all), and the *platform* owns pixels, text, scroll, and assistive tech.

| | rendering foundation | layout computed by | logic runtime | text stack | a11y source | web + native, one program |
|---|---|---|---|---|---|---|
| **Electron** | bundled Chromium | browser (CSS) | Node + browser JS | browser | DOM | web only, shipped as native |
| **Tauri / webview** | system WebView | browser (CSS) | browser JS + native shell | browser | DOM | web only, lighter shell |
| **React Native** | platform views via Fabric | Yoga (framework's) | JS/Hermes over JSI | platform | platform views | separate render trees |
| **Flutter** | own rasterizer (Impeller) | framework's | Dart AOT | own (framework's) | own semantics bridge | one program, non-native pixels everywhere |
| **SwiftUI** | platform (CA underneath) | platform | Swift AOT | platform | platform | native only |
| **Qt/QML** | own scene graph | framework's | QML/JS + C++ | own | own bridge | one program, own pixels |
| **Declare native** | platform (CALayer) | framework's constraints — final geometry only | JS (JSC), unmodified runtime | platform (Core Text) | projected from the model | **one program, oracle-tested parity** |

What each comparison teaches:

- **Electron** is the proof that developers will pay ~150–300 MB and a
  bundled browser per app for web reach and one codebase. Declare's native
  host offers the same one-codebase property while *deleting the browser* —
  the runtime is a few hundred KB of JS over system frameworks. Electron is
  the cost ceiling this design exists to undercut.
- **Tauri** halves Electron's tax but keeps the essential structure: a
  browser still re-derives layout and owns rendering. It improves the
  shell; it cannot touch the generality tax (§1).
- **React Native** is the closest architectural cousin — JS logic, native
  realization — and its decade of bridge pain is the cautionary tale its
  JSI/Fabric rewrite answers. The structural difference: RN crosses the
  boundary with *component trees to reconcile* and delegates layout to
  Yoga on the far side, so the seam carries diffing, measurement callbacks,
  and layout negotiation. Declare's seam carries **settled numbers** — the
  constraint graph has already resolved every position before the bridge is
  touched, which is why one command buffer per settle suffices. RN also
  never had a same-pixels web renderer to hold itself against; the parity
  oracle is a discipline it structurally cannot adopt.
- **Flutter** proves both feasibility and cost of the other road: own every
  layer (rasterizer, shaping, semantics), get perfect cross-platform
  consistency, and give up platform text, platform scroll feel, and free
  platform accessibility — then spend years buying them back. Declare's
  choice is deliberately opposite: consistency is enforced by the
  *oracle* (tests over renderers), not by *owning the pixels* — so the
  platform's strengths are used rather than reimplemented.
- **SwiftUI** is the native baseline and the wrong comparison to lose
  sleep over: it is Apple-only by definition, and its declarativeness ends
  at the platform boundary. Declare's differentiation is not "faster than
  SwiftUI" (CA underneath both; expect rough parity) but *one analyzable
  program that runs on the web, in a canvas, and natively* — with the
  LLM-facing language properties (programs as data, static analyzability,
  live edit) that no platform-captive toolkit offers.
- **Qt/QML** is the historical vindication: a declarative language + JS
  engine + scene-graph renderer, shipping for fifteen years. Its limits
  mark the openings — own-drawn widgets that never feel native, C++
  underneath the ergonomics, no web target worth the name, and a
  pre-LLM language design. QML validates the architecture class; Declare's
  bets (platform pixels, web parity, analyzability-first language) are
  precisely the places QML didn't go.

The through-line: everyone else either ships a browser, reimplements the
platform, or is captive to one. The narrow seam — final geometry down,
events up, nothing else — is what lets Declare skip all three, and it
exists because the language made layout the runtime's job from day one.


## 7. The platform-services surface — the Electron dialect

Electron's API surface is the best empirical catalog in existence of what
desktop apps actually need — a decade of demand-driven accretion, embodied
in tens of thousands of shipped apps (VS Code, Slack, Discord, Figma
desktop, Notion, Obsidian, 1Password, Signal, Postman…), hundreds of
thousands of dependent repositories, and — the property this section
borrows — massive representation in LLM training data.

**The buckets:** app lifecycle & identity (single-instance, login items,
deep links, dock badge); windows & chrome (frames, vibrancy, menus, tray,
native dialogs); system UX signals (displays/DPI, dark mode, accent colors,
power events, global shortcuts); exchange surfaces (clipboard, drag-and-drop,
`shell` open/reveal/trash); security & persistence (`safeStorage`/Keychain,
auto-update, crash reporting, push); media & devices (capture, permissions,
printing); networking policy (session/cookies/proxy); process plumbing
(ipc, utility processes).

**Welded to Chromium?** Functionally mostly no; implementationally mostly
yes — the first five buckets are thin platform wrappers in concept, but
their code lives against Chromium's base libraries and V8/Node bindings
(capture, printing, session, and ipc are welded in the strong sense).
Nobody maintains "Electron's native layer without Chromium"; Tauri is the
existence proof that the *catalog* reimplements cleanly without it. Ruling:
**mirror the catalog, never link it.** On the Mac each non-welded bucket is
a thin AppKit/Foundation wrapper (NSMenu, NSOpenPanel, NSStatusItem,
NSPasteboard, NSWorkspace, NSScreen, Keychain, UNUserNotificationCenter,
Sparkle, an event monitor for global shortcuts) — and part of the list
evaporates because our windows are real NSWindows: vibrancy, traffic
lights, and spaces behavior come free instead of being emulated.

**The dialect.** Electron's surface splits into halves deserving opposite
treatments:

- **Adopt the shapes for actions.** `dialog.showOpenDialog({ properties:
  […] })`, `clipboard`, `shell`, `Menu.buildFromTemplate` with roles and
  accelerators, `Tray`, `Notification`, `globalShortcut`, `safeStorage` —
  option-object designs holding a decade of edge cases, and the most
  familiar desktop API shapes in any model's training distribution. An LLM
  writing a Declare desktop app calls them correctly from memory, with no
  Declare-specific docs in context. (Menu templates are practically a
  Declare idiom already — the desktop demo's menus are record-driven.)
- **Recast the state half reactively — do not adopt it.** `nativeTheme.on`,
  `powerMonitor.on`, `screen.on(…)` are *facts* wearing event-emitter
  costumes. Declare states facts as standing relationships: `app.dark`
  already is `nativeTheme`; the continuations are `app.displays`,
  `app.powerState` — reactive attributes to constrain against, strictly
  stronger than subscriptions.
- **Skip the browser-shaped third.** `BrowserWindow`/`webContents`/
  `session`/`protocol` presume Chromium objects. No target there — and
  shape-compatibility must never escalate to *environment* compatibility
  (Node built-ins, npm Electron libraries running unmodified). That road
  terminates in rebuilding Electron.

**The security synthesis.** The dialect is the ergonomic surface *of
capabilities*: `dialog`, `clipboard`, `shell` arrive in a program as granted
capabilities whose use is statically visible in the compiled program —
programs are data, effects are signed — so a host reads a manifest before
running a line: *this program uses `dialog` and `clipboard`, nothing else.*
Dynamically loaded Declare code then has a real security model, which
Electron's free-form ipc bus never had. The "no DOM in bodies" ruling
generalizes: **no raw platform in bodies — capabilities are the sanctioned
surface.**

## 8. Accessibility — projection from the model

The web renderers recover semantics from realizations (DOM: real text and
elements; canvas: nearly nothing). The native host inverts this: **the
Declare tree is itself the semantic model**, and NSAccessibility is a
projection of it — the same "programs are data" move that gave crawler
extraction, applied to assistive technology.

- **Components carry their roles.** The standard library maps directly:
  `Button` → AXButton (label from its `label`), `Checkbox`/`Switch` →
  AXCheckBox with value from the model's `checked` — the *reactive* fact,
  not a DOM attribute mirror — `Slider` → AXSlider with `min`/`max`/`value`
  live, `TextInput` → the overlay's own native AX (free), `Text` → static
  text, `Menu`/`Dialog` with the platform's expected subroles. The mapping
  is a registry over the component schemas, not per-app work.
- **Structure is child order;** groups are named views; `visible = false`
  and `opacity = 0` prune the projection exactly as they prune input.
  Focus integrates with the existing focus system (`focusable`, FocusRing,
  focustrap) — the AX focus and the app's focus are one fact.
- **The language gains what it genuinely lacks:** an explicit semantic
  surface for *bare* views — at minimum `label` (accessible name) and a
  small closed `role` vocabulary for the cases components don't cover.
  This is a language addition to design deliberately (the flags/registry
  discipline applies: one spec, every surface). Critically, it pays twice:
  **the DOM backend projects the same declarations to ARIA**, so designing
  the native a11y surface upgrades web accessibility from "real divs" to
  "real semantics" — the rare case where the native effort improves the
  web renderer as a side effect.
- **Reading order, announcements, live regions:** derived where possible
  (Dataset-driven lists announce via their reactive mutations), declared
  where not — the open-questions register (§11) holds the details.

## 9. Risks and hard parts

- **Text metrics parity.** Core Text and browser text will not agree to the
  pixel with different shapers even with identical fonts embedded. Options:
  (a) one portable measurement layer everywhere (pretext, #14 — the clean
  answer if it performs), (b) native re-baselining with a perceptual
  oracle, (c) accepting per-host baselines as the ladder already does per
  app. Decide early; everything downstream of layout depends on it.
- **Bridge chatter.** Solved architecturally by command buffers, defeated
  incrementally by every "just this one synchronous read." The Surface
  protocol has no host→runtime reads on the hot path today; keeping it that
  way is a review discipline, and the one place it bites (text measurement
  during layout) is exactly why the metrics decision comes first.
- **Scroll feel.** NSScrollView embedding must compose with layer
  transforms (the minimize morph, zoomed islands). The web canvas took the
  overlay path successfully; the native version has better primitives but
  the same class of geometry-sync bugs. Budget real time.
- **Three-oracle maintenance.** Every renderer added must ride the
  perceptual/parity suites. This week proved the muscle exists (carved-sink
  gates, prod-parity) — but a third renderer roughly doubles the baseline
  surface. The mitigation is the same as ever: one output oracle, renderers
  as realizations, divergence as test failure.
- **Platform drift.** CA is stable API, but macOS versions move (the
  measured ±3 px resize band, scroll-bar styles). The desktop demo's
  measure-then-match method becomes a standing practice, not a one-off.

## 10. Phasing — the ladder, again

Each phase gates on the oracle before the next begins, mirroring
runtime-first perf-proof:

1. **Existence proof.** Mac shell + JSC + unmodified runtime + CALayer
   Surface; component sampler renders; screenshots ride the perceptual
   harness against DOM baselines. Success = the sampler within tolerance
   and a measured cold start.
2. **Fidelity.** Text metrics decision executed; box decoration
   (shadow/gradient/corner) pixel-held; `draw()` replay + adaptive cache;
   the app corpus renders.
3. **Interaction.** NSEvent router, editable + scroll overlays, focus;
   controls assert-scripts pass natively; input-latency measured against
   the ~1 ms web baseline.
4. **Motion offload.** Animator/Spring → CA hand-off with the equality
   contract (a settle mid-animation reads back the platform's current
   value, or the offload is scoped to fire-and-forget motion — ruling
   needed, §11).
5. **Accessibility.** The projection registry + the `label`/`role` language
   design; VoiceOver walkthrough of the corpus as the acceptance test; ARIA
   back-projection to the DOM backend.
6. **Distribution.** `declare build --host mac`; the desktop demo as a real
   Mac app is the flagship proof (with the irony fully intended).

## 11. Open questions (the register)

1. Animator offload semantics: can JS read a mid-flight offloaded value, or
   is offload restricted to motion with no readers? (Constraint purity vs
   render-server ownership.)
2. The `label`/`role` semantic surface: shape, vocabulary size, and whether
   `role` is ever author-facing or purely component-supplied.
3. Text measurement: pretext everywhere vs Core Text + re-baseline (#14
   feeds this).
4. Hit-walk hoisting: move the canvas backend's model walk into the runtime
   as the one shared implementation before the third consumer exists?
5. NSViewIsland scope: arbitrary NSViews, or a curated set (web view, map,
   video) mirroring the sanctioned-escape philosophy of DOMIsland?
6. iOS: nothing above is Mac-specific except the overlays (UIKit
   equivalents exist) — but touch input, the keyboard, and scroll gestures
   are their own fidelity project. Out of scope here; the architecture
   should simply not preclude it.
7. Cookie-store bridging: WKWebsiteDataStore vs URLSession's jar — policy
   for authenticated origins shared between a DataSource and a web island.
8. The Electron-dialect scope: which modules ship in v1, and where the
   shape-compat line is drawn (per §7, never environment-compat).
9. Windows/Linux hosts: the same seam over different compositors
   (DirectComposition / Wayland). Noted so the Mac design avoids
   Apple-shaped assumptions in the protocol itself (none identified yet —
   the Surface protocol predates this design and is platform-blind).
