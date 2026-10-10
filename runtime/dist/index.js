// Declare runtime — public surface for R0–R8.
//
// Every program the runtime runs is a compiled one: compile() (the compile
// layer, `dist/compile.js`) parses, resolves, checks and lowers the source,
// and the runtime instantiates the program it hands over — `buildProgram`
// for a tree with no renderer, `renderProgram`/`renderProgramAsync` to mount
// it (boot.ts). The parser and checker exported here serve the compiler and
// the tools; nothing here builds a program from source text.
//
// This module graph is ZERO-dependency and browser-loadable by design.
// NOTE: `pageWeight` (production over-the-wire KB, gzipped) and `sourceLines`
// are set by the HOST/build, not measured from the dev page — a dev page loads
// unbundled ES modules and would read ~10× the shipping size. The build that
// produces the shipping bundle knows the real figure and provides it.
export { parse, parseProgram, parseLibrary } from "./parser.js";
export { resolveIncludes, NO_INCLUDES } from "./include.js";
export { check, checkAttr, checkMethod, checkClassValue } from "./check.js";
export { checkDecl, programSchemas } from "./program-schema.js";
export { hydrateProgram } from "./hydrate.js";
export { instantiate } from "./instantiate.js";
export { forEachCodeValue, serializeDeps, applyDeps } from "./deps.js";
export { forEachElement, serializeLinks, applyLinks } from "./links.js";
// Precompiled production entry + render glue (compiler-free) — see boot.ts.
export { renderProgram, renderProgramAsync, buildProgram, mountApp, mountEmbeddedApp, disposeApp, reflectAppName, isEmbedded, provideHostServices } from "./boot.js";
export { Inspect, setInspectionTarget, inspectionTarget } from "./inspect-service.js";
export { pickAt, dependentsOf, expandValue, slotsOf } from "./inspect.js";
export { Node } from "./node.js";
export { View, App, withHostProvides, inheritedCursor, onDiscard, deferralStats, deferralProblems } from "./view.js";
export { Island, DOMIsland, linkIslandTenant, islandProvisions } from "./island.js";
export { Text } from "./text.js";
export { Image } from "./image.js";
export { TextInput } from "./text-input.js";
export { Layout } from "./layout.js";
export { Dataset, DataSource, toCursor, provideTransport, setAppDataBase } from "./data.js";
export { provideAssetBase, setAppAssetBase } from "./asset-base.js";
export { Video } from "./video.js";
export { Audio } from "./audio.js";
export { Media } from "./media.js";
// The stream SEAM only — the Stream/EventStream/Socket classes are reachable
// through registry.js alone, so slimming can drop them (stream-seam.ts).
export { provideStreams } from "./stream-seam.js";
export { Tooltips } from "./tooltips.js";
export { Animator } from "./animator.js";
export { AnimatorGroup } from "./animator-group.js";
export { settle, afterSettle, observe, kernelReady, kernelReadySync, kernelLoaded, kernelStats } from "./reactive.js";
export { inspect, find, explain, stats, clock, bridgeFor } from "./inspect.js";
export { Draw, record, replay } from "./draw.js";
export { Font, FontFace, fontsReady, setFontHost, FONT_WEIGHTS } from "./font.js";
export { fontString, textWidth, fontMetrics, provideMeasurer } from "./measure.js";
export { measureText } from "./text-measure.js";
export { validatePathData } from "./shape.js";
export { DomBackend } from "./dom-backend.js";
export { onIslandSlot } from "./backend.js";
export { CanvasBackend } from "./canvas-backend.js";
export { HeadlessBackend } from "./headless-backend.js";
export { SCHEMAS, attrType, descendsFrom } from "./schema.js";
export { coerce, enumType, isPercent, colorToCss, colorWithAlpha, isGradient, gradient, stroke, outline, shadow, stop } from "./value.js";
export { isSet, ownerOf } from "./attributes.js";
export { CSS_COLORS } from "./css-colors.js";
export { DeclareError, DeclareErrors } from "./errors.js";
export { headingSlug } from "./slug.js";
export { Keys, KeysService, normalize } from "./keys.js";
export { Focus, FocusService, deliverKeys } from "./focus.js";
// The runtime services usable INSIDE `{ }` bodies (`Focus.focus(this)` in a
// click handler) are injected by services.js — a side-effect-only module, split
// out so the PRODUCTION entry can carry the wiring without importing this
// barrel. Re-exports are only droppable when the module behind them is
// side-effect-free, and most of this runtime is not, so importing index.js for
// these lines pinned modules a program could not reach (see services.ts).
import "./services.js";
export { THEME_PRESETS, THEME_PRESET_NAMES, activeTone } from "./themes.js";
//# sourceMappingURL=index.js.map