// visibility — the feed behind the three facts a view reports about being seen:
// `onScreen`, `visibleRect`, `apparentScale` (view.ts declares them). Armed at
// the FIRST tracked read of any of the three (AttrSpec.onTrack: facts nobody
// binds cost nothing), and by a drawing, whose resolution is the scale it is
// seen at; re-armed at attach so a bound view that re-attaches keeps its feed.
// Its own module so a program that names none of the facts and draws nothing
// leaves it out (the `visibility` capability, compiler/src/capabilities.ts).
//
// TWO FEEDERS, one contract. A backend with page context implements
// Surface.watchVisibility (DOM: one shared IntersectionObserver — sees the host
// page's scroll and transforms, which the app cannot). Everywhere else —
// canvas, native, headless — the runtime computes the facts itself: a
// Constraint over the ancestor walk (rootFrameBox ∩ the root's frame,
// rootTransform's scale × dpr), whose TRACKED reads subscribe it to exactly the
// ancestor x/y/scale/rotation/scroll/visible slots the answer depends on — the
// camera case (a world writing its own scale) invalidates it for free, with no
// attribute of the descendant changing.
//
// DELIVERY GRANULARITY (the Aperture ruling): `onScreen` lands immediately — a
// crossing is rare and cheap. `visibleRect` / `apparentScale` land AT REST —
// while the shared clock has motion in flight the latest value is buffered and
// flushed when the glide ends, so a fact-bound tier re-derives once per flight,
// not per frame.

import { View, EMPTY_RECT, viewLayoutReady } from "./view.js";
import { Constraint, kernel, kernelLoaded } from "./reactive.js";
import { blockOf, setBound } from "./attributes.js";
import { sharedClock } from "./animate.js";
import { rootFrameBox, rootTransform, type InteractionView } from "./interaction.js";

type Rect = { x: number; y: number; width: number; height: number };

/** One view's feed. */
interface Feed {
  armed: boolean;
  unwatch: (() => void) | null;
  generic: Constraint | null;
  wake: Constraint | null;
  pending: { rect: Rect; scale: number } | null;
  stale: boolean;
  flushTimer: ReturnType<typeof setTimeout> | 0;
  /** The kernel's view id and its visibility rule (−1 = none): the ancestor
   *  walk runs in the kernel over the table, and `generic`/`wake` become small
   *  wired rules over the vis* output cells. */
  elem: number;
  rule: number;
}

const FEEDS = new WeakMap<View, Feed>();
function feedOf(v: View): Feed {
  let f = FEEDS.get(v);
  if (f === undefined) {
    f = { armed: false, unwatch: null, generic: null, wake: null, pending: null, stale: false, flushTimer: 0, elem: -1, rule: -1 };
    FEEDS.set(v, f);
  }
  return f;
}
const parentView = (v: View): View | null => (v.parent instanceof View ? v.parent : null);

/** The first tracked read of a fact (the attribute table's onTrack), or a drawing. */
export function armVisibility(v: View): void {
  feedOf(v).armed = true;
  startVisibility(v);
}

/** Attach: an armed feed follows the view onto its (re)attached surface. */
export function reattachVisibility(v: View): void {
  if (FEEDS.get(v)?.armed === true) startVisibility(v);
}

/** Teardown: the feed dies with the view — the backend watch, the generic
 *  computer, any at-rest flush still pending, and the kernel's rule and view. */
export function retireVisibility(v: View): void {
  const f = FEEDS.get(v);
  if (f === undefined) return;
  FEEDS.delete(v);
  if (f.rule >= 0) kernel().dispose(f.rule);
  if (f.elem >= 0) kernel().viewRemove(f.elem);
  f.unwatch?.();
  f.generic?.dispose();
  f.wake?.dispose();
  if (f.flushTimer !== 0) clearTimeout(f.flushTimer);
}

/** The kernel visibility rule feeding `v` (−1 = the JS walk, or no feed) —
 *  for the tests that pin which path runs (kernel-vis.test). */
export function visibilityRule(v: View): number {
  return FEEDS.get(v)?.rule ?? -1;
}

/** This view as the kernel knows it (its block + parent link), registering the
 *  ancestors on the way up. */
function kernelElem(v: View): number {
  const f = feedOf(v);
  if (f.elem >= 0) return f.elem;
  const p = parentView(v);
  f.elem = kernel().viewAdd(blockOf(v), p !== null ? kernelElem(p) : -1);
  return f.elem;
}

/** A (re)attach may have moved this view under a new parent: refresh the
 *  kernel's link and the rule's edges, and land the facts again. */
function relinkKernelVis(v: View, f: Feed): void {
  const K = kernel();
  const p = parentView(v);
  K.viewParent(f.elem, p !== null ? kernelElem(p) : -1);
  K.visRewire(f.rule);
  K.run(f.rule);
}

/** THE KERNEL PATH. The kernel's rule walks this view's parent chain in the
 *  slot table — rootTransform ∘ boxThrough ∩ the root's frame, scale × dpr,
 *  the arithmetic of readVisibility term for term — and writes the vis* cells;
 *  a wired JS rule over those cells delivers (or wakes). A 3D transform
 *  anywhere on the chain is beyond the affine walk: the rule writes visMode = 0
 *  and the JS walk takes over (fallbackToJS). Returns false when the kernel
 *  path is not available (no kernel; 3D at arm). */
function installKernelVis(v: View, f: Feed): boolean {
  if (f.rule >= 0) return true;
  if (!kernelLoaded() || !viewLayoutReady()) return false;
  for (let a: View | null = v; a !== null; a = parentView(a))
    if (a.rotateX !== 0 || a.rotateY !== 0 || a.translateZ !== 0) return false;
  const K = kernel();
  const root = (v.root ?? v) as View;
  const rule = K.visAdd(kernelElem(v), kernelElem(root));
  if (rule < 0) return false;
  f.rule = rule;
  K.run(rule);
  return true;
}

/** The delivery rule: wired over the seven output cells. */
function outputRule(v: View, f: Feed, label: string, land: (on: boolean, rect: Rect | null, scale: number) => void): Constraint {
  const c = new Constraint(label,
    () => [v.visMode, v.visOn, v.visScale, v.visX, v.visY, v.visW, v.visH] as const,
    (x) => {
      const [mode, on, scale, px, py, w, h] = x as readonly [number, boolean, number, number, number, number, number];
      if (mode === 0) { fallbackToJS(v, f); return; }
      land(on, on ? { x: px, y: py, width: w, height: h } : null, scale);
    });
  c.wire(() => { void v.visMode; void v.visOn; void v.visScale; void v.visX; void v.visY; void v.visW; void v.visH; });
  return c;
}

/** The chain grew a 3D transform: retire the kernel rule and run the JS walk
 *  as a tracking constraint from here on (this life). */
function fallbackToJS(v: View, f: Feed): void {
  if (f.rule < 0) return;
  kernel().dispose(f.rule); f.rule = -1;
  if (f.generic !== null) { f.generic.dispose(); f.generic = null; }
  if (f.wake !== null) { f.wake.dispose(); f.wake = null; }
  startVisibility(v);
}

/** The model's own answer — the ancestor walk, with TRACKED reads: the visible
 *  chain, rootTransform, rootFrameBox. The generic feed delivers this value;
 *  the DOM feed runs the same reads purely as a WAKE (below), because the
 *  reads subscribing to exactly the ancestor slots the answer depends on is
 *  what makes the camera case (a world writing only its own scale) invalidate
 *  a descendant's facts with no attribute of its own changing. */
export function readVisibility(v: View): { on: boolean; rect: Rect | null; scale: number } {
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const iv = v as unknown as InteractionView;
  // hidden anywhere up the chain = off (tracked reads, so a flip wakes us)
  for (let a: View | null = v; a !== null; a = parentView(a))
    if (!a.visible) return { on: false, rect: null, scale: rootTransform(iv).scale * dpr };
  const t = rootTransform(iv);
  const b = rootFrameBox(iv);
  const r = (v.root ?? v) as View;
  const ix = Math.max(b.x, 0), iy = Math.max(b.y, 0);
  const iw = Math.min(b.x + b.width, r.width) - ix, ih = Math.min(b.y + b.height, r.height) - iy;
  if (iw <= 0 || ih <= 0) return { on: false, rect: null, scale: t.scale * dpr };
  const k = t.scale === 0 ? 1 : t.scale;
  return {
    on: true,
    rect: { x: (ix - b.x) / k, y: (iy - b.y) / k, width: iw / k, height: ih / k },
    scale: t.scale * dpr,
  };
}

function startVisibility(v: View): void {
  const f = feedOf(v);
  if (!f.armed) return;
  const s = v.surface;
  if (s?.watchVisibility) {
    // backend feed available: retire any generic computer from a prior life
    if (f.generic !== null) { f.generic.dispose(); f.generic = null; }
    f.unwatch?.();
    f.unwatch = s.watchVisibility((x) => deliverVisibility(v, f, x.on, x.rect, x.scale));
    // THE WAKE (the sprung-camera fix). An IntersectionObserver is an EDGE
    // sensor: it reports when the intersection crosses a threshold, not when
    // the level changes — a fully visible box under a scaling ancestor crosses
    // nothing and reports nothing, and mid-glide entries are samples frozen at
    // each box's crossing instant. So the facts cannot be read off the
    // observer's last entry; it is kept for what only it can see (the HOST
    // PAGE's scroll and transforms, ancestor clip) and as the measurement
    // instrument. The model's tracked reads are the wake: when an ancestor slot
    // changes, RE-ASK the observer for current truth (refreshVisibility → a
    // fresh entry) — at once when at rest, at the glide's end otherwise. The
    // computed value is discarded: the model cannot see the page context, the
    // observer can.
    if (f.wake === null) {
      // THE KERNEL PATH first: the chain walk runs over the slot table and a
      // small wired rule over its outputs does the waking (installKernelVis).
      const wake = (): void => {
        if (sharedClock.busy) { f.stale = true; scheduleFlush(v, f); return; }
        v.surface?.refreshVisibility?.();
      };
      if (installKernelVis(v, f)) {
        f.wake = outputRule(v, f, `${v.constructor.name}.visibilityWake`, () => wake());
      } else {
        f.wake = new Constraint(`${v.constructor.name}.visibilityWake`, () => readVisibility(v), wake);
        f.wake.run();
      }
    } else if (f.rule >= 0) relinkKernelVis(v, f);
    return;
  }
  if (f.generic !== null) { if (f.rule >= 0) relinkKernelVis(v, f); return; } // already computing
  if (installKernelVis(v, f)) {
    f.generic = outputRule(v, f, `${v.constructor.name}.visibility`, (on, rect, scale) => deliverVisibility(v, f, on, rect, scale));
    return;
  }
  f.generic = new Constraint(
    `${v.constructor.name}.visibility`,
    () => readVisibility(v),
    (x) => {
      const r = x as { on: boolean; rect: Rect | null; scale: number };
      deliverVisibility(v, f, r.on, r.rect, r.scale);
    },
  );
  f.generic.run();
}

/** Arm the at-rest flush (the timer only exists while something is pending or
 *  stale — no standing loop). At rest it prefers RE-MEASURING over replaying:
 *  a buffered value from mid-glide is a sample of the journey, not the
 *  destination. */
function scheduleFlush(v: View, f: Feed): void {
  if (f.flushTimer !== 0) return;
  const tick = (): void => {
    f.flushTimer = 0;
    if (sharedClock.busy) { f.flushTimer = setTimeout(tick, 120); return; }
    const p = f.pending;
    f.pending = null;
    const s = v.surface;
    if (f.stale && s?.refreshVisibility) {
      // the backend can measure current truth — ask it; the fresh entry
      // arrives through deliverVisibility on the now-idle clock
      f.stale = false;
      s.refreshVisibility();
      return;
    }
    f.stale = false;
    if (p !== null) {
      setBound(v, "visibleRect", p.rect);
      setBound(v, "apparentScale", p.scale);
      if (v.drawing !== null && p.rect !== null) v.surface?.setRasterScale?.(p.scale);
    }
  };
  f.flushTimer = setTimeout(tick, 120);
}

function deliverVisibility(v: View, f: Feed, on: boolean, rect: Rect | null, scale: number): void {
  if (v.onScreen !== on) setBound(v, "onScreen", on);
  const shaped = on && rect !== null ? rect : EMPTY_RECT;
  if (sharedClock.busy) {
    // mid-glide: hold the latest, flush at rest
    f.pending = { rect: shaped, scale };
    scheduleFlush(v, f);
    return;
  }
  f.pending = null;
  setBound(v, "visibleRect", shaped);
  setBound(v, "apparentScale", scale);
  if (v.drawing !== null && on) v.surface?.setRasterScale?.(scale);
}
