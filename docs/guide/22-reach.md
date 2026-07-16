# Reach: `this`, `parent`, `classroot`, `app`

Your constraints in the last chapter kept reaching for `classroot` and `app`. There are
four such words, because the node a piece of code is *attached to* is not always the
component it *belongs to*, nor the running app it lives in. Getting them right is what
keeps handlers and constraints pointed at the node you actually mean — and `this`-vs-
`classroot` is the single most common mistake newcomers make, which is why it comes this
early.

- **`this`** — the node the code is on.
- **`parent`** — that node's parent in the view tree.
- **`classroot`** — the instance of the class *in whose body the code is written*.
- **`app`** — the running app at the top of the tree.

The first two are what you expect. The law is the other two:

> **`classroot` is where the code is written; `app` is the root, reachable from anywhere.**

## `classroot` — the component this code is part of

You reach for `classroot` when `this` is a nested child but the code needs to act on the
*component* it is part of:

```declare-fragment
class WeatherTab extends View [
    selected: boolean = false,
    label: string = "",
    header: View [
        onClick() { classroot.select() },                 // this is `header`; classroot is the WeatherTab
        caption: Text [ text = { classroot.label } ],     // reads the WeatherTab's own label
        bg: View [ opacity = { classroot.selected ? 0.33 : 1 } ],
        ],
    ]
```

Inside `header`'s `onClick`, `this` is `header` — but `classroot` is the `WeatherTab`. The
child bindings read `classroot.label` and `classroot.selected` to reach the component's own
attributes, no matter how deeply they are nested.

### It resolves by *where the code is written*

This is the rule to internalize, because it is not "the nearest ancestor at runtime" — it
is **lexical**, decided by the member's origin:

- **In a class body** (a method, handler, or `{ }` default written inside `class C [ … ]`)
  → `classroot` is the **`C` instance itself**. `classroot.foo` reads `C`'s own `foo`.
- **At a use site or on a child element's binding** written *outside* `C` → `classroot` is
  the **enclosing** class instance — skipping anonymous views up to the nearest real class,
  reaching the app at the top.

The consequence that bites: an app-level value read through `classroot` from *inside a
component* points at the component, not the app. Write a component that reaches for the
app's dark-mode flag through `classroot`, and the compiler stops you:

```declare-fragment
class Panel extends View [ width = 200, height = 60, fill = whitesmoke,
    Text [ x = 12, y = 20, text = { classroot.dark ? "night" : "day" } ],   // BUG
    ]
```

```
'dark' is not a member of Panel — declare it (dark: <type> = …) or fix the name [DECLARE6001]
```

Inside `Panel`, `classroot` is the `Panel`, which has no `dark`. The fix is `app`, which
always means the running app:

```declare
class Panel extends View [ width = 200, height = 60, fill = whitesmoke,
    Text [ x = 12, y = 20, text = { app.dark ? "night" : "day" } ],
    ]


App [ Panel [ x = 20, y = 20 ],
    ]
```

## `app` — the running app, from any depth

`app` is the running app at the top of the tree, and it means that no matter where the code
sits. Use it for app-level state — the host size, page-wide actions, dark mode — from
anywhere:

```declare-fragment
Metric [ fontSize = { app.width < 420 ? 54 : 92 } ],       // responsive read off the root
Button [ label = "Repo", onClick() { app.navigate("https://github.com/…") } ],
src: Text [ onClick() { app.editing = true } ],            // flip app-level state from a leaf
```

**Prefer `app.width` over `classroot.width`** even when the code sits in the app's own
body: `classroot` reaches the app only *because* the enclosing class happens to be the app,
and silently means something else the moment you reuse that code inside a real component.
`app` always means the app. (Because a filling app's `width` *is* its host width, responsive
layout usually keys off `app.width` — see [Space](declare-docs:guide:space).)

## Bare names, and the capital `App`

Inside a `{ }` body, a child reads the enclosing class's attributes by **bare name** —
`label`, `count`, `theme` — until a nearer name shadows it, at which point `classroot.label`
disambiguates:

```declare-fragment
caption: Text [ text = { label } ],               // bare: the enclosing class's `label`
title:   Text [ textColor = { theme.text } ],     // bare: the prevailing theme token
```

Two capitalization traps:

- The bare capital **`App`** is the *class*, not the instance. For the running instance,
  write **`app`**.
- The four scope nouns are **reserved** — none may be an attribute, child, or parameter
  name.

## Choosing between them

| you want to reach… | use |
|---|---|
| the node this code is on | `this` |
| its container in the view tree | `parent` |
| the component this code is part of | `classroot` |
| the running app, page-wide state, host size | `app` |

The quick test for `classroot` vs `app`: if the value belongs to *the reusable component
you are writing*, it is `classroot`; if it belongs to *the whole running page*, it is `app`.
Reaching for `classroot` to get an app value is the mistake the language is shaped to steer
you away from.

---

**Next:** now that reach is settled, handlers can multiply safely —
[Interaction](declare-docs:guide:interaction).
