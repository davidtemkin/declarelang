// The block seam (design/plugin-architecture spec, PR A): the whole public
// type surface a top-level-syntax plugin implements, plus two pure helpers.
// A plugin adds `keyword Name { … }` blocks the parser dispatches to, the
// checker validates, and the instantiator interns — with no edit to core
// beyond the inert dispatch/loop points. Zero-dep by design (types only).
import type { Pos, DeclareError } from "./errors.js";
import type { ComponentSchema } from "./schema.js";
import type { View } from "./view.js";

/** The positioned AST node a block plugin's `parse` returns (mirrors the real
 *  CssDecl): `text` is the raw `{ … }` inner body, `bodyOffset` the source
 *  offset where it begins, so interior errors can be positioned. */
export interface BlockNode {
  kind: string;       // plugin-chosen, e.g. "note"
  keyword: string;    // the dispatch keyword
  name: string;       // the required block name
  pos: Pos;           // whole-declaration position
  text: string;       // raw inner body (the `code` token's inner text)
  bodyOffset: number; // source offset where `text` begins (= body.pos.offset + 1)
}

/** The narrow parser facet a `code`-bodied block sees: enough to consume
 *  `Name { code }`. (The runtime Parser satisfies this structurally.) */
export interface BlockCursor {
  expect(kind: "ident" | "code", what: string): { text: string; str?: string; pos: Pos };
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

/** Keywords a block plugin may NOT claim — the built-in top-decl heads. */
const BUILTIN_KEYWORDS = new Set(["class", "include", "use", "stylesheet", "style", "font"]);

/** Flatten a plugin list into a keyword → BlockPlugin map, rejecting a
 *  duplicate keyword or one that shadows a built-in. Thrown as a plain Error:
 *  this is a host/config mistake, not a source diagnostic. */
export function assembleBlocks(plugins: readonly Plugin[]): Map<string, BlockPlugin> {
  const map = new Map<string, BlockPlugin>();
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
export function posOf(source: string, offset: number): Pos {
  let line = 1;
  let col = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === "\n") { line++; col = 1; } else col++;
  }
  return { line, col, offset };
}

/** PURE dispatch of block checkers. `taken` is the program's non-block
 *  top-level namespace (classes/built-ins ∪ stylesheet/style/font names);
 *  `nameTaken` also sees blocks checked earlier in this call, so two blocks of
 *  one name collide. Errors are returned unsorted — the caller merges + sorts. */
export function dispatchBlockChecks(
  blocks: readonly BlockNode[],
  blockMap: Map<string, BlockPlugin>,
  source: string,
  schemas: Record<string, ComponentSchema>,
  taken: ReadonlySet<string>,
): DeclareError[] {
  const out: DeclareError[] = [];
  const seen = new Set<string>();
  for (const node of blocks) {
    const bp = blockMap.get(node.keyword);
    if (bp === undefined) continue; // parsed with a plugin not passed here — nothing to validate
    const ctx: CheckCtx = {
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
