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

import { ACTIVE, Cell, Constraint, S, isTracking, kernel, noteWrite, setPushHook, table, touchCell, trackCell, untracked, workPending } from "./reactive.js";
import { DeclareError, at, layoutConflictMessage, type Where } from "./errors.js";

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

type Push = (self: object, v: unknown) => void;
type Equal = (a: unknown, b: unknown) => boolean;

// Class → its attribute tables. All are prototype-chained objects mirroring
// the class hierarchy (Text's defaults chain to View's), so "nearest declared
// wins" is a plain property lookup — the same shape schema.ts's chain walk
// gives the checker, expressed in the runtime's own currency.
const DEFAULTS = new WeakMap<object, Record<string, unknown>>();
/** Per class: the declared-default rules' live forms (AttrSpec.defRule), for
 *  the refresh a displacement makes (own()). */
const DEF_RULES = new WeakMap<object, Record<string, { fn: (this: unknown, parent: unknown, classroot: unknown) => unknown; outer: boolean }>>();
const PUSHERS = new WeakMap<object, Record<string, Push | undefined>>();
const EQUALS = new WeakMap<object, Record<string, Equal | undefined>>();
// NUMERIC SLOTS LIVE IN THE KERNEL'S TABLE (kernel.md §2). A slot whose default
// is a number or a boolean, with no live/tracked hook and no custom equality,
// is stored as an f64 in the kernel. Each class has a LAYOUT — slot name →
// index, inherited indices kept — and each instance a contiguous BLOCK of
// cells allocated on first need (`$base`), so a read is `table[$base + i]`:
// one typed-array load, no dictionary. The write gates on == in the table,
// stores, and appends the cell to the kernel's write ring (touchCell) — no
// call. "n" = number, "b" = boolean (0/1).
interface Layout {
  index: Record<string, number | undefined>;   // chained to the parent's
  kinds: ("n" | "b")[];
  names: string[];                              // per index
  defaults: Float64Array;                       // per index, this class's effective defaults
  count: number;
}
const LAYOUT = new WeakMap<object, Layout>();
/** Blocks returned by torn-down instances, per class, for reuse (cleared). */
const FREE_BLOCKS = new WeakMap<object, number[]>();
/** Every block ever allocated, sorted by base, with the instance that holds it
 *  now — cell → (instance, slot) for the push sweep. Bases only grow (the
 *  kernel hands blocks out from its high-water mark), so appends stay sorted;
 *  a reused block keeps its entry and changes hands. */
const BLOCK_BASE: number[] = [];
const BLOCK_VIEW: (Carrier | null)[] = [];
const BLOCK_AT = new Map<number, number>();   // base → index in the arrays
function blockIndexOf(cell: number): number {
  let lo = 0, hi = BLOCK_BASE.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (BLOCK_BASE[mid] <= cell) lo = mid + 1; else hi = mid - 1; }
  return hi;   // the last base ≤ cell
}
/** The instance and slot a kernel cell belongs to, when it is a numeric block
 *  slot — the push sweep's lookup, exposed for tooling that names cells (the
 *  wake trace). null for a cell that is no instance slot. */
export function slotOfCell(cell: number): { view: object; name: string; kind: "n" | "b" } | null {
  const bi = blockIndexOf(cell);
  if (bi < 0) return null;
  const view = BLOCK_VIEW[bi];
  if (view === null) return null;
  const L = tableFor(LAYOUT, view.constructor);
  const slot = cell - BLOCK_BASE[bi];
  if (L === null || slot >= L.count) return null;
  return { view, name: L.names[slot], kind: L.kinds[slot] };
}

/** The push sweep: after a settle, every cell a KERNEL rule wrote (an EXPR
 *  body, the visibility rule) gets the Surface push its slot declares —
 *  exactly what write() does for a JS write, deferred to the settle's end. */
function pushKernelWrites(cells: Uint32Array): void {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const bi = blockIndexOf(cell);
    if (bi < 0) continue;
    const view = BLOCK_VIEW[bi];
    if (view === null) continue;
    const L = tableFor(LAYOUT, view.constructor)!;
    const slot = cell - BLOCK_BASE[bi];
    if (slot >= L.count) continue;
    const push = tableFor(PUSHERS, view.constructor)?.[L.names[slot]];
    if (push === undefined) continue;
    const n = table[cell];
    push(view, L.kinds[slot] === "b" ? n !== 0 : n);
  }
}
setPushHook(pushKernelWrites);

/** The kernel cell of `self.name` when it is a table slot of this instance
 *  (numeric, not escaped, not retired); −1 otherwise. Allocates the block.
 *  The EXPR binder resolves its read paths and its target through this. */
export function slotCellOf(self: object, name: string): number {
  const L = tableFor(LAYOUT, self.constructor);
  const slot = L?.index[name];
  if (slot === undefined || L === null) return -1;
  const c = self as Carrier;
  if (c.$base === -1 || (c.$esc !== undefined && c.$esc.has(name))) return -1;
  return ensureBase(c) + slot;
}
/** Is `self.name` a boolean slot (a kernel-written 0/1 lands as true/false)? */
export function slotIsBoolean(self: object, name: string): boolean {
  const L = tableFor(LAYOUT, self.constructor);
  const slot = L?.index[name];
  return slot !== undefined && L !== null && L.kinds[slot] === "b";
}

/** What one instance lazily grows; every piece absent until first needed. */
interface Carrier {
  /** Own values, prototype-chained to the class defaults. */
  $attrs?: Record<string, unknown>;
  /** The first kernel cell of this instance's numeric BLOCK (allocated on
   *  first write or first tracked read; an untracked read of an untouched
   *  instance answers the class default without allocating). −1 once retired:
   *  the last values were copied into `$attrs`. */
  $base?: number;
  /** Numeric slots that ESCAPED to `$attrs` (a non-number written to a
   *  union-typed slot such as cornerRadius). Rare; absent almost always. */
  $esc?: Set<string>;
  /** Dependency nodes, created on first *tracked* read of a slot. */
  $cells?: Record<string, Cell>;
  /** Slot owners (constraints/derives). */
  $owners?: Record<string, Constraint>;
  /** Author-set slot names (literals + direct writes). */
  $set?: Set<string>;
  /** Slots whose declared-default rule a RUNTIME write displaced (storage wins). */
  $displaced?: Set<string>;
  /** PROVISIONS — values this node makes available to its subtree under a name
   *  it does NOT declare as an attribute (`App [ accent = #E05252 ]`, a set of a
   *  name no schema of the node's class carries). A descendant reads them with
   *  `provided("accent")`. Absent until the node provides something; each entry
   *  owns a cell (created on first tracked read) so a bound provision waking
   *  re-derives its readers. Kept separate from `$attrs` because a provision has
   *  no accessor and no declared type — it is addressed only through the walk. */
  /** The USE SITE's geometry literals — the five slots a layout can claim,
   *  and only those written at the use site (noteUseSiteSet). The value is
   *  where it was written, or null when the program carries no positions. */
  $setAt?: Record<string, Where | null>;
  $provides?: Record<string, unknown>;
  $provideCells?: Record<string, Cell>;
  /** THE PROVIDER MEMO (providedRead): per name, which node answered it last,
   *  and the generation that answer was found in. The VALUE is never cached —
   *  it is read through the provider's cell or accessor, so it stays reactive;
   *  what is cached is the ANSWER TO THE WALK. Measured 2026-09-19: on the
   *  marketmap slider, 1.53 M reads walking 3 ancestors each, 99.6% of them
   *  repeating the previous answer and none changing it. */
  $providedFrom?: Map<string, { gen: number; from: object | null }>;
}

/** Bumped when a node gains a provision NAME it did not have — the one event
 *  that can change an answer without the tree moving. (A provision's VALUE
 *  changing does not: the reader tracks its cell.) */
let PROVIDE_GEN = 0;
/** DEV ONLY (profiling builds): how the memo behaved — hits, walks, generation
 *  bumps, subtree clears. A slow run with a bump spike is the memo being
 *  invalidated; one without is the machine. */
function devMemoTally(k: "hit" | "walk" | "bump" | "clear", n = 1): void {
  const g = globalThis as { __declareProvidedMemo?: Record<string, number> };
  const t = (g.__declareProvidedMemo ??= { hit: 0, walk: 0, bump: 0, clear: 0 });
  t[k] += n;
}
/** A node has moved to a different parent: its subtree's chains changed, and
 *  nothing else's did, so clear those memos and leave every other node's
 *  standing. Called from Node's linking verbs — NOT from a re-link that puts a
 *  child back under the same parent (replication does that to every row of a
 *  block on any change, and flushing there would empty the memo exactly where
 *  the reads are hottest). */
export function providedChainMoved(root: { children?: readonly unknown[] }): void {
  if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) devMemoTally("clear");
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const n = stack.pop() as Carrier & { children?: readonly unknown[] };
    if (n.$providedFrom !== undefined) n.$providedFrom.clear();
    const kids = n.children;
    if (kids !== undefined) for (const k of kids) stack.push(k);
  }
}

function provideCellFor(self: Carrier, name: string): Cell {
  const cells = (self.$provideCells ??= Object.create(null) as Record<string, Cell>);
  return (cells[name] ??= new Cell());
}

/** Set a provision on a node — the value a descendant's `provided("name")`
 *  reads when this node is the nearest provider. Equality-gated, and wakes the
 *  readers below. Both a literal provision and a bound one (whose `{ }`
 *  re-derives) land here. */
/** The value a node PROVIDES locally under `name` (its own provision), or
 *  undefined if it provides none. The DOM selection surface reads this: a
 *  container that provides `selectable = true` becomes a selection region so a
 *  gap press between its leaves anchors on it. */
export function localProvision(self: object, name: string): unknown {
  return (self as Carrier).$provides?.[name];
}

/** The slots a USE-SITE literal is worth remembering: the five a layout can
 *  claim. A literal on one of them is the value an arrangement can discard, and
 *  a literal — unlike a binding — installs no Constraint to hang `source`/
 *  `sourcePos` on, so there would otherwise be nothing to report and nowhere to
 *  point. Kept to these five so the record stays pay-per-use: a tree that
 *  writes no geometry literals at a use site carries nothing. */
const CLAIMABLE_SLOTS = new Set(["x", "y", "width", "height", "visible"]);

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
export function noteUseSiteSet(self: object, name: string, where: Where | undefined): void {
  if (!CLAIMABLE_SLOTS.has(name)) return;
  const carrier = self as Carrier;
  const table = (carrier.$setAt ??= Object.create(null) as Record<string, Where | null>);
  table[name] = where == null || typeof where.line !== "number"
    ? null
    : where.file !== undefined
      ? { line: where.line, col: where.col, file: where.file }
      : { line: where.line, col: where.col };
}

/** Did the USE SITE write a literal into this geometry slot? */
export function useSiteSet(self: object, name: string): boolean {
  const table = (self as Carrier).$setAt;
  return table !== undefined && table[name] !== undefined;
}

/** Where that literal was written, or null (not a use-site literal, or a
 *  positionless artifact). */
export function setPosOf(self: object, name: string): Where | null {
  return (self as Carrier).$setAt?.[name] ?? null;
}

export function provideWrite(self: object, name: string, value: unknown): void {
  const p = self as Carrier;
  const store = (p.$provides ??= Object.create(null) as Record<string, unknown>);
  if (!(name in store)) { PROVIDE_GEN++; if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) devMemoTally("bump"); }                 // a NEW name above someone can change their answer
  if (name in store && store[name] === value) return;
  store[name] = value;
  p.$provideCells?.[name]?.changed();
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
  const equals: Record<string, Equal | undefined> = Object.create(tableFor(EQUALS, parent));
  const parentLayout = tableFor(LAYOUT, parent);
  const layout: Layout = {
    index: Object.create(parentLayout?.index ?? null) as Record<string, number | undefined>,
    kinds: parentLayout ? [...parentLayout.kinds] : [],
    names: parentLayout ? [...parentLayout.names] : [],
    defaults: new Float64Array(0), count: parentLayout?.count ?? 0,
  };
  const layoutDefaults: number[] = parentLayout ? [...parentLayout.defaults] : [];
  for (const name of Object.keys(specs) as (keyof S & string)[]) {
    const spec = specs[name]!;
    defaults[name] = spec.def;
    pushers[name] = spec.push as Push | undefined;
    equals[name] = spec.equal as Equal | undefined;
    const kind: "n" | "b" | undefined =
      (spec.defBinding === undefined || spec.defRule === true) && spec.live === undefined && spec.tracked === undefined && spec.equal === undefined
        ? (typeof spec.def === "number" ? "n" : typeof spec.def === "boolean" ? "b" : undefined)
        : undefined;
    let slot = -1;
    if (kind !== undefined) {
      const inherited = layout.index[name];
      slot = inherited !== undefined && layout.kinds[inherited] === kind ? inherited : layout.count++;
      layout.index[name] = slot; layout.kinds[slot] = kind; layout.names[slot] = name;
      layoutDefaults[slot] = kind === "b" ? (spec.def ? 1 : 0) : (spec.def as unknown as number);
    } else if (layout.index[name] !== undefined) {
      layout.index[name] = undefined;   // redeclared as non-numeric here: this class's instances use the JS store
    }
    const defBinding = spec.defBinding;
    const defOuter = spec.defOuter === true;
    // A declared default standing as a rule (defRule): the TABLE is its value
    // once the world is quiescent; an UNTRACKED read while writes are pending
    // (a handler reading `app.selCount` right after it wrote the selection)
    // evaluates the `{ }` live — the value main's live fallback gave, fresh
    // through every derived input, since a pending settle has not landed it.
    // Tracked readers and the kernel always read the table: they re-run.
    const defRule = spec.defRule === true && defBinding !== undefined;
    if (defRule) { let t = DEF_RULES.get(ctor); if (t === undefined) DEF_RULES.set(ctor, (t = {})); t[name] = { fn: defBinding!, outer: defOuter }; }
    const readOnly = spec.readOnly === true;
    const onTrack = spec.onTrack as ((self: object) => void) | undefined;
    const trackedOnce = onTrack !== undefined ? new WeakSet<object>() : null;
    const live = spec.live as ((self: object) => unknown) | undefined;
    const trackedHook = spec.tracked as ((self: object, v: unknown) => unknown) | undefined;
    Object.defineProperty(ctor.prototype, name, {
      get(this: object): unknown {
        const self = this as Carrier;
        if (slot >= 0) {
          let base = self.$base;
          if (base === undefined) {
            // untouched instance: an untracked read is the class default, no
            // allocation; a tracked read needs a cell to subscribe to
            if (S.collecting === null && ACTIVE[0] < 0) return defRule ? evalDefault(self, name, defBinding!, defOuter) : defaults[name];
            base = ensureBase(self);
          }
          if (base >= 0 && (self.$esc === undefined || !self.$esc.has(name))) {
            const c = base + slot;
            if (S.collecting !== null || ACTIVE[0] >= 0) {
              trackCell(c);
              if (trackedOnce !== null && !trackedOnce.has(self)) { trackedOnce.add(self); onTrack!(self); }
              // a TRACKED read of a declared default whose recompute is still
              // queued (or whose rule has not landed yet: the install batch)
              // takes the live value now and keeps the cell edge — a reader's
              // FIRST computed value (a spring's target it primes from) is the
              // value the live fallback gave; the landing re-runs it to the same
              if (defRule && declStale(self, name, true)) return evalDefault(self, name, defBinding!, defOuter);
            } else if (defRule && declStale(self, name, false)) {
              return evalDefault(self, name, defBinding!, defOuter);
            }
            const n = table[c];
            return kind === "b" ? n !== 0 : n;
          }
          // retired (base −1) or escaped: the JS store below
        }
        if (isTracking()) {
          cellFor(self, name).track();
          if (trackedOnce !== null && !trackedOnce.has(self)) { trackedOnce.add(self); onTrack!(self); }
        } else if (live !== undefined) {
          return live(self);
        }
        if (defBinding !== undefined && !provided(self, name)) {
          // A declaration default that is a binding (`fontSize = provided(
          // "fontSize", 16)`) evaluates live, per instance (unless a runtime
          // write — an Image's natural size — left instance storage; storage
          // wins, as a literal default would lose to it).
          if (self.$attrs === undefined || !Object.hasOwn(self.$attrs, name)) {
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
        const owner = self.$owners?.[name];
        if (owner !== undefined) {
          if (!owner.yielding) {
            throw new DeclareError(owner.arrangedBy !== null
              ? layoutConflictMessage(this.constructor.name, name, owner.arrangedBy, null, null, true)
              : `${this.constructor.name}.${name} is bound by a constraint (${owner.label}) — a direct write would be silently overwritten; change what the constraint reads instead`
            );
          }
          owner.dispose(); // a runtime derive yields: the author takes over
          delete self.$owners![name];
        }
        (self.$set ??= new Set()).add(name);
        write(this, name, v);
      },
    });
  }
  DEFAULTS.set(ctor, defaults);
  PUSHERS.set(ctor, pushers);
  EQUALS.set(ctor, equals);
  layout.defaults = Float64Array.from(layoutDefaults);
  LAYOUT.set(ctor, layout);
}

/** A class's slot index for a numeric attribute (−1 if it is not one) — the
 *  kernel's view layout is built from these (view.ts). */
export function slotIndex(ctor: object, name: string): number {
  return tableFor(LAYOUT, ctor)?.index[name] ?? -1;
}
/** The instance's numeric block (allocating it), for kernel rules that read
 *  the view's slots directly. */
export function blockOf(self: object): number {
  const b = ensureBase(self as Carrier);
  return b;
}

/** This instance's block, allocated on first need with the class defaults —
 *  a block a torn-down instance of the same class returned, when there is one. */
function ensureBase(self: Carrier): number {
  let base = self.$base;
  if (base !== undefined) return base;
  const L = tableFor(LAYOUT, self.constructor)!;
  const free = FREE_BLOCKS.get(self.constructor);
  if (free !== undefined && free.length > 0) { base = free.pop()!; BLOCK_VIEW[BLOCK_AT.get(base)!] = self; }
  else {
    base = kernel().addCells(L.count);
    if (base < 0) throw new DeclareError("kernel: out of cells — the program exceeds the runtime's cell capacity");
    BLOCK_AT.set(base, BLOCK_BASE.length); BLOCK_BASE.push(base); BLOCK_VIEW.push(self);
  }
  table.set(L.defaults, base);
  self.$base = base;
  return base;
}

/** Is this slot set LOCALLY — an author set (literal or direct write) or an
 *  owning binding? A slot that is not overrides nothing, so its declaration
 *  default (a `provided(…)` read, for a face slot) governs. */
function provided(self: Carrier, name: string): boolean {
  return (
    (self.$set?.has(name) ?? false) ||
    self.$owners?.[name] !== undefined
  );
}

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

function cellFor(self: Carrier, name: string): Cell {
  const cells = (self.$cells ??= Object.create(null) as Record<string, Cell>);
  return (cells[name] ??= new Cell());
}

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
export function providedDefault(name: string, def: unknown): (this: unknown) => unknown {
  return function (this: unknown): unknown {
    return providedRead(this as object, name, true, def);
  };
}

/** THE TEXT FACE, name by name, with the default each falls to when nothing above
 *  provides it. The ONE source: `Text` builds its face slots' defBindings from
 *  this table, and `providedTextStyle()` (Node) assembles the same five reads
 *  into a `TextStyle`. They cannot drift, which matters because a measurement
 *  taken with different defaults than the run it is measuring is silently wrong.
 *  Only these five are provided; the rest of `TextStyle` (italic, small caps,
 *  numerals, the treatments) is per-run and nobody provides it. */
export const PROVIDED_FACE: readonly (readonly [string, unknown])[] = [
  ["textColor", 0x000000],
  ["fontSize", 16],
  ["fontFamily", "sans-serif"],
  ["fontWeight", "normal"],
  ["letterSpacing", 0],
];

/** The face table as `defineAttributes` entries — what a text leaf declares. */
export function faceSlots(): Record<string, { def: unknown; defBinding: (this: unknown) => unknown }> {
  const out: Record<string, { def: unknown; defBinding: (this: unknown) => unknown }> = {};
  for (const [name, def] of PROVIDED_FACE) out[name] = { def, defBinding: providedDefault(name, def) };
  return out;
}

/** DEV ONLY (profiling builds): the provided-read census — how many reads, how
 *  far each walks, and how often the ANSWER (which ancestor provides the name)
 *  differs from the last read of the same slot. The last is the ceiling on what
 *  caching the provider could remove. Switch: __declareProvidedCensus. */
function devProvidedCensus(self: object, name: string, hops: number, provider: unknown, kind: string): void {
  const g = globalThis as { __declareProvidedCensus?: { reads: number; hops: number; sameAnswer: number; firstRead: number; changed: number; byHops: Record<number, number>; byKind: Record<string, number>; last?: WeakMap<object, Map<string, unknown>> } | boolean };
  if (typeof g.__declareProvidedCensus !== "object" || g.__declareProvidedCensus === null) {
    g.__declareProvidedCensus = { reads: 0, hops: 0, sameAnswer: 0, firstRead: 0, changed: 0, byHops: {}, byKind: {}, last: new WeakMap() };
  }
  const c = g.__declareProvidedCensus;
  c.reads++; c.hops += hops;
  c.byHops[hops] = (c.byHops[hops] ?? 0) + 1;
  c.byKind[kind] = (c.byKind[kind] ?? 0) + 1;
  let m = c.last!.get(self);
  if (m === undefined) c.last!.set(self, m = new Map());
  if (!m.has(name)) { c.firstRead++; m.set(name, provider); return; }
  if (m.get(name) === provider) c.sameAnswer++; else { c.changed++; m.set(name, provider); }
}

export function providedRead(self: object, name: string, hasDefault: boolean, dflt: unknown): unknown {
  // A node that PROVIDES a value can also read it — `App [ theme = { … }, fill =
  // { provided("theme").bg } ]`. Its own provision is checked first (a provision
  // is not a declared slot, so this never shadows a face slot's own read, which
  // resolves against ancestors). The walk below starts at the parent, so a
  // declared slot whose default IS a provided read still terminates.
  const s = self as Carrier;
  const memo = (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareNoProvidedMemo?: boolean }).__declareNoProvidedMemo === true) ? undefined : s.$providedFrom?.get(name);
  if (memo !== undefined && memo.gen === PROVIDE_GEN) {
    const from = memo.from;
    if (from === null) {                               // nobody above provides it
      if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) devMemoTally("hit");
      if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareProvidedCensus?: unknown }).__declareProvidedCensus !== undefined) devProvidedCensus(self, name, 0, null, "memo: default");
      if (hasDefault) return dflt;
    } else {
      const fc = from as Carrier;
      if (fc.$provides !== undefined && name in fc.$provides) {
        if (isTracking()) provideCellFor(fc, name).track();
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) devMemoTally("hit");
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareProvidedCensus?: unknown }).__declareProvidedCensus !== undefined) devProvidedCensus(self, name, 0, from, "memo: provision");
        return fc.$provides[name];
      }
      // a declared slot of that ancestor: through the accessor, which tracks
      // its cell and forwards on if the slot is itself a provided read
      if (tableFor(DEFAULTS, (from as object).constructor) !== null) {
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) devMemoTally("hit");
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareProvidedCensus?: unknown }).__declareProvidedCensus !== undefined) devProvidedCensus(self, name, 0, from, "memo: slot");
        return (from as Record<string, unknown>)[name];
      }
    }
    s.$providedFrom!.delete(name);                     // the memo no longer describes the tree: walk
  }
  if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) devMemoTally("walk");
  const remember = (from: object | null): void => {
    (s.$providedFrom ??= new Map()).set(name, { gen: PROVIDE_GEN, from });
  };
  if (s.$provides !== undefined && name in s.$provides) {
    if (isTracking()) provideCellFor(s, name).track();
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareProvidedCensus?: unknown }).__declareProvidedCensus !== undefined) devProvidedCensus(self, name, 0, s, "own provision");
    return s.$provides[name];
  }
  let devHops = 0;
  for (
    let p = (self as { parent?: unknown }).parent;
    typeof p === "object" && p !== null;
    p = (p as { parent?: unknown }).parent
  ) {
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) devHops++;
    const pc = p as Carrier;
    // A named provision (an undeclared set — `App [ accent = #E05252 ]`).
    if (pc.$provides !== undefined && name in pc.$provides) {
      if (isTracking()) provideCellFor(pc, name).track();
      remember(pc);
      if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareProvidedCensus?: unknown }).__declareProvidedCensus !== undefined) devProvidedCensus(self, name, devHops, pc, "ancestor provision");
      return pc.$provides[name];
    }
    // A DECLARED slot of this ancestor's class (an instance-declared provision
    // — `App [ density: number = 2 ]` — or an ordinary attribute a descendant
    // names). Read its EFFECTIVE value through the accessor, not the stored
    // table: a declarer whose slot is ITSELF a provided read (`Control [ theme:
    // Theme = provided("theme", SanFrancisco) ]`) then forwards transparently up
    // the chain — its defBinding runs and continues the walk — instead of
    // shadowing the real provider with its own (unevaluated) default. The
    // accessor tracks the slot's cell, so this stays reactive on the wired and
    // tracking paths alike.
    const pd = tableFor(DEFAULTS, p.constructor);
    if (pd !== null && name in pd) {
      remember(p as object);
      if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareProvidedCensus?: unknown }).__declareProvidedCensus !== undefined) devProvidedCensus(self, name, devHops, p, "ancestor slot");
      return (p as Record<string, unknown>)[name];
    }
  }
  if (hasDefault) {
    remember(null);
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareProvidedCensus?: unknown }).__declareProvidedCensus !== undefined) devProvidedCensus(self, name, devHops, null, "default (walked to the root)");
    return dflt;
  }
  throw new DeclareError(
    `provided("${name}"): no ancestor provides '${name}', and this read declares no default — provide '${name}' on an ancestor, or give the read a default`
  );
}

/** The one write path (public setters and setBound both land here):
 *  equality-gate, store, push the slot's Surface call, wake dependents. */
function write(self: object, name: string, v: unknown): void {
  const carrier = self as Carrier;
  const L = tableFor(LAYOUT, self.constructor);
  const slot = L?.index[name];
  if (slot !== undefined && L !== null && carrier.$base !== -1 && (carrier.$esc === undefined || !carrier.$esc.has(name))) {
    // A NUMERIC SLOT: gate on == in the table (a NaN write always propagates,
    // as === did), store, append to the write ring (the kernel marks it dirty
    // for the applier and wakes its subscribers when it next runs anything),
    // and push the Surface call ourselves, on change only.
    const kind = L.kinds[slot];
    if (typeof v !== (kind === "n" ? "number" : "boolean")) {
      // A union-typed slot (cornerRadius: a number OR a [tl, tr, br, bl]
      // list) leaves the table for this instance: the value goes to the JS
      // store from now on, and the kernel cell it may already have — with
      // subscribers — becomes the slot's wake-only dependency node.
      escape(carrier, name, slot, kind);
      writeRef(carrier, name, v);
      return;
    }
    const c = ensureBase(carrier) + slot;
    const nv = kind === "b" ? (v ? 1 : 0) : (v as number);
    if (table[c] === nv) return;
    if ((carrier as { $changing?: ReadonlySet<string> }).$changing?.has(name) === true) {
      throw new DeclareError(`onChange assigned '${name}', which is one of the values it was called for — a change handler may not write what it was told changed`);
    }
    table[c] = nv;
    touchCell(c);
    tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
    return;
  }
  writeRef(carrier, name, v);
}

function escape(carrier: Carrier, name: string, slot: number, kind: "n" | "b"): void {
  (carrier.$esc ??= new Set()).add(name);
  const base = carrier.$base;
  if (base !== undefined && base >= 0) {
    // keep the block's cell as the dependency node (block-owned: never freed
    // on its own); copy the value out first
    const cells = (carrier.$cells ??= Object.create(null) as Record<string, Cell>);
    const cell = new Cell(); cell.id = base + slot; cell.owned = true; cells[name] = cell;
    const n = table[base + slot];
    (carrier.$attrs ??= Object.create(tableFor(DEFAULTS, carrier.constructor)!) as Record<string, unknown>)[name] = kind === "b" ? n !== 0 : n;
  }
}

/** The JS-store write: equality-gate (=== or the slot's equal), store, push, wake. */
function writeRef(carrier: Carrier, name: string, v: unknown): void {
  const self = carrier as object;
  const defaults = tableFor(DEFAULTS, self.constructor)!;
  const cur = ((carrier.$attrs ?? defaults) as Record<string, unknown>)[name];
  if (cur === v) return;
  // Decoration values (Fill/Stroke/Shadow — immutable plain-data records)
  // gate on shallow structural equality, so a constraint re-producing an
  // equal value stops the cascade exactly as === does for scalars (ruled).
  const eq = tableFor(EQUALS, self.constructor)?.[name];
  if (eq !== undefined && eq(cur, v)) return;
  // THE CHANGE EVENT (reactive.ts wakes, fires at the settle's close): a change
  // handler may not write a value it was called for — a loop with a name.
  if ((carrier as { $changing?: ReadonlySet<string> }).$changing?.has(name) === true) {
    throw new DeclareError(`onChange assigned '${name}', which is one of the values it was called for — a change handler may not write what it was told changed`);
  }
  (carrier.$attrs ??= Object.create(defaults) as Record<string, unknown>)[name] = v;
  tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
  carrier.$cells?.[name]?.changed();
  noteWrite(self, name, cur, v);
}

/** A runtime-side write: a constraint's apply, auto-size, a load result.
 *  Same store/push/wake as the setter, but it neither marks the slot as
 *  author-set nor consults ownership (the caller *is* the owner). */
export function setBound(self: object, name: string, v: unknown): void {
  displaceDeclDefault(self as Carrier, name);
  write(self, name, v);
}
/** A runtime write onto a slot a DECLARED default rule owns retires the rule
 *  for good — storage wins, exactly as it won over the live fallback. */
function displaceDeclDefault(self: Carrier, name: string): void {
  const owners = self.$owners;
  if (owners === undefined) return;
  const o = owners[name];
  if (o !== undefined && o.declDefault) { o.dispose(); delete owners[name]; (self.$displaced ??= new Set()).add(name); }
}
/** Should a read of a declared-default slot evaluate the `{ }` live rather
 *  than trust the table? Yes while its rule has not landed yet (the install
 *  batch); for a TRACKED read, while the rule's own recompute is queued; for
 *  an UNTRACKED one (a handler), while ANY work is pending — the table lags
 *  the world until the settle. No once displaced or author-set: storage wins. */
function declStale(self: Carrier, name: string, tracked: boolean): boolean {
  const o = self.$owners?.[name];
  if (o === undefined) return !(self.$displaced?.has(name) ?? false) && !(self.$set?.has(name) ?? false);
  if (!o.declDefault) return false;
  return tracked ? o.isQueued() : workPending();
}
/** The rule's OWN apply: the table write without the displacement check. */
export function writeOwned(self: object, name: string, v: unknown): void { write(self, name, v); }
/** Is the slot set directly or owned by a constraint — the rank-1 fallback's
 *  "unset" test (a declared default rule installs only on an unset slot). */
export function isSetOrOwned(self: object, name: string): boolean { return provided(self as Carrier, name); }

/** A runtime-side ADDITIVE write: land `current + delta` on a numeric slot —
 *  the animation additive core (animation.md §4.2, LaszloAnimation.lzs:444–448:
 *  `target.setAttribute(attr, targ[attr] + (value − currentValue))`). Two
 *  animators writing deltas to one slot therefore COMPOSE instead of clobbering:
 *  each reads the live value (others' contributions already folded in) and adds
 *  its own increment. A zero delta is a no-op (nothing to store, push, or wake —
 *  the same cascade-stopping the equality gate gives an absolute re-write). */
export function addBound(self: object, name: string, delta: number): void {
  if (delta === 0) return;
  displaceDeclDefault(self as Carrier, name);
  const cur = (self as Record<string, unknown>)[name];
  write(self, name, (typeof cur === "number" ? cur : 0) + delta);
}

/** Was this slot ever author-set (a literal, or a direct assignment)?
 *  The R4 replacement for R3's 0-as-unset: auto-size asks this, so an
 *  explicit `width=0` now means zero, not "measure me". */
export function isSet(self: object, name: string): boolean {
  return (self as Carrier).$set?.has(name) ?? false;
}

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
export function cellIdsOf(self: object): number[] {
  const c = self as Carrier;
  const ids: number[] = [];
  const base = c.$base;
  if (base !== undefined && base >= 0) {
    const L = tableFor(LAYOUT, c.constructor);
    if (L !== null) for (let slot = 0; slot < L.count; slot++) ids.push(base + slot);
  }
  const cells = c.$cells;
  if (cells !== undefined) for (const cell of Object.values(cells)) if (cell.id >= 0) ids.push(cell.id);
  return ids;
}

/** The slot's class-level default — what a `:path` binding falls back to
 *  when the path is unresolved (the doc's rule, language §9). */
export function defaultOf(self: object, name: string): unknown {
  return tableFor(DEFAULTS, self.constructor)?.[name];
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

/** Return a retiring node's kernel cells (view.ts teardown): a freed cell
 *  drops its subscribers, so nothing can ever wake work for a dead view. */
export function freeCells(self: object): void {
  const carrier = self as Carrier;
  const cells = carrier.$cells;
  if (cells !== undefined) for (const name of Object.keys(cells)) cells[name].free();
  const base = carrier.$base;
  if (base !== undefined && base >= 0) {
    // a discarded view still ANSWERS its last values (a test, the Inspector,
    // a handler holding a reference): copy them out, then clear the block
    // and keep it for the next instance of this class
    // — only the values that DIFFER from the class defaults: `$attrs` sits on
    // the defaults, so a slot still at its default answers without a copy
    // (a row torn down under churn has most of its 40-odd slots untouched;
    // the full copy was 6.6% of a tracker filter change)
    const L = tableFor(LAYOUT, self.constructor)!;
    const defs = L.defaults;
    let attrs = carrier.$attrs;
    for (let slot = 0; slot < L.count; slot++) {
      const v = table[base + slot];
      if (v === defs[slot]) continue;
      const name = L.names[slot];
      if (carrier.$esc !== undefined && carrier.$esc.has(name)) continue;
      if (attrs === undefined) attrs = carrier.$attrs = Object.create(tableFor(DEFAULTS, self.constructor)!) as Record<string, unknown>;
      attrs[name] = L.kinds[slot] === "b" ? v !== 0 : v;
    }
    kernel().clearCells(base, L.count);
    BLOCK_VIEW[BLOCK_AT.get(base)!] = null;
    let free = FREE_BLOCKS.get(self.constructor);
    if (free === undefined) FREE_BLOCKS.set(self.constructor, (free = []));
    free.push(base);
    carrier.$base = -1;   // retired: reads fall through to $attrs from here on
  }
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
  /** The declared TYPE name, verbatim ("number", "array", …). */
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
  const base = (self as Carrier).$base;
  if (base !== undefined && base >= 0) {
    const L = tableFor(LAYOUT, self.constructor)!;
    const esc = (self as Carrier).$esc;
    for (let slot = 0; slot < L.count; slot++) {
      const name = L.names[slot];
      if (esc !== undefined && esc.has(name)) continue;
      out[name] = L.kinds[slot] === "b" ? table[base + slot] !== 0 : table[base + slot];
    }
  }
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
  c.percent = true;   // the kernel's auto-extent reads the flag off the owning rule
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
    // A DECLARED default's rule leaves the slot at the default's CURRENT
    // value (evaluated live, through every pending input — what the newcomer
    // read off the live fallback before): a rule displaced mid-flight, its
    // recompute still queued, must not park the slot on a stale number.
    if (prior.declDefault) refreshDeclDefault(self as Carrier, name);
    prior.dispose();
    delete owners[name];
  } else if (prior !== undefined) {
    throw new DeclareError(prior.arrangedBy !== null
      // The INCOMING constraint is the author's (bind.ts records the source text
      // and position on it before installing), so its `sourcePos` is the line
      // that wrote the losing value — which is the line an author needs.
      ? layoutConflictMessage(self.constructor.name, name, prior.arrangedBy, null, c.sourcePos)
      : `${self.constructor.name}.${name} is already bound (by ${prior.label})${at(c.sourcePos)}`);
  }
  owners[name] = c;
  // the kernel learns the owner too: its pull runs a queued owner for a
  // reader's first value, and one-owner holds on both sides of the seam
  const cell = slotCellOf(self, name);
  if (cell >= 0) c.ownCell(cell);
}

function refreshDeclDefault(self: Carrier, name: string): void {
  const t = tableFor(DEF_RULES, self.constructor)?.[name];
  if (t === undefined) return;
  let v: unknown;
  try { v = untracked(() => evalDefault(self, name, t.fn, t.outer)); } catch { return; }   // not evaluable yet: the table stands
  if (typeof v === "number" || typeof v === "boolean") write(self, name, v);
}

/** Release `c`'s ownership of `self.name` — the uninstall half of `own`,
 *  for owners that retire as a unit (a layout strategy detaching). Guarded on
 *  identity so a stale detach can never evict a newer owner. */
export function release(self: object, name: string, c: Constraint): void {
  const owners = (self as Carrier).$owners;
  if (owners !== undefined && owners[name] === c) {
    delete owners[name]; c.releaseCell();
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
