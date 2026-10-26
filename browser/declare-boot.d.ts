// declare-boot.d.ts — the page's side of Declare: what a page's own script calls
// to run a Declare program and talk to it (guide: Embedding). The types for
// bundles/declare-boot.js, and the source of the reference's Embedding section
// (tools/internal/doc/extract.mjs reads every doc comment here): an entry the
// reference shows is a declaration in this file, and a test holds the file to
// what the bundle and its handles really expose.

// The two records the boundary carries, under the names the program side gives
// them (the reference's Types page documents both).
export interface IslandMessage { readonly topic: string; readonly payload: unknown }
export interface IslandNavigation { readonly to: string; readonly program: string; readonly location: string; readonly newWindow: boolean }

/** What `boot()` is told: which program to run, where, and how the page hosts it. */
export interface BootOptions {
  /** The program's `.declare` file, relative to the page — or its directory, for a
   *  program kept as a directory. Its own relative addresses (images, data) resolve
   *  beside it. */
  main: string;
  /** The element the app fills, marked `data-declare-embed`. The app then leaves the
   *  page's title, URL, history, scroll and keys alone. Without it the app takes the
   *  whole page (the element with id `host`). Several apps on one page each take their
   *  own element. */
  host?: HTMLElement;
  /** Values the program reads with `hostProvided(name, default)`, there from its very
   *  first evaluation. A `data-declare-provide` JSON attribute on the element does the
   *  same; these win over it. Later changes go through `Tenant.provide`. */
  provides?: Record<string, unknown>;
  /** Hears the program's `app.postToHost(topic, payload)`. Without it, such a message
   *  is dropped with a console note. */
  onPost?: (message: IslandMessage) => void;
  /** Carries out every link the program follows out of itself (`app.navigate`) and
   *  every window it opens (`app.openWindow`). It runs synchronously inside the click,
   *  so it may open a window itself. Without it, the browser does: the page navigates,
   *  or a new window opens. */
  onNavigate?: (navigation: IslandNavigation) => void;
  /** The program's starting location — what its `app.location` reads before anything
   *  moves it. A whole-page app takes the URL's fragment first. */
  location?: string;
  /** The renderer, when the page chooses: `"DomBackend"` or `"CanvasBackend"`.
   *  Otherwise the address's `?render=` decides, then the program's own default. */
  backend?: "DomBackend" | "CanvasBackend";
}

/** The page's handle on a program it booted: what `boot()` resolves to, and what the
 *  host element carries as `el.__declareTenant`. It speaks to the program in an
 *  island's words — values down and up, and messages both ways. */
export interface Tenant {
  /** The App itself, for reading and writing its attributes from page script
   *  (`tenant.app.hue = 120`), and for `observe`. Under the GPU renderer it is a
   *  stand-in that relays reads and writes to the program's worker. */
  readonly app: any;
  /** Sends the program a message: it arrives as `onHostMessage({ topic, payload })`
   *  on its App. */
  post(topic: string, payload?: unknown): void;
  /** Changes a value the program reads with `hostProvided(name, default)`; every
   *  reader re-derives. `undefined` withdraws it, and readers fall back to their
   *  defaults. */
  provide(name: string, value: unknown): void;
  /** Reads a value the program offers up — one its App lists in `exposes` — or
   *  `dflt` when it offers no such name. Tracked, so
   *  `observe(() => tenant.exposed("total", 0), cb)` follows it. */
  exposed<T>(name: string, dflt?: T): T;
}

/** The handle foreign content inside a `DOMIsland` uses to reach the program around
 *  it — the island element's `el.__declareIsland`, there once the island has mounted.
 *  It reaches what a Declare tenant reaches; its verbs keep the island's own names. */
export interface IslandHandle {
  /** The names the island offers down, from its `provides` list. */
  provides(): string[];
  /** The value the island provides under `name` now, or `undefined` when it does not
   *  list the name. */
  hostProvided(name: string): unknown;
  /** A standing watch over a provided value: `callback` runs now with the value, then
   *  at the close of every settle that changed it. Returns the unwatch. */
  watchProvided(name: string, callback: (value: unknown) => void): () => void;
  /** Offers a value up: the program reads it with the island's
   *  `exposed(name, default)`, whose default's kind the value must match.
   *  `undefined` withdraws it. */
  expose(name: string, value: unknown): void;
  /** Sends the program a message: it arrives as the island's `onPost({ topic,
   *  payload })`. */
  post(topic: string, payload?: unknown): void;
  /** Hears the island's `post(topic, payload)`. Returns the unsubscribe. */
  onPost(callback: (message: IslandMessage) => void): () => void;
}

/** Runs a Declare program in this page: fetches or compiles it, builds the app,
 *  mounts it in `options.host` (or the whole page), and resolves to the page's
 *  `Tenant` handle on it — `null` if it could not come up, after showing why.
 *  `import boot from "/declare/bundles/declare-boot.js"`. */
export default function boot(options: BootOptions): Promise<Tenant | null>;

/** Watches a value out of a running program: `read` is called under tracking, and
 *  `onChange` runs with its result once per settle in which that changed. Returns
 *  the unwatch. `import boot, { observe } from "/declare/bundles/declare-boot.js"`. */
export function observe<T>(read: () => T, onChange: (value: T) => void): () => void;
