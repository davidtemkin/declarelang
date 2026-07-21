import { type SerializedLink } from "./links.js";
import { type IncludeHost } from "./include.js";
import { App } from "./view.js";
import type { RenderBackend } from "./backend.js";
/** Options for build()/render(): the file-access host `include` resolution
 *  rides and the including file's directory. Both default to a no-op — a
 *  source with zero `include`s behaves exactly as before, and the fs host
 *  stays out of this zero-dependency graph (it is injected by the Node-side
 *  entry, include-node.ts). */
export interface BuildOptions {
    host?: IncludeHost;
    originDir?: string;
    /** The compiler's extracted constraint dependencies, in `forEachCodeValue`
     *  walk order (docs/system-design/constraints.md §5). Zipped onto the parsed program so
     *  its constraints boot on the static path. Absent → runtime-tracking. */
    deps?: readonly (readonly string[])[];
    /** The compiler's extracted navigation relation (capabilities.md §6), a
     *  sparse walk-order side-list. Zipped onto the parsed program (links.ts) so
     *  each navigable instance is stamped `_navLink` for the static extractor.
     *  Absent → no links (navigation still works; only extraction is affected). */
    links?: readonly SerializedLink[];
}
/** Parse, resolve `include`s, typecheck, and instantiate a Declare source into
 *  its App tree (no rendering). Raises a DeclareErrors carrying *every* error at
 *  once (include-resolution + type). */
export declare function build(source: string, opts?: BuildOptions): App;
/** Parse, resolve includes, check, instantiate, and render a Declare source
 *  into `host` via `backend`. */
export declare function render(source: string, host: HTMLElement, backend: RenderBackend, opts?: BuildOptions): App;
/** Like render(), but first loads the web faces of the program's own `font`
 *  declarations (those with a URL/woff2 source), so first paint measures
 *  against the real metrics. The declarative counterpart to a manual
 *  loadFonts(): the app names its fonts (`font Title [ bold = "…" ]`), the
 *  runtime loads them. A source with only `system` fonts awaits nothing. */
export declare function renderAsync(source: string, host: HTMLElement, backend: RenderBackend, opts?: BuildOptions): Promise<App>;
export { parse, parseProgram, parseLibrary } from "./parser.js";
export { resolveIncludes, NO_INCLUDES } from "./include.js";
export type { IncludeHost } from "./include.js";
export { check, checkAttr, checkMethod, checkDecl, checkComponentValue, programSchemas } from "./check.js";
export { instantiate } from "./instantiate.js";
export { forEachCodeValue, serializeDeps, applyDeps } from "./deps.js";
export { forEachElement, serializeLinks, applyLinks, type SerializedLink } from "./links.js";
export { renderProgram, renderProgramAsync, mountApp, disposeApp, loadFonts, reflectAppName } from "./boot.js";
export { Inspect, setInspectionTarget, inspectionTarget } from "./inspect-service.js";
export { viewAt, dependentsOf, expandValue, slotsOf } from "./inspect.js";
export type { FontSpec } from "./boot.js";
export { Node } from "./node.js";
export { View, App, DOMIsland, inheritedCursor, onDiscard } from "./view.js";
export { Text } from "./text.js";
export { Image } from "./image.js";
export { TextInput } from "./text-input.js";
export { Layout, SimpleLayout } from "./layout.js";
export { Dataset, DataSource, toCursor, provideTransport } from "./data.js";
export { Tip } from "./tip.js";
export { Animator, AnimatorGroup } from "./animator.js";
export type { Cursor } from "./data.js";
export { settle } from "./reactive.js";
export { inspect, find, explain, stats, clock, bridgeFor } from "./inspect.js";
export type { InspectNode, Provenance } from "./inspect.js";
export { Draw, record, replay } from "./draw.js";
export { buildFonts, collectFaces, fontFacesOf, FONT_WEIGHTS } from "./font.js";
export type { Font, FontFaceSpec } from "./font.js";
export { fontString, textWidth, fontMetrics, provideMeasurer } from "./measure.js";
export { validatePathData } from "./shape.js";
export { DomBackend } from "./dom-backend.js";
export { CanvasBackend } from "./canvas-backend.js";
export { HeadlessBackend } from "./headless-backend.js";
export { SCHEMAS, attrType, descendsFrom, isPrevailing } from "./schema.js";
export { coerce, enumType, isPercent, colorToCss, colorWithAlpha, isGradient, gradient, stroke, shadow, stop, DEFAULT_THEME } from "./value.js";
export { isSet, ownerOf } from "./attributes.js";
export { CSS_COLORS } from "./css-colors.js";
export { DeclareError, DeclareErrors } from "./errors.js";
export { headingSlug } from "./slug.js";
export { Keys, KeysService, normalize } from "./keys.js";
export type { KeyEvent } from "./keys.js";
export { Focus, FocusService, deliverKeys } from "./focus.js";
export type { RenderBackend, Surface, Stretch, PointerType, InputSink, EditableSpec } from "./backend.js";
export type { LayoutStrategy } from "./view.js";
export type { DrawOp, DisplayList, Bounds } from "./draw.js";
export type { FontWeight, TextStyle } from "./measure.js";
export type { ComponentSchema } from "./schema.js";
export type { ClassInfo } from "./check.js";
export type { Color, Length, Percent, AttrType, AttrValue, Coerced, Fill, Gradient, GradientStop, Stroke, Shadow, Theme } from "./value.js";
export type { Pos } from "./errors.js";
export type { Element, Attr, Method, Literal, AttrDecl, ClassDecl, Program, Library, IncludeRef } from "./parser.js";
export { Themes } from "./themes.js";
