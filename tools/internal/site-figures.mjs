// tools/internal/site-figures.mjs — the calendar's production build, block by
// block, for the Architecture page's Fig. 4 and the figures its prose quotes.
//
// prewarm (--stats-only) calls calendarParts() and writes the result into
// apps/homepage/stats.json as `calendarParts`; stamp-stats carries it into
// apps/architecture/parts/figures.declare, which the page reads. Nothing on the
// page is typed by hand: a figure that was (the runtime "~79 KB" when it was 124)
// is the reason this exists.
//
// HOW A BLOCK IS WEIGHED. declarec's sizes report gzips each runtime module
// alone; those sums run about 1% over the bundle's runtime part (gzip shares
// context across modules), so each block is its modules' sum scaled to that
// part. The program part (app + library) splits by the files its classes came
// from; the kernel block is the wasm part plus its loader. The Mac host loads a
// platform bundle rather than a per-app build, so its column is the DOM column
// with the DOM backend (and the DOM's accessibility mirror) exchanged for the
// Mac backend, minified and gzipped alone and scaled as the DOM backend so
// measured is to its attributed figure, and no kernel: it is linked natively.

import path from "node:path";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { buildProduction } from "../declarec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// module → block; a module named nowhere here is the reactive core's
const BLOCKS = {
  view:   ["view", "visibility"],
  input:  ["focus", "keys", "input", "interaction", "scroll-physics", "drag-autoscroll", "hit-walk", "scroll-anchor",
           "scroll-places", "select", "edit-selection", "text-input", "editor", "pointer-dispatch", "viewport-lock",
           "outside", "tooltips"],
  draw:   ["draw", "boxpaint", "filter-wasm", "canvas-filter", "filter-css", "shape-resolve", "stroke-sides", "draw-text",
           "draw-image", "scene-walk", "projective", "affine", "raster-client", "path-plan", "dom-effects", "dpr",
           "deferred-surface"],
  anim:   ["spring", "animate", "animator", "easing", "time", "wallclock", "animator-group", "tween"],
  text:   ["text", "measure", "text-clamp", "font-value", "font-features", "font-derive", "text-measure", "face-table"],
  boot:   ["boot", "browser/host-client", "browser/boot-page", "backend", "boot-deferrals", "host-api", "hydrate",
           "browser/inspector-boot", "browser/host-islands", "browser/compiler-client", "browser/live-edit", "stand-in"],
  layout: ["layout"],
  themes: ["themes-data", "themes"],
  a11y:   ["semantics-dom", "semantics", "accessibility-service", "a11y-roles"],
  ker:    ["kernel-loader", "kernel-js"],
  backend: ["dom-backend", "dom-visibility", "canvas-backend"],
};
const ORDER = ["app", "lib", "core", "view", "backend", "input", "draw", "anim", "text", "boot", "layout", "themes", "a11y", "ker"];
const blockOf = (m) => Object.keys(BLOCKS).find((b) => BLOCKS[b].includes(m)) ?? "core";
const kb1 = (bytes) => Math.round(bytes / 1024 * 10) / 10;

async function measure(src, originDir, render) {
  const built = await buildProduction(src, { name: "calendar", originDir, render, sizes: true });
  if (!built.ok) throw new Error(`site-figures: the calendar's ${render} build failed\n${built.report}`);
  const r = built.sizesReport;
  const mods = r.modules.filter((m) => (m.status === "core" || m.status === "aboard") && m.gzip);
  const raw = Object.fromEntries(ORDER.map((b) => [b, 0]));
  for (const m of mods) raw[blockOf(m.module)] += m.gzip;
  const runtimeBlocks = ORDER.filter((b) => b !== "app" && b !== "lib");
  const alone = runtimeBlocks.reduce((s, b) => s + raw[b], 0);
  const scale = r.parts.runtime.gzip / alone;
  const bytes = Object.fromEntries(runtimeBlocks.map((b) => [b, raw[b] * scale]));
  bytes.ker += r.parts.kernel.gzip;
  bytes.boot += r.parts.page?.gzip ?? 0;
  const lib = r.files.filter((f) => f.file.startsWith("library/")).reduce((s, f) => s + f.gzip, 0);
  const all = r.files.reduce((s, f) => s + f.gzip, 0);
  bytes.app = r.parts.program.gzip * (all - lib) / all;
  bytes.lib = r.parts.program.gzip * lib / all;
  const mod = (name) => (mods.find((m) => m.module === name)?.gzip ?? 0) * scale;
  return { bytes, total: r.total.gzip, mod, kernelPart: r.parts.kernel };
}

/** Minified and gzipped alone — how the Mac backend is weighed, and the DOM
 *  backend beside it for the scale. */
async function alone(rel) {
  const { build } = await import("esbuild");
  const out = await build({ entryPoints: [path.join(ROOT, rel)], bundle: false, minify: true, format: "esm", write: false, logLevel: "error" });
  return gzipSync(out.outputFiles[0].contents).length;
}

export async function calendarParts(src, originDir) {
  const dom = await measure(src, originDir, "dom");
  const canvas = await measure(src, originDir, "canvas");
  const domBackend = dom.mod("dom-backend");
  const macBackend = (await alone("runtime/dist/mac-backend.js")) * domBackend / (await alone("runtime/dist/dom-backend.js"));
  const mac = { ...dom.bytes, backend: macBackend, a11y: dom.bytes.a11y - dom.mod("semantics-dom"), ker: 0 };
  const round = (b) => Object.fromEntries(ORDER.map((k) => [k, kb1(b[k])]));
  const sum = (b) => kb1(ORDER.reduce((s, k) => s + b[k], 0));
  const runtimeOnly = (b) => kb1(ORDER.filter((k) => !["app", "lib", "ker"].includes(k)).reduce((s, k) => s + b[k], 0));
  // the wasm rides in the bundle as base64: its raw size is three quarters of that
  const wasmRaw = dom.kernelPart.raw * 3 / 4;
  return {
    calDom: round(dom.bytes), calCanvas: round(canvas.bytes), calMac: round(mac),
    totals: { calDom: kb1(dom.total), calCanvas: kb1(canvas.total), calMac: sum(mac) },
    runtimeKB: runtimeOnly(dom.bytes),
    kernelWasmGzipKB: kb1(dom.kernelPart.gzip),
    kernelWasmRawKB: Math.round(wasmRaw / 1024),
    kernelLoaderKB: kb1(dom.mod("kernel-loader")),
    canvasCarriesDomBackendKB: kb1(canvas.mod("dom-backend")),
  };
}
