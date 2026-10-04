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
- [`source`](declare-docs:Media.source) — re-pointing it stops the clip that was playing and loads the new one;
  discarding the view stops it for good.
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

## A scrubber

A clip loads its metadata as soon as it has a `source`, so `duration` and `loaded`
arrive before anything plays, and a `playing = true` set before then is honoured when
they do. While it plays, the clip writes `position` back about four times a second.
That is enough for a time readout, but a bar moving in quarter-second steps looks
broken, so a smooth playhead is the program's own number. A frame `Time` advances it
by `dt` and takes the clip's word whenever the two disagree: a clip still loading, a
stall, a seek.

Seeking is an assignment to `position`. An assignment within a quarter second of where
the clip already is does not seek, so the clip's own write-backs never stutter it. The
track takes the press and the drag. `onPointerMove` also fires when the pointer merely
passes over, so it seeks only while the track is `pressed`:

```declare-fragment
class Voice [ height = 36,
    clipId: string = "", src: string = "",
    head: number = 0,                                  // seconds heard, moving smoothly
    on: boolean = { app.playing == clipId },
    audio: Audio [ source = { classroot.src }, playing = { classroot.on },
        onEnded() { app.playing = ""; classroot.head = 0 } ],
    Time [ exists = { classroot.on }, tick = frame,
        onTick(dt: number) {
            const next = classroot.head + dt, heard = classroot.audio.position
            classroot.head = Math.abs(next - heard) > 0.35 ? heard : next } ],
    seek(frac: number) { head = Math.max(0, Math.min(1, frac)) * audio.duration; audio.position = head },
    track: View [ width = 180, height = 36, fill = #E4E8EC, claim = x,
        onPointerDown(e: PointerEvent) { classroot.seek(e.x / this.width) },
        onPointerMove(e: PointerEvent) { if (this.pressed) classroot.seek(e.x / this.width) },
        View [ height = 36, fill = #3A7BD5,
            width = { classroot.audio.duration > 0 ? parent.width * classroot.head / classroot.audio.duration : 0 } ] ]
    ]
```

Only one of these plays at a time, and nothing stops the others: `app.playing` holds one
clip's id, and every `on` is a comparison against it. Pressing play on another note
changes the id, and the note that was playing goes quiet because its condition stopped
holding. The frame `Time` exists only while its note plays, so a list of a hundred
notes runs one clock. `claim = x` leaves vertical scrolling to the list on a touch
screen.

---

**What you can now do:** show pictures that fit their boxes and report their own
loading, and play video and sound under conditions you state instead of calls you make.

[Next: **Data** →](declare-docs:guide:data)
