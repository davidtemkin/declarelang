type Kind = "blank" | "probe";
export declare function deferral(kind: Kind): boolean;
/** Has the page painted its first frame after the first mount? Before that,
 *  deferrable work waits. A host with no document (a worker, node) has no
 *  frames to wait for, so it counts as painted. */
export declare let firstFramePainted: boolean;
/** Run `fn` after the first frame (now, if it has painted). */
export declare function afterFirstFrame(fn: () => void): void;
/** Called once by the first mount: two animation frames on, the first frame is
 *  committed and the deferred work runs — in one idle-ish slot, in order. */
export declare function armFirstFrame(): void;
export {};
