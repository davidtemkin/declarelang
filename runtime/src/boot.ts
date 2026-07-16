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
import type { RenderBackend } from "./backend.js";
import { DeclareError } from "./errors.js";
import { Keys } from "./keys.js";
import { Focus, deliverKeys } from "./focus.js";
import { bridgeFor } from "./inspect.js";
// Type-only — erased by tsc, so no runtime dependency on the parser.
import type { Program } from "./parser.js";

/** A web font to make available before first paint: `src` is a URL (a
 *  self-hosted woff2 or a CDN), `weight`/`style` mirror the CSS descriptors. */
export interface FontSpec {
  family: string;
  src: string;
  weight?: string | number;
  style?: string;
}

/** Load web fonts into the document so BOTH backends see them — one FontFace
 *  serves the Canvas backend's `ctx.font`/measureText and the DOM backend's
 *  `font-family` alike. A sanctioned runtime primitive: font loading lives in
 *  the runtime, never in a `{ }` body (which cannot reach `document`, per the
 *  sealed-abstraction rule). Awaiting every face lets a caller gate first paint
 *  on it so text measures against the real metrics, not a fallback that reflows
 *  on arrival. A no-op off the DOM (Node/tests), so it stays safe in the
 *  zero-dependency graph. */
export async function loadFonts(fonts: readonly FontSpec[]): Promise<void> {
  if (typeof FontFace === "undefined" || typeof document === "undefined") return;
  await Promise.all(
    fonts.map(async (f) => {
      // f.src is a full CSS src value — `url("…")`, `local("…")`, or a chain.
      const face = new FontFace(f.family, f.src, {
        weight: String(f.weight ?? "normal"),
        style: f.style ?? "normal",
      });
      await face.load();
      // FontFaceSet is Set-like at runtime; the configured DOM lib omits `add`.
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
    }),
  );
}

/** Is this mount host EMBEDDED inside another Declare app? A top-level app roots on
 *  a bare host (document.body's child); an embedded app is rendered into an
 *  `HTML []` island's box, which lives inside the outer app's marked tree
 *  (attachRoot stamps every app root `data-declare-app`). The child reads that ONE
 *  DOM signal to configure itself — no explicit "embedded" flag threads through.
 *  The mark is on the app ROOT element (a child of `host`), so `closest` from
 *  `host` sees only ANCESTOR apps, never this app's own just-attached root. */
function isEmbedded(host: HTMLElement): boolean {
  return typeof document !== "undefined" && typeof host.closest === "function"
    && host.closest("[data-declare-app]") !== null;
}

/** Per-app teardown for an EMBEDDED app's environment listeners (a top-level app
 *  lives for the page and needs none). The host calls disposeApp() before it
 *  re-renders a preview so the old app's ResizeObserver/pointer listeners don't
 *  linger. */
const TEARDOWN = new WeakMap<App, () => void>();

/** Tear down an embedded app's environment wiring (ResizeObserver + pointer listeners).
 *  Its rendered DOM is removed by the caller (clearing the island box); its input
 *  router self-retires once the root element is disconnected. A no-op for a
 *  top-level app. */
export function disposeApp(app: App): void {
  TEARDOWN.get(app)?.();
  TEARDOWN.delete(app);
}

/** Wire the runtime input services to a freshly-rooted app. A TOP-LEVEL app owns
 *  the page: it takes the focus-tree root (Tab from nothing focused), the keyboard
 *  adapter, and window-fed environment attributes. An EMBEDDED app (a preview in
 *  an island) owns only its box — it takes its host from that element and does NOT
 *  seize the page's global focus/keys singletons (the outer app keeps them). */
export function wireInput(app: App, host: HTMLElement): void {
  const embedded = isEmbedded(host);
  wireEnvironment(app, host, embedded);
  if (embedded) return;
  Focus.setRoot(app);
  Keys.listen(() => app.surface !== null);
  deliverKeys(Keys, Focus);
  // The inspect bridge (inspect.ts): the tree, provenance, and the driven
  // clock as page-queryable data — verify's rung 5 drives it; a human pokes
  // it in the console. Top-level apps only (one page, one bridge).
  (window as unknown as { __declare?: unknown }).__declare = bridgeFor(app);
}

/** Feed `app.dark` from the OS colour scheme and keep it live as the system theme
 *  flips. Returns an unsubscribe so an embedded app's re-render can drop the listener. */
function wireColorScheme(app: App): () => void {
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
function wireEnvironment(app: App, host: HTMLElement, embedded: boolean): void {
  if (typeof window === "undefined") return;
  if (embedded) return wireEnvironmentEmbedded(app, host);
  const w = window;
  wireColorScheme(app);                    // top-level app lives for the page — no teardown needed
  const size = () => { app.hostWidth = w.innerWidth; app.hostHeight = w.innerHeight; };
  const scroll = () => { app.scrollY = w.scrollY; };
  const move = (e: PointerEvent) => {
    app.pointerX = e.clientX; app.pointerY = e.clientY;
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
  const out = (e: PointerEvent) => { if (e.relatedTarget === null) { app.hovering = false; app.pointerOverText = false; } };
  size(); scroll();
  w.addEventListener("resize", size);
  w.addEventListener("scroll", scroll, { passive: true });
  w.addEventListener("pointermove", move, { passive: true });
  w.addEventListener("pointerout", out);
}

/** Environment wiring for an embedded app: host size follows the container
 *  ELEMENT (its island box), the pointer is box-relative, and there is no page
 *  scroll to own. Registers a teardown so a re-render (disposeApp) drops the
 *  observer/listeners. */
function wireEnvironmentEmbedded(app: App, host: HTMLElement): void {
  const sync = () => {
    app.hostWidth = host.clientWidth; app.hostHeight = host.clientHeight;
    // A declared size floor (App.minWidth/minHeight) makes the island a
    // viewport: the app can be LARGER than its box, so the box pans natively.
    // `auto` shows scrollbars only on real overflow, so a floorless app is
    // untouched. (At top level the page itself scrolls; no wiring needed.)
    if (app.minWidth > 0 || app.minHeight > 0) host.style.overflow = "auto";
  };
  const move = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    app.pointerX = e.clientX - r.left; app.pointerY = e.clientY - r.top;
    app.hovering = e.pointerType !== "touch"; // a touch has no hover (see wireEnvironment)
    const t = e.target;
    app.pointerOverText =
      t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  };
  const leave = () => { app.hovering = false; app.pointerOverText = false; };
  const unTheme = wireColorScheme(app);    // re-rendered embedded apps must drop the mq listener
  sync();
  host.addEventListener("pointermove", move, { passive: true });
  host.addEventListener("pointerleave", leave);
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(sync); ro.observe(host); }
  TEARDOWN.set(app, () => {
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerleave", leave);
    ro?.disconnect();
    unTheme();
  });
}

/** Mount an already-instantiated App: attach to the backend, root it in `host`,
 *  wire input. The shared tail of every render path. */
export function mountApp(app: App, host: HTMLElement, backend: RenderBackend): App {
  app.attach(backend, null);
  backend.attachRoot(host, app.surface!);
  wireInput(app, host);
  return app;
}

/** Render a PRECOMPILED program (the artifact `declarec` emits) — instantiate
 *  and mount, with NO parse and NO typecheck (both done at build time). This is
 *  the production entry point: importing it pulls the runtime's run-path only,
 *  never the parser or checker. */
export function renderProgram(program: Program, host: HTMLElement, backend: RenderBackend): App {
  const root = instantiate(program);
  if (!(root instanceof App)) throw new DeclareError("a program's root must be 'App [ … ]'", program.root.pos);
  return mountApp(root, host, backend);
}

/** Like renderProgram(), but first loads the program's own web `font` faces so
 *  first paint measures against the real metrics (mirrors renderAsync). */
export async function renderProgramAsync(program: Program, host: HTMLElement, backend: RenderBackend): Promise<App> {
  const root = instantiate(program);
  if (!(root instanceof App)) throw new DeclareError("a program's root must be 'App [ … ]'", program.root.pos);
  await loadFonts(fontFacesOf(root));
  return mountApp(root, host, backend);
}
