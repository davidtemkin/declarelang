<!-- nav: Controls -->
<!-- part: Building -->

# Controls

The standard library ships the controls an interface needs — buttons, checkboxes,
sliders, text fields, menus — themed, keyboard-ready, and available by name with no
import. Use them. The catalog is short; what is worth learning is the two contracts
every control follows, because your own components should follow them too.

Three words, used precisely: a **component** is anything a capitalized tag creates —
`View`, `Button`, your own `TaskRow`. A **class** is how you define one. A **control**
is an interactive component with a value and a place in the keyboard focus order —
what the library ships, and what `extends Control` makes yours.

> **Derive the value down; deliver the edit up.**

## The library

| control | value | notes |
|---|---|---|
| [`Button [ label, primary, onClick() ]`](declare-docs:Button) | — | the action control; Space and Enter press it |
| [`Checkbox [ label, checked ]`](declare-docs:Checkbox) | `checked: boolean` | box, mark and label |
| [`Switch [ checked ]`](declare-docs:Switch) | `checked: boolean` | a sliding thumb |
| [`RadioGroup [ value ]`](declare-docs:RadioGroup) with [`Radio [ choice, label ]`](declare-docs:Radio) children | `value` on the group | one of several |
| [`Slider [ value, min, max, step ]`](declare-docs:Slider) | `value: number` | drag or arrow keys |
| [`Segmented [ choices, value ]`](declare-docs:Segmented) | the chosen `id` | one of a few, shown at once; set its `width` — segments divide it evenly |
| [`Combobox [ items, value ]`](declare-docs:Combobox) | the chosen item | filter as you type |
| [`TextInput [ text, placeholder ]`](declare-docs:TextInput) | `text: string` | the text field |
| [`AppearanceSwitch [ dark ]`](declare-docs:AppearanceSwitch) | `dark: boolean` | light or dark, as one icon |

Every control also takes `disabled`, which makes it inert and removes it from the tab
order. Constrain it (`disabled = { app.muted }`) rather than assigning it.

The library also has components that are not controls — they have no value of their
own: [`ProgressBar`](declare-docs:ProgressBar) (the read-only sibling of `Slider`), [`Bar`](declare-docs:Bar) (a captioned value bar for
demos and dashboards), [`Field`](declare-docs:Field) (a labeled form row),
[`Card`](declare-docs:Card) and [`Divider`](declare-docs:Divider) ([Size, position and layout](declare-docs:guide:layout@padding-and-the-card-it-makes)),
[`Accordion`](declare-docs:Accordion) with [`Pane`](declare-docs:Pane) children, [`Table`](declare-docs:Table) and [`DataGrid`](declare-docs:DataGrid)
([Large collections](declare-docs:guide:collections)), the overlay family — [`Menu`](declare-docs:Menu),
[`MenuBar`](declare-docs:MenuBar), [`ContextMenu`](declare-docs:ContextMenu), [`Dialog`](declare-docs:Dialog), [`Tooltip`](declare-docs:Tooltip)
([Menus, dialogs and overlays](declare-docs:guide:overlays)) — and [`Icon`](declare-docs:Icon) with its set
of drawn marks ([Custom components](declare-docs:guide:custom-components@drawing-your-own-marks-icon)). All of it is
written in Declare, in `library/`, and none of it uses anything you cannot.

## Contract one: the value pattern

A control's value is an ordinary attribute, and it is used in one of three ways.

**The control owns it.** Read it back by name: `mute: Checkbox [ label = "Mute" ]`, and
elsewhere `visible = { mute.checked }`.

**Your state owns it.** Derive the control's value from your state, and take its edits
back through `input`:

```declare
App [ width = 360, height = 210, theme = { SanFrancisco }, fill = { provided("theme").bg },
    volume: number = 50,
    muted: boolean = false,
    col: View [ x = 20, y = 20, width = 320,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        Checkbox [ label = "Mute", checked = { app.muted },
            input(v: boolean) { app.muted = v }
            ],
        Slider [ width = 100%, value = { app.volume }, disabled = { app.muted },
            input(v: number) { app.volume = v }
            ],
        ProgressBar [ width = 100%, value = { app.muted ? 0 : app.volume } ],
        Button [ label = "Reset", primary = true,
            onClick() { app.volume = 50; app.muted = false }
            ]
        ]
    ]
```

`checked = { app.muted }` shows the value; `input(v)` is where the control's own edits
go. The two travel together. A control never writes its own value slot directly — it
calls `input` — so a constrained control never fights its constraint. Without the
`input` override the control's edit would be an assignment to a constrained attribute,
and the runtime refuses it.

**A record owns it.** Inside a list built from data, the value is a field of the row's
record, and the edit goes straight back to it:
`Checkbox [ checked = :done, input(v: boolean) { :done = v } ]`.
[Data](declare-docs:guide:data@writing-a-record) covers records.

### Text fields

`TextInput` follows the same idea with two differences worth knowing. First, it hands
edits back through an **event**, `onInput(v)`, rather than an overridable `input`
method. A field whose text your state owns — so that a reset button or a preset can
change it — looks like this:

```declare
App [ width = 340, height = 120, theme = { SanFrancisco }, fill = { provided("theme").bg },
    textColor = { provided("theme").text },
    who: string = "",
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        row: View [
            layout: SimpleLayout [ axis = x, spacing = 8, align = center ],
            TextInput [ width = 200, placeholder = "Your name",
                text = { app.who }, onInput(v: string) { app.who = v } ],
            Button [ label = "Clear", onClick() { app.who = "" } ]
            ],
        Text [ text = { app.who == "" ? "Hello." : "Hello, " + app.who + "." } ]
        ]
    ]
```

Second, a text field editing a record can bind to it both ways with `<->`
(`text <-> :name`). That form runs a *draft*: the typed text is validated before it is
written, and it can wait for Enter or a Save button before it lands.
[Data](declare-docs:guide:data@editing-text-and-forms) covers drafts and forms. `<->` is for text fields only;
the compiler refuses it on a checkbox or a slider and names the value pattern instead.

## Contract two: what a component arranges, it takes as records

> **If the component arranges it, hand it data. If you arrange it, build it from views.**

A `Segmented` control's choices, a `Menu`'s items, a `Dialog`'s buttons, a `DataGrid`'s
columns: all plain lists of records, with the choice handed back through a method.

```declare
App [ width = 340, height = 120, theme = { SanFrancisco }, fill = { provided("theme").bg },
    textColor = { provided("theme").text },
    page: string = "list",
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Segmented [ width = 300, value = { app.page },
            choices = { [ ({ id: "list", label: "List" }), ({ id: "grid", label: "Grid" }) ] },
            input(v: string) { app.page = v }
            ],
        Text [ text = { "showing: " + app.page } ]
        ]
    ]
```

You cannot nest rows inside a `Menu` — there is nowhere to put them. That is the
contract, not a gap: a component that owns its arrangement owns how it draws, and can
change either without any use site noticing. A list of cards that *you* position and
style is yours: views, a layout, and data.

> **From React:** this retires the compound-component pattern — no
> `<Select><Option/></Select>`, no walking children, no context for a child to find its
> parent. That machinery lets a container configure children it did not create; here the
> container has the data.

## Keyboard focus

Every control is a tab stop. Tab and Shift-Tab move through them in tree order, Space
and Enter activate, and a click moves focus to what was clicked. A focus ring that
travels to the focused control is added to any app that uses library controls; the
theme can change or turn off how it looks. You declare none of it.

When you need more:

- `focusable = true` makes any view a tab stop; there is no numeric tab index.
- A container reorders or gates what Tab reaches by overriding [`tabOrder()`](declare-docs:View.method.tabOrder) — a closed
  pane returns nothing, so Tab never reaches content the user cannot see.
- `focusTrap = true` keeps Tab inside a group, as a modal needs.
- [`Focus.focus(view)`](declare-docs:Focus.method.focus) moves focus from code; [`Focus.getFocus()`](declare-docs:Focus.method.getFocus) reads it, for saving
  before a modal opens and restoring after. Restore on a later turn, not immediately:
  a keystroke still in flight should finish against the old focus.

## When there is no control for it

There is no tab bar or date picker in the library yet — and that is the normal case, not
a gap. Check the tables first: a modal is `Dialog`, one-open-at-a-time panes are
`Accordion`, and each already carries the parts that are tedious to rebuild. When
something is genuinely missing, compose it, and when it has a value and belongs in the
tab order, make it a control: `extends Control` gives you focus, keyboard activation and
the interaction states, and the two contracts above make it behave like the ones you
were given. [Custom components](declare-docs:guide:custom-components@what-extends-control-gives-you) shows how.

---

**What you can now do:** wire any control to your state or to a record with the one
value pattern, feed arranging components data instead of children, and rely on focus and
keyboard behavior you did not have to write.

[Next: **Pointer and keyboard** →](declare-docs:guide:pointer-and-keyboard)
