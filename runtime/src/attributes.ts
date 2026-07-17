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
import { NeoError } from "./errors.js";

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

type Push = (self: object, v: unknown) => void;
type Equal = (a: unknown, b: unknown) => boolean;
type CssEntry = { attr: string; coerce: (raw: string) => unknown };

// Class → its attribute tables. All are prototype-chained objects mirroring
// the class hierarchy (Text's defaults chain to View's), so "nearest declared
// wins" is a plain property lookup — the same shape schema.ts's chain walk
// gives the checker, expressed in the runtime's own currency.
const DEFAULTS = new WeakMap<object, Record<string, unknown>>();
const PUSHERS = new WeakMap<object, Record<string, Push | undefined>>();
const PREVAILING = new WeakMap<object, Record<string, boolean | undefined>>();
const EQUALS = new WeakMap<object, Record<string, Equal | undefined>>();
// cssProp → { attr, coerce }: the reverse of each attribute's `css:` mapping,
// prototype-chained like the others (a subclass inherits its base's map). The
// CSS applier (css-apply.ts) reads this to translate a matched declaration.
const CSSMAP = new WeakMap<object, Record<string, CssEntry>>();

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
  /** CSS-provided slot names (the standard-CSS channel's rank-2b offers —
   *  installed by the per-view CSS applier; below author provision AND the
   *  class-dict stylesheet, above the follow and the declaration default). */
  $cssMarks?: Set<string>;
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
  const cssmap: Record<string, CssEntry> = Object.create(tableFor(CSSMAP, parent));
  for (const name of Object.keys(specs) as (keyof S & string)[]) {
    const spec = specs[name]!;
    defaults[name] = spec.def;
    pushers[name] = spec.push as Push | undefined;
    prevailing[name] = spec.prevailing;
    equals[name] = spec.equal as Equal | undefined;
    if (spec.css !== undefined && spec.coerce !== undefined) {
      cssmap[spec.css] = { attr: name, coerce: spec.coerce };
    }
    const follows = spec.prevailing === true;
    const defBinding = spec.defBinding;
    const defOuter = spec.defOuter === true;
    const readOnly = spec.readOnly === true;
    Object.defineProperty(ctor.prototype, name, {
      get(this: object): unknown {
        const self = this as Carrier;
        if (isTracking()) cellFor(self, name).track();
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
        return (self.$attrs ?? defaults)[name];
      },
      set(this: object, v: unknown): void {
        if (readOnly) {
          throw new NeoError(
            `${this.constructor.name}.${name} is read-only — it is computed from its declaration and cannot be assigned`
          );
        }
        const self = this as Carrier;
        // A first write to a prevailing slot changes what it MEANS (following
        // → providing) even when the written value equals the stored default,
        // so the equality gate below cannot be the only wake.
        const becameProvider = follows && !provided(self, name);
        const owner = self.$owners?.[name];
        if (owner !== undefined) {
          if (!owner.yielding) {
            throw new NeoError(
              `${this.constructor.name}.${name} is bound by a constraint (${owner.label}) — a direct write would be silently overwritten; change what the constraint reads instead`
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
  CSSMAP.set(ctor, cssmap);
}

/** The class's reverse CSS map: cssProp → { attr, coerce }. Empty for a class
 *  (and its bases) that declare no `css:` attributes. */
export function cssMap(ctor: Function): Record<string, CssEntry> {
  return tableFor(CSSMAP, ctor) ?? {};
}

/** Does this slot have a LOCAL provision — an author set (literal or direct
 *  write), an owning binding, or a stylesheet entry's installed offer?
 *  Anything less is "unset", which on a prevailing slot means *following*. */
function provided(self: Carrier, name: string): boolean {
  return (
    (self.$set?.has(name) ?? false) ||
    self.$owners?.[name] !== undefined ||
    (self.$stylesheetMarks?.has(name) ?? false) ||
    (self.$cssMarks?.has(name) ?? false)
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
    throw new NeoError(
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
 *  identity. */
function declaringOf(table: Record<string, unknown> | null, name: string): object | null {
  for (let t: object | null = table; t !== null; t = Object.getPrototypeOf(t)) {
    if (Object.hasOwn(t, name)) return t;
  }
  return null;
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
  carrier.$cssMarks?.delete(name); // class-dict (rank-2) evicts any CSS (rank-2b) mark
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

// ── The CSS channel's write side (rank-2b, below the class-dict) ────────────
//
// Mirrors the stylesheet channel exactly, one tier lower. The per-view CSS
// applier (css-apply.ts) is the only caller. `write` fires the slot cell's
// changed() on a value change — that plus the applier's tracked provision
// probe is what lets a class-dict install/clear (or an author $set) wake the
// applier to withdraw or re-offer.

/** Install a CSS-matched value on an unprovided slot. */
export function cssWrite(self: object, name: string, v: unknown): void {
  const carrier = self as Carrier;
  const becameProvider =
    tableFor(PREVAILING, self.constructor)?.[name] === true && !provided(carrier, name);
  (carrier.$cssMarks ??= new Set()).add(name);
  write(self, name, v);
  if (becameProvider) carrier.$cells?.[name]?.changed();
}

/** Withdraw a CSS offer (the rule no longer matches, or a higher rank now
 *  outranks it). Mirrors stylesheetClear: when the slot is otherwise
 *  unprovided the stored value is removed, dependents wake, and the Surface
 *  state is re-pushed with the now-effective value. */
export function cssClear(self: object, name: string): void {
  const carrier = self as Carrier;
  if (carrier.$cssMarks === undefined || !carrier.$cssMarks.delete(name)) return;
  if (provided(carrier, name)) return; // a higher-rank provision holds the value now
  if (carrier.$attrs !== undefined && Object.hasOwn(carrier.$attrs, name)) {
    delete carrier.$attrs[name];
  }
  carrier.$cells?.[name]?.changed();
  const v = (self as Record<string, unknown>)[name]; // the effective fallback
  tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
}

/** The CSS applier's bookkeeping: which slots this view's CSS currently colors. */
export function cssMarks(self: object): ReadonlySet<string> | undefined {
  return (self as Carrier).$cssMarks;
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
  if (prior !== undefined && prior.yielding && !c.yielding) {
    prior.dispose();
    delete owners[name];
  } else if (prior !== undefined) {
    throw new NeoError(`${self.constructor.name}.${name} is already bound (by ${prior.label})`);
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
