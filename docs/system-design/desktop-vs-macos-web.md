# Declare Desktop vs. macos-web — a measured comparison

**Status:** report, 2026-07-20. Method: both production builds served over localhost and
driven in headless Chromium (1440×900, cache disabled), plus a full read of both source
trees. macos-web = [PuruVJ/macos-web](https://github.com/PuruVJ/macos-web) v13.0.0
(Svelte 5 + Vite 8), cloned and built locally. Declare Desktop = `apps/desktop/desktop.declare`.

Two caveats stated up front. (1) These are not the same *kind* of artifact: macos-web is a
faithful **painting** of macOS Ventura with a few working apps; Declare Desktop is a
**working** desktop with lower asset fidelity. Where they don't overlap, that is reported
rather than scored. (2) Building macos-web needed Node ≥20.19 (this machine has 20.11); a
Node 22 was placed in a scratchpad and used only for that build — the system toolchain was
not touched.

---

## 1. Source

| | macos-web | Declare Desktop |
|---|---|---|
| Stack | Svelte 5 (runes) + TS + CSS, Vite 8 | Declare, one file |
| Source files | 67 (33 `.svelte`, 31 `.ts`, 3 `.css`) | 1 (`desktop.declare`) |
| Lines | **5,531** in `src/` (excl. image assets) | **2,058** total — 1,327 code, 416 comment, 315 blank |
| Breakdown | components 3,569 · configs 1,049 · css 329 · state 253 · actions 145 · helpers 121 | 13 classes + one `App` block |
| Runtime deps | 6 (`@neodrag/svelte`, `@neodrag/core`, `popmotion`, `date-fns`, `unplugin-icons`, `@fontsource/inter`) + 17 dev | **0** |
| Image assets | 126 wallpapers + app-icon sets (**42 MB** in `dist/`) | **0** — every icon is drawn |

Like-for-like on *behavioral* code: macos-web's 5,531 includes 840 lines that are pure
static data (454-line wallpaper manifest, 386-line Finder menu config), leaving roughly
**4,700 lines** of components/state/actions/CSS. Declare Desktop does more (§3) in
**1,327 code lines** — about **3.5× less code**, with 31% comment density on top.

## 2. Production build & cold load

Both built for production, served from localhost, cache disabled.

| | macos-web | Declare Desktop |
|---|---|---|
| JS | 219.9 KB raw / **73.3 KB gz** | 358.2 KB raw / **81.8 KB gz** |
| CSS | 31.9 KB raw / 6.5 KB gz | 0 |
| **Code total (gz)** | **~79.9 KB** | **~81.8 KB** |
| Files in `dist/` | 399 | **2** |
| Bytes on first load | **793,894** (JS 220K · img 451K · css 20K · other 103K) | **359,874** (all JS) |
| Requests | 52 | **3** |
| Wall load (`load` event) | 633 ms | **85 ms** |
| Time to stable DOM | 1,396 ms | **867 ms** |
| First contentful paint | **108 ms** | 128 ms |
| DOM elements | **278** | 544 |
| Total DOM nodes (CDP) | 1,772 | **640** |
| DOM depth | **10** | 14 |
| Event listeners | 87 | **72** |
| ScriptDuration | 61 ms | **54 ms** |
| Layout / RecalcStyle | 8 ms / 12 ms | **3 ms / 2 ms** |
| TaskDuration | 153 ms | **102 ms** |
| JS heap | **5.0 MB** | 5.1 MB |

Reading these honestly:

- **Gzipped code payload is a near-tie** (79.9 vs 81.8 KB) — but they are not comparable
  contents. Declare's single file contains the *entire runtime* (reactive core, layout,
  animation, DOM backend, Markdown renderer) plus the compiled program. macos-web's
  excludes the 451 KB of images it also fetches on first paint, and Svelte compiles most
  of itself away.
- **Declare's first load moves less than half the bytes** (360 KB vs 794 KB) in 3 requests
  vs 52, because it ships no images and no CSS.
- macos-web paints marginally sooner (108 vs 128 ms) but reaches a stable desktop later
  (1,396 vs 867 ms) — partly a *deliberate* boot animation (Apple logo + progress bar).
- Declare renders **more elements** (544 vs 278) but **fewer total nodes** (640 vs 1,772)
  and does far less style/layout work (2/3 ms vs 12/8 ms).

## 3. Features — what each actually does

Derived from source and confirmed live. These lists deliberately differ in shape.

### macos-web — working

Boot animation · Ventura wallpaper with a **126-wallpaper picker** (47 options confirmed
live) · dock magnification, hover tooltip, launch bounce, running dot, dividers ·
open window from dock · **window drag** (neodrag, viewport-bounded) · z-index raise on
click · close with scale transition · **maximize/restore** (green light) · **Calendar app**
(month grid, prev/next/today via date-fns — July→August confirmed) · VSCode app (StackBlitz
iframe) · App Store & profile pages · **right-click context menu** (renders) · Action
Center (dark-mode tile, **accent-color swatches**, wallpaper tile, **notch toggle**,
reduced-motion toggle) · **PWA** — service worker, offline, update prompt ·
**persisted preferences** (localStorage).

### macos-web — decorative or absent (verified, not inferred)

- **Minimize does nothing.** The yellow button has no handler at all (`onclick` is `null`;
  clicking changes nothing). `TrafficLights.svelte:17`.
- **No window resize.** `resizable: true` appears in every app config and is read
  *nowhere* in the codebase; zero resize handles exist in the DOM.
- **Menu-bar items are inert.** `Menu.svelte` renders `<button disabled={…}>` with **no
  click handler**. Clicking "New Finder Window" does nothing.
- **The menu bar never changes.** `menubar_state.menus` is assigned
  `menu_configs.finder` once; with Calculator frontmost the bar still reads *Finder*.
- **The Calculator does not calculate.** No handlers; the display is the literal string
  `0`. Pressing `7` leaves `0`.
- **One window per app.** `apps.open` is `Record<AppID, boolean>`; a second dock click
  yields no second window.
- No keyboard shortcuts, no About windows, no Quit.

### Declare Desktop — working (confirmed live)

- **Windows**: title-bar drag (118,104 → 153,125 ✓) · zoom/maximize toggle (560→1416→560 ✓)
  · close with reverse-zoom to origin · raise on activation · **first-click activation
  policy** — a background window's first click only raises it, content never hears it
  (the `veil`), and it is a switchable policy (`app.firstClickActivatesOnly`).
- **Multiple windows per app** — ⌘N opened a second Calendar; both tracked.
- **Minimize to dock as a live thumbnail** — the window parks at `scale 0.075`,
  `dockSlot 0`, `miniT 1`, *riding the dock's magnification wave*, and restores. The
  parked window keeps running (an embedded app inside never unmounts).
- **Dock magnification by layout, not paint** — measured at rest 48 px → hovered
  48 · 49.5 · 57.4 · **72** · 57.4 · 49.5 · 48, i.e. exactly 1.5× at the pointer with
  neighbours displacing and the plate widening.
- **Launch bounce** (4-leg ballistic `AnimatorGroup`), **per-application running dots**
  that survive window close (only Quit clears them), hover label pills.
- **Contextual menu bar** — follows the front window's application: Stickies → Files →
  Declare Calendar ✓.
- **Menus actually invoke** — About opened an `AboutWindow` ✓; **Quit** (⌘Q) closed *both*
  Calendar windows and reset the bar to Files ✓.
- **Live Window menu** — the active app's open windows, front one check-marked.
- **⌘-shortcuts derived from the same menu records** (`keyRegistry` flat-maps `menus`):
  ⌘K, ⌘N, ⌘Q all confirmed. One declaration, three consumers.
- **Finder is data-driven** — the tree derives from the docs app's live model; the Guide
  folder listed real chapters ("1. Thinking in Declare", "2. Two brackets", …).
  Three columns, per-column native scroll, draggable column dividers.
- **Markdown rendition** — real `.md` files fetched as text and rendered; scrolls.
  Reference pages are *synthesized* from the documentation model.
- **Embedded whole applications, seamlessly** — the dock's Calendar runs the actual
  `apps/calendar` as an embedded child app (slot
  `run:../../calendar/calendar|dark=0&base=../calendar/`) with real data; the Declare
  Viewer runs as a child showing *this desktop's own source*, highlighted, with
  Reader/Source/Edit tabs and live metrics ("desktop.declare · 2058 lines, 1327 code").
- **Stickies** — a custom window rendition (`chrome = false`): square corners, paper fill,
  active-only title strip with olive-outlined widgets, collapse-to-strip, Markdown body.
- **Dark mode** — see §4.
- Traffic lights with hover glyphs and a shared hover region; live menu-bar clock;
  About windows dismissed by clicking away.

- **Window resize works** — every edge and corner, on the **active** window:
  corner grip 560×400 → 650×454; left edge 650 → 706 wide with the window's `x` moving
  118 → 62 (the right edge stays fixed, exactly as `moveSize` specifies); bottom edge
  454 → 510. Cursors are correct throughout (`ew-resize`, `ns-resize`, `nesw-resize`,
  `nwse-resize`).

### Declare Desktop — the one behavioural gap found

- **A *background* window cannot be resized by its edge** — the first press only
  activates it. Mechanism (measured, not inferred): the first-click `veil` is
  `visible = { !classroot.active && app.firstClickActivatesOnly }` and spans
  `y = barH` to the bottom at full width, and `raiseChrome()` puts it topmost *by
  design*. On a background window its DOM element is therefore 560×365 and sits over
  the resize strips; on the active window it collapses to 0×0 and the 16×16 grip is the
  hit target. Confirmed by DOM inspection of both states and by resizing succeeding the
  moment the window is activated.

  Whether to change this is a policy call, not an obvious defect: real macOS *does* let
  you drag an inactive window's edge directly, and the source's own comment says the
  chrome "stays live: the title bar, lights, and this veil itself all activate" — the
  resize strips read as chrome by that description, yet are covered. If it is to be
  fixed, the narrow change is to let the veil start below the strips (or re-raise the
  strips above it), leaving the content-covering behaviour untouched.

  *(This is also the source of an error in the first draft of this report, which claimed
  resize was broken outright: at boot the Finder is a background window — the Stickies
  welcome note opens last and takes focus — so every press on its grip correctly did
  nothing but activate.)*

## 4. Dark mode

Both have it; they are not the same feature.

**macos-web** stores `preferences.theme.scheme` (persisted) and components opt in with
`class:dark={preferences.theme.scheme === 'dark'}`, styling through CSS custom properties.
The Action Center also offers **accent colours**, a **notch** toggle and **reduced
motion** — real preference surface Declare Desktop has no counterpart for. The wallpaper,
being a photograph, does not respond.

**Declare Desktop** toggles `app.darkMode` (⌘K, or the brand menu), and the whole
composition re-derives from one theme record — wallpaper gradient, menu bar, window
chrome, Finder, dock plate. The distinctive part: the AppWindow's island slot carries the
appearance in its env segment, so the string flips
`run:…|dark=0&base=…` → `run:…|dark=1&base=…` and **the embedded Calendar — a separately
compiled application with its own reactive graph — re-derives into its own dark theme**.
Verified visually: the child app's cells, chrome and event chips all darkened with the
host, in one keystroke. The Stickies note correctly stays yellow (paper is paper).

Nothing in macos-web crosses an application boundary like this, because nothing in it *is*
a separate application (its "VSCode" is a StackBlitz iframe).

## 5. Bugs found in Declare — both now fixed

1. **`declarec` production builds omitted the runtime body-services.** The generated entry
   imported `runtime/dist/boot.js` but never `runtime/dist/index.js`, which is where
   `setBodyServices({ Focus, Keys, Themes })` runs. **Any** app whose `{ }` bodies
   reference `Themes`, `Keys` or `Focus` died at boot with `ReferenceError: Themes is not
   defined`. `desktop.declare` uses both `Themes.cupertino(…)` and `<- Keys`, so its AOT
   build did not run at all. **Fixed** with a one-line import (`tools/declarec.mjs:91`),
   costing `+0.3 KB` gzip. *(The prewarm/static-deploy path was never affected — it boots
   through `host-client.js`, which imports the full runtime index.)*

2. **`appName` never reached the page title in AOT builds.** The mirror lived only in
   `host-client.js`, which `declarec` output bypasses (it calls `renderProgramAsync`
   directly), so the production tab read `desktop` instead of `Declare Desktop`.
   **Fixed** by moving the mapping itself into the runtime as
   `reflectAppName(app, served, reflected)` (`runtime/src/boot.ts`) — *one* rule, driven
   by two hosts: `host-client.js` calls it from its existing settle loop (still ordered
   before the location history push, so back/forward entries keep their labels), and
   `renderProgram`/`renderProgramAsync` drive it from their own frame loop for AOT
   builds. Deliberately wired into `renderProgram*` and **not** `mountApp`, because
   islands mount through `mountApp` and an embedded child app must never retitle the
   page; the loop self-retires on a detached host, the same liveness rule the input
   router uses.

   Verified after the change: AOT build → `Declare Desktop`, dev server → `Declare
   Desktop`, calendar → `Declare Calendar`, and the Viewer's *derived* name →
   `calendar.declare`. Tests green: unit 356, serve-parity 8, declarec 8, verify-apps 27.

## 6. Expressiveness — three concrete comparisons

**Dock magnification.** macos-web (`DockItem.svelte`, ~50 of its 258 lines): a
module-level 7-point interpolation table, `interpolate()` from popmotion, a spring store,
and a `requestAnimationFrame` loop calling `getBoundingClientRect()` on the icon each frame
to find its own centre — i.e. it *measures the magnified element to compute the
magnification*, a feedback path the spring damps. Declare, four constraints:

```declare
cx0   = { app.width / 2 + (this.ix - (this.slots - 1) / 2) * this.pitch - app.miniSpan / 2 }
near  = { Math.max(0, 1 - Math.abs(app.pointerX - this.cx0) / this.reach) }
width = { this.rest * (1 + 0.5 * Math.pow(Math.max(0, this.near * this.env), 2)) }
height = { this.width }
```

The resting centre is arithmetic, never read from live geometry — the source states the
anti-feedback rule explicitly. No measurement, no per-icon rAF, no per-icon spring; only
the enter/exit envelope is sprung. This is the clearest expressiveness gap in the two
codebases, and the declarative version is the one that *structurally cannot* feed back.

**Window state.** macos-web maximises by writing DOM directly —
`windowEl.style.transition = 'height 0.3s ease…'`, `windowEl.style.width = '100%'`,
`await sleep(300)`, then clear the transition — and stores the pre-maximise
`transform` as a **string** to restore later. Declare's entire minimise journey is one
blend parameter:

```declare
x     = { this.wx + (this.slotX - this.wx) * this.miniT },
y     = { this.wy + (this.parkY - this.wy) * this.miniT },
scale = { this.baseScale + (this.parkScale - this.baseScale) * this.miniT },
```

`miniT` animates 0↔1 and position, scale and corner radius all follow. The parked window
is not a separate thumbnail object — it is the same window at a different blend value,
which is precisely why an embedded app can keep running inside it while docked.

**Menus.** macos-web's menus are static config objects (386 lines for Finder alone)
rendered by a component with no handlers, and the bar cannot change application because
`menu_configs` has exactly one entry. Declare's `menus` is a constraint returning records
that re-derive from `activeApp`, `winSeq` and `frontWin`; the *same* array drives the
rendered bar, the Window menu's live checkmarks, and the ⌘-shortcut registry. One
declaration, three consumers, nothing written twice.

**Comment density.** Declare Desktop carries 416 comment lines against 1,327 code (31%),
and they are load-bearing — the anti-feedback rule, the activation veil, the park blend,
why `miniRecs`/`miniWins` are parallel. macos-web is sparsely commented, mostly
commented-out CSS.

### Where Declare's source is *harder* to read (honest)

- **`any`-seams.** `pathOf(w) { return w != null && w.appPath ? "" + w.appPath : "" }` —
  defensive `"" +` coercions and null guards recur because View-typed slots don't carry
  subclass types. The source names the pattern.
- **Parallel arrays.** `miniRecs` (data) and `miniWins` (views) must be kept in step
  because "a View's circular graph must never enter data-shaped state" — a modelling
  constraint leaking into app code.
- **Deps-as-arguments.** `windowItems(this.winSeq, app.frontWin)` passes values the method
  could read directly, purely so the constraint tracker can see the dependency.
- **Scope walking.** `this.parent.parent.hot` and
  `classroot ? "" + this.parent.parent.glyph : ""` are fragile.
- Magic numbers whose derivations live only in comments (`496 = 9·48 + 8 gaps`).

### Where macos-web's source is harder

Per-file it is very readable — small, conventional components. But behaviour is scattered
across 9 state modules and config objects; there is **dead configuration** (`resizable`)
implying features that don't exist; and `$effect`/`untrack` gymnastics appear in Dock,
DockItem and Window specifically to break reactive loops — the runes-era version of the
feedback problem Declare avoids by construction.

## 7. Bottom line

**macos-web wins on asset fidelity and polish-per-pixel.** Real Ventura wallpapers,
photographic app icons, genuine `backdrop-filter` vibrancy, a boot sequence, accent
colours, PWA/offline. At a glance it looks more like a Mac than Declare Desktop does, and
that is a real achievement worth respecting.

**Declare Desktop wins decisively on behaviour.** The verbs that make a desktop a desktop —
resize from every edge and corner, minimise, invoke a menu command, a menu bar that
follows the front application, keyboard shortcuts, multiple windows per app, Quit and
relaunch — are working in Declare and are absent or decorative in macos-web.
Its dock magnification is real layout; its minimised windows are live thumbnails riding
that same wave; and its dark mode crosses into independently compiled child apps.

**The capability with no counterpart** is seamless embedding: a Declare desktop window can
host an entire other Declare application — the real Calendar, the real Viewer showing this
desktop's own source — each with its own reactive graph, sized by the host's constraints,
themed through a declared env channel. macos-web's nearest equivalent is an iframe to a
third-party service.

**And the cost side favours Declare**: ~1,327 code lines vs ~4,700, zero runtime
dependencies vs six, zero image bytes vs 42 MB on disk / 451 KB on first paint, 2 deployed
files vs 399, half the first-load bytes — at an essentially identical gzipped code payload
(81.8 vs 79.9 KB) that also happens to contain the whole language runtime.
