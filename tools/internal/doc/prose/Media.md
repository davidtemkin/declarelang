The abstract base of the timed-media leaves — `Video` and `Audio` extend it. Not
instantiable: write the leaf that says what you have. Everything a clip *is* lives here;
the leaves add only whether there is a picture.

There are **no player controls**, and transport is attributes: you declare the condition
under which a clip is playing, and it follows — so a clip below the fold is not decoding
while nobody is looking, and one that scrolls into view starts because the answer changed.
The one call is `play()`, for a sound that answers an event rather than a state: it plays
from the start each time the event happens. Build a scrubber out of `position` and
`duration` the same way you would build any other control — out of the standard library,
in Declare.

```declare-fragment
clip: Video [ source = "shots/tour.mp4", stretches = both, loop = true,
    playing = { onScreen && app.pageVisible } ]
```

## source
The clip URL (`string`). Literal or a `{ }` constraint — derive it from data and the media
follows. Re-pointing it stops the clip that was playing and starts a fresh load; a
superseded in-flight load is discarded. The load fetches the metadata at once, so
`duration` and `loaded` arrive before anything plays. Discarding the view stops the clip.

## playing
Whether the clip is running. **Two-way**: a constraint decides when it plays, and the
element writes back when something outside the program changes it — the browser pausing a
backgrounded tab, a media key, an autoplay the platform refused. Constrain it to a fact about
the world (`playing = { visible && app.pageVisible }`) rather than assigning it from a
handler, and the clip does the right thing without anything scheduling it. A `true`
that arrives before the metadata is honoured when the metadata lands.

Several clips where only one may play is app state, not a stop call: hold the playing
clip's id (`playing = { app.playing == clipId }`), and starting another changes the id.

## loop
Restart at the end rather than stopping. Default `false`.

## muted
Gates sound without touching `volume`, exactly as the platform has it. **The default
differs by leaf, and each default is the honest one**: `Video` mutes (browsers refuse
audible video autoplay, so an unmuted default would make the common declaration silently
not run); `Audio` does not (sound is its only product — shipped silent it would be a
class that appears broken until you find the flag).

## position
The playhead, in seconds. **Two-way** — read it to follow along (a progress bar is
`width = { parent.width * (clip.position / clip.duration) }`), assign it to seek. The
runtime writes it back about four times a second, not once a frame. Assigning the value it
already holds changes nothing, so to start a sound over, call `play()`.

For a playhead that moves smoothly, keep your own number and advance it in a
`Time [ tick = frame ]` member's `onTick(dt)`, taking the clip's `position` whenever the
two disagree by more than a fraction of a second. Reading `position` every frame
without integrating is polling (DECLARE4006). The guide's
[scrubber](declare-docs:guide:media@a-scrubber) has the whole pattern.

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

## play()
Plays from the start — the call for a sound that answers an event, which sounds again each
time the event happens however far the last one got: `onChange() { if (fired) shot.play() }`.
Setting `playing = true` goes on from where the playhead is; `play()` starts over. On an
`Audio` held in memory (`inMemory = true`) it starts another voice instead, over any still
sounding.
