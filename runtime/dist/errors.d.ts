/** A source position: 1-based line & column, 0-based byte offset. */
export interface Pos {
    line: number;
    col: number;
    offset: number;
}
/** Extra metadata a diagnostic carries beyond message + position: a stable
 *  catalog `code` (NEO####, diagnostics.ts) and an optional `hint` (a
 *  how-to-fix line). Both are ADDITIVE — they never change `.message`, so the
 *  many tests that assert on message text keep passing; the code/hint surface
 *  only through the Diagnostic view (diagnostics.ts). */
export interface DiagMeta {
    code?: string;
    hint?: string;
}
/** An error in neo-LZX source. `pos`, when present, is folded into the message
 *  so callers get a legible "… (line 2, col 12)" without extra plumbing.
 *  `rawMessage` keeps the message WITHOUT that suffix (the Diagnostic carries
 *  position separately and re-renders it), and `code`/`hint` are the catalog
 *  metadata (unset on a bare `new NeoError` — compile() assigns a phase code). */
export declare class NeoError extends Error {
    readonly pos?: Pos;
    readonly rawMessage: string;
    readonly code?: string;
    readonly hint?: string;
    constructor(message: string, pos?: Pos, meta?: DiagMeta);
}
/** Everything a check pass found, raised as one throw — build() reports every
 *  problem in the tree, not just the first. It extends NeoError so existing
 *  `instanceof NeoError` handling keeps working; `errors` carries the list
 *  (each with its own position), and the message shows one per line. */
export declare class NeoErrors extends NeoError {
    readonly errors: readonly NeoError[];
    constructor(errors: readonly NeoError[]);
}
