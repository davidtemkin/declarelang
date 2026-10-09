export interface ClipVoice {
    stop(): void;
    setLoop(on: boolean): void;
    setRate(rate: number): void;
}
export interface ClipSink {
    setVolume(volume: number, muted: boolean): void;
    /** Start a voice at `offset` seconds; `onEnded` when it runs out (never after stop()).
     *  Null when the host cannot sound right now (autoplay not yet allowed). */
    start(clip: unknown, offset: number, loop: boolean, rate: number, onEnded: () => void): ClipVoice | null;
    release(): void;
}
export interface ClipHost {
    decode(url: string): Promise<{
        clip: unknown;
        duration: number;
    }>;
    sink(): ClipSink;
}
/** The page's clip host, or null where there is none. A native host installs its own as
 *  `__declareClipHost` (the Mac env's, over AVAudioEngine) before the runtime loads. */
export declare function clipHost(): ClipHost | null;
