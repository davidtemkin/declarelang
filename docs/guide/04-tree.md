<!-- nav: The tree -->
<!-- part: Building -->

# The tree is the app

Part One gave you the model: two brackets, and values that stay true. This part is the
craft of real interfaces, and it starts where all Declare work starts — with the fact
that most of what you write is not clever machinery but *composition*: taking
components, nesting and configuring them, and occasionally minting your own.

> **The brackets are the tree.** A view's children sit inside its `[ ]`, and the
> nesting on the page is the nesting on screen.

## Components are classes

You instantiate a component by naming its type with a `[ ]` body. You define one with
`class Name extends Base [ … ]` — and defining your own is meant to be everyday work,
not architecture:

```declare
class StatRow extends View [ width = 250, height = 22,
    label: string = "",
    value: string = "",
    layout: SimpleLayout [ axis = x, spacing = 8 ],
    labelText: Text [ width = 90, text = { classroot.label } ],
    valueText: Text [ width = 152, text = { classroot.value } ],
    ]


App [ fill = white, textColor = black,
    col: View [ x = 24, y = 24,
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        StatRow [ label = "Humidity", value = "62%" ],
        StatRow [ label = "Wind", value = "8 mph" ],
        ],
    ]
```

`StatRow` declares two attributes; its children bind to them; and now `StatRow [ … ]`
is a leaf you can drop anywhere a `View` fits — your class *is* a `View` plus the
members you added. Add a third `StatRow` line in the running example and watch the
column grow. (`classroot` is how a child's binding reaches the enclosing class
instance — its precise rule is just below; for now, read it as "this `StatRow`.")

> **From React:** a class here is the component *and* its props *and* its state in
> one declaration — `label: string = ""` is settable from outside like a prop and
> reactive inside like state, with no constructor, no destructuring, and no
> re-render boundary to think about. Composition is nesting; there is no `children`
> prop, because children are just members.

## One-off structure needs no class

The part that keeps Declare code flat: **any instance can declare its own members
inline** — attributes, methods, handlers — exactly as a class body does. The compiler
synthesizes an anonymous subclass, so a one-off gets real encapsulation with zero
scaffolding:

```declare
App [ width = 200, height = 90, fill = white, textColor = black,
    tally: View [ x = 20, y = 20,
        n: number = 0,                         // its own state
        onClick() { n = n + 1 },               // its own handler
        Text [ text = { `taps: ${n}` } ],
        ],
    ]
```

`App` itself is exactly this — a one-off carrying its own declarations. The promotion
rule is clean: **name a `class` only when you instantiate it more than once, or when
you need to name its type** (to extend it, or to accept one as a parameter). The
moment the type needs a name, you've outgrown the one-off — and not before.

## Stacking is declaration order

Siblings that overlap paint in written order — **later members draw on top**. There is
no z-index; you restack by reordering, so reading order *is* paint order:

```declare
App [ width = 200, height = 120, fill = white,
    View [ x = 20, y = 20, width = 80, height = 60, cornerRadius = 8, fill = royalblue ],
    View [ x = 50, y = 40, width = 80, height = 60, cornerRadius = 8, fill = tomato ],
    ]
```

Swap the two lines and the overlap flips. (This is also why an app's floating chrome —
toolbars, overlays — is simply declared last.)

## Where does a piece of code live?

One small decision tree, which the rest of the language keeps reinforcing:

- structure that **repeats** → a **class**;
- a single **computed attribute** → a small **function bound inline**, *not* a wrapper
  class — `Image [ source = { weatherIcon(:code) } ]`, never `class WeatherIcon`;
- behavior operating on a component's own state → a **method**;
- **stateless** logic shared across the tree → a free function in a top-level
  `script { … }` block, which is where plain-TypeScript models and helpers live.

## Reach: the four nouns

Composition immediately raises the question every nested handler and binding must
answer: *which node am I talking about?* Four reserved words cover it —

- **`this`** — the node the code is written on;
- **`parent`** — that node's parent in the tree;
- **`classroot`** — the instance of the class *in whose body the code is written*;
- **`app`** — the running app, reachable from any depth.

The first two are what you expect. The law worth memorizing is the other two:
`classroot` resolves by **where the code is written** — lexically, not by runtime
ancestry. In a class body, it is that class's instance, however deeply the code nests:

```declare-fragment
class WeatherTab extends View [
    selected: boolean = false,
    label: string = "",
    header: View [
        onClick() { classroot.select() },                 // `this` is header; classroot is the WeatherTab
        caption: Text [ text = { classroot.label } ],
        bg: View [ opacity = { classroot.selected ? 0.33 : 1 } ],
        ],
    ]
```

The mistake this prevents is the most common one newcomers make: on a nested child,
`this.selected` when the state lives on the component. And the *second* most common
mistake is its mirror — reaching for an app-level value through `classroot` from
inside a component. Try it: give the running `StatRow` example above a binding like
`text = { classroot.dark ? "night" : "day" }` and the compiler stops you —

```
'dark' is not a member of StatRow — declare it (dark: <type> = …) or fix the name [DECLARE6001]
```

— because inside `StatRow`, `classroot` *is* the StatRow, which has no `dark`. The fix
is `app.dark`: **`app` always means the running app**, from anywhere. Use it for
app-wide state — `app.width` for responsive reads, `app.dark` for the system scheme,
your own `app.muted` — even in code that happens to sit in the App's own body, where
bare names also reach the App's attributes directly. (Inside any class body, a bare
name — `label`, `selected` — reads the enclosing class's attribute until something
nearer shadows it; `classroot.label` is the explicit spelling.) One capitalization
trap: bare `App` is the class; the instance is always `app`.

The quick test, worth keeping: if the value belongs to *the reusable component you
are writing*, it's `classroot`; if it belongs to *the whole running page*, it's `app`.

## Growing past one file

An app is one file until it isn't. `include [ "components.declare" ]` merges another
file's declarations into the program — a parse-time source merge, deduped by path,
order-inert. An included file is a library of definitions (it declares no `App` of
its own). And the standard library needs no include at all: a bare `Button [ … ]` tag
auto-includes it.

---

**What you can now say:** you can shape a program — when structure stays inline, when
it becomes a class, what draws over what, and how any line of code names the node it
means. Next: where everything *goes*.

[Next: **Space is arithmetic** →](declare-docs:guide:space)
