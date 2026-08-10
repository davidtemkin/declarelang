// Render glue shared by the source-compiling entry (index.ts) and the
// precompiled production entry used by `declarec` output. Instantiating a
// program and wiring it to the page needs NONE of the compiler (parser/check):
// keeping this glue in its own module lets the production bundle import
// `renderProgram` and drop the parser and typechecker entirely — the whole
// point of a precompiled build. A source with only explicit-path bodies never
// needs the parser at runtime; declarec parses + checks at build time and ships
// the instantiated program, so this module is the runtime's true floor.
import { instantiate } from "./instantiate.js";
import { App, View } from "./view.js";
import { fontFacesOf } from "./font.js";
import { assetBaseFor, rebaseAsset, setAppAssetBase } from "./asset-base.js";
import { DeclareError } from "./errors.js";
import { Keys } from "./keys.js";
import { Focus, deliverKeys } from "./focus.js";
import { bridgeFor } from "./inspect.js";
import { localPoint } from "./dom-backend.js";
/** A CSS src value's `url("…")` arguments, rebased against `base` — the same
 *  rule an Image's relative `source` follows, because a face src IS a relative
 *  asset: `Face [ src = "resources/fonts/vera.ttf" ]` names a file beside the
 *  PROGRAM. A FontFace resolves it against the DOCUMENT instead, so an app
 *  booted from elsewhere in the tree (an entry page, an embedded child in an
 *  island) asked the wrong directory for its type. `local("…")` names an
 *  installed face and is left alone. */
function rebaseFontSrc(src, base) {
    if (base === null)
        return src;
    return src.replace(/url\("((?:[^"\\]|\\.)*)"\)/g, (whole, quoted) => {
        try {
            return `url(${JSON.stringify(rebaseAsset(JSON.parse(`"${quoted}"`), base))})`;
        }
        catch {
            return whole;
        }
    });
}
/** Load web fonts into the document so BOTH backends see them — one FontFace
 *  serves the Canvas backend's `ctx.font`/measureText and the DOM backend's
 *  `font-family` alike. A sanctioned runtime primitive: font loading lives in
 *  the runtime, never in a `{ }` body (which cannot reach `document`, per the
 *  sealed-abstraction rule). Awaiting every face lets a caller gate first paint
 *  on it so text measures against the real metrics, not a fallback that reflows
 *  on arrival. A no-op off the DOM (Node/tests), so it stays safe in the
 *  zero-dependency graph.
 *
 *  `base` is the directory relative face sources resolve against — the calling
 *  app's own program dir; omitted, the page-wide asset base applies.
 *
 *  A face that fails to load (404, a corrupt file, a CORS refusal) is REPORTED
 *  and SKIPPED, never thrown: type is the one asset whose absence has a
 *  fallback built into every text stack. A rejection here used to take the
 *  whole render with it — one missing woff2 and the app never mounted at all,
 *  which is a worse answer than the app in fallback type. */
export async function loadFonts(fonts, base) {
    if (typeof FontFace === "undefined" || typeof document === "undefined")
        return;
    const b = base === undefined ? assetBaseFor(null) : base;
    await Promise.all(fonts.map(async (f) => {
        // f.src is a full CSS src value — `url("…")`, `local("…")`, or a chain.
        const src = rebaseFontSrc(f.src, b);
        try {
            const face = new FontFace(f.family, src, {
                weight: String(f.weight ?? "normal"),
                style: f.style ?? "normal",
            });
            await face.load();
            // FontFaceSet is Set-like at runtime; the configured DOM lib omits `add`.
            document.fonts.add(face);
        }
        catch (e) {
            console.warn(`[Declare] font ${f.family}: ${src} did not load — falling back`, e);
        }
    }));
}
/** Is this mount host EMBEDDED inside another Declare app? A top-level app roots on
 *  a bare host (document.body's child); an embedded app is rendered into an
 *  `HTML []` island's box, which lives inside the outer app's marked tree
 *  (attachRoot stamps every app root `data-declare-app`). The child reads that ONE
 *  DOM signal to configure itself — no explicit "embedded" flag threads through.
 *  The mark is on the app ROOT element (a child of `host`), so `closest` from
 *  `host` sees only ANCESTOR apps, never this app's own just-attached root.
 *
 *  A FOREIGN page embedding a Declare app in a sized div of its own has no
 *  Declare ancestor to signal with — it marks the host itself:
 *  `<div id="host" data-declare-embed>`. Same semantics as an island box (the
 *  app fills the ELEMENT, the page keeps its background and scroll), declared
 *  where the decision lives — on the page, not in a boot flag. `closest`
 *  matches the host itself, so one selector answers both. */
function isEmbedded(host) {
    return typeof document !== "undefined" && typeof host.closest === "function"
        && host.closest("[data-declare-app], [data-declare-embed]") !== null;
}
/** Per-app teardown for an EMBEDDED app's environment listeners (a top-level app
 *  lives for the page and needs none). The host calls disposeApp() before it
 *  re-renders a preview so the old app's ResizeObserver/pointer listeners don't
 *  linger. */
const TEARDOWN = new WeakMap();
/** Tear down an embedded app's environment wiring (ResizeObserver + pointer listeners).
 *  Its rendered DOM is removed by the caller (clearing the island box); its input
 *  router self-retires once the root element is disconnected. A no-op for a
 *  top-level app. */
export function disposeApp(app) {
    TEARDOWN.get(app)?.();
    TEARDOWN.delete(app);
}
/** Wire the runtime input services to a freshly-rooted app. A TOP-LEVEL app owns
 *  the page: it takes the focus-tree root (Tab from nothing focused), the keyboard
 *  adapter, and window-fed environment attributes. An EMBEDDED app (a preview in
 *  an island) owns only its box — it takes its host from that element and does NOT
 *  seize the page's global focus/keys singletons (the outer app keeps them). */
export function wireInput(app, host, chrome = false) {
    // `chrome` — a CHROME app (the Inspector): it owns its own box and input like
    // an embedded app, but is mounted at page level rather than inside another
    // app's tree. It must never seize the page's focus root, the keys adapter, or
    // the `__declare` bridge, all of which belong to the app it is inspecting.
    const embedded = isEmbedded(host);
    // A CHROME app covers the viewport, so it reads the WINDOW environment like a
    // top-level app does — pointer, size, scroll. Reading the host ELEMENT instead
    // would strand it: a chrome overlay sets `pointer-events: none` so the app
    // beneath stays usable, and an element that takes no pointer events never sees
    // pointermove, which would freeze app.pointerX and break every drag it owns.
    wireEnvironment(app, host, chrome ? false : embedded);
    if (chrome || embedded)
        return;
    Focus.setRoot(app);
    Keys.listen(() => app.surface !== null);
    deliverKeys(Keys, Focus);
    // The inspect bridge (inspect.ts): the tree, provenance, and the driven
    // clock as page-queryable data — verify's rung 5 drives it; a human pokes
    // it in the console. Top-level apps only (one page, one bridge).
    window.__declare = bridgeFor(app);
}
/** Feed `app.dark` from the OS color scheme and keep it live as the system theme
 *  flips. Returns an unsubscribe so an embedded app's re-render can drop the listener. */
function wireColorScheme(app) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    app.dark = mq.matches;
    const update = () => { app.dark = mq.matches; };
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
}
/** Feed the SAFE-AREA facts (`app.safeTop`…`safeRight`) and honor `edges = cover`.
 *
 *  The default is the letterbox: the browser keeps the app clear of the
 *  device's own chrome (notch, home indicator), the bars wear the app's fill
 *  (dom-backend attachRoot), and every inset reads 0 — nothing to handle.
 *  `edges = cover` is the opt-in for the edge-to-edge look: it patches
 *  `viewport-fit=cover` into the page's viewport meta (append, never replace —
 *  the served meta's width/scale terms are load-bearing on iOS), at which
 *  point the box extends under the system chrome and the insets become real
 *  numbers pinned chrome must offset by.
 *
 *  The one way to READ the insets is CSS `env(safe-area-inset-*)` — resolved
 *  through a hidden probe element's computed padding. Re-measured on `resize`
 *  (rotation swaps top/left insets) and once on the next tick, because iOS
 *  applies a meta patch asynchronously. `edges` itself is read at mount: it is
 *  a fact about the app, not a runtime toggle. */
function wireSafeArea(app, w) {
    // No getComputedStyle means no DOM — the mac host's env keeps it undefined
    // as exactly that signal, and only a computed style can read the env()
    // paddings off the probe. Safe areas stay at their zero defaults, which is
    // the truthful answer for a desktop window: nothing overlaps its content.
    if (typeof w.getComputedStyle !== "function")
        return;
    const doc = w.document;
    if (app.edges === "cover") {
        let meta = doc.querySelector('meta[name="viewport"]');
        if (meta === null) {
            meta = doc.createElement("meta");
            meta.name = "viewport";
            meta.content = "width=device-width, initial-scale=1";
            doc.head.appendChild(meta);
        }
        if (!meta.content.includes("viewport-fit")) {
            meta.content = meta.content === "" ? "viewport-fit=cover" : meta.content + ", viewport-fit=cover";
        }
        // The SAME opt-in makes the app Home-Screen-installable as a FULL-SCREEN
        // app. In a Safari TAB the browser keeps its bars until the PAGE scrolls
        // (an App is the page scroller by default, so a content-tall app earns
        // the collapse; a fixed-screen app never does), and the status band is
        // Safari's at every scroll state — its color follows the page background,
        // which follows the app's fill (dom-backend attachRoot + setFill). So a
        // tab gets edge-to-edge-LOOKING; standalone gets the real thing, and an
        // app that declared cover has declared exactly that intent.
        // `black-translucent` makes the standalone status bar an OVERLAY (the
        // app paints under it), which is the cover contract; the live safeTop
        // inset carries its height. Stamped only if the page doesn't already
        // carry them.
        for (const [name, content] of [
            ["mobile-web-app-capable", "yes"],
            ["apple-mobile-web-app-capable", "yes"],
            ["apple-mobile-web-app-status-bar-style", "black-translucent"],
        ]) {
            if (doc.querySelector(`meta[name="${name}"]`) === null) {
                const m = doc.createElement("meta");
                m.name = name;
                m.content = content;
                doc.head.appendChild(m);
            }
        }
    }
    const probe = doc.createElement("div");
    probe.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
            "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    doc.body.appendChild(probe);
    const measure = () => {
        const s = w.getComputedStyle(probe);
        app.safeTop = parseFloat(s.paddingTop) || 0;
        app.safeRight = parseFloat(s.paddingRight) || 0;
        app.safeBottom = parseFloat(s.paddingBottom) || 0;
        app.safeLeft = parseFloat(s.paddingLeft) || 0;
    };
    measure();
    w.setTimeout(measure, 0); // the cover reflow lands after the meta patch
    w.addEventListener("resize", measure);
}
/** Feed `app.touchDevice` — "am I running on a touch device?" — from the device's
 *  primary pointer: true on a phone or tablet (`(pointer: coarse)`), so mouse-only
 *  affordances (a cursor-chasing dot, a hover reveal) switch off. A stable device
 *  fact, kept live if the input changes; distinct from the transient `hovering`.
 *  Returns an unsubscribe so an embedded app's re-render can drop the listener. */
function wireTouchDevice(app) {
    // THE DEVICE PROFILE — three independent facts, none of them a guess.
    //   touchDevice: the PRIMARY pointer is coarse ("is this a phone/tablet?") —
    //     the sizing decision, deliberately stable across a session.
    //   hasTouch / hasPointer: what the device HAS at all (`any-pointer`). A
    //     Windows touch laptop is `hasTouch && hasPointer` with touchDevice
    //     false — its trackpad really is primary — which is the case a single
    //     boolean cannot answer. Use these for a hit-target FLOOR, not a switch.
    //   lastPointerType: what the user just used, live. The only correct answer
    //     for a hybrid, because the truth changes per gesture rather than per
    //     device; drive hover-only affordances from this, never layout (targets
    //     that resize as you alternate trackpad and finger are worse than either).
    const primary = window.matchMedia("(pointer: coarse)");
    const anyCoarse = window.matchMedia("(any-pointer: coarse)");
    const anyFine = window.matchMedia("(any-pointer: fine)");
    const update = () => {
        app.touchDevice = primary.matches;
        app.hasTouch = anyCoarse.matches;
        app.hasPointer = anyFine.matches;
    };
    update();
    primary.addEventListener("change", update);
    anyCoarse.addEventListener("change", update);
    anyFine.addEventListener("change", update);
    return () => {
        primary.removeEventListener("change", update);
        anyCoarse.removeEventListener("change", update);
        anyFine.removeEventListener("change", update);
    };
}
/** Feed the App's reactive environment. A top-level app reads the WINDOW (host
 *  size on resize, page scroll, the free pointer); an embedded app reads its
 *  CONTAINER ELEMENT instead. Guarded so a Node host (unit tests) is a no-op.
 *  Writes batch through the reactive scheduler like any attribute. */
function wireEnvironment(app, host, embedded) {
    if (typeof window === "undefined")
        return;
    if (embedded)
        return wireEnvironmentEmbedded(app, host);
    const w = window;
    wireColorScheme(app); // top-level app lives for the page — no teardown needed
    wireTouchDevice(app); // device pointer kind — likewise page-lived
    wireSafeArea(app, w); // notch/home-indicator insets — likewise page-lived
    // The LAYOUT viewport, never the visual one: on iOS/iPadOS `window.inner*`
    // track the VISUAL viewport and a pinch-zoom fires `resize`, so sizing from
    // them re-laid the whole app out under the user's fingers, at the zoomed
    // size (measured on iPad, 2026-07-28 — the zoom also kept self-canceling
    // against the mid-gesture re-layout). `documentElement.client*` are the
    // layout viewport: stable under pinch, still live for rotation and real
    // window resizes — and on desktop they exclude a classic scrollbar, which
    // is the width the app can actually use. A pinch must never change what a
    // Declare app considers its host's size.
    const size = () => {
        const de = w.document.documentElement;
        app.hostWidth = de.clientWidth;
        // HEIGHT is the layout viewport's, WIDENED to the unzoomed visual
        // viewport when that is larger: iOS lets content occupy zones the layout
        // viewport excludes (behind collapsed bar chrome, the home-indicator
        // band) — flow content already paints there, so a fixed overlay sized to
        // clientHeight alone CUTS OFF above the real bottom (measured on iPhone,
        // 2026-08-08). The visual viewport is consulted only at scale ~1 and
        // through max(), so the 2026-07-28 iPad rule stands unweakened: a pinch
        // (or the keyboard, which SHRINKS the visual viewport) must never change
        // what an app considers its host's size.
        const vv = w.visualViewport;
        const vvH = vv != null && vv.scale <= 1.01 ? Math.round(vv.height) : 0;
        app.hostHeight = Math.max(de.clientHeight, vvH);
        // …and the same widening, kept as its own fact: the difference IS the
        // browser's retracted chrome. `hostHeight` alone cannot answer "may a
        // finger reach here" — it reads the same number whether the bottom band
        // is the app's to use (bars retracted, content showing through) or the
        // bars' own. Measured (iPhone 16 Pro, iOS 18.2, 2026-08-09): layout
        // viewport 678 in both states, visual viewport 678 with Safari's bars
        // shown and 760 once they retract — so this reads 0, then 82.
        app.underlapBottom = Math.max(0, app.hostHeight - de.clientHeight);
    };
    const scroll = () => { app.scrollY = w.scrollY; };
    const move = (e) => {
        app.pointerX = e.clientX;
        app.pointerY = e.clientY;
        // A mouse that merely MOVES (never presses) must flip hover affordances
        // back on — so the live fact updates here too, not only at press.
        app.lastPointerType = e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse";
        // A touch has no hover — keep `hovering` false for it so a desktop custom
        // cursor (which reads it) stays off mobile; the coordinates still update so a
        // drag can track the finger.
        app.hovering = e.pointerType !== "touch";
        // Over a native text field the app's custom cursor should yield to the
        // I-beam (see App.pointerOverText).
        const t = e.target;
        app.pointerOverText =
            t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    const out = (e) => { if (e.relatedTarget === null) {
        app.hovering = false;
        app.pointerOverText = false;
    } };
    // The press half of the interaction intrinsics: coordinates land first (a
    // touch press arrives with no prior move), then the down flag.
    const down = (e) => {
        app.pointerX = e.clientX;
        app.pointerY = e.clientY;
        app.hovering = e.pointerType !== "touch";
        app.lastPointerType = e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse";
        app.pointerDown = true;
    };
    const up = () => { app.pointerDown = false; };
    size();
    scroll();
    w.addEventListener("resize", size);
    // Bar-chrome collapse moves the VISUAL viewport without always firing a
    // window resize — hostHeight must track it (the widening above reads it).
    w.visualViewport?.addEventListener("resize", size);
    w.addEventListener("scroll", scroll, { passive: true });
    // CAPTURE phase, so the coordinates land before ANY handler dispatch: the
    // input router listens at the app root (target/bubble), and a touch press
    // arrives with no prior move — bubbling to the window here would hand an
    // onPointerDown a STALE app.pointerX/Y from the previous gesture (measured:
    // a window title-bar hold-drag jumped by the whole touch position,
    // simulator 2026-07-29). A mouse masks the order — its moves precede every
    // press.
    w.addEventListener("pointermove", move, { passive: true, capture: true });
    w.addEventListener("pointerdown", down, { passive: true, capture: true });
    w.addEventListener("pointerup", up, { passive: true, capture: true });
    w.addEventListener("pointercancel", up, { passive: true, capture: true });
    w.addEventListener("pointerout", out);
}
/** Environment wiring for an embedded app: host size follows the container
 *  ELEMENT (its island box), the pointer is box-relative, and there is no page
 *  scroll to own. Registers a teardown so a re-render (disposeApp) drops the
 *  observer/listeners. */
function wireEnvironmentEmbedded(app, host) {
    const sync = () => {
        app.hostWidth = host.clientWidth;
        app.hostHeight = host.clientHeight;
        // A declared size floor (App.minWidth/minHeight) makes the island a
        // viewport: the app can be LARGER than its box, so the box pans natively.
        // `auto` shows scrollbars only on real overflow, so a floorless app is
        // untouched. (At top level the page itself scrolls; no wiring needed.)
        if (app.minWidth > 0 || app.minHeight > 0)
            host.style.overflow = "auto";
    };
    const move = (e) => {
        // localPoint, not rect arithmetic: the box may sit inside a TRANSFORMED
        // host subtree (a rotated desktop window hosting this island), where the
        // rect is the transformed AABB and client-minus-corner lands in the wrong
        // frame. With no live transforms this is the same rect subtraction.
        const p = localPoint(host, e.clientX, e.clientY);
        app.pointerX = p.x;
        app.pointerY = p.y;
        app.hovering = e.pointerType !== "touch"; // a touch has no hover (see wireEnvironment)
        const t = e.target;
        app.pointerOverText =
            t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    const leave = () => { app.hovering = false; app.pointerOverText = false; };
    const unTheme = wireColorScheme(app); // re-rendered embedded apps must drop the mq listener
    const unPointer = wireTouchDevice(app);
    const down = (e) => {
        const p = localPoint(host, e.clientX, e.clientY);
        app.pointerX = p.x;
        app.pointerY = p.y;
        app.hovering = e.pointerType !== "touch";
        app.pointerDown = true;
    };
    const up = () => { app.pointerDown = false; };
    sync();
    // capture, for the same reason as the top-level wiring: coordinates must
    // land before the router dispatches a touch press's onPointerDown
    host.addEventListener("pointermove", move, { passive: true, capture: true });
    host.addEventListener("pointerdown", down, { passive: true, capture: true });
    host.addEventListener("pointerup", up, { passive: true });
    host.addEventListener("pointercancel", up, { passive: true });
    host.addEventListener("pointerleave", leave);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(sync);
        ro.observe(host);
    }
    TEARDOWN.set(app, () => {
        host.removeEventListener("pointermove", move, { capture: true });
        host.removeEventListener("pointerdown", down, { capture: true });
        host.removeEventListener("pointerup", up);
        host.removeEventListener("pointercancel", up);
        host.removeEventListener("pointerleave", leave);
        ro?.disconnect();
        unTheme();
        unPointer();
    });
}
/** Mount an already-instantiated App: attach to the backend, root it in `host`,
 *  wire input. The shared tail of every render path. */
export function mountApp(app, host, backend, opts = {}) {
    app.attach(backend, null);
    backend.attachRoot(host, app.surface);
    applyDeclaredScroll(app);
    wireInput(app, host, opts.chrome === true);
    return app;
}
/** Land the DECLARED initial scroll offsets, once the tree is IN the document.
 *
 *  `attach` builds the whole tree detached and `attachRoot` inserts it only
 *  afterwards, so during attach a scroller has no layout and therefore nothing
 *  to scroll: the push that rode `scrollY`'s own attribute write clamped to
 *  zero. The write's equality gate then made the value permanently unreachable
 *  — `scrollY = 120` left the attribute reading 120 with the surface at 0, and
 *  no later assignment of 120 could ever reconcile them. (Measured 2026-07-31
 *  by a probe written to exercise `ignoreScroll`, which needed a scrolled pane
 *  to mean anything and silently got an unscrolled one: assigning 121 at
 *  runtime worked, which is what named the ordering rather than scrollToY.)
 *
 *  Re-applying is idempotent, so the backends that need no layout to scroll
 *  (canvas and mac keep their own offset) are unaffected. */
function applyDeclaredScroll(v) {
    if (v.scrolls !== "none") {
        if (v.scrollY !== 0)
            v.surface?.scrollToY?.(v.scrollY);
        if (v.scrollX !== 0)
            v.surface?.scrollToX?.(v.scrollX);
    }
    for (const c of v.children)
        if (c instanceof View)
            applyDeclaredScroll(c);
}
/** `app.appName` → `document.title` — the ONE place that mapping lives. Call it
 *  per settle with the title the page was SERVED: an empty `appName` means "no
 *  opinion" and leaves the served title standing. Returns the name now
 *  reflected, so the caller skips no-op writes.
 *
 *  Two hosts drive it, deliberately not one: `browser/host-client.js` calls it
 *  from its own settle loop (BEFORE the location history push, so back/forward
 *  entries are labelled with the state they represent), and `renderProgram*`
 *  below drives it for `declarec` builds, which have no host client. Same
 *  mapping, two drivers — never two copies of the rule. */
export function reflectAppName(app, served, reflected) {
    if (typeof document === "undefined" || app.appName === reflected)
        return reflected;
    document.title = app.appName || served;
    return app.appName;
}
/** Drive reflectAppName from the frame loop, for hosts with no settle loop of
 *  their own (the AOT entry). Top-level apps only: an embedded child app must
 *  never retitle the page, which is why this is wired into renderProgram* — the
 *  production page entry — and never into mountApp, which islands also use. */
function startTitleMirror(app, host) {
    if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined")
        return;
    const served = document.title;
    let reflected = "";
    const tick = () => {
        // Self-retiring on a detached host, the same liveness rule the input
        // router uses — a page app never detaches, so this costs one check a frame.
        if (!host.isConnected)
            return;
        reflected = reflectAppName(app, served, reflected);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
/** Render a PRECOMPILED program (the artifact `declarec` emits) — instantiate
 *  and mount, with NO parse and NO typecheck (both done at build time). This is
 *  the production entry point: importing it pulls the runtime's run-path only,
 *  never the parser or checker. */
export function renderProgram(program, host, backend) {
    const root = instantiate(program);
    if (!(root instanceof App))
        throw new DeclareError("a program's root must be 'App [ … ]'", program.root.pos);
    mountApp(root, host, backend);
    startTitleMirror(root, host);
    return root;
}
/** Like renderProgram(), but first loads the program's own web `font` faces so
 *  first paint measures against the real metrics (mirrors renderAsync).
 *  `assetBase` states the program's own directory when the page is served from
 *  elsewhere — its relative bitmaps and faces resolve there (image.ts). */
export async function renderProgramAsync(program, host, backend, assetBase) {
    const root = instantiate(program);
    if (!(root instanceof App))
        throw new DeclareError("a program's root must be 'App [ … ]'", program.root.pos);
    if (assetBase != null)
        setAppAssetBase(root, assetBase);
    await loadFonts(fontFacesOf(root), assetBase);
    mountApp(root, host, backend);
    startTitleMirror(root, host);
    return root;
}
//# sourceMappingURL=boot.js.map