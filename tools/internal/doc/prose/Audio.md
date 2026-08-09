Sound, declared. The whole transport — `source`, `playing`, `position`, `duration`,
`volume`, the read-only `ended`/`buffering`/`loaded`/`failed` — is `Media`'s shared
surface; see that page. `Audio` adds nothing to it, which is the point: it is the
transport with nothing to look at.

It is still a view, because everything in the tree is one, but it draws nothing and its
box means nothing — give it no size and it takes none. Where you put it is an
**ownership** statement, not a layout one: declare it inside the panel whose sound it is,
and it goes away when the panel does.

```declare-fragment
song: Audio [ source = { player.track?.url ?? "" },
    playing = { player.wants && this.loaded } ]
bar: View [ width = { parent.width * (song.duration > 0 ? song.position / song.duration : 0) } ]
```

One default is reversed from `Video`: **`muted` is `false`**. Sound is this component's
only product — shipped silent it would appear broken until you found the flag. Autoplay
policy is handled where it belongs: a `play` the platform refuses lands `playing` back at
`false`, so the slot never lies about silence.

A player's chrome — the scrubber, the volume thumb, the track grid — is an application.
Build it out of these attributes, in Declare.
