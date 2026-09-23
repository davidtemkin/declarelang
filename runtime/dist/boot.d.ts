import { App, View } from "./view.js";
import type { RenderBackend } from "./backend.js";
import type { Program } from "./parser.js";
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
/** Mount a Declare TENANT app inside an ISLAND by SURFACE COMPOSITION — the
 *  mac backend's own pattern, generalized: the child's root surface becomes a
 *  child of the island's surface, so the host backend's paint and hit walks
 *  reach the tenant like any subtree (no element, no second input router).
 *  This is how AppIsland works on CANVAS (and how it always worked natively);
 *  the DOM host keeps its element path (renderChild), where the box IS the
 *  natural mount. The island's box feeds the tenant's host extent, live. */
export declare function mountEmbeddedApp(app: App, island: View): App;
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
/** Instantiate a compiled PROGRAM (the parsed, checked, deps-applied shape a
 *  build ships — declarec's artifact, a prewarmed `run` entry, the in-browser
 *  compiler's compileProgram) into its App tree, with no parse and no check:
 *  the program-object twin of index.ts `build(source)`, for a host that never
 *  carries the parser. `deps` zips an extracted dependency list on when the
 *  program does not carry one already; `provides` are the topmost host's
 *  values, there from the first evaluation. */
export declare function buildProgram(program: Program, opts?: {
    deps?: readonly (readonly string[])[];
    provides?: Readonly<Record<string, unknown>>;
}): App;
/** What renderProgramAsync takes beside the program: the program's own
 *  directory for its relative bitmaps and faces (`assetBase`), the host's
 *  provided values, a dependency list to zip on, and the host's chance to
 *  reach the app before its first settle (`beforeMount` — an island links
 *  its boundary there). A bare string is the assetBase alone. */
export type RenderProgramOptions = string | null | undefined | {
    assetBase?: string | null;
    deps?: readonly (readonly string[])[];
    provides?: Readonly<Record<string, unknown>>;
    beforeMount?: (app: App) => void;
};
/** Like renderProgram(), but first loads the program's own web `font` faces so
 *  first paint measures against the real metrics (mirrors renderAsync).
 *  `assetBase` states the program's own directory when the page is served from
 *  elsewhere — its relative bitmaps and faces resolve there (image.ts). */
export declare function renderProgramAsync(program: Program, host: HTMLElement, backend: RenderBackend, options?: RenderProgramOptions): Promise<App>;
