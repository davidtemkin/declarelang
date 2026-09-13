The plain object-graph atom — a **non-visual** node you subclass for logic that isn't a
view: a controller, a coordinator, a service. A bare `class X [ … ]` **defaults its base to
`Node`**, so a class with attributes and methods but no box *is* a Node subclass. It lives in
the tree as a named member, shares the reactive core and the `classroot`/`app` reach, and
fires `init` — but it paints nothing. Reach for it instead of a View when a wrapper class
would be visual in name only.

```declare
class Cart [ count: number = 0,
    add()    { count = count + 1 },
    clear()  { count = 0 }
    ]
```

A view then holds one as a named member (`cart: Cart [ ]`) and reads/drives it reactively —
state and behaviour with no pixels of its own.

## onInit
Fires once when the node has finished constructing and its subtree exists — the place for
setup that needs the built tree. Every node gets it, **faceless subclasses included**
(the init walk covers non-View children since 2026-08-20 — before that, only views were
visited and a Node's `onInit` silently never fired). Answered by `onInit()`.

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

**Use it only for a genuine state change** — something happened and the program must act
once: mark a conversation read when the reader reaches its end, open a pane when the data
lands, start a fetch when a selection changes. It is not for following a value, which is a
constraint, nor for moving one, which is a Spring, and it is not meant for use in
conjunction with animation.
