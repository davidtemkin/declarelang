<!-- nav: Controls -->
<!-- part: Building -->

# Controls

The standard library ships the controls an interface needs — buttons, checkboxes,
sliders, text fields, menus — themed, keyboard-ready, and available by name with no
import. Use them. The catalog is short; what is worth learning is the two contracts
every control follows, because your own controls should follow them too.

Three words, used precisely: a **class** is what a capitalized tag names —
`View`, `Button`, your own `TaskRow` — and an **instance** is one you made. A **control**
is an interactive view with a value and a place in the keyboard focus order —
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
| [`TabBar [ choices, value ]`](declare-docs:TabBar) | the chosen `id` | a `Segmented` that switches what is shown below it — pages, panes; a screen reader hears tabs |
| [`Combobox [ items, value ]`](declare-docs:Combobox) | the chosen item | filter as you type |
| [`TextInput [ text, placeholder ]`](declare-docs:TextInput) | `text: string` | the text field |
| [`SearchField [ text, placeholder ]`](declare-docs:SearchField) | `text: string` | a text field for searching: round at both ends, and a search field to a screen reader |
| [`AppearanceSwitch [ dark ]`](declare-docs:AppearanceSwitch) | `dark: boolean` | light or dark, as one icon |
| [`TextSizeSwitch [ value ]`](declare-docs:TextSizeSwitch) | the scale, one of its `sizes` | the reading size: a small, a default and a large A |
| [`Stepper [ value, min, max, step ]`](declare-docs:Stepper) | `value: number` | a number a step at a time, between − and +; a spin button to a screen reader |
| [`DatePicker [ value ]`](declare-docs:DatePicker) | an ISO date string | a field that opens a [`MonthCalendar`](declare-docs:MonthCalendar); the calendar also stands alone |
| [`Disclosure [ label, open ]`](declare-docs:Disclosure) | `open: boolean` | a section that slides open under the line that names it |
| [`Tree [ items, value, expanded ]`](declare-docs:Tree) | the selected `id` | an outline whose rows open and close |
| [`Toolbar`](declare-docs:Toolbar) with [`ToolButton [ label, icon, toggle ]`](declare-docs:ToolButton) children | a toggle's `on` | one Tab stop for a row of commands; [`ToolbarDivider`](declare-docs:ToolbarDivider) between groups |
| [`Breadcrumb [ items ]`](declare-docs:Breadcrumb) | — | the path to where you are |
| [`Splitter [ value, min, max ]`](declare-docs:Splitter) | `value: number` | the divider between two panes you arrange, by pointer or keys |
| [`Window [ title, open ]`](declare-docs:Window) | `open: boolean` | a window with a title bar, dragging and a close button; `frame = false` for one of your own design |

Every control also takes `disabled`, which makes it inert and removes it from the tab
order. Constrain it (`disabled = { app.muted }`) rather than assigning it.

The library also has classes that are not controls — they have no value of their
own: [`ProgressBar`](declare-docs:ProgressBar) (the read-only sibling of `Slider`), [`Gauge`](declare-docs:Gauge) (a captioned value bar for
demos and dashboards), [`Field`](declare-docs:Field) (a labeled form row),
[`Card`](declare-docs:Card) and [`Divider`](declare-docs:Divider) ([Size, position and layout](declare-docs:guide:layout@padding-and-card)),
[`Accordion`](declare-docs:Accordion) with [`AccordionPane`](declare-docs:AccordionPane) children, [`Table`](declare-docs:Table) and [`DataGrid`](declare-docs:DataGrid)
([Large collections](declare-docs:guide:collections)), the overlay family — [`Menu`](declare-docs:Menu),
[`MenuBar`](declare-docs:MenuBar), [`ContextMenu`](declare-docs:ContextMenu), [`Dialog`](declare-docs:Dialog), [`Tooltip`](declare-docs:Tooltip)
([Menus, dialogs and overlays](declare-docs:guide:overlays)) — and [`Icon`](declare-docs:Icon) with its set
of drawn marks ([Your own views](declare-docs:guide:your-own-views@icons)). All of it is
written in Declare, in `library/`, and none of it uses anything you cannot.

**Controls inside other views.** A row, a cell, a card or a carousel page can hold
buttons, fields and checkboxes, including a row that is itself selectable. What can't hold
another control is one a screen reader announces as a single thing: a button, a link, a
checkbox or a switch. A control inside one of those is read as part of its name and can't
be reached ([Accessibility](declare-docs:guide:accessibility@what-you-add)).

## The value pattern

A control's value is an ordinary attribute, and it is used in one of three ways.

**The control owns it.** Read it back by name: `mute: Checkbox [ label = "Mute" ]`, and
elsewhere `visible = { mute.checked }`.

**Your state owns it.** Derive the control's value from your state, and take its edits
back through `input`:

```declare
App [ width = 360, height = 210, theme = { SanFrancisco }, fill = { provided("theme").background },
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
go. The two travel together. A control never writes its own value directly — it
calls `input` — so a constrained control never fights its constraint. Without the
`input` override the control's edit would be an assignment to a constrained attribute,
and the runtime refuses it.

**A record owns it.** Inside a list built from data, the value is a field of the row's
record, and the edit goes straight back to it:
`Checkbox [ checked = :done, accessibilityLabel = :title, input(v: boolean) { :done = v } ]`.
[Data](declare-docs:guide:data@writing-a-record) covers records.

### Text fields

`TextInput` follows the same idea with two differences worth knowing. First, it hands
edits back through an **event**, `onInput(v)`, rather than an overridable `input`
method. A field whose text your state owns — so that a reset button or a preset can
change it — looks like this:

```declare
App [ width = 340, height = 120, theme = { SanFrancisco }, fill = { provided("theme").background },
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

Every control that holds a value — the ones above, a `Combobox`, a `DatePicker`, and any
of your own that extends [`ValueControl`](declare-docs:ValueControl) — can be **checked like a field**:
`required` (`true` or the message), `validate(v)`, and a `name` a service refuses it by. A
[`Form`](declare-docs:Form) around them judges them all on submit; a [`Field`](declare-docs:Field) around one shows
what is wrong with it under it ([Data](declare-docs:guide:data@a-form)).

Say what a field holds with [`purpose`](declare-docs:TextInput.purpose) — `email`,
`password` and the rest — and the platform helps fill it
([Accessibility](declare-docs:guide:accessibility@what-you-add)).

A multi-line field (`multiline = true`) left unsized is as tall as its text. Cap it as you
cap any box — `height = { Math.min(contentHeight, 120) }` — and it grows as the user types,
then scrolls. In a multi-line field Return types a line break; `enterSubmits = true` makes
Return fire `onEnter` and Shift-Return the break.

Where the user's caret or selection is, a field reports as two read-only facts,
[`selectionStart`](declare-docs:TextInput.selectionStart) and `selectionEnd` — a constraint
can follow them (`canBold = { f.selectionEnd > f.selectionStart }`); to move it, call
[`select()`](declare-docs:TextInput.method.select).

## Controls that take records

> **If the class arranges it, hand it data. If you arrange it, build it from views.**

A `Segmented` control's choices, a `Menu`'s items, a `Dialog`'s buttons, a `DataGrid`'s
columns: all plain lists of records, with the choice handed back through a method.

```declare
App [ width = 340, height = 120, theme = { SanFrancisco }, fill = { provided("theme").background },
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

### Choosing one of many

Four controls choose one value from a set. Which fits depends on how many choices there
are and how much room they may take:

- [`Segmented`](declare-docs:Segmented) — two to five short choices, all shown at once.
- [`RadioGroup`](declare-docs:RadioGroup) — a handful of choices that need a sentence each,
  shown at once.
- **A pop-up button** — a list of choices that stays closed until pressed, as a `<select>` is
  in HTML. It is a `Button` with a [`menu`](declare-docs:Control.menu) whose rows carry
  `checked`; the row that is checked is the current choice.
- [`Combobox`](declare-docs:Combobox) — a long list the user narrows by typing.

```declare
App [ width = 340, height = 160, theme = { SanFrancisco }, fill = { provided("theme").background },
    sort: string = "name",
    sorts: Menu [
        items = { [ ({ id: "name", label: "Name", checked: app.sort == "name" }),
                    ({ id: "date", label: "Date", checked: app.sort == "date" }),
                    ({ id: "size", label: "Size", checked: app.sort == "size" }) ] },
        picked(id: string) { app.sort = id }
        ],
    Button [ x = 20, y = 20, label = { "Sort by " + app.sort }, menu = { app.sorts } ]
    ]
```

The button shows the current choice and a chevron; pressing it opens the menu under it
with a check beside the current row. [Menus, dialogs and overlays](declare-docs:guide:overlays)
covers menus in full.

You cannot nest rows inside a `Menu` — there is nowhere to put them. That is the
contract, not a gap: a class that owns its arrangement owns how it draws, and can
change either without any use site noticing. A list of cards that *you* position and
style is yours: views, a layout, and data.

> **From React:** this retires the compound-component pattern — no
> `<Select><Option/></Select>`, no walking children, no context for a child to find its
> parent. That machinery lets a container configure children it did not create; here the
> container has the data.

## Keyboard focus

Every control is a tab stop. Tab and Shift-Tab move through them in tree order, Space
and Enter activate, and a click moves focus to what was clicked; a click on anything that
can't take focus clears it, and the next Tab starts from where you clicked. A control with members —
a radio group, a segmented control, a list, a menu bar — is one stop: Tab lands on its
chosen member and the arrows move among the rest. A focus ring that
travels to the focused control is added to any app that uses library controls; the
theme can change or turn off how it looks. You declare none of it.

When you need more:

- `focusable = true` makes any view a tab stop; there is no numeric tab index.
  `focusable = quiet` makes it a place you can put focus that Tab never lands on — a
  screen's heading, so a screen reader says where the person is now; Tab goes on from it.
- A control disabled while it has focus keeps it, so the next Enter does nothing rather
  than press a neighbour; Tab goes on from it.
- When the view with focus is hidden or removed, focus goes where the nearest container's
  [`restoresFocusTo`](declare-docs:View.restoresFocusTo) says; inside a list or a grid, to
  the list. Otherwise it is cleared, and the next Tab starts from where it was.
- A container reorders or gates what Tab reaches by overriding [`tabOrder()`](declare-docs:View.method.tabOrder) — a closed
  pane returns nothing, so Tab never reaches content the user cannot see.
- [`focusScope`](declare-docs:View.focusScope) says what Tab does at a container's edge:
  `stop` makes it one stop whose arrows move among its members, `region` gives it a cycle of its own that
  Enter enters and F6 leaves (a window, a pane), `modal` keeps Tab inside it (a dialog).
  Some browsers take F6 for themselves, so **Esc then Tab** leaves a region too (Shift-Tab
  goes back), and a program's own command can call
  [`Focus.nextRegion`](declare-docs:Focus.method.nextRegion).
- A member of a `stop` that wants an arrow for itself handles it in `onKeyDown`, and hands
  the keys it doesn't want to `super.onKeyDown(e)`.
- Every view carries [`focused`](declare-docs:View.focused), true while it holds focus — a
  fact a constraint reads (`stroke = { focused ? stroke(2, provided("theme").accent) : null }`).
- [`onFocus`](declare-docs:View.event.focus) and [`onBlur`](declare-docs:View.event.blur)
  run when a view gains and loses focus. `onBlur` is the place to tidy a field once the
  user leaves it, rather than on every keystroke:

  ```declare-fragment
  TextInput [ placeholder = "Tag", text = { app.tag },
      onInput(v: string) { app.tag = v },
      onBlur() { app.tag = app.tag.trim().toLowerCase() } ]
  ```

- [`Focus.focus(view)`](declare-docs:Focus.method.focus) moves focus from code;
  [`Focus.getFocus()`](declare-docs:Focus.method.getFocus) answers which view has it — a
  constraint reading it follows focus — and is what you save before a modal opens and restore
  after. Restore on a later turn — `afterDelay(0, () => Focus.focus(saved))`, once the
  current event has finished — not immediately: a keystroke still in flight should finish
  against the old focus.

## Building a missing control

The library will not have every control you need, and that is the normal case, not a
gap. Check the tables first: a modal is `Dialog`, one-open-at-a-time panes are
`Accordion`, and each already carries the parts that are tedious to rebuild. When
something is genuinely missing, compose it — and **anything that would be a button —
anything a keyboard user must be able to reach and press — is a control**, whether or
not it has a value: a tab, a chip, a row's delete mark, a card that opens.
`extends Control` gives it focus and a place in the tab order, Space and Enter reaching
the same `press()` a click does, `hovered` and `pressed` that respect `disabled`, and a label that
never selects as text; a plain `View` with an `onClick` has none of them, so a keyboard
user cannot reach it. A `View` with pointer handlers is for what is not a button: a
surface you drag or draw on, or a scrim a click dismisses. The two contracts above make
a control behave like the ones you were given. [Your own views](declare-docs:guide:your-own-views@what-extends-control-gives-you) shows how.

---

**What you can now do:** wire any control to your state or to a record with the one
value pattern, feed arranging classes data instead of children, and rely on focus and
keyboard behavior you did not have to write.

[Next: **Pointer and keyboard** →](declare-docs:guide:pointer-and-keyboard)
