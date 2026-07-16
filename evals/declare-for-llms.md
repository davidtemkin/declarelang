# Declare — the whole language, one file, for your model

*You are reading the authoritative brief for **Declare**, a domain-specific language for user interfaces. Declare is **not in your training data**. This file overrides your priors: where Declare resembles React, CSS, or HTML, do not assume the resemblance extends past what is written here. When you are unsure, consult this file or the linked spec — do not extrapolate from other languages. Every complete program below compiles under the current toolchain.*

*Language status: pre-1.0, under active design (2026-07). The spec this file summarizes: [`docs/system-design/declare-language.md`](../design/declare-language.md). The guide: [`docs/guide/`](guide/00-overview.md).*

---

## 1. What Declare is

Declare is to web applications what HTML is to web documents: you compose a tree of components, set their attributes, bind them to data, and handle events. The declarative layer is small; **all real logic is ordinary TypeScript**. One source tree renders to the DOM or to its own pixels on a canvas — you never touch either. The compiler runs in the browser as well as in Node.

The defining idea: **a binding is a standing relationship the runtime keeps true**, not a function you remember to re-run. Read a reactive value inside a binding and you are subscribed; assign to one and everything bound to it updates. There is no re-render, no diffing, no dependency array, no hook.

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

Click the view and the text updates; resize and it re-centers. No update logic was written. (The hand-built button above shows the composition model; a themed `Button` also ships in the small standard library — §11a.)

## 2. The two delimiters

The entire mental model:

- **`[ … ]` holds a component's members** — attributes, children, declarations. The bracket nesting **is** the view tree.
- **`{ … }` is TypeScript** — a value expression, a method body, a `script` block. From `{` to the matching `}` you are writing ordinary TypeScript.

One rule for values:

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal, set once | `width = 100%`, `fill = navy`, `count = 12` |
| a **`{ … }`** value | a live TypeScript expression (a **constraint**) | `width = { parent.width - 10 }` |
| a **`:`-prefixed** path | a read from bound data (a **datapath**) | `text = :title` |

Bare slots have their own literal vocabulary the compiler owns: `100%` is a Length, `#1E3A49` is a Color, `navy` is a named color. **Inside `{ }` that vocabulary stops** — you are in plain TypeScript, so colors are written `0x1E3A49`, percents don't exist (compute from `parent.width`), and an identifier means exactly what TypeScript says it means. The compiler never silently reinterprets an identifier inside braces.

## 3. Members, by shape

Everything inside `[ ]` is a member. **The comma is a terminator, not a separator** (Go's rule): every own-line member ends with one — including the last before a hanging `]` — so you never special-case the final line. The one exception: no comma before an *inline* `]` (`Text [ x = 42, text = :day ]`). The shapes:

```declare-fragment
width = 100%,                          // SET an attribute that exists (bare literal)
x     = { parent.width - 40 },         // SET, live (a constraint)
text  = :title,                        // SET from data

label:    string  = "",                // DECLARE a new typed reactive attribute
selected: boolean = false,
count:    number,                      // no default — undefined until set

select() { classroot.pick(this) },     // a METHOD — untyped params, no return annotation

onClick()      { count = count + 1 }, // a HANDLER: `on` + this node's own event
onMouseMove(e) { x = e.x },            // pointer handlers get an event with .x/.y

onKeyUp(e) <- Keys {                   // a SUBSCRIPTION to an external source (`<-`)
    if (e.key == "ArrowDown") next()   //   e is the KeyEvent; auto-unsubscribed at teardown
    },

bg: View [ fill = #101E28 ],           // a CHILD instance, named `bg` (reachable as bg / this.bg)
Text [ text = "OK" ],                  // an anonymous child
```

The difference between `name = value` (sets an existing attribute) and `name: Type = value` (declares a new one) matters — declaring introduces reactive state.

## 4. Classes and composition

A component is a class. Instantiate by naming a type with a `[ ]` body; define with `class Name extends Base [ … ]`:

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

- **The one root is `App`** — one per program; its body is the whole visible tree. If `width`/`height` are unset, the App fills its host (the page).
- **Any instance can declare its own members inline** (state, methods, handlers) without defining a class — the compiler synthesizes an anonymous subclass. Extract a named `class` only for genuine reuse.
- **A single computed attribute wants a function, not a wrapper class**: `Image [ source = { iconUrl(:code) } ]` with a plain function in a `script { }` block, not `class WeatherIcon extends Image`.
- Free TypeScript (models, helpers) lives in top-level `script { … }` blocks.

**Layout is an attribute, not a container type.** Every view defaults to absolute positioning by `x`/`y`; set a `layout:` member to arrange children — and because it's a reactive slot, it can be swapped or animated:

```declare-fragment
layout: SimpleLayout   [ axis = y, spacing = 10 ],       // stack (x or y)
layout: WrappingLayout [ spacing = 24, lineSpacing = 24 ],
```

**Stacking order is declaration order** — later siblings render on top. There is no z-index.

**Sizing:** unset means automatic (a view sizes to its content — read `contentWidth`/`contentHeight`); a constant is fixed; a constraint is live. `scrolls = true` makes a view scroll its taller content natively.

## 5. Reactivity: constraints and the `=` setter

A `{ }` in a value slot is a **constraint** — re-evaluated when, and only when, its inputs change. Dependencies are extracted **statically by the compiler** (it reads your expression, and reads *through* the methods it calls) — never tracked at runtime, never declared by hand.

```declare-fragment
x     = { (parent.width - width) / 2 },              // re-centers on resize
fill  = { selected ? 0x2E6BE6 : 0x101E28 },          // recolors on select
text  = { data.failed ? data.error : "Loading…" },   // reacts to a data resource
```

**Assignment is the setter.** Inside any `{ }` body, `count = count + 1` updates `count` *and* notifies everything bound to it. There is no `setState`, no `setAttribute`, and no bypass that skips the cascade. Reads are symmetric: a bare `.x` is the tracked read.

**The one rule constraints must obey:** a constraint reads *specific, named* things, and the compiler must be able to name every one. If it can't — you indexed a slot by a runtime value (`this[k]`), computed a data path at runtime, or aggregated over the live view tree — that is a compile error whose message names the rewrite (bound the key's type, use a literal path, or read from a Dataset). Genuinely dynamic reactivity belongs to the framework's own primitives (layout, replication) or to imperative handler code — which is unrestricted TypeScript and always available.

## 6. Data

A **cursor** (`datapath`) selects a place in the data; descendants read fields relative to it with `:path`; a path that matches many records **replicates** its node, one instance per record.

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

- `key = :field` makes replication **keyed**: when data changes, instances are reconciled by that field — only the changed rows rebuild.
- A **`DataSource`** is a remote resource whose lifecycle is reactive state: `url`, explicit **`.fetch()`** (nothing loads automatically), then `.idle / .loading / .loaded / .failed`, `.value`, `.error`, `.clear()`. Screens *derive* from it — `shown = { data.loaded }` — instead of being toggled imperatively.
- An optional `schema = [ field: type, arr[]: [ … ] ]` (brackets, never braces — a shape declares, it doesn't run) makes the compiler validate responses at the boundary and check every `:path` statically.
- Reads inside constraints: `data.read(["events"])` is a tracked read of a region (literal path). Mutation: `data.set("events.3.d", 14)` — writes wake exactly what derives from them.
- **Structural edits** (from handlers) are the four verbs: `data.set(path, v)` · `data.insert(path, index, v)` · `data.removeAt(path, index)` · `data.move(path, from, to)`. Growing a list — the pattern verbatim: `addTask(t) { tasks.insert(["rows"], tasks.read(["rows"]).length, ({ label: t, done: false })) }`. Toggling a row's field from its replicated view: `tasks.set("rows." + i + ".done", !done)`. Replication follows the edit — no list rebuilding, no re-render calls.
- **Two-way** is opt-in with `<->`, for leaf inputs: `TextInput [ text <-> :title ]` or `value <-> zip`. One-way `:path` everywhere else.
- A derived dataset recomputes from its inputs: `cal: Dataset [ contents = { app.buildModel() } ]`.

## 7. States and motion

A **state** is a named, reversible bundle of attribute overrides, applied while a condition holds — the declarative replacement for mode-toggling:

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

While `open` holds, the overrides (and any children declared inside the state) apply; when it lifts, everything reverts. The "set it on enter, forget to unset it on exit" bug is unrepresentable. Overrides may target named descendants by dotted path (`top.bg.opacity = 0.33`). The block form `state focused when { this.focused } [ … ]` is equivalent.

**Motion is declarative.** A `Spring` drives one attribute toward a reactive target by physics — declare where the thing belongs; the spring finds the path and settles:

```declare
App [ width = 420, height = 120, fill = #0B141B,
    on: boolean = false,
    onClick() { on = !on },
    ball: View [ x = 20, y = 40, width = 40, height = 40, cornerRadius = 20, fill = #37E0C8,
        slide: Spring [ attribute = x, to = { on ? 340 : 20 }, stiffness = 170, damping = 22 ],
        ],
    ]
```

Because layout, states, and springs sit on one reactive core, *arrangement* changes animate too: spring a handful of geometry attributes and every constraint derived from them moves in lock-step — this is how a calendar's month morphs into its week (see `apps/calendar/calendar.declare`, ~500 lines, the idiom at full scale).

## 8. Scope: four nouns

- **`this`** — the node the code is written on.
- **`parent`** — its parent in the tree.
- **`classroot`** — the instance of the class *in whose body the code is written*. Reach for it when `this` isn't the component root: a handler on a nested child that must act on its component says `classroot.select()`.
- **`app`** — the running App, from any depth: `app.width`, `app.dark`, `app.pointerX`.

Inside a class body, a bare name (`label`, `count`) reads the enclosing class's attribute. The four nouns are reserved — nothing else may take their names. The most common scope mistake: on a deeply nested child, `this.foo` when the attribute lives on the component — write `classroot.foo`.

Useful App-level reactive attributes: `app.width` / `app.height` (host size — responsive layout reads these), `app.dark` (OS dark mode), `app.pointerX` / `app.pointerY`, `app.hovering` (false on touch devices). An app with a usable floor declares it — `App [ minWidth = 600 ]` — and in a narrower host the app holds that width while the stage pans natively; declare the floor rather than writing `Math.max` clamps into size constraints.

**Addressable state.** `app.location` is the URL fragment as one two-way reactive
string: the host seeds it before first settle (deep links are initial states), each
changed settle pushes one history entry, back/forward writes it back. Derive state
from it, write it to navigate; never assign the derived state (displacement). The
declared initial (`App [ location = "home" ]`) is the default — clean URL at it.
`@name` after the state reveals a `View [ anchor = "…" ]` or a heading slug.
Crawl-extraction follows the app's own location links and refuses network
DataSources loudly — indexable data ships beside the app.

## 9. What does NOT exist (do not invent it)

Your training will reach for these. None of them exist in Declare:

- **No HTML, no CSS, no DOM.** No `div`, `className`, `style`, stylesheet files, selectors, cascade, or media queries. Styling is attributes; responsiveness is constraints on `app.width`; theming is a reactive record (`theme = { … }`) that everything derives from.
- **No z-index** — stacking is declaration order, later on top. **No flexbox/grid** — `layout:` attributes. **No CSS units** — bare numbers are pixels, `%` exists only as a bare literal.
- **No hooks.** No `useState`/`useEffect`/`useMemo`, no dependency arrays, no keys on lists (replication `key = :field` is data identity, not a render hint), no reconciliation, no "re-render".
- **No `setState` / `setAttribute` / `getAttribute`** — `=` is the setter, a bare read is the getter, always.
- **No JSX expressions in the tree.** No `.map()` to produce children, no conditional `&&` rendering. A collection of children comes from **replication** over data; conditional presence is `visible = { cond }` or a **state**.
- **No imports for components.** Library components and your own classes are available by name (bare-tag auto-include). No module ceremony. (`import` for TS libraries inside `script { }` is a separate, still-open design area — don't use it.)
- **No `addEventListener`**, no event bubbling. Handlers fire on the node that declares them; keyboard arrives on the focused view as `onKeyDown(e)`/`onKeyUp(e)` — `e` is a KeyEvent (`e.key`, `e.code`, modifier flags), never a numeric code.
- **No `event` keyword.** An event is just a function-typed member that gets called; the `on` prefix is a naming convention. Subscriptions (`member(e) <- Source { … }`) exist for the runtime *services* only — today that means `Keys` (`onKeyDown`/`onKeyUp`) — you cannot subscribe to another view's events; a child delivers to its owner by *calling a method*.
- **No `async` UI wiring for data.** `DataSource` + derived visibility replaces fetch-then-setState. `.fetch()` is explicit.
- **No widget zoo — but there IS a small standard library** (§11a): `Button`, `Checkbox`, `Switch`, `RadioGroup`/`Radio`, `Slider`, `Field`, `ProgressBar` — auto-included by bare tag, no import. Use them for the ordinary cases; there is no `Card`, `Modal`, `Select`, or `Tabs` yet — compose those from `View` + `Text` + `TextInput` + `Image`, or define a class.
- **`$`-prefixed names are compiler-internal.** Never write one.

## 10. The mistakes models actually make

1. **`#` colors inside `{ }`.** `#4C8DFF` is bare-slot vocabulary. Inside braces write `0x4C8DFF`. (`fill = #4C8DFF` ✓ · `fill = { hovered ? 0x63A0FF : 0x4C8DFF }` ✓ · `fill = { hovered ? #63A0FF : … }` ✗)
2. **`this` where `classroot` is meant.** In a handler on a nested child, `this` is that child. The component's state lives on `classroot`.
3. **Forgetting the trailing comma** after the last member, or dropping the comma after a child's closing `],`.
4. **Percent inside braces.** `width = 100%` ✓ · `width = { 100% }` ✗ — compute: `width = { parent.width }`.
5. **Imperative child-building.** Generating subtrees in `{ }` breaks the statically-apparent tree. Shape once + replicate over data.
6. **Object literals in constraints are written bare.** A constraint body is always an expression, so `theme = { { text: 0xE7EEF2, accent: 0x4C8DFF } }` is correct as-is — no `({ … })` wrapper needed (the arrow-function parenthesizing habit from JS solves an ambiguity Declare's value slots don't have; you may see the wrapped form in older sources — it's legal, just not the house form). Partial override is plain TS spread: `theme = { { ...app.theme, accent: 0xE05252 } }`.
7. **Expecting auto-fetch.** A `DataSource` does nothing until `.fetch()` — call it in `onInit()` or a handler.
8. **Text that won't wrap / wraps unexpectedly.** Give wrapping text a `width` and `wrap = true`; pin labels with `wrap = false`.
9. **Loose JSON in a `Dataset` body.** The `Dataset { … }` body is strict JSON — quoted keys, no trailing commas. (TypeScript-style object literals belong inside `{ }` constraints, not dataset bodies.)
10. **Naming a replicated child.** A node with `datapath = :arr[]` becomes *many* instances — a name can only refer to one, so replicated children are anonymous. Reach them through their data, not a reference.
11. **CSS border / shadow attributes.** `borderWidth`, `borderColor`, `boxShadow`, `outline` do not exist. A border is a **stroke**: `stroke = { stroke(1, theme.line) }` (width, color — a `{ }` value, so the color is `0x…` or a theme role, never `#…`). A shadow is `shadow = { shadow(…) }`. Fill is `fill`, corner rounding is `cornerRadius`.

## 11. Style canon (the formatter's rules, in brief)

- Attributes first on a component's header line; declarations, methods, handlers, states, and children on their own lines below.
- **A leaf goes on one line**: `day: Text [ x = 42, fontSize = 11, text = :day ],` — most of a UI is leaves.
- Closing brackets hang at the content indent, carrying the comma: `],`.
- camelCase names (`fontSize`, `onClick`). Comments are `// ` at the code's indent; `/* … */` for section prose.
- One way to write each thing — when this file and your instinct disagree, this file wins.

## 11a. The standard library (the catalog)

Seven controls, auto-included by bare tag (no import), themed by the prevailing `theme` (they look right with zero configuration — the house theme — and follow any theme you provide):

| component | value | one line |
|---|---|---|
| `Button [ label, primary?, onClick() ]` | — | the action control; keyboard (Space/Enter) flashes and fires `onClick` |
| `Checkbox [ label, checked ]` | `checked: boolean` | box + mark + label |
| `Switch [ checked ]` | `checked: boolean` | sliding-thumb boolean (the thumb springs) |
| `RadioGroup [ value ]` + `Radio [ choice, label ]` | `value: string` on the GROUP | radios are the group's direct children |
| `Slider [ value, min, max, step ]` | `value: number` | drag or arrow keys; delivers continuously |
| `Field [ label, labelWidth ]` | — | a labeled row; nest your control as its child |
| `ProgressBar [ value, min, max ]` | — | display-only |

**The value pattern (one rule for all of them):** a control's value is a plain reactive attribute. Three use forms, smallest first —

1. **Standalone** — the control owns its state; read it by name: `mute: Checkbox [ label = "Mute" ]` … `visible = { mute.checked }`.
2. **App-owned** — derive down, deliver up: `Checkbox [ checked = { app.muted }, input(v) { app.muted = v } ]`. The `input` method is the edit-delivery channel; its default writes the control itself, your override redirects it. (Do NOT bind a control's value one-way without supplying `input` — the control's edits would fight your constraint.)
3. **Data-owned** — `text <-> :path`, editors only (see §6).

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

Also provided, undeclared: keyboard focus travels the controls (Tab / Shift-Tab; Space/Enter activates; a click claims focus), and a **traveling focus indicator** is injected automatically into any app that uses these controls — disable it with `theme = { { ...app.theme, focusRing: false } }`, or declare your own `FocusRing [ ]` to customize.

## 12. The loop: how to work

1. **Write** `.declare` source — the tree is the app. Apps are typically one file; a file can pull in others with `include [ "path.declare" ]` (top-level declarations merge, include-once), and library components need no include at all — a bare tag auto-includes them.
2. **Compile** — dev server: `npm start`, then `http://127.0.0.1:8200/apps/<name>/`; or POST the source to `/compile`; or in the browser (the playground on the homepage). Add `?typecheck=1` to also run TypeScript over every `{ }` body. Add `?backend=canvas` to render own-pixels instead of DOM — same source, same pixels.
3. **Read the errors.** Every compile error carries a code (`DECLARE####`), a line/column, and — deliberately — *the fix*: Declare's diagnostics are written for a model in a loop, so the message states the rule you broke and the one rewrite that resolves it. Trust the message; apply the named fix; recompile. All independent errors in a phase are reported together.
4. **Ship** — `node tools/declarec.mjs <file>` emits a self-contained production bundle (app + runtime, ~50 KB gzipped).

## 13. Going deeper

| you want | read |
|---|---|
| the full language spec (~680 lines, authoritative) | `docs/system-design/declare-language.md` |
| the guided tour, concept by concept | `docs/guide/00-overview.md` → `10-tutorial.md` → … |
| the idiom at real scale, annotated | `apps/calendar/calendar.declare` · `apps/homepage/homepage.declare` |
| what's deliberately not settled yet | `docs/system-design/declare-language.md` §13 |
| the reactivity model's rules | `docs/system-design/constraints.md` |

*This file is generated-adjacent documentation: its examples are compiled against the toolchain on every revision. If something here contradicts the compiler, the compiler is right and this file has a bug — report it.*
