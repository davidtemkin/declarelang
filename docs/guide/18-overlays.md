<!-- nav: Menus and overlays -->
<!-- part: Building -->

# Menus, dialogs and overlays

Menus, popovers, dialogs, sheets, toasts, tooltips — everything that appears *over* an
interface rather than in it. In the stacks you know these are the awkward ones: portals to escape a
clipping ancestor, z-index arithmetic, an outside-click listener you attach and forget to
remove, focus that vanishes when the panel closes.

Declare has no portals and no z-index, and the reason the awkwardness goes away is a
change of shape:

> **A layer is a standing member you open with a verb — not a view you show and hide
> around your content.**

Declare one [`Menu`](declare-docs:Menu), once, and open it from twenty places. That is most of this chapter.

## Declaring a menu

Here is the shape. The menu is a member of the app; the thing that opens it says *where*
and *for whom*:

```declare
App [ width = 360, height = 150, theme = { SanFrancisco }, chose: string = "",
    edit: Menu [ items = { [ ({ id: "cut", label: "Cut", key: "⌘X" }),
                            ({ id: "copy", label: "Copy", key: "⌘C" }),
                            ({ divider: true }),
                            ({ id: "paste", label: "Paste", enabled: false }) ] },
        picked(id: string) { app.chose = id }
        ],
    Button [ x = 20, y = 20, label = "Edit", menu = { app.edit } ],
    Text [ x = 20, y = 76, textColor = { provided("theme").text },
        text = { app.chose == "" ? "nothing picked yet" : "picked: " + app.chose } ]
    ]
```

Note what is **not** there. No [`visible`](declare-docs:View.visible) toggling, no z-index, no dismissal handler, no
cleanup. `menu = { app.edit }` on the button is the whole wiring: it gets the disclosure
chevron, the anchored open, the held-open styling, and ArrowDown-to-open together.

The fact that makes one menu serve many places is [`opener`](declare-docs:Floating.opener), the view a menu was opened
for. Because `items` is an ordinary attribute, it can be a **constraint that reads
`opener`**: per-row menus over a table, with no per-row instances and no stale copies,
live while the menu is up.

A menu's items, like a dialog's buttons, are **records, not children** — the contract from
[Controls](declare-docs:guide:controls@controls-that-take-records): what a class arranges, it takes as data. The
record is `{ id, label, key?, icon?, enabled?, checked?, divider?, submenu? }`, and the
choice comes back through `picked(id)`.

A menu whose rows carry `checked` is a choice of one: derive `checked` from your state
(`checked: app.sort == "date"`) and set the state in `picked`. Put it on a `Button` whose
label names the current choice, and that button is a pop-up button, the `<select>` of
other platforms. For two to five choices shown at once, use `Segmented`; for a long list
the user filters by typing, `Combobox`
([Controls](declare-docs:guide:controls@choosing-one-of-many)).

## Opening at a view or at the pointer

| verb | anchors | for |
|---|---|---|
| [`openFor(v)`](declare-docs:Menu.method.openFor) | below the view, flipping above at the screen edge | an attached menu — a button's dropdown, a select |
| [`openAt(v, e)`](declare-docs:Menu.method.openAt) | at the pointer | a context menu |

[`ContextMenu`](declare-docs:ContextMenu) wraps the second as `open(v, e)`, and the wiring is two lines **on the view
being served** — which is what routes the gesture, since a handler is a claim:

```declare-fragment
rowMenu: ContextMenu [ items = { … }, picked(id: string) { … } ],
…
Row [ onContextMenu(e: PointerEvent) { app.rowMenu.open(this, e) },
      onHold(e: PointerEvent)        { app.rowMenu.open(this, e) } ]
```

`onContextMenu` engages the right-click and two-finger path; `onHold` is the touch
long-press. Neither costs anything on a view that does not declare it.

## Dismissal, by kind

Every overlay in the library is a [`Floating`](declare-docs:Floating): it paints above everything in its
context, and what a press or a scroll **aimed past it** does is a policy its class states —
two ordinary attributes, [`pressPolicy`](declare-docs:Floating.pressPolicy) and [`scrollPolicy`](declare-docs:Floating.scrollPolicy), which a use site
may change like any other:

| kind | a press outside | a scroll outside |
|---|---|---|
| `Menu`, `ContextMenu` | closes it and goes no further — the Mac rule | is held back |
| `Popover` | closes it and goes on to what you pressed | goes on |
| `Dialog` | goes nowhere; the dialog stays until its buttons or Esc | is held back |
| `Sheet` | closes it (a press on the dimmed context) | is held back |
| `Toast` | goes on, as if the toast were not there | goes on |

The open overlays form a stack in the order they opened. A press is weighed against the top
one first; one that lets it go on hands it to the next. Esc closes the topmost, and nothing
else: a program's own Esc runs on the next press, when nothing is open.

What is worth internalizing is the ordering rule a pick follows, because it is invisible
until it bites:

> **Dismiss first, deliver second.** The layer leaves the screen — a real painted frame —
> before your handler runs.

That is the native platforms' contract too, and it means a slow action can never freeze
an open menu on screen while it works.

## Popovers

A [`Popover`](declare-docs:Popover) is a bubble anchored to a view, holding content of your own — a picker, a few
settings. It opens next to its anchor and follows it as it moves; on a phone it presents as a
sheet rising from the bottom instead.

```declare
App [ width = 360, height = 220, theme = { SanFrancisco }, size: number = 14,
    Button [ x = 20, y = 20, label = "Text size…", onClick() { app.sizes.showFor(this) } ],
    Text [ x = 20, y = 80, fontSize = { app.size }, textColor = { provided("theme").text }, text = "Sample" ],
    sizes: Popover [
        Text [ textColor = { provided("theme").text }, text = { "Size " + app.size } ],
        Slider [ width = 180, min = 10, max = 32, value = { app.size }, input(v: number) { app.size = Math.round(v) } ]
        ]
    ]
```

`showFor(v)` names the anchor for this opening; it takes focus to its first control and gives
it back when it closes, and Tab stays inside it while it is open.

## Dialogs and focus

A [`Dialog`](declare-docs:Dialog) is the same shape — a member you open with a verb, not a view you toggle. Its
most common use is an alert, so it carries the alert verbs:

```declare
App [ width = 360, height = 150, theme = { SanFrancisco }, said: string = "",
    dlg: Dialog [ ],
    Button [ x = 20, y = 20, label = "Delete…",
        onClick() { app.dlg.ask("Delete this file?", "This cannot be undone.",
                                (id) => { app.said = id }) }
        ],
    Text [ x = 20, y = 84, textColor = { provided("theme").text },
        text = { app.said == "" ? "—" : "you chose: " + app.said } ]
    ]
```

[`ask`](declare-docs:Dialog.method.ask) is Cancel / No / Yes; [`notice`](declare-docs:Dialog.method.notice) is a single OK; `error` tints the title. Return picks
the default button — unless the focused view takes Return itself: a focused button presses
itself (Return on Cancel is Cancel), and a multi-line field types its line break. Escape picks
the cancel one. Every control inside keeps its own keys. Focus is **saved on open and restored on
close** — and restored one turn late, deliberately, because an in-flight keystroke has to
finish against the old focus first. When what had it is gone by then — the row a "Delete?"
dialog was about, deleted — focus goes to the next Tab stop after the place it held, as one
Tab from there would. Somewhere else makes more sense, sometimes: say so with
[`restoresFocusTo`](declare-docs:View.restoresFocusTo), read as the dialog closes —
`restoresFocusTo = { app.deleted ? app.listHeading : null }`, with the heading
`focusable = quiet`.

A dialog's content can also be yours: its children go between the message and the buttons,
and focus opens on the first of them.

```declare
App [ width = 400, height = 220, theme = { SanFrancisco }, name: string = "untitled",
    Button [ x = 20, y = 20, label = "Rename…", onClick() { app.rename.show() } ],
    Text [ x = 20, y = 80, textColor = { provided("theme").text }, text = { app.name } ],
    rename: Dialog [ title = "Rename",
        buttons = { [ { id: "cancel", label: "Cancel", cancel: true }, { id: "ok", label: "Rename", default: true } ] },
        picked(id: string) { if (id == "ok") app.name = this.field.text },
        field: TextInput [ width = 100%, accessibilityLabel = "New name" ]
        ]
    ]
```

`presentation = "full"` turns a dialog into a full-screen view — a photo, a document — with
your content edge to edge.

## Open as state

The verbs are one way to open an overlay; the other is to make whether it is open **state of
your own**. Constrain [`shown`](declare-docs:Floating.shown) to it, and say where its own
closings go with `input` — the value pattern, as a slider's drags go through its `input`:

```declare
App [ width = 520, height = 260, theme = { SanFrancisco }, editing: boolean = false,
    Button [ x = 20, y = 20, label = "Edit…", onClick() { app.editing = true } ],
    Text [ x = 20, y = 80, textColor = { provided("theme").text }, text = { app.editing ? "editing" : "—" } ],
    sheet: Sheet [ edge = "end", shown = { app.editing }, input(open: boolean) { app.editing = open },
        Text [ textColor = { provided("theme").text }, text = "Editing" ],
        Button [ label = "Done", primary = true, onClick() { app.editing = false } ]
        ]
    ]
```

It opens when the state turns true and closes when it turns false; Esc and a press past it
write `false` back through `input`. Leaving `input` out is a compile error that names the fix:
the sheet would have no way to tell your state it closed.

**Something to do when it closes**, however it closed — Esc, a press past it, `close()` —
goes in [`closed()`](declare-docs:Floating.method.closed), called once it has closed:
`closed() { app.selection = null }`. To start each opening fresh — a form's fields empty
again — reset them there, or build the contents for each opening with
`exists = { app.editSheet.present }` (see [`present`](declare-docs:Floating.present)):
keyed on `present`, they stay through the closing motion, where keyed on the flag that opens
it they vanish while the panel is still sliding away. Not in `input`: the verbs deliver
through `input`, so an override of it that writes nothing leaves `show()` with nothing to open.

## Sheets

A [`Sheet`](declare-docs:Sheet) is a modal panel attached to an edge: a form, a detail, a set of choices. On a
phone it rises from the bottom and a downward swipe on its handle puts it away; on a wide
screen it slides in from the end edge (`edge = "end"`), or floats as a card when its edge is
the bottom. The context behind it dims, and a press there closes it.

```declare
App [ width = 560, height = 300, theme = { SanFrancisco },
    Button [ x = 20, y = 20, label = "Settings…", onClick() { app.prefs.show() } ],
    prefs: Sheet [ edge = "end",
        Text [ fontWeight = bold, textColor = { provided("theme").text }, text = "Settings" ],
        Checkbox [ label = "Show line numbers" ],
        Checkbox [ label = "Wrap long lines" ],
        Button [ label = "Done", primary = true, onClick() { app.prefs.close() } ]
        ]
    ]
```

## Toasts

A [`Toast`](declare-docs:Toast) is a short message that appears at the bottom of its context and goes away by
itself. It takes no focus and blocks nothing — it even stays clickable above an open
dialog. An action record adds one button, whose id arrives at `picked`.

```declare
App [ width = 360, height = 160, theme = { SanFrancisco },
    note: Toast [ ],
    Button [ x = 20, y = 20, label = "Copy link", onClick() { app.note.say("Link copied", null) } ]
    ]
```

## Overlays that belong to a window

A [`Window`](declare-docs:Window) is a context of its own: what opens inside it — a menu, a
popover, a sheet — opens in the window's layer rather than the App's. It hangs past the
window's edge instead of being cut off by it, it moves, turns and scales with the window, and
a dialog or sheet there holds back presses in that window only, as a macOS sheet does.
Nothing at the use site says so; declaring the menu inside the window is the whole of it:

```declare
App [ width = 520, height = 300, theme = { SanFrancisco }, order: string = "name",
    w: Window [ x = 60, y = 30, width = 260, height = 170, rotation = 4, title = "Files",
        sort: Menu [ items = { [ ({ id: "name", label: "By name" }), ({ id: "date", label: "By date" }),
                                ({ id: "size", label: "By size" }), ({ id: "kind", label: "By kind" }) ] },
            picked(id: string) { app.order = id } ],
        Text [ x = 16, y = 16, textColor = { provided("theme").text }, text = { "Sorted by " + app.order } ],
        Button [ x = 16, y = 84, label = "Sort", menu = { app.w.sort } ]
        ]
    ]
```

The menu opens below its button, past the window's bottom edge, at the window's tilt. It is
kept on the screen — flipped above its button or moved in from the edge — but not inside its
window.

What makes a view a context is one attribute: it provides `overlays`, the view its overlays
paint in. A `Window` provides an unclipped layer of its own, above its content; any view of
yours can do the same — a zoomable canvas whose menus should zoom with it, say.

**A program running inside another** — in an [`AppIsland`](declare-docs:AppIsland), in a
desktop's window — opens its overlays in the nearest such layer above it, crossing into the
program that hosts it: its menus hang past the island's box and take the window's tilt and
scale, and the program's own scale where it is shown smaller. Where no host provides a layer,
they stay inside the island. `containOverlays = true` on the island keeps them inside always.

## A control that opens a layer

[`Combobox`](declare-docs:Combobox) is the two halves of this chapter meeting: a text field that owns a **query**,
and a dismissable list that owns a **choice**.

```declare
App [ width = 340, height = 160, theme = { SanFrancisco }, picked: string = "",
    people: array = { ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Barbara Liskov"] },
    Combobox [ x = 20, y = 20, width = 260, placeholder = "Assignee",
        items = { app.people },
        input(v: string) { app.picked = v }
        ],
    Text [ x = 20, y = 84, textColor = { provided("theme").text },
        text = { app.picked == "" ? "—" : app.picked } ]
    ]
```

Type to filter, arrow to rove, Enter to pick — or click the chevron to see everything. The
part worth stealing for your own work is how filtering is expressed: **the matches are a
derived collection**, a constraint over `items`, so the live match count comes from the
data and no rendered row is ever counted. That is
the rule from [Large collections](declare-docs:guide:collections) — count the data, not the views —
which is also why handing it a hundred thousand options and virtualizing the list changes
nothing about the code.

Its value is the chosen **member**, not the typed text: hand it records and you get a
record back.

## Tooltips and the focus ring

Two arrive on their own, and knowing they exist is the whole lesson:

- **[`Tooltip`](declare-docs:Tooltip)** — set `tooltipLabel = "…"` on *any* view; the [`Tooltips`](declare-docs:Tooltips) service decides when a tip shows. Delay, placement, edge-flipping and
  theming are nobody's problem at the use site.
- **[`FocusRing`](declare-docs:FocusRing)** — the traveling focus indicator, spliced into any app that uses a
  library control.

Both are singletons spliced in when a program earns one, and **declaring your own by that
name replaces it** — the customization path, not an escape hatch.

## Your own overlay

Every library overlay is a `Floating`, and so is yours: extend the kind you mean, and its
behavior comes with it — the layer it paints in, the policy for presses and scrolls past it,
Esc, focus, and its motion in and out. A photo viewer is a full-screen dialog of your own:

```declare-fragment
class Viewer extends Dialog [ presentation = "full",
    source: string = "",
    Image [ width = 100%, height = 100%, stretches = contain, source = { classroot.source } ]
    ]
```

Each overlay opens into its context's layer: the App keeps two — one for overlays, stacked in
the order they opened, and a notice layer above it for toasts — in a small internal view,
[`OverlayStrata`](declare-docs:OverlayStrata), which you never write, fixed to the App's
viewport so a dialog opened with the page scrolled down is on screen. A view that should paint
somewhere other than where it is declared, without being an overlay — a desktop's minimized
window parked in its dock — says so with [`paintsIn`](declare-docs:View.paintsIn).

---

**What you can now say:** you can put a menu, a context menu, a popover, a dialog, a sheet,
a toast or a filtering picker into an app without a portal, a z-index, or a dismissal
handler — and you know why menus take records rather than children, what each kind does
with a press aimed past it, how a window keeps its own overlays with it, and the ordering
rule that keeps a slow action from freezing one on screen.

[Next: **URLs, links and history** →](declare-docs:guide:urls)
