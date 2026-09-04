/** A source position: 1-based line & column, 0-based byte offset — in the
 *  file named by `file` when present, else in the author's own (main) file.
 *  A multi-file program is merged into one text before checking; every
 *  position is rebased onto the file the author wrote, and for an included
 *  file that means naming it. Absent for the main file, so single-file
 *  messages read exactly as they always did. */
export interface Pos {
    line: number;
    col: number;
    offset: number;
    file?: string;
}
/** The position's rendered form: `(line 3, col 7)` in the main file,
 *  `(rooms/pulse.declare:118:23)` in an included one — the editor-clickable
 *  shape, because an author with five files edited by five hands asks "is
 *  this mine?" before anything else. */
export declare function describePos(pos: Pos): string;
/** Extra metadata a diagnostic carries beyond message + position: a stable
 *  catalog `code` (DECLARE####, diagnostics.ts) and an optional `hint` (a
 *  how-to-fix line). Both are ADDITIVE — they never change `.message`, so the
 *  many tests that assert on message text keep passing; the code/hint surface
 *  only through the Diagnostic view (diagnostics.ts). */
export interface DiagMeta {
    code?: string;
    hint?: string;
}
/** An error in Declare source. `pos`, when present, is folded into the message
 *  so callers get a legible "… (line 2, col 12)" without extra plumbing.
 *  `rawMessage` keeps the message WITHOUT that suffix (the Diagnostic carries
 *  position separately and re-renders it), and `code`/`hint` are the catalog
 *  metadata (unset on a bare `new DeclareError` — compile() assigns a phase code). */
export declare class DeclareError extends Error {
    readonly pos?: Pos;
    readonly rawMessage: string;
    readonly code?: string;
    readonly hint?: string;
    constructor(message: string, pos?: Pos, meta?: DiagMeta);
}
/** Everything a check pass found, raised as one throw — build() reports every
 *  problem in the tree, not just the first. It extends DeclareError so existing
 *  `instanceof DeclareError` handling keeps working; `errors` carries the list
 *  (each with its own position), and the message shows one per line. */
export declare class DeclareErrors extends DeclareError {
    readonly errors: readonly DeclareError[];
    constructor(errors: readonly DeclareError[]);
}
/** The ONE wording for a layout↔author slot conflict, wherever it surfaces —
 *  the layout's own claim (layout.ts install), the general one-owner guard
 *  (an author binding installing over a layout claim), and a direct write to a
 *  layout-owned slot (attributes.ts). Named here so both modules share it
 *  without a cycle (layout imports attributes). It names the LAYOUT as the
 *  arranger, the child + slot, and the resolution — let the layout do it, or
 *  take the child out of the arrangement. `by` names who else set the slot
 *  when that helps (a direct write); null when the child obviously authored
 *  it. */
export declare function layoutConflictMessage(childClass: string, slot: string, arranger: string, by: string | null): string;
