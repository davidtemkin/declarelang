# Rows of different kinds
<!-- index: different things in one list (classFor), states (State), parts only some rows have (exists) -->

**Use when** one list holds things that are not the same: headings and items, photos and
notes, windows of different apps. Or one kind of row that looks different in different
situations.

```declare
class Entry [ width = 300, height = 30,
    t: Text [ x = 8, y = 6, text = :text ]
    ]
class Note extends Entry [ ]
class Heading extends Entry [ height = 40,
    rule: View [ y = 38, width = 300, height = 1, fill = 0xCCCCCC ] ]

class Message [ width = 300, height = 30,
    t: Text [ x = 8, y = 6, text = :text ],
    pending: State [ applied = { :sent != true }, opacity = 0.5 ]
    ]

App [ width = 340, height = 260, fill = white,
    d: Dataset { { "rows": [ { "id": 1, "kind": "heading", "text": "Today" },
                             { "id": 2, "kind": "note", "text": "Buy milk" } ],
                   "msgs": [ { "id": 1, "text": "sending…", "sent": false } ] } },
    col: View [ width = 100%, datapath = { app.d.value },
        layout: SimpleLayout [ axis = y ],
        Entry [ datapath = :rows[], classFor = { :kind == "heading" ? Heading : Note } ],
        Message [ datapath = :msgs[] ]
        ]
    ]
```

**Rules**
- What a row **is** → a class per kind, picked by `classFor`. The written class is the
  base; the body reads the record and names it or a subclass. A note builds no picture.
- What state a row is **in** (sent/pending, open/closed) → one class with a `State`.
  Its overrides and children apply only while `applied` holds.
- They nest: a class per kind, with states inside.
- Kinds that share a frame (a name, a face and reactions around a bubble): the base class
  names its content child, `defaultplacement = bubble`, and each kind's views go into it —
  laid out in the frame's order, no position arithmetic.
- A part only some rows have (a reaction pill, a status line) → `exists = { … }` on that
  child: built while true, discarded while false, in its place. Its reader handles its
  absence (`classroot.pill?.height ?? 0`). `visible` keeps a view built.
- Something that sits BETWEEN records (a day header, an unread marker, "3 hours later")
  is a row of its own: the derived dataset emits it with its own `id` and kind.
- Don't stack every kind's children in one class and toggle `visible`: hidden views are
  still built.
- `classFor` reads only the record (`:fields`) and names classes; no app state in it.
- A record whose kind changes is rebuilt as its new class, in place.

**Look up** `View.classFor`, `State`, `State.applied`, `View.defaultplacement`.

**Examples** `apps/tracker/tracker.declare`: `ListRow` / `GroupRow` / `IssueRow` ·
`apps/desktop/desktop.declare`: each window record built as its window class ·
`apps/swatchbook/sections/measure.declare`: `LineMeasure`, `WrapMeasure` (classFor) ·
`apps/swatchbook/sections/effects.declare`: `Subject` (States).

**Guide** Large collections § Records of different kinds · Motion and
states § States.
