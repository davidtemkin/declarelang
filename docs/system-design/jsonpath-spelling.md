# The JSONPath author-facing spelling (D4)

> **Build note (2026-07-30, same session): B3 v1 LANDED per these rulings** —
> see data-paths.md §10 item 4 for the increment record. One addition made in
> the build, recorded here: a dotted name directly followed by `(` ends the
> path (`:rows[1:3].map(r => r.n)` maps over the selection; data fields are
> not callables) — which also retired the pre-existing `:t.toFixed(2)` trap.

> **Status: RULED 2026-07-30 (David), all six §7 items as proposed. B3 is
> unblocked.** The rulings: `:` is cursor-anchored and `$` stays refused;
> `[]` replicates while `[*]` selects (`.*` normalizes to `[*]`); `..`
> refused in v1 by ruling; the v1 subset is name / quoted-name / index /
> slice / wildcard with filters, functions, and unions gated behind named
> refusals; the §4 singular/selective legality table stands (incl.
> `datapath = :rows[2:8][]` slice-replication; selective refused on `<->`
> and bare `datapath =`); and filter predicates are ruled *in principle* to
> be `{ }`-class expressions with reactive reads (§5a), detail landing with
> the filter slice. — RFC 9535 specifies a query language; it does not say
> how that language appears after Declare's `:`. This is the
> language-surface ruling the RFCs don't make for us — the D4 gate of
> [data-project-plan.md](data-project-plan.md), building on
> [data-paths.md](data-paths.md) (ruled) and the B1 increment (landed:
> refusals + compile-time plans).

## 1. The one principle

**`:` anchors at the cursor; the RFC vocabulary describes what follows.**
Declare already has a relativity mechanism — datapath inheritance, the cursor
chain — and it is better than `$`: it composes down the view tree, it is what
replication points at, and it is what `<->` writes through. So the path
grammar never re-anchors. The conformance mapping is exact and testable:

> `:seg₁.seg₂[…]` ≡ the RFC 9535 query `$.seg₁.seg₂[…]` evaluated with the
> cursor's region as the query argument.

The public compliance suite (B3's test tier) runs the evaluator with cursor =
document root, which makes "Declare implements RFC 9535 (the shipped
subset)" a checkable sentence.

Corollary, already landed (B1): **`:$.rows` stays refused** with its pointed
error ("a :path has no JSONPath root; drop the `$.`"). The population most
likely to write it — JSONPath-literate authors — gets told the rule at the
first keystroke, not a silent lookup of a key named `$`.

## 2. `[]` stays; `[*]` selects

The two marks mean different things, and both survive:

- **`[]` — replicate here.** A Declare fact, not a selection: "make one
  instance per element". Legal exactly where it is today — trailing, on a
  datapath *attribute* (`datapath = :rows[]`). It never appears mid-path and
  never yields a value.
- **`[*]` — the RFC wildcard.** A selection segment, legal mid-path in reads:
  `:rows[*].label` is the nodelist of every row's label. It selects; it never
  replicates.

They cannot collide: a `[]` that isn't trailing-on-a-datapath is already an
error, and `[*]` on a datapath attribute without `[]` is refused (a cursor is
one place — §4). The dot-wildcard shorthand `.*` (RFC-legal) is accepted and
normalizes to `[*]` — one canonical form in emitted plans.

## 3. `..` descendant: refuse in v1, with the grammar reserved

data-paths.md §8 questioned it; this rules it. Refused with a pointed error:

    ':a..b' — descendant search ('..') is not in the path subset: it selects
    an unbounded, shape-dependent set that cannot be tracked reactively at
    acceptable cost; spell the path to the level you mean

Grounds: expensive to track (§9's over-approximation would degenerate to
"the whole tree"), rare in UI data you control (the LZX corpus's `//` uses
round to zero), and reversible later without breaking any program (a refusal
never strands source). The lexer already stops at `..` (B1's empty-segment
refusal); the error text gains the descendant reading when B3 lands.

## 4. Composition with cursors, and where each form is legal

Every path evaluates at the inherited cursor. A path is **singular** when
every segment selects at most one node (names, quoted names, indices);
**selective** when any segment can select many (`[*]`, slices, filters).

| surface | singular | selective |
|---|---|---|
| `{ }` body read (`:a.b`, emitted as a plan) | ✓ value | ✓ nodelist value |
| `name = :path` attribute read | ✓ | ✓ (list-shaped slot) |
| `name <-> :path` (a write target) | ✓ | ✗ refused — a write lands in one place |
| `datapath = :path` (extend the cursor) | ✓ | ✗ refused — a cursor is one place |
| `datapath = :path[]` (replicate) | ✓ (today's form) | ✓ — **the new power**: `datapath = :rows[2:8][]` replicates over the slice |

The last row is the load-bearing one: the windowed match in
[materialization.md](materialization.md) §3.1/§8.1 rides the slice plan, and
`Dataset [ contents = { … } ]` hand-windowing (data-paths.md §8) retires into
it.

## 5. The v1 subset boundary

In, per the corpus study (positional + range heavy) and the substrate needs:

- **name** segments (`.label`), **quoted-name** segments (`['my-key']` —
  RFC bracket-name syntax; closes the dashed/dotted-key hole *declaratively*,
  retiring the B1 error's `$data("my-key")` workaround),
- **index** (`[2]`, `[-1]` — negative per RFC),
- **slice** (`[2:8]`, `[:5]`, `[::2]` — RFC/Python semantics, negatives
  included, step 0 → empty),
- **wildcard** (`[*]`, with `.*` normalizing to it).

Behind the gate, each refused with a pointed error naming its status:

- **filters `[?…]`** — the expensive tail; §9's reactive membership is the
  actual work. Gate on demand once slices land (data-paths.md §10 item 6).
  The error names the living idiom: derive the subset in
  `Dataset [ contents = { … } ]`.
- **functions** (`length`/`count`/`match`/`search`/`value`) — with filters.
- **unions** (`[0,2]`, `['a','b']`) — no corpus demand; refuse until asked.
- **descendant `..`** — refused by ruling (§3).

The conformance claim is scoped honestly: the compliance suite runs the
shipped subset's cases; a refused feature is a *named refusal*, never a
silent wrong answer — the B1 discipline extended to every future segment.

## 5a. Filters will need parameter binding — flagging it now

RFC 9535 filter queries are **self-contained**: the spec has no way to bind
an outside value into a predicate. Declare's forcing cases are not —
Tracker's search, filter chips, and sort are all *static shape, dynamic
value* ("the query updates as you type"). So when filters land (behind the
§5 gate), the ruling to make is that a filter predicate is a `{ }`-class
expression: it may embed reactive reads through the ordinary scope nouns —

    :issues[? @.status == this.statusFilter]

— compiled to a closure (data-paths.md §6's revision: the engine inlines at
lowering), its deps extracted like any body's, so the selection re-derives
when the filter value moves. This is an *extension* RFC 9535 explicitly
leaves room for, and it keeps the boundary honest:

- **Reactive surface**: path *shape* is always source-literal (the prewiring
  soundness rule — a string-built path in a constraint stays refused as the
  residue it is). Values flow at runtime; syntax does not.
- **Dynamic *place* selection is already legal**: `datapath = { cond ?
  d.value.a : d.value.b }` — a computed cursor, fully tracked.
- **Imperative surface**: handlers compute paths freely (`read(["rows", i])`)
  — unanalyzed by design.

What this deliberately cannot express: a path whose *shape* is runtime data
(a user-configured column path in a generic data browser). The sanctioned
idioms there are the derived `Dataset [ contents = { … } ]` and imperative
reads — better than reactive dynamic paths would be, since those are
precisely the untrackable thing §9 refuses.

## 6. Emitted form

Plans, not strings (landed for names in B1): the compiler parses each path
and emits `this.$data([…])` segments. B3 extends the segment vocabulary in
place — a name stays a string, an index/slice/wildcard becomes a small tagged
object (`{i: 2}`, `{slice: [2, 8, 1]}`, `"*"` or `{wild: true}` — exact shape
is B3's to pick) — and the runtime stays an evaluator: no path parser ships
in production, per the §5 seam.

## 7. What this asks David to ratify

1. `:` is cursor-anchored; `$` never appears in a `:path` (the mapping in §1
   is the conformance story).
2. `[]` remains the replication marker; `[*]` is selection; both live.
3. `..` refused in v1 by ruling (§3's error text).
4. The v1 subset: name, quoted name, index, slice, wildcard — filters,
   functions, unions gated with named refusals.
5. Selective paths legal in reads and in `:path[]` replication; refused on
   `<->` and bare `datapath =` (§4's table).
6. In principle now, in detail with the filter slice: filter predicates are
   `{ }`-class expressions with reactive reads (§5a) — the parameter-binding
   extension RFC 9535 doesn't provide, ruled before anyone designs filters
   without it.
