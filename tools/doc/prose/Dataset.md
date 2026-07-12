A named node holding a JSON value — the in-memory data a subtree reads through
**datapaths**. Its data is EITHER a raw `{ }` body (the JSON literal) OR a derived
`contents = { }` constraint; point a view's `datapath` at it (or a slice of it) and
descendants read with relative `:paths`, replicating one instance per array element with
`:arr[]`. It is a **non-visual** node: it lives in the tree as a named member with no box
of its own. For data that arrives over the network, use `DataSource`.

```declare
cal: Dataset { { "days": [], "cols": [] } },
grid: View [ datapath = { classroot.cal.value },
    Day [ datapath = :days[] ],          // one Day per element of cal.value.days
]
```

Read or replace the whole value through `.value` (a reactive slot — writing it wakes
every reader); a whole-value swap re-renders the datapaths that read it in one settle.

## contents
Makes the `Dataset` **derived**: a `{ }` constraint (in place of a JSON body) that computes
the value from other reactive state — `matches: Dataset [ contents = { app.filter() } ]`. It
recomputes exactly when what it reads changes, dep-gated like any constraint. Pair a derived
list with `key = :field` on its replicated child so a recompute reconciles by that stable
field (O(changed) instances) instead of by object identity (rebuild-all).

## read()
Tracked region read: `data.read([ "cols" ])` returns the value at that path AND subscribes
the caller to it, so a derivation (or any constraint) that reads through `read` re-runs on an
in-place `.set` edit to that region — the granular counterpart to reading `.value` (which
tracks only a wholesale replacement).

## set()
Writes `v` at a dotted `path` inside the value (`data.set("cols.0.label", "Mon")`), waking
exactly the readers of that place — the surgical alternative to swapping the whole `.value`.
Creates missing intermediate objects along the path.

## insert()
Splices `v` into the array at `path`, at `index` — every replicated view bound to that array
(`:arr[]`) gains one instance in the same settle, no manual list bookkeeping.

## removeAt()
Removes and returns the element at `index` of the array at `path`; the replicated instance
for it is torn down in the same settle.

## move()
Reorders the array at `path`, moving the element at `from` to `to` — the replicated views
follow the new order (a reorder, not a destroy-and-rebuild), so their state rides along.
