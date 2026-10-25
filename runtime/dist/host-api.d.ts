import "./services.js";
export { settle, afterSettle, observe, kernelReady } from "./reactive.js";
/** A value held outside any program that page code reads like an app's own: `get()` is
 *  tracked, so an `observe` over it runs again when `set()` changes it (and set settles).
 *  render=gpu's page-side stand-in for an app that runs in a worker is made of these. */
export declare function externalValue<T>(initial: T): {
    get(): T;
    set(v: T): void;
};
export { DomBackend } from "./dom-backend.js";
export { CanvasBackend, feedPointer } from "./canvas-backend.js";
export { provideTransport, setAppDataBase } from "./data.js";
export { provideAssetBase, setAppAssetBase, assetBaseFor, provideUrlMap, mapUrl } from "./asset-base.js";
export { onIslandSlot } from "./backend.js";
export { islandProvisions, linkIslandTenant, islandNavigation, type IslandNavigation, type IslandBox } from "./island.js";
export { fontsReady } from "./font-value.js";
export { hydrateProgram } from "./hydrate.js";
export { scrollPlaces, holdScrollPlaces, dropScrollPlaces, type ScrollPlaces, type Place } from "./scroll-places.js";
export { setInspectionTarget, provideEvalParser } from "./inspect-service.js";
export { provideChecker, islandPermitted } from "./instantiate.js";
export { onDiscard } from "./node.js";
export { isEmbedded, provideHostServices, disposeApp, mountEmbeddedApp, mountApp, reflectAppName, renderProgram, renderProgramAsync, buildProgram } from "./boot.js";
