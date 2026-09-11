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
import { replay, rasterLooksBlank } from "./draw.js";
const scope = self;
/** Faces still loading — a raster with text waits for them (a raster made
 *  before its face arrived would bake the fallback face into the memo). */
let fontsReady = Promise.resolve();
function loadFaces(faces) {
    if (typeof FontFace === "undefined" || scope.fonts === undefined)
        return;
    const pending = faces.map(async (f) => {
        try {
            const face = new FontFace(f.family, f.src, { weight: f.weight, style: f.style });
            await face.load();
            scope.fonts.add(face);
        }
        catch {
            // the page already reported the face; here it simply falls back
        }
    });
    const prior = fontsReady;
    fontsReady = Promise.all([prior, ...pending]).then(() => undefined);
}
function hasText(list) {
    for (const o of list.ops)
        if (o.op === "fillText" || o.op === "strokeText")
            return true;
    return false;
}
async function raster(m) {
    try {
        if (hasText(m.list))
            await fontsReady;
        const t0 = performance.now();
        const cv = new OffscreenCanvas(m.w, m.h);
        const c2 = cv.getContext("2d");
        if (c2 === null)
            throw new Error("no 2d context");
        c2.setTransform(m.sx, 0, 0, m.sy, -m.bx * m.sx, -m.by * m.sy);
        replay(c2, m.list); // the WHOLE recording — a memo must not depend on the viewport
        const rasterMs = performance.now() - t0;
        const blank = m.blankCheck && rasterLooksBlank(cv, m.list, m.sx, m.sy, m.bx, m.by);
        const bitmap = cv.transferToImageBitmap();
        scope.postMessage({ t: "raster", id: m.id, bitmap, rasterMs, blank }, [bitmap]);
    }
    catch (err) {
        scope.postMessage({ t: "error", id: m.id, message: String(err) });
    }
}
scope.onmessage = (e) => {
    const m = e.data;
    if (m.t === "fonts")
        loadFaces(m.faces);
    else if (m.t === "raster")
        void raster(m);
};
//# sourceMappingURL=raster-worker.js.map