/** `now` is epoch milliseconds (Date.now), never the frame scheduler's
 *  timeline. `frame` runs `fn` once the frame now being built has been shown;
 *  a host without frames (a test, a hidden page) runs it on the next turn. */
export interface TimeHost {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
    frame?(fn: () => void): unknown;
    cancelFrame?(handle: unknown): void;
}
export declare function timeHost(): TimeHost;
export declare function setTimeHost(h: TimeHost | null): void;
