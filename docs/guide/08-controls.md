<!-- nav: Controls -->
<!-- part: Building -->

# Derive down, deliver up

You do not hand-build buttons outside of tutorials. The library ships a small set of
controls — themed, keyboard-ready, auto-included by bare tag — and this chapter is
deliberately short, because what is worth learning is not the catalog. It is the two
contracts every control obeys, which are the contracts your *own* components should
obey too.

Three words carry the chapter, at three altitudes. A **component** is anything a
capitalized tag instantiates — `View`, `Chip`, and `Button` alike. A **class** is the
authoring side of the same fact: `class Chip extends View` defines a component. A
**control** is an interactive component with a value and a place in the focus order —
what the library ships, and what `extends Control` makes yours. The words nest;
nothing below is "a control and a component."

## The library

| control | value | one line |
|---|---|---|
| `Button [ label, primary?, onClick() ]` | — | the action control; Space/Enter fires it |
| `Checkbox [ label, checked ]` | `checked: boolean` | box + mark + label |
| `Switch [ checked ]` | `checked: boolean` | sliding-thumb boolean |
| `RadioGroup [ value ]` + `Radio [ choice, label ]` | `value: string` on the group | one-of-N |
| `Slider [ value, min, max, step ]` | `value: number` | drag or arrow keys |

Every control also takes `disabled` (inert and unfocusable — constrain it).

**Not every library component is a control**, and the difference is exactly the one
above: a control has a value and a place in the focus order. The rest of what ships,
so you know it exists before you build it:

| | |
|---|---|
| **display** | `ProgressBar [ value, min, max ]` — Slider's read-only sibling · `Bar [ label, value, tint ]` |
| **structure** | `Field [ label, labelWidth ]` — a labeled row; nest a control in it · `Accordion [ value ]` + `Pane [ label, initial ]` — one pane open at a time |
| **layers** | `Dialog [ shown, title, buttons ]` — modal, with a scrim and a focus trap · `Menu` · `MenuBar [ menus ]` — whole menus as data |
| **ambient** | `Tooltip` — set `tip = "…"` on any view · `FocusRing` — injected for you |
| **embedding** | `AppIsland` — a whole Declare program in a box |
| **arrangement** | `SimpleLayout` · `WrappingLayout` · `ResponsiveLayout` · `Spacer` — [chapter 5](declare-docs:guide:space) |

The library is small and actively growing, and its source is written in Declare
(`library/`), which matters more than it sounds: it is readable proof that there is no
privileged component layer underneath the one you write in.

## Contract one: the value pattern

A control's value is a plain reactive attribute, used in one of three forms.
*Standalone* — the control owns its state; read it by name
(`mute: Checkbox [ label = "Mute" ]` … `visible = { mute.checked }`).
*App-owned* — the truth lives elsewhere: **derive down, deliver up**:

```declare
App [ width = 360, height = 200, fill = { theme.bg },
    volume: number = 50,
    muted:  boolean = false,

    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Checkbox [ label = "Mute", checked = { app.muted },
            input(v: boolean) { app.muted = v },
            ],
        Slider [ value = { app.volume },
            input(v: number) { app.volume = v },
            disabled = { app.muted },
            ],
        ProgressBar [ value = { app.muted ? 0 : app.volume } ],
        Button [ label = "Reset", primary = true,
            onClick() { app.volume = 50; app.muted = false },
            ],
        ],
    ]
```

`checked = { app.muted }` derives the display; `input(v)` is the edit-delivery
channel, redirecting the control's edits into your state. The pair goes together — a
one-way binding *without* `input` leaves the control's edits fighting your
constraint. *Data-owned* — an editor bound straight to a datum with `<->` — is
[chapter 9](declare-docs:guide:data)'s form, for editors only, and the compiler
holds that line: point `<->` at a `Checkbox` and the error tells you a Checkbox is
not an editor, use `checked = { … }` + `input(v)`.

## Contract two: focus is provided

Tab and Shift-Tab walk the controls, Space and Enter activate, a click claims focus,
and a traveling focus ring is injected into any app that uses the library — disable
or replace it via the theme. You declared none of it.

## When there is no widget for it

There is no `Tabs` or `Select` yet — and that is the normal case, not a gap:
**compose it, or define a class.** A tab bar is a row of views with `onClick` and a
selected state.

Check the tables above first, though — "compose it" applies to what is genuinely
missing, not to what you have not found yet. A modal is `Dialog` and a
one-open-at-a-time stack is `Accordion`, and each already carries the part that is
awkward to rebuild: a scrim that blocks input beneath it and a focus trap in the first,
spring-driven pane heights and keyboard traversal in the second.

The library earns its place only where native behavior (caret, focus, keyboard) is
worth sharing; everything else is the composition you already know from
[chapter 4](declare-docs:guide:tree).

---

**What you can now say:** you can wire real controls to real state with the one value
pattern all of them share, you know which of the three forms a given value wants, and
you know when to stop looking for a widget and compose.

[Next: **Data is a place, not an event** →](declare-docs:guide:data)
