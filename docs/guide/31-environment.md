# The environment: hosts, embedding, capabilities

Everything so far has been the tree. This chapter is where the tree meets the world — the
host it runs in, the environment it can read, keyboard focus in depth, links out, and what a
crawler sees.

## The host contract

An `App` fills its host, and there are two hosts, auto-detected. **Top-level**, the app fills
the browser window and tracks its size. **Embedded** — running inside another program's
`HTML` island — it fills that container instead. You write the same app either way; it reads
`app.width`/`app.height` and adapts, whether those come from the window or a parent box.
Below a declared floor (`App [ minWidth = 480 ]`) the app holds its size and the stage pans
natively, rather than reflowing into an unusable shape.

## The capabilities surface

The environment is not ambient magic; it is an enumerable set of reactive attributes on
`app` that you read like any other state:

- `app.width` / `app.height` — the app's own size (responsive layout reads these);
- `app.dark` — the OS dark-mode flag;
- `app.pointerX` / `app.pointerY` — the free pointer position;
- `app.hovering` — false on touch devices, so hover affordances can gate on it.

Because they are reactive, a constraint that reads `app.width` or `app.dark` re-derives when
the environment changes — a resize or an OS theme switch flows through the same graph as any
other value.

## Focus, in depth

[Interaction](declare-docs:guide:interaction) covered keys; here is the focus system that
routes them. A view opts into keyboard focus with `focusable = true` — the whole
declaration, no numeric `tabindex`. Tab order is the view tree in source order (preorder over
the focusable, visible views), which in a well-built tree *is* the visual order and handles
replicated views for free. A `focustrap` scopes a group: Tab cycles within it and wraps —
the modal focus-trap as one attribute:

```declare
App [ fill = white, textColor = black,
    dialog: View [ x = 20, y = 20, width = 240, height = 140, cornerRadius = 10, fill = whitesmoke, focustrap = true,
        form: View [ x = 16, y = 16,
            layout: SimpleLayout [ axis = y, spacing = 8 ],
            name: TextInput [ width = 200, height = 30, padding = 6, cornerRadius = 6, fill = white, focusable = true, placeholder = "Name" ],
            email: TextInput [ width = 200, height = 30, padding = 6, cornerRadius = 6, fill = white, focusable = true, placeholder = "Email" ],
            Button [ label = "Save", primary = true,
                onClick() { },
                ],
            ],
        ],
    ]
```

For explicit ordering, a view's `tabOrder()` method returns the ordered members to descend
into; the default is its visible children in source order. A parent orders only its own
members and stays ignorant of how each composes.

## Links and location

A link *out* of the app is the `app.navigate(url)` method — a service action, not an
attribute. Location *within* the app is one built-in attribute, `app.location`: a string that
IS the URL fragment. The app writes it to navigate; views derive their state from it; the host
wires it to the fragment for you — so deep links, back/forward, and a shareable URL come for
free, with no router object and no route table.

```declare
App [ fill = white, textColor = black,
    location = "home",                                // the declared initial IS the default
    mode: string = { app.location.split("/")[0] },    // state DERIVES from location …
    tabs: View [ x = 20, y = 16,
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        Button [ label = "Home",
            onClick() { app.location = "home" },       // … navigation WRITES location
            ],
        Button [ label = "Why",
            onClick() { app.location = "why" },
            ],
        ],
    home: View [ x = 20, y = 64, visible = { app.mode == "home" },
        Text [ text = "the scrolling page" ],
        ],
    why: View [ x = 20, y = 64, visible = { app.mode == "why" },
        Text [ text = "an in-app article view" ],
        ],
    ]
```

`location` is one string whose grammar the app owns — `"home"`, `"guide/22-reach"`, a map's
`"37.77,-122.41,12z"`. The host seeds it from the fragment *before the first paint* (a deep
link is just an initial state), pushes one history entry per settle that changes it, and writes
it back on the browser's back/forward — the app handles no popstate event. At the declared
initial the fragment is omitted, so the default URL stays clean.

**Single-writer discipline** — the one mistake to avoid here. Derived state like `mode` is
NEVER assigned: navigation writes `location`, and everything follows. Writing `app.mode = "why"`
directly would displace its constraint and silently disconnect the URL and the back button. One
writer (`location`), one source of truth. A trailing `@name` (`"guide/22-reach@reach"`) is a
reveal anchor — the host brings that named view or heading slug into view once it exists in the
settled tree, held across settles until it does (so a deep link into fetched content still lands).

## What a crawler sees

A Declare program is not an empty `<div>` waiting on JavaScript. Its static content extracts
to well-formed HTML — headings, prose, and links inferred from the settled tree — so search
engines and readers see real content. `?extract` on a program URL returns that extracted
document; the `crawler` build flag bakes it into the run page, which the client clears at boot
and replaces with the live app. Because the extractor is core to compilation, the Node server
and the browser produce byte-identical output — the crawler and the reader get the same
document.

And because a location gives otherwise-hidden content (the Why article, a docs chapter) an
address, extraction FOLLOWS the app's location links: it crawls each reachable location — a
fresh cold boot per one, seeded fragment then serialized — and emits ONE document at the
program URL, each location's content a `<section>` whose `id` is that location. The fragment
links resolve within the static page, and a link that survives into a click-through opens the
live app at the same location, because the section id and `app.location` are the same string.
One rule rides along: indexable data is build-time data — a relative `DataSource` url (a file
beside the app) crawls; a network url fails the extraction loudly rather than silently
emitting a partial document.

---

**Next:** the house style that keeps every Declare file — including all the ones a model
will read — reading the same way. [The canon](declare-docs:guide:canon).
