import { Node } from "./node.js";
import { FONT_CSS, FONT_DEMAND, FONT_PENDING } from "./font-value.js";
export { FONT_WEIGHTS, faceWeight, faceWeightLiteral, FACE_WEIGHT_FORMS } from "./face-literal.js";
export interface FontHost {
    /** Fetch one face; resolves to a handle `add`/`remove` understand, rejects on failure. */
    load(family: string, src: string, descriptors: {
        weight: string;
        style: string;
    }): Promise<unknown>;
    /** Make a loaded face available to text. */
    add(handle: unknown): void;
    /** Withdraw a face. */
    remove(handle: unknown): void;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}
/** Replace the face loader (tests); null restores the environment's own. */
export declare function setFontHost(h: FontHost | null): void;
export type { LoadedFace } from "./face-table.js";
/** One face of a Font: a file, the weight(s) it covers, and whether it is italic. */
export declare class Face extends Node {
    src: string | readonly string[];
    weight: string | number | readonly [number, number];
    italic: boolean;
}
export declare class Font extends Node {
    #private;
    /** A system font's family (a font with no faces). */
    family: string;
    /** Milliseconds whatever is about to change to this font keeps its current look. */
    wait: number;
    /** An arrival after the wait: change to it, or keep the fallback for the run. */
    late: "swap" | "keep";
    /** Every face has arrived. Read-only. */
    loaded: boolean;
    /** A face could not be fetched. Read-only. */
    failed: boolean;
    /** The CSS family text uses for this font right now (internal). */
    $css: string;
    /** Inside the wait for faces not yet here (internal). */
    $pending: boolean;
    constructor();
    get [FONT_CSS](): string;
    get [FONT_PENDING](): boolean;
    /** Text reached this font: fetch its faces, once. */
    [FONT_DEMAND](): void;
    /** Construction-complete (instantiate.ts): start once the caller's synchronous
     *  setup (the app's asset base) has run. `fontsReady` starts it sooner. */
    autoStart(): void;
    /** Begin watching the faces and loading them. Idempotent. */
    start(): void;
    /** Resolves when the first load has settled: every face arrived, one failed,
     *  or the wait ran out. The start-up gate (fontsReady) waits on this. */
    ready(): Promise<void>;
}
export { fontsReady } from "./font-value.js";
