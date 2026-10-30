/** Record that the running computation measured in `family` (a CSS family list;
 *  every name in it counts, since a face landing for ANY of them can change
 *  which one wins). A no-op when nothing is tracking, which is most paints. */
export declare function trackFamilies(family: string): void;
export declare function collectFamilies(fn: () => void): string[];
export declare function familiesGeneration(families: readonly string[]): number;
export declare function familyChanged(family: string): void;
/** A number that changes whenever the face table changes — track it in a render
 *  key when the measuring happens somewhere reads are not tracked. */
/** The same number without subscribing — for a cache that must drop its
 *  entries when a face lands (measure.ts). */
export declare function faceGenerationNow(): number;
export declare function faceGeneration(): number;
/** A face the page has loaded, as a second realm can load it identically. */
export interface LoadedFace {
    family: string;
    src: string;
    weight: string;
    style: string;
}
/** Faces registered: note them for a second realm, and re-measure their family. */
export declare function noteLoadedFaces(faces: readonly LoadedFace[]): void;
/** A family withdrawn (a Font retired, or its source replaced). */
export declare function noteUnloadedFamily(family: string): void;
/** Every face loaded so far. */
export declare function loadedFontFaces(): readonly LoadedFace[];
/** Hear the faces that load LATER. */
export declare function onFontsLoaded(fn: (faces: readonly LoadedFace[]) => void): void;
/** Hear a family withdrawn. */
export declare function onFontsUnloaded(fn: (family: string) => void): void;
