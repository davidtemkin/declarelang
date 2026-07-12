A foreign-content island: a leaf `View` that Declare **sizes and positions like any view**
(it obeys constraints and layout), but whose *interior* is host-managed DOM — an `<iframe>`,
a `<textarea>`, a `<video>`, a map widget. It is the **one sanctioned escape to raw DOM**,
kept behind a named view so `{ }` bodies stay DOM-free. The DOM backend reflects `slot` as a
`data-neo-slot` attribute; the host finds that box and mounts content into it, with Declare's
width/height driving the tenant's size and no coordinate sync to maintain.

```declare
preview: HTML [ width = { parent.width }, height = 300, slot = "run:demo" ]
```

## slot
The host key — reflected onto the element as `data-neo-slot`, so the host can locate this box
and mount foreign content into it. Set it to `""` to mount nothing (a closed island); flip it
to show or swap the tenant reactively.
