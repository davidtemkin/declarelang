import { App } from "./view.js";
import type { RenderBackend } from "./backend.js";
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
export declare function loadFonts(fonts: readonly FontSpec[], base?: string | null): Promise<void>;
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
export declare function isEmbedded(host: HTMLElement): boolean;
/** The host's service table for the app→host verbs (App.hostServices): install
 *  it at mount and `navigate`/`openWindow`/`inspect` call it SYNCHRONOUSLY —
 *  inside the click's transient user activation — instead of parking intents
 *  on the pending* channels for a poll that no longer exists. Per-app, so a
 *  page hosting several apps routes each to its own services, and a FOREIGN
 *  page embedding a widget can supply its own (route `navigate` into an SPA
 *  router). The tenancy contract lives here by construction: an embedded app
 *  simply never gets the page-scoped services installed. */
export interface HostServices {
    navigate?: (to: string) => void;
    openWindow?: (to: string) => void;
    inspect?: (slot: string) => void;
}
export declare function provideHostServices(app: App, services: HostServices): void;
/** Tear down an embedded app's environment wiring (ResizeObserver + pointer listeners).
 *  Its rendered DOM is removed by the caller (clearing the island box); its input
 *  router self-retires once the root element is disconnected. A no-op for a
 *  top-level app. */
export declare function disposeApp(app: App): void;
/** Wire the runtime input services to a freshly-rooted app. A TOP-LEVEL app owns
 *  the page: it takes the focus-tree root (Tab from nothing focused), the keyboard
 *  adapter, and window-fed environment attributes. An EMBEDDED app (a preview in
 *  an island) owns only its box — it takes its host from that element and does NOT
 *  seize the page's global focus/keys singletons (the outer app keeps them). */
export declare function wireInput(app: App, host: HTMLElement, chrome?: boolean): void;
/** Mount an already-instantiated App: attach to the backend, root it in `host`,
 *  wire input. The shared tail of every render path. */
export declare function mountApp(app: App, host: HTMLElement, backend: RenderBackend, opts?: {
    chrome?: boolean;
}): App;
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
export declare function reflectAppName(app: App, served: string, reflected: string): string;
/** Render a PRECOMPILED program (the artifact `declarec` emits) — instantiate
 *  and mount, with NO parse and NO typecheck (both done at build time). This is
 *  the production entry point: importing it pulls the runtime's run-path only,
 *  never the parser or checker. */
export declare function renderProgram(program: Program, host: HTMLElement, backend: RenderBackend): App;
/** Like renderProgram(), but first loads the program's own web `font` faces so
 *  first paint measures against the real metrics (mirrors renderAsync).
 *  `assetBase` states the program's own directory when the page is served from
 *  elsewhere — its relative bitmaps and faces resolve there (image.ts). */
export declare function renderProgramAsync(program: Program, host: HTMLElement, backend: RenderBackend, assetBase?: string | null): Promise<App>;
