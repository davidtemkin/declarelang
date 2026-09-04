// Reactive attributes — the bridge between "a typed field on a View" and the
// reactive core. Each component class declares its attributes once (default
// value + which Surface call a change pushes), and this module installs them
// as prototype accessors so that, per the language (§7):
//
//   - a bare read (`this.width`) *is* the tracked read — inside a running
//     Constraint it registers a dependency; outside one it is a plain field
//     read (one pointer comparison of overhead);
//   - a bare write (`view.width = 10`) *is* the setter — it stores, pushes
//     exactly the affected Surface call (the R0 fine-grained-setter payoff),
//     and wakes exactly the constraints that actually read this slot. There
//     is no setAttribute and no bypass to forget.
//
// Storage is pay-per-use throughout: an instance that is never written owns
// no value store (reads fall through a prototype chain of class defaults);
// a slot nobody observes owns no Cell; only bound slots own an owner record.
// Writes are equality-gated (===) — the change-deduping R1 deliberately left
// to this rung, so a constraint re-producing the same value stops the cascade
// cold: no push, no dependent wake.
//
// "Was set" is first-class here (replacing R3's 0-as-unset stand-in): a slot
// written by the author — a literal or a direct assignment — is *set*; a
// slot written by the runtime (a constraint's apply, auto-size) is not.
// Ownership is the other half: an author `{ }` constraint owns its slot and a
// direct write to it is an error (one declarative owner — the silent-clobber
// bug is unrepresentable); a runtime-supplied derive yields to a direct write.

import { Cell, Constraint, isTracking } from "./reactive.js";
import { DeclareError, layoutConflictMessage } from "./errors.js";

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

type Push = (self: object, v: unknown) => void;
type Equal = (a: unknown, b: unknown) => boolean;

// Class → its attribute tables. All are prototype-chained objects mirroring
// the class hierarchy (Text's defaults chain to View's), so "nearest declared
// wins" is a plain property lookup — the same shape schema.ts's chain walk
// gives the checker, expressed in the runtime's own currency.
const DEFAULTS = new WeakMap<object, Record<string, unknown>>();
const PUSHERS = new WeakMap<object, Record<string, Push | undefined>>();
const PREVAILING = new WeakMap<object, Record<string, boolean | undefined>>();
const EQUALS = new WeakMap<object, Record<string, Equal | undefined>>();

/** What one instance lazily grows; every piece absent until first needed. */
interface Carrier {
  /** Own values, prototype-chained to the class defaults. */
  $attrs?: Record<string, unknown>;
  /** Dependency nodes, created on first *tracked* read of a slot. */
  $cells?: Record<string, Cell>;
  /** Slot owners (constraints/derives). */
  $owners?: Record<string, Constraint>;
  /** Author-set slot names (literals + direct writes). */
  $set?: Set<string>;
  /** Stylesheet-provided slot names (the styling rung's rank-2 offers —
   *  installed by the per-view applier, cleared on swap; below every author
   *  provision, above the follow and the declaration default). */
  $stylesheetMarks?: Set<string>;
}

/** Walk the constructor chain to the nearest class with a table, memoizing
 *  the answer for classes that declare nothing of their own (App). Classes
 *  declare their attributes at module load, before any instance exists, so
 *  the memo can never capture a stale answer. */
function tableFor<T>(map: WeakMap<object, T>, ctor: object): T | null {
  let c: object | null = ctor;
  while (c !== null && c !== Function.prototype) {
    const t = map.get(c);
    if (t !== undefined) {
      if (c !== ctor) map.set(ctor, t);
      return t;
    }
    c = Object.getPrototypeOf(c);
  }
  return null;
}

/** Declare a class's reactive attributes: defaults + pushes, installed as
 *  prototype accessors. Call once per class, at module load, right under the
 *  class declaration (whose fields are `declare`d — the accessors here are
 *  their implementation). */
export function defineAttributes<S extends object>(
  ctor: abstract new () => S,
  specs: { [K in keyof S & string]?: AttrSpec<S, S[K]> }
): void {
  const parent = Object.getPrototypeOf(ctor) as object;
  const defaults: Record<string, unknown> = Object.create(tableFor(DEFAULTS, parent));
  const pushers: Record<string, Push | undefined> = Object.create(tableFor(PUSHERS, parent));
  const prevailing: Record<string, boolean | undefined> = Object.create(tableFor(PREVAILING, parent));
  const equals: Record<string, Equal | undefined> = Object.create(tableFor(EQUALS, parent));
  for (const name of Object.keys(specs) as (keyof S & string)[]) {
    const spec = specs[name]!;
    defaults[name] = spec.def;
    pushers[name] = spec.push as Push | undefined;
    prevailing[name] = spec.prevailing;
    equals[name] = spec.equal as Equal | undefined;
    const follows = spec.prevailing === true;
    const defBinding = spec.defBinding;
    const defOuter = spec.defOuter === true;
    const readOnly = spec.readOnly === true;
    const onTrack = spec.onTrack as ((self: object) => void) | undefined;
    const trackedOnce = onTrack !== undefined ? new WeakSet<object>() : null;
    const live = spec.live as ((self: object) => unknown) | undefined;
    const trackedHook = spec.tracked as ((self: object, v: unknown) => unknown) | undefined;
    Object.defineProperty(ctor.prototype, name, {
      get(this: object): unknown {
        const self = this as Carrier;
        if (isTracking()) {
          cellFor(self, name).track();
          if (trackedOnce !== null && !trackedOnce.has(self)) { trackedOnce.add(self); onTrack!(self); }
        } else if (live !== undefined) {
          return live(self);
        }
        if ((follows || defBinding !== undefined) && !provided(self, name)) {
          // A prevailing slot with no local provision FOLLOWS the nearest
          // providing ancestor (styling rung) — `defaults` is the DECLARING
          // class's own table, which is the slot's identity (two unrelated
          // classes declaring one spelling are two attributes; a shared base
          // is one — the ruled lean).
          if (follows) {
            const v = followRead(self, name, defaults);
            if (v !== NOTHING) return v;
          }
          // The chain's end: a declaration default that is a binding
          // evaluates live, per instance (unless a runtime write — an Image's
          // natural size — left instance storage; storage wins, as a literal
          // default would lose to it).
          if (defBinding !== undefined && (self.$attrs === undefined || !Object.hasOwn(self.$attrs, name))) {
            return evalDefault(self, name, defBinding, defOuter);
          }
        }
        const v = (self.$attrs ?? defaults)[name];
        return trackedHook !== undefined && isTracking() ? trackedHook(self, v) : v;
      },
      set(this: object, v: unknown): void {
        if (readOnly) {
          throw new DeclareError(
            `${this.constructor.name}.${name} is read-only — it is computed from its declaration and cannot be assigned`
          );
        }
        const self = this as Carrier;
        // The divergence bit (materialization.md §2): a DIRECT write on an
        // armed node marks it diverged — local state reconstruction could
        // not reproduce. One WeakSet probe on the author-write path only
        // (setBound — constraint applies, runtime derives — never lands
        // here), armed only for replicated-instance subtrees.
        if (RUNTIME_WRITE === 0 && ARMED.has(self)) DIVERGED.add(self);
        // A first write to a prevailing slot changes what it MEANS (following
        // → providing) even when the written value equals the stored default,
        // so the equality gate below cannot be the only wake.
        const becameProvider = follows && !provided(self, name);
        const owner = self.$owners?.[name];
        if (owner !== undefined) {
          if (!owner.yielding) {
            throw new DeclareError(owner.arrangedBy !== null
              ? layoutConflictMessage(this.constructor.name, name, owner.arrangedBy, null)
              : `${this.constructor.name}.${name} is bound by a constraint (${owner.label}) — a direct write would be silently overwritten; change what the constraint reads instead`
            );
          }
          owner.dispose(); // a runtime derive yields: the author takes over
          delete self.$owners![name];
        }
        (self.$set ??= new Set()).add(name);
        write(this, name, v);
        if (becameProvider) self.$cells?.[name]?.changed();
      },
    });
  }
  DEFAULTS.set(ctor, defaults);
  PUSHERS.set(ctor, pushers);
  PREVAILING.set(ctor, prevailing);
  EQUALS.set(ctor, equals);
}

/** Does this slot have a LOCAL provision — an author set (literal or direct
 *  write), an owning binding, or a stylesheet entry's installed offer?
 *  Anything less is "unset", which on a prevailing slot means *following*. */
function provided(self: Carrier, name: string): boolean {
  return (
    (self.$set?.has(name) ?? false) ||
    self.$owners?.[name] !== undefined ||
    (self.$stylesheetMarks?.has(name) ?? false)
  );
}

/** followRead's "no provider anywhere" — distinct from a provided null. */
const NOTHING: unique symbol = Symbol("no provider");

// Default-binding evaluation, re-entrancy-guarded: a default reading its own
// slot (directly or through a cycle of defaults) is a defect, named rather
// than overflowed.
const EVALING = new WeakMap<object, Set<string>>();

function evalDefault(
  self: Carrier,
  name: string,
  fn: (this: unknown, parent: unknown, classroot: unknown) => unknown,
  outer: boolean
): unknown {
  let inFlight = EVALING.get(self);
  if (inFlight?.has(name) === true) {
    throw new DeclareError(
      `${self.constructor.name}.${name}'s default binding (transitively) reads itself`
    );
  }
  if (inFlight === undefined) EVALING.set(self, (inFlight = new Set()));
  inFlight.add(name);
  try {
    const node = self as { parent?: unknown; classroot?: unknown };
    return fn.call(self, node.parent, outer ? node.classroot : self);
  } finally {
    inFlight.delete(name);
  }
}

/** The declaring table for `name` within a chained table — the slot's
 *  identity. MEMOIZED per (table, name): tables are per-constructor chained
 *  objects, immutable after registration, and the prevailing follow walk
 *  asks this per ANCESTOR per READ — the scrub bench showed the naive
 *  prototype re-walk as the single hottest app-code frame cost. */
const DECLARING = new WeakMap<object, Map<string, object | null>>();
function declaringOf(table: Record<string, unknown> | null, name: string): object | null {
  if (table === null) return null;
  let m = DECLARING.get(table);
  if (m === undefined) DECLARING.set(table, (m = new Map()));
  const hit = m.get(name);
  if (hit !== undefined) return hit;
  let found: object | null = null;
  for (let t: object | null = table; t !== null; t = Object.getPrototypeOf(t)) {
    if (Object.hasOwn(t, name)) { found = t; break; }
  }
  m.set(name, found);
  return found;
}

/** The prevailing follow walk (styling rung — the R8 cursor-inheritance
 *  pattern over ordinary attribute cells): walk the parent chain, nearest
 *  first; a level whose class lacks the slot — or declares a DIFFERENT slot
 *  under the same spelling — is transparent; every consulted level's cell is
 *  a tracked read, so a provision appearing, changing, or clearing anywhere
 *  on the chain wakes exactly the readers below it (a mid-tree provide
 *  re-roots in one settle). Returns the nearest provider's local value, or
 *  NOTHING when nothing above provides (the reader falls back to its own
 *  declaration default — the chain's end). */
function followRead(self: Carrier, name: string, declaring: object): unknown {
  for (let p = (self as { parent?: unknown }).parent; typeof p === "object" && p !== null; p = (p as { parent?: unknown }).parent) {
    const pc = p as Carrier;
    const pd = tableFor(DEFAULTS, p.constructor);
    if (pd === null || !(name in pd) || declaringOf(pd, name) !== declaring) continue;
    if (isTracking()) cellFor(pc, name).track();
    if (provided(pc, name)) return (pc.$attrs ?? pd)[name];
  }
  return NOTHING;
}

function cellFor(self: Carrier, name: string): Cell {
  const cells = (self.$cells ??= Object.create(null) as Record<string, Cell>);
  return (cells[name] ??= new Cell());
}

/** The one write path (public setters and setBound both land here):
 *  equality-gate, store, push the slot's Surface call, wake dependents. */
function write(self: object, name: string, v: unknown): void {
  const carrier = self as Carrier;
  const defaults = tableFor(DEFAULTS, self.constructor)!;
  const cur = ((carrier.$attrs ?? defaults) as Record<string, unknown>)[name];
  if (cur === v) return;
  // Decoration values (Fill/Stroke/Shadow — immutable plain-data records)
  // gate on shallow structural equality, so a constraint re-producing an
  // equal value stops the cascade exactly as === does for scalars (ruled).
  const eq = tableFor(EQUALS, self.constructor)?.[name];
  if (eq !== undefined && eq(cur, v)) return;
  (carrier.$attrs ??= Object.create(defaults) as Record<string, unknown>)[name] = v;
  tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
  carrier.$cells?.[name]?.changed();
}

/** A runtime-side write: a constraint's apply, auto-size, a load result.
 *  Same store/push/wake as the setter, but it neither marks the slot as
 *  author-set nor consults ownership (the caller *is* the owner). */
export function setBound(self: object, name: string, v: unknown): void {
  write(self, name, v);
}

/** A runtime-side ADDITIVE write: land `current + delta` on a numeric slot —
 *  the animation additive core (animation.md §4.2, LaszloAnimation.lzs:444–448:
 *  `target.setAttribute(attr, targ[attr] + (value − currentValue))`). Two
 *  animators writing deltas to one slot therefore COMPOSE instead of clobbering:
 *  each reads the live value (others' contributions already folded in) and adds
 *  its own increment. A zero delta is a no-op (nothing to store, push, or wake —
 *  the same cascade-stopping the equality gate gives an absolute re-write). */
export function addBound(self: object, name: string, delta: number): void {
  if (delta === 0) return;
  const cur = (self as Record<string, unknown>)[name];
  write(self, name, (typeof cur === "number" ? cur : 0) + delta);
}

// ── The stylesheet channel's write side (styling rung) ─────────────────────
//
// A stylesheet entry's field is a rank-2 OFFER: it installs only where no
// author provision stands (the applier checks), it provides for followers
// (a $stylesheetMarks mark counts as provided), and it clears wholesale on swap. The
// applier (stylesheet.ts) is the only caller.

/** Install a stylesheet field's value on an unprovided slot. */
export function stylesheetWrite(self: object, name: string, v: unknown): void {
  const carrier = self as Carrier;
  const becameProvider =
    tableFor(PREVAILING, self.constructor)?.[name] === true && !provided(carrier, name);
  (carrier.$stylesheetMarks ??= new Set()).add(name);
  write(self, name, v);
  if (becameProvider) carrier.$cells?.[name]?.changed();
}

/** Withdraw a stylesheet field (the entry no longer offers it, or an author
 *  provision now outranks it). When the slot is otherwise unprovided the
 *  stored value is removed so reads fall back through the ordinary chain
 *  (follow → declaration default), dependents wake, and the slot's Surface
 *  state is re-pushed with the now-effective value. */
export function stylesheetClear(self: object, name: string): void {
  const carrier = self as Carrier;
  if (carrier.$stylesheetMarks === undefined || !carrier.$stylesheetMarks.delete(name)) return;
  if (provided(carrier, name)) return; // an author provision holds the value now
  if (carrier.$attrs !== undefined && Object.hasOwn(carrier.$attrs, name)) {
    delete carrier.$attrs[name];
  }
  carrier.$cells?.[name]?.changed();
  const v = (self as Record<string, unknown>)[name]; // the effective fallback
  tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
}

/** The applier's bookkeeping: which slots this view's stylesheet currently
 *  colors. */
export function stylesheetMarks(self: object): ReadonlySet<string> | undefined {
  return (self as Carrier).$stylesheetMarks;
}

/** Was this slot ever author-set (a literal, or a direct assignment)?
 *  The R4 replacement for R3's 0-as-unset: auto-size asks this, so an
 *  explicit `width=0` now means zero, not "measure me". */
export function isSet(self: object, name: string): boolean {
  return (self as Carrier).$set?.has(name) ?? false;
}

/** The slot's class-level default — what a `:path` binding falls back to
 *  when the path is unresolved (the doc's rule, language §9). */
export function defaultOf(self: object, name: string): unknown {
  return tableFor(DEFAULTS, self.constructor)?.[name];
}

/** What this slot would be worth if the view did NOT provide it: the
 *  prevailing follow (tracked, when read under tracking), else the class
 *  default. The ruled fallback for an unresolved `:path` on a prevailing
 *  slot — the declaration default is just the chain's end, so "unresolved →
 *  the followed value" is the consistent generalization (ruling item 15). */
export function followedValue(self: object, name: string): unknown {
  const table = tableFor(DEFAULTS, self.constructor);
  if (table === null) return undefined;
  if (tableFor(PREVAILING, self.constructor)?.[name] === true) {
    const v = followRead(self as Carrier, name, declaringOf(table, name)!);
    if (v !== NOTHING) return v;
  }
  return table[name];
}

/** Is this prevailing slot PROVIDED anywhere — on the view itself, or on any
 *  ancestor the follow walk would consult? Distinguishes "somebody declared a
 *  value" from "the chain ran out and the class default answered". A component
 *  SPECIES whose nature differs from the View-wide default asks this and
 *  supplies its own fallback at the read site (RichText: a document is
 *  selectable unless somebody says otherwise) — the only mechanism that gives
 *  a species default WITHOUT breaking the slot's semantics: a class-body
 *  provision would defeat ancestor vetoes (a provision always wins), and
 *  re-declaring the slot on the subclass would fork its identity and make
 *  every ancestor transparent to the follow walk. Tracked like any prevailing
 *  read: a provision appearing, changing, or clearing anywhere on the chain
 *  re-runs the asking constraint. */
export function prevailingProvided(self: object, name: string): boolean {
  const c = self as Carrier;
  if (isTracking()) cellFor(c, name).track();
  if (provided(c, name)) return true;
  const table = tableFor(DEFAULTS, self.constructor);
  if (table === null) return false;
  const declaring = declaringOf(table, name);
  if (declaring === null) return false;
  return followRead(c, name, declaring) !== NOTHING;
}

/** Retire every constraint that owns a slot on `self` — the teardown half a
 *  removed view needs (R8's replication is the first thing that removes):
 *  disposed constraints unlink from their Cells, so a later data or
 *  attribute change can never wake work for a dead view. */
export function disposeBindings(self: object): void {
  const owners = (self as Carrier).$owners;
  if (owners === undefined) return;
  for (const name of Object.keys(owners)) {
    owners[name].dispose();
    delete owners[name];
  }
}

/** Drop a slot's owner record WITHOUT disposing (states.md §3: the last state
 *  override leaving a formerly-unowned slot has already retired its own driver
 *  and now reverts the slot to a plain stored value — the caller restores it). */
export function disown(self: object, name: string): void {
  const owners = (self as Carrier).$owners;
  if (owners !== undefined) delete owners[name];
}

/** The constraint (if any) that owns this slot's value. */
export function ownerOf(self: object, name: string): Constraint | null {
  return (self as Carrier).$owners?.[name] ?? null;
}

// ── author-declaration records (tooling) ─────────────────────────────────────
//
// A program-declared slot (`fitS: number = { … }`) is served by a defBinding —
// a live fallback in the getter, deliberately NOT a standing Constraint — so
// `ownerOf` has nothing, and until 2026-08-19 the introspection surface went
// blind exactly at the slots the program is made of: explain() answered with
// provenance for View.width and null for the author's own derivation, and
// slots() could not even say the slot existed (found by an agent building
// against the bridge — a working fact was measured as absent for 1,097 frames
// because nothing enumerated it). instantiate.ts records every declaration
// here at class-make time; explain()/slotsOf() read it back.

export interface DeclRecord {
  /** The `{ }` default's source text, null for a plain (literal) declaration. */
  source: string | null;
  pos: { line: number; col: number } | null;
  /** The compiler's extracted read-paths for the default, when they rode along. */
  deps: readonly string[] | null;
  /** The declared TYPE name, verbatim ("number", "array", …) — what the
   *  island link handshake compares across programs. */
  type?: string;
  /** Declared `external` — an island-boundary slot (parser.ts AttrDecl). The
   *  bridge enumerates an instance's boundary via these records. */
  external?: boolean;
  /** Declared `readonly` — with external, an out-fact the host cannot write. */
  readOnly?: boolean;
}
const DECLARED = new WeakMap<object, Record<string, DeclRecord>>();

/** Record a class's author declarations (instantiate.ts makeClass). */
export function recordDeclarations(ctor: object, table: Record<string, DeclRecord>): void {
  DECLARED.set(ctor, table);
}

/** Every author-declared slot visible on this instance — the class's own and
 *  its user superclasses', merged up the prototype chain (runtime base
 *  classes never register, so View's built-ins stay out of the answer). */
export function declarationsOf(self: object): Record<string, DeclRecord> {
  const out: Record<string, DeclRecord> = {};
  for (let c: unknown = self.constructor; c != null; c = Object.getPrototypeOf(c)) {
    const t = DECLARED.get(c as object);
    if (t !== undefined) for (const k of Object.keys(t)) if (!(k in out)) out[k] = t[k];
  }
  return out;
}

/** Tooling reads (inspect.ts): the node's OWN attribute values (writes and
 *  bound results — `$attrs`, the instance overlay over the class defaults),
 *  and the slot names currently owned by constraints. Snapshots, not live. */
export function ownValues(self: object): Record<string, unknown> {
  const own = (self as Carrier).$attrs;
  const out: Record<string, unknown> = {};
  if (own !== undefined) for (const k of Object.keys(own)) out[k] = (own as Record<string, unknown>)[k];
  return out;
}
export function ownedSlots(self: object): string[] {
  const owners = (self as Carrier).$owners;
  return owners !== undefined ? Object.keys(owners) : [];
}

// ── The divergence bit (materialization.md §2, B5) ─────────────────────────
//
// "The runtime owns the cells, so it can KNOW which instances have diverged."
// A replicated instance's subtree is ARMED once construction completes
// (bindings evaluated, init fired — construct-phase literal writes never
// count); from then on, any direct author/handler write through the public
// setter marks the node DIVERGED. The windowed reconciler retains diverged
// instances (keep-alive, the D5 ruling) and freely discards clean ones —
// the retained set is exactly the set for which reconstruction would be
// observable. Both sets are WeakSets: pay-per-use, collected with the nodes.

const ARMED = new WeakSet<object>();
const DIVERGED = new WeakSet<object>();

// A RUNTIME write: an animator driving the slot it declares. It uses plain
// assignment on purpose (§5: assignment wins, so an animator displaces any
// derive that would otherwise overwrite its rest value) — but it is NOT an
// author's touch. The value is derived from a declared animator and its
// declared target, so a reconstruction reproduces it exactly; the divergence
// bit must not see it, or every row holding a spring becomes permanently
// "touched" and the windowed reconciler stops recycling it.
let RUNTIME_WRITE = 0;

/** Run `f` with its direct writes exempt from the divergence bit. */
export function asRuntimeWrite<T>(f: () => T): T {
  RUNTIME_WRITE++;
  try { return f(); } finally { RUNTIME_WRITE--; }
}

/** Arm divergence tracking on one node (the replicator walks the instance
 *  subtree after finish). */
export function armDivergence(self: object): void {
  ARMED.add(self);
}

/** Has this node received a direct write since it was armed? */
export function nodeDiverged(self: object): boolean {
  return DIVERGED.has(self);
}

// Percent bindings, marked: a percent resolves against the PARENT's extent
// (bind.ts), so a parent deriving its own extent from its children must not
// count a child's percent-bound slot — it would be reading its own output
// (auto-extent's ruled cycle guard, view.ts). Ownership metadata, so it lives
// with own/ownerOf; a WeakSet keeps it pay-per-use.
const PERCENTS = new WeakSet<Constraint>();

/** Record that `c` is a percent binding (called by bindPercent). */
export function markPercent(c: Constraint): void {
  PERCENTS.add(c);
}

/** Is `self.name` owned by a percent binding — a slot whose value resolves
 *  against the parent's extent on that axis? */
export function percentOwned(self: object, name: string): boolean {
  const owner = (self as Carrier).$owners?.[name];
  return owner !== undefined && PERCENTS.has(owner);
}

/** Record `c` as the owner of `self.name`. One declarative owner per slot:
 *  a second binding is a defect upstream (check flags duplicate attributes),
 *  so it fails loudly here rather than silently stacking. The one exception
 *  mirrors the write path above: a *yielding* runtime derive (auto-extent,
 *  auto-size) yields to an author binding exactly as it yields to an author
 *  write — reached when replication attaches an instance (installing
 *  auto-extent) before its bindings finish. */
export function own(self: object, name: string, c: Constraint): void {
  const owners = ((self as Carrier).$owners ??= Object.create(null) as Record<string, Constraint>);
  const prior = owners[name];
  if (prior !== undefined && prior.yielding) {
    // A yielding owner yields to ANY newcomer — an author binding as before,
    // and since B5 also a newer runtime derive (the windowed block's extent
    // derive displaces auto-extent exactly as an author write would).
    prior.dispose();
    delete owners[name];
  } else if (prior !== undefined) {
    throw new DeclareError(prior.arrangedBy !== null
      ? layoutConflictMessage(self.constructor.name, name, prior.arrangedBy, null)
      : `${self.constructor.name}.${name} is already bound (by ${prior.label})`);
  }
  owners[name] = c;
  // On a prevailing slot, gaining an owner is a provision-state change
  // (following → providing) even before the binding's first value lands —
  // followers must re-walk (the setter's becameProvider wake, mirrored here).
  wakeIfPrevailing(self, name);
}

/** Release `c`'s ownership of `self.name` — the uninstall half of `own`,
 *  for owners that retire as a unit (a layout strategy detaching). Guarded on
 *  identity so a stale detach can never evict a newer owner. */
export function release(self: object, name: string, c: Constraint): void {
  const owners = (self as Carrier).$owners;
  if (owners !== undefined && owners[name] === c) {
    delete owners[name];
    wakeIfPrevailing(self, name); // providing → following, the reverse transition
  }
}

function wakeIfPrevailing(self: object, name: string): void {
  if (tableFor(PREVAILING, self.constructor)?.[name] === true) {
    (self as Carrier).$cells?.[name]?.changed();
  }
}

/** Install a runtime-supplied, *yielding* derive (Text auto-size, View
 *  auto-extent, and any future runtime-computed slot): the same Constraint
 *  machinery authors get, flagged so a direct author write displaces it
 *  instead of erroring. Returns the constraint so an installer that must
 *  re-run it on a non-tracked fact (auto-extent on tree mutation — `children`
 *  is not a reactive collection) can hold it. */
export function bindDerived(self: object, name: string, compute: () => unknown): Constraint {
  const c = new Constraint(
    `${self.constructor.name}.${name} (runtime derive)`,
    compute,
    (v) => write(self, name, v),
    0,
    true
  );
  own(self, name, c);
  c.run();
  return c;
}
