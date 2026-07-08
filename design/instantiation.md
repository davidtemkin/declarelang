# neo-LZX imperative instantiation — the contract

A **hard requirement**: a developer can create instances of neo-LZX
(declaratively-declared) classes at runtime, from inside a `{ }` TS block, by
the **same name** the class has in markup:

```
class WeatherTab extends View [ … ]        // declared in markup
// …inside any { } body:
const t = new WeatherTab({ label: "New" }) // constructed imperatively, same name
report.weatherContent.attach(t)            // placed into the live tree
```

This note pins how that works — the runtime model, the reason it is *not*
LZX's `new lz.klass(parent, …)`, and how the type surface (formatting/typecheck
track, APPROACH §5) makes `new WeatherTab()` typecheck without a namespace or a
prefix ever reaching the developer's code.

Ruled by the human, 2026-07-03. Create-by-string (`newClassFromName("…")`) is a
later case (§8); `new ClassName()` is the one this contract lands.


## 1. Why not `new lz.klass(parent, …)`

LZX baked the parent into construction. That does not generalize in neo,
because **`parent` is a View concept and the node hierarchy is wider than
View**: `Dataset`, `DataSource`, `Animator`, `AnimatorGroup` are `Node`s, not
`View`s, and have no view-parent. A universal `new` cannot take a parent it
cannot always honor. So construction and placement split:

- **construct** — universal, parent-free.
- **attach** — a *View* operation (and its per-kind analogues for non-Views, §5).

The developer "creates an object, then attaches it to a parent via an API if
appropriate" — the "if appropriate" being exactly the View/Node line.


## 2. Two phases

### 2.1 Construct — `new X({ …attrs })`, detached

`new WeatherTab({ sel: true, x: 100 })` builds the instance and its **declared
subtree** (`WeatherTab`'s `top`/`bg`/`icon`/`caption`), applies the initial
attributes (a partial of the settable slots, object form — named and optional),
and runs the class's **own** constraints. `classroot` is set here — it is
intrinsic to the subtree, not parent-relative.

What construct deliberately does **not** do is resolve anything
parent-relative — percent geometry, inherited `datapath`, prevailing fonts,
layout slot — because detached, those have no answer. The result is a valid,
unattached instance.

### 2.2 Attach — `parent.attach(child, index?)`, and `child.detach()`

Attach links the instance into a live parent and wires the parent-relative
relationships that construct skipped (the "voodoo", §4). `detach()` reverses it.
Both are the reactive core's existing `own`/`release`/subscribe machinery —
attach adds no new mechanism, it just runs the parent-relative half of the
construct pipeline for a subtree.

### 2.3 Lifecycle

`init` fires on **attach**, not construct — because an `onInit` handler
typically reads parent context (datapath, prevailing values, resolved
geometry) that only exists once the instance is in the tree. For a subtree,
`init` fires **bottom-up**, so a parent's handler sees ready children.


## 3. The confirmed shapes

- **Construct:** `new WeatherTab({ sel: true, x: 100 })` — object of initial
  slot values; the class's declared constraints still apply on top.
- **Attach:** `parent.attach(child, index?)` (parent-centric, optional layout
  index), with `parent.attachBefore(child, sibling)` / `attachAfter` for
  ordered insert, and `child.detach()` to remove.
- **Lifecycle:** `init` on attach, bottom-up.


## 4. What attach does (View ← View)

In order, all through the existing reactive substrate + one `settle()`:

1. **Structural + backend link** — set `parent`, insert into `children` at the
   index, parent the backend render node (DOM: insert the element; Canvas:
   enter the parent's paint order).
2. **Layout ownership** — if the parent has a `layout`, it `own()`s the child's
   position slots and re-lays (the same `own`/`release` `SimpleLayout` uses; a
   new child re-flows its siblings — one layout pass).
3. **Relative geometry** — a `width = 50%` that was inert while detached becomes
   a live constraint on the parent's measurement (percent had no base before).
4. **Datapath inheritance** — the subtree inherits the parent's effective
   cursor; every `:path` read/binding in it resolves against it.
5. **Prevailing follow** — each unset prevailing slot (font quartet, theme,
   stylesheet) subscribes to the nearest providing ancestor's live value.
6. **Settle + init** — one `settle()` propagates all of the above (layout
   places, percents compute, bindings fire, followers update, backend paints);
   then `init` fires bottom-up.

`detach()` is the mirror: release layout ownership, tear down the
percent/datapath/prevailing subscriptions, unparent the backend node, fire
teardown. Cheap, because it is the reactive core's own `release`/unsubscribe.
`detach` then `attach` elsewhere = move a subtree.


## 5. Non-Views, and containers that aren't Views

There are two trees: **Node containment** (universal — every node has a place)
and **View visual wiring** (View-only — layout, geometry, render). So attach is
always *structural link (common) + a per-kind "go live" wiring (virtual)*, and
the heavy wiring of §4 is a View specialty. The other containers:

- **AnimatorGroup ← Animator** — the child joins the group's members, inherits
  its cascaded attrs (`duration`/`motion`/…), and enters the group's
  sequential/simultaneous schedule and the additive ledger (animation.md §4).
  No layout/geometry/render — an animator has no box.
- **Dataset ← data node** — the child joins the data tree so `:path` reads see
  it and dependent bindings re-resolve on the next settle. No visual half.

So each container has its **own typed attach** — `view.attach(v: View)`,
`group.attach(a: Animator)`, `dataset.attach(n)` — and the type surface enforces
legal containment for free: `group.attach(aView)` or `view.attach(aDataset)` is
a **compile error**, because the child types do not line up. Same shape
everywhere — a structural link plus a "go live" — just that a View's go-live is
the six-step wiring and a non-View's is its own lighter, box-free version.


## 6. Name-equivalence and the type surface — no namespace, no prefix

Because `new WeatherTab()` / `new Text()` / `new Image()` must reference the neo
classes under their markup names, **neo names win in `{ }`-body scope**. This is
already the runtime's stance — `src/image.ts` names its class `Image`, shadows
the DOM `Image`, and reaches the DOM one via `document.createElement("img")`.

The collision with lib.dom globals (`Image`, `Text`, `Event`, `Node`, …) is
resolved by **lexical shadowing, not namespacing**. The component names are
in-scope *bindings* — a generated `import`/closure — that shadow the DOM
globals *within the body's scope*:

```ts
// generated around the body — the developer never writes this:
import { WeatherTab, Text, Image, View } from "<neo-surface>"   // module-locals shadow lib.dom
// the developer's body:
const w = new WeatherTab()      // → neo class ✓
const i = new Image()           // → neo Image (shadows DOM), name-equivalent ✓
document.createElement("img")   // → lib.dom's document (NOT shadowed) → HTMLImageElement
Math.max(a, b)                  // → lib.es global, untouched
```

A local/import shadowing a global is legal and unambiguous in TS — no
`TS2300`, and **lib.dom stays fully loaded** for everything a body legitimately
needs. The developer writes bare `new WeatherTab()`; the compiler wires the
scope in *both* the runtime emit and the throwaway check-TS. Crucially,
**compile-time scope == runtime scope** (both bind the same generated component
names), so the typechecker and the runtime cannot disagree about what `Image`
means. A `declare class WeatherTab extends View { … }` in the scaffold is *both*
a type and a constructor value, so `new WeatherTab()` typechecks and yields a
`WeatherTab`; `attach`/`detach` are typed methods on `View`, so the View/Node
containment rules of §5 are checked, not policed by convention.


## 7. One pipeline, two triggers

The declarative tree-builder already does construct-then-wire. Factoring it into
"construct detached" (§2.1) + "attach subtree" (§2.2/§4) means the **same
machinery** serves both the compiler's tree build and the developer's imperative
`new` — the imperative path is not a parallel implementation, it is the same two
phases with a different trigger. This is the refactor target: expose the two
phases the tree-builder already runs.


## 8. Create-by-string (deferred)

`newClassFromName("WeatherTab")` is a later case. It falls out of the same
registry: promote the runtime's private tag→class tables (`TAGS`/`LAYOUTS`/
`DATA`/`ANIMATORS`, `instantiate.ts`) into a name-keyed registry, and generate a
name→type map for tsc (the `HTMLElementTagNameMap` pattern): a **literal** string
gets the concrete type (`newClassFromName("WeatherTab") → WeatherTab`), a
**runtime** string degrades to the base (`→ View`/`Node`). Name-equivalence
makes the string the single identity across markup tag, runtime class, and
dynamic lookup. `new ClassName()` lands first.


## 9. Status — landed vs. to build

- **Landed:** built-in components are already `new`-able classes (`TAGS = { App,
  View, Text, Image }`); the reactive substrate attach/detach reuse (`own`/
  `release`/`setBound`/`settle`, `layout.ts`); the twin-table construct paths
  (`constructView`/`constructData`/`constructAnimator`, `instantiate.ts`).
- **To build (this contract):**
  1. **User classes compile to subtree-building constructors** — `new
     WeatherTab(attrs)` builds its declared subtree, not just an empty object.
  2. **Construct/attach split** — factor the tree-builder's construct-then-wire
     into the two phases (§7), with `attach`/`attachBefore`/`attachAfter`/
     `detach` on `View` and the per-kind analogues on `AnimatorGroup`/`Dataset`.
  3. **Body-scope binding** — `{ }` bodies are emitted into a scope where the
     component names are bound (the registry as lexical scope), matching §6.
  4. **Scaffold signatures** — the typed-scaffolding generator (typecheck slice)
     emits the constructor signature + `attach`/`detach` so `new`/`attach`
     typecheck and the containment rules are enforced.

Sequencing: this is upstream of the typecheck slice-2 work — the scaffold's
constructor/attach signatures (9.4) are written against the shapes in §3.
