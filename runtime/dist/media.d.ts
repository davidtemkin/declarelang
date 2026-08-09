import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
export declare abstract class Media extends View {
    source: string;
    /** Playing or not — the whole transport. Author-writable (`playing = true`,
     *  or a constraint) and runtime-written: the element reports its own play,
     *  pause and end, so a clip that runs out, or an autoplay the browser
     *  refuses, lands back here as `false` rather than leaving the slot lying. */
    playing: boolean;
    loop: boolean;
    /** Muted. The DEFAULT DIFFERS by leaf, and each default is the honest one:
     *  Video mutes (browsers refuse audible video autoplay, so an unmuted
     *  default would make the common declaration silently not run); Audio does
     *  not (sound is its only product — an Audio muted by default is a
     *  component that appears broken until you find the flag). */
    muted: boolean;
    /** The playhead, in seconds. Writing it seeks. The runtime writes it back as
     *  the clip runs — on the platform's `timeupdate`, which fires about four
     *  times a second, NOT once a frame: a per-frame write would churn the graph
     *  for a number almost nothing needs that finely. Read it in a `Frames`
     *  handler when you genuinely need frame accuracy. */
    position: number;
    /** Loudness, 0–1. HTML's default is 1 (full) and so is this; `muted` is the
     *  separate fact, exactly as the platform has it — muting does not zero the
     *  volume, so unmuting returns you to where you were. */
    volume: number;
    /** 1 is normal speed, HTML's default. 0.5 is half, 2 is double. */
    playbackRate: number;
    /** The clip ran to its end. **Read-only**, and the reason `playing` alone is
     *  not enough: `playing` goes false for a pause and for an ending alike, so
     *  without this you cannot tell "finished" from "stopped". Never true while
     *  `loop` is on, because a looping clip has no end. Cleared when playback
     *  starts again or a new source loads. */
    ended: boolean;
    /** Seconds, once the metadata lands; 0 before that and for a live stream
     *  whose length is not a fact. **Read-only.** */
    duration: number;
    /** Waiting for data mid-playback — the spinner's fact
     *  (`visible = { clip.buffering }`). **Read-only.** */
    buffering: boolean;
    /** Enough has arrived to start — Image's `loaded`, same meaning, same
     *  placeholder idiom. For Video that also means a frame and a size. **Read-only.** */
    loaded: boolean;
    /** The CURRENT source failed. **Read-only**, reset when a new load starts.
     *  Boolean by honesty: the platform's media loader gives no reason. */
    failed: boolean;
    /** Discards a superseded load: only the latest request may land. */
    private loadSeq;
    protected el: HTMLMediaElement | null;
    /** The leaf makes its own element — `<video>` or `<audio>` — and sets any
     *  leaf-only element facts (Video's `playsInline`) before the shared wiring. */
    protected abstract makeElement(): HTMLMediaElement;
    /** The metadata landed. The leaf takes what is its own — Video adopts the
     *  natural size and hands the element to the surface as its picture. */
    protected metadataArrived(_el: HTMLMediaElement): void;
    /** `source` went empty. Video clears the surface picture; Audio has nothing to clear. */
    protected sourceCleared(): void;
    attach(backend: RenderBackend, parentSurface: Surface | null): void;
    /** (Re)load `source` — at attach, and from the `source` pusher. */
    load(): void;
    /** Author (or constraint) asked to play or pause. `play()` can be REFUSED —
     *  autoplay policy, a source that never loaded — and it answers with a
     *  rejected promise. When it is refused the slot goes back to false, because
     *  a `playing` that reads true over silence (or a still picture) is a lie. */
    syncPlaying(): void;
    /** Author asked to seek. Guarded by a quarter-second so the runtime's own
     *  `timeupdate` writes — which land in this same slot — cannot bounce back
     *  out as seeks and stutter the playhead. */
    seek(): void;
}
