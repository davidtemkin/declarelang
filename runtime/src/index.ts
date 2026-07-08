// neo-LZX runtime — public surface for R0–R8.
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
import { resolveIncludes, NO_INCLUDES, type IncludeHost } from "./include.js";
import { App } from "./view.js";
import { fontFacesOf } from "./font.js";
import type { RenderBackend } from "./backend.js";
import { NeoError, NeoErrors } from "./errors.js";
import { Keys } from "./keys.js";
import { Focus, deliverKeys } from "./focus.js";

/** Options for build()/render(): the file-access host `include` resolution
 *  rides and the including file's directory. Both default to a no-op — a
 *  source with zero `include`s behaves exactly as before, and the fs host
 *  stays out of this zero-dependency graph (it is injected by the Node-side
 *  entry, include-node.ts). */
export interface BuildOptions {
  host?: IncludeHost;
  originDir?: string;
}

/** Parse, resolve `include`s, typecheck, and instantiate a neo-LZX source into
 *  its App tree (no rendering). Raises a NeoErrors carrying *every* error at
 *  once (include-resolution + type). */
export function build(source: string, opts: BuildOptions = {}): App {
  const parsed = parseProgram(source);
  const { program, errors: incErrors } = resolveIncludes(parsed, opts.host ?? NO_INCLUDES, opts.originDir ?? "");
  const errors = [...incErrors, ...check(program)];
  errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
  if (errors.length > 0) throw new NeoErrors(errors);
  const root = instantiate(program);
  if (!(root instanceof App)) {
    throw new NeoError("a program's root must be 'App [ … ]'", program.root.pos);
  }
  return root;
}

/** Parse, resolve includes, check, instantiate, and render a neo-LZX source
 *  into `host` via `backend`. */
export function render(source: string, host: HTMLElement, backend: RenderBackend, opts: BuildOptions = {}): App {
  const app = build(source, opts);
  app.attach(backend, null);
  backend.attachRoot(host, app.surface!);
  wireInput(app);
  return app;
}

/** Wire the runtime input services to a freshly-rooted app: the focus tree root
 *  (for Tab from nothing focused), the keyboard adapter (self-retiring once the
 *  app's surface is gone), and Keys→Focus delivery. Single-root by design — the
 *  runtime hosts one App per page. */
function wireInput(app: App): void {
  Focus.setRoot(app);
  Keys.listen(() => app.surface !== null);
  deliverKeys(Keys, Focus);
}

/** Like render(), but first loads the web faces of the program's own `font`
 *  declarations (those with a URL/woff2 source), so first paint measures
 *  against the real metrics. The declarative counterpart to a manual
 *  loadFonts(): the app names its fonts (`font Title [ bold = "…" ]`), the
 *  runtime loads them. A source with only `system` fonts awaits nothing. */
export async function renderAsync(source: string, host: HTMLElement, backend: RenderBackend, opts: BuildOptions = {}): Promise<App> {
  const app = build(source, opts);
  await loadFonts(fontFacesOf(app));
  app.attach(backend, null);
  backend.attachRoot(host, app.surface!);
  wireInput(app);
  return app;
}

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
export async function loadFonts(fonts: readonly FontSpec[]): Promise<void> {
  if (typeof FontFace === "undefined" || typeof document === "undefined") return;
  await Promise.all(
    fonts.map(async (f) => {
      // f.src is a full CSS src value — `url("…")`, `local("…")`, or a chain.
      const face = new FontFace(f.family, f.src, {
        weight: String(f.weight ?? "normal"),
        style: f.style ?? "normal",
      });
      await face.load();
      // FontFaceSet is Set-like at runtime; the configured DOM lib omits `add`.
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
    }),
  );
}

export { parse, parseProgram, parseLibrary } from "./parser.js";
export { resolveIncludes, NO_INCLUDES } from "./include.js";
export type { IncludeHost } from "./include.js";
export { check, checkAttr, checkMethod, checkDecl, checkComponentValue, programSchemas } from "./check.js";
export { instantiate } from "./instantiate.js";
export { Node } from "./node.js";
export { View, App, inheritedCursor, onDiscard } from "./view.js";
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
