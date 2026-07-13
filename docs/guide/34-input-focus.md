# Input and focus

Text entry and keyboard focus are the one place a Declare app touches the
platform's own input machinery — the caret, selection, the clipboard, IME. Rather
than reimplement any of that, Declare leans on a real native element and gives you
a small, declarative surface over it: a field whose `text` you own, a `focusable`
flag that makes a view a tab stop, and a `focustrap` that scopes a group. There is
no `tabindex` to number and no listener to add or remove.

## `TextInput` — a native field whose `text` you own

`TextInput` renders a real editable element — a DOM `<input>`/`<textarea>`, or a
positioned overlay on the canvas backend — so caret, selection, clipboard, IME, and
accessibility are the platform's, correct for free. What Declare adds is the
binding model: its **`text` attribute is the field's value**, and how you connect
it decides which side is the source of truth (this is the two-shape story from
[Data](26-data.md), restated here from the input side).

```declare
App [ fill = white, textColor = black, zip: string = "",
    weather: DataSource [ url = "weather.json" ],
    zipField: TextInput [ x = 20, y = 20, width = 160, height = 30, padding = 6, cornerRadius = 6,
        fill = gainsboro, placeholder = "Zip code",
        onInput(v) { app.zip = v },              // each keystroke — v is the new text
        onEnter()  { app.weather.fetch() },      // Enter, on a single-line field — submit
        ],
    ]
```

- **`onInput(v)`** fires on every edit; its argument is the new text, which is also
  already on `this.text`. Use it to publish edits onward or validate as you type.
- **`onEnter()`** fires when a single-line field is submitted with Enter — the
  natural place to kick off a `.fetch()` or commit a value.
- **`placeholder`** is the empty-field prompt; **`initial`** *seeds* the text once
  and then lets the field own it (the uncontrolled form — see below); a `{ }`-bound
  `text` makes the field *controlled*, so a divergent edit reverts.
- **`multiline = true`** switches to a `<textarea>`; pair it with **`wrap = true`**
  for a soft-wrapping note field.

Controlled vs. source-of-truth is worth deciding on purpose:

```declare
App [ fill = white, textColor = black, zip: string = "94110",
    seed:  TextInput [ x = 20, y = 20, width = 220, height = 30, padding = 6, cornerRadius = 6,
           fill = gainsboro,
           initial = { app.zip } ],   // seeded once, then editable — the field is truth
    bound: TextInput [ x = 20, y = 70, width = 220, height = 30, padding = 6, cornerRadius = 6,
           fill = gainsboro,
           text    = { app.zip } ],   // controlled — always shows app.zip, edits revert
    ]
```

Reach for **controlled** when other state is authoritative and the field is a view
of it; reach for the **`initial` + `onInput`** pattern when the field itself holds
the value and the rest of the UI reads `field.text`.

## `focusable` — a tab stop, in tree order

A view opts into keyboard focus with the boolean **`focusable`**. That is the whole
declaration; there is no numeric `tabindex`. The tab order is the **view tree in
source order** — preorder over the `focusable` (and visible) views — which in a
well-built tree *is* the visual order, and which handles replicated and
runtime-created views with no bookkeeping.

```declare
App [ fill = white, textColor = black,
    form: View [ x = 20, y = 20, layout: SimpleLayout [ axis = y, spacing = 8 ],
        name:  TextInput [ width = 200, focusable = true, placeholder = "Name",
               height = 30, padding = 6, cornerRadius = 6, fill = gainsboro ],
        email: TextInput [ width = 200, focusable = true, placeholder = "Email",
               height = 30, padding = 6, cornerRadius = 6, fill = gainsboro ],
        zip:   TextInput [ width = 200, focusable = true, placeholder = "Zip",
               height = 30, padding = 6, cornerRadius = 6, fill = gainsboro ],
        ],
    ]
```

Tab walks `name → email → zip` because that is their order in the source. Reorder
the members and the tab order follows; a `TextInput` is `focusable` where it makes
sense, so a plain field is already a tab stop.

## `focustrap` — a self-contained focus group

A **`focustrap`** view is a focus boundary: Tab cycles *within* it and does not
escape until you say so. This is the modal / dialog behaviour as a single
attribute. When focus reaches the edge, the view's **`onEscapeFocus`** handler
fires — dismiss the modal there, or hand focus back to where it came from.

```declare
dialog: View [ x = 40, y = 40, width = 300, height = 160, fill = white,
    cornerRadius = 10,
    focustrap = true,
    onEscapeFocus() { app.editing = false },     // Tab tried to leave — close the modal
    field:  TextInput [ x = 16, y = 16, width = 268, height = 30, focusable = true,
            padding = 6, cornerRadius = 6, fill = gainsboro,
            placeholder = "Title" ],
    cancel: View [ x = 16, y = 60, width = 80, height = 28, cornerRadius = 6, fill = gainsboro,
        focusable = true, onClick() { app.editing = false },
        Text [ width = 80, y = 6, textAlign = center, text = "Cancel" ] ],
    ok:     View [ x = 104, y = 60, width = 80, height = 28, cornerRadius = 6, fill = royalblue,
        focusable = true, onClick() { app.editing = false },
        Text [ width = 80, y = 6, textAlign = center, textColor = white, text = "OK" ] ],
    ]
```

Tab moves through `field → cancel → ok` and wraps back to `field`, never landing on
anything behind the dialog.

## `onFocus` / `onBlur` — reacting to focus

Any view (not just a field) answers **`onFocus`** and **`onBlur`** — the moments it
gains and loses the keyboard. Use them to drive state that other slots read:
brighten a field's frame while it is active, show a hint, or flip an app-level flag.

```declare
App [ fill = white, textColor = black,
    search: TextInput [ x = 20, y = 20, width = 240, height = 30, active: boolean = false,
        padding = 6, cornerRadius = 6, fill = gainsboro,
        placeholder = "Search",
        onFocus() { active = true },
        onBlur()  { active = false },
        hot: State [ applied = { active }, fill = aliceblue ],   // frame lights while focused
        ],
    ]
```

Because the handler's assignments are reactive setters, one `onFocus` updates every
constraint and [State](24-states.md) that reads `active`, with nothing else wired.

## Planned: a `Keys` service and `Focus.next()`/`prev()`

Two capabilities are designed but **not yet reachable from Declare source**, so do
not write them today:

- a global **`Keys`** subscription service — a keyboard stream independent of any
  focused field, for shortcuts, chords, and games (it exists in the runtime but has
  no compiling source form yet);
- a **`Focus`** service with imperative **`Focus.next()` / `Focus.prev()`** and a
  `tabOrder()` override for explicit sequences.

Both ride the [planned](23-events.md) `<-` subscription form. Until they land,
**keyboard input comes through a focused `TextInput`**, and tab traversal is the
tree-order default above — which covers the great majority of real forms. (The full
design is in [input.md](../../design/input.md).)

---

**Next:** [Compiling and shipping](35-shipping.md) — how source becomes a running
app on the server, from the `declarec` CLI, or in the browser, and the compile flags
that steer each.
