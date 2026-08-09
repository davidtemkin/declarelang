Moving pictures, declared the way a still one is. The whole transport — `source`,
`playing`, `position`, `duration`, `volume`, the read-only facts — is `Media`'s shared
surface; see that page. What `Video` adds is exactly the picture: set `source` to a URL
and, unless you constrain its size, the box adopts the clip's natural pixel dimensions
once the metadata arrives. `Image`'s shape, with time added.

There are **no player controls and no methods to call** — the family ruling, stated on
`Media`. Transport is attributes: you do not tell a clip to play, you declare the
condition under which it is playing, and it follows.

```declare
reel: Video [ source = "shots/tour.mp4", stretches = both, loop = true,
    playing = { app.scrollY + app.height > this.parent.y } ]
```

## stretches
How the frame fills a box whose size differs from the clip's natural size: `none`
(default — natural size, no scaling), `width`, `height`, or `both`.

Two of `Media`'s notes bind tightest here: `muted` defaults **`true`** on this leaf
(browsers refuse audible video autoplay, so an unmuted default would make the common
declaration silently never start — set it `false` only where a person has asked for
sound), and `loaded` is the poster idiom (`still: Image [ visible = { !reel.loaded } ]`
— compose the two rather than wishing for a `poster` attribute).
