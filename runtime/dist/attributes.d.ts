import { Constraint } from "./reactive.js";
import { type Where } from "./errors.js";
/** One attribute's class-level declaration: its default, the Surface push a
 *  change makes (absent for purely model-side attributes), and an optional
 *  value-equality predicate (decoration values gate on shallow structural
 *  equality, not identity). */
export interface AttrSpec<S, V> {
    def: V;
    push?: (self: S, v: V) => void;
    equal?: (a: V, b: V) => boolean;
    /** A declaration default that is a BINDING (`fontSize: number = provided(
     *  "fontSize", 16)`): evaluated live, per instance, with `this` = the
     *  instance, whenever the slot is unset — the chain's rank-1 end. Never
     *  installed, so it can never contend with a direct write. */
    defBinding?: (this: unknown, parent: unknown, classroot: unknown) => unknown;
    /** The `{ }` default of a NUMERIC declared slot (`bodyW: number = { … }`)
     *  is served by a STANDING yielding rule installed at construction
     *  (instantiate.ts → bind.ts bindDeclDefault), not by the live fallback:
     *  the slot lives in the kernel table (a cell the EXPR bodies read; one
     *  evaluation per input change instead of one per read — declare.md's
     *  rule for a `{ }`). `defBinding` stays as the fallback for an instance
     *  whose slot left the table (escape). */
    defRule?: boolean;
    /** The default binding's classroot: an inline (use-site) declaration binds
     *  outward, a class-body declaration binds the instance itself (R6's
     *  member-origin rule, applied to declarations). */
    defOuter?: boolean;
    /** A `readonly` declaration (schema.readOnly): the accessor's setter throws —
     *  the slot's value comes only from its `{ }` default (`defBinding`), read
     *  live and never overridden. checkAttr already refuses a declarative
     *  assignment; this is the runtime backstop for an imperative write. */
    readOnly?: boolean;
    /** Called ONCE per instance, at the first TRACKED read of this slot — the
     *  pay-per-use trigger for facts whose FEED costs something to stand up
     *  (View.onScreen arms a backend visibility watch). An untracked read never
     *  fires it: a fact nobody binds needs no feeder. Costs one WeakSet probe
     *  per tracked read, and only on slots that declare it. */
    onTrack?: (self: S) => void;
    /** A LIVE answer for UNTRACKED readers (a handler, a method, the Inspector):
     *  the stored value is what tracked readers see — the value as of the last
     *  write, the cell bumping on change, the reactive contract untouched —
     *  while an untracked read samples the world at that moment. Time's facts
     *  (time.ts): `clock.second` in a handler is the real second, whatever the
     *  declared tick. Never consulted under tracking. */
    live?: (self: S) => V;
    /** A view for TRACKED readers — `live`'s dual: transforms the stored value
     *  on its way into a { } (never to an untracked read). Dataset.value
     *  (data.ts) hands tracked readers a TRACKING VIEW of its tree, so plain
     *  property chains subscribe to the same per-key region cells read([…])
     *  uses (#15 / open-items L-23). Applied on the plain-storage path only —
     *  no carrier of this hook follows or defBinds. */
    tracked?: (self: S, v: V) => V;
}
/** The instance and slot a kernel cell belongs to, when it is a numeric block
 *  slot — the push sweep's lookup, exposed for tooling that names cells (the
 *  wake trace). null for a cell that is no instance slot. */
export declare function slotOfCell(cell: number): {
    view: object;
    name: string;
    kind: "n" | "b";
} | null;
/** The kernel cell of `self.name` when it is a table slot of this instance
 *  (numeric, not escaped, not retired); −1 otherwise. Allocates the block.
 *  The EXPR binder resolves its read paths and its target through this. */
export declare function slotCellOf(self: object, name: string): number;
/** Is `self.name` a boolean slot (a kernel-written 0/1 lands as true/false)? */
export declare function slotIsBoolean(self: object, name: string): boolean;
/** A node has moved to a different parent: its subtree's chains changed, and
 *  nothing else's did, so clear those memos and leave every other node's
 *  standing. Called from Node's linking verbs — NOT from a re-link that puts a
 *  child back under the same parent (replication does that to every row of a
 *  block on any change, and flushing there would empty the memo exactly where
 *  the reads are hottest). */
export declare function providedChainMoved(root: {
    children?: readonly unknown[];
}): void;
/** Set a provision on a node — the value a descendant's `provided("name")`
 *  reads when this node is the nearest provider. Equality-gated, and wakes the
 *  readers below. Both a literal provision and a bound one (whose `{ }`
 *  re-derives) land here. */
/** The value a node PROVIDES locally under `name` (its own provision), or
 *  undefined if it provides none. The DOM selection surface reads this: a
 *  container that provides `selectable = true` becomes a selection region so a
 *  gap press between its leaves anchors on it. */
export declare function localProvision(self: object, name: string): unknown;
/** Remember that the USE SITE wrote a geometry literal here, and where
 *  (instantiate.ts, at the one site that assigns a checked literal).
 *
 *  THE USE SITE ONLY, deliberately. A literal in a CLASS BODY — `class Spacer
 *  extends View [ width = 0 ]`, `class Pane extends View [ x = 40, … ]` — is
 *  how the language spells a class default for an inherited slot: it is
 *  written without knowing where an instance will live, and the class may be
 *  used in five places of which one has a sizing layout. A literal at the use
 *  site is written INTO the very tree whose arrangement is visible on the line
 *  above it. Only the second is a statement about this arrangement, and only it
 *  is worth a word. (Measured: reporting class bodies too fires on the
 *  library's own Spacer in every flow that sizes one.)
 *
 *  `where` is absent on a compiled artifact — declarec strips positions — so
 *  the entry still lands, valueless: the report is worth making without a line,
 *  and every reader degrades. */
export declare function noteUseSiteSet(self: object, name: string, where: Where | undefined): void;
/** Did the USE SITE write a literal into this geometry slot? */
export declare function useSiteSet(self: object, name: string): boolean;
/** Where that literal was written, or null (not a use-site literal, or a
 *  positionless artifact). */
export declare function setPosOf(self: object, name: string): Where | null;
export declare function provideWrite(self: object, name: string, value: unknown): void;
/** Declare a class's reactive attributes: defaults + pushes, installed as
 *  prototype accessors. Call once per class, at module load, right under the
 *  class declaration (whose fields are `declare`d — the accessors here are
 *  their implementation). */
export declare function defineAttributes<S extends object>(ctor: abstract new () => S, specs: {
    [K in keyof S & string]?: AttrSpec<S, S[K]>;
}): void;
/** A class's slot index for a numeric attribute (−1 if it is not one) — the
 *  kernel's view layout is built from these (view.ts). */
export declare function slotIndex(ctor: object, name: string): number;
/** The instance's numeric block (allocating it), for kernel rules that read
 *  the view's slots directly. */
export declare function blockOf(self: object): number;
/** The read behind `provided("name")` — a value an ancestor makes available
 *  under `name`, read explicitly by a descendant. Resolved by NAME: the walk
 *  climbs the parent chain, nearest first, and the first ancestor that either
 *  carries a provision under `name` (a set of a name its class does not declare,
 *  `App [ accent = #E05252 ]`) or whose class declares an attribute `name`
 *  (`App [ density: number = 2 ]`, or an ordinary slot a descendant names)
 *  answers with its effective value. Any named ancestor slot is reachable by a
 *  descendant that names it — the read is the visible, deliberate one.
 *
 *  The walk starts at the PARENT (a reader never resolves against its own slot —
 *  that is what makes `Text`'s `fontSize = provided("fontSize", 16)` default
 *  terminate instead of reading itself). Every consulted level is a tracked
 *  read, so a provision changing — or the tree restructuring — re-roots exactly
 *  the readers below. `hasDefault` supplies the createContext-style terminal
 *  (`provided("fontSize", 15)`): when nothing above provides the name, a
 *  defaulted read returns the default and a bare (required) read throws, naming
 *  the missing value. */
/** A slot's default binding that reads the nearest provided value, falling to
 *  `def`. This is how the text leaves (Text, RichText, TextInput) declare their
 *  face slots — `fontSize: number = provided("fontSize", 16)` — so a bare run
 *  inherits its region's style (a container provides it) yet a bare, unprovided
 *  run still has a sensible default. The provided read is skipped once the slot
 *  is set locally (the accessor evaluates a defBinding only on an unset slot),
 *  so `Text [ fontSize = 70 ]` overrides without consulting the tree. */
export declare function providedDefault(name: string, def: unknown): (this: unknown) => unknown;
/** THE TEXT FACE, name by name, with the default each falls to when nothing above
 *  provides it. The ONE source: `Text` builds its face slots' defBindings from
 *  this table, and `providedTextStyle()` (Node) assembles the same five reads
 *  into a `TextStyle`. They cannot drift, which matters because a measurement
 *  taken with different defaults than the run it is measuring is silently wrong.
 *  Only these five are provided; the rest of `TextStyle` (italic, small caps,
 *  numerals, the treatments) is per-run and nobody provides it. */
export declare const PROVIDED_FACE: readonly (readonly [string, unknown])[];
/** The face table as `defineAttributes` entries — what a text leaf declares. */
export declare function faceSlots(): Record<string, {
    def: unknown;
    defBinding: (this: unknown) => unknown;
}>;
export declare function providedRead(self: object, name: string, hasDefault: boolean, dflt: unknown): unknown;
/** A runtime-side write: a constraint's apply, auto-size, a load result.
 *  Same store/push/wake as the setter, but it neither marks the slot as
 *  author-set nor consults ownership (the caller *is* the owner). */
export declare function setBound(self: object, name: string, v: unknown): void;
/** The rule's OWN apply: the table write without the displacement check. */
export declare function writeOwned(self: object, name: string, v: unknown): void;
/** Is the slot set directly or owned by a constraint — the rank-1 fallback's
 *  "unset" test (a declared default rule installs only on an unset slot). */
export declare function isSetOrOwned(self: object, name: string): boolean;
/** A runtime-side ADDITIVE write: land `current + delta` on a numeric slot —
 *  the animation additive core (animation.md §4.2, LaszloAnimation.lzs:444–448:
 *  `target.setAttribute(attr, targ[attr] + (value − currentValue))`). Two
 *  animators writing deltas to one slot therefore COMPOSE instead of clobbering:
 *  each reads the live value (others' contributions already folded in) and adds
 *  its own increment. A zero delta is a no-op (nothing to store, push, or wake —
 *  the same cascade-stopping the equality gate gives an absolute re-write). */
export declare function addBound(self: object, name: string, delta: number): void;
/** Was this slot ever author-set (a literal, or a direct assignment)?
 *  The R4 replacement for R3's 0-as-unset: auto-size asks this, so an
 *  explicit `width=0` now means zero, not "measure me". */
export declare function isSet(self: object, name: string): boolean;
/** The kernel cell ids of every slot of `self`'s a rule could have read: its
 *  NUMERIC BLOCK (x, y, width, height, visible, scale… — the table slots,
 *  allocated as one contiguous run) plus the JS cells of the rest, which exist
 *  only once something tracked a read (pay-per-use; an unobserved one owns
 *  none). The one way to ask "does that constraint read anything of THIS
 *  object's?" without a reverse index: collect these, hand them to
 *  `Constraint.readsAny`. Used by a layout to tell a parent extent that
 *  measures its own laid children from one that does not (layout.ts
 *  `viewExtent`).
 *
 *  Until 2026-09-21 this returned the JS cells alone — a rule the kernel arc
 *  made hollow, since a child's geometry has no JS cell any more: an owner
 *  like `{ this.contentWidth + 32 }` reads the children through the table,
 *  and the answer was always "no", masked at boot by the `!isSet` window. */
export declare function cellIdsOf(self: object): number[];
/** The slot's class-level default — what a `:path` binding falls back to
 *  when the path is unresolved (the doc's rule, language §9). */
export declare function defaultOf(self: object, name: string): unknown;
/** Retire every constraint that owns a slot on `self` — the teardown half a
 *  removed view needs (R8's replication is the first thing that removes):
 *  disposed constraints unlink from their Cells, so a later data or
 *  attribute change can never wake work for a dead view. */
export declare function disposeBindings(self: object): void;
/** Drop a slot's owner record WITHOUT disposing (states.md §3: the last state
 *  override leaving a formerly-unowned slot has already retired its own driver
 *  and now reverts the slot to a plain stored value — the caller restores it). */
export declare function disown(self: object, name: string): void;
/** Return a retiring node's kernel cells (view.ts teardown): a freed cell
 *  drops its subscribers, so nothing can ever wake work for a dead view. */
export declare function freeCells(self: object): void;
/** The constraint (if any) that owns this slot's value. */
export declare function ownerOf(self: object, name: string): Constraint | null;
export interface DeclRecord {
    /** The `{ }` default's source text, null for a plain (literal) declaration. */
    source: string | null;
    pos: {
        line: number;
        col: number;
    } | null;
    /** The compiler's extracted read-paths for the default, when they rode along. */
    deps: readonly string[] | null;
    /** The declared TYPE name, verbatim ("number", "array", …). */
    type?: string;
    /** Declared `external` — an island-boundary slot (parser.ts AttrDecl). The
     *  bridge enumerates an instance's boundary via these records. */
    external?: boolean;
    /** Declared `readonly` — with external, an out-fact the host cannot write. */
    readOnly?: boolean;
}
/** Record a class's author declarations (instantiate.ts makeClass). */
export declare function recordDeclarations(ctor: object, table: Record<string, DeclRecord>): void;
/** Every author-declared slot visible on this instance — the class's own and
 *  its user superclasses', merged up the prototype chain (runtime base
 *  classes never register, so View's built-ins stay out of the answer). */
export declare function declarationsOf(self: object): Record<string, DeclRecord>;
/** Tooling reads (inspect.ts): the node's OWN attribute values (writes and
 *  bound results — `$attrs`, the instance overlay over the class defaults),
 *  and the slot names currently owned by constraints. Snapshots, not live. */
export declare function ownValues(self: object): Record<string, unknown>;
export declare function ownedSlots(self: object): string[];
/** Run `f` with its direct writes exempt from the divergence bit. */
export declare function asRuntimeWrite<T>(f: () => T): T;
/** Arm divergence tracking on one node (the replicator walks the instance
 *  subtree after finish). */
export declare function armDivergence(self: object): void;
/** Has this node received a direct write since it was armed? */
export declare function nodeDiverged(self: object): boolean;
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
