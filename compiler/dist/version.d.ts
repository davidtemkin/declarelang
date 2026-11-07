export declare const DECLARE_VERSION = "0.6.3";
/** `"0.6"` → [0, 6, 0]: a release as major.minor.patch, a missing part 0. */
export declare function releaseParts(v: string): [number, number, number];
/** Negative when `a` is the earlier release, 0 when the same, positive when later. */
export declare function compareReleases(a: string, b: string): number;
