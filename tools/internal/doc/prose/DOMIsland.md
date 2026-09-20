A foreign-content island: a leaf `View` that Declare **sizes and positions like any view**
(it obeys constraints and layout), but whose *interior* is host-managed DOM — an `<iframe>`,
a `<textarea>`, a `<video>`, a map widget. It is the **one sanctioned escape to raw DOM**,
kept behind a named view so `{ }` bodies stay DOM-free. The DOM backend reflects `slot` as a
`data-declare-slot` attribute; the host finds that box and mounts content into it, with Declare's
width/height driving the tenant's size and no coordinate sync to maintain.

```declare-fragment
preview: DOMIsland [ width = { parent.width }, height = 300, slot = "run:demo" ]
```

**What crosses, and which way.** Each name says its direction. DOWN: the island lists
names in `provides = ["volume"]`, and each resolves *at the island* the way `provided()`
does — the island's own attribute of that name first (`volume: number = { app.masterVolume }`),
then its ancestors' provisions. A Declare tenant reads one with
`hostProvided("volume", 0)`. UP: the tenant lists names in its App's `exposes`, and the
host reads them with `island.exposed("pos", 0)`. Each value has one owner — the tenant
cannot write what the island provides, the host cannot write what the tenant exposes —
and only data crosses (numbers, strings, booleans, arrays, plain objects): a component is
an identity in one program's graph and cannot cross. A foreign (raw-JS) tenant speaks
the same words through the element's one sanctioned handle, `el.__declareIsland` —
`provides()`, `hostProvided(name)`, `watchProvided(name, cb)`, `expose(name, value)`,
`post`, `onPost`.

## provides
The names this island offers DOWN to its tenant — `provides = ["dark", "base"]`. Each
resolves at the island: its own attribute of that name if it has one, else the nearest
ancestor provision (the same walk as `provided()`). A name not on the list is never
offered, however the island is declared. `[]` (the default) offers nothing.

## exposed()
The host's read of a value the tenant EXPOSES — `island.exposed("docH", 0)`: a Declare
tenant's `exposes` name, or foreign content's `expose(name, value)`. Reactive like any
attribute read. The default types it: an absent value, or one of another kind (with a
console warning), answers the default. With no default an absent value throws, naming it.

## slot
The host key — reflected onto the element as `data-declare-slot`, so the host can locate this box
and mount foreign content into it. Set it to `""` to mount nothing (a closed island); flip it
to show or swap the tenant reactively.

## childName
**Read-only.** The name a hosted child app reports up — the host's name-mirror writes it
per child settle, so a hosting window can title itself by what it is showing (the viewer
names its window by the open file). `""` until a child is up. It is the inbound twin of
the child's own `appName`; the child changes it by changing *its* `appName`.

## post()
The bridge's verb, host → tenant: `post(topic, payload)` delivers to the tenant's
`onPost({ topic, payload })` — a Declare tenant's App handler, or a foreign tenant's
`__declareIsland.onPost(cb)`. Data-shaped payloads. Dropped with a console note when no
tenant is linked. Verbs are consumed once and never re-readable — "do this", never
"this is so"; continuous state belongs on the provided/exposed facts.

## onPost
The verb's inbound half: the tenant's `post(topic, payload)` (a Declare tenant's
`app.post`, a foreign tenant's handle `.post`) lands here as `onPost(m: IslandPost)`,
with `m.topic` and `m.payload`. Declare it like any event handler.
