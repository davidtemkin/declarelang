# Declare formatting — the canonical spec

This is the canon: the human style the language is written in, and the
implementation contract for the tool that enforces it. It **supersedes**
the earlier `indent.txt` sketch (since removed).
[§12 of declare-language.md](declare-language.md#12-formatting-and-naming) states
the load-bearing rules in brief (members comma-separated with a trailing
comma, one attribute-name vocabulary, camelCase); this document is the full
canon those rules extend into, plus the prettyprinter that enforces it.

The reference artifact is
[weather.declare](weather.declare) — every rule below is
extracted from its rhythm, not invented in the abstract. Where an example is
needed that uses landed grammar only, it is redrawn from
[neolang/apps/weather/weather.declare](../neolang/apps/weather/weather.declare),
the one real formatted app. (weather.declare itself still carries
unlanded/rejected surface — bare-string `Text [ "OK", … ]`, `<->`, `schema`,
`state`, `<-` — see "v1 scope" below for what that means for the tool.)

Ruled by the human, 2026-07-02. **Revised 2026-07-03:** row-to-row column
alignment — the original §3 "hallmark" — was reversed to **single space**
(new §3), and wrapped continuations moved from visual alignment to **block
indent** (§2.5). **Revised 2026-07-12:** top-level declarations are separated
by **one** blank line, not two (§2.1). **Revised 2026-07-13** (the
formatter-v1 rulings, raised while building the tool and settled against the
exemplar, `apps/viewer/viewer.declare`): the trailing comma is a
**terminator** at hanging closes and omitted at inline closes (§2.1); the
formatter is **line-preserving** — it never packs or re-wraps, header filling
is authoring guidance (§2.2, §4 — ratified with recorded hesitation);
tiered-airiness blanks are discretional (§2.3, §4); a one-line top-level
declaration stays one line (§2.4); standalone comment padding is **mandated
both sides** (§2.7); the top-level separator is **normalized** — one blank
after a one-line declaration, two after a multiline one, superseding the
2026-07-12 flat-one rule (§2.1, §4); trailing-comment gaps have a
**two-space minimum and no maximum** — above the floor the author's spacing
(alignment included) is preserved verbatim, the one ruled exception to §3
(§2.7, §3; this supersedes the same day's short-lived 4–10 band); and blank
runs elsewhere clamp to **two** at top level, **one** inside a body (§4).
A same-day appearance review added ruled **guidance** — author judgment the
formatter never enforces: the long-conditional shape (§2.6), grouping
recommended by example (§2.8), and the aligned ledger named and encouraged
(§3). The dial settings are the human's; everything else follows from the
reference artifact's own practice.

---

## 1. Why a canon at all

Members are comma-separated and order-inert (§7's constraint model, §12's
"clean reordering and diffs") — which means *nothing* in the grammar forces
a particular layout. Two authors can write semantically identical markup
that looks nothing alike. Declare's readability bet — that a UI tree reads
like the picture it draws — only pays off if the tree is laid out the same
way everywhere. So: one house style, one tool that enforces it, and authors
spend zero attention on it once the tool exists.

The canon has two parts. **STRUCTURE** (§2 below) says what goes on its own
line, what shares a line, and where blank lines fall. **SPACING** (§3) rules
out row-to-row column alignment — values are single-spaced, so a file reads
by its structure and density, not by hand-tended columns. **DIALS** (§4)
names the two things a formatter run can be asked to vary. §5 is the
prettyprinter's implementation contract.

---

## 2. Structure

### 2.1 Indentation, commas, blank lines between top-level declarations

Four-space indentation, everywhere. Members are comma-separated at every
level, and the comma is a **terminator, not a separator** (ruled 2026-07-13
— Go's rule): every member that ends its own line ends with a comma,
**including the last member before a hanging close** — that is what makes
reordering a clean diff (§12's rationale stands). Before an **inline** close
the comma is omitted: the bracket rides the last attribute (`… text = :day ],`)
and the member's own comma sits after it, where a comma *inside* would buy
nothing. Neither form is a parser error — the grammar accepts both — the
**formatter owns enforcement**: `--check` fails a comma before an inline
close or a missing terminator before a hanging close, and `--write` fixes
both.

The separator between top-level declarations — `script { }`, `class`, `App`,
a future `stylesheet` — is **normalized by the preceding item's shape**
(ruled 2026-07-13, superseding the 2026-07-12 flat-one rule): exactly **one**
blank line after a one-line declaration (`font Sans [ family = "system-ui" ]`),
exactly **two** after a multiline one — a big declaration earns a bigger
breath, and the formatter enforces the count rather than leaving it to
discretion. A comment describing a declaration counts as **part of the item
it documents**: the separator's blanks sit *above* the comment, and the
comment sits directly above its declaration with its own §2.7 padding blank
below — so a commented declaration reads as the separator closing off the
previous item, the comment, then one blank opening the declaration.
Redrawn from weather.declare:

```Declare
class Screen extends View [ shown: boolean = false,
    width = 100%, height = 100%,
    opacity = { shown ? 1 : 0 },
    visible = { opacity > 0 },
    ]


class WeatherSummary extends View [ fontSize = 12, fontFamily = "Helvetica", …
```

and with a comment above the next declaration (two blanks — Screen is
multiline — then the comment snug on its declaration, padded below):

```Declare
    ]


// a full-bleed layer that cross-fades on `shown`

class Screen extends View [ shown: boolean = false,
```

### 2.2 The header line

A parent's plain literal configuration — `name = value` pairs with no
child structure — rides the **header line**, filled toward the width limit
before the body drops to its own lines. Declarations (`label: string = …`),
methods, states, layout, and child instances each get a line of their own;
they never share the header line with plain config. (A body's **first**
member may open on the header line whatever its kind — `class Screen extends
View [ shown: boolean = false,` — and a declaration, method, or child always
*ends* its line; only plain attrs pack after one another.)

**How far to fill the header is the author's** (ruled 2026-07-13, with
recorded hesitation): filling toward the width limit is *authoring guidance*,
not something the tool computes — the formatter is **line-preserving**. It
never packs members up onto a fuller line and never re-wraps an over-long
one; the author's line breaks are canonical, and the formatter's business is
what happens *within* and *between* the lines the author chose (§4). From
weather:

```Declare
class WeatherSummary extends View [ backgroundColor = #000000, width = 34, height = 34, x = 10,

    icon: Image [ x = 1, y = 1, width = 32, height = 32, stretches = both,
        source = { :code != null ? `resources/icons/${:code}.gif` : "" } ],

    day: HelvCap [ x = 42, width = 140, fontSize = 12, text = :day ],
    desc: HelvCap [ x = 42, y = 14, width = 120, fontSize = 11, fontWeight = normal, text = :text ],
    …
    ]
```

`backgroundColor = #000000, width = 34, height = 34, x = 10` is plain
literal config and stays on the header; `icon`, `day`, `desc` are child
instances and each starts its own line.

### 2.3 Tiered airiness

Class and `App` bodies **breathe**: a blank line after the header line,
blank lines between member *groups* (declarations, then layout, then each
multi-line child, then states, then handler clusters), and a blank line
before the hanging close. This is what makes a class body scannable as an
outline rather than a wall.

```Declare
App [ width = 240, height = 320, backgroundColor = #EAEAEA,

    zip: string = "94403",

    weatherData: DataSource [ url = { `/data/weather/${zip}.json` } ],

    bg: Image [ source = "resources/weather_bg.jpg" ],

    // ── entry screen — shown until data loads; loading + error inline ──

    splash: Screen [ shown = { !weatherData.loaded },
        …
        ],
    ]
```

Deep composition, by contrast, stays **tight**: a nested body whose members
are all one-line leaves gets no interior blanks — the leaves are close
enough kin that whitespace between them would just be noise. Compare the
label/value StatRow calls in weather:

```Declare
StatRow [ label = "Humidity:", value = :atmosphere.humidity ],
StatRow [ label = "Barometer:", value = :atmosphere.pressure ],
StatRow [ label = "Windspeed:", value = :wind.speed ],
StatRow [ label = "Sunrise:", value = :astronomy.sunrise ],
StatRow [ label = "Sunset:", value = :astronomy.sunset ],
StatRow [ label = "Wind Chill:", value = :wind.chill ],
```

— six leaves, zero blank lines, tight because they are one visual unit (the
detail block). Airiness marks the outline's *major joints* — declarations
vs. layout vs. children vs. states — not every joint in the tree.

**Tier blanks are discretional** (ruled 2026-07-13): the after-header,
between-group, and before-close blanks above are the *default shape a human
reaches for*, guidance rather than mandate. The formatter **preserves** the
author's choices here — it neither inserts a tier blank the author left out
nor removes one the tier rule doesn't call for (§4's CLAMP caps are the only
ceiling). The mandated blanks are the top-level separator (§2.1) and comment
padding (§2.7), nothing else.

### 2.4 Two closing styles

The test is what *kind* of members a body holds, not how many source lines
it happens to span. A **leaf** body holds attributes only — literal
config and bindings, no child instance, no method, no state, no nested
declaration — and closes **inline**, its `],` attached to the last content
line, even when the attributes themselves wrapped onto a continuation
line. Any body that holds a child instance, a method, a state, or a
declaration closes **hanging**: the `],` sits alone on its own line, at
the body's own indent — regardless of whether each individual member
happens to render on one source line.

Leaf, wrapped attributes, still closes inline (the bracket rides the last
attribute's line):

```Declare
icon: Image [ x = 1, y = 1, width = 32, height = 32, stretches = both,
    source = { :code != null ? `resources/icons/${:code}.gif` : "" } ],
```

A leaf that contains even one non-attribute member stops being a leaf and
hangs — `container` below is otherwise plain config, but its `details`
child forces the hang:

```Declare
container: View [ width = { parent.width }, visible = { classroot.contentvisible },
    options = releasetolayout, y = 25, clip = true,
    details: View [ width = { parent.width } ],
    ],
```

And a body with several non-attribute members hangs the same way, whether
those members are themselves one line or many:

```Declare
class WeatherTab extends View [ width = 100%,

    label: string = "default title",
    sel: boolean = false,
    openHeight: number = 255,

    height = { sel ? openHeight : 25 },

    select() {
        for (const t of parent.children) t.sel = (t === this)
        },

    top: View [ width = { parent.width },

        onClick() { select() },

        bg: Image [ source = "resources/tab.png", width = { parent.width }, height = 25,
            stretches = width, opacity = { sel ? 0.33 : 1 } ],
        icon: Image [ source = "resources/slider_icon2.png", x = 2, y = 3 ],
        caption: ShadowText [ text = { label }, x = 15, y = 4, dy = 1, shadowColor = #3B4057,
            color = { sel ? 0xFFFFFF : 0xCAD0EC } ],
        ],
    ]
```

`class WeatherTab`'s body holds a declaration run, a method (`select()`),
and a child instance (`top`) — hangs. `top`'s own body holds a handler
(`onClick`) and three child instances (`bg`/`icon`/`caption`) — also
hangs, even though every one of those four members individually fits on
one line: the *kind* of member, not the line count, is what's being
tested. `bg`/`icon`/`caption` themselves, each attributes-only, close
inline.

**Top-level declarations are the one fixed exception.** `script { }`,
`class`, and `App` always close hanging, whatever they contain — including
a class as plain as `Screen`, whose body is nothing but attributes:

```Declare
class Screen extends View [ shown: boolean = false,
    width = 100%, height = 100%,
    opacity = { shown ? 1 : 0 },
    visible = { opacity > 0 },
    ]
```

A top-level declaration is never a comma-separated list item riding a
line with siblings — there is nothing for it to attach inline *to* — so
it always gets its own closing line, leaf or not. The leaf/hanging choice
in this section is about members *nested inside* a body (children,
declarations, methods, states); it does not reach the outermost
declaration itself.

**The one-line exception is official** (ruled 2026-07-13): a top-level
declaration the author kept on a **single line** stays a single line —

```Declare
font Sans [ family = "system-ui" ]
```

— the hanging rule above is about bodies that *span* lines (its rationale is
the closing line, and a one-liner has none). The moment such a body wraps,
or holds a non-attribute member, it hangs like any other top-level
declaration.

### 2.5 Wrapped leaves — block indent

When a leaf's attributes don't fit the header line, the continuation sits at
**block indent — the member's own indent plus one level** — *not* visually
aligned under the opening bracket's first attribute. Attributes stay in the
order the author wrote them; the formatter never reorders them (order is
semantically inert, but it's the author's call, and reordering would make
diffs noisy for no gain):

```Declare
icon: Image [ x = 1, y = 1, width = 32, height = 32, stretches = both,
    source = { :code != null ? `resources/icons/${:code}.gif` : "" } ],
```

Block indent (`source` one level in from `icon:`) rather than visual
alignment (`source` under `x`) is rustfmt's documented default, for the same
reason single-space beats column alignment (§3): visual alignment churns
whenever the opening line changes, and drifts content far right on a long
opener, whereas block indent is stable and needs no recomputation. A wrapped
attribute line and a nested child therefore share a column; they are told
apart by syntax (`attr = value` vs `name: Type [`), not by indent — which is
enough.

### 2.6 Methods and handlers

A short, single-statement body inlines on the signature line:

```Declare
onClick() { select() },
onInit() { Focus.setFocus(this) },
```

A multi-statement body puts its statements at +1 indent, closing with a
hanging `},`:

```Declare
select() {
    for (const t of parent.children) t.sel = (t === this)
    },

draw(d) {
    d.strokeStyle = "#1A1A1A"; d.lineWidth = 2;
    d.beginPath(); d.rect(1, 1, this.width - 2, this.height - 2); d.stroke()
    },
```

(`draw` above happens to render two statements per source line — that is
the author's choice inside the `{ }` body, which the formatter treats as
opaque TS text; see §5.)

#### Long conditionals — one arm per line, broken before the `:`

`{ }` interiors are formatter-verbatim (§5.3), but the house has a shape for
the multi-arm ternary — Declare's conditional workhorse (guidance, ruled
2026-07-13: the author's hand, never the tool's): one arm per line, the line
broken **before** the `:`, conditions column-aligned, and the default arm
indented into the same column, so the answers read as one ragged-right
column. calendar's `periodLabel` is the exemplar:

```Declare
periodLabel: string = {
    app.mode == "year"  ? "" + app.year
  : app.mode == "month" ? app.monthName(app.month) + " " + app.year
  : app.mode == "week"  ? app.weekLabel(app.anchorKey)
  :                       app.dayLabel(app.anchorKey) },
```

Top to bottom it reads as a decision table — tests on the left, answers on
the right. The contrast, stated plainly: a multi-arm ternary jammed onto one
line is the single worst-looking shape in the corpus, unscannable at exactly
the moment the logic most needs scanning.

### 2.7 Comments

`// ` — two slashes, one space, then text. A comment is indented to the
level it sits at, and a standalone comment block is **blank-padded above and
below — mandated** (ruled 2026-07-13; the formatter inserts a missing blank
on either side). The blank below does not detach the comment from the member
under it — the comment still documents that member — the padding is what
lets commentary read as commentary instead of crowding the code. Two
exceptions: no blank is needed above the *first* thing in a file or body
(the first-in-block exception), and no blank is forced against a closing
bracket.

Trailing inline comments (`onMouseUp() { weatherData.clear() },   // back
to entry — declaratively`) ride the code line they annotate and are exempt
from the padding rule. Their gap has a **two-space minimum and no maximum**
(re-ruled 2026-07-13, superseding the same day's short-lived 4–10 band): a
0–1-space gap widens to two, and everything at or above the floor is the
**author's spacing, preserved verbatim** — so deliberately aligning trailing
comments across neighbouring lines is unrestricted, at the author's
discretion (the gofmt school). This is the one ruled exception to §3's
no-alignment rule.

App-level region banners use a heavier double-em-dash form and are
preserved verbatim by the formatter (it never rewrites banner *text*, only
re-indents/re-blanks around it per the comment rule):

```Declare
// ── entry screen — shown until data loads; carries loading + error inline ──

Screen [ shown = { !weatherData.loaded }, resource = weather_splash,
```

### 2.8 Attribute grouping — recommended by example, never legislated

How attributes group into lines is a **judgment call for the code writer**
(ruled 2026-07-13): we cannot imagine all the variations that will be
useful, so the canon recommends by example and never legislates. One
attribute per line everywhere would be a mistake — it flattens the very
signal grouping carries. For example, consider:

**The ledger** — one attribute per line, colons and values column-aligned,
for a declaration run that is really a table (slider.declare; alignment is
the author's opt-in, §3):

```Declare
value: number = 0,
min:   number = 0,
max:   number = 100,
step:  number = 1,
```

**The quatrain** — consecutive parallel one-liners whose repetition *is*
the meaning (calendar's focus-rectangle springs):

```Declare
Spring [ attribute = c0, to = { app.c0To }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
Spring [ attribute = r0, to = { app.r0To }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
Spring [ attribute = nc, to = { app.ncTo }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
Spring [ attribute = nr, to = { app.nrTo }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
```

**Geometry pairs** — coordinates that belong together share a line
(`x = 0, y = 16,`), rather than being torn onto two.

And a consideration rather than a rule: **parallel siblings read best in
parallel form** — same class, same job, same shape and attribute order — so
a reader who has parsed one has parsed them all (the StatRow run in §3, the
quatrain above).

---

## 3. Spacing — no row-to-row alignment

**Values are single-spaced, and columns are never aligned across sibling
rows.** A run of similar members is *not* padded into a table:

```Declare
StatRow [ label = "Humidity:", value = :atmosphere.humidity ],
StatRow [ label = "Barometer:", value = :atmosphere.pressure ],
StatRow [ label = "Wind Chill:", value = :wind.chill ],
```

not

```Declare
StatRow [ label = "Humidity:",   value = :atmosphere.humidity ],
StatRow [ label = "Barometer:",  value = :atmosphere.pressure ],
StatRow [ label = "Wind Chill:", value = :wind.chill ],
```

This **reverses** the 2026-07-02 ruling that had made value-column and
name/class alignment the style's hallmark. Three practical wins retire it:

- **Diff stability.** Aligned columns re-flow every sibling when the longest
  item changes — adding `"Wind Chill:"` reforces all six rows; single-space
  touches only the line you edit. (gofmt, Black, and Prettier all decline
  vertical alignment for this reason; PEP 8 — the whitespace-strictest canon
  there is — forbids it outright.)
- **Searchability.** `value = :` is a literal match across every row; aligned
  columns force a regex (`value +=`) to absorb the variable spaces.
- **No hand-maintenance.** Nobody aligns columns by hand and keeps them
  aligned through a rename. Single-space is what a machine and a human both
  produce with zero effort — the whole point of a canon that asks the author
  to spend no attention on layout.

The cost is real but small and confined to genuinely tabular blocks (the
`schema` tree, the StatRow detail run), where indentation and the
self-contained per-line `[ … ]` already carry the structure. It reads as a
"slight negative" in review, and the wins were judged to dominate.

Name-colon, class-token, state-override `=`, and handler-signature `{`
alignment — every column the superseded ruling specified — are **all** off,
for the same reasons. One rule: single space, everywhere.

**One ruled exception (2026-07-13): trailing `//` comments.** Their gap is
the author's own above a two-space floor, with no upper bound (§2.7), so
trailing comments *may* be aligned across neighbouring lines at the author's
discretion. The alignment ban governs the code columns themselves, not the
commentary hanging off their ends — a trailing-comment column never re-flows
a code token, so the diff-stability and searchability arguments above don't
bite.

**The one escape hatch, should a local table ever be wanted:** gofmt's rule
— *a blank line bounds an alignment group.* If alignment ever returns it
would be opt-in and reset at every blank line, keeping its churn local. The
default is simply off.

**The escape hatch is now exercised: the aligned ledger, named and
encouraged (ruled 2026-07-13).** Where a run of parallel members is
genuinely tabular, column alignment at the **author's opt-in** is the
house's best look — the trailing-comment discretion (§2.7) extended to the
run itself. slider.declare's declaration block (§2.8) and focusring.declare's
Spring travel block are the exemplars:

```Declare
Spring [ attribute = x,      to = { tx }, stiffness = 220, damping = 16 ],
Spring [ attribute = y,      to = { ty }, stiffness = 220, damping = 16 ],
Spring [ attribute = width,  to = { tw }, stiffness = 220, damping = 18 ],
Spring [ attribute = height, to = { th }, stiffness = 220, damping = 18 ],
```

The machine default stays single-space and the formatter never *builds* a
column — the ledger is the author's to make and the author's to keep, bounded
by a blank line per the escape hatch above. (Enforcement note — implemented,
2026-07-13: `--write` preserves an author's run of **2+ spaces** between
same-line tokens verbatim wherever a space belongs, and `--check` does not
flag it; a 0-space gap still normalizes to the canonical spacing, glue
positions — commas, dots, call parens, the replication `[]` — stay glued,
and a single space stays a single space. The same
below-the-floor-normalize, at-or-above-preserve school as the
trailing-comment gap, §2.7.)

> **Landed apps predate this ruling.** `weather.declare` is still written
> in the aligned style and now diverges from canon; it awaits a single-space
> reformat pass (a mechanical, semantics-preserving change — §5.6 gates it).
> The single-space examples above are drawn from
> [weather.declare](weather.declare), which this session's edits already bring
> into conformance.

---

## 4. Dials

Two things about a formatter invocation are parameters, not house style:

**Width.** A guideline of **120** columns — how far an author fills a header
line before dropping to a continuation. Ruled 2026-07-13 (with recorded
hesitation): it guides the *hand*, not the tool — the formatter is
**line-preserving** and never packs members onto a fuller line or re-wraps an
over-long one (§2.2), so width enforcement is not part of the v1 tool's
contract and the earlier `--width` re-flow dial is retired with it.

**Blank lines: CLAMP mode** (ruled 2026-07-13). The formatter enforces the
*mandatory* blanks — the **normalized top-level separator** (§2.1: exactly
one blank after a one-line declaration, exactly two after a multiline one,
overriding the author's count in both directions) and the comment padding
(§2.7) — and elsewhere clamps every run of consecutive blank lines to at
most **two at top level** (around detached comment blocks such as a file
header) and **one inside any bracket body**. Below those caps, it
**respects the author's own blank-line choices**: if an author left a class
body tight where the tiered-airiness default would have added a blank, or
added an extra blank the tier rule doesn't call for, the formatter leaves
it. Tiered airiness (§2.3) is the *default* shape a human reaches for —
discretional, per its own section; CLAMP mode does not force it back onto
text that deliberately reads differently.

Everything else in this document — indentation, comma placement, closing
style, single-space spacing — is **not** a dial: it is enforced identically
regardless of input shape.

---

## 5. The prettyprinter — implementation contract

### 5.1 Where it lives

`tools/format.mjs` (built 2026-07-13). Modes: `node tools/format.mjs <file>`
prints the formatted source to stdout; `--write <files…>` rewrites in place
(only when changed); `--check <files…>` exits 1 if any file is not canon (the
CI/verify hook). There is no `--width` tunable — the formatter is
line-preserving (§4). It has zero runtime-graph impact — it never runs as
part of compilation, only as a standalone tool (and, later, editor tooling).
Its gates live in `test/format.test.mjs` (part of `npm test`).

### 5.2 Prerequisite: parser TRIVIA mode

The formatter cannot be built on top of today's parser as-is: comments,
exact literal spellings, and blank-line counts are not information the
compiler's AST needs, so nothing currently preserves them positionally.
The parser (`neolang/src/parser.ts`) grows an **opt-in TRIVIA mode**:

- comments are attached to the nearest following (or, for trailing
  comments, preceding) syntax node, with their original text untouched;
- literal spellings are preserved verbatim rather than normalized (a
  `0xCAD0EC` numeric-color literal and a `#CAD0EC` hex-color literal parse
  to the same value but must round-trip to their *original* spelling — see
  §5.5);
- blank-line *counts* between sibling members are recorded (needed for
  CLAMP mode, §4, to tell "the author put one blank here" from "the author
  put three").

TRIVIA mode is **off** during ordinary compilation (it would be pure
overhead on the hot path) and is a **shared asset** beyond formatting — the
same attachment/preservation machinery is what a future language server or
doc-generation tool needs to show source-faithful hovers, so it is built
once, generally, not as a formatter-only hack.

### 5.3 `{ }` and `script { }` bodies: verbatim passthrough (v1)

TypeScript bodies — `{ }` constraint/handler/method bodies and top-level
`script { }` blocks — are **not** reformatted by v1. The formatter treats
them as opaque text, re-indents the block as a whole to its new position
(shifting every line by the same delta), and leaves the TS text inside
untouched otherwise. This keeps the formatter out of the business of
having a TypeScript style opinion and keeps v1 small. The bracket *shape* is
still Declare's — the opening `{` rides the signature/header line and the
closing `},`/`}` hangs at body indent per §2 — but the expression text
between them is TS's own; only the Declare-owned bracket skeleton is normalized.
Revisiting whether to reformat interior TS (matching the declarative
bracket style, per the seam in language-doc §3) is future work, not a v1
gap to apologize for.

### 5.4 v1 scope: the landed grammar only

v1 targets the **landed** grammar — the constructs `neolang/src/parser.ts`
actually accepts today. Stated honestly: **weather.declare itself is
not v1-formattable**, because it deliberately showcases surface that is
either unlanded or since rejected — bare-string `Text [ "OK", … ]`
(rejected, HANDOFF.md R3), `<->` two-way binding (deferred to the
editable-text era), `schema = [ … ]` (Schema is designed, not implemented
— HANDOFF §13), `state … when { … } [ … ]` (states are a settled *language*
construct per language-doc §10, but not yet in `parser.ts`'s accepted
grammar as of this writing), and `<- Keys` event subscriptions (deferred
per the R6/weather rulings on `event`/`<-`). None of that is a defect in
this spec — every rule above is stated in terms general enough to already
cover those constructs (a `state` block is "a member whose body contains
multi-line members," same as any other; a `<->` binding is an attribute
value like any other) — it is simply that the *tool* cannot exercise those
paths until the grammar lands them.

The **test corpus** is therefore the landed programs:
`neolang/apps/weather/weather.declare` first (the one real formatted
app, and the source of every "landed-grammar" example in this document),
then whatever else lands as Declare apps accumulate. As `state`/`<->`/`event`
land in the grammar, they join the corpus and the worked examples above
that had to be redrawn from weather can be redrawn again from
weather.declare directly, closing the gap between "canon" and
"the reference artifact" for good.

### 5.5 Semantic no-op, by construction

The formatter must never change what a program *means*. Concretely:

- **Token-identical output.** Strip comments from the input and the
  output's token streams and they must be equal — the formatter only ever
  moves whitespace and comments around; it never adds, removes, or
  reorders a semantic token (attribute reordering is explicitly out of
  scope — §2.5).
- **Original literal spellings preserved.** `0xCAD0EC` stays `0x…`;
  `#CAD0EC` stays `#…`. (Once alpha-bearing `#RGBA`/`#RRGGBBAA` forms exist
  per the styling ruling, the same rule covers them — the formatter never
  normalizes a color literal's base or digit count.)
- **Comment text never changes** — only comment *placement* (indentation,
  surrounding blank lines) is something the formatter may adjust.

### 5.6 Gates

A formatter change is accepted only when all of the following hold:

1. **Idempotence.** Formatting a file twice produces byte-identical output
   to formatting it once. (If the formatter ever "improves" its own
   output on a second pass, some rule is under-specified or the
   implementation is non-deterministic — either way, a bug.)
2. **Token-identity vs. input**, per §5.5 — proven on the whole test
   corpus, not spot-checked.
3. **The perceptual suite stays green** after formatting the real app
   sources (weather today, more apps as they land) — formatting must
   never perturb a running program's rendered output, which is the
   strongest evidence the "semantic no-op" property actually holds in
   practice, not just in the token-stream proof.

### 5.7 Sequencing

Implementation is **queued** behind the in-flight styling rung and behind
motion v1 — both of those touch `parser.ts`, and landing the formatter
concurrently would mean building TRIVIA mode against a moving grammar
target twice. Once styling and motion v1 are landed, the formatter rung
begins with the TRIVIA-mode parser change (§5.2), then `format.ts` itself,
then the corpus gate (§5.6) against weather — whose first formatted pass
is also its single-space reformat (§3), bringing the landed app back into
conformance with this canon.
