# Using controls
<!-- index: the library's controls and the value pattern -->

**Use when** the user sets a value: a checkbox, a slider, a choice, a text field, a button.

```declare
App [ width = 360, height = 260, fill = white,
    volume: number = 50,
    muted: boolean = false,
    who: string = "",
    view: string = "list",
    col: View [ x = 20, y = 20, width = 320,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        Checkbox [ label = "Mute", checked = { app.muted }, input(v: boolean) { app.muted = v } ],
        Slider [ width = 100%, value = { app.volume }, disabled = { app.muted },
            input(v: number) { app.volume = v } ],
        Segmented [ width = 200, value = { app.view },
            choices = { [ ({ id: "list", label: "List" }), ({ id: "grid", label: "Grid" }) ] },
            input(v: object) { app.view = "" + v } ],
        TextInput [ width = 200, placeholder = "Your name",
            text = { app.who }, onInput(v: string) { app.who = v } ],
        Button [ label = "Reset", primary = true,
            onClick() { app.volume = 50; app.muted = false; app.who = "" } ]
        ]
    ]
```

**Rules**
- The library has the usual controls, themed and keyboard-ready: `Button`, `Checkbox`,
  `Switch`, `RadioGroup`/`Radio`, `Slider`, `Segmented`, `Combobox`, `TextInput`. Check
  there before building one by hand.
- A control's value is owned one of three ways: by the control (read it by name), by
  your state (`checked = { app.muted }` down, `input(v) { app.muted = v }` up), or by
  a record (`checked = :done`, `input(v) { :done = v }`).
- The pair travels together. Without the `input` override, the control's edit is an
  assignment to a constrained attribute, and the runtime refuses it.
- `TextInput` hands edits back through the `onInput(v)` event. `<->` binds it to a
  record field when a `datapath` is above it.
- `disabled = { … }` makes a control inert and removes it from the tab order: constrain
  it, don't assign it.
- A control that arranges things (menus, combobox items, dialog buttons) takes records
  and hands the choice back through a method; you don't nest views inside it.

**Look up** `Checkbox`, `Slider`, `Segmented`, `Combobox`, `TextInput`, `Button`,
`Field`, `Control.disabled`.

**Examples** `apps/sampler/sampler.declare`: every control under four stylings ·
`apps/tracker/tracker.declare`: the filter chips and the editor card's fields.

**Guide** Controls § The library · § The value pattern ·
§ Controls that take records.
