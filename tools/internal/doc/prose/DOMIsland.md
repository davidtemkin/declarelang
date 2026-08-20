A foreign-content island: a leaf `View` that Declare **sizes and positions like any view**
(it obeys constraints and layout), but whose *interior* is host-managed DOM — an `<iframe>`,
a `<textarea>`, a `<video>`, a map widget. It is the **one sanctioned escape to raw DOM**,
kept behind a named view so `{ }` bodies stay DOM-free. The DOM backend reflects `slot` as a
`data-declare-slot` attribute; the host finds that box and mounts content into it, with Declare's
width/height driving the tenant's size and no coordinate sync to maintain.

```declare
preview: DOMIsland [ width = { parent.width }, height = 300, slot = "run:demo" ]
```

## slot
The host key — reflected onto the element as `data-declare-slot`, so the host can locate this box
and mount foreign content into it. Set it to `""` to mount nothing (a closed island); flip it
to show or swap the tenant reactively.

## childName
**Read-only.** The name a hosted child app reports up — the host's name-mirror writes it
per child settle, so a hosting window can title itself by what it is showing (the viewer
names its window by the open file). `""` until a child is up. It is the inbound twin of
the child's own `appName`; the child changes it by changing *its* `appName`.

## external — the bridge's fact surface
Islands carry a typed BRIDGE: attributes declared with the `external` modifier cross the
boundary to the tenant, paired by name. On the island's side each is the host's half of
one fact — bind it (`external volume: number = { app.masterVolume }`) and it flows to
the tenant; declare it `readonly external` and it is *tenant-owned*: the tenant writes,
the host reads and constrains, and a host write is a compile error. A Declare tenant
declares the same names `external` on its App; the runtime links them at mount **with a
type handshake** — a disagreement is a link error, named at the moment the pairing forms,
never a mid-session surprise. Data types only (number, string, boolean, array, object,
Color, an enum): a component is an identity in one program's graph and cannot cross.
A foreign (raw-JS) tenant reaches the same facts through the element's one sanctioned
handle, `el.__declareIsland` — `get`/`set`/`observe`/`externals()`, with `set` validated
against the declared type at the boundary, like a DataSource validates arriving bytes.

## post()
The bridge's VERB, host → tenant: `post(topic, payload)` delivers to the tenant's
`onPost({ topic, payload })` — a Declare tenant's App handler, or a foreign tenant's
`__declareIsland.onPost(cb)`. Data-shaped payloads. Dropped with a console note when no
tenant is linked. Verbs are consumed once and never re-readable — "do this", never
"this is so"; continuous state belongs on the `external` facts.

## onPost
The verb's inbound half: the tenant's `post(topic, payload)` (a Declare tenant's
`app.post`, a foreign tenant's handle `.post`) lands here as `onPost(m: IslandPost)`,
with `m.topic` and `m.payload`. Declare it like any event handler.
