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
How the bitmap fills a box whose size differs from the image's natural size. The axis
stretches distort by design: `none` (default — natural size, no scaling), `width`,
`height`, or `both` (`stretches = both` scales the picture to the box on both axes).
The **aspect-preserving fits** never distort: `contain` scales the whole picture into
the box and letterboxes the remainder; `cover` fills the box completely and crops the
overflow — the photograph-in-a-card value, and with `width = 100%` the responsive
hero. Both center the bitmap.

## naturalWidth
The bitmap's intrinsic width in pixels — `0` until `loaded`, then the file's own
dimension. **Read-only.** With `naturalHeight`, the aspect-true layout fact:
`height = { pic.width * pic.naturalHeight / Math.max(1, pic.naturalWidth) }` keeps a
width-driven image at its photographed proportions.

## naturalHeight
The bitmap's intrinsic height in pixels — `0` until `loaded`. **Read-only**; see
`naturalWidth` for the aspect-ratio idiom.

## loaded
The bitmap has landed — the reactive fact a placeholder derives from
(`spinner: View [ visible = { !pic.loaded } ]`). **Read-only** — computed by the load,
a compile error to assign. One honest edge: re-pointing `source` does not reset it —
the surface keeps the previous bitmap (and `loaded` stays true) until the replacement
arrives; a superseded in-flight load is discarded. Under headless extraction there is
no image loader, so `loaded` honestly stays false. A failure is `failed`'s fact, not
this one's absence.

## failed
The **current** source's load failed — the broken-avatar fact, for deriving a fallback:
`initials: Text [ visible = { pic.failed }, … ]`. **Read-only.** Reset whenever a new
load starts (a `source` change), so it always speaks about the present address; a
failure keeps whatever bitmap was already showing (`loaded` stays true if one had
landed). There is no error *message* — the platform's image loader does not say why —
so the fact is boolean by honesty, not austerity.
