<!-- nav: Images, video and audio -->
<!-- part: Building -->

# Images, video and audio

[`Image`](declare-docs:Image), [`Video`](declare-docs:Video) and [`Audio`](declare-docs:Audio) are ordinary views whose loading and playback are reactive
state. There are no load callbacks and no player methods: a picture reports `loaded` and
`failed` as facts you derive from, and a clip plays while a condition you state is true.

> **Media is state. You declare when a clip plays; you read whether a picture has
> arrived.**

## Images

Set `source` to a URL and the image loads in the background. Left unsized, it takes the
bitmap's natural size when the bytes arrive; give it a size and `stretches` decides how
the picture fits:

```declare
App [ width = 340, height = 170, fill = white, textColor = #51606C, fontSize = 12,
    row: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = x, spacing = 20 ],
        pic: View [ width = 130, height = 130, fill = #E9EFF4, cornerRadius = 8, clip = true,
            logo: Image [ width = 130, height = 130, source = "../resources/logo.png", stretches = contain ]
            ],
        Text [ width = 150,
            text = { app.row.pic.logo.loaded
                ? "loaded · " + app.row.pic.logo.naturalWidth + " × " + app.row.pic.logo.naturalHeight
                : app.row.pic.logo.failed ? "could not load" : "loading…" } ]
        ]
    ]
```

- `stretches`: `none` (natural size), `contain` (the whole picture, letterboxed),
  `cover` (fill the box and crop — the photo-in-a-card value), or `width`, `height`,
  `both` to stretch.
- [`alignX`](declare-docs:Image.alignX) / [`alignY`](declare-docs:Image.alignY) choose which part a `contain` or `cover` keeps.
- `tint` colors a single-color bitmap — one icon asset, many colors.
- `loaded`, `failed`, [`naturalWidth`](declare-docs:Image.naturalWidth) and [`naturalHeight`](declare-docs:Image.naturalHeight) are read-only facts. A
  placeholder is a constraint: `spinner: View [ visible = { !pic.loaded } ]`.

`source` is an attribute like any other, so an image driven by data is a constraint:
`source = { iconFor(:code) }`. A small script function computing the URL beats a class
wrapped around one image.

## Video and audio

`Video` and `Audio` share one transport, and it is attributes:

- [`playing`](declare-docs:Media.playing) — whether the clip runs. Constrain it to a fact about the world rather than
  setting it from a handler, and the clip does the right thing on its own:
  `playing = { onScreen && app.pageVisible }` stops decoding a video the moment it
  scrolls away or its tab is hidden, and starts it again when it returns.
- [`position`](declare-docs:Media.position) (seconds, assignable to seek), `duration`, `ended`, [`buffering`](declare-docs:Media.buffering), `loaded`,
  `failed` — the facts a player's chrome is built from. A progress bar is a width:
  `width = { parent.width * (clip.position / clip.duration) }`.
- [`volume`](declare-docs:Media.volume), [`muted`](declare-docs:Media.muted), [`loop`](declare-docs:Media.loop), [`playbackRate`](declare-docs:Media.playbackRate).

```declare-fragment
clip: Video [ source = "tour.mp4", width = 320, height = 180, stretches = both, loop = true,
    playing = { onScreen && app.pageVisible } ]
```

`Video` is muted by default, because browsers refuse audible autoplay and an unmuted
default would silently never start; unmute it only where a person asked for sound.
`Audio` is not muted, since sound is its only product. There is no poster attribute: a
poster is an `Image` shown while `!clip.loaded`.

`Audio` draws nothing, so where you declare it is a statement of ownership: put it inside
the panel whose sound it is, and it goes away with the panel.

```declare
App [ width = 320, height = 90, textColor = #172530,
    blip: Audio [ source = "../resources/blip.wav" ],
    row: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = x, spacing = 12, align = center ],
        Button [ label = { app.blip.playing ? "Playing…" : "Play" }, primary = true,
            onClick() { app.blip.position = 0; app.blip.playing = true }
            ],
        Text [ fontSize = 13, textColor = #6A7883,
            text = { app.blip.ended ? "ended" : app.blip.playing ? "playing" : "a short tone" } ]
        ]
    ]
```

---

**What you can now do:** show pictures that fit their boxes and report their own
loading, and play video and sound under conditions you state instead of calls you make.

[Next: **Data** →](declare-docs:guide:data)
