export interface Resolved {
    canonical: string;
    dir: string;
    source: string;
}
/** Resolve `path` by trying `[fromDir, ...roots]` in order; the first directory
 *  whose `resolveAt` returns a file wins, else null.
 *
 *  `resolveAt` may answer with a value (a filesystem read, a map lookup) or a
 *  PROMISE (a fetch) — the one search serves both, which is the whole point of
 *  defining it once. The directories are therefore tried STRICTLY IN SEQUENCE,
 *  never raced: "first hit wins" is an ORDERING guarantee, and a parallel probe
 *  would let the library root beat the including file's own directory whenever
 *  it answered sooner — silently changing which file an `include` names. The
 *  cost is real (a miss on the app's dir is a round trip before the library is
 *  tried) and deliberately paid. */
export declare function searchIncludePath(fromDir: string, path: string, roots: readonly string[], resolveAt: (dir: string, path: string) => Resolved | null | Promise<Resolved | null>): Promise<Resolved | null>;
