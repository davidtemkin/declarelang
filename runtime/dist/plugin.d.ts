import type { Pos, DeclareError } from "./errors.js";
import type { ComponentSchema } from "./schema.js";
import type { View } from "./view.js";
/** The positioned AST node a block plugin's `parse` returns (mirrors the real
 *  CssDecl): `text` is the raw `{ … }` inner body, `bodyOffset` the source
 *  offset where it begins, so interior errors can be positioned. */
export interface BlockNode {
    kind: string;
    keyword: string;
    name: string;
    pos: Pos;
    text: string;
    bodyOffset: number;
}
/** The narrow parser facet a `code`-bodied block sees: enough to consume
 *  `Name { code }`. (The runtime Parser satisfies this structurally.) */
export interface BlockCursor {
    expect(kind: "ident" | "code", what: string): {
        text: string;
        str?: string;
        pos: Pos;
    };
}
/** The checker facet: the raw source (for interior positions), a posAt helper,
 *  the program schemas, and the top-decl name-namespace. */
export interface CheckCtx {
    source: string;
    posAt(offset: number): Pos;
    schemas: Record<string, ComponentSchema>;
    nameTaken(name: string): boolean;
}
/** The instantiate facet: the built root View + schemas. A PR-A block may
 *  intern/validate against the tree and throw; per-view attachment is a
 *  deferred (PR C) seam. */
export interface InstantiateCtx {
    root: View;
    schemas: Record<string, ComponentSchema>;
}
export interface BlockPlugin {
    keyword: string;
    bodyKind: "code";
    parse(p: BlockCursor): BlockNode;
    check(node: BlockNode, ctx: CheckCtx): DeclareError[];
    instantiate(node: BlockNode, ctx: InstantiateCtx): void;
}
export interface Plugin {
    name: string;
    blocks?: BlockPlugin[];
}
/** Flatten a plugin list into a keyword → BlockPlugin map, rejecting a
 *  duplicate keyword or one that shadows a built-in. Thrown as a plain Error:
 *  this is a host/config mistake, not a source diagnostic. */
export declare function assembleBlocks(plugins: readonly Plugin[]): Map<string, BlockPlugin>;
/** Pure offset → 1-based line/col (the in-range twin of compile.ts's private
 *  posOf; agrees for every real body offset). The scan clamps to source length,
 *  but the returned `offset` is the raw input. */
export declare function posOf(source: string, offset: number): Pos;
/** PURE dispatch of block checkers. `taken` is the program's non-block
 *  top-level namespace (classes/built-ins ∪ stylesheet/style/font names);
 *  `nameTaken` also sees blocks checked earlier in this call, so two blocks of
 *  one name collide. Errors are returned unsorted — the caller merges + sorts. */
export declare function dispatchBlockChecks(blocks: readonly BlockNode[], blockMap: Map<string, BlockPlugin>, source: string, schemas: Record<string, ComponentSchema>, taken: ReadonlySet<string>): DeclareError[];
