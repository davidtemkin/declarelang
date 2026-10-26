// host-api — what a WEB HOST needs from the runtime, and nothing else.
//
// The browser host (browser/boot-page.js, host-client.js, boot-uniform.js and
// the boots beside them) used to import the runtime's barrel (index.ts), and a
// barrel pins every module it re-exports: the parser, the checker, the
// program schema, the teaching text — the compiler's half — rode into every
// page's boot bundle although no host ever compiles. Every compile result is a
// PROGRAM OBJECT now (compiler/src/program-build.ts; the dev server's
// /compile, the in-browser worker, a prewarmed artifact, a production build),
// so a host only ever instantiates, and this is the surface it instantiates
// through. The compiler bundle carries its own parser and checker, lazily.
//
// The barrel stays what it is — the runtime's whole API for Node, tests, and
// programs that embed the runtime. This is the host's slice of it.

// THE BODY SERVICES, FIRST: services.ts registers what every `{ }` body can
// name — Focus, Keys, the theme presets (`SanFrancisco`), afterSettle,
// measureText, escapeHtml — as a side effect of being imported. The barrel
// imports it; a host that takes this slice instead must too, or the first body
// that names a preset throws at boot (found live on both hosts, 2026-09-23).
import "./services.js";

export { settle, afterSettle, observe, kernelReady } from "./reactive.js";
import { Cell, settle as settleNow } from "./reactive.js";

/** A value held outside any program that page code reads like an app's own: `get()` is
 *  tracked, so an `observe` over it runs again when `set()` changes it (and set settles).
 *  render=gpu's page-side stand-in for an app that runs in a worker is made of these. */
export function externalValue<T>(initial: T): { get(): T; set(v: T): void } {
  let value = initial;
  const cell = new Cell();
  return {
    get: () => { cell.track(); return value; },
    set: (v: T) => { if (Object.is(v, value)) return; value = v; cell.changed(); settleNow(); },
  };
}
export { DomBackend } from "./dom-backend.js";
export { CanvasBackend, feedPointer } from "./canvas-backend.js";
export { provideTransport, setAppDataBase } from "./data.js";
export { provideAssetBase, setAppAssetBase, assetBaseFor, provideUrlMap, mapUrl } from "./asset-base.js";
export { onIslandSlot } from "./backend.js";
export { islandProvisions, linkIslandTenant, islandNavigation, type IslandBox } from "./island.js";
export type { IslandNavigation } from "./navigation.js";
export { navigationOf } from "./navigation.js";
export { fontsReady } from "./font-value.js";
export { hydrateProgram } from "./hydrate.js";
export { scrollPlaces, holdScrollPlaces, dropScrollPlaces, type ScrollPlaces, type Place } from "./scroll-places.js";
export { setInspectionTarget, provideEvalParser } from "./inspect-service.js";
export { provideChecker, islandPermitted } from "./instantiate.js";
// an island discarded (its window closed) takes the program it hosts with it
export { onDiscard } from "./node.js";
export { isEmbedded, provideHostServices, disposeApp, mountEmbeddedApp, mountApp, reflectAppName, renderProgram, renderProgramAsync, buildProgram } from "./boot.js";
