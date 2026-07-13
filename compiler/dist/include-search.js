// include-search — the ordered directory SEARCH PATH for `include` resolution,
// defined ONCE and shared by every surface's IncludeHost (the Node filesystem
// host and the browser fetch/map host). This mirrors the OpenLaszlo model, whose
// browser, server, and `lzc` compilers all resolve an `<include>` by searching a
// list of directories in order — the including file's own dir FIRST, then a fixed
// component/library root — over one surface-agnostic core.
//
// The pure resolve phase (runtime/include.ts) and the IncludeHost interface are
// untouched: a host's `resolve(fromDir, path)` simply delegates here, passing its
// own single-directory read primitive (`resolveAt` — fs stat+read on Node, map
// lookup in the browser) and its extra search roots (Declare: the library src
// dir). The first directory that yields a file wins; an include written relative
// (`../x`) still resolves against `fromDir` first, so existing programs are
// unaffected — the search path only ADDS fallbacks for a bare name.
/** Resolve `path` by trying `[fromDir, ...roots]` in order; the first directory
 *  whose `resolveAt` returns a file wins, else null. */
export function searchIncludePath(fromDir, path, roots, resolveAt) {
    const here = resolveAt(fromDir, path);
    if (here !== null)
        return here;
    for (const root of roots) {
        const hit = resolveAt(root, path);
        if (hit !== null)
            return hit;
    }
    return null;
}
//# sourceMappingURL=include-search.js.map