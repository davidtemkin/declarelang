import { Media } from "./media.js";
export declare class Audio extends Media {
    /** Held whole in memory and started at once, rather than streamed: for a short sound
     *  that answers an event. Each play() starts a voice of its own, and voices overlap;
     *  `playing` is true while any voice sounds, and false stops them all. A long track
     *  belongs streamed. */
    inMemory: boolean;
    private $clip;
    private $sink;
    private $voices;
    private $clipSeq;
    protected $makeElement(): HTMLMediaElement;
    /** Held in memory, by a host that can hold it. */
    private $held;
    $load(): void;
    $teardown(): void;
    $syncPlaying(): void;
    $seek(): void;
    play(): void;
    /** Start a voice at `offset`. Refused (autoplay not yet allowed), `playing` goes back to
     *  false, as a refused play() does. */
    private $voice;
    private $silence;
    /** The live voices follow `loop`, `volume`, `muted` and `playbackRate`. */
    $tune(): void;
}
