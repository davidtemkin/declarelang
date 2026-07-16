The plain object-graph atom — a **non-visual** node you subclass for logic that isn't a
view: a controller, a coordinator, a service. A bare `class X [ … ]` **defaults its base to
`Node`**, so a class with attributes and methods but no box *is* a Node subclass. It lives in
the tree as a named member, shares the reactive core and the `classroot`/`app` reach, and
fires `init` — but it paints nothing. Reach for it instead of a View when a wrapper class
would be visual in name only.

```declare
class Cart [ count: number = 0,
    add()    { count = count + 1 },
    clear()  { count = 0 } ]
```

A view then holds one as a named member (`cart: Cart [ ]`) and reads/drives it reactively —
state and behaviour with no pixels of its own.
