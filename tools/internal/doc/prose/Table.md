The list collection, componentized: the selection-bearing, scroll-owning frame around a
replicated (or written) set of `TableRow` children — the selection model in one
place, so no app hand-rolls it. Selection is the Table's **value**: `selectedItem` (the
primary item) and `selection` (all of them, presented order) hold **items** — the
record for a replicated row, the row view itself for a written one — identified by the
same convention the reconciler uses (a record's `id`, else the object). `activeItem` is the
keyboard position, distinct from selection; `selects = "none" | "single" | "multi"`
declares the mode.

```declare
Table [ width = 300, height = 400, datapath = { app.d.value },
    selects = "multi", commit(sel: object) { app.chosen = sel },
    TableRow [ datapath = :rows[], height = 30,
        t: Text [ x = 8, y = center, text = :label ] ]
    ]
```

The full gesture and keyboard protocol rides along: click selects, ⌘-click toggles,
shift ranges from the anchor; arrows move-and-select, shift-arrows extend, ⌘-arrows walk
the position alone with Space toggling (discontiguous selection by keyboard). Ranges and
travel read the **data**, never the instances, so `virtualize = true` on the row
template composes: a range can cross 500 unmaterialized rows and arrow travel scrolls
its destination into existence. One tab stop; `commit(sel)` delivers when the app owns
the value (the default writes the attributes), and `selection <-> app.chosen` says both at once.

## selectedItem
The primary selected item, or null — the detail panel's anchor. Reactive.

## selection
Every selected item, presented order (null = none). Reactive; assign through the
protocol or `commit`, never mutated in place.

## activeItem
The item the keyboard stands on — moved by arrows, independent of selection (the
⌘-walk). Reactive.

## selects
The mode: `"none"`, `"single"` (default), or `"multi"`.

## commit()
The delivery seam: every gesture lands here; the default writes
`selection`/`selectedItem`, and a use-site override redirects the edit to its owner.

## clearSelection()
The explicit deselect-all — selection never clears on Esc.
