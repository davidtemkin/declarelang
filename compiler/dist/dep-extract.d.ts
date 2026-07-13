import type { Program } from "../../runtime/dist/parser.js";
/** A code value (`{ }`) with the extracted deps optionally attached. */
type CodeValue = {
    kind: "code";
    src: string;
    pos?: {
        offset?: number;
    };
    deps?: readonly string[];
};
export interface ExtractedConstraint {
    tag: string;
    name: string | null;
    attr: string;
    offset: number;
    node: CodeValue | null;
    reads: string[];
    errors: {
        message: string;
        offset: number;
    }[];
}
/** Extract deps for every constraint in a RESOLVED program. */
export declare function extractProgram(program: Program): ExtractedConstraint[];
/** Extract deps and ATTACH them to the program AST (`attr.value.deps`), so the
 *  runtime can wire the static-constraint path. Returns residue errors (empty on
 *  the whole corpus). Mutates the program in place.
 *
 *  A RESIDUE constraint (one the extractor cannot fully analyze) is annotated
 *  with EMPTY deps, never the partial `reads` it managed to find: partial deps
 *  would be wired as if complete and silently MISS the unanalyzed read. Empty
 *  deps leave the constraint unwired, so the runtime re-discovers every read
 *  each run — the sound fallback (design/constraints.md's "genuinely dynamic
 *  reads"). The returned `errors` name each such constraint for a caller that
 *  wants to surface or (in the design's end state) reject them. */
export declare function annotateProgram(program: Program): {
    errors: {
        message: string;
        offset: number;
        where: string;
    }[];
};
export {};
