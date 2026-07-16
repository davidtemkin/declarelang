# Declare — the whole language, in one file, for you and your model

*This is the core document for **Declare**, a language for building application UIs — the
whole language in one file, written for two readers at once: a person learning or checking
the language, and an LLM writing it. The language is new, and **no model has been trained
on it**. So where Declare resembles React, CSS, or HTML, the resemblance ends where this
document says it does — the most reliable way to be wrong about Declare, for a person or a
model, is to carry a rule over from a language it resembles. When unsure, consult this
document rather than extrapolating. This document, the examples, and the compiler are kept
in agreement by the checks that gate every commit: every complete program below compiles
under the current toolchain.*

*Language status: pre-1.0, under active design (2026-07). The narrative learning path:
[the guide](guide/00-overview.md). Per-element detail: [the reference](reference/). Design
history and unsettled questions: [`system-design/`](system-design/) — background, not truth.*

---

## 1. What Declare is

Declare is to web applications what HTML is to web documents: you compose a tree of
components, set their attributes, bind them to data, and handle events. The declarative
layer is small; **all real logic is ordinary TypeScript**. One source tree renders to the
DOM or to its own pixels on a canvas — you never touch either. The compiler runs in the
browser as well as in Node.

The defining idea: **a binding is a standing relationship the runtime keeps true**, not a
function you remember to re-run. Read a reactive value inside a binding and you are
subscribed; assign to one and everything bound to it updates. There is no re-render, no
diffing, no dependency array, no hook.

A complete, runnable program:

```declare
App [ width = 400, height = 140, fill = #1E3A49, textColor = whitesmoke,

    count: number = 0,                               // reactive state

    add: View [ x = 20, y = 20, width = 108, height = 34, cornerRadius = 8, fill = #2E6BE6,
        onClick() { classroot.count = classroot.count + 1 },
        Text [ x = 16, y = 8, text = "Add one" ],
        ],

    Text [ y = 74, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` },         // re-runs whenever count changes
        ],
    ]
```

Click the view and the text updates; resize and it re-centers. No update logic was written.
(The hand-built button above shows the composition model; a themed `Button` also ships in
the small standard library — §12.)

**What the language is for.** Verifiable, analyzable, concise programs are the floor, not
the point. The point is what one reactive graph makes *sayable*: layout, states, springs,
and data all derive from the same constraints, so **continuity is the grain, not the
garnish** — a view doesn't switch so much as *become* the next one, and the continuous
version of an interface is often less code than the discrete one. These are capabilities
of the language itself; reach for them:

- **Arrangement animates.** Spring a few scalars and every constraint derived from them
  moves in lock-step — this is how a calendar's month morphs into its week and folds into
  its year (`apps/calendar/calendar.declare`, ~700 lines, the idiom at full scale).
- **Layout is a reactive slot** — swap it, derive it, animate it (§5).
- **A mode is a reversible bundle** (§8) — it cannot leak, so modes compose and interrupt.
- **Motion is physics on an attribute** (§8) — declare where a thing belongs; the spring
  finds the path and settles; interruption is just the target changing.
- **Screens derive from data state** (§7) — `shown = { data.loaded }`, not navigation code.

## 2. The two delimiters

The entire mental model:

- **`[ … ]` holds a component's members** — attributes, children, declarations. The bracket
  nesting **is** the view tree.
- **`{ … }` is TypeScript** — a value expression, a method body, a `script` block. From `{`
  to the matching `}` you are writing ordinary TypeScript.

One rule for values:

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal, set once | `width = 100%`, `fill = navy`, `count = 12` |
| a **`{ … }`** value | a live TypeScript expression (a **constraint**) | `width = { parent.width - 10 }` |
| a **`:`-prefixed** path | a read from bound data (a **datapath**) | `text = :title` |

Bare slots have their own literal vocabulary the compiler owns: `100%` is a Length,
`#1E3A49` is a Color, `navy` is a named color, `x` in `axis = x` is an axis keyword.
**Inside `{ }` that vocabulary stops** — you are in plain TypeScript, so colors are written
`0x1E3A49`, percents don't exist (compute from `parent.width`), and an identifier means
exactly what TypeScript says it means. The compiler never silently reinterprets an
identifier inside braces.

Two edges of the seam, stated plainly:

- A `{ }` body is TypeScript **expressions and statements — not type syntax**. `as`,
  `satisfies`, and type parameters do not parse there. When you must narrow a value,
  coerce structurally: `String(x)`, `x || ""`, `Number(x)`.
- Multi-line string literals are `"""` blocks (used for prose and Markdown bodies); a
  single-line `"…"` string must stay on its line.

## 3. Members, by shape

Everything inside `[ ]` is a member. **The comma is a terminator, not a separator** (Go's
rule): every own-line member ends with one — including the last before a hanging `]` — so
you never special-case the final line. The one exception: no comma before an *inline* `]`
(`Text [ x = 42, text = :day ]`). The shapes:

```declare-fragment
width = 100%,                          // SET an attribute that exists (bare literal)
x     = { parent.width - 40 },         // SET, live (a constraint)
text  = :title,                        // SET from data

label:    string  = "",                // DECLARE a new typed reactive attribute
selected: boolean = false,
count:    number,                      // no default — undefined until set

select() { classroot.pick(this) },     // a METHOD (shorthand)
open: (h: int) -> View {               // a method, canonical form: a field of function type
    return this;
    },

onClick()      { count = count + 1 }, // a HANDLER: `on` + this node's own event
onMouseMove(e) { x = e.x },            // pointer handlers get an event with .x/.y

onKeyUp(e) <- Keys {                   // a SUBSCRIPTION to an external source (`<-`)
    if (e.key == "ArrowDown") next()   //   e is the KeyEvent; auto-unsubscribed at teardown
    },

bg: View [ fill = #101E28 ],           // a CHILD instance, named `bg` (reachable as bg / this.bg)
Text [ text = "OK" ],                  // an anonymous child
```

The difference between `name = value` (sets an existing attribute) and `name: Type = value`
(declares a new one) matters — declaring introduces reactive state. A method is symmetric
with a declaration: a named field of function type whose value is its `{ body }`. There are
exactly two forms: the shorthand `select() { … }` for a void method, and the typed field
`open: (h: int) -> View { … }` when parameters or a return type are needed. A method **never**
carries a `: Type` return annotation directly after its parentheses — `segIndex(): number { … }`
is not Declare (it is a syntax error); write `segIndex: () -> number { … }` for the typed form,
or `segIndex() { … }` for the void one.

## 4. Classes and composition

A component is a class. Instantiate by naming a type with a `[ ]` body; define with
`class Name extends Base [ … ]`:

```declare
class Chip extends View [ height = 22, cornerRadius = 6, fill = #244463,
    label: string = "",
    width = { this.t.width + 16 },
    t: Text [ x = 8, y = 4, fontSize = 11, text = { label } ],   // bare `label` reads the class's attribute
    ]

App [ width = 400, height = 100, fill = #0B141B,
    layout: SimpleLayout [ axis = x, spacing = 8 ],
    Chip [ label = "one" ],
    Chip [ label = "two" ],
    Chip [ label = "three" ],
    ]
```

- **The one root is `App`** — one per program; its body is the whole visible tree. If
  `width`/`height` are unset, the App fills its host (§10).
- **Any instance can declare its own members inline** (state, methods, handlers) without
  defining a class — the compiler synthesizes an anonymous subclass. The instance is a
  *subtype* of its base, so it fits anywhere the base is expected. Promote a one-off to a
  named `class` only when you instantiate it more than once — or when you need to *name*
  its type (to extend it, or take it as a parameter). The moment the type needs a name,
  you've outgrown the one-off.
- Free TypeScript (models, helpers) lives in top-level `script { … }` blocks.

**Where does a piece of code live?** The rest of the language keeps reinforcing this guide:

- structure that **repeats** → a **class**;
- a single **computed attribute** → a small **function** bound inline, *not* a wrapper
  class: `Image [ source = { iconUrl(:code) } ]`, never `class WeatherIcon extends Image`;
- behavior that operates on a component's own state → a **method**;
- **stateless** logic shared across the tree → a free function in `script { }`.

**Layout is an attribute, not a container type.** Every view defaults to absolute
positioning by `x`/`y`; set a `layout:` member to arrange children — and because it's a
reactive slot, it can be swapped or animated:

```declare-fragment
layout: SimpleLayout   [ axis = y, spacing = 10 ],       // stack (x or y)
layout: WrappingLayout [ spacing = 24, lineSpacing = 24 ],
```

**Stacking order is declaration order** — later siblings render on top. There is no
z-index. (The chrome that must float above everything is simply declared last.)

## 5. Reactivity: constraints and the `=` setter

A `{ }` in a value slot is a **constraint** — re-evaluated when, and only when, its inputs
change. Dependencies are extracted **statically by the compiler** (it reads your
expression, and reads *through* the methods it calls, transitively) — never tracked at
runtime, never declared by hand.

```declare-fragment
x     = { (parent.width - width) / 2 },              // re-centers on resize
fill  = { selected ? 0x2E6BE6 : 0x101E28 },          // recolors on select
text  = { data.failed ? data.error : "Loading…" },   // reacts to a data resource
```

**Assignment is the setter.** Inside any `{ }` body, `count = count + 1` updates `count`
*and* notifies everything bound to it. There is no `setState`, no `setAttribute`, and no
bypass that skips the cascade. Reads are symmetric: a bare `.x` is the tracked read.

**The one rule constraints must obey:** a constraint reads *specific, named* things, and
the compiler must be able to name every one. If it can't — you indexed a slot by a runtime
value (`this[k]`), computed a data path at runtime, or aggregated over the live view tree —
that is a compile error whose message names the rewrite (bound the key's type, use a
literal path, or read from a Dataset). Genuinely dynamic reactivity belongs to the
framework's own primitives (layout, replication) or to imperative handler code — which is
unrestricted TypeScript and always available.

**What reactivity costs, in brief.** Only *declared* reactive attributes participate —
locals, loop counters, and plain objects in `script { }` carry zero reactive overhead.
Reads inside constraints are prewired at compile time, so at runtime they are plain field
reads. Writes batch: a tight loop writing an attribute is N cheap sets and **one** cascade
at the flush. The discipline that falls out: reactive attributes for UI state you want to
propagate; plain values for hot inner computation.

## 6. Events and subscriptions

**Handlers** are methods named with an `on` prefix, answering *this node's own* events:
`onClick`, `onMouseDown/Move/Up/Over/Out`, `onKeyDown`/`onKeyUp` (on the focused view),
`onInit` (after construction — the place to kick off a first `.fetch()`). Pointer handlers
receive an event with `.x`/`.y`; key handlers a `KeyEvent` (`e.key`, `e.code`, modifier
flags — never a numeric code).

**An event is just a function-typed member that gets called** — the `on` prefix is a
naming convention, not syntax. There is no `event` keyword, no `addEventListener`, and no
bubbling: handlers fire on the node that declares them, and a child delivers to its owner
by *calling a method* (`classroot.select()` — or the standard library's `input(v)`
contract, §12).

**Subscriptions** reach an *external* source with `<-`: the form is
`member(e) <- Source { body }`, and the binding is lifetime-managed — automatically
unsubscribed at teardown, no cleanup to forget:

```declare-fragment
keys: Node [
    onKeyUp(e) <- Keys {
        if (e.key == "Escape") app.closeDetail()
        },
    ],
```

Subscriptions exist for the runtime *services*: `Keys` (`onKeyDown`/`onKeyUp` — the raw
stream; the focused view's own handlers are usually what you want) and `Focus`
(`onFocusChange(v) <- Focus` — how the standard library's `FocusRing` follows focus).
Subscribing to a source that doesn't exist, or to a member it doesn't call, is a
positioned compile error naming the alternatives. You cannot subscribe to another *view's*
events — a child delivers to its owner by calling a method. Don't confuse `<-` (event
subscription) with `<->` (two-way data binding, §7).

## 7. Data

A **cursor** (`datapath`) selects a place in the data; descendants read fields relative to
it with `:path`; a path that matches many records **replicates** its node, one instance per
record.

```declare
App [ width = 420, height = 260, fill = #0B141B, textColor = gainsboro,

    // an embedded dataset — its body is strict JSON (quoted keys), the one place JSON is legal
    people: Dataset {
        { "rows": [ { "name": "Ada",   "score": 92 },
                    { "name": "Grace", "score": 87 },
                    { "name": "Alan",  "score": 74 } ] }
    },

    list: View [ x = 20, y = 20, datapath = { people.value },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        View [ height = 22, datapath = :rows[], key = :name,        // one instance per record (replicated children are unnamed)
            n: Text [ width = 160, text = :name ],
            s: Text [ x = 170, text = :score ],
            ],
        ],
    ]
```

- `key = :field` makes replication **keyed**: when data changes, instances are reconciled
  by that field — only the changed rows rebuild.
- A **`DataSource`** is a remote resource whose lifecycle is reactive state: `url`,
  explicit **`.fetch()`** (nothing loads automatically), then `.idle / .loading / .loaded /
  .failed`, `.value`, `.error`, `.clear()`. Screens *derive* from it —
  `shown = { data.loaded }` — instead of being toggled imperatively. Even "navigation" can
  be a function of data: `.clear()` returns to the entry screen because both screens
  re-derive.
- An optional `schema = [ field: type, arr[]: [ … ] ]` (brackets, never braces — a shape
  *declares*, it doesn't run) does two things: the response is **validated at the
  boundary** on receipt (malformed data yields `.failed`/`.error`, never `undefined` three
  layers into a binding), and every `:path` is **checked statically** against the shape.
  With no schema, paths are dynamic: an unresolved path yields null and the bound
  attribute falls back to its default.
- Reads inside constraints: `data.read(["events"])` is a tracked read of a region (literal
  path). Mutation: `data.set("events.3.d", 14)` — writes wake exactly what derives from
  them, keyed replication rebuilds only the changed rows.
- **Two-way is opt-in with `<->`, for leaf editors only:** `TextInput [ text <-> :title ]`
  or `value <-> zip`. One-way `:path` everywhere else.
- A derived dataset recomputes from its inputs: `cal: Dataset [ contents = { app.buildModel() } ]`
  — build the model *as a derivation* and navigation reduces to setting state.

## 8. States and motion

A **state** is a named, reversible bundle of attribute overrides, applied while a condition
holds — the declarative replacement for mode-toggling:

```declare
App [ width = 360, height = 240, fill = #0B141B, textColor = whitesmoke,

    open: boolean = false,
    onMouseDown() { open = !open },

    card: View [ x = 28, y = 26, width = 300, height = 72, cornerRadius = 10, fill = midnightblue,
        Text [ x = 16, y = 16, fontWeight = bold, text = "Summary" ],
        big: State [ applied = { open }, height = 184, fill = steelblue,
            Text [ x = 16, y = 54, width = 268, textColor = gainsboro, wrap = true,
                text = "height, color, and this whole line swap in together" ] ],
        ],
    ]
```

While `open` holds, the overrides (and any children declared inside the state) apply; when
it lifts, everything reverts. The "set it on enter, forget to unset it on exit" bug is
unrepresentable — an attribute's value is a pure function of its base plus the active
states, so modes cannot leak. Overrides may target named descendants by dotted path
(`top.bg.opacity = 0.33`); when two active states override the same slot, the later
declaration wins. The block form `state focused when { this.focused } [ … ]` is equivalent.

**Motion is declarative.** A `Spring` drives one attribute toward a reactive target by
physics — declare where the thing belongs; the spring finds the path and settles. A change
of target mid-flight is just a new destination — interruption needs no code:

```declare
App [ width = 420, height = 120, fill = #0B141B,
    on: boolean = false,
    onClick() { on = !on },
    ball: View [ x = 20, y = 40, width = 40, height = 40, cornerRadius = 20, fill = #37E0C8,
        slide: Spring [ attribute = x, to = { on ? 340 : 20 }, stiffness = 170, damping = 22 ],
        ],
    ]
```

(`Animator [ attribute = x, to = 0, duration = 333 ]` is the time-based sibling for the
few cases that want a clock instead of physics; springs are the house idiom.)

Because layout, states, and springs sit on one reactive core, *arrangement* changes animate
too: spring a handful of geometry attributes and every constraint derived from them moves
in lock-step. This is the §1 claim in mechanism form — the calendar's month-to-week zoom is
four sprung scalars (`c0, r0, nc, nr`) that all cell geometry derives from.

## 9. Scope: four nouns

- **`this`** — the node the code is written on.
- **`parent`** — its parent in the tree.
- **`classroot`** — the instance of the class *in whose body the code is written*. Reach
  for it when `this` isn't the component root: a handler on a nested child that must act
  on its component says `classroot.select()`.
- **`app`** — the running App, from any depth: `app.width`, `app.dark`, `app.pointerX`.

`classroot` resolves by **where the code is lexically written**: in a class body it is that
class's instance (so `classroot.someAppAttr` inside a component is `undefined` — a `View`
has no App attributes; use `app`); in the App's own body it is the App (but write bare
`{ count }` there, not `{ classroot.count }`); at a use site it is the *enclosing* class
instance, skipping anonymous views up to the nearest real class. Inside a class body a
bare name (`label`, `count`) reads the enclosing class's attribute until a nearer name
shadows it. The four nouns are reserved — nothing else may take their names. The bare
capital `App` is the *class*; the instance is always `app`.

The most common scope mistake: on a deeply nested child, `this.foo` when the attribute
lives on the component — write `classroot.foo`.

Useful App-level reactive attributes: `app.width` / `app.height` (the app's own size —
responsive layout reads these), `app.dark` (OS dark mode), `app.pointerX` / `app.pointerY`
(the free pointer), `app.hovering` (false on touch devices). An app with a usable floor
declares it — `App [ minWidth = 600 ]` — and in a narrower host the app holds that width
while the stage pans natively; declare the floor rather than writing `Math.max` clamps
into size constraints.

## 10. Sizing and the host

A view's size on each axis is one of three things, chosen by what the source says:

- **unset** → auto-sizes to the bounding box of its visible children;
- **a constant** (`width = 300`) → fixed;
- **a constraint** → whatever the expression computes.

Two read-only intrinsics — `contentWidth` and `contentHeight` — expose what the content
*wants* to be, making any clamp plain arithmetic — a **view** has no
`minHeight`/`maxHeight`/`overflow` attributes:

```declare-fragment
height = { Math.min(contentHeight, 480) },    // grow to a cap, then stop
clip = true,                                  // hide whatever passes the cap
```

`contentWidth`/`contentHeight` (and `width`/`height`) are built-in; *read* them freely,
but do not re-declare them as your own attributes (`contentWidth: number = { … }` fails —
"already has an attribute"). If you need a derived measurement, give it a fresh name.

`scrolls = true` makes a view scroll its taller content natively. `clip = true` clips
children to the box (unset lets them overflow).

The one deliberate exception is the **App's size floor**: `App [ minWidth = 480,
minHeight = 420 ]` declares the size below which the app does not adapt — in a narrower
host the app holds the floor and the stage pans natively (the browser scrolls it). It is
an attribute rather than clamp math because it isn't a clamp: it's a *policy* the host
cooperates with, and one the toolchain can read statically. Use it when a design degrades
below some size instead of reflowing (§9's responsive notes).

**The App fills its host by default** — the root is sized by its host, not its content, so
`App [ … ]` with no size line fills the window and resizes with it; an explicit size makes
a fixed widget. The host is the window for a top-level app and the **container element**
for an embedded one — an app rendered inside another app's tree (an `HTML` island, a live
preview) detects that automatically and wires to its container instead of seizing the
window, so apps nest. `hostWidth`/`hostHeight` are read-only intrinsics for the rare app
whose box is a nontrivial function of the host (aspect-locked); ordinary responsive code
reads `app.width`.

`readonly` is the general modifier behind those intrinsics, available to any class:
`readonly percent: number = { value / max }` — consumers bind it; nobody may set it.

**`location`** is the app's slice of the URL — the fragment, one two-way reactive
string. The host seeds it before first settle (a deep link is an initial state),
mirrors app writes outward (one history entry per changed settle), and writes it back
on back/forward. The app owns the grammar: derive state from it
(`mode = { app.location.split("/")[0] }`), write it to navigate
(`app.location = "why"`); derived state is never assigned (the write would displace
the constraint and disconnect the back button). The declared initial is the default —
the URL stays clean at it. A trailing `@name` reveals a named view
(`View [ anchor = "intro" ]`) or a rendered heading (its slug) after the settle; the
reveal is held until the target exists, so a cold deep link that races a `DataSource`
still lands. **Crawlers**: extraction boots the app cold at each location the app
LINKS to (literal fragments and handler writes alike) and emits ONE document at the
program URL — the default's content plus a section per reachable location
(discoverable = linked). Crawlable data is build-time data: a relative `DataSource`
url reads from beside the program; an absolute url makes the crawl refuse loudly with
the fix named. `?extract` on any program URL returns the document a crawler gets.

## 11. Text, fonts, images, islands

- **`Text`** renders a run of text. Give wrapping text a `width` and `wrap = true`; pin
  labels with `wrap = false`. Styling rides the text quartet (`fontSize`, `fontWeight`,
  `fontFamily`, `textColor`), which inherits down the tree (§12a).
- **`Markdown`** is a native content type — `Markdown [ width = …, text = """ … """ ]` —
  compiled static when the text is literal, live when it's bound (a streaming
  `text = { … }` binding renders as it grows).
- **`TextInput`** is the editable field; its `text` is the source of truth. Editors bind
  two-way (`text <-> :title`); a *dynamic seed that stays editable* is `initial = { … }`
  (a one-time uncontrolled seed — binding `text = { … }` one-way makes the field
  read-only, since a constraint owns the slot). `placeholder`, `multiline = true`,
  `wrap`, and `spellcheck = false` (for code) cover the field variants.
- **`Image [ source = "…" ]`** — a bitmap; constrain `source` to compute it.
- **Fonts:** a top-level `font Sans [ family = "system-ui" ]` declares a family (web fonts
  declare `Face` children); `fontFamily = [Sans, "system-ui", "sans-serif"]` is a fallback
  list; `fontWeight`/`italic` pick the face at the use site.
- **`HTML [ … ]`** is the deliberate escape: an island of foreign browser content inside
  the tree, interactive by nature — and the host for **embedded child apps** (a live
  preview is a Declare app running inside a Declare app, no iframe; see §10).
- Drawing attributes on any view: `fill`, `stroke = { stroke(1, theme.line) }`,
  `shadow = { shadow(…) }`, `cornerRadius`, `opacity`, `scale` (with `pivotX`/`pivotY`),
  `visible`. A gradient fill for text is `textFill = { gradient("90deg", a, b) }`.

## 12. The standard library

Seven controls, auto-included by bare tag (no import), themed by the prevailing `theme`
(they look right with zero configuration — the house theme — and follow any theme you
provide):

| component | value | one line |
|---|---|---|
| `Button [ label, primary?, onClick() ]` | — | the action control; keyboard (Space/Enter) flashes and fires `onClick` |
| `Checkbox [ label, checked ]` | `checked: boolean` | box + mark + label |
| `Switch [ checked ]` | `checked: boolean` | sliding-thumb boolean (the thumb springs) |
| `RadioGroup [ value ]` + `Radio [ choice, label ]` | `value: string` on the GROUP | radios are the group's direct children |
| `Slider [ value, min, max, step ]` | `value: number` | drag or arrow keys; delivers continuously |
| `Field [ label, labelWidth ]` | — | a labeled row; nest your control as its child |
| `ProgressBar [ value, min, max ]` | — | display-only |

**The value pattern (one rule for all of them):** a control's value is a plain reactive
attribute. Three use forms, smallest first —

1. **Standalone** — the control owns its state; read it by name:
   `mute: Checkbox [ label = "Mute" ]` … `visible = { mute.checked }`.
2. **App-owned** — derive down, deliver up:
   `Checkbox [ checked = { app.muted }, input(v) { app.muted = v } ]`. The `input` method
   is the edit-delivery channel; its default writes the control itself, your override
   redirects it. (Do NOT bind a control's value one-way without supplying `input` — the
   control's edits would fight your constraint.)
3. **Data-owned** — `text <-> :path`, editors only (§7).

A complete bound form:

```declare
App [ width = 360, height = 200, fill = { theme.bg },
    volume: number = 25,
    muted:  boolean = false,

    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Checkbox [ label = "Mute", checked = { app.muted }, input(v) { app.muted = v } ],
        Slider [ value = { app.volume }, input(v) { app.volume = v }, disabled = { app.muted } ],
        ProgressBar [ value = { app.muted ? 0 : app.volume } ],
        Button [ label = "Reset", primary = true, onClick() { app.volume = 25; app.muted = false } ],
        ],
    ]
```

Also provided, undeclared: keyboard focus travels the controls (Tab / Shift-Tab;
Space/Enter activates; a click claims focus), and a **traveling focus indicator** is
injected automatically into any app that uses these controls — disable it with
`theme = { { ...app.theme, focusRing: false } }`, or declare your own `FocusRing [ ]` to
customize.

### 12a. Theming: prevailing slots

Styling inherits through **prevailing** slots: set one high in the tree and every
descendant follows it until one overrides. The text quartet (`fontFamily`, `fontSize`,
`fontWeight`, `textColor`) works this way, and so does **`theme`** — a token record every
color in an app should name once:

```declare-fragment
theme = { { bg: 0x0D151E, text: 0xE7EEF2, accent: 0x4C8DFF, line: 0x22323E } },
fill  = { theme.bg },                                  // anywhere below
theme = { { ...app.theme, accent: 0xE05252 } },        // partial override: plain TS spread
theme = { app.dark ? app.darkTheme() : app.lightTheme() },   // light/dark: swap the record
```

## 13. What does NOT exist (do not invent it)

Your training will reach for these. None of them exist in Declare:

- **No HTML, no CSS, no DOM.** No `div`, `className`, `style`, stylesheet files, selectors,
  cascade, or media queries. Styling is attributes; responsiveness is constraints on
  `app.width`; theming is a reactive record (§12a) that everything derives from.
- **No z-index** — stacking is declaration order, later on top. **No flexbox/grid** —
  `layout:` attributes. **No CSS units** — bare numbers are pixels, `%` exists only as a
  bare literal.
- **No hooks.** No `useState`/`useEffect`/`useMemo`, no dependency arrays, no keys on
  lists (replication `key = :field` is data identity, not a render hint), no
  reconciliation, no "re-render".
- **No `setState` / `setAttribute` / `getAttribute`** — `=` is the setter, a bare read is
  the getter, always.
- **No JSX expressions in the tree.** No `.map()` to produce children, no conditional `&&`
  rendering. A collection of children comes from **replication** over data; conditional
  presence is `visible = { cond }` or a **state**.
- **No imports for components.** Library components and your own classes are available by
  name (bare-tag auto-include). No module ceremony. (`import` for TS libraries inside
  `script { }` is a separate, still-open design area — don't use it.)
- **No `addEventListener`**, no event bubbling. Handlers fire on the node that declares
  them; keyboard arrives on the focused view as `onKeyDown(e)`/`onKeyUp(e)` — `e` is a
  KeyEvent (`e.key`, `e.code`, modifier flags), never a numeric code.
- **No `event` keyword.** An event is just a function-typed member that gets called; the
  `on` prefix is a naming convention. Subscriptions (`member(e) <- Source { … }`) exist for
  the runtime *services* (`Keys`, `Focus`) — you cannot subscribe to another view's
  events; a child delivers to its owner by *calling a method*.
- **No `async` UI wiring for data.** `DataSource` + derived visibility replaces
  fetch-then-setState. `.fetch()` is explicit.
- **No widget zoo — but there IS a small standard library** (§12): `Button`, `Checkbox`,
  `Switch`, `RadioGroup`/`Radio`, `Slider`, `Field`, `ProgressBar` — auto-included by bare
  tag, no import. Use them for the ordinary cases; there is no `Card`, `Modal`, `Select`,
  or `Tabs` yet — compose those from `View` + `Text` + `TextInput` + `Image`, or define a
  class.
- **`$`-prefixed names are compiler-internal.** Never write one.

## 14. The mistakes actually observed

Empirically maintained — each entry earned its place by a model (or a person) actually
making it:

1. **`#` colors inside `{ }`.** `#4C8DFF` is bare-slot vocabulary. Inside braces write
   `0x4C8DFF`. (`fill = #4C8DFF` ✓ · `fill = { hovered ? 0x63A0FF : 0x4C8DFF }` ✓ ·
   `fill = { hovered ? #63A0FF : … }` ✗)
2. **`this` where `classroot` is meant.** In a handler on a nested child, `this` is that
   child. The component's state lives on `classroot`.
3. **Forgetting the trailing comma** after the last member, or dropping the comma after a
   child's closing `],`.
4. **Percent inside braces.** `width = 100%` ✓ · `width = { 100% }` ✗ — compute:
   `width = { parent.width }`.
5. **Imperative child-building.** Generating subtrees in `{ }` breaks the
   statically-apparent tree. Shape once + replicate over data.
6. **Object literals in constraints are written bare.** A constraint body is always an
   expression, so `theme = { { text: 0xE7EEF2, accent: 0x4C8DFF } }` is correct as-is — no
   `({ … })` wrapper needed. Partial override is plain TS spread:
   `theme = { { ...app.theme, accent: 0xE05252 } }`.
7. **Expecting auto-fetch.** A `DataSource` does nothing until `.fetch()` — call it in
   `onInit()` or a handler.
8. **Text that won't wrap / wraps unexpectedly.** Give wrapping text a `width` and
   `wrap = true`; pin labels with `wrap = false`.
9. **Loose JSON in a `Dataset` body.** The `Dataset { … }` body is strict JSON — quoted
   keys, no trailing commas. (TypeScript-style object literals belong inside `{ }`
   constraints, not dataset bodies.)
10. **Naming a replicated child.** A node with `datapath = :arr[]` becomes *many*
    instances — a name can only refer to one, so replicated children are anonymous. Reach
    them through their data, not a reference.
11. **CSS border / shadow attributes.** `borderWidth`, `borderColor`, `boxShadow`,
    `outline` do not exist. A border is a **stroke**: `stroke = { stroke(1, theme.line) }`
    (width, color — a `{ }` value, so the color is `0x…` or a theme role, never `#…`). A
    shadow is `shadow = { shadow(…) }`. Fill is `fill`, corner rounding is `cornerRadius`.
12. **Type syntax inside `{ }`.** `x as string` does not parse — a body is TS expressions,
    not TS type operators (§2). Coerce structurally: `String(x)`, `x || ""`.
13. **A one-way binding on an editable slot.** `TextInput [ text = { source } ]` makes the
    field read-only (the constraint owns the slot). A dynamic seed that stays editable is
    `initial = { source }`; app-owned control state is `checked = { … }` **plus**
    `input(v) { … }` (§12).

## 15. Style canon (the formatter's rules, in brief)

- Attributes first on a component's header line; declarations, methods, handlers, states,
  and children on their own lines below.
- **A leaf goes on one line**: `day: Text [ x = 42, fontSize = 11, text = :day ],` — most
  of a UI is leaves.
- Closing brackets hang at the content indent, carrying the comma: `],`.
- Four-space indent; no column alignment across lines.
- camelCase names (`fontSize`, `onClick`). Comments are `// ` at the code's indent;
  `/* … */` blocks are literate Markdown — section prose, rendered by the reader view.
- One way to write each thing — when this file and your instinct disagree, this file wins.
  The formatter (`tools/format.mjs`) enforces the canon; let it.

## 16. The loop: how to work

1. **Write** `.declare` source — the tree is the app. Apps are typically one file; a file
   can pull in others with `include [ "path.declare" ]` (top-level declarations merge,
   include-once), and library components need no include at all — a bare tag auto-includes
   them.
2. **Run it at its URL.** The program URL is the app's address: with the dev server up
   (`npm start` → `http://127.0.0.1:8200/`), navigating to `…/<path>/<name>.declare`
   compiles on request and renders — edit on disk, reload, see it. The same address takes
   modifiers and views: `?render=canvas` (own-pixels renderer — same source, same pixels),
   `?view=edit` (source editor + live result + errors, in the browser), `?view=reader`
   (annotated, highlighted source), `?extract` (the static-extraction document crawlers
   see). Typechecking of every `{ }` body is part of every compile — there is no flag.
3. **Read the errors.** Every compile error carries a code (`DECLARE####`), a line/column, and
   — deliberately — *the fix*: diagnostics are written for a model in a loop, so the
   message states the rule you broke and the one rewrite that resolves it. Trust the
   message; apply the named fix; recompile. All independent errors in a phase are reported
   together.
4. **Verify** — `node tools/verify.mjs <file>` climbs the ladder: compiles, boots
   headlessly, and runs behavioral assertions where the program declares them. Use it as
   the oracle before you trust a change.
5. **Ship** — `node tools/declarec.mjs <file>` emits a self-contained production bundle
   (app + runtime, ~50 KB gzipped); the same artifact is one request away at
   `<program-url>?build`. `--crawler` bakes the crawler document into the shipped page.

## 17. Going deeper

| you want | read |
|---|---|
| the guided tour, concept by concept | [`docs/guide/`](guide/00-overview.md) |
| every attribute, method, event, diagnostic | [`docs/reference/`](reference/) — generated from the source |
| install / dev server / build, step by step | [`docs/operational/`](operational/) |
| the idiom at real scale, annotated | `apps/calendar/calendar.declare` · `apps/homepage/homepage.declare` · `apps/controls/` |
| why the language is shaped this way; what's deliberately unsettled | [`docs/system-design/`](system-design/) — the design record (background, not truth) |

*This file is compiled documentation in spirit: its examples are verified against the
toolchain on every revision. If something here contradicts the compiler, the compiler is
right and this file has a bug — report it.*
