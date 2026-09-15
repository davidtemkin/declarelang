// `d.drawImage(imageView, …)` — the recording's image handles and the bitmaps
// they resolve to (graphics-pass.md §7a). Its own file so a production build
// carries it only for a program that calls drawImage (declarec's slim-draw-image).

import type { DisplayList, DrawImageSource, DrawOp } from "./draw.js";

/** handle → bitmap, wherever a recording is replayed: the loaded element on
 *  the page (registered by the recorder), an ImageBitmap in the raster worker
 *  (registered by its `image` message). */
const imageStore = new Map<number, CanvasImageSource>();
let nextImageHandle = 1;
/** The handle a loaded element travels under. The Mac env's element already
 *  carries the bridge's `__handle`, which is exactly what its replay resolves;
 *  a web element gets a registry id once and keeps it. */
function imageHandleOf(el: object): number {
  const o = el as { __handle?: number; __drawHandle?: number };
  if (typeof o.__handle === "number") return o.__handle;
  if (typeof o.__drawHandle !== "number") o.__drawHandle = nextImageHandle++;
  return o.__drawHandle;
}
export function registerDrawImage(h: number, bitmap: CanvasImageSource): void { imageStore.set(h, bitmap); }
export function drawImageBitmap(h: number): CanvasImageSource | undefined { return imageStore.get(h); }
/** The image handles a recording references — what a raster worker must hold
 *  before it can replay the list. */
export function drawImageHandles(list: DisplayList): number[] {
  const out: number[] = [];
  for (const o of list.ops) if (o.op === "drawImage" && !out.includes(o.h)) out.push(o.h);
  return out;
}

/** The op for Canvas2D's three shapes — (img, dx, dy), (img, dx, dy, dw, dh),
 *  and (img, sx, sy, sw, sh, dx, dy, dw, dh) — over an `Image` view, or null for
 *  an image that has not loaded (the read of `loaded` is the dependency that
 *  re-runs the body when it does). */
export function drawImageOp(image: DrawImageSource, a: number[]): Extract<DrawOp, { op: "drawImage" }> | null {
  if (!image.loaded || image.bitmap === null || typeof image.bitmap !== "object") return null;
  const nw = image.naturalWidth, nh = image.naturalHeight;
  let sx = 0, sy = 0, sw = nw, sh = nh, dx: number, dy: number, dw: number, dh: number;
  if (a.length >= 8) { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
  else if (a.length >= 4) { [dx, dy, dw, dh] = a; }
  else { dx = a[0] ?? 0; dy = a[1] ?? 0; dw = nw; dh = nh; }
  const h = imageHandleOf(image.bitmap);
  imageStore.set(h, image.bitmap as CanvasImageSource);
  return { op: "drawImage", h, sx, sy, sw, sh, dx, dy, dw, dh };
}
