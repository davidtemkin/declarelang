/** Keywords a block plugin may NOT claim — the built-in top-decl heads. */
const BUILTIN_KEYWORDS = new Set(["class", "include", "use", "stylesheet", "style", "font"]);
/** Flatten a plugin list into a keyword → BlockPlugin map, rejecting a
 *  duplicate keyword or one that shadows a built-in. Thrown as a plain Error:
 *  this is a host/config mistake, not a source diagnostic. */
export function assembleBlocks(plugins) {
    const map = new Map();
    for (const plugin of plugins) {
        for (const block of plugin.blocks ?? []) {
            if (BUILTIN_KEYWORDS.has(block.keyword)) {
                throw new Error(`plugin '${plugin.name}' claims the built-in keyword '${block.keyword}'`);
            }
            if (map.has(block.keyword)) {
                throw new Error(`two plugins claim the block keyword '${block.keyword}'`);
            }
            map.set(block.keyword, block);
        }
    }
    return map;
}
/** Pure offset → 1-based line/col (twin of compile.ts's private posOf). The
 *  scan clamps to source length, but the returned `offset` is the raw input. */
export function posOf(source, offset) {
    let line = 1;
    let col = 1;
    const end = Math.min(offset, source.length);
    for (let i = 0; i < end; i++) {
        if (source[i] === "\n") {
            line++;
            col = 1;
        }
        else
            col++;
    }
    return { line, col, offset };
}
/** PURE dispatch of block checkers. `taken` is the program's non-block
 *  top-level namespace (classes/built-ins ∪ stylesheet/style/font names);
 *  `nameTaken` also sees blocks checked earlier in this call, so two blocks of
 *  one name collide. Errors are returned unsorted — the caller merges + sorts. */
export function dispatchBlockChecks(blocks, blockMap, source, schemas, taken) {
    const out = [];
    const seen = new Set();
    for (const node of blocks) {
        const bp = blockMap.get(node.keyword);
        if (bp === undefined)
            continue; // parsed with a plugin not passed here — nothing to validate
        const ctx = {
            source,
            posAt: (offset) => posOf(source, offset),
            schemas,
            nameTaken: (name) => taken.has(name) || seen.has(name),
        };
        out.push(...bp.check(node, ctx));
        seen.add(node.name);
    }
    return out;
}
//# sourceMappingURL=plugin.js.map