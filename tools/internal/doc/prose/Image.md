An async-loaded bitmap. Set `source` to a URL; the image loads in the background and,
unless you constrain its size, adopts its natural pixel dimensions once loaded (so
`width`/`height` left unset "pop" to the real size on load — constrain them if you need
a stable box before the bytes arrive).

```declare
Image [ source = { weatherIcon(:code) }, width = 52, height = 52 ]
```

## source
The image URL (`string`). Literal or a `{ }` constraint — bind it to data and the
picture follows: `source = { weatherIcon(:code) }` swaps the bitmap whenever `:code`
changes. A stateless helper in a `script { }` beats wrapping a class around one
computed URL.

## stretches
How the bitmap fills a box whose size differs from the image's natural size: `none`
(default — natural size, no scaling), `width`, `height`, or `both`. The first built-in
enum attribute — `stretches = both` scales the picture to the box on both axes.
