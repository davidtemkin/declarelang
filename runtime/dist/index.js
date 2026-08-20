// Declare runtime — public surface for R0–R8.
//
// The pipeline: parse the source (classes + root) → typecheck it against the
// component schemas (reporting every error, not just the first) → instantiate
// a Node/View tree → attach it to a render backend → root it on the page.
// `build` stops before rendering (used by tools and tests); `render` runs
// the whole pipeline. `check` alone is the compiler-facing pass.
//
// This module graph is ZERO-dependency and browser-loadable by design. The
// bare-name scope resolution of R6 needs the TypeScript parser, so it lives
// in the separate compile layer (`dist/compile.js`, Node-side): run a source
// through compile() first for full diagnostics and the resolved program;
// build()/render() consume that output (or any source whose bodies use only
// explicit paths). An unresolved bare name that reaches the runtime fails
// loudly at its binding's first evaluation (a ReferenceError naming it).
import { parseProgram } from "./parser.js";
import { check } from "./check.js";
import { instantiate } from "./instantiate.js";
import { applyDeps } from "./deps.js";
import { applyLinks } from "./links.js";
import { Diag } from "./diagnostics.js";
import { resolveIncludesHostless, NO_INCLUDES } from "./include.js";
import { App } from "./view.js";
import { fontFacesOf } from "./font.js";
import { DeclareError, DeclareErrors } from "./errors.js";
// The render/wire/font glue lives in boot.ts (compiler-free) so the precompiled
// production entry (`renderProgram`) can drop the parser + checker entirely.
import { mountApp, loadFonts } from "./boot.js";
import { setAppAssetBase } from "./asset-base.js";
/** Parse, resolve `include`s, typecheck, and instantiate a Declare source into
 *  its App tree (no rendering). Raises a DeclareErrors carrying *every* error at
 *  once (include-resolution + type). */
export function build(source, opts = {}) {
    const parsed = parseProgram(source);
    // The runtime is HOSTLESS by construction: a compiled program arrives
    // self-contained, so there is nothing to fetch and build() stays synchronous.
    // Include resolution that actually READS files is a compile-time job, riding an
    // async seam (include.ts) precisely so a browser host can fetch.
    if (opts.host !== undefined && opts.host !== NO_INCLUDES) {
        throw new DeclareErrors([Diag.structure("build() resolves no includes — compile the source first (compile() folds every include into one self-contained program, which is what build() runs)")]);
    }
    const { program, errors: incErrors } = resolveIncludesHostless(parsed);
    const errors = [...incErrors, ...check(program)];
    errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
    if (errors.length > 0)
        throw new DeclareErrors(errors);
    if (opts.deps !== undefined)
        applyDeps(program, opts.deps);
    if (opts.links !== undefined)
        applyLinks(program, opts.links);
    const root = instantiate(program);
    if (!(root instanceof App)) {
        throw new DeclareError("a program's root must be 'App [ … ]'", program.root.pos);
    }
    return root;
}
/** Parse, resolve includes, check, instantiate, and render a Declare source
 *  into `host` via `backend`. */
export function render(source, host, backend, opts = {}) {
    return mountApp(build(source, opts), host, backend);
}
// NOTE: `pageWeight` (production over-the-wire KB, gzipped) and `sourceLines`
// are set by the HOST/build, not measured from the dev page — a dev page loads
// unbundled ES modules and would read ~10× the shipping size. The build that
// produces the shipping bundle knows the real figure and provides it.
/** Like render(), but first loads the web faces of the program's own `font`
 *  declarations (those with a URL/woff2 source), so first paint measures
 *  against the real metrics. The declarative counterpart to a manual
 *  loadFonts(): the app names its fonts (`font Title [ bold = "…" ]`), the
 *  runtime loads them. A source with only `system` fonts awaits nothing.
 *
 *  `opts.assetBase` states THIS app's own directory, which an embedded child
 *  needs: its relative faces and bitmaps live beside its program, while the
 *  document they render into belongs to the host page (asset-base.ts). */
export async function renderAsync(source, host, backend, opts = {}) {
    const app = build(source, opts);
    if (opts.assetBase != null) {
        setAppAssetBase(app, opts.assetBase);
        // DELIBERATELY no per-app DATA base here: an island child's relative data
        // urls resolve through the PAGE's transport — its host's space — which is
        // what island contracts actually speak (the desktop passes the viewer
        // `program=desktop.declare`, a path in the DESKTOP's directory; the mac
        // runner resolves children the same way). Coupling the child's data base
        // to its asset base 404'd every such contract (found live: the viewer in
        // a desktop window lost all three panes). The sibling rule holds for
        // BOOTED apps — bootHost registers their data base — not for tenants.
    }
    await loadFonts(fontFacesOf(app), opts.assetBase);
    return mountApp(app, host, backend);
}
export { parse, parseProgram, parseLibrary } from "./parser.js";
export { resolveIncludes, NO_INCLUDES } from "./include.js";
export { check, checkAttr, checkMethod, checkComponentValue } from "./check.js";
export { checkDecl, programSchemas } from "./program-schema.js";
export { hydrateProgram } from "./hydrate.js";
export { instantiate } from "./instantiate.js";
export { forEachCodeValue, serializeDeps, applyDeps } from "./deps.js";
export { forEachElement, serializeLinks, applyLinks } from "./links.js";
// Precompiled production entry + render glue (compiler-free) — see boot.ts.
export { renderProgram, renderProgramAsync, mountApp, mountEmbeddedApp, disposeApp, loadFonts, reflectAppName, isEmbedded, provideHostServices } from "./boot.js";
export { Inspect, setInspectionTarget, inspectionTarget } from "./inspect-service.js";
export { pickAt, dependentsOf, expandValue, slotsOf } from "./inspect.js";
export { Node } from "./node.js";
export { View, App, Island, DOMIsland, linkIslandTenant, inheritedCursor, onDiscard } from "./view.js";
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
export { Tip } from "./tip.js";
export { Animator, AnimatorGroup } from "./animator.js";
export { settle, afterSettle, observe } from "./reactive.js";
export { inspect, find, explain, stats, clock, bridgeFor } from "./inspect.js";
export { Draw, record, replay } from "./draw.js";
export { buildFonts, collectFaces, fontFacesOf, FONT_WEIGHTS } from "./font.js";
export { fontString, textWidth, fontMetrics, provideMeasurer } from "./measure.js";
export { validatePathData } from "./shape.js";
export { DomBackend } from "./dom-backend.js";
export { onIslandSlot } from "./backend.js";
export { CanvasBackend } from "./canvas-backend.js";
export { HeadlessBackend } from "./headless-backend.js";
export { SCHEMAS, attrType, descendsFrom, isPrevailing } from "./schema.js";
export { coerce, enumType, isPercent, colorToCss, colorWithAlpha, isGradient, gradient, stroke, shadow, stop, DEFAULT_THEME } from "./value.js";
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
export { Themes } from "./themes.js";
//# sourceMappingURL=index.js.map