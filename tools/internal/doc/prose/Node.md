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
