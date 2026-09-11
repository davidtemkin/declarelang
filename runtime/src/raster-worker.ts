// raster-worker — the canvas backend's RASTER WORKER (adaptive-draw-cache.md
// §3.1, "the worker raster", built 2026-09-10).
//
// The mac bridge pattern, in-process: the main thread keeps the scene model,
// input, the scroll loop, hit-testing and compositing; THIS worker owns an
// OffscreenCanvas and turns display lists into bitmaps. A recording is plain
// data by construction (draw.ts: "every op is structured-cloneable"), so it
// crosses as-is; the pixels come back as a transferable ImageBitmap — zero
// copy. Rasterization thereby becomes ASYNCHRONOUS on canvas: a view whose
// recording changed shows its previous bitmap (or vectors) for the frame or
// two the raster takes, exactly as a browser's own async raster behaves —
// which is what keeps a flick smooth under a 30 ms settle: the flick is a
// translate of bitmaps that already exist.
//
// Fonts: text ops raster HERE, so the worker must see the same faces the page
// loaded (boot.ts loadFonts → `fonts` message; system fonts need nothing).
// Filters: draw.ts's fallback path makes scratch canvases through
// `makeCanvas`, which is an OffscreenCanvas off the DOM.
//
// Protocol (raster-client.ts is the other half):
//   → { t: "fonts", faces: [{ family, src, weight, style }] }
//   → { t: "raster", id, list, sx, sy, bx, by, w, h, blankCheck }
//   ← { t: "raster", id, bitmap, rasterMs, blank }      (bitmap transferred)
//   ← { t: "error", id, message }

import { replay, rasterLooksBlank, type DisplayList } from "./draw.js";

interface FaceMsg { family: string; src: string; weight: string; style: string }
interface RasterMsg {
  t: "raster"; id: number; list: DisplayList; sx: number; sy: number; bx: number; by: number;
  w: number; h: number; blankCheck: boolean;
}
type InMsg = { t: "fonts"; faces: FaceMsg[] } | RasterMsg;

const scope = self as unknown as {
  fonts?: { add(f: FontFace): void };
  postMessage(m: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<InMsg>) => void) | null;
};

/** Faces still loading — a raster with text waits for them (a raster made
 *  before its face arrived would bake the fallback face into the memo). */
let fontsReady: Promise<void> = Promise.resolve();

function loadFaces(faces: FaceMsg[]): void {
  if (typeof FontFace === "undefined" || scope.fonts === undefined) return;
  const pending = faces.map(async (f) => {
    try {
      const face = new FontFace(f.family, f.src, { weight: f.weight, style: f.style });
      await face.load();
      scope.fonts!.add(face);
    } catch {
      // the page already reported the face; here it simply falls back
    }
  });
  const prior = fontsReady;
  fontsReady = Promise.all([prior, ...pending]).then(() => undefined);
}

function hasText(list: DisplayList): boolean {
  for (const o of list.ops) if (o.op === "fillText" || o.op === "strokeText") return true;
  return false;
}

async function raster(m: RasterMsg): Promise<void> {
  try {
    if (hasText(m.list)) await fontsReady;
    const t0 = performance.now();
    const cv = new OffscreenCanvas(m.w, m.h);
    const c2 = cv.getContext("2d");
    if (c2 === null) throw new Error("no 2d context");
    c2.setTransform(m.sx, 0, 0, m.sy, -m.bx * m.sx, -m.by * m.sy);
    replay(c2 as unknown as CanvasRenderingContext2D, m.list);   // the WHOLE recording — a memo must not depend on the viewport
    const rasterMs = performance.now() - t0;
    const blank = m.blankCheck && rasterLooksBlank(cv, m.list, m.sx, m.sy, m.bx, m.by);
    const bitmap = cv.transferToImageBitmap();
    scope.postMessage({ t: "raster", id: m.id, bitmap, rasterMs, blank }, [bitmap]);
  } catch (err) {
    scope.postMessage({ t: "error", id: m.id, message: String(err) });
  }
}

scope.onmessage = (e: MessageEvent<InMsg>): void => {
  const m = e.data;
  if (m.t === "fonts") loadFaces(m.faces);
  else if (m.t === "raster") void raster(m);
};
