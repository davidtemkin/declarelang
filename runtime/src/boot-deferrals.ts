// boot-deferrals — work that does not have to precede FIRST PAINT, moved after
// it. Found in the boot profile of the desktop (2026-09-18, Chrome, 133 ms
// render stage): the compiled dependency probes (a `new Function` per distinct
// read path, only to touch the reads for wiring). The development build's
// blank-raster readbacks were deferred here too, until they were removed
// (2026-10-29: a readback is a GPU sync, and in Chrome it can move a canvas off
// the GPU, so development drew differently from production). Deferring the
// canvas-filter capability probe was tried and reverted: the fallback it chose
// meanwhile cost far more than the probe (canvas-filter.ts). A deferral is
// switchable OFF for an A/B in a profiling build:
//   globalThis.__declareNoBootDeferral = true            (all off)
//   globalThis.__declareNoBootDeferral = "probe"         (named ones off)
// A shipped build folds the switch out and keeps the deferrals.
type Kind = "probe";

export function deferral(kind: Kind): boolean {
  if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) {
    const off = (globalThis as { __declareNoBootDeferral?: boolean | string }).__declareNoBootDeferral;
    if (off === true) return false;
    if (typeof off === "string" && off.split(",").map((s) => s.trim()).includes(kind)) return false;
  }
  return true;
}

/** Has the page painted its first frame after the first mount? Before that,
 *  deferrable work waits. A host with no document (a worker, node) has no
 *  frames to wait for, so it counts as painted. */
export let firstFramePainted = typeof document === "undefined";
const queue: Array<() => void> = [];

/** Run `fn` after the first frame (now, if it has painted). */
export function afterFirstFrame(fn: () => void): void {
  if (firstFramePainted) { fn(); return; }
  queue.push(fn);
}

/** Called once by the first mount: two animation frames on, the first frame is
 *  committed and the deferred work runs — in one idle-ish slot, in order. */
export function armFirstFrame(): void {
  if (firstFramePainted || typeof requestAnimationFrame !== "function") { drain(); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => { drain(); }));
}
function drain(): void {
  firstFramePainted = true;
  const q = queue.splice(0);
  for (const fn of q) { try { fn(); } catch (e) { console.error("[Declare] deferred boot work failed:", e); } }
}
