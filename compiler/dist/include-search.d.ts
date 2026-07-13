export interface Resolved {
    canonical: string;
    dir: string;
    source: string;
}
/** Resolve `path` by trying `[fromDir, ...roots]` in order; the first directory
 *  whose `resolveAt` returns a file wins, else null. */
export declare function searchIncludePath(fromDir: string, path: string, roots: readonly string[], resolveAt: (dir: string, path: string) => Resolved | null): Resolved | null;
