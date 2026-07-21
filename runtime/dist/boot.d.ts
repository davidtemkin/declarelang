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
 *  zero-dependency graph. */
export declare function loadFonts(fonts: readonly FontSpec[]): Promise<void>;
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
 *  first paint measures against the real metrics (mirrors renderAsync). */
export declare function renderProgramAsync(program: Program, host: HTMLElement, backend: RenderBackend): Promise<App>;
