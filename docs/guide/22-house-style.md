<!-- nav: House style -->
<!-- part: Appendix -->

# House style — the one shape every Declare file takes

There is exactly one canonical form for a Declare program, and a tool produces it:

```bash
node tools/format.mjs --write app.declare
```

Run it on save and your files match every other file in the corpus. Because canon is
deterministic, formatting an already-formatted file changes nothing — so `--check` is a
gate you can put in CI, and "what does canon look like?" always has one answer.

You do not need to memorize this appendix. It is here so the shape is legible when you
read someone else's file, and so a program written without the formatter to hand still
lands close. What the formatter cannot decide for you is **naming** — camelCase — and that
**a leaf goes on one line**, which most of a UI is.

## Indentation and commas

Four spaces, everywhere.

Members are separated by commas at every level, and the separator is required — leave one
out and the compiler names the spot. Nothing follows the last member: no comma before a
closing `]`, whether it hangs on its own line or sits inline.

## The header line

A parent's plain configuration — `name = value` pairs — rides the header line, next to the
opening bracket. Declarations, methods, states, layouts, and child instances each take a
line of their own; they never share the header line with plain config.

```declare-fragment
card: View [ width = 220, height = 96, cornerRadius = 8, fill = { theme.surface },

    title: Text [ x = 12, y = 10, fontWeight = medium, text = :name ],
    body:  Text [ x = 12, y = 32, textColor = { theme.textMuted }, text = :summary ]
    ]
```

`width`, `height`, `cornerRadius`, and `fill` are plain config and stay on the header.
`title` and `body` are child instances, so each starts its own line.

A body's *first* member may open on the header line whatever its kind — this is how a class
with one declaration reads best:

```declare-fragment
class Screen extends View [ shown: boolean = false,
    opacity = { shown ? 1 : 0 },
    visible = { opacity > 0 }
    ]
```

How far to fill the header is yours. The formatter is **line-preserving**: it never packs
members onto a fuller line and never re-wraps a long one. Your line breaks are canonical.
Its business is what happens *within* and *between* the lines you chose.

## Two closing styles

The test is what *kind* of members a body holds, not how many lines it spans.

A **leaf** holds attributes only — config and bindings, no child instance, no method, no
state, no declaration. It closes **inline**, the `]` riding the last content line, even
when the attributes wrapped:

```declare-fragment
icon: Image [ x = 1, y = 1, width = 32, height = 32, stretches = both,
    source = { :code != null ? "icons/" + :code + ".png" : "" } ],
```

Any body holding a child, a method, a state, or a declaration closes **hanging** — the `]`
alone on its own line, at the body's own indent. One non-attribute member is enough:
`row` below is otherwise plain config, but its `detail` child forces the hang.

```declare-fragment
row: View [ width = { parent.width }, height = 28, clip = true,
    detail: View [ width = { parent.width } ]
    ],
```

## Wrapped leaves

When a leaf's attributes don't fit, the continuation sits at **block indent** — the
member's own indent plus one level — not visually aligned under the first attribute.

Block indent is stable: visual alignment churns every time the opening line changes, and
drifts content far to the right after a long opener. A wrapped attribute and a nested child
therefore share a column; you tell them apart by syntax (`attr = value` versus
`name: Type [`), which is enough.

Attributes stay in the order you wrote them. The formatter never reorders them.

## Breathing

Class and `App` bodies breathe. A blank line after the header, blank lines between member
*groups* — declarations, then layout, then each multi-line child, then states, then
handlers — and a blank line before the hanging close. This is what makes a body scan as an
outline instead of a wall.

```declare-fragment
App [ width = 240, height = 320, fill = { theme.bg },

    zip: string = "94403",

    weather: DataSource [ url = { "/data/weather/" + app.zip + ".json" } ],

    // ── entry screen — shown until the data lands ──

    splash: Screen [ shown = { !app.weather.loaded },
        Text [ x = 20, y = 140, text = "Fetching…" ]
        ]
    ]
```

Deep composition stays **tight**. A nested body whose members are all one-line leaves gets
no interior blanks — they are close enough kin that whitespace between them is noise:

```declare-fragment
StatRow [ label = "Humidity",  value = :atmosphere.humidity ],
StatRow [ label = "Barometer", value = :atmosphere.pressure ],
StatRow [ label = "Windspeed", value = :wind.speed ],
```

Airiness marks the outline's *major joints* — declarations versus layout versus children
versus states — not every joint in the tree.

## Methods

A short, single-statement body inlines on the signature line:

```declare-fragment
onClick() { select() },
onInit()  { weather.fetch() },
```

A multi-statement body puts its statements one level in and closes with a hanging `},`:

```declare-fragment
select() {
    for (const t of parent.children) t.sel = (t === this)
    },
```

### Long conditionals

The multi-arm ternary is Declare's conditional workhorse, and it has a shape: one arm per
line, broken **before** the `:`, conditions aligned, the default arm indented into the same
column — so the answers read as one ragged-right column.

```declare-fragment
periodLabel: string = {
    app.mode == "year"  ? "" + app.year
  : app.mode == "month" ? app.monthName(app.month) + " " + app.year
  : app.mode == "week"  ? app.weekLabel(app.anchorKey)
  :                       app.dayLabel(app.anchorKey) },
```

Top to bottom it reads as a decision table — tests on the left, answers on the right. The
contrast is the point: a multi-arm ternary jammed onto one line is unscannable at exactly
the moment the logic most needs scanning.

## Comments

`// ` — two slashes, one space, then text — indented to the level it sits at. A standalone
comment block is blank-padded above and below. The blank below does not detach the comment
from the member under it; the padding is what lets commentary read as commentary instead of
crowding the code. Nothing is padded above the first thing in a file or body, and nothing
is forced against a closing bracket.

Trailing comments ride the line they annotate and are exempt from that padding:

```declare-fragment
size: number = 0,             // 0 = the theme's checkbox size
```

Their gap has a two-space minimum and no maximum — at or above the floor, your spacing is
preserved exactly. Aligning trailing comments across neighbouring lines is yours to do.
This is the one exception to the rule below.

## No row-to-row alignment

Values are single-spaced, and columns are never padded into a table across sibling rows.

```declare-fragment
StatRow [ label = "Humidity", value = :atmosphere.humidity ],
StatRow [ label = "Barometer", value = :atmosphere.pressure ],
StatRow [ label = "Wind Chill", value = :wind.chill ],
```

not

```declare-fragment
StatRow [ label = "Humidity",   value = :atmosphere.humidity ],
StatRow [ label = "Barometer",  value = :atmosphere.pressure ],
StatRow [ label = "Wind Chill", value = :wind.chill ],
```

Aligned columns re-flow every sibling when the longest item changes: adding one long label
rewrites all three rows, where single-space touches only the line you edited. The diff then
shows what you changed rather than what the alignment did.

## Grouping is yours

How attributes group into lines is a judgment call. The canon recommends by example and
never legislates it — there are more useful arrangements than a rule could anticipate, and
the formatter keeps the one you chose.
