// interaction — the pointer-interaction intrinsics: per-view `hovered` and
// `pressed`, read-only, chain-based, and pay-per-use.
//
// THE MODEL. `hovered` is true for the topmost visible view under the pointer
// AND every ancestor of it — the *hit chain* — never for a view that merely
// contains the point under something else (occlusion-correct: a transparent
// "activation glass" laid over a window's content suppresses every hover
// beneath it, which is how an app expresses inactive-window policy with one
// view). `pressed` is true for a view on the chain captured at pointer-down
// while it is STILL on the live chain — drag off a button and it un-presses,
// drag back and it re-presses, the platform rule. On touch there is no hover
// (`app.hovering` is the gate), while `pressed` works as the touch feedback.
//
// THE MECHANISM is the language's own: one internal Constraint per app — the
// DRIVER — whose compute reads `app.pointerX`/`pointerY`/`pointerDown` and
// walks the tree geometrically, all under tracking. The walk's geometry reads
// (x, y, width, height, scale, clip, visible, and the child list) become the
// driver's dependencies, rebuilt each run — so a view that springs beneath a
// stationary cursor re-fires the chain exactly like a pointer move does. No
// listeners, no polling: hover is a standing relationship like everything else.
//
// PAY-PER-USE by lazy materialization: a view gets an interaction record (two
// booleans + two Cells) the first time anything reads its `hovered`/`pressed`
// — and the driver exists only once the first record under its app does. A
// program that never reads them allocates nothing and never walks.
//
// The attributes are schema-`readOnly` (schema.ts): an author write is a
// compile error, like `contentWidth`. The keyboard-activation flash a control
// wants is NOT this fact — that is the control's own state (library
// `Control.flash`), composed with these in a constraint.
//
// View-free on purpose (the stylesheet.ts discipline): hosts are typed
// structurally and view.ts injects its own instance test at module init, so
// view.ts can import this module without a cycle.

import { Cell, Constraint } from "./reactive.js";

/** The geometry surface the chain walk reads — structurally, any View. */
export interface InteractionView {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  pivotX: number;
  pivotY: number;
  clip: string | boolean | null;
  visible: boolean;
  pointerEvents: string;
  ignoreClip: boolean;
  /** The scroll regime facts (view.ts): which axes this view scrolls, its
   *  live offsets, and whether it opts out of its parent's regime. The
   *  transform below is incomplete without them — a scrolled parent's content
   *  is translated by the platform, and that translation is as much a part of
   *  the view→child transform as `x`/`y` and `scale` are. */
  scrolls: string;
  scrollX: number;
  scrollY: number;
  ignoreScroll: boolean;
  parent: unknown;
  root: unknown;
  children: readonly unknown[];
}

/** The app surface the driver reads. */
export interface InteractionApp extends InteractionView {
  pointerX: number;
  pointerY: number;
  pointerDown: boolean;
  hovering: boolean;
}

let isView: (n: unknown) => n is InteractionView = (_n): _n is InteractionView => false;

/** view.ts calls this once at module init — the injected instance test. */
export function initInteraction(test: (n: unknown) => n is InteractionView): void {
  isView = test;
}

interface Rec {
  hovered: boolean;
  pressed: boolean;
  hCell: Cell;
  pCell: Cell;
}

/** Everything one app's interaction owns, held ONLY through the WeakMap below —
 *  when an app instance is dropped (a torn-down island, a prewarm/crawl boot),
 *  its whole interaction island (driver constraint, recs, cells) goes with it.
 *  A module-global strong registry here once retained every booted tree and
 *  ran the prewarm sweep out of heap. */
interface AppInteraction {
  recs: Map<InteractionView, Rec>;
  press: { wasDown: boolean; chain: Set<InteractionView> };
  driver: Constraint;
}

const APPS = new WeakMap<InteractionApp, AppInteraction>();
/** Reads on a not-yet-attached view (no root) park here and migrate on the
 *  first read after attach. Weak: a discarded detached view carries its rec away. */
const ORPHANS = new WeakMap<InteractionView, Rec>();

/** THE VIEW→CHILD TRANSFORM — a point in `v`'s FRAME space (its own box,
 *  [0,width]×[0,height] the visible frame) to the same point in child `c`'s
 *  frame space. THE complete inverse of the paint transform, all three terms:
 *
 *    1. the parent's SCROLL — a scrolling parent's content is translated by
 *       the platform (the browser's scroller, the canvas compositor's offset);
 *       no view's `x`/`y` changes, so the walk must add the offset back. The
 *       one exception is frame chrome: an `ignoreScroll` child rides the
 *       frame, unshifted (the DOM realizes it by reparenting into a sticky
 *       frame; here it is a term that doesn't apply);
 *    2. the child's translate (`x`, `y`);
 *    3. the child's scale about its pivot.
 *
 *  Frame space is the invariant that makes every level uniform: the pointer
 *  enters at the root in VIEWPORT coordinates — which ARE the root's frame
 *  coordinates (the page realization scrolls the root's content, not its
 *  frame) — and each descent lands in the child's frame. Omitting term 1 was
 *  the scroll-blind-walk bug (measured 2026-07-30: every `pressed` below the
 *  fold landed on the view a full scrollY away); the canvas backend's hit walk
 *  had all three terms all along (canvas-backend `hit`), which is exactly the
 *  drift the ONE-WALK rule below exists to prevent. */
function toChildLocal(v: InteractionView, c: InteractionView, lx: number, ly: number): [number, number] {
  if (v.scrolls !== "none" && !c.ignoreScroll) {
    lx += v.scrollX;
    ly += v.scrollY;
  }
  let cx = lx - c.x;
  let cy = ly - c.y;
  const s = c.scale;
  if (s !== 1 && s !== 0) {
    cx = (cx - c.pivotX) / s + c.pivotX;
    cy = (cy - c.pivotY) / s + c.pivotY;
  }
  return [cx, cy];
}

/** The topmost visible view whose box contains the point — reverse paint
 *  order, descending through containers; overflow children are reachable
 *  outside their parent's box unless the parent clips. All attribute reads
 *  here run inside the driver's tracked compute — they ARE the dependencies.
 *
 *  THE ONE WALK. Exported because it is also the language's own hit test
 *  (View.viewAt / View.containsPoint, view.ts): what an app computes about
 *  "what is under this point" and what the runtime computes for `hovered` must
 *  be the same answer, from the same code. (Three hand-rolled versions of this
 *  question — the inspector's picker, a calendar's cell math, a window's resize
 *  zones — is how the desktop's corner bug happened.) */
export function leafAt(v: InteractionView, lx: number, ly: number, pierce = false): InteractionView | null {
  if (!v.visible) return null;
  // "none" makes the subtree pointer-transparent (the overlay rule) — the walk
  // falls through it exactly as input resolution does. `pierce` is the ONE
  // caller-visible difference in the whole walk: the Inspector's picker must be
  // able to select a view the pointer would pass through, because a developer
  // asking "what is this?" means the thing they can see, not the thing that
  // would receive a press.
  if (!pierce && v.pointerEvents === "none") return null;
  const inside = lx >= 0 && ly >= 0 && lx <= v.width && ly <= v.height;
  // A scroller bounds its subtree at its FRAME — content beyond the frame is
  // out of view by definition, whatever the `clip` attribute says (the canvas
  // hit walk's exact rule, chrome included: its sticky frame lives in-frame).
  if (v.scrolls !== "none" && !inside) return null;
  // A clipping view (box or shape — a shape clip approximates as its box here)
  // bounds its subtree's hits — EXCEPT children that opt out with `ignoreClip`
  // (frame chrome straddling the frame "still paints and still hits", view.ts;
  // the desktop's resize halo lives outside its window's clipped box). Ancestors'
  // clips still apply, which the recursion gives for free.
  const clipping = v.clip !== null && v.clip !== false && v.clip !== "";
  const kids = v.children;
  // A scroller's frame chrome (ignoreScroll) paints ABOVE its scrolled content
  // (the DOM's sticky frame carries a zIndex; the canvas walk probes chrome
  // first) — so it hits first too, in its own unshifted coordinates.
  if (v.scrolls !== "none") {
    for (let i = kids.length - 1; i >= 0; i--) {
      const c = kids[i];
      if (!isView(c) || !c.ignoreScroll) continue;
      if (clipping && !inside && !c.ignoreClip) continue;
      const [cx, cy] = toChildLocal(v, c, lx, ly);
      const hit = leafAt(c, cx, cy, pierce);
      if (hit !== null) return hit;
    }
  }
  for (let i = kids.length - 1; i >= 0; i--) {
    const c = kids[i];
    if (!isView(c)) continue;
    if (v.scrolls !== "none" && c.ignoreScroll) continue; // probed above
    if (clipping && !inside && !c.ignoreClip) continue;
    const [cx, cy] = toChildLocal(v, c, lx, ly);
    const hit = leafAt(c, cx, cy, pierce);
    if (hit !== null) return hit;
  }
  return inside ? v : null;
}

function chainAt(app: InteractionApp, x: number, y: number): Set<InteractionView> {
  const chain = new Set<InteractionView>();
  let leaf = leafAt(app, x, y);
  while (leaf !== null) {
    chain.add(leaf);
    leaf = isView(leaf.parent) ? leaf.parent : null;
  }
  return chain;
}

function ensureApp(app: InteractionApp): AppInteraction {
  let state = APPS.get(app);
  if (state !== undefined) return state;
  // The press chain is a SNAPSHOT at the down edge; cleared on release.
  const press = { wasDown: false, chain: new Set<InteractionView>() };
  const recs = new Map<InteractionView, Rec>();
  const driver = new Constraint(
    "App.$interaction",
    () => {
      const x = app.pointerX;
      const y = app.pointerY;
      const down = app.pointerDown;
      const hovering = app.hovering;
      const chain = hovering ? chainAt(app, x, y) : new Set<InteractionView>();
      if (down && !press.wasDown) press.chain = hovering ? new Set(chain) : chainAt(app, x, y);
      if (!down) press.chain.clear();
      press.wasDown = down;
      return { chain, down, hovering };
    },
    (v: unknown) => {
      const { chain, down, hovering } = v as { chain: Set<InteractionView>; down: boolean; hovering: boolean };
      for (const [view, rec] of recs) {
        if (view.parent === null && (view as unknown) !== (app as unknown)) { recs.delete(view); continue; }
        const h = chain.has(view);
        // A mouse press releases when dragged off the chain (platform rule);
        // a touch press (no hover chain) holds while the pointer is down.
        const p = down && press.chain.has(view) && (hovering ? chain.has(view) : true);
        if (h !== rec.hovered) { rec.hovered = h; rec.hCell.changed(); }
        if (p !== rec.pressed) { rec.pressed = p; rec.pCell.changed(); }
      }
    }
  );
  state = { recs, press, driver };
  APPS.set(app, state);
  return state;
}

function recOf(view: InteractionView): Rec {
  const root = view.root;
  if (root !== null && root !== undefined && isView(root)) {
    const state = ensureApp(root as InteractionApp);
    let r = state.recs.get(view);
    if (r === undefined) {
      // A parked pre-attach rec migrates in, keeping any subscribers wired to it.
      r = ORPHANS.get(view) ?? { hovered: false, pressed: false, hCell: new Cell(), pCell: new Cell() };
      state.recs.set(view, r);
      // The record must reflect the CURRENT chain before its first read returns —
      // the driver re-runs (bind-time precedent: bindConstraint's k.run()), sees
      // the new record, and lands its truth.
      state.driver.run();
    }
    return r;
  }
  let r = ORPHANS.get(view);
  if (r === undefined) {
    r = { hovered: false, pressed: false, hCell: new Cell(), pCell: new Cell() };
    ORPHANS.set(view, r);
  }
  return r;
}

/** The view under a point in the root's FRAME space (viewport coordinates for
 *  a top-level app) — the walk's own space. view.ts wraps it as
 *  `app.viewAt(x, y)` with the CONTENT-space contract the language documents
 *  (root-space, pairing with drag coordinates), converting at that boundary;
 *  the Inspector's picker calls it directly (its overlay is viewport-fixed).
 *  Same walk the pointer is routed by: clip shapes, scale and pivot,
 *  `pointerEvents: "none"`, `ignoreClip`, and every scroll regime count
 *  exactly as they do for a real press. Returns the deepest (topmost) view;
 *  walk `.parent` for an eligible ancestor. */
export function hitAt(root: unknown, x: number, y: number, pierce = false): InteractionView | null {
  if (!isView(root)) return null;
  return leafAt(root, x, y, pierce);
}

/** Does `view`'s own box contain this point, given in the root's CONTENT
 *  space (the language's root-space — what drag events carry)? Geometry only —
 *  occlusion is `hitAt`'s question — so a view can ask "is the pointer within
 *  me" without a tree walk. */
export function boxContains(view: InteractionView, x: number, y: number): boolean {
  // Walk down from the root accumulating the transform, so the answer honours
  // the same scroll/scale/pivot inversion the routed hit does. Content space
  // in, so the ROOT's own scroll is already in the coordinates (frame =
  // content − scroll); each descent then re-applies each level's terms.
  const chain: InteractionView[] = [];
  for (let n: unknown = view; isView(n); n = n.parent) chain.push(n);
  const rootV = chain[chain.length - 1];
  let lx = x - rootV.scrollX;
  let ly = y - rootV.scrollY;
  for (let i = chain.length - 2; i >= 0; i--) {
    [lx, ly] = toChildLocal(chain[i + 1], chain[i], lx, ly);
  }
  return lx >= 0 && ly >= 0 && lx <= view.width && ly <= view.height;
}

/** A view's origin in the ROOT'S FRAME space (viewport coordinates for a
 *  top-level app) — the inverse of the descent the walk makes, minus scale
 *  (callers so far box overlays that don't scale; the term joins when one
 *  does). Shared for the same reason the walk is: the Inspector's highlight
 *  accumulated x/y by hand and was blind to every scroll regime. */
export function rootFrameOrigin(view: InteractionView): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let n: InteractionView | null = view; n !== null; ) {
    x += n.x;
    y += n.y;
    const p: InteractionView | null = isView(n.parent) ? n.parent : null;
    if (p !== null && p.scrolls !== "none" && !n.ignoreScroll) {
      x -= p.scrollX;
      y -= p.scrollY;
    }
    n = p;
  }
  return { x, y };
}

/** The tracked read behind `View.hovered`. */
export function readHovered(view: InteractionView): boolean {
  const r = recOf(view);
  r.hCell.track();
  return r.hovered;
}

/** The tracked read behind `View.pressed`. */
export function readPressed(view: InteractionView): boolean {
  const r = recOf(view);
  r.pCell.track();
  return r.pressed;
}
