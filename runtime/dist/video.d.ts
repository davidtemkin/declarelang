import { Media } from "./media.js";
import type { Stretch, Surface } from "./backend.js";
export declare class Video extends Media {
    stretches: Stretch;
    /** The frame's natural size — what contentExtent folds into an auto-extent. */
    private natural;
    protected contentExtent(size: "width" | "height"): number;
    protected flush(s: Surface): void;
    protected makeElement(): HTMLMediaElement;
    protected metadataArrived(el: HTMLMediaElement): void;
    protected sourceCleared(): void;
}
