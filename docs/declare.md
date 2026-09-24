# Declare — the language, in one file, for you and your LLM

*Declare is a language for building application interfaces. Writing it takes three things, and
this file is the first:*

1. ***this file*** *— the **language**: every form the grammar accepts and every rule the compiler
   enforces;*
2. ***the map*** *— where the rest lives: components and their attributes, real programs, the guide;*
3. ***the compiler*** *— every error carries a code, a position, and the rewrite that resolves it
   (§12), so nothing here needs to enumerate edge cases.*

*Declare is new, and no LLM has been trained on it. It resembles React, CSS, and HTML in places,
and this file is where those resemblances stop. Every complete program below is compiled by the
test suite, so the examples are current by construction; where this file and the
compiler disagree, the compiler is right. Status: pre-1.0, under active design.*

## The map

| where | what is there | go when |
|---|---|---|
| [**`declare-help`**](operational/help.md) | **ask the platform for one exact fact** — `node tools/declare-help.mjs <name>` takes any dotted name, class, attribute, concept, enum, or diagnostic code and answers in the compiler's register, did-you-mean included; a true miss exits 1 and says what it searched, so silence is trustworthy | you need a name, a type, a signature, or what a code means |
| [`declare-model.json`](declare-model.json) | what `declare-help` reads: every component, attribute, type, method, event and diagnostic, generated from source; a class's page carries its ancestors' members too, so everything reachable on it is on one page | you want to browse the whole surface rather than ask one question |
| `library/` | the standard components — controls, structure, layouts, embedding, and the `Control` base your own controls extend — written in Declare | you want to know what ships, or to read how one is built |
| `apps/` | complete programs; `apps/README.md` maps the whole corpus — `apps/calendar/calendar.declare` (~<!--stat:calendar.lines-->830<!--/stat--> lines) is the reference, and `apps/birds/birds.declare` is the worked example of `location` + `waypoint` | you want the idiom at full scale |
| [`docs/guide/`](guide/01-thinking-in-declare.md) | a narrative course, chapter by chapter; its [glossary](guide/23-glossary.md) is one word per idea | you want the reasoning, or you are learning rather than looking up — or a term used a specific way |
| [`docs/operational/`](operational/) | install, dev server, build, deploy | you are running or shipping rather than writing |

**Those six carry everything you need to write Declare.** The language is closed and small, so
when you need a name you do not have, **ask for it rather than invent it** — that is what
`declare-help` is for: a guessed attribute is a compile error, and a hand-built widget is usually
one the library already ships. (`docs/system-design/`
also exists — it is the design record, including superseded decisions. Background, not truth.)

One boundary makes the rest of this file readable. **Every capitalized tag is a component** —
`View`, `Text`, and `Image`, but equally `Dataset`, `State`, `Spring`, and `Keys`. Components
are surface, and the reference lists them all. The language is the grammar that declares,
instantiates, configures, and relates them, and that grammar is what follows.

---

## 1. The model

A Declare program is a tree of components whose attributes are related to each other by
standing expressions the runtime keeps true.

**A binding is a relationship, not a callback.** Read a reactive value inside one and you are
subscribed to it; assign to that value and everything bound to it updates. There is no
re-render, no diffing, no dependency array, and no hook, because nothing was ever a render.

```declare
App [ width = 400, height = 140, fill = darkslategray, textColor = whitesmoke,

    count: number = 0,                               // reactive state

    add: View [ x = 20, y = 20, width = 120, height = 40, cornerRadius = 10, fill = royalblue,
        onClick() { count = count + 1 },
        Text [ x = 20, y = 10, text = "Add one" ]
        ],

    Text [ y = 80, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` } ]
    ]
```

Click the view and the label updates; resize the window and it re-centers. You wrote no update
logic for either, and there is nowhere to put any. Every section below is this same idea
applied to structure, space, data, style, and time.

### Seven differences

1. **`{ }` is TypeScript, and only TypeScript.** Bare slots have their own literal vocabulary,
   and it stops at the brace: `width = { 100% }` is a syntax error, and a color inside braces is
   `0x4169E1`, not `royalblue` or `#4169E1`. (§2)
2. **Assignment is the whole update model.** `count = count + 1` sets *and* notifies. There is
   no `setState`, no `setAttribute`, and no way to change a value without the cascade. (§5)
3. **Dependencies are extracted statically, and what cannot be read is refused.** Nothing is
   tracked at runtime, and an unanalyzable constraint is a blocking compile error rather than a
   silent fallback. This is the sharpest break from every reactive system you know. (§5)
4. **Children come from data, not from code.** The `[ ]` tree never generates children from an
   expression, so React's `{items.map(…)}` and `{cond && …}` have no equivalent there: a
   collection comes from *replication* over a datapath, and conditional presence is `visible`.
   (Those operators are ordinary TypeScript in any `{ }` value, and a handler *can* build views
   imperatively with `createView` — the declarative tree is simply not where either
   happens.) (§7)
5. **There is no CSS and no DOM.** No selectors, cascade, specificity, media queries, z-index,
   flexbox, or grid. Style is attributes, stacking is declaration order, and responsiveness is
   constraints on `app.width`. (§6, §9)
6. **Events do not bubble.** A handler fires on the node that declares it, and a child reports
   to its owner by calling a method. (§8)
7. **Nothing waits.** A program never polls: readiness is a value to constrain on, completion
   an event to take (`onLoad`, `onArrive`, `afterSettle`). A loop or timer that checks whether
   something has happened yet is a constraint or an event written by hand — almost always the
   wrong path. Time is only ever an input — a duration to animate over, a frame step to
   integrate by. (§5, §10)

## 2. Two delimiters

Two brackets carry the entire syntax. **`[ … ]` holds a component's members** — attributes,
declarations, methods, children — and the bracket nesting *is* the tree. **`{ … }` is
TypeScript**, type-checked against every component's real API.

A value slot accepts four things, and the spelling tells you which:

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal, set once | `width = 100%`, `fill = navy` |
| a **bare list** | a literal list, for an array-typed slot | `listenTo = ["delta", "done"]` |
| a **`{ … }`** value | a live expression — a **constraint** | `width = { parent.width - 10 }` |
| a **`:`-prefixed** path | a read from bound data — a **datapath** | `text = :title` |

A bare literal is the value itself, so a `script { }` constant is *not* one: `tint = SEAT_FREE`
fails in a bare slot. Reach a constant through braces — `tint = { SEAT_FREE }`.

### The vocabulary stops at the brace

Bare slots have a small literal vocabulary the compiler owns: Lengths (`100%`), colors (`navy`,
`#336699`), and keywords (`center`, `x`). Inside `{ }` none of it exists. You are in plain
TypeScript, an identifier means what TypeScript says it means, and the compiler never
reinterprets it.

```declare-fragment
fill  = cornflowerblue,                           // ✓ bare slot, a named color
fill  = { hovered ? 0x6495ED : 0x4169E1 },        // ✓ in braces, TypeScript number
fill  = { hovered ? #6495ED : 0x4169E1 },         // ✗ no such syntax in TypeScript
width = 100%,                                     // ✓ bare slot, Length literal
width = { 100% },                                 // ✗ compute it instead:
width = { parent.width - 40 }                    // ✓
```

A body is TypeScript at full expression strength: ternaries, template literals, array chains,
closures, and casts (`x as T`, `x!`), which are type-checked and then stripped. Two limits, each
a compile error naming the rewrite. **A value body is a single expression** — statements live in
methods. **Type annotations do not live in bodies** — a declared type belongs on the attribute,
as `name: type = …`; that covers locals and lambda parameters too — narrow with `x as T`.
(A top-level `script { }` is plain TypeScript and exempt.)

**A `:path` may also appear inside a `{ }` body**, and this is central rather than exotic: it is
how anything conditional over replicated data gets written. `text = { :on ? :title : "—" }` reads
the datapath exactly as the bare form does, then computes with it in TypeScript. Read `{ }` as
"TypeScript, plus datapath reads."

Two lexical notes. A `"…"` string ends at its line, in a bare slot as in a `{ }` body; a
`"""` block is the form for long text. And a `Dataset`'s literal body is strict JSON (§7) —
the one place `{ }` is not TypeScript at all.

## 3. Members and scope

Everything inside `[ ]` is a member, in one of five shapes. Two of them look nearly identical
and mean different things.

```declare-fragment
width = 100%,                          // SET an attribute that already exists
x     = { parent.width - 40 },         // SET it live — a constraint
text  = :title,                        // SET it from bound data

label:    string  = "",                // DECLARE a new reactive attribute
selected: boolean = false,
tint:     Color   = navy,              //   any value type, bare-literal default
count:    number,                      //   no default — undefined until written
rows:     number[] = [],               //   an array, element-typed
panel:    Menu    = null,              //   a component class — the slot holds an instance

select() { selected = !selected },     // a METHOD

onClick()      { count = count + 1 },  // a HANDLER — `on` + an event this node fires
onPointerMove(e: PointerEvent) { x = e.x },   // pointer handlers get a typed payload

draw(d: Draw) { d.fillStyle = "#4169E1"    // a METHOD the view calls to paint itself — see below
            d.fillRect(0, 0, 12, 12) },

bg: View [ fill = midnightblue ],      // a CHILD, named — reachable as `bg`
Text [ text = "OK" ]                  // a CHILD, anonymous
```

**Any view can paint itself by defining `draw(d: Draw)`** — graphs, gauges, iconography, marks no
fill or font gives you. It is an ordinary method: `View` calls it from a constraint of its own
(`drawing = { record(draw) }`), so it runs on invalidation and re-runs when what it read changes,
never per frame — the same rule as any method a constraint calls. `d` takes the Canvas2D drawing
calls (`fillStyle`, `beginPath`, `moveTo`, `stroke`, …); what it records, every renderer paints.

**`name = value` sets an attribute that exists; `name: Type = value` declares a new one.**
Declaring is how reactive state enters a program; setting is how it is wired. A declaration's
type comes from the same vocabulary a signature's does (below): a primitive, a component class,
a function, or an array of any of them.

**A method's signature is typed, name-first**: `select() { … }`, `input(v: boolean) { … }`,
`quant(v: number) -> number { … }`. Every parameter carries a written type — a primitive, a
component class, an event payload (`onPointerUp(e: PointerUpEvent)`), a function
(`f: (id: string) -> void`), or an array of one (`Window[]`); a `?` after the type
(`c: Menu?`) says the value may be absent, and the body must check. Omit `-> Ret` for a
method that returns nothing. A computed *value* is still not a method but an attribute with
a `{ }` default, `segIndex: number = { … }` — an attribute stays reactively true; a method
runs when called. A subclass's method, handlers included, **replaces** the base's of the same
name, a built-in's own runtime methods (`fetch`, `start`, `scrollTo`) among them; `super.name(args)`
calls the replaced one, wherever in the body it is written, or never.

**Events from outside the tree arrive as children.** `Keys [ onKeyUp(e: KeyEvent) { … } ]` gives a node
app-wide keyboard handling regardless of focus. There is no subscription syntax and nothing to
unregister: a source is a child, so it lives and dies with the node that declares it.

**Members are separated by commas** — the separator is required, and the compiler names the
spot when one is missing. A *trailing* comma before a closing `]` is legal; the formatter
(§12) removes it.

### What a name reaches

**A bare name resolves outward through the enclosing brackets, innermost first** — the brackets
are the scope exactly as they are the tree. Each `[ ]` you are nested inside is a level whose
surface is that component's whole member set, and the nearest level owning the name wins. The
compiler rewrites the read to an explicit path, so this is lexical and settled at compile time,
not a lookup that walks anything at runtime. One consequence to hold on to: every view carries
the built-in attributes, so a bare `width` always means *this* node's `width` — built-ins never
resolve outward.

Three reserved words say it explicitly, and nothing else may take their names: **`this`** (the
node the code is written on), **`parent`**, and **`app`** (the running application, from any depth
— which is why application-wide state belongs there). Bare `App` is the class; `app` is the
instance. A fourth, `classroot`, belongs to authoring a component and arrives in §4.

## 4. Composition

A component is a class. Instantiate one by naming a type with a `[ ]` body; define one with
`class Name extends Base [ … ]`.

```declare
class Chip extends View [ height = 30, cornerRadius = 10, fill = darkslategray,
    label: string = "",
    width = { this.t.width + 20 },
    t: Text [ x = 10, y = 5, fontSize = 12, text = { label } ]
    ]


App [ width = 400, height = 100, fill = black,
    layout: SimpleLayout [ axis = x, spacing = 10 ],
    Chip [ label = "one" ],
    Chip [ label = "two" ]
    ]
```

**`App` is the one root**, one per program; with `width` and `height` unset it fills its host.
**Any instance may declare its own members** — state, methods, handlers — with no class at all,
because the compiler synthesizes an anonymous subclass, and the instance remains a subtype of
its base. Promote a one-off to a named `class` when you instantiate it twice, or when you need
to name its type.

Besides `class`, the top level holds `script`, `include`, `use`, `theme`, and `style` — that is
the complete set, **in any order**, before or after the root instance;
`extends` may name a class declared later in the file. **`script { … }`** holds free TypeScript — helpers,
models, whole libraries — and may **`import`** ES modules (a file, or an npm package by bare
specifier; bundled at compile). **`script [ "file.ts" ]`** is the same block loaded from a
file, spelled like `include` and tracked like one — edit the file and the program recompiles;
a constraint may call into script, opaquely (§5). A program may hold **any number of script
blocks**, inline and files mixed; they share **one scope, in source order** — a later block's
function calls an earlier one's (or mutates its state) exactly as in a single module. The one
spelling difference: a file is written module-style (`export` allowed, and optional), while an
inline block refuses `export` — its top-level names are already visible to every `{ }`.
Imports resolve at the build toolchain's bundler; the in-browser compile refuses them by name. **`include
[ "path.declare" ]`** merges another file's top-level declarations, once. **`use [ Name ]`** keeps
a component the build would otherwise drop, for when your code constructs it by name at runtime
(`createView`, §7). **`ship [ … ]`** states what a
self-contained package of the program must carry beyond what its source names — `islands = [ "name", … ]`, the
programs an `AppIsland` may mount when its `program` is computed; `files = [ "path", … ]`, files it reads that no
literal names or that live outside its folder; `compiler = true`, it compiles source at run time; `inspector =
true`, it answers questions about itself in production ([Run, check, ship](declare-docs:guide:run-check-ship)). A
literal `program = "name"` or `url = "path"` needs no entry, and hosts that carry sources and a compiler read none of it. **`theme Name [ … ]`** and **`style Name [ … ]`** are named records of
literal values — a token record, and the style of a run of text with no view (§9).

### `classroot`

**`classroot` is legal only inside the body of a `class` you are defining, and nowhere else** —
if you are not writing `class Name extends Base [ … ]`, you do not want it. It names **the
component instance itself**, from any depth inside the class: the reach for a handler or a deep
subview acting on the component, and the explicit spelling when a nearer child shadows a bare
name.

```declare-fragment
class WeatherTab extends View [ selected: boolean = false,
    label: string = "",
    select() { selected = !selected },
    header: View [
        onClick() { classroot.select() },              // `this` here is the header, not the tab
        caption: Text [ text = { classroot.label } ]  // reaches the tab from a leaf
        ]
    ]
```

A **direct** child of the class body can reach the same instance as `parent`, and that is
legal — `parent` is the enclosing view, which for a direct child is the component itself. The
difference shows up later: nest that child one level deeper and `parent` now means the new
wrapper, while `classroot` still means the component. Reach for `classroot` when you mean the
component, and keep `parent` for when you mean *whatever encloses me*.

### Layout is an attribute

There is no `<Stack>`, no `<Row>`, no flexbox, and no grid. A view positions its children
absolutely by `x`/`y` until you set a `layout:` member — and because that member is an ordinary
reactive slot, it can be swapped, derived, or animated. **A layout places its children, and what it
places a child does not declare**: a row places `x`, `align` adds `y`, a `ResponsiveLayout` places
both; a child that declares one anyway is refused at its line, in any spelling.

```declare-fragment
layout: SimpleLayout   [ axis = y, spacing = 10 ],
layout: WrappingLayout [ spacing = 20, rowSpacing = 20 ]
```

The inset is the **view's**, not the arrangement's: `padding` — one number, or `[top,
right, bottom, left]` clockwise from the top — gives a view a **content box**, and `x = 0`
and `width = 100%` mean that box for every child, whether a layout placed it or it placed
itself. `{ parent.width }` is the escape hatch that still names the parent's literal box,
and paint never moves: `fill`, `stroke` and `cornerRadius` stay on it. A view's `stroke`
takes that same
one-or-four shape, with `null` for a bare side, which is how a single rule under a row is
drawn.

**Stacking order is declaration order**; later siblings paint on top. There is no `z-index`, so
chrome that must float above everything is declared last.

→ the layouts that ship: `library/` · their attributes: the model reference

## 5. Constraints

A `{ }` in a value slot is a **constraint**: re-evaluated when, and only when, its inputs change.

```declare-fragment
x    = { (parent.width - width) / 2 },              // re-centers on resize
fill = { selected ? 0x4169E1 : 0x191970 },           // royalblue / midnightblue
text = { data.failed ? data.error : "Loading…" }
```

**Dependencies are extracted statically, by the compiler.** Nothing is tracked at runtime: the
compiler reads your expression, reads *through* what it calls, and wires the result once.

**A constraint stays live through everything Declare it reaches.** Call your own methods, chain
array operations, read through a closure — every read inside all of it is a wired dependency,
rebased onto what you passed, so `{ this.price(app.cart) }` depends on whatever the `price`
*method* reads of the cart. The analysis collects *potential* reads, not observed ones:
`{ a ? b : c }` depends on all three. A `script { }` function is the one opaque call: script is
outside the reactive system, so `{ fmt(app.total) }` depends on `app.total` — the values you
pass — and never on what `fmt` does inside. Pass values, not nodes (a node reference never
changes, so a node-typed argument is refused); a helper that should be *analyzed* is a method.

**Assignment is the setter.** `count = count + 1` updates the value and notifies everything
bound to it; there is no bypass. Reads are symmetric — a bare read **is** the tracked read.

### The settle

A handler's writes do not take effect one at a time. When it returns, everything it changed
is applied **together** — constraints re-derive, views appear and retire where data now says
so, layout places, sizes update — one indivisible step, run to completion, called the
**settle**. Nothing paints in the middle of one, and no time passes inside one: a fetch or a
glide cannot be *in* a settle, only cause the next. This is why the world is never
half-updated, and why history can count "one entry per settle" (§6). Animation is a user of
it, not an exception: a Spring writes its attribute once per frame, and each frame's writes
get a settle of their own — motion is many small settles, never one long one.

Inside a handler, the world you read is the world *before* your writes land. Almost always
the right response is no response: state what should be true with a constraint, and it is
true after this settle and every one after it. But some work is irreducibly a *reading* of
the new geometry — aiming a camera at a view your write just caused to exist, measuring
where something landed. For that, leave one named step on the far side:

```declare-fragment
addItem() {
    app.d.set(["items", 0], { label: "new" })
    afterSettle(app.showNewest)                   // runs once, at THIS settle's close
    },
showNewest() { app.frameOn(app.list.first) }      // the new row is real, placed, sized
```

The step runs exactly once, when the settle your handler triggered has closed — and before
it presents, so what the step writes lands in the same frame as the change itself. It is
tied to your change, not to a clock: no interval, no frame callback, nothing standing
afterward. Constraint first, `afterSettle` second, and never for waiting — anything later
than this settle's close is a value changing, and values changing is what constraints are
for.

Boot is the one settle with no handler inside it, so its close is **delivered** instead:
`onReady()` fires once, on the App only, when the first settle has completed — tree
standing, geometry computed, before anything presents, so what it does is in the first
frame the user sees. Ask first whether you need it at all — readiness is usually a value —
and keep it for the genuinely once-and-imperative: seed the camera, start the tour, open
the socket.

### What owns a cell

A `{ }` can appear on either member kind from §3 — **setting** an existing attribute, or
**declaring** a new one — and one mechanical difference decides everything: whether the slot gets
a cell of its own. A **set** attribute owns a cell: a standing constraint the runtime keeps
current, and guards — a direct write is refused, with a message naming the fix. A **computed
default** (`segIndex: number = { … }`, a *declaration* whose default is an expression) is a
formula with no cell: reading it inlines the expression, and an assignment simply replaces it —
the right tool for a value you may take over later, which is why `TextInput` offers
`initial = { … }`, the editable twin of a read-only `text = { … }` (a control's `input(v)`, §11,
is the same idea).

| you wrote | owns a cell? | reading it | assigning to it | reach for it when |
|---|---|---|---|---|
| `width = { … }` — **set** an existing attribute | yes | subscribes to the slot | **refused** at runtime | the value is simply derived and should stay that way |
| `segIndex: number = { … }` — **declare** with a default | no | inlines the expression, so its deps become yours | lands, and the formula is gone | you may want to take the value over later |

Use both; know which you wrote. One rule covers every case: **derived state is never assigned —
change its inputs instead.**

One mechanism takes over a cell-owning slot without assigning to it. An `Animator`, a `Spring`, or
a `State` override **suspends** the driver and **resumes it, re-evaluated,** on completion — the
sanctioned path, and why a state may override a `{ }`-owned slot at all.

### The one rule constraints must obey

A constraint reads specific, named things, and the compiler must be able to name every one.
When it cannot, that is a blocking compile error — `DECLARE7001`, the *residue*, meaning the part
of an expression no static reading can name — rather than a silent fallback. Do not try to hold the refusals in your head; the diagnostic names the exact
read it could not follow and the rewrite that resolves it. Three instincts account for most of
them:

- **Aggregating the rendered tree** — `this.children.map(…)`. The number you want lives in the
  data, not the views: count the Dataset (§7).
- **Indexing a slot by a runtime value** — `this[k]`. Name the slot, or move the lookup into a
  method the compiler reads through.
- **A slot deriving from itself** — `total = { total + tax }` reads like a harmless adjustment
  and is a cycle by construction. Derive from a base slot, not the slot you are setting. (A
  provided value avoids this: `theme = { { ...provided("theme"), accent: red } }` reads the
  *ancestor's* theme — `provided(…)` walks up, never to itself — so a subtree can extend the
  theme above it without a cycle.)

**`script { }` is foreign code — wholly outside the reactive system.** It may hold arbitrary
TypeScript: stateful helpers, caches, classes, whole libraries. The compiler never reads a
script body; a call is opaque, and its own state is invisible — if a function's answer can
change without your inputs changing, hold that state in a node. Two direct uses stay refused
in reactive code: a constraint naming a script `let` (a snapshot with no wake-up), and any
body *writing* one (each body holds a copy, so the write lands nowhere — state that changes
is an attribute). Handler code is under none of the *reactivity* rules above — it is ordinary
TypeScript: locals, loops, `switch`, the host's `fetch`/`URL`/timers — and genuinely dynamic
work belongs there or in the framework's own primitives. (Two things it is not: `async` — a
handler is synchronous, a value the screen derives from is a `DataSource` — and a door to
bare browser globals; see Vocabulary → Types and functions for what every body may name.)

Only declared reactive attributes participate at all, so locals and plain objects in
`script { }` cost nothing.

You never have to guess what a constraint is wired to — `__declare.explain` answers it on the
running program (§12).

## 6. Space

A view's size on each axis is one of three things: **unset** takes it from its content — its own
(a `Text`'s run) and its visible children's boxes — **a constant** is fixed, and **a constraint** is
whatever it computes. A child sized *from* its parent does not count toward the parent's content
size on that axis, however it is written.

A view has no `minHeight`, `maxHeight`, or `overflow` attributes. Two read-only intrinsics,
`contentWidth` and `contentHeight`, expose what the content wants, so any clamp is arithmetic.

```declare-fragment
height = { Math.min(contentHeight, 480) },    // grow to a cap, then stop
clip   = true                                // hide whatever passes the cap
```

`clip = true` clips children to the box, `scrolls = y` scrolls taller content natively, and a
child opts out of its parent's regime with `ignoreLayout` or `ignoreClip`.

**Positions are literals.** `x = center` and `x = end`, and the same on `y`, place a view against
its parent — resolved reactively, exactly like `100%`. The closed set is `center` and `end`; the
start is `0`. `y = center` centers a view's box, a `Text` included. A label inside a control usually
wants its *ink* centered instead — the cap band, not the font box with its uneven leading —
and that is what the library's `TextLabel` is: a `Text` whose `y` is a cap-centering
constraint over its own metric facts.

**The App fills its host by default**, so `App [ … ]` with no size line fills the window and
resizes with it, while an explicit size makes a fixed widget. For an embedded app the host is its
container element, which is what lets apps nest. Responsive code reads `app.width`; the App also
carries the live host facts — viewport, colour scheme, pointer — as reactive attributes.

`App [ minWidth = 480, minHeight = 420 ]` sets a **size floor**: below it the app stops adapting,
holds the floor, and the host pans instead. It is a policy the host cooperates with rather than
clamp arithmetic you write into constraints — and it is the App's alone, not a view attribute.

### The URL is an attribute; links are declared

There is no router. **`location`** is the app's slice of the URL, as one two-way reactive string
the host seeds before first settle, mirrors outward, and writes back on back/forward. A view
that manifests a location declares it with **`shows`**; a place inside one is named with
**`anchor`**; and any view becomes a link with **`link`** — one reference string, the same one
an authored Markdown href carries:

```declare-fragment
home: View [ shows = "home",
    pill: Text [ text = "Why", link = "#why" ],           // a destination
    faq:  Text [ text = "The note", link = "#story" ],    // an anchor — its location DERIVED
    repo: Text [ text = "GitHub", link = "https://github.com/example" ]
    ],
why: View [ shows = "why",
    note: View [ anchor = "story", width = 200, height = 80 ]
    ]
```

Because references are declared rather than assembled, the compiler gains a **registry** and
checks every one at build: a typo'd `#stroy` is a compile error naming the real names. A linked
view realizes a real `<a href>`, so ⌘-click and copy-link work, and the build's crawler walks
the same edges — which is what makes a deep link indexable.

Arrival is one operation whatever caused it, so a link, a prose href, a pasted URL and the Back
button are the same event, and an app answers it in one place: a hook to transform or veto the
reference, and a handler delivered the view it names once that view exists. Undeclared, arriving
scrolls; declaring the landing replaces that with your own idea of showing, a camera or a pan.

**Location is the app's shareable coordinates** — what a recipient should see when handed the
URL, nothing more; a draft or a session's working values are ordinary attributes. Between those
two sits a third kind, state the Back button *should* undo but a stranger should never see, and
it has its own attribute: **`waypoint`**, location's twin, carried in the history entry and never
in the URL. A history entry is the pair, one per settle in which either changed,
and one Back restores both. The dividing test takes five seconds: *would you hand the value to a
stranger?* Yes → `location`. No, but Back should undo it → `waypoint`. Neither → an ordinary
attribute.

→ `link`/`shows`/`anchor`, arrival and the crawl: the model reference ·
[the location chapter](declare-docs:guide:location)

## 7. Data

A `datapath` selects a place in the data. Descendants read fields relative to it with `:path`
— every member, not only the visible ones, so a `Spring`'s target or a `Time`'s gate reads the
cursor of the view it is written in — and a path matching many records **replicates** its node
— one instance per record. This is the
replacement for React's `{items.map(…)}`: a collection of children comes from data, never from
code in the tree.

```declare
App [ width = 420, height = 260, fill = midnightblue, textColor = gainsboro,

    people: Dataset {
        { "rows": [ { "name": "Ada",   "score": 90 },
                    { "name": "Grace", "score": 80 } ] }
        },

    list: View [ x = 20, y = 20, datapath = { people.value },
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        View [ height = 20, datapath = :rows[],                // one instance per record
            n: Text [ width = 150, text = :name ],
            s: Text [ x = 150, text = :score ]
            ]
        ]
    ]
```

**The `[]` suffix is what replicates.** `datapath = :rows[]` says *this path matches many
records, so make one instance of this node per record*; without the brackets, `:rows` is an
ordinary read of whatever is there, and `[]` may appear only at the end of a path.

Between those, a path may **select**: `:path` follows JSONPath (RFC 9535) over the shipped
subset — `[0]`, `[-1]`, `[1:4]`, `[*]`, `['quoted key']`. So `:rows[*].label` is every row's
label, and `:rows[2:8][]` replicates exactly that range, each instance cursored at its real
index.

A `Dataset`'s literal body is **strict JSON** — quoted keys, no trailing commas. The
replicated node is anonymous, but names inside it resolve per instance. **Identity is
inferred** — a record's `id` field is its identity by convention, so reconciliation reuses
instances across sorts, filters and edits with nothing declared; when identity lives under
another name, `key = :email` on the replicated node says which.

**Count the data, not the tree.** A Dataset's `.value` is the parsed data, so a count is ordinary
TypeScript on it. Reach for this whenever you would have counted rendered rows.

**A `DataSource` is a remote resource whose lifecycle is reactive state** —
`data: DataSource [ url = "data/events.json" ]`. **Nothing loads on its own** unless you set
`auto = true`; forgetting `.fetch()` is legal, silent, and the common first bug, and `onInit()`
is the usual place for it. Screens then derive from the resource (`shown = { data.loaded }`)
rather than being toggled. An optional `schema = [ field: type, rows[]: [ … ] ]` declares the
response's shape: it validates the payload on receipt — so malformed data yields `.failed` rather
than `undefined` three bindings deep — and lets every `:path` be checked against the shape at
compile time. Without one, paths are dynamic: an unresolved `:path` yields null and the bound
attribute falls back to its default. The request's own parts — method, body, credentials,
headers — are ordinary reactive attributes, so an authenticated endpoint stays declarative.

**A schema is a named type — declare it once, at the top level, and use it in any type position.**
`schema Task [ id: string, done: boolean, status: "open" | "closed", note?: string ]` is a
declaration in the one type system: the name works in every type position (`sel: Task = null`,
`advance(t: Task) -> Task`, a field of another schema — `owner: Person`), a dataset declares its
document with it (`schema = [ tasks[]: Task ]`, or `schema = Task[]` for a bare-array response),
and its `.value` is then *typed* — `nest.value.tasks` is `Task[]` in every `{ }` body, so a
misspelled field dies at compile time and the `as` casts go. The runtime enforces the same
declaration at every boundary, the mutation verbs included. The schema grammar is deliberately
the subset of TypeScript a JSON document can carry — which is exactly what makes one declaration
checkable by the compiler *and* enforceable against live data. Extra keys always pass: a schema
declares what the program relies on.

**Two-way binding is opt-in, with `<->`, and for leaf editors only** — `TextInput [ text <-> :title ]`:
the right-hand side names a *place in data*, either a datapath or a `{ }` yielding a field name,
resolved against the nearest enclosing `datapath` — an editor with none is a compile error. To
drive an ordinary slot, use the value pattern: `text = { app.note }` plus
`input(v: string) { app.note = v }`. One-way `:path` everywhere else. It is the only arrow in the
language.

**Datasets are mutable from handlers** — `d.set(path, v)`, with `insert`, `removeAt` and `move`
for collections. A path is a segments array (`["rows", 0, "name"]`) or a JSON Pointer string
(RFC 6901 — `"/rows/0/name"`, and `"/rows/-"` appends). A write wakes exactly the bindings that
read the changed region.

**A derived dataset recomputes from its inputs** — `cal: Dataset [ contents = { app.buildModel() } ]`.

**Large collections virtualize on one word.** `virtualize = true` on a replicated node builds
only the rows near the viewport and leaves the rest logical — same records, same paths, same
behaviour, reconstructed indistinguishably as you scroll. It is a boolean, **off by default** —
full materialization keeps browser find working over every record. There is nothing else to
write: no row heights, no scroll wiring, no keys.

**When structure is genuinely imperative**, build it from a handler:
`parent.createView(tag, props)` instantiates a component by name into the receiver — a full
citizen, and the parent's arrangement and auto-size take it in on arrival. Its pair is
`view.discard()`: one verb unlinks the view, retires its whole subtree, and re-packs what it
leaves behind. Reach for replication first — it reconciles, keys, and tears down for you — but
the imperative door is open (`use [ Name ]`, §4, keeps a string-named component in the build).

**Data that keeps arriving is a stream** — `EventStream` and `Socket`, connected exactly while
`active` and a `url` say so, delivering `onMessage` and a reactive `last`. Same lifecycle shape as
a `DataSource`, and nothing to unsubscribe.

→ `Dataset` and `DataSource` attributes, `Stream`/`EventStream`/`Socket`, `View.createView`,
`View.discard`: the model reference · paths, selection and editing:
[the data chapter](declare-docs:guide:data) · virtualization at scale:
[scale](declare-docs:guide:scale)

## 8. Input

**Handlers are methods named with an `on` prefix**, answering this node's own events: `onClick`,
the pointer and touch families, `onKeyDown` and `onKeyUp` on the focused view, and `onInit` after
construction. **`onChange`** answers the values a node names in `trackChanges = [ … ]`: it fires at the
close of a settle in which one of them ended different from where it started, once, carrying each
name with its previous and current value — for a state change the program must act on, never to
follow a value (a constraint) or to move one (a Spring).

**Nothing bubbles.** A handler fires on the node that declares it, full stop. A child that needs
to tell its owner something calls a method. There is no `addEventListener`, no `event` keyword,
and no capture or propagation phase; the `on` prefix is a naming convention, not syntax.

**Pointer input has two layers.** The **raw** layer — `onPointerDown`/`Move`/`Up`, the multi-finger
touch family, and `onWheel` — reports what the pointer physically did, immediately: the layer for
*manipulation*. The **resolved** layer — `onClick`, `onDblClick`, `onHold` — reports what the user
*meant*, decided after watching the whole gesture: the layer for *commands*.

*Pointer*, not *mouse*: one handler serves a mouse, a fingertip, and a pen, and it fires at once
for each — there is no compatibility event here and nothing to fall back to. `onTouch…` is the
separate multi-finger stream, for when you need the finger list rather than a point.

> **`onClick` activates, `onPointerDown` manipulates.**

Reach for the raw layer to run a command and it misfires on touch, where a finger landing on a
button may be starting a scroll. Because the runtime resolves the gesture, a wandering pointer is
a drag and activates nothing, and declaring `onDblClick` makes that view's single click wait out
the double window. `onPointerMove` and `onPointerUp` carry **root-space** points, because a drag needs
a frame that does not move with the dragged thing; `onPointerDown` and `onClick` carry view-local
ones.

One fact a drag handler must not miss: a gesture the browser reclaims — a touch that became a
scroll — still delivers `onPointerUp`, but with **`e.canceled` true**. Commit on release only when
it is false, or an interruption reads as a drop.

**The browser owns every gesture until a view claims one — and declaring the handler *is* the
claim**, taking exactly what that handler needs to fire and nothing more: `onPointerMove` claims the
single-finger drag over its view and subtree while pinch stays the user's, the raw touch family
claims every finger (the app then owes its own zoom), `onWheel` claims the wheel stream — trackpad
pinch included, arriving with `e.pinch` true — and a scrolling view is the opposite move,
delegating its panning to the browser. Claim the least you need, on the smallest view that needs
it; claiming at the App is legitimate exactly when the app *is* the surface — a map, a canvas, a
game taking **full gesture control**.

### Opacity is paint; `visible` is presence

A view at `opacity = 0` is invisible but entirely present — it holds its layout space and still
takes clicks, subtree included, exactly as CSS opacity does. That is a tool, not a trap: a fully
transparent view is the natural press-catcher — a scrim behind a modal, a hit target larger than
the mark it serves.

`visible = false` is the other tool, and it is the stronger one: it removes the view from input
*and* from its parent's layout and auto-extent. So a fade that should end in absence is
`visible = { opacity > 0 }`, while flow content that merely fades in should stay visible and let
opacity do the work. `pointerEvents = "none"` is the third, for a view that should be seen and
not touched. **A view takes the pointer when it has declared an interest in it** — a handler,
a `link`, a `tip`, or a `scrolls` axis, since a scroller answers drags and wheels with
scrolling — and content behind such a view is not reachable through it.

### Hover and press are values

Every view carries two read-only intrinsics. `hovered` is true while the view sits on the live
hit chain — the topmost visible view under the pointer, plus its ancestors — so it is
occlusion-correct, and it is always false on touch. `pressed` is true from a pointer-down on the
chain until release. Read them anywhere a value goes, including as a state's condition (§10):

```declare-fragment
fill = { hovered ? 0x4169E1 : 0x191970 }   // royalblue when hovered, else midnightblue
```

Declaring either is a compile error; assigning one is refused at runtime, the same guard §5
describes. Like `contentWidth`, they are computed for you.

## 9. Style

There is no CSS, no stylesheet file, no selector, no cascade, and no specificity — which is also
what makes a non-DOM renderer possible. Your CSS *knowledge* transfers: colors, font stacks, and
shadows read the same. The names do not. A border is a **stroke**, rounding is **`cornerRadius`**
(one number, or `[topLeft, topRight, bottomRight, bottomLeft]` to round only some corners),
and `borderWidth`, `boxShadow`, and `outline` do not exist.

What replaces the cascade is **provided values**: `provided("name")` reads the value the nearest
ancestor makes available under that name, and *providing* is just setting a value on a node — no
keyword. The text face — `fontFamily`, `fontSize`, `fontWeight`, `textColor`, `letterSpacing` —
works this way (each lives on `Text`, defaulting to `provided(…)`, so setting one on a container
provides it to the runs below), and so does **`theme`**, a token record every color in an app
should name once.

A **typeface is an object in the tree**, like an `Image` — `brand: Font [ Face [ … ] ]`, usually
on the App — and `fontFamily` takes that object as its value. So a face is a value like any
other: choosing one is an assignment, and text, layout and drawings follow a face landing with
no code of yours.

```declare-fragment
theme = { app.dark ? SanFranciscoDark : SanFrancisco },      // on the App: PROVIDE a preset, light or dark
fill  = { provided("theme").surface },                       // READ it anywhere below

panel: View [                                                // on a DESCENDANT, provide a modified one
    theme = { { ...provided("theme"), accent: 0xCC3333 } }   //   every provided("theme") below reads this
    ]
```

`provided(…)` is the one new construct — an explicit up-the-tree read, bare in `[ ]` (like
`gradient(…)`) or a call in `{ }`. It is explicit on purpose: it reaches past this node, and a
non-local read is worth showing. You rarely write it — `Text` and the library widgets read the face
and theme values *for* you, so app code that only *sets* those values never says `provided(…)`;
you write it where your own code reads a value from up the tree. A read that finds no provider
falls to an optional default (`provided("theme", SanFrancisco)`), else throws, naming the
value.

Start from a library preset — each a light record with a `…Dark` companion, in scope by name —
and spread to change a token; the standard library reads specific token names, so build from a
preset rather than an empty record. You can declare your own with `theme Brand [ … ]`, a
top-level named record like a `style` bundle. The `{ { … } }` is not special syntax: the outer
braces open the constraint, the inner ones are a TypeScript object literal.

A **`style` bundle** is a named record of literal text attributes — the style of a run of text
that has no view, which a `<span class>` inside `HTMLText`/`Markdown` wears. Like a theme record
it holds literals only: it has no place in the tree, so nothing in it can depend on where it is
used, and its name is a value in any `{ }`, typed by the fields it sets. A look that follows the
theme is written where it is used. To reuse a look across whole views you **subclass** instead
(`class Card extends View [ … ]`).

```declare-fragment
style Keyword [ textColor = #C678DD, fontWeight = bold ]   // a <span class='Keyword'> in prose wears it
```

Rich-text content can also carry **views**: inside `HTMLText`/`Markdown`, a self-closing tag
naming one of your own view classes (`<Chip label='docs'/>`) places one real view of that class
in the flowing line, its attributes converted by their declared types. A `<span class>` remains
a style; a tag is never one.

Precedence is fixed: a value **set locally always outranks a provided one** — a `Text` that sets
its own `fontSize` ignores the region's, and a provided value is a default a node overrides, never
a rule that fights your code.

## 10. States and motion

Both halves of this section do the same thing: **declare the destination, not the transition.**

A **state** is a named, reversible bundle of attribute overrides applied while a condition holds.

```declare
App [ width = 360, height = 200, fill = black, textColor = whitesmoke,

    card: View [ x = 30, y = 30, width = 300, height = 70, cornerRadius = 10, fill = midnightblue,
        Text [ x = 20, y = 20, fontWeight = bold, text = "Summary" ],
        open: State [ applied = { hovered }, height = 140, fill = steelblue,
            Text [ x = 20, y = 50, width = 260, textColor = gainsboro, wrap = true,
                text = "height, color, and this whole line arrive together" ]
            ]
        ]
    ]
```

While the condition holds, the overrides — and any children declared inside the state — apply;
when it lifts, everything reverts. The "set it on enter, forget to unset it on exit" bug is
unrepresentable, because an attribute's value is a pure function of its base plus the active
states. That is what lets states compose and interrupt. When two active states override the same
slot, the later declaration wins.

**A state overrides its own element's attributes only.** It cannot reach into a child —
`top.bg.opacity = 0.5` is a compile error, because a member always sets its own element's
attributes. To coordinate several views from one condition, declare a state on each of them reading
the same flag, or give the child a constraint that reads it:

```declare-fragment
bg: View [ opacity = { app.open ? 0.5 : 1 } ],                 // the child derives
bg: View [ dim: State [ applied = { app.open }, opacity = 0.5 ]
    ]   // or owns a state
```

A state is driven by its condition (`applied = { … }`) or imperatively by the verbs —
`apply()`/`remove()`/`toggle()` from a handler. One or the other: the gate owns `applied`,
so a gated state changes when what the gate reads changes.

A **`Spring`** drives one attribute toward a reactive target. Declare where the thing belongs and
the spring finds the path, so a change of target mid-flight is simply a new destination and
interruption needs no code.

```declare-fragment
slide: Spring [ attribute = x, to = { on ? 340 : 20 }, stiffness = 170, damping = 20 ]
```

Motion is the one place time is legitimately an input (§1, *nothing waits*): `Animator` for a
value that changes *over* a duration, `Spring` for one that moves *toward* a target — the house
idiom — and `Time` for the clock itself — its facts (`now`, `minute`, …) are inputs a
constraint derives from, and its `onTick(dt)` at `tick = frame` is the one per-frame handler, there
only to **integrate**, the previous value being the input; a per-frame `onTick` that ignores `dt` is
polling. `setTimeout` is for a timing rule — a debounce, a request timeout —
and a timer does not die with its node, so cancel it yourself. (Finishing after your own change
has landed is neither — that is `afterSettle`, §5.)

Because states, springs, and layout all sit on one reactive core, *arrangement* animates: spring
a few geometry scalars and every constraint derived from them moves in lock-step.

→ `State`, `Spring`, `Animator`, `Time` attributes: the model reference · the idiom at scale:
`apps/calendar/calendar.declare`

## 11. The standard library

Declare ships a standard component library in `library/`, written in Declare itself with no
privileged API underneath. It **auto-includes by bare tag** — no import, no module ceremony —
components read the provided `theme`, and focus behavior (Tab traversal, activation, a
traveling focus indicator) is provided undeclared. Check there before building a control by hand.

Two contracts are worth learning because your own components should obey them too.

**The value pattern.** A control's value is a plain reactive attribute, in one of three forms:
standalone, where the control owns its state and you read it by name; **app-owned, deriving down
and delivering up**; or data-owned, `<->`, editors only. The second is a *pair*, and splitting it
is the §5 rule biting. A control's default `input` writes its **own** attribute, so a one-way
`checked = { app.muted }` with no `input` override makes the control's own edit an assignment to a
cell-owning slot — refused (§5). Override `input` and the edit goes where the value actually
lives.

```declare-fragment
Checkbox [ label = "Mute", checked = { app.muted },
    input(v: boolean) { app.muted = v }
    ],
Slider   [ value = { app.volume },
    input(v: number) { app.volume = v },
    disabled = { app.muted }
    ]
```

**What a component arranges, it takes as records.** If the component arranges it — menu items, a
dialog's buttons — it takes plain record arrays and hands the choice back through a method. If
*you* arrange it, it is not a component feature at all: it is views, a layout, and replication.

→ what ships and how it is built: `library/` · each component's attributes: the model reference

## 12. Working

1. **Write `.declare` source** and run the dev server — `npm start`, then open your program at
   its path. Apps are typically one file, grown with `include` (§4).
2. **Run it at its URL.** The program URL *is* the app's address: with the dev server up,
   navigating to `…/<name>.declare` compiles on request and renders. The same address takes
   modifiers — `?render=canvas`, the in-browser editor, the crawler's document (the full list:
   `docs/operational/`). Typechecking of every `{ }` body is part of every compile; there is
   no flag.
3. **Read the error.** Every diagnostic carries a code, a line and column, and the fix. Apply
   exactly the named fix, change nothing else, recompile. All independent errors in a phase are
   reported together.
4. **Ask the platform.** When what you need is a fact rather than a failure — a name, a
   signature, an enum's tokens, a diagnostic code — `node tools/declare-help.mjs <name>`
   answers it in one shot (the map). It is the cheapest step in this list, and the one that
   keeps a guess from becoming a compile error.
5. **Ask the running program.** A clean compile means the checker found nothing, not that nothing
   is wrong: layout, fonts, paint, and input routing do not exist until the program runs. When
   something compiles yet misbehaves, stop re-reading the source. `__declare.explain(path, attr)`
   answers *why* a slot holds its value, giving the expression, the read-paths it was wired to,
   and their live values. (Dev tooling: a production build ships a stub unless you pass
   `declarec --debug`.) `node tools/verify.mjs <file>` climbs the same ladder the test suite
   does, from parse to real input in a headless browser.

The formatter (`tools/format.mjs`) owns the house style; run it rather than hand-aligning. What it
cannot decide for you is naming — camelCase — and that **a leaf goes on one line**, which most of a
UI is.

→ install, dev server, build, deploy: [`docs/operational/`](operational/)
