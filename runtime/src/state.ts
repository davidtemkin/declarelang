// State — a named, toggleable bundle of attribute OVERRIDES and a conditional
// CHILD SUBTREE on its enclosing view, switched by one boolean `applied`
// (design-docs/states.md). A twin-table component like Animator: schema in
// schema.ts, runtime class here, registered in instantiate.ts. Non-visual
// (base null; the checker's family test is descendsFrom(schema, "State")).
//
// It is NOT a container of its own: a State's body `name = value` entries are
// overrides that target the ENCLOSING view (checked against that view's
// schema), and its `id: Type [ … ]` entries are a subtree instantiated INTO the
// enclosing view while applied — not children of the State node. constructState
// (instantiate.ts) captures both rather than attaching them.
//
// `applied` is a read surface with one provider (states.md §2): a declarative
// gate (`applied = { … }`) OR the verbs apply()/remove()/toggle() — never a raw
// poke. A change fires the push below, which installs or removes the effects:
// the override precedence stack (below) and the child subtree (buildChildren).

import { Node } from "./node.js";
import { View } from "./view.js";
import { Constraint } from "./reactive.js";
import { defineAttributes, disown, disposeBindings, own, ownerOf, setBound } from "./attributes.js";
import { DeclareError } from "./errors.js";
import type { Element } from "./parser.js";
import type { Surface } from "./backend.js";

/** One captured override: the target slot and a factory that builds a FRESH
 *  driving Constraint against the target view on each apply (ephemerality —
 *  states.md §3). A literal's factory returns the constant; a `{ }` override's
 *  returns the compiled expression, which tracks live only while it is the top
 *  of its slot's stack. */
export interface Override {
  slot: string;
  make: (target: View) => Constraint;
}

// ── The per-slot override precedence stack ──────────────────────────────────
// Materialized on the target view the first time any state overrides a slot (a
// Symbol side-table, pay-per-use — like the Animator's ledger). Only the TOP
// (highest declaration priority) active override is ever LIVE and owns the
// slot; lower active overrides are remembered by (priority, factory) and built
// only if they reach the top (states.md §3: static declaration-order
// precedence, later-declared wins). The displaced base — a `{ }` owner or a
// plain value — is captured on the first push and restored on the last pop, so
// removing a state returns the slot to exactly what drove it before.

interface SlotStack {
  /** A displaced `{ }` owner, suspended while any override is active. */
  baseOwner: Constraint | null;
  /** Else the plain value to restore when the stack empties. */
  baseValue: unknown;
  /** Active overrides, ascending priority — the last is the top. */
  entries: { priority: number; make: (t: View) => Constraint }[];
  /** The live constraint driving the slot (the top's), or null. */
  topK: Constraint | null;
}

const STACKS = Symbol("overrideStacks");

function stacksFor(view: View): Map<string, SlotStack> {
  const v = view as unknown as { [STACKS]?: Map<string, SlotStack> };
  return (v[STACKS] ??= new Map());
}

/** Build and install the current top entry as the slot's live driver. The
 *  caller has already suspended (base) or disposed (prior top) whatever owned
 *  the slot; its owner RECORD still lingers, so clear it before installing —
 *  own() guards against double-owning rather than overwriting. */
function driveTop(view: View, slot: string, s: SlotStack): void {
  const top = s.entries[s.entries.length - 1];
  s.topK = top.make(view);
  disown(view, slot);
  own(view, slot, s.topK);
  s.topK.run();
}

function pushOverride(view: View, slot: string, priority: number, make: (t: View) => Constraint): void {
  const map = stacksFor(view);
  let s = map.get(slot);
  if (s === undefined) {
    // First override on this slot: displace and remember the base.
    const owner = ownerOf(view, slot);
    owner?.suspend();
    s = {
      baseOwner: owner,
      baseValue: owner === null ? (view as unknown as Record<string, unknown>)[slot] : undefined,
      entries: [],
      topK: null,
    };
    map.set(slot, s);
  }
  // Insert by ascending priority (a later-declared state sits nearer the top).
  let i = s.entries.length;
  while (i > 0 && s.entries[i - 1].priority > priority) i--;
  s.entries.splice(i, 0, { priority, make });
  // A new top takes the slot; the prior top's live constraint retires (a lower
  // override never runs until it reaches the top).
  if (i === s.entries.length - 1) {
    s.topK?.dispose();
    driveTop(view, slot, s);
  }
}

function popOverride(view: View, slot: string, priority: number): void {
  const map = stacksFor(view);
  const s = map.get(slot);
  if (s === undefined) return;
  const i = s.entries.findIndex((e) => e.priority === priority);
  if (i < 0) return;
  const wasTop = i === s.entries.length - 1;
  s.entries.splice(i, 1);
  if (!wasTop) return; // a dormant lower override left — the live top is unchanged
  s.topK?.dispose();
  s.topK = null;
  if (s.entries.length > 0) {
    driveTop(view, slot, s); // the next-highest override takes the slot
    return;
  }
  // Stack empty: restore the displaced base and drop the side-table entry.
  map.delete(slot);
  disown(view, slot); // clear the just-disposed top's lingering owner record
  if (s.baseOwner !== null) {
    own(view, slot, s.baseOwner);
    s.baseOwner.resume();
  } else {
    setBound(view, slot, s.baseValue);
  }
}

// ── The State node ──────────────────────────────────────────────────────────

export class State extends Node {
  declare applied: boolean;

  // Captured from the body at construct.
  /** Value overrides on the enclosing view. */
  overrides: Override[] = [];
  /** Conditional child templates, the build-time materializer, and the
   *  classroot their bodies' members bind to (the state's use site). */
  childTemplates: readonly Element[] = [];
  materialize: ((t: Element, croot: View) => { view: View; finish: () => void }) | null = null;
  childClassroot: View | null = null;

  // Runtime state.
  /** Declaration-order precedence, cached at init before any child inserts. */
  private priority = 0;
  /** Whether the effects are currently installed (idempotency guard). */
  private installed = false;
  /** The live child views this state instantiated, for teardown. */
  private builtChildren: View[] = [];

  /** Cache declaration-order precedence the moment the state is linked under its
   *  view (appendChildren, pass one) — before any gate fires in pass two and
   *  before sibling states insert children, so the index is pure source order
   *  (states.md §3: later-declared wins). */
  onLinked(): void {
    const parent = this.parent;
    if (parent !== null) this.priority = parent.children.indexOf(this);
  }

  /** Apply the initial value once the tree is linked (initTree). A gated state
   *  has usually already synced from its gate's first run in pass two — this is
   *  idempotent — but a literal `applied = true` (no gate) applies here. */
  init(): void {
    this.sync(this.applied);
  }

  apply(): void {
    this.drive(true);
  }
  remove(): void {
    this.drive(false);
  }
  toggle(): void {
    this.drive(!this.applied);
  }

  /** The verbs' one write path: reject when a declarative gate owns `applied`
   *  (states.md §2 — gate XOR verbs), else drive through setBound (→ push →
   *  sync), the sanctioned path, not a raw assignment. */
  private drive(v: boolean): void {
    if (ownerOf(this, "applied") !== null) {
      throw new DeclareError(
        `${this.constructor.name}.applied is bound by a constraint — a state is gated by { } OR driven by the verbs, not both; change what the gate reads instead of calling ${v ? "apply" : "remove"}()`
      );
    }
    setBound(this, "applied", v);
  }

  /** Install or remove this state's effects. Idempotent, and a no-op until the
   *  enclosing view is linked (the initial sync runs from init()). */
  sync(v: boolean): void {
    const target = this.parent;
    if (!(target instanceof View)) return;
    if (v === this.installed) return;
    this.installed = v;
    if (v) {
      for (const o of this.overrides) pushOverride(target, o.slot, this.priority, o.make);
      this.buildChildren(target);
      this.fire("onApply");
    } else {
      this.fire("onRemove");
      this.teardownChildren(target);
      for (const o of this.overrides) popOverride(target, o.slot, this.priority);
    }
  }

  /** Instantiate the conditional subtree into the target at the state's slot
   *  (just after the state node), attach live surfaces, fire init — the same
   *  construct/finish path replicate.ts runs per record. */
  private buildChildren(target: View): void {
    if (this.materialize === null || this.childTemplates.length === 0) return;
    let index = target.children.indexOf(this) + 1;
    const finishes: (() => void)[] = [];
    for (const tmpl of this.childTemplates) {
      const { view, finish } = this.materialize(tmpl, this.childClassroot ?? target);
      target.insertChild(view, index++);
      if (tmpl.name !== null && !(tmpl.name in target)) {
        (target as unknown as Record<string, unknown>)[tmpl.name] = view;
      }
      this.builtChildren.push(view);
      finishes.push(finish);
    }
    // Attach surfaces if the target is live (mirrors Replicator's post-link
    // attach): each child lands before the first live sibling after the block.
    if (target.backend !== null && target.surface !== null) {
      for (const v of this.builtChildren) {
        const before = surfaceAfter(target, v);
        v.attach(target.backend, target.surface, before);
      }
    }
    for (const f of finishes) f();
  }

  /** Retire the subtree: discard each built view's standing machinery and
   *  surface, unlink it, and drop any name it bound. */
  private teardownChildren(target: View): void {
    for (const v of this.builtChildren) {
      v.discard();
      target.removeChild(v);
    }
    for (const tmpl of this.childTemplates) {
      if (tmpl.name !== null && (target as unknown as Record<string, unknown>)[tmpl.name] !== undefined) {
        delete (target as unknown as Record<string, unknown>)[tmpl.name];
      }
    }
    this.builtChildren = [];
  }

  /** Retire with the host view (View.discard reaches every child now): dispose
   *  our `applied` gate binding — else it lingers, subscribed to whatever it
   *  gated on (`applied = { app.openSection … }`), keeping this state and its
   *  view alive. The state's EFFECTS (override constraints owned by the target,
   *  built children spliced into the target) are torn down by the target view's
   *  own discard, so there is nothing else to undo here. */
  override discard(): void {
    disposeBindings(this);
    super.discard();
  }

  /** Fire a carried handler if installed (onApply / onRemove) — a plain Node
   *  dispatch, like the Animator's on* firing. */
  private fire(handler: string): void {
    const h = (this as unknown as Record<string, unknown>)[handler];
    if (typeof h === "function") (h as () => void).call(this);
  }
}

/** The first live surface strictly after `v` among the target's View children —
 *  the `before` reference a freshly attached child stacks against (null = the
 *  parent's end), so an inserted subtree lands in child order. */
function surfaceAfter(target: View, v: View): Surface | null {
  const kids = target.children;
  for (let i = kids.indexOf(v) + 1; i < kids.length; i++) {
    const c = kids[i];
    if (c instanceof View && c.surface !== null) return c.surface;
  }
  return null;
}

defineAttributes(State, {
  applied: { def: false, push: (self, v) => (self as State).sync(v as boolean) },
});
