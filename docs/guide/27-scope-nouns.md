# Scope nouns — `this`, `parent`, `classroot`, `app`

There are four scope nouns because the node a piece of code is *attached to* is not
always the component it *belongs to* — nor the running App it lives in. Getting
these right is what keeps handlers and constraints pointed at the node you actually
mean.

- **`this`** — the node the code is on.
- **`parent`** — that node's parent in the view tree.
- **`classroot`** — the instance of the class *in whose body the code is written*.
- **`app`** — the running App at the top of the tree.

The first two are what you expect. The other two are where the leverage — and the
gotchas — live.

## `classroot` — the component this code is *part of*

You reach for `classroot` when `this` is a nested child but the code needs to act
on the *component* it is part of. A handler on an inner view that must tell the
whole component to select itself:

```declare
class WeatherTab extends View [
    header: View [
        onClick() { classroot.parent.select(classroot) },   // this is `header`; classroot is the WeatherTab
        bg:      BeveledBar [ opacity = { selected ? 0.33 : 1 } ],
        caption: Text [ text = { classroot.label } ],        // reads the WeatherTab's own label
        ],
    ]
```

Inside `header`'s `onClick`, `this` is `header` — but `classroot` is the
`WeatherTab`. The child bindings read `classroot.label` and `classroot.selected`
to reach the component's own attributes, no matter how deeply they are nested.

### `classroot` resolves by *where the code is written*

This is the rule to internalize, because it is not "the nearest ancestor at
runtime" — it is **lexical**, decided by the member's origin:

- **In a class body** (a method, handler, or `{ }` default written inside `class C
  [ … ]`) → `classroot` is the **`C` instance itself**. `classroot.foo` reads
  `C`'s own `foo`.
- **At a use site or on a child element's binding** written *outside* `C` → 
  `classroot` is the **enclosing** class instance — skipping anonymous views up to
  the nearest real class, reaching the App at the top.

The consequence that bites: an App-level value read through `classroot` from
*inside a component* is **`undefined`**, because there `classroot` is the component,
and a `View` has no such attribute. If `WeatherTab`'s body wrote
`{ classroot.scrollY }`, that is the `WeatherTab`'s `scrollY` (nonexistent), not
the App's. To reach the App from inside a component, use `app`.

## `app` — the running App, from any depth

`app` is the running App at the top of the tree. It is exactly `this.root`, but it
reads as a noun, and it always means the App no matter where the code sits:

```declare
Metric [ fontSize = { app.width < 420 ? 54 : 92 } ],       // responsive read off the root
Button [ onClick() { app.navigate = "https://github.com/…" } ],
src:    Text [ onClick() { app.editing = true } ],          // flip App-level state from a leaf
```

Use `app` for App-level state — scroll position, the host size, page-wide actions
— from anywhere. **Prefer `app.width` over `classroot.width`** even when the code
happens to sit in the App's own body: `classroot` reaches the App only *because*
the enclosing class happens to be the App, and silently means something else the
moment you reuse that code inside a real component. `app` always means the App.

> Because a filling app's `width` *is* its host width, responsive layout usually
> keys off `app.width` — a centered column's gutter, a breakpoint font size —
> rather than the host directly. See [Sizing](32-sizing.md).

## Bare names, and the capital `App`

Inside a `{ }` body or constraint, a child reads the enclosing class's attributes
by **bare name** — `label`, `count`, `theme` — until a nearer name shadows it, at
which point the qualified `classroot.label` disambiguates:

```declare
caption: Text [ text = { label } ],                  // bare: the enclosing class's `label`
title:   Text [ textColor = { theme.text } ],        // bare: the prevailing theme token
```

Two capitalization traps:

- The bare capital **`App`** is the *class*, not the instance. `App.foo` resolves
  only in a use-site binding and errors inside a class body; for the running
  instance write **`app.foo`**.
- The four scope nouns are **reserved** — none may be an attribute, child, or
  parameter name.

## Choosing between them

| you want to reach… | use |
|---|---|
| the node this code is on | `this` |
| its container in the view tree | `parent` |
| the component this code is a part of | `classroot` |
| the running App, page-wide state, host size | `app` |

The quick test for `classroot` vs `app`: if the value belongs to *the reusable
component you are writing*, it is `classroot`; if it belongs to *the whole running
page*, it is `app`. Reaching for `classroot` to get an App value is the mistake
the language is shaped to steer you away from.

---

That closes the Fundamental Concepts. Part III goes In Depth:
[Animation](30-animation.md), [Text & Markdown](31-text-markdown.md),
[Sizing](32-sizing.md), [Fonts](33-fonts.md), and [Input & focus](34-input-focus.md).
