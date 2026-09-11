// raster-client — the main-thread half of the raster worker (raster-worker.ts
// has the protocol). One worker per page, spawned lazily on the first
// promotion that can use it, and DENIABLE end to end: no Worker or
// OffscreenCanvas on this engine (a Node rung, an old Safari) → `available()`
// is false and the canvas backend rasters synchronously on the main thread as
// it always did. A worker that fails to construct or errors out retires
// itself the same way — a miss is never wrong, only slow.
//
// The worker file rides ALONGSIDE this module: `raster-worker.js` next to
// `raster-client.js` in runtime/dist for the unbundled dev pages, and
// bundles/declare-raster-worker.js next to bundles/declare-boot.js for the
// bundled boot (build-boot.mjs emits it; the same `new URL(…, import.meta.url)`
// shape the compile worker uses).

import type { DisplayList } from "./draw.js";
import { onFontsLoaded, loadedFontFaces } from "./font.js";

export interface RasterRequest {
  list: DisplayList; sx: number; sy: number; bx: number; by: number; w: number; h: number; blankCheck: boolean;
}
export interface RasterResult { bitmap: ImageBitmap; rasterMs: number; blank: boolean }

type Pending = { resolve: (r: RasterResult | null) => void };

let worker: Worker | null = null;
let dead = false;
let nextId = 1;
const pending = new Map<number, Pending>();

/** Can this engine raster off the main thread at all? */
export function rasterWorkerAvailable(): boolean {
  if (dead) return false;
  if ((globalThis as { __declareNoRasterWorker?: boolean }).__declareNoRasterWorker === true) return false;
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof ImageBitmap !== "undefined"
    && typeof document !== "undefined";
}

function spawn(): Worker | null {
  if (worker !== null || dead) return worker;
  try {
    const url = new URL(
      (import.meta.url.includes("/bundles/") ? "declare-raster-worker.js" : "raster-worker.js"),
      import.meta.url);
    const w = new Worker(url, { type: "module" });
    w.onmessage = (e: MessageEvent<{ t: string; id: number; bitmap?: ImageBitmap; rasterMs?: number; blank?: boolean; message?: string }>) => {
      const m = e.data;
      const p = pending.get(m.id);
      if (p === undefined) { m.bitmap?.close(); return; }
      pending.delete(m.id);
      if (m.t === "raster" && m.bitmap !== undefined) p.resolve({ bitmap: m.bitmap, rasterMs: m.rasterMs ?? 0, blank: m.blank === true });
      else p.resolve(null);
    };
    w.onerror = () => { retire(); };
    // the faces the page has loaded so far, and every one it loads later
    w.postMessage({ t: "fonts", faces: loadedFontFaces() });
    onFontsLoaded((faces) => { worker?.postMessage({ t: "fonts", faces }); });
    worker = w;
    return w;
  } catch {
    dead = true;
    return null;
  }
}

function retire(): void {
  dead = true;
  const w = worker;
  worker = null;
  for (const p of pending.values()) p.resolve(null);
  pending.clear();
  try { w?.terminate(); } catch { /* gone */ }
}

/** Raster a recording off the main thread. Resolves null when the worker
 *  could not (the caller falls back to vectors or a synchronous raster). */
export function rasterInWorker(req: RasterRequest): Promise<RasterResult | null> {
  const w = spawn();
  if (w === null) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    try {
      w.postMessage({ t: "raster", id, ...req });
    } catch (err) {
      // a list that cannot be cloned (it should not exist — recordings are
      // plain data by construction) falls back rather than failing the frame
      pending.delete(id);
      (globalThis as { __declareRasterErr?: string }).__declareRasterErr = String(err);
      resolve(null);
    }
  });
}

/** @internal diag: how many rasters are in flight */
export function rasterWorkerPending(): number { return pending.size; }
