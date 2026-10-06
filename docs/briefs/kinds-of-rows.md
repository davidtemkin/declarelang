# Rows of different kinds
<!-- index: different things in one list (classFor), states (State), parts only some rows have (exists) -->

**Use when** one list holds things that are not the same: headings and items, images and
text blocks, windows of different apps. Or one kind of row that looks different in different
situations.

```declare
class Entry [ width = 300, height = 30,
    t: Text [ x = 8, y = 6, text = :text ]
    ]
class Item extends Entry [ ]
class Heading extends Entry [ height = 40,
    rule: View [ y = 38, width = 300, height = 1, fill = 0xCCCCCC ] ]

class Task [ width = 300, height = 30,
    t: Text [ x = 8, y = 6, text = :text ],
    finished: State [ applied = { :done == true }, opacity = 0.5 ]
    ]

App [ width = 340, height = 260, fill = white,
    d: Dataset { { "rows": [ { "id": 1, "kind": "heading", "text": "Today" },
                             { "id": 2, "kind": "item", "text": "Buy milk" } ],
                   "tasks": [ { "id": 1, "text": "Order parts", "done": true } ] } },
    col: View [ width = 100%, datapath = { app.d.value },
        layout: SimpleLayout [ axis = y ],
        Entry [ datapath = :rows[], classFor = { :kind == "heading" ? Heading : Item } ],
        Task [ datapath = :tasks[] ]
        ]
    ]
```

**Rules**
- What a row **is** → a class per kind, picked by `classFor`. The written class is the
  base; the body reads the record and names it or a subclass. An item builds no rule.
- What state a row is **in** (done/open, expanded/collapsed) → one class with a `State`.
  Its overrides and children apply only while `applied` holds.
- They nest: a class per kind, with states inside.
- Kinds that share a frame (a title above and actions below a body): the base class
  names its content child, `defaultplacement = body`, and each kind's views go into it —
  laid out in the frame's order, no position arithmetic.
- A part only some rows have (a sale badge, a status line) → `exists = { … }` on that
  child: built while true, discarded while false, in its place. Its reader handles its
  absence (`classroot.badge?.height ?? 0`). `visible` keeps a view built.
- Something that sits BETWEEN records (a section heading, a divider) belongs to the row
  after it: the list provides its records (`rows: array = { :items ?? [] }`), the row
  reads the one before it (`provided("rows")[rowIndex - 1]`) and gives that child `exists`.
- Don't stack every kind's children in one class and toggle `visible`: hidden views are
  still built.
- `classFor` reads only the record (`:fields`) and names classes; no app state in it.
- A record whose kind changes is rebuilt as its new class, in place.

**Look up** `View.classFor`, `State`, `State.applied`, `View.defaultplacement`, `View.rowIndex`.

**Examples** `apps/tracker/tracker.declare`: `ListRow` / `GroupRow` / `IssueRow` ·
`apps/desktop/desktop.declare`: each window record built as its window class ·
`apps/swatchbook/sections/measure.declare`: `LineMeasure`, `WrapMeasure` (classFor) ·
`apps/swatchbook/sections/effects.declare`: `Subject` (States).

**Guide** Large collections § Records of different kinds · Motion and
states § States.
