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
import { resolveIncludes, NO_INCLUDES } from "./include.js";
import { App } from "./view.js";
import { fontFacesOf } from "./font.js";
import { NeoError, NeoErrors } from "./errors.js";
// The render/wire/font glue lives in boot.ts (compiler-free) so the precompiled
// production entry (`renderProgram`) can drop the parser + checker entirely.
import { mountApp, loadFonts } from "./boot.js";
/** Parse, resolve `include`s, typecheck, and instantiate a Declare source into
 *  its App tree (no rendering). Raises a NeoErrors carrying *every* error at
 *  once (include-resolution + type). */
export function build(source, opts = {}) {
    const parsed = parseProgram(source);
    const { program, errors: incErrors } = resolveIncludes(parsed, opts.host ?? NO_INCLUDES, opts.originDir ?? "");
    const errors = [...incErrors, ...check(program)];
    errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
    if (errors.length > 0)
        throw new NeoErrors(errors);
    if (opts.deps !== undefined)
        applyDeps(program, opts.deps);
    if (opts.links !== undefined)
        applyLinks(program, opts.links);
    const root = instantiate(program);
    if (!(root instanceof App)) {
        throw new NeoError("a program's root must be 'App [ … ]'", program.root.pos);
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
 *  runtime loads them. A source with only `system` fonts awaits nothing. */
export async function renderAsync(source, host, backend, opts = {}) {
    const app = build(source, opts);
    await loadFonts(fontFacesOf(app));
    return mountApp(app, host, backend);
}
export { parse, parseProgram, parseLibrary } from "./parser.js";
export { resolveIncludes, NO_INCLUDES } from "./include.js";
export { check, checkAttr, checkMethod, checkDecl, checkComponentValue, programSchemas } from "./check.js";
export { instantiate } from "./instantiate.js";
export { forEachCodeValue, serializeDeps, applyDeps } from "./deps.js";
export { forEachElement, serializeLinks, applyLinks } from "./links.js";
// Precompiled production entry + render glue (compiler-free) — see boot.ts.
export { renderProgram, renderProgramAsync, mountApp, disposeApp, loadFonts } from "./boot.js";
export { Node } from "./node.js";
export { View, App, Html, inheritedCursor, onDiscard } from "./view.js";
export { Text } from "./text.js";
export { Image } from "./image.js";
export { TextInput } from "./text-input.js";
export { Layout, SimpleLayout } from "./layout.js";
export { Dataset, DataSource, toCursor, provideTransport } from "./data.js";
export { Animator, AnimatorGroup } from "./animator.js";
export { settle } from "./reactive.js";
export { inspect, find, explain, stats, clock, bridgeFor } from "./inspect.js";
export { Draw, record, replay } from "./draw.js";
export { buildFonts, collectFaces, fontFacesOf, FONT_WEIGHTS } from "./font.js";
export { fontString, textWidth, fontMetrics, provideMeasurer } from "./measure.js";
export { validatePathData } from "./shape.js";
export { DomBackend } from "./dom-backend.js";
export { CanvasBackend } from "./canvas-backend.js";
export { HeadlessBackend } from "./headless-backend.js";
export { SCHEMAS, attrType, descendsFrom, isPrevailing } from "./schema.js";
export { coerce, enumType, isPercent, colorToCss, colorWithAlpha, isGradient, gradient, stroke, shadow, stop, DEFAULT_THEME } from "./value.js";
export { isSet, ownerOf } from "./attributes.js";
export { CSS_COLORS } from "./css-colors.js";
export { NeoError, NeoErrors } from "./errors.js";
export { headingSlug } from "./slug.js";
export { Keys, KeysService, normalize } from "./keys.js";
export { Focus, FocusService, deliverKeys } from "./focus.js";
// The runtime services usable INSIDE `{ }` bodies (`Focus.focus(this)` in a
// click handler): injected into body scope here — index.ts sits above both
// expr.ts and the services in the module graph, so no cycle.
import { setBodyServices } from "./expr.js";
import { Focus as FocusService_ } from "./focus.js";
import { Keys as KeysService_ } from "./keys.js";
setBodyServices({ Focus: FocusService_, Keys: KeysService_ });
//# sourceMappingURL=index.js.map