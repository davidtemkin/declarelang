# Data paths — measured state, the standards gap, and a build plan

> **Outcome (2026-07-27):** David ruled that the trio — **JSONPath reads, JSON
> Pointer writes, optional schemas** — should be built. This doc is the
> measurement behind that call: what the data layer actually implements today,
> how far it sits from the standards `declare-language.md` §9 already commits to,
> what the runtime cost would be, and the order to do it in.

**Question.** `declare-language.md:387` states the ruling: *"The path surface
('XPath for JSON') lands on **JSONPath** for reads, paired with **JSON Pointer**
for the writable side."* The same section describes an optional `schema` that
validates a response on receipt and statically checks every `:path`. How much of
that exists?

**Answer (measured).** Essentially none of it. What ships is a dot-separated
property accessor with a trailing `[]` marker. There is no expression evaluator
anywhere in the data layer, no schema attribute on `DataSource`, and no shape
type. The design is intact and recoverable; the implementation was never started.

---

## 1. What is implemented

The entire `:path` grammar, from `runtime/src/datapath.ts`:

```
":" ident ( "." ident )* ( "[]" )?
```

Identifier segments joined by dots, with an optional trailing `[]` meaning
*replicate this node*. `splitPath` is literally `path.split(".")`.
`Dataset.read(path[])` is a segment-by-segment `getOwn` walk that tracks exactly
one cell — the deepest slot the walk reaches.

Against **RFC 9535** (JSONPath, IETF standards track, February 2024), the
following are all absent: `$` root, `*` wildcard, `..` descendant, `[n]` index,
`[start:end:step]` slice, `[?…]` filter, unions, and the five function extensions
(`length`, `count`, `match`, `search`, `value`).

Against **RFC 6901** (JSON Pointer): absent. Writes go through
`Dataset.set("a.b.c", v)` — a dot-string with no `~0`/`~1` escaping, so a key
containing `.` or `/` is unaddressable.

**`DataSource` has no `schema` attribute.** Its full surface is `url`, `format`,
`method`, `body`, `auto`. `DataSource [ schema = … ]` is refused.

## 2. The scanner truncates silently — fix this first

The scanner consumes the longest identifier-shaped run and hands the remainder to
TypeScript. Nothing at the path layer errors:

| written | path produced | leftover |
|---|---|---|
| `:rows.2.label` | `rows` | `.2.label` |
| `:rows[0]` | `rows` | `[0]` |
| `:items[*]` | `items` | `[*]` |
| `:a..b` | `a` | `..b` |
| `:items[?(@.x>1)]` | `items` | `[?(@.x>1)]` |
| `:my-key` | `my` | `-key` |
| `:$.store.book` | **`$.store.book`** (a field literally so named) | — |

Two of these are actively dangerous. **`:my-key` compiles to
`$data("my") - key`** — a subtraction. And a JSONPath-literate author writing
`:$.store.book` gets a silent lookup for a key named `$`, which is precisely the
population most likely to try it once we claim RFC 9535.

Separately, `splitPath("a..b")` yields `["a", "", "b"]` — an empty segment that
looks up key `""`.

**This precedes every other item here.** A grammar that accepts a prefix of what
you wrote and gives the rest to a different language will keep producing wrong
programs that compile, and every increment of new syntax adds new instances. The
fix is a positioned error at the first character the path grammar cannot consume.

## 3. An asymmetry already present

The imperative API is strictly more capable than the declarative one:
`Dataset.read(["rows","2","label"])` and `set("rows.2.label", v)` handle numeric
segments; the lexical `:path` mode cannot express them. Same data model, two
grammars, and authors only write the weaker one.

## 4. Schema: designed, parked, never built — nothing was lost

Checked against full history. No commit on any branch ever added data-shape
validation to `runtime/src` or `compiler/src`. (`runtime/src/shape.ts` is the
SVG-path-data validator for `clip`, unrelated.) The commit that relocated the
sketch calls it, in its own message, *"the parked weather.declare sketch."*

The design survives in two places and is enough to build from:

- **`declare-language.md` §9** — the ruling. Validate on receipt, so malformed
  data yields `.failed`/`.error` rather than `undefined` three layers into a
  binding; statically check every `:path` against the shape; `[ ]` rather than
  `{ }` because a shape is structural declarations, not a runtime expression;
  **schema presence is the only switch and the `:path` surface never changes.**
- **`docs/system-design/weather.declare`** — the concrete syntax:

```declare-fragment
weatherData: DataSource [ url = { `/api/weather?zip=${zip}` },
    schema = [
        rss: [ channel: [
            location: [ city: string, region: string ],
            item: [
                condition: [ code: number, temp: number, text: string ],
                forecast[]: [ day: string, code: number, text: string, high: number, low: number ],
                ],
            ] ],
        ],
    ],
```

Note `forecast[]:` — the array marker lives *in the shape*, which is what lets a
shape and a replication walk agree, and what makes `:item.forecast[]` checkable.

## 5. The seam: paths are the one thing resolved at runtime

Everything else in Declare resolves at compile time — bare names become explicit
paths, constraint dependencies are extracted statically, reads are prewired at
link time. **Datapaths are the exception.** The compiler leaves `:t` in its
emitted output verbatim; `expr.ts` calls `rewriteDatapaths` at *link* time to turn
it into `this.$data("t")`.

Consequences, measured:

- The ~90-line scanner ships in `bundles/declare-boot.js` (81 KB gz runtime
  bundle) — confirmed by the presence of its `NON_ENDING` keywords and the
  `"a many-path"` error string. Roughly **2.2 KB gz**, ~2.7% of the runtime
  bundle, in every program including those with no data at all.
- More importantly, it is the wrong seam for the trio. Every `:path` in Declare
  is a **literal in source**, and dynamic paths are *already refused*
  (`dynamic datapath — read([<expr>]) resolves the region at runtime; use a
  literal path`). So the language has already committed to what makes
  compile-time parsing possible.

**Recommendation: move path resolution to compile time.** The compiler parses each
path and emits a resolved plan; the runtime keeps only an evaluator over
pre-parsed segments, with filter predicates compiled to closures. This drops the
scanner from production, keeps a JSONPath *parser* out of the runtime entirely,
and makes per-feature tree-shaking possible (§7). It also removes the last
interpreter from a language that otherwise resolves everything statically.

The reason the seam sits where it does is presumably that `instantiate` can run on
an unchecked, un-compiled tree — a real dev and test affordance. That is exactly
the kind of thing `declarec`'s existing plugin substitution handles.

## 6. Runtime cost

Calibration, measured on this codebase: **~14–17 bytes gzipped per source line**
(`datapath` 173 lines → 2.7 KB gz; `data` 487 → 6.8 KB; `reactive` 307 → 5.1 KB).
Denominators: calendar ships **52 KB gz** wire, homepage **66 KB**.

Runtime-only, assuming parsing happens in the compiler:

| piece | runtime lines | ~KB gz |
|---|---|---|
| JSON Pointer writes — segments plus `~0`/`~1` unescaping, over the existing `set` walk | 20–40 | 0.3–0.6 |
| JSONPath evaluator — segment dispatch (name/index/slice/wildcard/descendant), nodelist accumulation | 150–250 | 2.3–3.8 |
| Filter engine — RFC 9535's comparison and type rules; conformance is where the line count hides | 80–120 | 1.2–1.8 |
| The five functions — `length`/`count`/`value` trivial; `match`/`search` want I-Regexp (RFC 9485), not raw `RegExp` | 40–80 | 0.6–1.2 |
| Schema validation on receipt — recursive shape walk, arrays, optionality | 100–150 | 1.5–2.3 |
| **JSONPath + Pointer, no schema** | ~300–500 | **~4.5–7.5** |
| **All three** | ~400–650 | **~6–10** |

So roughly **6–10 KB gz, or 12–19% of the calendar's wire** — against 8–20 KB for
a typical published JSONPath library, all of which carry a parser. Add ~4–5 KB gz
only if the parser must ship after all. Treat as ±40%; the least certain rows are
the filter engine and I-Regexp conformance.

**Revision (2026-07-30, after emitted plans landed): the table is a CEILING,
not a price.** Its two worst rows move out of the runtime entirely:

- **Filters compile to closures at the compiler** (§5 already said so; the
  size consequence is the point here): RFC 9535's comparison semantics inline
  at lowering, and the runtime keeps only the few-line comparison helpers a
  program actually uses — individually shakeable. Realistic cost for a
  filter-using program ~0.3–0.5 KB; **0 for everyone else**, replacing the
  1.2–1.8 KB general engine.
- **I-Regexp translates at compile time**: RFC 9485 is designed to be
  mechanically translatable to JS `RegExp`; validate + translate in the
  compiler, ship the translated literal in the plan. Runtime cost ≈ 0, and
  conformance becomes a compiler test — where being right is cheapest.
- **Nodelists are their own module**: the singular-path walk (today's `read`)
  stays separate, so an all-singular program never references nodelist code.

And the plan representation itself is measured noise: calendar's program
artifact went 12,189 → 12,283 bytes gz (+94, +0.8%) when plans replaced
verbatim islands — gzip eats the wordier spelling, and any "compact" string
encoding would reintroduce a parser, the anti-goal.

Perf, same date, measured: the link-time island scan over all 306 calendar
bodies costs 0.48 ms (negligible before and after — the production stub's win
is bytes); per read, `splitPath` is ~52 ns against ~1 ns for the emitted
array literal — irrelevant today, real against a 16 ms frame budget at
materialization's 10⁵-read scale (and the compiler can further hoist segment
constants per body if profiling ever asks). The migration's value today is
structural — the conformance seam, §7's shaking, static analyzability — with
the speed benefit banked for exactly the workload B5/B8 create.

## 7. Tree-shaking

The precedent is already in the repo. `tools/declarec.mjs:342`:

```js
plugins: [...(slim ? [slimPlugin] : []), ...(opts.debug ? [] : [inspectPlugin]), ...factPlugins]
```

The 492-line inspect service is already stubbed out of production builds by plugin
substitution. The three pieces here shake differently:

- **Schema validation** has the cleanest seam: reachable only from a `DataSource`
  that declares a shape, so a program with no schemas leaves it unreferenced and
  esbuild drops it with no plugin at all. Most programs will never use schemas.
- **JSONPath segments** shake only if the compiler emits plans (§5). Given plans,
  the compiler knows which segment kinds a program uses and can substitute a
  minimal walker — dropping the filter engine and functions for the common case,
  which the LZX corpus study suggests is name-and-index.
- **JSON Pointer** is too small to bother shaking.

**Concretely (2026-07-30, now that §5 is landed):** the lever exists and is
proven — `slim-datapath` joined declarec's `factPlugins` with the emitted-plans
change, and the compiler parses every path in the program, so it knows the
exact union of segment kinds. Extend `programFacts` (the `usesThemes` /
`usesDraw` mechanism) with `pathKinds`, and the cost becomes
pay-for-what-you-write:

| the program writes | it ships |
|---|---|
| names only (today's entire corpus) | today's walk — zero added bytes |
| + index / slice | the segment evaluator (~0.5–1 KB) |
| + wildcard | + nodelist accumulation |
| + filters | + compiled closures + only the comparison helpers used |
| + `schema` | + the validator (esbuild drops it unreferenced — no plugin needed) |
| Pointer writes | always (~0.3–0.6 KB) |

A runtime parser would have had to ship everything always; this table is what
moving resolution to compile time bought.

## 8. Which features are actually wanted

`declare-implementation.md:146` already did the corpus study of LZX usage:
positional and **range** predicates (`[1]` 683×, `[1-5]`/`[6-10]` for replication
slicing), `/*` wildcard, `.` current, `@attr`, `el/text()` — heavy. Value
predicates (`[@x='y']`) "essentially absent."

Read that last point cautiously. XPath predicates in LZX were awkward enough that
absence may record friction rather than lack of demand — and filtering is the one
feature that would retire real TypeScript today. The current "window pattern" for
large collections tells authors to derive a slice in
`Dataset [ contents = { … } ]`, which is exactly the declarative expression the
path language was supposed to provide.

The feature to question is `..` descendant: cheap to write, expensive to track
reactively, and rare in UI data you control.

## 9. The reactive problem, which is the actual work

`read()` today tracks one cell. A filter or slice selects a set whose *membership*
depends on values, so it must track the container plus every field the predicate
reads, and re-evaluate membership when any of them move. Under-tracking gives
silently stale views — the failure this system exists to abolish; over-tracking
costs no-op recomputes, which is the safe side and the side the constraint
extractor already errs on.

This is the same shape of problem `dep-extract.ts` solves for constraints, and the
same soundness rule should govern: **over-approximate, never miss an edge.**
Parsing is not the work; this is.

## 10. Order

1. **Refuse what the scanner cannot consume** (§2). Independent of everything else
   and prevents new silent-wrong-program classes as syntax grows.
   **DONE 2026-07-30** — body islands via `datapathTrouble` (surfaced at
   compile time through check), attribute paths via the token parser,
   imperative paths via `locate`'s pointed errors; tests cover §2's table.
2. **Move path resolution to compile time** (§5). The enabling change: drops
   2.2 KB gz today, keeps the parser out of the runtime, makes §7 possible.
   **DONE 2026-07-30** — compile() lowers each island to a pre-parsed plan
   (`this.$data(["location","city"])`) at emission; `$data`/`$setData`
   evaluate segments; dep-extract reads the lowered form (recompile parity);
   datapath bodies became typecheckable (no longer a skip class); declarec
   production builds stub the scanner (`slim-datapath`), keeping `splitPath`
   as the attribute-path currency. The runtime's link-time rewrite remains
   for the direct-instantiate dev path only.
3. **JSON Pointer writes** — ~0.3–0.6 KB gz, closes the write half, gives `<->` a
   conformance story.
   **DONE 2026-07-30 (B2, per §11's rulings)** — segments + pointer-string
   intake on read/set/insert/removeAt/move, `~0`/`~1` escaping, `/-` append,
   dot-strings refused with the rewrite named, diagnostics speak pointer,
   `$setData` passes segments (the dotted-key join hole closed), RFC 6901's
   §5 example document wired as a conformance test, calendar + guide + prose
   migrated.
4. **Index, slice, wildcard** — ~2.3–3.8 KB gz, covers what the corpus data says
   was actually used, retires hand-written windowing.
   **DONE 2026-07-30 (B3, per jsonpath-spelling.md's rulings)** — the v1
   subset (index incl. negative, RFC slices incl. negative step, wildcard,
   quoted names) in both grammars (body scanner + attribute parser), emitted
   as tagged plan segments; the evaluator (select.ts) is RFC-strict past the
   currency seam and returns NODES (value + true location), which is what
   makes `datapath = :rows[2:8][]` replicate the window at real indices —
   the materialization substrate. §9 tracking rides the prefix region cell +
   full ancestor-chain waking (over-approximate, never misses). Filters,
   functions, unions, `..` refuse with their gates named; selective paths
   refuse on `<->` and bare `datapath =` (the D4 table) at check AND
   instantiate. Production builds shake the evaluator when no selector is
   aboard (`slim-select` + the `usesSelectors` fact — §7's table made real).
5. **Schema** — independent of 3 and 4, different code, cleanest tree-shake, and
   the optional typechecking the design promised.
   **DONE 2026-07-30 (B4; identity REVISED same day in the ratification
   conversation)** — the weather-sketch shape literal (nested `[ ]`,
   `rows[]:` array marker, `name?:` optional). Identity is NOT schema
   surface: David refused the proposed `id!` marker as key-by-another-name
   (a regression against the invisibility program and the brief's own
   "records carry id but the app must NOT need to say so"), and RULED the
   invisible version — a record's `id` field IS its identity by CONVENTION,
   inferred by the reconciler with zero declaration; `key = :field` is the
   sole explicit override (unconventional names), the structural-equality
   fallback beneath, object identity last, and the inspector diagnostic
   reports the mode in force. The `!` marker now refuses with the
   convention named;
   validate-on-receipt (a malformed response lands in `.failed`/`.error`
   with an RFC 6901 pointer path; an embedded body fails loudly at build —
   the `Dataset [ schema = … ] { json }` composition was added for this);
   static `:path` checking compile-side (compiler/src/schema-check.ts —
   best-effort by construction: the direct `datapath = { d.value }` idiom
   resolves, anything dynamic is unchecked, and what IS checked names the
   schema's own fields in the error); the validator (data-schema.ts) stubs
   out of schema-less production builds (`slim-dataschema` — the §7 shake,
   via the fact lever like the others). The `Dataset [ attrs ] { body }`
   composition is RATIFIED (2026-07-30) — it is what makes a build-validated
   embedded fixture writable.
6. **Filters and functions** — the expensive tail; gate on demand once 4 lands.

## 11. Addendum — D3: JSON Pointer, validated against the real mutation surface

> **Status: RULED 2026-07-30 (David), all four points as proposed — and D7
> RATIFIED with it: handler-called dataset methods (Pointer-addressed per
> this addendum) plus `<->` for leaf edits ARE the language's mutation
> authoring surface, closing language §13's open design. B2 is unblocked.**
> The rulings: (1) leaf writes address the slot in the pointer, structural
> verbs address the array with index arguments; (2) `/-` append adopted,
> Relative JSON Pointer REFUSED; (3) segments are the documented currency,
> pointer strings the interop spelling, dot-strings retire in B2 with a
> pointed error; (4) D7 ratified as above. Question asked: does RFC 6901
> actually cover the mutation API's needs, is Relative JSON Pointer wanted,
> and where does an author ever *see* a pointer?

### 11.1 What RFC 6901 is, in one paragraph

A pointer is a string of reference tokens each prefixed by `/`; `""` addresses
the whole document. Tokens escape only two characters — `~0` → `~`, `~1` → `/`
— so every JSON key, including `""`, is addressable. Against an array, a token
must be a plain decimal (no leading zeros), and the token `-` names the
position *after* the last element — the append slot (given meaning by RFC
6902's `add`). That is the entire spec. It is an *addressing* standard; the
verbs are ours.

### 11.2 Coverage, verb by verb (measured against `data.ts`)

| verb (today) | what it needs addressed | 6901 covers? |
|---|---|---|
| `set(path, v)` | a leaf slot (containers must exist; final field may be new) | ✓ — the RFC 6902 `add`/`replace` correspondence |
| `insert(path, i, v)` | the **array**, plus an index | ✓ for the array; the index stays an argument (below) |
| `removeAt(path, i)` | the array + an index | ✓ likewise |
| `move(path, from, to)` | the array + two indices | ✓ — no pointer *pair* exists in 6901, and none is wanted |

The shape to keep: **leaf writes address the slot in the pointer; structural
verbs address the array and take indices as arguments.** A structural edit is
an operation *on the array* — which is literally the wake model (`data.ts`
wakes the array's cells plus the ancestor chain) — and `move`'s two indices
cannot ride one pointer anyway. We do NOT adopt RFC 6902 (patch documents,
cross-container `move`/`copy`, `test`): the mutation API is a method surface,
not a patch interpreter.

One 6902-ism is worth adopting: **`/-` append** — `set("/rows/-", v)` appends,
exactly 6901's "the member after the last". Tracker's create-at-top is
`insert(…, 0)`; append gets its standard spelling without a length read.

### 11.3 Escaping: the hole it closes

Today's dot-strings cannot address a key containing `.` (the §2 refusal
routes authors to `$data(…)` with the whole key), and no spelling reaches a
key containing `/`, `~`, or the empty key. Pointer tokens close all four.
Note where escaping actually lives: **only at string boundaries.** The
segments-array currency (`read(["rows","2"])`, and since the emitted-plans
change every compiled `:path`) has no escaping problem at all — a segment is
just a string.

### 11.4 Relative JSON Pointer: refuse

Refused, on three grounds. (1) It is a *draft*, not standards-track — a
conformance claim would chase a moving target, and §"Why conformance" is the
point of this work. (2) Its job — up-navigation (`1/foo`), key-of (`0#`) — is
already Declare's cursor chain: relativity in Declare is datapath
*inheritance*, and `$setData` composes `cursor.path + suffix` by plain token
concatenation, which 6901 already defines. (3) Zero corpus demand. The
refusal is a ruling, not a deferral: if cursor-relative up-navigation is ever
wanted, it is a cursor feature, not a path spelling.

### 11.5 The author-facing story: authors never write pointers

Where does an author ever SEE a pointer? Proposed answer: **nowhere.**

- **`<->` targets and `:path` reads** stay Declare surface (`:title`,
  cursor-relative). The compiler emits pre-parsed segments (landed with the
  §5 emitted-plans change); the engine's composed absolute address *is* a
  pointer in segment form. Conformance is the engine's claim, not the
  author's burden.
- **Handler mutation calls** take the segments array as the documented form:
  `data.set(["events", idx, "y"], v)`. Measured: every imperative `set` in
  the corpus (5 sites, one app) builds a *computed* dot-string
  (`"events." + idx + "."`) — the array form is what those sites were
  reaching for.
- **Pointer strings** (`"/a/~1b/2"`, `"/rows/-"`) are accepted at the same
  argument as the *interop* spelling, parsed per 6901 — this is where the
  testable conformance claim attaches (the RFC's own examples + the JSON
  Patch suite's pointer cases wire in as a unit tier).
- **The dot-string form retires with B2**, refused with a pointed error
  naming both replacements — it is the one spelling that can never address a
  dotted key. Migration cost, measured: 5 call sites + 3 guide lines.

### 11.6 What B2 builds, restated

Segments + pointer-string intake at `data.ts` (escaping at the string
boundary only), `/-` append on `set`, the dot-string refusal + calendar and
guide migration, and the conformance test tier. `<->` needs nothing — its
targets already compile to segments.

## Why conformance is worth claiming

Both standards are small, fully specified, and *checkable* — RFC 9535 has a public
compliance test suite of several hundred cases. "Declare implements RFC 9535 and
RFC 6901" is a verifiable claim rather than a marketing one, and it removes a whole
class of "what can I write here" questions for both readers: an LLM already knows
JSONPath, and cannot know Declare's dot-path. This is the thing LZX never got to
with XPath, where the subset was useful but unnameable.
