A named node holding a JSON value — the in-memory data a subtree reads through
**datapaths**. Its data is either a raw `{ }` body (the JSON literal) or a derived
`contents = { }` constraint — one or the other; point a view's `datapath` at it (or a slice of it) and
descendants read with relative `:paths`, replicating one instance per array element with
`:arr[]`. It is a **non-visual** node: it lives in the tree as a named member with no box
of its own. For data that arrives over the network, use `DataSource`.

```declare
cal: Dataset { { "days": [], "cols": [] } },
grid: View [ datapath = { classroot.cal.value },
    Day [ datapath = :days[] ]          // one Day per element of cal.value.days
    ]
```

Read the whole document through `.value` (tracked like any read). `.value` itself is
read-only: the document changes through the verbs — `set(path, v)` writes one place,
`set([], v)` replaces the whole document, `insert`, `removeAt` and `move` reshape arrays —
and a replicated row writes a field of its own record with `:field = v`. A whole-document
replacement re-renders the datapaths that read it in one settle.

## schema
The optional data shape (`schema = [ city: string, rows[]: [ id: string, n?: number ] ]`):
arrivals validate against it at the boundary (a malformed response lands in `.failed` with
the pointed path; an embedded body fails at build), and every `:path` under a direct cursor
is checked statically against it. Validation only — identity is not declared here or
anywhere: a record's `id` field is its identity by convention (`key = :field` overrides an
unconventional name). Presence is the only switch; the `:path` surface never changes.

## contents
Makes the `Dataset` **derived**: a `{ }` constraint (in place of a JSON body) that computes
the value from other reactive state — `matches: Dataset [ contents = { app.filter() } ]`. It
recomputes exactly when what it reads changes, dep-gated like any constraint. A recompute
reconciles replicated rows by each record's `id` field (or `key = :field` when identity lives
under another name), so only the records that changed rebuild.

**A derived dataset holds its source's records.** When the computation *selects* — filter,
sort, group, slice — the records it returns are the source's own, and they stay the
source's: a read through either dataset is the same read, and a write through the derived
one (a row's `:field = v`, a `set`) lands in the source, which the derivation then follows.
What the computation *made* — a copy (`{ ...r }`), a group wrapper, a summary, a new array —
belongs to the derived dataset and is read-only: a write to it is refused, naming the
source to write instead, because the next recompute would replace it. So a row computes what
follows from its record alone, reads its position as `rowIndex`, and gets anything that
depends on other records — a lane, a running total — from a wrapper that holds the record
rather than a copy of it: `{ ev: e, lane: n }`, bound through `:ev` for edits.

A derived dataset may be a member of another data node: a document declared as
`class Log extends Dataset [ week: Dataset [ contents = { … } ] ]` carries its own
derivations.

## read()
Tracked region read: `data.read([ "cols" ])` returns the value at that path **and subscribes
the caller to it**, so a derivation (or any constraint) that reads through `read` re-runs on an
in-place `.set` edit to that region. A literal read through `.value` is tracked by region just
the same — `{ data.value.cols.length }` re-runs on the same edit — so reach for `read` when
the path is **computed at run time** (`read([ app.column ])`), which the static reading of a
`{ }` cannot follow.

## set()
Writes `v` at a path inside the value, waking exactly the readers of that place — the
surgical alternative to swapping the whole `.value`. A path is a **segments array**
(`data.set(["cols", 0, "label"], "Mon")` — numbers welcome, no escaping ever) or an
**RFC 6901 pointer** string (`data.set("/cols/0/label", "Mon")`; against an array, the
final token `-` appends: `set("/rows/-", v)`). The path's containers must exist (a
pointed error names the first missing step); the final field may be new.

## insert()
Splices `v` into the array at `path`, at `index` — every replicated view bound to that array
(`:arr[]`) gains one instance in the same settle, no manual list bookkeeping.

## removeAt()
Removes and returns the element at `index` of the array at `path`; the replicated instance
for it is torn down in the same settle.

## move()
Reorders the array at `path`, moving the element at `from` to `to` — the replicated views
follow the new order (a reorder, not a destroy-and-rebuild), so their state rides along.

## value
The parsed data. `contents` is the attribute you *write* (or a JSON body, or a fetch); this is
the one you read, and it is read-only — a dataset changes through the structural verbs
(`set`, `insert`, `removeAt`, `move`) or by a `DataSource` fetch landing, never by
assignment. `:path` reads resolve against it, and a write wakes exactly the constraints that
read the region that changed.
