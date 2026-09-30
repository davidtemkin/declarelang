The plain object-graph atom — a **non-visual** node you subclass, with
`class X extends Node [ … ]`, for a job that paints nothing and is not a document: the rules
for a kind of record, a service, shared state with rules to keep, machinery several views
drive. It lives in the tree as a named member, shares the reactive core and the
`classroot`/`app` reach, and fires `init` — but it paints nothing. Data itself is not
wrapped in one: records live in a `Dataset` that views bind to, and a document with logic
of its own is a class that extends `Dataset`.

```declare
class Stopwatch extends Node [ running: boolean = false, elapsed: number = 0,
    clock: Time [ tick = frame, running = { classroot.running },
        onTick(dt: number) { classroot.elapsed = classroot.elapsed + dt } ],
    toggle() { running = !running }
    ]
```

A view then holds one as a named member (`watch: Stopwatch [ ]`) and reads/drives it
reactively. A Node may also stand on a **record** with a `datapath` of its own: its `:path`
reads and `:field = v` writes resolve against that record, so a class owns the rules for a
kind of data with no view involved. A class with no `extends` is a view, so a class of
this kind always says `extends Node`.

## datapath
The data cursor: the place in a dataset this node and its descendants read and write
relative to. Written as a `:path` (extending the inherited cursor), a `{ }` expression
yielding a place (`datapath = { app.d.value.tasks[app.pick] }`), or null. The nearest
ancestor-or-self cursor wins, so a Node class with its own `datapath` stands on that
record, and views inside it read the same one. A `:path` ending in `[]` replicates — and
only a view replicates; on any other node that form is a compile error naming the
single-record spelling.

## onInit
Fires once when the node has finished constructing and its subtree exists — the place for
setup that needs the built tree. Every node gets it, **faceless subclasses included** — the
init walk visits non-View children too. Answered by `onInit()`.

## trackChanges
The values this node reports changes to: `trackChanges = [ "loaded", "kind" ]`. Each name
must be one of the node's own reactive values — an attribute it declares, a fact it carries
(`scrollY`, `loaded`, `hot`), or an attribute bound to data. The checker refuses a stranger
in a written list, and the runtime refuses one in a computed list when the node arms. To
hear a record's field, declare an attribute over the path (`kind: string = { :kind }`) and
name that — there is one door. Nothing else is tracked, so a node that names nothing costs
nothing.

## onChange
Fires at the **close of a settle** in which one or more tracked values ended different from
where they started: after every constraint has re-run and every reader already holds the new
value. One call per settle carries all of them, so a node whose two subjects move together
acts once. Answered by `onChange(e: ChangeEvent)`, where `e.changed` holds one `ValueChange`
per value — its `name`, its `previousValue` (what it held at the previous close), and its
`currentValue` (what the node holds now; reading the attribute directly gives the same
thing). Silent at boot: first values are not changes, and setup belongs in `onInit` or, for
the whole tree, the App's `onReady`. A handler's writes are the next settle, so a change may
cause a change; a handler may not assign a value it was told about, and a ring of handlers
ends on its own, because a value is delivered at most once per settle chain.

Not to be confused with an input's edits, which is the instinct the name carries in from
HTML and React: a field reports what the reader typed through `onInput`, and a control
reports its own value through `input()`. This event is about a value the *program* holds.

**Use it only for a genuine state change** — something happened and the program must act
once: mark a conversation read when the reader reaches its end, open a pane when the data
lands, start a fetch when a selection changes. It is not for following a value, which is a
constraint, nor for moving one, which is a Spring, and it is not meant for use in
conjunction with animation.

## $data()
Reads the datum at a path **relative to the nearest cursor** — this node's own, or the
nearest ancestor's — the compiled form every
`:path` lowers to, callable by hand. `$data("")` is the whole record at the cursor, which
is what a replicated row calls to hand its own record to a method. Reach for the `:path`
spelling in ordinary code; reach for this when the path is computed, or when you need the
record itself rather than a field of it.

```declare-fragment
item() -> object { return this.datapath != null ? this.$data("") : this }
```

## $cell()
The compiled form of a write to a record field: a handler's `:done = v` lowers to
`this.$cell(["done"]).value = v`, and `:n += 1` reads and writes through the same place.
The write lands through the dataset's `set`, relative to the nearest cursor, exactly where
the matching read resolves. Write `:field = v`; this is what the compiler emits, not a call
to make by hand.
