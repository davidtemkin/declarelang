# The controls: the standard library

You do not have to hand-build a button. Declare ships a small set of controls — themed,
keyboard-ready, and auto-included by bare tag, so `Button [ … ]` just works with no import.
They look right with zero configuration and follow any `theme` you set. And they all obey
one contract:

> **A control's value is a plain reactive attribute — derive down, deliver up.**

## The catalog

Seven controls, each a component you drop in like any other:

| component | value | what it is |
|---|---|---|
| `Button [ label, primary?, onClick() ]` | — | the action control; Space/Enter flashes and fires `onClick` |
| `Checkbox [ label, checked ]` | `checked: boolean` | box + mark + label |
| `Switch [ checked ]` | `checked: boolean` | sliding-thumb boolean (the thumb springs) |
| `RadioGroup [ value ]` + `Radio [ choice, label ]` | `value: string` on the group | radios are the group's direct children |
| `Slider [ value, min, max, step ]` | `value: number` | drag or arrow keys; delivers continuously |
| `Field [ label, labelWidth ]` | — | a labeled row; nest your control as its child |
| `ProgressBar [ value, min, max ]` | — | display-only |

## The value pattern

Every control's value is just a reactive attribute, so wiring one is the same skill you
already have. There are three forms, smallest first.

**Standalone** — the control owns its state; read it by name:

```declare
App [ width = 240, height = 100, fill = white, textColor = black,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        mute: Checkbox [ label = "Mute" ],
        Text [ text = { mute.checked ? "muted" : "on" } ],
        ],
    ]
```

**App-owned** — when the truth lives elsewhere, **derive down** with `value = { … }` and
**deliver up** with `input(v) { … }`. The `input` method is the edit-delivery channel; its
default writes the control itself, and your override redirects it:

```declare
App [ width = 360, height = 200, fill = { theme.bg },
    volume: number = 25,
    muted:  boolean = false,

    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Checkbox [ label = "Mute", checked = { app.muted },
            input(v) { app.muted = v },
            ],
        Slider [ value = { app.volume },
            input(v) { app.volume = v },
            disabled = { app.muted },
            ],
        ProgressBar [ value = { app.muted ? 0 : app.volume } ],
        Button [ label = "Reset", primary = true,
            onClick() { app.volume = 25; app.muted = false },
            ],
        ],
    ]
```

Bind a control's value one-way *without* supplying `input`, and its edits would fight your
constraint — so the pair goes together.

**Data-owned** — an editor bound straight to a datum with `<->`. That form is for **editors
only** ([Data](declare-docs:guide:data)), and the compiler holds the line:

```declare-fragment
Checkbox [ label = "Done", checked <-> done ],
```

```
Checkbox.checked <-> …: the two-way arrow edits a dataset value through an editor's value
slot (e.g. 'TextInput.text') — Checkbox is not an editor [DECLARE2000]
```

A `Checkbox` is app-owned, not an editor; use `checked = { … }` + `input(v)` as above.

## Focus and the traveling ring

Keyboard focus is provided, undeclared: Tab and Shift-Tab walk the controls in tree order,
Space/Enter activates, a click claims focus. A **traveling focus indicator** is injected
into any app that uses these controls — disable it with
`theme = { { ...app.theme, focusRing: false } }`, or declare your own `FocusRing [ ]` to
customize. (Deep focus — tab order overrides, focus traps — is
[The environment](declare-docs:guide:environment).)

## When there is no widget for it

There is no `Modal`, `Tabs`, or `Select` yet. That is not a gap you work around — it is the
normal case: **compose one from primitives, or define a class**, exactly as you would any
other component. A tab bar is a row of views with an `onClick` and a selected state; a modal
is a full-bleed view over a dimmed backdrop, shown by a `State`. The library covers the
controls whose native behavior (caret, focus, keyboard) is worth sharing; everything else is
composition, which is the whole point of [the tree](declare-docs:guide:tree).

---

**Next:** the controls arrived already styled. Here is the system they follow —
[Appearance](declare-docs:guide:appearance).
