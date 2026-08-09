The abstract base of the timed-media leaves — `Video` and `Audio` extend it. Not
instantiable: write the leaf that says what you have. Everything a clip *is* lives here;
the leaves add only whether there is a picture.

There are **no player controls and no methods to call**. Transport is attributes: you do
not tell a clip to play, you declare the condition under which it is playing, and it
follows — so a clip below the fold is not decoding while nobody is looking, and one that
scrolls into view starts because the answer changed. Build a scrubber out of `position`
and `duration` the same way you would build any other control — out of the standard
library, in Declare.

```declare-fragment
clip: Video [ source = "shots/tour.mp4", stretches = both, loop = true,
    playing = { app.scrollY + app.height > this.parent.y } ]
```

## source
The clip URL (`string`). Literal or a `{ }` constraint — bind it to data and the media
follows. Re-pointing it starts a fresh load; a superseded in-flight load is discarded.

## playing
Whether the clip is running. **Two-way**: a constraint decides when it plays, and the
element writes back when something outside the program changes it — the browser pausing a
backgrounded tab, a media key, an autoplay the platform refused. Bind it to a fact about
the world (`playing = { visible && !app.reducedMotion }`) rather than assigning it from a
handler, and the clip does the right thing without anything scheduling it.

## loop
Restart at the end rather than stopping. Default `false`.

## muted
Gates sound without touching `volume`, exactly as the platform has it. **The default
differs by leaf, and each default is the honest one**: `Video` mutes (browsers refuse
audible video autoplay, so an unmuted default would make the common declaration silently
not run); `Audio` does not (sound is its only product — shipped silent it would be a
component that appears broken until you find the flag).

## position
The playhead, in seconds. **Two-way** — read it to follow along (a progress bar is
`width = { parent.width * (clip.position / clip.duration) }`), assign it to seek. The
runtime writes it back about four times a second, not once a frame; read it in a
`Frames` handler when you genuinely need frame accuracy.

## volume
`0`–`1`, default `1`. Independent of `muted`, which gates it — muting does not zero the
volume, so unmuting returns you to where you were.

## playbackRate
Speed multiplier, default `1`. `0.5` is half speed, `2` double; pitch is the platform's
business.

## ended
The clip reached its end and stopped. **Read-only**, and the reason `playing` alone is
not enough: `playing` goes false for a pause and for an ending alike, so without this you
cannot tell "finished" from "stopped". Stays false while `loop` is true, since a looping
clip never ends. Pair with `onEnded()` when you want the moment rather than the state.

## duration
Total length in seconds, `0` until the metadata lands (and for a live stream whose length
is not a fact). **Read-only** — computed by the load, a compile error to assign.

## buffering
The clip wants data it does not have and has stalled. **Read-only** — the reactive fact a
spinner derives from (`spinner: View [ visible = { clip.buffering } ]`). Distinct from
`!loaded`: buffering is a stall *during* playback, not the wait before it.

## loaded
Enough of the clip has arrived to start — for `Video`, that also means a frame and a
size. The placeholder idiom is `Image`'s (`still: Image [ visible = { !clip.loaded } ]`).
**Read-only.** Re-pointing `source` does not reset it. Under headless extraction there is
no media loader, so `loaded` honestly stays false.

## failed
The **current** source's load failed. **Read-only.** Reset whenever a new load starts, so
it always speaks about the present address. There is no error *message* — the platform's
media loader does not say why — so the fact is boolean by honesty, not austerity.

## onEnded
Fired when the clip reaches its end. Like every Declare event it is delivered to the
handler that declared interest and does not bubble.
