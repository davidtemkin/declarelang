// Layout — views arranging their children declaratively (language §5: "how
// those children are arranged is a reactive `Layout` attribute you set on the
// view"; the strategies are Layout subclasses). A layout is NOT a child and
// NOT a container type: it is the value of the view's `layout` slot, written
// as the member `layout: SimpleLayout [ axis = y, spacing = 10 ]`.
//
// Semantically a layout is nothing but standing computations over the
// children's geometry, riding the R4 reactive core — no delegate lists, no
// update() methods, no bespoke invalidation (the LZX LzLayout family in
// ../runtime/components/utils/layouts/ was read for intent; its
// updateDelegate machinery is exactly what Cells/Constraints replaced).
//
// Granularity — deliberately ONE constraint PER LAID CHILD, chained, rather
// than one layout-level pass:
//
//   child[i].<axis> = nearest visible predecessor's <axis> + <size> + spacing
//
// Each constraint's dependencies are exactly what it read last run (the R4
// precision rule), so the re-layout cost of a change is exactly the children
// that actually move: the LAST child growing wakes nothing (no constraint
// reads it); a middle child growing wakes its successor, whose position write
// wakes the next, each running once and stopping the moment a position comes
// out equal (the attribute layer's equality gate). A layout-level pass would
// re-walk all N children for any change. Visibility is a tracked read too:
// hiding child k re-runs exactly k+1's constraint (the only reader of
// k.visible), and the rest follow only as positions actually change.
//
// Child ORDER is the semantic order (the R4 ruling's deliberate exception:
// tree order is paint order) — a stacking layout consumes exactly it.
// Invisible children are skipped and their space reclaimed (the LZX rule;
// recorded as an open question with this as the recommendation). A skipped
// child's own position still computes uniformly — the slot it would occupy —
// so re-showing it needs no special case.
//
// Ownership: the layout OWNS each laid child's axis slot (the ruled
// one-owner-per-slot model, attributes.ts). A direct author write to a laid
// position is an error naming the layout — an author-installed arrangement is
// declarative surface, not a runtime derive, so it does not yield (the R4
// ruling: any write-then-resume idiom must be explicit surface). An author
// literal on the laid axis is simply overridden at install (LZX-compatible;
// the literal was applied in pass one, the arrangement owns the slot from
// pass two on); an author *binding* on the laid axis is a hard conflict —
// two standing owners — and errors naming both sides.
//
// Pay-per-use: a view with no layout carries nothing (the slot's default is
// null on the prototype); an idle laid tree is inert constraint data — zero
// rAF, zero polling.
import { Node } from "./node.js";
import { Constraint } from "./reactive.js";
import { defineAttributes, own, ownerOf, release, setBound } from "./attributes.js";
import { NeoError } from "./errors.js";
import { View } from "./view.js";
import { Animator } from "./animator.js";
import { motionToken } from "./animate.js";
/** The abstract strategy: lifecycle only (which view it arranges, install /
 *  undo bookkeeping). What "arranging" means is the subclass's `install`.
 *
 *  A Node — like Animator and Dataset, the other non-visual declarables (the
 *  ruled model: a declarable object is a Node, so hierarchy navigation from a
 *  layout's own code behaves as a developer expects). It is NOT a tree child,
 *  though: it lives in the view's typed `layout` slot, not in `children`, so a
 *  paint/hit walk never sees it (and layouts already filter children to
 *  `instanceof View`). `parent`/`view` both point at the arranged view — the
 *  slot pusher wires them on attach — so `this.view.width`, `this.view.children`,
 *  `this.parent…` up to the root, and lexically-resolved ids all work; only the
 *  layout's own (always-empty) `children` is vestigial. `this.view` is the
 *  typed accessor (parent narrowed to View) the arrangement reads. */
export class Layout extends Node {
    /** The view whose children this strategy arranges; null when unattached.
     *  Kept in step with `parent` (a Node link for upward navigation); this is
     *  the View-typed handle the arrangement uses. */
    view = null;
    undo = null;
    /** Begin arranging `view` (the View.layout pusher's entry). One strategy
     *  arranges one view: a strategy is written per element, and sharing one
     *  across views would make its reactive attributes action-at-a-distance. */
    attachTo(view) {
        if (this.view !== null) {
            throw new NeoError(`this ${this.constructor.name} already arranges a ${this.view.constructor.name} — one strategy per view`);
        }
        this.view = view;
        this.parent = view; // navigation back-ref (not a children entry: the layout lives in view.layout)
        this.undo = this.install(view);
        return () => {
            this.undo?.();
            this.undo = null;
            this.view = null;
            this.parent = null;
        };
    }
    /** Re-run install — the entry for a *structural* attribute change (axis),
     *  where the constraints' target slots themselves change. Value-level
     *  attributes (spacing) never need this: constraints read them under
     *  tracking and re-run through the ordinary machinery. */
    rearm() {
        if (this.view === null)
            return;
        const undo = this.undo;
        this.undo = null;
        undo?.();
        this.undo = this.install(this.view);
    }
}
/** SimpleLayout — the stacking idiom (LZX's simplelayout, rewritten): siblings
 *  stacked along `axis` in child order, `spacing` apart (negative overlaps,
 *  per the weather app's `spacing = -10`), invisible children skipped. The
 *  cross axis is untouched, and so are the children's sizes — sizes are
 *  inputs here (a Text auto-sizing or an Image's bitmap arriving re-flows the
 *  stack through the ordinary dependency wake). */
export class SimpleLayout extends Layout {
    install(view) {
        const axis = this.axis; // captured: an axis change re-targets slots, so it re-installs (see the pusher)
        const size = axis === "x" ? "width" : "height";
        const label = `${view.constructor.name}'s SimpleLayout[${axis}]`;
        const kids = view.children.filter((c) => c instanceof View);
        const installed = [];
        const detach = () => {
            installed.forEach((k, i) => {
                k.dispose();
                release(kids[i], axis, k);
            });
        };
        try {
            for (let i = 0; i < kids.length; i++) {
                const child = kids[i];
                const prior = ownerOf(child, axis);
                if (prior !== null) {
                    throw new NeoError(`${child.constructor.name}.${axis} is already bound (by ${prior.label}), but ${label} arranges its children's ${axis} — drop one of the two`);
                }
                const k = new Constraint(label, () => {
                    // Nearest VISIBLE predecessor, walked back in child order. The
                    // reads (position, size, visible, spacing) are tracked, so the
                    // dependency set is exactly this run's walk — precise under
                    // visibility changes, per the R4 conditional-read rule.
                    for (let j = i - 1; j >= 0; j--) {
                        const p = kids[j];
                        if (p.visible)
                            return p[axis] + p[size] + this.spacing;
                    }
                    return 0;
                }, (v) => setBound(child, axis, v));
                own(child, axis, k);
                installed.push(k);
                k.run(); // predecessors are already placed, so one pass settles
            }
        }
        catch (e) {
            detach(); // transactional: a conflict mid-install leaves nothing owned
            throw e;
        }
        return detach;
    }
}
defineAttributes(SimpleLayout, {
    // Structural: the constraints' target slot IS the axis, so changing it
    // re-installs (releasing the old axis's ownership). Rare by nature.
    axis: { def: "y", push: (l) => l.rearm() },
    // Value-level: every laid constraint reads it under tracking, so a write
    // wakes exactly them — no push needed.
    spacing: { def: 0 },
});
/** WrappingLayout — a horizontal flow that WRAPS: children run left-to-right
 *  `spacing` apart, and when the next child would overflow the view's width it
 *  drops to a new row (`lineSpacing` down, default = `spacing`). With room for
 *  one row it is identical to `SimpleLayout[axis=x]`; as the view narrows it
 *  stacks — the whole point (cards that reflow on a phone with no media query).
 *  It owns BOTH axes of each child (a flow is 2-D), each child's position a pure
 *  function of the view's width and the predecessors' sizes, so a resize or a
 *  child growing re-flows through the ordinary reactive wake. */
export class WrappingLayout extends Layout {
    /** The placed position of every child, computed in one left-to-right pass —
     *  the shared read the per-child x/y constraints call (reads the view width,
     *  spacings, and each child's size/visibility, so all are tracked deps). */
    positions(kids) {
        const w = this.view.width;
        const sp = this.spacing;
        const ls = this.lineSpacing < 0 ? sp : this.lineSpacing;
        const out = [];
        let cx = 0, cy = 0, rowH = 0, firstInRow = true;
        for (const c of kids) {
            if (!c.visible) {
                out.push({ x: cx, y: cy });
                continue;
            } // skipped: reclaim its slot
            const cw = c.width, ch = c.height;
            // wrap when this child (with its leading gap) would overflow — never on
            // the first child of a row, so one over-wide child just overflows its row
            if (!firstInRow && cx + sp + cw > w) {
                cx = 0;
                cy += rowH + ls;
                rowH = 0;
                firstInRow = true;
            }
            if (!firstInRow)
                cx += sp;
            out.push({ x: cx, y: cy });
            cx += cw;
            rowH = Math.max(rowH, ch);
            firstInRow = false;
        }
        return out;
    }
    install(view) {
        const kids = view.children.filter((c) => c instanceof View);
        const label = `${view.constructor.name}'s WrappingLayout`;
        const installed = [];
        const detach = () => {
            for (const o of installed) {
                o.k.dispose();
                release(o.child, o.slot, o.k);
            }
        };
        try {
            kids.forEach((child, i) => {
                for (const slot of ["x", "y"]) {
                    const prior = ownerOf(child, slot);
                    if (prior !== null) {
                        throw new NeoError(`${child.constructor.name}.${slot} is already bound (by ${prior.label}), but ${label} arranges its children — drop one of the two`);
                    }
                    const k = new Constraint(label, () => this.positions(kids)[i][slot], (v) => setBound(child, slot, v));
                    own(child, slot, k);
                    installed.push({ child, slot, k });
                }
            });
            for (const o of installed)
                o.k.run();
        }
        catch (e) {
            detach();
            throw e;
        }
        return detach;
    }
}
defineAttributes(WrappingLayout, {
    spacing: { def: 0 },
    lineSpacing: { def: -1 },
});
/** TweenLayout — the animated-reflow engine (the calendar's gridslider idiom,
 *  generalized and shed of its Flash-era scaffolding). The layout owns every
 *  laid child's x/y/width/height/visible and glides them between two WHOLE
 *  layouts through a single animated scalar `t`:
 *
 *    child[i].x = from[i].x + (to[i].x − from[i].x) · t      (and y/w/h)
 *
 *  so one write to `t` — the built-in animator's, or a direct snap — wakes
 *  exactly the laid children and repositions the entire grid in one settle
 *  (168 per-cell animators in the original collapse to ONE on `t`). The
 *  geometry is stated once: a subclass supplies `place()` (pure — state → one
 *  Box per child), and the tween is literally the interpolation between two
 *  evaluations of it. `retarget(animate)` is the whole imperative surface (the
 *  provenance a constraint can't see — snap vs slide): it snapshots the
 *  children's CURRENT boxes as `from` (interruption-correct, like Core
 *  Animation's presentation layer), computes `to = place()`, then snaps (t←1)
 *  or eases (t:0→1). Even the reveal rule — a child entering the visible set
 *  holds hidden until the motion lands — is a function of t
 *  (`from.vis || (to.vis && t≥1)`), so it is a constraint, not the original's
 *  hardcoded 600ms timer. */
export class TweenLayout extends Layout {
    /** The single animator that drives `t`. A Node child of the layout, so it
     *  targets the layout itself (Animator.resolveTarget walks parent); created
     *  lazily on first install and reused across re-arms. */
    tween = null;
    /** The laid children: this.view's View children, honoring an `ignorelayout`
     *  opt-out (LZX's rule — a decoration/overlay child sits outside layout).
     *  Non-View members (a Dataset) and the tween animator (a child of the
     *  LAYOUT, not the view) are never in this set. */
    laid() {
        const v = this.view;
        if (v === null)
            return [];
        return v.children.filter((c) => c instanceof View && c.ignorelayout !== true);
    }
    /** Stand up one lerp constraint per laid child per geometry slot (owning it,
     *  the one-owner model), snapshot the initial layout, and evaluate. Re-run
     *  wholesale by rearm when the child set changes (R8). */
    install(_view) {
        if (this.tween === null) {
            const a = new Animator();
            a.attribute = "t";
            a.to = 1;
            a.motion = motionToken("laszloBoth");
            this.appendChild(a); // parent = this layout → the animator targets `t` on it
            this.tween = a;
        }
        const kids = this.laid();
        const owned = [];
        const SLOTS = [
            ["x", "x"],
            ["y", "y"],
            ["width", "w"],
            ["height", "h"],
        ];
        const detach = () => {
            this.tween?.stop();
            for (const o of owned) {
                release(o.child, o.slot, o.k);
                o.k.dispose();
            }
        };
        try {
            kids.forEach((child, idx) => {
                for (const [slot, key] of SLOTS) {
                    const k = new Constraint(`${this.constructor.name}[${idx}].${slot}`, () => {
                        const f = this.from[idx];
                        const g = this.to[idx];
                        if (f === undefined || g === undefined)
                            return 0;
                        const a = f[key];
                        const b = g[key];
                        return a + (b - a) * this.t;
                    }, (v) => setBound(child, slot, v));
                    own(child, slot, k);
                    owned.push({ child, slot, k });
                }
                const kv = new Constraint(`${this.constructor.name}[${idx}].visible`, () => {
                    const f = this.from[idx];
                    const g = this.to[idx];
                    // During the slide (t<1) show whoever was visible in `from` — a
                    // LEAVING cell stays on screen while it shrinks; an ARRIVING cell
                    // (hidden in `from`) is held out. At the end (t≥1) `to` governs, so
                    // arrivers appear and leavers vanish. A pure function of t — the
                    // original's 600ms reveal timer, made declarative.
                    if (f === undefined || g === undefined)
                        return true;
                    return this.t < 1 ? f.vis : g.vis;
                }, (v) => setBound(child, "visible", v));
                own(child, "visible", kv);
                owned.push({ child, slot: "visible", k: kv });
            });
        }
        catch (e) {
            for (const o of owned) {
                release(o.child, o.slot, o.k);
                o.k.dispose();
            }
            throw e; // transactional: a mid-install conflict leaves nothing owned
        }
        // Snapshot the current layout for these children, then evaluate the freshly
        // owned constraints against it (they subscribe to from/to/t on first run).
        this.retarget(false);
        for (const o of owned)
            o.k.run();
        return detach;
    }
    /** Snap or slide the laid children to the CURRENT target layout. `from` is
     *  the children's live boxes (so a re-trigger mid-slide glides from wherever
     *  they are); `to` is place(). animate ? ease t:0→1 : jam t←1. The one
     *  imperative entry — the app calls it after setting the layout's state on a
     *  geometry-affecting change the constraints can't infer (mode, focus). */
    retarget(animate) {
        const kids = this.laid();
        this.from = kids.map((c) => ({ x: c.x, y: c.y, w: c.width, h: c.height, vis: c.visible }));
        this.to = this.place();
        if (animate && this.tween !== null) {
            this.t = 0; // constraints settle children at `from` (= current) — no flash
            this.tween.duration = this.duration;
            this.tween.stop();
            this.tween.start(); // eases t 0→1; each frame wakes the geometry constraints
        }
        else {
            this.t = 1; // the `to` write above already woke the readers; this lands them there
        }
    }
}
defineAttributes(TweenLayout, {
    t: { def: 1 },
    from: { def: [] },
    to: { def: [] },
    duration: { def: 500 },
});
//# sourceMappingURL=layout.js.map