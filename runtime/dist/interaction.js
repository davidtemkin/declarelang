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
let isView = (_n) => false;
/** view.ts calls this once at module init — the injected instance test. */
export function initInteraction(test) {
    isView = test;
}
const APPS = new WeakMap();
/** Reads on a not-yet-attached view (no root) park here and migrate on the
 *  first read after attach. Weak: a discarded detached view carries its rec away. */
const ORPHANS = new WeakMap();
/** Point in `v`'s local space → the same point in child `c`'s local space,
 *  inverting translate(x,y) then scale about the pivot (the paint transform). */
function toChildLocal(c, lx, ly) {
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
export function leafAt(v, lx, ly, pierce = false) {
    if (!v.visible)
        return null;
    // "none" makes the subtree pointer-transparent (the overlay rule) — the walk
    // falls through it exactly as input resolution does. `pierce` is the ONE
    // caller-visible difference in the whole walk: the Inspector's picker must be
    // able to select a view the pointer would pass through, because a developer
    // asking "what is this?" means the thing they can see, not the thing that
    // would receive a press.
    if (!pierce && v.pointerEvents === "none")
        return null;
    const inside = lx >= 0 && ly >= 0 && lx <= v.width && ly <= v.height;
    // A clipping view (box or shape — a shape clip approximates as its box here)
    // bounds its subtree's hits — EXCEPT children that opt out with `ignoreclip`
    // (frame chrome straddling the frame "still paints and still hits", view.ts;
    // the desktop's resize halo lives outside its window's clipped box). Ancestors'
    // clips still apply, which the recursion gives for free.
    const clipping = v.clip !== null && v.clip !== false && v.clip !== "";
    const kids = v.children;
    for (let i = kids.length - 1; i >= 0; i--) {
        const c = kids[i];
        if (!isView(c))
            continue;
        if (clipping && !inside && !c.ignoreclip)
            continue;
        const [cx, cy] = toChildLocal(c, lx, ly);
        const hit = leafAt(c, cx, cy, pierce);
        if (hit !== null)
            return hit;
    }
    return inside ? v : null;
}
function chainAt(app, x, y) {
    const chain = new Set();
    let leaf = leafAt(app, x, y);
    while (leaf !== null) {
        chain.add(leaf);
        leaf = isView(leaf.parent) ? leaf.parent : null;
    }
    return chain;
}
function ensureApp(app) {
    let state = APPS.get(app);
    if (state !== undefined)
        return state;
    // The press chain is a SNAPSHOT at the down edge; cleared on release.
    const press = { wasDown: false, chain: new Set() };
    const recs = new Map();
    const driver = new Constraint("App.$interaction", () => {
        const x = app.pointerX;
        const y = app.pointerY;
        const down = app.pointerDown;
        const hovering = app.hovering;
        const chain = hovering ? chainAt(app, x, y) : new Set();
        if (down && !press.wasDown)
            press.chain = hovering ? new Set(chain) : chainAt(app, x, y);
        if (!down)
            press.chain.clear();
        press.wasDown = down;
        return { chain, down, hovering };
    }, (v) => {
        const { chain, down, hovering } = v;
        for (const [view, rec] of recs) {
            if (view.parent === null && view !== app) {
                recs.delete(view);
                continue;
            }
            const h = chain.has(view);
            // A mouse press releases when dragged off the chain (platform rule);
            // a touch press (no hover chain) holds while the pointer is down.
            const p = down && press.chain.has(view) && (hovering ? chain.has(view) : true);
            if (h !== rec.hovered) {
                rec.hovered = h;
                rec.hCell.changed();
            }
            if (p !== rec.pressed) {
                rec.pressed = p;
                rec.pCell.changed();
            }
        }
    });
    state = { recs, press, driver };
    APPS.set(app, state);
    return state;
}
function recOf(view) {
    const root = view.root;
    if (root !== null && root !== undefined && isView(root)) {
        const state = ensureApp(root);
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
/** The view under a ROOT-SPACE point — the public hit test (view.ts wraps it
 *  as `app.viewAt(x, y)`), answering with the same walk the pointer itself is
 *  routed by: clip shapes, scale and pivot, `pointerEvents: "none"`, and
 *  `ignoreclip` all count exactly as they do for a real press. Returns the
 *  deepest (topmost) view; walk `.parent` for an eligible ancestor. */
export function hitAt(root, x, y, pierce = false) {
    if (!isView(root))
        return null;
    return leafAt(root, x, y, pierce);
}
/** Does `view`'s own box contain this point, given in ROOT space? Geometry
 *  only — occlusion is `hitAt`'s question — so a view can ask "is the pointer
 *  within me" without a tree walk. */
export function boxContains(view, x, y) {
    // Walk down from the root accumulating the transform, so the answer honours
    // the same scale/pivot inversion the routed hit does.
    const chain = [];
    for (let n = view; isView(n); n = n.parent)
        chain.push(n);
    let lx = x;
    let ly = y;
    for (let i = chain.length - 1; i >= 0; i--) {
        const c = chain[i];
        if (i === chain.length - 1)
            continue; // the root is already in root space
        [lx, ly] = toChildLocal(c, lx, ly);
    }
    return lx >= 0 && ly >= 0 && lx <= view.width && ly <= view.height;
}
/** The tracked read behind `View.hovered`. */
export function readHovered(view) {
    const r = recOf(view);
    r.hCell.track();
    return r.hovered;
}
/** The tracked read behind `View.pressed`. */
export function readPressed(view) {
    const r = recOf(view);
    r.pCell.track();
    return r.pressed;
}
//# sourceMappingURL=interaction.js.map