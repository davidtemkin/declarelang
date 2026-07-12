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
[neolang/apps/neoweather/neoweather.declare](../neolang/apps/neoweather/neoweather.declare),
the one real formatted app. (weather.declare itself still carries
unlanded/rejected surface — bare-string `Text [ "OK", … ]`, `<->`, `schema`,
`state`, `<-` — see "v1 scope" below for what that means for the tool.)

Ruled by the human, 2026-07-02. **Revised 2026-07-03:** row-to-row column
alignment — the original §3 "hallmark" — was reversed to **single space**
(new §3), and wrapped continuations moved from visual alignment to **block
indent** (§2.5). **Revised 2026-07-12:** top-level declarations are separated
by **one** blank line, not two (§2.1). The dial settings (width, blank-line
mode) are the human's; everything else follows from the reference artifact's
own practice.

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
level, **trailing comma always** — including the last member before a
closing bracket (§12's rule; it is what makes reordering a clean diff).

Top-level declarations — `script { }`, `class`, `App`, a future
`stylesheet` — get **one blank line** between them. A comment describing a
declaration sits directly above it, itself preceded and followed by a blank
line — so a commented declaration reads as one blank closing off the
previous item, the comment, then one blank opening the declaration.
From weather.declare:

```Declare
class Screen extends View [ shown: boolean = false,
    width = 100%, height = 100%,
    opacity = { shown ? 1 : 0 },
    visible = { opacity > 0 },
    ]

class WeatherSummary extends View [ fontSize = 12, fontFamily = "Helvetica", …
```

and with a comment above the next declaration:

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
they never share the header line with plain config. From neoweather:

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
label/value StatRow calls in neoweather:

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

### 2.7 Comments

`// ` — two slashes, one space, then text. A comment is indented to the
level it sits at, and blank-padded above and below, *unless* it is the
first thing in its enclosing block (no blank needed above the very first
line of a file or body). Trailing inline comments (`onMouseUp() {
weatherData.clear() },   // back to entry — declaratively`) ride the code
line they annotate, separated by a small fixed gap; they are exempt from the
padding rule and are never aligned across lines.

App-level region banners use a heavier double-em-dash form and are
preserved verbatim by the formatter (it never rewrites banner *text*, only
re-indents/re-blanks around it per the comment rule):

```Declare
// ── entry screen — shown until data loads; carries loading + error inline ──

Screen [ shown = { !weatherData.loaded }, resource = weather_splash,
```

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

**The one escape hatch, should a local table ever be wanted:** gofmt's rule
— *a blank line bounds an alignment group.* If alignment ever returns it
would be opt-in and reset at every blank line, keeping its churn local. The
default is simply off.

> **Landed apps predate this ruling.** `neoweather.declare` is still written
> in the aligned style and now diverges from canon; it awaits a single-space
> reformat pass (a mechanical, semantics-preserving change — §5.6 gates it).
> The single-space examples above are drawn from
> [weather.declare](weather.declare), which this session's edits already bring
> into conformance.

---

## 4. Dials

Two things about a formatter invocation are parameters, not house style:

**Width.** A `--width` flag, default **120**. Governs when the header line
wraps and when a leaf's attributes wrap to a continuation.

**Blank lines: CLAMP mode.** The formatter enforces only the *mandatory*
blanks — the one-blank top-level separator (§2.1), the after-header and
before-close blanks of tiered airiness (§2.3), and the comment padding
(§2.7) — and it collapses any run of 3+ consecutive blank lines down to the
canonical count for that position. Everywhere else, it **respects the
author's own blank-line choices**: if an author left a class body tight
where the tiered-airiness default would have added a blank, or added an
extra blank between two children the tier rule doesn't mandate one for, the
formatter leaves it. Tiered airiness (§2.3) is the *default* shape a human
reaches for; CLAMP mode does not force it back onto text that deliberately
reads differently.

Everything else in this document — indentation, comma placement, closing
style, single-space spacing — is **not** a dial: it is enforced identically
regardless of input shape.

---

## 5. The prettyprinter — implementation contract

### 5.1 Where it lives

The Node compile layer: `neolang/src/format.ts`, exposed through the CLI as
`dist/format.js`. Modes: stdin → stdout, a file path → stdout, and an
in-place flag that rewrites the file. `--width <n>` (default 120, per §4)
is the one tunable. It has zero runtime-graph impact — it never runs as
part of compilation, only as a standalone tool (and, later, editor
tooling).

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
still neo's — the opening `{` rides the signature/header line and the
closing `},`/`}` hangs at body indent per §2 — but the expression text
between them is TS's own; only the neo-owned bracket skeleton is normalized.
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
per the R6/neoweather rulings on `event`/`<-`). None of that is a defect in
this spec — every rule above is stated in terms general enough to already
cover those constructs (a `state` block is "a member whose body contains
multi-line members," same as any other; a `<->` binding is an attribute
value like any other) — it is simply that the *tool* cannot exercise those
paths until the grammar lands them.

The **test corpus** is therefore the landed programs:
`neolang/apps/neoweather/neoweather.declare` first (the one real formatted
app, and the source of every "landed-grammar" example in this document),
then whatever else lands as Declare apps accumulate. As `state`/`<->`/`event`
land in the grammar, they join the corpus and the worked examples above
that had to be redrawn from neoweather can be redrawn again from
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
   sources (neoweather today, more apps as they land) — formatting must
   never perturb a running program's rendered output, which is the
   strongest evidence the "semantic no-op" property actually holds in
   practice, not just in the token-stream proof.

### 5.7 Sequencing

Implementation is **queued** behind the in-flight styling rung and behind
motion v1 — both of those touch `parser.ts`, and landing the formatter
concurrently would mean building TRIVIA mode against a moving grammar
target twice. Once styling and motion v1 are landed, the formatter rung
begins with the TRIVIA-mode parser change (§5.2), then `format.ts` itself,
then the corpus gate (§5.6) against neoweather — whose first formatted pass
is also its single-space reformat (§3), bringing the landed app back into
conformance with this canon.
