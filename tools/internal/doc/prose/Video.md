Moving pictures, declared the way a still one is. Set `source` to a URL; the clip loads
in the background and, unless you constrain its size, adopts its natural pixel dimensions
once the metadata arrives. `Image`'s shape, with time added.

There are **no player controls and no methods to call**. Transport is attributes: you do
not tell a clip to play, you declare the condition under which it is playing, and it
follows — so a clip below the fold is not decoding while nobody is looking, and one that
scrolls into view starts because the answer changed.

```declare
reel: Video [ source = "shots/tour.mp4", stretches = both, loop = true,
    playing = { app.scrollY + app.height > this.parent.y } ]
```

## source
The clip URL (`string`). Literal or a `{ }` constraint — bind it to data and the picture
follows. Re-pointing it starts a fresh load; a superseded in-flight load is discarded.

## stretches
How the frame fills a box whose size differs from the clip's natural size: `none`
(default — natural size, no scaling), `width`, `height`, or `both`.

## playing
Whether the clip is running. **Two-way**: a constraint decides when it plays, and the
element writes back when something outside the program changes it — the browser pausing a
backgrounded tab, or the user hitting a media key. Bind it to a fact about the world
(`playing = { visible && !app.reducedMotion }`) rather than assigning it from a handler,
and the clip does the right thing without anything scheduling it.

## loop
Restart at the end rather than stopping. Default `false`.

## muted
Default **`true`**, and deliberately: an unmuted clip that tries to autoplay is blocked by
every browser, so a clip that declares `playing` and forgets `muted` would simply never
start. Set it `false` only where a person has asked for sound.

## position
The playhead, in seconds. **Two-way** — read it to follow along (a progress bar is
`width = { parent.width * (reel.position / reel.duration) }`), assign it to seek. Writing
a position the clip has not buffered seeks as soon as it can.

## volume
`0`–`1`, default `1`. Independent of `muted`, which gates it.

## playbackRate
Speed multiplier, default `1`. `0.5` is half speed, `2` double; pitch is the platform's
business.

## ended
The clip reached its end and stopped. **Read-only.** Stays false while `loop` is true,
since a looping clip never ends. Pair with `onEnded()` when you want the moment rather
than the state.

## duration
Total length in seconds, `0` until the metadata lands. **Read-only** — computed by the
load, a compile error to assign.

## buffering
The clip wants data it does not have and has stalled. **Read-only** — the reactive fact a
spinner derives from (`spinner: View [ visible = { reel.buffering } ]`). Distinct from
`!loaded`: buffering is a stall *during* playback, not the wait before it.

## loaded
Enough of the clip has arrived to display a frame — the fact a poster derives from
(`still: Image [ visible = { !reel.loaded } ]`, which is how you get a poster image
without a `poster` attribute: compose the two). **Read-only.** Re-pointing `source` does
not reset it; the surface keeps the previous frame until the replacement arrives. Under
headless extraction there is no media loader, so `loaded` honestly stays false.

## failed
The **current** source's load failed. **Read-only.** Reset whenever a new load starts, so
it always speaks about the present address. There is no error *message* — the platform's
media loader does not say why — so the fact is boolean by honesty, not austerity.

## onEnded
Fired when the clip reaches its end. Like every Declare event it is delivered to the
handler that declared interest and does not bubble.
