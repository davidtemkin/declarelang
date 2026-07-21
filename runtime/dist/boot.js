// Render glue shared by the source-compiling entry (index.ts) and the
// precompiled production entry used by `declarec` output. Instantiating a
// program and wiring it to the page needs NONE of the compiler (parser/check):
// keeping this glue in its own module lets the production bundle import
// `renderProgram` and drop the parser and typechecker entirely — the whole
// point of a precompiled build. A source with only explicit-path bodies never
// needs the parser at runtime; declarec parses + checks at build time and ships
// the instantiated program, so this module is the runtime's true floor.
import { instantiate } from "./instantiate.js";
import { App } from "./view.js";
import { fontFacesOf } from "./font.js";
import { DeclareError } from "./errors.js";
import { Keys } from "./keys.js";
import { Focus, deliverKeys } from "./focus.js";
import { bridgeFor } from "./inspect.js";
/** Load web fonts into the document so BOTH backends see them — one FontFace
 *  serves the Canvas backend's `ctx.font`/measureText and the DOM backend's
 *  `font-family` alike. A sanctioned runtime primitive: font loading lives in
 *  the runtime, never in a `{ }` body (which cannot reach `document`, per the
 *  sealed-abstraction rule). Awaiting every face lets a caller gate first paint
 *  on it so text measures against the real metrics, not a fallback that reflows
 *  on arrival. A no-op off the DOM (Node/tests), so it stays safe in the
 *  zero-dependency graph. */
export async function loadFonts(fonts) {
    if (typeof FontFace === "undefined" || typeof document === "undefined")
        return;
    await Promise.all(fonts.map(async (f) => {
        // f.src is a full CSS src value — `url("…")`, `local("…")`, or a chain.
        const face = new FontFace(f.family, f.src, {
            weight: String(f.weight ?? "normal"),
            style: f.style ?? "normal",
        });
        await face.load();
        // FontFaceSet is Set-like at runtime; the configured DOM lib omits `add`.
        document.fonts.add(face);
    }));
}
/** Is this mount host EMBEDDED inside another Declare app? A top-level app roots on
 *  a bare host (document.body's child); an embedded app is rendered into an
 *  `HTML []` island's box, which lives inside the outer app's marked tree
 *  (attachRoot stamps every app root `data-declare-app`). The child reads that ONE
 *  DOM signal to configure itself — no explicit "embedded" flag threads through.
 *  The mark is on the app ROOT element (a child of `host`), so `closest` from
 *  `host` sees only ANCESTOR apps, never this app's own just-attached root. */
function isEmbedded(host) {
    return typeof document !== "undefined" && typeof host.closest === "function"
        && host.closest("[data-declare-app]") !== null;
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
    const size = () => { app.hostWidth = w.innerWidth; app.hostHeight = w.innerHeight; };
    const scroll = () => { app.scrollY = w.scrollY; };
    const move = (e) => {
        app.pointerX = e.clientX;
        app.pointerY = e.clientY;
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
    size();
    scroll();
    w.addEventListener("resize", size);
    w.addEventListener("scroll", scroll, { passive: true });
    w.addEventListener("pointermove", move, { passive: true });
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
        const r = host.getBoundingClientRect();
        app.pointerX = e.clientX - r.left;
        app.pointerY = e.clientY - r.top;
        app.hovering = e.pointerType !== "touch"; // a touch has no hover (see wireEnvironment)
        const t = e.target;
        app.pointerOverText =
            t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    };
    const leave = () => { app.hovering = false; app.pointerOverText = false; };
    const unTheme = wireColorScheme(app); // re-rendered embedded apps must drop the mq listener
    sync();
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(sync);
        ro.observe(host);
    }
    TEARDOWN.set(app, () => {
        host.removeEventListener("pointermove", move);
        host.removeEventListener("pointerleave", leave);
        ro?.disconnect();
        unTheme();
    });
}
/** Mount an already-instantiated App: attach to the backend, root it in `host`,
 *  wire input. The shared tail of every render path. */
export function mountApp(app, host, backend, opts = {}) {
    app.attach(backend, null);
    backend.attachRoot(host, app.surface);
    wireInput(app, host, opts.chrome === true);
    return app;
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
 *  first paint measures against the real metrics (mirrors renderAsync). */
export async function renderProgramAsync(program, host, backend) {
    const root = instantiate(program);
    if (!(root instanceof App))
        throw new DeclareError("a program's root must be 'App [ … ]'", program.root.pos);
    await loadFonts(fontFacesOf(root));
    mountApp(root, host, backend);
    startTitleMirror(root, host);
    return root;
}
//# sourceMappingURL=boot.js.map