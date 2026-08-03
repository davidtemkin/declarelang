import { View } from "./view.js";
import type { RenderBackend, Stretch, Surface } from "./backend.js";
export declare class Video extends View {
    source: string;
    stretches: Stretch;
    /** Playing or not — the whole transport. Author-writable (`playing = true`,
     *  or a constraint) and runtime-written: the element reports its own play,
     *  pause and end, so a clip that runs out, or an autoplay the browser
     *  refuses, lands back here as `false` rather than leaving the slot lying. */
    playing: boolean;
    loop: boolean;
    /** Muted, and TRUE BY DEFAULT — not austerity. Browsers refuse to autoplay
     *  audible video, so an unmuted default would make the common declaration
     *  silently not run; and a page that makes noise unbidden is a defect. Sound
     *  is opt-in, which is also the polite way round. */
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
    /** Enough has arrived to show a frame and know the size — Image's `loaded`,
     *  same meaning, same placeholder idiom. **Read-only.** */
    loaded: boolean;
    /** The CURRENT source failed. **Read-only**, reset when a new load starts.
     *  Boolean by honesty: the platform's media loader gives no reason. */
    failed: boolean;
    /** Discards a superseded load: only the latest request may land. */
    private loadSeq;
    private el;
    /** The frame's natural size — what contentExtent folds into an auto-extent. */
    private natural;
    protected contentExtent(size: "width" | "height"): number;
    attach(backend: RenderBackend, parentSurface: Surface | null): void;
    protected flush(s: Surface): void;
    /** (Re)load `source` — at attach, and from the `source` pusher. */
    load(): void;
    /** Author (or constraint) asked to play or pause. `play()` can be REFUSED —
     *  autoplay policy, a source that never loaded — and it answers with a
     *  rejected promise. When it is refused the slot goes back to false, because
     *  a `playing` that reads true over a still picture is a lie. */
    syncPlaying(): void;
    /** Author asked to seek. Guarded by a quarter-second so the runtime's own
     *  `timeupdate` writes — which land in this same slot — cannot bounce back
     *  out as seeks and stutter the playhead. */
    seek(): void;
}
