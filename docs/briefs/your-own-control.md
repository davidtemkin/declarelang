# Your own control
<!-- index: extends Control: press(), hot/down, focus, delivering a value -->

**Use when** the library has no control for it: something with a value the user changes
and a place in the keyboard order.

```declare
class Stepper extends Control [ width = 96, height = 28, cornerRadius = 7,
    value: number = 0,
    step:  number = 1,

    input(v: number) { value = v },          // the default delivery; a use site overrides it
    press() { input(value + step) },         // click, Space and Enter all land here

    fill = { down ? theme.controlPressed : hot ? theme.controlHover : theme.control },
    t: Text [ x = center, y = center, fontSize = 13, textColor = { theme.text },
        text = { "" + classroot.value } ]
    ]

App [ width = 320, height = 130, theme = { SanFrancisco },
    n: number = 0,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        Stepper [ value = { app.n }, input(v: number) { app.n = v } ],
        Text [ textColor = { provided("theme").text }, text = { "count: " + app.n } ]
        ]
    ]
```

**Rules**
- A control **extends `Control`**; a view with no value and no focus stays a plain class
  (a card, a badge). `Control` brings focus, Space/Enter activation, and `hot`/`down`
  already gated by `disabled`.
- Override `press()`, not the pointer handlers: click, Space and Enter all land there.
- A control **delivers, never stores**: `press()` calls `input(v)`; it never writes its
  own value. The default `input` writes the value (standalone use); a use site that owns
  the value overrides `input`. One class works both ways.
- Style from `hot`/`down`, not the raw `hovered`/`pressed`, so a disabled control never
  lights up. Inside a `Control`, `theme.x` reads the provided theme directly.
- A subclass refines methods and attributes (`super.press()` keeps the base's), never the
  base's children: expose what a child needs as an attribute the child reads.
- Ring only part of it with `focusShape()`.

**Look up** `Control`, `Control.press`, `Control.hot`, `Control.down`,
`Control.focusShape`, `Control.disabled`.

**Examples** `library/checkbox.declare`, `library/segmented.declare`: library controls,
written in Declare · `apps/tracker/tracker.declare`: `Chip` and `RailStat`, controls that
are also filters.

**Guide** Your own views and drawing § View or Control · § What
`extends Control` gives you · § Delivering a control's value.
