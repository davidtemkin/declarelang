// Replication (language §9): "a node whose path matches many records
// produces one instance per record — replication is the ARTIFACT of the
// match resolving to many, not an imperative loop." A child element with
// `datapath = :items[]` is a template; the parent carries a Replicator — a
// standing computation on the R4 core whose inputs are the inherited cursor
// chain and the matched array region, and whose output is the reconciled set
// of child instances, in DATA ORDER (child order is semantic — the ruled
// exception — and replicated children take their data's order).
//
// Reconciliation is by item IDENTITY (===), first-fit for duplicates: the
// instance bound to a record follows that record. An insert makes exactly
// one new instance; a removal discards exactly one (its whole standing
// machinery retired via View.discard); a pure reorder MOVES live subtrees —
// no instance is rebuilt, no lifecycle re-fires, no item REGION cell wakes
// (cells are identity-anchored, data.ts). What a move does cost: each moved
// instance's cursor re-points (a different interned place), waking its
// `:path` reads once — they read the same record and the equality gate
// stops everything downstream (no push, no paint work). Unmoved instances'
// cursors intern to the same object and don't even do that.
// LZX's LzReplicationManager pooled clones by POSITION and re-bound their
// data — read for intent (the pool idea survives as instance reuse); the
// positional re-binding is what identity matching sheds: instance state
// stays with its record.
//
// Instances are full citizens: the whole construct pipeline runs per
// instance (methods, literals, bindings, classroot = the template's use-site
// scope, onInit — fired once, after the instance is linked and attached), so
// a replicated WeatherSummary behaves exactly like a written one.
//
// The block occupies the template's slot among its siblings: instances
// splice in at the position where the element was written. `prev` anchors it
// — the sibling Node constructed just before the template, or the previous
// Replicator when two blocks are adjacent (its last instance is the anchor,
// recursively, so empty blocks cost nothing).
//
// One reconcile per settle wave, one frame per mutation burst: the
// Replicator is an ordinary Constraint, so N data edits in a turn coalesce
// into one reconcile, whose Surface work lands in the backends' single rAF.
import { Node } from "./node.js";
import { View, inheritedCursor, onDiscard } from "./view.js";
import { Constraint } from "./reactive.js";
import { setBound } from "./attributes.js";
import { splitPath } from "./datapath.js";
export class Replicator {
    parent;
    path;
    classroot;
    make;
    prev;
    views = [];
    items = [];
    template;
    constraint;
    constructor(parent, element, path, classroot, make, 
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    prev) {
        this.parent = parent;
        this.path = path;
        this.classroot = classroot;
        this.make = make;
        this.prev = prev;
        // The instances' element is the template MINUS its many-path attribute:
        // each instance gets its record's cursor instead (written by reconcile).
        this.template = {
            ...element,
            attrs: element.attrs.filter((a) => !(a.name === "datapath" && a.value.kind === "path" && a.value.many)),
        };
        this.constraint = new Constraint(`${parent.constructor.name}'s replication (:${path}[])`, () => this.match(), (m) => this.reconcile(m));
    }
    /** First run (instantiate pass two — the tree is linked) + retire with the
     *  parent, so a discarded subtree's replicators can never wake again. */
    arm() {
        onDiscard(this.parent, () => this.constraint.dispose());
        this.constraint.run();
    }
    /** The tracked half: the inherited cursor chain + the array region. A
     *  non-array (unresolved, or scalar) matches nothing — zero instances,
     *  re-matched the moment the region becomes an array. */
    match() {
        const base = inheritedCursor(this.parent);
        if (base === null)
            return { data: null, arrayPath: [], items: [] };
        const arrayPath = [...base.path, ...splitPath(this.path)];
        const arr = base.data.read(arrayPath);
        return { data: base.data, arrayPath, items: Array.isArray(arr) ? arr : [] };
    }
    reconcile({ data, arrayPath, items }) {
        // Match records to existing instances by identity, first-fit in order.
        const pool = new Map();
        this.items.forEach((item, i) => {
            const q = pool.get(item);
            if (q !== undefined)
                q.push(this.views[i]);
            else
                pool.set(item, [this.views[i]]);
        });
        const next = [];
        const fresh = new Map();
        for (const item of items) {
            const reuse = pool.get(item)?.shift();
            if (reuse !== undefined) {
                next.push(reuse);
            }
            else {
                const made = this.make(this.template, this.classroot);
                fresh.set(made.view, made.finish);
                next.push(made.view);
            }
        }
        const removed = [];
        for (const q of pool.values())
            removed.push(...q);
        const changed = fresh.size > 0 || removed.length > 0 || next.some((v, i) => this.views[i] !== v);
        if (changed) {
            // Re-link the block in data order at its slot among the siblings.
            for (const v of this.views)
                this.parent.removeChild(v);
            let at = this.start();
            const end = at + next.length;
            for (const v of next)
                this.parent.insertChild(v, at++);
            for (const v of removed)
                v.discard();
            // Mirror the order across the seam: walk backwards so each surface
            // lands before its successor's (fresh attach and kept move alike).
            const ps = this.parent.surface;
            if (ps !== null && this.parent.backend !== null) {
                let before = this.surfaceAfter(end);
                for (let i = next.length - 1; i >= 0; i--) {
                    const v = next[i];
                    if (v.surface === null)
                        v.attach(this.parent.backend, ps, before);
                    else
                        ps.insertChild(v.surface, before);
                    before = v.surface;
                }
            }
        }
        // Cursors, uniformly: the interned handle equality-gates every instance
        // whose place is unchanged; a moved instance's bindings re-read equal
        // values and the wave dies at the attribute layer's gate.
        next.forEach((v, i) => {
            setBound(v, "datapath", data === null ? null : data.cursorAt([...arrayPath, String(i)]));
        });
        this.views = next;
        this.items = [...items];
        // New instances finish (bindings + init) linked, attached, and cursored.
        for (const finish of fresh.values())
            finish();
        if (changed)
            this.parent.childrenMutated(); // one re-arm per burst
    }
    /** Where the block starts right now: after its anchor. */
    start() {
        const anchor = lastNodeOf(this.prev);
        return anchor === null ? 0 : this.parent.children.indexOf(anchor) + 1;
    }
    /** The first live surface after the block — the `before` reference the
     *  re-inserted surfaces stack up against (null = the parent's end). */
    surfaceAfter(index) {
        for (let i = index; i < this.parent.children.length; i++) {
            const sib = this.parent.children[i];
            if (sib instanceof View && sib.surface !== null)
                return sib.surface;
        }
        return null;
    }
    /** @internal The block's last instance — the next block's anchor. */
    last() {
        return this.views.length > 0 ? this.views[this.views.length - 1] : lastNodeOf(this.prev);
    }
}
function lastNodeOf(prev) {
    if (prev === null)
        return null;
    return prev instanceof Replicator ? prev.last() : prev;
}
//# sourceMappingURL=replicate.js.map