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
2. **Move path resolution to compile time** (§5). The enabling change: drops
   2.2 KB gz today, keeps the parser out of the runtime, makes §7 possible.
3. **JSON Pointer writes** — ~0.3–0.6 KB gz, closes the write half, gives `<->` a
   conformance story.
4. **Index, slice, wildcard** — ~2.3–3.8 KB gz, covers what the corpus data says
   was actually used, retires hand-written windowing.
5. **Schema** — independent of 3 and 4, different code, cleanest tree-shake, and
   the optional typechecking the design promised.
6. **Filters and functions** — the expensive tail; gate on demand once 4 lands.

## Why conformance is worth claiming

Both standards are small, fully specified, and *checkable* — RFC 9535 has a public
compliance test suite of several hundred cases. "Declare implements RFC 9535 and
RFC 6901" is a verifiable claim rather than a marketing one, and it removes a whole
class of "what can I write here" questions for both readers: an LLM already knows
JSONPath, and cannot know Declare's dot-path. This is the thing LZX never got to
with XPath, where the subset was useful but unnameable.
