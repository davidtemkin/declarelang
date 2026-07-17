import { Constraint } from "./reactive.js";
/** One attribute's class-level declaration: its default, the Surface push a
 *  change makes (absent for purely model-side attributes), whether it is
 *  `prevailing` (styling rung: an unset slot follows the nearest providing
 *  ancestor, live), and an optional value-equality predicate (decoration
 *  values gate on shallow structural equality, not identity). */
export interface AttrSpec<S, V> {
    def: V;
    push?: (self: S, v: V) => void;
    prevailing?: boolean;
    equal?: (a: V, b: V) => boolean;
    /** A declaration default that is a BINDING (styling rung — `labelColor:
     *  Color = { theme.buttonText }`): evaluated live, per instance, with
     *  `this` = the instance, whenever the slot is unprovided (and, on a
     *  prevailing slot, unfollowed) — the chain's rank-1 end. Never installed,
     *  so it can never contend with an offer. */
    defBinding?: (this: unknown, parent: unknown, classroot: unknown) => unknown;
    /** The default binding's classroot: an inline (use-site) declaration binds
     *  outward, a class-body declaration binds the instance itself (R6's
     *  member-origin rule, applied to declarations). */
    defOuter?: boolean;
    /** A `readonly` declaration (schema.readOnly): the accessor's setter throws —
     *  the slot's value comes only from its `{ }` default (`defBinding`), read
     *  live and never overridden. checkAttr already refuses a declarative
     *  assignment; this is the runtime backstop for an imperative write. */
    readOnly?: boolean;
    /** The W3C CSS property that feeds this attribute (e.g. "background-color"),
     *  and the coercer turning a raw CSS value string into this attr's value.
     *  Both must be present for the CSS channel (css-apply.ts) to target it. */
    css?: string;
    coerce?: (raw: string) => unknown;
}
type CssEntry = {
    attr: string;
    coerce: (raw: string) => unknown;
};
/** Declare a class's reactive attributes: defaults + pushes, installed as
 *  prototype accessors. Call once per class, at module load, right under the
 *  class declaration (whose fields are `declare`d — the accessors here are
 *  their implementation). */
export declare function defineAttributes<S extends object>(ctor: abstract new () => S, specs: {
    [K in keyof S & string]?: AttrSpec<S, S[K]>;
}): void;
/** The class's reverse CSS map: cssProp → { attr, coerce }. Empty for a class
 *  (and its bases) that declare no `css:` attributes. */
export declare function cssMap(ctor: Function): Record<string, CssEntry>;
/** A runtime-side write: a constraint's apply, auto-size, a load result.
 *  Same store/push/wake as the setter, but it neither marks the slot as
 *  author-set nor consults ownership (the caller *is* the owner). */
export declare function setBound(self: object, name: string, v: unknown): void;
/** A runtime-side ADDITIVE write: land `current + delta` on a numeric slot —
 *  the animation additive core (animation.md §4.2, LaszloAnimation.lzs:444–448:
 *  `target.setAttribute(attr, targ[attr] + (value − currentValue))`). Two
 *  animators writing deltas to one slot therefore COMPOSE instead of clobbering:
 *  each reads the live value (others' contributions already folded in) and adds
 *  its own increment. A zero delta is a no-op (nothing to store, push, or wake —
 *  the same cascade-stopping the equality gate gives an absolute re-write). */
export declare function addBound(self: object, name: string, delta: number): void;
/** Install a stylesheet field's value on an unprovided slot. */
export declare function stylesheetWrite(self: object, name: string, v: unknown): void;
/** Withdraw a stylesheet field (the entry no longer offers it, or an author
 *  provision now outranks it). When the slot is otherwise unprovided the
 *  stored value is removed so reads fall back through the ordinary chain
 *  (follow → declaration default), dependents wake, and the slot's Surface
 *  state is re-pushed with the now-effective value. */
export declare function stylesheetClear(self: object, name: string): void;
/** The applier's bookkeeping: which slots this view's stylesheet currently
 *  colors. */
export declare function stylesheetMarks(self: object): ReadonlySet<string> | undefined;
/** Was this slot ever author-set (a literal, or a direct assignment)?
 *  The R4 replacement for R3's 0-as-unset: auto-size asks this, so an
 *  explicit `width=0` now means zero, not "measure me". */
export declare function isSet(self: object, name: string): boolean;
/** The slot's class-level default — what a `:path` binding falls back to
 *  when the path is unresolved (the doc's rule, language §9). */
export declare function defaultOf(self: object, name: string): unknown;
/** What this slot would be worth if the view did NOT provide it: the
 *  prevailing follow (tracked, when read under tracking), else the class
 *  default. The ruled fallback for an unresolved `:path` on a prevailing
 *  slot — the declaration default is just the chain's end, so "unresolved →
 *  the followed value" is the consistent generalization (ruling item 15). */
export declare function followedValue(self: object, name: string): unknown;
/** Retire every constraint that owns a slot on `self` — the teardown half a
 *  removed view needs (R8's replication is the first thing that removes):
 *  disposed constraints unlink from their Cells, so a later data or
 *  attribute change can never wake work for a dead view. */
export declare function disposeBindings(self: object): void;
/** Drop a slot's owner record WITHOUT disposing (states.md §3: the last state
 *  override leaving a formerly-unowned slot has already retired its own driver
 *  and now reverts the slot to a plain stored value — the caller restores it). */
export declare function disown(self: object, name: string): void;
/** The constraint (if any) that owns this slot's value. */
export declare function ownerOf(self: object, name: string): Constraint | null;
/** Tooling reads (inspect.ts): the node's OWN attribute values (writes and
 *  bound results — `$attrs`, the instance overlay over the class defaults),
 *  and the slot names currently owned by constraints. Snapshots, not live. */
export declare function ownValues(self: object): Record<string, unknown>;
export declare function ownedSlots(self: object): string[];
/** Record that `c` is a percent binding (called by bindPercent). */
export declare function markPercent(c: Constraint): void;
/** Is `self.name` owned by a percent binding — a slot whose value resolves
 *  against the parent's extent on that axis? */
export declare function percentOwned(self: object, name: string): boolean;
/** Record `c` as the owner of `self.name`. One declarative owner per slot:
 *  a second binding is a defect upstream (check flags duplicate attributes),
 *  so it fails loudly here rather than silently stacking. The one exception
 *  mirrors the write path above: a *yielding* runtime derive (auto-extent,
 *  auto-size) yields to an author binding exactly as it yields to an author
 *  write — reached when replication attaches an instance (installing
 *  auto-extent) before its bindings finish. */
export declare function own(self: object, name: string, c: Constraint): void;
/** Release `c`'s ownership of `self.name` — the uninstall half of `own`,
 *  for owners that retire as a unit (a layout strategy detaching). Guarded on
 *  identity so a stale detach can never evict a newer owner. */
export declare function release(self: object, name: string, c: Constraint): void;
/** Install a runtime-supplied, *yielding* derive (Text auto-size, View
 *  auto-extent, and any future runtime-computed slot): the same Constraint
 *  machinery authors get, flagged so a direct author write displaces it
 *  instead of erroring. Returns the constraint so an installer that must
 *  re-run it on a non-tracked fact (auto-extent on tree mutation — `children`
 *  is not a reactive collection) can hold it. */
export declare function bindDerived(self: object, name: string, compute: () => unknown): Constraint;
export {};
