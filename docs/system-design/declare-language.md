# Declare — The Language

*A primer and reference for the Declare language surface — enough to read and write it cold. It assumes you can read **TypeScript** and have built a user interface before; it assumes **no** prior knowledge of Declare or its ancestor, OpenLaszlo (though it notes the lineage where that clarifies a choice). For the product vision and why it's worth building, see [declare.md](declare.md); for the compiler, renderer, and component library that realize it, see [declare-implementation.md](declare-implementation.md). This is a design under active iteration; [§13](#13-what-is-not-settled) is honest about what isn't locked.*

**What it is.** Declare is a language for building application UIs — what HTML is to the web's documents, it is to the web's applications. You compose a tree of components — views, text, buttons, lists, forms — set their attributes, bind them to data, and handle events. The declarative layer is small; all real logic is ordinary TypeScript. The defining idea: *a binding is not a function you remember to re-run, but a standing relationship the runtime keeps true.* Two aims run under the whole design and are first-order, not afterthoughts: **state-of-the-art performance** and a **continuous, never-jumping feel** — delivered by the language, the compiler, and above all the runtime, working together. (It's a modern redesign of OpenLaszlo, a 2000s framework that had this model — components-as-classes, automatic constraints, declarative data binding — years early, on the wrong runtime.)

**How to read this.** §1 is the design values; §2 shows a whole program before any rules; §3–§6 are the *shape* of the language (brackets, members, classes, values); §7–§11 are the *working parts* (reactivity, events, data, state, scope); §12 is style. **Appendix A** is a complete, commented application; **Appendix B** maps every construct to its OpenLaszlo predecessor.

---

## 1. Design goals

These values explain the shape of everything that follows.

1. **Declarative and reactive by default.** Structure, data binding, reactivity, and event subscription are *declared*, not wired by hand. A binding is a standing relationship the runtime maintains — no effect hooks, no manual subscribe/unsubscribe, no dependency arrays, no "re-render."
2. **Composition is the hierarchy.** The bracket nesting *is* the view tree; you read structure by scanning it. You write one-off structure inline and extract a class only for genuine reuse.
3. **Modern and familiar.** The surface optimizes for adoption: TypeScript/React-style names and conventions (`backgroundColor`, `onClick`), and *all real logic is ordinary TypeScript* — the language you already know, with procedural escape hatches where they're needed. The only genuinely new thing to learn is the small declarative layer, not a re-skin of everything.
4. **State-of-the-art performance.** Not a tuning pass bolted on at the end — a property the language, the compiler, and *above all* the runtime are designed together to deliver. The language stays analyzable and confines reactivity to where it is declared; the compiler wires dependencies statically and emits tight code (no `Proxy` or accessor tax, dead bindings eliminated); and the runtime updates in proportion to what actually changed — no virtual-DOM diff, no reconciliation, near-zero steady-state allocation, glitch-free scheduling. The runtime is an *optimizing* one: it uses the platform's fastest facility per job — the DOM where it is fast enough, its own GPU pixels where they win (the crossover is measured — the DOM's per-node cost scales with the tree while own-pixels stays flat, so own-pixels pulls ahead on large, data-dense, reactively-animated surfaces). DOM-fast by default, above-DOM where it matters — and the next two goals stand on it.
5. **The aim is a fluid visual experience.** Arrangements, transitions, and state changes should *move* rather than jump — a **continuous, not discrete, UX**. Reactivity, animators, and layout sit on one reactive core, so a value change, a state change, or a *layout* change can animate, natively and composably (not as a library bolted onto a re-render). This needs the headroom of goal #4, and it is delivered by the language *and* the runtime together: a reactive core with an optimizing runtime free to render each part on whatever substrate serves it, reaching for own pixels precisely where fluid, layout-level animation demands it. This doc covers the language half; see [declare.md](declare.md) and [declare-implementation.md](declare-implementation.md) for the runtime.
6. **The render substrate is abstracted — and the runtime is independent.** You write components, attributes, and layouts — never DOM nodes, CSS, or the surface that draws them. The runtime wields whatever renders the app best: the DOM as a first-class facility (its text, input, IME, video, and accessibility are free, and it is fast enough for most apps), its own GPU pixels (Canvas/WebGL) where they win, and — off the web — a native kernel entirely (not a layer over platform widgets, but *these* components on a platform-tuned kernel). This is **proven, not aspirational**: one Declare source already runs on both a DHTML kernel and an own-pixels canvas kernel, touching neither — the successor to OpenLaszlo running on Flash and DHTML from one source. Runtime-independence has teeth *for the language*: nothing substrate-specific may appear in it (no DOM, no CSS, no platform types), which is exactly why what you learn is the model, never the medium. Styling serves the same end — **LZX-native and use-case-defined, free to exceed what CSS can express**; the runtime maps it to CSS where CSS suffices and to drawing where it does not (see [style.md](style.md)). You still reach a raw DOM element deliberately, as an *island*, when you want the browser's own machinery directly.
7. **AI-native — generable and analyzable without a massive corpus.** Most code generation is corpus-bound: tools emit React + Tailwind because that is what they have seen. Declare is built to be machine-written and -read *without* that crutch, and it falls out of the goals above — the **logic is TypeScript**, so the hard part of generation rides the largest corpus there is; the **declarative surface is small and regular**, so it fits in a prompt and can be constrained at decode time (a model that never trained on Declare still emits *only* valid programs); and the **structure is compositional and statically typed**, a tree of known parts that is easy to form correctly and to verify. Static analyzability is the *means*, not the headline: the same dataflow a model reasons about is what powers the tooling — the reactive inspector, the language server.

---

## 2. A whole program, first

Before any rules, here is a complete, runnable app — a counter. Read it top to bottom; the annotations point out everything §3 onward will explain.

```
App [                                            // the one root: the whole visible tree
    width = 400, height = 140, backgroundColor = #1E3A49,

    count: number = 0,                           // a declared, reactive piece of state

    Button [ label = "Add one", x = 20, y = 20,
        onClick() { count = count + 1 },         // an event handler; the body is TypeScript
        ],

    Text [ y = 70, color = #FFFFFF,
        x    = { (parent.width - this.width) / 2 },   // a constraint: re-centers as the window resizes
        text = { `Clicked ${count} times` },          // a constraint: re-runs whenever count changes
        ],
    ]
```

Click the button and the text updates itself; resize the window and it re-centers. You wrote no update logic for either — both lines are *constraints*, standing relationships the runtime keeps true. The bug we all know — read a value once, then it goes stale — cannot occur here, because each binding is an edge in a dependency graph, not a one-shot computation.

That is the whole feel of the language. The rest is detail.

---

## 3. The two delimiters

The entire mental model is two brackets:

- **`[ … ]` holds a component's *members*** — its attributes, its children, and (in a class) its declarations.
- **`{ … }` is *TypeScript*** — a value expression, a method body, a `script` block. When you see `{`, you have stepped into TypeScript until the matching `}`.

Members inside a `[ ]` are told apart **by shape** (next section), and there is exactly one rule for values:

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal | `width = 100%`, `color = navy`, `count = 12` |
| a **`{ … }`** value | a live TypeScript expression (a *constraint*) | `width = { parent.width - 10 }` |
| a **`:`-prefixed** path | a read from bound data (a *datapath*) | `text = :title` |

So static vs. live is visible at a glance — no markup, no editor coloring needed: if it's in braces, it re-evaluates; if it's bare, it doesn't; if it starts with `:`, it comes from data.

**The seam is a contract, both ways.** A bare/literal position is the *declarative surface*, and there the compiler is free to give a token a meaning plain TypeScript wouldn't: `100%` is a `Length`, `#1E3A49` a `Color`, `navy` a named color, `Dark` a declared stylesheet (`stylesheet = Dark`), `:title` a datapath. Inside `{ }` that freedom **stops** — you are in plain TypeScript, an ordinary identifier means exactly what TypeScript says, and the compiler *never silently reinterprets one*. `Dark` inside a body is an unresolved variable, not a stylesheet; to reach one you call an ordinary method, `this.lookupStylesheet("Dark")`. The only transformation a body ever receives is the constraint wrapper that tracks which reactive values it read; the `:path` sigil is an explicit opt-in sub-syntax, not identifier rewriting. Two rules the language holds to fall out of this: **compiler internals are never authored** — anything spelled with a `$` (`$data`, internal marks) is machine-emitted and you never write it — and **a convenience wanted inside a body is offered as a plain named, typed function, never as magic**, so a body stays honest TypeScript you can read, type-check, and reason about with no Declare-specific decoder ring.

---

## 4. Members

Everything inside a `[ ]` is a member, and each member is one of a few shapes. By convention attributes come first (a readable "header"), but ordering is stylistic; members are comma-separated (see [§12](#12-formatting-and-naming)).

**Set an attribute** — `name = value`. Sets an attribute that already exists (inherited or built in):

```
width = 100%,           // a literal
color = #FFFFFF,        // a literal
x     = { parent.x },   // a constraint (live)
text  = :title,         // a datapath read (§9)
```

**Declare an attribute** — `name: Type = default` (the `= default` is optional). Introduces a *new*, typed, reactive attribute on this component — like a field:

```
label:    string  = "",
selected: boolean = false,
count:    number,             // no default; starts undefined until set
```

The difference matters: `name = value` *sets*; `name: Type = value` *declares*. Types are ordinary TypeScript types plus the built-in value vocabulary of [§6](#6-the-value-model).

> **From OpenLaszlo.** `<attribute name="count" type="number" value="0"/>` becomes `count: number = 0`. Same idea, no tags.

**A method is a named field of function type** — `name: (params) -> Ret { body }`. The type is `(params) -> Ret`; the `{ body }` is its value. Parameters are **name-first** (`h: int`), and their names are in scope in the body. Omit `-> Ret` for a void method. The `: ` may be dropped so the parentheses attach to the name:

```
open: (h: int, d: string) -> View {        // canonical: a field of function type
    super.open(h, d);
    return this;
    },

focus: () {                                // void: no -> Ret
    classroot.select();
    },

select() { classroot.parent.select(this) },   // shorthand: elide the `: `
```

A method is a member like any other — symmetric with `name: Type = value`, just with a function type and a block for its value.

**A child instance** — `Type [ … ]`, or `name: Type [ … ]` to name it so other members can reach it. A leaf (attributes only) goes on one line; with none, a bare `Type` will do:

```
Text [ text = "OK" ],                      // anonymous child
bg: View [ resource = tabtop ],            // named `bg`, reachable as `bg` / `this.bg`
View,                                      // a bare child, no attributes
```

---

## 5. Components are classes

A component *is* a class. You instantiate one by naming its type with a `[ ]` body; you define one with `class Name extends Base [ … ]`:

```
class CalButton extends Button [
    label:    string  = "",
    selected: boolean = false,

    onClick() { selected = !selected },

    cap: Text [
        text  = { label },                          // reads the enclosing class's `label`
        color = { selected ? #FFFFFF : #AAAAAA },
        x     = { (parent.width - cap.width) / 2 },
        y     = 4,
        ],
    ]
```

> **From OpenLaszlo.** `<class name="calButton" extends="basebutton"> … </class>` becomes `class CalButton extends Button [ … ]`. Defining classes was everyday in OpenLaszlo, and is meant to be here.

**A runnable app is the `App` singleton** — one per program, and its instance is the entire visible tree. There is no forced single root in the *source* (plain TypeScript models and helpers live in `script { }` blocks); the single root exists in the running *visual* tree.

**An instance can declare its own members — `App` is just the most familiar case.** You don't need a named class to give a one-off its own state or behavior: any instance can carry `name: Type = value` declarations, methods, handlers, and states inline, exactly as a class body does, and the compiler synthesizes a one-off anonymous subclass to hold them. So a one-off gets encapsulation and inheritance with no scaffolding — `App` itself is exactly this (it declares `count`, `zip`, … with no `class App`):

```
clock: View [
    now: string = "",                          // its own attribute
    tick() <- Clock { now = currentTime() },   // its own subscription
    Text [ text = { now } ],
    ],
```

The instance is a *subtype* of its base — `View` plus the members you added — so it fits anywhere a `View` is expected, and its extra members are reachable through its own reference. Promote it to a named `class` only when you instantiate it more than once — or when you need to *name* its type (to declare a parameter of it, or to `extend` it), which the anonymous form can't provide. That last point is the clean boundary: the moment the type needs a name, you've outgrown the one-off.

**Composition is the hierarchy** (goal #2). Most of what you write is composition, not class authoring: take built-in components, nest and configure them, bind them to data. The bracket nesting is the tree, read at a glance: a view's children nest inside it, so the brackets mirror the visual shape. *How* those children are arranged is a reactive **`Layout`** attribute you set on the view — `layout: SimpleLayout [ axis = y, spacing = 10 ]`. Every view has one (defaulting to *none* — absolute positioning by `x`/`y`); the strategies are `Layout` subclasses (`SimpleLayout`, `ResizeLayout`, `GridLayout`, … and ones you write); and because it's an ordinary reactive attribute you can swap it, constrain it, or animate it — so arrangements transition *continuously* rather than jump (goal #5). Note this is a layout *attribute*, not a layout *child* (OpenLaszlo's form) and not the container's *type* (Flutter/SwiftUI's) — keeping the view generic and the arrangement swappable. The components you compose are themselves written in Declare over a small runtime core; there are no black-box native widgets.

**Where does a piece of code live?** A short guide that the rest of the language keeps reinforcing:

- structure that **repeats** → a **class**;
- a single **computed attribute** → bind it inline with a small **function**, *not* a wrapper class;
- behavior that operates on a component's own state (`this`) → a **method**;
- **stateless** logic, especially if shared across unrelated parts of the tree → a free **function** in a `script { }` block.

(So `Image [ source = { weatherIcon(:code) } ]` with a `weatherIcon(code)` helper, not a `class WeatherIcon extends Image`. The class would bundle a function in a class's clothing.)

---

## 6. The value model

Some attributes accept more than one literal form — a dimension is `50` *or* `50%`; a color is `navy` *or* `#354D5B` *or* `0x354D5B` *or* `null`. **As a user, you just write them; they work.** That's the whole story at the use site:

```
View [
    width   = 100%,                 // a Length — percent
    height  = 60,                   // a Length — pixels
    backgroundColor = navy,         // a Color — named
    opacity = 0.5,
    ]
```

Underneath, these polymorphic types are a **closed, compiler-owned vocabulary** — `Color`, `Length`, `Align`, and a few more — exactly as CSS owns `<length-percentage>` and `<color>`. The coercion that turns `navy` into an integer, or `50%` into a parent-relative measurement, is imperative, so it lives in the compiler/kernel and never appears in your code.

**Going deeper** (skip on a first read): what the language lets *you* declare are value types that carry **structure, not behavior** —

| form | example | allowed? |
|---|---|---|
| **named union** | `value Mode = day \| week \| month` | yes — pure structure |
| **valued enum / table** | `value NamedColor [ red = 0xFF0000, navy = 0x000080 ]` | yes — a token→constant table |
| **converting constructor** | `value Color [ from (h: hex) { … } ]` | **no** — a coercion *function* is behavior |

The rule: *behavioral value types are intrinsic; structural value types (unions and tables) are user-declarable; no value type exposes coercion logic to the language.* The payoff is **self-hosting** — a core class only needs to *use* `Color`/`Length`, not define them, so the core itself can be written in Declare, declarative headers over `{ }` TypeScript bodies:

```
value Stretch = none | width | height | both     // a named union

class View extends Node [
    x:      Length = 0,                  // Length: a bare number (px) or a percent
    y:      Length = 0,
    width:  Length = 0,
    height: Length = 0,

    backgroundColor: Color   = null,     // Color: navy / #354D5B / 0x354D5B / null
    opacity:         number  = 1,
    visible:         boolean = true,
    stretches:       Stretch = none,

    containsPoint: (px: number, py: number) -> boolean {     // behavior is a TS body
        return px >= this.x && px < this.x + this.width
            && py >= this.y && py < this.y + this.height;
        },
    ]
```

One intrinsic value type, **`Schema`**, carries its literal in brackets rather than as a bare token — it describes the shape of a data source's payload. It's covered with the data system in [§9](#9-data-datapaths-replication-and-sources).

---

## 7. Reactivity: constraints

This is the heart. A `{ }` in a value slot is a **constraint** — a live expression the runtime keeps true by re-evaluating it when, and *only* when, its inputs change. Dependencies are tracked for you: reading `parent.width` or `count` inside the braces makes the constraint depend on it. Nothing is declared by hand, and there is no re-render and no dependency array.

```
x     = { (parent.width - width) / 2 },                            // re-centers on resize
color = { selected ? #FFFFFF : #AAAAAA },                          // recolors on select
text  = { weatherData.failed ? weatherData.error : "Loading…" },   // reacts to a data resource
```

A constraint may freely mix attributes, other constraints, datapaths, and data-source state — they are all nodes in one dependency graph.

**Writing is symmetric.** Inside a `{ }` body, assigning to a reactive attribute *is the setter* — it fires the cascade. There is no separate "notify" call and no raw write that skips it:

```
onClick() { count = count + 1 },   // not a local write — everything bound to `count` updates
```

> **From OpenLaszlo — why `=` is safe here.** OpenLaszlo needed an explicit `setAttribute('count', v)` to notify; a bare `count = v` silently bypassed the reactive system (its own docs labeled such a button *"evil"*). Declare is statically typed and compiled, so the compiler knows `count` is reactive and makes `=` itself the setter. One way to write, always correct — there is no `setAttribute`, and no bypass to forget. (Reads are symmetric: a bare `.x` is the tracked read; there is no `getAttribute` either.)

**Binding timing.** `{ }` is *always* — reactive, the common case. Two narrower modes exist for the cases that need them: **`once`** (evaluate a single time, then detach) and **`immediate`** (evaluate during construction). Their exact surface is still being settled ([§13](#13-what-is-not-settled)); `{ }`-always covers the overwhelming majority.

### Cost, and seeing it

A fair question for any reactive language: a plain-looking `count = count + 1` can fan out to many dependent recomputes, and that cost is not visible in the source. Worth understanding (it is a real consideration, though not a blocker):

- **The cost is confined to declared reactive attributes.** Locals, loop counters, plain TypeScript objects in `script { }` — none are reactive, so ordinary assignments carry zero reactive overhead. Only `node.attr = v` on a *declared* attribute goes through a setter, and the compiler knows statically which those are.
- **Reads are mostly free.** Because the compiler can see a constraint's dependencies, it wires them at build time; the read inside the constraint is then a plain field read. Runtime dependency-tracking survives only for genuinely dynamic dependencies (e.g. `items[i].x` where `i` is itself reactive).
- **Writes batch.** Many writes within one turn coalesce — the value updates immediately, but dependents recompute once at the flush, not once per write. A tight loop writing a reactive attribute is *N* cheap sets and **one** cascade, not *N* cascades.
- **It is toolable, because it's static.** What a write notifies, and what a constraint depends on, are computable at compile time — so the editor can mark reactive access and lint a high-fan-out write in a loop, and a reactive inspector can show the live cascade at runtime. The honest residual: you cannot always read performance off the source the way you can in plain TypeScript; that is the trade for the ergonomics, and the inspector is the intended remedy.

The discipline that falls out: reactive attributes for UI state where you want the propagation; plain values for hot inner computation.

---

## 8. Events and subscriptions

**Handlers** are methods named with an `on` prefix — `onClick`, `onFocus`, `onInit`, `onMouseUp`, `onData`, `onTimeout`. The prefix marks them as responses to *this node's own* events (and keeps them out of the plain-method namespace, so a handler never collides with a same-named attribute):

```
onClick()   { classroot.select() },
onInit()    { Focus.setFocus(this) },
onMouseUp() { weatherData.clear() },
```

A method *without* `on` is just a method — `open`, `select`, `loadWeather`.

**Subscriptions** reach an *external* event source with `<-`. The form is `member(params) <- Source { body }` — the arrow is the marker; by convention the member still wears the `on` prefix — and the binding is **lifetime-managed**: automatically unsubscribed when the node is torn down, so there is no cleanup to forget:

```
onKeyUp(e) <- Keys {
    if (e.key == "ArrowDown") Focus.next();
    else if (e.key == "ArrowUp") Focus.prev();
    },
```

This replaces the `addEventListener`/`removeEventListener` (and React's `useEffect`-with-cleanup) dance with one declarative member whose lifetime is the node's. The source is always concrete — `<- Keys` — and a source is subscribable because it **declares the members it calls** (Keys calls `onKeyDown`/`onKeyUp`, each with the normalized `KeyEvent`); the member's name matches the source's member *literally* — no mapping — and the compiler checks both the source and the member, so subscribing to something that isn't a source, or to a member it doesn't call, is a positioned compile error naming the alternatives, not a silent no-op.

> **From OpenLaszlo.** A node's own event was `<handler name="onclick"> … </handler>` → `onClick() { … }`. Subscribing to *another* object's event was `<handler name="onsecond" reference="secondtimer"> … </handler>` → `onsecond() <- secondtimer { … }`. Declaring an event was `<event name="myevent"/>` → `event myevent(n: int)` (now with a typed payload). The dividing line is the same: your own event is an `on`-handler; someone else's is `<-`.

*(Don't confuse `<-` (event subscription) with `<->` (two-way data binding, [§9](#9-data-datapaths-replication-and-sources)).)*

> **Status + ruling (2026-07-13).** Ruled: **an event is just a function-typed member that gets called when the thing happens — the `on` prefix is a naming convention, not syntax.** No mapping, no dual identity between a "bare event name" and a handler name: `onClick` is a member named `onClick`, and the input router calls it. Consequences: there is **no `event` keyword** — declaring an event is declaring the member and documenting that the class calls it; typo protection is ordinary member checking. A child delivers upward by calling a method on its owner (the events guide's ruling; the component library's `input(v)` contract). The **`<-` subscription form is implemented** (same day) for the runtime *services* — `Keys` first, its subscribable members tabled in `schema.ts` (`SUBSCRIPTION_SOURCES`) and wired in `sources.ts`, torn down via the node teardown registry. Subscribing to another *view's* events (hearing a sibling's `onClick` — genuine multi-listener fan-out over view events) waits until view-event dispatch routes through a fan-out point; nothing needs it yet.

---

## 9. Data: datapaths, replication, and sources

Nearly every app binds views to data. The model: a **cursor** (set by `datapath`) selects a place in the data, and descendants read fields *relative* to it; **replication** falls out when a path matches many records.

**`:path` reads from the inherited cursor.** A leading `:` marks a datapath — its own value mode, neither literal nor TypeScript. `datapath = …` sets the cursor; descendants read relative to it:

```
Screen [ datapath = { weatherData.value.rss.channel },         // set the cursor here
    where: Text [ text = { :location.city + ", " + :location.region } ],
    temp:  Text [ text = :item.condition.temp ],
    ],
```

**`:arr[]` replicates.** A node whose path matches many records produces one instance *per record* — replication is the *artifact* of the match resolving to many, not an imperative loop. The replicated subtree re-roots the cursor onto each element:

```
WeatherSummary [ datapath = :item.forecast[] ],   // one WeatherSummary per forecast element
```

`WeatherSummary` is written once, against an abstract cursor (`:day`, `:high`, `:low`), and reused for every element.

**One-way by default; two-way is opt-in.** Reads flow data → view. The same path used with `<->` becomes a writable two-way binding (the leaf-input exception, e.g. a text field editing a piece of state):

```
zipcode: EditText [ value <-> zip ],     // edits flow back into the `zip` attribute
```

**Two kinds of data source.** A **`Dataset`** holds embedded data — its body is *strict* JSON (here `{ }` carries its JSON meaning, an embedded-language region; keys quoted, no trailing commas — this is data, not a TypeScript expression):

```
events: Dataset {
    [ { "time": "9:00", "title": "Standup" }, { "time": "14:00", "title": "Design review" } ]
},
```

A **`DataSource`** is a reactive *remote* resource — the declarative replacement for a dataset plus a data-pointer plus a hand-written fetch. It exposes its lifecycle as reactive state, so screens derive from it with ordinary constraints instead of an imperative show/hide:

```
weatherData: DataSource [ url = { `/data/weather/${zip}.json` }, schema = [ … ] ],

Screen [ shown = { !weatherData.loaded }, … ],     // entry screen — derived
Screen [ shown = {  weatherData.loaded }, … ],     // report screen — derived
```

- **state:** `.idle` · `.loading` · `.loaded` · `.failed`
- **data:** `.value` (the validated response) · `.error`
- **methods:** `.fetch()` · `.clear()`

Because the resource's *state* drives the UI, even navigation can be a function of data: `onMouseUp() { weatherData.clear() }` returns to the entry screen by resetting the resource and letting both screens re-derive.

> **From OpenLaszlo.** `<dataset>` → `Dataset { … }`; `<view datapath="events:/event">` → `datapath = …`; `$path{'@time'}` → `:time`; replication-by-matching is unchanged. `DataSource` is new — OpenLaszlo's datasets were untyped and fetched imperatively.

**Schema — typing and validation, optional and schema-gated.** A `Dataset` or `DataSource` may carry a **`schema`** — a value of the intrinsic type `Schema` describing the shape of the data it returns. The literal is a `[ … ]` tree of `field: Type` declarations (an array field is marked on the name: `forecast[]: [ … ]`, echoing the `:forecast[]` read):

```
schema = [
    rss: [ channel: [
        location: [ city: string, region: string ],
        item: [
            condition:  [ code: int, temp: int, text: string ],
            forecast[]: [ day: string, high: int, low: int ],
            ],
        ] ],
    ],
```

It is **brackets, not braces**, on purpose: a shape is structural *declarations*, not a runtime expression (every `{ }` in the language *runs*; a shape doesn't). When a schema is present, the compiler does two things with it: it **validates the response on receipt** at the boundary (so the UI only ever reads conforming data — malformed data yields `.failed`/`.error`, not `undefined` three layers into a binding), and it **statically checks every `:path`** against the shape (`:item.condition.tempp` is a compile error, with *no* change to the `:path` syntax). With **no** schema, `:path` is fully legal and dynamic — it resolves at runtime, an unresolved path yields null, and the bound attribute falls back to its default. Schema presence is the only switch; the surface syntax never changes.

The path surface ("XPath for JSON") lands on **JSONPath** for reads, paired with **JSON Pointer** for the writable side. Server-side sync (CRDTs, sync engines) is a separate optional layer, out of scope here.

---

## 10. States

A **`state`** is a named, reversible bundle of attribute overrides, active while a condition holds — the declarative replacement for imperative mode-toggling and hand-wired enter/exit animation:

```
state focused when { this.focused } [
    top.bg.opacity     = 0.33,         // overrides may target named descendants by dotted path
    top.titlebox.color = white,
    ],
```

- **Reversible.** While the predicate holds, the overrides apply, layered over the base; when it lifts, they revert. The base a state reverts to may itself be a live constraint.
- **One declarative owner per slot.** An attribute's value is a pure function of (base + the active states targeting it). There is no imperative write to clobber it, so the "set it on enter, forget to unset it on exit" bug is unrepresentable.
- **Reaches descendants.** Overrides may target named descendants by dotted path (`top.bg.opacity`), so one mode can coordinate several views at once.

**Declarative or procedural.** The `when { cond }` clause is *optional*. With it, the predicate owns the state (the common case). Without it, the state is a reified object you drive from code — `expanded.apply()`, `expanded.remove()` — for sequencing, conditional logic, or a dynamically chosen target. One authority per state: predicate-owned *or* code-owned. This is deliberate: pure-declarative application of states (and of animation) is not always adequate, and the procedural path is there when you need it.

States declare *where* a mode goes, not *how* it gets there: the runtime, or the procedural animation API (`animate(…)`), owns the transition. A state's overrides are end-states.

> **From OpenLaszlo.** `<state>` is the direct ancestor; the modern part is the reactive `when { … }` predicate (OpenLaszlo applied states via `applied=` or `apply()`/`remove()`). An OpenLaszlo `<animatorgroup>` + `.doStart()` becomes a state's end-states plus the runtime's transition.

*(What happens when two active states override the same slot — precedence, mutual exclusion — is not yet locked; see [§13](#13-what-is-not-settled).)*

---

## 11. Scope: `this`, `parent`, `app` — and `classroot` for components

Three references reach a node from a `{ }` body, because the node a piece of code is *attached to* is not always what it needs to reach — its parent, or the running App:

- **`this`** — the node the code is on.
- **`parent`** — that node's parent in the view tree.
- **`app`** — the running App, reachable from **any** depth, wherever the code is written: `app.scrollY`, `app.navigate("/docs")`, `app.width`. It reads as a noun (under the hood it is `this.root`); use it for app-level state and page-wide actions from a component or from the App itself. (Because a filling app's `width` *is* its host, responsive layout usually reads `app.width` rather than the host directly — see [sizing.md](sizing.md).)

Inside a `{ }` body a child reads the enclosing class's attributes by **bare name** (`label`, `count`) — until a nearer name shadows it, at which point the qualified `classroot.label` disambiguates (below). The bare capital **`App`** is the *class*, not the instance — `App.foo` resolves only in a use-site binding and errors inside a class body; write **`app.foo`** for the running instance. The scope nouns are reserved: none may be an attribute, child, or parameter name.

### `classroot` — the component-authoring reference

When you define a component (a class), `classroot` is that class's own instance, reachable from any depth within its body — so a handler or binding on a nested child can act on the component it belongs to:

```
class WeatherTab extends BaseTabElement [
    top: View [
        onClick() { classroot.select() },     // `this` is `top`; `classroot` is the WeatherTab
        ],
    ]
```

`classroot.foo` reads the component's own `foo`; an App value like `classroot.scrollY` is a member error inside a component (a `View` has no `scrollY`) — reach app-level state through `app`. At a use site *within* the class (`c: C2 [ x = { classroot.foo } ]`) `classroot` is still the enclosing class, skipping anonymous views up to the nearest real class.

`classroot` is meaningful **only inside a class body**. Every other `{ }` context rejects it with a compile error (`DECLARE4003`, name phase): the App block, a `stylesheet` body, and a style-`bundle` body all have no component to root. (Ruled 2026-07: `classroot` is component-only. Previously the App case was accepted-but-redundant; a bare App-name resolves to `this.root` in output, so `classroot` never appears in App-body code, and the compiler now rejects an explicit one.)

---

## 12. Formatting and naming

These are conventions (style, not syntax). The canonical spec is [formatting.md](formatting.md) (style canon + prettyprinter contract); in brief:

- **Every own-line member ends with a comma — the comma is a *terminator*, not a separator** (Go's composite-literal rule): including the last member before a hanging close, so adding, removing, or reordering members never touches a neighboring line. The one place it is omitted: before an *inline* `]` (`Text [ x = 42, text = :day ]`), where it buys nothing. Ruled 2026-07-13; the formatter enforces both directions.
- **A leaf goes on one line** (attributes only): `day: Text [ x = 42, color = #FFFFFF, text = :day ],`. Aim for this; most of a UI is leaves.
- **A parent puts its configuration on the header line and its body below.** Plain `name = value` configuration rides the opening line (filled until it would overflow a comfortable width, then wrapped); declarations, methods, states, handlers, and child instances each get their own line.
- **Closing brackets hang at the content indent**, carrying the trailing comma: `],` / `}`.
- **Comments** are `// ` (one space), indented to the level they sit at, and preceded and followed by a blank line (unless first in a block). Trailing inline comments are exempt.
- **Names are camelCase** — `backgroundColor`, `fontSize`, `onClick`, `minHeight` — TypeScript/React-familiar. (OpenLaszlo's legacy lowercase names belong to the migration layer, not the surface.)

---

## 13. What is not settled

Honest about what isn't locked. The first group are LZX constructs the corpus *uses* that Declare has not yet designed a surface for — found by diffing the full LZX language surface (the 4.9 reference docs, the compiler's element-compilers, and ~2,000 corpus programs) against this spec. The second are refinements to constructs already settled above; the last is a tooling commitment.

### Language constructs still to design

Roughly in priority order — corpus weight, plus how much each blocks authoring the component library *in* Declare:

- **Constraint timing — *proposed*: `once { … }`.** Plain `{ … }` is live; the corpus's most-used constraint form is actually the *opt-out* of liveness (`$once{}`, 3,535 uses) — bind once at init, snapshot the value, drop the dependency. Proposed surface: a `once` modifier prefixing any live binding (`once { expr }`, `once :path`, `<- once Source`), defined as sugar for "evaluate a single time at init, then leave it." Open sub-point: the exact firing instant, and whether LZX's rare construct-time form (`$immediately`, 66) needs its own spelling. *(Under review — to land in [§7](#7-reactivity-constraints) once the surface is agreed.)*
- **Module / file model.** OL's `<include>` / `<library>` / `<import>` were the backbone (6,659 / 2,926 files). How classes span files, how a component library is imported and distributed, and the unit of compile/cache are all open — likely ES-module `import`, plus a position on the library-as-distributable-unit.
- **Slots / placement.** OL's `placement=` (612) routed a child into one of several named regions of a composite component (a window's *header* vs. *content*). Absent, and it blocks authoring multi-region components; needs a named-slot model.
- **Imperative data mutation.** OL's `<datapointer>` (328) plus add / remove / reorder of records. `<->` writes a *field*; nothing structurally mutates a dataset. Likely a mutation API on `Dataset`/`DataSource` whose edits drive replication.
- **Animation choreography.** OL's `<animator>` / `<animatorgroup>` (1,434 / 235; sequential *and* simultaneous). States give per-slot end-states with a runtime tween, but there is no *timeline* (A, then B, then A+C). Where the procedural animation API — and possibly a declarative sequence form — belong.
- **Mixins / multiple inheritance.** OL's `with=` / `<mixin>` (low usage, but the component library uses them). TypeScript has no real multiple inheritance; decide between first-class mixins and interface-plus-composition — needed to self-host the library.
- **Lazy / deferred instantiation.** OL's `initstage` (220, mostly `late`/`defer`) — don't build a subtree until it is shown. A *performance* construct (ties to goal #4 and list virtualization); no story yet.
- **RPC / remote calls.** OL's `<rpc>` / `remotecall` (350 / 404). `DataSource` covers fetch-a-*resource*; calling a remote *method* and binding to that call's in-flight state does not. Likely collapses to "`await` a TypeScript function" plus a call-state helper — but it should be stated.
- **Static / class-level members.** OL's `allocation="class"` (110). Probably TypeScript `static`, but a class-level *reactive* attribute shared across instances needs a stated position.
- **Resources & fonts.** `<resource>` (4,612, often multi-`<frame>` sprite stylesheets) and `<font>`/`<face>`. Declarative asset registration, sprite frames, and font embedding need a home (some is asset-pipeline → [declare-implementation.md](declare-implementation.md)).
- **Focus model.** `focusable` / `focustrap` / `onfocus` (384 / 21 / 9). Only an imperative `Focus.setFocus()` today; first-class focusability and tab-order tie into the accessibility story.
- **Mostly obviated by the abstracted, runtime-independent substrate** — conditional compilation (`<switch runtime=>`) → a build-flag convention (the app never branches on the runtime; the kernel is hidden); `<interface>` → TypeScript `interface`; `passthrough` / event bubbling → an event-propagation policy to confirm.

### Refinements to constructs already settled

- **State collision lattice.** Precedence when two active states override the same slot; mutual exclusion / exhaustiveness for "exactly one of {idle, loading, …}" (a discriminated state group keyed on a status enum is the likely answer); and how a state override suspends and restores a base *constraint*. The base construct ([§10](#10-states)) is locked; the collision rules are deferred.
- **Heterogeneous replication.** `:arr[]` replicates *one* class. The feed/CMS/chat pattern — a different component per element by discriminant — has no first-class form yet, and the obvious workaround (generating subtrees in `{ }`) would break the statically-apparent tree the design rests on. The open question with the deepest reach.
- **The schema array-field spelling** (`forecast[]: [ … ]` vs a TypeScript-ish `forecast: [ … ][]`), and whether the inline record type `[ field: Type ]` is exposed generally or only in `Schema` position.
- **The exact closed value-type set** beyond `Color`/`Length`/`Align`, and whether behavior-free enums keep a native `value` keyword or fold into a TypeScript union with bare-token sugar.
- **The `<-` event-source metavariable.** In docs the source is written generically (`<- Source`); in real code it's always concrete (`<- Keys`). Whether to keep the generic placeholder or always show it concretely is unsettled.
- **Custom setters.** OpenLaszlo's `<setter>` was common; it maps to a TypeScript-style `set x(v) { … }` accessor as a first-class member, but the surface is not pinned.

### Tooling

- **Reactive-cost inspectability** ([§7](#cost-and-seeing-it)) — not a language gap, but a tooling commitment: the reactive inspector and the editor's reactive-access marking are what keep performance legible, and they need to exist.

---

## Appendix A — A complete application, annotated

This is `weather.declare`: a small but complete tabbed weather app, written in the declarative idiom. It is the best single illustration of the language working as intended. Read it as a tour of everything above:

- **One source of truth.** A single `DataSource` (`weatherData`) holds the request's lifecycle. The two full-screen layers — entry and report — don't toggle each other; each *derives* its visibility from the resource (`shown = { weatherData.loaded }` / `{ !weatherData.loaded }`). There is no show/hide state machine to keep consistent.
- **States carry the modes.** The tab's focused look, the top bar's reveal, and the zip panel sliding off while loading are all `state … when { … }` blocks — reversible, predicate-driven, no manual enter/exit code.
- **Data drives the tree.** The report screen sets a `datapath` cursor into the response; its descendants read `:path` fields; the forecast tab *replicates* `WeatherSummary` over `:item.forecast[]`.
- **Layout is an attribute, not a child.** Each container's arrangement is a `layout: SimpleLayout [ … ]` member (or `ResizeLayout`, …) — a reactive slot you could swap, constrain, or animate, not a fixed container type.
- **The small pieces.** The zip field two-way-binds with `value <-> zip`; global up/down keys are a lifetime-managed `keyup(k) <- Keys` subscription; the weather-icon URL is a stateless `script { }` function bound inline (not a wrapper class); the schema declares the response shape so paths are typed and the response validated.

(An earlier companion file ported the app line-for-line from the original imperative OpenLaszlo for before/after comparison; it was retired — `weather.declare` below is where the language wants you to land, and the original `apps/weather/weather.lzx` remains the true before.)

```
// weather.declare — weather.lzx modernized: new syntax & constructs


script {
    function weatherIcon(code: int): string { return `http://l.yimg.com/i/us/we/52/${code}.gif` }
    }


class WeatherTab extends BaseTabElement [ clickable = false, minHeight = 25,

    label: string = "default title",

    layout: ResizeLayout [ axis = y ],

    top: View [ width = 100%, fontFamily = "Tahoma,Geneva,sans-serif", fontWeight = bold,
        onClick() { classroot.select() },
        bg:       View [ resource = tabtop, width = { parent.width }, stretches = width ],
        titlebox: Text [ text = { classroot.label }, color = #CAD0EC, width = 240, x = 15, y = 4 ],
        ],

    container: View [ width = { parent.width }, visible = { classroot.contentvisible },
        options = releasetolayout, y = 25, clip = true,
        details: View [ width = { parent.width } ],
        ],

    // the focused look — a reversible state, replacing the onFocus/onBlur + animate() handlers

    state focused when { this.focused } [
        top.bg.opacity     = 0.33,
        top.titlebox.color = white,
        ],

    ]


class WeatherSummary extends View [ fontSize = 12, fontFamily = "Helvetica", backgroundColor = #000000, width = 34, height = 34, x = 10,

    Image [ name = icon, width = 32, height = 32, stretches = both, x = 1, y = 1, source = { weatherIcon(:code) } ],
    day:    Text [ x = 42, color = #FFFFFF, width = 140, fontWeight = bold, text = :day ],
    desc:   Text [ x = 42, y = 14, color = #FFFFFF, width = 120, multiline = true, fontSize = 11, text = :text ],
    temphi: Text [ x = 188, color = #FFFFFF, fontWeight = bold, text = { "Hi " + :high } ],
    templo: Text [ x = 188, y = 14, color = #FFFFFF, fontWeight = bold, text = { "Lo " + :low } ],

    ]


// a full-bleed layer that cross-fades on `shown`

class Screen extends View [ shown: boolean = false,
    width = 100%, height = 100%,
    opacity = { shown ? 1 : 0 },
    visible = { opacity > 0 },
    ]


App [ width = 240, height = 320, backgroundColor = #EAEAEA, title = "Laszlo Weather",

    focusclass = null,

    zip: string = "94403",

    // the data resource — the single source of truth: .idle .loading .loaded .failed .value .error.
    // `schema` is the data's shape (a `Schema` value), read by the compiler to validate + type :paths.
    // It's `[ ]` (structural declarations), never `{ }` (which is always runtime TS); `forecast[]:`
    // marks an array, echoing the `:forecast[]` read.

    weatherData: DataSource [ url = { `/data/weather/${zip}.json` },
        schema = [
            rss: [
                channel: [
                    location:   [ city: string, region: string ],
                    atmosphere: [ humidity: int, pressure: number ],
                    wind:       [ speed: int, chill: int ],
                    astronomy:  [ sunrise: string, sunset: string ],
                    item: [
                        condition:  [ code: int, temp: int, text: string, date: string ],
                        forecast[]: [ day: string, code: int, text: string, high: int, low: int ],
                        ],
                    ],
                ],
            ],
        ],

    View [ resource = weather_bg ],

    // ── entry screen — shown until data loads; carries loading + error inline ──

    Screen [ shown = { !weatherData.loaded }, resource = weather_splash,

        Text [ color = #000099, x = 15, y = 230, width = 240, fontWeight = bold,
            text = { weatherData.failed ? weatherData.error : weatherData.loading ? "Loading weather data..." : "" } ],

        zipBtn: View [ x = 0, y = 245,
            bkgnd: View [ resource = zipButtonArt ],
            Text [ text = "Enter Zip Code:", color = #FFFFFF, x = 15, y = 7, fontWeight = bold ],
            zipcode: EditText [ value <-> zip, doesEnter = true, width = 80, x = 120, y = 5, height = 20, fontWeight = bold,
                onInit()      { Focus.setFocus(this) },
                doEnterDown() { weatherData.fetch() },
                ],
            Text [ text = "OK", color = #FFFFFF, x = 205, y = 7, fontWeight = bold, onClick() { weatherData.fetch() } ],

            // off-screen while loading — a state, not an imperative animate()

            state busy when { weatherData.loading } [
                x = -2000,
                ],
            ],
        ],

    // ── report screen — shown once data loads ──

    Screen [ shown = { weatherData.loaded }, datapath = { weatherData.value.rss.channel },

        topBar: View [ resource = weather_topBar, opacity = 0, y = -16, focusable = true,
            onMouseUp() { weatherData.clear() },             // back to entry — declaratively
            zip: Text [ text = { App.zip }, fontWeight = bold, color = #CAD0EC, width = 100, x = 194 ],

            // the topBar reveal is a state — replacing the comein/goout AnimatorGroups + .doStart()

            state shown when { weatherData.loaded } [
                opacity = 1,
                y       = 0,
                ],
            ],

        weatherContent: BaseTabSlider [ y = 15, height = 305, width = 100%, slideDuration = 300,

            tab1: WeatherTab [ label = "Current Conditions", fontFamily = "Tahoma,Geneva,sans-serif",
                currentData: View [ width = 240, y = 10,
                    layout: SimpleLayout [ axis = y, spacing = 10 ],
                    where: Text [ width = 240, x = 15, color = #FFFFFF, fontWeight = bold,
                        text = { :location.city + ", " + :location.region } ],
                    form: View [ width = 240,
                        icon: Image [ x = 26, y = 28, width = 64, height = 64, source = { weatherIcon(:item.condition.code) } ],
                        temp: Text [ x = 95, y = 20, width = 240, fontSize = 60, color = #FFFFFF, fontWeight = bold, text = :item.condition.temp ],
                        desc: Text [ width = 240, x = 15, y = 90, color = #FFFFFF, fontWeight = bold, text = :item.condition.text ],
                        ],
                    moredata: View [ x = 15,
                        layout: SimpleLayout [ axis = x, spacing = -10 ],
                        labels: View [
                            layout: SimpleLayout [ axis = y, spacing = 1 ],
                            Text [ text = "Humidity:",   color = #FFFFFF, fontWeight = bold ],
                            Text [ text = "Wind Chill:", color = #FFFFFF, fontWeight = bold ],
                            Text [ text = "Sunrise:",    color = #FFFFFF, fontWeight = bold ],
                            ],
                        fields: View [
                            layout: SimpleLayout [ axis = y, spacing = 1 ],
                            Text [ width = 160, color = #FFFFFF, text = :atmosphere.humidity ],
                            Text [ width = 160, color = #FFFFFF, text = :wind.chill ],
                            Text [ width = 160, color = #FFFFFF, text = :astronomy.sunrise ],
                            ],
                        ],
                    ],
                ],

            tab2: WeatherTab [ label = "Radar Maps",
                Image [ x = 20, y = 20, source = "resources/radar_us.png", width = 200, height = 135, stretches = both ],
                ],

            tab3: WeatherTab [ label = "Forecast",
                forecastData: View [ y = 10,
                    layout: SimpleLayout [ axis = y, spacing = 10 ],
                    WeatherSummary [ datapath = :item.forecast[] ],
                    ],
                ],
            ],
        ],

    navmanager: Node [
        onKeyUp(e) <- Keys {
            if (e.key == "ArrowDown") Focus.next();
            else if (e.key == "ArrowUp") Focus.prev();
            },
        ],
    ]
```

---

## Appendix B — The OpenLaszlo correspondence

For readers who know OpenLaszlo, or who want the lineage at a glance. Declare keeps OpenLaszlo's *model* and replaces its *surface* (XML + a bespoke script compiler) with brackets + TypeScript.

| OpenLaszlo (LZX) | Declare |
|---|---|
| `<canvas> … </canvas>` | the `App` singleton: `App [ … ]` |
| `<class name="X" extends="Y"> … </class>` | `class X extends Y [ … ]` |
| `<attribute name="n" type="t" value="v"/>` | `n: t = v` |
| `<method name="m" args="a"> … </method>` | `m: (a: T) -> R { … }` |
| `<handler name="onclick"> … </handler>` | `onClick() { … }` |
| `<handler name="onX" reference="src"> … </handler>` | `onX() <- src { … }` |
| `<event name="e"/>` | a function-typed member the source calls (`onE(payload)`) — no keyword; the `on` is convention |
| `attr="${expr}"` (constraint) | `attr = { expr }` |
| `obj.setAttribute('x', v)` — and the raw-`=` bypass | `obj.x = v` (the setter; **no** bypass) |
| `obj.getAttribute('x')` | `obj.x` |
| `<dataset> … </dataset>` | `name: Dataset { …json… }` |
| `<view datapath="ds:/path">` | `datapath = …` on the element |
| `$path{'@attr'}` | `:attr` |
| replication (a datapath matching many records) | `:arr[]` |
| `<state> … </state>` (`applied=` / `apply()`) | `state … when { … } [ … ]` |
| `<animatorgroup>` + `.doStart()` | a state's end-states + `animate(…)` |
| `<simplelayout axis="y"/>` | `layout: SimpleLayout [ axis = y ]` (an attribute — layout is never a child) |

Two things have *no* OpenLaszlo predecessor, because they depend on a static type system and a modern runtime: **`DataSource`** (a reactive remote resource with typed, validated data) and the fact that **`=` is the setter** (OpenLaszlo's dynamic script and older runtimes forced the explicit `setAttribute`; static typing plus a compiler let Declare fold the notify into the assignment).
