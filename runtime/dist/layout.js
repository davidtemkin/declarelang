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
// THE SEAM — a strategy IS its `place()`: pure geometry, one Box per laid
// child (laid() is the one definition of which children a layout manages).
// The base's install() turns that into standing constraints; every concrete
// arrangement — the runtime's own and any authored in Declare (a library
// class extending Layout supplies place() as an ordinary method) — is a pure
// function over the same seam. TweenLayout refines the WRITE path (it
// interpolates between two snapshots of place()); nothing else overrides
// install.
//
// Granularity — ONE PASS per layout, gated fan-out (a kernel-only shape: the
// language surface binds one slot per constraint; the kernel is free to put
// one engine behind many slots). The pass-constraint computes place() — its
// tracked reads (view size, the strategy's attributes, child sizes and
// visibility) are the dependencies — and applies every box through the
// ordinary equality-gated writes, so children that did not move produce no
// downstream wake. Cost per relevant change: one O(N) pure-arithmetic pass +
// writes on exactly the children that moved. (The R4 fine-grained
// alternative — chained per-child constraints — re-ran fewer computes for
// middle-child changes but was a bespoke wiring per strategy; the pass is
// the uniform kernel under every place(), and the equality gate keeps the
// expensive half — pushes and paints — exactly as precise as before.)
//
// Child ORDER is the semantic order (the R4 ruling's deliberate exception:
// tree order is paint order) — a stacking layout consumes exactly it, and
// place()'s boxes align with laid() BY INDEX. Invisible children are skipped
// and their space reclaimed (the LZX rule); a skipped child's own position
// still computes uniformly — the slot it would occupy — so re-showing it
// needs no special case.
//
// Slack and Spacer — a run that does not fill its container leaves slack,
// and the laid children cannot absorb it themselves (their flow-axis slot is
// owned). The structural answer is a flexing child (library Spacer, marked
// `flexes = true`): a strategy's place() divides the slack among the flexing
// children, and the kernel drives each one's flow-axis SIZE through a
// percent-family constraint (markPercent) so a container deriving its own
// extent from its children never counts a spacer — the same cycle guard
// percent Lengths ride (a spacer's size IS parent-extent-derived).
//
// Ownership: a strategy owns exactly the slots its boxes carry, per child
// (the ruled one-owner-per-slot model, attributes.ts). claim() captures each
// slot's AUTHORED BASE at first touch; unclaim() restores it — so a vacated
// slot (an axis flip, a plan regime change, a layout swap) reverts to the
// authored literal or class default instead of stranding the arrangement's
// last write. A direct author write to an owned slot is an error naming the
// layout; an author *binding* on a slot the strategy's place() also returns
// is a CONFLICT the one-owner rule resolves in the author's favour — the
// layout leaves that slot to its author and reports it ONCE, attributed
// (install → reportConflict), never a settle-aborting throw. (Until 2026-09-02
// it threw: discovered mid-settle on a shape-driven rearm, that aborted the
// whole settle or — caught upstream — re-fired every wave, a storm that
// half-broke the app; a market-map field report named it. `ignoreLayout =
// true` remains the child's blessed way to own its own geometry.)
//
// Pay-per-use: a view with no layout carries nothing (the slot's default is
// null on the prototype); an idle laid tree is inert constraint data — zero
// rAF, zero polling.
import { Node } from "./node.js";
import { Constraint } from "./reactive.js";
import { defineAttributes, markPercent, own, ownerOf, release, setBound } from "./attributes.js";
import { DeclareError } from "./errors.js";
import { isWindowedBlock, View } from "./view.js";
import { Animator } from "./animator.js";
import { motionToken } from "./animate.js";
/** Box key → the child slot it drives, in a stable order. */
const BOX_SLOTS = [
    ["x", "x"],
    ["y", "y"],
    ["w", "width"],
    ["h", "height"],
    ["vis", "visible"],
];
/** The abstract strategy. A layout is its `place()` — pure geometry, one Box
 *  per laid child — and the base turns that into STANDING constraints over the
 *  children's own slots (install below). `laid()` is the one definition of
 *  which children a layout manages. A subclass overrides `place()` to define an
 *  arrangement; it MAY also override `install()` when it can wire the same
 *  semantics more precisely (SimpleLayout's chained per-child constraints) or
 *  differently in time (TweenLayout's interpolated write path).
 *
 *  A Node — like Animator and Dataset, the other non-visual declarables (the
 *  ruled model: a declarable object is a Node, so hierarchy navigation from a
 *  layout's own code behaves as a developer expects). It is NOT a tree child,
 *  though: it lives in the view's typed `layout` slot, not in `children`, so a
 *  paint/hit walk never sees it. `parent`/`view` both point at the arranged
 *  view — the slot pusher wires them on attach — so `this.view.width`,
 *  `this.view.children`, `this.parent…` up to the root, and lexically-resolved
 *  ids all work; only the layout's own (always-empty) `children` is vestigial.
 *  `this.view` is the typed accessor (parent narrowed to View) the arrangement
 *  reads. */
export class Layout extends Node {
    /** The view whose children this strategy arranges; null when unattached.
     *  Kept in step with `parent` (a Node link for upward navigation); this is
     *  the View-typed handle the arrangement uses. */
    view = null;
    undo = null;
    /** Each claimed (child, slot)'s AUTHORED BASE value, captured at first claim
     *  and kept across rearm. When a strategy vacates a slot (an axis flip, a
     *  layout swap) the slot reverts to this base — the authored cross-axis
     *  literal (`y = 15`) or the class default — instead of stranding whatever
     *  the arrangement last wrote (release() leaves the stored value; the
     *  restore is ours to make). */
    bases = new Map();
    /** Begin arranging `view` (the View.layout pusher's entry). One strategy
     *  arranges one view: a strategy is written per element, and sharing one
     *  across views would make its reactive attributes action-at-a-distance.
     *
     *  Alongside install, a SHAPE WATCHER stands guard: the set of slots a
     *  strategy manages can itself depend on its inputs (a ResponsiveLayout
     *  tier flip swaps row→stack and shares appear/disappear), and the
     *  installed claims were probed from one shape. The watcher re-derives the
     *  shape signature under tracking and REARMS on change — a rearm restores
     *  vacated slots to their authored bases (see `rearming`) and re-probes.
     *  It lives OUTSIDE the install/undo cycle (rearm must not dispose its own
     *  trigger) and is disposed only on detach. */
    attachTo(view) {
        if (this.view !== null) {
            throw new DeclareError(`this ${this.constructor.name} already arranges a ${this.view.constructor.name} — one strategy per view`);
        }
        this.view = view;
        this.parent = view; // navigation back-ref (not a children entry: the layout lives in view.layout)
        this.undo = this.install(view);
        let lastShape = null;
        const watcher = new Constraint(`${this.constructor.name} shape`, () => this.place().map((b) => BOX_SLOTS.filter(([k]) => b[k] !== undefined).map(([k]) => k).join()).join("|"), (sig) => {
            if (lastShape === null) {
                lastShape = sig;
            }
            else if (sig !== lastShape) {
                lastShape = sig;
                this.rearm();
            }
        });
        watcher.run();
        return () => {
            watcher.dispose();
            this.undo?.();
            this.undo = null;
            this.view = null;
            this.parent = null;
        };
    }
    /** True while rearm() swaps installs — unclaim restores authored bases only
     *  then. A full detach (layout = null, a strategy swap) keeps the last
     *  arranged values instead (the documented release semantics: the slot
     *  reverts to a plain stored value); a rearm within ONE strategy (an axis
     *  flip, a plan regime change) must not strand the old arrangement's
     *  offsets on slots the new install no longer drives. */
    rearming = false;
    /** Re-run install — the entry for a *structural* attribute change (axis),
     *  where the constraints' target slots themselves change. Value-level
     *  attributes (spacing) never need this: constraints read them under
     *  tracking and re-run through the ordinary machinery. */
    rearm() {
        if (this.view === null)
            return;
        const undo = this.undo;
        this.undo = null;
        this.rearming = true;
        try {
            undo?.();
            this.undo = this.install(this.view);
        }
        finally {
            this.rearming = false;
        }
    }
    /** The children this strategy arranges: the view's View children, honoring
     *  the `ignoreLayout` opt-out (LZX's rule — a decoration/overlay child owns
     *  its own position, both axes). Non-View members (a Dataset, an Animator, a
     *  State) are never laid. In child order — order is the layout semantics —
     *  and `place()`'s boxes align with this array BY INDEX. */
    laid() {
        const v = this.view;
        if (v === null)
            return [];
        return v.children.filter((c) => c instanceof View && c.ignoreLayout !== true);
    }
    /** Claim `slot` on `child` for constraint `k`: capture the authored base
     *  (first claim only — rearm must not capture the arrangement's own writes),
     *  then take ownership. Errors loudly on a standing AUTHOR binding (two
     *  owners), naming both sides. A *yielding* prior — auto-extent, auto-size,
     *  the runtime derive every child without an authored size carries — is not
     *  a second author: it yields to a layout's claim exactly as it yields to an
     *  author write (`own` disposes it), which is what lets a `place()` that
     *  returns sizes arrange children that never declared any. Refusing it here
     *  was the bug a data-driven treemap found (issue #16): every templated
     *  child auto-derives its size, so the arrangement died on a conflict the
     *  ownership machinery downstream was built to resolve — and the message
     *  blamed an authored binding that did not exist. */
    /** Per (child, slot) conflicts already reported — so a rearm storm (a
     *  shape-driven place() re-hitting the same author-owned slot every wave)
     *  says it ONCE, not per wave. Keyed by child identity, then slot. */
    reported = new WeakMap();
    /** An author bound a slot this strategy's place() also returns. The
     *  one-owner rule leaves the slot to its author; say so once, name the fix
     *  (`ignoreLayout` for a child that owns its own place), and let the rest
     *  of the arrangement install. Reported like the other mid-settle-contained
     *  defects (a thrown handler, a wedged reconcile) — loud, attributed, and
     *  survivable, never a settle-aborting throw. */
    reportConflict(child, slot, priorLabel, label) {
        let seen = this.reported.get(child);
        if (seen === undefined)
            this.reported.set(child, (seen = new Set()));
        if (seen.has(slot))
            return;
        seen.add(slot);
        const hint = slot === "x" || slot === "y"
            ? ` — drop the authored '${slot}', or set 'ignoreLayout = true' on the child to keep it`
            : ` — drop one of the two`;
        console.error(`[Declare] ${child.constructor.name}.${slot} is already bound (by ${priorLabel}), but ${label} also arranges it; leaving '${slot}' to the author${hint}`);
    }
    claim(child, slot, k) {
        // The blocking-owner conflict is pre-filtered in install() (a contained,
        // once-reported diagnostic — no longer a settle-aborting throw); a claim
        // reaching here has no non-yielding prior.
        const base = this.bases.get(child) ?? {};
        if (!(slot in base)) {
            base[slot] = child[slot];
            this.bases.set(child, base);
        }
        own(child, slot, k);
    }
    /** Release `k`'s claim of `slot` on `child`; during a rearm, restore the
     *  authored base (see `rearming` — a full detach keeps the last values).
     *  Does NOT dispose `k` — one constraint may back many slots (the pass), so
     *  disposal is the detacher's, once per distinct constraint. */
    unclaim(child, slot, k) {
        release(child, slot, k);
        if (!this.rearming)
            return;
        // While the windowing kernel owns this block's placement, a rearm's
        // base-restore must not clobber the logical positions it just wrote
        // (the suspension's other half — the pass skip alone leaves this
        // restore re-stacking every reconcile's rows at their captured bases).
        if (this.view !== null && isWindowedBlock(this.view))
            return;
        const base = this.bases.get(child);
        if (base !== undefined && slot in base) {
            setBound(child, slot, base[slot]);
        }
    }
    /** The label claims and conflict errors carry. A strategy with an `axis`
     *  attribute gets it tagged on ("App's SimpleLayout[y]") — sharp diagnostics
     *  for any axis-bearing strategy, library or native. */
    label() {
        const ax = this.axis;
        const tag = typeof ax === "string" ? `[${ax}]` : "";
        return `${this.view === null ? "?" : this.view.constructor.name}'s ${this.constructor.name}${tag}`;
    }
    /** Stand up standing constraints over `view`'s children from `place()` —
     *  the ONE kernel wiring every strategy shares. Each child's own probe box
     *  declares its managed slots (shape may vary per child: a Spacer carries
     *  its flexed size, a plan-shared child its width, a plain sibling only its
     *  position). POSITIONS and VISIBILITY ride one shared pass-constraint —
     *  compute place() once per wave, fan out equality-gated writes (the
     *  kernel-only one-engine-many-slots shape the header describes). SIZES get
     *  a percent-family constraint per (child, slot) — markPercent — because a
     *  kernel-driven size is parent-extent-derived by nature and must sit out
     *  of auto-extent's max (the cycle guard percent Lengths ride); positions
     *  stay unmarked so containers keep auto-extending around laid children.
     *  Transactional: on a mid-install error nothing stays owned. Children are
     *  read at install (tree mutation is R8's rearm). TweenLayout overrides
     *  this with its interpolating write path over the same place(). */
    install(_view) {
        const kids = this.laid();
        if (kids.length === 0)
            return () => { };
        const label = this.label();
        const probe = this.place();
        if (probe.length !== kids.length) {
            throw new DeclareError(`${label}.place() returned ${probe.length} boxes for ${kids.length} laid children — one box per child, by index`);
        }
        const passClaims = [];
        const sizeClaims = [];
        kids.forEach((child, i) => {
            const box = probe[i] ?? {};
            for (const [key, slot] of BOX_SLOTS) {
                if (box[key] === undefined)
                    continue;
                // CONFLICT CONTAINMENT (field report 2026-09-02): a place() that
                // returns a slot the CHILD ITSELF authored (`width = { … }`) cannot
                // claim it — the one-owner rule holds, and `ignoreLayout = true` is
                // the blessed way for a child to own its own geometry. Discovered
                // mid-settle on a shape-driven rearm, throwing here aborted the whole
                // settle (or, caught upstream, re-fired every wave — the 365-error
                // storm). Instead: report ONCE per (child, slot), leave the slot to
                // its author, and install everything else. A yielding prior
                // (auto-size) is NOT a conflict — the layout displaces it, as ever.
                const prior = ownerOf(child, slot);
                if (prior !== null && !prior.yielding) {
                    this.reportConflict(child, slot, prior.label, label);
                    continue;
                }
                if (key === "w" || key === "h")
                    sizeClaims.push({ child, slot, key, i });
                else
                    passClaims.push({ child, slot, key, i });
            }
        });
        const installed = [];
        const detach = () => {
            const seen = new Set();
            for (const o of installed) {
                if (!seen.has(o.k)) {
                    seen.add(o.k);
                    o.k.dispose();
                }
                this.unclaim(o.child, o.slot, o.k);
            }
        };
        try {
            if (passClaims.length > 0) {
                const pass = new Constraint(label, () => this.place(), (v) => {
                    // While the WINDOWING KERNEL owns this block's placement
                    // (materialization.md — a windowed vertical stack), the pass
                    // computes but does not apply: rows sit at their LOGICAL
                    // positions, and disengaging re-arms through childrenMutated.
                    if (this.view !== null && isWindowedBlock(this.view))
                        return;
                    const boxes = v;
                    for (const c of passClaims) {
                        const b = boxes[c.i];
                        if (b !== undefined && b[c.key] !== undefined)
                            setBound(c.child, c.slot, b[c.key]);
                    }
                });
                for (const c of passClaims) {
                    this.claim(c.child, c.slot, pass);
                    installed.push({ child: c.child, slot: c.slot, k: pass });
                }
                pass.run();
            }
            for (const c of sizeClaims) {
                const k = new Constraint(`${label} → ${c.child.constructor.name}.${c.slot}`, () => this.place()[c.i]?.[c.key], (v) => {
                    if (this.view !== null && isWindowedBlock(this.view))
                        return;
                    setBound(c.child, c.slot, v);
                });
                markPercent(k);
                this.claim(c.child, c.slot, k);
                installed.push({ child: c.child, slot: c.slot, k });
                k.run();
            }
        }
        catch (e) {
            detach();
            throw e;
        }
        return detach;
    }
}
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