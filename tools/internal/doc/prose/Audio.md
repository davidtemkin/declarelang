Sound, declared. The whole transport — `source`, `playing`, `position`, `duration`,
`volume`, the read-only `ended`/`buffering`/`loaded`/`failed` — is `Media`'s shared
surface; see that page. `Audio` is the transport with nothing to look at, and adds one
choice: whether the sound is streamed or held whole, `inMemory`.

It is still a view, because everything in the tree is one, but it draws nothing and its
box means nothing — give it no size and it takes none. Where you put it is an
**ownership** statement, not a layout one: declare it inside the panel whose sound it is,
and it goes away when the panel does.

```declare-fragment
song: Audio [ source = { player.track?.url ?? "" },
    playing = { player.wants && this.loaded } ]
bar: View [ width = { parent.width * (song.duration > 0 ? song.position / song.duration : 0) } ]
```

One default is reversed from `Video`: **`muted` is `false`**. Sound is this class's
only product — shipped silent it would appear broken until you found the flag. Autoplay
policy is handled where it belongs: a `play` the platform refuses lands `playing` back at
`false`, so the attribute never lies about silence.

A player's chrome — the scrubber, the volume thumb, the track grid — is an application.
Build it out of these attributes, in Declare.

## inMemory
Hold the sound whole in memory, rather than stream it. Default `false`. A streamed sound
starts when enough of it has arrived and plays one thing at a time, which is right for a
track; a sound held in memory is decoded once and starts on the frame it is asked for, and each `play()`
is a voice of its own, so a sound that answers an event — a shot, a click, a footstep —
sounds every time the event happens, over itself if need be. `playing` is true while any
voice sounds, and setting it false stops them all; `loop`, `volume` and `muted` apply to
every voice.

```declare-fragment
shot: Audio [ source = "sounds/fire.wav", inMemory = true ]
hum: Audio [ source = "sounds/engine.wav", inMemory = true, loop = true, playing = { ship.thrusting } ]
```

Held in memory, a sound costs its whole length as samples, 10 to 20 MB a minute, so a long
track belongs streamed.
