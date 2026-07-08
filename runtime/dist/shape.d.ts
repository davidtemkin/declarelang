/** Validate SVG path data. Returns null when well-formed, else a human
 *  description of the first problem (value.ts folds it into the check
 *  error's "found …" half). */
export declare function validatePathData(d: string): string | null;
