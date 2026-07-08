import { Node } from "./node.js";
import { View } from "./view.js";
import { Constraint } from "./reactive.js";
import type { Element } from "./parser.js";
/** One captured override: the target slot and a factory that builds a FRESH
 *  driving Constraint against the target view on each apply (ephemerality —
 *  states.md §3). A literal's factory returns the constant; a `{ }` override's
 *  returns the compiled expression, which tracks live only while it is the top
 *  of its slot's stack. */
export interface Override {
    slot: string;
    make: (target: View) => Constraint;
}
export declare class State extends Node {
    applied: boolean;
    /** Value overrides on the enclosing view. */
    overrides: Override[];
    /** Conditional child templates, the build-time materializer, and the
     *  classroot their bodies' members bind to (the state's use site). */
    childTemplates: readonly Element[];
    materialize: ((t: Element, croot: View) => {
        view: View;
        finish: () => void;
    }) | null;
    childClassroot: View | null;
    /** Declaration-order precedence, cached at init before any child inserts. */
    private priority;
    /** Whether the effects are currently installed (idempotency guard). */
    private installed;
    /** The live child views this state instantiated, for teardown. */
    private builtChildren;
    /** Cache declaration-order precedence the moment the state is linked under its
     *  view (appendChildren, pass one) — before any gate fires in pass two and
     *  before sibling states insert children, so the index is pure source order
     *  (states.md §3: later-declared wins). */
    onLinked(): void;
    /** Apply the initial value once the tree is linked (initTree). A gated state
     *  has usually already synced from its gate's first run in pass two — this is
     *  idempotent — but a literal `applied = true` (no gate) applies here. */
    init(): void;
    apply(): void;
    remove(): void;
    toggle(): void;
    /** The verbs' one write path: reject when a declarative gate owns `applied`
     *  (states.md §2 — gate XOR verbs), else drive through setBound (→ push →
     *  sync), the sanctioned path, not a raw assignment. */
    private drive;
    /** Install or remove this state's effects. Idempotent, and a no-op until the
     *  enclosing view is linked (the initial sync runs from init()). */
    sync(v: boolean): void;
    /** Instantiate the conditional subtree into the target at the state's slot
     *  (just after the state node), attach live surfaces, fire init — the same
     *  construct/finish path replicate.ts runs per record. */
    private buildChildren;
    /** Retire the subtree: discard each built view's standing machinery and
     *  surface, unlink it, and drop any name it bound. */
    private teardownChildren;
    /** Fire a carried handler if installed (onApply / onRemove) — a plain Node
     *  dispatch, like the Animator's on* firing. */
    private fire;
}
