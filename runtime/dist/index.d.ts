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
}
/** Parse, resolve `include`s, typecheck, and instantiate a Declare source into
 *  its App tree (no rendering). Raises a NeoErrors carrying *every* error at
 *  once (include-resolution + type). */
export declare function build(source: string, opts?: BuildOptions): App;
/** Parse, resolve includes, check, instantiate, and render a Declare source
 *  into `host` via `backend`. */
export declare function render(source: string, host: HTMLElement, backend: RenderBackend, opts?: BuildOptions): App;
/** Tear down an embedded app's stage wiring (ResizeObserver + pointer listeners).
 *  Its rendered DOM is removed by the caller (clearing the island box); its input
 *  router self-retires once the root element is disconnected. A no-op for a
 *  top-level app. */
export declare function disposeApp(app: App): void;
/** Like render(), but first loads the web faces of the program's own `font`
 *  declarations (those with a URL/woff2 source), so first paint measures
 *  against the real metrics. The declarative counterpart to a manual
 *  loadFonts(): the app names its fonts (`font Title [ bold = "…" ]`), the
 *  runtime loads them. A source with only `system` fonts awaits nothing. */
export declare function renderAsync(source: string, host: HTMLElement, backend: RenderBackend, opts?: BuildOptions): Promise<App>;
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
 *  on it — `await loadFonts(specs); render(…)` — so text measures against the
 *  real metrics, not a fallback that reflows on arrival. A no-op off the DOM
 *  (Node/tests), so it stays safe in the zero-dependency graph. */
export declare function loadFonts(fonts: readonly FontSpec[]): Promise<void>;
export { parse, parseProgram, parseLibrary } from "./parser.js";
export { resolveIncludes, NO_INCLUDES } from "./include.js";
export type { IncludeHost } from "./include.js";
export { check, checkAttr, checkMethod, checkDecl, checkComponentValue, programSchemas } from "./check.js";
export { instantiate } from "./instantiate.js";
export { Node } from "./node.js";
export { View, App, Html, inheritedCursor, onDiscard } from "./view.js";
export { Text } from "./text.js";
export { Image } from "./image.js";
export { TextInput } from "./text-input.js";
export { Layout, SimpleLayout } from "./layout.js";
export { Dataset, DataSource, toCursor } from "./data.js";
export { Animator, AnimatorGroup } from "./animator.js";
export type { Cursor } from "./data.js";
export { settle } from "./reactive.js";
export { Draw, record, replay } from "./draw.js";
export { buildFonts, collectFaces, fontFacesOf, FONT_WEIGHTS } from "./font.js";
export type { Font, FontFaceSpec } from "./font.js";
export { fontString, textWidth, fontMetrics } from "./measure.js";
export { validatePathData } from "./shape.js";
export { DomBackend } from "./dom-backend.js";
export { CanvasBackend } from "./canvas-backend.js";
export { SCHEMAS, attrType, descendsFrom, isPrevailing } from "./schema.js";
export { coerce, enumType, isPercent, colorToCss, colorWithAlpha, isGradient, gradient, stroke, shadow, stop, DEFAULT_THEME } from "./value.js";
export { isSet, ownerOf } from "./attributes.js";
export { CSS_COLORS } from "./css-colors.js";
export { NeoError, NeoErrors } from "./errors.js";
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
