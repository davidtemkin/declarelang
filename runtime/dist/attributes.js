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
// Class → its attribute tables. All are prototype-chained objects mirroring
// the class hierarchy (Text's defaults chain to View's), so "nearest declared
// wins" is a plain property lookup — the same shape schema.ts's chain walk
// gives the checker, expressed in the runtime's own currency.
const DEFAULTS = new WeakMap();
const PUSHERS = new WeakMap();
const EQUALS = new WeakMap();
function provideCellFor(self, name) {
    const cells = (self.$provideCells ??= Object.create(null));
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
export function localProvision(self, name) {
    return self.$provides?.[name];
}
export function provideWrite(self, name, value) {
    const p = self;
    const store = (p.$provides ??= Object.create(null));
    if (name in store && store[name] === value)
        return;
    store[name] = value;
    p.$provideCells?.[name]?.changed();
}
/** Walk the constructor chain to the nearest class with a table, memoizing
 *  the answer for classes that declare nothing of their own (App). Classes
 *  declare their attributes at module load, before any instance exists, so
 *  the memo can never capture a stale answer. */
function tableFor(map, ctor) {
    let c = ctor;
    while (c !== null && c !== Function.prototype) {
        const t = map.get(c);
        if (t !== undefined) {
            if (c !== ctor)
                map.set(ctor, t);
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
export function defineAttributes(ctor, specs) {
    const parent = Object.getPrototypeOf(ctor);
    const defaults = Object.create(tableFor(DEFAULTS, parent));
    const pushers = Object.create(tableFor(PUSHERS, parent));
    const equals = Object.create(tableFor(EQUALS, parent));
    for (const name of Object.keys(specs)) {
        const spec = specs[name];
        defaults[name] = spec.def;
        pushers[name] = spec.push;
        equals[name] = spec.equal;
        const defBinding = spec.defBinding;
        const defOuter = spec.defOuter === true;
        const readOnly = spec.readOnly === true;
        const onTrack = spec.onTrack;
        const trackedOnce = onTrack !== undefined ? new WeakSet() : null;
        const live = spec.live;
        const trackedHook = spec.tracked;
        Object.defineProperty(ctor.prototype, name, {
            get() {
                const self = this;
                if (isTracking()) {
                    cellFor(self, name).track();
                    if (trackedOnce !== null && !trackedOnce.has(self)) {
                        trackedOnce.add(self);
                        onTrack(self);
                    }
                }
                else if (live !== undefined) {
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
            set(v) {
                if (readOnly) {
                    throw new DeclareError(`${this.constructor.name}.${name} is read-only — it is computed from its declaration and cannot be assigned`);
                }
                const self = this;
                // The divergence bit (materialization.md §2): a DIRECT write on an
                // armed node marks it diverged — local state reconstruction could
                // not reproduce. One WeakSet probe on the author-write path only
                // (setBound — constraint applies, runtime derives — never lands
                // here), armed only for replicated-instance subtrees.
                if (RUNTIME_WRITE === 0 && ARMED.has(self))
                    DIVERGED.add(self);
                const owner = self.$owners?.[name];
                if (owner !== undefined) {
                    if (!owner.yielding) {
                        throw new DeclareError(owner.arrangedBy !== null
                            ? layoutConflictMessage(this.constructor.name, name, owner.arrangedBy, null)
                            : `${this.constructor.name}.${name} is bound by a constraint (${owner.label}) — a direct write would be silently overwritten; change what the constraint reads instead`);
                    }
                    owner.dispose(); // a runtime derive yields: the author takes over
                    delete self.$owners[name];
                }
                (self.$set ??= new Set()).add(name);
                write(this, name, v);
            },
        });
    }
    DEFAULTS.set(ctor, defaults);
    PUSHERS.set(ctor, pushers);
    EQUALS.set(ctor, equals);
}
/** Is this slot set LOCALLY — an author set (literal or direct write) or an
 *  owning binding? A slot that is not overrides nothing, so its declaration
 *  default (a `provided(…)` read, for a face slot) governs. */
function provided(self, name) {
    return ((self.$set?.has(name) ?? false) ||
        self.$owners?.[name] !== undefined);
}
// Default-binding evaluation, re-entrancy-guarded: a default reading its own
// slot (directly or through a cycle of defaults) is a defect, named rather
// than overflowed.
const EVALING = new WeakMap();
function evalDefault(self, name, fn, outer) {
    let inFlight = EVALING.get(self);
    if (inFlight?.has(name) === true) {
        throw new DeclareError(`${self.constructor.name}.${name}'s default binding (transitively) reads itself`);
    }
    if (inFlight === undefined)
        EVALING.set(self, (inFlight = new Set()));
    inFlight.add(name);
    try {
        const node = self;
        return fn.call(self, node.parent, outer ? node.classroot : self);
    }
    finally {
        inFlight.delete(name);
    }
}
function cellFor(self, name) {
    const cells = (self.$cells ??= Object.create(null));
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
export function providedDefault(name, def) {
    return function () {
        return providedRead(this, name, true, def);
    };
}
export function providedRead(self, name, hasDefault, dflt) {
    // A node that PROVIDES a value can also read it — `App [ theme = { … }, fill =
    // { provided("theme").bg } ]`. Its own provision is checked first (a provision
    // is not a declared slot, so this never shadows a face slot's own read, which
    // resolves against ancestors). The walk below starts at the parent, so a
    // declared slot whose default IS a provided read still terminates.
    const s = self;
    if (s.$provides !== undefined && name in s.$provides) {
        if (isTracking())
            provideCellFor(s, name).track();
        return s.$provides[name];
    }
    for (let p = self.parent; typeof p === "object" && p !== null; p = p.parent) {
        const pc = p;
        // A named provision (an undeclared set — `App [ accent = #E05252 ]`).
        if (pc.$provides !== undefined && name in pc.$provides) {
            if (isTracking())
                provideCellFor(pc, name).track();
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
            return p[name];
        }
    }
    if (hasDefault)
        return dflt;
    throw new DeclareError(`provided("${name}"): no ancestor provides '${name}', and this read declares no default — provide '${name}' on an ancestor, or give the read a default`);
}
/** The one write path (public setters and setBound both land here):
 *  equality-gate, store, push the slot's Surface call, wake dependents. */
function write(self, name, v) {
    const carrier = self;
    const defaults = tableFor(DEFAULTS, self.constructor);
    const cur = (carrier.$attrs ?? defaults)[name];
    if (cur === v)
        return;
    // Decoration values (Fill/Stroke/Shadow — immutable plain-data records)
    // gate on shallow structural equality, so a constraint re-producing an
    // equal value stops the cascade exactly as === does for scalars (ruled).
    const eq = tableFor(EQUALS, self.constructor)?.[name];
    if (eq !== undefined && eq(cur, v))
        return;
    // THE CHANGE EVENT (reactive.ts wakes, fires at the settle's close): a change
    // handler may not write a value it was called for — a loop with a name.
    if (carrier.$changing?.has(name) === true) {
        throw new DeclareError(`onChange assigned '${name}', which is one of the values it was called for — a change handler may not write what it was told changed`);
    }
    (carrier.$attrs ??= Object.create(defaults))[name] = v;
    tableFor(PUSHERS, self.constructor)?.[name]?.(self, v);
    carrier.$cells?.[name]?.changed();
}
/** A runtime-side write: a constraint's apply, auto-size, a load result.
 *  Same store/push/wake as the setter, but it neither marks the slot as
 *  author-set nor consults ownership (the caller *is* the owner). */
export function setBound(self, name, v) {
    write(self, name, v);
}
/** A runtime-side ADDITIVE write: land `current + delta` on a numeric slot —
 *  the animation additive core (animation.md §4.2, LaszloAnimation.lzs:444–448:
 *  `target.setAttribute(attr, targ[attr] + (value − currentValue))`). Two
 *  animators writing deltas to one slot therefore COMPOSE instead of clobbering:
 *  each reads the live value (others' contributions already folded in) and adds
 *  its own increment. A zero delta is a no-op (nothing to store, push, or wake —
 *  the same cascade-stopping the equality gate gives an absolute re-write). */
export function addBound(self, name, delta) {
    if (delta === 0)
        return;
    const cur = self[name];
    write(self, name, (typeof cur === "number" ? cur : 0) + delta);
}
/** Was this slot ever author-set (a literal, or a direct assignment)?
 *  The R4 replacement for R3's 0-as-unset: auto-size asks this, so an
 *  explicit `width=0` now means zero, not "measure me". */
export function isSet(self, name) {
    return self.$set?.has(name) ?? false;
}
/** The slot's class-level default — what a `:path` binding falls back to
 *  when the path is unresolved (the doc's rule, language §9). */
export function defaultOf(self, name) {
    return tableFor(DEFAULTS, self.constructor)?.[name];
}
/** Retire every constraint that owns a slot on `self` — the teardown half a
 *  removed view needs (R8's replication is the first thing that removes):
 *  disposed constraints unlink from their Cells, so a later data or
 *  attribute change can never wake work for a dead view. */
export function disposeBindings(self) {
    const owners = self.$owners;
    if (owners === undefined)
        return;
    for (const name of Object.keys(owners)) {
        owners[name].dispose();
        delete owners[name];
    }
}
/** Drop a slot's owner record WITHOUT disposing (states.md §3: the last state
 *  override leaving a formerly-unowned slot has already retired its own driver
 *  and now reverts the slot to a plain stored value — the caller restores it). */
export function disown(self, name) {
    const owners = self.$owners;
    if (owners !== undefined)
        delete owners[name];
}
/** The constraint (if any) that owns this slot's value. */
export function ownerOf(self, name) {
    return self.$owners?.[name] ?? null;
}
const DECLARED = new WeakMap();
/** Record a class's author declarations (instantiate.ts makeClass). */
export function recordDeclarations(ctor, table) {
    DECLARED.set(ctor, table);
}
/** Every author-declared slot visible on this instance — the class's own and
 *  its user superclasses', merged up the prototype chain (runtime base
 *  classes never register, so View's built-ins stay out of the answer). */
export function declarationsOf(self) {
    const out = {};
    for (let c = self.constructor; c != null; c = Object.getPrototypeOf(c)) {
        const t = DECLARED.get(c);
        if (t !== undefined)
            for (const k of Object.keys(t))
                if (!(k in out))
                    out[k] = t[k];
    }
    return out;
}
/** Tooling reads (inspect.ts): the node's OWN attribute values (writes and
 *  bound results — `$attrs`, the instance overlay over the class defaults),
 *  and the slot names currently owned by constraints. Snapshots, not live. */
export function ownValues(self) {
    const own = self.$attrs;
    const out = {};
    if (own !== undefined)
        for (const k of Object.keys(own))
            out[k] = own[k];
    return out;
}
export function ownedSlots(self) {
    const owners = self.$owners;
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
const ARMED = new WeakSet();
const DIVERGED = new WeakSet();
// A RUNTIME write: an animator driving the slot it declares. It uses plain
// assignment on purpose (§5: assignment wins, so an animator displaces any
// derive that would otherwise overwrite its rest value) — but it is NOT an
// author's touch. The value is derived from a declared animator and its
// declared target, so a reconstruction reproduces it exactly; the divergence
// bit must not see it, or every row holding a spring becomes permanently
// "touched" and the windowed reconciler stops recycling it.
let RUNTIME_WRITE = 0;
/** Run `f` with its direct writes exempt from the divergence bit. */
export function asRuntimeWrite(f) {
    RUNTIME_WRITE++;
    try {
        return f();
    }
    finally {
        RUNTIME_WRITE--;
    }
}
/** Arm divergence tracking on one node (the replicator walks the instance
 *  subtree after finish). */
export function armDivergence(self) {
    ARMED.add(self);
}
/** Has this node received a direct write since it was armed? */
export function nodeDiverged(self) {
    return DIVERGED.has(self);
}
// Percent bindings, marked: a percent resolves against the PARENT's extent
// (bind.ts), so a parent deriving its own extent from its children must not
// count a child's percent-bound slot — it would be reading its own output
// (auto-extent's ruled cycle guard, view.ts). Ownership metadata, so it lives
// with own/ownerOf; a WeakSet keeps it pay-per-use.
const PERCENTS = new WeakSet();
/** Record that `c` is a percent binding (called by bindPercent). */
export function markPercent(c) {
    PERCENTS.add(c);
}
/** Is `self.name` owned by a percent binding — a slot whose value resolves
 *  against the parent's extent on that axis? */
export function percentOwned(self, name) {
    const owner = self.$owners?.[name];
    return owner !== undefined && PERCENTS.has(owner);
}
/** Record `c` as the owner of `self.name`. One declarative owner per slot:
 *  a second binding is a defect upstream (check flags duplicate attributes),
 *  so it fails loudly here rather than silently stacking. The one exception
 *  mirrors the write path above: a *yielding* runtime derive (auto-extent,
 *  auto-size) yields to an author binding exactly as it yields to an author
 *  write — reached when replication attaches an instance (installing
 *  auto-extent) before its bindings finish. */
export function own(self, name, c) {
    const owners = (self.$owners ??= Object.create(null));
    const prior = owners[name];
    if (prior !== undefined && prior.yielding) {
        // A yielding owner yields to ANY newcomer — an author binding as before,
        // and since B5 also a newer runtime derive (the windowed block's extent
        // derive displaces auto-extent exactly as an author write would).
        prior.dispose();
        delete owners[name];
    }
    else if (prior !== undefined) {
        throw new DeclareError(prior.arrangedBy !== null
            ? layoutConflictMessage(self.constructor.name, name, prior.arrangedBy, null)
            : `${self.constructor.name}.${name} is already bound (by ${prior.label})`);
    }
    owners[name] = c;
}
/** Release `c`'s ownership of `self.name` — the uninstall half of `own`,
 *  for owners that retire as a unit (a layout strategy detaching). Guarded on
 *  identity so a stale detach can never evict a newer owner. */
export function release(self, name, c) {
    const owners = self.$owners;
    if (owners !== undefined && owners[name] === c) {
        delete owners[name];
    }
}
/** Install a runtime-supplied, *yielding* derive (Text auto-size, View
 *  auto-extent, and any future runtime-computed slot): the same Constraint
 *  machinery authors get, flagged so a direct author write displaces it
 *  instead of erroring. Returns the constraint so an installer that must
 *  re-run it on a non-tracked fact (auto-extent on tree mutation — `children`
 *  is not a reactive collection) can hold it. */
export function bindDerived(self, name, compute) {
    const c = new Constraint(`${self.constructor.name}.${name} (runtime derive)`, compute, (v) => write(self, name, v), 0, true);
    own(self, name, c);
    c.run();
    return c;
}
//# sourceMappingURL=attributes.js.map